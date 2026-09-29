/**
 * El DIAGNOSTICO del catalogo y el INFORME que se imprime en el CI: que sitios le
 * faltan a cada regla declarada, con su clase y su sitio, y el bloque resumen que los
 * cuenta. Vive aqui y no en el contrato porque el INFORME es del AUDIT, no de la puerta
 * que lo corre: el contrato lo invoca con el contexto de este repo —el catalogo, la
 * guia, la cabecera y los fuentes— y compara lo que sale, y los unitarios del audit lo
 * muerden con entradas sinteticas, que es lo que se puede hacer sin un repo delante.
 *
 * Modulo PURO (no lee el disco, no habla con vitest): TODO entra por el parametro de la
 * llamada, el catalogo y los fuentes incluidos. Quien los lee es `modules.js`, el unico
 * sitio del paquete que toca el disco, y quien decide que se le pasen es el que trae
 * el repo —el contrato— o un test que los monta a mano.
 */

import {
  auditHeaderLines,
  detectorVoices,
  edgeOfRule,
  hasLimitBlock,
  headerLimitBlock,
  headerLimitLines,
  limitBulletLines,
  limitWidthOf,
  overviewBlock,
  overviewDiagramLines,
  reachableFrom,
  recipeProse,
  recipeProseLines,
  ruleHeading,
  ruleHeadings,
  ruleLimitLines,
  ruleTable,
  ruleTableRow,
  shouted,
  sinBordes
} from './diagram.js';
import {
  closingIndex,
  importStatements,
  lineLocator,
  withoutComments,
  withoutLiterals,
} from './scan.js';
import { splitTopLevel } from './split.js';

/** Los avisos de CLAVE REPETIDA de una lista de modulos, uno por clave y ya con la
 *  RUTA COMPLETA del modulo que hay que abrir (`tests/audit/records.js`,
 *  `components/knob.js`). Siempre la ruta, nunca la etiqueta a secas: la de un control es un
 *  nombre pelado —`knob.js`— que en el log no dice ni de donde es, y lo que mas importa es el
 *  caso de dos modulos HOMONIMOS, que es donde un nombre a secas deja dos avisos que no se
 *  distinguen y la ruta si (`components/knob.js` y `components/sub/knob.js`). Antes de
 *  mirar los controles solo se cualificaba con la homonimia, y era codigo muerto: todos los
 *  modulos del audit que avisan son de la raiz, asi que la condicion no tendria ni un caso.
 *
 *  El filtro de lo que SE BARRA lo pasa quien llama, porque es del AUDIT y no del helper: un
 *  modulo de `rules/` tiene su propio aviso por regla, que ademas dice mas. Un modulo al
 *  que le falte la ruta —uno de mentira, de un test— cae a la etiqueta, que es lo unico que
 *  se le puede decir. */
const avisosDeClavesRepetidas = (modulos, seBarren = () => true) => {
  const avisos = [];

  for (const { ruta, label, source } of modulos.filter(seBarren))
    for (const [clave, lineas] of clavesRepetidasDelModulo(source))
      avisos.push(`${ruta ?? label}: la clave ${clave} está declarada ${lineas.length} veces `
        + `(líneas ${lineas.join(', ')})`);

  return avisos;
};

/* --- Los lectores de la guia y de la cabecera -------------------------- */

/** Las cabeceras numeradas de «Las trece reglas…» de la guia, en orden: el texto entero
 *  `**N. Título** (`detector`).` con el que abre cada ejemplo. */
