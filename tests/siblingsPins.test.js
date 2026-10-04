/**
 * LOS PINES DE LOS HERMANOS: el inventario tiene que ser la UNICA fuente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE HAY UN TEST DE UN JSON
 *
 * El SHA fijado de cada hermano estaba escrito DOS veces: en `siblings.json`,
 * que es lo que lee `scripts/fetch-missing-siblings.mjs` para bajar al hermano que
 * falte, y en los `ref:` de `actions/checkout` del workflow, que son los que bajan
 * los hermanos en una corrida normal.
 *
 * Dos copias se separan solas. Y se separaron: alguien subio el SHA en el workflow
 * al cambiar una cabecera, dejo el otro, y el checkout trajo el codigo nuevo
 * mientras el fallback seguia apuntando al commit viejo. No se rompio de golpe: el
 * preflight paso en verde y un dia de estos el checkout fallo —una rama borrada, un
 * repo renombrado— y el fallo se presento como "falta una cabecera", que no es lo
 * que habia pasado.
 *
 * La solucion no es mirar mas de cerca el mismo par de sitios, sino dejar de
 * tenerlos. Ahora `siblings.json` es la fuente, `scripts/pines-hermanos.mjs` la lee
 * y publica un output `shas`, y cada `ref:` del workflow se calcula con
 * `fromJSON` sobre ese output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE TEST HACE, Y POR QUE NO BASTA CON MIRAR LA CADENA
 *
 * Con `fromJSON` en el `ref:` ya no hay ningun SHA de 40 hex en el workflow, asi
 * que el test viejo —que buscaba el SHA dentro del bloque del checkout— daria
 * CERO checkouts y pasaria en verde sin comprobar nada. Un verde que no mira nada
 * es peor que un rojo, y por eso aqui no se sustituye la comprobacion por una
 * expresion: se EVALUA.
 *
 * Se evaluan las expresiones del workflow contra el mismo mapa de pines que
 * publica el script real —importado, no reimplementado—, y se compara lo que sale
 * con lo que dice `siblings.json`. Si alguien escribe `['ABDNeura1']` con una `l`
 * de menos, el `fromJSON` de GitHub devuelve vacio y el `actions/checkout` baja la
 * RAMA por defecto sin quejarse. Aqui eso sale en rojo, nombrando el repo.
 *
 * Y el otro sentido, que es el que de verdad cierra la puerta: NINGUN workflow
 * puede volver a escribir un SHA de 40 hex. Ese es el test que hace imposible la
 * contradiccion, en vez de detectarla cuando ya ha pasado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y LO QUE ESTE TEST NO HACE
 *
 * No comprueba que los SHA existan en GitHub, ni que el commit tenga lo que la
 * rama dice. Eso lo comprueba `scripts/fetch-missing-siblings.mjs` en cada
 * corrida, y sale con 2 diciendo cual, que es donde se enteran de verdad.
 *
 * Aqui se mira la ESTRUCTURA y la CONEXION: que el inventario tenga lo que tiene
 * que tener, que el workflow lo lea en vez de escribirlo, y que lo que sale de la
 * expresion sea lo que dice el inventario. Poner una copia del SHA aqui seria un
 * tercer sitio, que es justo el problema que se esta evitando.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventarioDe, pinesDe } from '../scripts/pines-hermanos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PINES = join(root, 'siblings.json');
const WORKFLOWS = join(root, '.github', 'workflows');
const FALLBACK = join(root, 'scripts', 'fetch-missing-siblings.mjs');

const inventario = inventarioDe(PINES);
const hermanos = inventario.hermanos ?? [];
const pines = pinesDe(inventario);

/** La expresion de un `ref:` que toma su SHA del output del paso de los pines. */
const EXPRESION = /^\$\{\{\s*fromJSON\(\s*steps\.pins\.outputs\.shas\s*\)\s*\[\s*['"]?([A-Za-z0-9_-]+)['"]?\s*\]\s*\}\}$/;

/** Los checkout del workflow, con su `path:` y su `ref:` tal cual aparecen. */
function checkoutsDe(txt) {
  const out = [];

  // Se lee como texto y no con un parser de YAML a proposito: `js-yaml` no es
  // dependencia de este paquete, y lo que hace falta son dos lineas contiguas.
  for (const bloque of txt.split(/\n\s+- name:/).slice(1)) {
    const path = /\n\s+path:\s*(\S+)/.exec(bloque)?.[1];
    // El `ref:` se lleva hasta el FIN DE LINEA y no un `\S+`: ahora es una
    // expresion con espacios (`${{ fromJSON(...)['ABDEep'] }}`) y un `\S+` solo
    // leeria el `${{`, que ademas empieza por `$` y es justo el caso raro que
    // este test tiene que saber distinguir de un SHA escrito a mano.
    const ref = /\n\s+ref:\s*(.+)/.exec(bloque)?.[1]?.trim();
    if (path && ref) out.push({ path, ref });
  }

  return out;
}

const todosLosWorkflows = readdirSync(WORKFLOWS)
  .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
  .map((n) => ({ nombre: n, txt: readFileSync(join(WORKFLOWS, n), 'utf-8') }));

const workflowsConCheckout = todosLosWorkflows.filter(
  (w) => w.txt.includes('fetch-missing-siblings') || w.txt.includes('siblings.json'),
);

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

describe('el inventario no se puede publicar si no sirve', () => {
  // El script de los pines es lo que se ejecuta en el workflow, asi que se prueba
  // a el y no a una copia de su logica. Cada caso es una forma de dejar un `ref:`
  // vacio en un `actions/checkout`, que no es un error: es un checkout de la rama
  // por defecto, justo lo que el diseno de los pines prohibe.

  const conSha = (extra = {}) => ({ hermanos: [{ repo: 'ABDEep', sha: 'a'.repeat(40), ...extra }] });

  it('un hermano sin SHA de 40 hex no se publica', () => {
    expect(() => pinesDe({ hermanos: [{ repo: 'ABDEep', sha: 'abc' }] })).toThrow(/ABDEep/);
    expect(() => pinesDe({ hermanos: [{ repo: 'ABDEep' }] })).toThrow(/ABDEep/);
  });

  it('un repo repetido no se publica', () => {
    expect(() => pinesDe({ hermanos: [...conSha().hermanos, ...conSha().hermanos] })).toThrow(/ABDEep/);
  });

  it('un repo que no sirve como clave de expresion no se publica', () => {
    // Con un espacio o unas comillas, el `fromJSON(...)['<repo>']` del workflow no
    // se puede escribir. Aqui se avisa, que es donde se puede arreglar.
    expect(() => pinesDe({ hermanos: [{ repo: "ABD'Neural", sha: 'a'.repeat(40) }] })).toThrow(/ABD'Neural/);
  });

  it('un inventario vacio no se publica', () => {
    expect(() => pinesDe({ hermanos: [] })).toThrow();
    expect(() => pinesDe({})).toThrow();
  });

  it('el inventario real si se publica, con un SHA por repo', () => {
    expect(Object.keys(pines)).toEqual(hermanos.map((h) => h.repo));
    for (const [repo, sha] of Object.entries(pines)) expect(sha, repo).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('el inventario es la unica fuente de los SHA', () => {
  it('ningun workflow escribe un SHA de 40 hex', () => {
    // La puerta que hace imposible la contradiccion. Un SHA escrito en el workflow
    // es un segundo sitio: se puede quedar viejo por debajo sin que ningun test lo
    // note hasta que el checkout y el fallback dicen cosas distintas.
    for (const w of todosLosWorkflows) {
      const encontrados = w.txt.match(/[0-9a-f]{40}/g) ?? [];

      expect(
        encontrados.length === 0,
        `${w.nombre}: ${encontrados.length} SHA escrito(s) a mano; el pin va en siblings.json, ` +
        `y el workflow lo lee con fromJSON`,
      ).toBe(true);
    }
  });

  it('cada hermano del inventario se baja con el SHA que dice el inventario', () => {
    // Se EVALUA la expresion del `ref:` contra el mapa que publica el script real,
    // en vez de buscar el SHA con una regex. Una clave mal escrita —una `l` de
    // menos— daria `undefined` en el `fromJSON` de GitHub y el checkout bajaria la
    // rama por defecto sin decir nada; aqui sale en rojo nombrando el repo.
    const problemas = [];

    for (const w of workflowsConCheckout) {
      const bajados = new Map(checkoutsDe(w.txt).map((c) => [c.path, c.ref]));

      for (const h of hermanos) {
        const ref = bajados.get(h.repo);

        if (ref === undefined) {
          problemas.push(`${w.nombre}: ${h.repo} esta en siblings.json y no se descarga`);
          continue;
        }

        const clave = EXPRESION.exec(ref)?.[1];

        if (clave === undefined) {
          problemas.push(`${w.nombre}: el checkout de ${h.repo} no pide su pin a siblings.json (ref: ${ref})`);
          continue;
        }

        if (clave !== h.repo)
          problemas.push(`${w.nombre}: el checkout de ${h.repo} pide el pin de "${clave}"`);

        // El valor que GitHub resolveria de verdad: el `fromJSON` sobre el output
        // del paso, por clave.
        const resuelto = pines[clave];

        if (resuelto === undefined)
          problemas.push(`${w.nombre}: ${clave} no esta en siblings.json, asi que su fromJSON da vacio y el checkout baja la rama por defecto`);
        else if (resuelto !== h.sha)
          problemas.push(`${w.nombre}: ${h.repo} baja ${resuelto.slice(0, 8)} y el inventario dice ${h.sha.slice(0, 8)}`);
      }
    }

    expect(problemas.join('\n')).toBe('');
  });

  it('el checkout de un hermano se pide por clave, no por su posicion', () => {
    // Los cuatro `ref:` van por clave y no por indice a proposito. Si alguien los
    // pasa a `fromJSON(...)[0]`, `fromJSON(...)[1]`, reordenar `siblings.json`
    // cambiaria en silencio que repo baja cada paso, y un checkout del repositorio
    // equivocado no se parece a nada que se pueda leer en el log.
    const posicionales = todosLosWorkflows.flatMap((w) =>
      [...w.txt.matchAll(/fromJSON\([^)]*\)\s*\[\s*\d+\s*\]/g)].map((m) => `${w.nombre}: ${m[0]}`),
    );

    expect(posicionales.join('\n')).toBe('');
  });

  it('los pines se publican antes de que los checkout los usen', () => {
    // `actions/checkout` no lee ficheros: solo ve el output de un paso ANTERIOR.
    // Con el paso de los pines despues de los checkout, cada `ref:` se quedaria
    // vacio, y vacio en un checkout es la rama por defecto.
    for (const w of workflowsConCheckout) {
      const pines_ = w.txt.indexOf('id: pins');
      const primerRef = w.txt.indexOf('ref: ${{');

      expect(pines_, `${w.nombre}: no hay ningun paso que publique los pines`).toBeGreaterThan(-1);

      if (primerRef === -1) continue;

      expect(
        pines_ < primerRef,
        `${w.nombre}: el paso que publica los pines va DESPUES del checkout que los usa`,
      ).toBe(true);
    }

    for (const w of workflowsConCheckout) {
      expect(
        /id:\s*pins[\s\S]{0,200}pines-hermanos\.mjs/.test(w.txt),
        `${w.nombre}: el paso pins no es el que lee siblings.json`,
      ).toBe(true);
    }
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