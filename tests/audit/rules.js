/**
 * Las trece reglas de la auditoria de documentacion.
 *
 * Cada regla es un `describe` que recorre los modulos auditados; su `describe` de
 *
 * cobertura vigila que el detector siga viendo algo. Importa los detectores de
 *
 * ./detectors.js y no exporta nada: registra los tests al cargarse.
 */

import { describe, expect, it } from 'vitest';

import {
  ALIAS_DECLARATION,
  AUDIT_MODULES,
  BOUND_CONSTRUCTION,
  ENTRY_SHAPED,
  MODULES,
  OPTION_NAMES,
  argumentCount,
  argumentList,
  arityMismatches,
  boundedCallsWithLabels,
  branchedLiterals,
  classMembers,
  codeDefaults,
  comparedExampleArguments,
  copiedOptions,
  docBlocks,
  docParamTypes,
  documentedDefaults,
  documentedMembers,
  documentedParamTypes,
  entrySignatures,
  exampleObjectEntries,
  exportedFunctionParamTypes,
  isRecordType,
  misplacedOptions,
  moduleExporting,
  documentsOptionsObject,
  entryShapeKeys,
  enumeratedValues,
  exampleBindings,
  exampleConstructions,
  exampleFactoryCalls,
  exampleMemberAccesses,
  exampleMethodCalls,
  exampleValues,
  exportedFunctions,
  inlineRegistryOffenses,
  memberAccessPattern,
  memberDeclarations,
  memberSignatures,
  mismatchedExampleAccesses,
  mistypedExampleArguments,
  optionNames,
  optionReads,
  optionsParams,
  receiverDotPattern,
  registryOf,
  signatureParams,
  resolvedExampleOptions,
  typedefFields,
  textChainedMembers,
  undocumentedExampleCalls,
  undocumentedExports,
  unresolvedUsageClasses,
  usageBlocks,
} from './detectors.js';

import { RULES } from './detectors.js';

/* ---------------------------------------------------------------------------
 * Las trece reglas, REGISTRADAS DESDE EL CATALOGO
 * ------------------------------------------------------------------------- */

/** Registra una regla del catalogo: un `describe` con su titulo y, por modulo, el `it`
 *  `${label}: ${assertion}` que corre SU detector y exige `[]`. Una regla que no juzga
 *  TODO el inventario trae su `modules` en el catalogo (el subconjunto que si juzga).
 */
function registerRule({ title, assertion, detector, modules }) {
  describe(title, () => {
    for (const { label, source } of (modules ?? ((all) => all))(MODULES))
      it(`${label}: ${assertion}`, () => {
        expect(detector(source)).toEqual([]);
      });
  });
}

for (const rule of RULES)
  registerRule(rule);

/** La guardia de que la regla 3 sigue VIENDO las entradas ricas (no es una regla: es el
 *  caso concreto que la regla 3 necesita para no quedarse muda). */
describe('cobertura de las claves de entrada', () => {
  it('encuentra la forma de las entradas ricas (si esto falla, el detector quedó ciego)', () => {
    for (const name of ENTRY_SHAPED) {
      const source = MODULES.find((module) => module.label === name)?.source;

      expect(source, `${name} no está entre los módulos auditados`).toBeDefined();
      expect(entryShapeKeys(source)).toContain('label');
    }
  });
});

describe('cobertura de la auditoría', () => {
  it('ningún fichero que documente un objeto de opciones se queda sin parsear', () => {
    const blind = MODULES
      .filter(({ source }) => documentsOptionsObject(source) && documentedMembers(source).size === 0)
      .map(({ label }) => label);

    expect(blind).toEqual([]);
  });

  it('la auditoría ve opciones de verdad (ni lista vacía ni detector mudo)', () => {
    expect(MODULES.length).toBeGreaterThan(10);
    expect(MODULES.filter(({ source }) => documentedMembers(source).size > 0).length)
      .toBeGreaterThan(5);
    expect(MODULES.filter(({ source }) => optionReads(source).size > 0).length)
      .toBeGreaterThan(5);
  });
});

describe('cobertura de la posicion del objeto de opciones', () => {
  /** Los parametros del objeto de opciones que NO ocupan el primer lugar de la firma. */
  const outsideFirst = (source) => optionsParams(source).filter(({ index }) => index > 0);

  /** Los que llegan DESMEMBRADOS (`{ width, height } = {}`) y ademas no son el primero:
   *  la forma que mas puede esconderse, porque un parametro mas de cuenta no se nota. */
  const destructuredOutside = (source) => outsideFirst(source)
    .filter(({ destructured }) => destructured);

  it('el inventario trae el objeto de opciones fuera de la primera posicion, y tambien en la primera', () => {
    // Casi todos los constructores del repo son `constructor(container, options = {})`,
    // y hay firmas donde el objeto llega desmembrado y TAMPOCO es el primero
    // (`fitStage`: `mountFitStage(stage, { width, height, ... } = {})`; `themeSwitcher`:
    // `constructor(container, { themes, root, ... } = {})`). Aqui se exige que el
    // inventario conserve las DOS: si la lectura de los parametros se acotara al
    // primero, las cuatro firmas que si lo desmembran ahi (continuousNotices, drawer,
    // fitStage y overlayFocus) seguirian dando señal y la cuenta de "la auditoría ve
    // lecturas" no se moveria — la regla 2 se quedaria ciega justo en la convencion
    // mayoritaria, sin que nada lo delatara. Y al reves: si se acotara a "todo menos
    // el primero", las cuatro primeras se quedarian fuera. (Medido: 36 parametros que
    // son el objeto de opciones, 32 fuera del primero y en 21 modulos; 6 desmembrados,
    // 4 en el primero y 2 fuera.)
    const withParams = MODULES.filter(({ source }) => optionsParams(source).length > 0);
    const outside = MODULES.filter(({ source }) => outsideFirst(source).length > 0);
    const destructuredAtFirst = MODULES.filter(({ source }) =>
      optionsParams(source).some(({ index, destructured }) => destructured && index === 0));

    expect(withParams.length).toBeGreaterThan(10);
    expect(outside.length, 'el inventario pone el objeto de opciones SIEMPRE en el primer parametro')
      .toBeGreaterThanOrEqual(15);
    expect(destructuredAtFirst.length, 'al inventario le falta el objeto DESMEMBRADO en el primer parametro')
      .toBeGreaterThanOrEqual(3);
  });

  it('la regla 2 lee las claves del objeto desmembrado de un parametro que no es el primero', () => {
    // No basta con que la firma este en el inventario: la regla 2 tiene que LEER de ella.
    // Si sus lecturas se quedaran sin esas claves, la cobertura de arriba estaria midiendo
    // una forma que el detector ya no resuelve.
    const destructured = MODULES.flatMap(({ label, source }) =>
      destructuredOutside(source).map(({ keys }) => ({ label, keys })));

    expect(destructured.length, 'al inventario le falta el objeto DESMEMBRADO fuera del primer parametro')
      .toBeGreaterThanOrEqual(2);

    for (const { label, keys } of destructured) {
      const source = MODULES.find((module) => module.label === label)?.source;

      expect(source, `${label} no está entre los módulos auditados`).toBeDefined();

      const reads = [...optionReads(source).keys()];

      for (const key of keys)
        expect(reads, `${label}: la regla 2 no ve la clave «${key}» del parametro desmembrado`)
          .toContain(key);
    }
  });
});

