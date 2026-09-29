/**
 * El escaner de REGEX del audit y el CLASIFICADOR de sus fallos: que patrones trae un
 * fuente y de que clase es cada uno.
 *
 * Vive en una capa compartida, y no dentro de la meta-guardia que hoy lo usa, porque el
 * escaner es de quien lo use. Dos copias no se notarian el una al otro —miden lo mismo y
 * ninguna se delata— y ahi es donde se pierde el fallo: el clasificador del separador de
 * cola y el del corte por corchetes juzgan lo mismo con la misma lista de patrones, asi
 * que el segundo tiene que ser el primero con otra condicion, no otro escaner. Por eso
 * lo que se reparte no son las clases sino el LECTOR: `regexPatternsOf` camina el fuente
 * una vez y `REGEX_CLASSES` dice que se mira de cada patron que sale.
 *
 * Modulo PURO: no lee el disco. Quien lo llama pasa los fuentes en `[etiqueta, fuente]`.
 */

import { lineOf, skipString } from './scan.js';

/* -----------------------------------------------------------------------------
 * El escaner: que patrones de regex trae un fuente
 * ------------------------------------------------------------------------- */

/** Tras estos caracteres un `/` ABRE un literal y no divide: un operador o un
 *  delimitador. Detras de un valor (`ancho / 2`) el `/` es una division, y una division
 *  no lee listas. */
const REGEX_AFTER = '(,=:[!&|?{};+*%~^<>-';

/** Las PALABRAS tras las que tambien cabe un literal (`return /re/.test(x)`): ahi el
 *  caracter de delante es la ultima letra de la palabra, asi que la lista de arriba no la
 *  reconoceria. */
const REGEX_AFTER_WORD = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await)$/;

/** El indice justo tras la clase `[...]` que abre en `start` (el fin de la linea si no
 *  cierra ahi): dentro de una clase caben un `/` y unas comillas que no cierran nada. */
function classEnd(source, start) {
  let i = start + 1;

  while (i < source.length && source[i] !== '\n') {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }

    if (source[i] === ']')
      return i + 1;

    i += 1;
  }

  return i;
}

/** El literal que abre en `start`: `{ pattern, end }`, o null si no cierra en la linea
 *  —entonces no era un literal, era una division—. Un literal no cruza el salto de linea:
 *  sin esa regla, un `/` suelto se comeria medio fichero hasta el siguiente. */
function regexLiteralAt(source, start) {
  let pattern = '';
  let i = start + 1;

  while (i < source.length && source[i] !== '\n') {
    if (source[i] === '\\') {
      pattern += source.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (source[i] === '[') {
      const end = classEnd(source, i);

      pattern += source.slice(i, end);
      i = end;
      continue;
    }

    if (source[i] === '/')
      return { pattern, end: i + 1 };

    pattern += source[i];
    i += 1;
  }

  return null;
}

/** El patron que un `new RegExp('...')` lleva escrito como TEXTO, ya sin el escape de la
 *  cadena (`'\\s*'` -> `\s*`): es la forma de escribir el `\d` de un regex sin comerse la
 *  barra al pasar por la cadena. */
const unescapeString = (text) => text.replace(/\\(.)/g, '$1');

/** Si el `/` de `at` puede ABRIR un literal. */
function regexStartsHere(source, at) {
  const before = source.slice(0, at).trimEnd();

  if (before === '')
    return true;

  return REGEX_AFTER.includes(before.slice(-1)) || REGEX_AFTER_WORD.test(before);
}

/** Los patrones de regex de un fuente —los LITERALES (`/.../g`) y los que se arman como
 *  CADENA (`new RegExp('...')`)—, cada uno con el indice donde empieza. Se camina el
 *  fuente caracter a caracter saltando los comentarios y las CADENAS: el texto de una
 *  cadena no es un patron, y hasta el clasificador escribe sus casos dentro de cadenas. */
export function regexPatternsOf(source) {
  const found = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i);

      i = newline < 0 ? source.length : newline;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i);

      i = close < 0 ? source.length : close + 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const end = skipString(source, i);

      if (ch !== '`' && /new\s+RegExp\(\s*$/.test(source.slice(0, i)))
        found.push({ pattern: unescapeString(source.slice(i + 1, end - 1)), at: i });

      i = end;
      continue;
    }

    if (ch === '/' && regexStartsHere(source, i)) {
      const literal = regexLiteralAt(source, i);

      if (literal == null) {
        i += 1;
        continue;
      }

      found.push({ pattern: literal.pattern, at: i });
      i = literal.end;

      while (i < source.length && /[a-z]/.test(source[i]))
        i += 1;                          // las banderas del literal

      continue;
    }

    i += 1;
  }

  return found;
}

