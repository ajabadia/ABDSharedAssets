/**
 * Casos del smoke ARIA — lo que se monta en Chromium real.
 *
 * Cada sección lleva `data-case="<nombre>"`, la llave que usa el smoke test
 * (smoke/a11y-smoke.mjs) para atar un selector del DOM a lo que se espera del
 * árbol de accesibilidad. Los estados son los que importan y los que jsdom solo
 * puede mirar de refilón: valor formateado de verdad, opción vetada con motivo,
 * pantalla viva, cajón modal.
 *
 * Un control que revienta al montarse no debe esconder a los demás: cada caso se
 * monta en su propio try/catch y el error queda en `window.__smokeErrors`, que el
 * smoke imprime y trata como fallo. Al final se marca `data-smoke-ready`, para
 * que el smoke sepa distinguir "la página no cargó" de "el selector no casa".
 */

import {
    FilmstripFader, Knob, NumberBox, Select, Segmented, Slider, ThemeSwitcher, Toggle,
    Wheel, XYPad, createDrawer, createLcdPanel,
} from '../components/index.js';

const root = document.getElementById('cases');
const errors = [];

window.__smokeErrors = errors;

function section (name, title)
{
    const host = document.createElement('section');
    host.dataset.case = name;

    const heading = document.createElement('h2');
    heading.textContent = title;

    host.appendChild(heading);
    root.appendChild(host);

    return host;
}

/** Monta un caso; si revienta, lo apunta y sigue con el resto. */
function mount (name, title, build)
{
    const host = section(name, title);

    try
    {
        build(host);
    }
    catch (error)
    {
        errors.push(`${name}: ${error.message}`);
    }

    return host;
}

const MENU = [
    { label: 'GLOBAL', sub: [{ label: 'MASTER VOL', paramId: 'masterLevel' }] },
    { label: 'PANIC', type: 'action' },
];

/* ── Controles de valor ───────────────────────────────────────────────────── */

mount('knob', 'Knob', (host) => new Knob(host, {
    id: 'smoke-knob',
    label: 'Cutoff',
    value: 0.5,
    format: (v) => `${Math.round(v * 100)}%`,
}));

mount('select', 'Select', (host) => new Select(host, {
    id: 'smoke-select',
    label: 'Mode',
    options: ['Off', 'On'],
}));

// El veto lo lleva el FLAG de la entrada (sin lista ni spec): la ruta que el
// control documentaba y no aplicaba. El caso divergente de abajo cubre la del spec.
mount('select-veto', 'Select con una opcion vetada', (host) => new Select(host, {
    id: 'smoke-select-veto',
    label: 'Destination',
    value: 0,
    options: ['Off', { label: 'Pitch Quantize', disabled: true, note: 'Requiere el motor Neurotik' }],
}));

mount('select-veto-divergent', 'Select con el valor en una opcion vetada', (host) => new Select(host, {
    id: 'smoke-select-veto-divergent',
    label: 'Destination',
    value: 1,
    options: ['Off', { label: 'Pitch Quantize', note: 'Requiere el motor Neurotik' }],
    disabled: [1],
}));

mount('slider-vertical', 'Slider vertical', (host) => new Slider(host, {
    id: 'smoke-slider',
    label: 'Level',
    orientation: 'vertical',
    value: 0.25,
}));

mount('xypad', 'XYPad', (host) => new XYPad(host, { id: 'smoke-xypad', label: 'Morph', x: 0.5, y: 0.5 }));

mount('numberbox', 'NumberBox', (host) => new NumberBox(host, {
    id: 'smoke-numberbox',
    label: 'Master BPM',
    min: 20,
    max: 400,
    value: 30,
    unit: 'bpm',
}));

mount('toggle', 'Toggle', (host) => new Toggle(host, { id: 'smoke-toggle', label: 'Sync', value: true }));

/* ── Selector segmentado: el divergente es el caso que interesa ───────────── */

mount('segmented', 'Segmented', (host) => new Segmented(host, {
    id: 'smoke-segmented',
    label: 'Wave',
    options: ['Saw', 'Sqr', 'Tri'],
}));

mount('segmented-divergent', 'Segmented con el valor en una opción vetada', (host) => new Segmented(host, {
    id: 'smoke-segmented-divergent',
    label: 'Engine',
    options: ['NEURONiK', { label: 'Neurotik', note: 'Requiere el motor Neurotik' }],
    value: 1,
    disabled: [1],
}));

/* ── Rueda, pantalla y cajón ──────────────────────────────────────────────── */

mount('wheel', 'Wheel', (host) =>
{
    // Un hueco por rueda: contenedor y rueda son 1:1.
    const slot = document.createElement('div');
    host.appendChild(slot);

    return new Wheel(slot, { type: 'pitch', spriteUrl: 'assets/bender.png' });
});

mount('wheel-dirty', 'Wheel en un contenedor con contenido previo', (host) =>
{
    // El caso que dejo reproducido el cuelgue: render() salia sin pintar si el
    // contenedor ya tenia hijos, asi que this.slider quedaba sin definir y
    // attachEvents reventaba despues. Aqui el contenedor trae contenido ajeno.
    const slot = document.createElement('div');
    slot.innerHTML = '<span>contenido previo</span>';
    host.appendChild(slot);

    return new Wheel(slot, { type: 'pitch', spriteUrl: 'assets/bender.png' });
});

mount('filmstrip', 'FilmstripFader', (host) => new FilmstripFader(host, {
    spriteUrl: 'assets/bender.png',
    label: 'Cutoff',
}));

mount('lcd', 'LCD', (host) => createLcdPanel(host, { menu: MENU, widthChars: 16 }));

mount('drawer', 'Drawer', () =>
{
    // El cajón cuelga del <body> (position: fixed), no de su sección.
    createDrawer({ id: 'smoke-drawer', title: 'MATRIZ', badge: '4 RUTAS' }).open();
});

/* ── Selector de tema (un caso por variante) ──────────────────────────────── */

const THEMES = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
];

mount('theme-buttons', 'ThemeSwitcher (botones)', (host) => new ThemeSwitcher(host, {
    root: document.documentElement,
    themes: THEMES,
}));

mount('theme-select', 'ThemeSwitcher (select)', (host) => new ThemeSwitcher(host, {
    root: document.documentElement,
    themes: THEMES,
    variant: 'select',
}));

document.documentElement.dataset.smokeReady = 'true';
document.documentElement.dataset.smokeErrorCount = String(errors.length);
