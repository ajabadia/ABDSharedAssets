/**
 * LOS PINES DE LOS HERMANOS: el inventario y el workflow no pueden separarse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE HAY UN TEST DE UN JSON
 *
 * El SHA fijado de cada hermano esta escrito DOS veces a proposito, y por
 * motivos distintos:
 *
 *   - en `siblings.json`, que es lo que lee `scripts/fetch-missing-siblings.mjs`
 *     para bajar al hermano que falte;
 *   - en los `ref:` de `actions/checkout` del workflow, que son lo que bajan los
 *     hermanos en una corrida normal y lo que se ve en la pestaña de Actions.
 *
 * La segunda copia esta porque `actions/checkout` no lee un fichero. Se podria
 * haber puesto los pines en variables de entorno del job y construirlos con
 * `fromJSON`, que es lo elegante, y se ha hecho lo simple: cuatro pasos visibles
 * con su SHA a la vista valen mas que una indireccion, sobre todo cuando lo que
 * hay que revisar cuando algo se pone rojo es "que commit se compro".
 *
 * El problema de dos copias es que se separan. Y se separan solas: alguien sube
 * el SHA en el workflow al cambiar una cabecera, se le olvida el otro sitio, y
 * el fallback queda apuntando a un commit viejo. No se rompe de golpe: el
 * checkout trae la cabecera nueva, el preflight pasa en verde, y un dia de
 * estos el checkout falla —una rama borrada, un repo renombrado— y el fallback
 * baja el commit viejo y el fallo se presenta como "falta una cabecera", que
 * no es lo que paso.
 *
 * Este test es el que dice que las dos copias son el mismo dato. Y falla con las
 * dos mitades en el mensaje, porque si no quien lo lee tiene que ir a buscarlas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y LO QUE ESTE TEST NO HACE
 *
 * No comprueba que los SHA existan en GitHub, ni que el commit tenga lo que la
 * rama dice. Eso lo comprueba `scripts/fetch-missing-siblings.mjs` en cada
 * corrida, y sale con 2 diciendo cual, que es donde se enteran de verdad.
 *
 * Aqui solo se mira la ESTRUCTURA: que el inventario tenga lo que tiene que
 * tener, que el workflow lo nombre, y que los numeros casen. Poner una copia
 * del SHA aqui seria un tercer sitio, que es el problema que se esta evitando.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PINES = join(root, 'siblings.json');
const WORKFLOWS = join(root, '.github', 'workflows');
const FALLBACK = join(root, 'scripts', 'fetch-missing-siblings.mjs');

const inventario = JSON.parse(readFileSync(PINES, 'utf-8'));
const hermanos = inventario.hermanos ?? [];

/** Los `ref:` de un workflow, emparejados con el `path:` que bajan. */
function checkoutsDe(txt) {
  const out = [];

  // Se lee como texto y no con un parser de YAML a proposito: `js-yaml` no es
  // dependencia de este paquete, y lo que hace falta son dos lineas contiguas.
  for (const bloque of txt.split(/\n\s+- name:/).slice(1)) {
    const path = /\n\s+path:\s*(\S+)/.exec(bloque)?.[1];
    const ref = /\n\s+ref:\s*([0-9a-f]{40})/.exec(bloque)?.[1];
    if (path && ref) out.push({ path, ref });
  }

  return out;
}

const todosLosWorkflows = readdirSync(WORKFLOWS)
  .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
  .map((n) => ({ nombre: n, txt: readFileSync(join(WORKFLOWS, n), 'utf-8') }));

