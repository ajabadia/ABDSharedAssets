#!/usr/bin/env node
/**
 * LOS PINES NUEVOS: QUE SE CAMBIARIA EN `siblings.json` SI SUBIERAS AHORA
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE HACE, Y QUE HACIA ANTES
 *
 * Escribe una COPIA del inventario con el SHA de cada hermano puesto en el
 * commit en el que esta su arbol de trabajo ahora mismo, y dice cuantos hay que
 * cambiar. NO toca el inventario de verdad: esto mide el arreglo antes de
 * decidir, que es lo que hace falta porque subir un pin es la decision que no
 * se puede deshacer apretando una tecla.
 *
 * Antes escribia una copia del workflow con los cuatro `ref:` cambiados. Ese
 * workflow ya no tiene ningun `ref:` por repo —los cuatro checkout son una
 * matriz y el SHA sale de un output que publica `pines-hermanos.mjs` desde
 * `siblings.json`—, asi que el replace no encontraba nada, la copia salia
 * IDENTICA al original y el script decia «0 hermanos» como si hubiera hecho
 * todo. Un informe de cero cambios que en realidad no ha mirado nada es peor que
 * un informe de error.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE LOS SHA SE LEEN Y NO SE ESCRIBEN
 *
 * De cada repo, con `rev-parse HEAD`. Escribir un SHA a mano en este fichero
 * seria volver a poner los pines en dos sitios, que es el fallo que
 * `siblings.json` se escribio para cerrar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE AVISA DE REGENERAR LOS CONTRATOS EN EL MISMO COMMIT
 *
 * Es el orden que se separo la vez anterior: se sube el pin, el checkout baja
 * el codigo nuevo, y los contratos de este paquete se quedan de lo que habia
 * antes. El pin es lo que hace que CI sea reproducible, y a cambio de eso hay que
 * pagar el peaje de regenerar en el mismo commit. Sin este aviso, el arreglo
 * parece de un paso y no lo es.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 se ha escrito el informe, 2 los repos no se pueden leer.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PAQUETE, RAIZ_MONOREPO, motivoSinPines, pinesDe } from './sonda-ci.mjs';

const rutaInventario = process.argv[2] ?? join(PAQUETE, 'siblings.json');

try {
  main();
}
catch (exc) {
  console.error(`SUBIR-REF: ${String(exc.message ?? exc)}`);
  console.error(`            inventario: ${rutaInventario}`);
  process.exit(2);
}

function main() {
  // Sin pines el informe seria una lista de ceros, que es lo que hace que el
  // que lo lee piense que no hay nada que subir. Es un fallo de la sonda, no un
  // «no hay cambios».
  if (pinesDe(rutaInventario) === null)
    throw new Error(motivoSinPines(rutaInventario));

  const inventario = JSON.parse(readFileSync(rutaInventario, 'utf-8'));
  const cambiados = [];

  for (const hermano of inventario.hermanos ?? []) {
    const sha = headDe(hermano.repo);

    if (hermano.sha !== sha)
      cambiados.push({ repo: hermano.repo, de: hermano.sha, a: sha });

    hermano.sha = sha;
  }

  if (cambiados.length === 0) {
    console.log('ningun SHA cambia: los repos ya estan en el commit que dice el inventario.');
  }
  else {
    console.log(`${cambiados.length} SHA a cambiar:`);

    for (const c of cambiados)
      console.log(`  ${c.repo.padEnd(14)} ${c.de.slice(0, 12)} -> ${c.a.slice(0, 12)}`);
  }

  const salida = join(tmpdir(), 'siblings-SHA-nuevos.json');
  writeFileSync(salida, `${JSON.stringify(inventario, null, 2)}\n`, 'utf8');

  console.log(`\ninventario simulado: ${salida}`);
  console.log('OJO: estos SHA son LOCALES. Un SHA que no esta pusheado no lo puede');
  console.log('clonar actions/checkout, asi que esto mide el arreglo, no el push.');
  console.log('\nY el orden importa: despues de aplicar estos SHA hay que REGENERAR los');
  console.log('contratos y hacerlos en el MISMO commit. El checkout bajara el codigo');
  console.log('nuevo, y si los contratos van aparte el rojo sale en el runner.');

  process.exit(0);
}

/** El HEAD de un repo. El mensaje nombra el repo, que es la mitad del trabajo. */
function headDe(repo) {
  try {
    return execFileSync(
      'git',
      ['-c', 'safe.directory=*', '-C', join(RAIZ_MONOREPO, repo), 'rev-parse', 'HEAD'],
      { encoding: 'utf8' },
    ).trim();
  }
  catch (exc) {
    throw new Error(`${repo}: no se ha podido leer el HEAD (${String(exc.message ?? exc).split('\n')[0]})`);
  }
}