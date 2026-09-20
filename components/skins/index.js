/**
 * Control skins — how a control LOOKS, decoupled from how it BEHAVES.
 *
 * A synth picks a skin per control (or per page) without touching the control
 * logic: the Knob/Slider/Toggle classes own value + interaction + contract; a
 * skin owns DOM structure and CSS class names.
 *
 * A skin is a map of renderers, one per control type it supports:
 *
 *     { knob(host, control), slider(host, control), toggle(host, control) }
 *
 *   host      element the skin paints into (inside the control wrapper);
 *   control   the control instance (options, value... read-only here);
 *   return    { root, update, destroy }: root is removed by the control's
 *             destroy(); update() re-reads control.getValue() and repaints;
 *             destroy() frees anything the skin added beyond `root`.
 *
 * applySkin() dispatches by the control's kind (tagged via CONTROL_KIND), so a
 * synth states the skin once — `skin: 'junio'` — and each control type resolves
 * its own renderer. When a skin lacks a renderer for a kind, the 'vector' one
 * is used as fallback so partial skins stay usable.
 *
 * Built-ins:
 *   'vector'  default. Pure CSS/SVG (knob arc+pointer, fill+thumb, CSS LED,
 *             native <select>).
 *   'ms2000'  Korg-flavoured vector knob (rim/cap/dot) + token toggle variant.
 *   'junio'   Roland Juno-flavoured photo sprites (knob.png, slider cap/slot,
 *             button PNGs) from assets/junio/.
 *
 * A project registers its own skin with registerSkin('name', mapOfRenderers).
 */

const registry = new Map();

/** @brief Tag a control instance with its kind ('knob' | 'slider' | 'toggle' | 'select'). */
export const CONTROL_KIND = Symbol('abd.control.kind');

/** @brief Register a skin under a name. Overwriting is allowed on purpose. */
export function registerSkin (name, renderers)
{
    registry.set(name, renderers);
}

/** @brief Get a skin renderer map, or null when unknown (caller falls back). */
export function getSkin (name)
{
    return registry.get(name) ?? null;
}

/** @brief Names registered, for diagnostics and tests. */
export function skinNames () { return [...registry.keys()]; }

/**
 * @brief Apply a skin by name to a control, dispatching by its kind.
 * Falls back to the skin's own 'vector' renderer for kinds the skin omits,
 * and to the 'vector' skin entirely when the name is unknown.
 */
export function applySkin (name, host, control)
{
    const kind = control?.[CONTROL_KIND] ?? 'knob';
    const map = registry.get(name) ?? registry.get('vector');

    if (map == null)
        throw new Error('ABD skins: no skin registered (registry empty)');

    const fn = typeof map[kind] === 'function'
        ? map[kind]
        : registry.get('vector')[kind];   // partial skins fall back per-kind

    // A kind with no renderer anywhere (a new control nobody painted) used to
    // fail as "fn is not a function", which reads as a typo in the caller.
    if (typeof fn !== 'function')
        throw new Error(`ABD skins: no renderer for control kind '${kind}'`);

    return fn(host, control);
}

/* ── vector (default) ──────────────────────────────────────────────────────── */

registerSkin('vector', {
    knob (host, control)
    {
        const root = document.createElement('div');
        root.className = 'abd-skin abd-skin--vector';

        const size = control.options?.size ?? 64;
        const sweep = 270;
        const start = -135;   // classic knob sweep: -135..+135 degrees

        root.innerHTML = `
            <svg class="abd-knob__svg" viewBox="0 0 50 50" width="${size}" height="${size}"
                 aria-hidden="true">
                <circle class="abd-knob__track" cx="25" cy="25" r="20.5"></circle>
                <circle class="abd-knob__arc" cx="25" cy="25" r="20.5"
                        transform="rotate(135 25 25)"></circle>
                <line class="abd-knob__pointer" x1="25" y1="25" x2="25" y2="12"></line>
            </svg>`;

        const arc = root.querySelector('.abd-knob__arc');
        const pointer = root.querySelector('.abd-knob__pointer');
        const circumference = 2 * Math.PI * 20.5;

        // Only 270/360 of the circle is the interactive sweep.
        arc.style.strokeDasharray = `${(sweep / 360) * circumference} ${circumference}`;
        arc.style.transformOrigin = '25px 25px';

        host.appendChild(root);

        return {
            root,
            update ()
            {
                const v = typeof control.getValue === 'function' ? control.getValue() : 0;
                const len = (v * sweep / 360) * circumference;

                arc.style.strokeDashoffset = `${circumference - len}`;
                pointer.style.transform = `rotate(${start + v * sweep}deg)`;
                pointer.style.transformOrigin = '25px 25px';
            },
            destroy () {},
        };
    },

    slider (host, control)
    {
        // Default look: track/fill/thumb the Slider builds itself — tag only.
        control.wrapper.classList.add('abd-skin--vector');

        return { root: control.wrapper, update () {}, destroy () {} };
    },

    toggle (host, control)
    {
        // Default look: button + CSS LED the Toggle builds itself — tag only.
        control.button.classList.add('abd-skin--vector');

        return { root: control.button, update () {}, destroy () {} };
    },

    select (host, control)
    {
        // Default look: the native <select>, styled by widgets.css — tag only.
        // A skin that wants its own list restyles `control.field` here.
        control.wrapper.classList.add('abd-skin--vector');

        return { root: control.wrapper, update () {}, destroy () {} };
    },
});

