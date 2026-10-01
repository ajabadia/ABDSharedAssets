#!/usr/bin/env node
/**
 * GENERA la cabecera de C++ con los literales de la regla de cuarentena.
 *
 * Las reglas las DECLARA el esquema, en `x-cuarentena.reglas`: una entrada por
 * regla, con el campo que lleva la marca y el campo de su motivo. El valor que
 * retiene se lee del enum de ese campo, nunca se escribe aqui.
 *
 * Antes el criterio era mecanico, el unico enum de un valor. Se paro bien, pero
 * por un motivo equivocado: no porque hubiera un error, sino porque no sabia
 * cual. Un esquema con dos reglas de estado es una cosa legitima, y con el
 * criterio viejo no habia manera de declararla. Ahora es una entrada mas, y la
 * forma de lo que ya habia no cambia.
 *
 * Y sigue sin haber un solo nombre tecleado. El generador lee el mapa, lee el
 * enum, y compara contra `POLITICA` antes de escribir nada.
 *
 *   node scripts/generar-cuarentena-cpp.mjs           escribe la cabecera
 *   node scripts/generar-cuarentena-cpp.mjs --check   compara y sale con 1
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// La mitad de JS de la misma regla, para COMPARAR. No para copiar.
import { contratoDerivaIgual } from '../utils/index.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** El esquema que declara los nombres. Es la unica fuente. */
export const ESQUEMA = path.resolve(aqui, '..', 'contracts', 'hardware_profile.schema.json');

/** La cabecera que se escribe. Vive en el hermano, que es quien la compila. */
export const DESTINO = path.resolve(
  aqui, '..', '..', 'ABDAudioLab', 'src', 'core',
  'HardwareContractQuarantine.generado.h',
);

/**
 * La palabra del esquema que declara las reglas.
 *
 * Va aqui y no en un literal suelto por el mismo motivo que `ESQUEMA`: si se
 * escribe en un solo sitio, buscar donde se declara el mapa es buscar en un
 * fichero. El nombre de la clave es el unico nombre escrito aqui, y no es un
 * nombre de la regla.
 */
export const MAPA_CUARENTENA = 'x-cuarentena';

/**
 * Las reglas que declara el esquema, y falla si no se pueden declarar bien.
 *
 * Cada entrada del mapa se comprueba por separado y se NOMBRA, porque un mapa
 * con tres reglas y una mal puesta tiene que decir cual es: si el mensaje solo
 * dijera "el mapa esta mal", el arreglo seria abrir el fichero entero a adivinar.
 *
 * Lo que NO hace es elegir. Si dos reglas chocan, o si un enum declara mas de un
 * valor, se para. Retener es lo destructivo, esconde hardware del cajon sin que
 * nada lo diga, y decidir cual de dos estados es el bueno es editorial.
 *
 * @param {string} [rutaEsquema]
 * @returns {Array<{campoEstado: string, valorEstado: string, campoMotivo: string}>}
 *   Una por entrada del mapa, en el orden en que las declara el esquema.
 * @throws {Error} si el mapa falta, esta vacio, o una entrada no se sostiene
 */
