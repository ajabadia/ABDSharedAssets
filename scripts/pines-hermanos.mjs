#!/usr/bin/env node
/**
 * LOS PINES DE LOS HERMANOS, LEIDOS DE UN SOLO SITIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE ESTE SCRIPT
 *
 * El SHA fijado de cada hermano vivia escrito DOS veces: en `siblings.json`, que
 * es lo que lee `scripts/fetch-missing-siblings.mjs` para bajar al hermano que
 * falte, y en los `ref:` de los `actions/checkout` de `.github/workflows/docs-audit.yml`,
 * que son los que bajan los hermanos en una corrida normal.
 *
 * Dos copias se separan solas. No es hipotetico: paso. Alguien subio el SHA en un
 * sitio al cambiar una cabecera y dejo el otro atras, y el checkout trajo el
 * codigo nuevo mientras el fallback seguia apuntando al commit viejo. No se rompio
 * de golpe: el preflight paso en verde y un dia de estos el checkout fallo —una
 * rama borrada, un repo renombrado— y el fallo se presento como "falta una
 * cabecera", que no es lo que habia pasado.
 *
 * Aqui no se arregla mirando mas de cerca el mismo par de sitios, sino dejando de
 * tenerlos: `siblings.json` es la fuente, este script la lee y publica, y los
 * `ref:` del workflow se calculan con `fromJSON` sobre lo que este publica. No
 * hay segundo sitio donde un SHA se pueda quedar viejo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE PUBLICA, Y COMO
 *
 * Una lista `[{ "repo": ..., "sha": ... }, ...]` en el output `hermanos`, un
 * objeto `{ "<repo>": ["<fichero>", ...] }` en `ficheros`, con lo que hay que
 * ENCONTRAR en cada uno, y un objeto igual en `delHermano`, con lo que ademas hay
 * que COMPROBAR QUE ESTA: los generadores y ejecutables de cada hermano, ya sin
 * los de este paquete, que en el checkout del hermano no estan y no tienen que
 * estar. El job `pines` los expone como outputs de job y de ahi los usa todo lo
 * demas: la matriz de checkouts y las dos comprobaciones de cada pata. Los tres
 * salen de aqui y de ningun otro sitio.
 *
 * La lista y no un mapa a proposito, porque es lo que GitHub convierte en patas de
 * matriz: un array da una pata por elemento, y un objeto da UNA sola pata con
 * todos los repos dentro. Con la lista, cada pata es un hermano y lleva su
 * propio nombre:
 *
 *     repo: ${{ matrix.hermano.repo }}
 *     ref:  ${{ matrix.hermano.sha }}
 *
 * Por eso anadir un quinto hermano es tocar `siblings.json` y nada mas: no hay
 * ningun sitio mas donde declararlo, ni un `ref:` mas en ningun fichero.
 *
 * Y se escribe una sola vez, en el mismo paso que las lee: si el fichero no esta,
 * no es parseable, o un hermano llega sin SHA, este script falla AHORA y con un
 * mensaje que dice cual, en vez de dejar un `ref:` vacio. Un `ref:` vacio en un
 * `actions/checkout` no es un error: es un checkout de la rama por defecto, que es
 * justo lo que el diseno entero de los pines prohibe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE SCRIPT NO HACE
 *
 * No baja nada. Publicar los pines y clonar el hermano son dos trabajos
 * distintos: este es el que puede fallar con un inventario roto, y el otro es el
 * que necesita la red. Un paso que hace las dos cosas no puede decir cual de las
 * dos fallo.
 *
 * No comprueba tampoco que los SHA existan en GitHub, ni que el commit tenga lo que
 * el inventario dice. Eso lo comprueba el job `hermanos`, una pata por hermano, y
 * sale con 1 diciendo cual. Aqui solo se publica lo que dice `siblings.json`, y se
 * comprueba que sea utilizable: 40 hex, y los cuatro.
 *
 * Tambien imprime el grupo de pines en el log. Lo que se pierde al mover el SHA
 * del `ref:` al output es que se veia a ojo en el propio paso del checkout; el
 * grupo lo devuelve, asi que la pregunta de "que commit se compro" tiene respuesta
 * en el log de la corrida, que es donde se busca.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RAIZ_PAQUETE = dirname(here);

const SHA = /^[0-9a-f]{40}$/;

/**
 * El mapa `{ repo: sha }` que sale de `siblings.json`, comprobando que cada pin
 * sea utilizable por un `actions/checkout`.
 *
 * Se exporta separado de la escritura a `GITHUB_OUTPUT` para que
 * `tests/siblingsPins.test.js` pueda comprobar la MISMA funcion que usa el
 * workflow, en vez de una reimplementacion suya que podria divergir sin que nadie
 * se entere.
 *
 * @param {object} inventario  El contenido de `siblings.json`, ya parseado.
 * @returns {Record<string, string>}  `repo -> sha`, en el orden del fichero.
 */
