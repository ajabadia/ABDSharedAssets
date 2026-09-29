/**
 * La capa de OPCIONES: lo que el codigo LEE, GUARDA y aplica como default de las
 * opciones, y las entradas que un `normalizeEntry` registra.
 */

import {
  OPTION_IDENTIFIERS,
  OPTION_NAMES,
  codeOnly,
  mentionsOutside,
} from './docs.js';

import {
  braceGroups,
  enclosingLiteral,
  entryParameters,
} from './entries.js';

import {
  statementEnd,
} from './scan.js';

import {
  argumentList,
  topLevelParts,
} from './split.js';

/** Un parametro que llega CON NOMBRE: un identificador, con su `= {}` o su `...resto`.
 *  Es la misma forma que aceptaba el `bindingAt` de la regla 12, al que esta vista
 *  sustituye: un `p primero` que no es ni patron ni identificador, o un default que no
 *  sea `{}` (`x = 5`), no se pueden leer con nombre. */
const NAMED_PARAMETER = /^(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*(?:=\s*\{\s*\})?$/;

/** Claves desestructuradas en un patron de parametros, a cualquier profundidad. */
function destructuredKeys(parameters) {
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

/** Identificadores que son objeto de opciones: `x = {}` o nombre elocuente.
 *
 *  El separador de COLA se mira con un lookahead —`(?==|,|$)`— y no se consume: si se
 *  tragara la coma, el parametro siguiente se quedaria sin su `(?:^|,)` y la regla 2
 *  solo veria el PRIMERO de la firma (y, saltando de dos en dos, el tercero). El
 *  `handlers` de en medio de `wire(el, handlers, n)` se perdia, y con el sus lecturas. */
export function optionIdentifiers(params) {
  const identifiers = new Set();

  for (const pattern of params) {
    for (const match of pattern.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=\s*\{\s*\}/g))
      identifiers.add(match[1]);

    for (const match of pattern.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?==|,|$)/g)) {
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
  const fromBody = new RegExp(
    `\\bconst\\s*\\{([^}]*)\\}\\s*=\\s*(?:this\\.)?(?:${optionNameAlternation(source)})\\b`, 'g');

  for (const match of source.matchAll(fromBody)) {
    for (const part of match[1].split(',')) {
      const name = part.split('=')[0].trim();

      if (/^[A-Za-z_$][\w$]*$/.test(name) && !reads.has(name))
        reads.set(name, 'desestructurado del objeto de opciones');
    }
  }

  return reads;
}

/** Un PARAMETRO de una firma con lo que se sabe de el: su POSICION, el texto que
 *  ocupa, el identificador con el que llega (`name`, null si llega desmembrado), si
 *  llega DESMEMBRADO, las CLAQUES que promete su patron y si es el OBJETO DE OPCIONES.
 *
 *  ESTA ES LA UNICA FUENTE de donde vive el objeto de opciones. El `index` no es un dato
 *  de adorno: el repo lo pone FUERA de la primera posicion —casi todos los constructores
 *  son `constructor(container, options = {})`, y hay firmas donde llega desmembrado y
 *  tampoco es el primero—, asi que una lectura que supusiera que vive en el PRIMERO se
 *  quedaria con las cuatro firmas que si lo desmembran ahi (`continuousNotices`,
 *  `drawer`, `fitStage`, `overlayFocus`) y dejaria fuera la convencion mayoritaria sin
 *  que ninguna cuenta lo delatara. Las reglas 4, 5, 10 y 12 preguntan aqui en vez de
 *  recalcularlo: las dos primeras arman con `optionNames` sus patrones de lectura, y las
 *  dos ultimas atan su `@param` a esta vista —por nombre primero y por posicion de
 *  respaldo— en vez de trocear la firma por su cuenta. */
export function signatureParams(parameters) {
  return argumentList(parameters).map((part, index) => {
    // el parametro es un DESMEMBRADO si su texto abre por una llave; sus claves las
    // saca el mismo lector que usa la regla 2, para que las dos vistas no discreparen
    const destructured = /^\s*\{/.test(part);
    const keys = destructured ? destructuredKeys([part]) : [];

    return {
      index,
      text: part.trim(),
      name: NAMED_PARAMETER.exec(part)?.[1] ?? null,
      destructured,
      keys,
      options: destructured ? keys.length > 0 : optionIdentifiers([part]).size > 0,
    };
  });
}

/**
 * Los PARAMETROS de cada entrada que son el objeto de opciones, con la POSICION que
 *  ocupan en su firma: `[{ index, name, destructured, keys }]`, en el orden de las
 *  firmas. `name` es el identificador con el que llega (null si llega desmembrado).
 *  `index` es el lugar del parametro (0 = el primero) y `destructured` dice si el objeto
 *  llega DESMEMBRADO —`{ width, height } = {}`— en vez de con nombre —`options = {}`—,
 *  con sus claves en `keys`. Cuenta como objeto de opciones lo que `optionIdentifiers`
 *  reconoce (el nombre elocuente o la forma `= {}`), no solo lo que se llame `options`:
 *  `hooks`, `spec` y `config` son la misma cosa.
 *
 *  El `index` no es un dato de adorno. El repo lo pone FUERA de la primera posicion —
 *  casi todos los constructores son `constructor(container, options = {})`, y hay
 *  firmas donde llega desmembrado y tampoco es el primero—, asi que una lectura que
 *  supusiera que vive en el PRIMERO se quedaria con las cuatro firmas que si lo
 *  desmembran ahi (`continuousNotices`, `drawer`, `fitStage`, `overlayFocus`) y dejaria
 *  fuera la convencion mayoritaria sin que ninguna cuenta lo delatara. Por eso una
 *  cobertura de las reglas exige que el inventario conserve las dos formas. */
export function optionsParams(source) {
  const found = [];

  for (const signature of entryParameters(source))
    for (const one of signatureParams(signature))
      if (one.options)
        found.push({
          index: one.index,
          name: one.name,
          destructured: one.destructured,
          keys: one.keys,
        });

  return found;
}

/** Los NOMBRES con los que un modulo nombra su objeto de opciones: los que declara su
 *  lista (el nombre elocuente) mas los que declaran sus firmas de entrada (los que dice
 *  `optionsParams`). El primer grupo no es adorno: hay lecturas cuyo receptor no es
 *  parametro de ninguna firma de entrada —el `opts` de una fabrica interna de
 *  lcdScreen, el `options` de una funcion suelta de skins/index—, y derivar la lista
 *  solo de las firmas las perderia en silencio. El segundo es lo que no pasaba con las
 *  alternancias escritas a mano: un `opciones = {}` en una firma nueva entra aqui y
 *  llega a las reglas 2, 4, 5 y 7 sin que nadie tenga que apuntarlo. */
export function optionNames(source) {
  const names = [...OPTION_NAMES];

  for (const one of optionsParams(source))
    if (one.name != null && !names.includes(one.name))
      names.push(one.name);

  return names;
}

/** La lista de `optionNames` como ALTERNANCIA, para armar un patron por fuera (la
 *  regla 7 la escribe dentro de la expresion que despues imprime). */
export function optionNameAlternation(source) {
  return optionNames(source).join('|');
}

/** El PREFIJO con el que se busca una lectura de opcion en un modulo: `nombre.` o
 *  `this.nombre.`, con los nombres que ese modulo usa de verdad. Todo patron de lectura
 *  se arma con el —las reglas 2, 4, 5 y 7—, de modo que un nombre que llega a una llega
 *  a todas y no hay cuatro listas que se olviden entre si. */
export function optionReadPrefix(source) {
  return new RegExp(`\\b(?:this\\.)?(?:${optionNameAlternation(source)})\\s*\\.\\s*`);
}

/** Defaults del destructuring: en la firma (`computeFit({ minScale = 0.25 })`) y
 *  en el cuerpo (`const { lines = 2 } = options`). */
export function destructuredDefaults(source) {
  const patterns = [...entryParameters(source)];
  const fromOptions = new RegExp(`^\\s*=\\s*(?:this\\.)?(?:${optionNameAlternation(source)})\\b`);

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

    if (fromOptions.test(tail))
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

/** Lectura de una opcion: `options.x`, `this.options.x`, `spec.x`... El patron lo arma
 *  el prefijo comun con los nombres que el modulo usa de verdad, no una lista propia. */
function optionRead(source) {
  return new RegExp(`${optionReadPrefix(source).source}([A-Za-z_$][\\w$]*)`, 'g');
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

  for (const match of code.matchAll(optionRead(source))) {
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