/* -----------------------------------------------------------------------------
 * Las clases: un mismo patron puede fallar por motivos distintos
 * ------------------------------------------------------------------------- */

/** Una alternativa que ES un separador: `,`, `;` o una clase hecha de separadores y
 *  delimitadores (`[{};]`, `[,;]`), que es como un patron pide "aqui empieza otro
 *  elemento". */
const SEPARATOR_ITEM = /^(?:[,;]|\[[{};,\s]*\])$/;

/** Las alternativas de cada grupo del patron, sin bajar a los anidados. */
const groupAlternatives = (pattern) =>
  [...pattern.matchAll(/\((?:\?:)?([^()]*)\)/g)].map((match) => match[1].split('|'));

/** El patron PIDE el separador por DELANTE: algun grupo suyo ofrece el principio del texto
 *  (`^`) y un separador, que es la forma de leer una lista troceada. Consumirlo ademas al
 *  final —lo que mira `eatsSeparatorAtEnd`— es lo que hace saltar la lectura. */
const needsSeparatorBefore = (pattern) =>
  groupAlternatives(pattern).some((alternatives) =>
    alternatives.some((one) => SEPARATOR_ITEM.test(one.trim()))
    && alternatives.some((one) => one.trim() === '^'));

/** Si el patron CONSUME un separador al final del casamiento. Un lookahead de cola
 *  (`(?=,|$)`) no consume nada —deja su separador donde estaba, que es el arreglo—, y un
 *  cuantificador (`?,`, `\s*`) tampoco es el caracter que se come; lo que se mira es el
 *  atomo que queda detras: un `,`/`;` suelto, una clase que lo lleve, o un grupo cuya
 *  alternativa sea el separador (`(?:,|$)`, que lo consume igual que el `,` suelto). */
function eatsSeparatorAtEnd(pattern) {
  let tail = pattern;

  // los lookaheads de cola no consumen: se pelan antes de mirar el ultimo atomo
  for (let ahead = /\(\?(?:=|!)[^()]*\)$/.exec(tail); ahead != null;
    ahead = /\(\?(?:=|!)[^()]*\)$/.exec(tail))
    tail = tail.slice(0, ahead.index);

  let last = tail;

  while (last !== (last = last.replace(/(?:\\s[*+?]|[*+?])$/, '')) && last !== '') {
    // los cuantificadores de cola no son el caracter que se come
  }

  const group = /\((?:\?:)?([^()]*)\)$/.exec(last);

  return /[,;]$/.test(last)
    || /\[[^\]]*[,;][^\]]*\]$/.test(last)
    || (group != null && group[1].split('|').some((one) => SEPARATOR_ITEM.test(one.trim())));
}

