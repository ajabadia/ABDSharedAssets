/**
 * Los dos lados del mismo agujero: lo que el guard DESCUBRE y lo que el
 * preflight VIGILA.
 *
 * EL AGUJERO, DICHO EN LA DIRECCION CONCRETA
 *
 * Hay dos listas de los ficheros generados de este repo, y estan escritas una al
 * lado de la otra sin que nada las junte:
 *
 *   - La del PREFLIGHT, `CONTRATOS[].salidas` y `GENERADOS_FUERA[].salidas` en
 *     `scripts/check-generated-contracts.mjs`: que generador produce que, y que
 *     `--check` corre para detectarlo desfasado.
 *   - La del GUARD, la que descubre artefactos leyendo el blob (nombre, cabecera
 *     `AUTO-GENERATED`, campo `generatedBy`/`generatedFrom`): que ficheros se
 *     COMPARAN byte a byte y tienen que estar fijados en LF por
 *     `.gitattributes`.
 *
 * Hoy las dos dicen lo mismo y nadie lo comprueba, que es la forma mas comoda de
 * que las dos digan lo mismo: porque estan escritas a mano y porque hoy son
 * cinco y cinco.
 *
 * Y en cuanto dejen de decir lo mismo hay dos fallos, y cada uno por su lado:
 *
 *   - El generador escribe un fichero mas y no lo declara en `CONTRATOS`. El
 *     preflight no corre su `--check`, asi que el contrato se desfasaria en
 *     silencio; y el guard si lo descubre, pero el guard no sabe de
 *     generadores, solo sabe de `.gitattributes`: avisa de que hay un artefacto
 *     y se queda ahi.
 *   - Alguien anade una salida a `CONTRATOS` y el generador no la marca. El
 *     preflight la vigila, pero el artefacto deja de descubrirse para el guard y
 *     se queda sin la regla que lo fija en LF sin que nadie lo note.
 *
 * La cuarta comprobacion es la que cierra el circuito entero: que el
 * `generatedBy` que el guard lee NO sea una cadena inventada. El campo es la
 * autoridad que un panel lee para fiarse del origen del dato, y hoy nadie
 * comprueba que el script que nombra exista.
 *
 * POR QUE ESTE TEST NO TOCA `check-generated-contracts.mjs`
 *
 * Porque no hace falta. Las dos listas ya estan EXPORTADAS, que es lo unico que
 * hacia falta para poder cruzarlas, y escribir ahi meteria este test dentro del
 * preflight, que es la puerta que mas dias cuesta que se toque.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { descubreArtefactos } from './gitattributesGuard.js';
import { CONTRATOS, GENERADOS_FUERA } from '../scripts/check-generated-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const NUL = String.fromCharCode(0);

function listaTrackeada () {
  try {
    return execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    }).split('\n').filter((f) => f !== '');
  } catch (e) {
    console.error('[artefactosVigilados] `git ls-files` fallo: ' + e.message);
    return [];
  }
}

/** El contenido de los ficheros que se pueden leer como texto. */
function contenidos (ficheros) {
  const salida = [];

  for (const f of ficheros) {
    try {
      if (statSync(resolve(repoRoot, f)).size > 2 * 1024 * 1024)
        continue;

      const texto = readFileSync(resolve(repoRoot, f), 'utf8');

      if (texto.indexOf(NUL) !== -1)
        continue;

      salida.push({ ruta: f, contenido: texto });
    } catch (e) {
      console.warn('[artefactosVigilados] no se pudo leer ' + f + ': ' + e.message);
    }
  }

  return salida;
}

/**
 * Todas las salidas que declara el preflight, con el path que tendria dentro del
 * repo. `CONTRATOS` las nombra sin carpeta porque todas viven en `contracts/`;
 * `GENERADOS_FUERA` las nombra con su ruta desde la raiz, porque son de otro
 * repositorio. Las dos formas llegan al mismo sitio aqui.
 */