/* --------------------------------------------------------------------------
 * La posicion del TIPO y del REGISTRO: la misma ligadura por posicion, en las reglas
 * 10 y 12
 * ------------------------------------------------------------------------- */

/** ¿El tipo de un `@param` promete un REGISTRO? Una llave dentro del tipo: inline de
 *  cabeza —`{ x: number, y: number }`, la forma entera que `isRecordType` reconoce—
 *  o anidado —`Array<{label: string}>`, que las dos reglas cortan con `closingIndex`—.
 *  Las dos son registros que las reglas 10 y 12 judged, y las dos se atan al parametro
 *  por su POSICION en la firma: si esa cuenta se acotara al primer parametro, ninguna
 *  de las dos llegaria a mirarse. */
const prometeRegistro = (type) => type.includes('{');

/** Los parametros que prometen un registro, con su posicion en la firma y si son
 *  opcional: un `[o]` no lo juzga la regla 12 (filtra los opcionales), asi que se cuenta
 *  aparte para no prometer cobertura que no existe. */
function recordParams(source) {
  const found = [];

  for (const { text } of docBlocks(source))
    docParamTypes(text).forEach(({ type, name, option }, index) => {
      if (prometeRegistro(type))
        found.push({ index, name, option, type });
    });

  return found;
}

/** Las llamadas de un ejemplo en las que un ARGUMENTO es un objeto literal y la firma
 *  promete un registro EN ESA MISMA posicion: la evidencia de que la regla 10 cruza de
 *  verdad `params[i]` con `argumentList(args)[i]`, y no solo con el primero. */
function recordArguments(modulo) {
  const found = [];

  for (const call of boundedCallsWithLabels(modulo.source, [modulo])) {
    const target = moduleExporting(call.className, [modulo]);

    if (target == null)
      continue;

    const params = call.member === call.className
      ? exportedFunctionParamTypes(target.source, call.className)
      : documentedParamTypes(target.source, call.className, call.member);

    if (params == null)
      continue;

    argumentList(call.args).forEach((arg, index) => {
      if (!isRecordType(params[index]?.type ?? ''))
        return;

      found.push({
        ...call,
        index,
        arg,
        type: params[index].type,
        keys: exampleObjectEntries(arg).map(({ key }) => key),
      });
    });
  }

  return found;
}

describe('cobertura de la posicion del tipo y del registro', () => {
  it('el inventario conserva registros inline fuera de la primera posicion, y tambien en la primera', () => {
    // La misma partida que la del objeto de opciones, con el tipo por delante: la regla 10
    // (los argumentos de un ejemplo contra la firma) y la 12 (las claves que un registro
    // promete y el codigo no lee) atan su `@param` al resto por su indice. El repo tiene
    // las dos mitades: `attachDrag(element, handlers)` y `createLcdScreen.preview(lineIdx,
    // text, o)` de un lado, y `XYPad.setValue(value)`, `createDrawer.setHeader(next)` y el
    // `spec` de overlayFocus del otro. Si la cuenta se acotara al primer parametro, las
    // cinco de fuera no las miraria nadie; si se acotara a todo menos el primero, las tres
    // de dentro desaparecerian. (Medido: 8 parametros con registro, 5 fuera del primero
    // en 3 modulos y 3 en el primero en 3 modulos; uno de los de fuera es anidado,
    // el `Array<{id: string, …}>` de los temas.)
    const params = MODULES.flatMap(({ label, source }) =>
      recordParams(source).map(({ index, name, type }) => ({ label, index, name, type })));
    const outside = params.filter(({ index }) => index > 0);
    const first = params.filter(({ index }) => index === 0);

    expect(outside.length, 'el inventario no tiene registros inline fuera del primer parametro')
      .toBeGreaterThanOrEqual(4);
    expect(new Set(outside.map(({ label }) => label)).size,
      'los registros fuera del primer parametro estan todos en un solo modulo')
      .toBeGreaterThanOrEqual(3);
    expect(first.length, 'al inventario le falta un registro inline en el PRIMER parametro')
      .toBeGreaterThanOrEqual(3);
  });

  it('la regla 10 cruza el objeto del ejemplo con el registro de un parametro que no es el primero', () => {
    // No basta con que la firma este en el inventario: el ejemplo tiene que PASAR el
    // objeto en esa posicion, o `params[i]` se cruzaria siempre con un argumento que no
    // es y la regla no tendria nada que mirar.
    const bound = MODULES.flatMap((modulo) =>
      recordArguments(modulo).map((one) => ({ ...one, label: modulo.label })));
    const outside = bound.filter(({ index }) => index > 0);

    expect(outside.length, 'ningun ejemplo del inventario pasa un objeto literal en un parametro que no es el primero')
      .toBeGreaterThanOrEqual(3);
    expect(new Set(outside.map(({ label }) => label)).size,
      'los ejemplos con objeto en un parametro que no es el primero estan todos en un solo modulo')
      .toBeGreaterThanOrEqual(2);

    // y la regla tiene que LEER de ahi: una clave fantasma en un ejemplo de verdad, en la
    // posicion que le toca. Si la ligadura se quedara en el primer argumento, el mensaje
    // diria `argumento 1` (o no diria nada), que es justo lo que esta cobertura persigue.
    const [conClaves] = outside.filter(({ keys }) => keys.length > 0);
    const { label, index, keys } = conClaves;
    const modulo = MODULES.find((one) => one.label === label);
    // la llamada del ejemplo puede ocupar varias lineas, asi que se muta DENTRO del
    // bloque de uso: la clave fantasma va en el ejemplo y la firma sigue prometiendo la
    // de verdad, que es justo el cruce que la regla 10 juzga
    const bloque = usageBlocks(modulo.source).find(({ text }) => text.includes('Usage:'));
    const uso = bloque.text.slice(bloque.text.indexOf('Usage:'));
    const mutado = modulo.source.replace(uso, uso.replace(`${keys[0]}:`, 'zzzGhost:'));
    const caught = mistypedExampleArguments(mutado).filter((one) => one.includes('zzzGhost'));

    expect(mutado, `${label}: el bloque de uso no tiene la clave «${keys[0]}» que se esperaba`)
      .not.toBe(modulo.source);
    expect(mutado, `${label}: la mutacion se llevo la clave de la firma, no la del ejemplo`)
      .toContain(keys[0]);
    expect(caught, `${label}: la regla 10 no lee el registro del parametro ${index + 1}`)
      .toHaveLength(1);
    expect(caught[0]).toContain(`argumento ${index + 1}`);
    expect(caught[0]).toContain('no esta en la firma');
  });

  it('la regla 12 lee el registro de un parametro que no es el primero, y el del primero igual', () => {
    // Aqui la cuenta es mas corta y por una razon que hay que decir: la regla 12 filtra
    // los parametros opcionales (un `[o]` no es un registro que pueda faltar), y en el
    // inventario el unico registro_inline_ de cabeza y no opcional fuera de la primera
    // posicion es el `handlers` de `attachDrag` —el segundo de dos—. Es poco, y por eso
    // mismo hay que sujetarlo.
    const reales = MODULES.flatMap(({ label, source }) =>
      recordParams(source)
        .filter(({ index, option }) => index > 0 && !option)
        .map(({ index, name, type }) => ({ label, index, name, type })));

    expect(reales.length, 'ningun modulo del inventario tiene un registro que la regla 12 lea fuera del primer parametro')
      .toBeGreaterThanOrEqual(1);

    // y la regla tiene que LEER de ahi: una clave fantasma en el registro de verdad. Si la
    // ligadura por posicion se acotara al primer `@param`, el archivo pasaria limpio.
    const { label, name } = reales[0];
    const modulo = MODULES.find((one) => one.label === label);
    const mutado = modulo.source.replace('@param {{ onDelta:', '@param {{ zzzGhost: number, onDelta:');
    const caught = inlineRegistryOffenses(mutado).filter((one) => one.includes('zzzGhost'));

    expect(mutado, `${label}: el registro del parametro ${name} no esta donde se esperaba`)
      .not.toBe(modulo.source);
    expect(caught, `${label}: la regla 12 no lee el registro inline del parametro ${name}`)
      .toHaveLength(1);
    expect(caught[0]).toContain(name);
    expect(caught[0]).toContain('el registro inline lo promete y el código no lo lee');

    // y el espejo: el mismo registro en el PRIMER parametro se lee igual, con un segundo
    // parametro delante que el cuerpo SI usa. Sin esta mitad, la cobertura de arriba
    // podria estar midiendo una posicion que la regla solo sabe leer cuando es la
    // segunda. La firma lleva los nombres que promete el bloque a proposito: la regla
    // ata el `@param` a la POSICION de la firma, y un binding que no sabe leer (un
    // `p primero` que no es ni patron ni identificador) la hace callar en silencio.
    const primero = [
      '/**',
      ' * @param {{ zzzGhost: number }} primero lo promete',
      ' * @param {string} despues',
      ' */',
      'export function usa(primero, despues) {',
      '  return despues;',
      '}',
    ].join('\n');

    expect(inlineRegistryOffenses(primero)).toEqual([
      'primero.zzzGhost (el registro inline lo promete y el código no lo lee)',
    ]);
  });
});

