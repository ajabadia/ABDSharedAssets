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
 * DISABLED OPTIONS: an entry is unavailable in two ways — by its own `disabled`
 * flag (`{ label, disabled: true, note }`) or by the `disabled` spec the control
 * takes (indices or a predicate), which `setDisabled()` recomputes at runtime.
 * The second is the pattern a synth needs when a list depends on ANOTHER
 * parameter (NEURONiK's modulation destinations depend on the engine); the reason
 * lives in the entry as a `note`. A value that lands on a disabled option is NOT
 * rewritten: it is kept and flagged (`isDivergent()`, `[data-divergent]`) so the
 * UI can show host state it cannot offer instead of silently changing it.
 *
 * ANNOUNCED, NOT JUST SEEN: the `note` is the option's accessible DESCRIPTION
 * (`aria-describedby`), never a `title`. A title is mouse-only for a person, and
 * for an option nobody can focus it reaches nobody at all. The note nodes live
 * OUTSIDE the <option>: a note inside it is swallowed into the option's
 * accessible NAME (measured in Chromium, as in Segmented).
 *
 * The CURRENT value needs it twice over: an <option> never takes focus, so the
 * reason of the option in use is ALSO copied onto the field's own description
 * (measured: with the value on a vetoed option the combobox exposed
 * `description=""` while the option carried the note).
 *
 * Skins: tagged as kind 'select'; a skin may restyle it via the 'vector'
 * fallback (see components/skins/index.js).
 */

import { applySkin, CONTROL_KIND } from './skins/index.js';
import { clampIndex, createNotes } from './optionIndex.js';

/**
 * Usage:
 *   const select = new Select(el, { options: ['Recta', 'Tri', 'Saw'], onChange });
 *   select.setValue(2);
 *   select.setDisabled([0]);            // vetos en caliente: indices o predicado
 *   select.setNote(0, 'Requiere el motor Neurotik');
 *   select.destroy();
 *
 * @param {HTMLElement|string} container
 * @param {object} options
 *   options   array of entries: 'Label' or { label, disabled?, note? }.
 *   value     initial index, default 0.
 *   label     optional text above the list.
 *   id        optional id for the <select> (lets a <label for> or a host
 *             script find it; the field id is the caller's - the only ids the
 *             control mints itself are the internal ones wiring the note reasons).
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

        // El campo se cuelga ANTES del bucle: asi el contenedor de notas (creado al
        // primer motivo) queda detras de la lista, donde se lee.
        this.wrapper.appendChild(this.field);

        // Reasons for the vetoes: one hidden description per entry carrying a
        // `note`, wired to its <option> with aria-describedby. They live OUTSIDE
        // the options on purpose - a note inside one is swallowed into the
        // option's accessible NAME. The wiring is optionIndex.js, shared with
        // Segmented; the copy on the FIELD is this control's own (setFieldNote).
        this.notes = createNotes({
            wrapper: this.wrapper,
            prefix: 'abd-select',
            target: (index) => this.field.options[index],
        });
        this.fieldNoteId = null;      // la nota que el control puso en el campo

        this.entries.forEach((entry, index) =>
        {
            const option = document.createElement('option');

            option.value = `${index}`;
            option.textContent = entry.label;

            this.field.appendChild(option);

            // El motivo (si lo hay) como descripcion del option: fuera de el.
            this.notes.wire(index, entry.note);
        });

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

    /** @brief Is this index unavailable under its flag or the disabled spec? */
    isIndexDisabled (index)
    {
        const entry = this.entries[index];

        if (entry == null)
            return true;

        // El flag de la PROPIA entrada veta por si mismo: el motivo suele estar ahi
        // al lado (`note`) y obligar a repetir el indice en la lista era una trampa
        // silenciosa. Manda el flag: ningun spec permisivo lo levanta.
        if (entry.disabled)
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

    /**
     * @brief Recompute availability (e.g. another parameter changed).
     * @param {Array<number|Function>} spec  vetos: indices, o (entry, index) => boolean.
     */
    setDisabled (spec)
    {
        this.disabledSpec = spec ?? [];
        this.render();
    }

    /**
     * @brief Cambia EN CALIENTE el motivo del veto de una opcion.
     *
     * Un veto puede depender de otro parametro ("requiere el motor Neurotik"), asi
     * que el PORQUE tambien es dinamico: setDisabled dice QUE esta vetado y setNote
     * explica POR QUE. Texto nuevo estrena la nota si aun no habia; texto vacio la
     * retira con su descripcion. Un indice desconocido se ignora.
     *
     * @param {number} index  posicion de la entrada (0..n-1); una desconocida se ignora.
     * @param {string} text  motivo nuevo; vacio retira la nota.
     */
    setNote (index, text)
    {
        const entry = this.entries[index];

        if (entry == null)
            return;

        entry.note = String(text ?? '');

        this.notes.wire(index, entry.note);
        this.render();     // y el campo sigue al valor actual (ver setFieldNote)
    }

    /** @brief Motivos del veto, en orden (diagnostico y tests). */
    getNotes ()
    {
        return this.entries.map((entry) => entry.note);
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
            // The veto reason is NOT a title: it is the option's accessible
            // description, wired in buildDom. A title is mouse-only for a person,
            // and an option nobody can focus reaches nobody with it.
            option.disabled = this.isIndexDisabled(index);   // recomputed: dynamic
        });

        // The whole field stays enabled: a divergent value is information, not a
        // lock. With no entries at all there is nothing to pick.
        this.field.disabled = ! hasOptions;
        this.wrapper.dataset.divergent = this.isDivergent() && hasOptions ? 'true' : 'false';

        // Y el motivo viaja tambien al CAMPO cuando la opcion vetada es la que
        // esta en uso: nadie enfoca un <option>, quien anuncia es el <select>.
        this.setFieldNote(this.field.options[this.value]?.getAttribute('aria-describedby') ?? null);

        // NO aria-valuenow / aria-valuetext aqui. Un <select> nativo es role
        // combobox, y la semantica de valor (valuemin/max/now/text) solo la
        // soportan slider, spinbutton, progressbar, meter, scrollbar y separator:
        // escritos aqui eran inertes, y el lector seguia anunciando el valor del
        // campo - que el propio <select> ya expone, asi que no se pierde nada.
        // La invariante esta fijada en tests/ariaInvariants.test.js.
    }

    /**
     * @brief Apunta la descripcion del CAMPO a la nota de su valor actual.
     *
     * `null` la retira. El campo puede traer una descripcion puesta desde fuera: el
     * control solo sustituye la SUYA (this.fieldNoteId) y respeta las demas.
     */
    setFieldNote (noteId)
    {
        const hostIds = (this.field.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .filter((id) => id !== '' && id !== this.fieldNoteId);

        if (noteId != null)
            hostIds.push(noteId);

        this.fieldNoteId = noteId ?? null;

        if (hostIds.length > 0)
            this.field.setAttribute('aria-describedby', hostIds.join(' '));
        else
            this.field.removeAttribute('aria-describedby');
    }

    /**
     * @brief Programmatic update: does NOT fire onChange (user picks do).
     * @param {number} index  indice de la entrada activa; clampIndex recorta al dominio.
     */
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
        return clampIndex(this.entries.length, index);
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
