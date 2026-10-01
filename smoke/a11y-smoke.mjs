#!/usr/bin/env node
/**
 * ABD ARIA smoke — abre los componentes compartidos en CHROMIUM REAL y comprueba
 * el árbol de accesibilidad, no los atributos. Es la mitad que jsdom no puede dar:
 * que el rol, el nombre, la descripción y el estado lleguen de verdad al motor.
 *
 * Por qué no hay Playwright como DEPENDENCIA: la familia no declara
 * dependencias de navegador y esto no añade ninguna. Habla el protocolo
 * DevTools (CDP) a pelo con `fetch` y `WebSocket` nativos de Node, y lanza el
 * Chrome/Edge/Chromium que ya esté en la máquina (o el que diga CHROME_PATH).
 *
 * Que se llegue a usar el binario de Playwright NO contradice lo de arriba: no
 * se importa `playwright` ni se le pide que lance nada, solo se busca su Chromium
 * YA DESCARGADO en la cache que deja `playwright install`. El motor sigue siendo
 * el de este fichero; el navegador es un dato de entrada, como lo era antes.
 *
 * Uso:
 *   node smoke/a11y-smoke.mjs                  # casos + aserciones (exit 1 si fallan)
 *   node smoke/a11y-smoke.mjs --dump           # enseña DOM vs árbol AX de cada caso
 *   node smoke/a11y-smoke.mjs --dump --raw     # + nodo crudo y el árbol completo
 *   node smoke/a11y-smoke.mjs --page smoke/a11y-probe.html --dump
 *
 * Variables: CHROME_PATH (binario), SMOKE_ROOT (raíz del paquete), SMOKE_PORT,
 * PLAYWRIGHT_BROWSERS_PATH (cache de navegadores de Playwright, si se movió).
 *
 * `--resolve-chrome` imprime el binario encontrado y sale, sin lanzar nada: es
 * lo que usa el workflow para exportarlo a CHROME_PATH, de modo que la puerta
 * que decide cuál es la MISMA que se ejecuta en local.
 *
 * LÍMITE, dicho claro: esto lee el árbol AX del motor, que es la materia prima de
 * lo que anuncia un lector, pero no es el lector. Lo que aquí no aparezca no se
 * puede dar por anunciado; las sondas (`a11y-probe.html`) existen justo para eso.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.SMOKE_ROOT ?? join(SCRIPT_DIR, '..'));
const PORT = Number(process.env.SMOKE_PORT ?? 8932);

/* ── CLI ──────────────────────────────────────────────────────────────────── */

