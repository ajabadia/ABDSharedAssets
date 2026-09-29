/**
 * ARIA invariants — DÓNDE vive cada atributo ARIA (auditoría de familia).
 * =====================================================================
 *
 * La regla que fija este fichero: un atributo ARIA que NO es global solo
 * significa algo en un nodo cuyo ROL lo soporta. Escrito en un nodo sin rol (o
 * con el rol equivocado) es INERTE: el lector no anuncia nada, el ojo no ve
 * nada y un `expect` normal tampoco lo nota. Así llegó `aria-valuetext` a un
 * `<div>` sin rol (el wrapper del NumberBox) y al radiogroup del Segmented,
 * donde no le llegaba a nadie.
 *
 * Lo que hace la auditoría: recorre el DOM PINTADO de todo control que exporta
 * el barrel — en los estados que importan (con/sin nombre, divergente, vetado,
 * vertical, con glifos, con skin, mutado en caliente) — y contrasta cada
 * `aria-*` contra la tabla de roles de WAI-ARIA 1.2. El último test mantiene
 * honesto el catálogo: un control nuevo que no pase por aquí rompe la suite.
 *
 * Lo que NO cubre (dicho claro, para no vender más de lo que hay): un estado que
 * el catálogo no pinte, el comportamiento real de un lector concreto, y las
 * relaciones que apuntan a nodos mal montados (una `aria-labelledby` que no
 * resuelve) — eso son otras invariantes.
 */

import { describe, expect, it } from 'vitest';

import * as family from '../components/index.js';

import {
    EffectLEDButton, EnvelopePad, FilmstripFader, Knob, ModMatrix, NumberBox, PeakLED,
    Segmented,
    Select,
    SevenSegmentDisplay, SilverFilmstripKnob, Slider, TapeEchoVisual, ThemeSwitcher,
    Toggle, Wheel, XYPad,
    createDrawer, createEnvelopeCurve, createLcdPanel, createLcdScreen,
    enhanceRangeInputs, skinNames,
    WAVEFORM_GLYPHS, WAVEFORM_NAMES,
} from '../components/index.js';

/* ---------------------------------------------------------------------------
 * La tabla
 * ------------------------------------------------------------------------- */

/** Atributos globales: valen en cualquier elemento (WAI-ARIA 1.2, global states). */
const GLOBAL_ARIA = new Set([
    'aria-atomic', 'aria-busy', 'aria-controls', 'aria-current', 'aria-describedby',
    'aria-details', 'aria-disabled', 'aria-dropeffect', 'aria-errormessage',
    'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid',
    'aria-keyshortcuts', 'aria-label', 'aria-labelledby', 'aria-live', 'aria-owns',
    'aria-relevant', 'aria-roledescription',
]);

