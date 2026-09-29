/**
 * Tests for the ABDSharedAssets control family (knob, slider, toggle).
 *
 * What is pinned here:
 *   - the family contract: same constructor/setValue/getValue/destroy/onChange
 *     across Knob, Slider and Toggle (parity with Wheel is what makes them a family);
 *   - normalised 0..1 value model with clamping at both ends;
 *   - programmatic setValue does NOT fire onChange, user edits DO;
 *   - gesture callbacks (onDragStart/onDragEnd) fire once per drag;
 *   - destroy() removes the DOM and detaches listeners (no leaks).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Knob } from '../components/knob.js';
import { Select } from '../components/select.js';
import { Slider } from '../components/slider.js';
import { Toggle } from '../components/toggle.js';
import { attachDrag, clamp } from '../components/drag-core.js';
import { registerSkin, getSkin, applySkin, skinNames, CONTROL_KIND } from '../components/skins/index.js';

/**
 * Fire a pointer drag on an element. `axis` picks the moving axis: 'y' (vertical,
 * the knob's natural drag) or 'x' (horizontal, the slider's). Coordinates start at
 * `from` and end at `to` along that axis; the other axis stays at 100.
 */
function drag (element, { from = 100, to = 175, axis = 'y' } = {})
{
  const point = (v) => (axis === 'y' ? { clientY: v, clientX: 100 } : { clientX: v, clientY: 100 });

  element.dispatchEvent(new PointerEvent('pointerdown', {
    ...point(from), bubbles: true, pointerId: 1,
  }));
  element.dispatchEvent(new PointerEvent('pointermove', {
    ...point(to), bubbles: true, pointerId: 1,
  }));
  element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
}

describe('family contract parity', () =>
{
  const cases = [
    ['Knob', Knob],
    ['Slider', Slider],
    ['Toggle', Toggle],
    ['Select', Select],
  ];

  for (const [name, Control] of cases)
  {
    it(`${name} exposes the family API`, () =>
    {
      const host = document.createElement('div');
      document.body.appendChild(host);

      const control = new Control(host, { label: 'L' });

      expect(typeof control.setValue).toBe('function');
      expect(typeof control.getValue).toBe('function');
      expect(typeof control.destroy).toBe('function');
      expect(control.getValue()).toBeDefined();

      control.destroy();
      expect(host.querySelector(`[class*='${name.toLowerCase()}']`)).toBeNull();
      host.remove();
    });
  }
});