export function leerReglasDelEsquema(rutaEsquema = ESQUEMA) {
  const esquema = JSON.parse(readFileSync(rutaEsquema, 'utf8'));
  const propiedades = esquema.properties ?? {};
  const mapa = esquema[MAPA_CUARENTENA];

  // La ausencia del mapa NO es que no haya reglas: es un esquema que todavia no
  // dice cual es, y el generador no puede inventarlo. Seria el criterio viejo con
  // otro nombre.
  if (mapa === undefined) {
    throw new Error(
      'el esquema no declara ' + JSON.stringify(MAPA_CUARENTENA) + '. El generador ya no '
      + 'adivina: lee el mapa, asi que un esquema sin el se para aqui. Anadase una entrada por '
      + 'regla, con el campo y el campo de su motivo. El motivo ya no se deriva por sufijo, '
      + 'porque con dos reglas un sufijo no dice cual es de cual.',
    );
  }

  const declaradas = mapa?.reglas;

  if (!Array.isArray(declaradas) || declaradas.length === 0) {
    throw new Error(
      'el esquema declara ' + JSON.stringify(MAPA_CUARENTENA) + ' pero no una lista no vacia '
      + 'de reglas. Un mapa sin reglas es una cuarentena que no retiene nada, y eso '
      + 'parece funcionar hasta que se cuela un Aparato dudoso.',
    );
  }

  const reglas = declaradas.map((entrada, indice) => {
    const donde = 'la regla ' + indice;
    const campo = entrada?.campo;
    const motivo = entrada?.motivo;

    if (typeof campo !== 'string' || campo === '')
      throw new Error(
        donde + ' no declara el nombre del campo. Una regla sin campo no dice donde va '
        + 'la marca, asi que no hay nada que generar.');

    if (typeof motivo !== 'string' || motivo === '')
      throw new Error(
        donde + ' no declara el campo del motivo. Un retenido sin motivo es un retenido '
        + 'sin explicacion, que es justo lo que la marca existe para evitar, y C++ lo '
        + 'inventaria con un texto de relleno.');

    // Un campo que el mapa declara y el esquema no tiene es un campo que, con
    // additionalProperties false, ningun contrato podria llevar. Seria una regla
    // que no puede retener nada, y eso no se ve hasta que se cuela un Aparato.
    if (!Object.hasOwn(propiedades, campo))
      throw new Error(donde + ' declara el campo "' + campo
        + '", que no esta en "properties".');

    if (!Object.hasOwn(propiedades, motivo))
      throw new Error(donde + ' declara el motivo "' + motivo
        + '", que no esta en "properties".');

    // El VALOR sale del enum. Es lo que evita que el mapa se convierta en un
    // segundo sitio donde escribir el estado a mano.
    const valores = propiedades[campo].enum;

    if (!Array.isArray(valores) || valores.length === 0)
      throw new Error(donde + ': el campo "' + campo + '" no declara un enum.'
        + ' Sin enum no hay manera de saber que estados existen.');

    // Un enum de MAS de un valor no es un error del mapa: es un estado editorial
    // nuevo. Cual retiene lo decide una persona. Retener es lo destructivo, asi
    // que no se elige el primero por defecto.
    if (valores.length > 1)
      throw new Error(donde + ': el enum de "' + campo + '" declara '
        + valores.length + ' valores y esta regla se quedaria con el primero. '
        + 'Cual de ellos retiene es una decision editorial. O se deja el enum '
        + 'con un valor, o se declara una regla por estado.');

    return { campoEstado: campo, valorEstado: valores[0], campoMotivo: motivo };
  });

  // Dos reglas sobre el MISMO campo no son dos reglas: es la misma dos veces, y
  // cual gana no lo decide un script.
  const repetidos = reglas
    .map((r) => r.campoEstado)
    .filter((c, i, todos) => todos.indexOf(c) !== i);

  if (repetidos.length > 0)
    throw new Error(
      'el mapa declara mas de una regla sobre ' + repetidos.join(' y ')
      + '. No es una segunda regla: es la misma dos veces.');

  // Y el invariante: las reglas derivadas tienen que ser las mismas que declara la
  // politica de este repositorio, una a una y en el mismo orden. Se comprueba AQUI,
  // antes de devolver, para que ni el --check ni la escritura devuelvan reglas que no
  // se han contrastado contra el segundo origen.
  const problemas = contratoDerivaIgual(reglas);

  if (problemas.length > 0)
    throw new Error(problemas.join(' '));

  return reglas;
}

/**
 * El texto de la cabecera.
 *
 * Determinista byte a byte: `--check` compara ficheros, y un header que cambia
 * de blanco en cada regeneracion pondria el preflight en rojo sin que nada
 * hubiese cambiado.
 *
 * Emite un struct por regla, un array con todas, y los tres alias planos para
 * la PRIMERA. Los alias son lo que usa el consumidor de C++ hoy, y el
 * `static_assert` del header le dice cuantas reglas sabe atender: si aparece
 * una segunda, el laboratorio deja de compilar en vez de mirar la primera.
 *
 * @param {Array<{campoEstado: string, valorEstado: string, campoMotivo: string}>} reglas
 * @returns {string}
 */