/** Atributos con rol: solo significan algo en los roles que los soportan. */
const ROLE_SCOPED_ARIA = {
    'aria-activedescendant': [
        'application', 'combobox', 'grid', 'group', 'listbox', 'menu', 'menubar',
        'radiogroup', 'searchbox', 'spinbutton', 'tablist', 'textbox', 'toolbar',
        'tree', 'treegrid',
    ],
    'aria-autocomplete': ['combobox', 'searchbox', 'textbox'],
    'aria-checked': [
        'checkbox', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio',
        'switch', 'treeitem',
    ],
    'aria-colcount': ['grid', 'table', 'treegrid'],
    'aria-colindex': ['cell', 'columnheader', 'gridcell', 'row', 'rowheader'],
    'aria-colspan': ['cell', 'columnheader', 'gridcell', 'rowheader'],
    'aria-expanded': [
        'application', 'button', 'checkbox', 'columnheader', 'combobox', 'gridcell',
        'link', 'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'row',
        'rowheader', 'switch', 'tab', 'treeitem',
    ],
    'aria-level': ['heading', 'listitem', 'row', 'treeitem'],
    'aria-modal': ['alertdialog', 'dialog'],
    'aria-multiline': ['searchbox', 'textbox'],
    'aria-multiselectable': ['grid', 'listbox', 'tablist', 'tree'],
    // La orientación se hereda por la familia de composites, así que aquí es
    // deliberadamente amplia: un falso fallo aquí valdría más que un acierto.
    'aria-orientation': [
        'combobox', 'grid', 'group', 'listbox', 'menu', 'menubar', 'radiogroup',
        'scrollbar', 'separator', 'slider', 'tablist', 'toolbar', 'tree', 'treegrid',
    ],
    'aria-placeholder': ['searchbox', 'textbox'],
    'aria-posinset': [
        'article', 'comment', 'listitem', 'menuitem', 'menuitemcheckbox',
        'menuitemradio', 'option', 'radio', 'row', 'tab', 'treeitem',
    ],
    'aria-pressed': ['button'],
    'aria-readonly': [
        'checkbox', 'columnheader', 'combobox', 'grid', 'gridcell', 'listbox',
        'radiogroup', 'rowheader', 'searchbox', 'slider', 'spinbutton', 'switch',
        'textbox',
    ],
    'aria-required': [
        'checkbox', 'combobox', 'gridcell', 'listbox', 'radiogroup', 'spinbutton',
        'textbox', 'tree',
    ],
    'aria-rowcount': ['grid', 'table', 'treegrid'],
    'aria-rowindex': ['cell', 'columnheader', 'gridcell', 'row', 'rowheader'],
    'aria-rowspan': ['cell', 'columnheader', 'gridcell', 'rowheader'],
    'aria-selected': [
        'columnheader', 'gridcell', 'option', 'row', 'rowheader', 'tab', 'treeitem',
    ],
    'aria-setsize': [
        'article', 'comment', 'listitem', 'menuitem', 'menuitemcheckbox',
        'menuitemradio', 'option', 'radio', 'row', 'tab', 'treeitem',
    ],
    'aria-sort': ['columnheader', 'rowheader'],
    'aria-valuemax': ['meter', 'progressbar', 'scrollbar', 'separator', 'slider', 'spinbutton'],
    'aria-valuemin': ['meter', 'progressbar', 'scrollbar', 'separator', 'slider', 'spinbutton'],
    'aria-valuenow': ['meter', 'progressbar', 'scrollbar', 'separator', 'slider', 'spinbutton'],
    'aria-valuetext': ['meter', 'progressbar', 'scrollbar', 'separator', 'slider', 'spinbutton'],
};

/**
 * Roles que NO se pueden nombrar (WAI-ARIA 1.2 §5.2.8.6): un `aria-label` ahí lo
 * descarta el navegador. `generic` es el rol de todo lo que no tiene rol — el
 * `<div>`/`<span>` pelado, que es exactamente donde acaba el nombre que nadie oye.
 */
const CANNOT_BE_NAMED = new Set(['generic', 'none', 'presentation']);

/** Rol implícito de los nativos que pinta la familia. */
const NATIVE_ROLES = {
    'a': 'link',
    'area': 'link',
    'aside': 'complementary',
    'button': 'button',
    'dialog': 'dialog',
    'footer': 'contentinfo',
    'form': 'form',
    'h1': 'heading',
    'h2': 'heading',
    'h3': 'heading',
    'h4': 'heading',
    'h5': 'heading',
    'h6': 'heading',
    'header': 'banner',
    'hr': 'separator',
    'li': 'listitem',
    'main': 'main',
    'meter': 'meter',
    'nav': 'navigation',
    'ol': 'list',
    'output': 'status',
    'progress': 'progressbar',
    'select': 'combobox',
    'svg': 'graphics-document',
    'table': 'table',
    'td': 'cell',
    'textarea': 'textbox',
    'th': 'columnheader',
    'tr': 'row',
    'ul': 'list',
};

/** Rol implícito de `<input>` según su `type`. */
const INPUT_ROLES = {
    'button': 'button',
    'checkbox': 'checkbox',
    'email': 'textbox',
    'image': 'button',
    'number': 'spinbutton',
    'radio': 'radio',
    'range': 'slider',
    'reset': 'button',
    'search': 'searchbox',
    'submit': 'button',
    'tel': 'textbox',
    'text': 'textbox',
    'url': 'textbox',
};

/* ---------------------------------------------------------------------------
 * El motor de la auditoría
 * ------------------------------------------------------------------------- */

