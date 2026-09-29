/**
 * ABD Segmented — reusable inline option switcher for the ABDSynths suite.
 *
 * Family rules (see components/select.js, knob.js, slider.js, toggle.js):
 *   - constructor(container, options) + setValue/getValue/destroy + onChange;
 *   - pure DOM/CSS, themed via --color-* tokens with literal fallbacks;
 *   - silent setValue, onChange only on user edits — y solo en una TRANSICION
 *     real: elegir el segmento ya activo no avisa (transitionNotices.js).
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
 * WHERE THE STATE LIVES: in each radio's `aria-checked`, never on the group.
 * A radiogroup has no value semantics - `aria-valuenow`/`aria-valuetext` are not
 * supported on it, and on the role-less wrapper they reached no one.
 *
 * DISABLED OPTIONS: same contract as Select — a segment can be unavailable by its
 * own `disabled` flag or by the `disabled` spec, with a `note` explaining why, and
 * `setDisabled()` recomputes the spec at runtime when another parameter gates the
 * list. A value landing on a disabled option is KEPT and flagged
 * (`isDivergent()`, `[data-divergent]`) so the UI can show host state it cannot
 * offer instead of silently rewriting it.
 *
 * ANNOUNCED, NOT JUST SEEN: availability is `aria-disabled`, NEVER the native
 * attribute. A natively disabled radio leaves the tab order and the arrow walk,
 * so it is never announced: its `checked` state and the `note` explaining the
 * veto (a `title` shows on hover only) reached the eye and nobody else. With
 * `aria-disabled` the vetoed radio stays FOCUSABLE, so the roving tabindex keeps
 * its single stop on the CHECKED radio even when that radio is the vetoed one:
 * the reader lands on it and announces "checked, unavailable" together with the
 * note, wired as the radio's `aria-describedby` description. Picking is still
 * refused in the handlers, so nothing vetoed becomes selectable.
 *
 * WIDTH: segments share the row (`flex: 1 1 0`), so N options fill the cell —
 * the grid maths of a synth page decide the cell, never the control. Long
 * labels truncate with ellipsis, and NOTHING of what a segment says hides in a
 * `title`: the veto `note` travels as the segment's accessible description.
 *
 * Skins: tagged as kind 'segmented'; a skin may restyle it via the 'vector'
 * fallback (see components/skins/index.js).
 *
 * GLYPHS: an entry may carry a `glyph` (inline SVG string, see waveforms.js)
 * or the whole control may pass a `glyphs` array aligned with the options.
 * A glyphed segment renders two rows - mark above the text - with the SVG
 * following `currentColor` like every other piece of the family, so the
 * active fill inverts it for free.
 *
 * VARIANTS: `variant: 'led'` (default 'strip') swaps the shared-border strip
 * for a row of lamp buttons: dark pads whose mark lights with the accent when
 * active. Same DOM contract, same value model, only the furniture changes
 * (`.abd-segmented--led`).
 */

import { applySkin, CONTROL_KIND } from './skins/index.js';
import { transitioned, announceTransition } from './transitionNotices.js';

/**
 * Internal ids for the note descriptions. The control still never invents the
 * GROUP's id (that one belongs to the caller), but an aria-describedby needs a
 * stable target, and these nodes are the control's own plumbing.
 */
let noteSequence = 0;

