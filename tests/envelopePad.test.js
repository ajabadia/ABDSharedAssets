/**
 * Tests for the shared EnvelopePad: the migrated curve geometry (pinned to
 * the SAME numbers the origin view drew, so no pixel moves) and the family
 * contract of the editable control (silent setValue, user-only onChange,
 * drag per handle, keyboard, needle).
 *
 * jsdom has no layout: drag tests stub the stage's rect, like xypad.test.js.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import './setup.js';
import {
    DEFAULT_ENVELOPE,
    ENVELOPE_SEGMENTS,
    ENVELOPE_VIEWBOX,
    NEEDLE_FLOOR,
    createEnvelopeCurve,
    envelopeAreaPath,
    envelopeLinePath,
    envelopeNeedlePath,
    envelopePoints,
} from '../components/envelopeCurve.js';
import { EnvelopePad } from '../components/envelopePad.js';
import { captureGesture, dragSegment, dragSustain } from '../components/envelopeGestures.js';

function makeHost ()
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

/* ---------------------------------------------------------------------------
 * Geometria: la misma matematica que probaba la vista de origen (pura, sin
 * DOM), clavada a los mismos numeros para que ningun pixel se mueva.
 * ------------------------------------------------------------------------- */

describe('curva ADSR / geometria', () =>
{
    it('la forma sube, baja, aguanta y suelta', () =>
    {
        const points = envelopePoints({ attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.4 });

        expect(points).toHaveLength(5);

        const [start, peak, decayEnd, sustainEnd, end] = points;
        const { height } = ENVELOPE_VIEWBOX;

        expect(start.x).toBe(0);
        expect(start.y).toBeCloseTo(height - 2, 5);          // sale de cero (abajo)
        expect(peak.y).toBeCloseTo(2, 5);                    // pico arriba
        expect(peak.x).toBeGreaterThan(0);

        // Decay llega AL SOSTEN (el 60% de la altura, medida desde abajo)
        expect(decayEnd.y).toBeGreaterThan(peak.y);
        expect(decayEnd.y).toBeLessThan(start.y);

        // Meseta plana: mismo alto, mas a la derecha
        expect(sustainEnd.y).toBeCloseTo(decayEnd.y, 5);
        expect(sustainEnd.x).toBeGreaterThan(decayEnd.x);

        // Release vuelve a cero
        expect(end.y).toBeCloseTo(start.y, 5);
        expect(end.x).toBeGreaterThan(sustainEnd.x);
    });

    it('el sostén manda la altura de la meseta', () =>
    {
        const low = envelopePoints({ attack: 0.1, decay: 0.1, sustain: 0.1, release: 0.1 });
        const high = envelopePoints({ attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.1 });

        const plateauOf = (points) => ENVELOPE_VIEWBOX.height - 2 - points[2].y;

        expect(plateauOf(high)).toBeGreaterThan(plateauOf(low));
    });

    it('los tiempos se comprimen con raíz: 1 ms y 5 s se ven los dos', () =>
    {
        // La raiz da al tramo corto UNA PARTICIPACION MINIMA (MIN_SEGMENT_SHARE),
        // no cero: el pico de un ataque de 1 ms tiene que verse a la derecha del origen.
        const points = envelopePoints({ attack: 0.001, decay: 5, sustain: 0.5, release: 0.001 });

        expect(points[1].x).toBeGreaterThan(0);
        expect(points[1].x).toBeLessThan(points[2].x);
    });

    it('el mayor de los tres tiempos ocupa el ancho de las rampas', () =>
    {
        const onlyDecay = envelopePoints({ attack: 0.001, decay: 5, sustain: 0.5, release: 0.001 });

        // Las rampas llegan hasta (1 - SUSTAIN_SHARE) del viewBox...
        expect(onlyDecay[4].x).toBeCloseTo(ENVELOPE_VIEWBOX.width, 5);

        // ...y con tres tiempos iguales, tres tramos iguales (misma raiz).
        const even = envelopePoints({ attack: 1, decay: 1, sustain: 0.5, release: 1 });
        const w1 = even[1].x - even[0].x;
        const w2 = even[2].x - even[1].x;
        const w3 = even[4].x - even[3].x;

        expect(w2).toBeCloseTo(w1, 5);
        expect(w3).toBeCloseTo(w1, 5);
    });

    it('ningún valor degenerado rompe el trazo', () =>
    {
        for (const values of [
            { attack: 0, decay: 0, sustain: 0, release: 0 },
            { attack: 0, decay: 0, sustain: 1, release: 0 },
            { attack: -1, decay: NaN, sustain: 2, release: -3 },
        ])
        {
            const points = envelopePoints(values);

            for (const point of points)
            {
                expect(Number.isFinite(point.x)).toBe(true);
                expect(Number.isFinite(point.y)).toBe(true);
            }
        }
    });

    it('el `d` del trazo y del área salen a dos decimales y cierran por la base', () =>
    {
        const points = envelopePoints({ attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.1 });
        const line = envelopeLinePath(points);
        const area = envelopeAreaPath(points);

        expect(line).toMatch(/^M0\.00,[\d.]+( L[\d.]+,[\d.]+)+$/);
        expect(area).toContain(line);
        expect(area.endsWith(`L${points[4].x.toFixed(2)},46.00 L0.00,46.00 Z`)).toBe(true);
    });

    it('la aguja es una línea horizontal a la altura del nivel', () =>
    {
        const top = envelopeNeedlePath(1);
        const bottom = envelopeNeedlePath(0);

        // El formato EXACTO del origen: los extremos van sin decimales y la Y
        // a dos — el mismo `d` que pinto la vista que se migra.
        expect(top).toBe('M0,2.00 L100,2.00');
        expect(bottom).toBe('M0,46.00 L100,46.00');
        expect(envelopeNeedlePath(0.5)).toBe('M0,24.00 L100,24.00');
    });

    it('NEEDLE_FLOOR es el suelo de silencio de la aguja', () =>
    {
        expect(NEEDLE_FLOOR).toBeGreaterThan(0);
        expect(NEEDLE_FLOOR).toBeLessThan(0.01);
    });

    it('los defaults y el orden de tramos son los de la vista de origen', () =>
    {
        expect(ENVELOPE_SEGMENTS).toEqual(['attack', 'decay', 'sustain', 'release']);
        expect(ENVELOPE_VIEWBOX).toEqual({ width: 100, height: 48 });
        expect(DEFAULT_ENVELOPE).toEqual({ attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.1 });
    });
});

