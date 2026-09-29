/**
 * La API de un modulo: el simbolo que EXPORTA y los miembros del objeto que devuelve
 * una FABRICA.
 */

import {
  MODULES,
} from './modules.js';

import {
  literalEntryRanges,
} from './records.js';

import {
  closingIndex,
} from './scan.js';

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

  const entries = literalEntryRanges(inner);

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
