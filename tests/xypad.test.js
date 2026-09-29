/**
 * Tests for the shared XYPad control: family contract (setValue/getValue/
 * destroy, onChange vs silent setValue), the Y-up convention, absolute pointer
 * positioning and keyboard steps.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import './setup.js';
import { XYPad } from '../components/xypad.js';

function makeHost()
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

/** jsdom has no layout: stub the pad's rect for absolute-position tests. */
function stubRect(pad, width = 200, height = 100)
{
    pad.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: width, bottom: height, width, height });
}

function pointer(type, x, y)
{
    return new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 });
}

describe('XYPad — family contract', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('mounts into the container and exposes its value', () =>
    {
        const pad = new XYPad(host, { x: 0.25, y: 0.75 });

        expect(host.querySelector('.abd-xypad__pad')).not.toBeNull();
        expect(pad.getValue()).toEqual({ x: 0.25, y: 0.75 });

        pad.destroy();
        expect(host.querySelector('.abd-xypad')).toBeNull();
    });

    it('setValue is silent by default (external/bridge updates do not echo)', () =>
    {
        const onChange = vi.fn();
        const pad = new XYPad(host, { onChange });

        pad.setValue({ x: 0.1, y: 0.9 });

        expect(onChange).not.toHaveBeenCalled();
        expect(pad.getValue()).toEqual({ x: 0.1, y: 0.9 });

        pad.destroy();
    });

    it('setValue with notify fires onChange with a copy', () =>
    {
        const onChange = vi.fn();
        const pad = new XYPad(host, { onChange });

        pad.setValue({ x: 0.3, y: 0.4 }, true);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ x: 0.3, y: 0.4 });

        pad.destroy();
    });

    it('setValue con notify, pero el mismo punto, no avisa (intencion sin transicion)', () =>
    {
        const onChange = vi.fn();
        const pad = new XYPad(host, { x: 0.5, y: 0.5, onChange });

        pad.setValue({ x: 0.5, y: 0.5 }, true);
        expect(onChange).not.toHaveBeenCalled();

        pad.setValue({ x: 0.5, y: 0.6 }, true);
        expect(onChange).toHaveBeenCalledTimes(1);

        pad.destroy();
    });

    it('la flecha que empuja contra el borde no re-notifica (0/1 son el tope)', () =>
    {
        const onChange = vi.fn();
        const pad = new XYPad(host, { x: 0, y: 0.5, onChange });

        pad.pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(pad.getValue()).toEqual({ x: 0, y: 0.5 });
        expect(onChange).not.toHaveBeenCalled();

        pad.pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(onChange).toHaveBeenCalledTimes(1);

        pad.destroy();
    });

    it('getValue returns a copy — mutating it does not touch the control', () =>
    {
        const pad = new XYPad(host, {});
        const snapshot = pad.getValue();

        snapshot.x = 99;

        expect(pad.getValue().x).not.toBe(99);

        pad.destroy();
    });

    it('clamps values into 0..1', () =>
    {
        const pad = new XYPad(host, {});

        pad.setValue({ x: -2, y: 5 });

        expect(pad.getValue()).toEqual({ x: 0, y: 1 });

        pad.destroy();
    });
});

describe('XYPad — Y-up convention (screen top = y 1)', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('positions thumb and crosshair inverted on Y', () =>
    {
        const pad = new XYPad(host, { x: 0.5, y: 1 });

        pad.setValue({ x: 0.25, y: 1 }, false);

        expect(pad.thumb.style.top).toBe('0%');      // y=1 -> top edge
        expect(pad.lineH.style.top).toBe('0%');
        expect(pad.lineV.style.left).toBe('25%');
        expect(pad.thumb.style.left).toBe('25%');

        pad.destroy();
    });

    it('y=0 lands on the bottom edge', () =>
    {
        const pad = new XYPad(host, {});

        pad.setValue({ x: 0, y: 0 });

        expect(pad.thumb.style.top).toBe('100%');

        pad.destroy();
    });
});

