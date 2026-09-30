#!/usr/bin/env node
/**
 * EL FALLBACK DE LOS HERMANOS: si falta alguno, se baja SU SHA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE, Y CUAL ES EL AGUJERO QUE CIERRA
 *
 * El paso de `actions/checkout` de cada hermano es el mecanismo de verdad, y es
 * el que se ve en la pestaña de la corrida, que no es poco. Este script es la
 * red debajo: cuando un hermano NO esta, lo clona en el SHA fijado.
 *
 * El caso que importa no es que el checkout falle —si falla, el paso falla y el
 * job muere con un error de checkout, que ya se lee bien—. Es el caso en el que
 * el checkout se SALTA o no llega a ejecutarse y el preflight se lanza igual: ahi
 * los generadores no encuentran su cabecera, dicen "no he podido comprobar" y
 * el job se va en rojo por un 2 que de verdad es un fallo del montaje, no del
 * contrato. Y en local, el mismo script deja correr el preflight en una carpeta
 * donde solo se ha clonado este repo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PATRON, Y QUE NO ES EL DE ABDAudioLab
 *
 * ABDAudioLab hace esto mismo —usar el hermano si esta a mano, y si no,
 * `FetchContent` con `GIT_TAG` fijado— pero en su `CMakeLists.txt`, porque es un
 * proyecto de CMake. Este paquete no tiene CMake: son scripts de Python que leen
 * ficheros sueltos. La misma idea, con `git clone` en vez de `FetchContent`, y
 * por eso el script en vez de una linea de CMake.
 *
 * Lo que se conserva del patron es lo importante: el fallback tambien va FIJADO
 * a un SHA, nunca a una rama. Un fallback a `main` daria verde hoy y rojo manana
 * sin que nadie tocara nada, que es el fallo que esta puerta existe para evitar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MISMA RAIZ QUE LOS GENERADORES, Y POR QUE NO ES UN DETALLE
 *
 * Los tres generadores calculan la raiz asi:
 *
 *     HERE = dirname(abspath(__file__))        # <paquete>/scripts
 *     ROOT = dirname(dirname(HERE))            # la carpeta HERMANA
 *
 * y de ahi leen `<ROOT>/<repo>/<fichero>`. Este script usa EXACTAMENTE esa
 * misma cuenta. Si el dia que uno cambia, el otro tiene que cambiar el mismo
 * dia: si el fallback clona a donde los generadores no miran, el preflight
 * seguira dando 2 con el hermano descargado a un palmo, y el mensaje seguira
 * mintiendo sobre la causa. `tests/siblingsPins.test.js` comprueba que las dos
 * cuentas siguen coincidiendo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENTE, Y POR QUE LA COMPROBACION ES "ESTA EL FICHERO" Y NO "EXISTE EL DIR"
 *
 * Un directorio de hermano puede existir y estar a medias: un clon interrumpido,
 * una rama a la que le faltan ficheros. Preguntar por el DIR daria "presente" y
 * el fallo volveria a ser el 2 de siempre. Se pregunta por el fichero que el
 * generador va a ABRIR, que es lo que de verdad hace falta.
 *
 * Y solo se clona lo que falta: un hermano ya presente no se toca, ni se
 * comprueba su SHA, ni se avisa. Un script que red de lo que ya esta puesto
 * acabaria pisando un arbol de trabajo con cambios locales, que es la peor
 * forma de perder el trabajo de alguien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 todo en su sitio (o bajandolo), 1 no se pudo dejar completo.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** La raiz del paquete, y la CARPETA HERMANA: la misma cuenta que los generadores. */
const PAQUETE = dirname(here);
const RAIZ = dirname(PAQUETE);

/** Lee `siblings.json` y falla si no se puede: sin el, este script no sabe nada. */
function inventario() {
  const ruta = join(PAQUETE, 'siblings.json');

  if (!existsSync(ruta))
    throw new Error('no encuentro siblings.json en ' + PAQUETE);

  const man = JSON.parse(readFileSync(ruta, 'utf-8'));

  if (!Array.isArray(man.hermanos) || man.hermanos.length === 0)
    throw new Error('siblings.json no declara ningun hermano');

  return man.hermanos;
}

/** Lo que ya hay de un hermano: todos sus ficheros, o los que falten. */
function faltan(hermano) {
  const base = join(RAIZ, hermano.repo);

  return hermano.necesita.filter((rel) => !existsSync(join(base, ...rel.split('/'))));
}

