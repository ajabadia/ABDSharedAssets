#!/usr/bin/env node
/**
 * LOS GENERADORES DE LOS HERMANOS, Y POR QUE ESTO ES UN SCRIPT Y NO UN PASO EN
 * EL WORKFLOW.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE COMPRUEBA
 *
 * `GENERADORES_HERMANOS` en `scripts/check-generated-contracts.mjs`: los
 * generadores de ABDEep, ABDMS2000 y ABDNeural. Cada uno se corre con su
 * `--check` —que compara y NO escribe— y ademas se mira que sus salidas
 * existan y lleven marca de generado. Los dos repos de codigo tienen `--check`
 * porque se lo anadio en el commit que los metio en la lista.
 *
 * Y el generador de ABDNeural no se corre: es un ejecutable de C++ que este
 * paquete no compila. De el se comprueban las salidas, no que esten al dia, y
 * el script lo dice en voz alta para que su verde no se lea como mas de lo que
 * es.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO ESTA EN EL PREFLIGHT Y EN UN SCRIPT, Y NO SOLO EN EL PREFLIGHT
 *
 * El preflight ya comprueba esto —es `main()`, no hace falta llamar a nada— y
 * aun asi hay un script aparte, porque los dos se leen distinto:
 *
 *   - El preflight es «los contratos generados estan al dia». Su rojo puede ser
 *     un contrato, un `.h` de la cuarentena o un generador de hermano, y el
 *     nombre del paso no dice cual de las tres cosas ha pasado.
 *   - Este script es solo los generadores de los hermanos. Su rojo SIEMPRE es
 *     eso, y su paso en el workflow se puede pedir como required sin arrastrar
 *     al resto del preflight.
 *
 * Es el mismo motivo por el que el S950 tiene paso propio: el valor esta en que
 * el check que se pone rojo tenga NOMBRE, no en que haya un check mas. Por eso
 * esto no SUSTITUYE al preflight —este lo sustituye—: si alguien limpia este
 * paso, el preflight sigue vigilando y no pasa nada, que es el riesgo de dejar
 * dos puertas para lo mismo sin el comentario que las ata. Aqui esta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ES IDEMPOTENTE Y NO ESSUCIA NADA
 *
 * Todos los generadores se corren con `--check`, que compara y no escribe. Sin
 * ese flag, correr «para comprobar» dejaria el checkout del hermano con cambios
 * y el CI en verde: un falso verde que ademas pisa el arbol de otro repo. Por
 * eso un generador que no acepta `--check` NO se corre: se reporta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 todo correcto (o lo que no se ha podido mirar, dicho), 1 algo
 * falla de verdad.
 */

import { GENERADORES_HERMANOS, generadorHermanoProduceLoQueDice } from './check-generated-contracts.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = dirname(aqui);

function main() {
console.log('LOS GENERADORES DE LOS HERMANOS');
console.log('='.repeat(72));

const desfasados = [];
const noComprobados = [];

for (const hermano of GENERADORES_HERMANOS) {
  if (!existsSync(join(raiz, '..', hermano.repo))) {
    console.log(`  NO COMPROBADO  ${hermano.repo}: no esta clonado`);
    noComprobados.push(`${hermano.repo}: no esta clonado`);
    continue;
  }

  const r = generadorHermanoProduceLoQueDice(hermano);

  for (const aviso of r.avisos)
    console.log(`  aviso         ${aviso}`);

  if (r.problemas.length === 0) {
    const etiqueta = hermano.node === false ? 'generado' : 'al dia     ';

    console.log(`  ${etiqueta}      ${hermano.repo}: ${hermano.salidas.length} salida(s) — ${hermano.queEs}`);
    continue;
  }

  console.log(`  ROJO          ${hermano.repo}: ${hermano.queEs}`);

  for (const p of r.problemas)
    console.log(`                ${p}`);

  if (r.comprobado)
    desfasados.push(hermano);
  else
    noComprobados.push(`${hermano.repo}: ${r.problemas[0]}`);
}

console.log('='.repeat(72));

if (noComprobados.length > 0) {
  console.log('');
  console.log(`NO SE HAN PODIDO COMPROBAR (${noComprobados.length}):`);

  for (const n of noComprobados)
    console.log(`  ${n}`);

  console.log('');
  console.log('Esto NO es un generador roto: es que no se ha podido ni mirar, asi que');
  console.log('este paso NO dice que esos .gen esten al dia. Para que se comprueben:');
  console.log('  node scripts/fetch-missing-siblings.mjs');
}

if (desfasados.length === 0) {
  console.log('');
  console.log('OK — todo lo que se ha podido comprobar, esta al dia.');
  console.log('');
  console.log('Lo que NO se ha comprobado, por lo que no hay verde en el:');
  console.log('  · el generador de ABDNeural es un binario de C++; el build de ese repo');
  console.log('    es quien dice si sus dos salidas estan al dia.');
  console.log('  · el hermano que no este clonado, de los de arriba.');

  return 0;
}

console.log('');
console.log(`FALLIDO: ${desfasados.length} generador(es) de hermano(s) desfasado(s).`);

for (const h of desfasados) {
  console.log('');
  console.log(`  ${h.repo} — ${h.queEs}`);
  console.log(`     Fuentes:  ${h.deDondeSale}`);
  console.log(`      Arreglo:  cd ../${h.repo} && node ${h.generador}`);
  console.log(`      Luego:    commit dea los ${h.salidas.length} ficheros que salgan, dentro de ${h.repo}.`);
}

console.log('');
console.log('El arreglo NO es regenerar aqui: el generador, sus fuentes y sus salidas');
console.log('estan todos en el repo hermano. Este paquete solo los mira.');

return 1;
}

if (process.argv[1] && existsSync(process.argv[1])
    && process.argv[1].replace(/\\/g, '/').endsWith('check-hermanos-generadores.mjs'))
  process.exit(main());
