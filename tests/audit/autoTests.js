/**
 * Auto-tests del detector: cada regla tiene que MORDER.
 *
 * Fuentes sinteticas que rompen una cosa a proposito para comprobar que el detector
 *
 * la caza. Importa los detectores de ./detectors.js y registra los tests al cargarse.
 */

import { describe, expect, it } from 'vitest';

import {
  arityMismatches,
  baseChain,
  baseClassName,
  baseSources,
  classMembers,
  comparedExampleArguments,
  constructedWith,
  docBlocks,
  docParamTypes,
  documentedMembers,
  contractText,
  documentedParamTypes,
  documentsOptionsObject,
  entryKeyIsRead,
  entryShapeKeys,
  enumeratedValues,
  exampleMemberAccesses,
  exampleMethodCalls,
  exportedFunctions,
  inertOptions,
  memberDeclarations,
  membersWithBases,
  mismatchedExampleAccesses,
  missingExampleMethods,
  mistypedExampleArguments,
  moduleExporting,
  MODULES,
  normaliseEol,
  offListValues,
  docBlockBefore,
  optionReads,
  readableType,
  staleUsageOptions,
  undocumentedDefaults,
  undocumentedReads,
  undocumentedExampleCalls,
  undocumentedExports,
  textChainedMembers,
  unreadEntryKeys,
  unusedMembers,
  usageBlocks,
} from './detectors.js';

/* ---------------------------------------------------------------------------
 * Auto-tests: cada regla tiene que MORDER
 * ------------------------------------------------------------------------- */

