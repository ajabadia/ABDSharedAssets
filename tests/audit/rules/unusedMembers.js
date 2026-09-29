/**
 * Regla 1 — opciones documentadas.
 *
 * todo miembro documentado se menciona en el código.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  codeOnly,
  documentedMembers,
} from '../docs.js';

import {
  optionNameAlternation,
} from '../options.js';

/** Consultado = el nombre aparece al menos una vez en el codigo. */
export function memberIsConsulted(source, name) {
  return new RegExp(`\\b${name}\\b`).test(codeOnly(source));
}

/** Miembros documentados que el codigo no menciona. */
export function unusedMembers(source) {
  const documented = documentedMembers(source, optionNameAlternation(source));

  return [...documented.keys()].filter((name) => !memberIsConsulted(source, name));
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const unusedMembersRule = {
  number: 1,
  detector: unusedMembers,
  title: 'opciones documentadas',
  assertion: 'todo miembro documentado se menciona en el código',
  about: 'Un miembro que solo vive en la documentación y el código no menciona.',
  limit: 'cuenta cualquier mencion del nombre, aunque este en un comentario: no juzga ' +
    'si la mencion llega a ser una lectura; de eso responde la 2',
  edge: 0,
  recipe: {
    module: 'themeSwitcher.js', cited: ['zzzGhost'],
    about: 'documenta un miembro nuevo en un modulo de verdad y mira que el detector '
      + 'lo delate sin tocar nada mas',
    limit: 'la variacion valida tambien reescribe el modulo, asi que el caso no '
      + 'prueba que el detector acepte un archivo sin cambios',
    mutate: (source) => source.replace(' * @param ',
      ' * @param {number} [options.zzzGhost] opcion que solo vive en la doc\n * @param '),
    safe: (source) => source.replace('tema inicial (default: guardado o el primero)',
      'tema inicial; si falta, el guardado o el primero'),
  },
};
