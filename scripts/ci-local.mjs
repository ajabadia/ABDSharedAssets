#!/usr/bin/env node
/**
 * EL CI DE ESTE PAQUETE, EN LOCAL. Monta el layout del monorepo y corre los
 * dieciocho pasos de los jobs `pines` y `audit` de `docs-audit.yml`, en orden y
 * con sus condiciones.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARA QUE
 *
 * Push y castigo. Este workflow se enteró tarde de todo lo que se puede ver sin
 * subir nada: una cabecera de hermano que se movio, un contrato que se quedo
 * desfasado, un smoke que ya no encuentra navegador. Cada uno de esos fallos se
 * pudo haber visto en el arbol de trabajo, y en su lugar se vio en el boton rojo
 * y en la sesion de otro hilo esperando al CI.
 *
 * Esto NO es un emulador de Actions. Es el mismo job, en otra parte: mismos
 * comandos, mismo orden, mismo sitio de trabajo, misma variable de entorno. Lo
 * que se pierde esta escrito abajo, y es una lista corta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL LAYOUT, Y POR QUE ESTE Y NO OTRO
 *
 * Los generadores calculan la raiz asi:
 *
 *     HERE = dirname(abspath(__file__))        # <paquete>/scripts
 *     ROOT = dirname(dirname(HERE))            # la CARPETA HERMANA
 *
 * y de ahi leen `<ROOT>/<repo>/<fichero>`. Por eso en CI este repo baja a
 * `ABDSharedAssets/` y los hermanos al mismo nivel, y por eso aqui se copia
 * tambien al mismo nivel: un arbol con `ABDSharedAssets` dentro de otro
 * `ABDSharedAssets` haria que los generadores miren donde no es y el preflight
 * saliera con un 2 que no es un contrato roto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DONDE SALE CADA HERMANO, Y QUE PASA SI FALTA
 *
 * Del `siblings.json` de este repo —el mismo fichero que leen
 * `fetch-missing-siblings.mjs` y el mismo que vigila `tests/siblingsPins.test.js`—
 * NO de una lista escrita aqui. Una copia de esa lista en este script seria una
 * tercera escritura del mismo dato, y la tercera es la que se desincroniza.
 *
 * De cada hermano se monta lo que el generador va a LEER, que es lo unico que
 * hace falta para el preflight: las cabeceras y los `.json` de la lista, no el
 * repo entero. Es lo que hace el script rápido y lo que evita clonar cuatro
 * repos que aqui no se usan para nada mas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE SCRIPT NO PUEDE COMPROBAR
 *
 *   - Los `actions/checkout`: aqui no hay red ni refs de pull request, y el
 *     workflow fija SHAs que este script copia tal cual. Un fallo de checkout es
 *     un problema del runner, no del repositorio.
 *   - `pnpm/action-setup` y `setup-node`: se comprueba la version de la maquina
 *     y se AVISA si no es la fijada. Instalar toolchain es cosa del runner.
 *   - `setup-python`: igual, con la version.
 *   - `playwright install --with-deps`: el `--with-deps` instala librerias del
 *     sistema con permisos de administrador, y eso no se hace desde un script que
 *     se ejecuta sin querer. Se comprueba si ya hay un Chromium; si no, se dice
 *     como conseguirlo.
 *   - El presupuesto de los 20 minutos del job. En local no hay cola ni cold
 *     start, asi que el tiempo aqui no dice nada del tiempo de ahi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USO
 *
 *   node scripts/ci-local.mjs              # los dieciocho pasos
 *   node scripts/ci-local.mjs --list       # solo enumerarlos
 *   node scripts/ci-local.mjs --from 10    # desde el paso 10
 *   node scripts/ci-local.mjs --to 9       # hasta el 9
 *   node scripts/ci-local.mjs --only 7,10,16
 *   node scripts/ci-local.mjs --keep        # no borrar el lab al terminar
 *   node scripts/ci-local.mjs --lab <dir>  # otro sitio para el lab
 *
 * Sale con 0 si todos los pasos pedidos pasan, y con el numero del PRIMER paso
 * que falla si alguno falla: asi un `&&` encadenado para en el fallo y no sigue
 * con pasos que ya no pueden decir nada.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(SCRIPT_DIR, '..');
const WORKFLOW = join(PACKAGE, '.github', 'workflows', 'docs-audit.yml');
const SIBLINGS = join(PACKAGE, 'siblings.json');

/* ── CLI ──────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);

function flagValue (name)
{
    const at = argv.indexOf(name);

    return at >= 0 && argv[at + 1] ? argv[at + 1] : null;
}

const LIST_ONLY = argv.includes('--list');
const KEEP = argv.includes('--keep');
const FROM = Number(flagValue('--from') ?? 1);
const TO = Number(flagValue('--to') ?? Infinity);
// `Number('')` es 0 y `0` es un entero, asi que un `--only` AUSENTE se
// convertsia en `[0]`: lista no vacia, y el filtro de abajo no cogia ningun
// paso. El script entero corria y decia "los 0 pasos pedidos pasan", que es lo
// peor que puede decir un script de este tipo. De ahi el `raw === null`:
// `null` es "no me lo pasaron", `''` es "me lo pasaron vacio", y los dos son
// error del que lo llama, no una lista de un paso.
const onlyRaw = flagValue('--only');

const ONLY = onlyRaw === null
    ? []
    : onlyRaw.split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

if (onlyRaw !== null && ONLY.length === 0)
{
    sayRaw('ERROR: --only no ha recibido ningun numero de paso.');
    process.exit(2);
}

const LAB = resolve(flagValue('--lab') ?? join(tmpdir(), 'abd-ci-local'));

/* ── Salida ───────────────────────────────────────────────────────────────── */