/** Rol efectivo: el declarado, o el implícito del nativo, o `generic`. */
function effectiveRole (element)
{
    const declared = element.getAttribute('role');

    if (declared)
        return declared.trim().split(/\s+/)[0];

    const tag = element.tagName.toLowerCase();

    if (tag === 'input')
        return INPUT_ROLES[(element.getAttribute('type') ?? 'text').toLowerCase()] ?? 'generic';

    if (tag === 'a' || tag === 'area')
        return element.hasAttribute('href') ? 'link' : 'generic';

    return NATIVE_ROLES[tag] ?? 'generic';
}

/** Etiqueta legible para el mensaje de fallo. */
function describeElement (element)
{
    const tag = element.tagName.toLowerCase();
    const className = typeof element.className === 'string' ? element.className.trim() : '';
    const first = className.split(/\s+/)[0];

    return first ? `<${tag}.${first}>` : `<${tag}>`;
}

/** Todo atributo ARIA colocado donde no dice nada. Vacío = invariante intacta. */
function ariaViolations (root)
{
    const problems = [];

    for (const element of [root, ...root.querySelectorAll('*')])
    {
        const attributes = element.getAttributeNames().filter((name) => name.startsWith('aria-'));

        if (attributes.length === 0)
            continue;

        const role = effectiveRole(element);

        for (const attribute of attributes)
        {
            if (GLOBAL_ARIA.has(attribute))
            {
                const names = attribute === 'aria-label' || attribute === 'aria-labelledby';

                if (names && CANNOT_BE_NAMED.has(role))
                {
                    problems.push(
                        `${describeElement(element)} [role=${role}]: ${attribute} no puede `
                        + 'nombrar un nodo generico (el navegador descarta el nombre)');
                }

                continue;
            }

            const allowed = ROLE_SCOPED_ARIA[attribute];

            if (allowed == null)
            {
                problems.push(
                    `${describeElement(element)} [role=${role}]: ${attribute} no esta en la `
                    + 'tabla de roles (anadelo a ROLE_SCOPED_ARIA)');
                continue;
            }

            if (!allowed.includes(role))
            {
                problems.push(
                    `${describeElement(element)} [role=${role}]: ${attribute} es inerte ahi `
                    + `(solo tiene sentido en: ${allowed.join(', ')})`);
            }
        }
    }

    return problems;
}

/* ---------------------------------------------------------------------------
 * El catálogo: qué se monta y qué export cubre cada caso
 * ------------------------------------------------------------------------- */

const MENU = [
    {
        label: 'GLOBAL',
        sub: [
            { label: 'MASTER VOL', paramId: 'masterLevel' },
            { label: 'MIDI CH', paramId: 'midiChannel' },
        ],
    },
    { label: 'PANIC', type: 'action' },
];

const THEMES = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
];

/** Un caso por familia de skins (los skins inyectan DOM propio). */
function withEverySkin (exportName, make)
{
    return {
        covers: [exportName],
        label: `${exportName} con cada skin (${skinNames().join(', ')})`,
        mount: (host) => skinNames().map((skin) =>
        {
            const sub = document.createElement('div');
            host.appendChild(sub);
            return make(sub, skin);
        }),
    };
}

