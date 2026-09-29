/**
 * overlayFocus — contrato de foco/inert de los overlays de la familia.
 * =====================================================================
 *
 * Es EL contrato que ya tenia el cajon compartido (`components/drawer.js`,
 * cuyos tests propios siguen en drawer.test.js) y que de ahi en adelante
 * comparten el slideDrawer de ABDMS2000, el block-drawer de CZ101 y los
 * modales de la familia. Si esto se rompe, se rompe en todos a la vez — y
 * aqui se entera uno solo.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createOverlayFocus, focusableWithin } from '../components/overlayFocus.js';

const mounted = [];

afterEach(() => {
  for (const overlay of mounted) overlay.focus.detach();
  mounted.length = 0;
  document.body.innerHTML = '';
});

/**
 * Un overlay minimo con su DUEÑO: el estado abierto/cerrado lo lleva el test
 * (como lo lleva drawer.js, slideDrawer o el modal que sea) y se abre y
 * cierra por las mismas piezas que usaria el componente real — rememberTrigger
 * al abrir, restoreFocus+setInert al cerrar, releaseInert antes del foco.
 */
function mountOverlay({ bodyControls = 1 } = {}) {
  const root = document.createElement('div');
  root.setAttribute('tabindex', '-1');

  const header = document.createElement('div');
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  for (let i = 0; i < bodyControls; i += 1) {
    const btn = document.createElement('button');
    btn.textContent = `control ${i}`;
    body.appendChild(btn);
  }

  root.append(header, body);
  document.body.appendChild(root);

  let closed = true;
  const focus = createOverlayFocus({
    root,
    body,
    isClosed: () => closed,
    onEscape: () => close(),
  });

  function open() {
    closed = false;
    focus.rememberTrigger();
    focus.releaseInert();
    focus.focusFirst();
  }

  function close() {
    closed = true;
    focus.restoreFocus();
    focus.setInert();
  }

  const overlay = { root, body, closeBtn, focus, open, close, isClosed: () => closed };
  focus.attach();
  mounted.push(overlay);
  return overlay;
}

/** Simula una tecla sobre `target` (activo) con los modificadores dados. */
function pressKey(key, { shift = false, active = null } = {}) {
  if (active) active.focus();
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement.dispatchEvent(event);
  return event;
}

describe('focusableWithin (util)', () => {
  it('devuelve los tabulables en orden de DOM, fuera hidden y sin pintar', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<button id="a">a</button>',
      '<button id="b" disabled>b</button>',
      '<button id="c" hidden>c</button>',
      '<div hidden><button id="d">d</button></div>',
      '<a id="e" href="#e">e</a>',
      '<span id="f" tabindex="0">f</span>',
      '<span id="g" tabindex="-1">g</span>',
      '<input id="h" style="display: none" />',
    ].join('');
    document.body.appendChild(root);

    const ids = focusableWithin(root).map((node) => node.id);
    expect(ids).toEqual(['a', 'e', 'f']);
  });
});

