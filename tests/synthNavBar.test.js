/**
 * @file synthNavBar.test.js
 * @brief Tests unitarios para el componente SynthNavBar de navegación y menús.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup.js';
import {
  SynthNavBar,
  createSynthNavBar,
  DEFAULT_NAVBAR_MENUS,
  isItemChecked,
  renderMenuItemHtml
} from '../components/synthNavBar.js';

describe('SynthNavBar - Helpers & Renderizado Puro', () => {
  it('isItemChecked evalúa booleanos y valores activos', () => {
    expect(isItemChecked({ checked: true })).toBe(true);
    expect(isItemChecked({ checked: false })).toBe(false);

    const radioItem = { action: 'theme', value: 'dark' };
    expect(isItemChecked(radioItem, { theme: 'dark' })).toBe(true);
    expect(isItemChecked(radioItem, { theme: 'vintage' })).toBe(false);

    const fnResolver = (act) => (act === 'zoom' ? 1.25 : null);
    expect(isItemChecked({ action: 'zoom', value: 1.25 }, fnResolver)).toBe(true);
    expect(isItemChecked({ action: 'zoom', value: 1.0 }, fnResolver)).toBe(false);
  });

  it('renderMenuItemHtml renderiza separadores, atajos, marcas de check y submenús', () => {
    const sep = renderMenuItemHtml({ separator: true });
    expect(sep).toContain('nav-separator');

    const itemNormal = renderMenuItemHtml(
      { label: 'Save', action: 'save', shortcut: 'Ctrl+S' },
      {}
    );
    expect(itemNormal).toContain('Save');
    expect(itemNormal).toContain('data-action="save"');
    expect(itemNormal).toContain('<kbd class="nav-kbd">Ctrl+S</kbd>');

    const checkedItem = renderMenuItemHtml(
      { label: 'Dark', action: 'theme', value: 'dark' },
      { theme: 'dark' }
    );
    expect(checkedItem).toContain('✓');

    const subItem = renderMenuItemHtml({
      label: 'Zoom',
      submenu: [
        { label: '100%', action: 'zoom', value: 1.0 }
      ]
    });
    expect(subItem).toContain('nav-has-sub');
    expect(subItem).toContain('nav-arrow');
    expect(subItem).toContain('nav-submenu');
    expect(subItem).toContain('100%');
  });
});

describe('SynthNavBar - Componente y Ciclo de Vida', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('se monta con marca personalizada y menús declarativos', () => {
    const nav = createSynthNavBar({
      container,
      brand: {
        title: 'ABD CZ-101',
        subtitle: 'Phase Distortion'
      },
      menus: [
        {
          name: 'File',
          items: [
            { label: 'Load Bank', action: 'loadBank' },
            { label: 'Save Bank', action: 'saveBank' }
          ]
        },
        {
          name: 'Edit',
          items: [
            { label: 'Undo', action: 'undo' }
          ]
        }
      ]
    });

    const el = container.querySelector('.abd-synth-navbar');
    expect(el).not.toBeNull();

    const title = el.querySelector('.brand-title');
    expect(title.textContent).toBe('ABD CZ-101');

    const sub = el.querySelector('.brand-subtitle');
    expect(sub.textContent).toBe('Phase Distortion');

    const triggers = el.querySelectorAll('.nav-menu-trigger');
    expect(triggers.length).toBe(2);
    expect(triggers[0].textContent.trim()).toBe('File');
    expect(triggers[1].textContent.trim()).toBe('Edit');

    nav.destroy();
    expect(container.querySelector('.abd-synth-navbar')).toBeNull();
  });

  it('abre y cierra el dropdown de menú al hacer clic en los triggers', () => {
    const nav = new SynthNavBar({
      container,
      menus: DEFAULT_NAVBAR_MENUS
    });

    const fileTrigger = container.querySelector('.nav-menu-trigger[data-menu="File"]');
    const dropdown = container.querySelector('.nav-dropdown');

    expect(dropdown.hidden).toBe(true);

    // Clic para abrir
    fileTrigger.click();
    expect(dropdown.hidden).toBe(false);
    expect(fileTrigger.classList.contains('active')).toBe(true);
    expect(dropdown.innerHTML).toContain('Load Bank (.json)...');

    // Clic de nuevo para alternar/cerrar
    fileTrigger.click();
    expect(dropdown.hidden).toBe(true);
    expect(fileTrigger.classList.contains('active')).toBe(false);

    nav.destroy();
  });

  it('permite navegación fluida por hover (scrubbing) cuando un menú está abierto', () => {
    const nav = new SynthNavBar({
      container,
      menus: DEFAULT_NAVBAR_MENUS
    });

    const fileTrigger = container.querySelector('.nav-menu-trigger[data-menu="File"]');
    const editTrigger = container.querySelector('.nav-menu-trigger[data-menu="Edit"]');
    const dropdown = container.querySelector('.nav-dropdown');

    fileTrigger.click();
    expect(nav.isMenuOpen).toBe(true);
    expect(nav.activeMenuName).toBe('File');

    // Mover el ratón sobre Edit
    editTrigger.dispatchEvent(new MouseEvent('mouseenter'));
    expect(nav.activeMenuName).toBe('Edit');
    expect(dropdown.innerHTML).toContain('Bank Manager...');

    nav.destroy();
  });

  it('dispara las acciones registradas al hacer clic en un ítem', () => {
    const onUndo = vi.fn();
    const onGlobalAction = vi.fn();

    const nav = new SynthNavBar({
      container,
      menus: [
        {
          name: 'Edit',
          items: [
            { label: 'Undo', action: 'undo' },
            { label: 'Zoom 150%', action: 'zoom', value: 1.5 }
          ]
        }
      ],
      actions: {
        undo: onUndo
      },
      onAction: onGlobalAction
    });

    // Abrir menú Edit
    const editTrigger = container.querySelector('.nav-menu-trigger[data-menu="Edit"]');
    editTrigger.click();

    // Clic en Undo
    const undoBtn = container.querySelector('button.nav-item[data-action="undo"]');
    undoBtn.click();

    expect(onUndo).toHaveBeenCalled();
    expect(onGlobalAction).toHaveBeenCalledWith('undo', undefined, expect.anything());

    // El dropdown se cierra tras pulsar
    const dropdown = container.querySelector('.nav-dropdown');
    expect(dropdown.hidden).toBe(true);

    // Abrir de nuevo y probar ítem con valor numérico
    editTrigger.click();
    const zoomBtn = container.querySelector('button.nav-item[data-action="zoom"]');
    zoomBtn.click();
    expect(onGlobalAction).toHaveBeenCalledWith('zoom', 1.5, expect.anything());

    nav.destroy();
  });

  it('cierra el dropdown con tecla Escape o clic exterior', () => {
    const nav = new SynthNavBar({
      container,
      menus: DEFAULT_NAVBAR_MENUS
    });

    const fileTrigger = container.querySelector('.nav-menu-trigger[data-menu="File"]');
    const dropdown = container.querySelector('.nav-dropdown');

    fileTrigger.click();
    expect(dropdown.hidden).toBe(false);

    // Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dropdown.hidden).toBe(true);

    // Reabrir y clic fuera
    fileTrigger.click();
    expect(dropdown.hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dropdown.hidden).toBe(true);

    nav.destroy();
  });

  it('se conecta automáticamente con AboutDialog en acciones about y checkForUpdates', () => {
    const nav = new SynthNavBar({
      container,
      brand: { title: 'AutoUpdate Synth' },
      menus: [
        {
          name: 'Help',
          items: [
            { label: 'Check for Updates...', action: 'checkForUpdates' },
            { label: 'About...', action: 'about' }
          ]
        }
      ]
    });

    expect(nav.aboutDialog).not.toBeNull();
    const spyOpen = vi.spyOn(nav.aboutDialog, 'open');
    const spyCheck = vi.spyOn(nav.aboutDialog, 'checkForUpdates');

    // Abrir Help y pulsar About
    const helpTrigger = container.querySelector('.nav-menu-trigger[data-menu="Help"]');
    helpTrigger.click();

    const aboutBtn = container.querySelector('button.nav-item[data-action="about"]');
    aboutBtn.click();
    expect(spyOpen).toHaveBeenCalled();

    // Reabrir y pulsar Check for Updates
    helpTrigger.click();
    const checkBtn = container.querySelector('button.nav-item[data-action="checkForUpdates"]');
    checkBtn.click();
    expect(spyCheck).toHaveBeenCalled();

    nav.destroy();
  });

  it('monta ranuras personalizadas centerSlot y rightSlot', () => {
    const centerEl = document.createElement('div');
    centerEl.className = 'custom-center-hud';
    centerEl.textContent = 'PATCH: CZ LEAD';

    const rightHtml = '<button class="panic-btn">PANIC</button>';

    const nav = new SynthNavBar({
      container,
      centerSlot: centerEl,
      rightSlot: rightHtml
    });

    expect(container.querySelector('.custom-center-hud')).not.toBeNull();
    expect(container.querySelector('.panic-btn')).not.toBeNull();

    nav.destroy();
  });
});