/* ---------------------------------------------------------------------------
 * La vista de fabrica: el mismo contrato que consumia el lienzo y el cajon.
 * ------------------------------------------------------------------------- */

describe('createEnvelopeCurve — la vista', () =>
{
    const CONTROLS = ['Attack', 'Decay', 'Sustain', 'Release']
        .map((segment) => ({ id: `env${segment}` }));

    it('pinta desde los valores que devuelve toReal y expone parameterIds', () =>
    {
        const host = makeHost();
        const toReal = vi.fn((control, normalized) => normalized * 5);   // skew del host
        const curve = createEnvelopeCurve({ controls: CONTROLS, toReal });

        host.appendChild(curve.element);
        curve.paint({ envAttack: 0.2, envDecay: 0.4, envSustain: 0.6, envRelease: 0.8 });

        expect(curve.parameterIds).toEqual(CONTROLS.map((control) => control.id));
        expect(curve.element.dataset.visual).toBe('amp-envelope');
        expect(toReal).toHaveBeenCalled();
        expect(curve.element.querySelector('.abd-envpad__line')).not.toBeNull();
        expect(curve.element.getAttribute('title')).toBeTruthy();

        curve.destroy();
        // La vista no fue montada por el control (el host appendea SU element);
        // destroy vacia la vista, no toca el contenedor del llamador.
        expect(curve.element.childNodes).toHaveLength(0);
    });

    it('setLevel esconde la aguja bajo el suelo y la muestra encima', () =>
    {
        const curve = createEnvelopeCurve({ controls: CONTROLS });
        const needle = curve.element.querySelector('.abd-envpad__needle');

        curve.setLevel(0);
        expect(needle.dataset.visible).toBe('false');

        curve.setLevel(0.8);
        expect(needle.dataset.visible).toBe('true');

        curve.setLevel(NaN);
        expect(needle.dataset.visible).toBe('false');

        curve.destroy();
    });
});

/* ---------------------------------------------------------------------------
 * El control: contrato de familia, gesto por asas, teclado y aguja.
 * ------------------------------------------------------------------------- */