export function pinesDe(inventario) {
  const hermanos = inventario?.hermanos;

  if (!Array.isArray(hermanos) || hermanos.length === 0)
    throw new Error('siblings.json no declara ninguna lista de hermanos');

  const pines = {};

  for (const h of hermanos) {
    const repo = h?.repo;

    if (typeof repo !== 'string' || repo === '')
      throw new Error('siblings.json: hay un hermano sin "repo"');

    // La clave de un `ref:` con notacion de corchetes no puede llevar comillas ni
    // espacios, porque el workflow la escribe dentro de una expresion. Se avisa
    // aqui, que es donde se puede arreglar, en vez de fallar mas tarde en un
    // `fromJSON` del workflow con un error que no nombra el repo.
    if (!/^[A-Za-z0-9_-]+$/.test(repo))
      throw new Error(`siblings.json: el repo "${repo}" no sirve como clave de expresion`);

    if (typeof h.sha !== 'string' || !SHA.test(h.sha))
      throw new Error(`siblings.json: ${repo} no tiene un SHA de 40 hex en "sha"`);

    if (pines[repo] !== undefined)
      throw new Error(`siblings.json: ${repo} esta dos veces`);

    pines[repo] = h.sha;
  }

  return pines;
}

/**
 * La lista de `{ repo, sha }`, que es la forma que GitHub convierte en patas.
 *
 * Y aqui esta la razon de que el output sea una LISTA y no un mapa, que parece lo
 * contrario y no lo es: `strategy.matrix` convierte un array en una pata por
 * elemento, y un objeto en UNA pata sola. Un `fromJSON` de `{repo: sha}` da un
 * unico `matrix.hermano` con todos los repos dentro, y `matrix.hermano.repo` no
 * existe: el job baja el primer repo cuatro veces y el rojo, si lo hay, no dice de
 * quien. Con una lista de objetos, una pata por hermano, y `matrix.hermano.repo` y
 * `matrix.hermano.sha` son los de ese.
 *
 * @param {object} inventario  El contenido de `siblings.json`, ya parseado.
 * @returns {Array<{repo: string, sha: string}>}  en el orden del fichero.
 */
export function hermanosDe(inventario) {
  const pines = pinesDe(inventario);

  return Object.entries(pines).map(([repo, sha]) => ({ repo, sha }));
}

