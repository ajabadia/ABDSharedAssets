/**
 * La capa de EJEMPLOS: los bloques `Usage:`, el receptor que atan, sus llamadas,
 * sus construcciones y los argumentos que les pasan —y las FORMAS de receptor que el
 * audit resuelve (`RECEIVER_FORMS`), que es la lista que la guia enumera—.
 */

import {
  factoryApiMembers,
  moduleExporting,
} from './api.js';

import {
  docBlocks,
  documentedParamTypes,
  usageBlocks,
} from './docs.js';

import {
  classBody,
  memberDeclarations,
} from './members.js';

import {
  MODULES,
} from './modules.js';

import {
  boundReceiverAccesses,
} from './receptors.js';

import {
  closingIndex,
} from './scan.js';

import {
  argumentCount,
} from './split.js';

import {
  constructedWith,
  exampleBindings,
  exampleCallsWithLabels,
  exampleConstructions,
  exampleMethodCalls,
} from './usage.js';

/** Las variables de un bloque que un ejemplo ata a una FACTORIA —y no a un `new`—: el
 *  receptor `const lcd = createLcdScreen(el)`, donde la fabrica es una funcion (o const)
 *  exportada con API legible. Es el discriminante del camino nuevo: un binding cuyo
 *  `className` resuelve a un modulo, NO tiene cuerpo de clase (`classBody` null) y SI
 *  tiene API de fabrica (`factoryApiMembers`). */
function factoryBindings(text, modules) {
  const bindings = [];

  for (const binding of exampleBindings(text)) {
    const target = moduleExporting(binding.className, modules);

    if (target == null || classBody(target.source, binding.className) != null)
      continue;

    if (factoryApiMembers(target.source, binding.className) != null)
      bindings.push(binding);
  }

  return bindings;
}

/** Las llamadas de un ejemplo a la API que una FACTORIA devuelve (`const lcd =
 *  createLcdScreen(el)` y luego `lcd.setLine(...)`), con la misma forma que
 *  `exampleMethodCalls`: [{ className, variable, method, args }]. Es la otra mitad del
 *  camino de la regla 8 —donde la clase contra la que se juzga no nace de un `new` sino
 *  del retorno de la fabrica (`factoryApiMembers`)—, y la pieza con la que la guardia de
 *  cobertura exige que el inventario no deje ese camino mudo. */
