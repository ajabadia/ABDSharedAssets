/**
 * Regla 10 — tipos de los argumentos.
 *
 * el ejemplo pasa argumentos del tipo que promete la documentación.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  moduleExporting,
} from '../api.js';

import {
  cleanDocText,
  docBlockBefore,
  docBlocks,
  docParamTypes,
  documentedCallParams,
} from '../docs.js';

import {
  memberDeclarations,
} from '../members.js';

import {
  MODULES,
} from '../modules.js';

import {
  signatureParams,
} from '../options.js';

import {
  newBeforePattern,
} from '../receptors.js';

import {
  FAMILY,
  functionInlineSignature,
  isRecordType,
  keyValueOf,
  readableType,
  recordFields,
  unbracketed,
} from '../records.js';

import {
  closingIndex,
} from '../scan.js';

import {
  argumentList,
  splitTopLevel,
} from '../split.js';

import {
  exampleBindings,
  exampleCallsWithLabels,
} from '../usage.js';

/** Las llamadas de ejemplo ATADAS a una funcion exportada por un modulo auditado:
 *  el receptor que el bloque construye con `const x = createY(...)` (o `const x =
 *  unaFuncion`), ademas de los metodos y las construcciones de siempre. Las
 *  SUELTAS (`createY(...)` sin atar) NO entran: hay fabricas documentadas sin
 *  `@param` (createLcdScreen, registerSkin) que la guardia de firmas despertaria
 *  sin que nadie se lo pida; el alcance se decide aqui y no se improvisa. */
export function boundedCallsWithLabels(source, modules = MODULES) {
  const calls = exampleCallsWithLabels(source);

  for (const block of docBlocks(source)) {
    for (const { className, at } of exampleBindings(block.text)) {
      if (moduleExporting(className, modules)?.label == null)
        continue;

      const from = block.text.indexOf(className, at);

      // `const x = new C(...)`: esa atada ya la inventaria las construcciones.
      if (from < 0 || newBeforePattern().test(block.text.slice(Math.max(0, from - 10), from)))
        continue;

      const open = block.text.indexOf('(', from + className.length);

      if (open < 0)
        continue;

      const close = closingIndex(block.text, open);

      if (close < 0)
        continue;

      calls.push({
        className,
        member: className,
        label: `${className}()`,
        args: cleanDocText(block.text.slice(open + 1, close)),
      });
    }
  }

  return calls;
}

/** La declaracion de una funcion EXPORTADA con su indice, o null. */
function exportedDeclaration(source, name) {
  return new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
}

/** Los `@param` de una funcion EXPORTADA (`export function createY(...)`), en orden de
 *  firma y con su nombre: [{ type, name }], o null. Es el equivalente a
 *  `documentedCallParams` para quien no es miembro de ninguna clase: su promesa vive
 *  en el bloque que precede a la declaracion, y las claves del objeto de opciones
 *  (`handlers.onDelta`) no son parametros de la llamada. */
export function exportedCallParams(source, name) {
  const decl = exportedDeclaration(source, name);

  if (decl == null)
    return null;

  const block = docBlockBefore(source, decl.index);

  if (block == null)
    return null;

  const params = docParamTypes(block).filter(({ name: given, option }) => given != null && !option);

  return params.length === 0 ? null : params.map(({ type, name: given }) => ({ type, name: given }));
}

/** Los PARAMETROS que declara esa funcion, en el texto de su parentesis: la mitad de
 *  la firma que no es promesa, que es contra la que se mide. */
function exportedFunctionParams(source, name) {
  const decl = exportedDeclaration(source, name);

  if (decl == null)
    return null;

  const open = decl.index + decl[0].length - 1;
  const close = closingIndex(source, open);

  return close < 0 ? null : source.slice(open + 1, close);
}

/** Los `@param` de una llamada, ATADOS al parametro que declara la firma: la vista
 *  canonica decide cual es, por nombre cuando el bloque lo da y la firma lo declara, y
 *  por posicion cuando no —un patron desmembrado no llega con nombre— o cuando el
 *  nombre no existe en la firma.
 *
 *  Antes el emparejamiento era por indice y a ciegas: si el bloque listaba sus
 *  `@param` en otro orden, o la firma declaraba otro nombre, cada `@param` se cruzaba
 *  con el argumento de OTRO parametro y la regla juzgaba el cruce equivocado sin decir
 *  nada. Y si la firma no declara un parametro ahi, la promesa no tiene argumento
 *  contra que medirse: se queda fuera en vez de mirar el que le tocaba por turno. */
function callParams(documented, signature) {
  if (documented == null)
    return null;

  const declared = signatureParams(signature ?? '');

  return documented
    .map((param, position) => {
      const byName = param.name == null
        ? null
        : declared.find((one) => one.name === param.name);

      const bound = byName ?? declared[position] ?? null;

      return bound == null ? null : { type: param.type, bound };
    })
    .filter((one) => one != null);
}

/** Los `@param` de un MIEMBRO (constructor o metodo) atados a su firma. */
function memberParams(source, className, member) {
  return callParams(
    documentedCallParams(source, className, member),
    memberDeclarations(source, className).get(member)?.params);
}

