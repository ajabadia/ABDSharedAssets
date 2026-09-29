/**
 * Regla 3 — claves de entrada.
 *
 * toda clave que normalizeEntry guarda se lee fuera del normalizador.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

/** Claves que `normalizeEntry` guarda en cada entrada (null si no hay normalizador). */
export function entryShapeKeys(source) {
  const start = source.indexOf('function normalizeEntry');

  if (start < 0)
    return null;

  const end = source.indexOf('\n}', start);
  const fn = source.slice(start, end < 0 ? source.length : end);
  const open = fn.indexOf('return {');

  if (open < 0)
    return [];

  let depth = 0;
  let close = -1;

  for (let i = open + 'return '.length; i < fn.length; i += 1) {
    if (fn[i] === '{') depth += 1;
    else if (fn[i] === '}') {
      depth -= 1;

      if (depth === 0) { close = i; break; }
    }
  }

  const literal = fn.slice(open, close < 0 ? fn.length : close + 1);
  const keys = [];
  let nested = 0;

  for (let i = 0; i < literal.length; i += 1) {
    if (literal[i] === '{') nested += 1;
    else if (literal[i] === '}') nested -= 1;
    else if (literal[i] === ':' && nested === 1) {
      const before = literal.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);

      if (before != null) keys.push(before[1]);
    }
  }

  return keys;
}

/** Una clave de entrada se LEE como `entry.clave` fuera del normalizador. */
export function entryKeyIsRead(source, key) {
  const start = source.indexOf('function normalizeEntry');
  const end = start < 0 ? -1 : source.indexOf('\n}', start);
  const rest = start < 0
    ? source
    : source.slice(0, start) + source.slice(end < 0 ? source.length : end);

  return new RegExp(`entry\\??\\.${key}\\b`).test(rest);
}

/** Claves registradas que nadie lee. */
export function unreadEntryKeys(source) {
  return (entryShapeKeys(source) ?? []).filter((key) => !entryKeyIsRead(source, key));
}

/* ---------------------------------------------------------------------------
 * Regla 4: los defaults que promete la documentacion
 * ------------------------------------------------------------------------- */

/** El subconjunto de modulos que juzga esta regla: los que tienen una entrada rica (un
 *  `normalizeEntry` que guarda claves). El resto no tiene nada que juzgar aqui. */
const entryShapedModules = (all) => all.filter(({ source }) => entryShapeKeys(source) != null);

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const unreadEntryKeysRule = {
  number: 3,
  detector: unreadEntryKeys,
  title: 'claves de entrada',
  assertion: 'toda clave que normalizeEntry guarda se lee fuera del normalizador',
  about: 'Cada clave que `normalizeEntry` guarda tiene que leerse como `entry.clave` ' +
    'fuera del normalizador.',
  limit: 'solo cuenta la lectura `entry.clave` de fuera del normalizador: por `this`, ' +
    'desestructurada o con un indice dinamico no cuenta',
  edge: 4,
  modules: entryShapedModules,
  recipe: {
    module: 'select.js', cited: ['zzzGhostKey'],
    about: 'anade una clave al normalizador de un modulo real y mira que el detector '
      + 'la ve viva solo dentro de el',
    limit: 'la variacion valida cambia como se lee una clave que ya se leia, asi que '
      + 'el caso no toca el alcance de la cuenta',
    mutate: (source) => {
      const normalizer = source.indexOf('function normalizeEntry');
      const literal = source.indexOf('return {', normalizer);

      return source.slice(0, literal + 8) + '\n      zzzGhostKey: true,' + source.slice(literal + 8);
    },
    safe: (source) => source.replace('disabled: Boolean(entry?.disabled),', 'disabled: !!entry?.disabled,'),
  },
};
