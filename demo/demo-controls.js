/**
 * Demo bootstrap for the JS control family (Knob / Slider / Toggle / Select +
 * skins). Loaded by demo/demo.html as a module; keeps the HTML declarative
 * (containers here, controls instantiated below with the three built-in skins).
 */

import {
    EffectLEDButton,
    EnvelopePad,
    Knob,
    ModMatrix,
    NumberBox,
    PeakLED,
    Segmented,
    Select,
    SevenSegmentDisplay,
    SilverFilmstripKnob,
    Slider,
    TapeEchoVisual,
    Toggle,
    Wheel,
    XYPad,
    createDrawer,
    createEnvelopeCurve,
    createLcdPanel,
} from '../components/index.js';

import { WAVEFORM_GLYPHS, WAVEFORM_NAMES } from '../components/waveforms.js';

const SKINS = ['vector', 'ms2000', 'junio'];

function mount (id, build)
{
    const host = document.getElementById(id);

    if (host != null)
        build(host);
}

/* ── Knobs: one per skin ─────────────────────────────────────────────────────── */

mount('demo-knobs', (host) =>
{
    for (const skin of SKINS)
    {
        const cell = document.createElement('div');
        cell.className = 'demo-knob-cell';
        cell.dataset.skin = skin;
        host.appendChild(cell);

        new Knob(cell, {
            skin,
            size: 72,
            value: 0.4 + Math.random() * 0.4,
            label: skin,
            spriteUrl: '../assets/junio/knob.png',   // demo/ is one level down
        });
    }
});

/* ── Sliders: vector horizontal, ms2000 horizontal, junio vertical ───────────── */

mount('demo-sliders', (host) =>
{
    const horizontal = document.createElement('div');
    horizontal.className = 'demo-slider-row';

    new Slider(horizontal, { skin: 'vector', value: 0.6, label: 'vector' });
    new Slider(horizontal, { skin: 'ms2000', value: 0.3, label: 'ms2000' });
    host.appendChild(horizontal);

    const vertical = document.createElement('div');
    vertical.className = 'demo-slider-row';
    new Slider(vertical, { skin: 'vector', orientation: 'vertical', value: 0.7 });
    new Slider(vertical, { skin: 'ms2000', orientation: 'vertical', value: 0.45 });
    new Slider(vertical, { skin: 'junio', orientation: 'vertical', value: 0.55, label: 'junio' });
    host.appendChild(vertical);
});

/* ── Toggles: latched + momentary, one per skin ──────────────────────────────── */

mount('demo-toggles', (host) =>
{
    for (const skin of SKINS)
    {
        new Toggle(host, { skin, label: skin.toUpperCase(), value: skin === 'vector' });
    }

    const momentary = new Toggle(host, { skin: 'ms2000', label: 'PANIC', momentary: true });
    momentary.button.classList.add('demo-toggle-momentary');
});

/* ── Toggle 'junio': the photo sprites come in fixed colors (colorName) ──────── */

mount('demo-toggles-junio', (host) =>
{
    const colors = ['orange', 'red', 'blue', 'grey', 'white', 'yellow'];

    for (const colorName of colors)
    {
        new Toggle(host, {
            skin: 'junio',
            colorName,
            value: colorName === 'orange',
            onChange: () => {},
        });
    }
});

/* ── Selects: one per skin, then the gated list (disabled entries) ───────────── */

const WAVES = ['Sawtooth', 'Square', 'Sine', 'Triangle'];

mount('demo-selects', (host) =>
{
    for (const skin of SKINS)
    {
        new Select(host, { skin, label: skin, options: WAVES, value: 1 });
    }
});

mount('demo-selects-gated', (host) =>
{
    const log = document.createElement('div');
    log.className = 'demo-label';

    // The pattern NEURONiK needs: availability depends on ANOTHER parameter.
    // A value landing on a disabled entry is kept and flagged, never rewritten.
    // El veto lo lleva el SPEC, no el flag de la entrada: el flag veta SIEMPRE, y
    // aqui la lista tiene que abrirse al cambiar de motor.
    const gated = new Select(host, {
        label: 'DESTINATION',
        value: 3,                     // sits on a Neurotik-only entry
        disabled: [2, 3],             // engine starts as NEURONiK
        options: [
            'Off',
            'LFO 1',
            { label: 'Pitch Quantize', note: 'Requires the Neurotik engine' },
            { label: 'Spectral Blur', note: 'Requires the Neurotik engine' },
            'Filter Cutoff',
        ],
        onChange: (index) => { log.textContent = `index ${index}`; },
    });

    const toggle = new Toggle(host, {
        skin: 'ms2000',
        label: 'ENGINE',              // false = NEURONiK, true = Neurotik
        value: false,
        onChange: (isOn) =>
        {
            // Same list, other engine: availability is recomputed, value untouched.
            gated.setDisabled(isOn ? [] : [2, 3]);
            log.textContent = `${isOn ? 'Neurotik' : 'NEURONiK'} · divergent=${gated.isDivergent()}`;
        },
    });

    log.textContent = `NEURONiK · divergent=${gated.isDivergent()}`;
    host.appendChild(log);
});

