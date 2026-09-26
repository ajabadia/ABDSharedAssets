/**
 * Familia de RECEPTORES: los metodos que los ejemplos llaman y construyen (regla 8),
 * su aridad (9), el tipo de sus argumentos (10) con su guardia de firmas, y la forma
 * de sus accesos (11) — receptor atado, alias, encadenado y opcional.
 *
 * Generado al partir tests/audit/detectors.js: el barrel (`./detectors.js`) vuelve a
 * exponer todo, asi que los consumidores no cambian.
 */

import {
  MODULES,
} from './modules.js';

import {
  CLOSER,
  closingIndex,
  docBlocks,
  exampleConstructions,
  moduleExporting,
  skipString,
  splitTopLevel,
} from './rules1to7.js';

/* ---------------------------------------------------------------------------
 * Detectores de la regla 8: los metodos de los ejemplos
 * ------------------------------------------------------------------------- */

/** Variables que un bloque de documentacion ata a un `new Clase(...)`: el receptor
 *  ATADO, directo (`const x = new X(...)`) o por ALIAS dentro del mismo bloque
 *  (`const y = x;` sigue a `x`). Las reglas 8/9/10 siguen ademas el receptor
 *  encadenado (`new X().m()`) con `chainedMethodCalls`; este detector solo ve el que
 *  tiene nombre. */
export function exampleBindings(text) {
  const bindings = [];

  for (const match of text.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new\s+([A-Za-z_$][\w$]*)\s*\(|([A-Za-z_$][\w$]*)\b)/g))
    bindings.push({ variable: match[1], className: match[2] ?? match[3], at: match.index });

  // Un alias apunta a una VARIABLE, no a la clase: `const pad2 = pad;` tiene que
  // resolver a `Pad`, o las reglas 8/9/10 buscarian la clase `pad` (que nadie exporta)
  // y saltarian la llamada EN SILENCIO. Se resuelve en cadena hasta que ya no cambia.
  const byName = new Map(bindings.map((b) => [b.variable, b]));

  for (let round = 0; round < bindings.length; round += 1) {
    let changed = false;

    for (const b of bindings) {
      const source = byName.get(b.className);

      if (source != null && source !== b && source.className !== b.className) {
        b.className = source.className;
        changed = true;
      }
    }

    if (!changed)
      break;
  }

  return bindings;
}

/** La reasignacion de una variable (`y = other`) que NO es su declaracion
 *  (`const y = ...`): el punto donde un alias deja de senalar al mismo objeto. */
export const reassignmentOf = (variable) =>
  new RegExp(`(?<!\\b(?:const|let|var)\\s+)\\b${variable}\\s*=[^=]`);

/** Metodos que un ejemplo LLAMA sobre el objeto que el MISMO bloque construye, atado a
 *  una variable (`const pad = new XYPad(el)` y luego `pad.setCorners(...)`) o encadenado
 *  sin atarlo (`new XYPad(el).setCorners(...)`): [{ className, variable, method, args }]
 *  — `variable` es null en el encadenado —, donde `args` es el texto de los argumentos
 *  que la llamada le pasa (lo que mide la regla 9). Cuenta tambien los que el ejemplo
 *  trae comentados con `//`: el docblock entero ya es un comentario, asi que el metodo
 *  prometido y comentado es la misma promesa que el que no lo esta. */
export function exampleMethodCalls(source) {
  const calls = [];

  for (const block of docBlocks(source)) {
    for (const { variable, className, at } of exampleBindings(block.text)) {
      const receiver = new RegExp(`\\b${variable}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(`, 'g');

      for (const match of block.text.matchAll(receiver)) {
        // Un alias REASIGNADO a otro objeto deja de ser el receptor: el track se corta
        // ahi, para no prestarle a otro objeto las llamadas de este.
        if (reassignmentOf(variable).test(block.text.slice(at, match.index)))
          continue;

        if (match.index <= at)
          continue;

        const open = match.index + match[0].length - 1;
        const close = closingIndex(block.text, open);

        calls.push({
          className,
          variable,
          method: match[1],
          args: close < 0 ? '' : block.text.slice(open + 1, close).replace(/\s+/g, ' ').trim(),
        });
      }
    }

    for (const call of chainedMethodCalls(block.text))
      calls.push(call);
  }

  return calls;
}

/** El indice del cuerpo de la clase que un modulo exporta (justo tras su `{`), o -1:
 *  para llevar un miembro del cuerpo a su sitio en la fuente y buscar ahi su JSDoc. */
export function classBodyStart(source, className) {
  const declaration = new RegExp(`\\bexport\\s+(?:default\\s+)?class\\s+${className}\\b`).exec(source);

  if (declaration == null)
    return -1;

  const open = source.indexOf('{', declaration.index + declaration[0].length);

  return open < 0 ? -1 : open + 1;
}

