/**
 * El contrato de efectos y su esquema, atados.
 *
 * `contracts/fx-effects.json` declaraba `"$schema": "./fx-effects.schema.json"`
 * desde antes de que ese fichero existiera: una promesa a un esquema que no
 * estaba. Este test es el otro lado de esa promesa — el esquema escrito, y el
 * contrato validando contra el con las DOS mitades comprobadas:
 *
 *   1. EL ESQUEMA SE EJECUTA ENTERO. Que ninguna palabra clave del esquema sea
 *      de las que el validador no mira. Sin esto, añadir `oneOf` al esquema
 *      deja de avisar en silencio y parece que sigue avisando.
 *   2. EL CONTRATO VALIDA. Cero errores contra el esquema.
 *   3. LAS REGLAS QUE EL ESQUEMA NO PUEDE DECIR. Un `family` tiene que existir
 *      en el array `families` de al lado, y eso es una referencia cruzada que
 *      el JSON Schema plano no expresa. Aqui es donde se comprueba, que es
 *      exactamente el motivo de que el `family` NO sea un enum de las 11: una
 *      lista repetida seria una segunda fuente de verdad, y la que se separa es
 *      la que nadie nota.
 *   4. QUE MUERDA. Se le pasa un contrato SABOTEAJO a proposito y tiene que
 *      soltarlo. Un validador que no muerde no vigila nada.
 */

import { describe, it, expect } from 'vitest';

import {
  validate,
  unsupportedKeywords,
  readContract,
  readSchema,
  CONTRACTS,
} from './helpers/validateSchema.js';

// El nombre del fichero, aparte del esquema: el validador lo recibe aparte
// para poder decir CONTRA QUE esquema se ha soltado un campo, y el nombre
// aparece en el mensaje. Si viviera solo dentro del objeto, el mensaje
// tendria que adivinarlo.
const SCHEMA_FILE = 'fx-effects.schema.json';

const SCHEMA = readSchema(SCHEMA_FILE);
const CONTRACT = readContract('fx-effects.json');

/** Copia profunda con un camino de escritura, para sabotear sin tocar el disco. */
function put(source, path, value) {
  const copy = structuredClone(source);
  let node = copy;
  for (const key of path.slice(0, -1)) node = node[key];
  node[path[path.length - 1]] = value;
  return copy;
}