describe('EnvelopePad — family contract', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('mounts into the container and exposes its value', () =>
    {
        const pad = new EnvelopePad(host, { label: 'ENV', editable: false });

        expect(host.querySelector('.abd-envpad')).not.toBeNull();
        expect(pad.getValue()).toEqual(DEFAULT_ENVELOPE);

        pad.destroy();
        expect(host.querySelector('.abd-envpad')).toBeNull();
    });

    it('setValue is silent by default (bridge snapshots do not echo)', () =>
    {
        const onChange = vi.fn();
        const pad = new EnvelopePad(host, { onChange });

        pad.setValue({ attack: 0.5 });

        expect(onChange).not.toHaveBeenCalled();
        expect(pad.getValue().attack).toBe(0.5);
        // los campos que faltan se conservan
        expect(pad.getValue().sustain).toBe(DEFAULT_ENVELOPE.sustain);

        pad.destroy();
    });

    it('setValue with notify fires onChange only on a real transition', () =>
    {
        const onChange = vi.fn();
        const pad = new EnvelopePad(host, { value: { attack: 0.5 }, onChange });

        pad.setValue({ attack: 0.5 }, true);   // mismo valor: intencion, no transicion
        expect(onChange).not.toHaveBeenCalled();

        pad.setValue({ attack: 0.7 }, true);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(pad.getValue());

        pad.destroy();
    });

    it('clamps out-of-range values into 0..1', () =>
    {
        const pad = new EnvelopePad(host, {});

        pad.setValue({ attack: -2, sustain: 3 });
        expect(pad.getValue().attack).toBe(0);
        expect(pad.getValue().sustain).toBe(1);

        pad.destroy();
    });

    it('destroy is idempotent and stops rendering', () =>
    {
        const pad = new EnvelopePad(host, {});

        pad.destroy();
        expect(() => pad.destroy()).not.toThrow();
        expect(() => pad.setValue({ attack: 0.9 })).not.toThrow();
        expect(host.querySelector('.abd-envpad')).toBeNull();
    });

    it('el modo se fija al construir: editable monta asas, vista no', () =>
    {
        const view = new EnvelopePad(host, { editable: false, showValues: false });

        expect(host.querySelectorAll('.abd-envpad__handle')).toHaveLength(0);
        expect(view.getValue()).toEqual(DEFAULT_ENVELOPE);
        view.destroy();

        const editable = new EnvelopePad(host, { showValues: false });

        expect(host.querySelectorAll('.abd-envpad__handle')).toHaveLength(3);
        editable.destroy();
    });
});