/** El cuerpo de la clase que un modulo exporta (null si no la declara asi). */
export function classBody(source, className) {
  const open = classBodyStart(source, className);

  if (open < 0)
    return null;

  const close = closingIndex(source, open - 1);

  return close < 0 ? null : source.slice(open, close);
}

/** Profundidad de anidamiento en `index`, saltando cadenas y comentarios: un miembro
 *  de la clase esta a 0 y todo lo que vive dentro de un cuerpo a 1 o mas, que es lo
 *  que separa una DECLARACION de una llamada. */
export function depthAt(text, index) {
  let depth = 0;
  let i = 0;

  while (i < index) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);

      i = newline < 0 ? text.length : newline;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i);

      i = end < 0 ? text.length : end + 2;
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

    i += 1;
  }

  return Math.max(0, depth);
}

/** El texto sin comentarios: cada comentario se sustituye por espacios CONSERVANDO
 *  los saltos de linea, para que los indices no se muevan. Hace falta porque entre
 *  dos miembros de una clase casi siempre hay un bloque de documentacion, y con el
 *  en medio el ancla de la declaracion no casa: el segundo miembro se perderia. */
export function withoutComments(text) {
  const chars = text.split('');
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      const end = newline < 0 ? text.length : newline;

      for (let j = i; j < end; j += 1)
        chars[j] = ' ';

      i = end;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i);
      const end = close < 0 ? text.length : close + 2;

      for (let j = i; j < end; j += 1) {
        if (text[j] !== '\n')
          chars[j] = ' ';
      }

      i = end;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }

    i += 1;
  }

  return chars.join('');
}

/** Ancla de la DECLARACION de un miembro: el nombre antes del `(` de un metodo o
 *  del `=` de un campo, al principio del cuerpo o tras el cierre anterior. Compartida
 *  por la regla 8 (que miembros hay) y la 9 (cuantos argumentos aceptan). */
export const CLASS_MEMBER = /(?:^|[{};])\s*(?:(?:async|static|get|set)\s+|\*\s*)*#?([A-Za-z_$][\w$]*)\s*(?=[(=])/g;

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

/** Los argumentos de un texto de llamada, troceados por sus comas de nivel 0: el
 *  `{ x: 0.2, y: 0.8 }` de un `setValue` es UNO, y `['a', '', 'b', '']` tambien. */
export function argumentList(text) {
  if (text.trim() === '')
    return [];

  const args = splitTopLevel(text);

  // una coma final (`f(a,)`) no es un argumento mas
  if (args.length > 1 && args[args.length - 1].trim() === '')
    args.pop();

  return args.map((arg) => arg.trim());
}

/** Cuantos argumentos pasa una llamada. */
export const argumentCount = (text) => argumentList(text).length;

/** El `=` de nivel 0 que declara un default (`notify = true`), o -1. Los anidados no
 *  cuentan: un parametro desestructurado sin default (`{ x, y }`, cuyo `=` vive
 *  dentro de las llaves) sigue siendo OBLIGATORIO, porque el objeto hay que pasarlo. */
