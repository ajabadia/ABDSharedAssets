/**
 * Regla 9 — aridad.
 *
 * el ejemplo llama y construye con la aridad de la firma.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  moduleExporting,
} from '../api.js';

import {
  memberDeclarations,
} from '../members.js';

import {
  MODULES,
} from '../modules.js';

import {
  CLOSER,
  closingIndex,
  skipString,
} from '../scan.js';

import {
  argumentCount,
  splitTopLevel,
} from '../split.js';

import {
  exampleCallsWithLabels,
} from '../usage.js';

/** El `=` de nivel 0 que declara un default (`notify = true`), o -1. Los anidados no
 *  cuentan: un parametro desestructurado sin default (`{ x, y }`, cuyo `=` vive
 *  dentro de las llaves) sigue siendo OBLIGATORIO, porque el objeto hay que pasarlo. */
function defaultEqualsAt(param) {
  let i = 0;

  while (i < param.length) {
    const ch = param[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(param, i);
      continue;
    }

    if (CLOSER[ch] != null) {
      const close = closingIndex(param, i);

      if (close < 0)
        return -1;

      i = close + 1;
      continue;
    }

    if (ch === '=' && param[i + 1] !== '=' && param[i + 1] !== '>' && '!<>+-*/%&|^'.indexOf(param[i - 1]) < 0)
      return i;

    i += 1;
  }

  return -1;
}

/** Lo que acepta una lista de parametros: cuantos son obligatorios, cuantos son en
 *  total y si termina en `...resto` (y entonces no hay techo). */
function signatureOf(params) {
  const parts = params.trim() === ''
    ? []
    : splitTopLevel(params).filter((part) => part.trim() !== '');
  let required = 0;
  let rest = false;

  for (const part of parts) {
    if (/^\s*\.\.\./.test(part))
      rest = true;
    else if (defaultEqualsAt(part) < 0)
      required += 1;
  }

  return { required, total: parts.length, rest };
}

/** La firma de cada miembro declarado: nombre -> { required, total, rest }. Solo los
 *  `method` tienen firma: un getter, un setter y un campo no son llamables, y la regla
 *  9 tampoco los da por llamables. */
export function memberSignatures(source, className) {
  const signatures = new Map();

  for (const [member, { forms, params }] of memberDeclarations(source, className)) {
    if (forms.has('method'))
      signatures.set(member, signatureOf(params));
  }

  return signatures;
}

/** La aridad de una firma escrita para el mensaje: `1`, `1..2`, `1+`. */
export function arityRange({ required, total, rest }) {
  if (rest)
    return `${required}+`;

  return required === total ? `${total}` : `${required}..${total}`;
}

/** Anota el fallo de aridad de una llamada, si su firma declarada lo delata. Una
 *  firma que no existe se salta: del metodo que la clase no declara ya se encarga la
 *  regla 8, y las dos reglas se reparten el fallo en vez de contarlo dos veces. */
function offArity(off, label, signature, args) {
  if (signature == null)
    return;

  const argc = argumentCount(args);

  if (argc < signature.required || (!signature.rest && argc > signature.total))
    off.add(`${label}: recibe ${argc}, la firma acepta ${arityRange(signature)}`);
}

/** Llamadas Y construcciones de los ejemplos cuyo numero de argumentos no cabe en la
 *  firma declarada: los metodos que el ejemplo llama sobre su receptor, y el
 *  `new Clase(...)` con el que construye, cuya firma es la del `constructor` de esa
 *  clase. Una construccion de una clase que ningun modulo auditado exporta no tiene
 *  firma que comparar y se salta. */
export function arityMismatches(source, modules = MODULES) {
  const off = new Set();

  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    offArity(off, label, memberSignatures(target.source, className).get(member), args);
  }

  return [...off].sort();
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const arityMismatchesRule = {
  number: 9,
  detector: arityMismatches,
  title: 'aridad',
  assertion: 'el ejemplo llama y construye con la aridad de la firma',
  about: 'Esa llamada —y el `new Clase(...)`— tiene que pasar un número de argumentos '
    + 'que la firma declare.',
  limit: 'cuenta los argumentos por la firma, no por las comas: un default, un `= {}` '
    + 'detras del destructuring y un `...resto` no obligan',
  edge: 2,
  recipe: {
    module: 'wheel.js', cited: ['Wheel.setValue(): recibe 3, la firma acepta 1..2'],
    about: 'anade un argumento de mas a una llamada que la firma ya cerraba, sobre el '
      + 'modulo de ejemplo del repositorio',
    limit: 'la variacion valida cambia el valor del segundo argumento y deja el numero '
      + 'como estaba, asi que el caso no prueba nada de un resto en la firma',
    mutate: (source) => source.replace('wheel.setValue(0.5, false)', 'wheel.setValue(0.5, false, 1)'),
    safe: (source) => source.replace('wheel.setValue(0.5, false)', 'wheel.setValue(0.75, true)'),
  },
};
