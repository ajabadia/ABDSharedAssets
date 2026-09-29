/**
 * Los temas de efectos: el registry, el CSS y el catalogo, atados.
 *
 * La regla del modulo (components/fxTheme.js) es que el tema vive en DOS
 * sitios a proposito —los literales de reserva en JS y el aspecto de verdad en
 * styles/components/fx.css— y que un test es lo que impide que se separen.
 * Este fichero es ese test. Sin el, "esta en los dos sitios" seria una
 * intencion; con el, es un hecho que se rompe en rojo.
 *
 * Lo que cubre:
 *
 *   1. CATALOGO COMPLETO. Que los 57 ids esten, sin huecos ni duplicados, y
 *      que cada familia usada exista en la tabla `families` del contrato.
 *   2. REGISTRY COMPLETO. Que TODA familia del catalogo tenga tema.
 *   3. CSS COMPLETO, en las dos direcciones. Que no haya una familia en el
 *      registry sin su regla CSS, ni una regla CSS sin familia. Este es el
 *      que mas duele cuando falta: un tema sin CSS no da error, da un modulo
 *      con los colores de otro.
 *   4. MISMOS TOKENS. Que registry y CSS declaren los mismos cinco tokens por
 *      familia, y en el MISMO orden (el orden es lo que hace comparables las
 *      dos listas al leerlas).
 *   5. FALLBACK NEUTRO. Que una familia desconocida devuelva el neutro en vez
 *      de romperse: un efecto sin tema todavia tiene que pintar.
 *   6. ESTILO INLINE. Que fxThemeStyle emita los cinco custom properties.
 *   7. EL INDICE. Que buildFxThemeIndex resuelva id -> familia y nombre, y que
 *      no se tronque con un id que no existe.
 *   8. QUE MUERDA. Que los detectores de (3) y (4) detecten de verdad: se les
 *      pasa un CSS y un registry rotos a proposito y tienen que soltarlos. Un
 *      detector que no muerde no vigila nada.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FX_THEME_TOKENS,
  buildFxThemeIndex,
  fxThemeNames,
  fxThemeStyle,
  getFxTheme,
  getNeutralFxTheme,
  registerFxTheme,
} from '../components/fxTheme.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const catalogue = JSON.parse(readFileSync(join(root, 'contracts', 'fx-effects.json'), 'utf-8'));
const css = readFileSync(join(root, 'styles', 'components', 'fx.css'), 'utf-8');

/* ── detectores puros (reciben el texto, no el disco) ─────────────────────── */

/**
 * Quita los comentarios de bloque del CSS.
 *
 * Sin esto los detectores se comen la PROSA: la cabecera de fx.css explica
 * como se adapta un tema con un ejemplo (`[data-fx-theme='reverb'] { ... }`),
 * y un detector que no distingue un ejemplo de una regla encuentra ese
 * primero, declara que al tema de reverb le falta cuatro tokens y rompe el
 * modulo en rojo por un comentario. Documentar el CSS con ejemplos es lo
 * normal, asi que el que tiene que arreglarse es el detector.
 */
