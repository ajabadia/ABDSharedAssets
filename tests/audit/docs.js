/**
 * La capa de DOCUMENTACION: los bloques JSDoc, sus celdas y sus nombres, y las
 * claves que la documentacion promete de un miembro o de un default.
 */

import {
  memberDeclarations,
} from './members.js';

import {
  recordKeys,
} from './records.js';

import {
  closingIndex,
} from './scan.js';

/** El texto de un tipo o de unos argumentos escritos EN un docblock, ya sin la
 *  decoracion de sus lineas (` * `): tipos y llamadas multilínea llegan troceados
 *  por el comentario, y un `*` suelto no es sintaxis de tipo ni de argumento —
 *  era lo que dejaba caer el campo cuya linea empezaba con el. */
export const cleanDocText = (text) =>
  text.replace(/(^|\n)\s*\*(?!\/)/g, '$1').replace(/\s+/g, ' ').trim();

/** El bloque de documentacion que precede a `index` (null si no hay ninguno justo
 *  ahi). Entre el bloque y el codigo solo puede haber espacios, o —para el
 *  `constructor`, que en este repo se documenta encima del `export class`— la
 *  cabecera de la clase. Ese peaje es lo que impide que un miembro sin doc propio
 *  herede el JSDoc del miembro anterior. */
/** `export class X`, `export class X extends Base` y `export default class X`:
 *  lo que puede separa el final de un `/**` del principio del cuerpo de una clase. */
const DECLARACION_DE_CLASE =
  /^export\s+(?:default\s+)?class\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[A-Za-z_$][\w$.]*)?\s*\{\s*$/;

export function docBlockBefore(source, index, allowClass = false) {
  const end = source.lastIndexOf('*/', index - 1);

  if (end < 0)
    return null;

  const gap = source.slice(end + 2, index).trim();

  // El hueco puede ser la DECLARACION de la clase, con lo que va entre el
  // nombre y la llave: un `extends Base` y el `{` de la clase que lo hereda.
  // Sin esa parte, una subclase que documenta su constructor en el bloque de
  // la clase se queda sin `@param` y la puerta acusa al ejemplo de no
  // documentar los argumentos que si documenta.
  if (gap !== '' && !(allowClass && DECLARACION_DE_CLASE.test(gap)))
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
      type: cleanDocText(block.slice(open + 1, close)),
      name: name == null ? null : name[1],
      option: name != null && name[2] != null,
    });
  }

  return params;
}

/** Los `@param` de un miembro con el NOMBRE que promete cada uno —los PARAMETROS DE LA
 *  LLAMADA, sin las claves del objeto de opciones—, o null si el miembro no promete
 *  ninguno. El nombre es lo que permite atarlos a la firma por su cuenta y no por su
 *  posicion: la regla 10 los cruza con los argumentos del ejemplo, y el indice solo es
 *  una convencion de escritura. */
export function documentedCallParams(source, className, member) {
  const declaration = memberDeclarations(source, className).get(member);

  if (declaration == null)
    return null;

  const block = docBlockBefore(source, declaration.at, member === 'constructor');

  if (block == null)
    return null;

  const params = docParamTypes(block).filter(({ name, option }) => name != null && !option);

  return params.length === 0 ? null : params.map(({ type, name }) => ({ type, name }));
}

/** Los tipos que la documentacion promete para los parametros de un miembro, en ORDEN
 *  de firma: [{ type }], sin las claves del objeto de opciones. Un miembro sin JSDoc,
 *  o con uno que solo lleva prosa, no promete nada (null). */
export function documentedParamTypes(source, className, member) {
  const params = documentedCallParams(source, className, member);

  return params == null ? null : params.map(({ type }) => ({ type }));
}

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
const NAMES_CELL = /^\s*\*\s{2,}(.+?)\s{2,}\S/;

