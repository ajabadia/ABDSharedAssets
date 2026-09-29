/**
 * Tests del Wheel compartido (rueda filmstrip PITCH/MOD).
 *
 * Lo unico que la rueda dice de si misma es su label y su readout formateado. El
 * readout no puede ser solo pintura: el MISMO texto viaja como `aria-valuetext` en
 * el rango nativo. Sin el, el lector anuncia el numero crudo del rango (0..127, o
 * -8192..8191 en la rueda de pitch) mientras en pantalla se lee "64" o "+2".
 *
 * Aviso honesto: esto es una asercion de DOM. En Chromium medido
 * (smoke/a11y-probe.html) el arbol de accesibilidad NO expone `aria-valuetext`;
 * por eso el smoke afirma rol y nombre de la rueda, no su texto de valor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import './setup.js';
import { Wheel } from '../components/wheel.js';

/** Un hueco por rueda: contenedor y rueda son 1:1, y la rueda lo repinta entero. */
function makeSlot()
{
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    return slot;
}

/** Lo anunciado tiene que ser EXACTAMENTE lo que se lee en pantalla. */
function expectAnnouncedAsReadout(wheel)
{
    const slider = wheel.container.querySelector('.kbd-wheel-slider');
    const readout = wheel.container.querySelector('.kbd-wheel-value');

    expect(slider.getAttribute('aria-valuetext')).toBe(readout.textContent);
}

beforeEach(() =>
{
    document.body.innerHTML = '';
});

describe('Wheel', () =>
{
    it('anuncia el readout formateado, no el numero crudo del rango', () =>
    {
        const wheel = new Wheel(makeSlot(), { type: 'mod', spriteUrl: 'test.png' });
        const slider = wheel.container.querySelector('.kbd-wheel-slider');

        expect(slider.getAttribute('aria-valuetext')).toBe('0');
        expectAnnouncedAsReadout(wheel);

        wheel.setValue(64, false);        // silencioso: no dispara onChange

        expect(slider.value).toBe('64');
        expect(slider.getAttribute('aria-valuetext')).toBe('64');
        expectAnnouncedAsReadout(wheel);

        wheel.destroy();
    });

    it('la rueda de pitch anuncia semitonos, no -8192..8191', () =>
    {
        const wheel = new Wheel(makeSlot(), { type: 'pitch', spriteUrl: 'test.png' });
        const slider = wheel.container.querySelector('.kbd-wheel-slider');

        wheel.setValue(8192, false);                  // el rango llega a 8191: recorta
        expect(slider.value).toBe('8191');            // el rango sigue siendo el crudo
        expect(slider.getAttribute('aria-valuetext')).toBe('+2');

        wheel.setValue(-4096, false);
        expect(slider.getAttribute('aria-valuetext')).toBe('-1');
        expectAnnouncedAsReadout(wheel);

        wheel.destroy();
    });

    it('al mover el rango el texto anunciado viaja con el valor', () =>
    {
        const onChange = vi.fn();
        const wheel = new Wheel(makeSlot(), { type: 'mod', spriteUrl: 'test.png', onChange });
        const slider = wheel.container.querySelector('.kbd-wheel-slider');

        slider.value = '77';
        slider.dispatchEvent(new Event('input', { bubbles: true }));

        expect(onChange).toHaveBeenCalledWith(77);
        expect(slider.getAttribute('aria-valuetext')).toBe('77');
        expectAnnouncedAsReadout(wheel);

        wheel.destroy();
    });

    it('el valueFormatter del host manda en las dos vias', () =>
    {
        const wheel = new Wheel(makeSlot(), {
            type: 'mod',
            spriteUrl: 'test.png',
            valueFormatter: (val) => `${Math.round(val / 127 * 100)}%`,
        });
        const slider = wheel.container.querySelector('.kbd-wheel-slider');

        wheel.setValue(127, false);

        expect(slider.getAttribute('aria-valuetext')).toBe('100%');
        expectAnnouncedAsReadout(wheel);

        wheel.destroy();
    });

    it('un contenedor con contenido previo no cuelga la rueda', () =>
    {
        // El caso reproducido en el smoke: render() salia con `return` si el
        // contenedor ya tenia hijos, asi que this.slider quedaba sin definir y
        // attachEvents reventaba despues ("Cannot read properties of undefined
        // (reading 'addEventListener')"), un error que no decia nada de la causa.
        const slot = makeSlot();
        slot.innerHTML = '<span class="stale">contenido previo</span>';

        const wheel = new Wheel(slot, { type: 'pitch', spriteUrl: 'test.png' });

        expect(slot.querySelectorAll('.kbd-wheel-slider')).toHaveLength(1);
        expect(slot.querySelector('.stale')).toBeNull();      // el contenedor es suyo
        expect(slot.classList.contains('kbd-wheel-wrapper')).toBe(true);

        // Y no es una rueda de adorno: responde como cualquier otra.
        wheel.setValue(8191, false);
        expect(slot.querySelector('.kbd-wheel-value').textContent).toBe('+2');
        expectAnnouncedAsReadout(wheel);

        wheel.destroy();
        expect(slot.innerHTML).toBe('');
    });

    it('la segunda rueda se queda el contenedor, sin duplicar el rango', () =>
    {
        const slot = makeSlot();

        const first = new Wheel(slot, { type: 'mod', spriteUrl: 'test.png' });
        const second = new Wheel(slot, { type: 'mod', spriteUrl: 'test.png' });

        expect(slot.querySelectorAll('.kbd-wheel-slider')).toHaveLength(1);
        // La primera apunta a nodos que ya no estan: el contenedor es de una.
        expect(slot.contains(first.slider)).toBe(false);

        second.setValue(50, false);

        expect(slot.querySelector('.kbd-wheel-value').textContent).toBe('50');
        expectAnnouncedAsReadout(second);

        second.destroy();
    });
});
