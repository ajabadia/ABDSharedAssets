/**
 * La capa de MIEMBROS: el cuerpo de una clase, sus miembros, sus firmas y su
 * formulario, y el simbolo que un modulo exporta.
 */

import {
  factoryApiMembers,
  moduleExporting,
} from './api.js';

import {
  closingIndex,
  depthAt,
  withoutComments,
} from './scan.js';

/** El indice del cuerpo de la clase que un modulo exporta (justo tras su `{`), o -1:
 *  para llevar un miembro del cuerpo a su sitio en la fuente y buscar ahi su JSDoc. */
function classBodyStart(source, className) {
  const declaration = new RegExp(`\\bexport\\s+(?:default\\s+)?class\\s+${className}\\b`).exec(source);

  if (declaration == null)
    return -1;

  const open = source.indexOf('{', declaration.index + declaration[0].length);

  return open < 0 ? -1 : open + 1;
}

/** El nombre de la clase de la que esta otra hereda (`class Hija extends Base`), o
 *  null si no extiende a nadie. Es lo que hace falta para saber de QUIEN es un
 *  miembro o una lectura: un metodo que el ejemplo llama sobre el objeto puede
 *  venir declarado en la clase base, y sin esto la puerta lo diria fantasma. */
export function baseClassName(source, className) {
  const declaration = new RegExp(
    `\\bexport\\s+(?:default\\s+)?class\\s+${className}\\s+extends\\s+([A-Za-z_$][\\w$]*)`,
  ).exec(source);

  return declaration == null ? null : declaration[1];
}

/** Los modulos de los que una clase hereda, de la clase base mas CERCANA a la
 *  mas lejana (que es el orden en que un `extends` se resuelve: lo de mas abajo
 *  pisa a lo de mas arriba). Un nombre repetido se corta, porque dos clases que
 *  se extienden entre si mismas no tienen una cadena: tienen un bucle, y un
 *  bucle aqui seria un test colgado en vez de un fallo. */
export function baseChain(source, className, modules) {
  const chain = [];
  const vistos = new Set([className]);

  for (let nombre = baseClassName(source, className); nombre != null;) {
    if (vistos.has(nombre))
      break;

    vistos.add(nombre);

    // Por el modulo que EXPORTA esa clase, no por un nombre de fichero derivado
    // del nombre de la clase: `IndexControl` vive en `indexControl.js`, y la
    // diferencia de mayusculas dejaba la cadena vacia sin avisar.
    const modulo = moduleExporting(nombre, modules);

    if (modulo == null)
      break;

    chain.push({ nombre, modulo });
    nombre = baseClassName(modulo.source, nombre);
  }

  return chain;
}

/** El nombre de la clase que un modulo exporta, o null si no exporta ninguna. */
export function exportedClassName(source) {
  return /\bexport\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(source)?.[1] ?? null;
}

/**
 * Los TEXTOS de los ficheros de los que hereda la clase de un modulo (vacio si
 * no herda de nadie). Es el «resto de la familia»: lo que un detector tiene que
 * mirar ADEMAS de su fichero cuando la pregunta es si algo se usa, y no si el
 * fichero cumple su palabra.
 */
export function baseSources(source, modules) {
  const className = exportedClassName(source);

  if (className == null)
    return [];

  return baseChain(source, className, modules).map(({ modulo }) => modulo.source);
}

/** El TEXTO DEL CONTRATO de un modulo: su propio fichero y los de las clases que
 *  extiende. Para las preguntas de la familia que abarcan el conjunto —¿se lee
 *  esta clave de la entrada?— y no solo las de lo que pasa a la base, que para
 *  eso esta `baseSources`.
 *
 *  Las reglas de DOCUMENTACION se quedan en su fichero a proposito: una clase
 *  base es un modulo mas, con sus propias promesas, y juntarlas haria que la
 *  base se juzgara dos veces. */
export function contractText(source, modules) {
  return [source, ...baseSources(source, modules)].join('\n');
}

/** El cuerpo de la clase que un modulo exporta (null si no la declara asi). */
export function classBody(source, className) {
  const open = classBodyStart(source, className);

  if (open < 0)
    return null;

  const close = closingIndex(source, open - 1);

  return close < 0 ? null : source.slice(open, close);
}

/** Ancla de la DECLARACION de un miembro: el nombre antes del `(` de un metodo o
 *  del `=` de un campo, al principio del cuerpo o tras el cierre anterior. Compartida
 *  por la regla 8 (que miembros hay) y la 9 (cuantos argumentos aceptan). */
export const CLASS_MEMBER = /(?:^|[{};])\s*(?:(?:async|static|get|set)\s+|\*\s*)*#?([A-Za-z_$][\w$]*)\s*(?=[(=])/g;

/** Los parametros que un miembro declara justo despues de su nombre (-1 si no declara
 *  ninguno): el parentesis de un metodo (`setValue (v) {`) o el de la funcion que
 *  guarda un campo (`destroy = () => {`, `onDrag = function (e) {`). */
function declaredParams(body, at, name) {
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
function modifierBefore(code, at) {
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
function memberForm(modifier, params) {
  if (modifier === 'get' || modifier === 'set')
    return modifier;

  return params === -1 ? 'field' : 'method';
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