function argValue (flag, fallback)
{
    const index = process.argv.indexOf(flag);

    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const DUMP = process.argv.includes('--dump');
const RAW = process.argv.includes('--raw');
const PAGE = argValue('--page', 'smoke/a11y-cases.html');
const RESOLVE_ONLY = process.argv.includes('--resolve-chrome');

/* ── Chromium ─────────────────────────────────────────────────────────────── */

/**
 * Chromium de la cache de Playwright, si esta descargado.
 *
 * NO se importa playwright: se leen las carpetas que deja `playwright install`.
 * La cache guarda una carpeta POR VERSION (`chromium-1194`,
 * `chromium_headless_shell-1194`, ...), asi que se recorren y se ordenan al
 * reves para coger la mas alta, que es la que se acaba de instalar. Se cogen las
 * dos familias porque el `headless_shell` es la que usa el modo headless moderno
 * y `chromium` la completa; con cualquiera de las dos el smoke habla CDP igual.
 */
function findPlaywrightChrome ()
{
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH
        ?? (process.platform === 'win32'
            ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
            : process.platform === 'darwin'
                ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
                : join(homedir(), '.cache', 'ms-playwright'));

    if (!existsSync(root))
        return null;

    const relative = [
        ['chrome-linux', 'chrome'],
        ['chrome-linux', 'headless_shell'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
        ['chrome-win', 'chrome.exe'],
        ['chrome-win', 'headless_shell.exe'],
    ];

    let folders;

    try
    {
        folders = readdirSync(root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory()
                && /^(chromium|chromium_headless_shell)-/.test(entry.name))
            .map((entry) => entry.name)
            .sort()
            .reverse();
    }
    catch
    {
        return null;
    }

    for (const folder of folders)
    {
        for (const parts of relative)
        {
            const path = join(root, folder, ...parts);

            if (existsSync(path))
                return path;
        }
    }

    return null;
}

function findChrome ()
{
    // El orden es deliberado: primero lo que dijo alguien (CHROME_PATH), luego
    // los navegadores del sistema en sus rutas de siempre, y al final la cache
    // de Playwright. Este ultimo no sube de puesto a proposito — en local gana
    // el Chrome que ya tiene el usuario, que es el que se esta probando— y en
    // CI casi nunca compite con nadie, porque el workflow exporta CHROME_PATH y
    // por tanto entra por la primera linea.
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    return candidates.find((path) => existsSync(path)) ?? findPlaywrightChrome();
}

/** Mata el árbol del proceso: un navegador que se resiste no debe colgar el test. */
function killTree (child)
{
    if (child == null || child.exitCode !== null)
        return;

    try
    {
        if (process.platform === 'win32')
            spawn('taskkill', ['/pid', `${child.pid}`, '/T', '/F'], { stdio: 'ignore' });
        else
            child.kill('SIGKILL');
    }
    catch
    {
        // sin ruido: el resultado del test manda
    }
}

/** Chrome elige puerto y anuncia el endpoint por stdout/stderr. */
function readDevToolsUrl (child, timeoutMs = 20000)
{
    return new Promise((resolveUrl, rejectUrl) =>
    {
        const timer = setTimeout(
            () => rejectUrl(new Error('chrome: sin endpoint DevTools (timeout)')), timeoutMs);

        const onData = (chunk) =>
        {
            const match = /ws:\/\/[^\s]+/.exec(chunk.toString());

            if (match)
            {
                clearTimeout(timer);
                resolveUrl(match[0]);
            }
        };

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);

        child.once('exit', (code) =>
        {
            clearTimeout(timer);
            rejectUrl(new Error(`chrome termino antes de tiempo (exit ${code})`));
        });
    });
}

async function waitForHttp (url, timeoutMs = 10000)
{
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline)
    {
        try
        {
            // Cualquier respuesta (404 incluido) significa "ya escucha": aquí solo
            // se espera al servidor, no a que la ruta exista.
            await fetch(url, { method: 'GET' });
            return true;
        }
        catch
        {
            // el servidor aún no escucha
        }

        await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error(`no responde: ${url}`);
}

/* ── Cliente CDP mínimo ───────────────────────────────────────────────────── */

function connect (wsUrl)
{
    return new Promise((resolveConnection, rejectConnection) =>
    {
        const socket = new WebSocket(wsUrl);
        const pending = new Map();
        const listeners = new Map();
        let nextId = 1;

        socket.addEventListener('error', () => rejectConnection(new Error('websocket CDP: error')));

        socket.addEventListener('open', () =>
        {
            resolveConnection({
                send (method, params = {})
                {
                    const id = nextId += 1;

                    return new Promise((resolveSend, rejectSend) =>
                    {
                        pending.set(id, { resolveSend, rejectSend });
                        socket.send(JSON.stringify({ id, method, params }));
                    });
                },
                once (event, timeoutMs = 15000)
                {
                    return new Promise((resolveEvent, rejectEvent) =>
                    {
                        const timer = setTimeout(
                            () => rejectEvent(new Error(`CDP: sin ${event} (timeout)`)), timeoutMs);

                        listeners.set(event, (params) =>
                        {
                            clearTimeout(timer);
                            listeners.delete(event);
                            resolveEvent(params);
                        });
                    });
                },
                close: () => socket.close(),
            });
        });

        socket.addEventListener('message', (event) =>
        {
            const message = JSON.parse(event.data);

            if (message.id != null && pending.has(message.id))
            {
                const { resolveSend, rejectSend } = pending.get(message.id);
                pending.delete(message.id);

                if (message.error)
                    rejectSend(new Error(`${message.error.message} (${message.error.code})`));
                else
                    resolveSend(message.result);

                return;
            }

            const listener = message.method ? listeners.get(message.method) : null;

            if (listener)
                listener(message.params);
        });
    });
}

/* ── Lectura del árbol AX ─────────────────────────────────────────────────── */

const AX_PROPERTIES = [
    'disabled', 'checked', 'pressed', 'modal', 'live', 'orientation',
    'valuemin', 'valuemax', 'valuetext', 'roledescription', 'required', 'readonly',
];

function axProperty (node, name)
{
    const found = (node.properties ?? []).find((property) => property.name === name);

    return found ? found.value?.value : undefined;
}

function axText (field)
{
    return field?.value ?? '';
}

/** Primera entrada no ignorada del subárbol AX de un nodo del DOM. */
function firstRealNode (nodes)
{
    return (nodes ?? []).find((node) => ! node.ignored && node.role?.value !== 'none') ?? null;
}

function describeAx (node)
{
    if (node == null)
        return '(sin nodo accesible)';

    const parts = [
        `role=${node.role?.value}`,
        `name="${axText(node.name)}"`,
        `value="${axText(node.value)}"`,
        `description="${axText(node.description)}"`,
    ];

    for (const name of AX_PROPERTIES)
    {
        const value = axProperty(node, name);

        if (value !== undefined && value !== false)
            parts.push(`${name}=${value}`);
    }

    return parts.join(' ');
}

/* ── Los casos y lo que se espera del árbol ───────────────────────────────── */

/**
 * Cada caso ata un selector del DOM a lo que Chromium TIENE que exponer. Solo se
 * afirma lo comprobado: rol, nombre (subcadena sin distinguir caja, porque el CSS
 * pone los rótulos en mayúsculas y el motor nombra con el texto PINTADO), valor,
 * descripción y estados.
 *
 * `aria-valuetext` NO se afirma: en este motor el árbol AX no lo lleva (el valor
 * sale numérico). Está documentado y reproducible en `a11y-probe.html`; ver el
 * bloque de sondas.
 */
const CHECKS = [
    {
        label: 'NumberBox: el campo es un spinbutton con su rango',
        selector: '[data-case="numberbox"] .abd-numberbox__field',
        role: 'spinbutton',
        nameIncludes: 'master bpm',
        value: '30',
        properties: { valuemin: 20, valuemax: 400 },
    },
    {
        label: 'NumberBox: los botones nombran el parámetro al que pertenecen',
        selector: '[data-case="numberbox"] .abd-numberbox__btn',
        role: 'button',
        nameIncludes: 'master bpm: decrease',
    },
    {
        label: 'Segmented divergente: el radio vetado va checked Y disabled',
        selector: '[data-case="segmented-divergent"] .abd-segmented__segment[aria-checked="true"]',
        role: 'radio',
        properties: { checked: true, disabled: true },
    },
    {
        label: 'Segmented divergente: el motivo del veto es la DESCRIPCIÓN del radio',
        selector: '[data-case="segmented-divergent"] .abd-segmented__segment[aria-checked="true"]',
        role: 'radio',
        description: 'Requiere el motor Neurotik',
    },
    {
        label: 'Segmented: el grupo es un radiogroup nombrado y sin semántica de valor',
        selector: '[data-case="segmented"] .abd-segmented__group',
        role: 'radiogroup',
        nameIncludes: 'wave',
        noProperty: ['valuetext', 'valuemin', 'valuemax'],
    },
    {
        label: 'Select: combobox nombrado que expone su propio valor',
        selector: '[data-case="select"] .abd-select__field',
        role: 'combobox',
        nameIncludes: 'mode',
        value: 'Off',
        noProperty: ['valuetext'],
    },
    {
        // Dos mitades del patron en una sola linea del arbol: el motivo llega por
        // la DESCRIPCION y no ensucia el NOMBRE (medido: la nota vive fuera del
        // option, dentro se tragaria en el nombre). El title ya no existe.
        label: 'Select vetado: el motivo es la DESCRIPCION del option, sin tocar el nombre',
        selector: '[data-case="select-veto"] option[aria-describedby]',
        role: 'option',
        name: 'Pitch Quantize',
        description: 'Requiere el motor Neurotik',
        properties: { disabled: true },
    },
    {
        // Paridad con Segmented en el caso divergente: la nota tiene que llegar por
        // el CAMPO, no solo por el <option> (que no recibe foco). Medido antes del
        // cambio: el combobox soltaba description="".
        label: 'Select divergente: el motivo del valor vetado llega al campo',
        selector: '[data-case="select-veto-divergent"] .abd-select__field',
        role: 'combobox',
        nameIncludes: 'destination',
        value: 'Pitch Quantize',
        description: 'Requiere el motor Neurotik',
    },
    {
        label: 'Knob: slider con nombre, orientación y rango',
        selector: '[data-case="knob"] [role="slider"]',
        role: 'slider',
        nameIncludes: 'cutoff',
        properties: { orientation: 'horizontal', valuemin: 0, valuemax: 1 },
    },
    {
        label: 'Slider vertical: el rol declara su orientación',
        selector: '[data-case="slider-vertical"] [role="slider"]',
        role: 'slider',
        properties: { orientation: 'vertical' },
    },
    {
        label: 'XYPad: el pad es un slider con nombre',
        selector: '[data-case="xypad"] [role="slider"]',
        role: 'slider',
        nameIncludes: 'morph',
    },
    {
        label: 'Wheel: el rango nativo es un slider con nombre',
        selector: '[data-case="wheel"] input[type="range"]',
        role: 'slider',
        nameIncludes: 'pitch bend',
    },
    {
        // El contenedor traia contenido previo: antes la rueda reventaba al
        // montar (el harness lo cazaba como error de montaje, no como selector).
        label: 'Wheel con contenido previo: la rueda se pinta y se anuncia igual',
        selector: '[data-case="wheel-dirty"] input[type="range"]',
        role: 'slider',
        nameIncludes: 'pitch bend',
    },
    {
        label: 'FilmstripFader: slider vertical con nombre',
        selector: '[data-case="filmstrip"] [role="slider"]',
        role: 'slider',
        nameIncludes: 'cutoff',
        properties: { orientation: 'vertical' },
    },
    {
        label: 'Toggle: el botón expone su estado pressed',
        selector: '[data-case="toggle"] button',
        role: 'button',
        nameIncludes: 'sync',
        properties: { pressed: true },
    },
    {
        label: 'Drawer: el cajón es un dialog modal con nombre',
        // El cajón cuelga del <body> (position: fixed), no de su sección.
        selector: '[data-drawer="smoke-drawer"]',
        role: 'dialog',
        name: 'MATRIZ',
        properties: { modal: true },
    },
    {
        label: 'LcdScreen: la pantalla es una live region cortés',
        selector: '[data-case="lcd"] [role="status"]',
        role: 'status',
        properties: { live: 'polite' },
    },
    {
        label: 'ThemeSwitcher: el grupo de botones tiene rol propio y nombre',
        selector: '[data-case="theme-buttons"] .abd-theme-switcher',
        role: 'group',
        name: 'Theme',
    },
    {
        label: 'ThemeSwitcher: la variante select es un combobox nombrado',
        selector: '[data-case="theme-select"] .abd-theme-switcher',
        role: 'combobox',
        name: 'Theme',
    },
];

/* ── Sondas ───────────────────────────────────────────────────────────────── */

/**
 * Sondas: no afirman nada, solo enseñan lo que hace el motor con un atributo.
 * Salen en `--dump` (nunca en la pasada de aserciones) y son la calibración del
 * harness: si un navegador cambia de criterio, la sonda lo dice antes que una
 * aserción mal puesta. Ver `smoke/a11y-probe.html`.
 */
const PROBES = [
    { label: 'Sonda: div[role=slider] con aria-valuetext', selector: '[data-probe="aria-slider"]' },
    { label: 'Sonda: input[type=range] con aria-valuetext', selector: '[data-probe="native-range"]' },
    { label: 'Sonda: div[role=spinbutton] con aria-valuetext', selector: '[data-probe="spinbutton-div"]' },
    { label: 'Sonda: <option> normal (control)', selector: '[data-probe="option-plain"]' },
    { label: 'Sonda: <option> con title', selector: '[data-probe="option-title"]' },
    { label: 'Sonda: <option> con aria-describedby (fuera)', selector: '[data-probe="option-describedby"]' },
    { label: 'Sonda: <option> con aria-describedby (dentro)', selector: '[data-probe="option-inside"]' },
    { label: 'Sonda: <option> con el motivo en su texto', selector: '[data-probe="option-text"]' },
];

/* ── Comparación ──────────────────────────────────────────────────────────── */

function checkOne (node, check)
{
    const problems = [];

    if (node == null)
        return [`${check.label}\n    sin nodo accesible para ${check.selector}`];

    if (check.role && node.role?.value !== check.role)
        problems.push(`role esperado "${check.role}", expuesto "${node.role?.value}"`);

    if (check.name !== undefined && axText(node.name) !== check.name)
        problems.push(`name esperado "${check.name}", expuesto "${axText(node.name)}"`);

    if (check.nameIncludes !== undefined
        && ! axText(node.name).toLowerCase().includes(check.nameIncludes.toLowerCase()))
    {
        problems.push(`name deberia contener "${check.nameIncludes}", expuesto "${axText(node.name)}"`);
    }

    if (check.value !== undefined && String(axText(node.value)) !== String(check.value))
        problems.push(`value esperado "${check.value}", expuesto "${axText(node.value)}"`);

    if (check.description !== undefined && axText(node.description) !== check.description)
        problems.push(`description esperada "${check.description}", expuesta "${axText(node.description)}"`);

    for (const [name, expected] of Object.entries(check.properties ?? {}))
    {
        const actual = axProperty(node, name);

        if (actual === undefined)
        {
            problems.push(`propiedad ${name} no expuesta (esperada ${expected})`);
            continue;
        }

        // Los valores llegan tipados (boolean, token, number, string): comparar
        // como texto evita pelearse con el tipo - `checked` y `pressed` son
        // tokens ("true"), mientras que `disabled` y `modal` son booleanos.
        if (String(actual) !== String(expected))
            problems.push(`propiedad ${name} esperada ${expected}, expuesta ${actual}`);
    }

    for (const name of check.noProperty ?? [])
    {
        const actual = axProperty(node, name);

        if (actual !== undefined)
            problems.push(`propiedad ${name} no deberia existir (expuesta ${actual})`);
    }

    return problems.map((problem) => `${check.label}\n    ${problem}`);
}

/* ── Runner ───────────────────────────────────────────────────────────────── */

async function main ()
{
    // `--resolve-chrome` va DELANTE del guard de Node, y a proposito: es una
    // pregunta de disco (que binario hay en esta maquina) y no deberia depender
    // de la version de Node ni de que el CDP funcione. El workflow lo llama en un
    // paso propio, y si aqui exigiera Node 22 el fallo seria "no encuentro un
    // Chromium" cuando el problema es otro, que es la confusion que se paga
    // primero en un log de CI.
    if (RESOLVE_ONLY)
    {
        const resolved = findChrome();

        if (resolved == null)
        {
            console.error('No encuentro ningun Chromium, ni del sistema ni en la cache de Playwright.');
            console.error('El workflow lo baja antes con: pnpm dlx playwright@1.63.0 install --with-deps chromium');
            return 3;
        }

        console.log(resolved);
        return 0;
    }

    // El `WebSocket` de aqui es el GLOBAL de Node, no una importacion: este
    // script no declara dependencias de navegador a proposito. Ese global llego
    // en Node 22, y en el 20 no existe, con lo que el fallo era un
    // `ReferenceError` que no decia nada del Node que hacia falta. Se comprueba
    // aqui para que el mensaje lo diga.
    if (typeof WebSocket === 'undefined')
    {
        console.error('El smoke ARIA necesita el WebSocket global de Node, que llego en la 22.');
        console.error(`Esta corriendo con Node ${process.version}: sube el workflow a 22 o mas.`);
        return 2;
    }

    const chromePath = findChrome();

    if (chromePath == null)
    {
        console.error('No encuentro ningun Chromium, ni del sistema ni en la cache de Playwright.');
        console.error('Tres formas de arreglarlo, de mas fuerte a mas debil:');
        console.error('  1. Descargarlo con Playwright:  pnpm dlx playwright install chromium');
        console.error('     (el smoke lo encuentra solo en ~/.cache/ms-playwright, sin dependencia).');
        console.error('  2. Apuntar al binario:           CHROME_PATH=/ruta/al/chrome pnpm run smoke:a11y');
        console.error('  3. Instalar el del sistema:      sudo apt-get install -y chromium');
        return 2;
    }

    const profile = mkdtempSync(join(tmpdir(), 'abd-a11y-smoke-'));
    const server = spawn(process.execPath, ['serve-demo.mjs', `${PORT}`], {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'pipe'],
    });

    let browser = null;
    let connection = null;

    try
    {
        await waitForHttp(`http://127.0.0.1:${PORT}/`);

        const flags = [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-background-networking',
            '--hide-scrollbars',
            '--mute-audio',
            // Puerto 0 = Chrome elige uno libre y lo anuncia: así no se pelea con
            // el Chrome del usuario ni con un devtools abierto.
            '--remote-debugging-port=0',
            `--user-data-dir=${profile}`,
        ];

        if (process.platform !== 'win32')
            flags.push('--no-sandbox');

        browser = spawn(chromePath, [...flags, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });

        const wsUrl = await readDevToolsUrl(browser);
        const endpoint = new URL(wsUrl);
        const httpBase = `http://${endpoint.host}`;

        const version = await (await fetch(`${httpBase}/json/version`)).json();
        const list = await (await fetch(`${httpBase}/json/list`)).json();
        const page = list.find((target) => target.type === 'page');

        if (page == null)
            throw new Error('no hay pestaña donde auditar');

        connection = await connect(page.webSocketDebuggerUrl);

        await connection.send('Page.enable');
        await connection.send('DOM.enable');
        await connection.send('Accessibility.enable');
        await connection.send('Runtime.enable');

        const loaded = connection.once('Page.loadEventFired', 20000);
        await connection.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${PAGE}` });
        await loaded;

        // Un respiro para lo que se pinta fuera del load (rAF, skins, faders).
        await new Promise((r) => setTimeout(r, 250));

        const { root } = await connection.send('DOM.getDocument', { depth: 1 });

        const evaluate = async (expression) =>
        {
            const { result } = await connection.send('Runtime.evaluate', { expression, returnByValue: true });

            return result.value;
        };

        const axOf = async (selector) =>
        {
            const { nodeId } = await connection.send('DOM.querySelector', { nodeId: root.nodeId, selector });

            if (! nodeId)
                return null;

            const { nodes } = await connection.send('Accessibility.queryAXTree', { nodeId });

            return firstRealNode(nodes);
        };

        const domAttributesOf = async (selector) => evaluate(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (element == null) return '(sin nodo en el DOM)';
            const names = ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow',
                'aria-valuetext', 'aria-checked', 'aria-disabled', 'aria-describedby'];
            return JSON.stringify(Object.fromEntries(
                names.filter((name) => element.hasAttribute(name))
                    .map((name) => [name, element.getAttribute(name)])));
        })()`);

        /* Diagnóstico: distingue "la página no cargó" de "el selector no casa". */
        const ready = await evaluate('document.documentElement.dataset.smokeReady ?? ""');
        const caseCount = await evaluate('document.querySelectorAll("[data-case], [data-probe]").length');
        const pageErrors = JSON.parse(await evaluate('JSON.stringify(window.__smokeErrors ?? [])'));

        if (DUMP)
        {
            console.log(`\nÁrbol de accesibilidad — ${PAGE}`);
            console.log(`  motor: ${version.Browser}`);
            console.log(`  marcador listo: ${ready === 'true' ? 'si' : '(no aplica)'}`);
            console.log(`  casos/probes en el DOM: ${caseCount}`);
            console.log(`  errores al montar: ${pageErrors.length}`
                + `${pageErrors.length > 0 ? ` -> ${pageErrors.join(' | ')}` : ''}\n`);

            for (const check of [...CHECKS, ...PROBES])
            {
                const node = await axOf(check.selector);

                console.log(`${check.label}\n  ${check.selector}\n  DOM:  ${await domAttributesOf(check.selector)}`);
                console.log(`  AX:   ${describeAx(node)}`);
                console.log(RAW ? `  crudo: ${JSON.stringify(node)}\n` : '');
            }

            if (RAW)
            {
                // Segunda vía de lectura: el árbol completo. Si discrepa de
                // queryAXTree, el harness está leyendo por donde no toca.
                const { nodes } = await connection.send('Accessibility.getFullAXTree');
                const ranged = nodes
                    .filter((entry) => ['slider', 'spinbutton'].includes(entry.role?.value))
                    .map((entry) => ({
                        role: entry.role.value,
                        name: axText(entry.name),
                        value: entry.value,
                        properties: (entry.properties ?? []).map(
                            (property) => `${property.name}=${JSON.stringify(property.value?.value)}`),
                    }));

                console.log(`getFullAXTree (nodos de rango): ${JSON.stringify(ranged, null, 2)}\n`);
            }

            return 0;
        }

        const failures = [];

        if (ready !== 'true')
            failures.push(`La pagina no marco data-smoke-ready (${PAGE}); casos en el DOM: ${caseCount}`);

        for (const error of pageErrors)
            failures.push(`Montaje: ${error}`);

        for (const check of CHECKS)
        {
            const problems = checkOne(await axOf(check.selector), check);

            if (problems.length > 0)
                failures.push(...problems);
            else
                console.log(`  \u2713 ${check.label}`);
        }

        if (failures.length > 0)
        {
            console.error(`\nSmoke ARIA en Chromium real — ${failures.length} fallo(s)`);
            console.error(`  motor: ${version.Browser}\n`);
            console.error(failures.map((failure) => `  \u2717 ${failure}`).join('\n\n'));
            console.error('');
            return 1;
        }

        console.log(`\nSmoke ARIA en Chromium real: ${CHECKS.length} casos OK`);
        console.log(`  motor: ${version.Browser}`);
        console.log(`  pagina: ${PAGE}`);
        return 0;
    }
    finally
    {
        connection?.close();
        killTree(browser);
        killTree(server);
        await new Promise((r) => setTimeout(r, 200));

        try
        {
            rmSync(profile, { recursive: true, force: true });
        }
        catch
        {
            // El perfil temporal puede quedar bloqueado un instante; no importa.
        }
    }
}

process.exit(await main());