describe('Knob', () =>
{
  let host;

  beforeEach(() =>
  {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('clamps out-of-range values', () =>
  {
    const knob = new Knob(host, { value: 0.5 });
    knob.setValue(2);
    expect(knob.getValue()).toBe(1);
    knob.setValue(-3);
    expect(knob.getValue()).toBe(0);
    knob.destroy();
  });

  it('a user drag past the top clamps and fires onChange per move', () =>
  {
    const changes = [];
    const knob = new Knob(host, { value: 0.5, onChange: (v) => changes.push(v) });

    drag(knob.dial, { from: 300, to: 0 });   // big upward drag

    expect(knob.getValue()).toBe(1);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.at(-1)).toBe(1);
    knob.destroy();
  });

  it('setValue does NOT fire onChange (programmatic updates are silent)', () =>
  {
    const onChange = vi.fn();
    const knob = new Knob(host, { value: 0.5, onChange });

    knob.setValue(0.9);
    expect(onChange).not.toHaveBeenCalled();
    expect(knob.getValue()).toBe(0.9);
    knob.destroy();
  });

  it('gesture callbacks fire once per drag, not per pixel', () =>
  {
    const events = [];
    const knob = new Knob(host, {
      value: 0.5,
      onDragStart: () => events.push('start'),
      onDragEnd: () => events.push('end'),
    });

    drag(knob.dial, { from: 200, to: 150 });
    expect(events).toEqual(['start', 'end']);
    knob.destroy();
  });

  it('drag tracks the pointer 1:1 across multiple moves (no acceleration)', () =>
  {
    // Regression: deltas used to be measured from the drag START and ADDED to the
    // value each move, so the value compounded and the control accelerated. With
    // N moves of d px the total travel must be N*d, not sum(k*d) for k=1..N.
    const knob = new Knob(host, { value: 0 });

    knob.dial.dispatchEvent(new PointerEvent('pointerdown', { clientY: 300, bubbles: true, pointerId: 1 }));

    for (let i = 1; i <= 4; ++i)
      knob.dial.dispatchEvent(new PointerEvent('pointermove', { clientY: 300 - i * 10, bubbles: true, pointerId: 1 }));

    knob.dial.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));

    // 4 moves of 10 px on a 150 px lane, knob scales by 0.75: (40/150)*0.75.
    expect(knob.getValue()).toBeCloseTo((40 / 150) * 0.75, 5);
    knob.destroy();
  });

  it('renders aria slider semantics and updates them', () =>
  {
    const knob = new Knob(host, { value: 0.1 });
    expect(knob.dial.getAttribute('role')).toBe('slider');
    expect(knob.dial.getAttribute('aria-valuemin')).toBe('0');
    expect(knob.dial.getAttribute('aria-valuemax')).toBe('1');

    knob.setValue(0.75);
    expect(Number(knob.dial.getAttribute('aria-valuenow'))).toBeCloseTo(0.75);
    knob.destroy();
  });

  it('the slider dial carries an accessible name', () =>
  {
    // The visible label doubles as the name (how NEURONiK drawer knobs are
    // built: they gain the accessible name for free).
    const named = new Knob(host, { label: 'Cutoff' });
    expect(named.dial.getAttribute('aria-label')).toBe('Cutoff');
    named.destroy();

    // Explicit override, for knobs without a visible label or with a
    // different spoken name.
    const explicit = new Knob(host, { ariaLabel: 'Filter cutoff' });
    expect(explicit.dial.getAttribute('aria-label')).toBe('Filter cutoff');
    expect(explicit.wrapper.querySelector('.abd-knob__label')).toBeNull();
    explicit.destroy();

    // Explicit beats visible when both are given.
    const both = new Knob(host, { label: 'Level', ariaLabel: 'Master level' });
    expect(both.dial.getAttribute('aria-label')).toBe('Master level');
    both.destroy();

    // No label, no name: the dial stays unnamed rather than lying.
    const anonymous = new Knob(host, {});
    expect(anonymous.dial.getAttribute('aria-label')).toBeNull();
    anonymous.destroy();
  });
});

describe('Slider', () =>
{
  let host;

  beforeEach(() =>
  {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('drag right increases, drag left decreases (horizontal)', () =>
  {
    const slider = new Slider(host, { value: 0.5 });

    drag(slider.track, { from: 100, to: 160, axis: 'x' });   // to the right
    const afterRight = slider.getValue();
    expect(afterRight).toBeGreaterThan(0.5);

    drag(slider.track, { from: 100, to: 40, axis: 'x' });    // to the left
    expect(slider.getValue()).toBeLessThan(afterRight);
    slider.destroy();
  });

  it('vertical orientation moves the thumb by bottom, not left', () =>
  {
    const slider = new Slider(host, { orientation: 'vertical', value: 0.25 });
    slider.setValue(0.8);

    expect(slider.thumb.style.bottom).toBe('80%');
    expect(slider.thumb.style.left).toBe('');
    slider.destroy();
  });

  it('respects the family setValue/onChange contract', () =>
  {
    const onChange = vi.fn();
    const slider = new Slider(host, { value: 0.5, onChange });

    slider.setValue(0.1);
    expect(onChange).not.toHaveBeenCalled();

    drag(slider.track, { from: 200, to: 120 });
    expect(onChange).toHaveBeenCalled();
    slider.destroy();
  });
});

describe('Toggle', () =>
{
  let host;

  beforeEach(() =>
  {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('clicks toggle the latched value and fire onChange', () =>
  {
    const changes = [];
    const toggle = new Toggle(host, { label: 'SYNC', onChange: (v) => changes.push(v) });

    toggle.button.click();
    expect(toggle.getValue()).toBe(true);
    toggle.button.click();
    expect(toggle.getValue()).toBe(false);
    expect(changes).toEqual([true, false]);
    toggle.destroy();
  });

  it('momentary mode reports press and release instead of latching', () =>
  {
    const changes = [];
    const toggle = new Toggle(host, { momentary: true, onChange: (v) => changes.push(v) });

    toggle.button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(toggle.getValue()).toBe(true);
    toggle.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(toggle.getValue()).toBe(false);
    expect(changes).toEqual([true, false]);
    toggle.destroy();
  });

  it('el aviso es de TRANSICION: un release repetido (o sin press) no re-notifica', () =>
  {
    const changes = [];
    const toggle = new Toggle(host, { momentary: true, onChange: (v) => changes.push(v) });

    // pointerup sin pointerdown: el valor ya estaba en false, no hay transicion.
    toggle.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(changes).toEqual([]);

    toggle.button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    toggle.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    toggle.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));   // repetido
    toggle.button.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })); // release de mas
    expect(changes).toEqual([true, false]);   // una vez por transicion, no por evento

    toggle.destroy();
  });

  it('state is carried by aria-pressed, not by JS-only classes', () =>
  {
    const toggle = new Toggle(host, { value: false });
    expect(toggle.button.getAttribute('aria-pressed')).toBe('false');

    toggle.setValue(true);
    expect(toggle.button.getAttribute('aria-pressed')).toBe('true');
    toggle.destroy();
  });
});