/** `@param {tipo} [prefijo.nombre]`. */
const JSDOC_MEMBER = /@param\s+\{[^}]*\}\s+\[?(\w+)\.(\w+)/;

/** Los tipos OBJETO INLINE de un texto —los registros balanceados que abren justo tras la
 *  llave de un `@param` (`@param {{ campo?: tipo }} x` -> `{ campo?: tipo }`)—, TODOS los
 *  que traiga la linea: una linea juntada puede llevar varios `@param` y solo uno de ellos
 *  ser un registro. Cada cierre se busca con `closingIndex` y no con una regex: con un
 *  registro ANIDADO dentro (`Array<{ label: string }>`) la llave que cierra el registro no
 *  es la primera, y una regex devolvia medio tipo —abierto, o con una llave de mas— y de
 *  ahi salian campos de mas o de menos. Sus claves las saca `recordKeys`, por caracteres. */
function inlineRecordTypes(line) {
  const types = [];

  for (const at of line.matchAll(/@param\s+\{/g)) {
    const inner = at.index + at[0].length;

    if (line[inner] !== '{')
      continue;                        // `@param {number}`: un tipo simple, no un registro

    const close = closingIndex(line, inner);

    if (close >= 0)
      types.push(line.slice(inner, close + 1));
  }

  return types;
}

/** El `@property` de una linea —`@property {string} [type]  desc`-> `type`—, o null si
 *  la linea no lo es. El tipo cierra en SU llave (un `Array<{label: string}>` no se corta
 *  en la primera) y el nombre va DETRAS del tipo, con su `[]` de opcional.
 *
 *  Es la misma forma de JSDoc que `propertyFields` lee en bloque para que la regla 12 la
 *  juzgue, pero aqui la clave cuenta SIEMPRE, tambien cuando el audit no sabe leer su
 *  tipo: una `@property {HTMLElement|string} el` documenta `el` de todos modos, y si esta
 *  lista no lo supiera, leer `spec.el` seria un falso positivo de la regla 2. Que las dos
 *  vistas no se separen lo vigila la cobertura del `@typedef`. */
function propertyName(line) {
  const at = /@property\s*\{/.exec(line);

  if (at == null)
    return null;

  const close = closingIndex(line, at.index + at[0].length - 1);

  return close < 0
    ? null
    : /^\s*\[?([A-Za-z_$][\w$]*)/.exec(line.slice(close + 1))?.[1] ?? null;
}

/** Los identificadores que, precedidos de un punto, nombran una OPCION: la lista mas
 *  baja de todas y la unica. Vive en la capa de documentos porque la usa todo el mundo,
 *  y no en la de opciones porque las opciones la EXTIENDEN con los nombres que declara
 *  cada modulo (`optionNames`): antes cada regla llevaba la suya escrita a mano —
 *  cuatro o cinco listas que se olvidaban entre si, y un nombre nuevo llegaba a unas
 *  y se quedaba sin vigilar en las otras. */
export const OPTION_IDENTIFIERS = /^(options|opts|config|handlers|hooks|spec|params)$/;

/** Los mismos nombres como lista, para armar una alternancia. */
export const OPTION_NAMES = OPTION_IDENTIFIERS.source.slice(2, -2).split('|');

/** Mencion directa: `options.dragLanePx` dentro de la documentacion. Sin `p`: en prosa
 *  castellana "p. ej." documentaba un miembro fantasma (`ej`). Los NOMBRES no son de
 *  aqui: los pasa quien sabe los del modulo (`optionNames`), que es la unica fuente de
 *  donde vive su objeto de opciones. El patron se guarda por lista para no armarlo en
 *  cada linea. */
const MENTIONS = new Map();

function docMention(options) {
  if (!MENTIONS.has(options)) {
    MENTIONS.set(options, new RegExp(`\\b(?:${options})\\s*\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'));
  }

  return MENTIONS.get(options);
}

/** Miembros documentados -> la linea que los documenta. Cada linea se lee con
 *  `docLineNames` —la celda de una lista, el `@param` de un miembro, los campos de un tipo
 *  inline, el `@property` de un `@typedef` y las menciones—, y no con una copia de esa
 *  lectura: lo que la regla 4 y la 7 toman de una linea tiene que ser lo mismo que lo que
 *  toman la 1 y la 2, o una `@property` seria documentada para unas y no para otras. */
export function documentedMembers(source, options = OPTION_NAMES.join('|')) {
  const members = new Map();

  for (const block of docBlocks(source)) {
    // Un `@param` puede partirse en varias lineas: la version juntada lo lee.
    const joined = block.text.replace(/\n\s*\*/g, ' ');

    for (const line of [...block.text.split('\n'), joined])
      for (const name of docLineNames(line, options))
        if (!members.has(name))
          members.set(name, line.trim());
  }

  return members;
}

/** Marcador de que el fichero documenta un objeto de opciones (o sus parientes). */
export const documentsOptionsObject = (source) =>
  /@param\s+\{[^}]*\}\s+\[?\w*(options|params|handlers|hooks|spec|p)\b/.test(source);

/** Los nombres de miembro que documenta una linea: la celda de una lista, el
 *  `@param` de un miembro, los campos de un tipo inline y las menciones. */
export function docLineNames(line, options = OPTION_NAMES.join('|')) {
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

  if (jsdoc != null)
    names.push(jsdoc[2]);

  for (const type of inlineRecordTypes(line))
    names.push(...(recordKeys(type) ?? []));

  // El `@property` de un `@typedef`: su nombre documenta la clave, y la linea que lo
  // documenta es la suya (ahi es donde se buscara su default).
  const property = propertyName(line);

  if (property != null)
    names.push(property);

  for (const mention of line.matchAll(docMention(options)))
    names.push(mention[1]);

  return names;
}

/** Hay alguna aparicion de `name` fuera de [start, end)? */
export function mentionsOutside(code, name, start, end) {
  for (const match of code.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
    if (match.index < start || match.index >= end)
      return true;
  }

  return false;
}

/** Los bloques de documentacion con rotulo `Usage:` (ahi se PROMETEN ejemplos). */
export function usageBlocks(source) {
  return docBlocks(source).filter((block) => /\bUsage\s*:/.test(block.text));
}
