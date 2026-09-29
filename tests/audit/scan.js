/**
 * El escaner base del audit: cadenas, comentarios, delimitadores equilibrados y los
 * troceos de primer nivel del fuente. Sobre el se apoyan todas las demas capas.
 */

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
/** El indice tras el REGEX que abre en `start` (la barra): su cuerpo, la barra que lo
 *  cierra —saltando las barras de una clase de caracteres— y sus banderas. Un regex no es
 *  una cadena, pero trae comillas: si no se salta entero, la primera comilla de su cuerpo
 *  abre una cadena fantasma que se come el codigo que viene detras. */
export function skipPattern(text, start) {
  let i = start + 1;
  let inClass = false;

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }

    if (text[i] === '[')
      inClass = true;
    else if (text[i] === ']')
      inClass = false;
    else if (text[i] === '/' && !inClass) {
      i += 1;

      while (i < text.length && /[a-z]/i.test(text[i]))
        i += 1;

      return i;
    }
    else if (text[i] === '\n')
      return start + 1;              // un regex no cruza de linea: no era un regex

    i += 1;
  }

  return text.length;
}

/** Si un `/` que aparece en `index` puede abrir un PATRON y no ser una division: solo
 *  donde no puede cerrar una expresion —tras un identificador, un numero, un `)`, un `]`
 *  o un `.`—. Es el mismo criterio con el que el escaner de regex del audit decide que
 *  una barra abre algo. */
function opensPattern(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = text[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r')
      continue;

    if (/[A-Za-z0-9_$\])]/.test(ch))
      return false;

    return true;
  }

  return true;                        // al principio del fichero
}

/** Que es la barra de `index` —comentario de linea, de bloque o patron (y una division no
 *  es nada)—, y hasta donde llega cada caso. */
function slashAt(text, index) {
  if (text[index + 1] === '/') {
    const newline = text.indexOf('\n', index);

    return { kind: 'line', end: newline < 0 ? text.length : newline };
  }

  if (text[index + 1] === '*') {
    const close = text.indexOf('*/', index);

    return { kind: 'block', end: close < 0 ? text.length : close + 2 };
  }

  return opensPattern(text, index)
    ? { kind: 'pattern', end: skipPattern(text, index) }
    : { kind: 'division', end: index + 1 };
}

export function withoutComments(text) {
  const chars = text.split('');
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/') {
      const slash = slashAt(text, i);

      if (slash.kind !== 'pattern' && slash.kind !== 'division')
        for (let j = i; j < slash.end; j += 1)
          if (chars[j] !== '\n')
            chars[j] = ' ';

      i = slash.end;
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

/** La linea (1-based) en la que cae un indice del fuente: el numero que lleva un
 *  hallazgo para que se sepa DONDE esta, que no es lo mismo que en que fichero. */
export function lineOf(text, at) {
  return text.slice(0, at).split('\n').length;
}

/** Un LOCALIZADOR de linea para un texto: una funcion indice -> linea que ya tiene la
 *  cuenta de los saltos hecha, en vez de volver a contar desde el principio en cada
 *  llamada —que es lo que hace `lineOf`, y es O(at)—. Con una clave por cada linea del
 *  fuente sale la MISMA cuenta: `slice(0, at).split('\n').length` es uno mas que los
 *  saltos que caen antes de `at`, y eso es lo que se busca aqui con una busqueda binaria.
 *
 *  No cambia `lineOf` porque hay quien ya la llama asi —el meta-guard al citar un fallo— y
 *  una funcion que depende del resto es un contrato nuevo que nadie pidio. */
const LOCALIZADORES = new Map();

/** Cuantos localizadores se guardan antes de que se vaya el MAS VIEJO. El mismo
 *  trato que las PALABRAS del diagnostico: un tope es un tope y no una medida. Con el
 *  catalogo real son cuatro o cinco fuentes y la memoria no se acerca; el tope esta
 *  para el otro caso —un test que fabrique cientos de fuentes distintas para morder
 *  un detector—, donde los textos son la CLAVE y sin tope la memoria seria tan grande
 *  como el propio test. */
const MAX_LOCALIZADORES = 512;

export function lineLocator(text) {
  let localizador = LOCALIZADORES.get(text);

  if (localizador != null)
    return localizador;

  const saltos = [0];

  for (let i = 0; i < text.length; i += 1)
    if (text[i] === '\n')
      saltos.push(i + 1);

  localizador = (at) => {
    // El numero de saltos que empiezan ANTES de `at`: la primera tabla que se pasa de `at`
    // es la linea que lo contiene. Con `at` en el final del texto sale la ultima linea,
    // que es lo mismo que cuenta el `split`.
    let bajo = 0;
    let alto = saltos.length;

    while (bajo + 1 < alto) {
      const medio = (bajo + alto) >> 1;

      if (saltos[medio] <= at)
        bajo = medio;
      else
        alto = medio;
    }

    return bajo + 1;
  };

  if (LOCALIZADORES.size >= MAX_LOCALIZADORES)
    LOCALIZADORES.delete(LOCALIZADORES.keys().next().value);

  LOCALIZADORES.set(text, localizador);

  return localizador;
}

/** La linea en la que esta la N-esima aparicion de un texto del fuente, contando desde
 *  donde le digas —el `arranque` es para cuando el MISMO texto sale dos veces, en sitios
 *  distintos, y solo uno de ellos es el que el aviso va a citar—. Un test mira asi la
 *  linea que TIENE y no un numero escrito a mano que se descoloca en cuanto el fuente
 *  crece, que es lo que hace util esta y no un `lineOf` a pelo. Una aparicion que no esta
 *  NO es un numero de linea: es un test que mira algo que ya no existe, y por eso se dice
 *  aqui —devolver un `-1` disfrazado de linea hace que el fallo se lea como una linea que
 *  no cuadra, y no como el texto que dejo de estar—. */
export const lineaDe = (source, texto, veces = 0, arranque = 0) => {
  let desde = arranque - texto.length;
  let linea = 0;

  for (let i = 0; i <= veces; i += 1) {
    desde = source.indexOf(texto, desde + texto.length);

    if (desde < 0)
      throw new Error(`«${texto}» no sale ${veces + 1} `
        + `${veces === 0 ? 'vez' : 'veces'} en el fuente`);

    linea = source.slice(0, desde).split('\n').length;
  }

  return linea;
};

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

/** Las sentencias `import` de un fuente, con su modulo y los nombres que traen —el
 *  `import { a, b } from './x.js'`, el `import x from './x.js'` y el que solo trae efecto
 *  (`import './x.js'`, que viene con `names` vacio)— y el namespace si lo trae
 *  (`* as todo`, que es un `namespace` y no una lista de nombres).
 *
 *  Vive aqui —el escaner base— porque tres cosas lo necesitan y tiene que ser el MISMO
 *  lector: el generador del barrel (que de lo que piden los consumidores saca la
 *  superficie), la meta-guardia (que vigila esa superficie) y el contrato del CI (que
 *  busca las reglas a medio declarar). Tres copias de un parser divergen, y el que
 *  divergiera seria el que decide que hay en el API. */
export function importStatements(source) {
  const found = [];

  for (const match of source.matchAll(/^import\s+([\s\S]*?);/gm)) {
    const body = match[1];
    const specifier = /(?:from\s*)?'([^']+)'\s*$/.exec(body);

    if (specifier == null)
      continue;

    const braces = /\{([^}]*)\}/.exec(body);
    const namespace = /\*\s*as\s+([\w$]*)/.exec(body);

    found.push({
      specifier: specifier[1],
      // El nombre que se PIDE, no el que se le da de otro nombre: en un
      // `import { x as y }` lo que el modulo tiene que exportar es `x`, que es lo que el
      // generador del barrel busca en las familias y lo que se compara con lo que el
      // modulo declara. Sin esto el alias entero se pedia como un nombre, ninguna
      // familia lo exportaba y el barrel decia que no lo tenia —un fallo que sale en el
      // fichero generado, a tres pasos del import que lo causo—.
      names: braces == null ? []
        : braces[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0])
          .filter((name) => name !== ''),
      namespace: namespace == null ? null : namespace[1],
    });
  }

  return found;
}

