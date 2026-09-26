/**
 * Familias de las REGLAS 1 a 7: opciones documentadas y leidas, claves de
 * normalizeEntry, defaults, opciones inertes, ejemplos de uso y valores enumerados.
 *
 * Generado al partir tests/audit/detectors.js: el barrel (`./detectors.js`) vuelve a
 * exponer todo, asi que los consumidores no cambian.
 */

import {
  MODULES,
  OPTION_IDENTIFIERS,
} from './modules.js';

/* ---------------------------------------------------------------------------
 * Detectores (puros: reciben la fuente, no el disco)
 * ------------------------------------------------------------------------- */

/** Todos los bloques de documentacion, en orden. */
export function docBlocks(source) {
  const blocks = [];
  let index = source.indexOf('/**');

  while (index >= 0) {
    const end = source.indexOf('*/', index);

    if (end < 0)
      break;

    blocks.push({ start: index, text: source.slice(index, end) });
    index = source.indexOf('/**', end);
  }

  return blocks;
}

/** El codigo: la fuente sin ningun bloque de documentacion (el doc no es uso). */
export function codeOnly(source) {
  let out = '';
  let cursor = 0;

  for (const block of docBlocks(source)) {
    out += source.slice(cursor, block.start);
    cursor = block.start + block.text.length + 2;
  }

  return out + source.slice(cursor);
}

/** Celda de nombres de una linea de lista (lo que va antes de la descripcion). */
export const NAMES_CELL = /^\s*\*\s{2,}(.+?)\s{2,}\S/;
/** `@param {tipo} [prefijo.nombre]`. */
export const JSDOC_MEMBER = /@param\s+\{[^}]*\}\s+\[?(\w+)\.(\w+)/;
/** Tipo objeto inline: `@param {{ campo?: tipo, otro?: tipo }} x`. */
export const TYPE_LITERAL = /@param\s+\{([^}]*\{[^}]*\}[^}]*)\}/;
/** Mencion directa: `options.dragLanePx` dentro de la documentacion.
 *  Sin `p`: en prosa castellana "p. ej." documentaba un miembro fantasma (`ej`). */
export const DOC_MENTION = /\b(?:options|opts|config|handlers|hooks|spec|params)\s*\.\s*([A-Za-z_$][\w$]*)/g;

/** Miembros documentados -> la linea que los documenta. */
export function documentedMembers(source) {
  const members = new Map();

  for (const block of docBlocks(source)) {
    // Un `@param` puede partirse en varias lineas: la version juntada lo lee.
    const joined = block.text.replace(/\n\s*\*/g, ' ');

    for (const line of [...block.text.split('\n'), joined]) {
      const cell = NAMES_CELL.exec(line);
      const jsdoc = JSDOC_MEMBER.exec(line);
      const type = TYPE_LITERAL.exec(line);

      // Celda con varios nombres (`a / b  desc`) y bullets (`- hook(args)  desc`).
      // La prosa con cuentas o puntos y comas no es una lista de nombres.
      if (cell != null && !/[+;]/.test(cell[1])) {
        for (const raw of cell[1].replace(/^\s*-\s*/, '').split('/')) {
          const name = raw.trim().replace(/\(.*$/, '').replace(/:.*$/, '').trim();

          if (/^[A-Za-z_$][\w$]*$/.test(name) && !members.has(name))
            members.set(name, line.trim());
        }
      }

      if (jsdoc != null && !members.has(jsdoc[2]))
        members.set(jsdoc[2], line.trim());

      if (type != null) {
        for (const field of type[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\??\s*:/g)) {
          if (!members.has(field[1]))
            members.set(field[1], line.trim());
        }
      }

      for (const mention of line.matchAll(DOC_MENTION)) {
        if (!members.has(mention[1]))
          members.set(mention[1], line.trim());
      }
    }
  }

  return members;
}

/** Consultado = el nombre aparece al menos una vez en el codigo. */
export function memberIsConsulted(source, name) {
  return new RegExp(`\\b${name}\\b`).test(codeOnly(source));
}

/** Miembros documentados que el codigo no menciona. */
export function unusedMembers(source) {
  return [...documentedMembers(source).keys()].filter((name) => !memberIsConsulted(source, name));
}

/** Argumentos de los puntos de entrada: constructor(...) y `export function x(...)`. */
export function entryParameters(source) {
  const params = [];
  const call = /(?:constructor\s*\(|export\s+function\s+[A-Za-z_$][\w$]*\s*\()/g;
  let match = call.exec(source);

  while (match != null) {
    let depth = 1;
    let i = call.lastIndex;

    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
    }

    params.push(source.slice(call.lastIndex, i - 1));
    call.lastIndex = i;
    match = call.exec(source);
  }

  return params;
}

/** Claves desestructuradas en un patron de parametros, a cualquier profundidad. */
export function destructuredKeys(parameters) {
  const keys = [];

  // Cada entrada del array es el TEXTO de una lista de parametros (no un caracter).
  for (const pattern of parameters) {
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern[i] !== '{')
        continue;

      let depth = 0;
      let j = i;

      for (; j < pattern.length; j += 1) {
        if (pattern[j] === '{') depth += 1;
        else if (pattern[j] === '}') {
          depth -= 1;

          if (depth === 0)
            break;
        }
      }

      const inner = pattern.slice(i + 1, j);
      let nested = 0;

      for (let k = 0; k < inner.length; k += 1) {
        if (inner[k] === '{' || inner[k] === '[') nested += 1;
        else if (inner[k] === '}' || inner[k] === ']') nested -= 1;
        else if (nested === 0 && (inner[k] === ',' || k === 0)) {
          const start = inner[k] === ',' ? k + 1 : k;
          const rest = inner.slice(start);

          if (/^\s*[A-Za-z_$][\w$]*\s*:/.test(rest))
            continue;                     // objeto anidado, no una clave

          const name = /^\s*([A-Za-z_$][\w$]*)\s*(?:=|,|$)/.exec(rest);

          if (name != null)
            keys.push(name[1]);
        }
      }

      i = j;
    }
  }

  return keys;
}

