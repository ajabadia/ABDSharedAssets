/**
 * LcdScreen — la pantalla DOM. Tests con timers falsos (jsdom + vi.useFakeTimers):
 * base, ping-pong de scroll, preview con timeout, cola con prioridad y destroy.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createLcdScreen } from '../components/lcdScreen.js';

describe('LcdScreen', () => {
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

  const make = (options = {}) => createLcdScreen(container, { widthChars: 16, ...options });

  const line = (i) => container.querySelectorAll('.abd-lcd__line')[i];

  it('renders N lines and setLine paints the resting text', () => {
    const lcd = make();
    expect(container.querySelectorAll('.abd-lcd__line').length).toBe(2);

    lcd.setLine(0, 'NEURONiK');
    lcd.setLine(1, 'BANK A');
    expect(line(0).textContent).toBe('NEURONiK');
    expect(line(1).textContent).toBe('BANK A');
    lcd.destroy();
  });

  it('long text starts ping-pong scrolling character by character', () => {
    const lcd = make();
    lcd.setLine(0, 'UN NOMBRE DE PROGRAMA MUY LARGO PARA LA LINEA');

    const initial = line(0).textContent;
    expect(initial).toHaveLength(16); // presupuesto 16

    vi.advanceTimersByTime(2000 + 180 * 3); // pausa + 3 pasos
    expect(line(0).textContent).toHaveLength(16);
    expect(line(0).textContent).not.toBe(initial); // ya se desplazo
    lcd.destroy();
  });

  it('preview shows text and returns to the resting line after the timeout', () => {
    const lcd = make();
    lcd.setLine(0, 'REPOSO');

    lcd.preview(0, 'CUTOFF 0.75', { durationMs: 1000 });
    expect(line(0).textContent).toBe('CUTOFF 0.75');

    vi.advanceTimersByTime(1001);
    expect(line(0).textContent).toBe('REPOSO'); // vuelve al base
    lcd.destroy();
  });

  it('message queue: higher priority (lower number) wins and expiry returns to base', () => {
    const lcd = make();
    lcd.setLine(0, 'REPOSO');

    lcd.message('a', 'AVISOS', { priority: 5, durationMs: 5000 });
    lcd.message('b', 'PANICO', { priority: 1, durationMs: 1000 });
    expect(line(0).textContent).toBe('PANICO'); // prioridad 1 gana

    vi.advanceTimersByTime(1001);
    expect(line(0).textContent).toBe('AVISOS'); // expiro el panico, sigue el aviso

    vi.advanceTimersByTime(4001);
    expect(line(0).textContent).toBe('REPOSO');
    lcd.destroy();
  });

  it('clearMessage removes a queued message in place', () => {
    const lcd = make();
    lcd.setLine(0, 'REPOSO');
    lcd.message('x', 'GUARDANDO', { priority: 5, durationMs: 60000 });
    expect(line(0).textContent).toBe('GUARDANDO');

    lcd.clearMessage('x');
    expect(line(0).textContent).toBe('REPOSO');
    lcd.destroy();
  });

  it('destroy stops timers and removes the DOM', () => {
    const lcd = make();
    lcd.setLine(0, 'TEXTO LARGO QUE NO CABE EN LA LINEA DEL LCD');
    lcd.message('m', 'MSJ', { durationMs: 60000 });
    lcd.destroy();

    expect(container.querySelector('.abd-lcd')).toBeNull();
    // Los timers muertos no pintan: avanzar el tiempo no rompe.
    vi.advanceTimersByTime(10000);
  });
});
