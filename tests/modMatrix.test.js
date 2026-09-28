/**
 * Tests for the shared ModMatrix view: the family contract (paint/setLive/
 * destroy), the "what counts as a live route" rule (which must match the engine's),
 * the fused gestures (click a row, compact), and the a11y of the flow graphic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import './setup.js';
import { ModMatrix } from '../components/modMatrix.js';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS = path.resolve(__dirname, '..', 'contracts');

/** El contrato real de NEURONiK, no uno inventado en el test. */
const NEURONIK = JSON.parse(
    readFileSync(path.join(CONTRACTS, 'neuronik_modulation_matrix.json'), 'utf8'),
);

function makeHost()
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

describe('ModMatrix — el contrato de la familia', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('acepta un elemento o un selector', () => {
        host.id = 'matrix-host';

        const byElement = new ModMatrix(host, { contract: NEURONIK });
        expect(byElement.container).toBe(host);

        const bySelector = new ModMatrix('#matrix-host', { contract: NEURONIK });
        expect(bySelector.container).toBe(host);
    });

    it('falla en voz alta si el contenedor no existe', () => {
        // Un null silencioso dejaria la matriz sin pintar y nadie se enteraria
        // hasta que un preset no se viesiera.
        expect(() => new ModMatrix('#no-existe', { contract: NEURONIK }))
            .toThrow(/contenedor/);
    });

    it('se monta con la lista y el grafo', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });

        expect(matrix.rootElement).toBeTruthy();
        expect(host.querySelector('.mod-matrix__list')).toBeTruthy();
        expect(host.querySelector('.mod-matrix__flow')).toBeTruthy();
    });

    it('pinta una fila por slot visible', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        const rows = host.querySelectorAll('.mod-matrix__row');

        expect(rows.length).toBe(NEURONIK.slots);
        expect(rows[0].dataset.slot).toBe('1');
    });

    it('respeta visibleSlots para una matriz con más buses que filas', () => {
        const contract = { ...NEURONIK, slots: 32 };
        const matrix = new ModMatrix(host, { contract, visibleSlots: 8 });

        expect(host.querySelectorAll('.mod-matrix__row')).toHaveLength(8);
    });

    it('destroy() limpia el contenedor', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);

        matrix.destroy();

        expect(host.children).toHaveLength(0);
    });
});

describe('ModMatrix — qué cuenta como ruta viva', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('cuenta la fuente 0 como inerte (el "Off" del contrato)', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 0, destination: 1, amount: 1.0 }]);

        const row = host.querySelector('.mod-matrix__row');
        expect(row.dataset.live).toBe('false');
        expect(host.querySelector('.mod-matrix__count').textContent).toBe('0 / 4 rutas');
    });

    it('cuenta la cantidad 0 como ruta apagada', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 1, amount: 0 }]);

        expect(host.querySelector('.mod-matrix__row').dataset.live).toBe('false');
    });

    it('cuenta una ruta normal, y el recuento la dice', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        // ENV 1 -> Osc Level, la ruta por defecto del preset nuevo.
        matrix.paint([{ source: 6, destination: 1, amount: 1.0 }]);

        expect(host.querySelector('.mod-matrix__row').dataset.live).toBe('true');
        expect(host.querySelector('.mod-matrix__count').textContent).toBe('1 / 4 rutas');
    });

    it('el recuento distingue vivas de muertas', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 6, destination: 1, amount: 1.0 },   // viva
            { source: 0, destination: 2, amount: 0.5 },   // fuente inerte
            { source: 7, destination: 10, amount: 1.0 },  // viva
        ]);

        expect(host.querySelector('.mod-matrix__count').textContent).toBe('2 / 4 rutas');
    });
});

