/**
 * EJECUTA un fichero de test de vitest sin vitest.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE FICHERO EXISTE.
 *
 * En esta maquina vitest no arranca: los ficheros del store de pnpm tienen ACL
 * denegada para el usuario que las ejecuta. Asi que un test nuevo no se puede
 * "dar por verde" solo porque `node --check` pasa —eso no comprueba una sola
 * asercion— y sin ejecutarlo no se sabe si lo que el test afirma es cierto.
 *
 * Esto no es un sustituto de vitest y no pretende serlo. Lo unico que hace es
 * contar aserciones y decir cual fallo; los mocks, snapshots y `each` no estan,
 * y a proposito. Los primitivos estan en `build_verif_shim.mjs`, en un fichero
 * aparte, y el motivo de que esten aparte esta ahi: un solo fichero se
 * deadlocka consigo mismo al importarse desde el test que esta lanzando.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMO LO HACE, Y POR QUE LA COPIA VA AL LADO DEL ORIGINAL.
 *
 * Se reescribe el `import ... from 'vitest'` para que apunte al shim, y se
 * ejecuta una copia del test. La copia se escribe EN LA MISMA CARPETA que el
 * original porque los imports del test son RELATIVOS —`../utils/quarantine.js`—
 * y una URL de datos no tiene base contra la que resolverlos. Ponerla al lado es
 * lo unico que funciona sin tocar el codigo que se quiere probar, y se borra al
 * terminar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * USO.
 *
 *   node build_verif_harness.mjs tests/quarantineRule.test.js
 *   node build_verif_harness.mjs tests/a.test.js tests/b.test.js
 *
 * Sale con 0 si todo pasa y con 1 si hay un solo rojo, para que sirva en un
 * pipeline igual que serviria vitest.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { estado } from './build_verif_shim.mjs';

const ficheros = process.argv.slice(2);

if (ficheros.length === 0) {
  console.error('uso: node build_verif_harness.mjs <fichero.test.js> [...]');
  process.exit(2);
}

const shim = pathToFileURL(resolve(import.meta.dirname, 'build_verif_shim.mjs')).href;

for (const f of ficheros) {
  const absoluta = resolve(f);
  const carpeta = dirname(absoluta);
  const original = readFileSync(absoluta, 'utf8');
  const parcheado = original.replace(/from\s+['"]vitest['"]/g, `from '${shim}'`);

  if (parcheado === original) {
    console.log(`AVISO: ${f} no importa de 'vitest'. Puede que no sea un test, o que `
      + 'use otra cosa. Se ejecuta igualmente, pero las aserciones no seIran contando.');
  }

  const copia = join(carpeta, `__verif__${basename(absoluta)}`);
  writeFileSync(copia, parcheado, 'utf8');

  try {
    await import(pathToFileURL(copia).href);
  } finally {
    rmSync(copia, { force: true });
  }
}

console.log('\n' + '='.repeat(64));
console.log(estado.fallos === 0
  ? `TODO EN VERDE: ${estado.total} aserciones`
  : `ROJO: ${estado.fallos} fallo(s) de ${estado.total} aserciones`);

process.exit(estado.fallos === 0 ? 0 : 1);
