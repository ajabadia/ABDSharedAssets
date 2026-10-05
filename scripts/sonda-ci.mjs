#!/usr/bin/env node
/**
 * LA SONDA DE CI: LO QUE EL RUNNER VA A VER, CON LOS SHA FIJADOS
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE ES Y POR QUE HACE FALTA
 *
 * El preflight de esta maquina da 1 y el de CI daria 0 con el mismo comando, y
 * durante mucho tiempo no hubo forma de saber por que: en local el `--check` de
 * los generadores lee el ARBOL DE TRABAJO, donde hay ficheros que nadie ha
 * commiteado, y en CI el `actions/checkout` baja el SHA que dice `siblings.json`
 * y ahi no estan. Los dos verdes —o los dos rojos— son la misma ejecucion sobre
 * codigo distinto.
 *
 * Esta sonda monta un sandbox con la FORMA del workflow: un `ABDSharedAssets/`
 * al lado de los hermanos, y cada hermano con EXACTAMENTE los ficheros de su
 * SHA, materializados con `ls-tree` + `show`. Al motor no le importa de donde
 * salen los ficheros, solo que esten ahi, asi que el sandbox mide lo que va a
 * medir el runner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO ESTA EN UN FICHERO Y NO TRES COPIAS
 *
 * Los tres scripts —el preflight, los guardas y el de subir pines— materializan
 * el sandbox con el MISMO codigo: leer el inventario, validar los SHA y hacer
 * `ls-tree -r -z --name-only <sha>` seguido de un `show` por fichero. Tres
 * copias de eso son tres sitios donde el `safe.directory` se puede quedar sin
 * poner y el sandbox se monta a medias sin que nadie lo note, porque un sandbox
 * vacio y uno sano se parecen mucho en el log.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO HACE: NO BAJA NADA DE LA RED
 *
 * Los ficheros salen de `git show` de los clones que ya hay en la maquina. Una
 * sonda que Bajara de GitHub solo podria responder «el SHA existe», que no es la
 * pregunta: la pregunta es si lo que HAY en el arbol, puesto en su sitio, pasa
 * el preflight. Un SHA que no esta pusheado no lo puede clonar ni
 * `actions/checkout`, y por eso el materializado local y el checkout de CI
 * coinciden solo cuando el SHA esta subido. Se dice al imprimirlo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS
 *
 *   0  la sonda se monto y el paso emulado dio 0.
 *   1  el paso emulado dio rojo. ES EL DATO, no un fallo de la sonda: por eso
 *      se propaga en vez de tragarselo. Un `process.exit(0)` al final —que es lo
 *      que hacia la version de `ABDEep/build/`— hacia que el veredicto solo
 *      existiera en el texto, y un veredicto que no se puede leer desde un `if`
 *      no lo lee nadie.
 *   2  no se puede montar la sonda: inventario ausente, sin hermanos o con un
 *      SHA que no son 40 hex. Aqui no se finge: una sonda sin pines mide un
 *      sandbox sin hermanos y sale en verde mirando el vacio, que es el peor
 *      resultado posible de una sonda.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Este paquete, y la CARPETA HERMANA: la misma cuenta que usan los generadores. */
export const PAQUETE = dirname(here);
export const RAIZ_MONOREPO = dirname(PAQUETE);

const SHA = /^[0-9a-f]{40}$/;

/** Un `git` que no se traga un clon entero en memoria ni un nombre con acentos. */
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Los SHA del inventario, o `null` si no se puede trabajar con ellos.
 *
 * Se devuelve `null` en vez de lanzar para que la salida 2 la decida quien
 * llama y pueda anadir el mensaje que sepa de donde salio el inventario. Y se
 * comprueba el formato de los SHA aqui, en un sitio, porque un pin que no es de
 * 40 hex no es un pin: `git show` contra el no da ningun error util, da un
 * `fatal` que no dice que el problema esta mas arriba.
 *
 * @param {string} [rutaInventario] por defecto, el `siblings.json` de este paquete.
 * @returns {Record<string, string>|null}
 */
export function pinesDe(rutaInventario = join(PAQUETE, 'siblings.json')) {
  const problema = problemaDelInventario(rutaInventario);

  if (problema !== null)
    return null;

  const pines = {};

  for (const h of JSON.parse(readFileSync(rutaInventario, 'utf-8')).hermanos)
    pines[h.repo] = h.sha;

  return pines;
}