/**
 * El mapa `{ repo -> lee }` de los generadores y ficheros que el checkout tiene
 * que traer, o de los que este paquete tiene que compilar.
 *
 * Va en el MISMO output y por el mismo motivo que `necesita`: son rutas, y una
 * ruta escrita en el workflow es una segunda copia. Pero no es lo mismo que
 * `necesita` y por eso no se mezcla: `necesita` es lo que el generador ABRE, y
 * esto es lo que ademas hay que COMPROBAR QUE ESTA.
 *
 * Lo que se comprueba, y por que cada rama:
 *
 *   - Una ruta que NO empieza por `scripts/` es del HERMANO: tiene que existir en
 *     el checkout que acaba de bajar el job `hermanos`. Es lo que se va a abrir o
 *     lo que se va a compilar, y si la movieron de sitio el checkout llega sin
 *     ella y el fallo sale mas tarde como "falta una cabecera", que es la forma
 *     mas cara de enterarse.
 *   - Una ruta que empieza por `scripts/` sin mayuscula es de ESTE paquete: la
 *     comprueba el propio repo, no el checkout del hermano, y por eso no se pide
 *     al job `hermanos` que la busque donde no esta.
 *
 * La distincion es por el nombre del directorio y no por un campo mas porque los
 * tres repos tienen `Scripts/` con mayuscula y `scripts/` sin ella: es lo unico
 * que los distingue sin ambiguedad.
 *
 * @param {object} inventario  El contenido de `siblings.json`, ya parseado.
 * @returns {Record<string, string[]>}  `repo -> lee`, en el orden del fichero.
 */
export function leidosDe(inventario) {
  const hermanos = inventario?.hermanos;

  if (!Array.isArray(hermanos) || hermanos.length === 0)
    throw new Error('siblings.json no declara ninguna lista de hermanos');

  const leidos = {};

  for (const h of hermanos) {
    const repo = h?.repo;

    if (typeof repo !== 'string' || repo === '')
      throw new Error('siblings.json: hay un hermano sin "repo"');

    if (!Array.isArray(h.lee) || h.lee.length === 0)
      throw new Error(`siblings.json: ${repo} no declara que lee ("lee")`);

    for (const rel of h.lee) {
      if (typeof rel !== 'string' || rel === '')
        throw new Error(`siblings.json: ${repo} tiene una entrada vacia en "lee"`);

      if (/^[\\/]|[A-Z]:|\.\./.test(rel))
        throw new Error(`siblings.json: ${repo} lee "${rel}", que no es una ruta relativa dentro de un repo`);
    }

    leidos[repo] = [...h.lee];
  }

  return leidos;
}

/**
 * Las rutas de `lee` que tienen que existir en el CHECKOUT DEL HERMANO.
 *
 * Y no todas las de `lee`, que es justo el punto: `scripts/generate_s950_...` y
 * `scripts/generate_modulation_contracts.py` son generadores de ESTE paquete, que
 * existen en el arbol de trabajo y no en el checkout del hermano. Pedirle al job
 * `hermanos` que las compruebe ahi seria un rojo siempre, y un rojo siempre es un
 * rojo que nadie lee.
 *
 * LA REGLA ES DONDE EXISTE EL FICHERO, Y NO COMO SE LLAMA. Lo primero que se probo
 * fue `!/^scripts\//`, por la costumbre de que aqui los generadores estan en
 * `scripts/`. Y es falso: `ABDEep/scripts/registry_generator.js` y
 * `ABDMS2000/Scripts/registry_generator.js` empiezan los dos por lo que parece la
 * misma cosa y son generadores del HERMANO. Con ese filtro el job `hermanos` se
 * comia dos generadores sin comprobar, que es el fallo que este paso existe para
 * cazar.
 *
 * Asi que la particion es la unica que no se puede equivocar: si el fichero esta
 * bajo este paquete, es de este paquete; si no esta, es del hermano, y que lo
 * compruebe la pata con el checkout delante. Si no esta en ninguno de los dos, el
 * job `hermanos` lo dice nombrando repo y ruta, que es donde se arregla.
 *
 * La particion va AQUI y no en el `run:` del workflow por la misma razon por la que
 * los SHA no estan escritos en ningun `ref:`: una regla de que rutas son de quien,
 * escrita en el workflow, es una segunda copia que se desincroniza sin que nadie lo
 * note. Aqui la lee un `node --check`; alla, solo una carrera.
 *
 * @param {string[]} lee
 * @param {string} raizPaquete  Donde esta este repo en disco.
 * @returns {string[]}
 */
export function delHermanoDe(lee, raizPaquete = RAIZ_PAQUETE) {
  return lee.filter((rel) => !existsSync(join(raizPaquete, ...rel.split('/'))));
}

