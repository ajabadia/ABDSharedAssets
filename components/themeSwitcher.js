/**
 * ABDSharedAssets — theme switcher (page infrastructure, not a control).
 * =========================================================================
 *
 * Un selector de TEMAS universal: el interruptor es compartido, los temas son
 * de cada synth. Cada botón aplica su tema con `data-theme` en el elemento
 * raíz que se le dé (convención de la suite: `<html>` como MS2000, o `<body>`
 * como el demo — ambos funcionan porque tokens.css y backgrounds.css resuelven
 * en el elemento tematizado y heredan hacia abajo).
 *
 * ¿Qué es un "tema" aquí? Un juego de tokens en styles/tokens.css. La suite
 * trae dos: `dark` (el `:root`, sin atributo) y `light` ([data-theme="light"]).
 * Un synth define los suyos añadiendo bloques `[data-theme="..."]` — NO copia
 * CSS de widgets: solo tokens. Todo lo demás (widgets, skins, fondo tintable,
 * LCD, sombras) es universal y le llega gratis.
 *
 * Usage:
 *   import { ThemeSwitcher } from '@abdsynths/shared/components';
 *   const ts = new ThemeSwitcher(container, {
 *     themes: [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }],
 *     root: document.documentElement,      // default
 *     storageKey: 'neuronik.theme',        // opcional: recuerda la elección
 *     onChange: (id) => {},
 *   });
 *   // ts.value -> tema activo; ts.setValue('light'); ts.destroy();
 */

const DEFAULT_THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

export class ThemeSwitcher {
  /**
   * @param {HTMLElement} container
   * @param {object} [options]
   * @param {Array<{id: string, label: string}>} [options.themes]
   * @param {HTMLElement} [options.root]       dónde se aplica data-theme (default documentElement)
   * @param {string} [options.storageKey]      si se da, persiste la elección
   * @param {string} [options.initialTheme]    tema inicial (default: guardado o 'dark')
   * @param {(themeId: string) => void} [options.onChange]
   */
  constructor(container, {
    themes = DEFAULT_THEMES,
    root = typeof document !== 'undefined' ? document.documentElement : null,
    storageKey = null,
    initialTheme = null,
    onChange = null,
  } = {}) {
    if (!container) throw new Error('ThemeSwitcher: container requerido');
    if (!root) throw new Error('ThemeSwitcher: sin root ni document');
    if (!Array.isArray(themes) || themes.length === 0) {
      throw new Error('ThemeSwitcher: themes vacío');
    }
    const ids = themes.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('ThemeSwitcher: ids de tema duplicados');
    }

    this._themes = themes.map((t) => ({ ...t }));
    this._root = root;
    this._storageKey = storageKey;
    this._onChange = onChange || null;
    this._buttons = new Map();
    this._handlers = new Map();

    this._element = document.createElement('div');
    this._element.className = 'abd-theme-switcher';
    this._element.setAttribute('role', 'group');
    this._element.setAttribute('aria-label', 'Theme');

    for (const theme of this._themes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'abd-theme-switcher__btn';
      btn.textContent = theme.label;
      btn.dataset.themeId = theme.id;
      const onClick = () => this.setValue(theme.id, { fromUser: true });
      btn.addEventListener('click', onClick);
      this._handlers.set(theme.id, onClick);
      this._element.append(btn);
      this._buttons.set(theme.id, btn);
    }
    container.append(this._element);

    const stored = storageKey ? this._readStorage() : null;
    const start = initialTheme ?? stored ?? this._themes[0].id;
    this._apply(start, { fromUser: false });
  }

  get element() { return this._element; }

  get value() { return this._value; }

  get themeIds() { return this._themes.map((t) => t.id); }

  setValue(themeId, { fromUser = true } = {}) {
    if (!this._buttons.has(themeId)) {
      throw new Error(`ThemeSwitcher: tema desconocido "${themeId}"`);
    }
    this._apply(themeId, { fromUser });
  }

  destroy() {
    for (const [id, fn] of this._handlers) {
      this._buttons.get(id)?.removeEventListener('click', fn);
    }
    this._handlers.clear();
    this._buttons.clear();
    this._element.remove();
  }

  _apply(themeId, { fromUser }) {
    this._value = themeId;
    if (themeId === 'dark') {
      // 'dark' es el :root (sin atributo): así el default de la página no
      // depende de que el atributo exista.
      this._root.removeAttribute('data-theme');
    } else {
      this._root.setAttribute('data-theme', themeId);
    }
    for (const [id, btn] of this._buttons) {
      btn.classList.toggle('is-active', id === themeId);
      btn.setAttribute('aria-pressed', id === themeId ? 'true' : 'false');
    }
    if (this._storageKey) {
      try { localStorage.setItem(this._storageKey, themeId); } catch { /* sandbox */ }
    }
    if (fromUser) this._onChange?.(themeId);
  }

  _readStorage() {
    try {
      const v = localStorage.getItem(this._storageKey);
      return this._buttons.has(v) ? v : null;
    } catch { return null; }
  }
}