function salidasDeclaradas () {
  return [
    ...CONTRATOS.flatMap((c) => c.salidas.map((s) => ({
      salida: s,
      ruta: 'contracts/' + s,
      script: c.script,
      fuera: false
    }))),
    ...GENERADOS_FUERA.flatMap((g) => g.salidas.map((s) => ({
      salida: s,
      ruta: s.replace(/^\.\.\//, '').replace(/^\.\//, ''),
      script: g.script,
      fuera: true
    })))
  ];
}

const TRACKEADOS = listaTrackeada();
const DESCUBIERTOS = descubreArtefactos(contenidos(TRACKEADOS));
const DECLARADAS = salidasDeclaradas();

describe('lo que el guard descubre y lo que el preflight vigila son lo mismo', () => {
  it('el guard descubre algo, y el preflight declara algo', () => {
    // Las dos costuras. Un descubrimiento que devuelve cero pasa todos los tests
    // de este fichero sin comparar nada, y un `CONTRATOS` vacio hace lo mismo
    // por el otro lado: el cruce de dos vacios es verde, y es el peor verde
    // posible, porque no significa que las dos cosas coincidan sino que no hay
    // nada que coincida.
    expect(TRACKEADOS.length, 'no hay ficheros trackeados: `git ls-files` no ha funcionado')
      .toBeGreaterThan(100);
    expect(DESCUBIERTOS.length, 'el guard no descubre ningun artefacto generado').toBeGreaterThan(0);
    expect(DECLARADAS.length, 'el preflight no declara ninguna salida de generador').toBeGreaterThan(0);
  });

  it('todo artefacto que el guard descubre lo vigila un --check declarado', () => {
    // LA DIRECCION IMPORTANTE. Un generador que escribe un fichero y no lo
    // declara produce un artefacto que NADIE vigila: el `--check` no lo corre,
    // asi que puede quedar desfasado del codigo del synth y seguir pareciendo
    // un contrato bueno. El guard lo ve, pero no sabe de generadores.
    const declaradas = new Set(DECLARADAS.map((d) => d.ruta));
    const sinVigilar = DESCUBIERTOS
      .filter((a) => !declaradas.has(a.ruta))
      .map((a) => a.ruta + ' [' + a.senas.join(', ') + ']');

    expect(sinVigilar,
      'artefactos generados que el guard descubre y el preflight NO vigila. O el generador '
      + 'escribe un fichero que no esta en CONTRATOS[].salidas ni en '
      + 'GENERADOS_FUERA[].salidas, o escribe fuera de contracts/ y hace falta un '
      + 'GENERADOS_FUERA. Sin declararlos no hay `--check` que detecte que se desfasaron.'
    ).toEqual([]);
  });

  it('y toda salida declarada que vive aqui la descubre el guard', () => {
    // LA DIRECCION CONTRARIA, que es la que se olvida. Alguien anade una salida
    // a `CONTRATOS` y el generador no la marca con `generatedBy`: el preflight
    // la vigila, y el artefacto se sale del descubrimiento del guard sin que
    // nadie lo note. Se queda sin la regla que lo fija en LF justo cuando mas lo
    // necesita, que es cuando otro lo regenera.
    const descubiertas = new Set(DESCUBIERTOS.map((a) => a.ruta));
    const sinMarcar = DECLARADAS
      .filter((d) => !d.fuera && existsSync(resolve(repoRoot, d.ruta)) && !descubiertas.has(d.ruta))
      .map((d) => d.ruta + ' (la declara ' + d.script + ')');

    expect(sinMarcar,
      'salidas que el preflight declara y el guard NO descubre. El generador tiene que '
      + 'escribir `generatedBy` en ellas, o el artefacto deja de estar protegido por '
      + '.gitattributes sin que nada se entere.'
    ).toEqual([]);
  });

  it('el generatedBy de cada artefacto apunta a un generador de verdad', () => {
    // EL CIRCUITO, CERRADO. El guard lee `generatedBy` del blob, el preflight
    // corre el `--check` del generador que declara la salida, y este test
    // comprueba que el nombre del medio sea real: que el script exista, y que sea
    // el mismo que la puerta ejecuta.
    //
    // Sin esto, un `generatedBy: scripts/generate_algo.py` con un typo seria un
    // campo que no lleva a ninguna parte, y es el fallo que este repo ya sufrio
    // con `fx-effects.json`: un `generatedFrom` que apuntaba a un fichero sin
    // ningun generador que lo produjera.
    const problemas = [];

    for (const artefacto of DESCUBIERTOS) {
      if (!artefacto.ruta.endsWith('.json'))
        continue;

      let contrato;

      try {
        contrato = JSON.parse(readFileSync(resolve(repoRoot, artefacto.ruta), 'utf8'));
      } catch (e) {
        continue;
      }

      const generador = contrato?.generatedBy;

      // `generatedFrom` es otra cosa: es el FICHERO del que sale la copia, no el
      // script, y lo vigila el preflight por su cuenta. Aqui solo `generatedBy`.
      if (typeof generador !== 'string' || generador === '')
        continue;

      if (!existsSync(resolve(repoRoot, generador)))
        problemas.push(artefacto.ruta + ' dice "' + generador + '" y ese script no esta');

      if (!DECLARADAS.some((d) => d.script === generador))
        problemas.push(artefacto.ruta + ' dice "' + generador + '" y el preflight no corre ese script');
    }

    expect(problemas, 'artefactos cuyo generatedBy no lleva a un generador real:\n  '
      + problemas.join('\n  ')).toEqual([]);
  });
});