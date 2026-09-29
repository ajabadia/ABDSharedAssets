/**
 * Validador mínimo de JSON Schema, compartido por los contratos.
 *
 * No se añade una dependencia al paquete compartido por unos pocos contratos:
 * lo que hace falta es comprobar required, type, enum, pattern,
 * minimum/maximum, minLength/maxLength, items y additionalProperties, y fallar
 * NOMBRANDO el campo.
 *
 * LA REGLA DEL FICHERO, y la razón de que exista `unsupportedKeywords()`:
 * un esquema con cosas que este validador no ejecuta es PEOR que no tener
 * esquema, porque parece que avisa. Por eso hay dos mitades —`validate()` dice
 * si una instancia vale, `unsupportedKeywords()` dice si el esquema entero se
 * está comprobando de verdad— y un contrato tiene que pasar las dos.
 *
 * SACADO de tests/modulationMatrixContract.test.js, que lo tenia enlined. Una
 * copia por contrato es una copia que se queda vieja: los dos esquemas ya
 * admiten cosas que el validador no miraba, que es como `replacesNote` se coló
 * en el contrato de NEURONiK sin que nadie se enterara.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONTRACTS = path.resolve(__dirname, '..', '..', 'contracts');

/** Lo que este validador MIRA de verdad. Lo que no está aquí, no se comprueba. */
export const SUPPORTED_KEYWORDS = new Set([
  // Anotaciones: se declaran para el que lee el fichero, no se ejecutan.
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'examples',
  // Cosas que sí se ejecutan.
  'type', 'required', 'properties', 'additionalProperties',
  'enum', 'pattern', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'items',
]);

/**
 * Valida `instance` contra `schema` y devuelve los errores NOMBRANDO el campo.
 * @returns {string[]} vacío si la instancia vale.
 */
