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
// El EnvelopePad (control editable), la VISTA de fabrica y la geometria
// pura: el consumidor pinta curvas sin montar DOM. El gesto vive aparte
// (envelopeGestures) y solo lo consume el pad: no es API del barrel.
export {
    DEFAULT_ENVELOPE,
    ENVELOPE_SEGMENTS,
    ENVELOPE_VIEWBOX,
    NEEDLE_FLOOR,
    createEnvelopeCurve,
    envelopeAreaPath,
    envelopeLinePath,
    envelopeNeedlePath,
    envelopePoints,
} from './envelopeCurve.js';
export { EnvelopePad } from './envelopePad.js';
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
// El catalogo de patches del S950 tampoco es un control: es un INDICE de lo que
// hay que pintar y con que rango, y lo mismo que modMatrix.js, vive aqui y no
// en la familia de controles. El JSON que indexa se genera desde el C++ del
// motor (scripts/generate_s950_patch_contract.py), asi que un panel y el motor
// no pueden dejar de decir lo mismo del mismo byte.
export {
  buildS950Catalogue,
  formatS950Name,
  isS950Bipolar,
  S950_ENCODINGS,
  S950_GROUPS,
} from './s950PatchFields.js';
// Y las CURVAS de calibracion del S950 son el otro indice que no es un control:
// dicen en que unidad esta cada magnitud y sobre que rango de panel, que es
// justo lo que un panel necesita para dibujar los ejes. El JSON sale del mismo
// sitio autoritativo del catalogo (SynthCore/S950Calibration.h via
// scripts/generate_s950_calibration_contract.py), y comparte su argumento:
// `valueAt()` devuelve SIEMPRE null porque nadie ha medido una sola curva en este
// repo, y un panel tiene que poder ENSENAR eso en vez de inventar un 0.
export {
  buildS950Calibration,
  s950AxisFor,
  s950Coverage,
  S950_UNITS,
} from './s950Calibration.js';
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
