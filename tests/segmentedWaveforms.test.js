/**
 * Segmented with glyphs — the two furniture variants for waveform choices.
 * ================================================================
 *
 * Pins the contract added for the LFO-wave furniture:
 *   - glyphs: per-entry wins, aligned `glyphs` array fills the gaps;
 *   - the glyphed segment is a TWO-ROW piece (mark above the text) by default;
 *   - the SVG mark follows currentColor (theme decides, active inverts);
 *   - variant 'led' only swaps the furniture class — value model, silent
 *     setValue and onChange-on-pick are the SAME contract as the plain strip.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Segmented } from '../components/segmented.js';
import { WAVEFORM_GLYPHS, WAVEFORM_NAMES } from '../components/waveforms.js';

function mount (options)
{
    const container = document.createElement('div');
    document.body.appendChild(container);
    return new Segmented(container, options);
}

beforeEach(() =>
{
    document.body.innerHTML = '';
});

describe('Segmented — glifos (segmentos de dos lineas)', () =>
{
    it('pinta marca SVG sobre el texto en cada segmento', () =>
    {
        const control = mount({
            options: WAVEFORM_NAMES,
            glyphs: WAVEFORM_GLYPHS,
            value: 1,
        });

        const segments = control.group.querySelectorAll('.abd-segmented__segment');

        expect(segments).toHaveLength(6);

        segments.forEach((segment, index) =>
        {
            expect(segment.classList.contains('abd-segmented__segment--glyphed')).toBe(true);

            const glyph = segment.querySelector('.abd-segmented__glyph svg');
            const text = segment.querySelector('.abd-segmented__text');

            expect(glyph).not.toBeNull();
            expect(glyph.innerHTML).toContain('currentColor');
            expect(text.textContent).toBe(WAVEFORM_NAMES[index]);
        });
    });

    it('la entrada individual manda sobre el array alineado', () =>
    {
        const control = mount({
            options: ['A', 'B'],
            glyphs: ['<svg viewBox="0 0 24 16" />'],
        });

        const entries = control.group.querySelectorAll('.abd-segmented__segment');

        expect(entries[0].querySelector('svg')).not.toBeNull();
        expect(entries[1].querySelector('.abd-segmented__glyph')).toBeNull();
        expect(entries[1].textContent).toBe('B');
    });

    it('mantiene el contrato de indices del strip clasico', () =>
    {
        const onChange = vi.fn();
        const control = mount({
            options: WAVEFORM_NAMES,
            glyphs: WAVEFORM_GLYPHS,
            value: 0,
            onChange,
        });

        control.setValue(4);
        expect(control.getValue()).toBe(4);
        expect(onChange).not.toHaveBeenCalled();

        control.group.querySelectorAll('.abd-segmented__segment')[2].click();
        expect(control.getValue()).toBe(2);
        expect(onChange).toHaveBeenCalledWith(2);
    });

    it('la marca activa sigue currentColor (el tema decide, el activo invierte)', () =>
    {
        const control = mount({
            options: WAVEFORM_NAMES,
            glyphs: WAVEFORM_GLYPHS,
            value: 0,
        });

        const active = control.group.querySelector('.is-active');

        expect(active).not.toBeNull();
        expect(active.querySelector('svg').innerHTML).toContain('currentColor');
    });
});

describe('Segmented — variante LED', () =>
{
    it('solo cambia el mueble: misma clase base, etiqueta de variante, mismo modelo', () =>
    {
        const onChange = vi.fn();
        const control = mount({
            options: WAVEFORM_NAMES,
            glyphs: WAVEFORM_GLYPHS,
            variant: 'led',
            value: 0,
            onChange,
        });

        expect(control.wrapper.classList.contains('abd-segmented')).toBe(true);
        expect(control.wrapper.classList.contains('abd-segmented--led')).toBe(true);
        expect(control.getLabels()).toEqual(WAVEFORM_NAMES);

        control.setValue(3);
        expect(control.getValue()).toBe(3);
        expect(onChange).not.toHaveBeenCalled();

        control.group.querySelectorAll('.abd-segmented__segment')[5].click();
        expect(control.getValue()).toBe(5);
        expect(onChange).toHaveBeenCalledWith(5);
    });

    it('el strip clasico no lleva etiqueta de variante', () =>
    {
        const control = mount({ options: WAVEFORM_NAMES, glyphs: WAVEFORM_GLYPHS });

        expect(control.wrapper.classList.contains('abd-segmented--led')).toBe(false);
    });
});
