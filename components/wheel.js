/**
 * ABD Wheel — reusable filmstrip modulation wheel (PITCH / MOD).
 *
 * Renders a label, a sprite sheet driven by a hidden vertical range slider,
 * and a value readout. Designed to be themed via --kbd-* / --color-* tokens
 * (see styles/components/wheels.css) and shared across ABDSynths projects.
 *
 * Usage:
 *   import { Wheel } from '@abdsynths/shared/components/wheel.js';
 *   const wheel = new Wheel(container, {
 *     type: 'pitch',            // 'pitch' | 'mod'
 *     spriteUrl: 'assets/bender.png',
 *     frameWidth: 18, frameHeight: 76, frames: 101,
 *     onChange: (normalized) => {},
 *   });
 *   wheel.destroy();
 */

const FRAME_HEIGHT = 76;
const FRAMES = 101;

export class Wheel {
  constructor(container, options = {}) {
    this.container = container;
    this.type = options.type || 'mod';
    this.spriteUrl = options.spriteUrl || 'assets/bender.png';
    this.frameWidth = options.frameWidth || 18;
    this.frameHeight = options.frameHeight || FRAME_HEIGHT;
    this.frames = options.frames || FRAMES;
    this._initialFrame = options.initialFrame ?? Math.floor((this.frames - 1) / 2);
    this.onChange = options.onChange || (() => {});
    this.isPitch = this.type === 'pitch';
    this.min = options.min !== undefined ? options.min : (this.isPitch ? -8192 : 0);
    this.max = options.max !== undefined ? options.max : (this.isPitch ? 8191 : 127);
    this.label = options.label || (this.isPitch ? 'PITCH' : 'MOD');
    this.valueFormatter = options.valueFormatter || this.defaultValueFormatter.bind(this);
    this._destroyed = false;

    this.render();
    this.attachEvents();
  }

  defaultValueFormatter(val) {
    if (this.isPitch) {
      const semitones = Math.round((val / 8192) * 20) / 10;
      return semitones > 0 ? `+${semitones}` : `${semitones}`;
    }
    return `${Math.round(val)}`;
  }

  render() {
    if (this.container.hasChildNodes()) return;
    this.container.classList.add('kbd-wheel-wrapper');
    this.container.innerHTML = `
      <label class="kbd-wheel-label">${this.label}</label>
      <div class="kbd-wheel-sprite"
           style="position:relative;width:${this.frameWidth}px;height:${this.frameHeight}px;background-image:url('${this.spriteUrl}');background-position:0px ${this.isPitch ? -(this._initialFrame * this.frameHeight) : 0}px;background-repeat:no-repeat;border-radius:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.8);">
        <input type="range" class="kbd-wheel-slider" min="${this.min}" max="${this.max}" value="0" step="1"
          aria-label="${this.isPitch ? 'Pitch Bend Wheel' : 'Modulation Wheel'}"
          style="position:absolute;top:0;left:0;width:${this.frameWidth}px;height:${this.frameHeight}px;writing-mode:vertical-lr;direction:rtl;margin:0;cursor:pointer;opacity:0;z-index:5;">
      </div>
      <div class="kbd-wheel-value">${this.valueFormatter(0)}</div>
    `;
    this.sprite = this.container.querySelector('.kbd-wheel-sprite');
    this.slider = this.container.querySelector('.kbd-wheel-slider');
    this.valueEl = this.container.querySelector('.kbd-wheel-value');
  }

  updateVisuals(val) {
    const pct = this.isPitch ? (val + 8192) / 16383 : val / this.max;
    const frame = Math.max(0, Math.min(this.frames - 2, Math.round(pct * (this.frames - 1))));
    this.sprite.style.backgroundPosition = `0px -${frame * this.frameHeight}px`;
    this.valueEl.textContent = this.valueFormatter(val);
  }

  setValue(val, notify = true) {
    const clamped = Math.max(this.min, Math.min(this.max, val));
    this.slider.value = clamped;
    this.updateVisuals(clamped);
    if (notify) this.onChange(clamped);
  }

  reset() {
    this.setValue(0);
  }

  attachEvents() {
    const onInput = () => {
      const val = parseInt(this.slider.value, 10);
      this.updateVisuals(val);
      this.onChange(val);
    };
    this.slider.addEventListener('input', onInput);
    if (this.isPitch) {
      const resetSpring = () => { this.slider.value = 0; this.updateVisuals(0); this.onChange(0); };
      this.slider.addEventListener('mouseup', resetSpring);
      this.slider.addEventListener('touchend', resetSpring);
      this.slider.addEventListener('mouseleave', (e) => { if (e.buttons === 1) resetSpring(); });
    }
    this.slider.addEventListener('dblclick', () => {
      this.slider.value = 0; this.updateVisuals(0); this.onChange(0);
    });
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.container) this.container.innerHTML = '';
  }
}

/**
 * Convenience factory mirroring the legacy createKeyboard API.
 * @param {string|Element} elementId Container element or its id.
 * @param {Object} config { type, spriteUrl, onChange }
 * @returns {Wheel|null}
 */
export function createWheel(elementId, config = {}) {
  const el = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;
  if (!el) return null;
  return new Wheel(el, config);
}