/* ── XYPad: same value shown in two linked pads + readout of the last change ─ */

mount('demo-xypads', (host) =>
{
    const log = document.createElement('div');
    log.className = 'demo-label';

    const mirror = new XYPad(host, { width: 180, height: 180, label: 'MORPH' });
    const main = new XYPad(host, {
        width: 220,
        height: 220,
        label: 'MAIN',
        onDragStart: () => log.textContent = 'drag start',
        onDragEnd: () => log.textContent += ' -> end',
        onChange: (value) =>
        {
            log.textContent = `X ${value.x.toFixed(2)} · Y ${value.y.toFixed(2)}`;
            mirror.setValue(value);   // silent: linked pads pattern
        },
    });

    // Mirror updates must not echo back into main (setValue silent by default).
    host.appendChild(log);
});

/* ── Knob BIPOLAR: el mismo mando, con el cero en el CENTRO ─────────────── */

mount('demo-knobs-bipolar', (host) =>
{
    const log = document.getElementById('demo-bipolar-log');
    const signed = (v) => `${v > 0 ? '+' : ''}${Math.round((v - 0.5) * 2 * 100)}`;

    // Los cinco valores que delatan cualquier fallo de la geometria: con el
    // centro vacio, los dos extremos a media vuelta y la simetria de 0.25/0.75.
    for (const [value, name] of [[0, '-1'], [0.25, '-0.5'], [0.5, '0'], [0.75, '+0.5'], [1, '+1']])
    {
        const cell = document.createElement('div');
        cell.className = 'demo-knob-cell';
        host.appendChild(cell);

        new Knob(cell, {
            size: 72,
            value,
            bipolar: true,
            label: name,
            format: signed,   // el host es quien sabe que 0.5 es el cero
            onChange: (v) => { if (log) log.textContent = `arrastrado a ${signed(v)} (0.50 normalizado = el cero)`; },
        });
    }
});

/* ── EnvelopePad: el control editable y la vista, con aguja en vivo ───────── */

mount('demo-envelopes', (host) =>
{
    const log = document.createElement('div');
    log.className = 'demo-label';

    const pad = new EnvelopePad(host, { label: 'ENV' });
    pad.wrapper.style.width = '240px';
    pad.wrapper.style.height = '120px';

    pad.options.onChange = (value) =>
    {
        log.textContent = `A ${value.attack.toFixed(2)} · D ${value.decay.toFixed(2)}`
            + ` · S ${value.sustain.toFixed(2)} · R ${value.release.toFixed(2)}`;
    };

    // La aguja de nivel, como si llegara del motor: un lazo que respira.
    let phase = 0;
    setInterval(() =>
    {
        phase += 0.08;
        pad.setLevel(Math.abs(Math.sin(phase)) * (1 - pad.getValue().sustain) + 0.05);
    }, 60);

    host.appendChild(log);
});

mount('demo-envelopes-view', (host) =>
{
    const curve = createEnvelopeCurve({
        controls: [
            { id: 'envAttack' }, { id: 'envDecay' },
            { id: 'envSustain' }, { id: 'envRelease' },
        ],
        label: 'AMP ENV',
        title: 'La vista de fabrica: pinta desde valores reales, sin gesto',
    });

    curve.element.style.width = '240px';
    curve.element.style.height = '120px';
    host.appendChild(curve.element);

    let phase = 0;
    setInterval(() =>
    {
        phase += 0.05;
        curve.setLevel(Math.abs(Math.sin(phase)) * 0.7 + 0.1);
    }, 60);
});

// ── LCD (pantalla + maquina + D-pad) ────────────────────────────────────────
const lcdHost = document.getElementById('demo-lcd');
if (lcdHost) {
  const values = { masterLevel: 0.75, midiChannel: 1, reverbMix: 0.3 };
  const lcd = createLcdPanel(lcdHost, {
    menu: [
      { label: 'GLOBAL', sub: [
        { label: 'MASTER VOL', paramId: 'masterLevel' },
        { label: 'MIDI CH', paramId: 'midiChannel' },
      ] },
      { label: 'EFFECTS', sub: [{ label: 'REVERB MIX', paramId: 'reverbMix' }] },
      { label: 'PANIC', type: 'action' },
    ],
    idle: () => ['DEMO SUITE', 'LISTO'],
    editValue: (item) => String(values[item.paramId] ?? ''),
    hooks: {
      onEdit: (paramId, dir) => {
        values[paramId] = Math.min(1, Math.max(0, (values[paramId] ?? 0) + dir * 0.05));
        lcd.screen.preview(1, String(values[paramId]), { durationMs: 600 });
      },
      onAction: () => lcd.screen.message('panic', '¡PANIC!', { priority: 1, durationMs: 1200 }),
    },
  });
  window.__demoLcd = lcd; // QA desde consola
}


