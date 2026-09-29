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

  it('estado divergente: el radio vetado conserva la parada de Tab y su motivo se anuncia', () => {
    // El valor se queda en una opción vetada. Con el atributo nativo `disabled`
    // el radio perdería el foco y con él su aria-checked y el motivo del veto:
    // nada que enfocar, nada que leer. Vetado con aria-disabled sigue siendo
    // enfocable, así que la parada de Tab se queda donde vive el estado y el
    // lector anuncia "no disponible" junto con la nota.
    const segmented = new Segmented(container, {
      options: ['A', { label: 'B', note: 'Requiere el motor Neurotik' }, 'C'],
      value: 1,
      disabled: [1],
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    expect(segmented.isDivergent()).toBe(true);
    // El estado se queda donde está: el checked sigue siendo el vetado.
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[1].hasAttribute('disabled')).toBe(false);   // nativo = mudo
    expect(buttons[0].hasAttribute('aria-disabled')).toBe(false);
    // Y la parada de Tab se queda en el estado, no en la primera disponible.
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
    expect(buttons[2].tabIndex).toBe(-1);

    // El motivo viaja con el radio: no es solo un title de ratón.
    const describedBy = buttons[1].getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent).toBe('Requiere el motor Neurotik');
    // Y no se cuela en el nombre accesible del radio (vive fuera del botón).
    expect(buttons[1].textContent.trim()).toBe('B');

    // Con TODO vetado tampoco se queda mudo: el checked sigue siendo la parada.
    segmented.setDisabled([0, 1, 2]);
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
  });

  it('setDisabled recalcula en caliente; un valor que cae en opción vetada se conserva y marca divergente', () => {
    const segmented = new Segmented(container, { options: ['A', 'B', 'C'] });

    segmented.setValue(1);

    // El veto llega DESPUÉS del valor (otro parámetro cambió): B no se reescribe.
    segmented.setDisabled([1]);

    expect(segmented.isDivergent()).toBe(true);
    expect(container.querySelector('.abd-segmented').dataset.divergent).toBe('true');
    expect(segmented.getValue()).toBe(1);   // estado del host, no se corrompe

    // Y el segmento vetado no responde al click: el veto vive en los handlers,
    // no en el atributo nativo, para que el radio siga pudiendo anunciarse.
    const second = container.querySelectorAll('.abd-segmented__segment')[1];
    expect(second.getAttribute('aria-disabled')).toBe('true');

    second.click();
    expect(segmented.getValue()).toBe(1);
  });

  it('acepta entradas ricas { label, note } y las expone como descripción (nunca como title)', () => {
    new Segmented(container, {
      options: [
        'NEURONiK',
        { label: 'Neurotik', note: 'Requiere el motor Neurotik' },
      ],
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    // El motivo NO va en un title (eso solo lo ve el ratón): va como descripción
    // accesible, y solo lo lleva quien tiene nota.
    expect(buttons[0].hasAttribute('title')).toBe(false);
    expect(buttons[1].hasAttribute('title')).toBe(false);
    expect(buttons[0].hasAttribute('aria-describedby')).toBe(false);
    const describedBy = buttons[1].getAttribute('aria-describedby');
    expect(document.getElementById(describedBy).textContent).toBe('Requiere el motor Neurotik');
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

  it('una entrada marcada disabled veta por si misma, sin repetir el indice en la lista', () => {
    const segmented = new Segmented(container, {
      options: ['A', { label: 'B', disabled: true, note: 'Solo con Neurotik' }, 'C'],
      value: 0,
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];

    expect(segmented.isIndexDisabled(1)).toBe(true);
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
    expect(buttons[0].hasAttribute('aria-disabled')).toBe(false);

    // El veto es real: el click se rechaza y el valor no se mueve.
    buttons[1].click();
    expect(segmented.getValue()).toBe(0);

    // Y la flecha lo salta, como a cualquier vetado: A -> C.
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(segmented.getValue()).toBe(2);

    // Un valor que cae en una entrada vetada por flag sigue siendo divergente, y
    // conserva su parada de Tab (es el radio checked).
    segmented.setValue(1);
    expect(segmented.isDivergent()).toBe(true);
    expect(segmented.getValue()).toBe(1);
    expect(buttons[1].tabIndex).toBe(0);
  });

  it('setNote cambia el motivo del veto en caliente, sin ensuciar el nombre', () => {
    // Un veto puede depender de otro parámetro, así que su motivo también cambia:
    // setDisabled dice QUÉ está vetado, setNote explica POR QUÉ.
    const segmented = new Segmented(container, {
      options: ['A', { label: 'B', note: 'Requiere el motor Neurotik' }, 'C'],
      value: 0,
      disabled: [1],
    });

    const buttons = [...container.querySelectorAll('.abd-segmented__segment')];
    const firstId = buttons[1].getAttribute('aria-describedby');

    // Mismo nodo, texto nuevo: no se reescribe la descripción a cada cambio.
    segmented.setNote(1, 'Requiere el motor Neurotik 2.0');
    expect(buttons[1].getAttribute('aria-describedby')).toBe(firstId);
    expect(document.getElementById(firstId).textContent).toBe('Requiere el motor Neurotik 2.0');

    // Y aparece un motivo donde no había: nodo nuevo, cableado y resoluble.
    segmented.setNote(0, 'Solo con Neurotik');

    const newId = buttons[0].getAttribute('aria-describedby');

    expect(newId).toBeTruthy();
    expect(newId).not.toBe(firstId);
    expect(document.getElementById(newId).textContent).toBe('Solo con Neurotik');
    expect(buttons[0].textContent.trim()).toBe('A');        // el motivo no entra en el nombre
    // El contenedor de notas vive DETRAS del grupo: fuera del orden de lectura.
    expect([...segmented.wrapper.children].map((el) => el.className))
      .toEqual(['abd-segmented__group', 'abd-segmented__notes']);

    // Retirarlo no deja rastro: ni atributo ni nodo huérfano.
    segmented.setNote(0, '');
    expect(buttons[0].hasAttribute('aria-describedby')).toBe(false);
    expect(document.getElementById(newId)).toBeNull();

    // Ni contenedor vacío cuando no queda ningún motivo.
    segmented.setNote(1, '');
    expect(container.querySelector('.abd-segmented__notes')).toBeNull();

    // Índices imposibles y notas vacías no rompen nada.
    segmented.setNote(99, 'fantasma');
    segmented.setNote(1, null);
    expect(segmented.getNotes()).toEqual(['', '', '']);
  });
});
