/**
 * ABD Knob — reusable rotary knob for the ABDSynths suite.
 *
 * BEHAVIOUR lives here (value 0..1, drag via drag-core, contract), LOOK lives in
 * a skin (components/skins). Skins are swappable per synth:
 *
 *   new Knob(el, { skin: 'ms2000' })   vector with rim/cap/dot
 *   new Knob(el, { skin: 'junio'  })   photographic filmstrip
 *   new Knob(el)                       'vector' (default)
 *
 * Family contract (see COMPONENTS.md): constructor(container, options),
 * setValue/getValue/destroy, onChange on user edits only, themed via tokens.
 */

import { attachDrag } from './drag-core.js';
import { applySkin, CONTROL_KIND } from './skins/index.js';

const SWEEP_DEGREES = 270;   // classic knob sweep: -135..+135
const START_ANGLE = -135;

/**
 * @param {HTMLElement|string} container  Element or selector to mount into.
 * @param {object} options
 *   size        px, default 64.
 *   value       initial normalised 0..1, default 0.
 *   label       text above the knob, optional.
 *   skin        skin name (see components/skins), default 'vector'.
 *   format      (normalised) => string for the readout, default percent.
 *   step        keyboard step, default 0.01.
 *   onChange    (normalised) => void, fires on user edits (not on setValue).
 *   onDragStart / onDragEnd  for host gesture bridging.
 *
 * MODULATION RING (telemetry-driven, real-time only): setModulation(normalised)
 * asks the skin to paint a ring from the value's angle to the modulated angle —
 * how a mod matrix sums onto the parameter (the native LookAndFeel draws the
 * same arc). It never fires onChange and never touches the value: telemetry is
 * paint, not state. clearModulation() removes it.
 */
export class Knob
{
    constructor (container, options = {})
    {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (this.container == null)
            throw new Error('ABD Knob: container not found');

        this.options = {
            size: 64,
            value: 0,
            label: '',
            skin: 'vector',
            step: 0.01,
            format: (v) => `${Math.round(v * 100)}%`,
            onChange: null,
            onDragStart: null,
            onDragEnd: null,
            ...options,
        };

        this.value = clamp01(this.options.value);
        this.dragDetach = null;
        this.modAmount = 0;   // signed, normalised against the parameter range
        this[CONTROL_KIND] = 'knob';

        this.buildDom();
        this.attachInteraction();
        this.render();
    }

    buildDom ()
    {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'abd-knob';
        this.wrapper.style.setProperty('--abd-knob-size', `${this.options.size}px`);

        if (this.options.label)
        {
            this.labelEl = document.createElement('span');
            this.labelEl.className = 'abd-knob__label';
            this.labelEl.textContent = this.options.label;
            this.wrapper.appendChild(this.labelEl);
        }

        // Interaction surface: focusable, role=slider, owned by drag-core.
        this.dial = document.createElement('div');
        this.dial.className = 'abd-knob__dial';
        this.dial.tabIndex = 0;
        this.dial.setAttribute('role', 'slider');
        this.dial.setAttribute('aria-valuemin', '0');
        this.dial.setAttribute('aria-valuemax', '1');

        // The skin paints INSIDE the interaction surface and owns its own DOM.
        this.skin = applySkin(this.options.skin, this.dial, this);

        this.wrapper.appendChild(this.dial);
        this.container.appendChild(this.wrapper);
    }

    attachInteraction ()
    {
        this.dragDetach = attachDrag(this.dial, {
            // 0.75 turns of the drag lane spans the full 0..1 range.
            onDelta: (turns) => clamp01(this.value + turns * 0.75),
            onValue: (newValue) =>
            {
                this.value = newValue;
                this.render();
                this.options.onChange?.(this.value);
            },
            onDragStart: () => this.options.onDragStart?.(),
            onDragEnd: () => this.options.onDragEnd?.(),
            onStep: (direction) => clamp01(this.value + direction * this.options.step),
        });
    }

    /**
     * @brief Modulation amount for the ring: SIGNED normalised offset relative
     * to the parameter's range — native semantics ((mod - rangeStart) /
     * rangeLength), negative with bidirectional LFOs. Updates the skin only.
     * NaN/undefined mean "no data this frame" and clear rather than poison.
     */
    setModulation (modAmount)
    {
        const amount = Number(modAmount);

        this.modAmount = Number.isFinite(amount) ? Math.min(1, Math.max(-1, amount)) : 0;
        this.render();
    }

    /** @brief No modulation this frame: ring off. */
    clearModulation ()
    {
        this.modAmount = 0;
        this.render();
    }

    /** @brief Current modulation amount, for skins and tests. */
    getModulation () { return this.modAmount; }

    /** @brief Push the current value into the skin + aria. Skins re-read getValue. */
    render ()
    {
        this.skin?.update();
        this.dial.setAttribute('aria-valuenow', `${this.value}`);
        this.dial.setAttribute('aria-valuetext', this.options.format(this.value));
    }

    /** @brief Programmatic update: does NOT fire onChange (user edits do). */
    setValue (value)
    {
        this.value = clamp01(Number(value) || 0);
        this.render();
    }

    getValue () { return this.value; }

    destroy ()
    {
        this.dragDetach?.();
        this.skin?.destroy();
        this.wrapper.remove();
    }
}

function clamp01 (v) { return Math.min(1, Math.max(0, v)); }