describe('cobertura de la fuente unica de las opciones', () => {
  it('una opcion con un nombre que no esta en la lista la ven la 2, la 4 y la 5', () => {
    // La lista de nombres vivia ESCRITA A MANO en cada regla que lee una opcion: dos
    // veces en la 4, una en la 5, dos mas entre la 1 y la 2, y una en la 7. Con un
    // nombre fuera de la lista —`opciones`— no salia por ninguna; sale ahora porque lo
    // DECLARA LA FIRMA, y sale en las tres, que es el punto: el mismo nombre visto desde
    // la misma fuente, no tres listas que se olvidan entre si.
    const source = [
      '/**',
      ' * @param {number} [opciones.step]  cuanto avanza',
      ' */',
      'export class P {',
      '  constructor(el, opciones = {}) {',
      '    this._el = el;',
      '    this.step = opciones.step ?? 2;',
      '  }',
      '}',
      '',
    ].join('\n');

    expect(optionNames(source), 'el nombre que declara la firma no llega a la lista')
      .toContain('opciones');
    expect([...optionReads(source).keys()], 'la regla 2 no ve la lectura')
      .toContain('step');
    expect([...codeDefaults(source).get('step') ?? []], 'la regla 4 no ve el default')
      .toEqual(['2']);
    expect([...copiedOptions(source).keys()], 'la regla 5 no ve la copia')
      .toContain('step');
  });

  it('la regla 12 ata el @param al parametro que lo nombra, no al de su posicion', () => {
    // El bloque lista sus `@param` en el orden que le parece; la firma es la que
    // declara de verdad. Con la ligadura por indice —que es lo que se puede hacer sin
    // mirar la firma— el registro prometido aqui caia sobre `texto`, y el mensaje decia
    // el nombre equivocado.
    const source = [
      '/**',
      ' * @param {string} texto  primero en el bloque, segundo en la firma',
      ' * @param {{ zzzGhost: number }} spec',
      ' */',
      'export function pinta (spec, texto) {',
      '  return texto + spec.onDelta;',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source)).toEqual([
      'spec.zzzGhost (el registro inline lo promete y el código no lo lee)',
    ]);
  });

  it('la regla 10 cruza el argumento del parametro que lo nombra, no el de su posicion', () => {
    // Por indice el cruce no era una cobertura menor: el registro caia sobre el
    // argumento del otro parametro —una cadena, donde no hay nada que mirar—, mientras
    // que la misma regla se quejaba de que un objeto no fuese una cadena. Con el nombre
    // la cola fantasma se ve, y el falso positivo se calla.
    const source = [
      '/**',
      ' * Usage:',
      ' *   const p = new P(el);',
      ' *   p.set({ zzzGhost: 1 }, "hola");',
      ' */',
      'export class P {',
      '  /**',
      '   * @param {string} texto  primero en el bloque, segundo en la firma',
      '   * @param {{ onDelta: function(number): number }} spec',
      '   */',
      '  set(spec, texto) {',
      '    return texto + spec.onDelta(1);',
      '  }',
      '}',
      '',
    ].join('\n');

    const caught = mistypedExampleArguments(source, [{ label: 'sintetico.js', source }]);

    expect(caught.join('\n'),
      'la regla 10 no lee el registro del parametro que el bloque nombra')
      .toContain('x.zzzGhost');
    expect(caught.join('\n'), 'el cruce caido en el parametro equivocado no dice su posicion')
      .toContain('argumento 1');
    expect(caught.filter((one) => one.includes('promete string')),
      'la ligadura por indice juzgaria un objeto contra el tipo del otro parametro')
      .toEqual([]);
  });

  it('la lista de nombres de opcion esta escrita en un solo modulo del audit', () => {
    // El guardia de la cuenta de arriba protege una sola forma de equivocarse: que la
    // lista vuelva a forkedarse. Este protege la otra: que alguien la escriba otra vez
    // en el modulo que toque, con lo que un nombre nuevo llegaria a esa regla y se
    // quedaria sin vigilar en las demas sin que nada lo dijera. Vive en la capa de
    // documentos y las reglas la reciben de `optionNames`, que ademas anade los nombres
    // que declara cada firma.
    //
    // La marca sale de la propia lista y no de aqui: escrita en el comentario o en el
    // filtro seria una copia mas, y el guardia se delataria a si mismo (que es lo que
    // paso la primera vez).
    const [primero] = OPTION_NAMES;
    const escrita = AUDIT_MODULES
      .filter(({ source }) => source.includes(`${primero}|`))
      .map(({ label }) => label);

    expect(escrita, 'la lista de nombres de opcion esta escrita en mas de un modulo')
      .toEqual(['docs.js']);
  });
});

