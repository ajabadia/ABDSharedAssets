/**
 * El diagrama «De un vistazo» de la guia, DERIVADO del audit, y las dos piezas de
 * texto que la guia repite de cada regla: su encabezado y la fila de la tabla.
 *
 * Las reglas salen del CATALOGO que compone el barrel (`./detectors.js`): una entrada por
 * regla, con su numero, su nombre (el detector), su titulo y su FLECHA. Las voces de cada
 * detector —DOC, CODE, EX— se derivan de los modulos del audit: un detector lee la voz de
 * sus semillas (`docBlocks`,
 * `optionReads`, `exampleMethodCalls`, ...) y la de todo lo que llama en cadena. Con
 * eso, y el lema de cada flecha, se montan las lineas del bloque: si un detector deja
 * de leer una voz, el diagrama que la guia muestra deja de ser el que el audit genera y
 * el contract lo delata. Pure functions: las reglas entran por parametro (el catalogo
 * por defecto), y el catalogo es el UNICO sitio donde se declara una regla.
 */

import { RULES } from './detectors.js';

/** Las voces del diagrama y las semillas que las leen: llamar a una de estas
 *  (directamente o a traves de otro detector) es leer esa voz. */
const VOICE_SEEDS = [
  ['DOC', ['docBlocks', 'documentedMembers', 'documentedDefaults', 'documentedParamTypes']],
  ['CODE', ['codeOnly', 'optionReads', 'codeDefaults', 'copiedOptions', 'entryShapeKeys',
    'entryParameters', 'classBody', 'classMembers', 'memberDeclarations', 'branchedLiterals']],
  ['EX', ['exampleBindings', 'exampleMethodCalls', 'exampleConstructions',
    'exampleMemberAccesses', 'exampleValues']],
];

/** Los nodos del diagrama: las tres voces con su subtitulo. */
const DIAGRAM_NODES = [
  'DOC["DOCUMENTACIÓN<br/>@param · listas · nombres"]',
  'CODE["CÓDIGO<br/>lecturas · defaults · firmas · normalizeEntry"]',
  'EX["EJEMPLOS (Usage:)<br/>new X(el, { ... }) · x.m(args) · x.prop"]',
];

/** Las flechas del diagrama, en orden: cada una agrupa las reglas cuya pareja de
 *  voces es la suya. El lema es lo que la flecha promete a quien lee la guia. */
const EDGES = [
  { from: 'DOC', to: 'CODE', arrow: '==>', slogan: 'lo documentado tiene que existir' },
  { from: 'CODE', to: 'DOC', arrow: '==>', slogan: 'lo que el código hace tiene que estar documentado' },
  { from: 'EX', to: 'CODE', arrow: '==>', slogan: 'la llamada del ejemplo cuadra con el código' },
  { from: 'EX', to: 'DOC', arrow: '==>', slogan: 'el argumento del ejemplo cuadra con el @param' },
  { from: 'CODE', to: 'CODE', arrow: '-->', slogan: 'coherencia interna del código' },
  { from: 'DOC', to: 'CODE', arrow: '==>', slogan: 'cada clave prometida (registro, typedef o @returns) se usa en el código' },
];

/** La flecha del diagrama a la que pertenece cada regla, leida del CATALOGO (el indice
 *  en EDGES): la tabla de reglas declara la suya y aqui solo se resuelve. El contract
 *  verifica que las voces del detector de la regla sostengan los dos extremos de SU
 *  flecha: una regla en una flecha que sus voces no sostienen no se dibuja, se delata. */
let flechasPorNumero = null;

/** El indice de la flecha de cada regla, hecho la PRIMERA vez que se pregunta y no al
 *  definirlo: el diagrama se apoya en el `RULES` del barrel, y el barrel ya incluye al
 *  diagnostico, que a su vez se apoya en el diagrama. Ese ciclo se rompe solo con esto —leer
 *  el catalogo al definir el mapa es leerlo mientras el barrel se compone todavia, y
 *  ahi `RULES` todavia no existe, que es un `TypeError` en la carga del modulo y no un
 *  fallo de diagnostico que nadie pueda leer—. Preguntado en caliente, cuando el barrel
 *  ya esta compuesto, el ciclo no se nota. */