const CASES = [
    // La matriz monta filas-botón y un botón de compactar, así que pasa por la
    // auditoría como cualquier otro control de la familia. Su grafo NO aparece
    // en los casos: es aria-hidden porque duplica lo que las filas ya dicen.
    {
        covers: ['ModMatrix'],
        label: 'ModMatrix con rutas pintadas',
        mount: (host) => {
            const matrix = new ModMatrix(host, {
                contract: {
                    slots: 4,
                    sources: [
                        { label: 'Off', category: 'none' },
                        { label: 'LFO 1', category: 'lfo' },
                    ],
                    destinations: [
                        { label: 'Off', parameterId: null },
                        { label: 'Osc Level', parameterId: 'oscLevel' },
                    ],
                },
            });
            matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);
            matrix.setLive({ 1: -0.4 });
            return matrix;
        },
    },
    {
        covers: ['ModMatrix'],
        label: 'ModMatrix vacia, con boton de compactar',
        mount: (host) => new ModMatrix(host, {
            contract: { slots: 32, sources: [], destinations: [] },
            visibleSlots: 8,
            onCompact: () => {},
        }),
    },

    {
        covers: ['Knob'],
        label: 'Knob con label',
        mount: (host) => new Knob(host, { label: 'Cutoff', value: 0.4 }),
    },
    {
        covers: ['Knob'],
        label: 'Knob anonimo (nameable por el host)',
        mount: (host) => new Knob(host, {}),
    },
    {
        covers: ['Knob'],
        label: 'Knob tras setValue (el render reescribe valuenow/valuetext)',
        mount: (host) =>
        {
            const knob = new Knob(host, { label: 'Cutoff', format: (v) => `${Math.round(v * 100)}%` });
            knob.setValue(0.9);
            return knob;
        },
    },
    withEverySkin('Knob', (sub, skin) => new Knob(sub, { label: 'Cutoff', skin })),

    {
        covers: ['Slider'],
        label: 'Slider horizontal',
        mount: (host) => new Slider(host, { label: 'Level', value: 0.5 }),
    },
    {
        covers: ['Slider'],
        label: 'Slider vertical (orientacion explicita)',
        mount: (host) => new Slider(host, { label: 'Level', orientation: 'vertical', value: 0.2 }),
    },
    {
        covers: ['Slider'],
        label: 'Slider anonimo',
        mount: (host) => new Slider(host, {}),
    },
    withEverySkin('Slider', (sub, skin) => new Slider(sub, { label: 'Level', skin })),

    {
        covers: ['Segmented'],
        label: 'Segmented plano',
        mount: (host) => new Segmented(host, { label: 'Wave', options: ['Saw', 'Sqr'] }),
    },
    {
        covers: ['Segmented'],
        label: 'Segmented con id (el grupo se nombra por <label for>)',
        mount: (host) => new Segmented(host, { id: 'audit-wave', label: 'Wave', options: ['Saw', 'Sqr'] }),
    },
    {
        covers: ['Segmented'],
        label: 'Segmented divergente con nota de veto',
        mount: (host) => new Segmented(host, {
            label: 'Engine',
            options: ['NEURONiK', { label: 'Neurotik', note: 'Requiere el motor Neurotik' }],
            value: 1,
            disabled: [1],
        }),
    },
    {
        covers: ['Segmented'],
        label: 'Segmented con glifos y variante led',
        mount: (host) => new Segmented(host, {
            label: 'LFO',
            options: WAVEFORM_NAMES,
            glyphs: WAVEFORM_GLYPHS,
            variant: 'led',
            value: 2,
        }),
    },
    {
        covers: ['Segmented'],
        label: 'Segmented con todo vetado en caliente (setDisabled)',
        mount: (host) =>
        {
            const segmented = new Segmented(host, { label: 'Wave', options: ['A', 'B', 'C'] });
            segmented.setDisabled(() => true);
            return segmented;
        },
    },
    withEverySkin('Segmented', (sub, skin) => new Segmented(sub, {
        label: 'Wave',
        options: ['Saw', 'Sqr'],
        skin,
    })),

    {
        covers: ['Select'],
        label: 'Select plano',
        mount: (host) => new Select(host, { label: 'Mode', options: ['Off', 'On'] }),
    },
    {
        covers: ['Select'],
        label: 'Select con entradas ricas { label, note, disabled }',
        mount: (host) => new Select(host, {
            label: 'Mode',
            options: ['Off', { label: 'Pitch Quantize', disabled: true, note: 'Requires the Neurotik engine' }],
        }),
    },
    {
        covers: ['Select'],
        label: 'Select divergente y sin opciones',
        mount: (host) =>
        {
            const select = new Select(host, { label: 'Mode', options: ['Off', 'On'], value: 1, disabled: [1] });
            select.setDisabled([]);
            const empty = new Select(host, { label: 'Vacio', options: [] });
            return [select, empty];
        },
    },
    withEverySkin('Select', (sub, skin) => new Select(sub, {
        label: 'Mode',
        options: ['Off', 'On'],
        skin,
    })),

    {
        covers: ['NumberBox'],
        label: 'NumberBox con label, id y unidad',
        mount: (host) => new NumberBox(host, {
            id: 'audit-bpm',
            label: 'Master BPM',
            min: 20,
            max: 400,
            value: 30,
            unit: 'bpm',
        }),
    },
    {
        covers: ['NumberBox'],
        label: 'NumberBox anonimo y tras setValue',
        mount: (host) =>
        {
            const box = new NumberBox(host, { min: 0, max: 16, format: (v) => (v === 0 ? 'Omni' : `${v}`) });
            box.setValue(4);
            return box;
        },
    },

    {
        covers: ['Toggle'],
        label: 'Toggle con label y ariaLabel',
        mount: (host) => new Toggle(host, { label: 'Sync', ariaLabel: 'LFO sync' }),
    },
    {
        covers: ['Toggle'],
        label: 'Toggle momentary',
        mount: (host) => new Toggle(host, { label: 'Tap', momentary: true }),
    },
    withEverySkin('Toggle', (sub, skin) => new Toggle(sub, { label: 'Sync', skin })),

    {
        covers: ['XYPad'],
        label: 'XYPad con label, anonimo y tras setValue',
        mount: (host) =>
        {
            const named = new XYPad(host, { label: 'Morph' });
            const anonymous = new XYPad(host, {});
            named.setValue(0.7, 0.3);
            return [named, anonymous];
        },
    },

    {
        covers: ['FilmstripFader'],
        label: 'FilmstripFader vertical y horizontal',
        mount: (host) =>
        {
            const vertical = new FilmstripFader(host, { spriteUrl: 'audit.png', label: 'Cutoff' });
            const horizontal = new FilmstripFader(host, {
                orientation: 'horizontal',
                spriteUrl: 'audit.png',
                ariaLabel: 'Filter cutoff',
            });
            return [vertical, horizontal];
        },
    },

    {
        covers: ['Wheel'],
        label: 'Wheel pitch y mod',
        mount: (host) =>
        {
            // Un Wheel por contenedor (1:1: la rueda lo repinta entero).
            const slots = [document.createElement('div'), document.createElement('div')];

            for (const slot of slots)
                host.appendChild(slot);

            return [
                new Wheel(slots[0], { type: 'pitch', spriteUrl: 'audit.png' }),
                new Wheel(slots[1], { type: 'mod', spriteUrl: 'audit.png' }),
            ];
        },
    },

    {
        covers: ['ThemeSwitcher'],
        label: 'ThemeSwitcher de botones (role=group)',
        mount: (host) => new ThemeSwitcher(host, {
            root: document.documentElement,
            themes: THEMES,
        }),
    },
    {
        covers: ['ThemeSwitcher'],
        label: 'ThemeSwitcher de <select> y tras setValue',
        mount: (host) =>
        {
            const switcher = new ThemeSwitcher(host, {
                root: document.documentElement,
                themes: THEMES,
                variant: 'select',
            });
            switcher.setValue('light');
            return switcher;
        },
    },

    {
        covers: ['SevenSegmentDisplay'],
        label: 'SevenSegmentDisplay',
        mount: (host) => new SevenSegmentDisplay(host, { digits: 3, value: '12' }),
    },
    {
        covers: ['SilverFilmstripKnob'],
        label: 'SilverFilmstripKnob (preset y normal)',
        mount: (host) =>
        {
            const preset = new SilverFilmstripKnob(host, { variant: 'preset' });
            const normal = new SilverFilmstripKnob(host, { variant: 'normal' });
            return [preset, normal];
        },
    },
    {
        covers: ['EffectLEDButton'],
        label: 'EffectLEDButton',
        mount: (host) => new EffectLEDButton(host, { label: 'Chorus' }),
    },
    {
        covers: ['PeakLED'],
        label: 'PeakLED (sprite e inline)',
        mount: (host) => [new PeakLED(host, {}), new PeakLED(host, { useSprite: false })],
    },
    {
        covers: ['TapeEchoVisual'],
        label: 'TapeEchoVisual',
        mount: (host) => new TapeEchoVisual(host, {}),
    },

    {
        covers: ['createDrawer'],
        label: 'Drawer cerrado y abierto (role=dialog + aria-modal)',
        mount: () =>
        {
            const closed = createDrawer({ id: 'aria-audit-closed', title: 'MATRIZ', badge: '4 RUTAS' });
            const open = createDrawer({ id: 'aria-audit-open', title: 'GLOBAL & MASTER', badge: 'BPM' });
            open.open();
            return [closed, open];
        },
    },

    {
        covers: ['createLcdScreen'],
        label: 'LcdScreen (role=status + aria-live)',
        mount: (host) => createLcdScreen(host, { widthChars: 16 }),
    },
    {
        covers: ['createLcdPanel'],
        label: 'LcdPanel (pantalla + D-pad nombrado)',
        mount: (host) => createLcdPanel(host, { menu: MENU, widthChars: 16 }),
    },

    {
        covers: ['EnvelopePad'],
        label: 'EnvelopePad editable (las tres asas son sliders)',
        mount: (host) => new EnvelopePad(host, { label: 'ENV 1' }),
    },
    {
        covers: ['EnvelopePad'],
        label: 'EnvelopePad anonimo y en modo vista',
        mount: (host) => new EnvelopePad(host, { editable: false }),
    },
    {
        covers: ['EnvelopePad'],
        label: 'EnvelopePad con aguja viva (setLevel)',
        mount: (host) =>
        {
            const pad = new EnvelopePad(host, { label: 'ENV 2', showValues: false });
            pad.setLevel(0.8);
            return pad;
        },
    },
    {
        covers: ['createEnvelopeCurve'],
        label: 'createEnvelopeCurve (la vista de fabrica, con caption)',
        mount: (host) => createEnvelopeCurve({
            controls: [
                { id: 'envAttack' }, { id: 'envDecay' },
                { id: 'envSustain' }, { id: 'envRelease' },
            ],
        }),
    },
    {
        covers: ['enhanceRangeInputs'],
        label: 'enhanceRangeInputs sobre un <input type=range>',
        mount: (host) =>
        {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = '0';
            input.max = '127';
            input.value = '64';
            input.setAttribute('aria-label', 'Cutoff');
            host.appendChild(input);

            enhanceRangeInputs(host, { spriteUrl: 'audit.png' });
            return null;
        },
    },
];

