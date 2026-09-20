/**
 * ThemeSwitcher — the universal theme toggle (page infrastructure).
 * The switcher is shared; themes belong to each synth. These tests pin the
 * contract: data-theme on the chosen root, 'dark' = no attribute (the :root),
 * active/aria state, optional persistence, clean destroy.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ThemeSwitcher } from '../components/themeSwitcher.js';

describe('ThemeSwitcher', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = ''; // aislar: ninguna prueba debe ver DOM ajeno
    container = document.createElement('div');
    document.body.append(container);
  });

  const make = (options = {}) => new ThemeSwitcher(container, options);

  it('applies data-theme to the chosen root and marks the active button', () => {
    const root = document.createElement('div');
    const ts = make({ root, themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }] });

    expect(ts.value).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false); // dark = el :root, sin atributo

    ts.setValue('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    const [darkBtn, lightBtn] = ts.element.querySelectorAll('button');
    expect(lightBtn.classList.contains('is-active')).toBe(true);
    expect(darkBtn.getAttribute('aria-pressed')).toBe('false');
    expect(lightBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('fires onChange only for user actions', () => {
    const onChange = vi.fn();
    const ts = make({ themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], onChange });

    ts.setValue('light', { fromUser: false });
    expect(onChange).not.toHaveBeenCalled();

    ts.setValue('dark');
    expect(onChange).toHaveBeenCalledWith('dark', undefined);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('persists the choice when a storageKey is given, and restores it', () => {
    const key = 'abd.test.theme';
    localStorage.removeItem(key);

    const first = make({ storageKey: key, themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }] });
    first.setValue('light');
    expect(localStorage.getItem(key)).toBe('light');
    first.destroy();

    const second = make({ storageKey: key, themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }] });
    expect(second.value).toBe('light'); // restaurado
    second.destroy();

    localStorage.removeItem(key);
  });

  it('defaults to dark when the stored value is unknown', () => {
    const key = 'abd.test.theme.unknown';
    localStorage.setItem(key, 'sepia');
    const ts = make({ storageKey: key, themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }] });
    expect(ts.value).toBe('dark');
    ts.destroy();
    localStorage.removeItem(key);
  });

  it('rejects duplicate theme ids and unknown setValue targets', () => {
    expect(() => make({ themes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A2' }] })).toThrow(/duplicados/);
    const ts = make({ themes: [{ id: 'dark', label: 'Dark' }] });
    expect(() => ts.setValue('light')).toThrow(/desconocido/);
    ts.destroy();
  });

  it('destroy removes the element and detaches listeners', () => {
    const onChange = vi.fn();
    const ts = make({ themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], onChange });
    const btn = ts.element.querySelector('button');
    ts.destroy();
    expect(document.querySelectorAll('.abd-theme-switcher')).toHaveLength(0);
    // El clon ya no lleva el listener: el click no debe llamar a onChange.
    btn.click();
    expect(onChange).not.toHaveBeenCalled();
  });
  describe('variante select', () => {
    it('renders a single <select> whose value IS the theme id', () => {
      const root = document.createElement('div');
      const ts = make({
        root,
        variant: 'select',
        themes: [{ id: 'dark', label: 'Oscuro' }, { id: 'light', label: 'Claro' }],
      });

      expect(ts.element.tagName).toBe('SELECT');
      expect(ts.element.querySelectorAll('option').length).toBe(2);
      expect(ts.element.value).toBe('dark'); // estado inicial reflejado
      expect(root.hasAttribute('data-theme')).toBe(false);

      ts.setValue('light');
      expect(ts.element.value).toBe('light'); // sincronizado
      expect(root.getAttribute('data-theme')).toBe('light');
    });

    it('user change on the <select> fires onChange and applies the theme', () => {
      const root = document.createElement('div');
      const onChange = vi.fn();
      make({ root, variant: 'select', themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], onChange });

      const select = container.querySelector('select');
      select.value = 'light';
      select.dispatchEvent(new Event('change'));

      expect(root.getAttribute('data-theme')).toBe('light');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('light', undefined);
    });

    it('destroy() detaches the change listener for real', () => {
      const onChange = vi.fn();
      const ts = make({ variant: 'select', themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }], onChange });
      const select = ts.element;

      ts.destroy();
      // aunque el elemento siga referenciado, no debe responder al cambio
      select.value = 'light';
      select.dispatchEvent(new Event('change'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('bodyClass (politica de dueno unico)', () => {
    it('applies the active theme bodyClass and removes the previous one', () => {
      const ts = make({
        themes: [
          { id: 'dark', label: 'Dark' },
          { id: 'cyber', label: 'Cyber', bodyClass: 'skin-cyber' },
        ],
      });

      ts.setValue('cyber');
      expect(document.body.classList.contains('skin-cyber')).toBe(true);
      ts.destroy();
      expect(document.body.classList.contains('skin-cyber')).toBe(false);
    });

    it('is a no-op for themes without bodyClass, and destroy removes nothing', () => {
      const ts = make({ themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }] });

      ts.setValue('light');
      expect(document.body.className).toBe('');
      ts.destroy();
      expect(document.body.className).toBe('');
    });
  });

  describe('payload por tema', () => {
    it('delivers the theme payload as the second onChange argument', () => {
      const onChange = vi.fn();
      const ts = make({
        themes: [
          { id: 'performance', label: 'Performance', payload: 0 },
          { id: 'advanced', label: 'Advanced', payload: 1 },
        ],
        onChange,
      });
      expect(ts.payload).toBe(0); // el del tema activo

      ts.setValue('advanced', { fromUser: true });
      expect(onChange).toHaveBeenCalledWith('advanced', 1);
      expect(ts.payload).toBe(1);
    });
  });
});