export function cabeceraDe(reglas) {
  const L = [];

  L.push('// ==============================================================================');
  L.push('// ABDAudioLab - GENERADO. NO EDITAR ESTE FICHERO A MANO.');
  L.push('// ==============================================================================');
  L.push('//');
  L.push('// La mitad de C++ de la regla de cuarentena. Las reglas las DECLARA el');
  L.push('// esquema, en x-cuarentena.reglas, y los valores salen de los enums de esos');
  L.push('// campos. Ninguno de estos nombres esta tecleado en ningun sitio de este');
  L.push('// repositorio: salen de ahi.');
  L.push('//');
  L.push('//   Se escribe con:  node scripts/generar-cuarentena-cpp.mjs        (ABDSharedAssets)');
  L.push('//   Se comprueba con: node scripts/generar-cuarentena-cpp.mjs --check');
  L.push('//');
  L.push('// El preflight corre el --check, y eso es lo que lo ata: no necesita el hermano');
  L.push('// para decidir, solo necesita el esquema.');
  L.push('// ==============================================================================');
  L.push('');
  L.push('#pragma once');
  L.push('');
  L.push('#include <array>');
  L.push('#include <cstddef>');
  L.push('');
  L.push('namespace abdaudiolab::core::quarantine::generado');
  L.push('{');
  L.push('');
  L.push('/** Una regla: el campo que lleva la marca, el valor que retiene y su motivo. */');
  L.push('struct Regla');
  L.push('{');
  L.push('    const char* campoEstado;');
  L.push('    const char* valorEstado;');
  L.push('    const char* campoMotivo;');
  L.push('};');
  L.push('');
  L.push('/** Cuantas reglas declara el esquema. */');
  L.push('inline constexpr std::size_t numeroReglas = ' + reglas.length + ';');
  L.push('');
  L.push('/** Todas las reglas, en el orden que las declara el esquema. */');
  L.push('inline constexpr std::array<Regla, numeroReglas> reglas = {{');

  for (const r of reglas)
    L.push('    {"' + r.campoEstado + '", "' + r.valorEstado + '", "' + r.campoMotivo + '"},');

  L.push('}};');
  L.push('');
  L.push('// --- La primera, con los nombres de siempre ---');
  L.push('//');
  L.push('// El consumidor de C++ usa estos tres. Son la PRIMERA regla del mapa, y el');
  L.push('// static_assert de HardwareContractQuarantine.h dice cuantas reglas sabe');
  L.push('// atender: cuando aparezca una segunda, el laboratorio deja de compilar en');
  L.push('// vez de mirar la primera y olvidar la otra.');
  L.push('inline constexpr const char* campoEstado = reglas[0].campoEstado;');
  L.push('inline constexpr const char* valorEstado = reglas[0].valorEstado;');
  L.push('inline constexpr const char* campoMotivo = reglas[0].campoMotivo;');
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
    console.log('  laboratorio. En el de ABDAudioLab el hermano SI esta y esto si se comprueba.');
    return 0;
  }

  // En --check, que no exista la cabecera NO es "esta al dia": es que nadie la
  // ha generado, y un fichero que falta no vigila nada.
  if (checking && !existsSync(DESTINO)) {
    console.error('  la cabecera generada no esta: ' + DESTINO);
    console.error('  Se crea con: node scripts/generar-cuarentena-cpp.mjs');
    return 1;
  }

  let reglas;
  try {
    reglas = leerReglasDelEsquema();
  }
  catch (e) {
    console.error('  el esquema no declara unas reglas que se puedan generar: ' + e.message);
    return 1;
  }

  const cuanto = reglas.length === 1 ? '1 regla' : reglas.length + ' reglas';
  const esperado = cabeceraDe(reglas);
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  const nombre = path.basename(DESTINO);

  if (checking) {
    if (actual === esperado) {
      console.log('  al dia         ' + nombre + ' (' + cuanto + ', del mapa del esquema)');
      return 0;
    }

    const declaradas = reglas.map((r) => r.campoEstado + '=' + r.valorEstado).join(', ');
    console.error('  DESFASADA      ' + nombre);
    console.error('                 el esquema declara ' + declaradas + ', y la cabecera no lo dice.');
    console.error('  SE ARREGLA ASI:');
    console.error('       node scripts/generar-cuarentena-cpp.mjs');
    return 1;
  }

  if (actual === esperado) {
    console.log('  sin cambios    ' + nombre);
    return 0;
  }

  writeFileSync(DESTINO, esperado, 'utf8');
  console.log('  escrita        ' + nombre + ' (' + cuanto + ', del mapa del esquema)');
  return 0;
}

// El guard no es cosmetico: los tests importan el modulo, y sin esto el main se
// ejecutaria al importarlo y el test se encontraria con un process.exit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main());
