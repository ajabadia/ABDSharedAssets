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
 * y publica los outputs `hermanos` y `ficheros`, y el workflow los usa con
 * `fromJSON`: una matriz de checkouts y la comprobacion de ficheros de cada pata.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE TEST HACE, Y POR QUE NO BASTA CON MIRAR LA CADENA
 *
 * Con `fromJSON` en el `ref:` ya no hay ningun SHA de 40 hex en el workflow, asi
 * que un test que buscara el SHA dentro del bloque del checkout daria CERO
 * checkouts y pasaria en verde sin comprobar nada. Un verde que no mira nada es
 * peor que un rojo, y por eso aqui no se sustituye la comprobacion por una
 * expresion: se EJECUTA la comprobacion de verdad.
 *
 * Se importa `verificar()` de `scripts/verificar-pines-workflow.mjs` —el mismo
 * script que corre el job `pines`— y se le pasan los workflows de verdad, con los
 * outputs REALES de `pines-hermanos.mjs`, no una reimplementacion. Si el verificador
 * se queda ciego, este test se queda ciego con el, que es a proposito: la garantia
 * de que el workflow baja el pin no la da este test, la da el verificador, y un
 * test con otra copia de la logica solo anadiria el sitio donde puede mentir.
 *
 * Y cada mutacion del workflow se pasa por el verificador, para que se vea que la
 * puerta se cierra y no solo que existe. Un test que solo mira el caso bueno
 * comprueba que el codigo se ejecuta, no que verifique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y LO QUE ESTE TEST NO HACE
 *
 * No comprueba que los SHA existan en GitHub, ni que el commit tenga lo que la
 * rama dice. Eso lo comprueba el job `hermanos`, una pata por hermano, en un runner
 * de verdad, y sale con 1 diciendo cual.
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

import { delHermanoDe, ficherosDe, hermanosDe, inventarioDe, leidosDe, pinesDe } from '../scripts/pines-hermanos.mjs';
import { pasosReales, verificar } from '../scripts/verificar-pines-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PINES = join(root, 'siblings.json');
const WORKFLOWS = join(root, '.github', 'workflows');
const FALLBACK = join(root, 'scripts', 'fetch-missing-siblings.mjs');

const inventario = inventarioDe(PINES);
const hermanos = inventario.hermanos ?? [];
const pines = pinesDe(inventario);
const ficheros = ficherosDe(inventario);
const leidos = leidosDe(inventario);

const todosLosWorkflows = readdirSync(WORKFLOWS)
  .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
  .map((n) => ({ nombre: n, txt: readFileSync(join(WORKFLOWS, n), 'utf-8') }));

const workflowsConHermanos = todosLosWorkflows.filter(
  (w) => w.txt.includes('fetch-missing-siblings') || w.txt.includes('siblings.json'),
);

/**
 * Lo que el verificador dice de un conjunto de workflows.
 *
 * @param {Array<{nombre: string, txt: string}>} workflows
 * @returns {string[]}  Los errores, ya en texto.
 */
function erroresDe(workflows) {
  return verificar({ workflows, inventario, pines, ficheros, leidos, pasos: pasosReales() }).errores;
}

/** El verificador sobre los workflows de verdad. */
const erroresReales = erroresDe(todosLosWorkflows);

/**
 * El mismo verificador sobre el workflow de verdad con un trozo cambiado.
 *
 * @param {string} nombre
 * @param {string} viejo
 * @param {string} nuevo
 * @returns {string[]}
 */
function erroresConMutacion(nombre, viejo, nuevo) {
  const original = todosLosWorkflows.find((w) => w.nombre === nombre);

  expect(original, `no hay ningun workflow llamado ${nombre}`).toBeTruthy();
  expect(original.txt, `${nombre}: el texto a mutar no esta`).toContain(viejo);

  const mutado = todosLosWorkflows.map((w) => (w.nombre === nombre
    ? { nombre: w.nombre, txt: w.txt.replace(viejo, nuevo) }
    : w));

  return erroresDe(mutado);
}