/** Un patron CORTA el texto con CORCHETES en vez de con llaves: abre con ancla y con
 *  corchete, cierra con corchete, y no menciona una llave en todo el patron. Es la
 *  confusion del `@param` de un tipo inline escrita del reves: el texto equilibrado
 *  que se quiere leer es un registro `{...}` y se recorta por su hermano `[...]`.
 *
 *  El corchete tiene que ser OBLIGATORIO para que esto sea un corte. El
 *  `^\s+\[?(nombre)\]?` del lector de celdas de opcion tambien abre
 *  y cierra con corchetes —la marca de opcional de `[options.step]`— pero no recorta
 *  nada: son opcionales, asi que el `?` es justo lo que separa una cosa de la
 *  otra. Y no puede venir detras de un nombre: el extractor de bloques
 *  del YAML del contrato, `^\s*([A-Z]+)\["([^"]*)"\]\s*$`, tambien
 *  abre y cierra con corchetes y no menciona una llave, pero ahi el corchete es
 *  un ACCESO A INDICE detras de un nombre capturado, no el delimitador del
 *  corte. Y del corchete para atras no se abre ni un grupo ni otra clase, que es
 *  justo lo que delata un acceso a indice: delante del corchete solo hay anclas,
 *  espacios y escapes.
 *
 *  Y una clase que mezcla las dos familias (`[{[]`, la forma de decir «llave o
 *  corchete» sin escapar) NO se juzga aqui: `[{\[\]]` se comporta EXACTAMENTE
 *  igual, asi que marcarla seria delatar la forma buena junto a la rara. La clase
 *  mezclada que si es un fallo es la que se quiere cerrar y no cierra —`classEnd`
 *  se la lleva hasta el fin de linea—, y esa la ve el lector de literales, no este
 *  clasificador.
 */
function cutsWithBracketsInsteadOfBraces(pattern) {
  return /^\^[^(\[]*\\\[[^?]/.test(pattern)
    && /[^?]\\\]/.test(pattern)
    && !/[{}]/.test(pattern);
}

/** Las clases de fallo de un regex de lectura, con su NOMBRE —que es como las pide una
 *  mirada— y su juez. Es la tabla que evita duplicar el clasificador: quien mire una
 *  clase concreta pide su nombre, y quien anada una la escribe aqui una vez, con su
 * condicion al lado y no con un escaner entero al lado. El orden es el de la lectura. */
const REGEX_CLASSES = [
  {
    name: 'se come el separador de cola',
    judge: (pattern) => needsSeparatorBefore(pattern) && eatsSeparatorAtEnd(pattern),
  },
  {
    name: 'corta por corchetes donde va una llave',
    judge: cutsWithBracketsInsteadOfBraces,
  },
];

/** Los nombres de las clases, que es el vocabulario con el que se piden: una mirada dice
 *  «los que se comen el separador de cola» y no la condicion que lo decide. */
export const REGEX_CLASS_NAMES = REGEX_CLASSES.map(({ name }) => name);

/* -----------------------------------------------------------------------------
 * Los hallazgos
 * ------------------------------------------------------------------------- */

/** Los patrones de los fuentes que caen en la clase `clase` —o en todas, si no se dice
 *  ninguna—, como `fichero:linea: /patron/`, para que el hallazgo diga donde vive. Una
 *  clase que no existe revienta en vez de devolver una lista vacia: un nombre mal
 *  escrito callaria el barrido entero y el test seguiria en verde. El mismo patron puede
 *  caer en dos clases —un corte por corchetes que ademas se come el separador— y eso es
 *  un hallazgo, no dos, asi que la lista no repite. */
export function regexOffenses(files, clase) {
  const clases = clase == null ? REGEX_CLASSES
    : REGEX_CLASSES.filter((una) => una.name === clase);

  if (clases.length === 0)
    throw new Error(`clase de regex desconocida: ${clase} (hay ${REGEX_CLASS_NAMES.join(', ')})`);

  const off = new Set();

  for (const [file, source] of files)
    for (const { pattern, at } of regexPatternsOf(source))
      if (clases.some(({ judge }) => judge(pattern)))
        off.add(`${file}:${lineOf(source, at)}: /${pattern}/`);

  return [...off].sort();
}
