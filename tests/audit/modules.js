/**
 * Constantes compartidas y LAS FUENTES AUDITADAS: los modulos que el audit lee del
 * disco. Es el unico punto del paquete que habla con el sistema de ficheros.
 *
 * Generado al partir tests/audit/detectors.js: el barrel (`./detectors.js`) vuelve a
 * exponer todo, asi que los consumidores no cambian.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';


const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, '../../components');

/** La raiz del paquete (`ABDSharedAssets/`): de ahi cuelgan la libreria, el demo, los
 *  smoke y los tests de los que habla el guardia de la superficie. */
const packageRoot = join(here, '../..');

/** La etiqueta de un fichero, relativa a la raiz y SIEMPRE con `/`: en Windows `path`
 *  usa `\`, y estas etiquetas salen en los mensajes de las guardias. Vive aqui y no donde
 *  se escribio la primera vez porque `AUDIT_MODULES` la necesita para su `ruta`, y una
 *  `const` que se usa antes de declararse es un ReferenceError. */
const labelOf = (path) => relative(packageRoot, path).split(sep).join('/');

/** Controles que se sabe que toman entradas ricas: si esto falla, el detector se rompio. */
export const ENTRY_SHAPED = ['select.js', 'segmented.js'];

/** CRLF -> LF: sin esto, `\S.*$` no casa y el parseo se cae en silencio. */
export const normaliseEol = (source) => source.replace(/\r\n/g, '\n');

/* ---------------------------------------------------------------------------
 * Las fuentes auditadas
 * ------------------------------------------------------------------------- */

export const MODULES = [
  ...readdirSync(componentsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ label: name, path: join(componentsDir, name) })),
  { label: 'skins/index.js', path: join(componentsDir, 'skins', 'index.js') },
].map(({ label, path }) => ({
  label,
  // La RUTA desde la raiz del paquete, que es como nombra a un modulo un aviso en un log
  // (`components/knob.js`) y como se abre el fichero. La etiqueta de aqui es el nombre a
  // pelo, que es como lo nombran las reglas; el aviso de una clave repetida necesita las
  // dos, por lo mismo que en el audit: con dos controles homonimos la etiqueta no dice
  // cual de los dos hay que abrir.
  ruta: labelOf(path),
  source: normaliseEol(readFileSync(path, 'utf-8')),
}));

/* ---------------------------------------------------------------------------
 * El audit de este paquete: sus modulos y sus consumidores
 * ------------------------------------------------------------------------- */

/** Los MODULOS del audit —las capas, `rules/` y el generador del barrel—, con su fuente.
 *  La lista se hace sola del directorio: un modulo nuevo entra en cuanto se crea, que es
 *  lo que hace falta para que el barrel se pueda GENERAR (el generador no puede preguntar
 *  quien hay: hay que leerlo). El barrel no es un modulo —es lo que se genera— ni sus
 *  tests, que no exportan nada. La etiqueta es la relativa al directorio del audit
 *  (`api.js`, `rules/arityMismatches.js`), que es como se escribe en su `from`, y la RUTA
 *  desde la raiz del paquete (`tests/audit/api.js`), que es como se abre un fichero. Las
 *  dos hacen falta porque no dicen lo mismo: la etiqueta es la puerta de un `import` y la
 *  ruta la de un aviso en un log, y un modulo al que le falte la ruta solo puede dar la
 *  primera. La ruta la pide el aviso de una clave repetida — el unico que nombra
 *  un modulo del audit (el resto de los avisos nombran reglas o controles de la libreria,
 *  que ya salen con su ruta), y con dos modulos HOMONIMOS — `options.js` y
 *  `rules/options.js`, que es lo que pasa en cuanto una regla nueva toma el nombre de una
 *  capa — ese aviso tiene que decir cual de los dos hay que abrir. */
export const AUDIT_MODULES = [
  ...readdirSync(here).filter((name) => name.endsWith('.js')
    && name !== 'detectors.js' && !name.endsWith('.test.js')),
  ...readdirSync(join(here, 'rules')).filter((name) => name.endsWith('.js'))
    .map((name) => `rules/${name}`),
].sort().map((label) => ({
  label,
  ruta: labelOf(join(here, label)),
  source: normaliseEol(readFileSync(join(here, label), 'utf-8')),
}));

/** Los modulos del audit que NO salen en `AUDIT_MODULES` y a los que el guard de claves
 *  repetidas tiene que mirar igual. Hay dos motivos y son distintos.
 *
 *  El BARREL, porque se GENERA: un descuido ahi no se arregla editando el fichero, se
 *  arregla en la linea del generador que lo escribio, y verlo en el fichero ya generado
 *  es lo que dice cual. Va aparte porque el generador lo lista por su cuenta —no
 *  hay que anadirlo a la lista de la que sale el barrel, que es lo que usa `FAMILY_FILES`
 *  para elegir el hogar de cada nombre.
 *
 *  Y los ficheros de los PROPIOS TESTS del audit, que no exportan nada —por eso no
 *  estan en `AUDIT_MODULES` — y porque ahi es donde se declaran los detectores EN LINEA,
 *  dentro de una funcion, en vez de como un modulo de regla: un detector de mentira que
 *  lleva su objeto y sus citas vive ahi, y su objeto puede tener la clave repetida. La
 *  lista se hace del directorio, asi que un test nuevo entra solo.
 *
 *  Ni uno ni otro son MODULOS para el resto del audit —el barrel no exporta familias
 *  y un test no exporta nada — asi que la lista se queda aqui, para el unico guard que
 *  los necesita. */
