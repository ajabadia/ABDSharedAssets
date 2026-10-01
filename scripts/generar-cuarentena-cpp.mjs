#!/usr/bin/env node
/**
 * GENERA la cabecera de C++ con los literales de la regla de cuarentena, a
 * partir del enum del esquema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE ESTO SUSTITUYE, Y POR QUE
 *
 * Los literales —`status`, `quarantined`, `statusReason`— estaban escritos a
 * mano en `HardwareContractQuarantine.h` y atados al esquema por dos tests
 * cruzados, uno por lenguaje. Los testsfunc ionaban, y aun asi dejaban pasar
 * el caso que mas duele: los dos hacen SKIP cuando ABDSharedAssets no esta al
 * lado, que es el clon limpio y buena parte del CI. Sin el hermano, la mitad de
 * C++ no se puede ni comprobar contra la otra mitad, y lo que se rompe es una
 * regla de la que C++ es la unica parte que lee el hardware.
 *
 * Aqui no hay dos mitades. La cabecera GENERADA tiene lo que el esquema dice,
 * y lo unico que puede quedar desfasado es el fichero generado, que se
 * comprueba sin ejecutarlo. Un `--check` que compara es el unico mecanismo que
 * no tiene SKIP, porque no necesita el hermano para decidir: necesita el
 * esquema, que es lo unico que produce.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO SABE EL GENERADOR QUE ES EL CAMPO DE ESTADO
 *
 * Por una regla mecanica: la unica propiedad de primer nivel cuyo `enum` tiene
 * UN solo valor. No por el nombre, que seria escribir el nombre dos veces, que
 * es justo lo que hay que evitar. Y es una regla que se puede romper a proposito:
 * si manana se declara un segundo estado editorial, deja de haber una unica
 * candidata y el generador se PARA diciendo cuales ha encontrado, en vez de
 * elegir una. Parar es el comportamiento correcto: un estado mas no es un
 * cambio de nombres, es otra regla, y esa se decide a mano.
 *
 * Y el campo del motivo sale por regla: el del estado mas `Reason`. Derivar el
 * nombre en vez de escribirlo es lo que hace que una errata sea imposible: no
 * hay ningun nombre tecleado en este codigo que pueda quedar mal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   node scripts/generar-cuarentena-cpp.mjs           escribe la cabecera
 *   node scripts/generar-cuarentena-cpp.mjs --check   compara y sale con 1
 *
 * El `--check` es el que va en el preflight. Sale con 0 y un aviso si el
 * repositorio hermano no esta: es lo que pasa en el CI de ABDSharedAssets, que
 * no hace checkout de ABDAudioLab, y ahi no hay cabecera que comprobar. En el CI
 * de ABDAudioLab el hermano SI esta —es el propio repo del job—, asi que ahi el
 * `--check` es de verdad.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// La mitad de JS de la misma regla. Se importa para COMPARAR, no para
// copiar: aqui no se escribe ningun nombre de la regla, y esa es la condicion para que
// generar no vuelva a ser escribir. Ver `leerReglaDelEsquema`.
import { contratoDerivaIgual } from '../utils/index.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** El esquema que declara los nombres. Es la unica fuente. */
export const ESQUEMA = path.resolve(aqui, '..', 'contracts', 'hardware_profile.schema.json');

/** La cabecera que se escribe. Vive en el hermano, que es quien la compila. */
export const DESTINO = path.resolve(
  aqui, '..', '..', 'ABDAudioLab', 'src', 'core', 'HardwareContractQuarantine.generado.h',
);

/** El sufijo que convierte el nombre del campo de estado en el del motivo. */
export const SUFIJO_MOTIVO = 'Reason';

/**
 * Saca la regla del esquema, y falla si no se puede sacar sin escribir nombres.
 *
 * @param {string} [rutaEsquema]
 * @returns {{campoEstado: string, valorEstado: string, campoMotivo: string}}
 * @throws {Error} si hay cero o varias candidatas, o si el motivo no existe
 */
