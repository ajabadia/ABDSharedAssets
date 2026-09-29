/**
 * Regla 6 — ejemplos de uso.
 *
 * las opciones del ejemplo existen de verdad.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  moduleExporting,
} from '../api.js';

import {
  MODULES,
} from '../modules.js';

import {
  optionReads,
} from '../options.js';

import {
  exampleConstructions,
} from '../usage.js';

/** Claves de ejemplo que el codigo de la clase construida NO lee: ejemplo obsoleto. */
export function staleUsageOptions(source, modules = MODULES) {
  const stale = new Set();

  for (const { className, keys } of exampleConstructions(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;                        // clase desconocida: no hay lectura que juzgar

    const reads = optionReads(target.source);

    for (const key of keys) {
      if (!reads.has(key))
        stale.add(`${className}.${key}`);
    }
  }

  return [...stale].sort();
}

/* ---------------------------------------------------------------------------
 * Detectores de la regla 7: los valores enumerados
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const staleUsageOptionsRule = {
  number: 6,
  detector: staleUsageOptions,
  title: 'ejemplos de uso',
  assertion: 'las opciones del ejemplo existen de verdad',
  about: 'Toda opción de un `new Clase(el, { ... })` documentado —o del objeto que ' +
    'vive tras un envoltorio transparente, `new X(el, wrap({ ... }))`— tiene que ' +
    'ser una que ESA clase lea de verdad.',
  limit: 'audita el ejemplo como codigo, no la prosa: una mencion suelta en el texto ' +
    'no es un ejemplo, y un ejemplo de otra clase no se juzga contra esta',
  limitWidth: 82,
  edge: 2,
  recipe: {
    module: 'xypad.js', cited: ['XYPad.zzzGhost'],
    about: 'pon una opcion en el objeto del ejemplo que el ejemplo ya no usa, y el '
      + 'detector la delata como una entrada vieja',
    limit: 'la variacion valida cambia una opcion que el ejemplo si usa, asi que el '
      + 'caso no juzga el valor de ninguna de las dos',
    mutate: (source) => source.replace('{ x: 0.5, y: 0.5, onChange, onDragStart, onDragEnd }',
      '{ x: 0.5, y: 0.5, zzzGhost: 1 }'),
    safe: (source) => source.replace('{ x: 0.5, y: 0.5, onChange, onDragStart, onDragEnd }',
      '{ x: 0.5, y: 0.5, step: 0.1, onChange, onDragStart, onDragEnd }'),
  },
};
