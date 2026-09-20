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
    expect(onChange).toHaveBeenCalledWith('dark');
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
});