/**
 * Por que este inventario NO sirve, o `null` si sirve.
 *
 * Existe como funcion aparte, y no porque quede mas comodo, sino porque
 * `pinesDe` y `motivoSinPines` tienen que DECIR LO MISMO. Con las dos politicas
 * escritas por separado ya paso: un hermano sin `repo` lo rechazaba `pinesDe` y
 * `motivoSinPines` se caia en su frase generica, «el inventario no sirve», que
 * no dice nada de lo que hay que arreglar. Dos reglas para lo mismo se separan
 * solas; esta devuelve el veredicto y las dos la consultan.
 *
 * @param {string} rutaInventario
 * @returns {string|null} la frase, o null si el inventario sirve.
 */
export function problemaDelInventario(rutaInventario) {
  if (!existsSync(rutaInventario))
    return `no encuentro el inventario en ${rutaInventario}`;

  let inventario;

  try {
    inventario = JSON.parse(readFileSync(rutaInventario, 'utf-8'));
  } catch (exc) {
    return `el inventario no se puede leer: ${String(exc.message ?? exc)}`;
  }

  if (!Array.isArray(inventario?.hermanos))
    return 'el inventario no declara una lista de hermanos';

  if (inventario.hermanos.length === 0)
    return 'el inventario no declara ninguna lista de hermanos';

  const sinRepo = inventario.hermanos.filter((h) => typeof h?.repo !== 'string' || h.repo === '');

  if (sinRepo.length > 0)
    return `${sinRepo.length} hermano(s) sin "repo", y sin repo no hay donde materializarlo`;

  const malos = inventario.hermanos.filter((h) => typeof h?.sha !== 'string' || !SHA.test(h.sha));

  if (malos.length > 0)
    return `${malos.map((h) => h.repo).join(', ')} no tiene un SHA de 40 hex`;

  return null;
}

/** Por que no hay pines utilizables, en una frase que se pueda imprimir tal cual. */
export function motivoSinPines(rutaInventario = join(PAQUETE, 'siblings.json')) {
  return problemaDelInventario(rutaInventario) ?? 'el inventario no sirve';
}

/** Un `git` contra un repo del monorepo, con el directorio marcado como seguro. */
function gitEn(repo, args) {
  return execFileSync(
    'git',
    [
      '-c', 'safe.directory=*',
      '-c', 'core.quotepath=false',
      '-C', join(RAIZ_MONOREPO, repo),
      ...args,
    ],
    { encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );
}

/** Lo que `git show` devuelve de un blob, en bytes. */
function blobDe(repo, sha, fichero) {
  return execFileSync(
    'git',
    ['-c', 'safe.directory=*', '-C', join(RAIZ_MONOREPO, repo), 'show', `${sha}:${fichero}`],
    { maxBuffer: MAX_BUFFER },
  );
}

/**
 * Los ficheros de un repo en un SHA, uno a uno, y cuantos se quedaron fuera.
 *
 * El `-z` no es un detalle de portabilidad: `ls-tree` sin el ESCAPA con
 * comillas y barras los nombres que no son UTF-8, y el `mkdir` de esa ruta
 * revienta. Separando por NUL salen las rutas en crudo.
 *
 * Y los ficheros que no se pueden escribir NO se tiran. En ABDNeural hay uno con
 * un byte 0x80 en el nombre, que esta maquina no sabe crear; al motor le
 * importan `scripts/`, `WebUI/scripts/` y `tools/`, asi que un nombre imposible
 * no puede invalidar la sonda. Se cuenta y se dice, que es la diferencia entre
 * «el sandbox esta incompleto» y «no lo se».
 *
 * @param {string} destinoRaiz donde se materializa.
 * @param {string} repo
 * @param {string} sha
 * @returns {{puestos: number, saltados: number}}
 */
export function materializar(destinoRaiz, repo, sha) {
  const lista = gitEn(repo, ['ls-tree', '-r', '-z', '--name-only', sha])
    .split('\0')
    .filter(Boolean);

  let puestos = 0;
  let saltados = 0;

  for (const f of lista) {
    const abs = join(destinoRaiz, repo, f);

    try {
      const bytes = blobDe(repo, sha, f);

      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, bytes);
      puestos += 1;
    } catch {
      saltados += 1;
    }
  }

  return { puestos, saltados };
}

/**
 * El MARCADOR que dice que SHA se materializo en un sandbox.
 *
 * Un sandbox no lleva `.git`: son ficheros sueltos, copiados de `git show`. Sin
 * este marcador, el bloque de estado de `estado-hermanos.mjs` lee `sin git: no se
 * puede decir que commit hay` dentro del sandbox, que es verdad tecnica y mentira
 * util —la sonda SI sabe que SHA ha puesto, y acaba de materializarlo ella misma.
 *
 * Por eso se escribe. El preflight que corre ahi dentro puede asi decir
 * `fijado f32163f  en disco f32163f` y declarar que sus rojos son comparables con
 * los del runner, que es justo lo que una sonda debe poder afirmar.
 *
 * El nombre lleva punto y va en la raiz del repo, donde el motor no mira.
 */
