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
  boundedCallsWithLabels,
  boundReceiverAccesses,
  callbackArityErrors,
  exportedFunctionParamTypes,
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
  exampleFactoryCalls,
  exampleObjectEntries,
  exampleMemberAccesses,
  exampleMethodCalls,
  exportedFunctions,
  inertOptions,
  inlineRegistryOffenses,
  isRecordType,
  literalsOf,
  memberCallPattern,
  memberDeclarations,
  memberIsConsulted,
  misplacedOptions,
  recordFields,
  memberSignatures,
  mismatchedExampleAccesses,
  missingExampleMethods,
  mistypedExampleArguments,
  moduleExporting,
  newBeforePattern,
  newReceiverPattern,
  normaliseEol,
  offListValues,
  optionIdentifiers,
  optionKeysOfArgs,
  optionNameAlternation,
  optionNames,
  REGEX_CLASS_NAMES,
  optionReadPrefix,
  optionsParams,
  signatureParams,
  patternKeys,
  readableType,
  RECEIVER_DECLARATION,
  recordFieldErrors,
  recordKeys,
  reassignmentOf,
  regexOffenses,
  regexPatternsOf,
  keyValueOf,
  callableBodyAfter,
  inlineReturnFields,
  literalKeys,
  propertyFields,
  registryOf,
  returnedKeys,
  skipString,
  withoutComments,
  withoutLiterals,
  splitTopLevel,
  typedefFields,
  staleUsageOptions,
  stripParens,
  textChainedMembers,
  undocumentedDefaults,
  undocumentedExampleCalls,
  undocumentedExports,
  undocumentedReads,
  unreadEntryKeys,
  unusedMembers,
  clavesDePrimerNivel,
  clavesRepetidas,
  clavesRepetidasDelModulo,
  diagnostico,
  guideMessageBlock,
  halfDeclaredRules,
  importedNames,
  indicesDeLiterales,
  informeDiagnostico,
  limiteConTexto,
  lineaDe,
  literalesDeEntrada,
  recipeCases,
  recorte,
  resumenDiagnostico,
  ruleGaps,
  sharedProse,
  wrappedOptionEntries,
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

  it('el escaner no confunde un regex con una cadena y no se come el codigo de detras', () => {
    // un regex trae comillas: si se lee como una cadena, la primera abre una cadena
    // fantasma y a partir de ahi desaparecen comas y llamadas. Le pasa a `entries.js`
    // (su `^(?:'([^'\\n]*)'|...`) y dejaba a cuatro ayudantes sin ejercitar de mas.
    const source = [
      "const explicito = /^(?:'([^'\\n]*)'|\"([^\"\\n]*)\")/.exec(rest);",
      'const luego = splitting(closing(rest));',
      'const fin = texto;',
    ].join('\n');

    expect(withoutComments(source)).toContain('const luego = splitting(closing(rest));');
    expect(withoutComments(source)).toContain('const fin = texto;');

    // y el vaciador de literales tampoco: el TEXTO de una cadena se va (un regex no es
    // una cadena, asi que el suyo se queda), y el codigo que hay detras sigue en su sitio
    const limpio = withoutLiterals(withoutComments(source));

    expect(limpio).toContain('const luego = splitting(closing(rest));');
    expect(limpio).toContain('const fin = texto;');
    expect(withoutLiterals('const a = "usada();";\nconst b = usada();\n'))
      .toContain('const b = usada();');
    expect(withoutLiterals('const a = "usada();";\nconst b = usada();\n'))
      .not.toContain('usada();"');
  });

  it('las interpolaciones de una plantilla son codigo, y el resto de la plantilla no', () => {
    // ahi se construyen los mensajes de las guardias, que nombran helpers de verdad:
    // vaciar la plantilla entera dejaria referencias reales sin ejercicio
    const limpio = withoutLiterals('const m = `falta ${helper(a)} y ${otra({ x: 1 })}`;\n');

    expect(limpio).toContain('helper(a)');
    expect(limpio).toContain('otra({ x: 1 })');
    expect(limpio).not.toContain('falta ');
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

  it('optionIdentifiers no se come la coma: ve la firma entera, no uno de cada dos', () => {
    // Regresion: el separador de cola se consumia, asi que el `(?:^|,)` del parametro
    // siguiente ya no encontraba su coma y solo entraba el primero (y el tercero).
    expect([...optionIdentifiers(['element, handlers'])]).toEqual(['handlers']);
    expect([...optionIdentifiers(['a, options, b'])]).toEqual(['options']);
    expect([...optionIdentifiers(['a, options, config'])]).toEqual(['options', 'config']);
    expect([...optionIdentifiers(['container, options = {}'])]).toEqual(['options']);
  });

  it('documentedMembers lee un tipo inline con un registro ANIDADO dentro', () => {
    // Regresion: el tipo se cortaba en la primera llave, asi que el `Array<{label:
    // string}>` de un campo dejaba medio tipo (o ninguno) y las claves que la promesa
    // escribia se perdian: el `type`, el `choices` y el `unit` de la maquina salian
    // como no documentados.
    const doc = ' * @param {{ type?: string, choices?: Array<{label: string}>, unit?: string }} spec\n';

    expect([...documentedMembers(CLASS_WITH_OPTIONS(doc)).keys()]).toEqual(['type', 'choices', 'unit']);
  });

  it('una @property de un @typedef documenta su clave, y la linea que la promete', () => {
    // El audit no entendia la forma idiomatica de JSDoc (`@typedef {object} Point` +
    // `@property {tipo} x`): sus claves eran invisibles para las reglas 1, 2 y 4, asi
    // que leerlas salia como lectura no documentada. Con el `ValueSpec` de lcdMachine
    // declarado en el repo, la forma esta viva y no solo en un test.
    const source = [
      '/**',
      ' * @typedef {object} Point',
      ' * @property {number} [x]  default 3',
      ' * @property {HTMLElement|string} [el]  la regla 12 no sabe leer este tipo',
      ' */',
      '',
      '/**',
      ' * @param {Point} spec',
      ' */',
      'export function draw (spec) {',
      '  return (spec.x ?? 3) + spec.el;',
      '}',
      '',
    ].join('\n');
    const members = documentedMembers(source);

    expect([...members.keys()]).toContain('x');
    // un tipo que el audit NO sabe leer no deja de documentar la clave: si esta lista no
    // lo supiera, leer `spec.el` seria un falso positivo de la regla 2
    expect([...members.keys()]).toContain('el');
    expect(members.get('x')).toContain('default 3');      // la linea que la documenta es la suya
    expect(undocumentedReads(source)).toEqual([]);
    expect([...codeDefaults(source).get('x')]).toEqual(['3']);
    expect(undocumentedDefaults(source)).toEqual([]);
  });

  it('optionsParams dice EN QUE POSICION esta el objeto de opciones de cada entrada', () => {
    // La posicion es el dato: el repo lo pone en el segundo parametro casi siempre, y hay
    // firmas donde llega desmembrado ahi (`mountFitStage(stage, { width, height } = {})`).
    // Una cobertura de las reglas exige que el inventario conserve las dos formas, para que
    // la lectura acotada al primer parametro no pueda pasar desapercibida.
    expect(optionsParams('export function fit (stage, { width, height } = {}) {}\n')).toEqual([
      { index: 1, name: null, destructured: true, keys: ['width', 'height'] },
    ]);
    expect(optionsParams('export function draw ({ id, title = \'\' } = {}) {}\n'))
      .toEqual([{ index: 0, name: null, destructured: true, keys: ['id', 'title'] }]);
    expect(optionsParams('export class P {\n  constructor(container, options = {}) {}\n}\n'))
      .toEqual([{ index: 1, name: 'options', destructured: false, keys: [] }]);
    expect(optionsParams('export class P {\n  constructor(value) {}\n}\n')).toEqual([]);
  });

  it('signatureParams es la vista canonica de una firma: posicion, nombre y forma', () => {
    // Todo lo que asks "donde vive el objeto de opciones" sale de aqui, asi que la vista
    // tiene que decir las tres cosas: el LUGAR (que no es el primero en el repo), el
    // NOMBRE con el que llega, y si llega desmembrado. Un `name` que no se leyera
    // dejaria a las reglas atando el `@param` a una posicion que no es la suya.
    expect(signatureParams('stage, { width, height } = {}, options = {}')).toEqual([
      { index: 0, text: 'stage', name: 'stage', destructured: false, keys: [], options: false },
      {
        index: 1,
        text: '{ width, height } = {}',
        name: null,
        destructured: true,
        keys: ['width', 'height'],
        options: true,
      },
      {
        index: 2,
        text: 'options = {}',
        name: 'options',
        destructured: false,
        keys: [],
        options: true,
      },
    ]);

    // Lo que NO se puede leer con nombre: un `p primero` que no es ni patron ni
    // identificador, y un default que no sea `{}`. Se quedan con su posicion y sin
    // nombre, que es como la regla 12 se callaba antes de que esta vista existiera.
    expect(signatureParams('p primero, x = 5, ...resto')).toEqual([
      { index: 0, text: 'p primero', name: null, destructured: false, keys: [], options: false },
      { index: 1, text: 'x = 5', name: null, destructured: false, keys: [], options: false },
      { index: 2, text: '...resto', name: 'resto', destructured: false, keys: [], options: false },
    ]);

    // Un patron DESMEMBRADO con claves ES el objeto de opciones aunque no se llame
    // asi: es la forma de `constructor(el, { width, height } = {})`, y la que hace que
    // las cuatro firmas que lo desmembran en el PRIMER parametro cuenten.
    expect(signatureParams('{ minScale = 0.25 } = {}')[0]).toEqual({
      index: 0,
      text: '{ minScale = 0.25 } = {}',
      name: null,
      destructured: true,
      keys: ['minScale'],
      options: true,
    });
  });

  it('optionNames y sus dos derivados salen de las firmas, no de una lista a mano', () => {
    // La lista de siempre esta, porque hay lecturas cuyo receptor no es parametro de
    // ninguna firma de entrada (el `opts` de una fabrica interna, el `options` de una
    // funcion suelta del barrel de skins). Y encima entran los nombres que declaren las
    // firmas: con una lista escrita a mano, `opciones` se vigilaba en unas reglas y en
    // otras no, sin que nada lo dijera.
    const source = 'export function pinta (el, opciones = {}) {\n  return opciones.color;\n}\n';

    expect(optionNames(source)).toContain('options');
    expect(optionNames(source)).toContain('opciones');
    expect(optionNameAlternation(source)).toContain('opciones');
    expect(optionNameAlternation(source)).toContain('handlers');

    // El prefijo arma el patron de lectura de las reglas 2, 4, 5 y 7: con `this.` o sin
    // el, y con los nombres de verdad. Un receptor que no es de los suyos no se lee.
    const read = new RegExp(`${optionReadPrefix(source).source}([A-Za-z_$][\\w$]*)`, 'g');

    expect([...'opciones.color this.opciones.color ajustes.color'.matchAll(read)]
      .map((one) => one[1])).toEqual(['color', 'color']);
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
 * Regla 13: la convencion de donde vive el objeto de opciones
 * ------------------------------------------------------------------------- */

describe('el objeto de opciones en su sitio', () => {
  it('delata la entrada que lo pone en el primer parametro habiendo declarado otro mas', () => {
    // Las dos formas del lector: con nombre (`options = {}`) y desmembrado
    // (`{ width } = {}`). Las dos son el mismo juicio, y solo se juzga cuando hay
    // ELECCION: una entrada de un solo parametro no tiene donde ponerlo.
    expect(misplacedOptions('export class P {\n  constructor (container, options = {}) {}\n}\n'))
      .toEqual([]);
    expect(misplacedOptions('export class P {\n  constructor (options = {}, container) {}\n}\n'))
      .toEqual(['constructor(options = {}, container): el objeto de opciones va en el primer parametro y la firma declara 2 parametros']);
    expect(misplacedOptions('export class P {\n  constructor ({ width } = {}, container) {}\n}\n'))
      .toEqual(['constructor({ width } = {}, container): el objeto de opciones va en el primer parametro y la firma declara 2 parametros']);
  });

  it('una entrada de un solo parametro no se juzga, y una que no lo tiene tampoco', () => {
    // Las cuatro del inventario son de un solo parametro: no hay donde poner el objeto
    // de opciones, y delatarlas seria decir que su firma esta mal cuando es la unica
    // posible. Y una entrada sin objeto de opciones no tiene nada que decir.
    expect(misplacedOptions('export function createDrawer ({ title } = {}) {\n  return title;\n}\n'))
      .toEqual([]);
    expect(misplacedOptions('export class P {\n  constructor (container, value) {}\n}\n'))
      .toEqual([]);
    expect(misplacedOptions('export class P {\n  setValue (value, notify = true) {}\n}\n'))
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

  it('wrappedOptionEntries mira detras de un envoltorio cuyo unico argumento es un objeto', () => {
    expect(optionKeysOfArgs('el, wrap({ skin: "ms2000", value: 0.5 })')).toEqual(['skin', 'value']);
    expect(optionKeysOfArgs('el, withDefaults(wrap({ skin: "ms2000" }))')).toEqual(['skin']);
    // Formas que el audit no puede leer: se calla.
    expect(wrappedOptionEntries('merge(base, { skin: 1 })')).toBeNull();
    expect(wrappedOptionEntries('opts')).toBeNull();
    expect(optionKeysOfArgs('el, wrap()')).toEqual([]);
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

  it('la gramatica compartida arma las cuatro formas del receptor', () => {
    // Atado y alias: una sola declaracion reconoce el `new` y el alias que lo sigue.
    const decl = [...'const a = new A(el); const b = a;'.matchAll(RECEIVER_DECLARATION)]
      .map((m) => `${m[1]}->${m[2] ?? m[3]}`);

    expect(decl).toEqual(['a->A', 'b->a']);

    // Encadenado y opcional: el mismo patron lee el `new X(` y el `x?.m(...)`.
    expect(newReceiverPattern().exec('new Pad(el)')[1]).toBe('Pad');
    expect([...'x.m(1); x?.m(2)'.matchAll(memberCallPattern('x'))].map((m) => m[1]))
      .toEqual(['m', 'm']);
    expect(memberCallPattern('x').test('x.m')).toBe(false);   // sin `(` no es llamada

    // `new ` justo antes del nombre: lo que separa la construccion atada de la llamada.
    expect(newBeforePattern().test('const x = new ')).toBe(true);
    expect(newBeforePattern().test('const x = createC')).toBe(false);

    // Las dos guardias del receptor atado: el acceso cuenta, el reasignado no.
    const block = 'const pad = new Pad(el);\npad.zzz();\npad = other;\npad.yyy();\n';

    expect(boundReceiverAccesses(block, { variable: 'pad', className: 'Pad', at: 0 }))
      .toHaveLength(1);
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

  it('exampleFactoryCalls aisla las llamadas de la fabrica de las de una clase', () => {
    const usage = (lines) => ['/**', ' * Usage:', ...lines, ' */', LCD].join('\n');
    const factoryExample = usage([' *   const lcd = createLcd(el);', ' *   lcd.setLine(0, "high");', ' *   lcd.clear();']);
    const classExample = ['/**', ' * Usage:', ' *   const pad = new XYPad(el);', ' *   pad.setValue(0.5);',
      ' */', 'export class XYPad {\n  constructor(el) { this.el = el; }\n  setValue(v) { this.v = v; }\n}\n'].join('\n');

    expect(exampleFactoryCalls(factoryExample, [{ label: 'lcd.js', source: factoryExample }]).map(({ method }) => method))
      .toEqual(['setLine', 'clear']);
    // un receptor nacido de un `new` no entra por este camino
    expect(exampleFactoryCalls(classExample, [{ label: 'pad.js', source: classExample }])).toEqual([]);
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

  it('recordKeys trocea por comas de NIVEL 0: un campo con llaves o parentesis es UNO', () => {
    // Regresion: leer las claves con una regex que pedia separador delante y de paso se
    // comia el caracter colaba los nombres de DENTRO de un campo —el `y` de
    // `(x, y) => void`, el `x` de un registro anidado— y perdia el tipo entero cuando
    // llevaba un `Array<{ ... }>` dentro.
    expect(recordKeys('{ type?: string, choices?: Array<{label: string}>, unit?: string }'))
      .toEqual(['type', 'choices', 'unit']);
    expect(recordKeys('{{ a: number, b: (x: number, y: number) => void, c, d }}')).toEqual(['a', 'b']);
    expect(recordKeys('{ a: { x: number, y: number }, b: number }')).toEqual(['a', 'b']);
    expect(recordKeys('number')).toBeNull();
    expect(recordKeys('{ a: number')).toBeNull();      // sin cerrar: no es un registro
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

describe('firmas de funcion inline y llamadas atadas', () => {
  it('recordFields lee los campos function(a, b): c del registro', () => {
    const fields = recordFields(
      '{ onDelta: function(number, number): number, onStep?: function(number): number, w: number }');

    expect(fields).toEqual([
      {
        key: 'onDelta',
        type: 'function(number, number): number',
        optional: false,
        params: ['number', 'number'],
        returns: 'number',
      },
      {
        key: 'onStep',
        type: 'function(number): number',
        optional: true,
        params: ['number'],
        returns: 'number',
      },
      { key: 'w', type: 'number', optional: false },
    ]);
    // Un retorno ilegible (union con HTMLElement) deja el campo sin juzgar.
    expect(recordFields('{ bad: function(number): HTMLElement|string }')).toEqual([]);
  });

  it('callbackArityErrors delata la aridad y la familia del callback del ejemplo', () => {
    // Nombrar MENOS parametros que los recibidos es legal (como en TS, y como
    // escribe el propio repo); nombrar MAS no: esos parametros sobran.
    expect(callbackArityErrors('f() (argumento 1)', 'x.onDelta',
      'function(number, number): number', '(t) => t')).toEqual([]);
    expect(callbackArityErrors('f() (argumento 1)', 'x.onDelta',
      'function(number, number): number', '(a, b, c) => 0'))
      .toEqual(['f() (argumento 1): la clave x.onDelta recibe 3, su firma pide 2']);
    expect(callbackArityErrors('f() (argumento 1)', 'x.onDelta',
      'function(number): number', "(t) => 'no'"))
      .toEqual(['f() (argumento 1): la clave x.onDelta es string y la firma promete devolver number']);
    expect(callbackArityErrors('f() (argumento 1)', 'x.onStep',
      'function(number): number', '(t) => t')).toEqual([]);
    expect(callbackArityErrors('f() (argumento 1)', 'x.onDragStart',
      'function(): void', '() => {}')).toEqual([]);
  });

  it('void es familia legible y una firma inline es familia function', () => {
    expect(recordFields('{ onDragStart?: function(): void }')).toEqual([
      { key: 'onDragStart', type: 'function(): void', optional: true,
        params: [], returns: 'void' },
    ]);
    expect(acceptsArgument('function(number, number): number', 'function')).toBe(true);
    expect(acceptsArgument('function(number, number): number', 'number')).toBe(false);
    expect(callbackArityErrors('f()', 'x.onDragStart', 'function(): void', '() => 5'))
      .toEqual(['f(): la clave x.onDragStart es number y la firma promete devolver void']);
  });

  it('exportedFunctionParamTypes lee la firma de la funcion exportada', () => {
    const source = [
      '/**',
      ' * @param {HTMLElement} el',
      ' * @param {{ onDelta: function(number, number): number }} handlers',
      ' * @param {function(number): number} [handlers.onStep]  clave, no parametro',
      ' */',
      'export function attachDrag (el, handlers) {',
      '  return () => {};',
      '}',
      '',
    ].join('\n');

    expect(exportedFunctionParamTypes(source, 'attachDrag')).toEqual([
      { type: 'HTMLElement' },
      { type: '{ onDelta: function(number, number): number }' },
    ]);
    expect(exportedFunctionParamTypes(source, 'otra')).toBeNull();
  });

  it('boundedCallsWithLabels inventaria las llamadas atadas y no las sueltas', () => {
    const source = [
      '/**',
      ' * Usage:',
      ' *   const detach = attachDrag(el, { onDelta: (t) => t });',
      ' *   detach();',
      ' */',
      'export function attachDrag (element, handlers) {',
      '  return () => {};',
      '}',
      '',
    ].join('\n');
    const modules = [{ label: 'drag-core.js', source }];

    expect(boundedCallsWithLabels(source, modules)).toEqual([
      { className: 'attachDrag', member: 'attachDrag', label: 'attachDrag()',
        args: 'el, { onDelta: (t) => t }' },
    ]);

    // Llamar a la variable atada (`detach();`) no es un acceso a miembro: no
    // hay firma que juzgar y no se inventaria.

    // La llamada SUELTA no entra: el alcance es una decision, no un accidente.
    expect(boundedCallsWithLabels(source.replace(' *   const detach = attachDrag', ' *   attachDrag'), modules))
      .toEqual([]);
  });

  it('los tipos y args leidos de un docblock multilinea llegan sin su decoracion', () => {
    const source = [
      '/**',
      ' * @param {HTMLElement} el',
      ' * @param {{',
      ' *   onDelta: function(number): number,',
      ' *   onDragEnd?: function(): void',
      ' * }} handlers',
      ' */',
      'export function attachDrag (el, handlers) {',
      '  return () => {};',
      '}',
      '',
    ].join('\n');
    const modules = asModules('drag.js', source);
    const usage = [
      '/**',
      ' * Usage:',
      ' *   const detach = attachDrag(el, {',
      ' *     onDelta: (turns, extra) => turns + extra,',
      ' *     onDragEnd: () => value,',
      ' *   });',
      ' *   detach();',
      ' */',
      ...source.split('\n'),
    ].join('\n');

    // El tipo del @param multilínea llega limpio: el registro completo, con sus
    // dos campos (el de la linea que empieza por `*` incluido).
    expect(exportedFunctionParamTypes(usage, 'attachDrag')).toEqual([
      { type: 'HTMLElement' },
      { type: '{ onDelta: function(number): number, onDragEnd?: function(): void }' },
    ]);
    expect(recordFields(exportedFunctionParamTypes(usage, 'attachDrag')[1].type))
      .toHaveLength(2);

    // Y el ejemplo multilínea se cruza entero: la flecha de 2 contra una firma de 1.
    expect(mistypedExampleArguments(usage, modules)).toEqual([
      'attachDrag() (argumento 2): la clave attachDrag.onDelta recibe 2, su firma pide 1',
    ]);
  });
});

describe('guardia de los registros prometidos', () => {
  it('inlineRegistryOffenses delata la clave del registro inline que el codigo no lee', () => {
    const source = [
      '/**',
      ' * @param {number} init',
      ' * @param {{ a: number, b?: string }} opts',
      ' */',
      'export function f (init, opts = {}) {',
      '  return opts.a;',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source))
      .toEqual(['opts.b (el registro inline lo promete y el código no lo lee)']);

    expect(inlineRegistryOffenses(source.replace('return opts.a;', 'return opts.a + opts.b?.length;')))
      .toEqual([]);
  });

  it('liga el registro al parametro en SU posicion, no por el nombre del receptor', () => {
    const source = [
      '/**',
      ' * @param {{ x: number }} first',
      ' * @param {{ y: number }} second',
      ' */',
      'export function g (first, second) {',
      '  return second.y + first.zzz;',
      '}',
      '',
    ].join('\n');

    // `first` promete `x` (que no se lee) y no `zzz` (que se lee pero no se
    // promete): el cruce es por posicion de la firma, no por el nombre.
    expect(inlineRegistryOffenses(source))
      .toEqual(['first.x (el registro inline lo promete y el código no lo lee)']);
  });

  it('la desestructuracion con renombre cuenta como lectura de la clave fuente', () => {
    const source = [
      '/**',
      ' * @param {{ title?: string, badge?: string }} [next]',
      ' */',
      'setHeader({ title: nextTitle, badge: nextBadge } = {}) {',
      '  return [nextTitle, nextBadge];',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source)).toEqual([]);
    expect(patternKeys('{ a, b: c, d = 1 }')).toEqual(new Set(['a', 'b', 'd']));
    expect(patternKeys('{ fromUser = true } = {}')).toEqual(new Set(['fromUser']));
  });

  it('sin firma tras el bloque (prosa) no hay cruce que hacer', () => {
    const source = '/**\n * @param {{ x: number }} o\n *\n * Solo prosa, sin firma.\n */\n\nconst k = 1;\n';

    expect(inlineRegistryOffenses(source)).toEqual([]);
  });

  it('literalKeys lee las claves del literal sin resolver sus valores', () => {
    // el metodo, el accessor, el par `clave: valor` y el shorthand: la CLAVE es lo que
    // la promesa del `@returns` tiene que encontrar, sea dato calculado o funcion
    expect([...literalKeys('a, b: 1 + 2, c (x) { return x; }, get d() { return 1; }, ...spread')])
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('callableBodyAfter lee el nombre y el cuerpo, y se calla sin cuerpo de bloque', () => {
    const source = '/** doc. */\nexport function f (a) {\n  return a;\n}\n';
    const callable = callableBodyAfter(source, source.indexOf('*/') + 2);

    expect(callable.name).toBe('f');
    expect(source.slice(callable.bodyOpen, callable.bodyClose + 1)).toBe('{\n  return a;\n}');

    // una flecha de EXPRESION no tiene cuerpo que leer: se calla, no adivina
    expect(callableBodyAfter('const g = (a) => ({ a });', 0)).toBeNull();
  });

  it('inlineReturnFields solo lee la forma de registro', () => {
    expect(inlineReturnFields(' * @returns {{ a: number, b: number }}').map(({ key }) => key))
      .toEqual(['a', 'b']);
    expect(inlineReturnFields(' * @returns {object} la copia')).toBeNull();
  });

  it('typedefFields lee el tipo inline y los @property del typedef', () => {
    const inline = '/**\n * @typedef {{ x: number, y: number }} Point\n */\n';

    expect(typedefFields(inline).get('Point').map(({ key }) => key)).toEqual(['x', 'y']);

    const props = '/**\n * @typedef Point\n * @property {number} x\n * @property {number} y\n\n * @param {Point} p\n */\n';

    expect([...typedefFields(props).keys()]).toEqual(['Point']);
    expect(propertyFields(props).map(({ key }) => key)).toEqual(['x', 'y']);
    expect(registryOf('{Point}', typedefFields(props))?.origin).toBe('el @typedef');
    expect(registryOf('{object}', typedefFields(props))).toBeNull();
  });

  it('typedefFields lee las TRES formas de declarar un @typedef', () => {
    // El tipo inline que ES el registro, y el nombre suelto. Las dos ya se leian.
    const inline = '/**\n * @typedef {{ x: number, y: number }} Point\n */\n';
    const bare = '/**\n * @typedef Point\n * @property {number} x\n * @property {number} y\n */\n';

    expect(typedefFields(inline).get('Point').map(({ key }) => key)).toEqual(['x', 'y']);
    expect(typedefFields(bare).get('Point').map(({ key }) => key)).toEqual(['x', 'y']);

    // La que se escribia de verdad —`@typedef {object} Point` y la promesa en los
    // `@property` de debajo— caia en silencio: el inline no prometia ninguna clave y el
    // bloque se descartaba, asi que un `@typedef` de un componente no lo vigilaba nadie.
    const object = '/**\n * @typedef {object} Point\n * @property {number} x\n */\n';

    expect([...typedefFields(object).get('Point').map(({ key }) => key)]).toEqual(['x']);
    expect(registryOf('{Point}', typedefFields(object))?.origin).toBe('el @typedef');
  });

  it('inlineRegistryOffenses delata la clave que el @typedef promete y el codigo no lee', () => {
    const source = [
      '/**',
      ' * @typedef Point',
      ' * @property {number} x',
      ' * @property {number} y',
      ' */',
      '',
      '/**',
      ' * @param {Point} p',
      ' */',
      'export function draw (p) {',
      '  return p.x;',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source))
      .toEqual(['p.y (el @typedef lo promete y el código no lo lee)']);
  });

  it('inlineRegistryOffenses delata la clave que el @returns promete y no se retorna', () => {
    const source = [
      '/**',
      ' * @returns {{ begin: function(*):boolean, zzzGhost: function():boolean }}',
      ' */',
      'export function notices () {',
      '  function begin (value) { return true; }',
      '',
      '  return { begin };',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source))
      .toEqual(['notices.zzzGhost (el @returns lo promete y el callable no lo retorna)']);

    // el `const api = { ... }` que luego se devuelve cuenta igual, y lo que retorna una
    // funcion ANIDADA no salva la promesa: se mide el cuerpo del callable
    const deep = source
      .replace('  return { begin };\n', '  const api = { begin };\n\n  return api;\n');

    expect(inlineRegistryOffenses(deep))
      .toEqual(['notices.zzzGhost (el @returns lo promete y el callable no lo retorna)']);
  });

  it('no juzga un @returns sin claves ni un callable de cuerpo ilegible', () => {
    expect(inlineRegistryOffenses('/**\n * @returns {object} la copia\n */\nexport function f () {\n  return { a: 1 };\n}\n'))
      .toEqual([]);
    expect(inlineRegistryOffenses('/**\n * @returns {{ a: number }} lo que sea\n */\nconst f = (x) => ({ a: x });\n'))
      .toEqual([]);
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


/* ---------------------------------------------------------------------------
 * Guardia de las funciones exportadas
 * ------------------------------------------------------------------------- */

describe('funciones exportadas', () => {
  it('exportedFunctions lista los `export function` (async incluido) y no las internas', () => {
    const source = 'export function a() {}\nexport async function b() {}\nfunction c() {}\n';

    expect(exportedFunctions(source).map(({ name }) => name)).toEqual(['a', 'b']);
  });

  it('undocumentedExports perdona el bloque propio y la cabecera que la nombra', () => {
    expect(undocumentedExports('export function a() {}\n')).toEqual(['a']);
    expect(undocumentedExports('/** doc. */\nexport function a() {}\n')).toEqual([]);
    expect(undocumentedExports(
      '/**\n * Usage:\n *   a();\n */\nconst X = 1;\nexport function a() {}\n')).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * El escaner de regex y el clasificador de sus clases
 * ------------------------------------------------------------------------- */

describe('el escaner de regex', () => {
  it('regexPatternsOf ve los literales, y de un `/` de division no hace caso', () => {
    // El `/` que divide va detras de un valor, y un literal detras de un operador o de
    // una palabra: es la misma barra y son dos cosas, asi que el escaner mira QUE HAY
    // delante antes de leer el patron.
    const source = "const a = ancho / 2;\n"
      + "const b = lista.split(/[,;]/);\n"
      + "const c = re.test(valor);\n"
      + "const d = algo.replace(/(?:^|,)([a-z]+)/gi, $1);";

    expect(regexPatternsOf(source).map(({ pattern }) => pattern))
      .toEqual(['[,;]', '(?:^|,)([a-z]+)']);
  });

  it('regexPatternsOf lee tambien el regex armado como cadena, y salta comentarios y cadenas', () => {
    // `new RegExp('...')` es un regex escrito de otra manera, asi que entra; el
    // comentario y el texto de una cadena no, que ahi un patron es otra cosa.
    const source = "// el /falso/ del comentario\n"
      + "const r = new RegExp('\\\\s*');\n"
      + "const s = '/tampoco/';\n"
      + "const t = '\\\\d+'.test(x);";

    expect(regexPatternsOf(source).map(({ pattern }) => pattern)).toEqual(["\\s*"]);
    expect(regexPatternsOf(source).every(({ at }) => source[at] === "'")).toBe(true);
  });

  it('el indice que trae cada patron es el de su apertura, no el de su cierre', () => {
    const source = "const a = 1;\nconst b = /[a-z]+/.exec(s);";
    const [{ pattern, at }] = regexPatternsOf(source);

    expect(pattern).toBe('[a-z]+');
    expect(source.slice(at, at + 1)).toBe('/');
    expect(source.slice(0, at).split('\n').length).toBe(2);
  });
});

describe('las clases de un regex de lectura', () => {
  const con = (source) => regexOffenses([['x.js', source]]);

  it('la tabla declara las dos clases, con el nombre con el que se piden', () => {
    expect(REGEX_CLASS_NAMES).toEqual([
      'se come el separador de cola',
      'corta por corchetes donde va una llave',
    ]);
  });

  it('cada clase muerde en su fallo y perdona en el suyo', () => {
    const come = "const n = 'a=1,b=2'.match(/(?:^|,)(\\w+)[,;]/)[1];";
    const arreglado = "const n = 'a=1,b=2'.match(/(?:^|,)(\\w+)(?=,|$)/)[1];";
    const corte = "const t = '[a]'.match(/^\\[(.*)\\]$/)[1];";
    const llave = "const t = '{a}'.match(/^{(.*)}$/)[1];";

    expect(con(come)).toEqual(["x.js:1: /(?:^|,)(\\w+)[,;]/"]);
    expect(con(arreglado)).toEqual([]);

    expect(regexOffenses([['x.js', corte]], 'corta por corchetes donde va una llave'))
      .toEqual(["x.js:1: /^\\[(.*)\\]$/"]);
    expect(regexOffenses([['x.js', corte]], 'se come el separador de cola')).toEqual([]);
    expect(regexOffenses([['x.js', llave]], 'corta por corchetes donde va una llave'))
      .toEqual([]);
  });

  it('sin decir clase juzga a TODAS, y el hallazgo es uno aunque caiga en dos', () => {
    // Un patron puede caer en las dos clases a la vez —corta por corchetes y ademas pide y
    // se come el separador— y eso es un hallazgo, no dos: la lista no se repite.
    const dos = "const re = /^\\[(?:^|,)\\],(?:^|,)$/;";

    expect(con(dos)).toHaveLength(1);
    expect(con(dos)).toEqual(["x.js:1: /^\\[(?:^|,)\\],(?:^|,)$/"]);
  });

  it('pedir una clase que no existe revienta en vez de devolver una lista vacia', () => {
    // Un nombre mal escrito callaria el barrido entero y el test que lo pide seguiria en
    // verde: es el fallo que un `toEqual([])` no delata.
    expect(() => regexOffenses([['x.js', 'const a = /x/;']], 'se come la cola'))
      .toThrow(/clase de regex desconocida/);
  });
});

describe('el diagnostico y el informe del contrato', () => {
  // Una entrada SOLA y una guia vacia: todo lo que el diagnostico puede delatar sale de
  // ahi, sin el repo delante. Es lo que permite morderlo aqui, en los unitarios, y no
  // solo en el contrato, que lo llama con el contexto entero.
  const entrada = (extra = {}) => ({
    number: 1,
    name: 'primera',
    title: 'Una regla',
    assertion: "it('una', () => {",
    about: 'Lo que persigue la unica regla del ejemplo.',
    limit: 'Lo que no juzga, que es otra cosa.',
    edge: '3',
    recipe: {
      module: 'components/knob.js',
      cited: ['un mensaje'],
      mutate: () => {},
      safe: () => {},
    },
    ...extra,
  });
  const contexto = (extra = {}) => ({
    catalogo: [entrada()],
    guide: '',
    header: '',
    rules: '',
    autoTests: '',
    families: new Map(),
    modulos: [],
    libreria: [],
    ...extra,
  });

  it('el informe da la lista entera de una vez, con el resumen al final', () => {
    // Una entrada con la guia vacia esta a MEDIO DECLARAR en todos sus sitios, y el
    // informe los enseña todos de una vez: si saliera solo el primero, quien lo leyera
    //aria una visita por sitio.
    const informe = informeDiagnostico(contexto());

    // Un hueco puede ser de la guia entera —el bloque de limites que falta en la
    // cabecera— y ese no nombra ninguna entrada: lo que se exige es que el de una regla
    // la nombre, porque quien lo lee tiene que saber a que se va. Los cuatro son los que
    // la guia vacia deja: encabezado, fila, linea de cabecera y bloque de mensaje.
    const deLaRegla = informe.huecos.filter(({ texto }) => texto.includes('regla 1 (primera)'));

    expect(deLaRegla.map(({ texto }) => texto)).toEqual([
      'regla 1 (primera): falta el encabezado en la guía (**1. Una regla** (`primera`).)',
      'regla 1 (primera): falta la fila de la tabla, o no es la que genera el catalogo',
      'regla 1 (primera): falta la línea de la cabecera (1. UNA REGLA)',
      'regla 1 (primera): falta el bloque de mensaje en la guía',
    ]);
    expect(informe.huecos.filter(({ clase }) => clase === 'sitio')
      .map(({ texto }) => texto), 'y el resto es de la guia, no de una entrada que no sea')
      .toHaveLength(5);
    expect(informe.lineas.filter((linea) => linea.startsWith('regla 1 (primera):'))
      .length, 'el informe no puede enseñar un hueco por visita').toBe(deLaRegla.length);
    // El resumen va DESPUES de la lista, y detras de el el desglose por sitio: sin ese
    // segundo bloque, cinco huecos en cuatro sitios distintos se leen como cinco viajes.
    expect(informe.lineas[5]).toBe('resumen del diagnóstico: 0 descuidos, '
      + '0 entradas a medio declarar y 5 huecos de sitio');
    expect(informe.lineas.slice(6).map((linea) => linea.trim().split(' \u00b7 ')[1].trim()))
      .toEqual([
        'el encabezado de la guía (1): regla 1 (primera)',
        'la fila de la tabla (1): regla 1 (primera)',
        'la línea de la cabecera (1): regla 1 (primera)',
        'el bloque de mensaje (1): regla 1 (primera)',
        'el bloque de límites de la cabecera (1):',
      ]);
  });

  it('las tres clases se cuentan aparte, y el resumen las lista por sitio', () => {
    // Un descuido —un campo declarado y en blanco—, una entrada a medio declarar —la que
    // no trae receta— y un hueco de sitio —una entrada entera que la guia no imprime—
    // son tres arreglos distintos, y un solo recuento los esconderia.
    const conHueco = { ...entrada(), about: '  ' };
    const sinReceta = { ...entrada(), number: 2, name: 'segunda', recipe: null };
    const completa = { ...entrada(), number: 3, name: 'tercera' };
    const huecos = diagnostico(contexto({
      catalogo: [conHueco, sinReceta, completa],
    }));

    expect(huecos.filter(({ clase }) => clase === 'descuido').map(({ texto }) => texto))
      .toEqual(['regla 1 (primera): la prosa de la tabla está declarada y en blanco']);
    expect(huecos.some(({ texto }) => texto.startsWith('regla 2 (segunda): el catálogo no le da receta')))
      .toBe(true);

    const resumen = resumenDiagnostico(huecos);

    expect(resumen[0], 'el resumen cuenta las tres clases')
      .toMatch(/^resumen del diagnóstico: 1 descuido, 1 entrada a medio declarar \(1 hueco\) y \d+ huecos de sitio$/);
    expect(resumen.some((linea) => linea.includes('descuidos · la prosa de la tabla'))).toBe(true);
  });

  it('sin nada que delatar, el informe es la lista vacia', () => {
    // La puerta del CI compara el informe entero, y con hueco de mas se leeria como un
    // fallo del audit: el caso limpio tiene que ser exactamente [], no una lista de ceros.
    const sinHuecos = { catalogo: [], guide: '', header: '', rules: '', autoTests: '',
      families: new Map(), modulos: [], libreria: [] };

    expect(informeDiagnostico(sinHuecos).lineas).toEqual([]);
    expect(ruleGaps(sinHuecos)).toEqual([]);
  });

  it('el guard de claves repetidas muerde tambien aqui, con modulos de mentira', () => {
    // El guard no mira el repo: mira los modulos que le pasen. Con uno que declara dos
    // veces la misma clave —y otro que ya lo saca de la otra familia— el aviso tiene que
    // salir con las dos lineas, que es lo que hay que borrar.
    const doble = {
      label: 'capas.js',
      ruta: 'tests/audit/capas.js',
      source: "const x = { a: 1,\n  a: 2,\n};\n",
    };
    const queLoSaca = { label: 'otra.js', source: "import { a } from './capas.js';\n" };
    const modulos = [doble, queLoSaca];

    expect(ruleGaps(contexto({ modulos })).filter((hueco) => hueco.includes('la clave')))
      .toEqual(['tests/audit/capas.js: la clave a está declarada 2 veces (líneas 1, 2)']);
    expect(ruleGaps(contexto({ modulos: [{ label: 'limpio.js', source: 'const y = { b: 1 };\n' }] }))
      .filter((hueco) => hueco.includes('la clave')), 'el modulo limpio calla')
      .toEqual([]);
  });

  it('el aviso de clave repetida lleva la ruta del modulo, y con los homonimos tambien', () => {
    // El aviso tiene que decir QUE FICHERO hay que abrir, y para eso la ruta: la etiqueta de
    // un modulo del audit es `records.js`, que sola no dice ni de donde es. Y lo que de
    // verdad importa es el caso de dos modulos HOMONIMOS —una capa y una regla que toman el
    // mismo nombre—, donde dos avisos con el mismo nombre a secas no se distinguen y con la
    // ruta si.
    const repetido = 'const x = { a: 1,\n  a: 2,\n};\n';
    const de = (label) => ({ label, ruta: `tests/audit/${label}`, source: repetido });
    const claves = (modulos) => ruleGaps(contexto({ modulos }))
      .filter((hueco) => hueco.includes('la clave'));

    expect(claves([de('records.js')])).toEqual([
      'tests/audit/records.js: la clave a está declarada 2 veces (líneas 1, 2)',
    ]);

    // Dos homonimos: el de `rules/` no avisa (lo hace el de su regla, que dice mas), pero el
    // de la raiz sale con SU ruta, que es lo que dice cual de los dos hay que abrir.
    expect(claves([de('records.js'), de('rules/records.js')])).toEqual([
      'tests/audit/records.js: la clave a está declarada 2 veces (líneas 1, 2)',
    ]);

    // Un modulo al que le falte la ruta —uno de mentira— cae a la etiqueta en vez de
    // imprimir `undefined` delante de los dos puntos.
    expect(claves([
      { label: 'records.js', source: repetido },
      { label: 'rules/records.js', source: repetido },
    ])).toEqual(['records.js: la clave a está declarada 2 veces (líneas 1, 2)']);
  });

  it('el mismo guard mira los controles de components/, con su propio sitio', () => {
    // El objeto de opciones de un constructor y el mapa de renderers son literales
    // anidados, y alli una clave repetida se pierde igual de en silencio: la ultima gana,
    // la anterior desaparece del objeto evaluado, y el control se registra con sus defaults
    // sin que nada diga que una opcion se quedo sin leer. Por eso el mismo guard, con la
    // misma homonimia y las dos lineas — pero con otro SITIO, para que el resumen diga de
    // que lista sale el descuido en vez de mezclar un control con un modulo del audit.
    const repetido = 'const x = { b: 1,\n  b: 2,\n};\n';
    const de = (label) => ({ label, ruta: `components/${label}`, source: repetido });
    const huecos = (libreria) => diagnostico(contexto({ libreria }))
      .filter(({ texto }) => texto.includes('la clave'));

    expect(huecos([de('knob.js')])).toEqual([{
      clase: 'descuido',
      texto: 'components/knob.js: la clave b está declarada 2 veces (líneas 1, 2)',
      sitio: 'una clave repetida en un control',
    }]);

    // Dos controles homonimos: los dos avisos salen y las dos rutas los distinguen, que es
    // justo lo que un `knob.js:` a secas no haria —y en un control la etiqueta no lleva
    // siquiera su directorio, asi que ahi la ruta no es un extra: es lo unico que hay.
    expect(huecos([de('knob.js'), de('sub/knob.js')]).map(({ texto }) => texto))
      .toEqual([
        'components/knob.js: la clave b está declarada 2 veces (líneas 1, 2)',
        'components/sub/knob.js: la clave b está declarada 2 veces (líneas 1, 2)',
      ]);

    // Y las dos listas no se pisan: un modulo del audit con la misma clave repetida sale con
    // SU sitio, y los dos van en la misma lista de una vez.
    const delAudit = diagnostico(contexto({
      modulos: [{ label: 'scan.js', ruta: 'tests/audit/scan.js', source: repetido }],
      libreria: [de('knob.js')],
    })).filter(({ texto }) => texto.includes('la clave'));

    expect(delAudit.map(({ texto, sitio }) => [texto, sitio])).toEqual([
      ['tests/audit/scan.js: la clave b está declarada 2 veces (líneas 1, 2)',
        'una clave declarada dos veces'],
      ['components/knob.js: la clave b está declarada 2 veces (líneas 1, 2)',
        'una clave repetida en un control'],
    ]);
  });
});

describe('los lectores que muerde el diagnostico', () => {
  it('una clave sin valor tambien se ve: la forma de PATRON, no solo `clave: valor`', () => {
    // La segunda forma de declarar una clave. En un literal es la abreviada (`{ a, a }`) y
    // en la firma de una funcion o en un `const` es un binding (`function f({ a, a }) {}`),
    // y en los dos casos lo que se repite es la clave del objeto del que se lee: la anterior
    // se va sin dejar rastro y el arreglo es el mismo, borrar una de las dos lineas. Con el
    // lector pidiendo los dos puntos, esa forma no se veia.
    const de = (cuerpo) => `export const x = ${cuerpo};\n`;

    expect(clavesRepetidasDelModulo(de('{ a: 1,\n  a: 2 }')), 'con su valor').toEqual([['a', [1, 2]]]);
    expect(clavesRepetidasDelModulo(de('{ a,\n  a }')), 'abreviada').toEqual([['a', [1, 2]]]);
    expect(clavesRepetidasDelModulo('export function f({\n  a,\n  a }) {\n  return a;\n}\n'),
      'y en la firma de una funcion, que es donde mas se escribe').toEqual([['a', [2, 3]]]);
    expect(clavesRepetidasDelModulo('export const { a,\n  a } = opts;\n'),
      'y en una asignacion suelta').toEqual([['a', [1, 2]]]);

    // Lo que NO es una clave: un spread, una llamada, un miembro, un indice calculado. Si
    // contaran, cualquier objeto de este repo tendria hallazgos.
    for (const [nombre, cuerpo] of [
      ['spread', '{ ...base, a: 1, b: 2 }'],
      ['metodo', '{ a() { return 1; }, b() { return 2; } }'],
      ['miembro', '{ a: 1, b: a.c }'],
      ['computed', '{ [k]: 1, [j]: 2 }'],
    ])
      expect(clavesRepetidasDelModulo(de(cuerpo)), nombre).toEqual([]);
  });

  it('una plantilla se lee por sus dos mitades: el texto no, el codigo de las expresiones si', () => {
    // El TEXTO de una plantilla es un ejemplo, no codigo que corra: delatarlo seria
    // inventar un fallo. El codigo de una interpolacion si es codigo de verdad, y se lee
    // como el de al lado. La prosa del lector decia lo contrario — y era falso.
    expect(clavesRepetidasDelModulo('export const s = `const x = { a: 1,\n  a: 2 };`;\n'),
      'el texto de la plantilla').toEqual([]);
    expect(clavesRepetidasDelModulo('export const s = `x = ${{ a: 1,\n  a: 2 }}`;\n'),
      'el codigo de la interpolacion').toEqual([['a', [1, 2]]]);
  });

  it('la prosa de ejemplo no se mira: una llave en un comentario no es un literal', () => {
    // El guard acaba delatandose a si mismo sin este salto: la prosa del audit esta llena
    // de codigo de ejemplo, y con la forma de patron —que no lleva dos puntos—
    // esas llaves cuentan como literales de verdad. Ni el backtick sin pareja del comentario
    // de al lado puede comerse el codigo que viene despues.
    const fuente = [
      '/** Un ejemplo: `{ a, a }` y un backtick suelto ` que no cierra nada. */',
      'export function f(o) {',
      '  return o;',
      '}',
      '',
      'const g = { b: 1,',
      '  b: 2 };',
      '',
    ].join('\n');

    expect(clavesRepetidasDelModulo(fuente)).toEqual([['b', [6, 7]]]);
  });

  it('indicesDeLiterales ve los literales ANIDADOS, no solo el de mas arriba', () => {
    // Si la lectura saltase al cierre de cada llave, el literal que vive dentro del
    // valor de una clave no se miraria, y una clave repetida ahi pasaria.
    const fuente = 'const a = { b: { c: 1 } };\nconst d = { e: 2 };\n';

    expect(indicesDeLiterales(fuente).map((at) => fuente[at])).toEqual(['{', '{', '{']);
  });

  it('clavesDePrimerNivel cita la linea de la CLAVE, no la de la coma de antes', () => {
    const fuente = 'const a = {\n  b: 1,\n  c: 2,\n};\n';

    expect(clavesDePrimerNivel(fuente, fuente.indexOf('{')))
      .toEqual([{ nombre: 'b', linea: 2 }, { nombre: 'c', linea: 3 }]);
  });

  it('clavesRepetidas ve la repetida y deja pasar la que esta una vez', () => {
    const fuente = 'const a = { b: 1,\n  b: 2,\n  c: 3,\n};\n';
    const desde = fuente.indexOf('{');

    expect(clavesRepetidas(fuente, desde)).toEqual([['b', [1, 2]]]);
  });

  it('clavesRepetidasDelModulo barre el fichero entero, y lo memoiza', () => {
    // El archivo entero, con el duplicado en un literal anidado, y la segunda llamada
    // tiene que dar lo mismo sin que el resultado cambie: la memoria es por el fuente.
    const fuente = 'const a = { b: { c: 1,\n  c: 2 } };\n';

    expect(clavesRepetidasDelModulo(fuente)).toEqual([['c', [1, 2]]]);
    expect(clavesRepetidasDelModulo(fuente)).toEqual([['c', [1, 2]]]);
    expect(clavesRepetidasDelModulo('const a = { b: 1 };\n'), 'el fuente limpio calla')
      .toEqual([]);
  });

  it('literalesDeEntrada encuentra los DOS literales y no se inventa el tercero', () => {
    const fuente = [
      'export const primeraRule = {',
      '  number: 1,',
      "  recipe: { module: 'x.js' },",
      '};',
      '',
    ].join('\n');

    expect(literalesDeEntrada(fuente, 'primera')).toEqual({
      entrada: fuente.indexOf('{'),
      receta: fuente.indexOf('{', fuente.indexOf('recipe:')),
    });
    expect(literalesDeEntrada(fuente, 'otra'), 'un nombre que no esta no es un acierto')
      .toEqual({ entrada: -1, receta: -1 });
  });
});

describe('las piezas de prosa y de mensaje', () => {
  it('lineaDe cuenta la aparicion que se le pide, y avisa si no esta', () => {
    // El numero de linea escrito a mano se descoloca en cuanto el fuente crece; y una
    // aparicion que no existe no es una linea, es un test mirando algo que ya no esta.
    const fuente = 'uno\ndos\ntres\nuno\n';

    expect(lineaDe(fuente, 'uno')).toBe(1);
    expect(lineaDe(fuente, 'uno', 1), 'la segunda aparicion es la que se pide').toBe(4);
    expect(lineaDe(fuente, 'uno', 0, fuente.indexOf('tres')),
      'con arranque se cuenta desde ahi, y la de antes ya no vale').toBe(4);
    expect(() => lineaDe(fuente, 'cuatro')).toThrow(/no sale 1 vez/);
    expect(() => lineaDe(fuente, 'uno', 1, fuente.indexOf('tres')),
      'contar dos desde el arranque es una que no esta').toThrow(/no sale 2 veces/);
  });

  it('sharedProse solo devuelve algo cuando la racha empalma de verdad', () => {
    // Tres palabras es el umbral, y ademas la racha tiene que comerse media parte del
    // texto mas corto: cuatro palabras sueltas dentro de un texto de nueve no son un
    // empalme, son el nombre de una opcion citado en dos sitios.
    expect(sharedProse('leer la opcion del panel del widget cada vez',
      'la opcion del panel se guarda luego en su sitio')).toBe('');
    expect(sharedProse('la guia explica la opcion y su limite honesto',
      'la opcion se explica y su limite tambien'),
    'tres palabras justas tampoco empalman').toBe('');
    // Aqui las dos mitades SI cuadran —la racha de dos se come el texto mas corto
    // entero— y lo unico que la para es el umbral: sin el, un nombre de opcion
    // repetido en dos avisos contaria como prosa compartida.
    expect(sharedProse('el panel', 'el panel duerme')).toBe('');
    expect(sharedProse('el codigo lee la opcion del panel',
      'el codigo lee la opcion del panel y nada mas'))
      .toBe('el codigo lee la opcion del panel');
    expect(recorte('uno dos tres cuatro cinco seis siete'), 'el aviso recorta a seis palabras')
      .toBe('uno dos tres cuatro cinco seis…');
  });

  it('guideMessageBlock sale de la receta, y cambiar una cita lo cambia entero', () => {
    const receta = { module: 'components/knob.js', cited: ['a', 'b'] };

    expect(guideMessageBlock(receta, 'su it()')).toBe([
      'components/knob.js: su it()',
      "expected [ 'a', 'b' ] to deeply equal []",
    ].join('\n'));
    expect(guideMessageBlock({ ...receta, cited: ['a'] }, 'su it()'))
      .not.toBe(guideMessageBlock(receta, 'su it()'));
  });

  it('recipeCases mete el caso de fabrica detras del base, y con su forma', () => {
    const receta = { ...entradaDePrueba(), factory: { cited: ['otro'] } };
    const citas = recipeCases({ recipe: receta });

    expect(citas.map(({ texto }) => texto)).toEqual(['un mensaje', 'otro']);
    expect(citas[1].form, 'el caso de fabrica se imprime aparte').toContain('fabrica');
  });

  it('limiteConTexto y importedNames: un texto con bordes no esta, y un alias se pide por su nombre', () => {
    expect(limiteConTexto('algo')).toBe(true);
    expect(limiteConTexto('   '), 'un hueco de espacios no es un limite').toBe(false);
    expect(limiteConTexto(null), 'lo que no esta no es un limite').toBe(false);

    expect(importedNames("import { a, b as c } from './x.js';\n", './x.js'))
      .toEqual(['a', 'b']);
  });

  it('halfDeclaredRules delata un nombre que solo los auto-tests alcanzan', () => {
    // Las fuentes de la familia tienen que DECLARAR los nombres: con una fuente vacia
    // no hay grafo que seguir y el guard delata tambien al que si se alcanza.
    const families = new Map([
      ['alcanzado', 'export function alcanzado() {\n  return 1;\n}\n'],
      ['fantasma', 'export function fantasma() {\n  return 2;\n}\n'],
    ]);
    const reglas = "import { alcanzado } from './detectors.js';\n";
    const autoTests = "import { alcanzado, fantasma } from './detectors.js';\n";

    expect(halfDeclaredRules({
      catalogo: [], rules: reglas, autoTests, families,
    })).toEqual(['fantasma']);
    expect(halfDeclaredRules({
      catalogo: [], rules: autoTests, autoTests, families,
    }), 'en cuanto la entrada lo alcanza, deja de delatarse').toEqual([]);

    // El CATALOGO tambien es una puerta: una entrada nombra su detector sin que las
    // reglas lo importen. Sin mirarlo, ese detector se denunciaria como fantasma
    // aunque la regla que lo corre este usandolo de verdad.
    const conPuerta = new Map([...families, ['porCatalogo',
      'export function porCatalogo() {\n  return 3;\n}\n']]);
    const autoTestsConPuerta = "import { alcanzado, porCatalogo } from './detectors.js';\n";

    expect(halfDeclaredRules({
      catalogo: [{ name: 'porCatalogo' }], rules: '', autoTests: autoTestsConPuerta,
      families: conPuerta,
    }), 'lo nombra una entrada y ya no es un fantasma').toEqual(['alcanzado']);
    expect(halfDeclaredRules({
      catalogo: [], rules: '', autoTests: autoTestsConPuerta, families: conPuerta,
    }), 'si ninguna entrada lo nombra, si lo es').toEqual(['alcanzado', 'porCatalogo']);
  });
});

const entradaDePrueba = () => ({
  module: 'components/knob.js',
  cited: ['un mensaje'],
});