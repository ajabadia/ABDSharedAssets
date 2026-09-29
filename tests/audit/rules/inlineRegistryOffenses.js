/**
 * Regla 12 — registros prometidos.
 *
 * toda clave prometida en un registro (@param, typedef o @returns) se usa en el código.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  cleanDocText,
  codeOnly,
  docBlocks,
  docParamTypes,
} from '../docs.js';

import {
  signatureParams,
} from '../options.js';

import {
  memberAccessPattern,
} from '../receptors.js';

import {
  functionInlineSignature,
  literalEntryRanges,
  readableType,
  recordFields,
  unbracketed,
} from '../records.js';

import {
  closingIndex,
  skipString,
} from '../scan.js';

import {
  splitTopLevel,
} from '../split.js';

/** Las CLAVES del INTERIOR de un literal de objeto (el texto entre sus llaves), sin
 *  resolver sus valores: `a, b: f(x), c() {}` -> Set { 'a', 'b', 'c' }. Es lo que la regla
 *  12 cruza contra un `@returns {{ ... }}`: lo que el callable RETORNA, sea un dato
 *  calculado, una funcion o un metodo. */
export function literalKeys(text) {
  const keys = new Set();

  for (const [from, to] of literalEntryRanges(text)) {
    // la entrada puede traer un comentario pegado por detras (`x /* px */,`): no es parte
    // de la clave
    const entry = text.slice(from, to)
      .replace(/\/\*[\s\S]*?\*\/\s*$/, '')
      .replace(/\/\/[^\n]*$/, '')
      .trim();
    const match = /^([A-Za-z_$][\w$]*)\s*\(/.exec(entry)
      ?? /^(?:get|set)\s+([A-Za-z_$][\w$]*)\s*\(/.exec(entry)
      ?? /^([A-Za-z_$][\w$]*)\s*:/.exec(entry)
      ?? /^([A-Za-z_$][\w$]*)\s*$/.exec(entry);

    if (match != null)
      keys.add(match[1]);
  }

  return keys;
}

/** El nombre que queda entre el final de un docblock y el `(` de la firma que
 *  documenta: constructor, metodo, `export function f`, getter... o nada. */
const NAME_BEFORE_CALL =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*?\*?\s*)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)$/;

/** La lista de parametros del callable que un docblock documenta (null si tras el
 *  bloque no hay ninguna firma: la prosa, o la clase a secas). */
function parametersAfter(source, blockEnd) {
  const rest = source.slice(blockEnd).replace(/^\s+/, '');
  const base = source.length - rest.length;
  const open = rest.indexOf('(');

  // el `.trim()`: la firma puede llevar espacio antes del parentesis
  // (`export function attachDrag (...)`, el estilo de este repo)
  if (open < 0 || !NAME_BEFORE_CALL.test(rest.slice(0, open).trim()))
    return null;

  const openAbs = base + open;
  const closeAbs = closingIndex(source, openAbs);

  if (closeAbs < 0)
    return null;

  return source.slice(openAbs + 1, closeAbs);
}

/** El PARAMETRO al que un `@param` de `position` promete, en la vista canonica de la
 *  firma: por NOMBRE cuando el bloque lo da y la firma lo declara, y por POSICION
 *  cuando no —un patron desmembrado no llega con nombre— o cuando el nombre no existe
 *  en la firma, que es el papel que le toca a la posicion.
 *
 *  El nombre va primero porque el indice solo es una CONVENCION: si el bloque lista sus
 *  `@param` en otro orden, o la firma declara el parametro con otro nombre, la
 *  posicion ataba al `@param` al parametro equivocado y las lecturas se comparaban
 *  contra el binding de otro. Sin parametro al que atar (una firma que no declara ahi,
 *  un `p primero` que no se puede leer) se devuelve null y la regla se calla, que es lo
 *  que hacia el `bindingAt` de antes. */
function boundParameter(declared, param, position) {
  const byName = param.name == null
    ? null
    : declared.find((one) => one.name === param.name);

  return byName ?? declared[position] ?? null;
}

/** Las claves FUENTE de un patron de desestructuracion: `{ a, b: c, d = 1 }` ->
 *  ['a', 'b', 'd'] — lo que la firma lee del objeto, renombrado o no. La version
 *  con locales (`destructuredKeys`) no sirve aqui: salta las entradas con
 *  renombre por confundirlas con objetos anidados. */
