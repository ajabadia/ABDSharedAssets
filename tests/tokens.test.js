/**
 * Theme contract for the shared token set (styles/tokens.css).
 *
 * The dark theme lives in `:root`, the light mode in `[data-theme="light"]`.
 * The design rule this test enforces in BOTH directions:
 *   1. every COLOR / SHADOW token of :root has a light counterpart
 *      (no accidental dark inheritance);
 *   2. the light block invents NO tokens and does NOT stomp theme-independent
 *      scales (sizes, spacing, fonts, radii, transitions, z-index, layout);
 *   3. deliberate decisions stay locked: surfaces flip, the LCD stays
 *      self-lit (identical to dark, like hardware);
 *   4. the tintable background follows the theme by construction
 *      (backgrounds.css resolves --abd-bg-tint from --color-bg-base and
 *      re-resolves it on the themed element).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../styles/tokens.css'), 'utf-8').replace(/^\uFEFF/, '');
const backgrounds = readFileSync(join(here, '../styles/components/backgrounds.css'), 'utf-8');

/** Custom properties of a top-level block, with brace-depth matching
 *  (tokens.css nests ::-webkit-scrollbar rules inside :root). */
function blockVars(selector) {
  const start = css.indexOf(selector);
  expect(start, `bloque ${selector} no encontrado`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(open + 1, i - 1);
  const map = new Map();
  for (const m of body.matchAll(/(--[a-zA-Z][\w-]*)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const root = blockVars(':root');
const light = blockVars('[data-theme="light"]');
const isColorish = (name) => /^--(color|shadow)-/.test(name);

describe('tokens theme contract', () => {
  it('defines every color/shadow token of :root in the light theme', () => {
    const missing = [...root.keys()].filter((k) => isColorish(k) && !light.has(k));
    expect(missing, `sin version clara: ${missing.join(', ')}`).toEqual([]);
  });

  it('invents no tokens in the light theme', () => {
    const invented = [...light.keys()].filter((k) => !root.has(k));
    expect(invented, `tokens que no existen en :root: ${invented.join(', ')}`).toEqual([]);
  });

  it('keeps theme-independent scales out of the light block', () => {
    const stomped = [...light.keys()].filter((k) => !isColorish(k));
    expect(stomped, `el claro no debe pisar: ${stomped.join(', ')}`).toEqual([]);
  });

  it('flips the surfaces and keeps the LCD self-lit', () => {
    expect(light.get('--color-bg-base')).not.toBe(root.get('--color-bg-base'));
    expect(light.get('--color-panel-surface')).not.toBe(root.get('--color-panel-surface'));
    expect(light.get('--color-accent')).not.toBe(root.get('--color-accent'));
    // Decision de diseño: el LCD es autoiluminado, idéntico en ambos temas.
    expect(light.get('--color-lcd-bg')).toBe(root.get('--color-lcd-bg'));
    expect(light.get('--color-lcd-text')).toBe(root.get('--color-lcd-text'));
  });

  it('lets the tintable background follow the theme by construction', () => {
    // El tinte por defecto nace del color base del tema...
    expect(backgrounds).toContain('--abd-bg-tint: var(--color-bg-base');
    // ...y se re-resuelve en el elemento tematizado (data-theme en <html> o <body>).
    expect(backgrounds).toMatch(/\[data-theme\]\s*\{\s*--abd-bg-tint:\s*var\(--color-bg-base/);
  });
});
