/**
 * FitStage — the design-canvas-to-viewport fit (page infrastructure).
 * ================================================================
 *
 * The canvas is FIXED-DESIGN (the layout of the controls is a number, not a
 * print) and the editor window is resizable: without a fit, a window shorter
 * than the design CUTS the bottom (footer and keyboard strip) out of view.
 *
 * The fix is page-level: scale the canvas with `transform` so it falls whole
 * inside the viewport, centring the leftover axis. `transform` does not change
 * the layout box, so the page must keep `body { overflow: hidden }` (a usage
 * requirement, documented in COMPONENTS.md) — otherwise the unscaled box would
 * generate scrollbars.
 *
 * This is page INFRASTRUCTURE, not a control: no constructor/setValue contract,
 * just two pure/mount functions. Design size always comes as a parameter — the
 * package never knows a synth's canvas; each synth passes its own from its own
 * SSOT (NEURONiK: `CANVAS` from sections.js; CZ101: its 1409x768).
 *
 * Scales are clamped to [minScale, maxScale] (defaults 0.25x..3x, the range of
 * NEURONiK's old native zoom). A caller may widen or narrow them: clamping is
 * the mechanism, the numbers are per-synth.
 */

/**
 * Scale and centring so the design falls whole inside the viewport.
 *
 * @param {object} p
 * @param {number} p.viewportWidth   available width (CSS px)
 * @param {number} p.viewportHeight  available height (CSS px)
 * @param {number} p.designWidth     design canvas width
 * @param {number} p.designHeight    design canvas height
 * @param {number} [p.minScale=0.25] lower clamp (per-synth, optional)
 * @param {number} [p.maxScale=3]    upper clamp (per-synth, optional)
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 *   `scale` clamped to [minScale, maxScale]; offsets (>= 0) centre the spare axis.
 */
export function computeFit({
  viewportWidth,
  viewportHeight,
  designWidth,
  designHeight,
  minScale = 0.25,
  maxScale = 3,
}) {
  const vw = Math.max(1, Number(viewportWidth) || 0);
  const vh = Math.max(1, Number(viewportHeight) || 0);
  const dw = Math.max(1, Number(designWidth) || 0);
  const dh = Math.max(1, Number(designHeight) || 0);

  const min = Math.max(0, Number(minScale) || 0);
  const max = Math.max(min, Number(maxScale) || min);

  const scale = Math.min(max, Math.max(min, Math.min(vw / dw, vh / dh)));

  return {
    scale,
    offsetX: Math.max(0, (vw - dw * scale) / 2),
    offsetY: Math.max(0, (vh - dh * scale) / 2),
  };
}

/**
 * Mount the fit on the stage element and keep it fresh on every resize.
 *
 * @param {HTMLElement} stage      the design canvas (carries the design size in CSS)
 * @param {object} [options]
 * @param {number} options.width   design width
 * @param {number} options.height  design height
 * @param {number} [options.minScale=0.25] lower clamp
 * @param {number} [options.maxScale=3]    upper clamp
 * @param {object} [options.viewport]  object with innerWidth/innerHeight and
 *   addEventListener (injectable for tests; default `window`)
 * @returns {() => void} removes the resize listener
 */
export function mountFitStage(stage, { width, height, minScale, maxScale, viewport = window } = {}) {
  const apply = () => {
    const { scale, offsetX, offsetY } = computeFit({
      viewportWidth: viewport.innerWidth,
      viewportHeight: viewport.innerHeight,
      designWidth: width,
      designHeight: height,
      minScale,
      maxScale,
    });

    stage.style.transformOrigin = 'top left';
    stage.style.transform = `scale(${scale})`;
    stage.style.marginLeft = `${offsetX}px`;
    stage.style.marginTop = `${offsetY}px`;
  };

  apply();
  viewport.addEventListener('resize', apply);

  return () => viewport.removeEventListener('resize', apply);
}
