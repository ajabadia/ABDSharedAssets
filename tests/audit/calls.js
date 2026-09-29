/**
 * Las CADENAS de accesos: `x.a.b(1)`, quien es el receptor, que metodo se llama y
 * con cuantos argumentos — leidas del ejemplo.
 */

import {
  memberNamePattern,
  newReceiverPattern,
} from './receptors.js';

import {
  closingIndex,
} from './scan.js';

/** Los receptores ENCADENADOS de un texto: cada `new Clase(...)` que el ejemplo
 *  construye sin atarlo a una variable y al que sigue un `.miembro`
 *  (`new XYPad(el).setCorners([...])`). [{ className, member, memberAt, args }], donde
 *  `args` es null si el miembro NO se llama (`new X().value`) y el texto de los
 *  argumentos si lo sigue un `(` (`new X().m(a, b)`). Los parentesis del `new` se
 *  equilibran, asi que un argumento anidado (`new Pad(el, fn(x)).destroy()`) no corta
 *  el encadenado. Es la fuente comun de `chainedMemberAccesses` (regla 11) y de
 *  `chainedMethodCalls` (reglas 8/9/10), para que las dos no puedan discrepar. */
export function chainedReceivers(text) {
  const sites = [];

  for (const match of text.matchAll(newReceiverPattern())) {
    const close = closingIndex(text, match.index + match[0].length - 1);

    if (close < 0)
      continue;

    let dot = close + 1;

    while (dot < text.length && /\s/.test(text[dot]))
      dot += 1;

    if (text[dot] === '?' && text[dot + 1] === '.')
      dot += 1;                          // `?.`: deja el punto en `dot`, como `.`

    if (text[dot] !== '.')
      continue;

    const member = memberNamePattern().exec(text.slice(dot + 1));

    if (member == null)
      continue;

    const memberAt = dot + 1 + member[0].indexOf(member[1]);
    const afterName = memberAt + member[1].length;
    const call = /^\s*\(/.exec(text.slice(afterName));

    if (call == null) {
      sites.push({ className: match[1], member: member[1], memberAt, args: null });
      continue;
    }

    const open = afterName + call[0].length - 1;
    const end = closingIndex(text, open);

    sites.push({
      className: match[1],
      member: member[1],
      memberAt,
      args: end < 0 ? '' : text.slice(open + 1, end),
    });
  }

  return sites;
}

/** Las llamadas de un texto sobre el receptor encadenado, con la forma de
 *  `exampleMethodCalls`: [{ className, variable: null, method, args }]. Un encadenado
 *  que no llama (`new X().value`) no entra. */
export function chainedMethodCalls(text) {
  const calls = [];

  for (const { className, member, args } of chainedReceivers(text)) {
    if (args == null)
      continue;

    calls.push({
      className,
      variable: null,
      method: member,
      args: args.replace(/\s+/g, ' ').trim(),
    });
  }

  return calls;
}

/** Los miembros que el TEXTO de un bloque encadena tras un `new Clase(...)`
 *  (`new XYPad(el).setCorners(...)` -> `setCorners`). Es la lectura con la que la
 *  guardia derivada de la regla 11 contrasta lo que el detector dice ver contra lo
 *  que hay escrito. NO reusa `chainedReceivers` (si lo hiciera, la guardia se
 *  compararia consigo misma), pero SI comparte con el detector la primitiva de
 *  equilibrio `closingIndex`, que salta cadenas y comentarios: un parentesis anidado a
 *  cualquier profundidad (`new Pad(el, fn(x, g(y))).destroy()`) o un parentesis dentro
 *  de una cadena (`new Pad(el, ')').setValue(0.1)`) no puede hacer que esta lectura se
 *  quede corta y la guardia falle de mas. Un fallo en `closingIndex` mismo se escapa
 *  aqui; lo cubren el resto de reglas, que lo ejercitan por todos lados. */
export function textChainedMembers(text) {
  const members = [];

  for (const match of text.matchAll(newReceiverPattern())) {
    const close = closingIndex(text, match.index + match[0].length - 1);

    if (close < 0)
      continue;

    let dot = close + 1;

    while (dot < text.length && /\s/.test(text[dot]))
      dot += 1;

    if (text[dot] === '?' && text[dot + 1] === '.')
      dot += 1;                          // `?.`: deja el punto en `dot`, como `.`

    if (text[dot] !== '.')
      continue;

    const member = memberNamePattern().exec(text.slice(dot + 1));

    if (member != null)
      members.push(member[1]);
  }

  return members;
}
