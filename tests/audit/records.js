/**
 * La capa de TIPOS y REGISTROS: los tipos legibles y las claves que un registro
 * promete —inline, en un `@typedef` o en el `@returns {{ ... }}` de un callable.
 */

import {
  closingIndex,
  skipString,
} from './scan.js';

import {
  argumentList,
  splitTopLevel,
} from './split.js';

/** La firma `function(a, b): c` de un tipo inline: { params, returns }, o null si
 *  el texto no la es. Es la misma gramatica que JSDoc usa desde siempre, y la que
 *  la regla 10 ignora desde su primer dia: un campo de callback se descartaba por
 *  ilegible aunque la firma dijera TODO lo que el cruce necesita. */
export function functionInlineSignature(text) {
  const match = /^function\s*\(([\s\S]*?)\)\s*:\s*([\s\S]+)$/.exec(text.trim());

  if (match == null)
    return null;

  return { params: argumentList(match[1]), returns: match[2].trim() };
}

/** Los tramos `[inicio, fin]` de las entradas de nivel 0 de un literal de objeto: las
 *  comas que las separan no cuentan dentro de cadenas, llamadas, literales anidados ni
 *  comentarios (el JSDoc de un metodo vive DENTRO del literal y trae comas propias). Lo
 *  comparten `factoryApiMembers` (que resuelve cada entrada) y `literalKeys` (que solo
 *  lee su clave). */
export function literalEntryRanges(text) {
  let depth = 0;
  let start = -1;
  const entries = [];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);

      if (newline < 0)
        break;

      i = newline;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i);

      if (end < 0)
        break;

      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i) - 1;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[')
      depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']')
      depth -= 1;
    else if (ch === ',' && depth === 0) {
      if (start >= 0)
        entries.push([start, i]);

      start = -1;
      continue;
    }

    if (start < 0 && !/\s/.test(ch))
      start = i;
  }

  if (start >= 0)
    entries.push([start, text.length]);

  return entries;
}

/** La familia de un tipo declarado que la regla SABE leer. Lo que no este aqui
 *  (`HTMLElement`, un generico) no se juzga; un objeto inline se lee como `object`
 *  (ver `isRecordType`). */
export const FAMILY = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  array: 'array',
  Array: 'array',
  function: 'function',
  Function: 'function',
  void: 'void',
  null: 'null',
  '*': '*',
};

/** El tipo sin sus llaves exteriores (`{object}` -> `object`). */
export const unbracketed = (type) => type.trim().replace(/^\{|\}$/g, '').trim();

/** Un tipo objeto INLINE, la forma con que JSDoc documenta un parametro destructured:
 *  `{{ x: number, y: number }}` llega aqui como `{ x: number, y: number }` (la llave
 *  EXTERIOR envuelve TODO el tipo). `{object}` NO es un registro: eso es un tipo simple
 *  entre llaves, y lo lee `unbracketed`. */
export function isRecordType(type) {
  const text = type.trim();

  if (!text.startsWith('{') || closingIndex(text, 0) !== text.length - 1)
    return false;

  const inner = text.slice(1, -1).trim();

  return !/^[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*$/.test(inner)
    || !inner.split('|').every((alternative) => FAMILY[alternative.trim()] != null);
}

/** Si el tipo prometido se lee ENTERO: `{string}`, `{number|string}` y un objeto
 *  inline (`{ x: number, y: number }`). Con una alternativa ilegible en la union
 *  (`{HTMLElement|string}`) no se juzga, porque el argumento podria ser justo ese. */
export function readableType(type) {
  if (isRecordType(type))
    return true;

  const bare = unbracketed(type);

  return /^[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*$/.test(bare)
    && bare.split('|').every((alternative) => FAMILY[alternative.trim()] != null);
}

/** El par `clave: valor` de UNA parte de un objeto o de un tipo inline
 *  (`x?: number`, `x: 0.2`): { key, value, optional }, o null en un spread, un
 *  shorthand o una entrada sin los dos puntos. Es el parser comun de
 *  `recordFields` (tipos) y `exampleObjectEntries` (ejemplos), para que los dos
 *  lados de la validacion por campos no puedan discrepar al leer. */
export function keyValueOf(part) {
  const match = /^([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]+)$/.exec(part.trim());

  if (match == null)
    return null;

  return { key: match[1], value: match[2].trim(), optional: /\?\s*:/.test(part) };
}

/** Las CLAVES que un tipo objeto inline escribe —en las dos formas, `{ x: ... }` y
 *  `{{ x: ... }}`—, sin mirar si su TIPO se lee: la direccion DOCUMENTADA (el nombre
 *  que la documentacion promete) no depende de que la regla sepa juzgar el tipo, que es
 *  lo que si filtra `recordFields`. Se trocea por comas de nivel 0, asi que un campo con
 *  un tipo que lleva parentesis o llaves propias (`a: (x: number) => void`,
 *  `b: { y: number }`) es UN campo y sus nombres de dentro no se cuelan. */
export function recordKeys(type) {
  let text = type.trim();

  // las dos formas del JSDoc: `{ x: ... }` y `{{ x: ... }}` (la llave de fuera envuelve
  // el tipo entero). Se pela la de fuera mientras lo de dentro siga abriendo un registro.
  while (text.startsWith('{') && closingIndex(text, 0) === text.length - 1
    && text.slice(1, -1).trim().startsWith('{'))
    text = text.slice(1, -1).trim();

  if (!text.startsWith('{') || closingIndex(text, 0) !== text.length - 1)
    return null;

  return splitTopLevel(text.slice(1, -1))
    .map((part) => /^\s*([A-Za-z_$][\w$]*)\??\s*:/.exec(part)?.[1])
    .filter((key) => key != null);
}

/** Los CAMPOS que un tipo objeto inline promete: `{{ x?: number }}` -> [{ key, type,
 *  optional }], o null si el tipo no es un registro legible. Un campo cuyo tipo no se
 *  lee (una union con `HTMLElement`, un generico) no se juzga: ahi la regla sigue
 *  siendo estrecha a proposito. */
export function recordFields(type) {
  if (!isRecordType(type))
    return null;

  // la llave que abre el REGISTRO es la ultima del prefijo `{{` (el JSDoc llega con
  // las dos: la exterior envuelve el tipo y la interior abre el registro)
  const open = type.lastIndexOf('{', type.length - 2);
  const close = closingIndex(type, open);

  if (open < 0 || close < 0 || close !== type.length - 1)
    return null;

  const fields = [];

  for (const part of splitTopLevel(type.slice(open + 1, close))) {
    const pair = keyValueOf(part);

    if (pair == null)
      continue;                       // spread o entrada sin valor: no se juzga

    const fn = functionInlineSignature(pair.value);

    if (fn == null && !readableType(pair.value))
      continue;          // un campo ilegible (y sin firma de funcion) no se juzga

    if (fn != null) {
      // El retorno de la firma se lee como los demas tipos: si no se lee (una
      // union con HTMLElement), el campo entero no se juzga.
      if (readableType(fn.returns))
        fields.push({
          key: pair.key,
          type: pair.value,
          optional: pair.optional,
          params: fn.params,
          returns: fn.returns,
        });

      continue;
    }

    fields.push({ key: pair.key, type: pair.value, optional: pair.optional });
  }

  return fields;
}
