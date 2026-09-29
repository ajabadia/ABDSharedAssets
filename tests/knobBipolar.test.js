/**
 * BIPOLAR knob: a centred parameter has to read as ZERO, not as a guess.
 *
 * The idea comes from the Mz950 plugin's LookAndFeel (AGPLv3, studied not
 * copied): a knob whose minimum is below zero fills its arc from the CENTRE
 * instead of from the left end, and keeps a tick at the rest position, so the
 * eye can find "no offset" without reading the number.
 *
 * What these tests pin down, and why each one is here:
 *
 *   - The FILL origin moves, the POINTER does not. Bipolar is how the arc is
 *     painted, not where the knob sits; if the pointer moved, the gesture
 *     would change and the drag-core contract with it.
 *   - The value model does not change. Still 0..1, still one aria-valuenow. A
 *     knob that invented a -1..1 model for bipolar would force every host to
 *     have two code paths for the same parameter.
 *   - The rest mark is only in the DOM when asked for, and it is where it
 *     says. A mark painted on top of the arc band is invisible exactly when it
 *     matters (value at zero), so its position is asserted, not just its
 *     existence.
 */

import { describe, expect, it, vi } from 'vitest';

import { Knob } from '../components/knob.js';

/** 2*PI*20.5, la circunferencia del arco del skin vector. */
const CIRCUMFERENCE = 2 * Math.PI * 20.5;

/** El arco de la piel vector. */
function arcOf (knob) { return knob.dial.querySelector('.abd-knob__arc'); }

/**
 * Los GRADOS que el arco tiene pintados.
 *
 * Se leen del PRIMER valor del `dasharray`, que es la longitud del unico trazo
 * que se pinta, y no de un `offset`: por eso esta asercion es la que cazo el
 * bug de fondo. Con el `dasharray` fijo de 270 grados (como estaba antes) y solo
 * el `offset` moviendose, el relleno no se puede acortar — solo desplazar — y el
 * arco salia de 0 grados con el valor a 0.25.
 */
function paintedDegrees (knob)
{
    const dash = arcOf(knob).style.strokeDasharray.split(/[ ,]+/);

    return Number(dash[0]) / CIRCUMFERENCE * 360;
}

/** Desde que grado del recorrido arranca el relleno. El offset va en negativo. */
function fromDegrees (knob)
{
    return -Number(arcOf(knob).style.strokeDashoffset) / CIRCUMFERENCE * 360;
}

function mount (options = {})
{
    const container = document.createElement('div');

    document.body.append(container);

    return { knob: new Knob(container, { size: 48, ...options }), container };
}

describe('Knob — el relleno es proporcional al valor', () =>
{
    // Este bloque NO es del bipolar: es el suelo. Un mando bipolar encima de un
    // relleno que no es proporcional no seria bipolar, seria raro. Los grados
    // esperados estan MEDIDOS en el navegador (captura y recuento de pixeles
    // pintados), no deducidos de la formula que se quiere escribir.
    for (const [value, expected] of [[0, 0], [0.25, 67.5], [0.5, 135], [0.75, 202.5], [1, 270]])
    {
        it(`unipolar con valor ${value} pinta ${expected} grados desde el inicio`, () =>
        {
            const { knob } = mount({ value });

            expect(paintedDegrees(knob)).toBeCloseTo(expected, 1);
            expect(fromDegrees(knob)).toBeCloseTo(0, 1);
        });
    }

    it('el hueco del recorrido no se enciende nunca', () =>
    {
        // El arco solo puede pintar entre 0 y 270 grados. Con el valor minimo
        // tiene que quedar a cero, no "un trozo" en el hueco de abajo, que es
        // donde no hay mando.
        const { knob } = mount({ value: 0 });

        expect(paintedDegrees(knob)).toBeCloseTo(0, 3);
    });

    it('sin relleno el arco se oculta, porque el remate redondo dejaria un punto', () =>
    {
        // Medido: con `stroke-linecap: round` y un trazo de largo cero, el
        // navegador pinta el remate. En bipolar ese punto cae en el CENTRO, justo
        // encima de la marca del cero, y ahi se lee como un valor. Asi que sin
        // relleno no hay arco en absoluto.
        for (const [value, bipolar] of [[0, false], [0.5, true]])
        {
            const { knob } = mount({ value, bipolar });

            expect(arcOf(knob).style.display, `valor ${value} bipolar ${bipolar}`)
                .toBe('none');
        }

        // Y en cuanto hay relleno, vuelve.
        const { knob } = mount({ value: 0.5, bipolar: false });

        expect(arcOf(knob).style.display).toBe('');
    });
});