describe('ModMatrix — lo que se ve', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('el nombre de la fuente y del destino sale de la tabla, no del código', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 6, destination: 10, amount: 0.5 }]);

        const row = host.querySelector('.mod-matrix__row');
        expect(row.querySelector('.mod-matrix__source').textContent)
            .toBe(NEURONIK.sources[6].label);
        expect(row.querySelector('.mod-matrix__destination').textContent)
            .toBe(NEURONIK.destinations[10].label);
    });

    it('el signo de la cantidad se ve: una ruta invertida suena al revés', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 1, destination: 1, amount: 0.5 },
            { source: 2, destination: 1, amount: -0.5 },
        ]);

        const [positive, negative] = host.querySelectorAll('.mod-matrix__amount');
        expect(positive.dataset.sign).toBe('positive');
        expect(negative.dataset.sign).toBe('negative');
        expect(negative.textContent).toContain('−');
    });

    it('una ruta fina se ve como fina, no como 0', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 1, amount: 0.001 }]);

        // Con dos decimales, 0.001 se imprimiría como 0.00 y la ruta parecería
        // apagada cuando no lo está.
        expect(host.querySelector('.mod-matrix__amount').textContent).toBe('0.001');
    });

    it('una fila sin ruta dice que está libre, no en blanco', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);

        const second = host.querySelectorAll('.mod-matrix__row')[1];
        expect(second.querySelector('.mod-matrix__source').textContent).toBe('—');
        expect(second.querySelector('.mod-matrix__destination').textContent).toBe('Libre');
    });

    it('marca el destino que el motor todavía no aplica', () => {
        const contract = {
            ...NEURONIK,
            destinations: NEURONIK.destinations.map((d, i) => (
                i === 1 ? { ...d, implemented: false } : d
            )),
        };
        const matrix = new ModMatrix(host, { contract });
        matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);

        expect(host.querySelector('.mod-matrix__row').dataset.implemented).toBe('false');
    });
});

describe('ModMatrix — la contribución viva', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('la barra muestra el signo de lo que el motor acumula', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 1, destination: 10, amount: 0.5 },
            { source: 1, destination: 11, amount: 0.5 },
        ]);
        matrix.setLive({ 10: -0.4, 11: 0.8 });

        const [first, second] = host.querySelectorAll('.mod-matrix__live');
        expect(first.dataset.side).toBe('negative');
        expect(second.dataset.side).toBe('positive');
    });

    it('una contribución ausente deja la barra neutra', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 10, amount: 0.5 }]);
        matrix.setLive({});

        expect(host.querySelector('.mod-matrix__live').dataset.side).toBe('none');
    });

    it('una contribución cero no finge que hay señal', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 10, amount: 0.5 }]);
        matrix.setLive({ 10: 0 });

        expect(host.querySelector('.mod-matrix__live').dataset.side).toBe('none');
    });

    it('setLive aguanta entradas raras sin romper', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 10, amount: 0.5 }]);

        expect(() => matrix.setLive()).not.toThrow();
        expect(() => matrix.setLive(null)).not.toThrow();
        expect(() => matrix.setLive({ 10: 'basura' })).not.toThrow();
        expect(host.querySelector('.mod-matrix__live').dataset.side).toBe('none');
    });

    it('la contribución se pinta por DESTINO, no por fila', () => {
        // Dos rutas al mismo destino: las dos filas muestran la misma señal, que
        // es lo que llega desde el motor (suma por destino, no por ruta).
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 1, destination: 10, amount: 0.5 },
            { source: 2, destination: 10, amount: 0.5 },
        ]);
        matrix.setLive({ 10: 0.5 });

        const bars = host.querySelectorAll('.mod-matrix__live');
        expect(bars[0].dataset.side).toBe('positive');
        expect(bars[1].dataset.side).toBe('positive');
    });
});

describe('ModMatrix — los gestos que fusiona', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('pulsar una fila avisa de QUÉ slot se quiere abrir', () => {
        const onSelectSlot = vi.fn();
        const matrix = new ModMatrix(host, { contract: NEURONIK, onSelectSlot });
        matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);

        host.querySelectorAll('.mod-matrix__row')[1].click();

        expect(onSelectSlot).toHaveBeenCalledWith(2);
    });

    it('pulsar compactar avisa, y el host decide qué hacer con las rutas', () => {
        // La matriz NO compacta por su cuenta: reordenar el preset es decisión
        // del synth, no de la vista.
        const onCompact = vi.fn();
        const onAnnounce = vi.fn();
        const matrix = new ModMatrix(host, {
            contract: { ...NEURONIK, slots: 32 },
            visibleSlots: 8,
            onCompact,
            onAnnounce,
        });

        const button = host.querySelector('.mod-matrix__compact');
        expect(button).toBeTruthy();
        button.click();

        expect(onCompact).toHaveBeenCalledTimes(1);
        expect(onAnnounce).toHaveBeenCalledWith('Rutas compactadas');
    });

    it('sin handler de compactar no aparece el botón', () => {
        const matrix = new ModMatrix(host, {
            contract: { ...NEURONIK, slots: 32 },
            visibleSlots: 8,
        });

        expect(host.querySelector('.mod-matrix__compact')).toBeNull();
    });

    it('con todos los slots a la vista no hace falta compactar', () => {
        const matrix = new ModMatrix(host, {
            contract: NEURONIK,
            onCompact: vi.fn(),
        });

        expect(host.querySelector('.mod-matrix__compact')).toBeNull();
    });
});

