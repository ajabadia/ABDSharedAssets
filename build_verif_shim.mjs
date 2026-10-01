/**
 * Los `expect`/`describe`/`it` de mentiritas para correr tests sin vitest.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ES UN FICHERO APARTE Y NO PARTE DEL HARNESS.
 *
 * El harness reescribe el `import ... from 'vitest'` del test para que apunte
 * aqui, y luego hace `await import()` de ese test. Si aqui y el harness fueran
 * el mismo modulo, el test importaria estaticamente un modulo que en ese
 * momento esta a medias de evaluarse, y node se queda esperando un await que no
 * se resuelve nunca: "unsettled top-level await", sin explicacion util.
 *
 * Partirlo en dos resuelve eso sin trucos: este fichero esta entero evaluado
 * cuando el test lo importa, y el harness lo importa tambien sin problema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUE NO ES ESTO.
 *
 * No es vitest. No hay snapshots, ni mocks, ni `each`, ni `beforeAll` con
 * estado. Lo que hay es lo justo para contar aserciones y decir cual fallo, y
 * a proposito: lo que se quiere comprobar es que lo que AFIRMA el test se
 * sostiene contra el codigo de hoy.
 */

import { inspect } from 'node:util';

export const estado = { total: 0, fallos: 0, donde: '(ninguno)' };

const rojo = (mensaje) => {
  estado.fallos += 1;
  console.log(`  ROJO  ${estado.donde}`);
  console.log(`        ${mensaje}`);
};

const contieneEn = (real, trozo) => {
  if (typeof real === 'string') return real.includes(trozo);
  if (Array.isArray(real)) return real.some((x) => JSON.stringify(x).includes(trozo));
  return false;
};

// `toEqual` de vitest compara ESTRUCTURALMENTE, no por identidad. Sin esto el
// shim seria mas estricto que el runner real y pondria rojos donde vitest no
// pone nada, que es la forma de que un shim se deje de creer el primero.
const mismo = (real, esperado) => (real === esperado
  || (real !== null && esperado !== null
    && typeof real === 'object' && typeof esperado === 'object'
    && JSON.stringify(real) === JSON.stringify(esperado)));

// Compara contra un matcher asimetrico. Va DESPUES de `mismo` a proposito y hace
// falta separarlo: `mismo` recibe el matcher de verdad, no lo que lleva dentro.
const cumple = (real, esperado) => (esperado?.[MARCA_ASIMETRICA] === true
  ? esperado.comprobar(real)
  : mismo(real, esperado));

const faltaDe = (real, esperados) => (Array.isArray(real) ? esperados : [])
  .filter((e) => !real.some((x) => mismo(x, e)));

// Los matchers asimetricos de vitest: son `expected` los que llevan la forma,
// no el valor recibido, asi que se marcan con un simbolo y los reconoce
// `mismo` por el Symbol y no por compararlos como datos. Sin esto, un test que
// dice «contiene estos cinco, y pueden ser mas» no se puede escribir, porque
// comparar la lista entera contra una sublista es comparar dos cosas
// distintas. Y el fallo tiene que decir QUE elemento falta, que es lo unico
// accionable.
const MARCA_ASIMETRICA = Symbol('asimetrica');

const contieneTodos = (real, esperados) => Array.isArray(real)
  && esperados.every((e) => real.some((x) => mismo(x, e)));

const matcher = (comprobacion, lista, etiqueta) => ({
  [MARCA_ASIMETRICA]: true,
  comprobar: comprobacion,
  lista,
  etiqueta
});

