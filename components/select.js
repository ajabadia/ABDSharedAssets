/**
 * ABD Select — reusable option list for the ABDSynths suite.
 *
 * Family rules (see components/knob.js, slider.js, toggle.js):
 *   - constructor(container, options) + setValue/getValue/destroy + onChange;
 *   - pure DOM/CSS, themed via --color-* tokens with literal fallbacks;
 *   - silent setValue, onChange only on user edits.
 *
 * VALUE MODEL: the option INDEX (integer) — the discrete sibling of the
 * Toggle's boolean. Normalising to 0..1 stays with the caller on purpose: for a
 * `choice` parameter the index<->normalised mapping carries that parameter's own
 * skew/interval (generated contract), so folding it in here would drag
 * plugin-side maths into the shared layer. Same rule as the rest of the family:
 * the caller owns real units, the control owns the gesture.
 *
 * WHY A NATIVE <select>: keyboard, screen readers, touch and WebView2 all work
 * for free, and a 28-entry list needs scrolling that a custom listbox would have
 * to reimplement (and get wrong). The look is CSS; the behaviour is this class.
 * It is also the only member that does NOT use drag-core: dragging through 28
 * discrete entries picks a value by accident, which is worse than not offering
 * it. The dropdown and the arrow keys cover editing; a test pins that.
 *
 * DISABLED OPTIONS: entries can be marked unavailable (`disabled`) with a
 * `note` explaining why, and `setDisabled()` recomputes them at runtime — the
 * pattern a synth needs when a list depends on ANOTHER parameter (NEURONiK's
 * modulation destinations depend on the engine). A value that lands on a
 * disabled option is NOT rewritten: it is kept and flagged (`isDivergent()`,
 * `[data-divergent]`) so the UI can show host state it cannot offer instead of
 * silently changing it.
 *
 * Skins: tagged as kind 'select'; a skin may restyle it via the 'vector'
 * fallback (see components/skins/index.js).
 */

import { applySkin, CONTROL_KIND } from './skins/index.js';

/**
 * @param {HTMLElement|string} container
 * @param {object} options
 *   options   array of entries: 'Label' or { label, disabled?, note? }.
 *   value     initial index, default 0.
 *   label     optional text above the list.
 *   id        optional id for the <select> (lets a <label for> or a host
 *             script find it; the control never invents ids).
 *   disabled  array of indices or (entry, index) => boolean, default [].
 *   skin      optional skin name (see components/skins).
 *   onChange  (index) => void, fires on user picks only (not on setValue).
 */
export class Select
{
    constructor (container, options = {})
    {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (this.container == null)
            throw new Error('ABD Select: container not found');

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
        this[CONTROL_KIND] = 'select';

        this.buildDom();
        this.attachInteraction();

        if (this.options.skin)
            this.skin = applySkin(this.options.skin, this.wrapper, this);

        this.render();
    }

    buildDom ()
    {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'abd-select';

        // A <label for> is worth the four lines: it makes the list reachable by
        // clicking its name and by screen readers. Only when the caller gave an id.
        this.labelEl = null;

        if (this.options.label)
        {
            this.labelEl = document.createElement(this.options.id ? 'label' : 'span');
            this.labelEl.className = 'abd-select__label';
            this.labelEl.textContent = this.options.label;

            if (this.options.id)
                this.labelEl.htmlFor = this.options.id;

            this.wrapper.appendChild(this.labelEl);

            // The stacked look is opt-in: a bare <select class="abd-select"> from
            // the CSS-only library must not inherit a flex column (see widgets.css).
            this.wrapper.classList.add('abd-select--labelled');
        }

        this.field = document.createElement('select');
        this.field.className = 'abd-select__field';

        if (this.options.id)
            this.field.id = this.options.id;

        this.entries.forEach((entry, index) =>
        {
            const option = document.createElement('option');

            option.value = `${index}`;
            option.textContent = entry.label;
            this.field.appendChild(option);
        });

        this.wrapper.appendChild(this.field);
        this.container.appendChild(this.wrapper);
    }

    attachInteraction ()
    {
        const onChange = () =>
        {
            const index = Number(this.field.value);

            // A disabled entry is not selectable: put the field back and report
            // nothing, rather than emitting a value the UI just refused.
            if (this.isIndexDisabled(index))
            {
                this.render();
                return;
            }

            this.value = index;
            this.render();
            this.options.onChange?.(this.value);
        };

        this.field.addEventListener('change', onChange);
        this.listeners.push([this.field, 'change', onChange]);
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
        const count = this.entries.length;
        const hasOptions = count > 0;

        if (hasOptions)
            this.field.value = `${this.clampIndex(this.value)}`;

        [...this.field.options].forEach((option, index) =>
        {
            const entry = this.entries[index];
            const disabled = this.isIndexDisabled(index);

            option.disabled = disabled;   // recomputed: the spec may be dynamic
            option.title = entry?.note ?? '';
        });

        // The whole field stays enabled: a divergent value is information, not a
        // lock. With no entries at all there is nothing to pick.
        this.field.disabled = ! hasOptions;
        this.wrapper.dataset.divergent = this.isDivergent() && hasOptions ? 'true' : 'false';
        this.field.setAttribute('aria-valuenow', `${this.value}`);

        if (this.field.options[this.value])
            this.field.setAttribute(
                'aria-valuetext', this.field.options[this.value].textContent);
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