/* ── LFO waveform furniture: two variants side by side ─────────────────────── */

const WAVE_OPTIONS = WAVEFORM_NAMES.map((name, index) => ({ label: name, glyph: WAVEFORM_GLYPHS[index] }));

mount('demo-wave-rows', (host) =>
{
    new Segmented(host, { options: WAVE_OPTIONS, value: 0, label: 'LFO 1 Wave' });
});

mount('demo-wave-led', (host) =>
{
    new Segmented(host, { options: WAVE_OPTIONS, variant: 'led', value: 2, label: 'LFO 1 Wave' });
});

mount('demo-wave-select', (host) =>
{
    new Select(host, { options: WAVEFORM_NAMES, value: 0, label: 'LFO 1 Wave' });
});

mount('demo-wave-gated', (host) =>
{
    new Segmented(host,
    {
        options: WAVE_OPTIONS,
        variant: 'led',
        value: 0,
        disabled: [5],
        label: 'S&H apagado por gating',
    });
});

mount('demo-nb-bpm', (host) =>
{
    new NumberBox(host, { value: 120, min: 20, max: 400, label: 'Master BPM', unit: 'bpm' });
});

mount('demo-nb-channel', (host) =>
{
    new NumberBox(host, { value: 1, min: 1, max: 16, label: 'MIDI Channel' });
});

mount('demo-nb-float', (host) =>
{
    new NumberBox(host, { value: 0.5, min: 0, max: 1, step: 0.05, integer: false, label: 'Amount' });
});

mount('demo-nb-gated', (host) =>
{
    new NumberBox(host, { value: 7, min: 0, max: 16, label: 'Deshabilitado', disabled: true });
});

/* ── 9. Instrumentos: lo que exporta el barrel y no cabia en la seccion 8 ───── */

/* Los sprites viven un nivel arriba: demo/ esta un nivel por debajo de la raiz
   del repo, igual que hace el Knob de la seccion 8. */
const SPRITES = '../assets/junio/';

mount('demo-led-buttons', (host) =>
{
    for (const color of ['orange', 'yellow', 'beige', 'patch-blue', 'grey', 'red'])
    {
        new EffectLEDButton(host, { color, label: color, value: color === 'orange' });
    }

    // El 'tiny' es el que va en la tira de un modulo, y el momentary el PANIC:
    // encendido mientras se pulsa, nunca enclava.
    new EffectLEDButton(host, { color: 'red', size: 'tiny', label: 'tiny' });
    new EffectLEDButton(host, { color: 'orange', momentary: true, label: 'PANIC' });
});

mount('demo-peak-leds', (host) =>
{
    // El del rack (sprite del Juno-60) y el de CSS, que es el que se usa cuando
    // el synth no trae foto: los dos con el MISMO contrato.
    const sprite = new PeakLED(host, { spriteUrl: `${SPRITES}re201_peak_led.png` });
    const css = new PeakLED(host, { useSprite: false, color: '#ff4400' });

    // Destello: lo que hace el motor al saturar un pico. Cada uno con su fase,
    // para que se vea el patron (destello -> fijo -> apagado) y no un parpadeo.
    let phase = 0;
    setInterval(() =>
    {
        phase = (phase + 0.06) % (Math.PI * 2);
        const hot = Math.sin(phase);

        if (hot > 0.6) { sprite.trigger(); css.trigger(); }
        else if (hot > 0.2) { sprite.setState(true); css.setState(true); }
        else { sprite.setState(false); css.setState(false); }
    }, 80);
});

mount('demo-seven-seg', (host) =>
{
    const bpm = new SevenSegmentDisplay(host, { digits: 3, value: '120', fontSize: '28px' });
    new SevenSegmentDisplay(host, { digits: 6, value: '000128', fontSize: '20px' });

    // Cuenta arriba como la haria el host con un parametro, para ver el recorte
    // a `digits` y el guion de los huecos.
    let value = 0;
    setInterval(() =>
    {
        value = (value + 1) % 1000;
        bpm.setValue(String(value).padStart(3, '0'));
    }, 200);
});

mount('demo-silver-knobs', (host) =>
{
    const log = document.createElement('div');
    log.className = 'demo-label';

    new SilverFilmstripKnob(host, {
        variant: 'preset',
        value: 0.3,
        label: 'preset (12)',
        spriteUrl: `${SPRITES}silver_re201_preset.png`,
        onChange: (v) => { log.textContent = `preset ${Math.round(v * 11) + 1} / 12`; },
    });

    new SilverFilmstripKnob(host, {
        variant: 'normal',
        value: 0.6,
        label: 'normal (31)',
        spriteUrl: `${SPRITES}silver_re201_normal.png`,
        onChange: (v) => { log.textContent = `normal ${Math.round(v * 30) + 1} / 31`; },
    });

    host.appendChild(log);
});

