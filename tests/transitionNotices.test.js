/**
 * Tests del contrato compartido de AVISOS DE TRANSICION: un callback de estado
 * avisa UNA vez por cambio REAL de valor, nunca por la peticion. La igualdad que
 * comparte el boolean de Toggle, el indice de Segmented y el `{x, y}` de XYPad
 * vive aqui, no en cada control.
 */

import { describe, expect, it, vi } from 'vitest';

import {
    sameControlValue,
    transitioned,
    announceTransition,
} from '../components/transitionNotices.js';

describe('avisos de transicion — contrato compartido', () =>
{
    it('la igualdad cubre los modelos de valor de la familia', () =>
    {
        expect(sameControlValue(true, true)).toBe(true);
        expect(sameControlValue(2, 2)).toBe(true);
        expect(sameControlValue({ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.2 })).toBe(true);

        expect(sameControlValue(true, false)).toBe(false);
        expect(sameControlValue(1, 2)).toBe(false);
        expect(sameControlValue({ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.3 })).toBe(false);
        // Distinto juego de claves: no es el mismo valor.
        expect(sameControlValue({ x: 0.1, y: 0.2 }, { x: 0.1 })).toBe(false);
        expect(sameControlValue(null, { x: 0 })).toBe(false);
    });

    it('transitioned separa la intencion de la transicion', () =>
    {
        expect(transitioned(0, 0)).toBe(false);
        expect(transitioned(false, false)).toBe(false);
        expect(transitioned({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBe(false);

        expect(transitioned(0, 1)).toBe(true);
        expect(transitioned({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 })).toBe(true);
    });

    it('announceTransition emite una vez, y solo si el valor cambio', () =>
    {
        const notify = vi.fn();

        expect(announceTransition(notify, 0, 1)).toBe(true);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(1);

        // La misma peticion otra vez: intencion sin transicion, nadie avisa.
        expect(announceTransition(notify, 1, 1)).toBe(false);
        expect(notify).toHaveBeenCalledTimes(1);

        expect(announceTransition(notify, 1, 0)).toBe(true);
        expect(notify).toHaveBeenLastCalledWith(0);
    });

    it('sin callback sigue diciendo si hubo transicion (el aviso es opcional)', () =>
    {
        expect(announceTransition(null, 0, 1)).toBe(true);
        expect(announceTransition(undefined, 0, 0)).toBe(false);
    });
});