/**
 * Un clon a un SHA, en DOS pasos, y el motivo de que sean dos.
 *
 * `git clone --branch <sha>` NO funciona: `--branch` es para ramas y etiquetas, y
 * un SHA suelto no es ninguna de las dos cosas. El truco de bajarlo como si fuera
 * una etiqueta es lo que hace que esto falle con un error que no explica nada
 * ("Remote branch <sha> not found in upstream origin"), que es justo el tipo de
 * mensaje que hace perder media hora.
 *
 * Asi que: `init` en un directorio vacio, `remote add`, `fetch` de ese SHA
 * concreto y `checkout` de lo que ha venido. Cuatro comandos y ninguna suposicion.
 * Y se comprueba el codigo de salida de cada uno, porque un fallo a medias deja
 * un directorio que existe y esta vacio, que es justo el caso que la comprobacion
 * de ficheros de `faltan()` sabe detectar y que un `existsSync` del directorio no.
 *
 * @returns {string|null} el error, o null si se ha dejado bien.
 */
function clonar(hermano) {
  const destino = join(RAIZ, hermano.repo);
  const url = `https://github.com/ajabadia/${hermano.repo}.git`;

  // Cada paso es la lista COMPLETA de argumentos, en plano. Anidarlos y
  // desplegarlos despues se sospecha bien y se rompe: `git -C` se queda sin el
  // directorio y responde con el texto de uso entero, que no dice nada de nada.
  const pasos = [
    ['init', destino],
    ['-C', destino, 'remote', 'add', 'origin', url],
    ['-C', destino, 'fetch', '--depth', '1', 'origin', hermano.sha],
    ['-C', destino, 'checkout', 'FETCH_HEAD'],
  ];

  for (const args of pasos) {
    const r = spawnSync('git', args, {
      encoding: 'utf-8',
      timeout: 300_000,
      windowsHide: true,
    });

    if (r.status !== 0) {
      const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n')
        .slice(0, 3).join(' | ');
      return `git ${args.join(' ')} fallo: ${salida || r.error?.message || 'sin salida'}`;
    }
  }

  return null;
}

function main() {
  let hermanos;

  try {
    hermanos = inventario();
  } catch (exc) {
    console.error('FALLBACK de hermanos: no se lee el inventario.');
    console.error(String(exc.message ?? exc));
    return 2;
  }

  console.log(`FALLBACK de hermanos (raiz: ${RAIZ})`);
  console.log('='.repeat(72));

  const rotos = [];

  for (const hermano of hermanos) {
    const ausentes = faltan(hermano);

    if (ausentes.length === 0) {
      console.log(`  ya esta      ${hermano.repo} @ ${hermano.sha.slice(0, 8)}`);
      continue;
    }

    console.log(`  falta        ${hermano.repo} @ ${hermano.sha.slice(0, 8)}`);
    for (const rel of ausentes)
      console.log(`                 no esta ${rel}`);

    const error = clonar(hermano);
    if (error) {
      rotos.push(`${hermano.repo}: ${error}`);
      console.log(`  NO PUDO      ${hermano.repo}`);
      continue;
    }

    const tras = faltan(hermano);
    if (tras.length > 0) {
      rotos.push(`${hermano.repo}:Sigue faltando ${tras.join(', ')} tras clonar`);
      console.log(`  INCOMPLETO   ${hermano.repo} (clonado pero incompleto)`);
      continue;
    }

    console.log(`  bajando OK   ${hermano.repo} @ ${hermano.sha.slice(0, 8)}`);
  }

  console.log('='.repeat(72));

  if (rotos.length > 0) {
    console.log('');
    console.log(`HERMANOS QUE NO HAN QUEDADO LISTOS (${rotos.length}):`);
    for (const r of rotos) console.log(`  ${r}`);
    console.log('');
    console.log('Esto NO es un contrato desfasado: es que no se ha podido ni mirar.');
    console.log('El preflight dira "no he podido comprobar" y sale con 2, que es lo');
    console.log('mismo que diria si el hermano estuviera. Mira el SHA de arriba: si');
    console.log('ese commit ya no existe en el repo, hay que subirlo en siblings.json');
    console.log('Y en el workflow, que fijan el mismo dato.');
    return 2;
  }

  console.log('todos los hermanos estan en su sitio, con los ficheros que se leen.');
  return 0;
}

if (process.argv[1] && existsSync(process.argv[1])
    && process.argv[1].replace(/\\/g, '/').endsWith('fetch-missing-siblings.mjs'))
  process.exit(main());