// La consola de Windows va en cp1252 y revienta con un caracter fuera de ella.
// Todo lo que viene de un fichero ajeno (nombres de efecto, rutas de un hermano)
// se escapa antes de imprimirse, no al imprimir: escribir en el stream ya habria
// lanzado la excepcion.
/** Escapa lo que venga de un fichero ajeno: la consola de Windows va en cp1252
 *  y revienta con un caracter fuera de ella. Los caracteres del PROPIO script
 *  (el guion largo, la bola) se escriben tal cual. */
const seguro = (text) => String(text).replace(
    /[^\x20-\x7e\n]/g,
    (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`,
);

const out = (text = '') => process.stdout.write(`${text}\n`);
const sayRaw = (text) => out(text);

function rule (title)
{
    sayRaw(`\n\u001b[1m${'─'.repeat(72)}\u001b[0m`);
    sayRaw(`\u001b[1m${title}\u001b[0m`);
    sayRaw(`\u001b[1m${'─'.repeat(72)}\u001b[0m`);
}

/* ── El workflow, LEIDO ───────────────────────────────────────────────────── */

/**
 * Los pasos del job, en orden, tal cual estan en el YAML.
 *
 * Se lee como TEXTO y no con un parser de YAML, por la misma razon que
 * `tests/siblingsPins.test.js`: `js-yaml` no es dependencia de este paquete, y
 * para leer una lista de `- name:` con su `uses:` o su `run:` no hace falta mas.
 *
 * Lo que NO se hace aqui, y es deliberado: no se INTERPRETA el workflow para
 * decidir que ejecutar. Se ejecutan los pasos de la lista de abajo, que esta
 * escrita a mano, y `--list` la contrasta con el workflow para que se vea la
 * diferencia. Una lista interpretada del YAML seria mas elegante y no sabria
 * distinguir `if: always()` de un paso normal, que es justo lo que hace que el
 * fallback de los hermanos sirva de algo.
 */
const STEPS = [
    // Job `pines`: donde vive el dato de los SHA, y que se lea antes de gastar nada.
    { n: 1, name: 'Checkout ABDSharedAssets', kind: 'self' },
    { n: 2, name: 'Publicar los pines (la fuente es siblings.json)', kind: 'run', cmd: 'node scripts/pines-hermanos.mjs', githubOutput: true },
    { n: 3, name: 'Comprobar que cada checkout resuelve a un SHA, no a una rama', kind: 'run', cmd: 'node scripts/verificar-pines-workflow.mjs' },

    // Job `audit`: los quince pasos que corren los generadores y la suite.
    { n: 4, name: 'Checkout ABDSharedAssets', kind: 'self' },
    { n: 5, name: 'Setup pnpm', kind: 'tool', tool: 'pnpm' },
    { n: 6, name: 'Setup Node.js', kind: 'tool', tool: 'node' },
    { n: 7, name: 'Fetch missing siblings (pinned SHA)', kind: 'run', cmd: 'node scripts/fetch-missing-siblings.mjs' },
    { n: 8, name: 'Setup Python', kind: 'tool', tool: 'python' },
    { n: 9, name: 'Install dependencies', kind: 'run', cmd: 'pnpm install --frozen-lockfile' },
    { n: 10, name: 'Preflight: generated contracts are up to date', kind: 'run', cmd: 'pnpm run preflight' },
    { n: 11, name: 'S950: el contrato coincide con la tabla de C++', kind: 'run', cmd: 'pnpm run check:s950-contract\npnpm run check:s950-cal' },
    { n: 12, name: 'Hermanos: sus generadores producen lo que declaran', kind: 'run', cmd: 'node scripts/check-hermanos-generadores.mjs' },
    { n: 13, name: 'Hermanos: sus guardas de escritura no se han separado del motor', kind: 'run', cmd: 'node scripts/generar-guardas-escritura.mjs --check' },
    { n: 14, name: 'Audit documentation (13 rules)', kind: 'run', cmd: 'pnpm exec vitest run tests/documentedOptions.test.js' },
    { n: 15, name: 'Run full Vitest suite', kind: 'run', cmd: 'pnpm test' },
    { n: 16, name: 'Install Chromium for the ARIA smoke (Playwright cache)', kind: 'browser' },
    { n: 17, name: 'Export the Chromium path (and say which one it is)', kind: 'resolve-chrome' },
    { n: 18, name: 'Smoke ARIA on real Chromium', kind: 'run', cmd: 'pnpm run smoke:a11y', env: { CHROME_PATH: '$RESOLVED' } },
];

/**
 * Los nombres que declara el workflow, POR JOB, para comparar con la lista de
 * arriba.
 *
 * El workflow tiene tres jobs y este script emula dos. El que falta, `hermanos`,
 * es una matriz de checkouts: una pata por hermano, cada una en su propio runner,
 * comprobando que el SHA existe en GitHub y que el commit trae los ficheros que el
 * inventario dice. Eso NO se puede hacer en local sin red y sin una copia entera
 * del repo por hermano, asi que se excluye de la comparacion en vez de fingir que
 * se corre. Lo que el job `hermanos` comprueba, lo comprueba aqui el paso 7: los
 * hermanos estan al lado y se montan desde `siblings.json`, no desde una rama.
 *
 * @returns {Record<string, string[]>}  `job -> [nombre de paso, ...]`.
 */
function workflowStepsByJob ()
{
    const text = readFileSync(WORKFLOW, 'utf8');
    const jobs = {};
    let dentro = false;
    let actual = null;

    for (const linea of text.split('\n'))
    {
        if (/^jobs:\s*$/.test(linea))
        {
            dentro = true;
            continue;
        }

        if (!dentro)
            continue;

        const cabecera = /^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*$/.exec(linea);

        if (cabecera)
        {
            actual = cabecera[1];
            jobs[actual] = [];
            continue;
        }

        const paso = /^ {6}- name: (.+)$/.exec(linea);

        if (paso && actual !== null)
            jobs[actual].push(paso[1].trim().replace(/^["']|["']$/g, ''));
    }

    return jobs;
}

/** Los pasos del workflow que este script se compromete a correr. */
const JOBS_EMULADOS = ['pines', 'audit'];

// El rango se valida DESPUES de `STEPS`, no antes: el mensaje dice cuantos pasos hay
// y ese numero sale de la lista. Con la validacion antes, `--from 0` reventaba con
// un `ReferenceError` de la lista sin declarar en vez de con el error que el que lo
// escribio queria ver.
if (!Number.isInteger(FROM) || FROM < 1)
{
    sayRaw(`ERROR: --from ha de ser un numero de paso (1..${String(STEPS.length)}), no "${String(FROM)}".`);
    process.exit(2);
}

if (!(TO === Infinity || (Number.isInteger(TO) && TO >= 1)))
{
    sayRaw(`ERROR: --to ha de ser un numero de paso (1..${String(STEPS.length)}), no "${String(TO)}".`);
    process.exit(2);
}

/** La version que el workflow fija, leida del propio `with:`. */
function pinnedVersion (action, key)
{
    const text = readFileSync(WORKFLOW, 'utf8');
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(`uses: ${action}`));

    if (at < 0)
        return null;

    for (let i = at + 1; i < lines.length; i += 1)
    {
        if (/^\s*-\s+(name|uses):/.test(lines[i]))
            break;

        const match = lines[i].match(new RegExp(`${key}:\\s*['"]?([^'"\\s#]+)`));

        if (match != null)
            return match[1];
    }

    return null;
}

const SIBLING_LIST = JSON.parse(readFileSync(SIBLINGS, 'utf8')).hermanos;

/* ── Montaje del lab ──────────────────────────────────────────────────────── */

/**
 * Lanza un comando. `args` es OPCIONAL a proposito: con `shell: true` de
 * Windows, pasar un objeto donde va el array de argumentos no lanza error
 * ninguno — `spawnSync` lo ignora y el comando no llega a ejecutarse nunca.
 * El script diria "fallo" sin haber corrido nada, que es el peor fallo que
 * puede tener una herramienta cuyo trabajo es decir la verdad sobre el CI.
 *
 * Se distingue la forma de la llamada: un array es la lista de argumentos y
 * cualquier otra cosa es el objeto de opciones.
 */
function run (command, args = [], options = {})
{
    if (!Array.isArray(args))
    {
        options = args;
        args = [];
    }

    return spawnSync(command, args, {
        encoding: 'utf8',
        ...options,
    });
}

/**
 * Una linea de shell (`pnpm test`, `node scripts/x.mjs`), tal cual la escribe el
 * workflow. Se ejecuta con `shell: true` porque el comando lleva su propio
 * interprete delante, que es exactamente como lo ejecuta Actions.
 *
 * Y con `shell: true` NO se pasan argumentos aparte: Node concatena los
 * argumentos en vez de escaparlos (DEP0190), asi que un array ahi rompe el
 * comando en silencio. Por eso esta linea se pasa entera como primer argumento
 * y el segundo hueco se deja vacio.
 */
/**
 * El prefijo que antepone a los comandos que usan pnpm, para que usen la
 * version FIJADA y no la global de la maquina.
 *
 * Se lee del propio workflow, asi que si el pin se mueve, esto lo sigue sin
 * que nadie se acuerde de esta linea. Y si `corepack` no esta, se devuelve la
 * cadena vacia y se sigue con el pnpm global: mejor correr con la version
 * equivocada avisando que no correr.
 */
const PNPM_PIN = pinnedVersion('pnpm/action-setup', 'version');

let pnpmPrefix = 'pnpm';

if (PNPM_PIN != null)
{
    if (probeVersion('corepack') != null)
    {
        pnpmPrefix = `corepack pnpm@${PNPM_PIN}`;
    }
    else
    {
        sayRaw(`\u001b[33mAVISO\u001b[0m no hay corepack: los pasos usaran el pnpm GLOBAL,`);
        sayRaw(`       que puede no ser el ${PNPM_PIN} que fija el workflow.`);
    }
}

/** `pnpm test` -> `corepack pnpm@10.25.0 test`. */
function conPnpm (line)
{
    return line.replace(/^pnpm\b/, pnpmPrefix);
}

function execLine (line, options = {})
{
    return spawnSync(line, [], {
        stdio: 'inherit',
        shell: true,
        ...options,
    });
}

function announce (n, name, extra = '')
{
    const tag = `\u001b[1m[${String(n).padStart(2)}/${String(STEPS.length).padStart(2)}]\u001b[0m`;

    sayRaw(`${tag} ${name}${extra ? `  \u001b[2m${extra}\u001b[0m` : ''}`);
}

/** Monta sin anunciar: el montaje es precondicion, no un paso que se vea. */
function mountSelfQuiet ()
{
    try
    {
        return mountSelf();
    }
    catch
    {
        return false;
    }
}

/** Los cuatro hermanos, sin anunciar. El paso 7 vuelve a montarlos y lo dice, pero
 *  el lab tiene que estar montado ANTES del primer paso que lo necesite, o ese
 *  paso pasaria sin tener nada que mirar. */
function mountSiblingsQuiet ()
{
    for (const entry of SIBLING_LIST)
        mountSibling(entry);
}

/**
 * El arbol del lab: este paquete COPIADO (no enlazado) al mismo nivel que los
 * hermanos, que es el layout que calculan los generadores.
 *
 * Por que se copia y no se enlaza: los generadores escriben con `--check` fuera
 * de la nada y hay tests que tocan `node_modules`. Con un enlace, cualquiera de
 * las dos cosas tocaria el arbol de trabajo de verdad. El precio es el tiempo de
 * copia; el beneficio es que un paso no puede romper lo que se esta probando.
 */
function mountSelf ()
{
    const dst = join(LAB, 'ABDSharedAssets');

    rmSync(dst, { recursive: true, force: true });
    mkdirSync(dst, { recursive: true });

    // `cpSync` con filtro: `node_modules` pesa y se rehace en el paso 9, y
    // `.git` no hace falta para correr el job (el paso 7 no lo consulta).
    cpSync(PACKAGE, dst, {
        recursive: true,
        verbatimSymlinks: true,
        filter: (src) => {
            if (src === PACKAGE)
                return true;

            const rel = src.slice(PACKAGE.length + 1);
            const name = rel.split('\\')[0].split('/')[0];

            // `node_modules` se rehace en el paso 9, `temp` pesa y no se usa, y
            // `.git` no lo consulta el job.
            if (name === 'node_modules' || name === 'temp' || name === '.git')
                return false;

            // Un enlace simbolico NO se copia. En este paquete hay uno
            // (`abdbank`, que apunta a la WebUI de ABDBankManager) y sin esto
            // `cpSync` intenta resolverlo y revienta con EPERM en Windows: el
            // error dice "operation not permitted" sobre un fichero que no
            // tiene nada que ver con el job, que es la confusion mas cara que
            // puede dar este script.
            try
            {
                if (lstatSync(src).isSymbolicLink())
                    return false;
            }
            catch
            {
                return false;
            }

            return true;
        },
    });

    return dst;
}

/** Copia de un hermano, solo de los ficheros que el generador va a abrir. */
function mountSibling (entry)
{
    const source = resolve(PACKAGE, '..', entry.repo);

    if (!existsSync(source))
        return { ok: false, why: `no esta el repo ${entry.repo} al lado de este paquete` };

    const dst = join(LAB, entry.repo);
    const faltan = [];

    for (const file of entry.necesita)
    {
        const from = join(source, file);

        if (!existsSync(from))
        {
            faltan.push(file);
            continue;
        }

        const to = join(dst, file);

        mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to);
    }

    if (faltan.length > 0)
        return { ok: false, why: `a ${entry.repo} le faltan: ${faltan.join(', ')}` };

    return { ok: true, count: entry.necesita.length };
}

/* ── Pasos ────────────────────────────────────────────────────────────────── */

let resolvedChrome = null;
let firstFailure = null;

/** Lo que hizo CADA paso. El resumen se dibuja de ahi y no de comparar
 *  numeros: comparar numeros obliga a adivinar si un paso llego a correr, y
 *  aqui hay pasos que dependen del anterior y pueden no llegar. */
const resultados = new Map();

function record (n, ok)
{
    resultados.set(n, ok);

    if (!ok && firstFailure === null)
        firstFailure = n;

    return ok;
}

function stepSelf (step)
{
    const dst = mountSelf();

    announce(step.n, step.name, `-> ${relative(LAB, dst)}`);
    sayRaw('        (copiado del arbol de trabajo: incluye lo que no esta commiteado)');

    return record(step.n, existsSync(join(dst, 'package.json')));
}

function stepTool (step)
{
    const key = step.tool === 'pnpm' ? 'version' : 'node-version';
    const action = step.tool === 'python' ? null : (step.tool === 'pnpm' ? 'pnpm/action-setup' : 'actions/setup-node');
    const pinned = step.tool === 'python' ? '3.12' : pinnedVersion(action, key);

    announce(step.n, step.name);

    // Para pnpm lo que se pregunta es la version que se va a USAR de verdad, que
    // con corepack es la fijada y no la global. Preguntar por el `pnpm` del PATH
    // daria un numero que no es el que corre los pasos siguientes.
    const actual = step.tool === 'pnpm' ? PNPM_PIN : probeVersion(step.tool);

    if (actual == null)
    {
        sayRaw(`        \u001b[33mno se pudo preguntar por ${step.tool} en esta maquina\u001b[0m`);

        return record(step.n, true);
    }

    const coincide = pinned == null || matches(actual, pinned, step.tool);

    if (coincide)
    {
        sayRaw(`        ${step.tool} ${actual} \u001b[32m(coincide con lo fijado: ${pinned})\u001b[0m`);
    }
    else
    {
        // AVISO, NO FALLO. La maquina de desarrollo puede ir por delante de la
        // fijada y eso no dice nada de si el job pasara. Marcarse en rojo aqui
        // seria mentir: lo que no se puede es callarse.
        sayRaw(`        \u001b[33mAVISO\u001b[0m esta maquina tiene ${step.tool} ${actual}; el job fija ${pinned}`);
        sayRaw('               El job puede fallar donde esto pasa, y al reves.');
    }

    return record(step.n, true);
}

function probeVersion (tool)
{
    if (tool === 'node')
        return run('node', ['--version'])?.stdout?.trim().replace(/^v/, '') ?? null;
    if (tool === 'pnpm')
        // `pnpm` en Windows es un shim `.cmd`, y sin `shell` da ENOENT: no es
        // que falte, es que Node no sabe ejecutarlo solo.
        return run('pnpm --version', [], { shell: true })?.stdout?.trim() ?? null;
    if (tool === 'python')
        return run('python', ['--version'])?.stdout?.trim().replace(/^Python /, '') ?? null;
    if (tool === 'corepack')
        return run('corepack --version', [], { shell: true })?.stdout?.trim() ?? null;

    return null;
}

/** `22` casa con `22.23.3`; `10.25.0` casa consigo mismo. */
function matches (actual, pinned, tool)
{
    if (actual === pinned)
        return true;
    if (tool === 'pnpm' && pinned.split('.').length === 1)
        return actual.split('.')[0] === pinned;
    if (tool === 'node' && !/^\d+\.\d+\.\d+$/.test(pinned))
        return actual.split('.')[0] === pinned.split('.')[0];

    return false;
}

function stepRun (step)
{
    announce(step.n, step.name);

    const workdir = join(LAB, 'ABDSharedAssets');

    if (!existsSync(join(workdir, 'package.json')))
    {
        sayRaw(`        \u001b[31mno esta el lab en ${LAB}\u001b[0m`);

        return record(step.n, false);
    }

    const env = { ...process.env, CI: 'true' };

    // El paso de los pines escribe en `GITHUB_OUTPUT`, que en CI es un fichero que
    // el runner lee y convierte en outputs de job. Aqui se le da uno de mentira, en
    // el lab, y se imprime al final: lo que se ve en el log local es exactamente lo
    // que veria el runner, no un resumen inventado por el script.
    if (step.githubOutput === true)
    {
        env.GITHUB_OUTPUT = join(LAB, 'github_output.txt');

        rmSync(env.GITHUB_OUTPUT, { force: true });
    }

    if (step.env?.CHROME_PATH === '$RESOLVED')
    {
        if (resolvedChrome == null)
        {
            sayRaw('        \u001b[31msin CHROME_PATH: el paso 17 no se ejecuto\u001b[0m');

            return record(step.n, false);
        }

        env.CHROME_PATH = resolvedChrome;
        sayRaw(`        \u001b[2mCHROME_PATH=${resolvedChrome}\u001b[0m`);
    }

    const commands = step.cmd.split('\n');
    let ok = true;

    for (const command of commands)
    {
        const result = execLine(conPnpm(command), { cwd: workdir, env });

        if (result.status !== 0)
        {
            ok = false;
            break;
        }
    }

    if (ok && step.githubOutput === true && existsSync(env.GITHUB_OUTPUT))
    {
        const publicado = readFileSync(env.GITHUB_OUTPUT, 'utf8').trim();

        if (publicado !== '')
        {
            sayRaw('        \u001b[2mGITHUB_OUTPUT:\u001b[0m');

            for (const linea of publicado.split('\n'))
            {
                const [clave, ...resto] = linea.split('=');

                sayRaw(`          \u001b[2m${seguro(clave)}\u001b[0m=${seguro(resto.join('=').slice(0, 90))}`);
            }
        }
    }

    return record(step.n, ok);
}

function stepBrowser ()
{
    announce(15, 'Install Chromium for the ARIA smoke (Playwright cache)');

    // NO se instala. `--with-deps` necesita permisos de administrador del sistema
    // y un script que se ejecuta sin querer no debe hacer eso. Lo que se hace es
    // mirar si el paso 17 va a encontrar algo, que es la pregunta que de verdad
    // importa, y decir como conseguirlo si no.
    sayRaw('        \u001b[2men local NO se instala (--with-deps pide permisos de administrador)\u001b[0m');

    return record(15, true);
}

function stepResolveChrome ()
{
    announce(16, 'Export the Chromium path');

    const result = run('node', ['smoke/a11y-smoke.mjs', '--resolve-chrome'], {
        cwd: join(LAB, 'ABDSharedAssets'),
        env: { ...process.env, CI: 'true' },
        encoding: 'utf8',
    });

    const found = (result.stdout ?? '').trim().split('\n').pop()?.trim();

    if (result.status !== 0 || !found || found === 'null')
    {
        sayRaw(`        \u001b[33mningun Chromium. En CI lo baja el paso 16; en local, uno de:\u001b[0m`);
        sayRaw('          pnpm dlx playwright@1.63.0 install chromium');
        sayRaw('          CHROME_PATH=/ruta/al/chrome node scripts/ci-local.mjs');
        resolvedChrome = null;

        return record(16, false);
    }

    resolvedChrome = found;
    sayRaw(`        \u001b[32m${found}\u001b[0m`);

    return record(16, true);
}

function relative (from, to)
{
    return to.startsWith(from) ? to.slice(from.length + 1) : to;
}

/* ── Contraste con el workflow ────────────────────────────────────────────── */

/**
 * La lista de arriba esta escrita a mano, asi que puede quedarse vieja. Este
 * contraste es lo que evita que se quede: si el workflow gana o pierde un paso,
 * este script lo dice con el numero al lado en vez de seguir fingiendo que los
 * ejecuta todos.
 */
function checkAgainstWorkflow ()
{
    const porJob = workflowStepsByJob();
    const delWorkflow = JOBS_EMULADOS.flatMap((j) => porJob[j] ?? []);
    const mios = STEPS.map((s) => s.name);
    const diferencias = [];

    for (const name of delWorkflow)
    {
        if (!mios.includes(name))
            diferencias.push(`  solo en el workflow: ${seguro(name)}`);
    }

    for (const name of mios)
    {
        if (!delWorkflow.includes(name))
            diferencias.push(`  solo en este script: ${seguro(name)}`);
    }

    if (diferencias.length > 0)
    {
        sayRaw('\u001b[33mAVISO: la lista de pasos NO coincide con el workflow.\u001b[0m');
        for (const d of diferencias)
            sayRaw(d);
        sayRaw('        Si anadiste un paso al workflow, anadelo aqui tambien.');
        sayRaw('');
    }

    return diferencias.length === 0;
}

/* ── Programa ─────────────────────────────────────────────────────────────── */

const seleccionados = STEPS.filter((s) => {
    if (ONLY.length > 0)
        return ONLY.includes(s.n);

    return s.n >= FROM && s.n <= TO;
});

if (LIST_ONLY)
{
    rule('PASOS QUE CORRE ESTE SCRIPT');

    for (const step of STEPS)
    {
        const marca = seleccionados.includes(step) ? '·' : ' ';

        sayRaw(`${marca} ${String(step.n).padStart(2)}. ${seguro(step.name)}`);
    }

    sayRaw('');
    checkAgainstWorkflow();
    process.exit(0);
}

rule(`CI LOCAL — ${LAB}`);
sayRaw(`Pasos: ${seleccionados.map((s) => s.n).join(', ') || '(ninguno)'}`);
checkAgainstWorkflow();

// El lab se borra al PRINCIPIO y no al final, y es a proposito: si el script se
// muere a mitad, el siguiente arranque no se encuentra un arbol a medias que se
// tome por bueno, que daria un fallo sin relacion con el job. `--keep` existe
// para cuando se quiere mirar el arbol despues, no para saltarse la limpieza.
if (!KEEP)
    rmSync(join(LAB, 'ABDSharedAssets'), { recursive: true, force: true });

mkdirSync(LAB, { recursive: true });

const arrancado = Date.now();

// El montaje es una PRECONDICION, no un paso mas. Con `--only 11` los pasos
// 1..5 no se ejecutan, el lab no existe, y el paso 11 falla con un error de
// `spawn` que no dice nada del job. Asi que se monta siempre, aunque no se
// pidiera el paso 1.
// EL LAB COMPLETO SE MONTA SIEMPRE, pasos 1 a 5, se pidan o no. Montar solo el
// paso 1 (que es lo que habia) dejaba a los generadores sin `ABDSharedCode/` al
// lado, y el paso 12 decia "al dia" sin haber mirado nada: un check en verde
// que no ha comprobado, que es peor que no correr.
mountSelfQuiet();
mountSiblingsQuiet();

for (const step of seleccionados)
{
    try
    {
        if (step.kind === 'self')
            stepSelf(step);
        else if (step.kind === 'tool')
            stepTool(step);
        else if (step.kind === 'browser')
            stepBrowser();
        else if (step.kind === 'resolve-chrome')
            stepResolveChrome();
        else
            stepRun(step);
    }
    catch (error)
    {
        sayRaw(`        \u001b[31m${error.message}\u001b[0m`);
        record(step.n, false);
    }
}

const segundos = Math.round((Date.now() - arrancado) / 1000);

rule('RESUMEN');

for (const step of seleccionados)
{
    const n = String(step.n).padStart(2);
    const nombre = seguro(step.name);

    if (resultados.get(step.n) === true)
        sayRaw(`  [32m${n}.[0m ok   ${nombre}`);
    else if (resultados.get(step.n) === false)
        sayRaw(`  [31m${n}. FALLO[0m ${nombre}`);
    else
        sayRaw(`  [2m${n}. --  ${nombre}  (no llego a ejecutarse)[0m`);
}

sayRaw('');

if (firstFailure === null)
{
    sayRaw(`\u001b[32m\u001b[1mLos ${seleccionados.length} pasos pedidos pasan.\u001b[0m  (${segundos}s)`);
    sayRaw(`Lab en ${LAB}${KEEP ? '' : ' (se puede borrar)'}`);
    process.exit(0);
}

sayRaw(`\u001b[31m\u001b[1mFallo en el paso ${firstFailure}.\u001b[0m  (${segundos}s)`);
sayRaw(`Lab en ${LAB}, para mirarlo: ${KEEP ? '' : 'esta ahi hasta que lo borres'}`);
process.exit(firstFailure);