export function patternKeys(pattern) {
  const keys = new Set();
  const open = pattern.indexOf('{');
  const close = open < 0 ? -1 : closingIndex(pattern, open);

  if (open < 0 || close < 0)
    return keys;

  for (const part of splitTopLevel(pattern.slice(open + 1, close))) {
    const key = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(part);

    if (key != null)
      keys.add(key[1]);
  }

  return keys;
}

/** Las lecturas REALES del codigo de un objeto de opciones con nombre `name`:
 *  `x.prop`, `x?.prop`, y la desestructuracion en el cuerpo (`const { a, b } = x`;
 *  la del parametro ya la conto el patron de la firma). */
function readsOf(code, name) {
  const reads = new Set();

  for (const match of code.matchAll(memberAccessPattern(name)))
    reads.add(match[1]);

  for (const match of code.matchAll(
    new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:this\\.)?${name}\\b`, 'g'))) {
    for (const part of match[1].split(',')) {
      const key = part.split('=')[0].trim();

      if (/^[A-Za-z_$][\w$]*$/.test(key))
        reads.add(key);
    }
  }

  return reads;
}

/** Las claves que la documentacion PROMETE en un registro y el codigo NUNCA usa: la
 *  promesa que nadie consulta. Tres formas, todas registros:
 *    - el tipo inline de un `@param {{ x: number }} o`: cada clave tiene que LEERSE como
 *      `binding.clave` —o desestructurarse, renombre incluido— en el callable que el
 *      bloque documenta, ligada a la posicion del parametro en su firma;
 *    - el `@typedef` que ese `@param` nombra (`@param {Point} p`), con las mismas
 *      lecturas: la promesa puede vivir en otro bloque;
 *    - el `@returns {{ ... }}` de un callable: cada clave prometida tiene que estar
 *      entre las que el callable RETORNA (el objeto de un `return { ... }` o el de un
 *      `const api = { ... }` devuelto).
 *  La guardia de la regla 1 era debil a proposito (una mencion en la prosa bastaba para
 *  salvar a un miembro); esta es su version estricta. Se calla donde no puede saber —un
 *  binding ilegible (`...rest`), un acceso dinamico (`opts[clave]`), un `@returns
 *  {object}` a secas, un cuerpo que no se puede leer— y no juzga la prosa: de eso
 *  responden la 1 y la 2. */
export function inlineRegistryOffenses(source) {
  const code = codeOnly(source);
  const typedefs = typedefFields(source);
  const offenses = [];

  for (const block of docBlocks(source)) {
    const blockEnd = block.start + block.text.length + 2;

    // la promesa de un @returns: lo que el callable devuelve
    const promised = inlineReturnFields(block.text);

    if (promised != null && promised.length > 0) {
      const callable = callableBodyAfter(source, blockEnd);

      if (callable != null) {
        const returned = returnedKeys(source, callable.bodyOpen, callable.bodyClose);

        for (const { key } of promised)
          if (!returned.has(key))
            offenses.push(`${callable.name}.${key} (el @returns lo promete y el callable no lo retorna)`);
      }
    }

    const params = docParamTypes(block.text).filter(({ name, option }) => name != null && !option);
    const registries = params
      .map((param, position) => ({ param, position }))
      .filter(({ param }) => registryOf(param.type, typedefs) != null);

    if (registries.length === 0)
      continue;

    const signature = parametersAfter(source, blockEnd);

    if (signature == null)
      continue;

    const declared = signatureParams(signature);

    for (const { param, position } of registries) {
      const { fields, origin } = registryOf(param.type, typedefs);
      const bound = boundParameter(declared, param, position);

      if (bound == null)
        continue;

      const reads = bound.destructured
        ? patternKeys(bound.text)
        : bound.name == null ? [] : readsOf(code, bound.name);

      const shown = bound.destructured ? param.name : bound.name;

      for (const { key } of fields) {
        if (!reads.has(key))
          offenses.push(`${shown}.${key} (${origin} lo promete y el código no lo lee)`);
      }
    }
  }

  return offenses;
}

/** El callable que un docblock documenta, con su nombre y los indices de su cuerpo:
 *  { name, params, bodyOpen, bodyClose }, o null si tras el bloque no hay una firma con
 *  cuerpo de BLOQUE (prosa, la clase a secas, una flecha de expresion). Es
 *  `parametersAfter` mas el NOMBRE y el CUERPO, que la regla 12 necesita para leer lo
 *  que el callable RETORNA. */
export function callableBodyAfter(source, blockEnd) {
  const params = parametersAfter(source, blockEnd);

  if (params == null)
    return null;

  const rest = source.slice(blockEnd).replace(/^\s+/, '');
  const base = source.length - rest.length;
  const open = rest.indexOf('(');
  const name = NAME_BEFORE_CALL.exec(rest.slice(0, open).trim());
  const close = closingIndex(source, base + open);

  if (name == null || close < 0)
    return null;

  // cuerpo de BLOQUE: el `{` justo tras el parentesis (una funcion o un metodo) o tras
  // una flecha (`=> {`). Una flecha de EXPRESION (`=> ({ ... })`) no tiene cuerpo: se
  // calla en vez de leer a ciegas el primer objeto que aparezca.
  const head = /^\s*(?:=>\s*)?\{/.exec(source.slice(close + 1));

  if (head == null)
    return null;

  const bodyOpen = close + 1 + head[0].length - 1;
  const bodyClose = closingIndex(source, bodyOpen);

  return bodyClose < 0 ? null : { name: name[1], params, bodyOpen, bodyClose };
}

/** Las claves que el cuerpo de un callable RETORNA: las del objeto de cada `return {
 *  ... }` de nivel 0, y las del literal de un `const api = { ... }` que luego se
 *  devuelve (`return api`). Un `return { ... }` a mas profundidad es el retorno de OTRA
 *  funcion y no cuenta: se mide el cuerpo del callable, no el de sus inquilinos. */
export function returnedKeys(source, bodyOpen, bodyClose) {
  const keys = new Set();
  const locals = new Map();
  let depth = 0;
  let i = bodyOpen + 1;

  while (i < bodyClose) {
    const ch = source[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i);
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i);

      i = newline < 0 ? bodyClose : newline;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i);

      i = end < 0 ? bodyClose : end + 2;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      i += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      i += 1;
      continue;
    }

    if (depth === 0) {
      const rest = source.slice(i, bodyClose);
      const literal = /^return\s*\{/.exec(rest);

      if (literal != null) {
        const open = i + literal[0].length - 1;
        const close = closingIndex(source, open);

        if (close < 0)
          break;

        for (const key of literalKeys(source.slice(open + 1, close)))
          keys.add(key);

        i = close + 1;
        continue;
      }

      const bound = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/.exec(rest);

      if (bound != null) {
        const open = i + bound[0].length - 1;
        const close = closingIndex(source, open);

        if (close < 0)
          break;

        locals.set(bound[1], literalKeys(source.slice(open + 1, close)));
        i = close + 1;
        continue;
      }

      const named = /^return\s+([A-Za-z_$][\w$]*)\s*[;,\n)]/.exec(rest);

      if (named != null && locals.has(named[1]))
        for (const key of locals.get(named[1]))
          keys.add(key);
    }

    i += 1;
  }

  return keys;
}

/** Las claves que un bloque promete en un `@returns {{ ... }}`, o null. Solo la forma de
 *  REGISTRO inline dice claves: un `@returns {boolean}` o `{object}` no promete ninguna
 *  y no se juzga. */
export function inlineReturnFields(block) {
  const match = /@returns\s*\{/.exec(block);

  if (match == null)
    return null;

  const open = match.index + match[0].length - 1;
  const close = closingIndex(block, open);

  return close < 0 ? null : recordFields(cleanDocText(block.slice(open + 1, close)));
}

/** Los campos que un bloque promete con `@property {tipo} nombre`: [{ key, type,
 *  optional }]. Un `@property` cuyo tipo la regla no sabe leer (una union con
 *  `HTMLElement`) no se juzga: mismo limite honesto que el registro inline. */
export function propertyFields(block) {
  const fields = [];

  for (const match of block.matchAll(/@property\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(block, open);

    if (close < 0)
      continue;

    const type = cleanDocText(block.slice(open + 1, close));
    const tail = block.slice(close + 1);
    const name = /^\s+\[?([A-Za-z_$][\w$]*)\]?/.exec(tail);

    if (name == null || (!readableType(type) && functionInlineSignature(type) == null))
      continue;

    fields.push({ key: name[1], type, optional: /^\s*\[/.test(tail) });
  }

  return fields;
}

/** Los registros que declaran los `@typedef` del fuente: nombre -> campos prometidos, en
 *  las TRES formas de JSDoc: el tipo inline que ES el registro
 *  (`@typedef {{ x: number }} Point`), el nombre suelto (`@typedef Point`) y el `object` a
 *  secas con la promesa en los `@property` de debajo (`@typedef {object} Point` +
 *  `@property {number} x`), que es como lo escribe la gente. La tercera se leia antes
 *  como si fuera la primera —el inline no promete ninguna clave, y el bloque se
 *  descartaba en silencio—, asi que un `@typedef` de verdad no lo vigilaba nadie: se
 *  prometo el arreglo y lo que hacia falta era el testigo (un `@typedef` en el
 *  inventario). Solo se guarda lo que la regla sabe leer; un typedef sin campos legibles
 *  no se juzga. */
export function typedefFields(source) {
  const typedefs = new Map();

  for (const block of docBlocks(source)) {
    const tagged = /@typedef\s*\{/.exec(block.text);
    const bare = /@typedef\s+([A-Za-z_$][\w$]*)/.exec(block.text);
    let name = null;
    let inline = null;

    if (tagged != null) {
      const open = tagged.index + tagged[0].length - 1;
      const close = closingIndex(block.text, open);

      if (close >= 0) {
        name = /^\s+([A-Za-z_$][\w$]*)/.exec(block.text.slice(close + 1))?.[1] ?? null;
        inline = recordFields(cleanDocText(block.text.slice(open + 1, close))) ?? [];
      }
    } else if (bare != null)
      name = bare[1];

    if (name == null)
      continue;

    // el inline manda solo si promete algo: si no, la promesa esta en los `@property`
    const fields = inline != null && inline.length > 0 ? inline : propertyFields(block.text);

    if (fields.length > 0)
      typedefs.set(name, fields);
  }

  return typedefs;
}

/** El registro que promete el tipo de un `@param`: el INLINE (`{{ x: number }}`) o el que
 *  NOMBRA un `@typedef` del fuente. Devuelve { fields, origin } —`origin` es la frase de
 *  la promesa para el mensaje— o null si el tipo no promete un registro legible (un
 *  `object` a secas, una union, un nombre que nadie declaro). */
export function registryOf(type, typedefs = new Map()) {
  const inline = recordFields(type);

  if (inline != null && inline.length > 0)
    return { fields: inline, origin: 'el registro inline' };

  const named = typedefs.get(unbracketed(type));

  return named != null && named.length > 0
    ? { fields: named, origin: 'el @typedef' }
    : null;
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const inlineRegistryOffensesRule = {
  number: 12,
  detector: inlineRegistryOffenses,
  title: 'registros prometidos',
  assertion: 'toda clave prometida en un registro (@param, typedef o @returns) se usa en el código',
  about: 'Cada clave prometida en un registro —el tipo inline de un `@param`, un ' +
    '`@typedef` o el `@returns {{ ... }}` de un callable— tiene que usarse de ' +
    'verdad en el código.',
  limit: 'se calla donde no puede saber (binding ilegible, un `...resto`, un acceso ' +
    '`opts[clave]`, un cuerpo ilegible) y no juzga la prosa: de eso responden la ' +
    '1 y la 2',
  edge: 5,
  recipe: {
    module: 'drag-core.js',
    cited: ['handlers.zzzGhost (el registro inline lo promete y el código no lo lee)'],
    about: 'promete una clave en el tipo inline de un parametro y el detector la '
      + 'cruza con las lecturas reales del bloque',
    limit: 'la variacion valida promete otra clave que si se lee, con lo que el caso '
      + 'no prueba que el registro se recorra entero y no solo su primera forma',
    mutate: (source) => source.replace('onStep?: function(number): number }} handlers',
      'onStep?: function(number): number, zzzGhost?: number }} handlers'),
    safe: (source) => source.replace('onStep?: function(number): number }} handlers',
      'onStep?: function(number): number, onValue?: function(number): void }} handlers'),
  },
};