describe('auto-tests del detector', () => {
  const jsdoc = (body) => `/**\n * T\n * @param {HTMLElement} container\n * @param {object} options\n${body} */\nexport class C {\n  constructor(container, options = {}) {\n    this.skin = options.skin;\n  }\n}\n`;

  it('caza un miembro documentado que el código no menciona', () => {
    const source = jsdoc(' * @param {string} [options.glow]  brillo.\n * @param {string} [options.skin]  look.\n');

    expect([...documentedMembers(source).keys()]).toEqual(['glow', 'skin']);
    expect(unusedMembers(source)).toEqual(['glow']);
  });

  it('no cuenta la propia documentación como uso', () => {
    const source = '/**\n * @param {object} options\n * @param {string} [options.glow]  brillo.\n */\nexport const X = 1;\n';

    expect(unusedMembers(source)).toEqual(['glow']);
  });

  it('caza una opción que el código lee y nadie documenta', () => {
    const source = '/**\n * @param {object} options\n * @param {string} [options.skin]  look.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.skin = options.skin;\n    this.glow = options.glow;\n  }\n}\n';

    expect([...optionReads(source).keys()]).toEqual(['skin', 'glow']);
    expect(undocumentedReads(source)).toEqual(['glow']);
  });

  it('ve las lecturas de un `handlers` que no abre la firma', () => {
    // Regresion: el `handlers` de en medio (o de cola) se perdia al comerse la coma, y
    // con el todas sus lecturas. `wire(el, handlers, n)` es el caso real de drag-core.
    const source = '/**\n * @param {HTMLElement} el\n * @param {object} handlers\n * @param {number} n\n'
      + ' */\nexport function wire(el, handlers, n) {\n  return handlers.onSave + n;\n}\n';

    expect([...optionReads(source).keys()]).toEqual(['onSave']);
    expect(undocumentedReads(source)).toEqual(['onSave']);
  });

  it('cuenta como lectura el destructuring, en la firma y en el cuerpo', () => {
    const signature = '/**\n * @param {object} options\n */\nexport class C {\n  constructor(container, { tema = "oscuro" } = {}) {\n    this.tema = tema;\n  }\n}\n';
    const body = '/**\n * @param {object} options\n */\nexport function monta(container, options = {}) {\n  const { velocidad, fondo = "#000" } = options;\n  return [velocidad, fondo];\n}\n';

    expect(undocumentedReads(signature)).toEqual(['tema']);
    expect(undocumentedReads(body)).toEqual(['velocidad', 'fondo']);
  });

  it('entiende las dos convenciones del repo, y los grupos de nombres', () => {
    const listed = jsdoc(' *   size   px, default 64.\n *   onChange / onDragEnd  callbacks.\n *   frameWidth/frameHeight  geometry.\n');

    expect([...documentedMembers(listed).keys()]).toEqual(['size', 'onChange', 'onDragEnd', 'frameWidth', 'frameHeight']);
  });

  it('entiende los bullets de callbacks y los campos de un tipo inline', () => {
    const bullets = jsdoc(' *   - onPreview(paramId, dir, state)  aviso de preview.\n');
    const inline = '/**\n * @param {{ type?: string, unit?: string }} spec\n */\nexport function formatValue(value, spec = {}) { return spec.unit; }\n';

    expect([...documentedMembers(bullets).keys()]).toEqual(['onPreview']);
    expect([...documentedMembers(inline).keys()]).toEqual(['type', 'unit']);
  });

  it('la prosa no documenta nombres (una celda con cuentas no es una lista)', () => {
    const prose = jsdoc(' *   - constructor(container, options) + setValue/getValue + onChange;\n');

    expect([...documentedMembers(prose).keys()]).toEqual([]);
  });

  it('el resultado no depende del final de linea (CRLF o LF)', () => {
    // Una version anterior de esta auditoria se callaba con CRLF (el `\r` dejaba
    // muda la linea); ahora el detector es agnostico, y esto lo fija.
    const crlf = jsdoc(' *   size   px, default 64.\n').replace(/\n/g, '\r\n');

    expect([...documentedMembers(crlf).keys()]).toEqual(['size']);
    expect([...documentedMembers(normaliseEol(crlf)).keys()]).toEqual(['size']);
  });

  it('caza la clave de entrada registrada y no leída', () => {
    const source = 'function normalizeEntry(entry) {\n    return { label: entry?.label, disabled: Boolean(entry?.disabled) };\n}\n\nexport class C {\n    render() { return this.entries.map((entry) => entry.label); }\n}\n';

    expect(entryShapeKeys(source)).toEqual(['label', 'disabled']);
    expect(entryKeyIsRead(source, 'label')).toBe(true);
    expect(unreadEntryKeys(source)).toEqual(['disabled']);
  });

  it('exige que los ficheros con objeto de opciones dejen miembros parseables', () => {
    const blind = '/**\n * @param {object} options\n *   - sin lista: prosa y ya\n */\nexport class C {}\n';

    expect(documentsOptionsObject(blind)).toBe(true);
    expect(documentedMembers(blind).size).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 4: los defaults
 * ------------------------------------------------------------------------- */

describe('auto-tests de los defaults', () => {
  it('caza un default del código que contradice al documentado', () => {
    const text = '/**\n * @param {object} options\n *   frameWidth  px per frame, default 76.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.frameWidth = options.frameWidth || 75;\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual(['frameWidth=75']);
  });

  it('no se cree el default por estar documentado en otra línea que ya no aplica', () => {
    const text = '/**\n * @param {object} options\n *   digits  characters shown, default 3.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.digits = options.digits ?? 4;\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual(['digits=4']);
  });

  it('acepta los brazos de un ternario cuando la lista documenta el grupo', () => {
    const text = '/**\n * @param {object} options\n *   min / max  raw range, default -8192..8191 (pitch) or 0..127 (mod).\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.min = options.min !== undefined ? options.min : (this.isPitch ? -8192 : 0);\n    this.max = options.max !== undefined ? options.max : (this.isPitch ? 8191 : 127);\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual([]);
  });

  it('acepta el default documentado en forma de intervalo', () => {
    const text = '/**\n * @param {object} options\n *   value  initial normalised 0..1.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.value = options.value ?? 0;\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual([]);
  });

  it('no juzga un default calculado (constante o aritmética)', () => {
    const text = '/**\n * @param {object} options\n *   frameHeight  px per frame, default 76.\n */\nconst FRAME_HEIGHT = 76;\n\nexport class C {\n  constructor(container, options = {}) {\n    this.frameHeight = options.frameHeight || FRAME_HEIGHT;\n    this.initialFrame = options.initialFrame ?? Math.floor((this.frames - 1) / 2);\n    this.onChange = options.onChange || (() => {});\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual([]);
  });

  it('no exige documentar la cadena vacía ni null', () => {
    const text = '/**\n * @param {object} options\n *   label  texto opcional.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.options = { label: options.label ?? \'\', onChange: options.onChange ?? null };\n  }\n}\n';

    expect(undocumentedDefaults(text)).toEqual([]);
  });

  it('lee el default del destructuring, en la firma y en el cuerpo', () => {
    const signature = '/**\n * @param {object} p\n * @param {number} [p.minScale=0.25] lower clamp.\n */\nexport function computeFit({ minScale = 0.25 }) { return minScale; }\n';
    const body = '/**\n * @param {object} options\n *   lines  lineas de la pantalla, default 2.\n */\nexport function panel(container, options = {}) {\n  const { lines = 9 } = options;\n  return lines;\n}\n';

    expect(undocumentedDefaults(signature)).toEqual([]);
    expect(undocumentedDefaults(body)).toEqual(['lines=9']);
  });

  it('lee los literales de un default que es objeto literal', () => {
    const good = '/**\n * @param {object} options\n *   repeat  hold-repeat: { initial: 400, interval: 120 }.\n */\nexport function panel(container, options = {}) {\n  const { repeat = { initial: 400, interval: 120 } } = options;\n  return repeat;\n}\n';
    const bad = '/**\n * @param {object} options\n *   repeat  hold-repeat del D-pad.\n */\nexport function panel(container, options = {}) {\n  const { repeat = { initial: 500, interval: 90 } } = options;\n  return repeat;\n}\n';

    expect(undocumentedDefaults(good)).toEqual([]);
    expect(undocumentedDefaults(bad)).toEqual(['repeat=500', 'repeat=90']);
  });

  it('el resultado no depende del final de línea', () => {
    const text = '/**\n * @param {object} options\n *   digits  characters shown, default 3.\n */\nexport class C {\n  constructor(container, options = {}) {\n    this.digits = options.digits ?? 4;\n  }\n}\n';

    expect(undocumentedDefaults(text.replace(/\n/g, '\r\n'))).toEqual(['digits=4']);
  });

  it('promete el default de un miembro documentado solo en el tipo inline', () => {
    const text = '/**\n * @param {number} value\n * @param {{ decimals?: number }} spec (default 2)\n */\nexport function formatValue(value, spec = {}) {\n  return (spec.decimals ?? 2).toFixed(2);\n}\n';
    const drifted = text.replace('?? 2', '?? 4');

    expect(undocumentedDefaults(text)).toEqual([]);
    expect(undocumentedDefaults(drifted)).toEqual(['decimals=4']);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 5: las opciones guardadas
 * ------------------------------------------------------------------------- */

describe('auto-tests de las opciones guardadas', () => {
  const doc = (options) => `/**\n * @param {object} options\n${options} */\n`;

  it('caza la opción que solo vive dentro del objeto de opciones', () => {
    const text = `${doc(' *   step  keyboard step, default 1.\n *   size  px, default 64.\n')}export class C {\n  constructor(container, options = {}) {\n    this.options = {\n      step: options.step ?? 1,\n      size: options.size ?? 64,\n    };\n    this.size = this.options.size;\n  }\n}\n`;

    expect(inertOptions(text)).toEqual(['step']);
  });

  it('da por usada la opción que se guarda en un campo y luego se lee', () => {
    const text = `${doc(' *   frameWidth  px per frame, default 18.\n *   step        keyboard step, default 1.\n')}export class C {\n  constructor(container, options = {}) {\n    this.frameWidth = options.frameWidth || 18;\n    this.step = options.step ?? 1;\n    this.sprite.style.width = \`\${this.frameWidth}px\`;\n  }\n}\n`;

    expect(inertOptions(text)).toEqual(['step']);
  });

  it('no confunde un campo derivado con el hueco de la opción', () => {
    const text = `${doc(' *   frames  posiciones del sprite, default 12.\n')}export class C {\n  constructor(container, options = {}) {\n    this.options = {\n      frames: options.frames ?? 12,\n    };\n  }\n\n  snapshot() {\n    return {\n      totalFrames: this.options.frames,\n    };\n  }\n}\n`;

    expect(inertOptions(text)).toEqual([]);
  });

  it('no confunde con muerte una lectura que se consume tal cual', () => {
    const text = `${doc(' *   screen  opciones extra para la pantalla.\n')}export function panel(container, options = {}) {\n  return makeThing({ ...options.screen });\n}\n`;

    expect(inertOptions(text)).toEqual([]);
  });

  it('no juzga una copia que pasa por una función', () => {
    const text = `${doc(' *   value  posición normalizada 0..1.\n')}export class C {\n  constructor(container, options = {}) {\n    this.value = clamp01(options.value ?? 0);\n    this.slider.value = this.value;\n  }\n}\n`;

    expect(inertOptions(text)).toEqual([]);
  });

  it('caza el binding del destructuring que nadie usa', () => {
    const dead = `${doc(' *   lines  filas de la pantalla, default 2.\n')}export function panel(container, options = {}) {\n  const { lines = 2 } = options;\n  return 0;\n}\n`;
    const alive = dead.replace('return 0;', 'return lines;');

    expect(inertOptions(dead)).toEqual(['lines']);
    expect(inertOptions(alive)).toEqual([]);
  });

  it('el resultado no depende del final de línea', () => {
    const text = `${doc(' *   step  keyboard step, default 1.\n')}export class C {\n  constructor(container, options = {}) {\n    this.options = {\n      step: options.step ?? 1,\n    };\n  }\n}\n`;

    expect(inertOptions(text.replace(/\n/g, '\r\n'))).toEqual(['step']);
  });
});
/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 6: los ejemplos de uso
 * ------------------------------------------------------------------------- */

describe('auto-tests de los ejemplos de uso', () => {
  const knob = "/**\n * @param {object} options\n *   skin      skin name, default 'vector'.\n *   value     normalised 0..1, default 0.\n *   onChange  fires on user edits.\n */\nexport class Knob {\n  constructor(container, options = {}) {\n    this.skin = options.skin || 'vector';\n    this.value = options.value ?? 0;\n    this.onChange = options.onChange || null;\n  }\n}\n";
  const barrel = "/**\n * Usage:\n *   new Knob(el, { skin: 'ms2000', value: 0.5, onChange });\n */\n";
  const modules = [
    { label: 'knob.js', source: knob },
    { label: 'index.js', source: barrel },
  ];
  const keysOf = (text) => constructedWith(text)[0].keys;

  it('lee las claves del objeto de opciones de un ejemplo de una linea', () => {
    const text = "/**\n * Usage:\n *   new Knob(el, { skin: 'ms2000', value: 0.5 });\n */\n";

    expect(keysOf(text)).toEqual(['skin', 'value']);
  });

  it('reconoce las claves abreviadas (`{ onChange, onDragEnd }`)', () => {
    const text = "/**\n * Usage:\n *   new Pad(el, { x: 0.5, onChange, onDragEnd });\n */\n";

    expect(keysOf(text)).toEqual(['x', 'onChange', 'onDragEnd']);
  });

  it('no se traga el resto de la entrada cuando el valor lleva comentario de linea', () => {
    const text = "/**\n * Usage:\n *   new W(container, {\n *     type: 'pitch',   // 'pitch' | 'mod'\n *     frames: 101,\n *   });\n */\n";

    expect(keysOf(text)).toEqual(['type', 'frames']);
  });

  it('aguanta un valor que es una union de literales', () => {
    const text = "/**\n * Usage:\n *   new T(c, { variant: 'buttons' | 'select', onChange: (id) => {} });\n */\n";

    expect(keysOf(text)).toEqual(['variant', 'onChange']);
  });

  it('no confunde las claves de un objeto anidado con opciones', () => {
    const text = "/**\n * Usage:\n *   new T(c, { themes: [{ id: 'dark', label: 'Dark' }], root: el });\n */\n";

    expect(keysOf(text)).toEqual(['themes', 'root']);
  });

  it('no se rompe con una coma ni una llave dentro de una cadena', () => {
    const text = "/**\n * Usage:\n *   new C(el, { label: 'a, b } c', step: 1 });\n */\n";

    expect(keysOf(text)).toEqual(['label', 'step']);
  });

  it('un `new` sin objeto de opciones no inventa claves', () => {
    const text = "/**\n * Usage:\n *   new Knob(el);\n */\n";

    expect(keysOf(text)).toEqual([]);
  });

  it('un ejemplo que solo importa no da claves', () => {
    const text = "/**\n * Usage: import { WAVE_ICONS } from '@abdsynths/shared/components';\n */\n";

    expect(constructedWith(text)).toEqual([]);
  });

  it('audita las opciones del receptor encadenado `new X(el, {...}).m(...)`', () => {
    // El escaneo corta los parentesis del `new` ANTES del `.m()`: el encadenado no
    // oculta el objeto de opciones. Esto ya funcionaba asi; el test lo fija para que
    // un refactor del detector no lo rompa en silencio.
    const chained = "/**\n * Usage:\n *   new Knob(el, { skin: 'ms2000', zzzGhost: 1 }).setValue(0.5);\n */\n";
    const bound = "/**\n * Usage:\n *   const k = new Knob(el, { skin: 'ms2000', zzzGhost: 1 });\n */\n";

    expect(constructedWith(chained)[0].keys).toEqual(['skin', 'zzzGhost']);
    expect(staleUsageOptions(chained, modules)).toEqual(['Knob.zzzGhost']);
    expect(staleUsageOptions(bound, modules)).toEqual(['Knob.zzzGhost']);
  });

  it('la regla 6 lee el objeto de opciones que vive tras un envoltorio transparente', () => {
    // El objeto vive DETRAS de un envoltorio (`wrap({ ... })`), pero sigue siendo el
    // argumento de opciones que el ejemplo promete: la regla 6 mira a traves de un
    // envoltorio cuyo UNICO argumento es un objeto literal, atado o encadenado.
    const chained = "/**\n * Usage:\n *   new Knob(el, wrap({ skin: 'ms2000' })).setValue(0.5);\n */\n";
    const bound = "/**\n * Usage:\n *   const k = new Knob(el, withDefaults({ skin: 'ms2000' }));\n */\n";

    expect(constructedWith(chained)[0].keys).toEqual(['skin']);
    expect(constructedWith(bound)[0].keys).toEqual(['skin']);
    expect(staleUsageOptions(chained, modules)).toEqual([]);
  });

  it('una clave fantasma tras el envoltorio la caza la regla 6', () => {
    const wrapped = "/**\n * Usage:\n *   new Knob(el, wrap({ skin: 'ms2000', zzzGhost: 1 })).setValue(0.5);\n */\n";

    expect(staleUsageOptions(wrapped, modules)).toEqual(['Knob.zzzGhost']);
  });

  it('un envoltorio que el audit no puede leer se calla (antes mudo que un falso positivo)', () => {
    // Mas de un argumento (`merge(base, { ... })`) o un argumento por variable: el audit
    // no sabe si ese envoltorio pasa las claves tal cual, asi que no juzga.
    const twoArgs = "/**\n * Usage:\n *   new Knob(el, merge(base, { skin: 'ms2000' })).setValue(0.5);\n */\n";
    const byVariable = "/**\n * Usage:\n *   new Knob(el, wrap(opts)).setValue(0.5);\n */\n";

    expect(constructedWith(twoArgs)[0].keys).toEqual([]);
    expect(constructedWith(byVariable)[0].keys).toEqual([]);
    expect(staleUsageOptions(twoArgs, modules)).toEqual([]);
    expect(staleUsageOptions(byVariable, modules)).toEqual([]);
  });

  it('resuelve la clase construida en OTRO módulo (index.js -> knob.js)', () => {
    expect(moduleExporting('Knob', modules)?.label).toBe('knob.js');
    expect(moduleExporting('Nope', modules)).toBeUndefined();
  });

  it('caza la clave del ejemplo que el código ya no lee', () => {
    const text = "/**\n * Usage:\n *   new Knob(el, { skin: 'ms2000', knobSize: 64 });\n */\n";

    expect(staleUsageOptions(text, modules)).toEqual(['Knob.knobSize']);
  });

  it('deja pasar el ejemplo cuyas claves el código sí lee (cross-module)', () => {
    expect(staleUsageOptions(barrel, modules)).toEqual([]);
  });

  it('audita tambien la construcción de ejemplo de la prosa, no solo el `Usage:`', () => {
    const text = "/**\n *   new Knob(el, { skin: 'junio', knobSize: 64 })\n */\nexport class Other {}\n";

    expect(usageBlocks(text)).toEqual([]);
    expect(staleUsageOptions(text, modules)).toEqual(['Knob.knobSize']);
  });

  it('el resultado no depende del final de línea', () => {
    const text = "/**\n * Usage:\n *   new Knob(el, { knobSize: 64 });\n */\n";

    expect(staleUsageOptions(text.replace(/\n/g, '\r\n'), modules)).toEqual(['Knob.knobSize']);
  });
});
/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 7: los valores enumerados
 * ------------------------------------------------------------------------- */

describe('auto-tests de los valores enumerados', () => {
  const moduleWith = (name, options, body) =>
    `/**\n * @param {object} options\n${options} */\nexport class ${name} {\n  constructor(container, options = {}) {\n${body}  }\n}\n`;
  const TYPE = " *   type   'pitch' | 'mod', default 'mod'.\n";

  it('caza la rama del código que la lista documentada no enumera', () => {
    const text = moduleWith('C', TYPE,
      "    this.type = options.type || 'mod';\n    this.springs = this.type === 'pitch';\n    this.bipolar = this.type === 'bipolar';\n");

    expect([...enumeratedValues(text).get('type')]).toEqual(['pitch', 'mod']);
    expect(offListValues(text)).toEqual(['type=bipolar']);
  });

  it('no atribuye a un nombre las cadenas de una línea de continuación', () => {
    const text = "/**\n * LcdItem: { type? } con\n *   type: 'parameter' | 'cc' | 'action'\n *\n * @param {{ type?: string }} spec\n */\nexport function formatValue(value, spec = {}) {\n  if (spec.type === 'bool') return 1;\n\n  return 0;\n}\n";

    expect(enumeratedValues(text).size).toBe(0);
    expect(offListValues(text)).toEqual([]);
  });

  it('no juzga un miembro que solo documenta su default', () => {
    const text = moduleWith('C', " *   skin   nombre del skin, default 'vector'.\n",
      "    this.skin = options.skin;\n    this.otro = this.skin === 'ms2000';\n");

    expect(enumeratedValues(text).size).toBe(0);
    expect(offListValues(text)).toEqual([]);
  });

  it('no juzga un rango ni un escalar como si fueran una lista', () => {
    const text = moduleWith('C',
      " *   value   normalised 0..1, default 0.\n *   momentary   si true, default false.\n",
      "    this.value = options.value ?? 0;\n    this.half = this.value === 'half';\n    this.moment = options.momentary === 'flash';\n");

    expect(enumeratedValues(text).size).toBe(0);
    expect(offListValues(text)).toEqual([]);
  });

  it('caza la rama de un campo donde se copió la opción', () => {
    const text = moduleWith('C', TYPE,
      "    this.mode = options.type || 'mod';\n    if (this.mode === 'bipolar') this.value = 1;\n");

    expect(offListValues(text)).toEqual(['type=bipolar']);
  });

  it('caza la rama de un binding del destructuring', () => {
    const text = "/**\n * @param {object} options\n *   type   'pitch' | 'mod', default 'mod'.\n */\nexport class C {\n  constructor(container, { type = 'mod' } = {}) {\n    this.bipolar = type === 'bipolar';\n  }\n}\n";

    expect(offListValues(text)).toEqual(['type=bipolar']);
  });

  it('no confunde el campo de otro objeto con la opción', () => {
    const text = moduleWith('C', TYPE,
      "    this.type = options.type || 'mod';\n    this.escape = event.key === 'Escape';\n    this.action = item.type === 'action';\n");

    expect(offListValues(text)).toEqual([]);
  });

  it('caza el valor de un ejemplo que la lista no enumera', () => {
    const modules = [
      {
        label: 'wheel.js',
        source: moduleWith('Wheel', TYPE, "    this.type = options.type || 'mod';\n"),
      },
      { label: 'index.js', source: "/**\n * Usage:\n *   new Wheel(el, { type: 'bipolar' });\n */\n" },
    ];

    expect(offListValues(modules[0].source, modules)).toEqual([]);
    expect(offListValues(modules[1].source, modules)).toEqual(['Wheel.type=bipolar']);
  });

  it('no juzga el valor de un ejemplo de una opción sin lista', () => {
    const modules = [
      {
        label: 'knob.js',
        source: moduleWith('Knob', " *   skin   nombre del skin, default 'vector'.\n",
          "    this.skin = options.skin;\n"),
      },
      { label: 'index.js', source: "/**\n * Usage:\n *   new Knob(el, { skin: 'ms2000' });\n */\n" },
    ];

    expect(offListValues(modules[1].source, modules)).toEqual([]);
  });

  it('una unión escrita como valor del ejemplo no es un valor', () => {
    const modules = [
      {
        label: 'switcher.js',
        source: moduleWith('Switcher', " *   variant   'buttons' | 'select', default 'buttons'.\n",
          "    this.variant = options.variant || 'buttons';\n"),
      },
      {
        label: 'index.js',
        source: "/**\n * Usage:\n *   new Switcher(el, { variant: 'buttons' | 'select' });\n */\n",
      },
    ];

    expect(offListValues(modules[1].source, modules)).toEqual([]);
  });

  it('el resultado no depende del final de línea', () => {
    const text = moduleWith('C', TYPE,
      "    this.type = options.type || 'mod';\n    this.bipolar = this.type === 'bipolar';\n");

    expect(offListValues(text.replace(/\n/g, '\r\n'))).toEqual(['type=bipolar']);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 8: los metodos de los ejemplos
 * ------------------------------------------------------------------------- */

describe('auto-tests de los métodos de los ejemplos', () => {
  const moduleWith = (name, members, usage) =>
    `/**\n * Usage:\n${usage} */\nexport class ${name} {\n  constructor(container, options = {}) {\n    this.options = options;\n  }\n\n${members}}\n`;
  const asModules = (label, source) => [{ label, source }];
  const PAD = '  setValue(v) {\n    this.value = v;\n  }\n';
  const BINDS = ' *   const pad = new Pad(el, { x: 0.5 });\n';

  it('caza el método que el ejemplo llama y la clase no declara', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   pad.setValue(0.2);\n *   pad.setCorners(['a', '', 'b', '']);\n`);

    expect(exampleMethodCalls(text).map(({ method }) => method)).toEqual(['setValue', 'setCorners']);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('no juzga la llamada de un receptor que el bloque no construye', () => {
    const text = moduleWith('Pad', PAD, ' *   pad.setCorners([1]);\n');

    expect(exampleMethodCalls(text)).toEqual([]);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no cuenta como miembro una llamada dentro de un cuerpo', () => {
    const text = moduleWith('Pad', `  reset() {\n    destroy();\n  }\n${PAD}`,
      `${BINDS} *   pad.destroy();\n`);

    expect([...classMembers(text, 'Pad')].sort()).toEqual(['constructor', 'reset', 'setValue']);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.destroy()']);
  });

  it('reconoce un método declarado con espacio antes del paréntesis', () => {
    const text = moduleWith('Pad', "  setCorners (corners)\n  {\n    this.corners = corners;\n  }\n",
      `${BINDS} *   pad.setCorners(['a', '', 'b', '']);\n`);

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('reconoce un método guardado en un campo como función', () => {
    const text = moduleWith('Pad', '  destroy = () => {\n    this.el = null;\n  };\n',
      `${BINDS} *   pad.destroy();\n`);

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('juzga también el método que el ejemplo muestra comentado', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   // pad.setCorners([1]);\n`);

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('resuelve la clase al módulo que la exporta, no al del ejemplo', () => {
    const modules = [
      { label: 'pad.js', source: moduleWith('Pad', PAD, '') },
      { label: 'index.js', source: `/**\n * Usage:\n${BINDS} *   pad.setCorners([1]);\n */\n` },
    ];

    expect(missingExampleMethods(modules[1].source, modules)).toEqual(['Pad.setCorners()']);
  });

  it('no juzga una clase que ningún módulo auditado exporta', () => {
    const text = '/**\n * Usage:\n *   const x = new Unknown(el);\n *   x.missing();\n */\n';

    expect(missingExampleMethods(text, [])).toEqual([]);
  });

  it('el resultado no depende del final de línea', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setCorners([1]);\n`).replace(/\n/g, '\r\n');

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('sigue el receptor encadenado `new Pad(el).m(...)`', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el).setCorners([1]);\n');

    expect(exampleMethodCalls(text).map(({ method, variable }) => `${method}:${variable}`))
      .toEqual(['setCorners:null']);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('no falsea el encadenado cuyo método sí está declarado', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el).setValue(0.2);\n');

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('sigue el receptor alias `const pad2 = pad;`', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   const pad2 = pad;\n *   pad2.setCorners(['a']);\n`);

    expect(exampleMethodCalls(text).map(({ method, variable }) => `${method}:${variable}`))
      .toEqual(['setCorners:pad2']);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('no falsea el alias cuyo método sí está declarado', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   const pad2 = pad;\n *   pad2.setValue(0.2);\n`);

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('sigue también el encadenado opcional `new Pad(el)?.m(...)`', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el)?.setValue(0.2);\n');

    expect(exampleMethodCalls(text).map(({ method, args }) => `${method}(${args})`))
      .toEqual(['setValue(0.2)']);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual([]);
  });

  it('cae el método fantasma del encadenado opcional', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el)?.zzzGhost();\n');

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.zzzGhost()']);
  });

  it('sigue la API que devuelve una FÁBRICA `const f = createPad(el)`', () => {
    // El receptor ya no tiene que nacer de un `new`: una factory que devuelve un
    // objeto con metodos se juzga igual, resolviendo la API que retorna.
    const factory = 'export function createPad(container) {\n'
      + '  const reset = () => { this.v = 0; };\n\n'
      + '  return {\n'
      + '    /**\n * @param {number} v\n */\n    setValue(v) { this.v = v; },\n'
      + '    reset,\n'
      + '  };\n}\n';
    const usage = (call) => `/**\n * Usage:\n *   const f = createPad(el);\n *   f.${call};\n */\n${factory}`;

    expect(exampleMethodCalls(usage('setValue(0.2)')).map(({ method, className }) => `${className}.${method}`))
      .toEqual(['createPad.setValue']);
    expect(missingExampleMethods(usage('zzzGhost()'), asModules('pad.js', factory)))
      .toEqual(['createPad.zzzGhost()']);
    expect(missingExampleMethods(usage('setValue(0.2)'), asModules('pad.js', factory))).toEqual([]);
  });

  it('no sigue un alias reasignado a otro objeto en el mismo bloque', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   const pad2 = pad;\n *   pad2 = other;\n *   pad2.setCorners(['a']);\n`);

    expect(exampleMethodCalls(text)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 9: la aridad de esas llamadas
 * ------------------------------------------------------------------------- */

describe('auto-tests de la aridad de las llamadas', () => {
  const moduleWith = (name, members, usage) =>
    `/**\n * Usage:\n${usage} */\nexport class ${name} {\n  constructor(container, options = {}) {\n    this.options = options;\n  }\n\n${members}}\n`;
  const asModules = (label, source) => [{ label, source }];
  const PAD = '  setValue(v, notify = true) {\n    this.value = v;\n  }\n';
  const BINDS = ' *   const pad = new Pad(el, { x: 0.5 });\n';
  const short = 'Pad.setValue(): recibe 0, la firma acepta 1..2';
  const classWith = (name, body, usage) =>
    `/**\n * Usage:\n${usage} */\nexport class ${name} {\n  ${body}}\n`;
  const CONTAINER_ONLY = 'constructor(container, options) {\n    this.options = options;\n  }\n';

  it('caza la llamada con menos argumentos que la firma exige', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setValue();\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([short]);
  });

  it('caza la llamada con más argumentos de los que la firma declara', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setValue(0.2, true, 'extra');\n`);

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): recibe 3, la firma acepta 1..2']);
  });

  it('acepta los argumentos que la firma cubre, obligatorio u opcional', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   pad.setValue(0.2);\n *   pad.setValue(0.2, false);\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no cuenta los argumentos anidados del objeto que pasa el ejemplo', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setValue({ x: 0.2, y: 0.8 });\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('un parámetro desestructurado sin default sigue siendo obligatorio', () => {
    const text = moduleWith('Pad', '  setCorners({ tl, br }) {\n    this.corners = [tl, br];\n  }\n',
      `${BINDS} *   pad.setCorners();\n`);

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['Pad.setCorners(): recibe 0, la firma acepta 1']);
  });

  it('un parámetro con default anidado no se confunde con el default del parámetro', () => {
    const text = moduleWith('Pad', '  setValue({ x = 0.5, y = 0.5 } = {}) {\n    this.value = [x, y];\n  }\n',
      `${BINDS} *   pad.setValue();\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('un rest no pone techo de argumentos', () => {
    const text = moduleWith('Pad', '  setValue(v, ...rest) {\n    this.value = v;\n  }\n',
      `${BINDS} *   pad.setValue(0.2, 1, 2, 3);\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('caza el argumento que una firma sin parámetros no acepta', () => {
    const text = moduleWith('Pad', '  destroy() {\n    this.el = null;\n  }\n',
      `${BINDS} *   pad.destroy(1);\n`);

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['Pad.destroy(): recibe 1, la firma acepta 0']);
  });

  it('lee la firma de un método guardado en un campo como función', () => {
    const text = moduleWith('Pad', '  setValue = (v, notify = true) => {\n    this.value = v;\n  };\n',
      `${BINDS} *   pad.setValue();\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([short]);
  });

  it('juzga también la llamada que el ejemplo trae comentada', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   // pad.setValue();\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([short]);
  });

  it('resuelve la firma en el módulo que declara la clase, no en el del ejemplo', () => {
    const modules = [
      { label: 'pad.js', source: moduleWith('Pad', PAD, '') },
      { label: 'index.js', source: `/**\n * Usage:\n${BINDS} *   pad.setValue();\n */\n` },
    ];

    expect(arityMismatches(modules[1].source, modules)).toEqual([short]);
  });

  it('no juzga un método que la clase no declara: ese es de la regla 8', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setCorners();\n`);

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.setCorners()']);
  });

  it('caza el `new` con menos argumentos que el constructor exige', () => {
    const text = classWith('Pad', CONTAINER_ONLY, ' *   new Pad(el);\n');

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['new Pad(): recibe 1, la firma acepta 2']);
  });

  it('caza el `new` con más argumentos de los que el constructor declara', () => {
    const text = classWith('Pad', 'constructor(container, options = {}) {\n    this.options = options;\n  }\n',
      ' *   new Pad(el, { x: 0.5 }, extra);\n');

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['new Pad(): recibe 3, la firma acepta 1..2']);
  });

  it('acepta el `new` que cubre los obligatorios del constructor', () => {
    const text = classWith('Pad', CONTAINER_ONLY, ' *   new Pad(el, { x: 0.5 });\n');

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('resuelve la firma del constructor en el módulo que exporta la clase', () => {
    const modules = [
      { label: 'pad.js', source: classWith('Pad', CONTAINER_ONLY, '') },
      { label: 'index.js', source: '/**\n * Usage:\n *   new Pad(el);\n */\n' },
    ];

    expect(arityMismatches(modules[1].source, modules))
      .toEqual(['new Pad(): recibe 1, la firma acepta 2']);
  });

  it('no juzga el `new` de una clase que ningún módulo auditado exporta', () => {
    const text = '/**\n * Usage:\n *   new Unknown(el, { a: 1 }, extra);\n */\n';

    expect(arityMismatches(text, [])).toEqual([]);
  });

  it('la aridad del constructor no depende del final de línea', () => {
    const text = classWith('Pad', CONTAINER_ONLY, ' *   new Pad(el);\n').replace(/\n/g, '\r\n');

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['new Pad(): recibe 1, la firma acepta 2']);
  });

  it('el resultado no depende del final de línea', () => {
    const text = moduleWith('Pad', PAD, `${BINDS} *   pad.setValue();\n`).replace(/\n/g, '\r\n');

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([short]);
  });

  it('sigue la aridad del receptor encadenado `new Pad(el).m(...)`', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el).setValue(0.2, true, 1);\n');

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): recibe 3, la firma acepta 1..2']);
  });

  it('no falsea el encadenado con la aridad correcta', () => {
    const text = moduleWith('Pad', PAD, ' *   new Pad(el).setValue(0.2);\n');

    expect(arityMismatches(text, asModules('pad.js', text))).toEqual([]);
  });

  it('mide la aridad a traves del alias `const pad2 = pad;`', () => {
    const text = moduleWith('Pad', PAD,
      `${BINDS} *   const pad2 = pad;\n *   pad2.setValue(0.2, true, 1);\n`);

    expect(arityMismatches(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): recibe 3, la firma acepta 1..2']);
  });

  it('mide la aridad de la API devuelta por una fábrica', () => {
    const factory = 'export function createPad(container) {\n'
      + '  return {\n    setValue(v, notify = true) { this.v = v; },\n  };\n}\n';
    const usage = (call) => `/**\n * Usage:\n *   const f = createPad(el);\n *   f.${call};\n */\n${factory}`;

    expect(arityMismatches(usage('setValue(0.2, true, 1)'), asModules('pad.js', factory)))
      .toEqual(['createPad.setValue(): recibe 3, la firma acepta 1..2']);
    expect(arityMismatches(usage('setValue(0.2)'), asModules('pad.js', factory))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 10: el tipo de los argumentos
 * ------------------------------------------------------------------------- */

describe('auto-tests de los tipos de los argumentos', () => {
  const asModules = (label, source) => [{ label, source }];
  const CONTAINER = ' * @param {HTMLElement|string} container\n';
  const OPTIONS = ' * @param {object} options\n';
  const documented = (doc, usage, members = '') =>
    `/**\n * Usage:\n${usage} */\n/**\n${doc} */\nexport class Pad {\n  constructor(container, options = {}) {\n    this.options = options;\n  }\n\n${members}}\n`;
  const METHOD = (doc, decl) => `  /**\n${doc} */\n  ${decl}\n`;
  const NUMBER_VALUE = METHOD(' * @param {number} value\n', 'setValue(value) {\n    this.value = value;\n  }');
  const BAD_OPTIONS = 'new Pad(): el argumento 2 es number y la firma promete object';

  it('caza un argumento de una familia que el tipo prometido no admite', () => {
    const text = documented(CONTAINER + OPTIONS, ' *   new Pad(el, 42);\n');

    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([BAD_OPTIONS]);
  });

  it('caza el objeto que la documentación promete como número', () => {
    const text = documented(CONTAINER + ' * @param {number} options\n', ' *   new Pad(el, { x: 0.5 });\n');

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['new Pad(): el argumento 2 es object y la firma promete number']);
  });

  it('acepta el argumento de la familia prometida', () => {
    const text = documented(CONTAINER + OPTIONS, ' *   new Pad(el, { x: 0.5 });\n');

    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('juzga también el argumento de un método con su propio JSDoc', () => {
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(\'alto\');\n', NUMBER_VALUE);

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el argumento 1 es string y la firma promete number']);
  });

  it('acepta la unión legible y caza lo que queda fuera de ella', () => {
    const doc = METHOD(' * @param {string|number} value\n', 'setValue(value) {\n    this.value = value;\n  }');
    const ok = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(0.2);\n', doc);
    const bad = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(true);\n', doc);

    expect(mistypedExampleArguments(ok, asModules('pad.js', ok))).toEqual([]);
    expect(mistypedExampleArguments(bad, asModules('pad.js', bad)))
      .toEqual(['Pad.setValue(): el argumento 1 es boolean y la firma promete string|number']);
  });

  it('no juzga un argumento que el texto no delata', () => {
    const text = documented(OPTIONS,
      ' *   const pad = new Pad(el);\n *   pad.setValue(el);\n *   pad.setValue(a.b);\n *   pad.setValue(f(1));\n',
      NUMBER_VALUE);

    expect(comparedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no juzga un tipo que la regla no sabe leer', () => {
    const doc = METHOD(' * @param {HTMLElement|string} value\n', 'setValue(value) {\n    this.value = value;\n  }');
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(42);\n', doc);

    expect(readableType('HTMLElement|string')).toBe(false);
    expect(readableType('{string|number}')).toBe(true);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('lee un objeto inline y lo cruza con el argumento (familia object)', () => {
    const doc = METHOD(' * @param {{ x: number, y: number }} value\n', 'setValue(value) {\n    this.x = value.x;\n  }');
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue({ x: 0.2, y: 0.8 });\n', doc);

    expect(readableType('{ x: number, y: number }')).toBe(true);
    expect(comparedExampleArguments(text, asModules('pad.js', text)))
      .toEqual([{ label: 'Pad.setValue()', param: 1, type: '{ x: number, y: number }', kind: 'object' }]);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('caza un argumento que no encaja con el objeto inline', () => {
    const doc = METHOD(' * @param {{ x: number, y: number }} value\n', 'setValue(value) {\n    this.x = value.x;\n  }');
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue("alto");\n', doc);

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el argumento 1 es string y la firma promete { x: number, y: number }']);
  });

  it('cruza los CAMPOS del objeto del ejemplo con el registro inline', () => {
    const doc = METHOD(' * @param {{ x: number, y: number }} value\n', 'setValue(value) {\n    this.x = value.x;\n  }');
    const text = (arg) => documented(OPTIONS, ` *   const pad = new Pad(el);\n *   pad.setValue(${arg});\n`, doc);

    expect(mistypedExampleArguments(text('{ x: 0.2, y: 0.8 }'), asModules('pad.js', text('x')))).toEqual([]);
    expect(mistypedExampleArguments(text("{ x: 'alto', y: 0.8 }"), asModules('pad.js', text('x'))))
      .toEqual(['Pad.setValue() (argumento 1): la clave x.x es string y la firma promete number']);
    expect(mistypedExampleArguments(text('{ x: 0.2, zzz: 1 }'), asModules('pad.js', text('x'))))
      .toEqual(['Pad.setValue() (argumento 1): la clave x.zzz no esta en la firma promete { x: number, y: number }']);
  });

  it('el campo opcional y el shorthand no cierran el cruce por campos', () => {
    const doc = METHOD(' * @param {{ x: number, y?: boolean }} value\n', 'setValue(value) {\n    this.x = value.x;\n  }');
    const text = (arg) => documented(OPTIONS, ` *   const pad = new Pad(el);\n *   pad.setValue(${arg});\n`, doc);

    // `y` es opcional: no escribirlo no ofende; escribirlo mal, si
    expect(mistypedExampleArguments(text('{ x: 1 }'), asModules('pad.js', text('x')))).toEqual([]);
    expect(mistypedExampleArguments(text("{ x: 1, y: 'no' }"), asModules('pad.js', text('x'))))
      .toEqual(['Pad.setValue() (argumento 1): la clave x.y es string y la firma promete boolean']);
    // el shorthand no dice nada del valor: no se juzga campo a campo
    expect(mistypedExampleArguments(text('{ x, y }'), asModules('pad.js', text('x')))).toEqual([]);
  });

  it('la guardia de firmas caza un método con argumentos sin `@param`', () => {
    const members = '  setValue(value) {\n    this.value = value;\n  }\n';
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(0.5);\n', members);

    expect(undocumentedExampleCalls(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el ejemplo le pasa 1 argumento(s) y la firma no documenta ningun @param obligatorio']);
  });

  it('la guardia de firmas no exige `@param` a una llamada sin argumentos', () => {
    const members = '  reset() {\n    this.value = 0;\n  }\n';
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.reset();\n', members);

    expect(undocumentedExampleCalls(text, asModules('pad.js', text))).toEqual([]);
  });

  it('la guardia de firmas no juzga un método sin declarar (eso es la regla 8)', () => {
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.nope(1);\n');

    expect(undocumentedExampleCalls(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no cuenta las claves del objeto de opciones como parámetros de la llamada', () => {
    const doc = CONTAINER + OPTIONS + ' * @param {number} [options.step]\n * @param {string} label\n';
    const text = documented(doc, ' *   new Pad(el, 42);\n');

    expect(documentedParamTypes(text, 'Pad', 'constructor'))
      .toEqual([{ type: 'HTMLElement|string' }, { type: 'object' }, { type: 'string' }]);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([BAD_OPTIONS]);
  });

  it('lee el tipo con su anidamiento, sin cortarlo en la primera llave', () => {
    const text = documented(' * @param {{ x?: number, y?: number }} extras\n', ' *   new Pad(el);\n');

    expect(docParamTypes(docBlocks(text)[1].text)).toEqual([
      { type: '{ x?: number, y?: number }', name: 'extras', option: false },
    ]);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('cruza por posición: cada argumento con el parámetro que le toca', () => {
    const doc = METHOD(' * @param {string} a\n * @param {number} b\n', 'setValue(a, b) {\n    this.a = a;\n  }');
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setValue(0.2, \'x\');\n', doc);

    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([
      'Pad.setValue(): el argumento 1 es number y la firma promete string',
      'Pad.setValue(): el argumento 2 es string y la firma promete number',
    ]);
  });

  it('no le presta a un método el JSDoc del miembro anterior', () => {
    const members = NUMBER_VALUE + '\n  reset(steps) {\n    this.value = steps;\n  }\n';
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.reset(\'x\');\n', members);

    expect(documentedParamTypes(text, 'Pad', 'reset')).toBeNull();
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('resuelve la documentación en el módulo que exporta la clase', () => {
    const modules = [
      { label: 'pad.js', source: documented(CONTAINER + OPTIONS, '') },
      { label: 'index.js', source: '/**\n * Usage:\n *   new Pad(el, 42);\n */\n' },
    ];

    expect(mistypedExampleArguments(modules[1].source, modules)).toEqual([BAD_OPTIONS]);
  });

  it('no juzga una clase que no existe ni un método que la clase no declara', () => {
    const unknown = '/**\n * Usage:\n *   new Unknown(el, 42);\n */\n';
    const text = documented(OPTIONS, ' *   const pad = new Pad(el);\n *   pad.setCorners(\'x\');\n');

    expect(mistypedExampleArguments(unknown, [])).toEqual([]);
    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([]);
  });

  it('el resultado no depende del final de línea', () => {
    const text = documented(CONTAINER + OPTIONS, ' *   new Pad(el, 42);\n').replace(/\n/g, '\r\n');

    expect(mistypedExampleArguments(text, asModules('pad.js', text))).toEqual([BAD_OPTIONS]);
  });

  it('juzga el argumento del receptor encadenado `new Pad(el).m(...)`', () => {
    const text = documented(OPTIONS, ' *   new Pad(el).setValue(\'alto\');\n', NUMBER_VALUE);

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el argumento 1 es string y la firma promete number']);
  });

  it('la guardia de firmas también mira el encadenado', () => {
    const members = '  setValue(value) {\n    this.value = value;\n  }\n';
    const text = documented(OPTIONS, ' *   new Pad(el).setValue(0.5);\n', members);

    expect(undocumentedExampleCalls(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el ejemplo le pasa 1 argumento(s) y la firma no documenta ningun @param obligatorio']);
  });

  it('la guardia de firmas también mira el encadenado opcional', () => {
    const members = '  setValue(value) {\n    this.value = value;\n  }\n';
    const text = documented(OPTIONS, ' *   new Pad(el)?.setValue(0.5);\n', members);

    expect(undocumentedExampleCalls(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el ejemplo le pasa 1 argumento(s) y la firma no documenta ningun @param obligatorio']);
  });

  it('juzga el argumento pasado por el alias `const pad2 = pad;`', () => {
    const text = documented(OPTIONS,
      ' *   const pad = new Pad(el);\n *   const pad2 = pad;\n *   pad2.setValue(\'alto\');\n',
      NUMBER_VALUE);

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el argumento 1 es string y la firma promete number']);
  });

  it('juzga el argumento contra el @param de la API devuelta por una fábrica', () => {
    const factory = 'export function createPad(container) {\n'
      + '  return {\n'
      + '    /**\n * @param {number} value\n */\n    setValue(value) { this.v = value; },\n'
      + '  };\n}\n';
    const usage = (call) => `/**\n * Usage:\n *   const f = createPad(el);\n *   f.${call};\n */\n${factory}`;

    expect(mistypedExampleArguments(usage("setValue('alto')"), asModules('pad.js', factory)))
      .toEqual(['createPad.setValue(): el argumento 1 es string y la firma promete number']);
    expect(mistypedExampleArguments(usage('setValue(0.2)'), asModules('pad.js', factory))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests de la regla 11: la forma de los accesos
 * ------------------------------------------------------------------------- */

describe('auto-tests de la forma de los accesos', () => {
  const asModules = (label, source) => [{ label, source }];
  const GETTER = '  get value() {\n    return this._value;\n  }\n';
  const SETTER = '  set value(v) {\n    this._value = v;\n  }\n';
  const METHOD = '  setValue(v) {\n    this._value = v;\n  }\n';
  const BINDS = ' *   const pad = new Pad(el);\n';
  const classWith = (members, usage) =>
    `/**\n * Usage:\n${BINDS}${usage} */\nexport class Pad {\n  constructor(container) {\n    this.el = container;\n  }\n\n${members}}\n`;
  const CALLED_GETTER = 'Pad.value: el ejemplo lo llama, la clase lo declara getter';

  it('caza el getter al que el ejemplo llama como método', () => {
    const text = classWith(GETTER, ' *   pad.value();\n');

    expect(exampleMemberAccesses(text).map(({ member, access }) => `${member}:${access}`)).toEqual(['value:call']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([CALLED_GETTER]);
  });

  it('caza el método que el ejemplo lee como propiedad', () => {
    const text = classWith(METHOD, ' *   pad.setValue;\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue: el ejemplo lo lee, la clase lo declara metodo']);
  });

  it('caza el getter que el ejemplo escribe', () => {
    const text = classWith(GETTER, ' *   pad.value = 0.5;\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.value: el ejemplo lo escribe, la clase lo declara getter']);
  });

  it('caza el setter al que el ejemplo llama', () => {
    const text = classWith(SETTER, ' *   pad.value(0.5);\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.value: el ejemplo lo llama, la clase lo declara setter']);
  });

  it('acepta el getter leído y el método llamado', () => {
    const text = classWith(GETTER + '\n' + METHOD, ' *   pad.value;\n *   pad.setValue(0.5);\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('acepta el accessor completo: se lee y se escribe', () => {
    const text = classWith(GETTER + '\n' + SETTER, ' *   pad.value;\n *   pad.value = 0.5;\n');

    expect([...memberDeclarations(text, 'Pad').get('value').forms]).toEqual(['get', 'set']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('acepta el campo leído y escrito', () => {
    const text = classWith('  corners = null;\n', ' *   pad.corners;\n *   pad.corners = [1];\n');

    expect([...memberDeclarations(text, 'Pad').get('corners').forms]).toEqual(['field']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no confunde `getValue()` con un getter', () => {
    const text = classWith('  getValue() {\n    return this._value;\n  }\n', ' *   pad.getValue();\n');

    expect([...memberDeclarations(text, 'Pad').get('getValue').forms]).toEqual(['method']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('distingue la escritura de una comparación', () => {
    const text = classWith(GETTER, ' *   if (pad.value == 0.5) return;\n');

    expect(exampleMemberAccesses(text).map(({ access }) => access)).toEqual(['read']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no juzga los miembros que la clase no declara', () => {
    const text = classWith(METHOD, ' *   pad.corners = [1];\n *   pad.options.x;\n');

    expect(exampleMemberAccesses(text).map(({ member, access }) => `${member}:${access}`))
      .toEqual(['corners:write', 'options:read']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('no juzga un acceso de un receptor que el bloque no construye', () => {
    const text = classWith(GETTER, ' *   other.value();\n');

    expect(exampleMemberAccesses(text)).toEqual([]);
  });

  it('sigue el receptor encadenado `new Pad(el).setValue(...)`', () => {
    const text = `/**\n * Usage:\n *   new Pad(el).setValue(0.5);\n */\nexport class Pad {\n${METHOD}}\n`;

    expect(exampleMemberAccesses(text).map(({ className, variable, member, access }) => [className, variable, member, access]))
      .toEqual([['Pad', null, 'setValue', 'call']]);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });

  it('caza el getter al que el encadenado llama como método', () => {
    const text = `/**\n * Usage:\n *   new Pad(el).value();\n */\nexport class Pad {\n${GETTER}}\n`;

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([CALLED_GETTER]);
  });

  it('lee la forma del encadenado sin binding (escritura de un getter)', () => {
    const text = `/**\n * Usage:\n *   new Pad(el).value = 0.5;\n */\nexport class Pad {\n${GETTER}}\n`;

    expect(exampleMemberAccesses(text).map(({ member, access }) => `${member}:${access}`)).toEqual(['value:write']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.value: el ejemplo lo escribe, la clase lo declara getter']);
  });

  it('resuelve la forma en el módulo que declara la clase, no en el del ejemplo', () => {
    const modules = [
      { label: 'pad.js', source: classWith(GETTER, '') },
      { label: 'index.js', source: `/**\n * Usage:\n${BINDS} *   pad.value();\n */\n` },
    ];

    expect(mismatchedExampleAccesses(modules[1].source, modules)).toEqual([CALLED_GETTER]);
  });

  it('el resultado no depende del final de línea', () => {
    const text = classWith(GETTER, ' *   pad.value();\n').replace(/\n/g, '\r\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([CALLED_GETTER]);
  });

  it('lee del texto los miembros encadenados (y no los inventa)', () => {
    const text = ' *   new Pad(el).setValue(0.5);\n'
      + ' *   new Pad(el, fn(x)).destroy();\n'
      + ' *   pad.setCorners([1]);\n';

    expect(textChainedMembers(text)).toEqual(['setValue', 'destroy']);
    expect(textChainedMembers(' *   pad.setValue(0.5);\n')).toEqual([]);
  });

  it('equilibra el anidado profundo y el parentesis dentro de una cadena', () => {
    const deep = ' *   new Pad(el, fn(x, g(y))).destroy();\n';
    const quoted = " *   new Pad(el, ')').setValue(0.1);\n";
    const inString = " *   new Pad(el, f('(')).destroy();\n";
    const unclosed = ' *   new Pad(el, fn(x)\n';

    expect(textChainedMembers(deep)).toEqual(['destroy']);
    expect(textChainedMembers(quoted)).toEqual(['setValue']);
    expect(textChainedMembers(inString)).toEqual(['destroy']);
    expect(textChainedMembers(unclosed)).toEqual([]);
  });

  it('sigue los accesos del alias `const pad2 = pad;`', () => {
    const text = classWith(GETTER, ' *   const pad2 = pad;\n *   pad2.value();\n');

    expect(exampleMemberAccesses(text).map(({ variable, member, access }) => `${variable}.${member}:${access}`))
      .toEqual(['pad2.value:call']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([CALLED_GETTER]);
  });

  it('sigue el encadenado opcional `new Pad(el)?.value()`', () => {
    const text = `/**\n * Usage:\n *   new Pad(el)?.value();\n */\nexport class Pad {\n${GETTER}}\n`;

    expect(exampleMemberAccesses(text).map(({ variable, member, access }) => `${variable}.${member}:${access}`))
      .toEqual(['null.value:call']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([CALLED_GETTER]);
  });

  it('sigue el acceso opcional del receptor atado `pad?.value`', () => {
    const text = classWith(GETTER, ' *   pad?.value = 0.5;\n');

    expect(exampleMemberAccesses(text).map(({ member, access }) => `${member}:${access}`))
      .toEqual(['value:write']);
    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.value: el ejemplo lo escribe, la clase lo declara getter']);
  });

  it('juzga la forma en la API devuelta por una fábrica', () => {
    const factory = 'export function createPad(container) {\n'
      + '  const count = 0;\n\n'
      + '  return {\n'
      + '    get value() { return this._v; },\n'
      + '    count,\n'
      + '  };\n}\n';
    const usage = (line) => `/**\n * Usage:\n *   const f = createPad(el);\n *   ${line}\n */\n${factory}`;

    expect(exampleMemberAccesses(usage('f.value();')).map(({ className, variable, member, access }) => `${variable}.${member}:${access}`))
      .toEqual(['f.value:call']);
    expect(mismatchedExampleAccesses(usage('f.value();'), asModules('pad.js', factory)))
      .toEqual(['createPad.value: el ejemplo lo llama, la clase lo declara getter']);
    expect(mismatchedExampleAccesses(usage('f.count = 1;'), asModules('pad.js', factory))).toEqual([]);
  });

  it('caza el método que el ejemplo lee como dato en la API de una fábrica', () => {
    // El caso de fabrica de la 11, el que su receta documenta: los ejemplos reales solo
    // LLAMAN a lo que una fabrica devuelve, asi que leer un metodo como dato no se ve en el
    // inventario. Aqui no hay mutacion: la fabrica declara el metodo y el ejemplo lo lee.
    const factory = 'export function createPad(container) {\n'
      + '  const count = 0;\n\n'
      + '  return {\n'
      + '    count,\n'
      + '    setValue(v) {\n'
      + '      return v;\n'
      + '    },\n'
      + '  };\n'
      + '}\n';
    const usage = (line) => `/**\n * Usage:\n *   const f = createPad(el);\n *   ${line}\n */\n${factory}`;

    expect([...memberDeclarations(factory, 'createPad').keys()]).toEqual(['count', 'setValue']);
    expect(exampleMemberAccesses(usage('f.setValue;'))
      .map(({ className, member, access }) => `${className}.${member}:${access}`))
      .toEqual(['createPad.setValue:read']);
    expect(mismatchedExampleAccesses(usage('f.setValue;'), asModules('pad.js', factory)))
      .toEqual(['createPad.setValue: el ejemplo lo lee, la clase lo declara metodo']);
    expect(mismatchedExampleAccesses(usage('f.count;'), asModules('pad.js', factory))).toEqual([]);
  });
});


/* ---------------------------------------------------------------------------
 * Auto-tests de las funciones exportadas
 * ------------------------------------------------------------------------- */

describe('auto-tests de las funciones exportadas', () => {
  it('caza una funcion exportada que ningun bloque documenta', () => {
    const source = 'export function huerfana(a, b) { return a + b; }\n';

    expect(exportedFunctions(source).map(({ name }) => name)).toEqual(['huerfana']);
    expect(undocumentedExports(source)).toEqual(['huerfana']);
  });

  it('no delata la que documenta su propio bloque', () => {
    const source = '/** Suma dos numeros. */\nexport function suma(a, b) { return a + b; }\n';

    expect(undocumentedExports(source)).toEqual([]);
  });

  it('acepta la cabecera del modulo cuando su `Usage:` nombra la funcion', () => {
    // El caso real de lcdScreen.js: la cabecera documenta la fabrica, y la tabla de
    // defaults se cuela entre el bloque y la declaracion.
    const source = '/**\n * Fabrica.\n *\n * Usage:\n *   const lcd = createLcd(el);\n */\n'
      + 'const DEFAULTS = {};\n\nexport function createLcd(el) { return DEFAULTS; }\n';

    expect(undocumentedExports(source)).toEqual([]);
  });

  it('lee `export async function` y no la funcion interna', () => {
    const source = 'export async function carga(url) { return url; }\nfunction interna() {}\n';

    expect(exportedFunctions(source).map(({ name }) => name)).toEqual(['carga']);
    expect(undocumentedExports(source)).toEqual(['carga']);
  });
});

/* ---------------------------------------------------------------------------
 * La HERENCIA: cuando un control extiende a otro, de quien es el codigo
 * ------------------------------------------------------------------------- */

describe('auto-tests de la herencia', () => {
  const control = (label) => MODULES.find((modulo) => modulo.label === label);

  it('la cadena de bases resuelve el `extends` y se corta con un bucle', () => {
    expect(baseClassName('export class Hija extends Base { }', 'Hija')).toBe('Base');
    expect(baseClassName('export class Sola { }', 'Sola')).toBeNull();
    expect(baseClassName('export class Otra { }', 'Hija')).toBeNull();

    // Dos clases que se extienden entre si: la cadena se corta en vez de dar
    // vueltas, que aqui seria un test colgado y no un fallo.
    const a = 'export class A extends B { }';
    const b = 'export class B extends A { }';
    const modules = [
      { label: 'a.js', source: a },
      { label: 'b.js', source: b },
    ];

    expect(baseChain(a, 'A', modules).map(({ nombre }) => nombre)).toEqual(['B']);

    // Y una base que no esta en el inventario no inventa nada.
    expect(baseChain('export class Cuda extends Missing { }', 'Cuda', modules)).toEqual([]);
  });

  it('el bloque de la clase se encuentra con `extends` en medio, y sin él sigue habiendo peaje', () => {
    const source = '/**\n * U.\n * @param {object} options\n */\n'
      + 'export class Hija extends Base\n{\n  constructor (container, options) { }\n}\n';
    const constructor = source.indexOf('constructor');

    expect(docBlockBefore(source, constructor, true)).toContain('@param');

    // El peaje sigue siendo un peaje: un hueco que no es la declaracion de la
    // clase no vale, o un miembro se quedaria con el JSDoc del de antes.
    const conRuido = source.replace('export class Hija extends Base', 'const otro = 1;\nexport class Hija extends Base');

    expect(docBlockBefore(conRuido, conRuido.indexOf('constructor'), true)).toBeNull();
  });

  it('el contrato de un modulo es su fichero y el de sus bases, y el de un modulo sin clase es su fichero', () => {
    const segmentado = control('segmented.js').source;

    expect(baseSources(segmentado, MODULES).map((texto) => texto.includes('export class IndexControl')))
      .toEqual([true]);
    expect(contractText(segmentado, MODULES).length).toBeGreaterThan(segmentado.length);

    // Un modulo que no exporta una clase no hereda de nadie: su contrato es el.
    const suelto = 'export function panel(el) { return el; }\n';

    expect(baseSources(suelto, MODULES)).toEqual([]);
    expect(contractText(suelto, MODULES)).toBe(suelto);
  });

  it('la regla 3 cuenta la clave que se lee en la base y delata la que no se lee en ninguna parte', () => {
    // El caso real: `disabled` la lee el veto de IndexControl, no el control.
    expect(unreadEntryKeys(control('select.js').source)).toEqual([]);

    // Y el contrario: una clave que NADIE de la familia lee se delata igual.
    const original = control('select.js').source;
    const literal = original.indexOf('return {', original.indexOf('function normalizeEntry'));
    const sinLeer = original.slice(0, literal + 8)
      + '\n        zzzGhostKey: true,'
      + original.slice(literal + 8);

    expect(unreadEntryKeys(sinLeer)).toEqual(['zzzGhostKey']);
  });

  it('la regla 6 da por usada la opción que la base consume, y delata la que no consume nadie', () => {
    // El caso real: `skin` se pasa a `super` y lo aplica la base.
    expect(inertOptions(control('segmented.js').source)).toEqual([]);

    // Y el contrario: una opción que se guarda y no la usa ni el control ni la
    // base sigue siendo inerte, que es lo que la regla tenía que cazar.
    const huerfana = control('segmented.js').source.replace(
      '    constructor (container, options = {})',
      '    constructor (container, options = {}) { this.zzzGhost = options.zzzGhost; }\n    otro (options) {');

    expect(inertOptions(huerfana)).toContain('zzzGhost');
  });

  it('la regla 8 acepta el método que solo hereda y delata el fantasma', () => {
    const segmentado = control('segmented.js').source;
    const conHeredados = membersWithBases(segmentado, 'Segmented', MODULES);

    expect(conHeredados.has('destroy')).toBe(true);      // vive en IndexControl
    expect(conHeredados.has('render')).toBe(true);        // y este en el control
    expect(conHeredados.has('zzzGhost')).toBe(false);

    // El fantasma se delata igual: heredar no perdona un metodo que no existe.
    const conFantasma = segmentado.replace(' *   seg.destroy();', ' *   seg.zzzGhost();\n *   seg.destroy();');

    expect(missingExampleMethods(conFantasma, MODULES)).toEqual(['Segmented.zzzGhost()']);
  });
});
