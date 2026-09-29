/**
 * Tests del boton LED de efecto (EffectLEDButton).
 *
 * Por que existe un test tan pequeno para un boton: el fallo que caza ya
 * ocurrio. El componente nombra los seis sets por como se ven en la maquina
 * (`beige`, `patch-blue`) y construia el sprite con ESE nombre, asi que pedia
 * `button_beige_off.png`, que no existe, y salia un boton vacio. En jsdom no
 * hay peticiones de red, asi que el 404 no lo ve NINGUN test: solo se ve
 * abriendo la demo. Este test compara la URL que se pinta con la lista real de
 * ficheros de `assets/junio/`, que es la que manda.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import './setup.js';
import { EffectLEDButton } from '../components/effectLEDButton.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR = path.resolve(__dirname, '..', 'assets', 'junio');

/** Los seis sets que el componente dice aceptar. */
const COLORS = ['orange', 'yellow', 'beige', 'patch-blue', 'grey', 'red'];

/** El nombre de fichero que sale de la URL pintada, sin la carpeta. */
const spriteOf = (button) => (button.style.backgroundImage.match(/([^/]+\.png)/) ?? [])[1] ?? '';

describe('EffectLEDButton', () => {
    let host;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    describe('el sprite de cada color existe de verdad', () => {
        // Un boton vacio no rompe nada: se ve en la demo y en ningun otro sitio.
        for (const color of COLORS) {
            it(`'${color}' pinta un sprite que esta en assets/junio/`, () => {
                const button = new EffectLEDButton(host, { color });
                const off = spriteOf(button.button);

                expect(off, 'no se pinto ninguna URL de sprite').not.toBe('');
                expect(readdirSync(SPRITE_DIR), `falta ${off} en assets/junio/`)
                    .toContain(off);
                expect(off).toMatch(/_off\.png$/);
            });
        }

        it('beige y patch-blue se sirven de los sprites BLANCO y AZUL', () => {
            // El alias es el contrato: el host pide por el color de la maquina
            // y el sprite es el de la foto. Sin esto, dos de los seis botones
            // salian vacios.
            expect(spriteOf(new EffectLEDButton(host, { color: 'beige' }).button))
                .toBe('button_white_off.png');
            expect(spriteOf(new EffectLEDButton(host, { color: 'patch-blue' }).button))
                .toBe('button_blue_off.png');
        });

        it('el MISMO sprite sobrevive a pulsar y a restaurar', () => {
            // El bug era de las TRES rutas de pintado: al construir, al pulsar
            // y al restaurar. Con el alias solo en la primera, el boton nacia
            // bien y se vaciaba en la primera pulsacion. Esta es la asercion
            // que lo cazo.
            const button = new EffectLEDButton(host, { color: 'beige' });

            button.button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            expect(spriteOf(button.button), 'al pulsar').toBe('button_white_on.png');

            button.setValueSilent(false);
            expect(spriteOf(button.button), 'al restaurar').toBe('button_white_off.png');
        });

        it('los otros cuatro colores usan su propio nombre', () => {
            for (const color of ['orange', 'yellow', 'grey', 'red']) {
                expect(spriteOf(new EffectLEDButton(host, { color }).button))
                    .toBe(`button_${color}_off.png`);
            }
        });
    });

    describe('enclavado y pulsacion', () => {
        it('nace con el estado que le pasan', () => {
            expect(new EffectLEDButton(host, { color: 'red', value: true }).getValue()).toBe(true);
            expect(new EffectLEDButton(host, { color: 'red' }).getValue()).toBe(false);
        });

        it('setValue AVISA y setValueSilent no: los dos caminos del contrato', () => {
            // Este boton NO es silencioso por defecto (a diferencia de Knob o
            // Slider): su setValue dispara onChange, y el que restaura estado
            // sin ensuciar el preset es el silencioso. Los dos se prueban, que
            // un host que se equivoque aqui restaura un boton encendido y lo
            // nota tarde.
            const onChange = vi.fn();
            const button = new EffectLEDButton(host, { color: 'red', onChange });

            button.setValue(true);
            expect(onChange).toHaveBeenCalledWith(true);

            onChange.mockClear();
            button.setValueSilent(false);
            expect(onChange, 'el silencioso no puede avisar').not.toHaveBeenCalled();
            expect(button.getValue()).toBe(false);
        });

        it('el momentary no enclava: avisa al soltar con false', () => {
            const seen = [];
            const button = new EffectLEDButton(host, {
                color: 'orange',
                momentary: true,
                onChange: (value) => seen.push(value),
            });

            // Pointer events, no de raton: es lo que escucha el componente, y un
            // test con mousedown pasaria sin tocar el codigo que se quiere
            // probar.
            button.button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            button.button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

            expect(seen).toEqual([true, false]);
            expect(button.getValue(), 'un momentary se queda como estaba').toBe(false);
        });
    });

    it('acepta un id de selector, no solo un elemento', () => {
        host.id = 'por-id';
        const bySelector = new EffectLEDButton('#por-id', { color: 'grey' });

        expect(bySelector.container).toBe(host);
        expect(() => new EffectLEDButton('#no-existe', { color: 'grey' })).toThrow();
    });
});