describe('fxEffectsContract — el catálogo de efectos y su esquema', () => {
  describe('el esquema', () => {
    it('se ejecuta ENTERO: ninguna palabra clave que el validador no mire', () => {
      // LA MITAD QUE SE OLVIDA. Un esquema del que solo se mira el `type` es
      // un esquema que parece validar y no valida.
      expect(unsupportedKeywords(SCHEMA)).toEqual([]);
    });

    it('ese detector detecta: un esquema con `oneOf` lo suelta', () => {
      // CONTROL NEGATIVO del detector. Sin esto, `unsupportedKeywords()` podría
      // devolver [] siempre y el test de arriba pasar sin comprobar nada.
      const saboteado = put(SCHEMA, ['properties', 'effects', 'items'], {
        oneOf: [{ required: ['id'] }, { required: ['name'] }],
      });
      expect(unsupportedKeywords(saboteado)).toEqual([
        '(raíz).effects[].oneOf',
      ]);
    });

    it('declara la forma que el catálogo comparte', () => {
      expect(SCHEMA.required).toContain('effects');
      expect(SCHEMA.required).toContain('families');
      // El `$schema` es lo que hace que el contrato lo declare, asi que es
      // obligatorio de verdad y no una decoracion.
      expect(SCHEMA.required).toContain('$schema');
    });

    it('la fila de efecto declara lo que motor y tema necesitan', () => {
      const effect = SCHEMA.properties.effects.items.properties;
      expect(effect).toHaveProperty('engine');
      expect(effect).toHaveProperty('variant');
      // Sin `params` no hay donde decir "el motor acepta mas de los que se
      // pintan", que es la confusion que hizo falta un aviso en el contrato.
      expect(effect).toHaveProperty('params');
    });

    it('NO le pone techo al id ni a los parametros', () => {
      // El rango lo fija la fabrica, no el esquema. Un `maximum` aqui seria una
      // segunda version de la verdad que se queda vieja en silencio: el dia
      // que la fabrica llegue a 57, el esquema rechaza el id nuevo.
      const effect = SCHEMA.properties.effects.items.properties;
      expect(effect.id).not.toHaveProperty('maximum');
      expect(effect.params).not.toHaveProperty('maximum');
      expect(effect.id.minimum).toBe(0);
      expect(effect.params.minimum).toBe(0);
    });
  });

  describe('el contrato', () => {
    it('valida contra el esquema', () => {
      expect(validate(CONTRACT, SCHEMA)).toEqual([]);
    });

    it('el $schema que declara es el fichero que existe', () => {
      // Una promesa a un esquema que no esta es lo que se quiere cerrar: si
      // alguien renombra el fichero sin tocar el contrato, esto se pone rojo.
      expect(CONTRACT.$schema).toBe('./fx-effects.schema.json');
      expect(readContract(CONTRACT.$schema.replace('./', ''))).toBeTruthy();
      expect(CONTRACTS.endsWith('contracts')).toBe(true);
    });
  });

  describe('las reglas que el esquema NO puede decir', () => {
    it('los ids son 0..max, sin huecos y sin repetidos', () => {
      const ids = CONTRACT.effects.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      // El RECORRIDO se deriva del fichero, no se escribe a mano. Fijar aqui el
      // numero de filas seria cambiar el contrato y tener que venir a tocar el
      // test por el camino, que es exactamente como se cuela el numero viejo.
      // Lo que NO se deriva es el invariante: sin huecos entre 0 y el maximo. El
      // esquema no lo puede comprobar, porque un hueco es un entero valido.
      const max = Math.max(...ids);
      expect(ids).toContain(0);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        Array.from({ length: max + 1 }, (_, i) => i),
      );
      // Y que arrancar en 0 sea de verdad: el 0 es el BYPASS, no un efecto mas.
      expect(CONTRACT.effects.find((e) => e.id === 0).engine).toBeNull();
    });

    it('el 0 es el bypass y el UNICO SIN motor', () => {
      const sinMotor = CONTRACT.effects.filter((e) => e.engine === null);
      expect(sinMotor.map((e) => e.id)).toEqual([0]);
      expect(CONTRACT.effects[0].family).toBe('bypass');
    });

    it('toda familia usada esta declarada, y ninguna declarada sobra', () => {
      const declaradas = new Set(CONTRACT.families.map((f) => f.id));
      const usadas = new Set(CONTRACT.effects.map((e) => e.family));

      // ESTE es el motivo de que `family` no sea un enum en el esquema.
      const huerfanas = [...usadas].filter((f) => !declaradas.has(f));
      expect(huerfanas, `familias usadas sin fila propia: ${huerfanas}`).toEqual([]);

      const sinUsar = [...declaradas].filter((f) => !usadas.has(f));
      expect(sinUsar, `familias declaradas que no usa ningun efecto: ${sinUsar}`).toEqual([]);
    });

    it('una familia sin tema es un modulo con los colores de otro', () => {
      // El mismo fallo que ya se dio en `fxTheme.test.js`, comprobado desde el
      // otro lado: aqui se mira que la familia exista, alli que tenga tema. El
      // numero de familias tampoco se escribe: lo que se vigila es que todas
      // las declaradas se usen, que es la regla que de verdad importa.
      const declaradas = new Set(CONTRACT.families.map((f) => f.id));
      const usadas = new Set(CONTRACT.effects.map((e) => e.family));
      expect(usadas.size).toBe(declaradas.size);
    });
  });

  describe('QUE MUERDA: el validador suelta lo que tiene que soltar', () => {
    it('un $schema que apunte a otro sitio', () => {
      const saboteado = put(CONTRACT, ['$schema'], './otro.schema.json');
      expect(validate(saboteado, SCHEMA)).toContain(
        '(raíz).$schema: "./otro.schema.json" no está en [./fx-effects.schema.json]',
      );
    });

    it('un id con decimales', () => {
      // JSON Schema distingue `integer` de `number`, y el validador tambien. Sin
      // esto, 3.5 pasaria por id.
      const saboteado = put(CONTRACT, ['effects', 0, 'id'], 3.5);
      expect(validate(saboteado, SCHEMA).join(' | ')).toMatch(/effects\[0\]\.id/);
    });

    it('un id negativo', () => {
      const saboteado = put(CONTRACT, ['effects', 0, 'id'], -1);
      expect(validate(saboteado, SCHEMA)).toContain('(raíz).effects[0].id: -1 < mínimo 0');
    });

    it('una familia con caracteres que el pattern prohibe', () => {
      // LO QUE EL ESQUEMA SI PUEDE: `family` solo puede ser [a-z0-9_].
      const saboteado = put(CONTRACT, ['effects', 1, 'family'], 'Reverb-2');
      expect(validate(saboteado, SCHEMA)).toContain(
        '(raíz).effects[1].family: "Reverb-2" no casa con /^[a-z0-9_]+$/',
      );
    });

    it('una familia BI ESCRITA que no existe: el esquema NO la ve', () => {
      // LA MITAD QUE NO PUEDE, y por eso el `family` no es un enum de las 11.
      // 'reverbo' esta bien escrito y casa con el pattern, asi que `validate`
      // lo deja pasar: para el esquema es una familia valida que no aparece en
      // el array de al lado. Repetir la lista de 11 en el esquema habria
      // cerrado el agujero, a costa de una segunda fuente de verdad que se
      // separa sin que nadie lo note.
      //
      // Por eso la referencia cruzada se comprueba en un TEST, que ademas
      // puede decir QUE fila no cuadra. Este es el control negativo de esa
      // eleccion: si el `family` pasa de ser un pattern a ser un enum, este
      // rojo cambia de forma, y eso es exactamente lo que hay que ver.
      const saboteado = put(CONTRACT, ['effects', 1, 'family'], 'reverbo');
      expect(validate(saboteado, SCHEMA)).toEqual([]);

      const declaradas = new Set(CONTRACT.families.map((f) => f.id));
      expect(declaradas.has('reverbo')).toBe(false);
    });

    it('una clave de mas en una fila de efecto', () => {
      const saboteado = put(CONTRACT, ['effects', 1, 'displayName'], 'Reverb largo');
      // El mensaje se mira por PARTES, no entero: la ruta donde esta el campo,
      // el nombre del esquema contra el que se ha soltado, y la palabra `no
      // declara`. Un `toContain` de la frase entera ata el test a la redaccion,
      // y atarse al texto es justo lo que dejo estos dos casos fijando un
      // mensaje viejo el dia que el mensaje mejoro.
      const errores = validate(saboteado, SCHEMA, '', SCHEMA_FILE).join(' | ');
      expect(errores).toContain('(raíz).effects[1].displayName:');
      expect(errores).toContain(SCHEMA_FILE);
      expect(errores).toContain('no declara');
    });

    it('un nombre de motor que no es un identificador de clase', () => {
      const saboteado = put(CONTRACT, ['effects', 1, 'engine'], 'Fairy_Comp');
      expect(validate(saboteado, SCHEMA).join(' | ')).toMatch(/effects\[1\]\.engine/);
    });

    it('params negativos y params con decimales', () => {
      expect(validate(put(CONTRACT, ['effects', 1, 'params'], -1), SCHEMA).join(' | '))
        .toMatch(/effects\[1\]\.params: -1 < mínimo 0/);
      expect(validate(put(CONTRACT, ['effects', 1, 'params'], 12.5), SCHEMA).join(' | '))
        .toMatch(/effects\[1\]\.params/);
    });

    it('una familia declarada dos veces', () => {
      // El `uniqueItems` recien anadido al validador, que antes no existia.
      const saboteado = structuredClone(CONTRACT);
      saboteado.families.push(structuredClone(saboteado.families[1]));
      expect(validate(saboteado, SCHEMA).join(' | ')).toMatch(/repetido\(s\) \(uniqueItems\)/);
    });

    it('una propiedad de mas en la raiz', () => {
      const saboteado = put(CONTRACT, ['otroCampo'], 1);
      // Lo mismo que arriba y por el mismo motivo: partes, no frase entera.
      const errores = validate(saboteado, SCHEMA, '', SCHEMA_FILE).join(' | ');
      expect(errores).toContain('(raíz).otroCampo:');
      expect(errores).toContain(SCHEMA_FILE);
      expect(errores).toContain('no declara');
    });

    it('un `variant` de texto es legal (los pitch lo usan)', () => {
      // CONTROL NEGATIVO AL REVES: si `variant` se declarara solo integer, esto
      // solo. El campo es `["integer","string","null"]` porque 'dual' y
      // 'vintage' son nombres que el motor ya usa.
      const conTexto = CONTRACT.effects.filter((e) => typeof e.variant === 'string');
      expect(conTexto.map((e) => e.name).sort()).toEqual(['Dual Pitch', 'Vintage Pitch']);
      expect(validate(CONTRACT, SCHEMA)).toEqual([]);
    });

    it('un `variant` con un numero con decimales no es legal', () => {
      const saboteado = put(CONTRACT, ['effects', 1, 'variant'], 1.5);
      expect(validate(saboteado, SCHEMA).join(' | ')).toMatch(/effects\[1\]\.variant/);
    });
  });
});
