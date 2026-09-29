/**
 * Regla 5 — opciones guardadas.
 *
 * toda opción guardada se vuelve a leer.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  codeOnly,
} from '../docs.js';

import {
  copiedOptions,
  destructuredDefaults,
} from '../options.js';

/** Cuantas veces aparece `name` como palabra suelta en el codigo. */
function countWord(code, name) {
  return [...code.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
}

/** Opciones que el codigo guarda y nunca vuelve a leer. */
export function inertOptions(source) {
  const code = codeOnly(source);
  const inert = new Set();

  for (const copy of copiedOptions(source).values()) {
    if (!copy.used)
      inert.add(copy.name);
  }

  // Un binding del destructuring que solo aparece en su propio patron.
  for (const { name } of destructuredDefaults(source)) {
    if (countWord(code, name) < 2)
      inert.add(name);
  }

  return [...inert].sort();
}

/* ---------------------------------------------------------------------------
 * Detectores de la regla 6: los ejemplos de uso de la documentacion
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const inertOptionsRule = {
  number: 5,
  detector: inertOptions,
  title: 'opciones guardadas',
  assertion: 'toda opción guardada se vuelve a leer',
  about: 'Una opción que el código solo copia a un hueco y no vuelve a leer está ' +
    'muerta: no hay nada que configurar con ella.',
  limit: 'no juzga el VALOR que se guarda, solo que se lea: una opcion que se copia y ' +
    'se vuelve a leer con otro default no sale',
  edge: 4,
  recipe: {
    module: 'effectLEDButton.js', cited: ['zzzGhost'],
    about: 'copia una opcion al objeto sin leerla nunca, y el detector la delata por '
      + 'el camino que no la recorre',
    limit: 'la variacion valida cambia el valor de una opcion que el codigo si lee, '
      + 'con lo que el caso no prueba nada de una copia sin lectura',
    mutate: (source) => source.replace('value: options.value ?? false,',
      'value: options.value ?? false,\n            zzzGhost: options.zzzGhost ?? null,'),
    safe: (source) => source.replace('value: options.value ?? false,', 'value: options.value ?? true,'),
  },
};