export function stripCssComments (source)
{
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Las familias que declara una regla `[data-fx-theme='x']` del CSS. */
export function cssThemes (source)
{
  return [...stripCssComments(source).matchAll(/\[data-fx-theme=['"]([\w-]+)['"]\]/g)]
    .map((m) => m[1]);
}

/** Los custom properties `--fx-<token>` que declara UNA familia en el CSS. */
export function cssTokens (source, family)
{
  const block = new RegExp(`\\[data-fx-theme=['"]${family}['"]\\]\\s*\\{([^}]*)\\}`)
    .exec(stripCssComments(source));

  if (block == null)
    return [];

  return [...block[1].matchAll(/--fx-([\w-]+)\s*:/g)].map((m) => m[1]);
}

/** Las familias de una lista de ids del catalogo. */
export function catalogueFamilies (effects)
{
  return [...new Set(effects.map((e) => e.family))];
}

/* ── 1. el catalogo ───────────────────────────────────────────────────────── */

describe('el catalogo de efectos', () => {
  it('cubre los ids 0..56 sin huecos ni duplicados', () => {
    const ids = catalogue.effects.map((e) => e.id).sort((a, b) => a - b);

    expect(ids).toEqual([...Array(57).keys()]);
  });

  it('el id 0 es bypass y no tiene motor', () => {
    const bypass = catalogue.effects.find((e) => e.id === 0);

    expect(bypass.name).toBe('Bypass');
    expect(bypass.engine).toBeNull();
  });

  it('toda familia usada esta declarada en la tabla families', () => {
    const declared = catalogue.families.map((f) => f.id);
    const used = catalogueFamilies(catalogue.effects);

    expect(used.filter((f) => !declared.includes(f))).toEqual([]);
  });

  it('toda familia declarada la usa al menos un efecto', () => {
    const used = catalogueFamilies(catalogue.effects);
    const declared = catalogue.families.map((f) => f.id);

    expect(declared.filter((f) => !used.includes(f))).toEqual([]);
  });

  it('ningun efecto se queda sin nombre', () => {
    expect(catalogue.effects.filter((e) => !e.name).map((e) => e.id)).toEqual([]);
  });

  it('los ids de una variante del mismo motor son distintos', () => {
    // Varias filas comparten `engine` a proposito (es la politica inyectada
    // vista desde la interfaz), pero no pueden compartir id.
    const byId = new Map(catalogue.effects.map((e) => [e.id, e]));

    expect(byId.size).toBe(catalogue.effects.length);
  });
});

/* ── 2 y 3. registry y CSS, en las dos direcciones ───────────────────────── */

describe('el registry de temas cubre lo que el catalogo usa', () => {
  it('toda familia del catalogo tiene tema', () => {
    const missing = catalogueFamilies(catalogue.effects)
      .filter((family) => !fxThemeNames().includes(family));

    expect(missing).toEqual([]);
  });

  it('toda familia del catalogo tiene su regla CSS', () => {
    const inCss = cssThemes(css);
    const missing = catalogueFamilies(catalogue.effects)
      .filter((family) => !inCss.includes(family));

    expect(missing, 'familia con tema en JS y sin regla en el CSS: el modulo sale con los colores de otro')
      .toEqual([]);
  });

  it('no hay una regla CSS de una familia que el catalogo no usa', () => {
    const used = catalogueFamilies(catalogue.effects);
    const orphans = [...new Set(cssThemes(css))].filter((family) => !used.includes(family));

    expect(orphans, 'regla CSS de una familia que ya no usa nadie: CSS muerto').toEqual([]);
  });

  it('no hay un tema del registry de una familia que el CSS no tiene', () => {
    const inCss = new Set(cssThemes(css));
    const orphans = fxThemeNames().filter((family) => !inCss.has(family));

    expect(orphans, 'tema en JS sin CSS: nunca se vera, y el test lo creera completo')
      .toEqual([]);
  });
});

/* ── 4. los mismos tokens en los dos sitios ──────────────────────────────── */

describe('registry y CSS declaran los mismos tokens', () => {
  it('cada familia declara los cinco tokens en JS', () => {
    for (const family of fxThemeNames())
      expect(Object.keys(getFxTheme(family)).sort(), `tema incompleto: ${family}`)
        .toEqual([...FX_THEME_TOKENS].sort());
  });

  it('cada familia declara los mismos tokens, y en el mismo orden, en el CSS', () => {
    for (const family of fxThemeNames())
      expect(cssTokens(css, family), `los tokens del CSS no cuadran con el registry: ${family}`)
        .toEqual([...FX_THEME_TOKENS]);
  });
});

/* ── 5, 6 y 7. la API ────────────────────────────────────────────────────── */

describe('la API de fxTheme', () => {
  it('una familia desconocida cae en el neutro, no se rompe', () => {
    expect(getFxTheme('no-existe')).toEqual(getNeutralFxTheme());
  });

  it('un tema se puede registrar y sobreescribir', () => {
    registerFxTheme('prueba', { bg: '#123456' });
    expect(getFxTheme('prueba').bg).toBe('#123456');

    registerFxTheme('prueba', { bg: '#654321' });
    expect(getFxTheme('prueba').bg).toBe('#654321');
  });

  it('un tema parcial hereda del neutro lo que no declara', () => {
    registerFxTheme('parcial', { accent: '#ff0000' });

    const t = getFxTheme('parcial');

    expect(t.accent).toBe('#ff0000');
    expect(t.bg).toBe(getNeutralFxTheme().bg);
  });

  it('fxThemeStyle emite los cinco custom properties', () => {
    const style = fxThemeStyle('tape');

    for (const token of FX_THEME_TOKENS)
      expect(style).toContain(`--fx-${token}:`);

    expect(style).toContain(getFxTheme('tape').accent);
  });

  it('fxThemeStyle de una familia desconocida emite el neutro', () => {
    expect(fxThemeStyle('no-existe')).toBe(fxThemeStyle('bypass'));
  });

  it('el indice resuelve id -> familia y id -> nombre', () => {
    const index = buildFxThemeIndex(catalogue);

    expect(index.familyFor(39)).toBe('space');       // Space Echo
    expect(index.nameFor(39)).toBe('Space Echo');
    expect(index.familyFor(0)).toBe('bypass');
  });

  it('el indice no se tronca con un id que no existe ni con un catalogo vacio', () => {
    expect(buildFxThemeIndex(catalogue).familyFor(9999)).toBeNull();

    const empty = buildFxThemeIndex({ effects: [] });

    expect(empty.familyFor(1)).toBeNull();
    expect(empty.ids()).toEqual([]);
  });
});

/* ── 8. que los detectores muerdan ───────────────────────────────────────── */

describe('los detectores de desincronizacion muerden', () => {
  it('una familia con tema en JS y sin CSS se delata', () => {
    const truncated = css.replace(/\[data-fx-theme='tape'\]\s*\{[^}]*\}/, '');

    expect(cssTokens(truncated, 'tape')).toEqual([]);
    expect(cssThemes(truncated)).not.toContain('tape');
  });

  it('una regla CSS de una familia que ya no usa nadie se delata', () => {
    const withOrphan = `${css}\n.fx-module[data-fx-theme='retirado'] { --fx-bg: #000; }\n`;

    expect(cssThemes(withOrphan)).toContain('retirado');
  });

  it('un token renombrado en el CSS se delata (los dos lados dejan de cuadrar)', () => {
    const renamed = css.replace(
      /(\.fx-module\[data-fx-theme=')tape('\])/,
      "$1tape-x$2",
    );

    expect(cssTokens(renamed, 'tape')).toEqual([]);
  });

  it('un token que sobra en el CSS se delata aunque esten los otros cinco', () => {
    const extra = css.replace(
      /(\.fx-module\[data-fx-theme='tape'\][^}]*--fx-glow:[^;]*;)/,
      '$1 --fx-extra: #123;',
    );

    expect(cssTokens(extra, 'tape').length).toBeGreaterThan(FX_THEME_TOKENS.length);
  });

  it('un ejemplo en un comentario NO cuenta como regla', () => {
    // El motivo de existir de stripCssComments: sin esto, documentar el CSS
    // con un ejemplo de tema rompe el test.
    const withExample = `/* como se adapta:\n   .fx-module[data-fx-theme='reverb'] { --fx-accent: red; }\n*/\n${css}`;

    expect(cssThemes(withExample).filter((f) => f === 'reverb').length).toBe(1);
    expect(cssTokens(withExample, 'reverb')).toEqual([...FX_THEME_TOKENS]);
  });
});