describe('cobertura de las opciones guardadas', () => {
  it('la auditoría ve huecos de verdad (ni lista vacía ni detector mudo)', () => {
    const withCopies = MODULES.filter(({ source }) => copiedOptions(source).size > 0);

    expect(withCopies.length).toBeGreaterThan(5);
  });
});

describe('cobertura de los defaults', () => {
  it('la auditoría ve defaults literales de verdad (ni lista vacía ni detector mudo)', () => {
    const withDefaults = MODULES.filter(({ source }) =>
      [...codeDefaults(source).values()].some((literals) => literals.size > 0));

    expect(withDefaults.length).toBeGreaterThan(5);
    expect(MODULES.filter(({ source }) => documentedDefaults(source).size > 0).length)
      .toBeGreaterThan(5);
  });
});

describe('cobertura de los ejemplos de uso', () => {
  it('la auditoría ve ejemplos de uso con opciones (ni lista vacía ni detector mudo)', () => {
    const withUsage = MODULES.filter(({ source }) => usageBlocks(source).length > 0);
    const withOptions = MODULES.filter(({ source }) => resolvedExampleOptions(source).length > 0);
    const keys = MODULES.reduce((sum, { source }) => sum + resolvedExampleOptions(source)
      .reduce((count, example) => count + example.keys.length, 0), 0);

    expect(withUsage.length).toBeGreaterThanOrEqual(6);
    expect(withOptions.length).toBeGreaterThanOrEqual(6);
    expect(keys).toBeGreaterThan(20);
  });

  it('toda clase construida en un bloque Usage resuelve a un módulo auditado', () => {
    expect(MODULES.flatMap(({ source }) => unresolvedUsageClasses(source))).toEqual([]);
  });

  it('la auditoría ve las claves de un ejemplo a varias líneas (el canal ` * ` no las tapa)', () => {
    const wheel = MODULES.find(({ label }) => label === 'wheel.js')?.source;
    const keys = resolvedExampleOptions(wheel).flatMap((example) => example.keys);

    expect(keys).toContain('frameWidth');    // solo vive en una linea de continuacion
    expect(keys.length).toBe(6);
  });
});

describe('cobertura de los valores enumerados', () => {
  it('la auditoría ve listas de valores de verdad (ni lista vacía ni detector mudo)', () => {
    const withList = MODULES.filter(({ source }) => enumeratedValues(source).size > 0);
    const withBranches = MODULES.filter(({ source }) => branchedLiterals(source).size > 0);

    expect(withList.length).toBeGreaterThanOrEqual(5);
    expect(withBranches.length).toBeGreaterThanOrEqual(5);
  });

  it('ve la lista de una opción y sus ramas, y no la de un vecino', () => {
    const wheel = MODULES.find(({ label }) => label === 'wheel.js')?.source;

    expect([...enumeratedValues(wheel).get('type')]).toEqual(['pitch', 'mod']);
    expect([...branchedLiterals(wheel).get('type')]).toContain('pitch');
  });

  it('ve los valores de los ejemplos', () => {
    const knob = MODULES.find(({ label }) => label === 'knob.js')?.source;

    expect(exampleValues(knob).map(({ key, value }) => `${key}=${value}`))
      .toContain('skin=ms2000');
  });
});

describe('cobertura de los métodos de los ejemplos', () => {
  it('la auditoría ve llamadas de verdad (ni lista vacía ni detector mudo)', () => {
    const withCalls = MODULES.filter(({ source }) => exampleMethodCalls(source).length > 0);
    const total = MODULES.reduce((sum, { source }) => sum + exampleMethodCalls(source).length, 0);

    expect(withCalls.length).toBeGreaterThanOrEqual(4);
    expect(total).toBeGreaterThanOrEqual(8);
  });

  it('la auditoría ve llamadas de fábrica, no solo de clases (ni detector mudo)', () => {
    // El camino nuevo: el receptor no nace de un `new` sino de una fabrica documentada
    // (`const lcd = createLcdScreen(el)`), y la clase contra la que se juzgan sus
    // llamadas es el retorno de esa fabrica (`factoryApiMembers`). La guardia de arriba
    // cuenta clases y fabricas juntas: borrar el ejemplo de la fabrica no la dejaria sin
    // llamadas, y el camino quedaria mudo sin que nadie se enterase. Esta lo aisla y
    // exige que el inventario traiga al menos uno.
    const withFactoryCalls = MODULES.filter(({ source }) => exampleFactoryCalls(source).length > 0);
    const total = MODULES.reduce((sum, { source }) => sum + exampleFactoryCalls(source).length, 0);

    expect(withFactoryCalls.length, 'ningún ejemplo del inventario llama a una fábrica')
      .toBeGreaterThanOrEqual(1);
    expect(total, 'el camino de fábrica se queda sin llamadas').toBeGreaterThanOrEqual(2);
  });

  it('ve los miembros que la clase declara, no las llamadas de sus cuerpos', () => {
    const tape = MODULES.find(({ label }) => label === 'tapeEchoVisual.js')?.source;
    const members = classMembers(tape, 'TapeEchoVisual');

    expect(members).toContain('setBPM');
    expect(members).not.toContain('clearTimeout');      // llamada dentro de un cuerpo
  });

  it('juzga también las llamadas que el ejemplo trae comentadas', () => {
    const switcher = MODULES.find(({ label }) => label === 'themeSwitcher.js')?.source;
    // El docblock entero ya es un comentario, asi que una llamada con `//` delante es la
    // misma promesa que una sin el. Se comprueba descomentando el ejemplo y comparando
    // las dos listas, y no contra un inventario escrito a mano: asi la guardia sobrevive
    // a que el ejemplo cambie de contenido y solo se rompe si el detector deja de contar
    // las comentadas (que es lo unico que vigila).
    const uncommented = switcher.replace(/\/\/(\s*\w+\.[^\n]*)/g, '$1');
    const methods = (source) => exampleMethodCalls(source).map(({ method }) => method).sort();

    expect(methods(switcher).length).toBeGreaterThan(0);
    expect(methods(uncommented)).toEqual(methods(switcher));
  });
});