// Cada metodo cuenta UNA asercion, y el fallo dice las dos caras: lo que se
// esperaba y lo que vino. Un "true is not true" no ayuda a nadie a las dos de
// la manana.
export const expect = (real) => ({
  toBe: (esperado) => {
    estado.total += 1;
    if (!mismo(real, esperado)) {
      rojo(`toBe\n        esperado: ${inspect(esperado)}\n        real:     ${inspect(real)}`);
    }
  },
  toEqual: (esperado) => {
    estado.total += 1;
    if (!cumple(real, esperado)) {
      // Cuando lo que falló es un `arrayContaining`, el fallo útil no es «son
      // distintas»: es la lista de lo que no estaba. El rojo debe señalar el
      // elemento que falta, no el hecho de que las dos listas no cuadren.
      const faltan = esperado?.[MARCA_ASIMETRICA] === true
        ? `\n        falta:    ${inspect(faltaDe(real, esperado.lista))}`
        : '';
      // Imprimir el matcher entero saldria como `comprobar: [Function]` y
      // `lista: [...]`, que es la Representacion interna del shim, no lo que el
      // test quiere ver. Lo que se dice es «faltaba esto», con la etiqueta del
      // matcher de por medio.
      const esperadoTxt = esperado?.[MARCA_ASIMETRICA] === true
        ? `un valor que ${esperado.etiqueta}(${inspect(esperado.lista)})`
        : inspect(esperado);
      rojo(`toEqual\n        esperado: ${esperadoTxt}\n        real:     ${inspect(real)}${faltan}`);
    }
  },
  toStrictEqual: (esperado) => {
    estado.total += 1;
    if (!mismo(real, esperado)) {
      rojo(`toStrictEqual\n        esperado: ${inspect(esperado)}\n        real:     ${inspect(real)}`);
    }
  },
  toBeTruthy: () => {
    estado.total += 1;
    if (!real) rojo(`esperaba verdadero y vino ${inspect(real)}`);
  },
  toBeFalsy: () => {
    estado.total += 1;
    if (real) rojo(`esperaba falso y vino ${inspect(real)}`);
  },
  toBeNull: () => {
    estado.total += 1;
    if (real !== null) rojo(`esperaba null y vino ${inspect(real)}`);
  },
  toBeUndefined: () => {
    estado.total += 1;
    if (real !== undefined) rojo(`esperaba undefined y vino ${inspect(real)}`);
  },
  toBeDefined: () => {
    estado.total += 1;
    if (real === undefined) rojo('esperaba definido y vino undefined');
  },
  toBeGreaterThan: (n) => {
    estado.total += 1;
    if (!(real > n)) rojo(`esperaba mayor que ${n} y vino ${inspect(real)}`);
  },
  toBeLessThan: (n) => {
    estado.total += 1;
    if (!(real < n)) rojo(`esperaba menor que ${n} y vino ${inspect(real)}`);
  },
  // Las cuatro variantes "o igual". Los tests las usan para decir "al menos
  // esto" y "como mucho esto", que es una comparacion DISTINTA de la estricta:
  // un `>=` que se cumple con la igualdad sigue siendo un `>=` cumplido. Sin
  // ellas el test reventaba con «no es una funcion» en vez de dar su veredicto,
  // y eso es peor que no tener la asercion, porque el rojo de verdad se esconde
  // detras de un error de harness.
  toBeGreaterThanOrEqual: (n) => {
    estado.total += 1;
    if (!(real >= n)) rojo(`esperaba mayor o igual que ${n} y vino ${inspect(real)}`);
  },
  toBeLessThanOrEqual: (n) => {
    estado.total += 1;
    if (!(real <= n)) rojo(`esperaba menor o igual que ${n} y vino ${inspect(real)}`);
  },
  // Los dos alias "To" de vitest. Son funciones propias y no una referencia al
  // hermano de arriba porque, dentro de este literal de objeto, el nombre de la
  // clave todavia no esta ligado cuando se evalua el valor.
  toBeGreaterThanOrEqualTo: (n) => {
    estado.total += 1;
    if (!(real >= n)) rojo(`esperaba mayor o igual que ${n} y vino ${inspect(real)}`);
  },
  toBeLessThanOrEqualTo: (n) => {
    estado.total += 1;
    if (!(real <= n)) rojo(`esperaba menor o igual que ${n} y vino ${inspect(real)}`);
  },
  toHaveLength: (n) => {
    estado.total += 1;
    if (real?.length !== n) rojo(`esperaba longitud ${n} y vino ${inspect(real?.length)}`);
  },
  toContain: (trozo) => {
    estado.total += 1;
    if (!contieneEn(real, trozo)) {
      rojo(`esperaba que contuviera ${inspect(trozo)}\n        real: ${inspect(real).slice(0, 200)}`);
    }
  },
  toThrow: () => {
    estado.total += 1;
    try { real(); } catch { return; }
    rojo('esperaba que lanzara y no lanzo');
  },
  toMatch: (re) => {
    estado.total += 1;
    if (!re.test(String(real))) rojo(`esperaba que casara con ${re} y vino ${inspect(real).slice(0, 160)}`);
  },
  not: {
    toBe: (esperado) => {
      estado.total += 1;
      if (mismo(real, esperado)) rojo(`esperaba que NO fuera ${inspect(esperado)}`);
    },
    toEqual: (esperado) => {
      estado.total += 1;
      if (mismo(real, esperado)) rojo(`esperaba que NO fuera ${inspect(esperado)}`);
    },
    toContain: (trozo) => {
      estado.total += 1;
      if (contieneEn(real, trozo)) rojo(`esperaba que NO contuviera ${inspect(trozo)}`);
    },
    // El otro matcher que falta, y que se nota el dia que un test cuenta
    //occurencias: `not.toMatch` es como se dice "este texto NO aparece N veces",
    // que es justo lo que hay que comprobar cuando el preflight dice que
    // recorre los fallos todos antes de salir y no para en el primero.
    toMatch: (re) => {
      estado.total += 1;
      if (re.test(String(real))) {
        rojo(`esperaba que NO casara con ${re}\n        real: ${inspect(real).slice(0, 160)}`);
      }
    },
    // Al reves que `toThrow`, y hay que decirlo porque es el unico sitio del
    // shim donde invertir la condicion daria un falso rojo: aqui PASA si NO
    // lanza, y falla si lanza, diciendo QUE lanzo.
    toThrow: () => {
      estado.total += 1;
      try { real(); } catch (e) { rojo(`esperaba que NO lanzara, y lanzo: ${e.message}`); }
    },
    toThrowError: () => {
      estado.total += 1;
      try { real(); } catch (e) { rojo(`esperaba que NO lanzara, y lanzo: ${e.message}`); }
    },
  },});

// `expect.arrayContaining([...])` se escribe IGUAL que un matcher, pero no
// empieza una asercion: es el lado ESPERADO de un `toEqual`. Va por eso como
// propiedad de la funcion `expect`, no dentro del objeto que devuelve — meterlo
// dentro parece funcionar y no funciona nunca, porque ahi no se lo busca nadie.
// Dice «este elemento tiene que estar dentro», y no «esta lista es esta lista»:
// esa distincion es la que permite comprobar un conjunto sin fijar su tamano,
// que es como se escribe «estos cinco artefactos, y pueden ser mas».
expect.arrayContaining = (lista) => matcher(
  (r) => contieneTodos(r, lista),
  lista,
  'arrayContaining'
);

export const describe = (nombre, fn) => {
  console.log(`\n${nombre}`);
  fn();
};

export const it = (nombre, fn) => {
  estado.donde = nombre;
  const antes = estado.fallos;
  try { fn(); } catch (e) { rojo(`ha lanzado: ${e.message}`); }
  if (estado.fallos === antes) console.log(`  verde  ${nombre}`);
};

export const test = it;
export const beforeEach = (fn) => fn();
export const beforeAll = (fn) => fn();
export const afterEach = () => {};
export const afterAll = () => {};
