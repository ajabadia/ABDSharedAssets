/**
 * ABD Segmented — reusable inline option switcher for the ABDSynths suite.
 *
 * Family rules (see components/select.js, knob.js, slider.js, toggle.js):
 *   - constructor(container, options) + setValue/getValue/destroy + onChange;
 *   - pure DOM/CSS, themed via --color-* tokens with literal fallbacks;
 *   - silent setValue, onChange only on user edits.
 *
 * VALUE MODEL: the option INDEX (integer) — identical to the Select. It is the
 * compact SIBLING of the Select for short, always-visible lists: the native
 * <select> stays the right tool for long or occasionally-huge lists (28
 * modulation destinations need scrolling for free); a segmented control shows
 * every choice as its own button, so the trade is width for immediacy.
 *
 * WHY NOT RADIO BUTTONS: a radiogroup is the semantics (roving tabindex,
 * arrow-key navigation per WAI-ARIA), but the LOOK is the synth's: flat
 * segments sharing one border, active segment filled with the accent. Keyboard,
 * screen readers and WebView2 work through the pattern, not through pixels.
 *
 * DISABLED OPTIONS: same contract as Select — a segment can be unavailable
 * (`disabled`) with a `note` explaining why, and `setDisabled()` recomputes at
 * runtime when another parameter gates the list. A value landing on a disabled
 * option is KEPT and flagged (`isDivergent()`, `[data-divergent]`) so the UI can
 * show host state it cannot offer instead of silently rewriting it.
 *
 * WIDTH: segments share the row (`flex: 1 1 0`), so N options fill the cell —
 * the grid maths of a synth page decide the cell, never the control. Long
 * labels truncate with ellipsis; full text stays in the `title`.
 *
 * Skins: tagged as kind 'segmented'; a skin may restyle it via the 'vector'
 * fallback (see components/skins/index.js).
 */

import { applySkin, CONTROL_KIND } from './skins/index.js';

/**
 * @param {HTMLElement|string} container
 * @param {object} options
 *   options   array of entries: 'Label' or { label, disabled?, note? }.
 *   value     initial index, default 0.
 *   label     optional text above the group.
 *   id        optional id for the group (lets a <label for> or a host script
 *             find it; the control never invents ids).
 *   disabled  array of indices or (entry, index) => boolean, default [].
 *   skin      optional skin name (see components/skins).
 *   onChange  (index) => void, fires on user picks only (not on setValue).
 */
export class Segmented
{
    constructor (container, options = {})
    {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (this.container == null)
            throw new Error('ABD Segmented: container not found');

        this.options = {
            options: [],
            value: 0,
            label: '',
            id: null,
            disabled: [],
            skin: 'vector',
            onChange: null,
            ...options,
        };

        this.entries = this.options.options.map(normalizeEntry);
        this.disabledSpec = this.options.disabled;
        this.value = this.clampIndex(this.options.value);
        this.listeners = [];
        this[CONTROL_KIND] = 'segmented';

        this.buildDom();
        this.attachInteraction();

        if (this.options.skin)
            this.skin = applySkin(this.options.skin, this.wrapper, this);

        this.render();
    }

    buildDom ()
    {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'abd-segmented';

        // Same <label for> deal as Select: reachable by name when the caller
        // gives an id. The target is the ACTIVE button, so focus/label agree.
        this.labelEl = null;

        if (this.options.label)
        {
            this.labelEl = document.createElement(this.options.id ? 'label' : 'span');
            this.labelEl.className = 'abd-segmented__label';
            this.labelEl.textContent = this.options.label;

            this.wrapper.appendChild(this.labelEl);
            this.wrapper.classList.add('abd-segmented--labelled');
        }

        this.group = document.createElement('div');
        this.group.className = 'abd-segmented__group';
        this.group.setAttribute('role', 'radiogroup');

        if (this.options.id)
        {
            this.group.id = this.options.id;
            this.group.setAttribute('aria-labelledby', `${this.options.id}-label`);
            this.labelEl.id = `${this.options.id}-label`;
            this.labelEl.htmlFor = this.options.id;
        }

        this.buttons = this.entries.map((entry, index) =>
        {
            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'abd-segmented__segment';
            button.setAttribute('role', 'radio');
            button.dataset.index = `${index}`;
            button.textContent = entry.label;
            this.group.appendChild(button);

            return button;
        });

        this.wrapper.appendChild(this.group);
        this.container.appendChild(this.wrapper);
    }

