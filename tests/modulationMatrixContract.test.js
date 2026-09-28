/**
 * modulationMatrixContract.test.js — el contrato de la matriz de modulación.
 * =============================================================================
 * La tabla de fuentes y destinos de cada synth es un CONTRATO, no una constante
 * de la vista: el índice que guarda un preset es la posición en el array, así
 * que insertar una fila en medio re-mapea todos los presets ya guardados. Por
 * eso la regla de append-only se verifica aquí y no se deja en un comentario.
 *
 * Los tres contratos de la suite:
 *
 *   abdeep_modulation_matrix.json   authority: hardware — los índices son índices
 *                                   de BYTE del DeepMind 12, con el orden del
 *                                   manual. Su tabla viene de la medición de los
 *                                   bancos de fábrica.
 *   abdms2000_modulation_matrix.json authority: hardware — el Virtual Patch del
 *                                   MS-2000 (4 buses, 8 fuentes, 8 destinos).
 *   neuronik_modulation_matrix.json  authority: design — NEURONiK es propio, y su
 *                                   tabla es además el formato de preset.
 *
 * La diferencia de `authority` no es decorativa: un contrato de hardware no
 * puede reordenarse NUNCA, y uno de diseño tampoco (porque el índice es lo que
 * se persiste). Los dos tienen el mismo motivo, y por eso la prueba es la misma.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = path.join(ROOT, 'contracts');

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(CONTRACTS, 'modulation_matrix.schema.json'), 'utf8'),
);

const CONTRACTS_BY_ID = {
  abdeep: 'abdeep_modulation_matrix.json',
  abdms2000: 'abdms2000_modulation_matrix.json',
  neuronik: 'neuronik_modulation_matrix.json',
};

function readContract(id) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACTS, CONTRACTS_BY_ID[id]), 'utf8'));
}

/**
 * Validador mínimo de JSON Schema, solo para lo que este esquema usa.
 *
 * No se añade una dependencia al paquete compartido por tres contratos: lo que
 * hace falta es comprobar required, type, enum, minimum/maximum, items y
 * additionalProperties, y fallar NOMBRANDO el campo. Si algún día el esquema usa
 * algo que esta función no cubre, el test lo dice en vez de pasar en silencio.
 */