/** Identificadores que son objeto de opciones: `x = {}` o nombre elocuente. */
export function optionIdentifiers(params) {
  const identifiers = new Set();

  for (const pattern of params) {
    for (const match of pattern.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=\s*\{\s*\}/g))
      identifiers.add(match[1]);

    for (const match of pattern.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?:=|,|$)/g)) {
      if (OPTION_IDENTIFIERS.test(match[1]))
        identifiers.add(match[1]);
    }
  }

  return identifiers;
}

/** Opciones que el codigo lee -> de donde salen (para el mensaje de fallo). */
export function optionReads(source) {
  const params = entryParameters(source);
  const reads = new Map();

  for (const identifier of optionIdentifiers(params)) {
    for (const match of source.matchAll(new RegExp(`\\b${identifier}\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'))) {
      if (!reads.has(match[1]))
        reads.set(match[1], `leído como ${identifier}.${match[1]}`);
    }
  }

  // `constructor(container, { tema = 'x' } = {})` tambien es leer la opcion.
  for (const key of destructuredKeys(params)) {
    if (!reads.has(key))
      reads.set(key, 'desestructurado en los parametros');
  }

  // Y `const { a, b } = options` en el cuerpo, lo mismo.
  for (const match of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*(?:this\.)?(?:options|config)\b/g)) {
    for (const part of match[1].split(',')) {
      const name = part.split('=')[0].trim();

      if (/^[A-Za-z_$][\w$]*$/.test(name) && !reads.has(name))
        reads.set(name, 'desestructurado del objeto de opciones');
    }
  }

  return reads;
}

/** Opciones leidas que no estan documentadas. */
export function undocumentedReads(source) {
  const documented = documentedMembers(source);

  return [...optionReads(source).keys()].filter((name) => !documented.has(name));
}

/** Marcador de que el fichero documenta un objeto de opciones (o sus parientes). */
export const documentsOptionsObject = (source) =>
  /@param\s+\{[^}]*\}\s+\[?\w*(options|params|handlers|hooks|spec|p)\b/.test(source);

/** Claves que `normalizeEntry` guarda en cada entrada (null si no hay normalizador). */
export function entryShapeKeys(source) {
  const start = source.indexOf('function normalizeEntry');

  if (start < 0)
    return null;

  const end = source.indexOf('\n}', start);
  const fn = source.slice(start, end < 0 ? source.length : end);
  const open = fn.indexOf('return {');

  if (open < 0)
    return [];

  let depth = 0;
  let close = -1;

  for (let i = open + 'return '.length; i < fn.length; i += 1) {
    if (fn[i] === '{') depth += 1;
    else if (fn[i] === '}') {
      depth -= 1;

      if (depth === 0) { close = i; break; }
    }
  }

  const literal = fn.slice(open, close < 0 ? fn.length : close + 1);
  const keys = [];
  let nested = 0;

  for (let i = 0; i < literal.length; i += 1) {
    if (literal[i] === '{') nested += 1;
    else if (literal[i] === '}') nested -= 1;
    else if (literal[i] === ':' && nested === 1) {
      const before = literal.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);

      if (before != null) keys.push(before[1]);
    }
  }

  return keys;
}

/** Una clave de entrada se LEE como `entry.clave` fuera del normalizador. */
export function entryKeyIsRead(source, key) {
  const start = source.indexOf('function normalizeEntry');
  const end = start < 0 ? -1 : source.indexOf('\n}', start);
  const rest = start < 0
    ? source
    : source.slice(0, start) + source.slice(end < 0 ? source.length : end);

  return new RegExp(`entry\\??\\.${key}\\b`).test(rest);
}

/** Claves registradas que nadie lee. */
export function unreadEntryKeys(source) {
  return (entryShapeKeys(source) ?? []).filter((key) => !entryKeyIsRead(source, key));
}

/* ---------------------------------------------------------------------------
 * Regla 4: los defaults que promete la documentacion
 * ------------------------------------------------------------------------- */

/** Literales normalizados de un texto: cadenas no vacias, numeros y booleanos.
 *  `''` y `null` quedan FUERA: son "sin valor" (`label ?? ''`, `onChange ?? null`),
 *  no un default que merezca una linea de documentacion. */
export const LITERAL_TOKEN = /'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|(\btrue\b|\bfalse\b)/g;

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
export function topLevelQuestion(expression) {
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
export function literalDefault(expression) {
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

/** `options.x ?? expr` / `options.x || expr` (y `this.options.x`). */
export const OPTION_FALLBACK = /\b(?:this\.)?(?:options|opts|config|handlers|hooks|spec|params)\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\?|\|\|)\s*/g;

/** `options.x !== undefined ? options.x : expr`. */
export const OPTION_TERNARY = /\b(?:this\.)?(?:options|opts|config|handlers|hooks|spec|params)\s*\.\s*([A-Za-z_$][\w$]*)\s*!==\s*undefined\s*\?[^:]*:\s*/g;

/** La expresion que empieza en `start`, respetando parentesis y ternarios. */
export function readExpression(text, start) {
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

/** Partes de un patron separadas por comas de primer nivel. */
export function topLevelParts(pattern) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (const char of pattern) {
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;

    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }

    current += char;
  }

  parts.push(current);

  return parts;
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

/** Defaults del destructuring: en la firma (`computeFit({ minScale = 0.25 })`) y
 *  en el cuerpo (`const { lines = 2 } = options`). */
export function destructuredDefaults(source) {
  const patterns = [...entryParameters(source)];

  for (const match of source.matchAll(/const\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;

    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;

        if (depth === 0) { close = i; break; }
      }
    }

    if (close < 0)
      continue;

    const tail = source.slice(close + 1, close + 60);

    if (/^\s*=\s*(?:this\.)?(?:options|opts|config)\b/.test(tail))
      patterns.push(source.slice(open, close + 1));
  }

  const defaults = [];

  for (const pattern of patterns) {
    for (const group of braceGroups(pattern)) {
      for (const part of topLevelParts(group)) {
        const named = /^\s*([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/.exec(part);

        if (named != null)
          defaults.push({ name: named[1], expression: named[2] });
      }
    }
  }

  return defaults;
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

  for (const match of code.matchAll(OPTION_FALLBACK))
    record(match[1], readExpression(code, match.index + match[0].length));

  for (const match of code.matchAll(OPTION_TERNARY))
    record(match[1], readExpression(code, match.index + match[0].length));

  for (const { name, expression } of destructuredDefaults(source))
    record(name, expression);

  return defaults;
}

/** Los nombres de miembro que documenta una linea: la celda de una lista, el
 *  `@param` de un miembro, los campos de un tipo inline y las menciones. */
export function docLineNames(line) {
  const names = [];
  const cell = NAMES_CELL.exec(line);

  if (cell != null && !/[+;]/.test(cell[1])) {
    for (const raw of cell[1].replace(/^\s*-\s*/, '').split('/')) {
      const name = raw.trim().replace(/\(.*$/, '').replace(/:.*$/, '').trim();

      if (/^[A-Za-z_$][\w$]*$/.test(name))
        names.push(name);
    }
  }

  const jsdoc = JSDOC_MEMBER.exec(line);
  const type = TYPE_LITERAL.exec(line);

  if (jsdoc != null)
    names.push(jsdoc[2]);

  if (type != null) {
    for (const field of type[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\??\s*:/g))
      names.push(field[1]);
  }

  for (const mention of line.matchAll(DOC_MENTION))
    names.push(mention[1]);

  return names;
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
      const names = docLineNames(line);

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

/** Lectura de una opcion: `options.x`, `this.options.x`, `spec.x`... */
export const OPTION_READ = /\b(?:this\.)?(?:options|opts|config|handlers|hooks|spec|params)\s*\.\s*([A-Za-z_$][\w$]*)/g;

/** Cuantas veces aparece `name` como palabra suelta en el codigo. */
export function countWord(code, name) {
  return [...code.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
}

/** Hay alguna aparicion de `name` fuera de [start, end)? */
export function mentionsOutside(code, name, start, end) {
  for (const match of code.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
    if (match.index < start || match.index >= end)
      return true;
  }

  return false;
}

/** Fin de la sentencia que empieza en `start` (`;` o `}` de primer nivel). */
export function statementEnd(source, start) {
  let depth = 0;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];

    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      if (depth === 0)
        return i;

      depth -= 1;
    } else if (char === ';' && depth === 0)
      return i;
  }

  return source.length;
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

/** Lecturas que solo se COPIAN a un hueco: hueco -> { name, used, span }.
 *  Las formas reconocidas son las dos del repo: el valor de una clave del objeto
 *  de opciones (`step: options.step ?? 1`) y la asignacion directa a un campo
 *  (`this.frameWidth = options.frameWidth || 18`). Cualquier otra lectura se
 *  considera consumo: un argumento, un spread (`...options.screen`) o una
 *  expresion. El hueco se da por usado si su nombre aparece fuera del tramo de
 *  la copia: la clave NO es leer la opcion. */
export function copiedOptions(source) {
  const code = codeOnly(source);
  const copies = new Map();

  for (const match of code.matchAll(OPTION_READ)) {
    const before = code.slice(0, match.index);
    const assignment = /this\.([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
    let slot = null;
    let span = null;

    if (assignment != null) {
      slot = assignment[1];

      const start = match.index - assignment[0].length;

      span = [start, statementEnd(code, start)];
    } else {
      const property = /(?:[,{]\s*|\n\s*)([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before);

      // Solo la convencion de registro (`clave: options.clave`, leida del
      // PARAMETRO) es un hueco. `totalFrames: this.options.frames` es un campo
      // derivado y una lectura de `this.options.x` ya es consumo, no copia.
      if (property != null && !/^this\./.test(match[0]) && property[1] === match[1]) {
        slot = property[1];
        span = enclosingLiteral(code, match.index);
      }
    }

    if (slot == null || span == null)
      continue;

    copies.set(slot, {
      name: match[1],
      used: mentionsOutside(code, slot, span[0], span[1]),
      span,
    });
  }

  return copies;
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

/** Pares apertura/cierre, para seguir el anidamiento de una expresion. */
export const CLOSER = { '(': ')', '{': '}', '[': ']' };

/** Indice justo despues de la cadena que abre en `start` (comillas o backtick). */
export function skipString(text, start) {
  const quote = text[start];
  let i = start + 1;

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }

    if (text[i] === quote)
      return i + 1;

    i += 1;
  }

  return text.length;
}

/** Indice del cierre que corresponde a la apertura en `start` (-1 si no cierra). */
export function closingIndex(text, start) {
  const stack = [CLOSER[text[start]]];
  let i = start + 1;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);

      if (i < 0)
        return -1;

      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i);

      if (i < 0)
        return -1;

      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }

    if (CLOSER[ch] != null)
      stack.push(CLOSER[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();

      if (stack.length === 0)
        return i;
    }

    i += 1;
  }

  return -1;
}

/** Comas de nivel 0 de un texto (respeta anidamiento, cadenas y comentarios). */
export function topLevelCommas(text) {
  const commas = [];
  let depth = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);

      if (i < 0)
        break;

      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i);

      if (i < 0)
        break;

      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[')
      depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']')
      depth -= 1;
    else if (ch === ',' && depth === 0)
      commas.push(i);

    i += 1;
  }

  return commas;
}

/** Trocea un texto por sus comas de nivel 0. */
export function splitTopLevel(text) {
  const parts = [];
  let from = 0;

  for (const cut of topLevelCommas(text)) {
    parts.push(text.slice(from, cut));
    from = cut + 1;
  }

  parts.push(text.slice(from));

  return parts;
}

/** Quita el canal ` * ` de cada linea: un objeto a varias lineas se parte por lineas
 *  y el canal se colaria como si fuera el principio de la clave. */
export function stripGutter(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\*(?!\/)\s?/, ''))
    .join('\n');
}

/** Una entrada de objeto literal: `{ key, text }`, donde `text` es el valor SOLO
 *  si es una cadena citada (una union `'a' | 'b'`, un numero o un objeto no lo son).
 *  Devuelve null para el spread y para la prosa que no es una entrada. */
export function objectEntry(entry) {
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

/** Entradas (clave y valor textual) del objeto de opciones de un `new Clase(...)`. */
export function optionEntriesOfArgs(args) {
  const parts = splitTopLevel(args);

  if (parts.length < 2)
    return [];                         // `new X(el)`: sin objeto de opciones

  const second = parts[1].trim();

  if (!second.startsWith('{'))
    return [];                         // el segundo argumento no es un objeto literal

  const close = closingIndex(second, 0);

  if (close < 0)
    return [];

  return splitTopLevel(stripGutter(second.slice(1, close)))
    .map(objectEntry)
    .filter((entry) => entry != null);
}

/** Claves del objeto de opciones (segundo argumento) de un `new Clase(...)`. */
export function optionKeysOfArgs(args) {
  return optionEntriesOfArgs(args).map(({ key }) => key);
}

/** Los `new Clase(...)` de un texto, con el texto de sus argumentos y las claves
 *  de su objeto de opciones. */
export function constructedWith(text) {
  const found = [];

  for (const match of text.matchAll(/\bnew\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(text, open);

    if (close < 0)
      continue;

    const args = text.slice(open + 1, close);
    const entries = optionEntriesOfArgs(args);

    found.push({ className: match[1], args, keys: entries.map(({ key }) => key), entries });
  }

  return found;
}

/** Los bloques de documentacion con rotulo `Usage:` (ahi se PROMETEN ejemplos). */
export function usageBlocks(source) {
  return docBlocks(source).filter((block) => /\bUsage\s*:/.test(block.text));
}

/** Todo `new Clase(...)` que muestra la documentacion: es un ejemplo de uso. */
export function exampleConstructions(source) {
  return docBlocks(source).flatMap((block) => constructedWith(block.text));
}

/** El modulo que EXPORTA esa clase —o la fabrica cuya API devuelve el ejemplo
 *  (`export function createY(...)`)—: resuelve ejemplos cross-module
 *  (index.js -> Knob) y el receptor `const lcd = createLcdScreen(el)` -> lcdScreen.js. */
export function moduleExporting(className, modules = MODULES) {
  const exported = new RegExp(`\\bexport\\s+(?:default\\s+)?class\\s+${className}\\b`);
  const byClass = modules.find(({ source }) => exported.test(source));

  if (byClass != null)
    return byClass;

  const factory = new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${className}\\s*\\(|\\bexport\\s+const\\s+${className}\\s*=`);

  return modules.find(({ source }) => factory.test(source));
}

/** Clases que un ejemplo `Usage:` construye y ningun modulo auditado exporta. */
export function unresolvedUsageClasses(source, modules = MODULES) {
  const unresolved = [];

  for (const block of usageBlocks(source)) {
    for (const { className } of constructedWith(block.text)) {
      if (moduleExporting(className, modules) == null && !unresolved.includes(className))
        unresolved.push(className);
    }
  }

  return unresolved;
}

/** Los ejemplos que resuelven a un modulo y traen claves: [{ className, module, keys }]. */
export function resolvedExampleOptions(source, modules = MODULES) {
  const resolved = [];

  for (const { className, keys } of exampleConstructions(source)) {
    const target = moduleExporting(className, modules);

    if (target != null && keys.length > 0)
      resolved.push({ className, module: target.label, keys });
  }

  return resolved;
}

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

/** Literales de CADENA de un texto: una lista de valores se escribe con comillas,
 *  asi que un numero o un booleano (`0..1`, `default false`) no la forman. */
export const STRING_TOKEN = /'([^']*)'|"([^"]*)"/g;

export function stringLiteralsOf(text) {
  const found = new Set();

  for (const match of text.matchAll(STRING_TOKEN)) {
    const token = match[1] ?? match[2];

    if (token !== '')
      found.add(token);
  }

  return found;
}

/** La lista de identificadores de opciones, como alternancia dentro de un regex. */
export const OPTION_NAMES = OPTION_IDENTIFIERS.source.replace(/^\^\(|\)\$$/g, '');

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

      for (const name of docLineNames(line)) {
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
export function optionExpressions(source) {
  const expressions = new Map();
  const add = (option, pattern) => {
    const patterns = expressions.get(option) ?? new Set();

    patterns.add(pattern);
    expressions.set(option, patterns);
  };

  for (const option of optionReads(source).keys())
    add(option, `(?:this\\.)?(?:${OPTION_NAMES})\\.${option}\\b`);

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

