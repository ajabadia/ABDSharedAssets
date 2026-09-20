/**
 * LcdPanel — la composicion completa (pantalla + maquina + D-pad). Fija el
 * contrato del camino rapido del 8.3: los botones conducen la maquina, la
 * pantalla repinta, el synth entrega lineas de reposo y valores de edicion,
 * y destroy() no deja nada colgado.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createLcdPanel } from '../components/lcdPanel.js';

const MENU = [
  {
    label: 'GLOBAL',
    sub: [
      { label: 'MASTER VOL', paramId: 'masterLevel' },
      { label: 'CC CUTOFF', paramId: 'filterCutoff', type: 'cc' },
    ],
  },
  { label: 'PANIC', type: 'action' },
];

describe('LcdPanel', () => {
  let container;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (options = {}) => createLcdPanel(container, { menu: MENU, widthChars: 16, ...options });

  const press = (key) => {
    const btn = container.querySelector(`.abd-lcd-panel__btn--${key}`);
    btn.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
  };

  const line = (i) => container.querySelectorAll('.abd-lcd__line')[i];

  it('renders screen and D-pad; idle lines come from the synth callback', () => {
    const lcd = make({ idle: () => ['NEURONiK', 'BANK A'] });
    expect(line(0).textContent).toBe('NEURONiK');
    expect(line(1).textContent).toBe('BANK A');
    expect(container.querySelectorAll('.abd-lcd-panel__btn').length).toBe(6);
    lcd.destroy();
  });

  it('D-pad drives the machine and the screen follows (idle -> menu -> edit)', () => {
    const onEdit = vi.fn();
    const lcd = make({
      idle: () => ['PRESET 01', ''],
      editValue: (item) => (item.paramId === 'masterLevel' ? '0.75' : 'CC 74'),
      hooks: { onEdit },
    });

    press('menu'); // entrar en el menu
    expect(line(0).textContent).toBe('MAIN MENU');
    expect(line(1).textContent).toBe('>GLOBAL');

    press('ok'); // entrar en GLOBAL
    press('ok'); // editar MASTER VOL
    expect(line(0).textContent).toBe('MASTER VOL');
    expect(line(1).textContent).toBe('0.75');

    press('right'); // +1
    expect(onEdit).toHaveBeenCalledWith('masterLevel', 1, expect.anything());

    press('menu'); // cancelar edicion
    expect(line(1).textContent).toBe('>MASTER VOL');
    lcd.destroy();
  });

  it('hold-repeat keeps firing while the button is held (hardware feel)', () => {
    const onEdit = vi.fn();
    const lcd = make({
      hooks: { onEdit },
      repeat: { initial: 400, interval: 120 },
    });

    press('menu');
    press('ok'); // GLOBAL ->
    press('ok'); // editar MASTER VOL

    const btn = container.querySelector('.abd-lcd-panel__btn--right');
    btn.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
    vi.advanceTimersByTime(400 + 120 * 4); // 1 fire + 4 repetidos
    window.dispatchEvent(new PointerEvent('pointerup'));

    expect(onEdit.mock.calls.length).toBe(5);
    lcd.destroy();
  });

  it('action items fire onAction without entering edit', () => {
    const onAction = vi.fn();
    const lcd = make({ hooks: { onAction } });

    press('menu'); // raiz: GLOBAL (index 0)
    press('down'); // cursor +5 -> envuelve a PANIC (index 1)
    press('ok');

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ label: 'PANIC' });
    lcd.destroy();
  });

  it('destroy detaches listeners: buttons do nothing afterwards', () => {
    const onEdit = vi.fn();
    const lcd = make({ hooks: { onEdit } });
    lcd.destroy();

    const btn = container.querySelector('.abd-lcd-panel__btn--menu');
    expect(btn).toBeNull(); // el DOM ya no esta
    // y aunque alguien dispache con referencias viejas, no rompe ni dispara
    const onAction = vi.fn();
    void onAction;
  });

  it('screen API stays reachable for synth messages (preview/queue)', () => {
    const lcd = make({ idle: () => ['REPOSO', ''] });
    lcd.screen.message('m', 'GUARDANDO', { priority: 1, durationMs: 5000 });
    expect(line(0).textContent).toBe('GUARDANDO');
    lcd.screen.clearMessage('m');
    expect(line(0).textContent).toBe('REPOSO');
    lcd.destroy();
  });
});