export function validate(instance, schema, pathPrefix = '') {
  const errors = [];
  const where = pathPrefix || '(raíz)';

  // El TIPO se resuelve antes de mirar el nodo, y no después. Con `type: 'object'`
  // las dos cosas coincidían, así que daba igual; con una unión (`['object',
  // 'null']`) NO: si se comparara `schema.type === 'object'` contra la lista,
  // un nodo unión se trataría como una hoja y sus `properties` no se mirarían.
  //
  // Y eso no es un detalle: es como un esquema con cosas que nadie ejecuta, que
  // es la falta que este fichero existe para cazar. El caso que lo motivó es
  // `s950_calibration.json`, cuyo `measuredRange` es `null` mientras no haya
  // medición y un `{lo, hi}` cuando la haya: un contrato cuyo hueco declarado
  // no se comprueba es exactamente el tipo de esquema que parece que avisa.
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const isObject = types.includes('object');
  const isArray = types.includes('array');

  if (isObject) {
    // El HIJO se cuelga de `where`, que ya es `(raíz)` en el primer nivel. Sin
    // esto el error de abajo salia como `.effects[0].id`, que se entiende pero
    // parece un campo que empieza por punto. El nombre del campo es lo unico
    // que este validador da, asi que tiene que salir limpio.
    const child = (key) => `${where}.${key}`;

    // El `null` NO se descarta en esta guarda, y es el fallo que motivó todo
    // este bloque: `instance === null` estaba aqui, devolvía "se esperaba un
    // objeto" y dejaba la comprobación de tipo de más abajo como CÓDIGO MUERTO
    // para el caso que existe precisamente por eso. O sea: el esquema declaraba
    // `["object","null"]`, el validador lo aceptaba, y `measuredRange: null` —el
    // hueco que el contrato entero existe para representar— salía en rojo.
    //
    // Un esquema que parece comprobar el hueco declarado y no lo comprueba es
    // justo lo que `unsupportedKeywords()` existe para cazar, y lo cazaba por
    // el otro lado: la palabra estaba soportada pero el camino no.
    if (instance !== null && (typeof instance !== 'object' || Array.isArray(instance))) {
      const actual = Array.isArray(instance) ? 'array' : typeof instance;
      return [`${where}: se esperaba ${types.join('|')}, hay ${actual}`];
    }
    // Y aquí, con el nodo UNION ya resuelto, solo se comparan TIPOS si la
    // instancia no llegó a ser un objeto —es decir, si es un `null`—. Un
    // objeto de verdad cae de largo y lo que se ejecuta son sus `properties`.
    if (instance === null) {
      if (!types.includes('null')) {
        return [`${where}: se esperaba ${types.join('|')}, hay null`];
      }
      return errors;
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
      errors.push(...validate(value, sub, child(key)));
    }
    return errors;
  }

  if (isArray) {
    // Un `null` en un `['array','null']` es legal, y no tiene items que mirar:
    // es un hueco declarado, no un fallo. Se comprueba aqui y no antes para que
    // la lista vacía y el null sigan rutas distintas, que es lo que un panel
    // necesita distinguir: cero ejes, o ningun eje.
    if (instance === null) {
      return types.includes('null') ? errors : [`${where}: se esperaba ${types.join('|')}, hay null`];
    }

    if (!Array.isArray(instance)) return [`${where}: se esperaba un array`];
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push(`${where}: al menos ${schema.minItems} elementos, hay ${instance.length}`);
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push(`${where}: como mucho ${schema.maxItems} elementos, hay ${instance.length}`);
    }
    // UNIQUE.ITEMS por valor JSON, no por identidad: dos filas iguales son dos
    // filas iguales, y sin esto el aviso sale de un `Set` sobre objetos.
    if (schema.uniqueItems === true) {
      const seen = new Set();
      const dupes = new Set();
      for (const item of instance) {
        const key = JSON.stringify(item);
        if (seen.has(key)) dupes.add(key);
        seen.add(key);
      }
      if (dupes.size > 0) {
        errors.push(`${where}: ${dupes.size} elemento(s) repetido(s) (uniqueItems), el primero es ${[...dupes][0]}`);
      }
    }
    if (schema.items) {
      instance.forEach((item, index) => {
        // `${where}[i]` y no `${pathPrefix}[i]`: el array puede haber bajado
        // desde la raiz y hay que seguir deflendolo.
        errors.push(...validate(item, schema.items, `${where}[${index}]`));
      });
    }
    return errors;
  }

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
  if (schema.maxLength !== undefined && String(instance).length > schema.maxLength) {
    errors.push(`${where}: más largo que ${schema.maxLength}`);
  }
  // PATTERN SOLO sobre string: en `["integer","string","null"]` un `pattern` es
  // una restriccion de la forma STRING y no dice nada del integer. Aplicado a
  // un null (el motor null de un campo union) daria un falso rojo, asi que
  // solo se mira cuando el valor es de verdad una cadena.
  if (schema.pattern !== undefined && typeof instance === 'string' && !new RegExp(schema.pattern).test(instance)) {
    errors.push(`${where}: "${instance}" no casa con /${schema.pattern}/`);
  }
  return errors;
}

/**
 * Las palabras clave del esquema que este validador NO ejecuta.
 * @returns {string[]} con su ruta, para que el rojo diga DÓNDE.
 */
export function unsupportedKeywords(schema, pathPrefix = '') {
  const found = [];

  const walk = (node, where) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) {
        found.push(`${where}.${key}`);
        continue; // una palabra desconocida puede colar cosas dentro: no se baja.
      }
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        for (const [name, sub] of Object.entries(value)) {
          walk(sub, `${where}.${name}`);
        }
      } else if (key === 'items') {
        walk(value, `${where}[]`);
      }
    }
  };

  walk(schema, pathPrefix || '(raíz)');
  return found;
}

/** Lee un contrato por nombre de fichero y lo devuelve ya parseado. */
export function readContract(fileName) {
  return JSON.parse(readFileSync(path.join(CONTRACTS, fileName), 'utf8'));
}

/** Lee un esquema por nombre de fichero y lo devuelve ya parseado. */
export function readSchema(fileName) {
  return JSON.parse(readFileSync(path.join(CONTRACTS, fileName), 'utf8'));
}
