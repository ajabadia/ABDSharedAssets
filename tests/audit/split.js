/**
 * El troceo de primer nivel del fuente: partir por comas, por `?` y `:`, y
 * quedarse con el trozo que empieza en un indice, ya resueltas las cadenas.
 */

import {
  skipString,
} from './scan.js';

/** Los argumentos de un texto de llamada, troceados por sus comas de nivel 0: el
 *  `{ x: 0.2, y: 0.8 }` de un `setValue` es UNO, y `['a', '', 'b', '']` tambien. */
export function argumentList(text) {
  if (text.trim() === '')
    return [];

  const args = splitTopLevel(text);

  // una coma final (`f(a,)`) no es un argumento mas
  if (args.length > 1 && args[args.length - 1].trim() === '')
    args.pop();

  return args.map((arg) => arg.trim());
}

/** Cuantos argumentos pasa una llamada. */
export const argumentCount = (text) => argumentList(text).length;

/** Partes de un patron separadas por comas de primer nivel. */
export function topLevelParts(pattern) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (const char of pattern) {
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;

    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }

    current += char;
  }

  parts.push(current);

  return parts;
}

/** Comas de nivel 0 de un texto (respeta anidamiento, cadenas y comentarios). */
function topLevelCommas(text) {
  const commas = [];
  let depth = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);

      if (i < 0)
        break;

      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i);

      if (i < 0)
        break;

      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[')
      depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']')
      depth -= 1;
    else if (ch === ',' && depth === 0)
      commas.push(i);

    i += 1;
  }

  return commas;
}

/** Trocea un texto por sus comas de nivel 0. */
export function splitTopLevel(text) {
  const parts = [];
  let from = 0;

  for (const cut of topLevelCommas(text)) {
    parts.push(text.slice(from, cut));
    from = cut + 1;
  }

  parts.push(text.slice(from));

  return parts;
}

/** Quita el canal ` * ` de cada linea: un objeto a varias lineas se parte por lineas
 *  y el canal se colaria como si fuera el principio de la clave. */
export function stripGutter(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\*(?!\/)\s?/, ''))
    .join('\n');
}
