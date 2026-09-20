/**
 * Segmented — the Select compact sibling.
 * Value model, availability and divergent-value semantics are the Select's
 * (index + disabled spec + kept divergent value); the interaction is a
 * radiogroup with roving tabindex. These tests pin that contract.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Segmented } from '../components/segmented.js';

describe('Segmented', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  it('construye un botón por opción, en orden, con el primero activo', () => {
    const segmented = new Segmented(container, { options: ['Sine', 'Triangle', 'Saw Up'] });

    expect(segmented.getLabels()).toEqual(['Sine', 'Triangle', 'Saw Up']);
    expect(container.querySelectorAll('.abd-segmented__segment')).toHaveLength(3);
    expect(segmented.getValue()).toBe(0);

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    expect(buttons[0].classList.contains('is-active')).toBe(true);
    expect(buttons[1].classList.contains('is-active')).toBe(false);
  });

  it('el click cambia el valor y dispara onChange solo en ediciones de usuario', () => {
    const onChange = vi.fn();
    const segmented = new Segmented(container, { options: ['Sine', 'Triangle'], onChange });

    segmented.setValue(1);   // programático: silencioso
    expect(onChange).not.toHaveBeenCalled();
    expect(segmented.getValue()).toBe(1);

    const first = container.querySelector('.abd-segmented__segment');
    first.click();           // usuario: notifica
    expect(onChange).toHaveBeenCalledWith(0);
    expect(segmented.getValue()).toBe(0);

    first.click();           // el segmento activo es un no-op
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('radio group: un solo tab stop (roving tabindex) y flechas que saltan deshabilitados', () => {
    const onChange = vi.fn();
    const segmented = new Segmented(container, {
      options: ['Free', 'Tempo Sync', 'Third'],
      disabled: [1],
      onChange,
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    // Roving tabindex: solo el activo es tabbable.
    expect(buttons[0].tabIndex).toBe(0);
    expect(buttons[1].tabIndex).toBe(-1);
    expect(buttons[2].tabIndex).toBe(-1);

    // ArrowRight salta el deshabilitado (1) y aterriza en 2.
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    buttons[0].dispatchEvent(right);

    expect(segmented.getValue()).toBe(2);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(buttons[2].classList.contains('is-active')).toBe(true);

    // ArrowLeft desde 2 vuelve a 0 (el 1 sigue vetado).
    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    buttons[2].dispatchEvent(left);

    expect(segmented.getValue()).toBe(0);
  });

  it('setDisabled recalcula en caliente; un valor que cae en opción vetada se conserva y marca divergente', () => {
    const segmented = new Segmented(container, { options: ['A', 'B', 'C'] });

    segmented.setValue(1);

    // El veto llega DESPUÉS del valor (otro parámetro cambió): B no se reescribe.
    segmented.setDisabled([1]);

    expect(segmented.isDivergent()).toBe(true);
    expect(container.querySelector('.abd-segmented').dataset.divergent).toBe('true');
    expect(segmented.getValue()).toBe(1);   // estado del host, no se corrompe

    // Y el segmento vetado no responde al click.
    const second = container.querySelectorAll('.abd-segmented__segment')[1];
    expect(second.disabled).toBe(true);

    second.click();
    expect(segmented.getValue()).toBe(1);
  });

  it('acepta entradas ricas { label, note } y las expone como title', () => {
    new Segmented(container, {
      options: [
        'NEURONiK',
        { label: 'Neurotik', note: 'Requiere el motor Neurotik' },
      ],
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    expect(buttons[0].title).toBe('');
    expect(buttons[1].title).toBe('Requiere el motor Neurotik');
  });

  it('el label apilado es opt-in, con <label for> hacia el grupo cuando hay id', () => {
    new Segmented(container, { options: ['On', 'Off'] });
    expect(container.querySelector('.abd-segmented--labelled')).toBeNull();

    new Segmented(container, { options: ['On', 'Off'], label: 'LFO 1', id: 'lfo1Waveform' });

    const label = container.querySelector('label.abd-segmented__label');
    // Dos instancias en el mismo container: la que manda es la segunda (con id).
    const group = container.querySelectorAll('.abd-segmented__group')[1];

    expect(label?.htmlFor).toBe('lfo1Waveform');
    expect(group?.id).toBe('lfo1Waveform');
    expect(group?.getAttribute('role')).toBe('radiogroup');
  });

  it('setValue acota índices imposibles y destroy desacopla sin dejar DOM', () => {
    const segmented = new Segmented(container, { options: ['A', 'B'] });

    segmented.setValue(99);
    expect(segmented.getValue()).toBe(1);

    segmented.setValue(-3);
    expect(segmented.getValue()).toBe(0);

    segmented.destroy();
    expect(container.querySelector('.abd-segmented')).toBeNull();
  });
});
