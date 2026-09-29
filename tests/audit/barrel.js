/**
 * El GENERADOR del barrel del audit: `detectors.js` se escribe desde aqui y el contrato de
 * la superficie comprueba que el fichero es EXACTAMENTE esto.
 *
 * El barrel es la puerta unica del audit, y su superficie es lo que sus consumidores
 * importan —ni una linea mas—. Eso, escrito a mano, es una lista que hay que mantener en
 * cada cambio: mover un detector de una capa a un modulo de regla (o al reves) obligaba a
 * reescribir su linea, y el olvido no lo delataba nadie hasta que otro test lo encontraba
 * por el camino. Aqui la lista se HACE: se lee lo que los consumidores piden, se busca en
 * que modulo lo exporta cada nombre y se escribe un bloque por familia, con sus nombres
 * ordenados. El catalogo tambien: una entrada por cada modulo de `tests/audit/rules/`.
 *
 * Modulo PURO (no lee el disco): quien lo llama pasa las familias y los consumidores.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { importStatements, withoutComments } from './scan.js';

/** Los exports de PRIMER NIVEL de un modulo del audit: una linea por `export function`,
 *  `export const` o `export class`. Se lee el fuente SIN comentarios —mencionar un helper
 *  en un comentario no es exportarlo— y no se resuelven re-exportaciones: en este repo
 *  una familia exporta lo suyo y ya. */
export function moduleExports(source) {
  return [...withoutComments(source)
    .matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1]);
}

/** El nombre de un modulo sin su `.js`, para las listas: `api.js` es `api` y
 *  `rules/arityMismatches.js` es `rules/arityMismatches`. */
const stem = (file) => file.replace(/\.js$/, '');

/** El rotulo que lleva el bloque de una familia en el barrel: el nombre del modulo en una
 *  capa, y `la regla X` en un modulo de regla, que es como los nombra la guia. */
const blockLabel = (file) => (file.startsWith('rules/')
  ? `la regla ${stem(file.slice('rules/'.length))}`
  : stem(file));

/** Los nombres que declara el barrel PROPIO —su epilogo, al final del fichero—: no salen de
 *  ninguna familia, asi que el generador los deja estar en vez de buscarles un hogar. Se
 *  LEEN del epilogo que el generador mismo escribe, no de una lista: esa lista seria la
 *  ultima linea de este fichero que podria quedarse vieja sin que nada lo dijera. */
