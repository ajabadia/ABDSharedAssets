/**
 * createDrawer — contrato del cajón lateral compartido.
 * =====================================================
 *
 * Lo que se pincha aquí es lo que distingue este cajón del `slideDrawer` de
 * ABDMS2000 (ver la cabecera de components/drawer.js): el contenido NO se
 * reconstruye al abrir. Si alguien lo cambia por el patrón de re-render, las
 * celdas dejarían de existir con el cajón cerrado — y con ellas el recuento
 * que hacen los selftests de la familia.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDrawer } from '../components/drawer.js';

const mount = (options = {}) =>
  createDrawer({ id: 'drawer-test', title: 'MATRIZ', badge: '4 RUTAS', ...options });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('drawer (compartido)', () => {
  it('nace cerrado y cuelga del documento (position: fixed)', () => {
    const drawer = mount();

    expect(drawer.isOpen()).toBe(false);
    expect(drawer.element.parentElement).toBe(document.body);
    expect(drawer.element.dataset.drawer).toBe('drawer-test');
    expect(drawer.element.getAttribute('aria-hidden')).toBe('true');
    expect(drawer.element.classList.contains('drawer--open')).toBe(false);

    drawer.destroy();
  });

  it('estructura completa: header (badge, título, cierre) + body, y a11y del dialog', () => {
    const drawer = mount({ title: 'GLOBAL & MASTER', badge: 'BPM', closeLabel: 'Close (Esc)' });

    expect(drawer.element.getAttribute('role')).toBe('dialog');
    expect(drawer.element.getAttribute('aria-modal')).toBe('true');
    expect(drawer.element.getAttribute('aria-label')).toBe('GLOBAL & MASTER');

    expect(drawer.header.querySelector('.drawer__badge').textContent).toBe('BPM');
    expect(drawer.header.querySelector('.drawer__title').textContent).toBe('GLOBAL & MASTER');

    const close = drawer.header.querySelector('.drawer__close');
    expect(close.getAttribute('aria-label')).toBe('Close (Esc)');

    drawer.destroy();
  });

  it('abre y cierra con el botón, con el fondo y con ESC', () => {
    const drawer = mount();
    const backdropVisible = () => drawer.backdrop.classList.contains('drawer-backdrop--visible');

    drawer.open();
    expect(drawer.isOpen()).toBe(true);
    expect(drawer.element.classList.contains('drawer--open')).toBe(true);
    expect(drawer.element.getAttribute('aria-hidden')).toBe('false');
    expect(backdropVisible()).toBe(true);

    drawer.element.querySelector('.drawer__close').click();
    expect(drawer.isOpen()).toBe(false);
    expect(backdropVisible()).toBe(false);

    drawer.open();
    drawer.backdrop.click();
    expect(drawer.isOpen()).toBe(false);

    drawer.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(drawer.isOpen()).toBe(false);

    // Cerrar un cajón ya cerrado no es un error ni un cambio de estado.
    drawer.close();
    expect(drawer.isOpen()).toBe(false);

    drawer.destroy();
  });

  it('toggle alterna y ESC con el cajón cerrado no hace nada (no secuestra el teclado)', () => {
    const drawer = mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(drawer.isOpen()).toBe(false);

    drawer.toggle();
    expect(drawer.isOpen()).toBe(true);
    drawer.toggle();
    expect(drawer.isOpen()).toBe(false);

    drawer.destroy();
  });

  it('lo que el llamador ponga en el cuerpo sigue ahí tras abrir y cerrar (sin re-render)', () => {
    const drawer = mount();
    const cell = document.createElement('div');

    cell.dataset.parameterId = 'masterBPM';
    drawer.body.append(cell);

    drawer.open();
    drawer.close();

    // El contenido no se reconstruye: es el MISMO nodo (ver la cabecera).
    expect(drawer.body.contains(cell)).toBe(true);
    expect(drawer.body.querySelector('[data-parameter-id="masterBPM"]')).toBe(cell);

    drawer.destroy();
  });

  it('dos instancias son independientes (ids distintos, ESC solo cierra la abierta)', () => {
    const a = mount({ id: 'drawer-a' });
    const b = mount({ id: 'drawer-b' });

    a.open();
    expect(a.isOpen()).toBe(true);
    expect(b.isOpen()).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a.isOpen()).toBe(false);
    expect(b.isOpen()).toBe(false);

    a.destroy();
    b.destroy();
  });

  it('destroy lo quita todo, incluido el listener de teclado', () => {
    const drawer = mount();
    const onKeyDown = vi.fn();

    document.addEventListener('keydown', onKeyDown);
    drawer.destroy();

    expect(document.querySelector('[data-drawer="drawer-test"]')).toBeNull();
    expect(document.querySelector('[data-drawer-backdrop="drawer-test"]')).toBeNull();

    drawer.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // El objeto ya no responde: sin listeners no hay estado que cambiar.
    expect(drawer.isOpen()).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    document.removeEventListener('keydown', onKeyDown);
  });

  it('setHeader reescribe título y distintivo (y el aria-label) sin tocar el cuerpo', () => {
    const drawer = mount();
    const cell = document.createElement('div');

    drawer.body.append(cell);

    // Encadenable: devuelve el cajón.
    expect(drawer.setHeader({ title: 'GLOBAL', badge: '5 RUTAS' })).toBe(drawer);

    expect(drawer.header.querySelector('.drawer__title').textContent).toBe('GLOBAL');
    expect(drawer.header.querySelector('.drawer__badge').textContent).toBe('5 RUTAS');
    // El título visible y el nombre del dialog son el mismo dato.
    expect(drawer.element.getAttribute('aria-label')).toBe('GLOBAL');

    // Un campo que no viene se queda como estaba...
    drawer.setHeader({ badge: '6 RUTAS' });
    expect(drawer.header.querySelector('.drawer__title').textContent).toBe('GLOBAL');
    expect(drawer.element.getAttribute('aria-label')).toBe('GLOBAL');
    expect(drawer.header.querySelector('.drawer__badge').textContent).toBe('6 RUTAS');

    // ...y uno que viene vacío se limpia (sin inventarse un texto).
    drawer.setHeader({ badge: '' });
    expect(drawer.header.querySelector('.drawer__badge').textContent).toBe('');

    // Sin argumentos no cambia nada ni revienta.
    drawer.setHeader();
    expect(drawer.header.querySelector('.drawer__title').textContent).toBe('GLOBAL');

    // Y el cuerpo es el MISMO nodo: setHeader no reconstruye (ver la cabecera).
    expect(drawer.body.querySelector('div')).toBe(cell);

    drawer.destroy();
  });

  it('setHeader sobre un cajón destruido no muta (como el resto de la API)', () => {
    const drawer = mount();

    drawer.destroy();
    drawer.setHeader({ title: 'TARDE', badge: 'X' });

    expect(document.querySelector('[data-drawer="drawer-test"]')).toBeNull();
  });

  it('onOpen/onClose avisan UNA vez por transición real, no por petición', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const drawer = mount({ onOpen, onClose });

    // Cerrar lo que ya está cerrado no es una transición: nadie avisa.
    drawer.close();
    expect(onClose).not.toHaveBeenCalled();

    drawer.open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(drawer);

    // Abrir lo que ya está abierto tampoco.
    drawer.open();
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Los tres caminos de cierre pasan por el mismo aviso, y una sola vez cada uno.
    drawer.element.querySelector('.drawer__close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(drawer);

    drawer.backdrop.click();   // ya cerrado: no avisa
    expect(onClose).toHaveBeenCalledTimes(1);

    drawer.toggle();
    expect(onOpen).toHaveBeenCalledTimes(2);
    drawer.backdrop.click();
    expect(onClose).toHaveBeenCalledTimes(2);

    drawer.toggle();
    expect(onOpen).toHaveBeenCalledTimes(3);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(drawer.isOpen()).toBe(false);

    drawer.destroy();
  });

  it('destroy NO es un cierre: quitarlo abierto no dispara onClose', () => {
    const onClose = vi.fn();
    const drawer = mount({ onClose });

    drawer.open();
    drawer.destroy();

    // El nodo se va sin pasar por la transición: quien tenga que soltar algo lo
    // suelta en su propio camino de destrucción (ver la cabecera de drawer.js).
    expect(onClose).not.toHaveBeenCalled();
  });

  /* ── Gestión de foco: entrada, trampa de Tab y vuelta al disparador ─────── */

  it('al abrir, el foco entra en el primer control del cuerpo (y en el cierre si no hay)', () => {
    const drawer = mount();
    const first = document.createElement('button');
    const second = document.createElement('button');

    drawer.body.append(first, second);

    drawer.open();
    expect(document.activeElement).toBe(first);

    // Un cuerpo sin nada que tabular no deja el foco fuera: el cierre, único
    // control propio, es el destino.
    drawer.close();
    first.remove();
    second.remove();
    drawer.open();
    expect(document.activeElement).toBe(drawer.header.querySelector('.drawer__close'));

    drawer.destroy();
  });

  it('al cerrar, el foco vuelve al disparador, por los tres caminos de cierre', () => {
    const trigger = document.createElement('button');
    const control = document.createElement('button');
    const drawer = mount();

    document.body.append(trigger);
    drawer.body.append(control);

    trigger.focus();
    drawer.open();
    expect(document.activeElement).toBe(control);

    // ESC...
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).toBe(trigger);

    // ...el fondo...
    drawer.open();
    drawer.backdrop.click();
    expect(document.activeElement).toBe(trigger);

    // ...y el botón de cierre: el mismo camino, el mismo destino.
    drawer.open();
    drawer.header.querySelector('.drawer__close').click();
    expect(document.activeElement).toBe(trigger);

    // Un disparador que ya no está en el documento no se toca: no se devuelve el
    // foco a un nodo muerto.
    drawer.open();
    trigger.remove();
    drawer.close();
    expect(document.activeElement).not.toBe(trigger);

    drawer.destroy();
  });

  it('la trampa de Tab cicla por el cajón y solo intercepta en los bordes', () => {
    const drawer = mount();
    const first = document.createElement('button');
    const last = document.createElement('button');

    drawer.body.append(first, last);

    const close = drawer.header.querySelector('.drawer__close');
    const pressTab = (shiftKey = false) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(event);
      return event;
    };

    // Cerrado, el teclado es del documento: el cajón no toca Tab.
    first.focus();
    expect(pressTab().defaultPrevented).toBe(false);

    drawer.open();
    expect(document.activeElement).toBe(first);

    // En medio, tabula el navegador (aquí no hay layout: el foco no se mueve).
    expect(pressTab().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);

    // Borde derecho: del último del DOM (el cuerpo va tras el encabezado) al
    // primero (el cierre).
    last.focus();
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    // Borde izquierdo: de vuelta al último.
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    drawer.destroy();
  });

  it('sin controles enfocables el cajón mismo recibe el foco y retiene Tab', () => {
    const drawer = mount();

    // El llamador puede quedarse sin un solo control (ni el cierre).
    drawer.header.querySelector('.drawer__close').remove();

    drawer.open();
    expect(document.activeElement).toBe(drawer.element);

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(drawer.element);

    drawer.destroy();
  });

  it('cerrado, el contenido no es tabulable: el cajón va `inert` y lo suelta al abrir', () => {
    const drawer = mount();
    const control = document.createElement('button');

    drawer.body.append(control);

    // Nace cerrado (y por tanto inerte), con el contenido en el documento: el
    // `inert` no quita nodos, solo los saca del orden de tabulación.
    expect(drawer.isOpen()).toBe(false);
    expect(drawer.element.hasAttribute('inert')).toBe(true);

    drawer.open();
    expect(drawer.element.hasAttribute('inert')).toBe(false);
    expect(drawer.body.contains(control)).toBe(true);

    // Cerrar vuelve a sacarlo, y el nodo es el MISMO (el cajón no reconstruye).
    drawer.close();
    expect(drawer.element.hasAttribute('inert')).toBe(true);
    expect(drawer.body.querySelector('button')).toBe(control);

    drawer.destroy();
  });

  it('destroy no devuelve el foco: no es un cierre', () => {
    const trigger = document.createElement('button');
    const drawer = mount();

    document.body.append(trigger);
    trigger.focus();

    drawer.open();
    drawer.destroy();

    expect(document.activeElement).not.toBe(trigger);
  });
});