export function defaultEqualsAt(param) {
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
export function signatureOf(params) {
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

/** Los parametros que un miembro declara justo despues de su nombre (-1 si no declara
 *  ninguno): el parentesis de un metodo (`setValue (v) {`) o el de la funcion que
 *  guarda un campo (`destroy = () => {`, `onDrag = function (e) {`). */
export function declaredParams(body, at, name) {
  let i = at + name.length;

  while (i < body.length && /\s/.test(body[i]))
    i += 1;

  if (body[i] === '=') {
    i += 1;

    while (i < body.length && /\s/.test(body[i]))
      i += 1;

    if (body[i] !== '(') {
      // `campo = e => ...`: un unico parametro sin parentesis. Se exige la flecha
      // antes del final de la declaracion para no leer el parentesis de una llamada.
      const arrow = body.indexOf('=>', i);
      const end = body.indexOf(';', i);
      const limit = end < 0 ? body.length : end;

      return arrow >= 0 && arrow < limit ? 'x' : -1;
    }
  }

  if (body[i] !== '(')
    return -1;

  const close = closingIndex(body, i);

  return close < 0 ? -1 : body.slice(i + 1, close);
}

/** La palabra ENTERA que precede al nombre de un miembro (`get`, `set`, `static`,
 *  `async`), o cadena vacia. Se lee como palabra y no como prefijo, que es lo que
 *  distingue un accessor (`get value()`) de un metodo que empieza igual
 *  (`getValue()`): lo segundo es un nombre, no un `get`. */
export function modifierBefore(code, at) {
  let i = at - 1;

  while (i >= 0 && /\s/.test(code[i]))
    i -= 1;

  const end = i + 1;

  while (i >= 0 && /[\w$]/.test(code[i]))
    i -= 1;

  return code.slice(i + 1, end);
}

/** La FORMA en que un miembro se declara: 'get', 'set', 'method' (una funcion, o un
 *  campo que guarda una) o 'field' (un dato). */
export function memberForm(modifier, params) {
  if (modifier === 'get' || modifier === 'set')
    return modifier;

  return params === -1 ? 'field' : 'method';
}

/** La API que una FACTORIA devuelve: nombre -> { at, forms, params }, con la misma
 *  forma que `memberDeclarations`, para que las reglas 8-11 juzguen los metodos de
 *  `const x = createY(...)` contra lo que la fabrica retorna. Los miembros se leen del
 *  objeto devuelto (el literal de un `return { ... }`, directo o via `const api =`),
 *  resolviendo cada entrada: un metodo con cuerpo en el propio literal se lee ahi; una
 *  `clave: identificador` y una propiedad abreviada se resuelven a su declaracion
 *  local (funcion -> metodo, dato -> campo). `at` apunta a donde vive el JSDoc del
 *  miembro (su declaracion local, o su entrada dentro del literal), que es lo que lee
 *  la regla 10. Si la fabrica no existe o su retorno no es un objeto literal legible,
 *  devuelve null: sin API visible no hay nada que juzgar. */
export function factoryApiMembers(source, factoryName) {
  const factory = new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${factoryName}\\s*\\(`).exec(source)
    ?? new RegExp(`\\bexport\\s+const\\s+${factoryName}\\s*=`).exec(source);

  if (factory == null)
    return null;

  // la fabrica puede desestructurar sus parametros (`createDrawer({ id })`): se cierra
  // ESA llave primero, para no confundirla con el cuerpo
  let searchFrom = factory.index + factory[0].length;

  if (source[searchFrom - 1] === '(') {
    const pClose = closingIndex(source, searchFrom - 1);

    if (pClose < 0)
      return null;

    searchFrom = pClose + 1;
  }

  const bodyOpen = source.indexOf('{', searchFrom);
  const bodyClose = bodyOpen < 0 ? -1 : closingIndex(source, bodyOpen);

  if (bodyClose < 0)
    return null;

  const body = source.slice(bodyOpen, bodyClose);
  const ret = /\breturn\s*\{/.exec(body) ?? /\bconst\s+api\s*=\s*\{/.exec(body);

  if (ret == null)
    return null;

  const literalOpen = bodyOpen + ret.index + ret[0].length - 1;
  const literalClose = closingIndex(source, literalOpen);

  if (literalClose < 0)
    return null;

  const inner = source.slice(literalOpen + 1, literalClose);

  /** La declaracion local de `name` dentro de la fabrica (null si no hay tal cosa):
   *  `function name(` es un metodo, `const name = (…) =>` tambien, `const name = dato`
   *  es un campo. */
  const localOf = (name) => {
    const fn = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(body);

    if (fn != null) {
      const pOpen = body.indexOf('(', fn.index + fn[0].length - 1);
      const pClose = pOpen < 0 ? -1 : closingIndex(body, pOpen);

      return {
        at: bodyOpen + fn.index,
        method: true,
        params: pClose < 0 ? '' : body.slice(pOpen + 1, pClose),
      };
    }

    const binding = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(body);

    if (binding == null)
      return null;

    const valueAt = binding.index + binding[0].length;
    const value = body.slice(valueAt, valueAt + 120);

    if (/^\s*(?:async\s+)?function\b/.test(value)
      || /^\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(value)) {
      const pOpen = body.indexOf('(', valueAt);
      const pClose = pOpen < 0 ? -1 : closingIndex(body, pOpen);

      return { at: bodyOpen + valueAt, method: true, params: pClose < 0 ? '' : body.slice(pOpen + 1, pClose) };
    }

    return { at: bodyOpen + valueAt, method: false, params: -1 };
  };

  const members = new Map();
  const adopt = (name, at, form, params) => {
    const current = members.get(name);

    if (current == null)
      members.set(name, { at, forms: new Set([form]), params });
    else
      current.forms.add(form);
  };

  // las entradas del literal, cortadas por sus comas de nivel 0 sin partirse dentro
  // de cadenas, llamadas, literales anidados ni comentarios (el JSDoc de un metodo
  // vive DENTRO del literal, y trae comas propias)
  let depth = 0;
  let start = -1;
  const entries = [];

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];

    if (ch === '/' && inner[i + 1] === '/') {
      const newline = inner.indexOf('\n', i);

      if (newline < 0)
        break;

      i = newline;
      continue;
    }

    if (ch === '/' && inner[i + 1] === '*') {
      const end = inner.indexOf('*/', i);

      if (end < 0)
        break;

      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(inner, i) - 1;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[')
      depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']')
      depth -= 1;
    else if (ch === ',' && depth === 0) {
      if (start >= 0)
        entries.push([start, i]);

      start = -1;
      continue;
    }

    if (start < 0 && !/\s/.test(ch))
      start = i;
  }

  if (start >= 0)
    entries.push([start, inner.length]);

  for (const [from, to] of entries) {
    const entry = inner.slice(from, to).trim();

    if (entry === '')
      continue;

    const base = literalOpen + 1 + from;

    // metodo con cuerpo en el propio literal: `setHeader({ ... } = {}) {`, `destroy() {`
    let match = /^([A-Za-z_$][\w$]*)\s*\(/.exec(entry);

    if (match != null) {
      const pOpen = base + entry.indexOf('(');
      const pClose = closingIndex(source, pOpen);

      adopt(match[1], base, 'method', pClose < 0 ? '' : source.slice(pOpen + 1, pClose));
      continue;
    }

    // getter / setter del literal (ninguna fabrica del repo los usa hoy; se reservan)
    match = /^(get|set)\s+([A-Za-z_$][\w$]*)\s*\(/.exec(entry);

    if (match != null) {
      adopt(match[2], base, match[1], '');
      continue;
    }

    // `clave: valor` — identificador que resuelve a su local, o funcion/arrow en sitio
    match = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/.exec(entry);

    if (match != null) {
      const value = match[2].trim();

      if (/^[A-Za-z_$][\w$]*$/.test(value)) {
        const local = localOf(value);

        if (local != null)
          adopt(match[1], local.at, local.method ? 'method' : 'field', local.params);

        continue;
      }

      if (/^(?:async\s+)?function\b/.test(value)
        || /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(value)) {
        const open = source.indexOf('(', base + entry.indexOf(':'));
        const close = open < 0 ? -1 : closingIndex(source, open);

        adopt(match[1], base, 'method', close < 0 ? '' : source.slice(open + 1, close));
      }

      continue;
    }

    // propiedad abreviada: `root, setLine, ...` -> su declaracion local
    match = /^([A-Za-z_$][\w$]*)$/.exec(entry);

    if (match != null) {
      const local = localOf(match[1]);

      if (local != null)
        adopt(match[1], local.at, local.method ? 'method' : 'field', local.params);
    }
  }

  return members;
}

/** Los miembros DECLARADOS por la clase: nombre -> { at, forms, params }, con el indice
 *  ABSOLUTO de la declaracion (para encontrar el JSDoc que la documenta, que lee la
 *  regla 10), las formas en que se declara (lo que lee la 11) y el texto de sus
 *  parametros. Un `get x()` y un `set x(v)` conviven en el mismo juego de formas: eso
 *  es un accessor completo, que se lee y se escribe. La 9 usa solo los `method`, que
 *  son los unicos llamables. */
export function memberDeclarations(source, className) {
  const body = classBody(source, className);
  const base = classBodyStart(source, className);
  const declarations = new Map();

  if (body == null || base < 0)
    return factoryApiMembers(source, className) ?? declarations;

  const code = withoutComments(body);

  for (const match of code.matchAll(CLASS_MEMBER)) {
    const at = match.index + match[0].lastIndexOf(match[1]);

    if (depthAt(code, at) !== 0)
      continue;

    const params = declaredParams(code, at, match[1]);
    const form = memberForm(modifierBefore(code, at), params);
    const current = declarations.get(match[1]);

    // del mismo nombre se guarda la PRIMERA declaracion: es la que lleva el JSDoc
    if (current == null)
      declarations.set(match[1], { at: base + at, forms: new Set([form]), params });
    else
      current.forms.add(form);
  }

  return declarations;
}

/** La firma de cada miembro declarado: nombre -> { required, total, rest }. Solo los
 *  `method` tienen firma: un getter, un setter y un campo no son llamables, y la regla
 *  8 tampoco los da por llamables. */
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

/** Las listas de argumentos que un ejemplo pasa, con la etiqueta de a quien:
 *  [{ className, member, label, args }] — los metodos que llama sobre el receptor que
 *  el bloque construye (atado o encadenado) y el `new Clase(...)` con el que construye.
 *  Es el inventario de argumentos que comparten la regla 9 (aridad) y la 10 (tipos). */
export function exampleCallsWithLabels(source) {
  const calls = [];

  for (const { className, method, args } of exampleMethodCalls(source))
    calls.push({ className, member: method, label: `${className}.${method}()`, args });

  for (const { className, args } of exampleConstructions(source))
    calls.push({ className, member: 'constructor', label: `new ${className}()`, args });

  return calls;
}

/** Anota el fallo de aridad de una llamada, si su firma declarada lo delata. Una
 *  firma que no existe se salta: del metodo que la clase no declara ya se encarga la
 *  regla 8, y las dos reglas se reparten el fallo en vez de contarlo dos veces. */
export function offArity(off, label, signature, args) {
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

/* ---------------------------------------------------------------------------
 * Detectores de la regla 10: el tipo de los argumentos
 * ------------------------------------------------------------------------- */

/** El bloque de documentacion que precede a `index` (null si no hay ninguno justo
 *  ahi). Entre el bloque y el codigo solo puede haber espacios, o —para el
 *  `constructor`, que en este repo se documenta encima del `export class`— la
 *  cabecera de la clase. Ese peaje es lo que impide que un miembro sin doc propio
 *  herede el JSDoc del miembro anterior. */
export function docBlockBefore(source, index, allowClass = false) {
  const end = source.lastIndexOf('*/', index - 1);

  if (end < 0)
    return null;

  const gap = source.slice(end + 2, index).trim();

  if (gap !== '' && !(allowClass && /^export\s+(?:default\s+)?class\s+[A-Za-z_$][\w$]*\s*\{\s*$/.test(gap)))
    return null;

  const start = source.lastIndexOf('/**', end);

  return start < 0 ? null : source.slice(start, end + 2);
}

/** Los `@param` de un bloque, en orden: [{ type, name, option }]. El tipo se lee con
 *  su anidamiento (`{{ x?: number }}` cierra en SU llave, no en la primera), y `option`
 *  marca las claves de un objeto de opciones (`options.step`): no son parametros de la
 *  llamada y no pueden desplazar la cuenta. */
export function docParamTypes(block) {
  const params = [];

  for (const match of block.matchAll(/@param\s+\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(block, open);

    if (close < 0)
      continue;

    const name = /^\s+\[?([A-Za-z_$][\w$]*)(\.[\w$]+)?/.exec(block.slice(close + 1));

    params.push({
      type: block.slice(open + 1, close).replace(/\s+/g, ' ').trim(),
      name: name == null ? null : name[1],
      option: name != null && name[2] != null,
    });
  }

  return params;
}

/** Los tipos que la documentacion promete para los parametros de un miembro, en ORDEN
 *  de firma: [{ type }], sin las claves del objeto de opciones. Un miembro sin JSDoc,
 *  o con uno que solo lleva prosa, no promete nada (null). */
export function documentedParamTypes(source, className, member) {
  const declaration = memberDeclarations(source, className).get(member);

  if (declaration == null)
    return null;

  const block = docBlockBefore(source, declaration.at, member === 'constructor');

  if (block == null)
    return null;

  const params = docParamTypes(block).filter(({ name, option }) => name != null && !option);

  return params.length === 0 ? null : params.map(({ type }) => ({ type }));
}

/** La familia de un tipo declarado que la regla SABE leer. Lo que no este aqui
 *  (`HTMLElement`, un generico) no se juzga; un objeto inline se lee como `object`
 *  (ver `isRecordType`). */
export const FAMILY = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  array: 'array',
  Array: 'array',
  function: 'function',
  Function: 'function',
  null: 'null',
  '*': '*',
};

/** El tipo sin sus llaves exteriores (`{object}` -> `object`). */
export const unbracketed = (type) => type.trim().replace(/^\{|\}$/g, '').trim();

/** Un tipo objeto INLINE, la forma con que JSDoc documenta un parametro destructured:
 *  `{{ x: number, y: number }}` llega aqui como `{ x: number, y: number }` (la llave
 *  EXTERIOR envuelve TODO el tipo). `{object}` NO es un registro: eso es un tipo simple
 *  entre llaves, y lo lee `unbracketed`. */
export function isRecordType(type) {
  const text = type.trim();

  if (!text.startsWith('{') || closingIndex(text, 0) !== text.length - 1)
    return false;

  const inner = text.slice(1, -1).trim();

  return !/^[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*$/.test(inner)
    || !inner.split('|').every((alternative) => FAMILY[alternative.trim()] != null);
}

/** Si el tipo prometido se lee ENTERO: `{string}`, `{number|string}` y un objeto
 *  inline (`{ x: number, y: number }`). Con una alternativa ilegible en la union
 *  (`{HTMLElement|string}`) no se juzga, porque el argumento podria ser justo ese. */
export function readableType(type) {
  if (isRecordType(type))
    return true;

  const bare = unbracketed(type);

  return /^[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*$/.test(bare)
    && bare.split('|').every((alternative) => FAMILY[alternative.trim()] != null);
}

/** La familia de un argumento por su FORMA: se juzga lo que el texto dice. Un
 *  identificador, una llamada, un miembro o una operacion son `unknown`: no se puede
 *  jurar su tipo, asi que no se juzgan. */
export function argumentType(text) {
  const arg = text.trim();

  if (/^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg) || /^`[^`$]*`$/.test(arg))
    return 'string';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(arg))
    return 'number';
  if (arg === 'true' || arg === 'false')
    return 'boolean';
  if (arg === 'null')
    return 'null';
  if (arg.startsWith('{'))
    return 'object';
  if (arg.startsWith('['))
    return 'array';
  if (/^(?:async\s+)?(?:function\b|\([^()]*\)\s*=>)/.test(arg)
    || /^(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(arg))
    return 'function';

  return 'unknown';
}

/** Si el tipo prometido admite un argumento de esa familia. `*` admite cualquiera,
 *  y un objeto inline admite `object`. */
export function acceptsArgument(type, kind) {
  if (isRecordType(type))
    return kind === 'object';

  return unbracketed(type).split('|').some((alternative) => {
    const family = FAMILY[alternative.trim()];

    return family === kind || family === '*';
  });
}

/** El par `clave: valor` de UNA parte de un objeto o de un tipo inline
 *  (`x?: number`, `x: 0.2`): { key, value, optional }, o null en un spread, un
 *  shorthand o una entrada sin los dos puntos. Es el parser comun de
 *  `recordFields` (tipos) y `exampleObjectEntries` (ejemplos), para que los dos
 *  lados de la validacion por campos no puedan discrepar al leer. */
export function keyValueOf(part) {
  const match = /^([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]+)$/.exec(part.trim());

  if (match == null)
    return null;

  return { key: match[1], value: match[2].trim(), optional: /\?\s*:/.test(part) };
}

/** Los CAMPOS que un tipo objeto inline promete: `{{ x?: number }}` -> [{ key, type,
 *  optional }], o null si el tipo no es un registro legible. Un campo cuyo tipo no se
 *  lee (una union con `HTMLElement`, un generico) no se juzga: ahi la regla sigue
 *  siendo estrecha a proposito. */
export function recordFields(type) {
  if (!isRecordType(type))
    return null;

  // la llave que abre el REGISTRO es la ultima del prefijo `{{` (el JSDoc llega con
  // las dos: la exterior envuelve el tipo y la interior abre el registro)
  const open = type.lastIndexOf('{', type.length - 2);
  const close = closingIndex(type, open);

  if (open < 0 || close < 0 || close !== type.length - 1)
    return null;

  const fields = [];

  for (const part of splitTopLevel(type.slice(open + 1, close))) {
    const pair = keyValueOf(part);

    if (pair == null)
      continue;                       // spread o entrada sin valor: no se juzga

    if (!readableType(pair.value))
      continue;                       // un campo con tipo ilegible no se juzga

    fields.push({ key: pair.key, type: pair.value, optional: pair.optional });
  }

  return fields;
}

/** Las entradas clave -> texto de UN objeto escrito en el ejemplo: `{ x: 0.2, y: true }`
 *  -> [{ key: 'x', text: '0.2' }, ...]. El shorthand (`{ x, y }`) no dice nada del
 *  valor y no se juzga campo a campo. */
export function exampleObjectEntries(text) {
  const arg = text.trim();

  if (!arg.startsWith('{'))
    return [];

  const close = closingIndex(arg, 0);

  if (close !== arg.length - 1)
    return [];

  const entries = [];

  for (const part of splitTopLevel(arg.slice(1, close))) {
    const pair = keyValueOf(part);

    if (pair != null)
      entries.push({ key: pair.key, text: pair.value });
  }

  return entries;
}

/** Los fallos por CAMPO de un argumento objeto contra su tipo inline: clave de mas
 *  (fuera del registro), familia equivocada en una clave prometida. Reutiliza las
 *  mismas piezas que la regla por argumento; los mensajes se distinguen por su
 *  prefijo `clave x.y`. */
export function recordFieldErrors(label, type, arg) {
  const fields = recordFields(type);
  const given = exampleObjectEntries(arg);

  if (fields == null || given.length === 0)
    return [];

  const off = [];
  const promised = new Map(fields.map((field) => [field.key, field]));

  for (const { key, text } of given) {
    const field = promised.get(key);

    if (field == null) {
      off.push(`${label}: la clave x.${key} no esta en la firma promete ${type}`);
      continue;
    }

    const kind = argumentType(text);

    if (kind !== 'unknown' && !acceptsArgument(field.type, kind))
      off.push(`${label}: la clave x.${key} es ${kind} y la firma promete ${field.type}`);
  }

  return off;
}

/** Los cruces que la regla 10 SI puede juzgar: [{ label, param, type, kind }], un
 *  argumento de ejemplo contra el tipo prometido de su parametro. Solo entran los dos
 *  lados legibles: un tipo que se lee entero y un argumento cuya forma lo delata. Es
 *  la cobertura de la regla. */
export function comparedExampleArguments(source, modules = MODULES) {
  const pairs = [];

  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    const params = documentedParamTypes(target.source, className, member);

    if (params == null)
      continue;

    argumentList(args).forEach((arg, i) => {
      const param = params[i];

      if (param == null)
        return;

      const kind = argumentType(arg);

      if (kind !== 'unknown' && readableType(param.type))
        pairs.push({ label, param: i + 1, type: param.type, kind });
    });
  }

  return pairs;
}

/** Argumentos de ejemplo que el tipo prometido NO admite: un objeto donde la
 *  documentacion promete un numero, una cadena donde promete un booleano. */
export function mistypedExampleArguments(source, modules = MODULES) {
  const off = new Set();

  for (const { label, param, type, kind } of comparedExampleArguments(source, modules)) {
    if (!acceptsArgument(type, kind))
      off.add(`${label}: el argumento ${param} es ${kind} y la firma promete ${type}`);
  }

  // Validacion por CAMPOS: si el argumento es un objeto literal y la firma promete un
  // registro inline, las claves del ejemplo se cruzan campo a campo con lo prometido.
  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    const params = documentedParamTypes(target.source, className, member);

    if (params == null)
      continue;

    argumentList(args).forEach((arg, i) => {
      const param = params[i];

      if (param == null || !isRecordType(param.type))
        return;

      for (const problem of recordFieldErrors(`${label} (argumento ${i + 1})`, param.type, arg))
        off.add(problem);
    });
  }

  return [...off].sort();
}

/* ---------------------------------------------------------------------------
 * Guardia de firmas de la regla 10
 * ------------------------------------------------------------------------- */

/** Llamadas de ejemplo CON argumentos cuya firma declarada no documenta ningun
 *  `@param` obligatorio: ahi la regla 10 no tiene nada que cruzar (solo cruza los
 *  parametros con nombre y sin corchetes) y el hueco —una firma sin tipos— se cierra
 *  en silencio. Cubre los metodos que el ejemplo llama y el `new Clase(...)` con el
 *  que construye; una llamada SIN argumentos no exige `@param` (no hay tipo que
 *  prometer) y un metodo que la clase no declara se deja a la regla 8. */
export function undocumentedExampleCalls(source, modules = MODULES) {
  const off = new Set();

  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const argc = argumentCount(args);

    if (argc === 0)
      continue;

    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    if (!memberDeclarations(target.source, className).has(member))
      continue;

    if (documentedParamTypes(target.source, className, member) == null)
      off.add(`${label}: el ejemplo le pasa ${argc} argumento(s) y la firma no documenta ningun @param obligatorio`);
  }

  return [...off].sort();
}

/* ---------------------------------------------------------------------------
 * Detectores de la regla 11: la forma de los accesos
 * ------------------------------------------------------------------------- */

/** La forma de un acceso segun lo que sigue al nombre del miembro: `(` lo llama, un `=`
 *  (y no `==`) lo escribe, cualquier otra cosa lo lee. */
export function accessKind(text, at) {
  let i = at;

  while (i < text.length && /\s/.test(text[i]))
    i += 1;

  const next = text[i];

  return next === '(' ? 'call' : next === '=' && text[i + 1] !== '=' ? 'write' : 'read';
}

/** Los receptores ENCADENADOS de un texto: cada `new Clase(...)` que el ejemplo
 *  construye sin atarlo a una variable y al que sigue un `.miembro`
 *  (`new XYPad(el).setCorners([...])`). [{ className, member, memberAt, args }], donde
 *  `args` es null si el miembro NO se llama (`new X().value`) y el texto de los
 *  argumentos si lo sigue un `(` (`new X().m(a, b)`). Los parentesis del `new` se
 *  equilibran, asi que un argumento anidado (`new Pad(el, fn(x)).destroy()`) no corta
 *  el encadenado. Es la fuente comun de `chainedMemberAccesses` (regla 11) y de
 *  `chainedMethodCalls` (reglas 8/9/10), para que las dos no puedan discrepar. */
export function chainedReceivers(text) {
  const sites = [];

  for (const match of text.matchAll(/\bnew\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const close = closingIndex(text, match.index + match[0].length - 1);

    if (close < 0)
      continue;

    let dot = close + 1;

    while (dot < text.length && /\s/.test(text[dot]))
      dot += 1;

    if (text[dot] === '?' && text[dot + 1] === '.')
      dot += 1;                          // `?.`: deja el punto en `dot`, como `.`

    if (text[dot] !== '.')
      continue;

    const member = /^\s*([A-Za-z_$][\w$]*)/.exec(text.slice(dot + 1));

    if (member == null)
      continue;

    const memberAt = dot + 1 + member[0].indexOf(member[1]);
    const afterName = memberAt + member[1].length;
    const call = /^\s*\(/.exec(text.slice(afterName));

    if (call == null) {
      sites.push({ className: match[1], member: member[1], memberAt, args: null });
      continue;
    }

    const open = afterName + call[0].length - 1;
    const end = closingIndex(text, open);

    sites.push({
      className: match[1],
      member: member[1],
      memberAt,
      args: end < 0 ? '' : text.slice(open + 1, end),
    });
  }

  return sites;
}

/** Los accesos de un texto sobre el receptor encadenado: [{ className, member, access }],
 *  sin `variable` (el objeto no tiene nombre). */
export function chainedMemberAccesses(text) {
  return chainedReceivers(text).map(({ className, member, memberAt }) => ({
    className,
    variable: null,
    member,
    access: accessKind(text, memberAt + member.length),
  }));
}

/** Las llamadas de un texto sobre el receptor encadenado, con la forma de
 *  `exampleMethodCalls`: [{ className, variable: null, method, args }]. Un encadenado
 *  que no llama (`new X().value`) no entra. */
export function chainedMethodCalls(text) {
  const calls = [];

  for (const { className, member, args } of chainedReceivers(text)) {
    if (args == null)
      continue;

    calls.push({
      className,
      variable: null,
      method: member,
      args: args.replace(/\s+/g, ' ').trim(),
    });
  }

  return calls;
}

/** Los miembros que el TEXTO de un bloque encadena tras un `new Clase(...)`
 *  (`new XYPad(el).setCorners(...)` -> `setCorners`). Es la lectura con la que la
 *  guardia derivada de la regla 11 contrasta lo que el detector dice ver contra lo
 *  que hay escrito. NO reusa `chainedReceivers` (si lo hiciera, la guardia se
 *  compararia consigo misma), pero SI comparte con el detector la primitiva de
 *  equilibrio `closingIndex`, que salta cadenas y comentarios: un parentesis anidado a
 *  cualquier profundidad (`new Pad(el, fn(x, g(y))).destroy()`) o un parentesis dentro
 *  de una cadena (`new Pad(el, ')').setValue(0.1)`) no puede hacer que esta lectura se
 *  quede corta y la guardia falle de mas. Un fallo en `closingIndex` mismo se escapa
 *  aqui; lo cubren el resto de reglas, que lo ejercitan por todos lados. */
export function textChainedMembers(text) {
  const members = [];

  for (const match of text.matchAll(/\bnew\s+[A-Za-z_$][\w$]*\s*\(/g)) {
    const close = closingIndex(text, match.index + match[0].length - 1);

    if (close < 0)
      continue;

    let dot = close + 1;

    while (dot < text.length && /\s/.test(text[dot]))
      dot += 1;

    if (text[dot] === '?' && text[dot + 1] === '.')
      dot += 1;                          // `?.`: deja el punto en `dot`, como `.`

    if (text[dot] !== '.')
      continue;

    const member = /^\s*([A-Za-z_$][\w$]*)/.exec(text.slice(dot + 1));

    if (member != null)
      members.push(member[1]);
  }

  return members;
}

/** Los accesos que un ejemplo hace a los miembros del objeto que el MISMO bloque
 *  construye: [{ className, variable, member, access }], con `access` = 'call'
 *  (`pad.setValue(0.2)`), 'read' (`ts.value`) o 'write' (`ts.value = 1`), con
 *  encadenado opcional incluido (`pad?.value`, `pad.setValue?.()`, que es la misma
 *  promesa). Sigue DOS
 *  receptores: el que el bloque ata (`const pad = new XYPad(...)`, con su `variable`),
 *  y el encadenado que no ata nada (`new XYPad(el).setCorners(...)`, `variable` = null).
 *  Los dos los siguen tambien las reglas 8/9/10. */
export function exampleMemberAccesses(source) {
  const accesses = [];

  for (const block of docBlocks(source)) {
    for (const { variable, className, at } of exampleBindings(block.text)) {
      const receiver = new RegExp(`\\b${variable}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');

      for (const match of block.text.matchAll(receiver)) {
        // Mismo corte que las llamadas: un alias reasignado deja de ser el receptor.
        if (reassignmentOf(variable).test(block.text.slice(at, match.index)))
          continue;

        if (match.index <= at)
          continue;

        accesses.push({
          className,
          variable,
          member: match[1],
          access: accessKind(block.text, match.index + match[0].length),
        });
      }
    }

    for (const access of chainedMemberAccesses(block.text))
      accesses.push(access);
  }

  return accesses;
}

/** Lo que admite cada forma declarada: un metodo se llama, un getter se lee, un setter
 *  se escribe y un campo se lee y se escribe. */
export const ACCESS_BY_FORM = {
  method: ['call'],
  get: ['read'],
  set: ['write'],
  field: ['read', 'write'],
};

export const ACCESS_WORD = { call: 'lo llama', read: 'lo lee', write: 'lo escribe' };
export const FORM_WORD = { method: 'metodo', get: 'getter', set: 'setter', field: 'campo' };

/** Accesos de los ejemplos que no cuadran con la FORMA en que la clase declara ese
 *  miembro: llamar a un getter (`ts.value()`), leer como propiedad un metodo
 *  (`ts.setValue`), escribir un nombre que solo tiene getter (`ts.value = 1`). Un
 *  miembro que la clase NO declara se salta: un campo de instancia (`this.value = ...`
 *  en el constructor) no es una declaracion, asi que no hay forma que comparar. */
export function mismatchedExampleAccesses(source, modules = MODULES) {
  const off = new Set();

  for (const { className, member, access } of exampleMemberAccesses(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    const declaration = memberDeclarations(target.source, className).get(member);

    if (declaration == null)
      continue;

    if ([...declaration.forms].some((form) => ACCESS_BY_FORM[form].includes(access)))
      continue;

    const forms = [...declaration.forms].map((form) => FORM_WORD[form]).join('/');

    off.add(`${className}.${member}: el ejemplo ${ACCESS_WORD[access]}, la clase lo declara ${forms}`);
  }

  return [...off].sort();
}