/**
 * Usage:
 *   const seg = new Segmented(el, { options: ['LFO', 'ENV', 'SEQ'], onChange });
 *   seg.setValue(1);
 *   seg.setDisabled([2]);
 *   seg.setNote(0, 'Solo con el motor arrancado');
 *   seg.destroy();
 *
 * @param {HTMLElement|string} container
 * @param {object} options
 *   options   array of entries: 'Label' or { label, disabled?, note? }.
 *   value     initial index, default 0.
 *   label     optional text above the group.
 *   id        optional id for the group (lets a <label for> or a host script
 *             find it; the group id is the caller's - the only ids the control
 *             mints itself are the internal ones wiring the note reasons).
 *   disabled  array of indices or (entry, index) => boolean, default [].
 *   glyphs    optional array of inline-SVG strings aligned with `options`.
 *   variant   'strip' (default) or 'led' (row of lamp buttons).
 *   skin      optional skin name (see components/skins).
 *   onChange  (index) => void, fires on user picks only (not on setValue) and
 *             only when the pick changes the value (re-picking the active segment
 *             is an intention without transition, see transitionNotices.js).
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

        // Glyphs: per-entry wins; the aligned array fills the gaps.
        if (Array.isArray(this.options.glyphs))
        {
            this.options.glyphs.forEach((glyph, index) =>
            {
                if (this.entries[index] && this.entries[index].glyph === '')
                    this.entries[index].glyph = String(glyph ?? '');
            });
        }

        this.variant = this.options.variant === 'led' ? 'led' : 'strip';
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

        if (this.variant !== 'strip')
            this.wrapper.classList.add(`abd-segmented--${this.variant}`);

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
        else if (this.options.label)
        {
            // No id -> no <label for> wiring; the group still needs a name.
            this.group.setAttribute('aria-label', this.options.label);
        }

        // Reasons for the vetoes: one hidden description per entry carrying a
        // `note`, wired to its radio with aria-describedby. They are appended
        // OUTSIDE the buttons on purpose - a hidden node INSIDE the button would
        // be swallowed into its accessible NAME, and the radio would read as
        // "Neurotik Requiere el motor Neurotik". The wiring lives in wireNote(),
        // which setNote() reuses so a motive can change at runtime.
        this.notesEl = null;
        this.noteEls = [];            // un nodo por indice con motivo (o null)

        // El grupo se cuelga ANTES del bucle: asi el contenedor de notas (creado al
        // primer motivo) queda detras de los radios, donde se lee.
        this.wrapper.appendChild(this.group);

        this.buttons = [];

        this.entries.forEach((entry, index) =>
        {
            const button = document.createElement('button');

            button.type = 'button';
            button.className = 'abd-segmented__segment';
            button.setAttribute('role', 'radio');
            button.dataset.index = `${index}`;

            if (entry.glyph !== '')
            {
                button.classList.add('abd-segmented__segment--glyphed');

                const glyphSpan = document.createElement('span');
                glyphSpan.className = 'abd-segmented__glyph';
                glyphSpan.innerHTML = entry.glyph;   // trusted: the suite's own SVGs
                button.appendChild(glyphSpan);
            }

            const textSpan = document.createElement('span');
            textSpan.className = 'abd-segmented__text';
            textSpan.textContent = entry.label;
            button.appendChild(textSpan);

            this.group.appendChild(button);
            this.buttons[index] = button;

            // El motivo (si lo hay) como descripcion del radio: fuera del boton.
            this.wireNote(index);
        });

        this.container.appendChild(this.wrapper);
    }

    /**
     * @brief Crea, actualiza o retira la nota oculta del indice, y la cablea.
     *
     * Una sola via de entrada al DOM para el motivo: buildDom (estado inicial) y
     * setNote (cambio en caliente).
     */
    wireNote (index)
    {
        const button = this.buttons[index];
        const entry = this.entries[index];

        if (button == null || entry == null)
            return;

        if (entry.note === '')
        {
            // Sin motivo no queda descripcion: ni atributo ni nodo vacio.
            button.removeAttribute('aria-describedby');
            this.noteEls[index]?.remove();
            this.noteEls[index] = null;
            this.pruneNotesEl();
            return;
        }

        let noteEl = this.noteEls[index];

        if (noteEl == null)
        {
            noteEl = document.createElement('span');
            noteEl.className = 'abd-segmented__note';
            noteEl.id = `abd-segmented-note-${noteSequence += 1}`;
            this.noteEls[index] = noteEl;
            this.ensureNotesEl().appendChild(noteEl);

            // The note stops being a mouse-only tooltip: it becomes the radio's
            // accessible description, so whoever announces the vetoed option also
            // announces WHY it is vetoed.
            button.setAttribute('aria-describedby', noteEl.id);
        }

        noteEl.textContent = entry.note;
    }

    /** @brief El contenedor de notas (oculto a la vista), pegado al final. */
    ensureNotesEl ()
    {
        if (this.notesEl == null)
        {
            this.notesEl = document.createElement('div');
            this.notesEl.className = 'abd-segmented__notes';
        }

        if (this.notesEl.parentNode !== this.wrapper)
            this.wrapper.appendChild(this.notesEl);

        return this.notesEl;
    }

    /** @brief Sin notas no se deja un contenedor vacio en el DOM. */
    pruneNotesEl ()
    {
        if (this.notesEl != null && this.notesEl.childElementCount === 0)
        {
            this.notesEl.remove();
            this.notesEl = null;
        }
    }

    attachInteraction ()
    {
        const onActivate = (event) =>
        {
            const index = Number(event.currentTarget.dataset.index);

            if (this.isIndexDisabled(index))
                return;   // a refused value reports nothing, like Select

            const previous = this.value;

            if (! transitioned(previous, index))
                return;   // picking the active segment is an intention, not a transition

            this.value = index;
            this.render();
            announceTransition(this.options.onChange, previous, index);
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

            const previous = this.value;

            if (! transitioned(previous, next) || this.isIndexDisabled(next))
                return;

            this.value = next;
            this.render();
            announceTransition(this.options.onChange, previous, next);
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

    /** @brief Recompute availability (e.g. another parameter changed). */
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
     * El radio ya lleva su nota, asi que no hay nada mas que recomputar: el
     * `aria-checked`/`aria-disabled` no dependen del motivo.
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
        this.wireNote(index);
    }

    /** @brief Motivos del veto, en orden (diagnostico y tests). */
    getNotes ()
    {
        return this.entries.map((entry) => entry.note);
    }

    /** @brief Push value + availability into the DOM. */
    render ()
    {
        this.buttons.forEach((button, index) =>
        {
            const active = index === this.value;
            const disabled = this.isIndexDisabled(index);

            button.classList.toggle('is-active', active);
            // The state lives HERE, one radio at a time: aria-checked is what a
            // reader announces. The group carries NO value semantics -
            // aria-valuenow / aria-valuetext are not supported on a radiogroup,
            // and on the role-less wrapper they were inert anyway.
            button.setAttribute('aria-checked', active ? 'true' : 'false');
            // aria-disabled, NOT the native attribute: a natively disabled radio
            // loses focus, and with it the announcement of its own state and of
            // the note explaining the veto. The veto is still enforced in the
            // click and arrow handlers (isIndexDisabled), so nothing becomes
            // pickable - only announceable.
            if (disabled)
                button.setAttribute('aria-disabled', 'true');
            else
                button.removeAttribute('aria-disabled');

            // No `title` here: the veto reason is the segment's accessible
            // DESCRIPTION, wired in buildDom, and that is what a reader announces.
            // A title is mouse-only for a person and never reached the reader.
            // Roving tabindex: exactly ONE stop, and it is the CHECKED radio
            // (APG: Tab enters a radiogroup on the checked button). Availability
            // is aria-disabled, so the checked radio is focusable even when it is
            // the vetoed one: a divergent value keeps BOTH its stop and its
            // announcement. The old fallback - handing the stop to the first
            // available option - only compensated for the native `disabled`
            // attribute, and it left the divergent state unreadable.
            button.tabIndex = active ? 0 : -1;
        });

        // A divergent value stays visible and flagged, never rewritten.
        this.wrapper.dataset.divergent = this.isDivergent() ? 'true' : 'false';
    }

    /** @brief Programmatic update: does NOT fire onChange (user picks do). */
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
        return { label: entry, glyph: '', disabled: false, note: '' };

    return {
        label: `${entry?.label ?? ''}`,
        glyph: entry?.glyph != null ? String(entry.glyph) : '',
        disabled: Boolean(entry?.disabled),
        note: entry?.note ?? '',
    };
}
