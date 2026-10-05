#!/usr/bin/env node
/**
 * SONDA DEL PREFLIGHT: QUE DARIA CI, CON LOS SHA FIJADOS
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL POR QUE
 *
 * `pnpm run preflight` da 1 en esta maquina. La pregunta util no es si da 1 —esa
 * se responde leyendo— sino si CI daria 0 con el MISMO comando, y la respuesta
 * no se puede sacar del arbol de trabajo: el generador lee lo que hay en disco, y
 * en disco hay ficheros de codigo que nadie ha commiteado. El runner no los
 * tendra: baja el SHA que dice `siblings.json`.
 *
 * Asi que esto monta un sandbox con la forma del workflow —un `ABDSharedAssets/`
 * al lado de los hermanos— donde cada hermano son EXACTAMENTE los ficheros de su
 * SHA, y corre el preflight de verdad ahi dentro. Si el RC es 0, el rojo local
 * viene del arbol; si es 1, el rojo tambien esta en el pin y hay que arreglarlo
 * en el commit, no en el checkout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE PAQUETE SI SE COPIA ENTERO Y LOS HERMANOS NO
 *
 * El preflight mira `contracts/`, `scripts/`, `package.json` y las salidas de los
 * generadores. Los hermanos son material FROZEN —de eso va la sonda—, mientras
 * que este paquete es la rama de trabajo con el PR dentro. Copiarlo entero es lo
 * que hace la pregunta correcta: «si subo esto tal cual, que hara el runner».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS
 *
 *   0  el preflight emulado dio 0.
 *   1  dio rojo. ESTE ES EL DATO: por eso se propaga y no se come el codigo. La
 *      version de `ABDEep/build/` terminaba en `process.exit(0)` con el RC
 *      impreso, y un veredicto que solo existe en el texto no lo puede leer un
 *      `if`, ni una cadena de montage, ni nadie con prisa.
 *   2  no se pudo montar el sandbox.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PAQUETE, correr, montarSandbox, motivoSinPines, pinesDe } from './sonda-ci.mjs';

const rutaInventario = process.argv[2] ?? join(PAQUETE, 'siblings.json');
const pines = pinesDe(rutaInventario);

if (pines === null) {
  console.error(`SONDA-PREFLIGHT: ${motivoSinPines(rutaInventario)}`);
  console.error('Sin SHA no se puede montar el sandbox con hermanos, y un sandbox sin');
  console.error('hermanos sale en verde mirando el vacio. No se arranca.');
  process.exit(2);
}

console.log('SHA que tiene fijados el inventario:');
for (const [repo, sha] of Object.entries(pines))
  console.log(`  ${repo.padEnd(14)} ${sha}`);

const { sandbox, puesto, limpiar } = montarSandbox({ pines, arbolDeTrabajo: true });

for (const p of puesto)
  console.log(`  materializado ${p.repo.padEnd(14)} ${p.puestos} ficheros de ${p.sha.slice(0, 12)}${p.saltados ? `, ${p.saltados} no escribibles` : ''}`);

console.log(`\nsandbox: ${sandbox}`);

const script = join(sandbox, 'ABDSharedAssets', 'scripts', 'check-generated-contracts.mjs');

if (!existsSync(script)) {
  console.error('SONDA-PREFLIGHT: el sandbox no tiene el preflight. El copiado ha fallado.');
  limpiar();
  process.exit(2);
}

console.log('\n--- node scripts/check-generated-contracts.mjs, con los SHA fijados ---');
console.log('(esto es el paso `pnpm run preflight` del job `audit`)');

const r = correr(join(sandbox, 'ABDSharedAssets'), [script]);

console.log(r.salida);
if (r.error !== '')
  console.error(r.error);

limpiar();

console.log(`\nRC=${r.codigo}`);

if (r.codigo === 0) {
  console.log('El preflight pasa con los SHA fijados, asi que el rojo de esta maquina');
  console.log('viene del ARBOL DE TRABAJO de los hermanos y no de los pines.');
}
else {
  console.log('El preflight falla tambien con los SHA fijados: el problema es del PIN,');
  console.log('no del arbol. Se arregla commiteando y subiendo el pin, no limpiando');
  console.log('el arbol de trabajo.');
}

process.exit(r.codigo);