const reglaEdge = (number) => (flechasPorNumero ??= Object.fromEntries(
  RULES.map(({ number: uno, edge }) => [uno, edge])))[number];

/** El titulo como lo GRITA la cabecera del audit: en mayusculas y sin acentos —
 *  el codigo del audit va sin ellos—, con los espacios colapsados. La cabecera
 *  grita y el catalogo susurra; es la misma palabra con dos voces, y la que decide
 *  de las dos es la entrada del catalogo. */
export const shouted = (text) =>
  String(text ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();

/** El titulo como lo imprime la guia: con la inicial en mayuscula, que un titulo de
 *  guia no empieza en minuscula (el catalogo guarda el titulo en minuscula, como lo
 *  escribe el `describe`). Un titulo que NO esta no se inventa: sale vacio, y lo que
 *  falta —el encabezado de la guia, la fila de la tabla, la linea de la cabecera— lo
 *  delata el diagnostico, que es quien tiene que saber que la entrada esta rota. */
export const shownTitle = (title) => {
  const texto = String(title ?? '');

  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
};

/** La cabecera numerada de una regla en la guia de «Las trece reglas…»:
 *  `**N. Título** (`detector`).`, con el titulo del catalogo y el nombre de su detector.
 *  La guia no repite ninguno de los dos a mano: se generan del catalogo. */
export function ruleHeading({ number, title, name }) {
  return `**${number}. ${shownTitle(title)}** (\`${name}\`).`;
}

/** Las cabeceras de las reglas de la guia, en orden. */
export function ruleHeadings(rules = RULES) {
  return rules.map(ruleHeading);
}

/** La FILA de la tabla de las trece reglas, INTEGRA: el numero con su celda
 *  alineada a la izquierda como la del repo, el titulo del catalogo tal y como lo
 *  imprime la guia, y la prosa que declara la entrada en su `about`. La columna
 *  «Qué persigue» es del CATALOGO y no un texto suelto de la guia: asi la
 *  tabla entera se genera, y una palabra cambiada en la prosa no puede quedarse
 *  cambiada en un solo lado. Que la prosa no lleve una barra vertical lo vigila el
 *  contrato, porque una barra a mas rompe la fila en dos sin que se note. */
export function ruleTableRow({ number, title, about }) {
  return `| ${String(number).padEnd(2)} | ${shownTitle(title)} | ${about} |`;
}

/** Las filas de la tabla, en orden de catalogo: lo que la guia tiene que imprimir, una
 *  detras de otra y sin tocar. */
export function ruleTableRows(rules = RULES) {
  return rules.map(ruleTableRow);
}

/** La cabecera y el separador de la tabla, que no salen de ninguna regla: son las
 *  dos lineas que abren el bloque. */
const TABLE_HEAD = '| #  | Regla | Qué persigue |';

const TABLE_RULE = '|----|-------|--------------|';

/** La tabla COMPLETA, tal y como la imprime la guia y tal y como la lee el
 *  contrato: cabecera, separador y las trece filas del catalogo, en su orden. Es una
 *  lista de LINEAS a proposito —la comparacion es linea a linea, que es lo que
 *  distingue una tabla regenerada de una tabla rehecha a mano—, y por eso el
 *  contrato no lee celdas: si dos filas cambian de sitio, o una prosa se queda sin
 *  su regla, la diferencia sale en la linea que las separa. */
export function ruleTable(rules = RULES) {
  return [TABLE_HEAD, TABLE_RULE, ...ruleTableRows(rules)];
}

/** La IDENTIDAD de la linea que abre una regla en la CABECERA del audit: el `N.` y el
 *  titulo DEL CATALOGO en mayusculas, tal y como lo proclama la cabecera. Lo que
 *  viene detras del dos puntos —la explicacion de la regla— es de la cabecera, pero
 *  esto no: quien sabe que se titula la regla 5 es la entrada, asi que la linea tiene
 *  que empezar por esto y no por una copia que se puede quedar vieja. La comparacion
 *  es de PREFIJO a proposito, y por eso el dos puntos se exige aparte. */
export function ruleHeaderLine({ number, title }) {
  return `${number}. ${shouted(title)}`;
}

/** Las lineas de la cabecera del audit, una por cada linea que abre una regla, con su
 *  numero para poder decir cual se separo. El bloque de la cabecera es un COMENTARIO que
 *  se lee de las tres piezas a la vez, asi que sus lineas no se generan enteras: se
 *  genera la identidad de cada una y se exige que el bloque las tenga todas, en orden,
 *  y que no sobre ninguna que el catalogo no tiene. */
export function ruleHeaderLines(rules = RULES) {
  return rules.map(ruleHeaderLine);
}

/** Los numeros y la identidad que delatan una linea de la cabecera del audit, leidas
 *  del bloque entero. La linea se parte por el dos puntos, que es donde acaba lo
 *  generado y empieza la prosa de la cabecera; una linea sin dos puntos no es una
 *  linea de regla y se queda fuera, que es justo lo que hay que ver. */
export function auditHeaderLines(source) {
  const lineas = [];
  let dentro = false;

  for (const linea of source.split(/\r?\n/)) {
    const abre = /^ *\* +(\d+)\. (.+)$/.exec(linea);

    if (abre != null) {
      const cut = abre[2].indexOf(':');

      if (cut > 0) {
        dentro = true;

        const number = Number(abre[1]);
        const title = abre[2].slice(0, cut).trim();

        lineas.push({ number, title, head: `${number}. ${title}` });
        continue;
      }
    }

    // la cabecera tiene DOS listas numeradas —las reglas y sus limites— y esta es la
    // primera: la linea en blanco que la cierra corta, que si no el bloque de limites
    // se cuela aqui y la comparacion de identidades sale con trece lineas de mas.
    if (dentro && linea.trim() === '*')
      break;
  }

  return lineas;
}

/** El bloque «De un vistazo» que la guia imprime, como lineas: el
 *  primero que abre tras SU TITULO, no el primero de la pagina. Se busca por el titulo
 *  a proposito —por su posicion, un diagrama nuevo por delante se llevaria la
 *  comparacion y el contrato estara mirando otro bloque sin enterarse—, y se devuelve
 *  null cuando no esta, que es lo que tiene que fallar. */
export function overviewBlock(source) {
  const at = source.search(/^### De un vistazo$/m);

  if (at < 0)
    return null;

  const fence = source.indexOf('```mermaid', at);
  const body = fence < 0 ? -1 : source.indexOf('\n', fence) + 1;

  if (body < 0)
    return null;

  const close = source.indexOf('```', body);

  if (close < 0)
    return null;

  const lines = source.slice(body, close).split(/\r?\n/);

  while (lines.at(-1) === '')
    lines.pop();

  return lines;
}

/** El ANCHO de la caja en la que se parte un bullet de límite honesto, medido en las
 *  líneas del comentario que lo lleva. No es el del fichero: el bullet va sangrado —
 *  cinco columnas para la primera línea, ocho para las de continuación—, así que lo que
 *  se mide es dónde acaba el texto. */
export const LIMIT_WIDTH = 76;

/** La caja de la prosa de la receta, en columnas: dos menos que el documento, que su
 *  blockquote tiene que dejar sitio a la etiqueta. */
export const ANCHO_PROSA = 92;

/** El ancho que le toca a una regla: el que declara su entrada, o el de la caja. El
 *  override existe porque la caja común no le sirve a todo el mundo: hay límites que
 *  partidos a setenta y cinco dejan una palabra suelta al final de la última línea, y
 *  forzar a los trece a la misma medida es dejar que ese bullet se lea de través. El que
 *  lo ensancha lo ensancha para sí —y solo para él—, y el bloque sigue cabiendo. */
export function limitWidthOf(rule) {
  return rule.limitWidth ?? LIMIT_WIDTH;
}

/** El bullet de un límite, ya partido en las líneas del comentario: la primera abre con su
 *  `N.`, las de continuación con la sangría de las otras. Parte por palabras al ancho de su
 *  regla, y devuelve las líneas TAL CUAL van escritas, porque el contraste de prosa no ve
 *  un bullet partido en otro sitio: al volver a unir las dos sale el mismo texto. */
export function limitBulletLines({ number, limit, limitWidth = LIMIT_WIDTH }) {
  const abre = ` *   ${number}. `;
  const sigue = ' *      ';
  const palabras = String(limit ?? '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let sangria = abre;
  let actual = '';

  for (const palabra of palabras)
    if (actual === '')
      actual = palabra;
    else if (`${sangria}${actual} ${palabra}`.length <= limitWidth)
      actual += ` ${palabra}`;
    else {
      lineas.push(sangria + actual);
      sangria = sigue;
      actual = palabra;
    }

  if (actual !== '')
    lineas.push(sangria + actual);

  return lineas;
}

/** Los límites honestos de las reglas, en orden de catálogo, ya partidos: las líneas del
 *  bloque, una por línea, cada bullet al ancho que declara su entrada. */
/** Un campo de prosa con los bordes fuera. `null` sigue siendo `null` —que es lo que
 *  significa que el campo no esté, y no lo que sea un texto vacío— y un texto con un
 *  espacio de más es el mismo texto: sin esto, un `about` que acaba en espacio daría un
 *  hueco fantasma en la fila de la tabla y otro en la prosa reunida. */
export const sinBordes = (campo) => (typeof campo === 'string' ? campo.trim() : campo);

/** La PROSA de una receta: sus dos campos OPCIONALES, que la guía imprime junto al bloque de
 *  mensaje. Son los mismos dos que los de la entrada —qué demuestra y hasta dónde—, con
 *  la diferencia de que estos hablan de la RECETA y no de la regla: del módulo que muta y
 *  de lo que el caso no llega a enseñar. Una receta puede no declarar ninguno, y entonces
 *  la guía no imprime nada: son opcionales de verdad, no dos campos más que rellenar. */
export const recipeProse = ({ recipe }) => [
  ...(recipe?.about == null ? []
    : [{ texto: recipe.about, nombre: 'la prosa de la receta', etiqueta: 'La receta prueba',
      vacio: 'declarada', sitio: 'la prosa de la receta' }]),
  ...(recipe?.limit == null ? []
    : [{ texto: recipe.limit, nombre: 'el límite de la receta', etiqueta: 'No llega a',
      vacio: 'declarado', sitio: 'el límite de la receta' }]),
];

/** La prosa de un blockquote, partida como el resto del documento: la primera línea con su
 *  etiqueta y las siguientes colgadas dos espacios, sin partir palabras ni pasar del ancho. */
function prosaDeRecetaLineas(etiqueta, texto) {
  const abre = `> **${etiqueta}:** `;
  const sigue = '>   ';
  const palabras = String(texto ?? '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let sangria = abre;
  let actual = '';

  for (const palabra of palabras)
    if (actual === '')
      actual = palabra;
    else if (`${sangria}${actual} ${palabra}`.length <= ANCHO_PROSA)
      actual = `${actual} ${palabra}`;
    else {
      lineas.push(`${sangria}${actual}`);
      sangria = sigue;
      actual = palabra;
    }

  lineas.push(`${sangria}${actual}`);

  return lineas;
}

/** Las líneas de la guía que explican la receta, GENERADAS del catálogo: un blockquote por
 *  campo declarado y nada si no declara ninguno, con una línea en blanco entre los dos.
 *  Van DESPUÉS del bloque de mensaje, que es lo que explican. */
export function recipeProseLines({ recipe }) {
  return recipeProse({ recipe })
    .map(({ etiqueta, texto }) => prosaDeRecetaLineas(etiqueta, sinBordes(texto)))
    .flatMap((lineas, una) => (una === 0 ? lineas : ['', ...lineas]));
}

export function ruleLimitLines(rules = RULES) {
  return rules.flatMap(limitBulletLines);
}

/** Si la cabecera lleva el bloque de «Límites honestos», aunque no tenga ni un bullet:
 *  no es lo mismo un bloque vacio —que se puede rellenar— que un bloque que no esta, que
 *  es un hueco de la cabecera entera y se reporta como tal en vez de trece veces. */
export function hasLimitBlock(source) {
  return /^ \* Límites honestos/m.test(source);
}
/** El bloque de «Límites honestos» de la cabecera del audit, leido regla a
 *  regla con su prosa reunida Y con sus lineas: el bullet de un comentario se reparte
 *  en varias, asi que se lee el bloque entero y cada `N.` se junta con lo que viene
 *  debajo suyo. Las lineas de la entradilla, que no son de ninguna regla, se quedan
 *  fuera: solo se junta cuando ya hay un limite al que colgarse. Sin bloque, vacio. */
export function headerLimitLines(source) {
  if (!hasLimitBlock(source))
    return [];

  const at = source.search(/^ \* Límites honestos/m);

  const fin = source.indexOf('\n *\n', at);
  const bloque = source.slice(at, fin < 0 ? source.length : fin).split(/\r?\n/);
  const limites = [];

  for (const linea of bloque) {
    const abre = /^ \* +(\d+)\. (.+)$/.exec(linea);

    if (abre != null) {
      limites.push({ number: Number(abre[1]), limit: abre[2].trim(), lineas: [linea] });
      continue;
    }

    const sigue = /^ \* {6}(.+)$/.exec(linea);

    if (sigue != null && limites.length > 0) {
      limites[limites.length - 1].limit += ' ' + sigue[1].trim();
      limites[limites.length - 1].lineas.push(linea);
    }
  }

  return limites;
}

/** Las lineas de los BULLETS del bloque, tal cual estan escritas y en orden: lo que se
 *  compara linea a linea, porque es la unica forma de que un bullet partido en otro sitio
 *  —o con otro ancho— salga. Un bloque sin bullets devuelve vacio. */
export function headerLimitBlock(source) {
  return headerLimitLines(source).flatMap(({ lineas }) => lineas);
}

/** Los NOMBRES que un texto MENCIONA, como un conjunto. Es lo que evita compilar un
 *  regex por cada par del cierre: el par más caro no es el que se prueba, es COMPILAR la
 *  prueba. Un identificador con `$` entra entero (`$foo` es un nombre), y las palabras
 *  reservadas tambien, que da igual: lo que se busca es siempre el de una declaracion. */
const menciones = (cuerpo) => new Set([...cuerpo.matchAll(/[A-Za-z_$][\w$]*/g)]
  .map((match) => match[0]));

/** El GRAFO del audit — declaracion -> a quien ALCANZA—: los nombres que su
 *  cuerpo menciona y que son declaracion. El cuerpo entero no se guarda, porque el cierre
 *  solo necesitaba saber a quien menciona — y guardado era guardarlo de mas.
 *
 *  Se MEMORIZA por la identidad del mapa de fuentes, que en el contrato es el mismo objeto
 *  en los sesenta tests: sin eso, los 34 ficheros de la maquinaria se releen y se vuelve a
 *  trocear en cada llamada. La clave es el `Map` y no su contenido, asi que un mapa nuevo —
 *  el de un test — recalcula, que es lo que tiene que pasar. */
const GRAFOS = new WeakMap();

function declarationGraph(familySources) {
  if (GRAFOS.has(familySources))
    return GRAFOS.get(familySources);

  const cuerpos = new Map();

  for (const source of new Set(familySources.values())) {
    const marks = [...source.matchAll(/^(?:export\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)];

    for (const [at, mark] of marks.entries())
      cuerpos.set(mark[1], source.slice(mark.index,
        at + 1 < marks.length ? marks[at + 1].index : source.length));
  }

  const grafo = new Map();

  for (const [name, cuerpo] of cuerpos) {
    const alcanzados = new Set();

    for (const mencionado of menciones(cuerpo))
      if (cuerpos.has(mencionado))
        alcanzados.add(mencionado);

    grafo.set(name, alcanzados);
  }

  GRAFOS.set(familySources, grafo);

  return grafo;
}

export function reachableFrom(names, familySources) {
  const grafo = declarationGraph(familySources);
  const reached = new Set(names.filter((name) => grafo.has(name)));
  const cola = [...reached];

  // Una pasada por arista, driven por una cola: de cada nombre alcanzado se mira a quien
  // alcanza, y lo que aparezca se encola. Antes era repetir hasta que no creciera, que
  // hacia lo mismo mirando n nombres por cada alcanzado y por cada ronda — y con
  // las 349 declaraciones de este audit eso era el 90% del diagnostico. El punto fijo es el
  // mismo, que es lo que importa: lo que el guard delata no cambia, solo lo tarda.
  for (let at = 0; at < cola.length; at += 1)
    for (const siguiente of grafo.get(cola[at])) {
      if (reached.has(siguiente))
        continue;

      reached.add(siguiente);
      cola.push(siguiente);
    }

  return reached;
}
/** Las voces que alimenta un detector: las de sus semillas y las de todo lo que
 *  llama dentro de las familias, en cadena. `memo` corta los ciclos. */
export function detectorVoices(name, familySources, memo = new Map()) {
  const cached = memo.get(name);

  if (cached != null)
    return cached;

  const voices = new Set();

  memo.set(name, voices);

  for (const [voice, seeds] of VOICE_SEEDS)
    if (seeds.includes(name))
      voices.add(voice);

  const source = familySources.get(name);

  if (source != null)
    for (const match of source.matchAll(/\b([a-z][A-Za-z0-9]*)\s*\(/g))
      for (const voice of detectorVoices(match[1], familySources, memo))
        voices.add(voice);

  return voices;
}

/** La flecha a la que el diagrama asigna una regla (undefined si no la tiene). */
export function edgeOfRule(number) {
  return EDGES[reglaEdge(number)];
}

/** Las lineas del bloque «De un vistazo»: los nodos fijos y, por cada flecha con
 *  reglas asignadas, su lema con los numeros de las reglas REALES que la sostienen. El
 *  bloque se monta de las reglas que se le pasen —el catalogo por defecto; el unitario
 *  del contrato le da una lista sintetica—. Una regla sin flecha no se dibuja: revienta
 *  aqui, en vez de desdibujar el diagrama en silencio. */
export function overviewDiagramLines(rules = RULES) {
  if (rules.length === 0)
    throw new Error('no hay reglas que dibujar');

  const members = new Map();

  for (const { number, title, edge } of rules) {
    if (edge == null)
      throw new Error(`la regla ${number} (${title}) no tiene flecha en el diagrama`);

    if (!members.has(edge))
      members.set(edge, []);

    members.get(edge).push(number);
  }

  const lines = ['flowchart TB', ...DIAGRAM_NODES.map((node) => `  ${node}`), ''];

  for (const [at, edge] of EDGES.entries()) {
    const group = members.get(at);

    if (group == null)
      continue;

    lines.push(`  ${edge.from} ${edge.arrow}|"${group.join(' · ')} — ${edge.slogan}"| ${edge.to}`);
  }

  return lines;
}