/** Los mismos `@param` de una funcion exportada, atados a los parametros que declara. */
function exportedParams(source, name) {
  return callParams(exportedCallParams(source, name), exportedFunctionParams(source, name));
}

/** Los `@param` de una funcion EXPORTADA sin su nombre: [{ type }], o null. */
export function exportedFunctionParamTypes(source, name) {
  const params = exportedCallParams(source, name);

  return params == null ? null : params.map(({ type }) => ({ type }));
}

/** Los fallos del CALLBACK que el ejemplo pasa a un campo de funcion de su firma:
 *  la aridad de la flecha (o del `function`) contra la firma inline
 *  `function(a, b): c`, y su familia de retorno. Un callback que devuelve un
 *  identificador no se juzga: no se infiere el tipo de lo que devuelve. */
export function callbackArityErrors(label, key, fieldType, text) {
  const signature = functionInlineSignature(fieldType);

  if (signature == null)
    return [];

  const source = text.trim();
  const arrowAt = source.indexOf('=>');
  const head = arrowAt < 0 ? source : source.slice(0, arrowAt);
  const open = head.indexOf('(');
  const close = open < 0 ? -1 : closingIndex(head, open);

  if (open < 0 || close < 0)
    return [];

  const body = head.slice(open + 1, close).trim();
  const params = body === '' || body === ',' ? [] : argumentList(body);
  const off = [];

  // Como en TS, una flecha que nombra MENOS parametros de los que recibe es legal
  // (el `onDelta: (turns) => ...` del propio repo); nombrar MAS no: esos sobran.
  if (params.length > signature.params.length)
    off.push(`${label}: la clave ${key} recibe ${params.length}, su firma pide ${signature.params.length}`);

  // El retorno solo se juzga en la flecha compacta (`=> expresion`): un cuerpo
  // `{ ... }` no dice que devuelve y no se infiere.
  if (arrowAt >= 0) {
    const returned = source.slice(arrowAt + 2).trim();

    if (!returned.startsWith('{')) {
      const kind = argumentType(returned);

      if (kind !== 'unknown' && !acceptsArgument(signature.returns, kind))
        off.push(`${label}: la clave ${key} es ${kind} y la firma promete devolver ${signature.returns}`);
    }
  }

  return off;
}

/** La familia de un argumento por su FORMA: se juzga lo que el texto dice. Un
 *  identificador, una llamada, un miembro o una operacion son `unknown`: no se puede
 *  jurar su tipo, asi que no se juzgan. */
export function argumentType(text) {
  const arg = text.trim();

  if (/^'[^']*'$/.test(arg) || /^"[^"]*"$/.test(arg) || /^`[^`$]*`$/.test(arg))
    return 'string';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(arg))
    return 'number';
  if (arg === 'true' || arg === 'false')
    return 'boolean';
  if (arg === 'null')
    return 'null';
  if (arg.startsWith('{'))
    return 'object';
  if (arg.startsWith('['))
    return 'array';
  if (/^(?:async\s+)?(?:function\b|\([^()]*\)\s*=>)/.test(arg)
    || /^(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(arg))
    return 'function';

  return 'unknown';
}

/** Si el tipo prometido admite un argumento de esa familia. `*` admite cualquiera,
 *  y un objeto inline admite `object`. */
export function acceptsArgument(type, kind) {
  if (isRecordType(type))
    return kind === 'object';

  return unbracketed(type).split('|').some((alternative) => {
    const name = alternative.trim();

    // `function(a, b): c` es una familia `function` con la firma dentro: si el
    // ejemplo pasa una funcion, la acepta; el cruce FINO de esa firma es del
    // callback (`callbackArityErrors`), no de aqui.
    const family = functionInlineSignature(name) != null ? 'function' : FAMILY[name];

    return family === kind || family === '*';
  });
}

/** Las entradas clave -> texto de UN objeto escrito en el ejemplo: `{ x: 0.2, y: true }`
 *  -> [{ key: 'x', text: '0.2' }, ...]. El shorthand (`{ x, y }`) no dice nada del
 *  valor y no se juzga campo a campo. */
export function exampleObjectEntries(text) {
  const arg = text.trim();

  if (!arg.startsWith('{'))
    return [];

  const close = closingIndex(arg, 0);

  if (close !== arg.length - 1)
    return [];

  const entries = [];

  for (const part of splitTopLevel(arg.slice(1, close))) {
    const pair = keyValueOf(part);

    if (pair != null)
      entries.push({ key: pair.key, text: pair.value });
  }

  return entries;
}

/* ---------------------------------------------------------------------------
 * Guardia de los registros inline: toda clave prometida en un `@param {{ ... }}`
 * tiene que leerse de verdad en el callable que el bloque documenta.
 * ------------------------------------------------------------------------- */

/** Los fallos por CAMPO de un argumento objeto contra su tipo inline: clave de mas
 *  (fuera del registro), familia equivocada en una clave prometida. Reutiliza las
 *  mismas piezas que la regla por argumento; los mensajes se distinguen por su
 *  prefijo `clave x.y`. */
