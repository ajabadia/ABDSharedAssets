/**
 * Las ENTRADAS ricas: el objeto de opciones y el registro de un `normalizeEntry`
 * leidos como literales —sus llaves, sus grupos de llaves y lo que los envuelve.
 */

import {
  closingIndex,
} from './scan.js';

import {
  splitTopLevel,
  stripGutter,
} from './split.js';

/** Las ENTRADAS de un modulo —cada `constructor` y cada `export function`— con el texto
 *  de sus parametros y el sitio del fuente donde empieza: [{ name, at, parameters }], en
 *  orden. `name` es el de la funcion, o la palabra `constructor`.
 *
 *  Los nombres hacen falta para un juicio con mensaje: la regla 13 dice EN QUE ENTRADA
 *  esta el objeto de opciones en el primer parametro, y un texto de parametros a secas no
 *  sabe si lo que ha leido es un constructor o una fabrica. */
export function entrySignatures(source) {
  const entries = [];
  const call = /(?:constructor\s*\(|export\s+function\s+([A-Za-z_$][\w$]*)\s*\()/g;
  let match = call.exec(source);

  while (match != null) {
    let depth = 1;
    let i = call.lastIndex;

    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
    }

    entries.push({
      name: match[1] ?? 'constructor',
      at: match.index,
      parameters: source.slice(call.lastIndex, i - 1),
    });
    call.lastIndex = i;
    match = call.exec(source);
  }

  return entries;
}

/** Argumentos de los puntos de entrada: constructor(...) y `export function x(...)`. La
 *  lista sin los nombres, que es lo que leen casi todos. */
export function entryParameters(source) {
  return entrySignatures(source).map(({ parameters }) => parameters);
}

/** Grupos `{ ... }` de un texto, por contenido y respetando anidamiento. */
export function braceGroups(text) {
  const groups = [];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{')
      continue;

    let depth = 0;
    let j = i;

    for (; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;

        if (depth === 0)
          break;
      }
    }

    groups.push(text.slice(i + 1, j));
    i = j;
  }

  return groups;
}

/** Tramo del literal `{ ... }` que contiene `index` (null si no hay literal). */
export function enclosingLiteral(source, index) {
  let depth = 0;
  let open = -1;

  for (let i = index - 1; i >= 0; i -= 1) {
    const char = source[i];

    if (char === '}')
      depth += 1;
    else if (char === '{') {
      if (depth === 0) { open = i; break; }

      depth -= 1;
    } else if (char === ';' && depth === 0)
      break;
  }

  if (open < 0)
    return null;

  let level = 0;

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') level += 1;
    else if (source[i] === '}') {
      level -= 1;

      if (level === 0)
        return [open, i + 1];
    }
  }

  return null;
}

/** Una entrada de objeto literal: `{ key, text }`, donde `text` es el valor SOLO
 *  si es una cadena citada (una union `'a' | 'b'`, un numero o un objeto no lo son).
 *  Devuelve null para el spread y para la prosa que no es una entrada. */
function objectEntry(entry) {
  let i = 0;

  // Espacios y comentarios por delante: el `// default` de una linea abre la siguiente.
  while (true) {
    while (i < entry.length && /\s/.test(entry[i]))
      i += 1;

    if (entry[i] === '/' && entry[i + 1] === '/') {
      const newline = entry.indexOf('\n', i);

      if (newline < 0)
        return null;

      i = newline;
      continue;
    }

    if (entry[i] === '/' && entry[i + 1] === '*') {
      const end = entry.indexOf('*/', i);

      if (end < 0)
        return null;

      i = end + 2;
      continue;
    }

    break;
  }

  const rest = entry.slice(i);

  if (rest.startsWith('...'))
    return null;                       // spread: no se puede juzgar

  const explicit = /^(?:'([^'\n]*)'|"([^"\n]*)"|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/.exec(rest);

  if (explicit != null) {
    const key = explicit[1] ?? explicit[2] ?? explicit[3];
    const quoted = /^(?:'([^'\n]*)'|"([^"\n]*)")\s*(?:\/\/[^\n]*)?$/.exec(explicit[4].trim());

    return { key, text: quoted == null ? null : (quoted[1] ?? quoted[2]) };
  }

  const shorthand = /^([A-Za-z_$][\w$]*)\s*(?:\/\/[^\n]*)?$/.exec(rest);

  return shorthand == null ? null : { key: shorthand[1], text: null };
}

/** Entradas del objeto literal que abre en `text[0] === '{'` (puede no cerrar: []). */
function bracedEntries(text) {
  const close = closingIndex(text, 0);

  if (close < 0)
    return [];

  return splitTopLevel(stripGutter(text.slice(1, close)))
    .map(objectEntry)
    .filter((entry) => entry != null);
}

/** Entradas del objeto de opciones, mirando DETRAS de un envoltorio TRANSPARENTE.
 *
 *  Un envoltorio es transparente cuando su UNICO argumento es un objeto literal —o
 *  otro envoltorio asi— (`wrap({ ... })`, `withDefaults({ ... })`): el objeto vive
 *  tras una llamada, pero sigue siendo el argumento de opciones que el ejemplo
 *  promete. Se devuelve `null` (no se juzga) ante cualquier forma que el audit no
 *  pueda leer: mas de un argumento (`merge(base, { ... })`), un argumento que no es
 *  un literal (una variable, un spread), o una llamada con cola. Antes mudo que un
 *  falso positivo: el audit no sabe si ese envoltorio pasa las claves tal cual. */
export function wrappedOptionEntries(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith('{'))
    return bracedEntries(trimmed);

  const call = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.exec(trimmed);

  if (call == null)
    return null;                       // no es ni un objeto ni una llamada

  const open = call[0].length - 1;
  const close = closingIndex(trimmed, open);

  if (close < 0 || trimmed.slice(close + 1).trim() !== '')
    return null;                       // llamada que no cierra o con cola

  const inner = splitTopLevel(trimmed.slice(open + 1, close)).map((part) => part.trim());

  if (inner.length !== 1 || inner[0] === '')
    return null;                       // cero o mas de un argumento

  return wrappedOptionEntries(inner[0]);   // otro envoltorio, o el objeto literal
}

/** Entradas (clave y valor textual) del objeto de opciones de un `new Clase(...)`.
 *  El objeto puede venir directo (`new X(el, { ... })`) o tras un envoltorio
 *  transparente (`new X(el, wrap({ ... }))`), tambien en el receptor encadenado. */
export function optionEntriesOfArgs(args) {
  const parts = splitTopLevel(args);

  if (parts.length < 2)
    return [];                         // `new X(el)`: sin objeto de opciones

  return wrappedOptionEntries(parts[1]) ?? [];
}

/** Claves del objeto de opciones (segundo argumento) de un `new Clase(...)`. */
export function optionKeysOfArgs(args) {
  return optionEntriesOfArgs(args).map(({ key }) => key);
}
