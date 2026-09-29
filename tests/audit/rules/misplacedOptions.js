/**
 * Regla 13 — opciones en su sitio.
 *
 * el objeto de opciones va despues de otro parametro.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  entrySignatures,
} from '../entries.js';

import {
  signatureParams,
} from '../options.js';

/** Las ENTRADAS que ponen el objeto de opciones en el PRIMER parametro habiendo declarado
 *  otro mas, por su cuenta o desmembrado. No es un juicio de documentacion: el codigo
 *  funciona igual en las dos posiciones. Es una convencion del repo, y lo que la regla
 *  protege es la diferencia REAL entre las dos:
 *
 *  - el objeto de opciones llega DESPUES del elemento (`constructor(container, options =
 *    {})`), que es la forma mayoritaria del repo y la que una lectura acotada al primer
 *    parametro se encontraria como la unica;
 *  - y llega en el PRIMERO, con lo que todo lo que sepa que las opciones son "el segundo
 *    argumento" —un ejemplo, una llamada, un atajo— mira el elemento.
 *
 *  La exencion de la entrada de UN SOLO parametro no es un conveniente: es lo que deja
 *  limpio el inventario. Las cuatro entradas que lo ponen en el primero
 *  (`createContinuousNotices`, `createDrawer`, `computeFit` y `createOverlayFocus`) no
 *  declaran nada mas —no hay donde ponerlo—, y delatarlas seria decir que su firma esta
 *  mal cuando es la unica posible. Lo que se juzga es la ELECCION: si la firma declara mas
 *  parametros, el objeto de opciones va detras.
 */
export function misplacedOptions(source) {
  const off = [];

  for (const { name, parameters } of entrySignatures(source)) {
    const params = signatureParams(parameters);

    if (params.length < 2 || !params[0].options)
      continue;

    off.push(`${name}(${parameters}): el objeto de opciones va en el primer parametro`
      + ` y la firma declara ${params.length} parametros`);
  }

  return off;
}

/* ---------------------------------------------------------------------------
 * Regla 13: la convencion de donde vive el objeto de opciones
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const misplacedOptionsRule = {
  number: 13,
  detector: misplacedOptions,
  title: 'opciones en su sitio',
  assertion: 'el objeto de opciones va después de otro parámetro',
  about: 'El objeto de opciones va detrás de otro parámetro. No es un juicio de ' +
    'documentación —el código funciona igual en las dos posiciones—: es la ' +
    'convención del repo, y lo que protege es la diferencia real entre el ' +
    'elemento primero y las opciones primero. Una entrada de un solo parámetro se ' +
    'exime: no hay dónde ponerlas.',
  limit: 'se calla donde no hay decision que tomar: una entrada de un solo parametro ' +
    'no declara nada mas',
  edge: 4,
  recipe: {
    module: 'xypad.js',
    cited: ['constructor(options = {}, container): el objeto de opciones va en el primer parametro y la firma declara 2 parametros'],
    about: 'invierte los dos parametros de un constructor documentado y el detector '
      + 've el objeto de opciones delante de todo',
    limit: 'la variacion valida desmembra el objeto en el segundo parametro, con lo '
      + 'que el caso no juzga mas que la posicion en la que llega',
    mutate: (source) => source.replace('constructor (container, options = {})',
      'constructor (options = {}, container)'),
    // la variacion VALIDA tambien cambia el fuente (el caso control lo exige): las
    // opciones se quedan en el segundo parametro, pero llegan desmembradas
    safe: (source) => source.replace('constructor (container, options = {})',
      'constructor (container, { value = 0.5 } = {})'),
  },
};
