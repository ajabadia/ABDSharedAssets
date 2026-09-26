/**
 * Tests unitarios de los detectores (tests/audit/detectors.js).
 *
 * Los detectores son funciones puras de texto a texto: aqui se prueban PIEZA a PIEZA,
 * con fuentes minimaas, sin recorrer los modulos del repo (eso es trabajo de las reglas
 * y de sus coberturas en rules.js). Un fallo aqui localiza la pieza rota; un fallo en
 * las reglas con piezas verdes apunta a un caso del inventario real.
 */

import { describe, expect, it } from 'vitest';

import {
  accessKind,
  acceptsArgument,
  factoryApiMembers,
  argumentCount,
  argumentList,
  argumentType,
  arityMismatches,
  arityRange,
  chainedMemberAccesses,
  chainedMethodCalls,
  chainedReceivers,
  classMembers,
  closingIndex,
  codeDefaults,
  codeOnly,
  constructedWith,
  depthAt,
  docParamTypes,
  documentedMembers,
  documentedParamTypes,
  entryShapeKeys,
  exampleBindings,
  exampleObjectEntries,
  exampleMemberAccesses,
  exampleMethodCalls,
  inertOptions,
  isRecordType,
  literalsOf,
  memberDeclarations,
  memberIsConsulted,
  recordFields,
  memberSignatures,
  mismatchedExampleAccesses,
  missingExampleMethods,
  mistypedExampleArguments,
  moduleExporting,
  normaliseEol,
  offListValues,
  optionKeysOfArgs,
  readableType,
  recordFieldErrors,
  reassignmentOf,
  keyValueOf,
  skipString,
  splitTopLevel,
  staleUsageOptions,
  stripParens,
  textChainedMembers,
  undocumentedExampleCalls,
  undocumentedReads,
  unreadEntryKeys,
  unusedMembers,
} from './detectors.js';

/* ---------------------------------------------------------------------------
 * Fuentes de juguete: el patron que los componentes del repo siguen.
 * ------------------------------------------------------------------------- */

const CLASS_WITH_OPTIONS = (doc, body = '') =>
  `/**\n${doc} */\nexport class Pad {\n  constructor(container, options = {}) {\n    this.options = options;\n${body}  }\n}\n`;

const OPTIONS_DOC = ' * @param {object} options\n *   ghost  solo vive en la documentacion.\n';

const asModules = (label, source) => [{ label, source }];

const padClass = (members, usage) =>
  `/**\n * Usage:\n${usage} */\nexport class Pad {\n  constructor(container, options = {}) {\n    this.options = options;\n  }\n\n${members}}\n`;

const PAD_METHOD = '  setValue(v, notify = true) {\n    this.value = v;\n  }\n';
const PAD_GETTER = '  get value() {\n    return this._value;\n  }\n';

/* ---------------------------------------------------------------------------
 * Primitivas de texto
 * ------------------------------------------------------------------------- */

