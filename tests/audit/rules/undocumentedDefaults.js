/**
 * Regla 4 — defaults.
 *
 * todo default literal del código está documentado.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  codeOnly,
  docBlocks,
  docLineNames,
} from '../docs.js';

import {
  destructuredDefaults,
  optionNameAlternation,
  optionReadPrefix,
} from '../options.js';

/** Literales normalizados de un texto: cadenas no vacias, numeros y booleanos.
 *  `''` y `null` quedan FUERA: son "sin valor" (`label ?? ''`, `onChange ?? null`),
 *  no un default que merezca una linea de documentacion. */
const LITERAL_TOKEN = /'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b)/g;

export function literalsOf(text) {
  const found = new Set();

  for (const match of text.matchAll(LITERAL_TOKEN)) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4];

    if (token !== '')
      found.add(token);
  }

  return found;
}

/** Quita los parentesis que envuelven TODA la expresion: `(0.25)` -> `0.25`. */
export function stripParens(expression) {
  let out = expression.trim();

  while (out.startsWith('(') && out.endsWith(')')) {
    let depth = 0;
    let closesAtEnd = false;

    for (let i = 0; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;

        if (depth === 0) { closesAtEnd = i === out.length - 1; break; }
      }
    }

    if (!closesAtEnd)
      break;

    out = out.slice(1, -1).trim();
  }

  return out;
}

/** Indice del `?` de un ternario de primer nivel (-1 si no hay). */
function topLevelQuestion(expression) {
  let depth = 0;

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];

    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === '?' && depth === 0)
      return i;
  }

  return -1;
}

/** Literales que el CODIGO aplica como default, o null si no es juzgable.
 *  Juzgable = un literal, una eleccion entre literales (`vertical ? 36 : 140`) o
 *  un objeto literal (`{ initial: 400, interval: 120 }`). Un default calculado
 *  (`|| FRAME_HEIGHT`, `?? Math.floor((frames - 1) / 2)`) NO se juzga: ahi los
 *  numeros son aritmetica, no el default. */
function literalDefault(expression) {
  const expr = stripParens(expression);

  if (expr === '')
    return null;

  const question = topLevelQuestion(expr);

  if (question >= 0) {
    let depth = 0;
    let colon = -1;

    for (let i = question + 1; i < expr.length; i += 1) {
      const char = expr[i];

      if (char === '(' || char === '[' || char === '{') depth += 1;
      else if (char === ')' || char === ']' || char === '}') depth -= 1;
      else if (char === ':' && depth === 0) { colon = i; break; }
    }

    if (colon < 0)
      return null;

    const yes = literalDefault(expr.slice(question + 1, colon));
    const no = literalDefault(expr.slice(colon + 1));

    if (yes == null || no == null)
      return null;

    return new Set([...yes, ...no]);
  }

  if (expr.startsWith('{') || expr.startsWith('['))
    return literalsOf(expr);

  const whole = /^(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|(true|false))$/.exec(expr);

  if (whole == null)
    return null;

  const token = whole[1] ?? whole[2] ?? whole[3] ?? whole[4];

  return token === '' ? new Set() : new Set([token]);
}

/** Las dos FORMAS en que una opcion recibe su default en el codigo:
 *  `options.x ?? expr` / `options.x || expr` (y `this.options.x`), y
 *  `options.x !== undefined ? options.x : expr`. Cada una se arma con el prefijo comun,
 *  que trae los nombres que el modulo usa de verdad: la lista estaba escrita aqui y la
 *  de la regla 5 repetida palabra por palabra, con lo que un nombre nuevo llegaba a una
 *  y se quedaba sin vigilar en la otra. */
const DEFAULT_FORMS = [
  '([A-Za-z_$][\\w$]*)\\s*(?:\\?\\?|\\|\\|)\\s*',
  '([A-Za-z_$][\\w$]*)\\s*!==\\s*undefined\\s*\\?[^:]*:\\s*',
];

function optionDefaults(source) {
  const prefix = optionReadPrefix(source).source;

  return DEFAULT_FORMS.map((form) => new RegExp(`${prefix}${form}`, 'g'));
}

/** La expresion que empieza en `start`, respetando parentesis y ternarios. */
function readExpression(text, start) {
  let depth = 0;
  let out = '';

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (char === '(' || char === '[' || char === '{') { depth += 1; out += char; continue; }

    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0)
        break;

      depth -= 1;
      out += char;
      continue;
    }

    if (depth === 0 && (char === ',' || char === ';'))
      break;

    // Un default puede continuar en la linea siguiente, pero solo si la linea
    // actual se queda pidiendo continuacion.
    if (depth === 0 && char === '\n' && !/[?&|+:*/%(\[=,-]$/.test(out.trimEnd()))
      break;

    out += char;
  }

  return out;
}

/** Defaults que el CODIGO aplica: miembro -> literales que aplica. */
export function codeDefaults(source) {
  const code = codeOnly(source);
  const defaults = new Map();
  const record = (name, expression) => {
    const literals = literalDefault(expression);

    if (literals == null || literals.size === 0)
      return;

    defaults.set(name, literals);
  };

  for (const pattern of optionDefaults(source))
    for (const match of code.matchAll(pattern))
      record(match[1], readExpression(code, match.index + match[0].length));

  for (const { name, expression } of destructuredDefaults(source))
    record(name, expression);

  return defaults;
}

/** Defaults que la documentacion promete: miembro -> literales de su linea y de
 *  las de continuacion de su descripcion. */
export function documentedDefaults(source) {
  const promised = new Map();
  const add = (name, literals) => {
    const current = promised.get(name) ?? new Set();

    for (const literal of literals)
      current.add(literal);

    promised.set(name, current);
  };

  for (const block of docBlocks(source)) {
    const joined = block.text.replace(/\n\s*\*/g, ' ');
    let current = [];

    for (const line of [...block.text.split('\n'), joined]) {
      const names = docLineNames(line, optionNameAlternation(source));

      if (names.length > 0)
        current = names;

      const literals = literalsOf(line);

      for (const name of current)
        add(name, literals);
    }
  }

  return promised;
}

/** Defaults literales del codigo que la documentacion de ese miembro no promete. */
export function undocumentedDefaults(source) {
  const promised = documentedDefaults(source);
  const missing = [];

  for (const [name, literals] of codeDefaults(source)) {
    for (const literal of literals) {
      if (!promised.get(name)?.has(literal))
        missing.push(`${name}=${literal}`);
    }
  }

  return missing.sort();
}

/* ---------------------------------------------------------------------------
 * Regla 5: la opcion guardada que nadie vuelve a leer
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const undocumentedDefaultsRule = {
  number: 4,
  detector: undocumentedDefaults,
  title: 'defaults',
  assertion: 'todo default literal del código está documentado',
  about: 'El literal que el código aplica como default tiene que estar prometido en la ' +
    'documentación.',
  limit: 'solo juzga el default que ES un literal, o una eleccion entre literales: uno ' +
    'calculado no se juzga, porque ahi el numero es aritmetica y no un default',
  edge: 1,
  recipe: {
    module: 'effectLEDButton.js', cited: ['size=gigante'],
    about: 'cambia el default de un constructor por un valor que la lista de '
      + 'documentados no promete, y el detector lo ve al arrancar el modulo',
    limit: 'la variacion valida se queda dentro de los valores que si estan en la '
      + 'lista, que es donde el detector tiene algo que decir',
    mutate: (source) => source.replace("size: options.size ?? 'normal',", "size: options.size ?? 'gigante',"),
    safe: (source) => source.replace("size: options.size ?? 'normal',", "size: options.size ?? 'tiny',"),
  },
};