describe('inert + aria-hidden', () => {
  it('setInert marca inert y aria-hidden; releaseInert los suelta', () => {
    const { root, focus } = mountOverlay();

    focus.setInert();
    expect(root.getAttribute('inert')).toBe('');
    expect(root.getAttribute('aria-hidden')).toBe('true');

    focus.releaseInert();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBe('false');
  });

  it('el ciclo del dueño (open/close) escribe los dos atributos', () => {
    const { root, open, close, isClosed } = mountOverlay();

    open();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.getAttribute('aria-hidden')).toBe('false');
    expect(isClosed()).toBe(false);

    close();
    expect(root.getAttribute('inert')).toBe('');
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('el foco al abrir', () => {
  it('open() entra en el primer control del CUERPO, no en la X del encabezado', () => {
    const { open } = mountOverlay({ bodyControls: 1 });

    open();
    expect(document.activeElement.textContent).toBe('control 0');
  });

  it('sin controles en el cuerpo, entra en el del overlay entero; sin nada, en el overlay', () => {
    const sinCuerpo = mountOverlay({ bodyControls: 0 });
    sinCuerpo.open();
    expect(document.activeElement).toBe(sinCuerpo.closeBtn);

    // Overlay sin NINGUN control enfocable: el ultimo recurso es el propio
    // overlay (por eso el tabindex="-1" del root es marca del modulo, no control).
    const vacio = document.createElement('div');
    vacio.setAttribute('tabindex', '-1');
    document.body.appendChild(vacio);
    const focusVacio = createOverlayFocus({ root: vacio, isClosed: () => false });
    focusVacio.focusFirst();
    expect(document.activeElement).toBe(vacio);
  });
});

describe('la trampa de Tab', () => {
  it('cicla: del ultimo al primero (Tab) y del primero al ultimo (Shift+Tab)', () => {
    const { root, open } = mountOverlay({ bodyControls: 2 });
    open();

    const controls = focusableWithin(root);
    const first = controls[0];
    const last = controls[controls.length - 1];

    // Ultimo -> Tab -> primero
    last.focus();
    const wrap = pressKey('Tab', { active: last });
    expect(wrap.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    // Primero -> Shift+Tab -> ultimo
    const wrapBack = pressKey('Tab', { shift: true, active: first });
    expect(wrapBack.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('en medio del ciclo no toca nada (tabula el navegador)', () => {
    const { root, open } = mountOverlay({ bodyControls: 2 });
    open();

    const second = focusableWithin(root)[1];
    const mid = pressKey('Tab', { active: second });
    expect(mid.defaultPrevented).toBe(false);
  });

  it('con el foco FUERA no intercepta: dos overlays no se secuestran el teclado', () => {
    const { open } = mountOverlay({ bodyControls: 1 });
    open();

    const outside = document.createElement('button');
    outside.textContent = 'fuera';
    document.body.appendChild(outside);

    const event = pressKey('Tab', { active: outside });
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('sin controles, la tecla se queda en el overlay (ultimo recurso)', () => {
    const vacio = document.createElement('div');
    vacio.setAttribute('tabindex', '-1');
    document.body.appendChild(vacio);
    const focus = createOverlayFocus({ root: vacio, isClosed: () => false });
    focus.attach();

    const event = pressKey('Tab', { active: vacio });
    focus.detach();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(vacio);
  });
});

describe('la vuelta al disparador', () => {
  it('close() devuelve el foco a quien lo tenia al abrir (fuera del overlay)', () => {
    const { open, close } = mountOverlay();

    const trigger = document.createElement('button');
    trigger.textContent = 'EDIT';
    document.body.appendChild(trigger);
    trigger.focus();

    open();
    expect(document.activeElement).not.toBe(trigger);

    close();
    expect(document.activeElement).toBe(trigger);
  });

  it('no apunta <body> ni nada de dentro del overlay: el foco se queda donde estaba', () => {
    const { root, closeBtn, open, close } = mountOverlay();

    // Sin disparador real (el foco estaba en <body>): no hay nodo exterior al
    // que volver. Al abrir el foco ENTRA al cuerpo (contrato) y al cerrar se
    // queda en su ultimo sitio: ni salto a <body> ni "devolucion" inventada.
    document.body.focus();
    open();
    expect(document.activeElement.textContent).toBe('control 0');
    close();
    expect(document.activeElement.textContent).toBe('control 0');
    expect(document.activeElement).not.toBe(root);
    expect(closeBtn.isConnected).toBe(true);

    // El foco estaba DENTRO (no es un disparador): el modulo lo RECHAZA. Al
    // cerrar, el foco NO salta a la X: se queda donde el contrato lo dejo (el
    // primer control del cuerpo).
    closeBtn.focus();
    open();
    close();
    expect(document.activeElement).not.toBe(closeBtn);
    expect(document.activeElement.textContent).toBe('control 0');
  });

  it('dos cierres no devuelven el foco dos veces, y un nodo muerto no se toca', () => {
    const { open, close } = mountOverlay();

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    open();
    close();
    expect(document.activeElement).toBe(trigger);

    // Segundo ciclo con OTRO disparador: el primero ya no vuelve dos veces.
    const second = document.createElement('button');
    second.textContent = 'otro';
    document.body.appendChild(second);
    second.focus();

    open();
    close();
    expect(document.activeElement).toBe(second);

    // El disparador muere antes del cierre: no se resucita un nodo suelto.
    const doomed = document.createElement('button');
    document.body.appendChild(doomed);
    doomed.focus();

    open();
    doomed.remove();               // jsdom tira el foco a <body>
    close();
    expect(document.activeElement).not.toBe(doomed);
  });
});

describe('el teclado global', () => {
  it('Escape pide el cierre SOLO si esta abierto (el estado lo lleva el dueño)', () => {
    const { root, open, close, isClosed } = mountOverlay();

    // Cerrado: la tecla no hace nada (el dueño ni se entera).
    const closedEvent = pressKey('Escape', { active: document.body });
    expect(closedEvent.defaultPrevented).toBe(false);
    expect(isClosed()).toBe(true);

    // Abierto: el dueño cierra (y no desmonta nada: cerrar no es destruir).
    open();
    pressKey('Escape');
    expect(isClosed()).toBe(true);
    expect(root.isConnected).toBe(true);
  });

  it('Escape cierra aunque el foco este fuera del overlay (contrato de la familia)', () => {
    const { open, isClosed } = mountOverlay();
    open();

    const outside = document.createElement('button');
    document.body.appendChild(outside);

    pressKey('Escape', { active: outside });
    expect(isClosed()).toBe(true);
  });

  it('Tab pasa por la trampa; el resto de teclas no importan', () => {
    const { root, open } = mountOverlay({ bodyControls: 2 });
    open();

    const second = focusableWithin(root)[1];
    const plain = pressKey('ArrowDown', { active: second });
    expect(plain.defaultPrevented).toBe(false);
    expect(plain.key).toBe('ArrowDown');
  });
});

describe('sin material no hay contrato', () => {
  it('restoreFocus sin disparador apuntado no mueve el foco', () => {
    const { focus } = mountOverlay();

    const other = document.createElement('button');
    other.textContent = 'otro';
    document.body.appendChild(other);
    other.focus();

    focus.restoreFocus();
    expect(document.activeElement).toBe(other);
  });
});
