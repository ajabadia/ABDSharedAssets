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

import {
  validate,
  unsupportedKeywords,
  readContract as readContractFile,
  readSchema,
} from './helpers/validateSchema.js';

const SCHEMA = readSchema('modulation_matrix.schema.json');

const CONTRACTS_BY_ID = {
  abdeep: 'abdeep_modulation_matrix.json',
  abdms2000: 'abdms2000_modulation_matrix.json',
  neuronik: 'neuronik_modulation_matrix.json',
};

function readContract(id) {
  return readContractFile(CONTRACTS_BY_ID[id]);
}


describe('modulationMatrixContract — el contrato de la matriz de modulación', () => {
  describe('el esquema', () => {
    it('se ejecuta ENTERO: ninguna palabra clave que el validador no mire', () => {
      // ESTE esquema ya se habia descolgado una vez: `replacesNote` se anadio al
      // contrato de NEURONiK y no al esquema, asi que `additionalProperties:
      // false` lorejectaba sin que nadie entendiera por que. Un esquema del que
      // solo se mira el `type` es un esquema que parece validar y no valida.
      expect(unsupportedKeywords(SCHEMA)).toEqual([]);
    });

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

    it('solo reemplazan los dos destinos cuyo parámetro ES la señal', () => {
      // ESTA LISTA CAMBIO EL 2026-09-29, y no por tastes. Antes eran siete
      // (1, 10 y los cinco 12..16) porque asi los sacaba el switch de
      // NeuronikEngine; ahora son dos. La razon la tiene el motor, y son tres
      // cosas que se pueden comprobar sin el oido:
      //
      //   - `IVoice.h` declara los cinco como ACUMULADORES A CERO y los llama
      //     aditivos, y el sustain lleva "clamp 0..1 en la voz", que solo
      //     significa algo si se suma a un factor con neutro.
      //   - `resetModulations()` los pone a cero ANTES de cada aplicacion, asi
      //     que sumar y asignar dan EL MISMO numero, siempre. Medido: los 41
      //     hashes de ModulationParityDump no se mueven ni un ULP. Por eso no
      //     habia nada que decidir por el oido: es una etiqueta, no un sonido.
      //   - el neutro de 1.0, que es lo que hace que "reemplazar" sea distinto
      //     de "sumar", solo lo tienen el 1 (ENV 1 -> VCA) y el 10 (ENV 2 ->
      //     cutoff), donde la envolvente ES la senal y no una profundidad.
      //
      // QUIEN LO MANTIE VERDE: NEURONiK_ModulationContractTest, en ABDNeural,
      // compara estas mismas filas contra la tabla de C++ del motor. Aqui no se
      // puede, porque este repo no ve el motor; por eso esta lista se escribe
      // y el otro test la confirma.
      const replacing = contract.destinations
        .map((d, i) => (d.replaces ? i : null))
        .filter((i) => i !== null);
      expect(replacing).toEqual([1, 10]);
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

    it('el destino 12 no conduce parámetro pero sí modula encima', () => {
      // "Filter Env Amt": el parámetro se retiró y su PROFUNDIDAD vive en la
      // ruta. parameterId null NO es un destino inerte: es un destino cuya
      // señal no es un parámetro del APVTS sino el factor de la ruta, y la
      // envolvente se le SUMA encima.
      const twelve = contract.destinations[12];
      expect(twelve.parameterId).toBeNull();
      expect(twelve.replaces, 'el 12 acumula sobre el factor, no lo pisa').toBe(false);
      expect(twelve.perNote).toBe(true);
    });

    it('los cinco que acumulan siguen siendo por voz: eso NO se cambió', () => {
      // Lo que se decidió el 29-09 fue `replaces`, no `perNote`. Una envolvente
      // es por voz porque es una envolvente, y eso no se toca. Si alguien lo
      // pasara a global creyendo que corrige lo anterior, este rojo lo dice.
      const acumuladores = contract.destinations
        .map((d, i) => (d.perNote && !d.replaces ? i : null))
        .filter((i) => i !== null);
      expect(acumuladores).toEqual([12, 13, 14, 15, 16]);
      for (const index of acumuladores) {
        expect(contract.destinations[index].perNote, `destino ${index}`).toBe(true);
      }
    });

    it('una tabla que reparte `replaces` TIENE que decir por qué', () => {
      // LA NOTA ATADA AL DATO. `replacesNote` no se declara en el esquema por
      // cortesia: se exige cuando existe al menos un destino que suma sobre un
      // factor con neutro, porque en ese caso la tabla sola dice "esto es
      // distinto de aquello" sin decir por que, y esa es la clase de decision
      // que se vuelve a discutir cada seis meses con el mismo resultado.
      // Atarla al dato es lo que impide que la nota se quede huerfana: el dia
      // que se cambien los flags y ya no haga falta, este test lo dice; y el
      // dia que vuelvan a hacer falta sin nota, tambien.
      const hayQuienAcumule = contract.destinations.some((d) => d.perNote && !d.replaces);

      expect(hayQuienAcumule, 'si nadie acumula, esta nota sobra y habria que borrarla').toBe(true);
      expect(contract.replacesNote, 'con acumuladores a cero hace falta la nota').toBeTruthy();

      // Y el inverso, que es lo que hace la regla general: una tabla donde
      // `replaces` es uniforme no tiene nada que explicar y no carga con una
      // nota que ya no explica nada.
      for (const id of ['abdeep', 'abdms2000']) {
        const otra = readContract(id);
        const acumula = otra.destinations.some((d) => d.perNote && !d.replaces);
        if (!acumula) {
          expect(otra.replacesNote, `${id} no acumula: su replacesNote sobra`).toBeUndefined();
        }
      }
    });
  });
});
