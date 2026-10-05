#!/usr/bin/env node
/**
 * SONDA DE LOS GUARDAS: QUE DARIA CI EN EL PASO QUE MAS FALLA
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL POR QUE
 *
 * Los tres `guardasDeEscritura.test.js` son ficheros SIN COMMITEAR en sus repos,
 * y el workflow no clona `main`: clona el SHA que dice `siblings.json`. En local
 * el `--check` sale verde porque el fichero esta en el arbol de trabajo; en CI el
 * checkout llega al SHA y el fichero no esta ahi. Los dos verdes son el mismo
 * comando sobre dos codigos distintos, y solo uno de los dos es el de CI.
 *
 * Esta sonda monta el sandbox con los SHA puestos y corre el motor de los
 * guardas dentro, que es el paso cuyo rojo mas se ha confundido con un rojo de
 * codigo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE NO SE COPIA DE ESTE PAQUETE, Y POR QUE SOLO EL MOTOR
 *
 * El motor —`generar-guardas-escritura.mjs`— calcula sus rutas desde su propio
 * fichero y espera estar en su repo. Es el unico script del paso, asi que el
 * sandbox lleva solo ese, en la misma forma de arbol. Copiarlo entero no
 * aportaria nada y dejaria el sandbox con ficheros que el runner no tendria.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 el motor emulado dio 0, 1 dio rojo (el dato), 2 no se monto el sandbox.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PAQUETE, correr, montarSandbox, motivoSinPines, pinesDe } from './sonda-ci.mjs';

/** Los tres guardas, y donde escribe cada uno. La lista es el fallo si se queda corta. */
const GUARDAS = {
  ABDEep: 'scripts/guardasDeEscritura.test.js',
  ABDMS2000: 'WebUI/tests/guardasDeEscritura.test.js',
  ABDNeural: 'WebUI/tests/guardasDeEscritura.test.js',
};

const rutaInventario = process.argv[2] ?? join(PAQUETE, 'siblings.json');
const pines = pinesDe(rutaInventario);

if (pines === null) {
  console.error(`SONDA-GUARDAS: ${motivoSinPines(rutaInventario)}`);
  console.error('Sin SHA no se puede montar el sandbox con hermanos, y un sandbox sin');
  console.error('hermanos sale en verde mirando el vacio. No se arranca.');
  process.exit(2);
}

console.log('SHA que tiene fijados el inventario:');
for (const [repo, sha] of Object.entries(pines))
  console.log(`  ${repo.padEnd(14)} ${sha}`);

const { sandbox, puesto, limpiar } = montarSandbox({
  pines,
  copiar: ['scripts/generar-guardas-escritura.mjs'],
});

for (const p of puesto)
  console.log(`  materializado ${p.repo.padEnd(14)} ${p.puestos} ficheros de ${p.sha.slice(0, 12)}${p.saltados ? `, ${p.saltados} no escribibles` : ''}`);

console.log(`\nsandbox: ${sandbox}`);

console.log('\nlo que hay en el sandbox tras materializar los SHA fijados:');
for (const [repo, fichero] of Object.entries(GUARDAS)) {
  const abs = join(sandbox, repo, fichero);

  console.log(`  ${repo.padEnd(14)} ${fichero.padEnd(36)} ${existsSync(abs) ? 'existe' : 'NO EXISTE'}`);
}

const motor = join(sandbox, 'ABDSharedAssets', 'scripts', 'generar-guardas-escritura.mjs');

if (!existsSync(motor)) {
  console.error('SONDA-GUARDAS: el sandbox no tiene el motor. El copiado ha fallado.');
  limpiar();
  process.exit(2);
}

console.log('\n--- node generar-guardas-escritura.mjs --check, con los SHA fijados ---');
console.log('(esto es el paso `pnpm run check:guardas` del job `audit`)');

const r = correr(join(sandbox, 'ABDSharedAssets'), [motor, '--check']);

console.log(r.salida);
if (r.error !== '')
  console.error(r.error);

limpiar();

console.log(`\nRC=${r.codigo}`);

// El cierre dice QUE hacer con el dato, que es lo que hace que una sonda se use.
// Solo hay dos respuestas y cada una tiene su arreglo, asi que van separadas y
// no encadenadas: una cadena de if/else con la misma longitud de linea obliga a
// leer las tres para entender la primera.
const AL_PISTON = [
  'Los guardas pasan con los SHA fijados, asi que este paso NO se pondra en rojo en CI.',
  'Un rojo del --check en local, con el sandbox en verde, viene del ARBOL DE TRABAJO.',
];

const EN_EL_PIN = [
  'Los guardas fallan con los SHA fijados: este paso se pondra en rojo en CI aunque',
  'aqui salga verde. Si arriba sale NO EXISTE, el guard esta SIN COMMITEAR en su repo:',
  'el --check local lo mira en el arbol y el runner no lo bajara.',
  'Arreglo: commitear el guard en su repo y subir despues el SHA del pin que ya lo contenga.',
];

if (r.codigo === 0)
  console.log(AL_PISTON.join('\n'));
else
  console.log(EN_EL_PIN.join('\n'));

process.exit(r.codigo);