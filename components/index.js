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
export { FilmstripFader } from './filmstripFader.js';
export { Toggle } from './toggle.js';
export { Wheel } from './wheel.js';
export { XYPad } from './xypad.js';
export { ThemeSwitcher } from './themeSwitcher.js';
export { computeFit, mountFitStage } from './fitStage.js';
export { registerSkin, getSkin, applySkin, skinNames } from './skins/index.js';
export { WAVEFORM_GLYPHS, WAVEFORM_NAMES, waveformName } from './waveforms.js';
export { NumberBox } from './numberbox.js';
export { createDrawer } from './drawer.js';
// La matriz de modulacion NO es un control: no tiene parametro propio ni
// escribe valores. Es una VISTA de las rutas, y por eso vive aqui y no en
// la familia de controles (ver la cabecera de modMatrix.js).
export { ModMatrix } from './modMatrix.js';
export { createOverlayFocus, focusableWithin } from './overlayFocus.js';
export { createLcdMachine, formatValue } from './lcdMachine.js';
export { createLcdScreen } from './lcdScreen.js';
export { createLcdPanel } from './lcdPanel.js';
export { enhanceRangeInputs, destroyEnhancedRangeInputs } from '../utils/index.js';
export { WAVE_ICONS, FILTER_ICONS } from './icons.js';
export { SevenSegmentDisplay } from './sevenSegmentDisplay.js';
export { SilverFilmstripKnob } from './silverFilmstripKnob.js';
export { EffectLEDButton } from './effectLEDButton.js';
export { PeakLED } from './peakLED.js';
export { TapeEchoVisual } from './tapeEchoVisual.js';
// Contrato compartido de AVISOS DE TRANSICION: un cambio real avisa una vez;
// una intencion sin cambio, no (lo hablan Toggle, Segmented y XYPad).
export { sameControlValue, transitioned, announceTransition } from './transitionNotices.js';
export { announceMovement, announceSettled, createContinuousNotices } from './continuousNotices.js';

// Temas de los modulos de efecto del rack FX: el tema va por FAMILIA
// (reverb, tape, space...) y no por efecto, porque hay 57 ids y once
// familias. El aspecto de verdad esta en styles/components/fx.css y un
// test ata las dos mitades para que no se separen.
export {
  FX_THEME_TOKENS,
  registerFxTheme,
  getFxTheme,
  getNeutralFxTheme,
  fxThemeNames,
  fxThemeStyle,
  buildFxThemeIndex,
} from './fxTheme.js';
