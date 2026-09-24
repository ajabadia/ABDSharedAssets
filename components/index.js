/**
 * ABDSharedAssets — control family barrel.
 *
 * Every control shares the same contract (constructor(container, options),
 * setValue/getValue/destroy, onChange/onDragStart/onDragEnd) and is themed only
 * through CSS custom properties from styles/tokens.css. HOW a control looks is a
 * swappable SKIN (components/skins) so each synth picks its own: 'vector',
 * 'ms2000', 'junio'... or its own via registerSkin().
 *
 * Usage:
 *   import { Knob, Slider, Select, Toggle } from '@abdsynths/shared/components';
 *   new Knob(el, { skin: 'ms2000', value: 0.5, onChange });
 */

export { Knob } from './knob.js';
export { Select } from './select.js';
export { Segmented } from './segmented.js';
export { Slider } from './slider.js';
export { Toggle } from './toggle.js';
export { Wheel } from './wheel.js';
export { XYPad } from './xypad.js';
export { ThemeSwitcher } from './themeSwitcher.js';
export { computeFit, mountFitStage } from './fitStage.js';
export { registerSkin, getSkin, applySkin, skinNames } from './skins/index.js';
export { createDrawer } from './drawer.js';
export { createLcdMachine, formatValue } from './lcdMachine.js';
export { createLcdScreen } from './lcdScreen.js';
export { createLcdPanel } from './lcdPanel.js';