/** La llave que cierra la que abre en `start`, saltando cadenas y comentarios: lo que
 *  hace falta para leer el codigo de una interpolacion de una plantilla. */
function closingBrace(text, start) {
  let depth = 0;
  let i = start;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);

      i = newline < 0 ? text.length : newline;
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i);

      i = close < 0 ? text.length : close + 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }

    if (ch === '{' || ch === '[' || ch === '(')
      depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;

      if (depth === 0 && ch === '}')
        return i;
    }

    i += 1;
  }

  return text.length;
}

/** Vacia un tramo con espacios, dejando los saltos de linea donde estaban. */
const blanked = (chars, from, to) => {
  for (let j = from; j < to; j += 1)
    if (chars[j] !== '\n')
      chars[j] = ' ';
};

/** El fuente con el CONTENIDO de las cadenas vaciado: las comillas, los saltos y la
 *  sangria se quedan, para que un nombre siga en su linea y un numero de linea siga
 *  valiendo. Un nombre que solo esta dentro de un literal no es codigo, y una guardia
 *  que lee literales se deja sembrar por un fixture. La Plantilla es la excepcion: su
 *  texto se vacia pero sus interpolaciones se leen, porque ahi se construyen los mensajes
 *  de las guardias y therein hay referencias de verdad. */
export function withoutLiterals(text) {
  const chars = text.split('');
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/') {
      const slash = slashAt(text, i);

      if (slash.kind !== 'pattern' && slash.kind !== 'division')
        blanked(chars, i, slash.end);      // un comentario es codigo muerto
      // un regex NO es una cadena, pero trae comillas: si se leen como tales, la
      // primera abre una cadena fantasma que vacia el codigo que viene detras

      i = slash.end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = skipString(text, i);

      blanked(chars, i, end);
      i = end;
      continue;
    }

    if (ch === '`') {
      let j = i + 1;

      blanked(chars, i, i + 1);                 // la comilla de apertura

      while (j < text.length && text[j] !== '`') {
        if (text[j] === '\\') {
          blanked(chars, j, j + 2);
          j += 2;
          continue;
        }

        if (text[j] === '$' && text[j + 1] === '{') {
          blanked(chars, j, j + 2);            // el `${` de la interpolacion
          j = closingBrace(text, j + 1) + 1;   // y su codigo se conserva
          continue;
        }

        blanked(chars, j, j + 1);              // texto de la plantilla
        j += 1;
      }

      if (j < text.length)
        blanked(chars, j, j + 1);              // la comilla de cierre

      i = j + 1;
      continue;
    }

    i += 1;
  }

  return chars.join('');
}
