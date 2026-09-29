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

  if (schema.type === 'object') {
    // El HIJO se cuelga de `where`, que ya es `(raíz)` en el primer nivel. Sin
    // esto el error de abajo salia como `.effects[0].id`, que se entiende pero
    // parece un campo que empieza por punto. El nombre del campo es lo unico
    // que este validador da, asi que tiene que salir limpio.
    const child = (key) => `${where}.${key}`;

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
      errors.push(...validate(value, sub, child(key)));
    }
    return errors;
  }

  if (schema.type === 'array') {
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