/** Exports del barrel que SÍ producen DOM y por eso tienen que estar auditados. */
const AUDITED = new Set([
    'EffectLEDButton', 'EnvelopePad', 'FilmstripFader', 'Knob', 'ModMatrix', 'NumberBox',
    'PeakLED',
    'Segmented',
    'Select', 'SevenSegmentDisplay', 'SilverFilmstripKnob', 'Slider', 'TapeEchoVisual',
    'ThemeSwitcher', 'Toggle', 'Wheel', 'XYPad',
    'createDrawer', 'createEnvelopeCurve', 'createLcdPanel', 'createLcdScreen',
    'enhanceRangeInputs',
]);

/** Exports que no son controles: helpers puros, constantes y datos. */
const NOT_CONTROLS = new Set([
    'computeFit',                     // matematicas de layout
    'mountFitStage',                  // monta un escenario, no un control
    'createLcdMachine',               // la maquina pura: no toca el DOM
    'destroyEnhancedRangeInputs',     // desmonta; no pinta nada nuevo
    'registerSkin', 'getSkin', 'applySkin', 'skinNames',
    'waveformName', 'formatValue',
    'WAVEFORM_GLYPHS', 'WAVEFORM_NAMES', 'WAVE_ICONS', 'FILTER_ICONS',
    'sameControlValue', 'transitioned', 'announceTransition',   // avisos de transicion: no pintan DOM
    'announceMovement', 'announceSettled', 'createContinuousNotices', // avisos continuos: no pintan DOM
    'createOverlayFocus',             // contrato de foco/inert de overlays: no es un control
    'focusableWithin',                // util de tabulacion: no pinta DOM
    // EnvelopePad: la geometria pura y sus constantes no pintan DOM (los
    // pintan el pad y la vista de fabrica, que SI estan auditados arriba).
    'DEFAULT_ENVELOPE', 'ENVELOPE_SEGMENTS', 'ENVELOPE_VIEWBOX', 'NEEDLE_FLOOR',
    'envelopeAreaPath', 'envelopeLinePath', 'envelopeNeedlePath', 'envelopePoints',
    // Temas de efecto: pintan UNA custom property como texto de estilo, no un
    // control. El atributo y el nombre los pone el modulo (.fx-module) y el
    // anillo, no estas funciones, asi que no tienen rol ARIA que auditar.
    'FX_THEME_TOKENS', 'registerFxTheme', 'getFxTheme', 'getNeutralFxTheme',
    'fxThemeNames', 'fxThemeStyle', 'buildFxThemeIndex',
    // El catalogo de patches del S950: indice de nombres y rangos. No pinta
    // NADA por si solo —no crea un elemento, no pone un rol, no engancha un
    // listener—: dice que hay que pintar y con que limites, y quien pinta es un
    // control de verdad, que SI esta auditado. Igual que `buildFxThemeIndex`.
    'buildS950Catalogue', 'formatS950Name', 'isS950Bipolar',
    'S950_ENCODINGS', 'S950_GROUPS',
]);