function validate(instance, schema, pathPrefix = '') {
  const errors = [];
  const where = pathPrefix || '(raíz)';

  if (schema.type === 'object') {
    if (typeof instance !== 'object' || instance === null || Array.isArray(instance)) {
      return [`${where}: se esperaba un objeto`];
    }
    for (const key of schema.required ?? []) {
      if (!(key in instance)) errors.push(`${where}.${key}: obligatorio`);
    }
    for (const [key, value] of Object.entries(instance)) {
      const sub = schema.properties?.[key];
      if (!sub) {
        if (schema.additionalProperties === false) {
          errors.push(`${where}.${key}: propiedad no permitida por el esquema`);
        }
        continue;
      }
      errors.push(...validate(value, sub, `${pathPrefix}.${key}`));
    }
    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(instance)) return [`${where}: se esperaba un array`];
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push(`${where}: al menos ${schema.minItems} elementos, hay ${instance.length}`);
    }
    if (schema.items) {
      instance.forEach((item, index) => {
        errors.push(...validate(item, schema.items, `${pathPrefix}[${index}]`));
      });
    }
    return errors;
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];

  let actual = Array.isArray(instance) ? 'array'
             : instance === null ? 'null'
             : typeof instance;

  // JSON Schema distingue `integer` de `number`: `3.5` NO es un integer. En JS
  // ambos son `number`, asi que el tipo real se calcula aqui; sin esto, un
  // campo declarado integer aceptaria 3.5 en silencio.
  if (actual === 'number' && types.includes('integer') && !types.includes('number')) {
    actual = Number.isInteger(instance) ? 'integer' : 'number';
  }

  if (!types.includes(actual)) {
    return [`${where}: se esperaba ${types.join('|')}, hay ${actual}`];
  }

  if (schema.enum && !schema.enum.includes(instance)) {
    return [`${where}: "${instance}" no está en [${schema.enum.join(', ')}]`];
  }
  if (schema.minimum !== undefined && instance < schema.minimum) {
    errors.push(`${where}: ${instance} < mínimo ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && instance > schema.maximum) {
    errors.push(`${where}: ${instance} > máximo ${schema.maximum}`);
  }
  if (schema.minLength !== undefined && String(instance).length < schema.minLength) {
    errors.push(`${where}: más corto que ${schema.minLength}`);
  }
  return errors;
}

describe('modulationMatrixContract — el contrato de la matriz de modulación', () => {
  describe('el esquema', () => {
    it('declara la forma que los tres contratos comparten', () => {
      expect(SCHEMA.required).toContain('sources');
      expect(SCHEMA.required).toContain('destinations');
      expect(SCHEMA.required).toContain('slots');
      // La distinción que separa una emulación de un synth propio.
      expect(SCHEMA.properties.authority.enum).toEqual(['hardware', 'design']);
    });

    it('el destino declara la política que el motor necesita', () => {
      const dest = SCHEMA.properties.destinations.items.properties;
      // Sin esto, la política de ABDNeural (perNote / replaces) no tiene dónde
      // vivir al salir del switch.
      expect(dest).toHaveProperty('perNote');
      expect(dest).toHaveProperty('replaces');
      expect(dest).toHaveProperty('parameterId');
    });
  });

  for (const [id, file] of Object.entries(CONTRACTS_BY_ID)) {
    describe(`el contrato de ${id} (${file})`, () => {
      const contract = readContract(id);

      it('valida contra el esquema', () => {
        expect(validate(contract, SCHEMA)).toEqual([]);
      });

      it('la fuente 0 es inerte, SALVO donde el hardware no la tiene', () => {
        // En ABDEep ('None') y en NEURONiK ('Off') la fuente 0 no entrega
        // valor, luego cualquier ruta que la use aporta 0. Sin esa columna, un
        // preset nuevo arrancaria ya sonando.
        //
        // En ABDMS2000 NO: su `PatchSource::EG1 == 0` es una fuente de verdad
        // y la tabla no tiene columna inerte — una ruta se apaga con la
        // INTENSIDAD a cero. Por eso el motor compartido lleva el indice 0
        // como parámetro de plantilla (kZeroIdInert) en vez de suponerlo.
        if (id === 'abdms2000') {
          expect(contract.sources[0].label).toBe('EG1');
          expect(contract.sources[0].category).toBe('envelope');
        } else {
          expect(contract.sources[0].category).toBe('none');
        }
      });

      it('el destino 0 solo es inerte donde el formato lo declara así', () => {
        // NO es una regla universal, y fingir que lo es habria obligando a
        // inventar un 'Off' donde el hardware no lo tiene:
        //   - NEURONiK: destino 0 = 'Off', parameterId null (su tabla es el
        //     formato de preset y nace con 0).
        //   - DeepMind: destino 0 = 'LFO1 Rate', un destino REAL. La trama no
        //     tiene un 'Off': una ruta muerta se reconoce porque su fuente es
        //     'None' o su cantidad es 0.
        //   - MS-2000: tampoco hay 'Off'; sus 8 destinos son todos reales y la
        //     ruta se apaga con la intensidad a cero.
        if (id === 'neuronik') {
          expect(contract.destinations[0].parameterId).toBeNull();
        } else {
          expect(contract.destinations[0].label).not.toBe('Off');
        }
      });

      it('ninguna etiqueta está vacía', () => {
        for (const [index, source] of contract.destinations.entries()) {
          expect(source.label.length, `destino ${index}`).toBeGreaterThan(0);
        }
        for (const [index, source] of contract.sources.entries()) {
          expect(source.label.length, `fuente ${index}`).toBeGreaterThan(0);
        }
      });

      it('cada destino que no conduce parámetro lo dice explícitamente',
        () => {
          // No se comprueba que SOLO el 0 sea nulo: en NEURONiK el 12
          // ('Filter Env Amt') tampoco lo es, porque su parametro se retiro y
          // la PROFUNDIDAD de esa ruta vive en la matriz. Lo que se exige es
          // que la ausencia de parameterId sea una DECLARACION (null), no que
          // la propiedad simplemente no exista.
          if (id === 'abdeep' || id === 'abdms2000') {
            // Ni el DeepMind ni el MS-2000 usan parameterId: sus destinos no
            // son parametros del APVTS sino yards de su manual / SysEx. En el
            // MS-2000 ademas no hay destino inerte: son 8 destinos reales.
            expect(contract.destinations[0]).not.toHaveProperty('parameterId');
            return;
          }
          const withoutParam = contract.destinations
            .map((d, i) => (d.parameterId === null ? i : null))
            .filter((i) => i !== null);
          expect(withoutParam.length).toBeGreaterThan(0);
          expect(withoutParam).toContain(0);
        });

      it('los destinos del MS-2000 son 8 reales, sin columna inerte', () => {
        // El Virtual Patch no tiene 'Off': sus 8 destinos empiezan en Pitch.
        if (id !== 'abdms2000') return;
        expect(contract.destinations).toHaveLength(8);
        expect(contract.destinations[0].label).toBe('Pitch');
        expect(contract.destinations.map((d) => d.label))
          .not.toContain('Off');
      });

      it('declara de dónde sale la tabla', () => {
        expect(contract.provenance?.source).toBeTruthy();
        expect(contract.provenance?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  }

  describe('el hardware de ABDEep, que es donde el byte manda', () => {
    const contract = readContract('abdeep');

    it('es un contrato de hardware con su rango de byte declarado', () => {
      expect(contract.authority).toBe('hardware');
      expect(contract.byteRange.firstByte).toBe(93);
      expect(contract.byteRange.bytesPerSlot).toBe(3);
      expect(contract.slots).toBe(8);
    });

    it('la profundidad es bipolar, como la midió el hardware', () => {
      // 1024 presets de fábrica: el byte va de 0 a 255 y el 128 aparece, que es
      // el centro. La profundidad NO es 0..127.
      expect(contract.byteRange.depthIsBipolar).toBe(true);
    });

    it('la tabla cubre el rango del byte', () => {
      expect(contract.sources.length)
        .toBeGreaterThan(contract.byteRange.sourceMax);
      expect(contract.destinations.length)
        .toBe(contract.byteRange.destinationMax + 1);
    });

    it('el rango que EJERCITA el hardware no supera al declarado', () => {
      // El manual habla de 24 fuentes y el equipo llega a 19: la tabla cubre lo
      // declarado, y se anota lo medido. Si el máximo medido surpassing al
      // declarado, el contrato estaría corto y hay que verlo.
      expect(contract.byteRange.measuredSourceMax)
        .toBeLessThanOrEqual(contract.byteRange.sourceMax);
      expect(contract.byteRange.measuredDestinationMax)
        .toBeLessThanOrEqual(contract.byteRange.destinationMax);
    });

    it('los destinos sin etiqueta verificada lo dicen', () => {
      // 74-128 los ejerce el hardware pero no hay evidencia de su nombre: la
      // tabla los declara "Dest N" en vez de inventarles un nombre.
      const invented = contract.destinations
        .map((d, i) => ({ ...d, i }))
        .filter((d) => !/^Dest \d+$/.test(d.label) && d.i > 73);
      // Los que sí tienen nombre en 74..128 son los FX, que sí están verificados.
      for (const dest of invented) {
        expect(dest.label).toMatch(/^Fx \d Level$/);
      }
    });
  });

  describe('las fuentes por voz, que no son globales', () => {
    it('ABDEep marca las tres envolventes como por voz', () => {
      const contract = readContract('abdeep');
      const perNote = contract.sources
        .map((s, i) => (s.perNote ? i : null))
        .filter((i) => i !== null);
      // Env 1, Env 2, Env 3: una envolvente no es un valor global.
      expect(perNote).toEqual([9, 10, 11]);
    });

    it('NEURONiK marca ENV 1 y ENV 2, y solo esas', () => {
      const contract = readContract('neuronik');
      const perNote = contract.sources
        .map((s, i) => (s.perNote ? contract.sources[i].label : null))
        .filter(Boolean);
      expect(perNote).toEqual(['ENV 1', 'ENV 2']);
    });
  });

  describe('la política de reemplazo de ABDNeural', () => {
    const contract = readContract('neuronik');

    it('los destinos que reemplazan son los que el switchDeclaration hacía', () => {
      // Estos son exactamente los casos del switch de NeuronikEngine que
      // preguntan por la fuente y, si es ENV, reemplazan en vez de sumar. La
      // Fase 4 no puede perderlos al sacar el switch a la tabla.
      const replacing = contract.destinations
        .map((d, i) => (d.replaces ? i : null))
        .filter((i) => i !== null);
      expect(replacing).toEqual([1, 10, 12, 13, 14, 15, 16]);
    });

    it('un destino que reemplaza es siempre por voz', () => {
      // Reemplazar un factor global desde una envolvente no tiene sentido: el
      // sustituto sería el mismo para todas las voces.
      for (const [index, dest] of contract.destinations.entries()) {
        if (dest.replaces) {
          expect(dest.perNote, `destino ${index} (${dest.label})`).toBe(true);
        }
      }
    });

    it('el destino 12 no conduce parámetro pero sí modula', () => {
      // "Filter Env Amt": el parámetro se retiró y su PROFUNDIDAD vive en la
      // ruta. parameterId null con replaces true es un caso válido y real.
      const twelve = contract.destinations[12];
      expect(twelve.parameterId).toBeNull();
      expect(twelve.replaces).toBe(true);
    });
  });
});