/* ── ms2000: Korg-flavoured vector (extracted from ABDMS2000 rotaryKnob) ───── */

registerSkin('ms2000', {
    knob (host, control)
    {
        const root = document.createElement('div');
        root.className = 'abd-skin abd-skin--ms2000';

        const size = control.options?.size ?? 64;

        root.innerHTML = `
            <svg viewBox="0 0 50 50" class="abd-ms2000-knob" width="${size}" height="${size}"
                 aria-hidden="true">
                <circle cx="25" cy="25" r="23" class="abd-ms2000-knob__rim"/>
                <circle cx="25" cy="25" r="19" class="abd-ms2000-knob__cap"/>
                <g class="abd-ms2000-knob__indicator-group">
                    <rect x="24" y="8" width="2" height="9" rx="1"
                          class="abd-ms2000-knob__tick"/>
                    <circle cx="25" cy="25" r="2.5" class="abd-ms2000-knob__dot"/>
                </g>
            </svg>`;

        const group = root.querySelector('.abd-ms2000-knob__indicator-group');

        host.appendChild(root);

        return {
            root,
            update ()
            {
                const v = typeof control.getValue === 'function' ? control.getValue() : 0;

                group.style.transform = `rotate(${-135 + v * 270}deg)`;
                group.style.transformOrigin = '25px 25px';
            },
            destroy () {},
        };
    },

    toggle (host, control)
    {
        // Token variant of the LED button (same mechanic, MS2000 typography).
        control.button.classList.add('abd-toggle--ms2000');

        return { root: control.button, update () {}, destroy () {} };
    },
    select (host, control)
    {
        // Token variant of the list (same mechanic, MS2000 typography).
        control.field.classList.add('abd-select__field--ms2000');

        return { root: control.wrapper, update () {}, destroy () {} };
    },
    // no slider renderer: falls back to 'vector' (fill + thumb)
});

/* ── junio: photographic sprites (extracted from ABDJUNiO601 assets) ───────── */

registerSkin('junio', {
    knob (host, control)
    {
        const root = document.createElement('div');
        root.className = 'abd-skin abd-skin--junio';

        // Document-relative default: pages served from the package root.
        // Pages elsewhere (demo/, WebUI/) pass spriteUrl explicitly.
        const sprite = control.options?.spriteUrl ?? './assets/junio/knob.png';

        root.innerHTML = `
            <div class="abd-junio-knob" style="background-image:url('${sprite}')">
                <div class="abd-junio-knob__marker"></div>
            </div>`;

        const dial = root.querySelector('.abd-junio-knob');

        host.appendChild(root);

        return {
            root,
            update ()
            {
                const v = typeof control.getValue === 'function' ? control.getValue() : 0;

                dial.style.transform = `rotate(${-135 + v * 270}deg)`;
            },
            destroy () {},
        };
    },

    slider (host, control)
    {
        // JUNiO look: slot PNG as the track, cap PNG as the thumb.
        control.wrapper.classList.add('abd-slider--junio');
        control.track.classList.add('abd-slider__track--junio-slot');
        control.thumb.classList.add('abd-slider__thumb--junio-cap');

        return { root: control.wrapper, update () {}, destroy () {} };
    },

    toggle (host, control)
    {
        // Sprite buttons: CSS picks on/off PNG by [data-color] + [aria-pressed].
        control.button.classList.add('abd-toggle--junio');

        return { root: control.button, update () {}, destroy () {} };
    },
});