export function recordFieldErrors(label, type, arg) {
  const fields = recordFields(type);
  const given = exampleObjectEntries(arg);

  if (fields == null || given.length === 0)
    return [];

  const off = [];
  const promised = new Map(fields.map((field) => [field.key, field]));

  for (const { key, text } of given) {
    const field = promised.get(key);

    if (field == null) {
      off.push(`${label}: la clave x.${key} no esta en la firma promete ${type}`);
      continue;
    }

    const kind = argumentType(text);

    if (kind !== 'unknown' && !acceptsArgument(field.type, kind))
      off.push(`${label}: la clave x.${key} es ${kind} y la firma promete ${field.type}`);
  }

  return off;
}

/** Los cruces que la regla 10 SI puede juzgar: [{ label, param, type, kind }], un
 *  argumento de ejemplo contra el tipo prometido de su parametro. Solo entran los dos
 *  lados legibles: un tipo que se lee entero y un argumento cuya forma lo delata. Es
 *  la cobertura de la regla. */
export function comparedExampleArguments(source, modules = MODULES) {
  const pairs = [];

  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    const params = memberParams(target.source, className, member);

    if (params == null)
      continue;

    const given = argumentList(args);

    for (const { type, bound } of params) {
      const kind = argumentType(given[bound.index] ?? '');

      if (kind !== 'unknown' && readableType(type))
        pairs.push({ label, param: bound.index + 1, type, kind });
    }
  }

  return pairs;
}

/** Argumentos de ejemplo que el tipo prometido NO admite: un objeto donde la
 *  documentacion promete un numero, una cadena donde promete un booleano. */
export function mistypedExampleArguments(source, modules = MODULES) {
  const off = new Set();

  for (const { label, param, type, kind } of comparedExampleArguments(source, modules)) {
    if (!acceptsArgument(type, kind))
      off.add(`${label}: el argumento ${param} es ${kind} y la firma promete ${type}`);
  }

  // Validacion por CAMPOS: si el argumento es un objeto literal y la firma promete un
  // registro inline, las claves del ejemplo se cruzan campo a campo con lo prometido.
  for (const { className, member, label, args } of boundedCallsWithLabels(source, modules)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    // La atada a una funcion exportada firma con su `@param`; la llamada a un
    // metodo (o a un constructor), con la firma de ese miembro. En los dos casos el
    // `@param` se ata al parametro que DECLARA la firma, no al que ocupa su posicion.
    const params = member === className
      ? exportedParams(target.source, className)
      : memberParams(target.source, className, member);

    if (params == null)
      continue;

    const given = argumentList(args);

    for (const { type, bound } of params) {
      const arg = given[bound.index];

      if (arg == null || !isRecordType(type))
        continue;

      for (const problem of recordFieldErrors(`${label} (argumento ${bound.index + 1})`, type, arg))
        off.add(problem);

      // El callback del ejemplo, cruzado con la firma inline de su campo:
      // `function(a, b): c` ya se LEE, asi que la flecha que el ejemplo escribe
      // tiene que cuadrar con ella (aridad y familia de retorno).
      for (const { key, text } of exampleObjectEntries(arg)) {
        const field = recordFields(type)?.find((candidate) => candidate.key === key);

        if (field?.params == null)
          continue;

        if (argumentType(text) !== 'function')
          continue;

        for (const problem of callbackArityErrors(`${label} (argumento ${bound.index + 1})`, `${className}.${key}`, field.type, text))
          off.add(problem);
      }
    }
  }

  return [...off].sort();
}

/* ---------------------------------------------------------------------------
 * Guardia de firmas de la regla 10
 * ------------------------------------------------------------------------- */

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const mistypedExampleArgumentsRule = {
  number: 10,
  detector: mistypedExampleArguments,
  title: 'tipos de los argumentos',
  assertion: 'el ejemplo pasa argumentos del tipo que promete la documentación',
  about: 'El argumento —y el callback de un campo de función inline, `function(a, b): ' +
    'c`— tiene que ser de la familia que promete el `@param {tipo}` de su ' +
    'parámetro.',
  limit: 'solo juzga el cruce en el que los dos lados hablan claro: sin tipo ' +
    'documentado, o con un argumento que es un identificador, no hay nada que ' +
    'contrastar y no se inventa',
  edge: 3,
  recipe: {
    module: 'wheel.js', cited: ['Wheel.setValue(): el argumento 1 es string y la firma promete number'],
    about: 'pasa un string donde la firma promete number, en una llamada atada a su '
      + 'receptor, y el detector cruza los dos lados',
    limit: 'la variacion valida pasa otro numero por el mismo sitio, asi que lo '
      + 'unico que cambia entre los dos casos es el tipo que se juzga',
    mutate: (source) => source.replace('wheel.setValue(0.5, false)', "wheel.setValue('0.5', false)"),
    safe: (source) => source.replace('wheel.setValue(0.5, false)', 'wheel.setValue(0.25, false)'),
  },
};