describe('primitivas de texto', () => {
  it('closingIndex equilibra a cualquier profundidad y salta cadenas', () => {
    const text = 'f(a, g(b, ")"), c) + x';

    expect(text[closingIndex(text, 1)]).toBe(')');
    expect(closingIndex('f(sin cerrar', 1)).toBe(-1);
  });

  it('skipString respeta el escape y devuelve el indice tras la cadena', () => {
    expect(skipString("'a\\'b' c", 0)).toBe(6);
    expect(skipString("'abc' x", 0)).toBe(5);
  });

  it('splitTopLevel no parte dentro de pares, cadenas ni llamadas', () => {
    expect(splitTopLevel("a, { b: 1, c: 2 }, 'd, e'")).toEqual(['a', ' { b: 1, c: 2 }', " 'd, e'"]);
    expect(splitTopLevel('')).toEqual(['']);           // un texto vacio es UNA parte vacia
  });

  it('stripParens quita solo los parentesis que envuelven TODA la expresion', () => {
    expect(stripParens('(0.25)')).toBe('0.25');
    expect(stripParens('(a) + (b)')).toBe('(a) + (b)');
  });

  it('literalsOf reune cadenas no vacias, numeros y booleanos', () => {
    expect(literalsOf("x ?? '' || 'mod' || 3 || true")).toEqual(new Set(['mod', '3', 'true']));
  });

  it('codeOnly borra los comentarios de BLOQUE conservando los saltos de linea', () => {
    const code = codeOnly('/** doc\n * largo */\nlet x = 1; // cola\n');

    expect(code).not.toContain('largo');
    expect(code.split('\n').length).toBe(3);           // el bloque colapsa, el codigo no se mueve
    expect(code).toContain('cola');                    // el de linea lo tratan depthAt/closingIndex
  });

  it('normaliseEol uniforma CRLF en LF', () => {
    expect(normaliseEol('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('depthAt distingue la DECLARACION de una llamada dentro del cuerpo', () => {
    const text = 'class P {\n  m() { f(1); }\n}';

    // a un nivel (dentro de las llaves de la clase) vive el miembro; a dos, lo que
    // esta en su cuerpo. classBody recorta la cabecera, asi que ahi los miembros son 0.
    expect(depthAt(text, text.indexOf('m()'))).toBe(1);
    expect(depthAt(text, text.indexOf('f(1)'))).toBe(2);
  });
});

/* ---------------------------------------------------------------------------
 * Reglas 1 y 2: miembros documentados y lecturas
 * ------------------------------------------------------------------------- */

describe('miembros documentados y lecturas', () => {
  it('documentedMembers lee la celda de nombres de la doc de opciones', () => {
    expect([...documentedMembers(CLASS_WITH_OPTIONS(OPTIONS_DOC)).keys()]).toEqual(['ghost']);
  });

  it('memberIsConsulted pide palabra completa en el codigo, no en la doc', () => {
    const source = CLASS_WITH_OPTIONS(OPTIONS_DOC, '    this.ghostly = 1;\n');

    expect(memberIsConsulted(source, 'ghost')).toBe(false);
    expect(memberIsConsulted(CLASS_WITH_OPTIONS(OPTIONS_DOC, '    this.ghost = 1;\n'), 'ghost')).toBe(true);
  });

  it('unusedMembers marca el miembro que solo vive en la documentacion', () => {
    expect(unusedMembers(CLASS_WITH_OPTIONS(OPTIONS_DOC))).toEqual(['ghost']);
    expect(unusedMembers(CLASS_WITH_OPTIONS(OPTIONS_DOC, '    this.ghost = 1;\n'))).toEqual([]);
  });

  it('undocumentedReads marca la lectura que nadie documenta', () => {
    const source = CLASS_WITH_OPTIONS(' * @param {object} options\n', '    this.ghost = options.ghost;\n');

    expect(undocumentedReads(source)).toEqual(['ghost']);
    expect(undocumentedReads(CLASS_WITH_OPTIONS(OPTIONS_DOC, '    this.ghost = options.ghost;\n'))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 3: las claves de normalizeEntry
 * ------------------------------------------------------------------------- */

describe('claves de las entradas ricas', () => {
  const withNormalizer = (key, read) =>
    `function normalizeEntry(entry) {\n  return {\n    label: entry.label,\n    ${key}: true,\n  };\n}\nconst used = entry.${read};\n`;

  it('entryShapeKeys lee las claves del literal de retorno', () => {
    expect(entryShapeKeys(withNormalizer('ghost', 'label'))).toEqual(['label', 'ghost']);
  });

  it('unreadEntryKeys marca la clave que nadie lee fuera del normalizador', () => {
    expect(unreadEntryKeys(withNormalizer('ghost', 'label'))).toEqual(['ghost']);

    // leerla DENTRO del normalizador no cuenta: la clave que solo se mira ahi misma
    // sigue sin consumirse, y la que nadie lee fuera es la otra.
    expect(unreadEntryKeys(withNormalizer('ghost', 'ghost'))).toEqual(['label']);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 4: los defaults
 * ------------------------------------------------------------------------- */

describe('defaults del codigo', () => {
  it('codeDefaults reune los literales aplicados por opcion', () => {
    const source = CLASS_WITH_OPTIONS(OPTIONS_DOC, "    this.v = options.v ?? 3;\n");
    const defaults = codeDefaults(source);

    expect([...defaults.get('v')]).toEqual(['3']);
  });

  it('un default calculado no cuenta como literal', () => {
    const source = CLASS_WITH_OPTIONS(OPTIONS_DOC, '    this.v = options.v ?? Math.floor(2.5);\n');

    expect([...(codeDefaults(source).get('v') ?? [])]).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 5: opciones inertes
 * ------------------------------------------------------------------------- */

describe('opciones guardadas y nunca usadas', () => {
  it('inertOptions marca la copia que nadie vuelve a leer', () => {
    const copy = (body) => CLASS_WITH_OPTIONS(OPTIONS_DOC, body);

    expect(inertOptions(copy('    this.ghost = options.ghost;\n'))).toEqual(['ghost']);
    expect(inertOptions(copy('    this.ghost = options.ghost;\n  }\n\n  ping() { return this.ghost; }\n')))
      .toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 6: los ejemplos de uso
 * ------------------------------------------------------------------------- */

describe('construcciones de los ejemplos', () => {
  it('constructedWith lee las claves del objeto de opciones, atado o encadenado', () => {
    expect(optionKeysOfArgs('el, { skin: "ms2000", value: 0.5 }')).toEqual(['skin', 'value']);
    expect(constructedWith('/**\n * Usage:\n *   new Pad(el, { skin: "ms2000" }).setValue(0.5);\n */\n')[0].keys)
      .toEqual(['skin']);
  });

  it('un `new` sin objeto de opciones no inventa claves', () => {
    expect(optionKeysOfArgs('el')).toEqual([]);
  });

  it('staleUsageOptions juzga contra las lecturas de la clase construida', () => {
    const usage = '/**\n * Usage:\n *   new Pad(el, { zzzGhost: 1 });\n */\n';
    const reader = CLASS_WITH_OPTIONS(' * @param {object} options\n', '    this.skin = options.skin;\n');

    expect(staleUsageOptions(usage, asModules('pad.js', reader))).toEqual(['Pad.zzzGhost']);
    expect(staleUsageOptions(usage, [])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 7: los valores enumerados
 * ------------------------------------------------------------------------- */

describe('valores enumerados', () => {
  it('offListValues delata la rama que sale de la lista documentada', () => {
    const source = CLASS_WITH_OPTIONS(
      " * @param {object} options\n *   mode   'pitch' | 'mod', default 'mod'.\n",
      "    this.mode = options.mode ?? 'mod';\n",
    ) + "\n  branch() { if (this.mode === 'zzzGhost') this.mode = 'mod'; }\n";

    expect(offListValues(source)).toEqual(['mode=zzzGhost']);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 8: los metodos de los ejemplos
 * ------------------------------------------------------------------------- */

describe('receptores y llamadas de los ejemplos', () => {
  it('exampleBindings ata el receptor directo y resuelve el alias a su clase', () => {
    const text = ' *   const pad = new Pad(el);\n *   const pad2 = pad;\n';

    expect(exampleBindings(text)).toEqual([
      { variable: 'pad', className: 'Pad', at: text.indexOf('const pad =') },
      { variable: 'pad2', className: 'Pad', at: text.indexOf('const pad2 =') },
    ]);
  });

  it('reassignmentOf distingue la reasignacion de la declaracion y de la comparacion', () => {
    expect(reassignmentOf('y').test('y = other;')).toBe(true);
    expect(reassignmentOf('y').test('const y = x;')).toBe(false);
    expect(reassignmentOf('y').test('y == x;')).toBe(false);
  });

  it('exampleMethodCalls sigue el atado, el comentado, el encadenado y el opcional', () => {
    const text = padClass(PAD_METHOD,
      ' *   const pad = new Pad(el);\n'
      + ' *   // pad.reset();\n'
      + ' *   pad.setValue(0.2);\n'
      + ' *   new Pad(el)?.destroy();\n');

    // la comentada es la misma promesa (regla 8), el opcional entra con variable null
    expect(exampleMethodCalls(text).map(({ method, variable }) => `${variable}.${method}`))
      .toEqual(['pad.reset', 'pad.setValue', 'null.destroy']);
  });

  it('un alias reasignado deja de ser el receptor', () => {
    const text = padClass(PAD_METHOD,
      ' *   const pad = new Pad(el);\n *   const pad2 = pad;\n *   pad2 = other;\n *   pad2.setValue(0.2);\n');

    expect(exampleMethodCalls(text)).toEqual([]);
  });

  it('chainedReceivers devuelve args null si el miembro no se llama', () => {
    const sites = chainedReceivers(' *   new Pad(el).value;\n');

    expect(sites).toEqual([{ className: 'Pad', member: 'value', memberAt: expect.any(Number), args: null }]);
  });

  it('chainedMethodCalls solo entra con llamada y textChainedMembers lee del texto', () => {
    const text = padClass(PAD_METHOD, ' *   new Pad(el).setValue(0.5);\n');

    expect(chainedMethodCalls(text)).toEqual([
      { className: 'Pad', variable: null, method: 'setValue', args: '0.5' },
    ]);
    expect(textChainedMembers(text)).toEqual(['setValue']);
    expect(textChainedMembers(padClass(PAD_METHOD, ' *   pad.setValue(0.5);\n'))).toEqual([]);
  });

  it('el anidado profundo y el parentesis en cadena no despistan la lectura textual', () => {
    const deep = ' *   new Pad(el, fn(x, g(y))).destroy();\n';
    const quoted = " *   new Pad(el, ')').setValue(0.1);\n";

    expect(textChainedMembers(deep)).toEqual(['destroy']);
    expect(textChainedMembers(quoted)).toEqual(['setValue']);
  });

  it('missingExampleMethods juzga contra las declaraciones de la clase', () => {
    const text = padClass(PAD_METHOD, ' *   const pad = new Pad(el);\n *   pad.zzzGhost();\n');

    expect(missingExampleMethods(text, asModules('pad.js', text))).toEqual(['Pad.zzzGhost()']);
  });

  it('classMembers ve los miembros a profundidad 0, no las llamadas de los cuerpos', () => {
    const members = classMembers('export class P {\n  m() { clearTimeout(t); }\n}\n', 'P');

    expect(members.has('m')).toBe(true);
    expect(members.has('clearTimeout')).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 9: la aridad
 * ------------------------------------------------------------------------- */

describe('aridad de las llamadas', () => {
  it('argumentList cuenta por comas de nivel 0', () => {
    expect(argumentCount('{ x: 0.2, y: 0.8 }')).toBe(1);
    expect(argumentCount("0.5, ['a', 'b'], f(1, 2)")).toBe(3);
    expect(argumentList('')).toEqual([]);
  });

  it('arityRange describe el rango aceptado', () => {
    expect(arityRange({ required: 1, total: 2, rest: false })).toBe('1..2');
    expect(arityRange({ required: 2, total: 2, rest: false })).toBe('2');
    expect(arityRange({ required: 0, total: 0, rest: true })).toBe('0+');
  });

  it('memberSignatures lee el default y el ...rest', () => {
    const source = 'export class P {\n  constructor(a, b = 1) { this.b = b; }\n  m(x, ...rest) { this.x = x; }\n}\n';
    const signatures = memberSignatures(source, 'P');

    expect(signatures.get('constructor')).toEqual({ required: 1, total: 2, rest: false });
    expect(signatures.get('m')).toEqual({ required: 1, total: 2, rest: true });
  });

  it('arityMismatches mide el atado y el encadenado contra su firma', () => {
    const chained = padClass(PAD_METHOD, ' *   new Pad(el).setValue(0.2, true, 1);\n');

    expect(arityMismatches(chained, asModules('pad.js', chained)))
      .toEqual(['Pad.setValue(): recibe 3, la firma acepta 1..2']);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 10: los tipos
 * ------------------------------------------------------------------------- */

describe('tipos prometidos y reales', () => {
  it('docParamTypes lee el tipo con su anidamiento y marca las claves de opciones', () => {
    const block = '/**\n * @param {HTMLElement|string} container\n * @param {number} [options.step]\n * @param {{ x?: number }} extras\n */\n';

    expect(docParamTypes(block)).toEqual([
      { type: 'HTMLElement|string', name: 'container', option: false },
      { type: 'number', name: 'options', option: true },
      { type: '{ x?: number }', name: 'extras', option: false },
    ]);
  });

  it('documentedParamTypes resuelve por declaracion y no hereda el JSDoc del vecino', () => {
    const source = 'export class P {\n  /**\n   * @param {number} v\n   */\n  setValue(v) { this.v = v; }\n\n  reset(steps) { this.v = steps; }\n}\n';

    expect(documentedParamTypes(source, 'P', 'setValue')).toEqual([{ type: 'number' }]);
    expect(documentedParamTypes(source, 'P', 'reset')).toBeNull();
  });

  it('isRecordType reconoce el objeto inline y readableType las familias legibles', () => {
    expect(isRecordType('{ x: number, y: number }')).toBe(true);
    expect(isRecordType('object')).toBe(false);
    expect(readableType('{ x: number, y: number }')).toBe(true);
    expect(readableType('HTMLElement|string')).toBe(false);
  });

  it('acceptsArgument cruza la familia del argumento con el tipo prometido', () => {
    expect(acceptsArgument('number', 'number')).toBe(true);
    expect(acceptsArgument('number', 'string')).toBe(false);
    expect(acceptsArgument('{ x: number }', 'object')).toBe(true);
    expect(acceptsArgument('*', 'function')).toBe(true);
  });

  it('argumentType delata la familia por la forma del argumento', () => {
    expect(argumentType("'alto'")).toBe('string');
    expect(argumentType('0.5')).toBe('number');
    expect(argumentType('true')).toBe('boolean');
    expect(argumentType('{ x: 1 }')).toBe('object');
    expect(argumentType('[1]')).toBe('array');
    expect(argumentType('(v) => v')).toBe('function');
    expect(argumentType('el')).toBe('unknown');
  });

  it('mistypedExampleArguments cruza por posicion y caza la familia que no encaja', () => {
    const doc = ' * @param {number} value\n';
    const method = `  /**\n${doc} */\n  setValue(value) {\n    this.value = value;\n  }\n`;
    const text = padClass(method, " *   const pad = new Pad(el);\n *   pad.setValue('alto');\n");

    expect(mistypedExampleArguments(text, asModules('pad.js', text)))
      .toEqual(['Pad.setValue(): el argumento 1 es string y la firma promete number']);
  });

  it('undocumentedExampleCalls marca la firma con argumentos y sin @param', () => {
    const text = padClass('  setValue(value) {\n    this.value = value;\n  }\n',
      ' *   const pad = new Pad(el);\n *   pad.setValue(0.5);\n');

    // el `new Pad(el)` tambien entra: su constructor tampoco documenta @param aqui
    expect(undocumentedExampleCalls(text, asModules('pad.js', text))).toEqual([
      'Pad.setValue(): el ejemplo le pasa 1 argumento(s) y la firma no documenta ningun @param obligatorio',
      'new Pad(): el ejemplo le pasa 1 argumento(s) y la firma no documenta ningun @param obligatorio',
    ]);
  });
});

/* ---------------------------------------------------------------------------
 * Regla 11: la forma de los accesos
 * ------------------------------------------------------------------------- */

describe('forma de los accesos', () => {
  it('accessKind clasifica llamada, escritura y lectura', () => {
    expect(accessKind('pad.setValue(1);', 12)).toBe('call');    // justo tras el nombre
    expect(accessKind('pad.value = 1;', 9)).toBe('write');
    expect(accessKind('pad.value;', 9)).toBe('read');
    expect(accessKind('pad.value == 1;', 9)).toBe('read');
    expect(accessKind('pad.value += 1;', 9)).toBe('read');
  });

  it('memberDeclarations devuelve la forma declarada de cada miembro', () => {
    const declarations = memberDeclarations(`export class P {\n${PAD_GETTER}${PAD_METHOD}}\n`, 'P');

    expect([...declarations.get('value').forms]).toEqual(['get']);
    expect([...declarations.get('setValue').forms]).toEqual(['method']);
  });

  it('exampleMemberAccesses etiqueta el atado y el encadenado (variable null)', () => {
    const text = padClass(`${PAD_GETTER}${PAD_METHOD}`,
      ' *   const pad = new Pad(el);\n *   pad.setValue(0.2);\n *   new Pad(el).value;\n');

    expect(exampleMemberAccesses(text).map(({ variable, member, access }) => `${variable}.${member}:${access}`))
      .toEqual(['pad.setValue:call', 'null.value:read']);
  });

  it('chainedMemberAccesses ve tambien el encadenado opcional', () => {
    const text = ' *   new Pad(el)?.value();\n';

    expect(chainedMemberAccesses(text).map(({ member, access }) => `${member}:${access}`)).toEqual(['value:call']);
  });

  it('mismatchedExampleAccesses delata el getter llamado como metodo', () => {
    const text = padClass(PAD_GETTER, ' *   const pad = new Pad(el);\n *   pad.value();\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text)))
      .toEqual(['Pad.value: el ejemplo lo llama, la clase lo declara getter']);
  });

  it('un miembro que la clase no declara no se juzga (sin forma no hay comparacion)', () => {
    const text = padClass(PAD_METHOD, ' *   const pad = new Pad(el);\n *   pad.options.x;\n');

    expect(mismatchedExampleAccesses(text, asModules('pad.js', text))).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Resolucion cruzada de modulos
 * ------------------------------------------------------------------------- */

describe('la API devuelta por una fabrica', () => {
  const LCD = 'export function createLcd(container, options = {}) {\n'
    + "  const root = document.createElement('div');\n\n"
    + '  /**\n   * @param {number} lineIdx\n   * @param {string} text\n   */\n'
    + '  function setLine(lineIdx, text) { this._t = text; }\n\n'
    + '  const clear = () => { this._t = null; };\n\n'
    + '  return { root, setLine, clear };\n}\n';

  it('lee metodos del literal, propiedades abreviadas y su forma declarada', () => {
    const api = factoryApiMembers(LCD, 'createLcd');

    expect([...api.keys()].sort()).toEqual(['clear', 'root', 'setLine']);
    expect([...api.get('setLine').forms]).toEqual(['method']);
    expect([...api.get('root').forms]).toEqual(['field']);
    expect([...api.get('clear').forms]).toEqual(['method']);
  });

  it('el JSDoc del metodo vive donde la regla 10 lo busca', () => {
    const api = factoryApiMembers(LCD, 'createLcd');

    expect(documentedParamTypes(LCD, 'createLcd', 'setLine'))
      .toEqual([{ type: 'number' }, { type: 'string' }]);
  });

  it('una fabrica que devuelve via `const api` tambien se lee', () => {
    const source = 'export function createBox() {\n  const api = {\n    open() { this.o = 1; },\n  };\n\n  return api;\n}\n';

    expect([...factoryApiMembers(source, 'createBox').keys()]).toEqual(['open']);
  });

  it('una fabrica que desestructura sus parametros no despista el retorno', () => {
    const source = 'export function createDrawer({ id, title = null }) {\n  const api = {\n    close() { this.o = 0; },\n  };\n\n  return api;\n}\n';

    expect([...factoryApiMembers(source, 'createDrawer').keys()]).toEqual(['close']);
  });

  it('sin fabrica o sin retorno legible devuelve null (nada que juzgar)', () => {
    expect(factoryApiMembers(LCD, 'createUnknown')).toBeNull();
    expect(factoryApiMembers('export function createX() { return null; }\n', 'createX')).toBeNull();
  });
});

describe('la validacion por CAMPOS de un objeto inline', () => {
  it('keyValueOf lee clave, valor y el ? opcional', () => {
    expect(keyValueOf('x: number')).toEqual({ key: 'x', value: 'number', optional: false });
    expect(keyValueOf('y?: boolean')).toEqual({ key: 'y', value: 'boolean', optional: true });
    expect(keyValueOf('...resto')).toBeNull();
    expect(keyValueOf('onChange')).toBeNull();
  });

  it('recordFields lee el registro de un tipo inline y su opcionalidad', () => {
    expect(recordFields('{ x: number, y?: boolean }')).toEqual([
      { key: 'x', type: 'number', optional: false },
      { key: 'y', type: 'boolean', optional: true },
    ]);
    expect(recordFields('{ handler: HTMLElement|string }')).toEqual([]);   // ilegible: no se juzga
  });

  it('exampleObjectEntries lee las claves de un objeto del ejemplo', () => {
    expect(exampleObjectEntries('{ x: 0.2, y: true }')).toEqual([
      { key: 'x', text: '0.2' },
      { key: 'y', text: 'true' },
    ]);
    expect(exampleObjectEntries("{ priority: 1, o: { a: 'b' } }"))
      .toEqual([{ key: 'priority', text: '1' }, { key: 'o', text: "{ a: 'b' }" }]);
    expect(exampleObjectEntries('0.5')).toEqual([]);                       // no es un objeto
  });

  it('recordFieldErrors delata la clave de mas y la familia equivocada', () => {
    expect(recordFieldErrors('P.m()', '{ x: number, y?: boolean }', '{ x: 1 }')).toEqual([]);
    expect(recordFieldErrors('P.m()', '{ x: number, y?: boolean }', "{ x: 1, y: 'no' }"))
      .toEqual(['P.m(): la clave x.y es string y la firma promete boolean']);
    expect(recordFieldErrors('P.m()', '{ x: number }', '{ x: 1, zz: 2 }'))
      .toEqual(['P.m(): la clave x.zz no esta en la firma promete { x: number }']);
  });
});

describe('resolucion de clases entre modulos', () => {
  it('moduleExporting encuentra la clase en el modulo que la exporta', () => {
    const modules = [
      { label: 'pad.js', source: `export class Pad {\n${PAD_METHOD}}\n` },
      { label: 'index.js', source: '/**\n * Usage:\n *   const pad = new Pad(el);\n *   pad.zzzGhost();\n */\n' },
    ];

    expect(moduleExporting('Pad', modules)?.label).toBe('pad.js');
    expect(moduleExporting('Unknown', modules)).toBeUndefined();
    expect(missingExampleMethods(modules[1].source, modules)).toEqual(['Pad.zzzGhost()']);
  });
});