export function exampleFactoryCalls(source, modules = MODULES) {
  const calls = [];

  for (const block of docBlocks(source)) {
    for (const binding of factoryBindings(block.text, modules)) {
      for (const { variable, className, match } of boundReceiverAccesses(block.text, binding, { callsOnly: true })) {
        const open = match.index + match[0].length - 1;
        const close = closingIndex(block.text, open);

        calls.push({
          className,
          variable,
          method: match[1],
          args: close < 0 ? '' : block.text.slice(open + 1, close).replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }

  return calls;
}

/** Llamadas de ejemplo CON argumentos cuya firma declarada no documenta ningun
 *  `@param` obligatorio: ahi la regla 10 no tiene nada que cruzar (solo cruza los
 *  parametros con nombre y sin corchetes) y el hueco —una firma sin tipos— se cierra
 *  en silencio. Cubre los metodos que el ejemplo llama y el `new Clase(...)` con el
 *  que construye; una llamada SIN argumentos no exige `@param` (no hay tipo que
 *  prometer) y un metodo que la clase no declara se deja a la regla 8. */
export function undocumentedExampleCalls(source, modules = MODULES) {
  const off = new Set();

  for (const { className, member, label, args } of exampleCallsWithLabels(source)) {
    const argc = argumentCount(args);

    if (argc === 0)
      continue;

    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    if (!memberDeclarations(target.source, className).has(member))
      continue;

    if (documentedParamTypes(target.source, className, member) == null)
      off.add(`${label}: el ejemplo le pasa ${argc} argumento(s) y la firma no documenta ningun @param obligatorio`);
  }

  return [...off].sort();
}

/* ---------------------------------------------------------------------------
 * Detectores de la regla 11: la forma de los accesos
 * ------------------------------------------------------------------------- */

/** Clases que un ejemplo `Usage:` construye y ningun modulo auditado exporta. */
export function unresolvedUsageClasses(source, modules = MODULES) {
  const unresolved = [];

  for (const block of usageBlocks(source)) {
    for (const { className } of constructedWith(block.text)) {
      if (moduleExporting(className, modules) == null && !unresolved.includes(className))
        unresolved.push(className);
    }
  }

  return unresolved;
}

/** Los ejemplos que resuelven a un modulo y traen claves: [{ className, module, keys }]. */
export function resolvedExampleOptions(source, modules = MODULES) {
  const resolved = [];

  for (const { className, keys } of exampleConstructions(source)) {
    const target = moduleExporting(className, modules);

    if (target != null && keys.length > 0)
      resolved.push({ className, module: target.label, keys });
  }

  return resolved;
}

/* ---------------------------------------------------------------------------
 * Las FORMAS de receptor que el audit resuelve
 * ------------------------------------------------------------------------- */

/**
 * Las formas con las que un ejemplo puede resolver su receptor —las que el audit sigue
 * hoy—, cada una con el TESTIGO que lo prueba: un modulo minimo y el bloque `Usage:` que
 * lo usa. `sees(text, modules)` recibe el modulo y el bloque ya juntos y responde si el
 * audit resuelve ahi esa forma; la lista de modulos solo la necesita la FABRICA, cuyo
 * receptor se resuelve contra lo que un modulo EXPORTA.
 *
 * Es la referencia que la guia enumera en su seccion del receptor y que la cabecera
 * nombra en sus convenciones: el contrato del CI ata las tres listas, asi que anadir aqui
 * una forma —donde se anade la que el codigo resuelve— sin documentarla es lo unico que
 * no pasa. Los testigos son modulos de juguete a proposito: no dependen del inventario,
 * que cambia, sino del camino que el audit tiene que seguir.
 */
export const RECEIVER_FORMS = [
  {
    name: 'Atado', mark: 'const x = new X(...)',
    module: 'export class Knob {\n  setValue(v) {\n    return v;\n  }\n}\n',
    usage: '/**\n * Usage:\n *   const knob = new Knob(el);\n *   knob.setValue(0.75);\n */\n',
    sees: (text) => exampleMethodCalls(text).some(({ variable, className, method }) =>
      variable === 'knob' && className === 'Knob' && method === 'setValue'),
  },
  {
    name: 'Alias', mark: 'const y = x;',
    module: 'export class Knob {\n  setValue(v) {\n    return v;\n  }\n}\n',
    usage: '/**\n * Usage:\n *   const knob = new Knob(el);\n *   const other = knob;\n *   other.setValue(0.75);\n */\n',
    sees: (text) => exampleMethodCalls(text).some(({ variable, className }) =>
      variable === 'other' && className === 'Knob'),
  },
  {
    name: 'Encadenado', mark: 'new X(...).m(...)',
    module: 'export class Knob {\n  destroy() {}\n}\n',
    usage: '/**\n * Usage:\n *   new Knob(el).destroy();\n */\n',
    sees: (text) => exampleMethodCalls(text).some(({ variable, className, method }) =>
      variable == null && className === 'Knob' && method === 'destroy'),
  },
  {
    name: 'Opcional', mark: 'x?.m(...)',
    module: 'export class Knob {\n  setValue(v) {\n    return v;\n  }\n}\n',
    usage: '/**\n * Usage:\n *   const knob = new Knob(el);\n *   knob?.setValue(0.75);\n */\n',
    sees: (text) => text.includes('?.')
      && exampleMethodCalls(text).some(({ variable, method }) => variable === 'knob' && method === 'setValue'),
  },
  {
    name: 'Fábrica', mark: 'const x = createY(...)',
    module: 'export function createPad(element) {\n  return {\n    setValue(v) {\n      return v;\n    },\n  };\n}\n',
    usage: '/**\n * Usage:\n *   const pad = createPad(el);\n *   pad.setValue(0.5);\n */\n',
    sees: (text, modules) => exampleFactoryCalls(text, modules).some(({ className, method }) =>
      className === 'createPad' && method === 'setValue'),
  },
];