describe('Knob bipolar — el origen del relleno', () =>
{
    it('bipolar llena desde el CENTRE hacia el valor', () =>
    {
        const up = mount({ value: 0.75, bipolar: true }).knob;

        expect(fromDegrees(up)).toBeCloseTo(135, 1);     // 0.5 * 270
        expect(paintedDegrees(up)).toBeCloseTo(67.5, 1);  // 0.25 * 270

        const down = mount({ value: 0.25, bipolar: true }).knob;

        // Abajo del centro el tramo va hacia el otro lado: mismo ancho de arco,
        // otro extremo de partida, y nunca se sale de la ventana.
        expect(fromDegrees(down)).toBeCloseTo(67.5, 1);
        expect(paintedDegrees(down)).toBeCloseTo(67.5, 1);
    });

    it('en el cero bipolar no hay relleno, y el arco no se aparta', () =>
    {
        const { knob } = mount({ value: 0.5, bipolar: true });

        expect(paintedDegrees(knob)).toBeCloseTo(0, 3);
        expect(arcOf(knob).style.display, 'en el cero no hay punto de remate').toBe('none');

        // El cero no se "reinicia": el valor sigue siendo 0.5 del recorrido.
        expect(knob.getValue()).toBe(0.5);
    });

    it('la ventana de 270 grados va en el CSS transform, no en el atributo', () =>
    {
        // Este es el bug de fondo que hacia que el arco no se pintara: poner
        // `style.transformOrigin` sobre un elemento SVG hace que la propiedad
        // `transform` del CSS mande sobre el atributo `transform`, y el atributo
        // se ignora. Con la rotacion en CSS, atributo y CSS no se pelean.
        const { knob } = mount({ value: 0.5 });
        const arc = arcOf(knob);

        expect(arc.getAttribute('transform'), 'el atributo no debe volver').toBeNull();
        expect(arc.style.transform).toBe('rotate(135deg)');
        expect(arc.style.transformOrigin).toBe('25px 25px');
    });

    it('en los dos extremos bipolar llena media vuelta a cada lado', () =>
    {
        const low = mount({ value: 0, bipolar: true }).knob;
        const high = mount({ value: 1, bipolar: true }).knob;

        expect(paintedDegrees(low)).toBeCloseTo(135, 1);
        expect(fromDegrees(low)).toBeCloseTo(0, 1);
        expect(paintedDegrees(high)).toBeCloseTo(135, 1);
        expect(fromDegrees(high)).toBeCloseTo(135, 1);
    });

    it('el mismo valor da el mismo ancho de arco en los dos sentidos', () =>
    {
        // La simetria es la asercion que hace que un mando bipolar se LEA
        // bipolar: 0.25 y 0.75 tienen que ser la misma distancia al cero.
        const low = mount({ value: 0.25, bipolar: true }).knob;
        const high = mount({ value: 0.75, bipolar: true }).knob;

        expect(paintedDegrees(high)).toBeCloseTo(paintedDegrees(low));
    });

    it('ningun relleno bipolar se sale de la ventana de 270 grados', () =>
    {
        for (let v = 0; v <= 1.0001; v += 0.05)
        {
            const { knob } = mount({ value: v, bipolar: true });
            const from = fromDegrees(knob);
            const painted = paintedDegrees(knob);

            expect(from).toBeGreaterThanOrEqual(-0.001);
            expect(from + painted).toBeLessThanOrEqual(270.001);
        }
    });
});

