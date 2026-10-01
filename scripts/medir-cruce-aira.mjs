#!/usr/bin/env node
/**
 * MIDE el cruce entre los 31 bloques del catalogo de libreria y los 31 modulos
 * del patch_spec del AIRA, y dice si la cuarentena se puede levantar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE SCRIPT Y POR QUE NO CALCULA NADA
 *
 * Este fichero imprime. El cruce se calcula en `utils/cruceAira.js`, en una
 * funcion pura, y aqui no hay ni una linea de comparacion. Eso es a proposito:
 * cuando el calculo vivia en el script y en el test por separado, eran dos
 * implementaciones de la misma cuenta, y dos implementaciones son dos cosas que
 * pueden decir numeros distintos. Un solo calculo, tres consumidores —este
 * script, la lista de cuarentena y el test— y ninguno puede desincronizarse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE HAY QUE HACER CON LO QUE SALGA
 *
 * Si `completo` sale a true, la cuarentena se levanta: fuera `status` y
 * `statusReason` del contrato, fuera la entrada de la lista, y el `statusReason`
 * derivado se va con ella. Ese dia habra que atar el fichero con su esquema,
 * que es el otro requisito que el comentario de la lista deja escrito.
 *
 * Si sale a false, NO se levanta. Lo que se hace es copiar el texto que imprime
 * abajo en el `statusReason` del contrato, tal cual, y el test se pondra rojo
 * hasta que este escrito. El motivo se deriva de la misma funcion que produce
 * las cifras, asi que no puede decir una cosa y medir otra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE SALE CON 1
 *
 * Porque este script se usa tambien como puerta: un cruce incompleto es el
 * estado en el que estamos, y un script que sale con 0 mientras dice "no son el
 * mismo catalogo" se puede incorporationar a un CI por error creyendo que es
 * un chequeo que pasa. Aqui sale con 1 precisamente para que no se confunda con
 * un paso verde. El CI de verdad no lo corre: lo corre el preflight.
 */

import { medirCruceAira, motivoDeLaCuarentena, CONTRATOS } from '../utils/cruceAira.js';

const m = medirCruceAira();

const linea = (s) => console.log(s);

linea('CRUCE AIRA — medido sobre los ficheros de contracts/');
linea('='.repeat(64));
linea(`  bloques en roland_aira_submodules.json: ${m.bloques}`);
linea(`  modulos en roland_aira_patch_spec.json: ${m.modulos} (32 entradas menos el slot vacio)`);
linea('');
linea(`  COINCIDEN:   ${m.comunes.length} de ${m.bloques}`);
linea(`  SOLO AQUI:   ${m.soloLibreria.length}  (el AIRA no los tiene)`);
linea(`  SOLO AHI:    ${m.soloHardware.length}  (este catalogo no los tiene)`);
linea('');

if (m.comunes.length > 0) {
  linea(`  los que casan (${m.comunes.length}):`);
  for (const id of m.comunes) linea('    ' + id);
  linea('');
}

if (m.soloLibreria.length > 0) {
  linea(`  solo en la libreria (${m.soloLibreria.length}):`);
  linea('    ' + m.soloLibreria.join(', '));
  linea('');
}

if (m.soloHardware.length > 0) {
  linea(`  solo en el patch_spec (${m.soloHardware.length}):`);
  linea('    ' + m.soloHardware.join(', '));
  linea('');
}

linea('='.repeat(64));

if (m.completo) {
  linea('VEREDICTO: los dos catalogos son el mismo.');
  linea('  La cuarentena se levanta: fuera "status" y "statusReason" del');
  linea('  contrato, y fuera la entrada de CUARENTENAS.');
} else {
  linea('VEREDICTO: no son el mismo catalogo. La cuarentena se mantiene.');
  linea('');
  linea('Este es el statusReason que hay que escribir, tal cual:');
  linea('');
  linea(motivoDeLaCuarentena(m));
  linea('');
  linea('Va en el contrato, en `contracts/roland_aira_submodules.json`, y en');
  linea('la copia del laboratorio, que viaja con el mismo dato. El test');
  linea('`el motivo del fichero es el que produce la medida` se pone rojo');
  linea(`hasta que este escrito. Contracts: ${CONTRATOS}`);
}

process.exit(m.completo ? 0 : 1);