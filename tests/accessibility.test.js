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
 *   - Segmented names its radiogroup from the label when there is no id;
 *   - NumberBox fields are nameable and its +/- buttons are named in English;
 *   - LcdPanel glyph buttons carry explicit names ('‹' reads as "less than").
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

    it('numberbox buttons are named increase/decrease (family language)', () =>
    {
        const n = new NumberBox(host, { label: 'BPM', min: 20, max: 400 });
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
});