describe('cobertura de la aridad de las llamadas y construcciones', () => {
  it('la auditoría mide llamadas y firmas de verdad (ni detector mudo ni cero argumentos)', () => {
    const withArgs = MODULES.filter(({ source }) => exampleMethodCalls(source).some(({ args }) => args !== ''));
    const total = MODULES.reduce((sum, { source }) => sum + exampleMethodCalls(source).length, 0);

    expect(withArgs.length).toBeGreaterThanOrEqual(3);
    expect(total).toBeGreaterThanOrEqual(8);
  });

  it('la auditoría mide la aridad de una llamada de fábrica, no solo la de una clase', () => {
    // El receptor de una fabrica entra por el mismo `exampleCallsWithLabels` que el de una
    // clase, y la firma contra la que se mide sale de la API que la fabrica devuelve: si su
    // ejemplo desapareciera, la guardia de arriba seguiria viendo llamadas y este camino
    // quedaria mudo. Se aisla, y se exige que la regla MUERDA en el: quitarle un argumento
    // a una llamada de fabrica sale con su nombre.
    const withArgs = MODULES.filter(({ source }) =>
      exampleFactoryCalls(source).some(({ args }) => args !== ''));

    expect(withArgs.length, 'ninguna llamada de fábrica del inventario trae argumentos: la aridad no tiene nada que medir')
      .toBeGreaterThanOrEqual(1);

    const lcd = MODULES.find(({ label }) => label === 'lcdScreen.js')?.source;
    const crippled = lcd.replace("lcd.setLine(0, 'PITCH +1.2')", "lcd.setLine('PITCH +1.2')");

    expect(crippled, 'la mutación no encontró su línea en lcdScreen.js').not.toBe(lcd);
    expect(arityMismatches(crippled))
      .toEqual(['createLcdScreen.setLine(): recibe 1, la firma acepta 2']);
  });
  it('lee la firma declarada, con su default y su destructuring', () => {
    const pad = MODULES.find(({ label }) => label === 'xypad.js')?.source;
    const signatures = memberSignatures(pad, 'XYPad');

    expect(signatures.get('setValue')).toEqual({ required: 1, total: 2, rest: false });
    expect(signatures.get('setCorners')).toEqual({ required: 1, total: 1, rest: false });
    expect(signatures.get('getValue')).toEqual({ required: 0, total: 0, rest: false });
  });

  it('cuenta como un solo argumento el objeto con comas que pasa el ejemplo', () => {
    const pad = MODULES.find(({ label }) => label === 'xypad.js')?.source;
    const call = exampleMethodCalls(pad).find(({ method }) => method === 'setValue');

    expect(call.args).toBe('{ x: 0.2, y: 0.8 }');
    expect(argumentCount(call.args)).toBe(1);
  });

  it('mide también los `new Clase(...)` de los ejemplos (ni detector mudo)', () => {
    const built = MODULES.filter(({ source }) => exampleConstructions(source).length > 0);
    const total = MODULES.reduce((sum, { source }) => sum + exampleConstructions(source).length, 0);

    expect(built.length).toBeGreaterThanOrEqual(4);
    expect(total).toBeGreaterThanOrEqual(6);
  });

  it('lee la firma declarada del constructor de la clase construida', () => {
    const pad = MODULES.find(({ label }) => label === 'xypad.js')?.source;

    expect(memberSignatures(pad, 'XYPad').get('constructor')).toEqual({ required: 1, total: 2, rest: false });
  });
});

describe('cobertura de los tipos de los argumentos', () => {
  it('la auditoría cruza tipos prometidos con formas reales (ni detector mudo)', () => {
    const pairs = MODULES.flatMap(({ source }) => comparedExampleArguments(source));
    const withPairs = MODULES.filter(({ source }) => comparedExampleArguments(source).length > 0);

    expect(pairs.length).toBeGreaterThanOrEqual(6);
    expect(pairs.filter(({ kind }) => kind === 'object').length).toBeGreaterThanOrEqual(4);
    expect(withPairs.length).toBeGreaterThanOrEqual(4);
  });

  it('cruza los tipos de una llamada de fábrica, no solo los de una clase', () => {
    // La firma contra la que se cruza sale de la API que la fabrica devuelve, y la etiqueta
    // del cruce lleva el NOMBRE de la fabrica (`createLcdScreen.setLine()`): es lo que
    // permite aislar este camino del de las clases, que la guardia de arriba cuenta junto.
    const withFactoryTypes = MODULES.filter(({ source }) => {
      const factory = new Set(exampleFactoryCalls(source).map(({ className }) => className));

      return comparedExampleArguments(source)
        .some(({ label }) => [...factory].some((name) => label.startsWith(`${name}.`)));
    });

    expect(withFactoryTypes.length, 'ningún ejemplo cruza los tipos de una llamada de fábrica')
      .toBeGreaterThanOrEqual(1);

    const lcd = MODULES.find(({ label }) => label === 'lcdScreen.js')?.source;
    const lying = lcd.replace("lcd.setLine(0, 'PITCH +1.2')", "lcd.setLine('cero', 'PITCH +1.2')");

    expect(lying, 'la mutación no encontró su línea en lcdScreen.js').not.toBe(lcd);
    expect(mistypedExampleArguments(lying))
      .toEqual(['createLcdScreen.setLine(): el argumento 1 es string y la firma promete number']);
  });
  it('cruza el `@param` del constructor con el objeto de opciones del ejemplo', () => {
    const pad = MODULES.find(({ label }) => label === 'xypad.js')?.source;
    const building = comparedExampleArguments(pad).filter(({ label }) => label.startsWith('new '));

    // Del constructor solo se juzga el objeto de opciones (parametro 2): el parametro 1
    // (`HTMLElement|string`) no se lee. Se busca ESE cruce y no el inventario entero,
    // que cambia con cada metodo que el ejemplo llame y documente.
    expect(building.map(({ label, param, kind }) => [label, param, kind]))
      .toContainEqual(['new XYPad()', 2, 'object']);
  });

  it('no juzga el tipo ilegible del contenedor (`HTMLElement|string`)', () => {
    const tape = MODULES.find(({ label }) => label === 'tapeEchoVisual.js')?.source;
    const building = comparedExampleArguments(tape).filter(({ label }) => label.startsWith('new '));

    // Del constructor solo entra el objeto de opciones (parametro 2, tipo `object`): el
    // parametro 1 promete `HTMLElement|string`, que no se lee entero, asi que no se
    // juzga. Los metodos del ejemplo traen `@param` legible y se juzgan aparte.
    expect(building.map(({ param, type }) => [param, type])).toEqual([[2, 'object']]);
  });

  it('todo método (y `new Clase(...)`) que un ejemplo usa con argumentos tiene firma con `@param`', () => {
    // Si un ejemplo pasa argumentos a una firma que no documenta ningun `@param`, la
    // regla 10 no tiene nada que cruzar ahi y el hueco se cierra en silencio: la firma
    // existe pero no promete tipos. Una llamada sin argumentos no exige `@param`, y un
    // metodo que la clase no declara es cosa de la regla 8.
    const offenses = MODULES.flatMap(({ source }) => undocumentedExampleCalls(source));

    expect(offenses).toEqual([]);
  });

  it('el callback de un campo de funcion inline se cruza con su firma', () => {
    // El `Usage:` real de drag-core ata `attachDrag` y pasa una flecha a `onDelta`,
    // cuyo tipo inline `function(number, number): number` ya se LEE: la flecha que
    // nombre MAS parametros de los que recibe, o un retorno de otra familia, no
    // pasa el cruce (nombrar menos es legal, como en TS).
    const drag = MODULES.find(({ label }) => label === 'drag-core.js')?.source;

    expect(drag, 'drag-core.js no esta entre los modulos auditados').toBeDefined();
    expect(mistypedExampleArguments(drag)).toEqual([]);

    const wider = drag.replace('onDelta: (turns) => value + turns',
      'onDelta: (turns, extra, third) => value + turns');

    expect(mistypedExampleArguments(wider))
      .toEqual(['attachDrag() (argumento 2): la clave attachDrag.onDelta recibe 3, su firma pide 2']);

    const lying = drag.replace('onDelta: (turns) => value + turns',
      "onDelta: (turns) => 'no'");

    expect(mistypedExampleArguments(lying))
      .toEqual(['attachDrag() (argumento 2): la clave attachDrag.onDelta es string y la firma promete devolver number']);
  });

  it('las llamadas a funciones sueltas siguen fuera del cruce', () => {
    // El alcance se decidio, no se improvisa: la llamada ATADA entra (el `Usage:`
    // de drag-core), la SUELTA no — hay fabricas documentadas sin `@param`
    // (createLcdScreen, registerSkin) que la guardia despertaria. Si un dia las
    // sueltas entran, este test tiene que cambiar a proposito.
    const source = [
      '/**',
      ' * Usage:',
      ' *   attachDrag(el, { onDelta: (t) => t });',
      ' */',
      'export function attachDrag (element, handlers) {',
      '  return () => {};',
      '}',
      '',
    ].join('\n');

    expect(mistypedExampleArguments(source, [{ label: 'drag-core.js', source }])).toEqual([]);
  });
});

