/**
 * Regla 7 — valores enumerados.
 *
 * el código y los ejemplos usan valores de la lista documentada.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  moduleExporting,
} from '../api.js';

import {
  codeOnly,
  docBlocks,
  docLineNames,
} from '../docs.js';

import {
  MODULES,
} from '../modules.js';

import {
  copiedOptions,
  destructuredDefaults,
  optionNameAlternation,
  optionReads,
} from '../options.js';

import {
  exampleConstructions,
} from '../usage.js';

/** Literales de CADENA de un texto: una lista de valores se escribe con comillas,
 *  asi que un numero o un booleano (`0..1`, `default false`) no la forman. */
const STRING_TOKEN = /'([^']*)'|"([^"]*)"/g;

function stringLiteralsOf(text) {
  const found = new Set();

  for (const match of text.matchAll(STRING_TOKEN)) {
    const token = match[1] ?? match[2];

    if (token !== '')
      found.add(token);
  }

  return found;
}

/** Los valores que la documentacion ENUMERA para un miembro: dos o mas cadenas en
 *  SU MISMA LINEA. Una sola cadena es el default (el dominio de `color` o de `skin`
 *  es dato y no lo enumera nadie), y `0..1` o `default false` son un rango y un
 *  escalar. Tiene que estar en la linea del nombre y no en una de continuacion: la
 *  continuacion describe, y una cadena ajena colgada del nombre de arriba es como
 *  una lista de valores se inventa sola. */
export function enumeratedValues(source) {
  const enumerated = new Map();

  for (const block of docBlocks(source)) {
    for (const line of block.text.split('\n')) {
      const strings = [...stringLiteralsOf(line)];

      if (strings.length < 2)
        continue;

      for (const name of docLineNames(line, optionNameAlternation(source))) {
        const values = enumerated.get(name) ?? new Set();

        for (const literal of strings)
          values.add(literal);

        enumerated.set(name, values);
      }
    }
  }

  return enumerated;
}

/** Las expresiones con las que el codigo puede SOSTENER una opcion: la lectura del
 *  objeto de opciones (`options.x`), el hueco donde se copio (`this.field`) y el
 *  nombre suelto de un binding del destructuring. La lectura se limita a los
 *  identificadores de opciones: `item.type` es el campo de otro, no esta opcion. */
function optionExpressions(source) {
  const expressions = new Map();
  const add = (option, pattern) => {
    const patterns = expressions.get(option) ?? new Set();

    patterns.add(pattern);
    expressions.set(option, patterns);
  };

  for (const option of optionReads(source).keys())
    add(option, `(?:this\\.)?(?:${optionNameAlternation(source)})\\.${option}\\b`);

  for (const [slot, copy] of copiedOptions(source))
    add(copy.name, `this\\.${slot}\\b`);

  for (const { name } of destructuredDefaults(source))
    add(name, `(?<![.\\w$])${name}\\b`);

  return expressions;
}

/** Literales con los que el codigo DECIDE sobre cada opcion: opcion -> Set<literal>. */
export function branchedLiterals(source) {
  const code = codeOnly(source);
  const branches = new Map();

  for (const [option, patterns] of optionExpressions(source)) {
    for (const pattern of patterns) {
      const comparison = new RegExp(
        `(?:${pattern}\\s*(?:===|!==)\\s*'([^']*)'|'([^']*)'\\s*(?:===|!==)\\s*${pattern})`, 'g');

      for (const match of code.matchAll(comparison)) {
        const literal = match[1] ?? match[2];

        if (literal === '')
          continue;

        const literals = branches.get(option) ?? new Set();

        literals.add(literal);
        branches.set(option, literals);
      }
    }
  }

  return branches;
}

/** Valores textuales que los ejemplos dan a una opcion: [{ className, target, key, value }]. */
export function exampleValues(source, modules = MODULES) {
  const values = [];

  for (const { className, entries } of exampleConstructions(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    for (const { key, text } of entries) {
      if (text != null)
        values.push({ className, target, key, value: text });
    }
  }

  return values;
}

/** Valores que la lista documentada no admite: los del codigo o los de un ejemplo. */
export function offListValues(source, modules = MODULES) {
  const listed = enumeratedValues(source);
  const off = new Set();

  for (const [option, literals] of branchedLiterals(source)) {
    const values = listed.get(option);

    if (values == null)
      continue;

    for (const literal of literals) {
      if (!values.has(literal))
        off.add(`${option}=${literal}`);
    }
  }

  for (const { className, target, key, value } of exampleValues(source, modules)) {
    // La lista es la del modulo que EXPORTA la clase, no la del fichero del ejemplo:
    // el ejemplo del barrel (`index.js`) promete valores de `knob.js`.
    const values = enumeratedValues(target.source).get(key);

    if (values == null)
      continue;

    if (!values.has(value))
      off.add(`${className}.${key}=${value}`);
  }

  return [...off].sort();
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const offListValuesRule = {
  number: 7,
  detector: offListValues,
  title: 'valores enumerados',
  assertion: 'el código y los ejemplos usan valores de la lista documentada',
  about: 'Cuando la documentación enumera el dominio de una opción, ni el código ni ' +
    'los ejemplos salen de la lista.',
  limit: 'solo juzga lo que ES una lista, dos o mas cadenas en la linea del nombre: ' +
    'una cadena suelta es el default, y `0..1` o `default false` son un rango y ' +
    'un escalar',
  edge: 0,
  recipe: {
    module: 'wheel.js', cited: ['type=zzzGhost'],
    about: 'mete un valor que no esta en la lista documentada de la opcion y mira '
      + 'que el detector lo compare contra ella',
    limit: 'la variacion valida usa otro valor de la misma lista, asi que el caso no '
      + 'prueba que la lista se lea entera ni que se lea una vez',
    mutate: (source) => `${source}\nif (this.type === 'zzzGhost') this.value = 0;\n`,
    safe: (source) => `${source}\nif (this.type === 'pitch') this.value = 0;\n`,
  },
};