describe('XYPad — absolute pointer editing', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('pointerdown jumps to the point and reports drag start', () =>
    {
        const onChange = vi.fn();
        const onDragStart = vi.fn();
        const pad = new XYPad(host, { onChange, onDragStart });

        stubRect(pad.pad, 200, 100);
        pad.pad.dispatchEvent(pointer('pointerdown', 100, 25));

        // x = 100/200 = 0.5; y = 1 - 25/100 = 0.75
        expect(pad.getValue()).toEqual({ x: 0.5, y: 0.75 });
        expect(onDragStart).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.75 });

        pad.destroy();
    });

    it('pointermove updates while dragging; nothing after pointerup', () =>
    {
        const onChange = vi.fn();
        const onDragEnd = vi.fn();
        const pad = new XYPad(host, { onChange, onDragEnd });

        stubRect(pad.pad, 200, 100);
        pad.pad.dispatchEvent(pointer('pointerdown', 0, 0));
        pad.pad.dispatchEvent(pointer('pointermove', 50, 50));

        expect(pad.getValue()).toEqual({ x: 0.25, y: 0.5 });

        pad.pad.dispatchEvent(pointer('pointerup', 50, 50));
        expect(onDragEnd).toHaveBeenCalledTimes(1);

        pad.pad.dispatchEvent(pointer('pointermove', 200, 0));
        expect(pad.getValue()).toEqual({ x: 0.25, y: 0.5 });   // no drag -> ignored

        pad.destroy();
    });

    it('pointer outside the pad clamps to the edges', () =>
    {
        const pad = new XYPad(host, {});

        stubRect(pad.pad, 200, 100);
        pad.pad.dispatchEvent(pointer('pointerdown', -50, 300));

        expect(pad.getValue()).toEqual({ x: 0, y: 0 });

        pad.destroy();
    });
});

describe('XYPad — keyboard', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('arrows step by options.step, PageUp/Down by ten', () =>
    {
        const pad = new XYPad(host, { x: 0.5, y: 0.5, step: 0.1 });

        const press = (key) => pad.pad.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }));

        press('ArrowRight');
        expect(pad.getValue()).toEqual({ x: 0.6, y: 0.5 });

        press('ArrowUp');
        expect(pad.getValue()).toEqual({ x: 0.6, y: 0.6 });

        press('PageDown');
        expect(pad.getValue()).toEqual({ x: 0.6, y: 0 });   // ten steps -> bottom clamp

        press('Home');
        expect(pad.getValue()).toEqual({ x: 0, y: 0 });

        press('End');
        expect(pad.getValue()).toEqual({ x: 1, y: 1 });

        pad.destroy();
    });

    it('steps clamp at the borders', () =>
    {
        const pad = new XYPad(host, { x: 1, y: 0, step: 0.1 });

        pad.pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        pad.pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        expect(pad.getValue()).toEqual({ x: 1, y: 0 });

        pad.destroy();
    });
});

describe('XYPad — corner labels (optional)', () =>
{
    let host;

    beforeEach(() => { host = makeHost(); });

    it('renders no corners by default (zero impact on existing consumers)', () =>
    {
        const pad = new XYPad(host, {});

        expect(pad.pad.querySelectorAll('.abd-xypad__corner')).toHaveLength(0);
        expect(pad.wrapper.classList.contains('abd-xypad--corners')).toBe(false);

        pad.destroy();
    });

    it('renders one label per corner, empty strings hidden', () =>
    {
        const pad = new XYPad(host, { corners: ['Piano', 'Rhodes', '', 'Bell'] });

        const corners = [...pad.pad.querySelectorAll('.abd-xypad__corner')];

        expect(corners.map((el) => el.dataset.corner)).toEqual(['tl', 'tr', 'br']);
        expect(corners.map((el) => el.textContent)).toEqual(['Piano', 'Rhodes', 'Bell']);

        pad.destroy();
    });

    it('setCorners updates labels after construction and clears them', () =>
    {
        const pad = new XYPad(host, {});

        pad.setCorners(['A', 'B', 'C', 'D']);
        expect([...pad.pad.querySelectorAll('.abd-xypad__corner')].map((el) => el.textContent))
            .toEqual(['A', 'B', 'C', 'D']);

        pad.setCorners(['', '', '', '']);
        expect(pad.pad.querySelectorAll('.abd-xypad__corner')).toHaveLength(0);

        pad.setCorners(null);
        expect(pad.pad.querySelectorAll('.abd-xypad__corner')).toHaveLength(0);

        pad.destroy();
    });

    it('labels do not break pointer editing (they carry no listeners)', () =>
    {
        const onChange = vi.fn();
        const pad = new XYPad(host, { corners: ['A', 'B', 'C', 'D'], onChange });

        stubRect(pad.pad, 200, 100);
        pad.pad.dispatchEvent(pointer('pointerdown', 100, 25));

        expect(pad.getValue()).toEqual({ x: 0.5, y: 0.75 });
        expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.75 });

        pad.destroy();
    });
});
