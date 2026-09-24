/**
 * Demo bootstrap for the JS control family (Knob / Slider / Toggle / Select +
 * skins). Loaded by demo/demo.html as a module; keeps the HTML declarative
 * (containers here, controls instantiated below with the three built-in skins).
 */

import { Knob, NumberBox, Segmented, Select, Slider, Toggle, XYPad, createLcdPanel } from '../components/index.js';

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
    const gated = new Select(host, {
        label: 'DESTINATION',
        value: 3,                     // sits on a Neurotik-only entry
        disabled: [2, 3],             // engine starts as NEURONiK
        options: [
            'Off',
            'LFO 1',
            { label: 'Pitch Quantize', disabled: true, note: 'Requires the Neurotik engine' },
            { label: 'Spectral Blur', disabled: true, note: 'Requires the Neurotik engine' },
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
