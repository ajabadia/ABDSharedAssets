/**
 * Regla 11 — forma de los accesos.
 *
 * el ejemplo toca cada miembro como la clase lo declara.
 *
 * El detector y su ENTRADA del catalogo viven juntos, en este modulo: los ayudantes que
 * solo usa esta regla se quedan aqui (privados); los que comparte, en las capas.
 */

import {
  moduleExporting,
} from '../api.js';

import {
  chainedReceivers,
} from '../calls.js';

import {
  docBlocks,
} from '../docs.js';

import {
  memberDeclarations,
} from '../members.js';

import {
  MODULES,
} from '../modules.js';

import {
  boundReceiverAccesses,
} from '../receptors.js';

import {
  exampleBindings,
} from '../usage.js';

/** La forma de un acceso segun lo que sigue al nombre del miembro: `(` lo llama, un `=`
 *  (y no `==`) lo escribe, cualquier otra cosa lo lee. */
export function accessKind(text, at) {
  let i = at;

  while (i < text.length && /\s/.test(text[i]))
    i += 1;

  const next = text[i];

  return next === '(' ? 'call' : next === '=' && text[i + 1] !== '=' ? 'write' : 'read';
}

/** Los accesos de un texto sobre el receptor encadenado: [{ className, member, access }],
 *  sin `variable` (el objeto no tiene nombre). */
export function chainedMemberAccesses(text) {
  return chainedReceivers(text).map(({ className, member, memberAt }) => ({
    className,
    variable: null,
    member,
    access: accessKind(text, memberAt + member.length),
  }));
}

/** Los accesos que un ejemplo hace a los miembros del objeto que el MISMO bloque
 *  construye: [{ className, variable, member, access }], con `access` = 'call'
 *  (`pad.setValue(0.2)`), 'read' (`ts.value`) o 'write' (`ts.value = 1`), con
 *  encadenado opcional incluido (`pad?.value`, `pad.setValue?.()`, que es la misma
 *  promesa). Sigue DOS
 *  receptores: el que el bloque ata (`const pad = new XYPad(...)`, con su `variable`),
 *  y el encadenado que no ata nada (`new XYPad(el).setCorners(...)`, `variable` = null).
 *  Los dos los siguen tambien las reglas 8/9/10. */
export function exampleMemberAccesses(source) {
  const accesses = [];

  for (const block of docBlocks(source)) {
    for (const binding of exampleBindings(block.text)) {
      for (const { variable, className, match } of boundReceiverAccesses(block.text, binding)) {
        accesses.push({
          className,
          variable,
          member: match[1],
          access: accessKind(block.text, match.index + match[0].length),
        });
      }
    }

    for (const access of chainedMemberAccesses(block.text))
      accesses.push(access);
  }

  return accesses;
}

/** Lo que admite cada forma declarada: un metodo se llama, un getter se lee, un setter
 *  se escribe y un campo se lee y se escribe. */
const ACCESS_BY_FORM = {
  method: ['call'],
  get: ['read'],
  set: ['write'],
  field: ['read', 'write'],
};

const ACCESS_WORD = { call: 'lo llama', read: 'lo lee', write: 'lo escribe' };

const FORM_WORD = { method: 'metodo', get: 'getter', set: 'setter', field: 'campo' };

/** Accesos de los ejemplos que no cuadran con la FORMA en que la clase declara ese
 *  miembro: llamar a un getter (`ts.value()`), leer como propiedad un metodo
 *  (`ts.setValue`), escribir un nombre que solo tiene getter (`ts.value = 1`). Un
 *  miembro que la clase NO declara se salta: un campo de instancia (`this.value = ...`
 *  en el constructor) no es una declaracion, asi que no hay forma que comparar. */
export function mismatchedExampleAccesses(source, modules = MODULES) {
  const off = new Set();

  for (const { className, member, access } of exampleMemberAccesses(source)) {
    const target = moduleExporting(className, modules);

    if (target == null)
      continue;

    const declaration = memberDeclarations(target.source, className).get(member);

    if (declaration == null)
      continue;

    if ([...declaration.forms].some((form) => ACCESS_BY_FORM[form].includes(access)))
      continue;

    const forms = [...declaration.forms].map((form) => FORM_WORD[form]).join('/');

    off.add(`${className}.${member}: el ejemplo ${ACCESS_WORD[access]}, la clase lo declara ${forms}`);
  }

  return [...off].sort();
}

/** La entrada del catalogo: titulo, asercion, flecha y receta. Su NOMBRE sale
 *  del detector (`detector.name`), y el barrel los ordena por `number`. */
export const mismatchedExampleAccessesRule = {
  number: 11,
  detector: mismatchedExampleAccesses,
  title: 'forma de los accesos',
  assertion: 'el ejemplo toca cada miembro como la clase lo declara',
  about: 'El ejemplo tiene que tocar cada miembro como la clase lo declara: método ' +
    'llamado, getter leído, setter escrito.',
  limit: 'solo juzga contra miembros DECLARADOS: un campo de instancia no lo es, y sin ' +
    'forma declarada no hay nada que comparar',
  edge: 2,
  recipe: {
    module: 'wheel.js', cited: ['Wheel.destroy: el ejemplo lo lee, la clase lo declara metodo'],
    about: 'lee como dato un miembro que la clase declara metodo, y el caso de '
      + 'fabrica repite el mismo juicio sobre una API que entrega otra cosa',
    limit: 'ninguno de los dos casos toca un atributo de la instancia ni una llamada '
      + 'suelta: de eso responden la 9 y la 12, no esta receta',
    mutate: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.destroy;'),
    safe: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.setValue(0.5);\n *   wheel.destroy();'),
    // La 11 sigue DOS receptores: la clase (`new Wheel(el)`) y la fabrica
    // (`const drawer = createDrawer(...)`). Los ejemplos reales de fabrica solo LLAMAN a los
    // miembros de su API, asi que el caso que el inventario no trae —leer como dato un metodo
    // de esa API— se documenta y se prueba aqui: mismo contrato que el caso base (una
    // mutacion sobre el modulo real y una variacion valida que no puede soltar nada).
    factory: {
      module: 'drawer.js', cited: ['createDrawer.close: el ejemplo lo lee, la clase lo declara metodo'],
      mutate: (source) => source.replace(' *   drawer.close();', ' *   drawer.close;'),
      safe: (source) => source.replace(' *   drawer.close();',
        ' *   const host = drawer.element;   // un campo del API, leido como dato\n *   drawer.close();'),
    },
  },
};