describe('EnvelopePad — el gesto de las asas', () =>
{
    let host;
    let stage;

    /** jsdom no calcula layout: el rect del stage es el que diga el test. */
    function stubStage (width = 100, height = 48)
    {
        stage.getBoundingClientRect = () =>
            ({ left: 0, top: 0, right: width, bottom: height, width, height });
    }

    function pointer (type, x, y)
    {
        return new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 });
    }

    beforeEach(() =>
    {
        host = makeHost();
        const pad = new EnvelopePad(host, { label: 'ENV', editable: false });
        stage = host.querySelector('.abd-envpad__stage');
        pad.destroy();
        document.body.textContent = '';
    });

    /** Un pad de pruebas con el rect stubeado. */
    function makePad (options = {})
    {
        const pad = new EnvelopePad(host, { label: 'ENV', ...options });

        stubStage();
        return pad;
    }

    it('el pico arrastra el ATTACK en X (lo que ves es lo que coges)', () =>
    {
        const onChange = vi.fn();
        const pad = makePad({ onChange, showValues: false });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        // De donde parte el asa (los px del stage que ocupa el pico ahora):
        const before = Number.parseFloat(peak.style.left) / 100 * 100;   // % -> px del viewBox

        peak.dispatchEvent(pointer('pointerdown', before, 4));
        peak.dispatchEvent(pointer('pointermove', before + 20, 4));
        peak.dispatchEvent(pointer('pointerup', before + 20, 4));

        expect(pad.getValue().attack).toBeGreaterThan(DEFAULT_ENVELOPE.attack);
        expect(onChange).toHaveBeenCalled();

        pad.destroy();
    });

    it('el asa central arrastra DECAY en X y SUSTAIN en Y a la vez', () =>
    {
        const pad = makePad({ showValues: false });
        const corner = host.querySelector('.abd-envpad__handle[data-segment="decay"]');
        const before = Number.parseFloat(corner.style.left) / 100 * 100;

        corner.dispatchEvent(pointer('pointerdown', before, 24));
        corner.dispatchEvent(pointer('pointermove', before + 15, 10));
        corner.dispatchEvent(pointer('pointerup', before + 15, 10));

        expect(pad.getValue().decay).toBeGreaterThan(DEFAULT_ENVELOPE.decay);
        expect(pad.getValue().sustain).toBeGreaterThan(DEFAULT_ENVELOPE.sustain);

        pad.destroy();
    });

    it('el asa final arrastra el RELEASE en X', () =>
    {
        const pad = makePad({ showValues: false });
        const tail = host.querySelector('.abd-envpad__handle[data-segment="release"]');
        const before = Number.parseFloat(tail.style.left) / 100 * 100;

        tail.dispatchEvent(pointer('pointerdown', before, 46));
        tail.dispatchEvent(pointer('pointermove', before - 8, 46));
        tail.dispatchEvent(pointer('pointerup', before - 8, 46));

        expect(pad.getValue().release).toBeLessThan(DEFAULT_ENVELOPE.release);

        pad.destroy();
    });

    it('la asa activa se resalta y el gesto cierra con pointerup/cancel', () =>
    {
        const onDragStart = vi.fn();
        const onDragEnd = vi.fn();
        const pad = makePad({ onDragStart, onDragEnd, showValues: false });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        peak.dispatchEvent(pointer('pointerdown', 5, 4));
        expect(peak.classList.contains('abd-envpad__handle--active')).toBe(true);
        expect(onDragStart).toHaveBeenCalledTimes(1);

        peak.dispatchEvent(pointer('pointerup', 5, 4));
        expect(peak.classList.contains('abd-envpad__handle--active')).toBe(false);
        expect(onDragEnd).toHaveBeenCalledTimes(1);

        peak.dispatchEvent(pointer('pointerdown', 5, 4));
        peak.dispatchEvent(pointer('pointercancel', 5, 4));
        expect(onDragEnd).toHaveBeenCalledTimes(2);

        pad.destroy();
    });

    it('empujar contra el borde no re-notifica (0/1 son el tope)', () =>
    {
        const onChange = vi.fn();
        const pad = makePad({ onChange, value: { attack: 1 }, showValues: false });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        peak.dispatchEvent(pointer('pointerdown', 96, 4));
        peak.dispatchEvent(pointer('pointermove', 120, 4));   // mas alla del tope
        peak.dispatchEvent(pointer('pointermove', 130, 4));
        peak.dispatchEvent(pointer('pointerup', 130, 4));

        expect(pad.getValue().attack).toBe(1);
        expect(onChange).not.toHaveBeenCalled();

        pad.destroy();
    });

    it('la vista pura no monta asas y no responde a gestos', () =>
    {
        const onChange = vi.fn();
        const pad = makePad({ editable: false, onChange, showValues: false });

        expect(host.querySelectorAll('.abd-envpad__handle')).toHaveLength(0);

        stage.dispatchEvent(pointer('pointerdown', 20, 10));
        stage.dispatchEvent(pointer('pointermove', 40, 10));
        stage.dispatchEvent(pointer('pointerup', 40, 10));

        expect(pad.getValue()).toEqual(DEFAULT_ENVELOPE);
        expect(onChange).not.toHaveBeenCalled();

        pad.destroy();
    });
});