export const AUDIT_SIN_API = [
  'detectors.js',
  ...readdirSync(here).filter((name) => name.endsWith('.test.js')),
].sort().map((label) => ({
  label,
  ruta: labelOf(join(here, label)),
  source: normaliseEol(readFileSync(join(here, label), 'utf-8')),
}));

/** Los CONSUMIDORES del barrel del audit: todo lo que PODRIA importar de el —los ficheros
 *  de aqui menos el barrel, y los tests de `tests/` entero, con sus subdirectorios—. Se
 *  listan enteros, no solo los que hoy importan: la superficie se vigila tambien en el
 *  sentido contrario (un consumidor que tire de una familia por la puerta de al lado tiene
 *  que salir por su nombre), y para eso hace falta saber quien es consumidor aunque todavia
 *  no lo sea. Un test nuevo que lo importe entra solo, en la guardia y en la generacion
 *  del fichero; uno escondido en un subdirectorio tambien, que es justo el caso que una
 *  lista escrita a mano no puede cubrir. */
const labelFromAudit = (path) => relative(here, path).split(sep).join('/');

export const AUDIT_CONSUMERS = [
  ...readdirSync(here).filter((name) => name.endsWith('.js') && name !== 'detectors.js')
    .map((name) => ({ label: name })),
  ...walkCode(join(here, '..'))
    .filter((path) => path.endsWith('.test.js') && !path.startsWith(here + sep))
    .map((path) => ({ label: labelFromAudit(path) })),
].sort((one, other) => one.label < other.label ? -1 : 1).map(({ label }) => ({ label, source: normaliseEol(readFileSync(join(here, label), 'utf-8')) }));

/* ---------------------------------------------------------------------------
 * La superficie de la libreria: sus modulos, quien los consume y quien los promete
 * ------------------------------------------------------------------------- */

/** Un arbol de ficheros de codigo (`.js` y `.mjs`), sin `node_modules` ni ocultos, en
 *  orden: las listas y los mensajes de las guardias no pueden depender del disco. */
function walkCode(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);

      if (entry.isDirectory())
        return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walkCode(path);

      return /\.m?js$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

/** Los ficheros del AUDIT: la guardia NO se cuenta a si misma ni cuenta a su entrada.
 *  Sus fuentes nombran los controles en fixtures, recetas y prosa, asi que tomarlas por
 *  consumidores volveria tautologica la superficie que vigilan. */
const AUDIT_FILES = new Set([
  'tests/ciContract.test.js',
  'tests/documentedOptions.test.js',
]);

const isAuditFile = (label) => AUDIT_FILES.has(label) || label.startsWith('tests/audit/');

/** LA LIBRERIA: los modulos cuya superficie se vigila —`components/` y `utils/`, con sus
 *  subdirectorios—. No es `MODULES`: la auditoria de documentacion audita los controles
 *  (los `components/*.js` y el barrel de skins), y aqui entran tambien `utils/` y los
 *  subdirectorios, que es donde vive parte de lo que el barrel re-exporta. */
export const LIBRARY_SOURCES = [
  ...walkCode(join(packageRoot, 'components')),
  ...walkCode(join(packageRoot, 'utils')),
].map((path) => ({ label: labelOf(path), source: normaliseEol(readFileSync(path, 'utf-8')) }));

/** LOS CONSUMIDORES de codigo: quien puede nombrar un export de la libreria —el demo,
 *  los smoke y los tests de los controles—. Se listan solos, asi que un consumidor nuevo
 *  queda dentro de la guardia sin que nadie se acuerde de apuntarlo. */
export const CONSUMER_SOURCES = [
  ...walkCode(join(packageRoot, 'demo')),
  ...walkCode(join(packageRoot, 'smoke')),
  ...walkCode(join(packageRoot, 'tests')),
].filter((path) => !isAuditFile(labelOf(path)))
  .map((path) => ({ label: labelOf(path), source: normaliseEol(readFileSync(path, 'utf-8')) }));

/** LA DOCUMENTACION que promete imports: la guia, el README y las guias de `docs/`. No
 *  es un consumidor de codigo: solo dice que un nombre se promete como API importable. */
export const DOC_SOURCES = [
  join(packageRoot, 'COMPONENTS.md'),
  join(packageRoot, 'README.md'),
  ...readdirSync(join(packageRoot, 'docs')).filter((name) => name.endsWith('.md'))
    .map((name) => join(packageRoot, 'docs', name)),
].map((path) => ({ label: labelOf(path), source: readFileSync(path, 'utf-8') }));