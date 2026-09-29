/**
 * Regla 8 — métodos de los ejemplos.
 *
 * todo método que llama el ejemplo existe en la clase.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  factoryApiMembers,
  moduleExporting,
} from '../api.js';

import {
  CLASS_MEMBER,
  classBody,
} from '../members.js';

import {
  MODULES,
} from '../modules.js';

import {
  depthAt,
  withoutComments,
} from '../scan.js';

import {
  exampleMethodCalls,
} from '../usage.js';

/** Miembros que la clase DECLARA: el nombre antes del `(` de un metodo o del `=`
 *  de un campo (una funcion guardada en un campo tambien es un metodo). Anclado en
 *  el cierre anterior (`}`, `;` o el principio) para no leer un receptor (`this.m()`
 *  no declara nada) y filtrado por profundidad para no leer las llamadas del cuerpo.
 *  Se lee sobre el cuerpo SIN comentarios: el docblock de cada miembro es lo que va
 *  justo antes de su declaracion. */
export function classMembers(source, className) {
  const body = classBody(source, className);
  const members = new Set();

  if (body == null) {
    const api = factoryApiMembers(source, className);

    if (api == null)
      return members;

    for (const name of api.keys())
      members.add(name);

    return members;
  }

  const code = withoutComments(body);

  for (const match of code.matchAll(CLASS_MEMBER)) {
    const at = match.index + match[0].lastIndexOf(match[1]);

    if (depthAt(code, at) === 0)
      members.add(match[1]);
  }

  return members;
}

/** Metodos que un ejemplo promete y la clase construida NO declara. */
export function missingExampleMethods(source, modules = MODULES) {
  const missing = new Set();

  for (const { className, method } of exampleMethodCalls(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;                        // clase desconocida: no hay cuerpo que mirar

    if (!classMembers(target.source, className).has(method))
      missing.add(`${className}.${method}()`);
  }

  return [...missing].sort();
}

/* ---------------------------------------------------------------------------
 * Detectores de la regla 9: la aridad de esas llamadas
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const missingExampleMethodsRule = {
  number: 8,
  detector: missingExampleMethods,
  title: 'métodos de los ejemplos',
  assertion: 'todo método que llama el ejemplo existe en la clase',
  about: 'Todo método que un ejemplo llama sobre el objeto que el mismo bloque ' +
    'construye tiene que estar declarado por la clase.',
  limit: 'no juzga la aridad ni la forma del acceso: de eso responden la 9 y la 11, y ' +
    'las tres se reparten el fallo en vez de contarlo tres veces',
  edge: 2,
  recipe: {
    module: 'wheel.js', cited: ['Wheel.zzzGhost()'],
    about: 'llama en el ejemplo a un metodo que la clase del receptor no declara, y '
      + 'el detector nombra esa llamada',
    limit: 'la variacion valida llama a un metodo que si existe, de modo que el caso '
      + 'no prueba que el receptor sea una instancia y no una fabrica',
    mutate: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.zzzGhost();\n *   wheel.destroy();'),
    safe: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.setValue(0.5);\n *   wheel.destroy();'),
  },
};