describe('EnvelopePad — teclado', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    function press (handle, key, shiftKey = false)
    {
        handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    }

    it('las flechas mueven su segmento con el paso del control', () =>
    {
        const pad = new EnvelopePad(host, { showValues: false, step: 0.01 });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        press(peak, 'ArrowRight');
        expect(pad.getValue().attack).toBeCloseTo(DEFAULT_ENVELOPE.attack + 0.01, 5);

        press(peak, 'ArrowLeft', true);   // Shift x10: 0.02 - 0.1 se clava al tope
        expect(pad.getValue().attack).toBe(0);

        pad.destroy();
    });

    it('en el asa central, arriba/abajo llevan el SUSTAIN', () =>
    {
        const pad = new EnvelopePad(host, { showValues: false, value: { sustain: 0.5 } });
        const corner = host.querySelector('.abd-envpad__handle[data-segment="decay"]');

        press(corner, 'ArrowUp');
        expect(pad.getValue().sustain).toBeCloseTo(0.51, 5);
        expect(pad.getValue().decay).toBe(DEFAULT_ENVELOPE.decay);   // no se movio

        press(corner, 'ArrowDown');
        expect(pad.getValue().sustain).toBeCloseTo(0.5, 5);

        pad.destroy();
    });

    it('Home/End llevan el segmento a sus topes', () =>
    {
        const pad = new EnvelopePad(host, { showValues: false });
        const tail = host.querySelector('.abd-envpad__handle[data-segment="release"]');

        press(tail, 'End');
        expect(pad.getValue().release).toBe(1);

        press(tail, 'Home');
        expect(pad.getValue().release).toBe(0);

        pad.destroy();
    });

    it('el teclado avisa por edicion (onChange), y empujar contra el borde no re-avisa', () =>
    {
        const onChange = vi.fn();
        const pad = new EnvelopePad(host, { showValues: false, value: { attack: 0.02 }, onChange });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        press(peak, 'ArrowRight');
        expect(onChange).toHaveBeenCalledTimes(1);

        press(peak, 'ArrowLeft');
        expect(onChange).toHaveBeenCalledTimes(2);   // volver: OTRA transicion

        pad.setValue({ attack: 0 });                 // silencioso: al borde
        press(peak, 'ArrowLeft');
        press(peak, 'ArrowLeft');
        expect(onChange).toHaveBeenCalledTimes(2);   // 0 es el tope: sin transicion

        pad.destroy();
    });

    it('cada asa expone su aria de slider con el valor vivo', () =>
    {
        const pad = new EnvelopePad(host, { label: 'ENV 1', showValues: false });
        const peak = host.querySelector('.abd-envpad__handle[data-segment="attack"]');

        expect(peak.getAttribute('role')).toBe('slider');
        expect(peak.getAttribute('aria-label')).toBe('ENV 1 — Attack');
        expect(peak.getAttribute('aria-valuemin')).toBe('0');
        expect(peak.getAttribute('aria-valuemax')).toBe('1');
        expect(Number(peak.getAttribute('aria-valuenow'))).toBeCloseTo(DEFAULT_ENVELOPE.attack, 5);
        expect(peak.getAttribute('aria-valuetext')).toBeTruthy();

        pad.destroy();
    });
});

describe('EnvelopePad — la aguja en el control', () =>
{
    it('setLevel funciona en ambos modos y bajo el suelo se esconde', () =>
    {
        const host = makeHost();
        const pad = new EnvelopePad(host, { showValues: false });
        const needle = host.querySelector('.abd-envpad__needle');

        pad.setLevel(0.8);
        expect(needle.dataset.visible).toBe('true');

        pad.setLevel(NEEDLE_FLOOR);   // justo el suelo: silencio
        expect(needle.dataset.visible).toBe('false');

        pad.destroy();
    });
});

describe('envelopeGestures — la matematica del gesto, pura', () =>
{
    it('la inversa de la raiz devuelve el valor del tramo', () =>
    {
        // k = px por unidad de tramo de raiz: un gesto de k px sube la raiz 1
        // (de 0 a 1), o sea el valor de 0 a 1.
        const drag = captureGesture({
            segmentValue: 0.25, sustainValue: 0.5,
            segmentPx: 50, pxPerUnit: 2, stageHeight: 48, minShare: 0.05,
        });

        expect(Math.sqrt(0.25)).toBeCloseTo(drag.s0, 10);
        expect(dragSegment(drag, 0)).toBe(0.25);              // sin mover: sin cambio
        expect(dragSegment(drag, drag.k * (1 - drag.s0))).toBeCloseTo(1, 10);
        expect(dragSegment(drag, -drag.k * drag.s0)).toBeCloseTo(0, 10);
    });

    it('el sustain es lineal e invertido (subir el puntero sube el nivel)', () =>
    {
        const drag = captureGesture({
            segmentValue: 0.5, sustainValue: 0.25,
            segmentPx: 50, pxPerUnit: 2, stageHeight: 48, minShare: 0.05,
        });

        // yFactor = (48-4)/48 * 48 = 44 px por nivel completo: subir 11 px
        // sube el nivel 11/44.
        expect(dragSustain(drag, 0)).toBe(0.25);
        expect(dragSustain(drag, 11)).toBeCloseTo(0.25 + 11 / 44, 5);   // pxUp positivo
        expect(dragSustain(drag, 100)).toBe(1);                          // clamp arriba
        expect(dragSustain(drag, -100)).toBe(0);                         // clamp abajo
    });

    it('el suelo de la raiz evita una k infinita en tramos casi nulos', () =>
    {
        const drag = captureGesture({
            segmentValue: 0, sustainValue: 0.5,
            segmentPx: 50, pxPerUnit: 2, stageHeight: 48, minShare: 0.05,
        });

        expect(Number.isFinite(drag.k)).toBe(true);
    });
});