describe('ModMatrix — accesibilidad', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('las filas son botones de verdad, tabulables', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });

        for (const row of host.querySelectorAll('.mod-matrix__row')) {
            expect(row.tagName).toBe('BUTTON');
            expect(row.type).toBe('button');
        }
    });

    it('el grafo está oculto a la accesibilidad porque duplica la lista', () => {
        // La información del grafo ya está en las filas, que sí se pueden leer
        // y tabular. Dejar ambos expuestos sería leerlo dos veces.
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 1, destination: 1, amount: 0.5 }]);

        const flow = host.querySelector('.mod-matrix__flow');
        expect(flow.getAttribute('aria-hidden')).toBe('true');
        expect(flow.textContent.length).toBeGreaterThan(0);
    });

    it('el grafo se pinta con los mismos nombres que la lista', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 6, destination: 10, amount: 0.5 }]);

        const flow = host.querySelector('.mod-matrix__flow');
        expect(flow.querySelector('.mod-matrix__flow-source').textContent)
            .toBe(NEURONIK.sources[6].label);
        expect(flow.querySelector('.mod-matrix__flow-destination').textContent)
            .toBe(NEURONIK.destinations[10].label);
    });

    it('el grosor de la línea crece con la profundidad, nunca desaparece', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 1, destination: 1, amount: 1.0 },
            { source: 2, destination: 2, amount: 0.001 },
        ]);

        const lines = host.querySelectorAll('.mod-matrix__flow-line');
        const thick = Number(lines[0].style.getPropertyValue('--mod-matrix-thickness'));
        const thin = Number(lines[1].style.getPropertyValue('--mod-matrix-thickness'));

        expect(thick).toBeGreaterThan(thin);
        expect(thin).toBeGreaterThanOrEqual(1);
    });

    it('la línea marca el signo, como el texto de la cantidad', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([
            { source: 1, destination: 1, amount: 0.5 },
            { source: 2, destination: 2, amount: -0.5 },
        ]);

        const lines = host.querySelectorAll('.mod-matrix__flow-line');
        expect(lines[0].dataset.sign).toBe('positive');
        expect(lines[1].dataset.sign).toBe('negative');
    });

    it('la fila describe la ruta completa en su title', () => {
        const matrix = new ModMatrix(host, { contract: NEURONIK });
        matrix.paint([{ source: 6, destination: 10, amount: 0.5 }]);

        const title = host.querySelector('.mod-matrix__row').title;
        expect(title).toContain(NEURONIK.sources[6].label);
        expect(title).toContain(NEURONIK.destinations[10].label);
        expect(title).toContain('→');
    });
});

describe('ModMatrix — la vista no es un control', () => {
    let host;

    beforeEach(() => { host = makeHost(); });

    it('no escribe NINGÚN valor: la matriz no tiene parámetro propio', () => {
        // Es lo que permite que el mismo componente viva en el modal de ABDEep y
        // en el cajón de NEURONiK: no depende de quién posea el estado.
        const source = readFileSync(
            path.resolve(__dirname, '..', 'components', 'modMatrix.js'),
            'utf8',
        );
        const body = source.slice(source.indexOf('export class ModMatrix'));

        expect(body).not.toMatch(/setParameter/);
        expect(body).not.toMatch(/postMessage/);
        expect(body).not.toMatch(/dispatchEvent/);
    });

    it('funciona con un contrato minimo, sin byteRange ni provenance', () => {
        // Un synth nuevo no tiene por qué declarar provenance: el componente
        // usa lo que haya.
        const matrix = new ModMatrix(host, {
            contract: { slots: 2, sources: [], destinations: [] },
        });

        expect(() => matrix.paint([{ source: 0, destination: 0, amount: 0.5 }]))
            .not.toThrow();
    });
});