describe('el inventario de hermanos', () => {
  it('esta y se lee', () => {
    expect(existsSync(PINES)).toBe(true);
    expect(Array.isArray(hermanos)).toBe(true);
    expect(hermanos.length).toBeGreaterThan(0);
  });

  it('cada hermano tiene repo, SHA, y el fichero que se le va a abrir', () => {
    // El `necesita` no es un test de vida del repo: es lo que permite al
    // fallback preguntar "¿esta esto?" en vez de "¿existe este directorio?",
    // que daria presente un clon a medias.
    for (const h of hermanos) {
      expect(h.repo, 'falta repo').toBeTruthy();
      expect(h.sha, `${h.repo} sin sha`).toMatch(/^[0-9a-f]{40}$/);
      expect(Array.isArray(h.necesita) && h.necesita.length > 0, `${h.repo} sin necesita`).toBe(true);
      for (const rel of h.necesita)
        expect(rel, `${h.repo}: ${rel}`).not.toMatch(/^[\\/]|[A-Z]:/);   // relativa, sin unidad
    }
  });

  it('cada generador que lee un hermano esta declarado', () => {
    // El otro sentido del inventario: un generador nuevo lee un repo nuevo, y si
    // no aparece aqui el fallback no lo baja y el preflight dice "no he podido
    // comprobar" contra un hermano que nadie hatraido. El fallo se lee como si
    // fuera del contrato, y es de la lista.
    const declarados = new Set(hermanos.flatMap((h) => h.lee ?? []));

    for (const nombre of readdirSync(join(root, 'scripts'))) {
      if (!/^generate_.*\.(py|mjs|js)$/.test(nombre)) continue;

      // Solo los que de verdad leen un hermano: se busca la forma que usan los
      // tres, que es `<RAIZ>/<repo>/<fichero>`.
      const src = readFileSync(join(root, 'scripts', nombre), 'utf-8');
      if (!/ROOT/.test(src)) continue;

      expect(
        declarados.has(`scripts/${nombre}`),
        `scripts/${nombre} lee un hermano y no esta en siblings.json`,
      ).toBe(true);
    }
  });

  it('la RAIZ del fallback es la misma cuenta que la de los generadores', () => {
    // Si el dia que uno cambia el otro cambia con el, el preflight seguira dando
    // 2 con el hermano descargado a un palmo, y el mensaje seguira mintiendo
    // sobre la causa. Los generadores hacen:
    //
    //     HERE = dirname(abspath(__file__))     # <paquete>/scripts
    //     ROOT = dirname(dirname(HERE))         # la carpeta HERMANA
    //
    // y el script tiene que hacer lo mismo con `PAQUETE` y `RAIZ`. Se comprueba
    // por la forma del codigo, no ejecutandolo: esta es una puerta sobre una
    // ecuacion, no un test de comportamiento.
    const src = readFileSync(FALLBACK, 'utf-8');

    expect(src).toMatch(/const PAQUETE = dirname\(here\)/);
    expect(src).toMatch(/const RAIZ = dirname\(PAQUETE\)/);
  });
});

describe('el inventario y el workflow dicen lo mismo', () => {
  const workflowsConCheckout = todosLosWorkflows.filter(
    (w) => w.txt.includes('fetch-missing-siblings') || w.txt.includes('siblings.json'),
  );

  it('algun workflow baja a los hermanos', () => {
    expect(
      workflowsConCheckout.length,
      'ningun workflow usa el fallback de hermanos',
    ).toBeGreaterThan(0);
  });

  it('cada hermano del inventario tiene su checkout con el MISMO SHA', () => {
    // La comprobacion que existe para que esto no se salga. El mensaje lleva las
    // dos mitades, porque si no quien lo lee tiene que ir a buscarlas.
    const problemas = [];

    for (const w of workflowsConCheckout) {
      const bajados = new Map(checkoutsDe(w.txt).map((c) => [c.path, c.ref]));

      for (const h of hermanos) {
        const ref = bajados.get(h.repo);

        if (ref === undefined)
          problemas.push(`${w.nombre}: ${h.repo} esta en siblings.json y no se descarga`);
        else if (ref !== h.sha)
          problemas.push(`${w.nombre}: ${h.repo} se baja ${ref.slice(0, 8)} y el inventario dice ${h.sha.slice(0, 8)}`);
      }
    }

    expect(problemas.join('\n')).toBe('');
  });

  it('el workflow baja tambien al propio repo al nivel de los hermanos', () => {
    // Los generadores buscan `<raiz>/<repo>`, y la raiz es la carpeta hermana de
    // ESTE paquete. Si el checkout de ABDSharedAssets se queda en la raiz del
    // workspace, los generadores calculan una raiz de mas y no encuentran nada:
    // el preflight daria 2 con los cuatro hermanos descargados a la vista.
    for (const w of workflowsConCheckout) {
      expect(
        /path:\s*ABDSharedAssets/.test(w.txt),
        `${w.nombre}: ABDSharedAssets no se descarga en ABDSharedAssets/`,
      ).toBe(true);
      expect(
        /working-directory:\s*ABDSharedAssets/.test(w.txt),
        `${w.nombre}: el job no trabaja dentro de ABDSharedAssets/`,
      ).toBe(true);
    }
  });

  it('el fallback se ejecuta aunque un checkout no llegue a correr', () => {
    // `if: always()` es lo unico que hace que la red sirva: sin el, el paso se
    // salta junto con el checkout que fallo, que es justo cuando hace falta.
    for (const w of workflowsConCheckout) {
      const paso = w.txt
        .split(/\n\s+- name:/)
        .find((b) => b.includes('fetch-missing-siblings.mjs'));

      expect(paso, `${w.nombre}: el paso del fallback no se encuentra`).toBeTruthy();
      expect(
        /if:\s*always\(\)/.test(paso),
        `${w.nombre}: el fallback no lleva if: always(), asi que no corre si un checkout falla`,
      ).toBe(true);
    }
  });
});