function localNames(families) {
  return new Set([...epilogue(families).join('\n')
    .matchAll(/^export (?:const|function|class) ([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1]));
}

/** Lo que los consumidores PIDEN al barrel, con quien lo pide: el `import { … } from
 *  '…/detectors.js'` de cada uno, leido con el mismo lector que la meta-guardia. */
function barrelRequests(consumers) {
  const asked = new Map();

  for (const [file, source] of consumers)
    for (const statement of importStatements(source)) {
      if (!/(^|\/)detectors\.js$/.test(statement.specifier))
        continue;

      for (const name of statement.names)
        asked.set(name, [...(asked.get(name) ?? []), file]);
    }

  return asked;
}

/** De que modulos exporta cada nombre: el barrel no se inventa un hogar, y si un nombre lo
 *  exportan dos familias no se puede elegir por el (ver `barrelProblems`). */
function nameHomes(families) {
  const homes = new Map();

  for (const [file, source] of families)
    for (const name of moduleExports(source))
      homes.set(name, [...(homes.get(name) ?? []), file]);

  return homes;
}

/** De que FAMILIA saca cada nombre un IMPORT INTERNO del audit: el `import { … } from
 *  './api.js'` de un modulo del audit, que es el otro sitio donde un nombre con dos hogares
 *  se elige sin que nadie lo diga —uno lo exporta, otro lo saca, y el que gana es el que se
 *  escribio primero—. Solo cuentan los que van a una familia del audit: un `vitest` o un
 *  `node:fs` no es un hogar, y por eso el especificador se resuelve a la etiqueta del
 *  modulo y se descarta el que no casa con ninguna. */
function homesDeImports(families) {
  const etiqueta = (specifier) => specifier.replace(/^\.\//, '');
  const hogares = new Set(families.map(([file]) => file));
  const sacados = new Map();

  for (const [quien, source] of families)
    for (const statement of importStatements(source)) {
      const de = etiqueta(statement.specifier);

      if (!hogares.has(de))
        continue;

      for (const name of statement.names)
        sacados.set(name, [...(sacados.get(name) ?? []), [quien, de]]);
    }

  return sacados;
}

/** Los nombres que exportan DOS familias o mas, con el modulo del que cada uno se saca si
 *  alguno lo saca ya. `barrelProblems` avisa de este caso SOLO cuando alguien pide el
 *  nombre, porque su trabajo es lo que el generador no puede escribir; aqui se mira
 *  SIEMPRE, y por el motivo contrario: un nombre con dos hogares que nadie pide todavia no
 *  da ningun fallo hoy, pero el dia que alguien lo pida el generador coge el hogar que le
 *  salga, la superficie sale de una familia, y el aviso caeria en el commit que pide el
 *  nombre —lejos de la mudanza que lo duplico—. Es la trampa de un nombre declarado en un
 *  modulo y que SOBRE en otro, vista desde el unico sitio donde se puede ver: el
 *  repositorio de nombres que el barrel recorre. */
export function hogaresDobles({ families }) {
  const sacados = homesDeImports(families);

  return [...nameHomes(families)]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => {
      const de = sacados.get(name) ?? [];
      const quien = de.length === 0 ? '' : `; ${de.map(([modulo, deUno]) => `${modulo} lo saca de ${deUno}`).join(', ')}`;

      return `${name} (lo exportan ${files.join(' ')}${quien}: dos hogares, y el barrel `
        + `no puede saber de que familia sacarlo)`;
    });
}

/** Lo que el generador NO puede escribir solo, y por tanto tiene que delatar: un nombre
 *  que los consumidores piden y ninguna familia exporta —hoy lo diria el enlazador ESM al
 *  cargar, y en un fichero generado el error caeria lejos— y un nombre que exportan dos
 *  familias, donde cualquier eleccion seria arbitraria. El catalogo no se mira aqui: de un
 *  modulo de regla sin entrada responde el diagnostico del catalogo, que lo nombra. */
export function barrelProblems({ families, consumers }) {
  const asked = barrelRequests(consumers);
  const homes = nameHomes(families);
  const local = localNames(families);
  const off = [];

  for (const [name, files] of asked)
    if (!homes.has(name) && !local.has(name))
      off.push(`${name} (${files.join(' ')} lo${files.length === 1 ? '' : 's'} pide${files.length === 1 ? '' : 'n'} al barrel y ninguna familia lo exporta)`);

  // y el nombre que exportan dos familias, solo si alguien lo pide: un export repetido que
  // no llega al barrel no es un problema del barrel
  for (const [name, files] of homes)
    if (files.length > 1 && asked.has(name))
      off.push(`${name} (lo exportan ${files.join(' ')}: el barrel no puede saber de que familia sacarlo)`);

  return off;
}

/** Las ENTRADAS del catalogo, una por modulo de `tests/audit/rules/` que exporte una: el
 *  nombre del fichero ordena la lista, y no el de las reglas —ese lo pone el `number` que
 *  declara cada una, que es el unico orden que la guia y el diagrama miran—. */
function catalogueEntries(families) {
  return families
    .filter(([file]) => file.startsWith('rules/'))
    .flatMap(([file, source]) => moduleExports(source)
      .filter((name) => name.endsWith('Rule'))
      .map((name) => ({ file, name })))
    .sort((one, other) => (one.file < other.file ? -1 : one.file > other.file ? 1 : 0));
}

/** La cabecera del barrel: el por que de la puerta unica. Va aqui y no a mano porque el
 *  fichero entero es un artefacto —si la prosa puede escribirse al lado del codigo que
 *  dice, se puede leer—. */
const HEADER = `/**
 * Barrel de los detectores de la auditoria de documentacion: SU API y su CATALOGO.
 *
 * Modulo PURO (no habla con vitest): re-exporta, NOMBRE A NOMBRE, solo lo que sus
 * consumidores importan de aqui —las reglas, sus auto-tests, sus unitarios, la
 * meta-guardia, el diagrama y el contrato del CI—, para que todos sigan importando de
 * un solo sitio y las capas y los modulos de regla queden detras. Las constantes y
 * MODULES viven en modules.js, el unico sitio del paquete que toca el disco, que es
 * donde tambien se cuenta quien es modulo y quien es consumidor del audit.
 *
 * Este fichero lo ESCRIBE \`barrel.js\` y el contrato de la superficie comprueba que es
 * exactamente lo que sale de ahi. La superficie es lo que sus consumidores importan y
 * nada mas, y cada nombre se busca en la familia que lo exporta: mover un detector de una
 * capa a un modulo de regla —o al reves— no obliga a reescribir su linea, se regenera. Un
 * nombre que deje de importar nadie se cae solo del fichero, y \`export *\` (que volcaria
 * los modulos enteros y ocultaria la superficie) no cabe en un barrel generado.
 *
 * Y aqui se COMPONE el catalogo: una entrada por cada modulo de \`tests/audit/rules/\`, en
 * el orden en que el generador las encuentra —el del nombre del fichero, que no es el de
 * las reglas: el orden lo pone el \`number\` que cada una declara—.
 */
`;

/** El bloque de una familia: el rotulo, los nombres que se piden de ella y de donde
 *  salen. Un bloque sin nombres no se escribe: una familia que nadie importa no es API. */
function block([file, names]) {
  return [
    `/** ${blockLabel(file)} */`,
    'export {',
    ...names.map((name) => `  ${name},`),
    `} from './${file}';`,
    '',
  ];
}

/** El EPILOGO del barrel: la composicion del catalogo, con una entrada por cada modulo de
 *  `tests/audit/rules/`. Va aparte porque es lo UNICO que el barrel declara por si mismo —y
 *  de ahi sacan el generador los nombres locales, sin una lista escrita a mano—. */
function epilogue(families) {
  const entries = catalogueEntries(families);

  return [
    '/* --------------------------------------------------------------------------',
    ' * El catalogo, compuesto de las entradas de los modulos de regla',
    ' * ------------------------------------------------------------------------- */',
    '',
    ...entries.map(({ file, name }) => `import { ${name} } from './${file}';`),
    '',
    '/** Las entradas, en el orden en que las encuentra el generador: el del nombre del',
    ' *  fichero, que no es el de las reglas —el orden lo pone el `number` de cada una—. */',
    'const DECLARED = [',
    ...entries.map(({ name }) => `  ${name},`),
    '];',
    '',
    '/** El CATALOGO resuelto: cada regla con su numero y su NOMBRE, que sale del propio',
    ' *  detector (`detector.name`): el detector y su nombre no pueden desincronizarse porque',
    ' *  el nombre no se escribe. Una entrada sin detector del barrel ni siquiera carga: el',
    ' *  enlazador ESM la delata. */',
    'export const RULES = DECLARED',
    '  .map((rule) => {',
    "    if (typeof rule.detector !== 'function')",
    "      throw new Error('una entrada del catalogo no trae un detector');",
    '',
    '    return { ...rule, number: rule.number, name: rule.detector.name };',
    '  })',
    '  .sort((one, other) => one.number - other.number);',
    '',
    'if (RULES.length !== DECLARED.length)',
    "  throw new Error('el catalogo perdio reglas por el camino');",
    '',
  ];
}

/** EL BARREL entero, como texto: la cabecera, un bloque por familia en orden de nombre y
 *  el catalogo. `families` son los modulos del audit con su fuente y `consumers` los
 *  ficheros que importan del barrel (con la suya): de los dos sale el fichero entero, sin
 *  una linea escrita a mano. */
export function barrelSource({ families, consumers }) {
  const asked = barrelRequests(consumers);
  const homes = nameHomes(families);
  const local = localNames(families);
  const byFamily = new Map();

  for (const name of asked.keys()) {
    const file = (homes.get(name) ?? [])[0];

    if (file == null || local.has(name))
      continue;

    byFamily.set(file, [...(byFamily.get(file) ?? []), name].sort());
  }

  return [
    HEADER,
    ...[...byFamily.entries()].sort(([one], [other]) => (one < other ? -1 : 1)).flatMap(block),
    ...epilogue(families),
  ].join('\n');
}

/** Cuantas lineas se citan de una diferencia antes de resumir el resto: un bloque de mas
 *  descuadra todo lo de debajo, y cien lineas de diferencias no le dicen nada a nadie. */
const CITED = 3;

/** Las lineas de un texto con el CR normalizado y sin el hueco del ultimo salto: el
 *  fichero termina en un salto de linea, y eso no es una linea que el generador pueda no
 *  escribir. */
function linesOf(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  if (lines[lines.length - 1] === '')
    lines.pop();

  return lines;
}

/** Como se CITA una linea dentro de un mensaje: los espacios de mas estorban y una linea
 *  en blanco no se ve, que es justo la que mas conviene nombrar. */
const said = (line) => (line === '' ? '(una linea en blanco)' : line.replace(/\s+/g, ' ').trim());

/** Lo que el fichero tiene de mas o de menos frente a lo que el generador escribe, linea a
 *  linea y en el orden del fichero: asi un olvido —una linea a mano que sobra, un bloque
 *  al que se le ha olvidado anadir el detector que se acaba de mudar— se localiza con su
 *  numero de linea y sus dos textos, sin tener que leer un `git diff` de cien lineas. Las
 *  diferencias se listan al compararlas, no despues: mover un detector cambia dos lineas de
 *  sitio y todo lo de debajo correria en el mensaje. El CR no es una diferencia de API,
 *  asi que los dos textos se comparan con los finales de linea normalizados. */
export function barrelDrift(barrel, generated) {
  const mine = linesOf(barrel);
  const theirs = linesOf(generated);
  const off = [];
  const rest = [];

  for (let index = 0; index < Math.max(mine.length, theirs.length); index += 1) {
    if (mine[index] === theirs[index])
      continue;

    const here = said(mine[index] ?? '(el fichero se acaba aqui)');
    const wanted = said(theirs[index] ?? '(el generador se acaba aqui)');

    (off.length < CITED ? off : rest)
      .push(`linea ${index + 1}: el barrel pone \`${here}\` y el generador \`${wanted}\``);
  }

  if (rest.length > 0)
    off.push(`… y ${rest.length} lineas mas que el generador no escribe`);

  return off;
}

/* --------------------------------------------------------------------------
 * Como se ejecuta: `pnpm audit:barrel` reescribe el fichero desde las familias y de lo
 * que piden los consumidores. Importado, este modulo es PURO —solo texto—; este brazo es
 * lo unico que toca el disco, y solo se carga cuando el fichero es el programa.
 * ------------------------------------------------------------------------ */

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { AUDIT_CONSUMERS, AUDIT_MODULES } = await import('./modules.js');
  // Las MISMAS listas que ve la meta-guardia: aqui no hay un solo nombre escrito a mano, ni
  // de modulo ni de consumidor, asi que el fichero que se regenera y el que la guardia
  // compara no pueden mirar conjuntos distintos.
  const plan = {
    families: AUDIT_MODULES.map(({ label, source }) => [label, source]),
    consumers: AUDIT_CONSUMERS.map(({ label, source }) => [label, source]),
  };
  const problems = barrelProblems(plan);

  if (problems.length > 0) {
    console.error(`el barrel no se puede escribir:\n${problems.map((line) => ` - ${line}`).join('\n')}`);
    process.exit(1);
  }

  const generated = barrelSource(plan);

  writeFileSync(join(here, 'detectors.js'), generated, 'utf8');
  console.log(`barrel escrito desde ${plan.families.length} modulos y ${plan.consumers.length} consumidores`);
  console.log(barrelDrift(readFileSync(join(here, 'detectors.js'), 'utf8'), generated));
}
