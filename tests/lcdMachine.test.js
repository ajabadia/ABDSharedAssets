/**
 * LcdMachine — la maquina pura del LCD. Estos tests fijan el contrato universal:
 * heredan la semantica del LcdMenuManager nativo de NEURONiK (estados
 * Idle/Navigation/Edit, arbol inyectado, Parameter/MidiCC/Action) y la leccion
 * de CZ101 (el menu son datos). Sin DOM: como debe ser una maquina pura.
 */
import { describe, expect, it, vi } from 'vitest';

import { createLcdMachine, formatValue } from '../components/lcdMachine.js';

const MENU = [
  {
    label: 'GLOBAL',
    sub: [
      { label: 'MASTER VOL', paramId: 'masterLevel' },
      { label: 'MIDI CH', paramId: 'midiChannel' },
    ],
  },
  { label: 'EFFECTS', sub: [{ label: 'REVERB MIX', paramId: 'fxReverbMix' }] },
  { label: 'PANIC', type: 'action' },
  { label: 'CC CUTOFF', paramId: 'filterCutoff', type: 'cc' },
];

const make = (hooks = {}) => createLcdMachine(MENU, hooks);

describe('LcdMachine / estados', () => {
  it('starts idle with an empty navigation path', () => {
    const m = make();
    expect(m.state).toBe('idle');
    expect(m.snapshot()).toMatchObject({ state: 'idle', depth: 0, index: -1 });
  });

  it('MENU enters navigation at the first root item; MENU again exits to idle', () => {
    const m = make();
    m.onMenuPress();
    expect(m.state).toBe('navigation');
    expect(m.snapshot()).toMatchObject({ depth: 1, index: 0, count: 4 });

    m.onMenuPress(); // en la raiz, MENU sale
    expect(m.state).toBe('idle');
  });

  it('OK enters a sublevel; MENU climbs one level at a time', () => {
    const m = make();
    m.onMenuPress(); // GLOBAL
    m.onOkPress(); // entrar en GLOBAL
    expect(m.snapshot()).toMatchObject({ depth: 2, count: 2 });

    m.onMenuPress(); // subir a la raiz
    expect(m.snapshot()).toMatchObject({ depth: 1, index: 0 });
  });

  it('OK on a parameter enters edit; OK confirms and MENU cancels', () => {
    const m = make();
    m.onMenuPress();
    m.onOkPress(); // GLOBAL ->
    m.onOkPress(); // MASTER VOL -> editar
    expect(m.state).toBe('edit');
    expect(m.editing).toMatchObject({ paramId: 'masterLevel' });

    m.onOkPress(); // confirmar
    expect(m.state).toBe('navigation');
    expect(m.editing).toBeNull();

    m.onOkPress(); // MASTER VOL otra vez
    m.onMenuPress(); // cancelar
    expect(m.state).toBe('navigation');
    expect(m.editing).toBeNull();
  });

  it('MENU in the root returns the cursor to the first item before leaving', () => {
    const m = make();
    m.onMenuPress();
    m.onEncoderRotate(2); // -> PANIC (index 2)
    m.onMenuPress();      // no sale: vuelve al primer item
    expect(m.state).toBe('navigation');
    expect(m.snapshot().index).toBe(0);
    m.onMenuPress();      // ya en el primero: ahora si, al reposo
    expect(m.state).toBe('idle');
  });

  it('OK on an action item fires onAction immediately without entering edit', () => {
    const onAction = vi.fn();
    const m = make({ onAction });

    m.onMenuPress();
    m.onEncoderRotate(1); // -> EFFECTS
    m.onEncoderRotate(1); // -> PANIC
    m.onOkPress();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ label: 'PANIC', type: 'action' });
    expect(m.state).toBe('navigation'); // sin estado de edicion
  });
});

describe('LcdMachine / navegacion', () => {
  it('encoder wraps forward and backward within a level', () => {
    const m = make();
    m.onMenuPress();

    m.onEncoderRotate(-1); // hacia atras: envuelve al ultimo
    expect(m.snapshot().index).toBe(3);

    m.onEncoderRotate(1); // vuelve a 0
    expect(m.snapshot().index).toBe(0);
  });

  it('edits are delivered to onEdit with the direction, not applied by the machine', () => {
    const onEdit = vi.fn();
    const m = make({ onEdit });

    m.onMenuPress();
    m.onOkPress(); // GLOBAL ->
    m.onOkPress(); // MASTER VOL -> edit
    m.onEncoderRotate(1);
    m.onEncoderRotate(1);
    m.onEncoderRotate(-1);

    expect(onEdit).toHaveBeenCalledTimes(3);
    expect(onEdit.mock.calls[0]).toEqual(['masterLevel', 1, m]);
    expect(onEdit.mock.calls[2][1]).toBe(-1);
  });

  it('arrows map to coarse/fine steps of the encoder', () => {
    const onEdit = vi.fn();
    const m = make({ onEdit });

    m.onMenuPress();
    m.onOkPress();
    m.onOkPress(); // edit MASTER VOL
    m.onArrow('up'); // +5
    m.onArrow('down'); // -5
    m.onArrow('left'); // -1
    m.onArrow('right'); // +1

    expect(onEdit.mock.calls.map((c) => c[1])).toEqual([5, -5, -1, 1]);
  });

  it('idle encoder fires onPreview only when the synth provides it', () => {
    const onPreview = vi.fn();
    const plain = make();
    expect(plain.onEncoderRotate(1).state).toBe('idle'); // sin hook: no-op

    const withPreview = make({ onPreview });
    withPreview.onEncoderRotate(1);
    expect(withPreview.previewIndex).toBe(0);
    expect(onPreview.mock.calls[0][0]).toMatchObject({ label: 'GLOBAL' });
  });
});

describe('LcdMachine / renderLines', () => {
  it('idle shows the synth lines untouched', () => {
    const m = make();
    expect(m.renderLines({ idleLine1: 'NEURONiK', idleLine2: 'BANK A' })).toEqual(['NEURONiK', 'BANK A']);
  });

  it('navigation shows the breadcrumb and the cursor on line 2', () => {
    const m = make();
    m.onMenuPress();
    expect(m.renderLines()).toEqual(['MAIN MENU', '>GLOBAL']);

    m.onOkPress(); // dentro de GLOBAL
    expect(m.renderLines()).toEqual(['GLOBAL', '>MASTER VOL']);
  });

  it('edit shows the label and the value the synth brings', () => {
    const m = make();
    m.onMenuPress();
    m.onOkPress();
    m.onOkPress();
    expect(m.renderLines({ editValue: '0.75' })).toEqual(['MASTER VOL', '0.75']);
  });
});

describe('formatValue', () => {
  it('formats choices, booleans, decimals and units', () => {
    expect(formatValue(1, { choices: [{ label: 'SINE' }, { label: 'SAW' }] })).toBe('SAW');
    expect(formatValue(1, { type: 'bool' })).toBe('ON');
    expect(formatValue(0, { type: 'bool' })).toBe('OFF');
    expect(formatValue(0.75, { decimals: 2 })).toBe('0.75');
    expect(formatValue(440, { decimals: 0, unit: 'HZ' })).toBe('440 HZ');
  });
});