    attachInteraction ()
    {
        const onActivate = (event) =>
        {
            const index = Number(event.currentTarget.dataset.index);

            if (this.isIndexDisabled(index))
                return;   // a refused value reports nothing, like Select

            if (index === this.value)
                return;   // picking the active segment is a no-op

            this.value = index;
            this.render();
            this.options.onChange?.(this.value);
        };

        const onKey = (event) =>
        {
            // Arrow keys walk the options (wrapping), like a native radiogroup.
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    ? -1
                    : 0;

            if (step === 0)
                return;

            event.preventDefault();

            const count = this.entries.length;
            let next = this.value;

            for (let hops = 0; hops < count; hops += 1)
            {
                next = (next + step + count) % count;

                if (! this.isIndexDisabled(next))
                    break;
            }

            if (next === this.value || this.isIndexDisabled(next))
                return;

            this.value = next;
            this.render();
            this.options.onChange?.(this.value);
            this.buttons[this.value]?.focus();
        };

        for (const button of this.buttons)
        {
            button.addEventListener('click', onActivate);
            this.listeners.push([button, 'click', onActivate]);
        }

        // Keys live on the GROUP with delegation: focus follows the roving
        // tabindex (it sits on the active segment), and one listener covers
        // every focused segment.
        this.group.addEventListener('keydown', onKey);
        this.listeners.push([this.group, 'keydown', onKey]);
    }

    /** @brief Is this index unavailable under the current disabled spec? */
    isIndexDisabled (index)
    {
        const entry = this.entries[index];

        if (entry == null)
            return true;

        if (typeof this.disabledSpec === 'function')
            return Boolean(this.disabledSpec(entry, index));

        return (this.disabledSpec ?? []).includes(index);
    }

    /**
     * @brief Current value sits on an option the UI cannot offer (host state).
     * The value is deliberately KEPT: see the class note on disabled options.
     */
    isDivergent ()
    {
        return this.isIndexDisabled(this.value);
    }

    /** @brief Recompute availability (e.g. another parameter changed). */
    setDisabled (spec)
    {
        this.disabledSpec = spec ?? [];
        this.render();
    }

    /** @brief Push value + availability into the DOM. */
    render ()
    {
        this.buttons.forEach((button, index) =>
        {
            const active = index === this.value;
            const disabled = this.isIndexDisabled(index);
            const entry = this.entries[index];

            button.classList.toggle('is-active', active);
            button.setAttribute('aria-checked', active ? 'true' : 'false');
            button.disabled = disabled;
            button.title = entry?.note ?? '';
            button.tabIndex = active ? 0 : -1;   // roving tabindex: one stop
        });

        // A divergent value stays visible and flagged, never rewritten.
        this.wrapper.dataset.divergent = this.isDivergent() ? 'true' : 'false';
        this.wrapper.setAttribute('aria-valuenow', `${this.value}`);
        this.wrapper.setAttribute('aria-valuetext', this.entries[this.value]?.label ?? '');
    }

    /** @brief Programmatic update: does NOT fire onChange (user picks do). */
    setValue (index)
    {
        this.value = this.clampIndex(index);
        this.render();
    }

    getValue () { return this.value; }

    /** @brief Option labels, in order (diagnostics and tests). */
    getLabels ()
    {
        return this.entries.map((entry) => entry.label);
    }

    clampIndex (index)
    {
        const count = this.entries.length;

        if (count === 0)
            return 0;

        const n = Math.round(Number(index));

        return Math.min(count - 1, Math.max(0, Number.isFinite(n) ? n : 0));
    }

    destroy ()
    {
        for (const [element, event, handler] of this.listeners)
            element.removeEventListener(event, handler);

        this.listeners.length = 0;
        this.skin?.destroy();
        this.wrapper.remove();
    }
}

/** 'Label' and { label, disabled, note } are both accepted, everywhere. */
function normalizeEntry (entry)
{
    if (typeof entry === 'string')
        return { label: entry, disabled: false, note: '' };

    return {
        label: `${entry?.label ?? ''}`,
        disabled: Boolean(entry?.disabled),
        note: entry?.note ?? '',
    };
}
