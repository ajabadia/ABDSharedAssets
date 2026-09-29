/**
 * Regla 2 — opciones leídas.
 *
 * toda opción que el código lee está documentada.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  documentedMembers,
} from '../docs.js';

import {
  optionNameAlternation,
  optionReads,
} from '../options.js';

/** Opciones leidas que no estan documentadas. */
export function undocumentedReads(source) {
  const documented = documentedMembers(source, optionNameAlternation(source));

  return [...optionReads(source).keys()].filter((name) => !documented.has(name));
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const undocumentedReadsRule = {
  number: 2,
  detector: undocumentedReads,
  title: 'opciones leídas',
  assertion: 'toda opción que el código lee está documentada',
  about: 'Al revés: el código lee `options.x` (o desestructura la `x`) y `x` no está ' +
    'documentado.',
  limit: 'solo ve lo que el codigo LEE: no juzga que la documentacion este completa, ' +
    'ni que la lectura sirva para algo',
  edge: 1,
  recipe: {
    module: 'effectLEDButton.js', cited: ['zzzGhost'],
    about: 'mete una lectura nueva en el constructor de un modulo real y comprueba '
      + 'que el detector la nombre sin que nadie la prometa',
    limit: 'la variacion valida lee una opcion que ya estaba prometida, de modo que '
      + 'el caso no dice nada de una lectura que llega a usarse',
    mutate: (source) => source.replace('constructor(container, options = {}) {',
      'constructor(container, options = {}) { this.zzzGhost = options.zzzGhost;'),
    safe: (source) => source.replace('constructor(container, options = {}) {',
      'constructor(container, options = {}) { this.sizeSeen = options.size;'),
  },
};