mount('demo-wheels', (host) =>
{
    // PITCH vuelve al centro al soltar; MOD se queda donde lo dejes. La misma
    // clase con distinto `type`, que es todo lo que las distingue.
    new Wheel(host, { type: 'pitch', spriteUrl: '../assets/bender.png' });
    new Wheel(host, { type: 'mod', spriteUrl: '../assets/bender.png' });
});

mount('demo-tape', (host) =>
{
    const tape = new TapeEchoVisual(host, { width: 240, height: 92 });

    // Sync y division de tempo encadenadas, como las llama el host: un control
    // gobierna ladivision, y el valor se refleja en el nombre de la cabecera.
    tape.setBPM(124);
    tape.setSyncEnabled(true);
    tape.setSyncDivision(2);

    // Un cabezal encendido y otro en el limite: el estado que pinta cada uno.
    tape.setHeadActive(0, true);
    tape.setHeadActive(2, true);

    // Los picos de la barra, como los que manda el motor.
    let phase = 0;
    setInterval(() =>
    {
        phase = (phase + 0.11) % (Math.PI * 2);
        if (Math.sin(phase) > 0.75) tape.triggerPeak();
    }, 90);
});

mount('demo-mod-matrix', async (host) =>
{
    // El estado vive FUERA del contenedor de la matriz a proposito: ModMatrix es
    // dueno de el (`replaceChildren`), asi que un nodo que le anadas antes
    // desaparece. El aviso vive al lado, en su propio hueco.
    const status = document.getElementById('demo-mod-matrix-status');
    const say = (text) => { if (status) status.textContent = text; };

    say('leyendo el contrato...');

    // La vista NO lleva la tabla escrita a mano: lee el contrato, que es la
    // misma fuente que leen el motor y el host. Sin servidor (abrir el fichero
    // con file://) el fetch no puede, y el motivo se dice en vez de callar.
    let contract;

    try
    {
        const response = await fetch('../contracts/neuronik_modulation_matrix.json');

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        contract = await response.json();
    }
    catch (error)
    {
        say(`No se pudo leer el contrato (${error.message}). `
            + 'Sirve la demo por HTTP (demo/start.bat), no con doble clic.');
        return;
    }

    const matrix = new ModMatrix(host, {
        contract,
        onAnnounce: (message) => { say(message); },
    });

    // Rutas de ejemplo con ÍNDICES del contrato, no con etiquetas: es lo que
    // llega del host. La última es inerte (destino 0 a 0), y la vista NO la
    // cuenta: la misma regla que el motor.
    matrix.paint([
        { source: 1, destination: 4, amount: 0.6 },
        { source: 2, destination: 0, amount: 0.35 },
        { source: 6, destination: 1, amount: 0.9 },
        { source: 0, destination: 0, amount: 0 },
    ]);

    // La contribucion VIVA, que llega a ~15 Hz y solo repinta las barras: por
    // eso tiene su propio metodo y no vuelve a pintar la lista.
    let phase = 0;
    setInterval(() =>
    {
        phase += 0.09;
        matrix.setLive({ 4: 0.5 + Math.sin(phase) * 0.4, 0: 0.3 });
    }, 70);

    say(`${matrix.slotCount} huecos · ${contract.sources.length} fuentes · `
        + `${contract.destinations.length} destinos (contrato NEURONiK)`);
});

/* El cajon: el disparador va en la pagina y el cajon se crea aqui, con el
   contrato de foco entero (Tab atrapado, foco al abrir, vuelta al disparador). */
const drawerLog = document.getElementById('demo-drawer-log');
const drawerOpen = document.getElementById('demo-drawer-open');

if (drawerOpen)
{
    const drawer = createDrawer({
        id: 'demo-drawer',
        title: 'RUTAS',
        badge: '4 RUTAS',
        onOpen: () => { if (drawerLog) drawerLog.textContent = 'abierto'; },
        onClose: () => { if (drawerLog) drawerLog.textContent = 'cerrado'; },
    });

    // Contenido minimo: los avisos de transicion son del cajon, no del host, y
    // aqui solo se enseña que el boton de cerrar tambien esta.
    const line = document.createElement('p');
    line.style.padding = '16px';
    line.textContent = 'Contenido del cajon. Prueba el Tab: el foco no sale de aqui '
        + 'mientras esta abierto, y al cerrar vuelve al boton que lo abrio.';
    drawer.body.appendChild(line);

    drawerOpen.addEventListener('click', () => drawer.toggle());
}