const AUDIT = 'docs-audit.yml';

describe('el inventario de hermanos', () => {
  it('esta y se lee', () => {
    expect(existsSync(PINES)).toBe(true);
    expect(Array.isArray(hermanos)).toBe(true);
    expect(hermanos.length).toBeGreaterThan(0);
  });

  it('cada hermano tiene repo, SHA, y el fichero que se le va a abrir', () => {
    // El `necesita` no es un test de vida del repo: es lo que permite al
    // checkout preguntar "¿esta esto?" en vez de "¿existe este directorio?",
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
    // comprobar" contra un hermano que nadie ha traido. El fallo se lee como si
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
    // Con un espacio o unas comillas, el `matrix.hermano.repo` del workflow no se
    // puede escribir. Aqui se avisa, que es donde se puede arreglar.
    expect(() => pinesDe({ hermanos: [{ repo: "ABD'Neural", sha: 'a'.repeat(40) }] })).toThrow(/ABD'Neural/);
  });

  it('un inventario vacio no se publica', () => {
    expect(() => pinesDe({ hermanos: [] })).toThrow();
    expect(() => pinesDe({})).toThrow();
  });

  it('un hermano sin ficheros que abrir no se publica', () => {
    // Una lista vacia haria que la comprobacion del checkout pasara sin mirar nada,
    // que es el verde que no mira nada.
    expect(() => ficherosDe({ hermanos: [{ repo: 'ABDEep', sha: 'a'.repeat(40) }] })).toThrow(/ABDEep/);
    expect(() => ficherosDe({ hermanos: [{ repo: 'ABDEep', sha: 'a'.repeat(40), necesita: [] }] })).toThrow(/ABDEep/);
  });

  it('un fichero que se sale del repo no se publica', () => {
    const base = { repo: 'ABDEep', sha: 'a'.repeat(40) };

    expect(() => ficherosDe({ hermanos: [{ ...base, necesita: ['/etc/passwd'] }] })).toThrow(/passwd/);
    expect(() => ficherosDe({ hermanos: [{ ...base, necesita: ['../ABDEep/x.h'] }] })).toThrow(/x\.h/);
  });

  it('el inventario real si se publica, con un SHA por repo', () => {
    expect(Object.keys(pines)).toEqual(hermanos.map((h) => h.repo));
    for (const [repo, sha] of Object.entries(pines)) expect(sha, repo).toMatch(/^[0-9a-f]{40}$/);
  });

  it('la lista que se publica es una pata por hermano, en el orden del fichero', () => {
    // Y aqui esta la razon de que el output sea una LISTA y no un mapa, que parece lo
    // contrario y no lo es: `strategy.matrix` convierte un array en una pata por
    // elemento, y un objeto en UNA pata sola. Un `fromJSON` de `{repo: sha}` daria un
    // unico `matrix.hermano` con todos los repos dentro, `matrix.hermano.repo` no
    // existiria, y el job bajaria el primer repo cuatro veces.
    const lista = hermanosDe(inventario);

    expect(lista).toHaveLength(hermanos.length);
    expect(lista.map((h) => h.repo)).toEqual(hermanos.map((h) => h.repo));
    for (const h of lista) expect(h.sha, h.repo).toMatch(/^[0-9a-f]{40}$/);
  });

  it('la lista de ficheros que se publica es la del inventario', () => {
    expect(ficheros).toEqual(
      Object.fromEntries(hermanos.map((h) => [h.repo, [...h.necesita]])),
    );
  });

  it('cada hermano declara que lee, y con rutas que no se salen de un repo', () => {
    for (const h of hermanos) {
      expect(Array.isArray(h.lee) && h.lee.length > 0, `${h.repo} sin lee`).toBe(true);

      for (const rel of h.lee) {
        expect(rel, `${h.repo}: ${rel}`).not.toMatch(/^[\\/]|[A-Z]:|\.\./);
      }
    }
  });

  it('un hermano sin "lee" no se publica', () => {
    // Es el mismo motivo que `necesita`: una lista vacia hace que la comprobacion
    // pase sin mirar nada, que es el verde que no mira nada.
    const base = { repo: 'ABDEep', sha: 'a'.repeat(40) };

    expect(() => leidosDe({ hermanos: [base] })).toThrow(/ABDEep/);
    expect(() => leidosDe({ hermanos: [{ ...base, lee: [] }] })).toThrow(/ABDEep/);
  });

  it('lo que se comprueba en el checkout son las rutas DEL HERMANO', () => {
    // Y no todas las de `lee`: los `scripts/generate_*` de este paquete existen en
    // el arbol de trabajo y no en el checkout del hermano. Pedir al job `hermanos`
    // que los busque ahi seria un rojo siempre, y un rojo siempre es un rojo que
    // nadie lee.
    //
    // LA REGLA ES DONDE EXISTE EL FICHERO. Lo que se probo primero fue mirar si la
    // ruta empezaba por `scripts/`, y es FALSO: `ABDEep/scripts/registry_generator.js`
    // y `ABDMS2000/Scripts/registry_generator.js` empiezan por lo que parece la
    // misma cosa y son generadores del HERMANO. Con ese filtro el job se comia dos
    // generadores sin comprobar, que es justo el fallo que este paso existe para
    // cazar. Por eso el test afirma los DOS lados de la particion: lo que queda
    // fuera tiene que existir aqui, y lo que queda dentro tiene que existir al lado
    // del hermano.
    for (const h of hermanos) {
      const delHermano = delHermanoDe(h.lee, root);

      // Lo que NO se comprueba en el checkout tiene que estar en este paquete.
      for (const rel of h.lee.filter((r) => !delHermano.includes(r)))
        expect(
          existsSync(join(root, ...rel.split('/'))),
          `${rel} no esta en este paquete ni en ${h.repo}`,
        ).toBe(true);

      // Y lo que se comprueba tiene que existir de verdad en el hermano. En local se
      // mira al lado; en CI lo comprueba la pata del job `hermanos`, con el checkout
      // delante, que es lo unico que puede dar por cierto.
      const raizHermano = join(root, '..', h.repo);

      for (const rel of delHermano)
        expect(
          existsSync(join(raizHermano, ...rel.split('/'))),
          `${h.repo}: ${rel} no esta en el checkout, y el job lo dira alli`,
        ).toBe(true);
    }

    // Y el reparto no puede ser "todo de un lado": si `lee` fuera solo de este
    // paquete, el paso no miraria nada en el checkout de nadie, que es el verde que
    // no mira nada con dos pasos de nombre.
    expect(
      hermanos.some((h) => delHermanoDe(h.lee, root).length > 0),
      'ningun hermano declara rutas que haya que comprobar en su checkout',
    ).toBe(true);
  });

  it('un hermano sin generadores propios LO DICE, no sale en verde callado', () => {
    // ABDSharedCode no tiene ningun generador en su propio repo: los suyos estan en
    // `ABDSharedAssets/scripts/`. Su lista queda vacia y el paso no tiene nada que
    // mirar ahi. Lo que NO puede es decirlo con un "los 0 generadores estan": eso es
    // un verde que no mira nada, que es la forma de fallo que motive todo esto.
    const sinPropios = hermanos.filter((h) => delHermanoDe(h.lee, root).length === 0);

    expect(sinPropios.length, 'ningun hermano se queda sin generadores propios que probar').toBeGreaterThan(0);

    const paso = todosLosWorkflows
      .find((w) => w.nombre === AUDIT)
      .txt.split('\n      - name: ')
      .find((b) => b.includes('LEIDOS'));

    expect(paso).toMatch(/rel\.length === 0/);
    expect(paso).toMatch(/no declara generadores PROPIOS/);
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

  it('ningun checkout pide su pin por posicion', () => {
    // Los cuatro repos se piden por NOMBRE dentro de la matriz. Si alguien pasa la
    // matriz a `fromJSON(...)[0]`, reordenar `siblings.json` cambiaria en silencio
    // que repo baja cada pata, y un checkout del repositorio equivocado no se
    // parece a nada que se pueda leer en el log.
    const posicionales = todosLosWorkflows.flatMap((w) =>
      [...w.txt.matchAll(/fromJSON\([^)]*\)\s*\[\s*\d+\s*\]/g)].map((m) => `${w.nombre}: ${m[0]}`),
    );

    expect(posicionales.join('\n')).toBe('');
  });

  it('el verificador da en verde el workflow de verdad', () => {
    // El mismo script que corre el job `pines`, con los mismos datos: los outputs
    // REALES de `pines-hermanos.mjs`, leidos de un `GITHUB_OUTPUT` de mentira.
    // Si aqui sale un error, el workflow bajaria un repo que el inventario no
    // declara, o bajaria la rama por defecto, y lo haria en silencio.
    expect(erroresReales.join('\n')).toBe('');
  });
});

describe('el verificador se pone en rojo cuando el workflow deja de cuadrar', () => {
  // Cada caso es una forma de que el checkout baje la RAMA POR DEFECTO, que no es un
  // error en el runner: el paso se pone verde y baja el codigo de hoy en vez del de
  // ayer. Todas se probaron tambien contra el workflow de verdad, mutandolo en
  // disco; aqui se muta en memoria, que es lo mismo sin dejar el fichero a medias.

  it('un SHA escrito a mano en el ref', () => {
    const errores = erroresConMutacion(
      AUDIT,
      '          ref: ${{ matrix.hermano.sha }}',
      `          ref: ${pines.ABDSharedCode}`,
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('una matriz con un objeto en vez de una lista', () => {
    // El mapa `ficheros` es un objeto: una pata sola con todos los repos dentro, y
    // `matrix.hermano.repo` no existe. El job bajaria el primer repo una vez.
    const errores = erroresConMutacion(
      AUDIT,
      '        hermano: ${{ fromJSON(needs.pines.outputs.hermanos) }}',
      '        hermano: ${{ fromJSON(needs.pines.outputs.ficheros) }}',
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('una matriz que coge un indice en vez de la dimension', () => {
    const errores = erroresConMutacion(
      AUDIT,
      '        hermano: ${{ fromJSON(needs.pines.outputs.hermanos) }}',
      '        hermano: ${{ fromJSON(needs.pines.outputs.hermanos)[0] }}',
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('un ref que lee una clave que no existe', () => {
    const errores = erroresConMutacion(
      AUDIT,
      '          ref: ${{ matrix.hermano.sha }}',
      '          ref: ${{ matrix.hermano.shaXX }}',
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('la lista de ficheros escrita a mano en el paso que la comprueba', () => {
    // Esa lista es un dato del inventario. Escrita aqui seria la segunda copia, y
    // desincronizada por el mismo motivo que el SHA: el generador abre un fichero
    // nuevo, el inventario lo lista, y la lista del workflow sigue sin el.
    const errores = erroresConMutacion(
      AUDIT,
      '          NECESITA: ${{ toJSON(fromJSON(needs.pines.outputs.ficheros)[matrix.hermano.repo]) }}',
      "          NECESITA: '[\"uno.h\"]'",
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('una matriz que no baja a ningun hermano', () => {
    const errores = erroresConMutacion(
      AUDIT,
      [
        '        hermano: ${{ fromJSON(needs.pines.outputs.hermanos) }}',
        '',
        '    steps:',
        '      - name: Checkout ${{ matrix.hermano.repo }} (Immutable Sibling Ref)',
        '        uses: actions/checkout@v7',
        '        with:',
        '          repository: ajabadia/${{ matrix.hermano.repo }}',
        '          ref: ${{ matrix.hermano.sha }}',
        '          path: ${{ matrix.hermano.repo }}',
        '          fetch-depth: 1',
      ].join('\n'),
      [
        '        hermano: ${{ fromJSON(needs.pines.outputs.hermanos) }}',
        '',
        '    steps:',
        '      - name: Solo el aviso',
        '        run: echo nada que bajar',
      ].join('\n'),
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('una lista de generadores escrita a mano en el paso que la comprueba', () => {
    // Es la segunda copia del mismo dato que el `ref:` a mano era, con la misma
    // consecuencia: si un generador se mueve DENTRO de un hermano, la lista del
    // workflow se queda vieja y el paso se pone verde mirando una ruta que ya no
    // existe. Sin esta comprobacion el fallo sale tres jobs mas tarde, como un
    // contrato que no se regenero.
    const errores = erroresConMutacion(
      AUDIT,
      '          LEIDOS: ${{ toJSON(fromJSON(needs.pines.outputs.delHermano)[matrix.hermano.repo]) }}',
      "          LEIDOS: '[\"Source/DSP/FxCatalogExport.cpp\"]'",
    );

    expect(errores.join('\n')).not.toBe('');
  });

  it('el filtro de que rutas son de quien NO esta en el workflow', () => {
    // Va en el publicador (`delHermanoDe`), no en el `run:`. Si vuelve al workflow
    // es una segunda copia, y esta vez de una REGLA y no de un dato: se desincroniza
    // sin que ningun cambio de SHA la delate.
    //
    // Se comprueba sobre el TEXTO y no con el verificador a proposito: el
    // verificador mira que la lista que le llega sea la del inventario, y una lista
    // filtrada aqui puede coincidir con la del inventario sin que el filtro haya
    // dejado de ser una copia. Esto es lo que mira si hay ALGO, no si encaja.
    const paso = todosLosWorkflows
      .find((w) => w.nombre === AUDIT)
      .txt.split('\n      - name: ')
      .find((b) => b.includes('LEIDOS'));

    expect(paso, 'no se encuentra el paso que comprueba los generadores').toBeTruthy();
    expect(paso).not.toMatch(/\.filter\(.*\^scripts/);
  });

  it('un workflow sin el paso que publica los pines', () => {
    // Sin el, no hay de donde sacar el pin y el `fromJSON` no resuelve. Aqui
    // parece una modificacion pequena —borrar un paso— y deja el job entero
    // bajando la rama por defecto sin que ningun paso se ponga rojo.
    const errores = erroresConMutacion(
      AUDIT,
      '        run: node scripts/pines-hermanos.mjs',
      '        run: echo sin pines',
    );

    expect(errores.join('\n')).not.toBe('');
  });
});

describe('el layout que necesitan los generadores', () => {
  it('el workflow baja tambien al propio repo al nivel de los hermanos', () => {
    // Los generadores buscan `<raiz>/<repo>`, y la raiz es la carpeta hermana de
    // ESTE paquete. Si el checkout de ABDSharedAssets se queda en la raiz del
    // workspace, los generadores calculan una raiz de mas y no encuentran nada:
    // el preflight daria 2 con los cuatro hermanos descargados a la vista.
    for (const w of workflowsConHermanos) {
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

  it('el job que corre los generadores depende de la puerta que baja los hermanos', () => {
    // Los generadores necesitan los cuatro hermanos en SU workspace, y en GitHub un
    // job es un workspace. Por eso el job `audit` no los baja y depende del que si.
    // Si el `needs` se cae, `audit` correria con lo que hubiera en el disco.
    const { errores, lineas } = verificar({
      workflows: todosLosWorkflows,
      inventario,
      pines,
      ficheros,
      leidos,
      pasos: pasosReales(),
    });

    expect(errores.join('\n')).toBe('');
    // El numero sale del inventario, no de un literal. La linea tiene que decir
    // que se han comprobado TODOS y no uno menos, que es lo unico que el "de N de
    // N" afirma; el numero concreto es el del inventario y este test no lo vigila,
    // porque escribirlo aqui lo que se vigila es el numero, no la comprobacion.
    const cuantos = inventario.hermanos.length;
    expect(lineas.join('\n')).toMatch(new RegExp(`Pines comprobados: ${cuantos} de ${cuantos} hermanos`));
  });
});