/** El inventario tal cual esta en disco. */
export function inventarioDe(ruta = join(RAIZ_PAQUETE, 'siblings.json')) {
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

/**
 * El mapa `{ repo: [fichero, ...] }` de lo que hay que encontrar en cada hermano.
 *
 * Va en el MISMO output que los pines y por el mismo motivo: la lista de ficheros
 * que un checkout debe traer es, igual que su SHA, un dato del inventario. Si el
 * workflow la escribiera en un `run:` seria otra copia, y la copia es la que se
 * queda vieja: el generador abre un fichero nuevo, el inventario lo lista, y la
 * lista del workflow sigue sin el. El rojo sale entonces como "falta una
 * cabecera", que es justo lo que paso.
 *
 * @param {object} inventario  El contenido de `siblings.json`, ya parseado.
 * @returns {Record<string, string[]>}  `repo -> necesita`, en el orden del fichero.
 */
export function ficherosDe(inventario) {
  const hermanos = inventario?.hermanos;

  if (!Array.isArray(hermanos) || hermanos.length === 0)
    throw new Error('siblings.json no declara ninguna lista de hermanos');

  const ficheros = {};

  for (const h of hermanos) {
    const repo = h?.repo;

    if (typeof repo !== 'string' || repo === '')
      throw new Error('siblings.json: hay un hermano sin "repo"');

    // Una lista vacia haria que la comprobacion del checkout pasara sin mirar
    // nada, que es el verde que no mira nada. Se avisa aqui, que es donde se
    // arregla: o el hermano declara lo que se le va a abrir, o no se baja.
    if (!Array.isArray(h.necesita) || h.necesita.length === 0)
      throw new Error(`siblings.json: ${repo} no declara que ficheros necesita`);

    for (const rel of h.necesita) {
      if (typeof rel !== 'string' || rel === '')
        throw new Error(`siblings.json: ${repo} tiene una entrada vacia en "necesita"`);

      // Absoluta o con `..` no la comprueba el checkout del hermano: se sale de su
      // arbol y el paso se pone verde con algo que no esta en el repo.
      if (/^[\\/]|[A-Z]:|\.\./.test(rel))
        throw new Error(`siblings.json: ${repo} necesita "${rel}", que no es una ruta relativa dentro del repo`);
    }

    ficheros[repo] = [...h.necesita];
  }

  return ficheros;
}

// Solo cuando se ejecuta, no cuando se importa: el test usa las funciones de arriba
// y no tiene por que escribir en ningun sitio.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventario = inventarioDe();
  const pines = pinesDe(inventario);
  const hermanos = hermanosDe(inventario);
  const ficheros = ficherosDe(inventario);
  const leidos = leidosDe(inventario);
  const destino = process.env.GITHUB_OUTPUT;

  if (!destino)
    throw new Error('GITHUB_OUTPUT no esta: este script se ejecuta desde un paso del workflow');

  // Una sola linea cada uno, porque `GITHUB_OUTPUT` es un formato de `clave=valor` y
  // un JSON partido entre lineas se leeria como cuatro outputs distintos. Ni la
  // lista ni el mapa tienen saltos de linea, y el `JSON.stringify` no escapa los
  // `{` ni las `"`, que en `echo key=value >> GITHUB_OUTPUT` solo darian problema al
  // principio de la linea.
  appendFileSync(destino, `hermanos=${JSON.stringify(hermanos)}\n`);
  appendFileSync(destino, `ficheros=${JSON.stringify(ficheros)}\n`);
  appendFileSync(destino, `delHermano=${JSON.stringify(
    Object.fromEntries(Object.entries(leidos).map(([repo, lee]) => [repo, delHermanoDe(lee)])),
  )}\n`);

  console.log('::group::Pines de los hermanos, leidos de siblings.json');
  for (const [repo, sha] of Object.entries(pines))
    console.log(`  ${repo} -> ${sha.slice(0, 8)}  (${ficheros[repo].length} ficheros que se le van a abrir)`);
  console.log('::endgroup::');
}