export function documentedRuleHeadings(source) {
  return [...source.matchAll(/^\*\*\d+\.[^*]*\*\* \(`[^`]+`\)\./gm)].map((match) => match[0]);
}

/** Los numeros y el titulo con el que la CABECERA del audit abre cada regla, leidos
 *  con el mismo lector que genera la identidad de esas lineas (`auditHeaderLines`): el
 *  bloque de la cabecera es un comentario entero, asi que leerlo es cosa de la capa
 *  que dibuja, no del contrato. El mapa es para poder preguntar por numero. */
export const headerTitles = (source) =>
  new Map(auditHeaderLines(source).map(({ number, title }) => [number, title]));

/** La columna Titulo de la tabla de las trece reglas tal y como la guia las
 *  imprime: numero -> titulo, y EN ORDEN (el `Map` conserva el orden de lectura). La
 *  fila no se comprueba aqui —eso lo hace la fila GENERADA del catalogo, que ademas
 *  fija la celda del numero—, pero si el orden en que la guia las lista y el que una
 *  regla que el catalogo no tiene. */
export function documentedRuleTitles(source) {
  const titles = new Map();

  for (const match of source.matchAll(/^\| *(\d+) *\| *([^|]+?) *\|/gm))
    titles.set(Number(match[1]), match[2]);

  return titles;
}

/* --- La prosa: cuando dos textos de una entrada son el mismo ---------- */

/** La RACHA de palabras que dos textos comparten, o `''` si no llega a ser un empalme.
 *
 *  La prosa de la tabla —qué persigue la regla— y el límite honesto —qué NO juzga— son dos
 *  textos de la misma entrada que van a dos sitios distintos, y el modo de que uno se
 *  contagie al otro es copiarlo: la entrada sigue con sus dos campos, ninguno está vacío,
 *  la tabla se sigue viendo igual de guapa y el bloque de límites sale con un párrafo
 *  repetido. Eso no lo delata ni el catálogo ni la comparación línea a línea, así que lo
 *  tiene que delatar el contrato.
 *
 *  Un empalme NO es cualquier coincidencia: hace falta que la racha se coma media
 *  parte del texto más corto. Compartir `el código lee` o `una entrada de un solo
 *  parámetro` es compartir el alcance de la regla —que es lo que tienen que hacer las dos
 *  prosas, una desde dentro y la otra desde fuera—; un párrafo pegado, en cambio, se
 *  come el campo entero. Y se comparan palabras sin tildes ni signos, que
 *  `de eso responde la 2` es la misma cita se escriba con o sin backticks. */
const RACHA_PROSA = 3;

const TROCEAR_PALABRAS = (texto) => String(texto)
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean);

/** Las PALABRAS de un texto, ya normalizadas, y MEMORIZADAS por el texto mismo. Un texto
 *  entra en muchos pares —la prosa de una entrada contra su limite, sus citas y las de las
 *  demas reglas— y volvia a trocearse en cada comparacion: era el primer coste del
 *  diagnostico tibio, por encima del propio cruce.
 *
 *  La memoria se queda con el MAXIMO de la entrada mas larga de la prosa, que es lo que
 *  hay: trece reglas con sus dos campos y sus citas, no un fichero que crece con el
 *  numero de llamadas. Y lo que sale no se MODIFICA nunca —`sharedProse` solo lo lee—, que
 *  es la condicion para que compartirlo no pueda cambiar nada. */
const MAX_PALABRAS = 4096;
const PALABRAS = new Map();

/** Una entrada de la memoria: las palabras del texto Y la tabla de donde esta cada una, que
 *  es lo que se levanta una vez por texto. La tabla va en la MISMA entrada porque sale del
 *  mismo troceado, y separarlas serian dos viajes al mismo texto. El cruce del catalogo son
 *  setecientos ochenta pares sobre treinta y ocho textos distintos, que es donde se nota:
 *  antes la tabla se hacia una vez por par y ahora una vez por texto.
 *
 *  Lo que sale no se MODIFICA nunca —`sharedProse` solo lo lee—, que es la condicion para
 *  que compartirlo no pueda cambiar nada. Y cuando la memoria llega al tope se va la MAS
 *  VIEJA, que es un tope y no una medida: el catalogo son trece reglas, y un tope no se
 *  equivoca con cuantas vengan. */
const palabrasDe = (texto) => {
  const clave = String(texto);
  const guardado = PALABRAS.get(clave);

  if (guardado !== undefined)
    return guardado;

  const palabras = TROCEAR_PALABRAS(clave);
  const donde = new Map();

  for (let i = 0; i < palabras.length; i += 1) {
    const veces = donde.get(palabras[i]);

    if (veces)
      veces.push(i);
    else
      donde.set(palabras[i], [i]);
  }

  const entrada = { palabras, donde };

  if (PALABRAS.size >= MAX_PALABRAS)
    PALABRAS.delete(PALABRAS.keys().next().value);

  PALABRAS.set(clave, entrada);

  return entrada;
};
/** La racha compartida más larga de dos textos, si llega a `RACHA_PROSA`; `''` si no. */
export function sharedProse(una, otra) {
  const a = palabrasDe(una);
  const b = palabrasDe(otra);

  // Un texto mas corto que la racha minima no puede dar una racha que llegue, y no es una
  // heuristica: el final de abajo comparaba `mejor` contra `RACHA_PROSA`, y un texto de dos
  // palabras sale con `mejor` de dos como mucho. Las citas del catalogo son de seis palabras
  // de media y varias son mas cortas, que es justo de donde se ahorra.
  if (a.palabras.length < RACHA_PROSA || b.palabras.length < RACHA_PROSA)
    return '';

  const palabras = a.palabras;
  const otras = b.palabras;
  let mejor = 0;
  let racha = '';

  // El par de bucles crudo era cuadrático sobre el numero de palabras, y la mayor parte de
  // esos pares no podia hacer NADA: cuando las dos palabras del par no coinciden la racha
  // sale de longitud cero, y `0 > mejor` no es cierto nunca, ni al principio ni despues.
  // Aqui solo se miran los indices donde las dos palabras coinciden, y en el MISMO orden
  // que antes -i de menor a mayor, y dentro de cada i las j de menor a mayor-, de modo que
  // el maximo y el desempate salen igual.
  for (let i = 0; i < palabras.length; i += 1) {
    const candidatos = b.donde.get(palabras[i]);

    if (candidatos == null)
      continue;

    for (const j of candidatos) {
      const tope = Math.min(palabras.length - i, otras.length - j);
      let n = 0;

      while (n < tope && palabras[i + n] === otras[j + n])
        n += 1;

      if (n > mejor) {
        mejor = n;
        racha = palabras.slice(i, i + n).join(' ');
      }
    }
  }

  const medio = Math.min(palabras.length, otras.length) / 2;

  return mejor >= RACHA_PROSA && mejor >= medio ? racha : '';
}
/** Un texto corto para el aviso: la racha compartida entera puede ser el párrafo copiado,
 *  y lo que hay que leer es DONDE empieza el empalme, no volver a leer la prosa entera. */
export const recorte = (texto, hasta = 6) => {
  const palabras = texto.split(' ');

  return palabras.length > hasta ? `${palabras.slice(0, hasta).join(' ')}…` : texto;
};

/** Las CITAS de una receta que estan DECLARADAS y en blanco, por su numero. Una receta
 *  sin citas no sale de aqui —eso es una entrada a medio declarar, y lo avisa otra parte
 *  con su propio texto—, y un hueco de espacios es el mismo descuido que en blanco, que
 *  es lo que hace el `sinBordes` de cada cita. Cada hueco es un descuido DISTINTO —una
 *  lista de mensajes con uno vacio no es un hueco, son dos cosas— y por eso se listan
 *  todos en vez de contarlos juntos. */
const citasEnBlanco = (receta) => (receta?.cited ?? [])
  .map((texto, indice) => (sinBordes(texto) === '' ? indice + 1 : 0))
  .filter((indice) => indice > 0);

/* --- El bloque de mensaje que la guia imprime por receta -------------- */

/** El bloque `text` que la guia imprime para una receta: la linea que vitest ensena
 *  (modulo + sufijo del `it`) y su volcado de esperado, con las citas de la receta. Se
 *  GENERA de la receta; la guia solo lo imprime. Si una receta cambia de modulo, de
 *  citas o de detector —o el `it` de rules.js cambia de texto—, este bloque cambia y la
 *  guia que no lo siga deja de contenerlo. */
export function guideMessageBlock({ module, cited }, suffix) {
  return [
    `${module}: ${suffix}`,
    `expected [ ${cited.map((value) => `'${value}'`).join(', ')} ] to deeply equal []`,
  ].join('\n');
}

/* --- Los limites del bloque de la cabecera --------------------------- */

/** Un limite DECLARADO y con texto dentro, que es lo que el bloque de la cabecera tiene
 *  que traer. Un limite que no esta no cuenta: es una entrada a medio declarar, y lo avisa
 *  su propio sitio. Y uno declarado y EN BLANCO tampoco, que ya tiene su aviso de descuido
 *  —sin el `sinBordes` de aqui, un hueco de espacios pasaba el filtro por no ser la cadena
 *  vacia y salia en el aviso agrupado como si el bloque entero lo hubiera perdido, con lo
 *  que un unico hueco se contaba dos veces en el mismo diagnostico: una vez por su regla y
 *  otra en la lista de las trece—. */
export const limiteConTexto = (limit) => {
  const limpio = sinBordes(limit);

  return limpio != null && limpio !== '';
};

/* --- Las claves repetidas: en una entrada, en un detector, en todas -- */

/** Las CLAVES de primer nivel que un literal declara, con la linea de cada una, en el
 *  orden en que salen del fuente. Se parte con el LECTOR COMPARTIDO —el cierre por
 *  anidamiento y la coma de nivel 0— y no con un regex propio, porque un `{` dentro de un
 *  texto (una cadena de un `mutate`) partira el bloque por donde no es y la cuenta saldria
 *  de otra cosa. De las claves se queda solo el nombre: lo que sigue al `:` es el valor,
 *  que aqui no interesa.
 *
 *  Se aceptan las DOS formas que declaran una clave. Con valor (`{ a: 1 }`), que es la que
 *  se leia antes. Y sin valor (`{ a, a }`), que en un literal es forma abreviada y en la
 *  firma de una funcion o en un `const` es un binding: `function f({ a, a }) {}` o
 *  `const { a, a } = opts`. Esa segunda es la que se perdia, porque el lector exigia los
 *  dos puntos, y es el mismo descuido con el mismo arreglo — en los dos casos lo que se
 *  repite es la clave del objeto del que se lee, y la anterior se va sin dejar rastro —
 *  asi que el aviso no distingue: el arreglo es borrar una de las dos lineas, y en las dos
 *  formas es la misma. Un `...spread` no es una clave y no cuenta, y una llamada dentro de
 *  una parte (`metodo()`) tampoco: no son el nombre de una clave.
 */
export function clavesDePrimerNivel(source, desde) {
  const cierra = closingIndex(source, desde);
  // El numero de linea se pide por la tabla de saltos del fuente, no recontando desde el
  // principio: son cientos de claves y el `slice` entero se repetia por cada una.
  const lineaDe = lineLocator(source);

  if (cierra < 0)
    return [];

  const cuerpo = source.slice(desde + 1, cierra);
  // El OFFSET de cada parte se lleva a mano porque `splitTopLevel` devuelve los trozos
  // y no donde estaban: sin el, el numero de linea seria el de la llave de apertura y
  // dos claves repetidas en lineas distintas saldrian a la misma.
  let desdeParte = desde + 1;

  return splitTopLevel(cuerpo).flatMap((parte) => {
    const inicio = desdeParte;
    // La clave con su valor, o la que no lo trae: los dos puntos, o el FIN de la parte, que
    // es donde acaba un patron. Lo que hay entre medias — una llamada, un punto, un
    // signo — no es el nombre de una clave y se queda fuera.
    const match = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?::|$)/.exec(parte);

    desdeParte += parte.length + 1;

    if (match == null)
      return [];

    // Y la linea que se cita es la de la CLAVE, no la del blanco que la precede: la
    // parte empieza en la coma de antes, y el salto de linea va justo detras de la coma,
    // asi que contarlo desde ahi sale una linea menos —un numero que no esta en ningun
    // editor, que es donde quien limpia el descuido va a mirar—.
    const aqui = inicio + (parte.length - parte.trimStart().length);

    return [{
      nombre: match[1] ?? match[2] ?? match[3],
      linea: lineaDe(aqui),
    }];
  });
}

/** Una clave de primer nivel DECLARADA DOS VECES en el mismo objeto literal. En JavaScript
 *  la ultima gana y la anterior no deja ni un rastro en el objeto ya evaluado: el catalogo
 *  sale entero, la guia imprime el texto de la segunda, y la primera es codigo muerto que
 *  no se ve hasta que alguien la edita creyendo que es la que manda. Por eso esto se mira
 *  en el FUENTE y no en el objeto —el objeto ya no lo sabe— y por eso el aviso sale de
 *  aquí y no de un hueco de prosa. */
export function clavesRepetidas(source, desde) {
  const vistas = new Map();

  for (const { nombre, linea } of clavesDePrimerNivel(source, desde)) {
    if (vistas.has(nombre))
      vistas.set(nombre, [...vistas.get(nombre), linea]);
    else
      vistas.set(nombre, [linea]);
  }

  return [...vistas].filter(([, lineas]) => lineas.length > 1);
}

/** Donde se abre CADA objeto literal de un fuente, y no solo el de nivel mas arriba: la
 *  lectura NO salta al cierre de una llave, sino que sigue leyendo dentro, porque el
 *  literal que se cuela en el valor de una clave —o en el cuerpo de un `map`— tambien
 *  declara sus claves y tambien puede tener una repetida. Y sigue entrando dentro de una
 *  PLANTILLA tiene dos mitades y se miran distinto, que es lo que se creia al reves: su
 *  TEXTO no se ve —un `{ a, a }` escrito dentro de una plantilla es un ejemplo, no codigo
 *  que corra — y el codigo de sus INTERPOLACIONES ${…} si, porque ahi hay
 *  una expresion de verdad y se lee como el codigo de al lado. Lo mismo con una CADENA: su
 *  contenido no se ve, y ahi si tiene que ser asi —un fixture, el `mutate` de una
 *  receta, el codigo de ejemplo de un test es codigo FALSO que nadie ha ejecutado, y
 *  delatarlo seria inventar un fallo. Una llave que no es de un literal —un bloque, el cuerpo de una clase —
 *  no da ningun problema: `clavesDePrimerNivel` no le saca clave de primer nivel, y si no
 *  cierra devuelve la lista vacia.
 *
 *  Las llaves se buscan con los DOS LECTORES DE `scan.js` —comentarios y contenido de
 *  cadenas — y no con un recorrido a pelo del fuente, y no solo por SENCILLEZ: el fuente entero de
 *  este audit esta lleno de ejemplos de codigo en su prosa, y una llave de ejemplo no es
 *  un literal real. Los dos lectores conservan la longitud y los saltos de linea, asi que
 *  los indices y los numeros de linea siguen valiendo —eso si, de leerlos sobre el texto
 *  vaciado, y no sobre una copia distinta— — y de paso resuelven la plantilla como
 *  toca: su texto se vacia y el codigo de sus interpolaciones se queda, que es codigo de
 *  verdad. Un recorrido propio que saltara comillas con el lector de cadenas se comia el
 *  codigo entero en cuanto la prosa dejaba un backtick sin pareja, que es exactamente lo
 *  que hacia este guard delatarse a si mismo antes de arreglarlo. */
export function indicesDeLiterales(source) {
  const indices = [];
  const codigo = withoutLiterals(withoutComments(source));

  for (let i = 0; i < codigo.length; i += 1)
    if (codigo[i] === '{')
      indices.push(i);

  return indices;
}

/** Las claves declaradas DOS VECES en CUALQUIER objeto literal de un modulo del audit, con
 *  las lineas donde se repite. El aviso lo da el MODULO y no una entrada del catalogo,
 *  porque un detector no pertenece a una regla: lo que se repite ahi es codigo comun, y lo
 *  que sale es el mismo descuido con su mismo arreglo —borrar la linea que se puso de
 *  mas—, asi que comparte sitio con el de las entradas y el resumen los cuenta juntos.
 *
 *  Y el hallazgo se MEMORIZA por el propio fuente, no por el nombre del modulo, porque el
 *  diagnostico se corre una vez por test y releer quince fuentes en cada corrida se nota:
 *  con la clave siendo el texto, el modulo de verdad se lee una vez y uno que llega
 *  cambiado —el de un test— se vuelve a mirar solo, que es justo lo que tiene que pasar. */
const REPETIDAS_POR_FUENTE = new Map();

export function clavesRepetidasDelModulo(source) {
  if (!REPETIDAS_POR_FUENTE.has(source))
    REPETIDAS_POR_FUENTE.set(source, indicesDeLiterales(source)
      .flatMap((desde) => clavesRepetidas(source, desde)));

  return REPETIDAS_POR_FUENTE.get(source);
}

/** Donde estan los DOS literales de una entrada en el fuente de su modulo: el de la
 *  entrada —`export const nombreRule = {`— y el de su receta, que cuelga de la clave
 *  `recipe:` de ese mismo literal. Se buscan en el fuente y no en el objeto porque el
 *  objeto ya no dice nada de una clave repetida, que es justo lo que se viene a mirar.
 *  Una receta que no declara `recipe:` devuelve -1 y no es un fallo: la receta es
 *  opcional y sin ella el aviso de la entrada a medio declarar es el que habla. */
export function literalesDeEntrada(source, nombre) {
  // El `String.raw` no es cosa de estetica: en una PLANTILLA `\s` no es una barra y una
  // `s`, es la LETRA `s` —el escape de la barra se la come la propia plantilla—, y el
  // patron se queda pidiendo `export const unreadEntryKeysRules` pegado al `=`, que no
  // esta en ningun fuente porque el `=` va con espacios. Un regex mal escrito aqui no
  // avisa de nada: `exec` devuelve null, la entrada vale -1 y el guard entero se calla,
  // que es justo lo que delata un guard que no se ha mordido nunca.
  const entrada = new RegExp(String.raw`export const ${nombre}Rule\s*=\s*\{`).exec(source);

  if (entrada == null)
    return { entrada: -1, receta: -1 };

  const desde = entrada.index + entrada[0].length - 1;
  const cierra = closingIndex(source, desde);
  const receta = /\n\s*recipe:\s*\{/.exec(
    source.slice(desde, cierra < 0 ? undefined : cierra));

  return {
    entrada: desde,
    receta: receta == null ? -1 : desde + receta.index + receta[0].length - 1,
  };
}

/* --- Las reglas a medio declarar ------------------------------------- */

/** Los nombres que un fuente pide a un modulo —el `import { … } from 'especificador'`,
 *  en el orden del bloque—: la lista que declara que se usa, sin resolver. Se lee con el
 *  MISMO lector que la meta-guardia y el generador del barrel, que son los que deciden
 *  que hay en el API del audit: tres copias de un parser, tres verdades. */
export function importedNames(source, specifier) {
  return importStatements(source)
    .filter((statement) => statement.specifier === specifier)
    .flatMap((statement) => statement.names);
}

/** Las reglas a MEDIO declarar: detectores que los auto-tests ya ejercitan y a los que la
 *  maquinaria de las reglas no alcanza —no los corre nadie contra el inventario—.
 *
 *  Antes de esto el caso era invisible: el meta-guard de exports los ve EJERCITADOS (por
 *  sus propios auto-tests, que es justo lo que hace que el autor los de por terminados), y
 *  el del catalogo solo mira si cada modulo tiene entrada. Un detector con auto-tests y sin
 *  entrada pasaba la suite entera.
 *
 *  El alcance son las raices que la entrada de las reglas importa mas el cierre del grafo
 *  (`reachableFrom`): lo que de verdad se corre. Un nombre que solo aparece en un auto-test
 *  no lo alcanza nadie, y eso es justo lo que se quiere delatar. Un nombre que ni siquiera
 *  esta declarado en un modulo del audit no se mira aqui (de ese responde la meta-guardia
 *  del barrel, que lo delata por no existir). */
export function halfDeclaredRules({ catalogo, rules, autoTests, families }) {
  const reached = reachableFrom(
    [...new Set(importedNames(rules, './detectors.js')),
      ...catalogo.map((rule) => rule.name)],
    families);

  return importedNames(autoTests, './detectors.js')
    .filter((name) => families.has(name) && !reached.has(name));
}

/* --- Las recetas y sus sitios ---------------------------------------- */

/** Las CITAS de una receta, una por bloque de la guia: el caso base y, si lo declara, el
 *  de fabrica, que se imprime como un bloque aparte. Cada cita es el texto que la guia
 *  ensena dentro de su `expected [ ... ]`. */
export function recipeCases({ recipe }) {
  const citas = (una, form) => (una?.cited ?? []).map((texto) => ({ texto, form }));

  return [
    ...citas(recipe, ''),
    ...(recipe?.factory == null ? [] : citas(recipe.factory, ' (el caso de fabrica)')),
  ];
}
/** Los SITIOS que le faltan a una regla a medio declarar: los mismos que el diagnostico
 *  enumera para una declarada, uno por linea, para que el arreglo sea una lista y no un
 *  misterio. */
export const HALF_SITES = [
  'número de regla',
  'título',
  'aserción',
  'prosa de la tabla',
  'receta (módulo real, citas, mutate y safe)',
  'flecha en el diagrama',
  'encabezado en la guía',
  'fila en la tabla de la guía',
  'línea en la cabecera del audit',
  'límite honesto en la cabecera',
  'bloque de mensaje en la guía',
];

/* --- El diagnostico y el informe ------------------------------------- */

/** El DIAGNOSTICO del catalogo: por cada regla DECLARADA, TODOS los sitios donde tiene
 *  que estar —su detector, su titulo, su asercion, su receta, su flecha, el encabezado y
 *  la fila de la guia, la linea de la cabecera y su bloque de mensaje— y si esta; y al
 *  reves, cada sitio de la guia que nombre una regla que el catalogo no tiene. Devuelve
 *  la lista de lo que falta: una regla a medio cablear —el caso de un detector nuevo, que
 *  empieza por su entrada— sale ENTERA de una vez, en vez de fallar en el primer sitio y
 *  esconder los demas. Y al reves del todo: un detector al que la maquinaria de las
 *  reglas no alcanza, al que solo exercitan sus propios auto-tests, sale como la regla a
 *  MEDIO declarar que es, con la lista de sitios. Un detector que no tiene NINGUNA entrada
 *  y ademas no lo ejercita nadie sigue siendo de la meta-guardia, que delata el export
 *  sin uso.
 *
 * Cada hueco vuelve con su clase —descuido, a medio declarar o sitio—, que no se deduce de
 * su texto y por eso se apunta al empujarlo: `ruleGaps` es la misma lista, sin clases, y
 * `resumenDiagnostico` la cuenta. */
export function diagnostico({
  catalogo, guide, header, rules, autoTests, families, modulos, libreria,
}) {
  const huecos = [];
  // Cada hueco sabe lo que ES y de DONDE sale, porque el texto solo no lo dice. Un DESCUIDO
  // es un campo declarado y en blanco, y su arreglo es borrar la linea que se puso de mas;
  // una entrada A MEDIO DECLARAR es a la que le falta una pieza, y su arreglo es cablearla; un
  // hueco de SITIO es de una entrada que ya esta entera, y lo que falta es que el documento
  // la imprima. Son tres arreglos distintos, asi que el resumen del final los cuenta aparte.
  // El SITIO es el nombre corto del hueco —el encabezado de la guia, la prosa pegada—, y es
  // lo que permite AGRUPAR el recuento: trece «falta el encabezado» son un trabajo, y trece
  // huecos en trece sitios distintos serían trece.
  const hueco = (texto, clase = 'sitio', sitio = null) => huecos.push({ texto, clase, sitio });
  const headings = documentedRuleHeadings(guide);
  const columns = documentedRuleTitles(guide);
  const titles = headerTitles(header);
  const conBloque = hasLimitBlock(header);
  const writtenLimits = new Map(headerLimitLines(header)
    .map((one) => [one.number, one]));
  const guideLf = guide.replace(/\r\n/g, '\n');

  // Y las claves repetidas del RESTO del audit —las capas, la maquinaria y el generador—,
  // que no es de ninguna regla: el hueco las nombra por su modulo y por las dos lineas que
  // hay que dejar en una, que es donde esta el arreglo. Los modulos de `rules/` se dejan
  // fuera a proposito: de sus entradas se ocupa el bucle de abajo, que dice mas —que regla
  // es, y si lo que se repite es la entrada o su receta— y mirarlos tambien aqui los
  // contaria dos veces en el mismo diagnostico, que es como se leeria el arreglo de uno
  // como si fueran dos.
  for (const texto of avisosDeClavesRepetidas(modulos, ({ label }) => !label.startsWith('rules/')))
    hueco(texto, 'descuido', 'una clave declarada dos veces');

  // Y lo MISMO en los controles de `components/`, que es donde el descuido se pierde igual
  // de en silencio y con mas facilidad: el objeto de opciones de un constructor y el mapa
  // de renderers son literales anidados, y en JavaScript la ultima clave repetida gana y la
  // anterior desaparece del objeto evaluado —el constructor recibe sus defaults y el render
  // se registra, y el que se perdio no esta en ningun sitio por donde se pueda mirar. El
  // aviso lleva otro SITIO, para que el resumen diga de que lista sale el descuido y no
  // mezcle un control con un modulo del audit.
  for (const texto of avisosDeClavesRepetidas(libreria))
    hueco(texto, 'descuido', 'una clave repetida en un control');

  for (const rule of catalogo) {
    const { number, name, detector, recipe } = rule;
    const at = `regla ${number} (${name})`;
    // Los CUATRO campos de prosa de una entrada, con los bordes fuera: un campo con un
    // espacio de más no es otro texto, es el mismo, y compararlo con los bordes puestos
    // daría un hueco fantasma en cada sitio donde se imprime. `null` sigue siendo `null`,
    // que es lo que significa que el campo no esté.
    const entrada = {
      ...rule,
      title: sinBordes(rule.title),
      assertion: sinBordes(rule.assertion),
      about: sinBordes(rule.about),
      limit: sinBordes(rule.limit),
      edge: sinBordes(rule.edge),
    };
    const { title, assertion, about, limit, edge } = entrada;

    // Y cada campo se queja por su nombre, porque un campo que NO está y un campo EN
    // BLANCO no se arreglan igual: lo primero es una entrada a medio declarar, que tiene
    // trabajo pendiente, y lo segundo un descuido —la línea se puso y su contenido no—,
    // que con el aviso de lo primero-iría a buscar un texto entero donde no hay ninguno.
    const CAMPOS = [
      ['el catálogo no le da título', title, 'el título está declarado y en blanco',
        'el título de la entrada'],
      ['el catálogo no le da aserción (el it() por módulo)', assertion,
        'la aserción está declarada y en blanco', 'la aserción de la entrada'],
      ['el catálogo no le da la prosa de la tabla', about,
        'la prosa de la tabla está declarada y en blanco', 'la prosa de la tabla'],
      ['el catálogo no le da límite honesto', limit,
        'el límite honesto está declarado y en blanco', 'el límite honesto de la entrada'],
    ];

    for (const [falta, campo, enBlanco, sitio] of CAMPOS)
      if (campo == null)
        hueco(`${at}: ${falta}`, 'a medio declarar', sitio);
      else if (campo === '')
        hueco(`${at}: ${enBlanco}`, 'descuido', sitio);

    // Y la FLECHA, que es el quinto campo que la entrada declara uno a uno y el único que
    // no es prosa: la declara con el número de la flecha del diagrama y ahí se imprime.
    // No entra en CAMPOS porque su aviso de falta no es de este sitio —lo que se consulta es
    // el diagrama, no la entrada— pero el hueco es el mismo de siempre: declarada y en blanco
    // es un descuido, y de espacios es el mismo descuido con Excerpt.
    const descuidoFlecha = edge === '';

    if (descuidoFlecha)
      hueco(`${at}: la flecha de la regla está declarada y en blanco`, 'descuido',
        'la flecha del diagrama');

    // Y una clave DECLARADA DOS VECES, que no sale de ningun hueco de los de arriba: el
    // objeto del catalogo sale entero —la ultima gana y la anterior no se ve— y la guia
    // imprime el texto de la que gana, asi que todo lo demas da verde. Es la ultima
    // trampa del sitio DECLARADO, y por eso es del mismo corte que el en blanco en el
    // arreglo —borrar la linea que se puso de mas— pero no en el efecto: aqui lo que
    // sigue sigue siendo cierto, porque el sitio se imprime con la clave que gana.
    const fuente = families.get(`${name}Rule`) ?? '';
    const literales = literalesDeEntrada(fuente, name);

    for (const [donde, desde] of [['la entrada', literales.entrada],
      ['la receta', literales.receta]]) {
      if (desde < 0)
        continue;

      for (const [clave, lineas] of clavesRepetidas(fuente, desde))
        hueco(`${at}: la clave ${clave} de ${donde} está declarada ${lineas.length} `
          + `veces (líneas ${lineas.join(', ')})`, 'descuido',
          'una clave declarada dos veces');
    }

    // Un descuido NO se multiplica: si un campo está declarado y en blanco, el aviso es
    // ese, y los sitios que dependen de su texto no se cuentan de más —si no, un único
    // descuido saldría como una lista de huecos que son consecuencia suya—. Un campo que
    // NO está, en cambio, sí es una entrada a medio declarar, y ahí la lista entera es el
    // arreglo: por eso este corte es solo para el en blanco.
    const descuido = CAMPOS.some(([, campo]) => campo === '') || descuidoFlecha;

    if (about != null && about.includes('|'))
      hueco(`${at}: la prosa de la tabla lleva una barra y parte la fila en dos`, 'sitio',
        'la prosa de la tabla');
    // Un límite que NO esta y un límite EN BLANCO son dos cosas, y se cuenta cada una
    // como es: la primera es una entrada a medio declarar, que es trabajo pendiente; la
    // segunda es un campo escrito y sin contenido, que es un descuido —la línea está
    // puesta— y con el aviso de la primera quien lo leyera irá a buscar un texto entero
    // donde lo que hay es un hueco. Un límite de espacios es el mismo descuido con
    // Excerpt: por eso el `trim`, que además evita que el hueco se.multiplique.
    if (conBloque && limiteConTexto(limit) && !writtenLimits.get(number))
      hueco(`${at}: falta el límite honesto en la cabecera, o no es el que genera el catálogo`,
        'sitio', 'el límite honesto de la cabecera');
    // La prosa del bloque ya se ha comparado, y al volver a unir las dos sale el mismo
    // texto aunque el bullet este partido de otra manera —que es justo lo que cambia al
    // tocar el ancho—. El ancho es de la entrada, asi que aqui se compara la LINEA, y el
    // aviso dice de que caja sale: o la cabecera lo parte en otro sitio, o la entrada ya
    // no declara el `limitWidth` que se le puso.
    const bullet = writtenLimits.get(number);

    if (limit != null && limit !== '' && bullet != null && bullet.limit === limit
      && bullet.lineas.join('\n') !== limitBulletLines(entrada).join('\n'))
      hueco(`${at}: el bullet del límite no está partido como lo parte el catálogo `
        + `(ancho ${limitWidthOf(entrada)}): la cabecera lo parte en otro sitio, o la entrada `
        + `ya no declara ese limitWidth`);
    // Los PARES de prosa de una misma entrada, que es donde la guía los imprime juntos: su
    // prosa de la tabla, su límite honesto y las citas de su bloque de mensaje. Cada par es
    // un sitio donde la misma frase puede aparecer dos veces —en la tabla y en la cabecera,
    // en la prosa y en el bloque de mensaje— y el guard es el MISMO para todos: una racha
    // larga que además se come media parte del texto más corto. Se miran todos en esta
    // misma pasada, para que un diagnóstico con dos pares pegados los diga los dos y no
    // uno por viaje.
    const citasPropias = recipeCases(entrada);
    // Y la PROSA de la receta, que son sus dos campos OPCIONALES y que la guia imprime
    // junto al bloque de mensaje. La misma trampa, con la diferencia de que aqui no
    // declarado no avisa de nada: que es justo lo que los hace opcionales. El hueco calla
    // su bloque —sin texto no hay que imprimirlo— y no toca el de mensaje, que sale del
    // modulo y de las citas y no de estos campos.
    const prosaPropia = recipeProse(entrada);
    const descuidoProsa = prosaPropia.some(({ texto }) => sinBordes(texto) === '');

    const pares = [
      ['el límite honesto', limit, 'la prosa de la tabla', about, 'son dos textos distintos'],
      ...citasPropias.flatMap(({ texto, form }) => [
        [`la cita${form}`, texto, 'la prosa de la tabla', about, 'la guía lo dice dos veces'],
        [`la cita${form}`, texto, 'el límite honesto', limit, 'la guía lo dice dos veces'],
      ]),
      // los DOS campos de la receta entre si, que es donde la guia los imprime pegados
      ...prosaPropia.flatMap(({ texto, nombre }, una) => prosaPropia
        .slice(una + 1)
        .map((otro) => [nombre, texto, otro.nombre, otro.texto, 'son dos textos distintos'])),
      // y la prosa de la receta contra la de la entrada y contra las citas de SU bloque:
      // la guia las imprime en la misma pantalla, unas lineas mas abajo
      ...prosaPropia.flatMap(({ texto, nombre }) => [
        [nombre, texto, 'la prosa de la tabla', about, 'la guía lo dice dos veces'],
        [nombre, texto, 'el límite honesto', limit, 'la guía lo dice dos veces'],
        ...citasPropias.map(({ texto: cita, form }) => [
          `la cita${form}`, cita, nombre, texto, 'el bloque de la guía las repite',
        ]),
      ]),
    ];

    for (const [nombre, uno, otroNombre, otro, porque] of pares) {
      if (uno == null || otro == null)
        continue;

      const repetido = sharedProse(uno, otro);

      if (repetido !== '')
        hueco(`${at}: ${nombre} repite ${otroNombre} («${recorte(repetido)}»): ${porque}`,
          'sitio', 'la prosa pegada');
    }

    // Y las citas de una MISMA receta entre sí, que antes no miraba nadie porque cada
    // receta citaba un mensaje solo: dos citas iguales en un bloque son el mismo mensaje
    // impreso dos veces, y el bloque sale con la lista repetida sin que nadie lo note. Se
    // comparan dentro de cada caso —el de fábrica contra el base es la misma regla sobre
    // otro módulo, y su mensaje lo imprime el mismo detector—.
    for (const forma of new Set(citasPropias.map(({ form }) => form))) {
      const delCaso = citasPropias.filter(({ form }) => form === forma);

      for (let i = 0; i < delCaso.length; i += 1)
        for (let j = i + 1; j < delCaso.length; j += 1) {
          const [una, otra] = [delCaso[i].texto, delCaso[j].texto];
          // dos citas IGUALES no son una coincidencia de palabras, que es lo que el guard
          // de racha perdona: es el mismo mensaje dos veces en la lista de expected
          const repetido = una.trim() === otra.trim()
            ? una.trim()
            : sharedProse(una, otra);

          if (repetido !== '')
            hueco(`${at}: dos citas${forma} dicen lo mismo («${recorte(repetido)}»): `
              + `el bloque de la guía las repite`, 'sitio', 'el bloque de mensaje');
        }
    }

    for (const { nombre, texto, vacio, sitio } of prosaPropia)
      if (sinBordes(texto) === '')
        hueco(`${at}: ${nombre} está ${vacio} y en blanco`, 'descuido', sitio);

    // Y los campos de TEXTO de la receta, que son prosa de la guia con la misma trampa:
    // una receta SIN modulo es trabajo pendiente, y una que lo declara vacio es un
    // descuido —la linea se puso y su contenido no—, igual que una cita en blanco, que
    // es el descuido con forma de lista: la receta declara sus mensajes y uno no trae
    // texto. Aqui no se corta todavia, porque la receta y su caso de fabrica no dependen
    // del texto de sus campos: lo que depende es el bloque de mensaje, mas abajo.
    const descuidoReceta = sinBordes(recipe?.module) === '' || citasEnBlanco(recipe).length > 0;

    if (recipe == null || typeof recipe.mutate !== 'function' || typeof recipe.safe !== 'function')
      hueco(`${at}: el catálogo no le da receta (mutate y safe)`, 'a medio declarar',
        'la receta');
    if (sinBordes(recipe?.module) === '')
      hueco(`${at}: el módulo de la receta está declarado y en blanco`, 'descuido',
        'el módulo de la receta');
    else if (recipe != null && !recipe.module)
      hueco(`${at}: la receta no dice el módulo real`, 'a medio declarar',
        'la receta');
    if (recipe != null && (recipe.cited ?? []).length === 0)
      hueco(`${at}: la receta no cita ningún mensaje`, 'a medio declarar',
        'la receta');

    for (const indice of citasEnBlanco(recipe))
      hueco(`${at}: la cita ${indice} de la receta está declarada y en blanco`, 'descuido',
        'las citas de la receta');
    // Y la flecha: el diagrama es quien la resuelve, así que el aviso de que a una regla no
    // le toca ninguna es del SITIO. Con la flecha en blanco ya sale el descuido, y este se
    // calla —que no hay flecha aquí es consecuencia del hueco, no un hueco más—. Un
    // número declarado que no apunta a ninguna flecha sigue por aquí: para el diagrama es
    // lo mismo, no hay nada que dibujar.
    if (!descuidoFlecha && edgeOfRule(number) == null)
      hueco(`${at}: no tiene flecha en el diagrama`, 'a medio declarar',
        'la flecha del diagrama');

    // El corte del descuido va aqui y no antes: la receta y la flecha no dependen del
    // texto de estos campos, asi que un hueco suyo sigue siendo un hueco suyo, y lo que
    // viene de abajo (el encabezado, la fila, la linea de cabecera y el bloque de
    // mensaje) es consequence de un campo en blanco y se contaria de mas.
    if (descuido)
      continue;

    const heading = ruleHeading(entrada);

    if (!headings.includes(heading))
      hueco(`${at}: falta el encabezado en la guía (${heading})`, 'sitio',
        'el encabezado de la guía');

    // La fila se compara con la que GENERA el catalogo, no celda a celda: asi el numero
    // (con su ancho), su celda, el titulo y la PROSA tienen que estar donde el catalogo
    // los pone. El texto de la celda no se imprime en el aviso
    // …son cientos de caracteres que taparian el hueco que hay que leer
    // —: la fila que falta se distingue por su numero, y la diferencia de la tabla
    // entera la cuenta la comparacion linea a linea.
    const row = ruleTableRow(entrada);

    if (!guideLf.includes(row))
      hueco(`${at}: falta la fila de la tabla, o no es la que genera el catalogo`, 'sitio',
        'la fila de la tabla');

    if (titles.get(number) !== shouted(title))
      hueco(`${at}: falta la línea de la cabecera (${number}. ${shouted(title)})`, 'sitio',
        'la línea de la cabecera');
    // El bloque se busca solo si la receta tiene texto con el que generarlo: con el modulo
    // o una cita en blanco, el bloque que saldria no es el que la guia puede tener, y que
    // falte es consecuencia del descuido y no un hueco mas.
    if (recipe != null && assertion != null && !descuidoReceta
      && !guideLf.includes(guideMessageBlock(recipe, assertion)))
      hueco(`${at}: falta el bloque de mensaje en la guía`, 'sitio', 'el bloque de mensaje');

    // Y la prosa de la receta, que se busca con su hueco resuelto: sin texto declarado no
    // hay nada que imprimir, y el aviso del descuido ya esta puesto.
    const prosaDeLaGuia = recipeProseLines({ recipe });

    if (prosaDeLaGuia.length > 0 && !descuidoProsa
      && !guideLf.includes(prosaDeLaGuia.join('\n')))
      hueco(`${at}: falta la prosa de la receta en la guía`, 'sitio',
        'la prosa de la receta en la guía');

    // El caso de fabrica de una receta es parte de la receta: si le falta el modulo, la cita,
    // la mutacion o su bloque en la guia, se dice aqui, con el mismo texto que los demas.
    if (recipe != null && recipe.factory != null) {
      const factory = recipe.factory;

      // Y el caso de fabrica tiene la misma trampa que su receta, y con el mismo corte: su
      // descuido calla el bloque de SUY, y no el de la receta base —que es otra entrada— ni
      // el de las demas reglas, que no tienen nada que ver con el.
      const modFabricaBlanco = sinBordes(factory.module) === '';
      const citasFabricaBlancas = citasEnBlanco(factory);

      if (typeof factory.mutate !== 'function' || typeof factory.safe !== 'function')
        hueco(`${at}: el caso de fábrica de la receta no trae mutate y safe`,
          'a medio declarar', 'el caso de fábrica de la receta');
      if (modFabricaBlanco)
        hueco(`${at}: el módulo del caso de fábrica de la receta está declarado `
          + `y en blanco`, 'descuido', 'el módulo del caso de fábrica');
      else if (!factory.module)
        hueco(`${at}: el caso de fábrica de la receta no dice el módulo real`,
          'a medio declarar', 'el caso de fábrica de la receta');
      if ((factory.cited ?? []).length === 0)
        hueco(`${at}: el caso de fábrica de la receta no cita ningún mensaje`,
          'a medio declarar', 'el caso de fábrica de la receta');

      for (const indice of citasFabricaBlancas)
        hueco(`${at}: la cita ${indice} del caso de fábrica de la receta está `
          + `declarada y en blanco`, 'descuido', 'las citas del caso de fábrica');
      if (assertion != null && !modFabricaBlanco && citasFabricaBlancas.length === 0
        && !guideLf.includes(guideMessageBlock(factory, assertion)))
        hueco(`${at}: falta el bloque de mensaje del caso de fábrica en la guía`, 'sitio',
          'el bloque de mensaje del caso de fábrica');
    }

  }
  // Y entre recetas: dos citas que son el mismo texto son dos bloques de la guia que son
  // el mismo con dos titulos —y con trece reglas en el documento, el que se lee al lado
  // no dice de quien es—. Se comparan las de reglas DISTINTAS: el caso de fabrica de una
  // regla es esa misma regla sobre otro modulo, su mensaje lo imprime el mismo detector y
  // tiene por que parecerse, y una cita pegada a otra de su MISMA regla no hace dos
  // bloques iguales, hace dos casos de una. Lo que no puede pasar es que dos reglas
  // enseñen el mismo texto, que es lo que sale al copiar un mensaje que ya estaba puesto.
  const citas = catalogo.flatMap((rule) => recipeCases(rule)
    .map((cita) => ({ ...cita, number: rule.number, at: `regla ${rule.number} (${rule.name})` })));

  for (let i = 0; i < citas.length; i += 1)
    for (let j = i + 1; j < citas.length; j += 1) {
      if (citas[i].number === citas[j].number)
        continue;

      const repetido = sharedProse(citas[i].texto, citas[j].texto);

      if (repetido !== '')
        hueco(`${citas[i].at}: su cita${citas[i].form} dice lo mismo que la de `
          + `${citas[j].at}${citas[j].form} («${recorte(repetido)}»): sus dos bloques de la `
          + `guía serían el mismo`);
    }

  // Y lo mismo con la PROSA de las recetas, que la guia imprime en las trece: dos reglas
  // que enseñan la misma frase son dos parrafos que son el mismo con dos numeros al lado.
  // Se cruzan las de reglas DISTINTAS, y tambien con las CITAS de la otra —una cita es el
  // texto que suelta el detector al mutar el modulo, y una prosa que la repite es la misma
  // frase en dosSite, una como mensaje y otra como explicacion—.
  const prosas = catalogo.flatMap((rule) => recipeProse(rule)
    .map((prosa) => ({ ...prosa, number: rule.number, at: `regla ${rule.number} (${rule.name})` })));
  const citasDe = (rule) => recipeCases(rule)
    .map((cita) => ({ ...cita, number: rule.number, at: `regla ${rule.number} (${rule.name})` }));

  for (let i = 0; i < prosas.length; i += 1)
    for (let j = i + 1; j < prosas.length; j += 1) {
      if (prosas[i].number === prosas[j].number)
        continue;

      const repetido = sharedProse(prosas[i].texto, prosas[j].texto);

      if (repetido !== '')
        hueco(`${prosas[i].at}: ${prosas[i].nombre} dice lo mismo que el de `
          + `${prosas[j].at} («${recorte(repetido)}»): dos reglas con la misma frase`);
    }

  // Las citas de TODAS las reglas, una vez: antes esta lista se reconstruia dentro del
  // bucle de abajo, una vez por cada prosa, y como `citasDe` es pura las veintiseis
  // versiones salian identicas. El trabajo no cambia, solo se hacia veintiseis veces.
  const todasLasCitas = catalogo.flatMap(citasDe);

  for (const pros of prosas)
    for (const cita of todasLasCitas) {
      if (pros.number === cita.number)
        continue;

      const repetido = sharedProse(pros.texto, cita.texto);

      if (repetido !== '')
        hueco(`${pros.at}: ${pros.nombre} dice lo mismo que la cita de `
          + `${cita.at}${cita.form} («${recorte(repetido)}»): la guía lo repite`);
    }

  // dos reglas con el mismo detector: el numero las separa, el nombre las confunde
  for (const rule of catalogo) {
    const twins = catalogo.filter((other) => other.name === rule.name).map(({ number }) => number);

    if (twins.length > 1 && rule.number === twins[0])
      hueco(`el catálogo repite el detector ${rule.name} en las reglas ${twins.join(' y ')}`,
        'sitio', 'el detector repetido');
  }

  // Y al reves del todo, con la lista de sitios: un detector con auto-tests que no sale en
  // el catalogo. No lo corre nadie contra el inventario, y hasta aqui pasaba inadvertido —
  // el meta-guard de exports lo ve ejercitado, que es justo lo que hace que parezca
  // terminado. Se reporta como la regla a MEDIO declarar que es.
  for (const name of halfDeclaredRules({ catalogo, rules, autoTests, families }))
    for (const site of HALF_SITES)
      hueco(`regla a medio declarar (${name}): le falta ${site}`, 'a medio declarar', site);

  // y al reves: un sitio de la guia que nombre una regla que el catalogo no tiene
  const knownHeadings = ruleHeadings();

  for (const heading of headings)
    if (!knownHeadings.includes(heading))
      hueco(`la guía titula una regla que el catálogo no tiene: ${heading}`, 'sitio',
        'las reglas de más en la guía');

  for (const number of titles.keys())
    if (!catalogo.some((rule) => rule.number === number))
      hueco(`la cabecera abre una regla ${number} que el catálogo no tiene`, 'sitio',
        'las reglas de más en la cabecera');

  for (const number of columns.keys())
    if (!catalogo.some((rule) => rule.number === number))
      hueco(`la tabla titula una regla ${number} que el catálogo no tiene`, 'sitio',
        'las reglas de más en la tabla');

  const present = headings.filter((heading) => knownHeadings.includes(heading));

  if (present.length === knownHeadings.length && present.join('\n') !== knownHeadings.join('\n'))
    hueco('los encabezados de la guía están fuera de orden', 'sitio',
      'el orden de los encabezados');

  // Y las filas de la tabla, en su sitio y EN ORDEN: la guia las lista como el catalogo
  // las numera. Con trece reglas, una fila cambiada de sitio deja la tabla completa y
  // nadie se enteraria mirando celdas sueltas.
  const listed = [...columns.keys()];
  const numbered = catalogo.map(({ number: one }) => one);

  if (listed.length === numbered.length && listed.join(',') !== numbered.join(',')) {
    const at = listed.findIndex((one, index) => one !== numbered[index]);

    hueco(`las filas de la tabla están fuera de orden `
      + `(la ${listed[at]} va donde va la ${numbered[at]})`, 'sitio', 'el orden de las filas');
  }

  // El bloque de limites de la cabecera, aparte: cuando NO esta, el hueco es de la
  // seccion entera, y repetir trece veces la misma frase no le ahorra una linea a quien
  // lee el fallo —ni le dice lo que de verdad se ha perdido—. Se agrupa y se nombran las
  // trece reglas de una vez; con el bloque puesto, un bullet que falte es de su regla y
  // sale solo, mas arriba.
  if (!conBloque) {
    const sinBulto = catalogo
      .filter(({ limit }) => limiteConTexto(limit))
      .map(({ number }) => number);

    if (sinBulto.length > 0)
      hueco(`el bloque «Límites honestos» no está en la cabecera del audit: falta de `
        + `una vez el límite de ${sinBulto.length} reglas (${sinBulto.join(', ')})`,
        'sitio', 'el bloque de límites de la cabecera');
  }
  return huecos;
}

/** El diagnostico como lista de TEXTO: lo que comparan los tests y lo que se imprime. */
export const ruleGaps = (opciones) => diagnostico(opciones).map(({ texto }) => texto);

/** La ENTRADA a la que pertenece un hueco, si la nombra: los de una regla salen con su
 *  numero y su nombre, y los de un detector que todavia no tiene entrada con el suyo. Los
 *  agrupados —el bloque entero de limites, el orden de la tabla— no son de una entrada, y
 *  salen sin ella. */
export const entradaDe = (texto) => {
  const regla = /^regla (\d+) \(([^)]+)\):/.exec(texto);
  const detector = /^regla a medio declarar \(([^)]+)\):/.exec(texto);

  if (regla != null)
    return `regla ${regla[1]} (${regla[2]})`;
  if (detector != null)
    return `regla a medio declarar (${detector[1]})`;

  return null;
};

/** Cuantos sitios caben en el resumen antes de contar el resto: un log de CI se lee de un
 *  vistazo, y una lista de veinte lineas de sitios no lo es. */
export const TOP_SITIOS = 8;

/** Un numero con su palabra, en singular o en plural. */
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** El BLOQUE RESUMEN del diagnostico, al final: cuantos huecos son un descuido, cuantas
 *  entradas van a medio declarar y cuantos huecos son de un sitio. El numero solo no
 *  bastaba, porque las tres clases se arreglan distinto y una lista de trece puede ser un
 *  hueco repetido o trece reglas sin cablear. Asi que el resumen nombra las ENTRADAS de los
 *  dos primeros —deduplicadas, que la media regla trae una linea por sitio— y deja los de
 *  sitio sin nombrar, que ya estan todos escritos encima, uno por linea. Un diagnostico sin
 *  huecos no lleva resumen: no hay nada que resumir y la lista vacia es la que se compara. */
export function resumenDiagnostico(huecos) {
  if (huecos.length === 0)
    return [];

  const descuidos = huecos.filter(({ clase }) => clase === 'descuido');
  const medias = huecos.filter(({ clase }) => clase === 'a medio declarar');
  const sitios = huecos.filter(({ clase }) => clase === 'sitio');
  // Las ENTRADAS de una clase, deduplicadas y en el orden en que las nombra el diagnostico:
  // la media regla trae un hueco POR SITIO, y once lineas de esa clase son una entrada, no
  // once. Por eso la cuenta va en entradas y los huecos van entre parentesis.
  const entradas = (lista) => [...new Set(lista.map(({ texto }) => entradaDe(texto))
    .filter(Boolean))];
  // Las tres clases siempre, aunque alguna valga cero: una linea con la misma forma se lee
  // de un vistazo en el log del CI, y un cero ausencia no es lo mismo que un cero hueco.
  const cuentas = [
    plural(descuidos.length, 'descuido', 'descuidos'),
    `${plural(entradas(medias).length, 'entrada a medio declarar', 'entradas a medio declarar')}`
      + (medias.length > 0 ? ` (${plural(medias.length, 'hueco', 'huecos')})` : ''),
    plural(sitios.length, 'hueco de sitio', 'huecos de sitio'),
  ];
  const lineas = [`resumen del diagnóstico: ${cuentas[0]}, ${cuentas[1]} y ${cuentas[2]}`];

  for (const [clase, lista] of [['descuidos', descuidos], ['a medio declarar', medias],
    ['sitios', sitios]])
    for (const linea of dePorSitio(clase, lista))
      lineas.push(linea);

  return lineas;
}

/** Los huecos de una clase POR SITIO: el nombre corto del hueco y cuantos hay, del mas
 *  lleno al mas vacio. El recuento por sitio es el que dice cuanto trabajo hay de cada
 *  clase —trece «falta el encabezado» son un trabajo, y no trece— y cuando un sitio tiene un
 *  solo hueco se anade la entrada a la que pertenece, que es cuando el sitio por si solo no
 *  dice donde hay que ir. Con varios no se listan: ya estan todos escritos arriba, y aqui
 *  bastan los numeros. Un sitio con mas de TOP_SITIOS lineas no cabe en un log, asi que
 *  sale el mas lleno y el resto se cuenta. */
export function dePorSitio(clase, lista) {
  if (lista.length === 0)
    return [];

  const grupos = new Map();

  for (const hueco of lista) {
    const nombre = hueco.sitio ?? 'el sitio sin nombre';
    const grupo = grupos.get(nombre) ?? [];

    grupo.push(hueco);
    grupos.set(nombre, grupo);
  }

  const delSitio = [...grupos.entries()]
    .sort((una, otra) => otra[1].length - una[1].length)
    .map(([nombre, delGrupo]) => {
      const entrada = delGrupo.length === 1
        ? `: ${[...new Set(delGrupo.map(({ texto }) => entradaDe(texto)))].filter(Boolean)[0] ?? ''}`
        : '';

      return `  ${clase} · ${nombre} (${delGrupo.length})${entrada}`;
    });

  return delSitio.length > TOP_SITIOS
    ? [...delSitio.slice(0, TOP_SITIOS),
      `  … y ${delSitio.length - TOP_SITIOS} ${delSitio.length - TOP_SITIOS === 1
        ? 'sitio más' : 'sitios más'} de ${clase}`]
    : delSitio;
}

/** El INFORME que se imprime: los huecos y, detrás, su resumen. Es la puerta del CI cuando
 *  algo falta —muestra la lista entera de una vez, con el recuento al final— y la lista
 *  vacia cuando no falta nada, que es lo que se compara. */
export function informeDiagnostico(opciones) {
  const huecos = diagnostico(opciones);

  return {
    huecos,
    lineas: [...huecos.map(({ texto }) => texto), ...resumenDiagnostico(huecos)],
  };
}