describe('Select', () =>
{
  let host;

  const ENTRIES = ['Off', 'LFO 1', 'LFO 2', 'Amp Env'];

  const build = (options = {}) =>
  {
    const select = new Select(host, { options: ENTRIES, ...options });

    document.body.appendChild(select.wrapper);
    return select;
  };

  /** Pick an index like a user would (a real select's change event). */
  const pick = (select, index) =>
  {
    select.field.value = `${index}`;
    select.field.dispatchEvent(new Event('change'));
  };

  beforeEach(() =>
  {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('carries the option index as its value', () =>
  {
    const select = build({ value: 2 });

    expect(select.getValue()).toBe(2);
    expect(select.field.value).toBe('2');
    select.destroy();
  });

  it('clamps out-of-range values to the list', () =>
  {
    const select = build({ value: 99 });

    expect(select.getValue()).toBe(3);
    select.setValue(-5);
    expect(select.getValue()).toBe(0);
    select.destroy();
  });

  it('a user pick fires onChange with the index; setValue stays silent', () =>
  {
    const onChange = vi.fn();
    const select = build({ value: 0, onChange });

    select.setValue(1);
    expect(onChange).not.toHaveBeenCalled();

    pick(select, 3);
    expect(onChange).toHaveBeenCalledWith(3);
    expect(select.getValue()).toBe(3);
    select.destroy();
  });

  it('takes { label, disabled, note } entries and makes the note the option description', () =>
  {
    // El motivo del veto NO va en un title (solo lo ve el ratón): va como
    // descripción accesible del option, y el nodo con el texto vive FUERA de él
    // (dentro se tragaría en el nombre accesible de la opción).
    // Y el veto lo aplica el flag `disabled` de la entrada: sin lista ni spec.
    const select = new Select(host, {
      options: ['Off', { label: 'Pitch Quantize', disabled: true, note: 'Requires the Neurotik engine' }],
    });

    const option = select.field.options[1];
    const note = document.getElementById(option.getAttribute('aria-describedby'));

    expect(select.getLabels()).toEqual(['Off', 'Pitch Quantize']);
    expect(option.textContent).toBe('Pitch Quantize');
    expect(option.hasAttribute('title')).toBe(false);
    expect(option.disabled).toBe(true);
    expect(note.textContent).toBe('Requires the Neurotik engine');
    expect(option.contains(note)).toBe(false);          // fuera del option
    expect(select.field.options[0].hasAttribute('aria-describedby')).toBe(false);
    select.destroy();
  });

  it('el motivo del veto llega al campo cuando la opcion vetada es el valor actual', () =>
  {
    // Paridad con el estado divergente de Segmented: nadie enfoca un <option>, asi
    // que con el valor en una opcion vetada quien anuncia el motivo es el campo.
    // Medido en Chromium: antes el combobox soltaba description="" y la nota solo
    // estaba en el option.
    const select = new Select(host, {
      options: ['Off', { label: 'Pitch Quantize', note: 'Requires the Neurotik engine' }],
      value: 1,
      disabled: [1],
    });

    expect(select.isDivergent()).toBe(true);

    const noteId = select.field.getAttribute('aria-describedby');

    expect(noteId).toBeTruthy();
    expect(document.getElementById(noteId).textContent).toBe('Requires the Neurotik engine');

    // Una opcion sin motivo deja el campo sin descripcion...
    select.setValue(0);
    expect(select.field.hasAttribute('aria-describedby')).toBe(false);

    // ...pero una descripcion del host no se pisa: conviven las dos.
    select.field.setAttribute('aria-describedby', 'host-note');
    select.setValue(1);
    expect(select.field.getAttribute('aria-describedby')).toBe(`host-note ${noteId}`);

    select.setValue(0);
    expect(select.field.getAttribute('aria-describedby')).toBe('host-note');

    select.destroy();
  });

  it('setNote cambia el motivo en caliente y el campo sigue al valor actual', () =>
  {
    // setDisabled dice QUE esta vetado; setNote, POR QUE. Y como un <option> no
    // recibe foco, el campo tiene que seguir al valor actual cuando el motivo cambia.
    const select = new Select(host, {
      options: ['Off', { label: 'Pitch Quantize', note: 'Requires the Neurotik engine' }],
      value: 1,
      disabled: [1],
    });

    const option = select.field.options[1];
    const firstId = option.getAttribute('aria-describedby');

    expect(select.field.getAttribute('aria-describedby')).toBe(firstId);

    select.setNote(1, 'Requires the Neurotik engine (running)');

    expect(option.getAttribute('aria-describedby')).toBe(firstId);      // misma nota
    expect(document.getElementById(firstId).textContent).toBe('Requires the Neurotik engine (running)');
    expect(select.field.getAttribute('aria-describedby')).toBe(firstId);

    // Retirar el motivo lo retira de las dos via: option y campo.
    select.setNote(1, '');
    expect(option.hasAttribute('aria-describedby')).toBe(false);
    expect(select.field.hasAttribute('aria-describedby')).toBe(false);
    expect(host.querySelector('.abd-select__notes')).toBeNull();

    // Y el valor actual puede ganar un motivo que antes no tenia.
    select.setNote(1, 'Solo con Neurotik');

    const newId = option.getAttribute('aria-describedby');

    expect(select.field.getAttribute('aria-describedby')).toBe(newId);
    expect(document.getElementById(newId).textContent).toBe('Solo con Neurotik');
    expect(option.textContent).toBe('Pitch Quantize');    // el motivo no entra en el nombre
    // El contenedor de notas vive DETRAS del control: fuera del orden de lectura.
    expect([...select.wrapper.children].map((el) => el.className))
      .toEqual(['abd-select__field', 'abd-select__notes']);

    // Indices imposibles y notas vacias no rompen nada.
    select.setNote(99, 'fantasma');
    select.setNote(1, null);
    expect(select.getNotes()).toEqual(['', '']);
    expect(select.field.hasAttribute('aria-describedby')).toBe(false);

    select.destroy();
  });

  it('una entrada marcada disabled veta por si misma, sin repetir el indice en la lista', () =>
  {
    // El flag se documentaba ({ label, disabled, note }) pero isIndexDisabled solo
    // miraba la lista: se anotaba el veto y no vetaba nada.
    const select = new Select(host, {
      options: ['Off', { label: 'Pitch Quantize', disabled: true }],
      value: 0,
    });

    expect(select.isIndexDisabled(1)).toBe(true);
    expect(select.field.options[1].disabled).toBe(true);
    expect(select.field.options[0].disabled).toBe(false);
    expect(select.isDivergent()).toBe(false);

    // Y el veto es real: el pick se rechaza.
    pick(select, 1);
    expect(select.getValue()).toBe(0);

    // La lista suma vetos encima; quitarlos no resucita el flag.
    select.setDisabled([0]);
    expect(select.isIndexDisabled(0)).toBe(true);

    select.setDisabled([]);
    expect(select.isIndexDisabled(0)).toBe(false);
    expect(select.isIndexDisabled(1)).toBe(true);

    // Un valor que cae en una entrada vetada por flag sigue siendo divergente.
    select.setValue(1);
    expect(select.isDivergent()).toBe(true);
    expect(select.getValue()).toBe(1);

    select.destroy();
  });

  it('marks disabled entries and refuses to pick them', () =>
  {
    const onChange = vi.fn();
    const select = build({ value: 0, disabled: [2, 3], onChange });

    expect(select.field.options[2].disabled).toBe(true);
    expect(select.field.options[0].disabled).toBe(false);

    pick(select, 2);

    expect(onChange).not.toHaveBeenCalled();
    expect(select.getValue()).toBe(0);        // unchanged
    expect(select.field.value).toBe('0');     // and the field is put back
    select.destroy();
  });

  it('takes a predicate as the disabled spec', () =>
  {
    const select = build({ disabled: (entry) => entry.label.startsWith('LFO') });

    expect(select.field.options[1].disabled).toBe(true);
    expect(select.field.options[3].disabled).toBe(false);
    select.destroy();
  });

  it('KEEPS a value that lands on a disabled entry and flags it', () =>
  {
    // The host can restore a preset aiming at an option this UI cannot offer.
    // Rewriting it would be silent state corruption: it is shown and flagged.
    const select = build({ value: 2, disabled: [2] });

    expect(select.getValue()).toBe(2);
    expect(select.field.value).toBe('2');
    expect(select.isDivergent()).toBe(true);
    expect(select.wrapper.dataset.divergent).toBe('true');
    select.destroy();
  });

  it('setDisabled recomputes availability without touching the value', () =>
  {
    const onChange = vi.fn();
    const select = build({ value: 3, disabled: [], onChange });

    expect(select.isDivergent()).toBe(false);

    select.setDisabled([3]);                       // engine changed under it
    expect(select.isDivergent()).toBe(true);
    expect(select.getValue()).toBe(3);
    expect(onChange).not.toHaveBeenCalled();

    select.setDisabled([]);
    expect(select.isDivergent()).toBe(false);
    expect(select.field.options[3].disabled).toBe(false);
    select.destroy();
  });

  it('is the one family member with no drag behaviour (a drag must not pick)', () =>
  {
    const onChange = vi.fn();
    const select = build({ value: 0, onChange });

    select.field.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    select.field.dispatchEvent(new PointerEvent('pointermove', { clientY: 20, bubbles: true }));
    select.field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    expect(select.getValue()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    select.destroy();
  });

  it('associates its label with the field when given an id', () =>
  {
    const select = build({ id: 'control-lfo1Waveform', label: 'WAVE' });

    expect(select.field.id).toBe('control-lfo1Waveform');
    expect(select.labelEl.tagName).toBe('LABEL');
    expect(select.labelEl.htmlFor).toBe('control-lfo1Waveform');
    expect(select.wrapper.classList.contains('abd-select--labelled')).toBe(true);
    select.destroy();
  });

  it('stacks only when labelled (the bare .abd-select of the CSS library stays valid)', () =>
  {
    // `controls.css` styles a raw <select class="abd-select"> and pages load both
    // sheets: the block must not impose the flex column on it.
    const bare = new Select(host, { options: ['a', 'b'] });

    expect(bare.wrapper.classList.contains('abd-select--labelled')).toBe(false);
    bare.destroy();
  });

  it('handles an empty list without crashing', () =>
  {
    const select = new Select(host, { options: [] });

    expect(select.getValue()).toBe(0);
    expect(select.field.disabled).toBe(true);
    select.destroy();
  });

  it('destroy removes the DOM and detaches the listener', () =>
  {
    const onChange = vi.fn();
    const select = build({ onChange });
    const field = select.field;

    select.destroy();

    expect(host.querySelector('.abd-select')).toBeNull();

    field.dispatchEvent(new Event('change'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('skins', () =>
{
  let host;

  beforeEach(() =>
  {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('known skins are registered as renderer maps', () =>
  {
    for (const name of ['vector', 'ms2000', 'junio'])
    {
      const map = getSkin(name);

      expect(map).toBeTypeOf('object');
      expect(map.knob).toBeTypeOf('function');   // at least the knob renderer
    }
    expect(skinNames()).toContain('ms2000');
  });

  it('unknown skin falls back to vector instead of crashing', () =>
  {
    const knob = new Knob(host, { skin: 'no-existe' });
    expect(knob.skin).toBeDefined();
    expect(knob.dial.querySelector('.abd-skin--vector')).not.toBeNull();
    knob.destroy();
  });

  it('ms2000 skin rotates its indicator with the value', () =>
  {
    const knob = new Knob(host, { skin: 'ms2000', value: 0.5 });
    const group = knob.dial.querySelector('.abd-ms2000-knob__indicator-group');

    expect(group).not.toBeNull();
    expect(group.style.transform).toContain('0deg');   // -135 + 0.5*270

    knob.setValue(1);
    expect(group.style.transform).toContain('135deg'); // -135 + 270
    knob.destroy();
  });

  it('junio skin paints the filmstrip and rotates it', () =>
  {
    const knob = new Knob(host, { skin: 'junio', value: 0 });
    const ring = knob.dial.querySelector('.abd-knob-ring');
    const marker = ring?.querySelector('.knob');

    // Junio exacto: el filmstrip es el ARO (grafico + marcas radiales de fondo)
    // y la aguja es la linea que rota dentro de el.
    expect(ring.style.backgroundImage).toContain('knob.png');
    expect(marker.style.transform).toContain('-135deg');   // 0*270 - 135

    knob.setValue(1);
    expect(marker.style.transform).toContain('135deg');    // 270 - 135
    knob.destroy();
  });

  it('behaviour is skin-independent: drag works the same on every skin', () =>
  {
    for (const skin of ['vector', 'ms2000', 'junio'])
    {
      const changes = [];
      const knob = new Knob(host, { skin, value: 0.5, onChange: (v) => changes.push(v) });

      drag(knob.dial, { from: 200, to: 120 });
      expect(knob.getValue()).toBeGreaterThan(0.5);
      expect(changes.length).toBeGreaterThan(0);
      knob.destroy();
    }
  });

  it('custom skins can be registered by a project', () =>
  {
    let destroyed = false;

    registerSkin('test-custom', {
      knob (el)
      {
        const root = document.createElement('div');

        root.className = 'abd-skin--test-custom';
        el.appendChild(root);
        return { root, update () {}, destroy () { destroyed = true; } };
      },
    });

    const knob = new Knob(host, { skin: 'test-custom' });

    expect(knob.dial.querySelector('.abd-skin--test-custom')).not.toBeNull();

    knob.destroy();
    expect(destroyed).toBe(true);   // skin destroy() is honoured
  });

  it('a kind with no renderer anywhere fails with a descriptive error', () =>
  {
    // Regression: a new control type used to fail as "fn is not a function",
    // which reads as a typo in the caller instead of a missing renderer.
    const alien = { options: {}, getValue: () => 0 };

    alien[CONTROL_KIND] = 'no-such-kind';
    expect(() => applySkin('vector', host, alien))
      .toThrow(/no renderer for control kind 'no-such-kind'/);
  });

  it('the select kind is skinnable: skins restyle the field, they do not replace it', () =>
  {
    const select = new Select(host, { options: ['Off', 'LFO 1'], skin: 'ms2000' });

    expect(select.field.tagName).toBe('SELECT');   // still the native list
    expect(select.field.classList.contains('abd-select__field--ms2000')).toBe(true);
    select.destroy();

    const plain = new Select(host, { options: ['Off'], skin: 'junio' });

    // 'junio' paints no select renderer: per-kind fallback to 'vector'.
    expect(plain.wrapper.classList.contains('abd-skin--vector')).toBe(true);
    plain.destroy();
  });

  it('partial skins fall back per-kind to the vector renderer', () =>
  {
    const boxHost = document.createElement('div');

    document.body.appendChild(boxHost);

    // 'ms2000' paints knob/toggle/select/segmented/slider but has no numberbox:
    // the omitted KIND falls back to the vector renderer, not the whole map.
    const fake = { getValue: () => 0.5, options: {}, wrapper: document.createElement('div') };

    fake[CONTROL_KIND] = 'numberbox';

    const applied = applySkin('ms2000', boxHost, fake);

    expect(fake.wrapper.classList.contains('abd-skin--vector')).toBe(true);
    applied.destroy();
    boxHost.remove();
  });

  it('applySkin dispatches by control kind and falls back when unknown', () =>
  {
    const knobFake = { getValue: () => 0.5, options: {} };
    const knobApplied = applySkin('no-existe', host, knobFake);

    expect(knobApplied.root.className).toContain('vector');   // knob renderer
    knobApplied.destroy();

    const toggleHost = document.createElement('div');
    document.body.appendChild(toggleHost);
    const toggle = new Toggle(toggleHost, { skin: 'no-existe' });

    // Unknown skin -> the whole map falls back to vector, whose toggle renderer
    // tags the button instead of painting a root inside it.
    expect(toggle.button.classList.contains('abd-skin--vector')).toBe(true);
    toggle.destroy();
    toggleHost.remove();
  });
});

describe('shared drag-core', () =>
{
  it('clamp behaves like the family expects', () =>
  {
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('detach removes listeners: no drag after destroy', () =>
  {
    const host = document.createElement('div');
    document.body.appendChild(host);

    let moved = 0;
    const detach = attachDrag(host, {
      onDelta: () => ++moved,
      onValue: () => {},
    });

    host.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    host.dispatchEvent(new PointerEvent('pointermove', { clientY: 50, bubbles: true }));
    expect(moved).toBe(1);

    detach();

    host.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100, bubbles: true }));
    host.dispatchEvent(new PointerEvent('pointermove', { clientY: 20, bubbles: true }));
    expect(moved).toBe(1);   // unchanged: listeners gone
  });
});