describe('cobertura de los registros prometidos', () => {
  it('la guardia delata una clave fantasma en un registro inline (mutación)', () => {
    const drag = MODULES.find(({ label }) => label === 'drag-core.js')?.source;

    expect(drag, 'drag-core.js no está entre los módulos auditados').toBeDefined();

    const ghost = drag.replace(
      'onStep?: function(number): number }} handlers',
      'onStep?: function(number): number, zzzGhost?: number }} handlers');

    expect(ghost).not.toBe(drag);
    expect(inlineRegistryOffenses(ghost))
      .toContain('handlers.zzzGhost (el registro inline lo promete y el código no lo lee)');
  });

  it('el cruce con desestructuracion y renombre sigue vivo (drawer.setHeader)', () => {
    const drawer = MODULES.find(({ label }) => label === 'drawer.js')?.source;

    expect(drawer).toBeDefined();
    expect(inlineRegistryOffenses(drawer)).toEqual([]);
  });

  it('la guardia cruza el @typedef que promete una clave que el callable no lee', () => {
    // El registro no vive en el propio `@param`: el tipo nombra a un `@typedef` con sus
    // `@property`, y la promesa se cruza igual contra las lecturas del callable.
    const source = [
      '/**',
      ' * @typedef {{ x: number, zzzGhost: number }} Point',
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
      .toEqual(['p.zzzGhost (el @typedef lo promete y el código no lo lee)']);
    expect(inlineRegistryOffenses(source.replace('return p.x;', 'return p.x + p.zzzGhost;')))
      .toEqual([]);
  });

  it('la guardia cruza el @returns que promete una clave que el callable no retorna', () => {
    const source = [
      '/**',
      ' * @returns {{ scale: number, zzzGhost: number }}',
      ' */',
      'export function fit (p) {',
      '  return { scale: p.scale };',
      '}',
      '',
    ].join('\n');

    expect(inlineRegistryOffenses(source))
      .toEqual(['fit.zzzGhost (el @returns lo promete y el callable no lo retorna)']);
    expect(inlineRegistryOffenses(source.replace('scale: number, zzzGhost: number', 'scale: number')))
      .toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * El @typedef: la otra forma de la promesa de la regla 12, VIVA en el inventario
 * ------------------------------------------------------------------------- */

/** Los `@typedef` que algun `@param` de un modulo NOMBRA —la promesa que vive en otro
 *  bloque—, con su fuente: `[{ label, source, type, fields }]`. La forma inline se queda
 *  fuera (su `origin` es el registro inline), asi que lo que queda es exactamente el
 *  `@typedef`, con las claves que la regla 12 puede juzgar. */
function typedefsInUse() {
  return MODULES.flatMap(({ label, source }) => {
    const declared = typedefFields(source);
    const named = [];

    for (const block of docBlocks(source))
      for (const { type } of docParamTypes(block.text)) {
        const record = registryOf(type, declared);

        if (record != null && record.origin === 'el @typedef')
          named.push({ label, source, type, fields: record.fields });
      }

    return named;
  });
}

describe('cobertura del @typedef vivo', () => {
  it('el inventario trae un @typedef con @property nombrado desde un @param', () => {
    // La rama del `@typedef` de la regla 12 —la promesa que vive en OTRO bloque— solo la
    // ejercitaban fuentes sinteticas de los tests: un fallo de lectura ahi pasaria
    // inadvertido hasta que el primer componente documentara su primer typedef, y llegaria
    // tarde, con el repo entero en rojo. El testigo es el `ValueSpec` de `lcdMachine.js`,
    // que nombra el `@param` de `formatValue`; su firma no importa, lo que importa es que
    // la forma este en el INVENTARIO y no solo en un test.
    const live = typedefsInUse();

    expect(live.length, 'ningun modulo del inventario nombra un @typedef desde su @param')
      .toBeGreaterThanOrEqual(1);
    expect(live.filter(({ fields }) => fields.length > 0).length,
      'el @typedef del inventario no promete ninguna clave que la regla pueda vigilar')
      .toBeGreaterThanOrEqual(1);
  });

  it('la regla 12 vigila ese @typedef de verdad (mutacion en memoria)', () => {
    // Se le pega una `@property` de mas al bloque del `@typedef` del modulo REAL y la
    // regla tiene que delatar la clave fantasma: la misma mutacion que la del registro
    // inline de drag-core, aqui sobre la OTRA rama de la promesa.
    const [live] = typedefsInUse();

    expect(live, 'ningun modulo del inventario nombra un @typedef desde su @param')
      .toBeDefined();

    const { label, source } = live;
    const ghost = source.replace(/@property\s*\{/,
      ' * @property {number} zzzGhost  solo vive en la documentacion\n * @property {');
    const caught = inlineRegistryOffenses(ghost).filter((one) => one.includes('zzzGhost'));

    expect(ghost, `${label}: el modulo no tiene ningun @property que mutar`).not.toBe(source);
    expect(caught, `${label}: la regla 12 no delata la clave que el @typedef promete de mas`)
      .toHaveLength(1);
    expect(caught[0]).toContain('el @typedef lo promete y el código no lo lee');
  });

  it('las dos vistas del @typedef no pueden separarse: lo prometido esta documentado', () => {
    // La regla 12 juzga las claves que su `propertyFields` sabe leer; la lista de
    // documentados cuenta la clave SIEMPRE. Si las dos vistas se separaran, una clave
    // prometida por el `@typedef` pasaria por no documentada y la regla 2 la delataria como
    // lectura no documentada: un falso positivo nascido de un documento bien escrito.
    for (const { label, source, fields } of typedefsInUse()) {
      const documented = [...documentedMembers(source).keys()];

      for (const { key } of fields)
        expect(documented, `${label}: el @typedef promete «${key}» y no esta documentado`)
          .toContain(key);
    }
  });
});

describe('cobertura de la convencion de la posicion de las opciones', () => {
  it('el inventario trae el objeto de opciones detras de otro parametro, y delante sin eleccion', () => {
    // La regla 13 solo tiene algo que juzgar si el lector de posiciones ve las dos
    // formas. Medido: 53 entradas, 35 con objeto de opciones en 24 modulos; 31 lo
    // declaran DETRAS de otro parametro, en 21 modulos, y 4 lo declaran en el primero,
    // en 4 modulos. Si la cuenta se acotara a una forma, la otra no la miraria nadie.
    const entradas = MODULES.flatMap(({ label, source }) =>
      entrySignatures(source).map(({ name, parameters }) => {
        const params = signatureParams(parameters);

        return {
          label,
          name,
          total: params.length,
          conOpciones: params.some((one) => one.options),
          enPrimero: params[0]?.options === true,
        };
      }));
    const conOpciones = entradas.filter((one) => one.conOpciones);
    const detras = conOpciones.filter((one) => !one.enPrimero);
    const primero = conOpciones.filter((one) => one.enPrimero);
    const modulos = (lista) => new Set(lista.map((one) => one.label)).size;

    expect(conOpciones.length, 'el inventario no tiene entradas con objeto de opciones')
      .toBeGreaterThanOrEqual(30);
    expect(detras.length, 'ninguna entrada del inventario declara el objeto de opciones detras de otro')
      .toBeGreaterThanOrEqual(25);
    expect(modulos(detras), 'los objetos de opciones detras de otro parametro estan en un solo modulo')
      .toBeGreaterThanOrEqual(20);
    expect(primero.length, 'el inventario no conserva ni una entrada con el objeto de opciones en el primero')
      .toBeGreaterThanOrEqual(3);
    expect(modulos(primero), 'las entradas con el objeto de opciones en el primero estan en un solo modulo')
      .toBeGreaterThanOrEqual(3);
  });

  it('la regla 13 delata el objeto de opciones en el primer parametro (mutacion)', () => {
    // La mordida, sobre un modulo de verdad y no sobre un fuente sintetico: se le da
    // la vuelta a los dos parametros de `xypad.js` y la regla tiene que decir cual es
    // la entrada, como se llama y cuantos parametros declara. Sin esto, una regla que
    // no mirase nada pasaria igual de verde.
    const xypad = MODULES.find(({ label }) => label === 'xypad.js')?.source;

    expect(xypad, 'xypad.js no esta entre los modulos auditados').toBeDefined();

    const mutado = xypad.replace('constructor (container, options = {})',
      'constructor (options = {}, container)');

    expect(mutado, 'xypad.js no tiene el constructor que se esperaba').not.toBe(xypad);
    expect(misplacedOptions(mutado)).toEqual([
      'constructor(options = {}, container): el objeto de opciones va en el primer parametro'
        + ' y la firma declara 2 parametros',
    ]);
    expect(misplacedOptions(xypad), 'el modulo tal cual, con las opciones detras, ya no lo juzga')
      .toEqual([]);
  });

  it('una entrada de un solo parametro no se juzga: no hay decision que tomar', () => {
    // La exencion, sujetada por su cuenta y con la razon a la vista: las cuatro entradas
    // que ponen el objeto de opciones en el primero no declaran NADA mas, asi que no
    // hay donde ponerlo y delatarlas seria decir que su firma esta mal cuando es la
    // unica posible. El dia que aparezca una entrada en el primero CON mas parametros,
    // este test avisa: la exencion ha dejado de ser la explicacion y hay que mirarlo.
    const enPrimero = MODULES.flatMap(({ label, source }) =>
      entrySignatures(source)
        .map(({ name, parameters }) => ({
          label,
          name,
          total: signatureParams(parameters).length,
          enPrimero: signatureParams(parameters)[0]?.options === true,
        }))
        .filter((one) => one.enPrimero));

    // y la exencion se mide SOBRE EL DETECTOR, que es donde se pierde: sin esta
    // asercion, quitarle el `params.length < 2` al detector dejaba este test en verde
    // (el inventario no habria cambiado) y solo se veia como las cuatro entradas se
    // ponian en rojo. La forma exacta la fijan los auto-tests; aqui se ata al motivo.
    expect(misplacedOptions('export function createDrawer ({ title } = {}) {\n  return title;\n}\n'),
      'una entrada de un solo parametro no se juzga: no hay decision que tomar')
      .toEqual([]);
    expect(misplacedOptions('export function createDrawer (options = {}, stage) {\n  return stage;\n}\n'),
      'una entrada con el objeto de opciones en el primero y con mas parametros SI se juzga')
      .toEqual(['createDrawer(options = {}, stage): el objeto de opciones va en el primer parametro'
        + ' y la firma declara 2 parametros']);

    expect(enPrimero.length, 'el inventario cambio: revisa la exencion de la regla 13')
      .toBeGreaterThanOrEqual(3);
    expect(enPrimero.filter((one) => one.total > 1).map((one) => `${one.label}: ${one.name}`),
      'una entrada con el objeto de opciones en el primero y con mas parametros no se exime')
      .toEqual([]);
  });
});

describe('cobertura de la forma de los accesos', () => {
  it('la auditoría ve accesos de verdad (ni detector mudo ni una llamada contada dos veces)', () => {
    const accesses = MODULES.flatMap(({ source }) => exampleMemberAccesses(source));
    const calls = accesses.filter(({ access }) => access === 'call').length;
    const methods = MODULES.reduce((sum, { source }) => sum + exampleMethodCalls(source).length, 0);
    const withAccesses = MODULES.filter(({ source }) => exampleMemberAccesses(source).length > 0);

    expect(calls).toBeGreaterThanOrEqual(4);
    expect(withAccesses.length).toBeGreaterThanOrEqual(2);
    // El scan de accesos de la 11 y el de llamadas de la 8 ven las MISMAS llamadas, atadas
    // y encadenadas: si uno de los dos derivara, una de esas reglas estaria mirando otra
    // cosa. La 11 cuenta ademas lecturas y escrituras; aqui se compara solo lo llamado.
    expect(calls).toBe(methods);
  });

  it('el inventario real mantiene vivo el encadenado sin receptor (rama `variable: null`)', () => {
    // La 11 sigue DOS receptores: el atado a una variable y el ENCADENADO
    // (`new Knob(el).destroy()`), que llega con `variable: null`. Los tests de arriba
    // cuentan accesos, pero no exigen que exista ninguno encadenado: sin esta guardia,
    // borrar la linea del ejemplo de knob.js dejaria esa rama de la regla sin correr por
    // el inventario y nadie se enteraria. Con un encadenado real basta; el dia que otro
    // modulo traiga el suyo, esta sigue verde y la rama sigue ejercitada.
    const chained = MODULES.flatMap(({ label, source }) =>
      exampleMemberAccesses(source)
        .filter(({ variable }) => variable == null)
        .map(({ className, member }) => `${label}: ${className}.${member}`));

    expect(chained.length, 'ningun ejemplo del inventario encadena `new X(...).m()`')
      .toBeGreaterThanOrEqual(1);
  });


  it('juzga la forma de los accesos de un receptor de fábrica, no solo la de una clase', () => {
    // La otra forma que la 11 sigue sin `new`: el receptor que nace de una fabrica, que
    // llega al scan con el NOMBRE de la fabrica como clase y cuyos miembros salen de la API
    // que esa fabrica devuelve. Sin esta guardia, borrar su ejemplo dejaria ese tramo mudo
    // sin que ninguna de las de arriba se enterase: las de arriba lo cuentan todo junto.
    const factoryAccesses = MODULES.flatMap(({ label, source }) => {
      const factory = new Set(exampleFactoryCalls(source).map(({ className }) => className));

      return exampleMemberAccesses(source)
        .filter(({ className }) => factory.has(className))
        .map(({ className, member, access }) => `${label}: ${className}.${member}[${access}]`);
    });

    expect(factoryAccesses.length, 'ningún ejemplo toca un miembro del receptor de una fábrica')
      .toBeGreaterThanOrEqual(2);

    const drawer = MODULES.find(({ label }) => label === 'drawer.js')?.source;
    const lied = drawer.replace('drawer.close();', 'drawer.close;');

    expect(lied, 'la mutación no encontró su línea en drawer.js').not.toBe(drawer);
    expect(mismatchedExampleAccesses(lied))
      .toEqual(['createDrawer.close: el ejemplo lo lee, la clase lo declara metodo']);
  });
  it('los accesos coinciden con los que los ejemplos escriben (y no se inventa ninguno)', () => {
    // La expectativa se DERIVA del texto de cada bloque, el receptor atado, sus alias
    // y el encadenado incluidos: puede cambiar el ejemplo entero (nombres, lecturas,
    // llamadas) y la guardia sigue midiendo lo mismo, que el detector vea lo que hay
    // escrito. Se compara miembro a miembro, asi que tambien cubre las LECTURAS, no solo
    // las llamadas.
    const withAccesses = MODULES.filter(({ source }) => exampleMemberAccesses(source).length > 0);

    expect(withAccesses.length).toBeGreaterThanOrEqual(2);

    for (const { label, source } of withAccesses) {
      const mentioned = new Map();
      const aliases = new Map();          // alias -> clase resuelta POR EL TEXTO

      for (const { text } of docBlocks(source)) {
        for (const { variable, at } of exampleBindings(text)) {
          // El scan arranca en el binding, no al principio del bloque: la ruta del
          // `import` (`.../wheel.js`) trae un `wheel.js` que no es un acceso.
          const members = [...text.slice(at).matchAll(memberAccessPattern(variable))]
            .map((match) => match[1]);

          mentioned.set(variable, [...mentioned.get(variable) ?? [], ...members]);
        }

        // El encadenado (`new X().m(...)`) no tiene variable: se reune bajo la clave
        // `null`, que es como lo etiqueta el detector. Asi un encadenado real que se cuele
        // en un ejemplo queda verificado por el texto y no por la palabra del detector.
        const chained = textChainedMembers(text);

        mentioned.set(null, [...mentioned.get(null) ?? [], ...chained]);

        // Los ALIAS (`const y = x;`) se resuelven desde el TEXTO, sin pasar por
        // exampleBindings: `const v = new C(...)` fija la clase y `const y = x;`
        // hereda la de su fuente hasta el punto fijo. Un detector que deje de seguir
        // un alias usado —o que resuelva mal su clase— queda delatado aqui.
        const classes = new Map();

        for (const match of text.matchAll(BOUND_CONSTRUCTION))
          classes.set(match[1], match[2]);

        for (let round = 0; round <= classes.size; round += 1) {
          let changed = false;

          for (const match of text.matchAll(ALIAS_DECLARATION)) {
            if (match[1] === match[2])
              continue;

            const origin = classes.get(match[2]);

            if (origin != null && classes.get(match[1]) !== origin) {
              classes.set(match[1], origin);
              changed = true;
            }
          }

          if (!changed)
            break;
        }

        for (const match of text.matchAll(ALIAS_DECLARATION)) {
          const expected = classes.get(match[1]);

          // Solo se juzga un alias USADO: `alias.` tiene que aparecer en el bloque.
          if (expected != null && expected !== match[1]
            && receiverDotPattern(match[1]).test(text))
            aliases.set(match[1], expected);
        }
      }

      const detected = exampleMemberAccesses(source);

      for (const [alias, expected] of aliases) {
        const seen = detected.filter(({ variable }) => variable === alias);

        expect(seen.length, `${label}: el alias ${alias} se sigue`).toBeGreaterThan(0);
        expect(
          [...new Set(seen.map(({ className }) => className))],
          `${label}: el alias ${alias} apunta a ${expected}`,
        ).toEqual([expected]);
      }

      for (const [variable, members] of mentioned) {
        expect(
          detected.filter((access) => access.variable === variable).map(({ member }) => member),
          `${label}: los accesos de ${variable}`,
        ).toEqual(members);
      }
    }
  });

  it('lee la forma declarada de un getter, de un setter y de un método', () => {
    const switcher = MODULES.find(({ label }) => label === 'themeSwitcher.js')?.source;
    const forms = (member) => [...memberDeclarations(switcher, 'ThemeSwitcher').get(member).forms];

    expect(forms('value')).toEqual(['get']);
    expect(forms('payload')).toEqual(['get']);
    expect(forms('setValue')).toEqual(['method']);
  });

  it('ve los accesos del ejemplo y no los inventa', () => {
    const pad = MODULES.find(({ label }) => label === 'xypad.js')?.source;

    expect(exampleMemberAccesses(pad).map(({ member, access }) => `${member}:${access}`))
      .toEqual(['setValue:call', 'setCorners:call', 'getValue:call']);
  });
});


describe('cobertura de las funciones exportadas', () => {
  it('la auditoría ve funciones exportadas (ni lista vacía ni detector mudo)', () => {
    const withExports = MODULES.filter(({ source }) => exportedFunctions(source).length > 0);
    const total = MODULES.reduce((sum, { source }) => sum + exportedFunctions(source).length, 0);

    expect(withExports.length).toBeGreaterThanOrEqual(5);
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it('toda función exportada está documentada (su bloque o la cabecera del módulo)', () => {
    const offenders = MODULES.flatMap(({ label, source }) =>
      undocumentedExports(source).map((name) => `${label}:${name}`));

    expect(offenders).toEqual([]);
  });
});
