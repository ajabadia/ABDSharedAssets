/**
 * Modulation ring on the shared Knob: telemetry-driven paint, never state.
 *
 * The API contract (setModulation/clearModulation/getModulation) and the skin
 * rendering live here. Semantics match the native LookAndFeel: a SIGNED arc
 * from the value's angle to the modulated angle, double-stroked (halo + ring),
 * themed via --color-mod-ring. Set values through the ring must NEVER change
 * the knob's value nor fire onChange — telemetry is paint, not state.
 */

import { describe, expect, it, vi } from 'vitest';

import { Knob } from '../components/knob.js';

function mount (options = {})
{
    const container = document.createElement('div');

    document.body.append(container);

    const knob = new Knob(container, { size: 48, ...options });

    return { knob, container };
}

function ringOf (knob, suffix)
{
    return knob.dial.querySelector(`.abd-knob__mod-ring${suffix ?? ''}`);
}

function haloOf (knob)
{
    return knob.dial.querySelector('.abd-knob__mod-halo');
}

describe('Knob modulation ring — API', () =>
{
    it('does not touch the value nor fire onChange', () =>
    {
        const onChange = vi.fn();
        const { knob, container } = mount({ value: 0.3, onChange });

        knob.setModulation(0.8);

        expect(knob.getValue()).toBe(0.3);
        expect(onChange).not.toHaveBeenCalled();
        expect(knob.getModulation()).toBe(0.8);

        knob.destroy();
        container.remove();
    });

    it('clamps the signed amount to [-1, 1]', () =>
    {
        const { knob, container } = mount();

        knob.setModulation(4);
        expect(knob.getModulation()).toBe(1);

        knob.setModulation(-4);
        expect(knob.getModulation()).toBe(-1);

        knob.destroy();
        container.remove();
    });

    it('clears on NaN/undefined (no data this frame) and via clearModulation', () =>
    {
        const { knob, container } = mount();

        knob.setModulation(0.5);
        expect(knob.getModulation()).toBe(0.5);

        knob.setModulation(Number.NaN);
        expect(knob.getModulation()).toBe(0);

        knob.setModulation(0.5);
        knob.clearModulation();
        expect(knob.getModulation()).toBe(0);

        knob.destroy();
        container.remove();
    });
});

describe('Knob modulation ring — vector skin', () =>
{
    it('paints a signed double-stroke arc from the value angle', () =>
    {
        const { knob, container } = mount({ value: 0.25 });

        const ring = ringOf(knob);
        const halo = haloOf(knob);

        // Zero modulation: hidden.
        expect(ring.style.display).toBe('none');

        knob.setModulation(0.5);
        knob.render();

        // 0.5 of the 270-degree sweep = 135 degrees of arc, starting at the
        // value's own angle (0.25 * 270 = 67.5 degrees).
        const C = 2 * Math.PI * 20.5;
        const [span, , ] = ring.style.strokeDasharray.split(' ').map(Number);

        expect(Math.abs(span - (135 / 360) * C)).toBeLessThan(1.0e-9);
        expect(ring.style.display).not.toBe('none');
        expect(halo.style.display).not.toBe('none');

        // Signed: a negative modulation arcs BACKWARDS from the value.
        knob.setModulation(-0.25);
        knob.render();

        const [backSpan, backRest] = ring.style.strokeDasharray.split(' ').map(Number);
        const backOffset = Number(ring.style.strokeDashoffset);

        expect(Math.abs(backSpan - (67.5 / 360) * C)).toBeLessThan(1.0e-9);
        expect(backRest).toBeCloseTo(C, 6);
        // begin = value - |mod| en grados = 0.25*270 - 0.25*270 = 0 aqui, asi
        // que el anillo arranca en el inicio del recorrido y el offset es 0.
        //
        // El offset va en NEGATIVO a proposito: es lo que desplaza el trazo
        // HACIA DELANTE. Con el signo contrario (la circunferencia menos el
        // angulo) el anillo se pintaba en el lado equivocado del arco de valor,
        // y no encima. Medido en el navegador, no deducido.
        expect(backOffset).toBeCloseTo(0, 6);

        knob.destroy();
        container.remove();
    });

    it('hides both strokes again when the amount returns to zero', () =>
    {
        const { knob, container } = mount({ value: 0.5 });

        knob.setModulation(0.4);
        knob.render();
        expect(ringOf(knob).style.display).not.toBe('none');

        knob.clearModulation();
        expect(ringOf(knob).style.display).toBe('none');
        expect(haloOf(knob).style.display).toBe('none');

        knob.destroy();
        container.remove();
    });
});

describe('Knob modulation ring — ms2000 skin', () =>
{
    it('paints its own outer-radius arc', () =>
    {
        const { knob, container } = mount({ value: 0.25, skin: 'ms2000' });

        const ring = knob.dial.querySelector('.abd-ms2000-knob__mod-ring');

        expect(ring).not.toBeNull();

        knob.setModulation(0.5);

        const C = 2 * Math.PI * 21.5;
        const [span] = ring.style.strokeDasharray.split(' ').map(Number);

        expect(Math.abs(span - (135 / 360) * C)).toBeLessThan(1.0e-9);

        knob.destroy();
        container.remove();
    });
});