export function leerReglaDelEsquema(rutaEsquema = ESQUEMA) {
  const esquema = JSON.parse(readFileSync(rutaEsquema, 'utf8'));
  const propiedades = esquema.properties ?? {};

  // Criterio mecanico: un enum de UN valor a nivel de contrato. Ver la nota de
  // arriba sobre por que se para cuando deja de haber una unica.
  const candidatas = Object.entries(propiedades)
    .filter(([, p]) => Array.isArray(p?.enum) && p.enum.length === 1)
    .map(([nombre]) => nombre);

  if (candidatas.length !== 1) {
    throw new Error(
      `el esquema declara ${candidatas.length} propiedades con un enum de un solo valor `
      + `${candidatas.length === 0 ? '' : `(${candidatas.join(', ')})`}, y este generador `
      + 'necesita exactamente una: el campo que lleva la marca de cuarentena. '
      + 'Se para en vez de elegir, porque un estado editorial nuevo es otra regla '
      + 'y esa se decide a mano.',
    );
  }

  const [campoEstado] = candidatas;
  const valorEstado = propiedades[campoEstado].enum[0];
  const campoMotivo = campoEstado + SUFIJO_MOTIVO;

  if (!Object.hasOwn(propiedades, campoMotivo)) {
    throw new Error(
      `el esquema declara "${campoEstado}" pero no "${campoMotivo}", que es el nombre que `
      + 'este generador deriva del primero. O el esquema ha cambiado de forma, o la regla '
      + `del sufijo "${SUFIJO_MOTIVO}" ya no describe lo que hace.`,
    );
  }


  // El criterio de arriba sabe QUE enum hay, pero no sabe que ese sea el del
  // estado. Con un solo enum de un valor las dos cosas coinciden por casualidad,
  // y en cuanto el esquema gana otro, el criterio elige el que le parezca y sale
  // con un verde. Aqui se comprueba contra `POLITICA`, que es la mitad de JS de
  // la misma regla y la unica que tiene los NOMBRES escritos.
  //
  // Por que es un throw y no un aviso: la cabecera que se escribiria con esta
  // regla derivaria de otro sitio, C++ miraria un campo que el dato no tiene, y
  // la cuarentena dejaria de retener SIN DARSE CUENTA. Un aviso que se puede
  // ignorar aqui es exactamente el fallo que el resto de este diseno evita.
  const deriva = { campoEstado, valorEstado, campoMotivo };
  const problemas = contratoDerivaIgual(deriva);

  if (problemas.length > 0)
    throw new Error(problemas.join(' '));

  return deriva;
}

/**
 * El texto de la cabecera.
 *
 * Determinista byte a byte, y eso no es cosmetico: `--check` compara ficheros,
 * y un header generado que cambia de blanco cada vez que se regenera haria que
 * el preflight se pusiera rojo sin que nadaiese distinto.
 *
 * @param {ReturnType<typeof leerReglaDelEsquema>} regla
 * @returns {string}
 */
