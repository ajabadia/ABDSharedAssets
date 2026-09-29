/**
 * Las guardias de cobertura que NO son reglas numeradas: el detector de funciones
 * exportadas que ningun bloque documenta.
 */

import {
  docBlockBefore,
  docBlocks,
} from './docs.js';

/** Las funciones que un modulo EXPORTA: [{ name, at }]. Es la API de funcion (no de
 *  clase) que las reglas de receptores no ven —una funcion suelta no tiene objeto—,
 *  asi que la guardia de cobertura la vigila aparte. Un `export async function`
 *  cuenta igual; una funcion interna (sin `export`) no. */
export function exportedFunctions(source) {
  const found = [];

  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g))
    found.push({ name: match[1], at: match.index });

  return found;
}

/** Funciones exportadas que NINGUN bloque JSDoc documenta: ni el que precede a su
 *  declaracion (`docBlockBefore`) ni la CABECERA del modulo —el primer bloque del
 *  fichero, que en este repo documenta la API publica de una fabrica cuyo `Usage:`
 *  la nombra; es el caso de `lcdScreen.js` y su `createLcdScreen`, separado de su
 *  JSDoc por la tabla de defaults—. Una funcion exportada sin documentar es la que
 *  ni las trece reglas ni la cobertura de los ejemplos llegaban a ver. */
export function undocumentedExports(source) {
  const blocks = docBlocks(source);
  const header = blocks[0] != null && source.slice(0, blocks[0].start).trim() === ''
    ? blocks[0]
    : null;
  const off = [];

  for (const { name, at } of exportedFunctions(source)) {
    if (docBlockBefore(source, at) != null)
      continue;                        // tiene su propio bloque, justo encima

    if (header != null && new RegExp(`\\b${name}\\b`).test(header.text))
      continue;                        // lo documenta la cabecera del modulo

    off.push(name);
  }

  return off;
}
