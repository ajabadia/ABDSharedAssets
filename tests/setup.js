/**
 * jsdom lacks PointerEvent (and setPointerCapture). The control family is built
 * on pointer events, so the tests polyfill them minimally — enough semantics for
 * the drag-core: constructor with clientX/clientY, bubbling, and capture no-ops.
 */

class PointerEventPolyfill extends MouseEvent
{
  constructor (type, params = {})
  {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
    this.pointerType = params.pointerType ?? 'mouse';
    this.isPrimary = params.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === 'undefined')
  globalThis.PointerEvent = PointerEventPolyfill;

if (typeof HTMLElement !== 'undefined' && ! HTMLElement.prototype.setPointerCapture)
{
  HTMLElement.prototype.setPointerCapture = function setPointerCapture () {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture () {};
}