describe('Knob bipolar — el puntero NO se mueve', () =>
{
    it('el mismo valor normalizado apunta al mismo sitio con y sin bipolar', () =>
    {
        for (const value of [0, 0.25, 0.5, 0.75, 1])
        {
            const plain = mount({ value }).knob;
            const bipolar = mount({ value, bipolar: true }).knob;

            expect(bipolar.dial.querySelector('.abd-knob__pointer').style.transform)
                .toBe(plain.dial.querySelector('.abd-knob__pointer').style.transform);
        }
    });

    it('setValue mueve el relleno y el puntero en los dos modos', () =>
    {
        const { knob } = mount({ value: 0.5, bipolar: true });

        knob.setValue(0);
        expect(fromDegrees(knob)).toBeCloseTo(0, 1);
        expect(paintedDegrees(knob)).toBeCloseTo(135, 1);

        knob.setValue(1);
        expect(fromDegrees(knob)).toBeCloseTo(135, 1);
        expect(paintedDegrees(knob)).toBeCloseTo(135, 1);
    });
});

describe('Knob bipolar — la marca del reposo', () =>
{
    it('solo existe cuando el mando es bipolar', () =>
    {
        expect(mount({ value: 0.5 }).knob.dial.querySelector('.abd-knob__rest')).toBeNull();
        expect(mount({ value: 0.5, bipolar: true }).knob.dial.querySelector('.abd-knob__rest'))
            .not.toBeNull();
    });

    it('cae en el CENTRO del recorrido, en el hueco entre el puntero y el arco', () =>
    {
        // Radio 15 desde el centro (cy = 25 - 10): por fuera del puntero, que
        // llega a 13, y por dentro del arco, que empieza en 16.5. Encima del
        // arco la marca desapareceria justo en el valor que la hace util.
        const rest = mount({ value: 0.5, bipolar: true }).knob.dial
            .querySelector('.abd-knob__rest');

        expect(rest.getAttribute('cx')).toBe('25');
        expect(rest.getAttribute('cy')).toBe('10');
        expect(Number(rest.getAttribute('r'))).toBeLessThanOrEqual(1.5);
    });

    it('el wrapper lo declara, para un skin o un tema que no sea el vector', () =>
    {
        expect(mount({}).knob.wrapper.dataset.bipolar).toBe('false');
        expect(mount({ bipolar: true }).knob.wrapper.dataset.bipolar).toBe('true');
    });
});

describe('Knob bipolar — no toca el contrato', () =>
{
    it('el valor sigue siendo 0..1 y el aria no se entera', () =>
    {
        const { knob } = mount({ value: 0.5, bipolar: true, format: (v) => `${Math.round((v - 0.5) * 2) * 100}` });

        expect(knob.getValue()).toBe(0.5);
        expect(knob.dial.getAttribute('aria-valuemin')).toBe('0');
        expect(knob.dial.getAttribute('aria-valuemax')).toBe('1');
        expect(knob.dial.getAttribute('aria-valuenow')).toBe('0.5');
    });

    it('bipolar es solo pintura: setValue no avisa y el gesto sigue igual', () =>
    {
        const onChange = vi.fn();
        const { knob } = mount({ value: 0.5, bipolar: true, onChange });

        knob.setValue(0.8);
        expect(onChange).not.toHaveBeenCalled();

        // El doble clic vuelve al valor de fabrica, que aqui es el 0.5 inicial.
        knob.dial.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(knob.getValue()).toBe(0.5);
    });

    it('una piel que no pinta arco (ms2000) acepta la opcion sin romperse', () =>
    {
        // El ms2000 no tiene arco de valor (rim/cap/puntero), asi que bipolar no
        // cambia lo que se ve. Lo que no puede pasar es que la opcion rompa la
        // pintura: por eso el caso existe.
        const { knob } = mount({ value: 0.5, skin: 'ms2000', bipolar: true });

        expect(knob.getValue()).toBe(0.5);
        expect(knob.dial.querySelector('.abd-ms2000-knob')).not.toBeNull();
        knob.setValue(0.75);
        expect(knob.dial.querySelector('.abd-knob__rest'), 'la marca es del skin vector').toBeNull();
    });
});
