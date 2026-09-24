/**
 * NumberBox — the numeric stepper (BPM, MIDI channel, octaves...).
 * ================================================================
 *
 * Pins the family contract on the ported ABDEep furniture: −/+ buttons,
 * direct typing, real-number value model (the caller converts at the
 * boundary), clamp to [min,max], integer/step semantics, silent setValue,
 * onChange only on user edits, disabled gating, clean destroy.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NumberBox } from '../components/numberbox.js';

function mount (options)
{
    const container = document.createElement('div');

    document.body.appendChild(container);

    return new NumberBox(container, options);
}

beforeEach(() =>
{
    document.body.innerHTML = '';
});

describe('NumberBox — contrato de familia', () =>
{
    it('pinta −/+/campo (y etiqueta con <label for> cuando le dan id)', () =>
    {
        const control = mount({ value: 120, min: 20, max: 400, label: 'BPM', id: 'bpm-box' });

        expect(control.wrapper.querySelector('.abd-numberbox__btn--decrement').textContent).toBe('−');
        expect(control.wrapper.querySelector('.abd-numberbox__btn--increment').textContent).toBe('+');
        expect(control.field.getAttribute('role')).toBe('spinbutton');
        expect(control.wrapper.querySelector('label').htmlFor).toBe('bpm-box');
        expect(control.field.id).toBe('bpm-box');
    });

    it('setValue es silencioso; onChange solo con edicion de usuario', () =>
    {
        const onChange = vi.fn();
        const control = mount({ value: 120, min: 20, max: 400, onChange });

        control.setValue(240);

        expect(control.getValue()).toBe(240);
        expect(onChange).not.toHaveBeenCalled();

        control.incButton.click();

        expect(control.getValue()).toBe(241);
        expect(onChange).toHaveBeenCalledWith(241);
    });

    it('los botones aplican el paso y el −/− respeta el signo', () =>
    {
        const control = mount({ value: 120, min: 0, max: 400, step: 10 });

        control.decButton.click();
        expect(control.getValue()).toBe(110);

        control.incButton.click();
        control.incButton.click();
        expect(control.getValue()).toBe(130);
    });
});

describe('NumberBox — limites y semantica de valor', () =>
{
    it('clampea al rango en botones y en setValue', () =>
    {
        const control = mount({ value: 100, min: 0, max: 127 });

        control.setValue(999);
        expect(control.getValue()).toBe(127);

        control.setValue(-5);
        expect(control.getValue()).toBe(0);

        for (let i = 0; i < 5; i += 1) control.decButton.click();
        expect(control.getValue()).toBe(0);
    });

    it('el boton muerto en el borde se marca (is-at-edge) sin bloquear el control', () =>
    {
        const control = mount({ value: 0, min: 0, max: 127 });

        expect(control.decButton.classList.contains('is-at-edge')).toBe(true);
        expect(control.incButton.classList.contains('is-at-edge')).toBe(false);

        control.setValue(127);

        expect(control.incButton.classList.contains('is-at-edge')).toBe(true);
    });

    it('entero: redondea lo tecleado; float con step: ajusta al paso', () =>
    {
        const int = mount({ value: 1, min: 0, max: 16, integer: true });
        const float = mount({ value: 0.5, min: 0, max: 1, step: 0.25, integer: false });

        int.field.value = '3.7';
        int.field.dispatchEvent(new Event('blur'));
        expect(int.getValue()).toBe(4);

        float.field.value = '0.4';
        float.field.dispatchEvent(new Event('blur'));
        expect(float.getValue()).toBe(0.5);   // snap a 0.25
    });

    it('la unidad vive dentro de la caja y el valor por defecto es entero con step 1', () =>
    {
        const control = mount({ value: 30, min: 20, max: 400, unit: 'bpm' });

        expect(control.wrapper.querySelector('.abd-numberbox__unit').textContent).toBe('bpm');
        expect(control.wrapper.querySelector('.abd-numberbox__field').value).toBe('30');
    });
});

describe('NumberBox — teclado, gating y ciclo de vida', () =>
{
    it('ArrowUp/ArrowDown nudgeo, Enter confirma, focus selecciona', () =>
    {
        const control = mount({ value: 10, min: 0, max: 20 });

        control.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(control.getValue()).toBe(11);

        control.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(control.getValue()).toBe(10);

        control.field.value = '15';
        control.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        control.field.dispatchEvent(new Event('blur'));
        expect(control.getValue()).toBe(15);
    });

    it('texto basura vuelve al valor actual (sin spam de errores)', () =>
    {
        const control = mount({ value: 42, min: 0, max: 100 });

        control.field.value = 'abc';
        control.field.dispatchEvent(new Event('blur'));

        expect(control.getValue()).toBe(42);
        expect(control.field.value).toBe('42');
    });

    it('setDisabled apaga botones y campo; el valor se conserva', () =>
    {
        const control = mount({ value: 7, min: 0, max: 16 });

        control.setDisabled(true);

        expect(control.incButton.disabled).toBe(true);
        expect(control.field.disabled).toBe(true);
        expect(control.getValue()).toBe(7);
    });

    it('destroy limpia listeners y DOM', () =>
    {
        const onChange = vi.fn();
        const control = mount({ value: 5, min: 0, max: 10, onChange });
        const wrapper = control.wrapper;

        control.destroy();

        expect(document.body.contains(wrapper)).toBe(false);

        expect(() => control.incButton.click()).not.toThrow();
    });
});
