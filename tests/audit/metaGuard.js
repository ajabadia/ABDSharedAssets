/**
 * Meta-guardia: que las guardias de cobertura sigan pudiendo fallar.
 *
 * Lee el fuente de ./rules.js (donde viven los `describe(cobertura ...)`) y caza las
 *
 * aserciones que comparan la misma expresion a los dos lados: no pueden fallar.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closingIndex,
  withoutComments,
} from './detectors.js';

/* ---------------------------------------------------------------------------
 * Meta-guardia: que las guardias de cobertura sigan pudiendo fallar
 * ------------------------------------------------------------------------- */

/** Matchers simetricos: los dos lados son el mismo tipo de valor, asi que si su texto
 *  es identico la asercion no puede fallar. */
const SYMMETRIC_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/** El texto de una expresion con los espacios de sobra colapsados, para comparar los
 *  dos lados de una asercion. */
const squeezed = (text) => text.replace(/\s+/g, ' ').trim();

/** La linea (1-based) en la que cae un indice del fuente. */
const lineOf = (text, at) => text.slice(0, at).split('\n').length;

/** Si un indice cae dentro de alguna de las regiones `[inicio, fin]`. */
const withinRanges = (ranges, at) => ranges.some(([start, end]) => at >= start && at <= end);

/** El propio fuente de la auditoria, para que la meta-guardia se mire en el espejo. */
const SELF_SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rules.js'), 'utf-8');

/** Las regiones `[inicio, fin]` de cada `describe('cobertura ...')`: las guardias de
 *  cobertura, que son las que tienden a quedar pinzadas. Si un describe se renombra
 *  sin el prefijo, la meta-guardia pierde esa guardia de vista, asi que un test exige
 *  que encuentre unas cuantas. */
function coverageGuardRanges(source) {
  const ranges = [];

  for (const match of source.matchAll(/\bdescribe\s*\(\s*(['"])(cobertura[^'"]*)\1\s*,/g)) {
    const blockOpen = source.indexOf('{', match.index + match[0].length);

    if (blockOpen < 0)
      continue;

    const blockClose = closingIndex(source, blockOpen);

    if (blockClose >= 0)
      ranges.push([match.index, blockClose]);
  }

  return ranges;
}

/** Cuantas aserciones (`expect(`) caen dentro de las regiones: si esto baja a cero, la
 *  meta-guardia estaria mirando un fuente sin guardias. */
function scannedAssertions(source, ranges) {
  return [...withoutComments(source).matchAll(/\bexpect\s*\(/g)]
    .filter((match) => withinRanges(ranges, match.index)).length;
}

/** Aserciones que comparan LA MISMA expresion a los dos lados:
 *  `expect(visibles).toEqual(visibles)`. No pueden fallar, asi que una guardia de
 *  cobertura que llegue a eso ya no vigila nada: quedo PINZADA. Se mira el fuente SIN
 *  comentarios (una asercion de ejemplo dentro de un comentario no cuenta) y solo en
 *  los matchers simetricos, donde comparar el mismo texto es la tautologia. `ranges`
 *  limita el barrido a las guardias de cobertura; sin el, mira todo el fuente. */
function selfComparedAssertions(source, ranges = null) {
  const code = withoutComments(source);
  const off = [];

  for (const expect of code.matchAll(/\bexpect\s*\(/g)) {
    if (ranges != null && !withinRanges(ranges, expect.index))
      continue;

    const open = expect.index + expect[0].length - 1;
    const close = closingIndex(code, open);

    if (close < 0)
      continue;

    const matcher = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(close + 1));

    if (matcher == null || !SYMMETRIC_MATCHERS.has(matcher[1]))
      continue;

    const matcherOpen = close + 1 + matcher[0].length - 1;
    const matcherClose = closingIndex(code, matcherOpen);

    if (matcherClose < 0)
      continue;

    const left = squeezed(code.slice(open + 1, close));
    const right = squeezed(code.slice(matcherOpen + 1, matcherClose));

    if (left === right)
      off.push(`${lineOf(code, expect.index)}: expect(${left}).${matcher[1]}(...) compara la misma expresion a los dos lados`);
  }

  return off;
}

describe('meta-guardia: las guardias de cobertura no pueden volverse tautologicas', () => {
  const ranges = coverageGuardRanges(SELF_SOURCE);

  it('encuentra las guardias de cobertura (no se mira en un fuente vacio)', () => {
    expect(ranges.length).toBeGreaterThanOrEqual(6);
    expect(scannedAssertions(SELF_SOURCE, ranges)).toBeGreaterThanOrEqual(10);
  });

  it('ninguna asercion de las guardias compara la misma expresion a los dos lados', () => {
    expect(selfComparedAssertions(SELF_SOURCE, ranges)).toEqual([]);
  });

  it('la meta-guardia muerde: caza una guardia tautologica', () => {
    expect(selfComparedAssertions('expect(visibles).toEqual(visibles);')).toHaveLength(1);
    expect(selfComparedAssertions('expect(visibles).toEqual(["a", "b"]);')).toEqual([]);
    expect(selfComparedAssertions('expect(a).toEqual(b); expect(c).toBe(c);')).toHaveLength(1);
  });
});
