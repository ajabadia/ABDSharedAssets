/**
 * LA PUERTA DE LAS SONDAS: SIN SHA NO HAY SONDA
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE SE COMPRUEBA Y POR QUE ES UNA PUERTA Y NO UNA COMODIDAD
 *
 * Una sonda monta un sandbox con la forma del workflow y materializa en el cada
 * hermano con `ls-tree` + `show` de SU SHA. Si los SHA no estan, el sandbox se
 * monta igual pero VACIO, y el motor que corre dentro responde «no he podido
 * comprobar» sobre un arbol sin hermanos y sale con 0. Un verde asi es la peor
 * salida posible de una sonda: no es que falle mal, es que contesta la pregunta
 * con un codigo que no es el del CI.
 *
 * Asi que la salida 2 es obligatoria en los cinco fallos que se pueden dar, y
 * cada uno con su motivo. Se comprueban los cinco con ficheros de verdad
 * inventados en un temporal, porque el fallo que hay que cazar —una sonda que se
 * lanza en vez de negarse— solo aparece si el inventario se lee de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE SE COMPRUEBA EL CODIGO DE SALIDA Y NO EL TEXTO
 *
 * Porque el texto siempre dice algo. Lo que decide si la sonda sirve es si
 * alguien recibe un 2 y para, y eso solo se mira en el codigo. Los mensajes se
 * comprueban en la suite de `estado-hermanos.mjs`, que es donde vive la politica
 * de leerlos.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { MARCADOR_SONDA, motivoSinPines, pinesDe, shaDelMarcador } from '../scripts/sonda-ci.mjs';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = join(raiz, 'scripts');

const SHA_A = 'a'.repeat(40);

/** Un temporal con un inventario escrito, para las cinco formas de no servir. */
function inventarioQue(texto) {
  const dir = mkdtempSync(join(tmpdir(), 'sonda-prueba-'));
  const ruta = join(dir, 'siblings.json');

  writeFileSync(ruta, texto, 'utf8');

  return { dir, ruta };
}

describe('pinesDe', () => {
  it('devuelve el mapa cuando los cuatro SHA son de 40 hex', () => {
    const { dir, ruta } = inventarioQue(JSON.stringify({
      hermanos: [{ repo: 'ABDEep', sha: SHA_A }],
    }));

    try {
      expect(pinesDe(ruta)).toEqual({ ABDEep: SHA_A });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Los cinco motivos. Se agrupan porque la afirmacion es la misma en todos: que
  // la sonda se NIEGUE, no que se monte con un inventario a medias. Cada uno
  // escribe su fichero y dice que frase tiene que salir con el `null`.
  const RECHAZOS = [
    ['un inventario ausente', null, /no encuentro el inventario/],
    ['un JSON ilegible', 'esto no es json', /no se puede leer/],
    ['una lista de hermanos vacia', JSON.stringify({ hermanos: [] }), /ninguna lista de hermanos/],
    ['un SHA que no son 40 hex', JSON.stringify({ hermanos: [{ repo: 'ABDEep', sha: 'corto' }] }), /40 hex/],
    ['un hermano sin repo', JSON.stringify({ hermanos: [{ sha: SHA_A }] }), /sin "repo"/],
  ];

  for (const [nombre, contenido, motivo] of RECHAZOS) {
    it(`se niega con ${nombre}`, () => {
      // `null` de contenido significa «no escribas nada»: el caso del inventario
      // ausente, que es el unico que no necesita fichero.
      const { dir, ruta } = contenido === null
        ? { dir: null, ruta: join(tmpdir(), 'sonda-prueba-inexistente.json') }
        : inventarioQue(contenido);

      try {
        expect(pinesDe(ruta)).toBeNull();
        // El motivo importa tanto como el `null`: un null sin frase obliga a
        // quien lo lee a abrir el codigo para saber si el fallo es suyo.
        expect(motivoSinPines(ruta)).toMatch(motivo);
      } finally {
        if (dir !== null)
          rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('las tres sondas, con un inventario que no sirve', () => {
  const sondas = ['sonda-preflight.mjs', 'sonda-guardas.mjs', 'subir-ref.mjs'];

  for (const sonda of sondas) {
    it(`${sonda} sale con 2 en vez de montar un sandbox vacio`, () => {
      const { dir, ruta } = inventarioQue(JSON.stringify({
        hermanos: [{ repo: 'ABDEep', sha: 'no-es-un-sha' }],
      }));

      try {
        let codigo = 0;

        try {
          execFileSync(process.execPath, [join(scripts, sonda), ruta], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (exc) {
          codigo = typeof exc.status === 'number' ? exc.status : 1;
        }

        // Y no 0. Un 0 aqui seria la sonda respondiendo por el CI con un
        // sandbox sin hermanos en lugar de con el codigo del CI.
        expect(codigo).toBe(2);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('el marcador del sandbox', () => {
  it('sin marcador no hay SHA, y el bloque lo dira como no-git', () => {
    // El caso que importa: `sonda-ci.mjs` escribe el marcador, asi que un
    // directorio sin el es un arbol normal y no un sandbox. Devolver el HEAD de
    // un repositorio cualquiera aqui seria afirmar que ese arbol se construyo
    // con un SHA que nadie ha puesto.
    const dir = mkdtempSync(join(tmpdir(), 'sonda-prueba-'));

    try {
      expect(shaDelMarcador(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un marcador con un SHA que no es de 40 hex no se lee', () => {
    // El filtro de 40 hex no es poresthetics: un marcador con `sha: null` o con
    // una cadena vacia haria que el bloque afirmase que el sandbox esta en un
    // commit que no existe.
    const dir = mkdtempSync(join(tmpdir(), 'sonda-prueba-'));

    try {
      for (const malo of ['{}', JSON.stringify({ sha: null }), JSON.stringify({ sha: 'x' }), 'no soy json']) {
        writeFileSync(join(dir, MARCADOR_SONDA), malo, 'utf8');
        expect(shaDelMarcador(dir)).toBeNull();
      }

      writeFileSync(join(dir, MARCADOR_SONDA), JSON.stringify({ sha: SHA_A }), 'utf8');
      expect(shaDelMarcador(dir)).toBe(SHA_A);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});