/* ---------------------------------------------------------------------------
 * Los tests
 * ------------------------------------------------------------------------- */

describe('ARIA invariants: el atributo solo vive donde su rol lo soporta', () =>
{
    for (const testCase of CASES)
    {
        it(testCase.label, () =>
        {
            document.body.innerHTML = '';

            const host = document.createElement('div');
            document.body.appendChild(host);

            const mounted = testCase.mount(host);

            try
            {
                const problems = ariaViolations(document.body);

                expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
            }
            finally
            {
                for (const control of [].concat(mounted ?? []))
                    control?.destroy?.();

                document.body.innerHTML = '';
            }
        });
    }
});

describe('ARIA invariants: el catalogo no deja controles fuera', () =>
{
    it('todo export que pinta DOM tiene caso en el catalogo', () =>
    {
        const mounted = new Set(CASES.flatMap((testCase) => testCase.covers));
        const missing = [...AUDITED].filter((name) => !mounted.has(name));

        expect(
            missing,
            `estos exports estan en AUDITED pero ningun caso los monta: ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('ningun export nuevo del barrel se cuela sin auditar', () =>
    {
        const exported = Object.keys(family).filter((name) => !NOT_CONTROLS.has(name));
        const unrouted = exported.filter((name) => !AUDITED.has(name));

        expect(
            unrouted,
            'estos exports no pasan por la auditoria ARIA: anade un caso al catalogo '
            + `(y su nombre a AUDITED), o declara el export en NOT_CONTROLS: ${unrouted.join(', ')}`,
        ).toEqual([]);
    });
});

describe('ARIA invariants: la auditoria se prueba a si misma', () =>
{
    it('detecta el fallo que la motivo: aria-valuetext en un nodo sin rol', () =>
    {
        // La forma exacta del fallo historico (el wrapper del NumberBox): sin rol,
        // el navegador tira el atributo y el lector anuncia el numero crudo.
        const wrapper = document.createElement('div');
        wrapper.className = 'abd-probe-wrapper';
        wrapper.setAttribute('aria-valuetext', 'Omni');

        const problems = ariaViolations(wrapper);

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('aria-valuetext');
        expect(problems[0]).toContain('role=generic');
    });

    it('detecta un atributo con rol colocado en un rol que no lo soporta', () =>
    {
        // El caso del <select>: combobox no admite semantica de valor.
        const field = document.createElement('select');
        field.setAttribute('aria-valuenow', '1');

        const problems = ariaViolations(field);

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('role=combobox');
    });

    it('detecta un nombre en un nodo que no se puede nombrar', () =>
    {
        // Un aria-label en un <div> pelado: el nombre se descarta igual.
        const wrapper = document.createElement('div');
        wrapper.setAttribute('aria-label', 'Cutoff');

        const problems = ariaViolations(wrapper);

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('no puede nombrar');
    });

    it('no inventa fallos cuando el nodo SI lleva el rol que toca', () =>
    {
        // Control positivo: los mismos atributos, en el nodo correcto, pasan.
        const host = document.createElement('div');

        const slider = document.createElement('div');
        slider.setAttribute('role', 'slider');
        slider.setAttribute('aria-valuemin', '0');
        slider.setAttribute('aria-valuenow', '30');
        slider.setAttribute('aria-valuetext', '30 bpm');
        slider.setAttribute('aria-label', 'Master BPM');
        slider.setAttribute('aria-orientation', 'vertical');

        const radio = document.createElement('button');
        radio.setAttribute('role', 'radio');
        radio.setAttribute('aria-checked', 'true');

        const range = document.createElement('input');
        range.type = 'range';
        range.setAttribute('aria-label', 'Pitch Bend');

        host.append(slider, radio, range);

        expect(ariaViolations(host)).toEqual([]);
    });
});