export function cabeceraDe(regla) {
  const L = [];
  const q = (s) => s;

  L.push('// ==============================================================================');
  L.push('// ABDAudioLab - GENERADO. NO EDITAR ESTE FICHERO A MANO.');
  L.push('// ==============================================================================');
  L.push('//');
  L.push('// La mitad de C++ de la regla de cuarentena, escrita desde el enum del esquema');
  L.push('// `ABDSharedAssets/contracts/hardware_profile.schema.json`. Los tres nombres de');
  L.push('// abajo no estan tecleados en ningun sitio de este repositorio: salen de ahi.');
  L.push('//');
  L.push('// ESTE FICHERO NO SE ESCRIBE A MANO, Y ESO ES JUSTO LO QUE LO HACE FIABLE. Con');
  L.push('// los literales en la cabecera, cambiar el enum del esquema dejaba a C++ mirando');
  L.push('// un nombre viejo: `evaluar` devolvia "no retenido" para siempre, el registro');
  L.push('// cargaba el contrato dudoso, y no habia ningun rojo en ningun lado. Los dos');
  L.push('// tests que ataban las dos mitades hacian SKIP sin el repositorio hermano, que');
  L.push('// es el clon limpio. Aqui no hay mitad que comparar: hay un fichero generado, y');
  L.push('// lo unico que puede quedar viejo es el fichero, que se comprueba sin ejecutarlo.');
  L.push('//');
  L.push('//   Se escribe con:  node scripts/generar-cuarentena-cpp.mjs        (ABDSharedAssets)');
  L.push('//   Se comprueba con: node scripts/generar-cuarentena-cpp.mjs --check');
  L.push('//');
  L.push('// El preflight corre el `--check`, y eso es lo que lo ata: no necesita el hermano');
  L.push('// para decidir, solo necesita el esquema.');
  L.push('// ==============================================================================');
  L.push('');
  L.push('#pragma once');
  L.push('');
  L.push('namespace abdaudiolab::core::quarantine::generado');
  L.push('{');
  L.push('');
  L.push(`/** El campo del contrato que lleva la marca. Del esquema: \`${regla.campoEstado}\`. */`);
  L.push(`inline constexpr const char* campoEstado = "${regla.campoEstado}";`);
  L.push('');
  L.push('/**');
  L.push(' * El unico valor de `campoEstado` que retiene.');
  L.push(' *');
  L.push(` * Del enum del esquema, y el enum tiene un solo valor. Si algum dia declara mas,`);
  L.push(' * el generador se para y esa decision se escribe en los dos lados a proposito.');
  L.push(' */');
  L.push(`inline constexpr const char* valorEstado = "${regla.valorEstado}";`);
  L.push('');
  L.push(`/** El campo del motivo. Derivado del anterior: \`${regla.campoMotivo}\`. */`);
  L.push(`inline constexpr const char* campoMotivo = "${regla.campoMotivo}";`);
  L.push('');
  L.push('} // namespace abdaudiolab::core::quarantine::generado');
  L.push('');

  return L.join('\n');
}

/** Lo que hace el script cuando se ejecuta. Exportada para poder probarla. */
export function main(argv = process.argv) {
  const checking = argv.includes('--check');

  const hermano = path.resolve(aqui, '..', '..', 'ABDAudioLab');

  if (!existsSync(hermano)) {
    console.log('  la cabecera no se comprueba: ' + hermano + ' no esta a mano.');
    console.log('  En el CI de ABDSharedAssets es lo normal, porque ese workflow no baja el');
    console.log('  laboratorio. En el de ABDAudioLab el hermano SI esta y esto si se comprueba,');
    console.log('  que es donde hace falta: el snapshot del laboratorio es lo que puede quedar');
    console.log('  viejo.');
    return 0;
  }

  // En `--check`, que no exista la cabecera NO es "esta al dia": es que nadie la
  // ha generado, y un fichero que falta no vigila nada. En modo escritura es lo
  // contrario de un fallo: es lo que hay que hacer.
  if (checking && !existsSync(DESTINO)) {
    console.error('  la cabecera generada no esta: ' + DESTINO);
    console.error('  Se crea con: node scripts/generar-cuarentena-cpp.mjs');
    return 1;
  }

  let regla;
  try {
    regla = leerReglaDelEsquema();
  } catch (e) {
    console.error('  el esquema ya no dice que regla es esta: ' + e.message);
    return 1;
  }

  const esperado = cabeceraDe(regla);
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  const nombre = path.basename(DESTINO);

  if (checking) {
    if (actual === esperado) {
      console.log('  al dia         ' + nombre + ' (regla desde el enum del esquema)');
      return 0;
    }

    console.error('  DESFASADA      ' + nombre);
    console.error('                 el esquema dice ' + regla.campoEstado + '="' + regla.valorEstado
      + '", y el motivo en ' + regla.campoMotivo);
    console.error('                 la cabecera no lo dice, o lo dice de otra forma. Un');
    console.error('                 nombre escrito a mano y uno generado solo se separan aqui.');
    console.error('  SE ARREGLA ASI:');
    console.error('       node scripts/generar-cuarentena-cpp.mjs');
    return 1;
  }

  if (actual === esperado) {
    console.log('  sin cambios    ' + nombre);
    return 0;
  }

  writeFileSync(DESTINO, esperado, 'utf8');
  console.log('  escrita        ' + nombre + ' (regla desde el enum del esquema)');
  return 0;
}

// El guard de abajo no es cosmetico. `leerReglaDelEsquema` y `cabeceraDe` se
// exportan para que los tests las usen, y un test importa el modulo: sin esto,
// el main se ejecutaria al importarlo y el test se encontraria con un
// `process.exit` en mitad de una asercion.

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main());
