/**
 * fitStage `onlyShrink` — fluid pages (MS2000): identity when the viewport
 * already fits the design, shrink+centre below it, never upscale past it.
 * At identity the centring margins are zeroed so a 100%-width fluid app keeps
 * filling the viewport untouched.
 */

import { describe, expect, it, vi } from 'vitest';

import { computeFit, mountFitStage } from '../components/fitStage.js';

function makeFakeViewport() {
  const listeners = new Map();
  return {
    innerWidth: 1424,
    innerHeight: 780,
    listeners,
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    emit(type) {
      const fn = listeners.get(type);
      if (fn) fn();
    },
  };
}

describe('fitStage / onlyShrink', () => {
  it('identity with zero offsets when the viewport already fits the design', () => {
    // 1424x780 >= 1080x680: no shrink, no margins (the fluid page fills).
    expect(
      computeFit({ viewportWidth: 1424, viewportHeight: 780, designWidth: 1080, designHeight: 680, onlyShrink: true }),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('below the design it scales and centres like the normal mode', () => {
    const fit = computeFit({ viewportWidth: 810, viewportHeight: 680, designWidth: 1080, designHeight: 680, onlyShrink: true });
    expect(fit.scale).toBe(0.75);
    expect(fit.offsetX).toBe(0);
    // Vertical spare space still gets centred even while shrinking.
    expect(fit.offsetY).toBe((680 - 680 * 0.75) / 2);
  });

  it('hard-caps at 1 even when maxScale is higher', () => {
    expect(
      computeFit({ viewportWidth: 3000, viewportHeight: 2000, designWidth: 1080, designHeight: 680, maxScale: 3, onlyShrink: true }).scale,
    ).toBe(1);
  });

  it('honours a lower maxScale (clamps still apply below 1)', () => {
    expect(
      computeFit({ viewportWidth: 810, viewportHeight: 680, designWidth: 1080, designHeight: 680, maxScale: 0.5, onlyShrink: true }).scale,
    ).toBe(0.5);
  });

  it('mountFitStage applies identity when large and shrinks on resize', () => {
    const stage = document.createElement('div');
    const viewport = makeFakeViewport();

    mountFitStage(stage, { width: 1080, height: 680, onlyShrink: true, viewport });

    // Identity CLEARS the transform (scale(1) would still create a containing
    // block and re-anchor fixed overlays). Margins zeroed too.
    expect(stage.style.transform).toBe('');
    expect(stage.style.marginLeft).toBe('0px');
    expect(stage.style.marginTop).toBe('0px');

    viewport.innerWidth = 700;
    viewport.emit('resize');

    // 700/1080 = 0.6481481481481481
    expect(stage.style.transform).toBe('scale(0.6481481481481481)');
    expect(stage.style.marginLeft).toBe('0px');
  });

  it('detach still unsubscribes the resize listener', () => {
    const stage = document.createElement('div');
    const viewport = makeFakeViewport();
    const removeSpy = vi.spyOn(viewport, 'removeEventListener');

    const detach = mountFitStage(stage, { width: 1080, height: 680, onlyShrink: true, viewport });
    detach();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(viewport.listeners.get('resize')).toBeUndefined();
  });

  it('without onlyShrink the default keeps upscaling (backward compatible)', () => {
    expect(computeFit({ viewportWidth: 2160, viewportHeight: 1360, designWidth: 1080, designHeight: 680 }).scale).toBe(2);
  });
});

describe('fitStage / stage box (fluid floors)', () => {
  it('centres the real scaled box when the stage is wider than the design', () => {
    // Crossed axes: wide-but-short viewport, stage floor 1900 wide.
    // scale = 600/680 = 0.882; the scaled box (1900*0.882 = 1676) still fits in
    // 1900, so it gets centred against the REAL box, not the design box.
    const fit = computeFit({
      viewportWidth: 1900, viewportHeight: 600,
      designWidth: 1080, designHeight: 680,
      onlyShrink: true, stageWidth: 1900,
    });
    expect(fit.scale).toBeCloseTo(0.882, 3);
    expect(fit.offsetX).toBeCloseTo((1900 - 1900 * (600 / 680)) / 2, 3);
    expect(fit.offsetY).toBe(0);
  });

  it('deep shrink with a floor: no offset that would clip both edges', () => {
    // Tiny viewport (300x300): scale = 300/1080 = 0.2778 (above the 0.25 floor,
    // untouched). The scaled floor box (1900*0.2778 = 528) EXCEEDS the viewport:
    // centring the overflowing box would clip BOTH edges, so offset clamps to 0.
    const fit = computeFit({
      viewportWidth: 300, viewportHeight: 300,
      designWidth: 1080, designHeight: 680,
      minScale: 0.25, stageWidth: 1900,
    });
    expect(fit.scale).toBeCloseTo(300 / 1080, 6);
    expect(fit.offsetX).toBe(0);
    // Vertical fits (680*0.2778 = 189 < 300): still centred normally.
    expect(fit.offsetY).toBeCloseTo((300 - 680 * (300 / 1080)) / 2, 6);
  });

  it('mountFitStage measures the stage natural box (fluid floor) for centring', () => {
    const stage = document.createElement('div');
    // jsdom has no layout; simulate the measured floor (min-width engaged).
    Object.defineProperty(stage, 'offsetWidth', { value: 1900, configurable: true });
    Object.defineProperty(stage, 'offsetHeight', { value: 680, configurable: true });
    const viewport = makeFakeViewport();
    viewport.innerWidth = 1900;
    viewport.innerHeight = 600;

    mountFitStage(stage, { width: 1080, height: 680, onlyShrink: true, viewport });

    // scale = 600/680; the scaled floor box (1676) fits: centred against it,
    // NOT against the design box (which would clip the right edge).
    expect(stage.style.transform).toBe(`scale(${600 / 680})`);
    expect(stage.style.marginLeft).toBe(`${(1900 - 1900 * (600 / 680)) / 2}px`);
  });

  it('mountFitStage falls back to the design box when there is no layout (jsdom)', () => {
    const stage = document.createElement('div');
    const viewport = makeFakeViewport();
    viewport.innerWidth = 1424;
    viewport.innerHeight = 780;

    mountFitStage(stage, { width: 1440, height: 990, viewport });

    const scaledWidth = 1440 * (780 / 990);
    expect(stage.style.marginLeft).toBe(`${(1424 - scaledWidth) / 2}px`);
  });

  it('without stageWidth the defaults reproduce the design-box centring', () => {
    const a = computeFit({ viewportWidth: 1424, viewportHeight: 780, designWidth: 1440, designHeight: 990 });
    const b = computeFit({ viewportWidth: 1424, viewportHeight: 780, designWidth: 1440, designHeight: 990, stageWidth: 1440, stageHeight: 990 });
    expect(b).toEqual(a);
  });
});
