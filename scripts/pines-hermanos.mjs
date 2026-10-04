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
 * Un objeto JSON `{ "<repo>": "<sha>", ... }` en el output `shas`, que el workflow
 * lee por CLAVE y no por posicion:
 *
 *     ref: ${{ fromJSON(steps.pins.outputs.shas)['ABDEep'] }}
 *
 * Por clave y no por indice a proposito: con un indice, reordenar `siblings.json`
 * cambiaria en silencio el repo que baja cada paso, y el fallo seria un checkout
 * del repositorio equivocado, que es de las cosas mas caras de diagnosticar en un
 * workflow. Con una clave, reordenar no cambia nada.
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
 * No comprueba que los SHA existan en GitHub, ni que el commit tenga lo que la
 * rama dice. Eso lo comprueba `scripts/fetch-missing-siblings.mjs` en cada corrida,
 * y sale con 2 diciendo cual. Aqui solo se publica lo que dice `siblings.json`, y
 * se comprueba que sea utilizable: 40 hex, y los cuatro.
 *
 * Tambien imprime el grupo de pines en el log. Se pierde una cosa al mover el SHA
 * del `ref:` al output: que se veia a ojo en el propio paso del checkout. El
 * grupo lo devuelve, asi que la pregunta de "que commit se compro" tiene respuesta
 * en el log de la corrida, que es donde se busca.
 */

import { appendFileSync, readFileSync } from 'node:fs';
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

/** El inventario tal cual esta en disco. */
export function inventarioDe(ruta = join(RAIZ_PAQUETE, 'siblings.json')) {
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

// Solo cuando se ejecuta, no cuando se importa: el test usa las dos funciones de
// arriba y no tiene por que escribir en ningun sitio.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pines = pinesDe(inventarioDe());
  const destino = process.env.GITHUB_OUTPUT;

  if (!destino)
    throw new Error('GITHUB_OUTPUT no esta: este script se ejecuta desde un paso del workflow');

  // Una sola linea, porque `GITHUB_OUTPUT` es un formato de `clave=valor` y un
  // JSON partido entre lineas se leeria como cuatro outputs distintos. El mapa no
  // tiene saltos de linea, y el `JSON.stringify` no escapa los `{` ni las `"`,
  // que en `echo key=value >> GITHUB_OUTPUT` solo darian problema al principio de
  // la linea.
  appendFileSync(destino, `shas=${JSON.stringify(pines)}\n`);

  console.log('::group::Pines de los hermanos, leidos de siblings.json');
  for (const [repo, sha] of Object.entries(pines)) console.log(`  ${repo} -> ${sha.slice(0, 8)}`);
  console.log('::endgroup::');
}