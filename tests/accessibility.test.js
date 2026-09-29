/**
 * Accessibility audit of the shared control family.
 *
 * What is pinned here (the gaps the 2026-09 audit found and closed):
 *   - every value control exposes an accessible NAME (ariaLabel ?? visible
 *     label's text); an anonymous control must still be nameable;
 *   - Slider carries aria-orientation=vertical when vertical (horizontal is
 *     the implicit default);
 *   - XYPad is role=slider (its keyboard MOVES the value) with min/max/now;
 *   - Toggle accepts ariaLabel for icon-only / anonymous uses;
 *   - Segmented names its radiogroup from the label when there is no id and
 *     keeps its state on each radio's aria-checked (never on the group);
 *   - NumberBox fields are nameable, its +/- buttons are named in English, and
 *     its aria-valuetext sits on the spinbutton field (formatted value + unit);
 *   - LcdPanel glyph buttons carry explicit names ('‹' reads as "less than").
 *   - Segmented announces a divergent value instead of only flagging it: the
 *     vetoed radio is aria-disabled (still focusable), keeps the roving tab
 *     stop and carries the reason as its aria-describedby description.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import './setup.js';
import { Knob } from '../components/knob.js';
import { Slider } from '../components/slider.js';
import { Toggle } from '../components/toggle.js';
import { Segmented } from '../components/segmented.js';
import { NumberBox } from '../components/numberbox.js';
import { XYPad } from '../components/xypad.js';
import { createLcdPanel } from '../components/lcdPanel.js';

function makeHost()
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

describe('accessibility: accessible names', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('slider names itself from the visible label', () =>
    {
        const s = new Slider(host, { label: 'Cutoff' });
        expect(s.track.getAttribute('role')).toBe('slider');
        expect(s.track.getAttribute('aria-label')).toBe('Cutoff');
    });

    it('slider accepts an explicit ariaLabel override', () =>
    {
        const s = new Slider(host, { label: 'Cut', ariaLabel: 'Filter cutoff' });
        expect(s.track.getAttribute('aria-label')).toBe('Filter cutoff');
    });

    it('slider stays nameable when anonymous (host can aria-label the wrapper)', () =>
    {
        const s = new Slider(host, {});
        expect(s.track.getAttribute('aria-label')).toBeNull();
    });

    it('xypad names itself from the label or the fallback', () =>
    {
        const named = new XYPad(host, { label: 'Morph' });
        expect(named.pad.getAttribute('aria-label')).toBe('Morph');

        const anon = new XYPad(host, {});
        expect(anon.pad.getAttribute('aria-label')).toBe('X-Y pad');
    });

    it('xypad accepts an explicit ariaLabel override', () =>
    {
        const p = new XYPad(host, { label: 'Pad', ariaLabel: 'Model morph pad' });
        expect(p.pad.getAttribute('aria-label')).toBe('Model morph pad');
    });

    it('toggle carries ariaLabel when given (icon-only uses)', () =>
    {
        const t = new Toggle(host, { label: 'Sync', ariaLabel: 'LFO sync' });
        expect(t.button.getAttribute('aria-label')).toBe('LFO sync');
        expect(t.button.textContent).toBe('Sync');
    });

    it('toggle stays silent when no name is requested (back-compat)', () =>
    {
        const t = new Toggle(host, { label: 'Sync' });
        expect(t.button.getAttribute('aria-label')).toBeNull();
    });

    it('numberbox field is named from the label even without an id', () =>
    {
        // Sin id no hay <label for> que asocie el texto visible: el campo lleva
        // nombre propio para que role=spinbutton no quede mudo.
        const box = new NumberBox(host, { label: 'Master BPM', min: 20, max: 400 });

        expect(box.labelEl.tagName).toBe('SPAN');
        expect(box.field.getAttribute('aria-label')).toBe('Master BPM');
    });

    it('numberbox field prefers the real <label for> when an id is given', () =>
    {
        const box = new NumberBox(host, { id: 'bpm-box', label: 'Master BPM', min: 20, max: 400 });

        expect(box.labelEl.htmlFor).toBe('bpm-box');
        // Sin duplicar el nombre: ya lo aporta el <label for>.
        expect(box.field.getAttribute('aria-label')).toBeNull();
    });

    it('numberbox buttons name the parameter they belong to', () =>
    {
        const n = new NumberBox(host, { label: 'Master BPM', min: 20, max: 400 });
        const buttons = n.box.querySelectorAll('button');
        expect(buttons[0].getAttribute('aria-label')).toBe('Master BPM: decrease');
        expect(buttons[1].getAttribute('aria-label')).toBe('Master BPM: increase');
    });

    it('numberbox buttons fall back to the bare verb without a label', () =>
    {
        const n = new NumberBox(host, { min: 20, max: 400 });
        const buttons = n.box.querySelectorAll('button');
        expect(buttons[0].getAttribute('aria-label')).toBe('decrease');
        expect(buttons[1].getAttribute('aria-label')).toBe('increase');
    });

    it('lcd panel glyph buttons carry explicit names', () =>
    {
        const p = createLcdPanel(host, { menu: [], idle: () => ['', ''] });
        expect(p.buttons.left.getAttribute('aria-label')).toBe('Cursor left');
        expect(p.buttons.up.getAttribute('aria-label')).toBe('Cursor up');
        expect(p.buttons.menu.getAttribute('aria-label')).toBe('Menu');
        p.destroy();
    });
});

describe('accessibility: roles and value semantics', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('vertical slider declares aria-orientation; horizontal stays implicit', () =>
    {
        const v = new Slider(host, { orientation: 'vertical', label: 'Level' });
        expect(v.track.getAttribute('aria-orientation')).toBe('vertical');

        const h = new Slider(host, { label: 'Level' });
        expect(h.track.getAttribute('aria-orientation')).toBeNull();
    });

    it('xypad is a slider with min/max/now (keyboard moves the value)', () =>
    {
        const p = new XYPad(host, { x: 0.25, y: 0.75 });
        expect(p.pad.getAttribute('role')).toBe('slider');
        expect(p.pad.getAttribute('aria-valuemin')).toBe('0');
        expect(p.pad.getAttribute('aria-valuemax')).toBe('1');
        expect(p.pad.getAttribute('aria-valuenow')).toBe('0.25');
        expect(p.pad.getAttribute('aria-valuetext')).toContain('25%');
    });

    it('xypad valuenow follows keyboard steps', () =>
    {
        const p = new XYPad(host, { x: 0.5, y: 0.5, step: 0.1 });
        p.pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(p.pad.getAttribute('aria-valuenow')).toBe('0.6');
    });

    it('segmented names its group from the label when there is no id', () =>
    {
        const s = new Segmented(host, { label: 'Wave', options: ['Saw', 'Sqr'] });
        expect(s.group.getAttribute('role')).toBe('radiogroup');
        expect(s.group.getAttribute('aria-label')).toBe('Wave');
        expect(s.group.getAttribute('aria-labelledby')).toBeNull();
    });

    it('segmented with id keeps the labelled-by wiring (no duplicate naming)', () =>
    {
        const s = new Segmented(host, { id: 'wave', label: 'Wave', options: ['Saw', 'Sqr'] });
        expect(s.group.getAttribute('aria-labelledby')).toBe('wave-label');
        expect(s.group.getAttribute('aria-label')).toBeNull();
    });

    it('segmented keeps its state on the radios, never on the group', () =>
    {
        const s = new Segmented(host, { label: 'Wave', options: ['Saw', 'Sqr', 'Tri'], value: 1 });

        // Un radiogroup no tiene semantica de valor: aria-valuenow/aria-valuetext
        // no estan soportados en el, y en el wrapper (un <div> sin rol) eran
        // inertes. El estado se anuncia por el aria-checked de cada radio.
        for (const node of [s.group, s.wrapper])
        {
            expect(node.getAttribute('aria-valuenow')).toBeNull();
            expect(node.getAttribute('aria-valuetext')).toBeNull();
        }

        expect(s.buttons.map((b) => b.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
        expect(s.buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
        // Cada radio se nombra con su propio texto visible.
        expect(s.buttons.map((b) => b.textContent.trim())).toEqual(['Saw', 'Sqr', 'Tri']);
    });

    it('segmented moves the checked state and the tab stop with the value', () =>
    {
        const s = new Segmented(host, { label: 'Wave', options: ['Saw', 'Sqr'] });

        expect(s.buttons[0].getAttribute('aria-checked')).toBe('true');

        s.buttons[1].click();

        expect(s.buttons[0].getAttribute('aria-checked')).toBe('false');
        expect(s.buttons[1].getAttribute('aria-checked')).toBe('true');
        expect(s.buttons[0].tabIndex).toBe(-1);
        expect(s.buttons[1].tabIndex).toBe(0);
    });

    it('segmented announces a divergent value and why the option is vetoed', () =>
    {
        const s = new Segmented(host, {
            label: 'Engine',
            options: ['NEURONiK', { label: 'Neurotik', note: 'Requiere el motor Neurotik' }],
            value: 1,
            disabled: [1],
        });

        const vetoed = s.buttons[1];

        // El estado divergente no es solo un [data-divergent] pintado: el radio
        // checked sigue enfocable (aria-disabled, NO el `disabled` nativo, que lo
        // sacaria del foco y del anuncio) y lleva el motivo como descripcion, no
        // solo en el title que se ve con el raton.
        expect(s.isDivergent()).toBe(true);
        expect(vetoed.getAttribute('aria-checked')).toBe('true');
        expect(vetoed.getAttribute('aria-disabled')).toBe('true');
        expect(vetoed.hasAttribute('disabled')).toBe(false);
        expect(vetoed.tabIndex).toBe(0);

        const describedBy = vetoed.getAttribute('aria-describedby');
        expect(document.getElementById(describedBy).textContent).toBe('Requiere el motor Neurotik');
        // La descripcion no ensucia el nombre accesible del radio.
        expect(vetoed.textContent.trim()).toBe('Neurotik');
    });

    it('numberbox valuetext reaches the reader: it lives on the spinbutton field', () =>
    {
        // El rol vive en el campo, asi que ahi tiene que ir el texto accesible.
        // En el wrapper (un <div> sin rol) el atributo era inerte y el lector
        // anunciaba el numero crudo: MIDI channel 0 se lee "Omni", no "0".
        const box = new NumberBox(host, {
            label: 'MIDI Channel',
            min: 0,
            max: 16,
            format: (v) => (v === 0 ? 'Omni' : `${v + 1}`),
        });

        expect(box.field.getAttribute('role')).toBe('spinbutton');
        expect(box.field.getAttribute('aria-valuenow')).toBe('0');
        expect(box.field.getAttribute('aria-valuetext')).toBe('Omni');
        // Guardia: el wrapper no debe volver a llevarlo (ahi no significa nada).
        expect(box.wrapper.getAttribute('aria-valuetext')).toBeNull();
    });

    it('numberbox valuetext appends the unit to the formatted readout', () =>
    {
        const box = new NumberBox(host, { label: 'Master BPM', value: 30, min: 20, max: 400, unit: 'bpm' });

        expect(box.field.getAttribute('aria-valuenow')).toBe('30');
        expect(box.field.getAttribute('aria-valuetext')).toBe('30 bpm');
    });

    it('numberbox valuetext follows programmatic setValue', () =>
    {
        const box = new NumberBox(host, {
            label: 'Mix',
            value: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
            format: (v) => `${Math.round(v * 100)}%`,
        });
        expect(box.field.getAttribute('aria-valuetext')).toBe('50%');

        box.setValue(0.75);
        // valuenow sigue siendo el numero crudo; solo cambia el texto formateado.
        expect(box.field.getAttribute('aria-valuenow')).toBe('0.75');
        expect(box.field.getAttribute('aria-valuetext')).toBe('75%');
    });
});
