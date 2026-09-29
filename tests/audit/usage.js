/**
 * El EJEMPLO como codigo: el bloque `Usage:`, sus ataduras a un receptor, sus
 * construcciones y sus llamadas, con su aridad y sus etiquetas.
 */

import {
  chainedMethodCalls,
} from './calls.js';

import {
  docBlocks,
} from './docs.js';

import {
  optionEntriesOfArgs,
} from './entries.js';

import {
  RECEIVER_DECLARATION,
  boundReceiverAccesses,
  newReceiverPattern,
} from './receptors.js';

import {
  closingIndex,
} from './scan.js';

/** Variables que un bloque de documentacion ata a un `new Clase(...)`: el receptor
 *  ATADO, directo (`const x = new X(...)`) o por ALIAS dentro del mismo bloque
 *  (`const y = x;` sigue a `x`). Las reglas 8/9/10 siguen ademas el receptor
 *  encadenado (`new X().m()`) con `chainedMethodCalls`; este detector solo ve el que
 *  tiene nombre. */
export function exampleBindings(text) {
  const bindings = [];

  for (const match of text.matchAll(RECEIVER_DECLARATION))
    bindings.push({ variable: match[1], className: match[2] ?? match[3], at: match.index });

  // Un alias apunta a una VARIABLE, no a la clase: `const pad2 = pad;` tiene que
  // resolver a `Pad`, o las reglas 8/9/10 buscarian la clase `pad` (que nadie exporta)
  // y saltarian la llamada EN SILENCIO. Se resuelve en cadena hasta que ya no cambia.
  const byName = new Map(bindings.map((b) => [b.variable, b]));

  for (let round = 0; round < bindings.length; round += 1) {
    let changed = false;

    for (const b of bindings) {
      const source = byName.get(b.className);

      if (source != null && source !== b && source.className !== b.className) {
        b.className = source.className;
        changed = true;
      }
    }

    if (!changed)
      break;
  }

  return bindings;
}

/** Metodos que un ejemplo LLAMA sobre el objeto que el MISMO bloque construye, atado a
 *  una variable (`const pad = new XYPad(el)` y luego `pad.setCorners(...)`) o encadenado
 *  sin atarlo (`new XYPad(el).setCorners(...)`): [{ className, variable, method, args }]
 *  — `variable` es null en el encadenado —, donde `args` es el texto de los argumentos
 *  que la llamada le pasa (lo que mide la regla 9). Cuenta tambien los que el ejemplo
 *  trae comentados con `//`: el docblock entero ya es un comentario, asi que el metodo
 *  prometido y comentado es la misma promesa que el que no lo esta. */
export function exampleMethodCalls(source) {
  const calls = [];

  for (const block of docBlocks(source)) {
    for (const binding of exampleBindings(block.text)) {
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

    for (const call of chainedMethodCalls(block.text))
      calls.push(call);
  }

  return calls;
}

/** Las listas de argumentos que un ejemplo pasa, con la etiqueta de a quien:
 *  [{ className, member, label, args }] — los metodos que llama sobre el receptor que
 *  el bloque construye (atado o encadenado) y el `new Clase(...)` con el que construye.
 *  Es el inventario de argumentos que comparten la regla 9 (aridad) y la 10 (tipos). */
export function exampleCallsWithLabels(source) {
  const calls = [];

  for (const { className, method, args } of exampleMethodCalls(source))
    calls.push({ className, member: method, label: `${className}.${method}()`, args });

  for (const { className, args } of exampleConstructions(source))
    calls.push({ className, member: 'constructor', label: `new ${className}()`, args });

  return calls;
}

/** Los `new Clase(...)` de un texto, con el texto de sus argumentos y las claves
 *  de su objeto de opciones. */
export function constructedWith(text) {
  const found = [];

  for (const match of text.matchAll(newReceiverPattern())) {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(text, open);

    if (close < 0)
      continue;

    const args = text.slice(open + 1, close);
    const entries = optionEntriesOfArgs(args);

    found.push({ className: match[1], args, keys: entries.map(({ key }) => key), entries });
  }

  return found;
}

/** Todo `new Clase(...)` que muestra la documentacion: es un ejemplo de uso. */
export function exampleConstructions(source) {
  return docBlocks(source).flatMap((block) => constructedWith(block.text));
}