export const MARCADOR_SONDA = '.sonda-ci.json';

/** Que SHA ha puesto la sonda en un repo del sandbox, o null. */
export function shaDelMarcador(base) {
  const ruta = join(base, MARCADOR_SONDA);

  if (!existsSync(ruta))
    return null;

  try {
    const marca = JSON.parse(readFileSync(ruta, 'utf-8'));

    return typeof marca?.sha === 'string' && SHA.test(marca.sha) ? marca.sha : null;
  } catch {
    return null;
  }
}

/**
 * El sandbox del layout del workflow, con los pines ya puestos.
 *
 * @param {object} opciones
 * @param {string[]} opciones.pines  `repo -> sha`.
 * @param {string[]} opciones.copiar  rutas de este paquete a copiar en `ABDSharedAssets/`.
 * @param {boolean} [opciones.arbolDeTrabajo]  copiar este paquete entero en vez de una lista.
 * @returns {{sandbox: string, puesto: {repo: string, sha: string, puestos: number, saltados: number}[], limpiar: () => void}}
 */
export function montarSandbox({ pines, copiar = [], arbolDeTrabajo = false }) {
  const sandbox = mkdtempSync(join(tmpdir(), 'sonda-ci-'));

  if (arbolDeTrabajo) {
    copiarArbol(PAQUETE, join(sandbox, 'ABDSharedAssets'));
  } else {
    for (const rel of copiar) {
      const origen = join(PAQUETE, rel);

      if (!existsSync(origen))
        continue;

      const destino = join(sandbox, 'ABDSharedAssets', rel);

      mkdirSync(dirname(destino), { recursive: true });
      copyFileSync(origen, destino);
    }
  }

  const puesto = Object.entries(pines).map(([repo, sha]) => {
    const resultado = materializar(sandbox, repo, sha);

    // El marcador se escribe DESPUES de materializar, y nunca dentro del
    // try/catch de cada fichero: si un repo entero no se puede escribir, el
    // marcador tampoco, y entonces el bloque dira `sin git` de un sandbox que
    // esta vacio —que es la combinacion que hay que poder leer.
    try {
      writeFileSync(
        join(sandbox, repo, MARCADOR_SONDA),
        `${JSON.stringify({ repo, sha, son: 'sonda-ci' }, null, 2)}\n`,
        'utf8',
      );
    } catch {
      /* el bloque dira sin-git, que es lo que corresponde */
    }

    return { repo, sha, ...resultado };
  });

  return {
    sandbox,
    puesto,
    limpiar: () => rmSync(sandbox, { recursive: true, force: true }),
  };
}

/** Copia recursiva, saltando lo que no puede ir a un sandbox. */
function copiarArbol(origen, destino) {
  mkdirSync(destino, { recursive: true });

  for (const entrada of readdirSync(origen, { withFileTypes: true })) {
    // `node_modules` pesa, `.git` no aporta nada al motor y `dist` se genera.
    if (entrada.name === 'node_modules' || entrada.name === '.git' || entrada.name === 'dist')
      continue;

    const src = join(origen, entrada.name);
    const dst = join(destino, entrada.name);

    // Un enlace NO se copia, y es la misma razon por la que `ci-local.mjs` no lo
    // copia: en la raiz hay una junction, `abdbank`, que apunta a la WebUI de
    // ABDBankManager. `copyFileSync` la resuelve y revienta con EPERM en Windows,
    // con un error que habla de «operation not permitted» sobre un fichero que no
    // tiene nada que ver con el paso. Peor que eso: si se copiara el contenido,
    // el sandbox tendria codigo de un repo que el runner no tiene, y el
    // preflight responderia por algo que en CI no existe.
    try {
      if (lstatSync(src).isSymbolicLink())
        continue;
    } catch {
      continue;
    }

    if (entrada.isDirectory())
      copiarArbol(src, dst);
    else
      copyFileSync(src, dst);
  }
}

/**
 * Corre un comando en el sandbox y devuelve su veredicto, sin lanzar.
 *
 * Un sonda que lanza cuando el paso emulado falla no es sonda: es un script que
 * se para en el primer dato interesante y deja al que lo lee sin el `RC`. Se
 * captura el fallo y se devuelve el codigo, que es lo que hay que mirar.
 *
 * @returns {{codigo: number, salida: string, error: string}}
 */
export function correr(cwd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  try {
    const salida = execFileSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer,
    });

    return { codigo: 0, salida, error: '' };
  } catch (exc) {
    return {
      codigo: typeof exc.status === 'number' ? exc.status : 1,
      salida: String(exc.stdout ?? ''),
      error: String(exc.stderr ?? ''),
    };
  }
}

