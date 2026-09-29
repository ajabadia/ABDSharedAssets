/**
 * Meta-guardia: que las guardias de cobertura sigan pudiendo fallar, y que la
 * superficie del audit no crie exports muertos.
 *
 * Seis miradas: cinco sobre el propio fuente del audit, una sobre la LIBRERIA
 * que audita —de ella se vigila la superficie y los regex— y una mas, la de los regex,
 * que llega a los CONSUMIDORES del paquete:
 *   - caza las aserciones de una guardia de cobertura que comparan la misma expresion
 *     a los dos lados: no pueden fallar, ya no vigilan nada;
 *   - exige que TODO export de los modulos internos (las capas, los modulos de regla) lo
 *     alcance algo de lo que EJERCITA la suite —las reglas, los auto-tests, los unitarios,
 *     el contrato de CI, el diagrama y todo consumidor de dentro y de fuera del
 *     directorio— o lo que el barrel se queda para componer el catalogo —las entradas de
 *     las reglas—, directa o por una cadena de llamadas. Un helper que nadie usa es un
 *     export muerto: o se ejercita, o se retira;
 *   - exige que la superficie del barrel (`detectors.js`) sea EXACTAMENTE lo que sus
 *     consumidores importan —el API, no el volcado de las familias— y que el barrel sea
 *     la unica puerta: un ayudante que nadie importa no se re-exporta, y una linea
 *     olvidada se delata aunque ningun consumidor llegue a importar ese nombre. Y que el
 *     fichero sea el que escribe `barrel.js`: la superficie se GENERA (los nombres se
 *     piden a las familias que los exportan), asi que mover un detector de un modulo a
 *     otro no obliga a reescribir su linea —lo que se queda a mano se delata aquí—
 *     y que ningún nombre tenga DOS HOGARES: un detector declarado en un modulo y que
 *     SOBRA en otro, con el barrel en medio, no se le puede elegir la casa —su aviso de
 *     generador sale solo cuando alguien PIDE el nombre, y ese alguien llega mas tarde
 *     que la mudanza que lo duplicó—, así que se mira siempre, y el aviso nombra tambien el
 *     modulo que ya lo saca de uno de los dos, que es donde se ve que la elección esta
 *     hecha;
 *   - exige que el CATALOGO este entero: los numeros de las reglas son unicos y
 *     correlativos desde 1 —el orden lo pone el numero que cada regla declara— y cada
 *     modulo de `tests/audit/rules/` tiene su entrada, en los dos sentidos;
 *   - y mira a la LIBRERIA: el barrel (`components/index.js`) es su API, cada nombre
 *     suyo sale de un modulo de verdad —resueltas las cadenas de re-exportacion, que un
 *     modulo puede sacarlo de otro, y sin duplicados—, y un export que el barrel no
 *     declara es un HELPER INTERNO: tiene que usarlo alguien del repo —otro modulo de la
 *     libreria, el demo, un smoke o un test—. La documentacion no usa: promete, y un
 *     import prometido en una guia que el barrel no declara es una API que se asoma por
 *     una puerta que no es la suya;
 *   - y caza el REGEX que se come su separador: uno que exige el separador por delante
 *     (`(?:^|,)`) y ADEMAS lo consume al final lee un elemento de cada dos, porque el
 *     separador que cierra un elemento ya no esta para abrir el siguiente. Es el fallo
 *     real que tuvo `optionIdentifiers` (`wire(el, handlers, n)` perdia `handlers`), y
 *     la misma mirada se extiende a la LIBRERIA —`components/` y `utils/`, donde hoy solo
 *     queda un regex entre todos y ningun test delata que se cuele otro— y a los
 *     CONSUMIDORES: `demo/`, `smoke/` y los tests, que es donde mas se trocea una lista
 *     para assertar sobre el DOM real y donde un fallo asi no lo delata nada. Los tres
 *     barridos se calibran por separado, con su minimo y su mordisco. Y en esas mismas
 *     tres listas, la clase del otro lado del equilibrio: el regex que recorta un texto
 *     equilibrado por CORCHETES donde va una llave —el `@param {{ x?: number,
 *     y?: number }}` de lcdMachine y el `Array<{id: string, label: string}>` de
 *     themeSwitcher se leyeron a medias por el corchete de su hermano—. Esa sale en
 *     cero, y porque el codigo es correcto —el tipo inline lo leen `closingIndex` y
 *     `literalEntryRanges`, que caminan y no recortan—, asi que su calibracion es
 *     el mordisco: que caiga el corte y que no caigan los dos parecidos que se le
 *     parecen, la marca de opcional de `[options.step]` y el acceso a indice
 *     detras de un nombre. El escaner y las clases NO son suyos: los trae
 *     `regexes.js`, que es donde vive el lector y la tabla de clases, y esta mirada
 *     solo barre sus tres listas y se asegura de que esa capa siga siendo la unica
 *     que declara un juez— dos copias medirian lo mismo y el hallazgo que
 *     dejan de dar no lo diria nadie.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDIT_CONSUMERS,
  AUDIT_MODULES,
  AUDIT_SIN_API,
  CONSUMER_SOURCES,
  DOC_SOURCES,
  LIBRARY_SOURCES,
  MODULES,
  RULES,
  barrelDrift,
  barrelProblems,
  barrelSource,
  closingIndex,
  diagnostico,
  hogaresDobles,
  importStatements,
  informeDiagnostico,
  lineOf,
  regexOffenses,
  regexPatternsOf,
  skipString,
  withoutComments,
  withoutLiterals,
} from './detectors.js';

/* ---------------------------------------------------------------------------
 * Meta-guardia: que las guardias de cobertura sigan pudiendo fallar
 * ------------------------------------------------------------------------- */

/** Matchers simetricos: los dos lados son el mismo tipo de valor, asi que si su texto
 *  es identico la asercion no puede fallar. */
const SYMMETRIC_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/** El texto de una expresion con los espacios de sobra colapsados, para comparar los
 *  dos lados de una asercion. */
const squeezed = (text) => text.replace(/\s+/g, ' ').trim();

/** Si un indice cae dentro de alguna de las regiones `[inicio, fin]`. */
const withinRanges = (ranges, at) => ranges.some(([start, end]) => at >= start && at <= end);

/** El propio fuente de la auditoria, para que la meta-guardia se mire en el espejo. */
const SELF_SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rules.js'), 'utf-8');

/** Las regiones `[inicio, fin]` de cada `describe('cobertura ...')`: las guardias de
 *  cobertura, que son las que tienden a quedar pinzadas. Si un describe se renombra
 *  sin el prefijo, la meta-guardia pierde esa guardia de vista, asi que un test exige
 *  que encuentre unas cuantas. */
function coverageGuardRanges(source) {
  const ranges = [];

  for (const match of source.matchAll(/\bdescribe\s*\(\s*(['"])(cobertura[^'"]*)\1\s*,/g)) {
    const blockOpen = source.indexOf('{', match.index + match[0].length);

    if (blockOpen < 0)
      continue;

    const blockClose = closingIndex(source, blockOpen);

    if (blockClose >= 0)
      ranges.push([match.index, blockClose]);
  }

  return ranges;
}

/** Cuantas aserciones (`expect(`) caen dentro de las regiones: si esto baja a cero, la
 *  meta-guardia estaria mirando un fuente sin guardias. */
function scannedAssertions(source, ranges) {
  return [...withoutComments(source).matchAll(/\bexpect\s*\(/g)]
    .filter((match) => withinRanges(ranges, match.index)).length;
}

/** Aserciones que comparan LA MISMA expresion a los dos lados:
 *  `expect(visibles).toEqual(visibles)`. No pueden fallar, asi que una guardia de
 *  cobertura que llegue a eso ya no vigila nada: quedo PINZADA. Se mira el fuente SIN
 *  comentarios (una asercion de ejemplo dentro de un comentario no cuenta) y solo en
 *  los matchers simetricos, donde comparar el mismo texto es la tautologia. `ranges`
 *  limita el barrido a las guardias de cobertura; sin el, mira todo el fuente. */
function selfComparedAssertions(source, ranges = null) {
  const code = withoutComments(source);
  const off = [];

  for (const expect of code.matchAll(/\bexpect\s*\(/g)) {
    if (ranges != null && !withinRanges(ranges, expect.index))
      continue;

    const open = expect.index + expect[0].length - 1;
    const close = closingIndex(code, open);

    if (close < 0)
      continue;

    const matcher = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(close + 1));

    if (matcher == null || !SYMMETRIC_MATCHERS.has(matcher[1]))
      continue;

    const matcherOpen = close + 1 + matcher[0].length - 1;
    const matcherClose = closingIndex(code, matcherOpen);

    if (matcherClose < 0)
      continue;

    const left = squeezed(code.slice(open + 1, close));
    const right = squeezed(code.slice(matcherOpen + 1, matcherClose));

    if (left === right)
      off.push(`${lineOf(code, expect.index)}: expect(${left}).${matcher[1]}(...) compara la misma expresion a los dos lados`);
  }

  return off;
}

describe('meta-guardia: las guardias de cobertura no pueden volverse tautologicas', () => {
  const ranges = coverageGuardRanges(SELF_SOURCE);

  it('encuentra las guardias de cobertura (no se mira en un fuente vacio)', () => {
    expect(ranges.length).toBeGreaterThanOrEqual(6);
    expect(scannedAssertions(SELF_SOURCE, ranges)).toBeGreaterThanOrEqual(10);
  });

  it('ninguna asercion de las guardias compara la misma expresion a los dos lados', () => {
    expect(selfComparedAssertions(SELF_SOURCE, ranges)).toEqual([]);
  });

  it('la meta-guardia muerde: caza una guardia tautologica', () => {
    expect(selfComparedAssertions('expect(visibles).toEqual(visibles);')).toHaveLength(1);
    expect(selfComparedAssertions('expect(visibles).toEqual(["a", "b"]);')).toEqual([]);
    expect(selfComparedAssertions('expect(a).toEqual(b); expect(c).toBe(c);')).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------
 * Cobertura de los exports: ninguno sin ejercitar
 * ------------------------------------------------------------------------- */

/** El directorio del audit, para leer sus ficheros por su nombre. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** El barrel del audit: el unico modulo que los consumidores importan, y el sitio donde se
 *  compone el catalogo. */
const BARREL_FILE = 'detectors.js';

/** Los modulos INTERNOS: los que el barrel re-exporta (las capas, los modulos de regla y
 *  `receptors.js`/`modules.js`). La lista sale del PROPIO barrel: una capa o una regla
 *  nueva queda dentro en cuanto alguien importa un nombre suyo y el generador lo nombra. */
const FAMILY_FILES = [...new Set(
  [...readFileSync(join(HERE, BARREL_FILE), 'utf-8')
    .matchAll(/export\s*\{[^}]*\}\s*from\s*'\.\/([\w.\/-]+)'/g)].map((match) => match[1]),
)];

/** Los ficheros que EJERCITAN la superficie: los consumidores del barrel tal y como los
 *  cuenta `modules.js` —las reglas, sus auto-tests, sus unitarios, la entrada que los
 *  importa, el contrato de CI y los tests del hermano—, una lista que se hace sola del
 *  directorio. Un consumidor nuevo queda dentro sin que nadie se acuerde, y es la MISMA
 *  lista que usa el generador del barrel: si aqui se colara un fichero, el barrel se
 *  escribiria con otra superficie. El BARREL no cuenta: ese no ejercita nada, nombra TODO
 *  lo que el API expone, y usarlo de raiz volveria tautologica la guardia. */
const EXERCISE_FILES = AUDIT_CONSUMERS.map(({ label }) => label);

/** El fuente de un fichero del propio audit (o de un vecino suyo: `../x.js`). */
const auditSource = (name) => readFileSync(join(HERE, name), 'utf-8');

/** Los nombres que el barrel se queda para SI: los que importa para componer el catalogo.
 *  No son API (no los re-exporta), asi que no los ejercita ningun test por el hecho de
 *  nombrarlos: los ejercita el propio barrel al componerlos. Sin contar con ellos, la
 *  entrada de cada regla pareceria un export sin usar. */
function barrelPrivateNames(barrel) {
  const surface = new Set(barrelSurface(barrel).names.keys());
  const names = [];

  for (const statement of importStatements(barrel))
    for (const raw of statement.names)
      for (const name of raw.split(',')) {
        const local = name.trim().split(/[\s]+as[\s]+/).pop();

        if (local !== '' && !surface.has(local))
          names.push(local);
      }

  return names;
}

/** Las declaraciones de primer nivel de un fuente —`export? function|const|class NOMBRE`,
 *  exportadas o no—: cada una con su nombre, si se exporta y el TROZO que va hasta la
 *  siguiente. Los helpers internos tambien son eslabones: si `a` llama a `b` y `b` usa
 *  `c`, lo que ejercita a `a` ejercita a `c`. */
function topLevelDeclarations(source) {
  const marks = [...source.matchAll(/^(export\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)];

  return marks.map((mark, index) => ({
    name: mark[2],
    exported: Boolean(mark[1]),
    body: source.slice(mark.index, index + 1 < marks.length ? marks[index + 1].index : source.length),
  }));
}

/** El CODIGO de un fuente: sin comentarios y sin el contenido de las cadenas. Es lo unico
 *  que se lee para preguntar quien usa un nombre: un nombre que solo esta en un literal o
 *  en un comentario no esta en el programa, y el que este en un literal es la forma mas
 *  facil de sembrar una guardia por accidente (los fixtures del audit son codigo dentro
 *  de cadenas, y un mensaje de esta misma pagina tambien). */
const codeOf = (text) => withoutLiterals(withoutComments(text));

/** Los nombres que un fuente USA de verdad: los que trae en un `import { … }` y los que
 *  LLAMA (`nombre(`), sin contar los metodos de otro (`x.nombre(`, que son una propiedad
 *  suya). Nombrar no es usar: con esta cuenta, un fixture sintetico deja de poder hacer
 *  pasar por ejercitado un export que nadie ha probado nunca. */
function usedNames(text) {
  const imported = importStatements(withoutComments(text))
    .flatMap((statement) => statement.names);
  const called = [...codeOf(text).matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1]);

  return new Set([...imported, ...called]);
}

/** Los exports de las familias que NO se alcanzan desde los tests, como
 *  `${fichero}:${nombre}`. Se parte de los nombres que los tests nombran —y de los que el
 *  barrel se queda para componer el catalogo, o sea las entradas de las reglas— y se cierra
 *  transitivamente por quien usa a quien —en cualquier familia—. La SEMILLA son
 *  los nombres que un fichero importa o llama, no los que nombra: un literal o un
 *  comentario no ejercitan nada. Y la cadena, por mencion pero sobre codigo sin
 *  literales, que es donde una referencia suelta dentro de una familia si puede
 *  aparecer sin ser llamada. Lo que queda fuera del cierre esta muerto. */
function unexercisedExports(sources, tests) {
  const bodies = new Map();
  const exported = new Set();

  for (const [file, raw] of sources) {
    for (const declaration of topLevelDeclarations(codeOf(raw))) {
      bodies.set(`${file}:${declaration.name}`, declaration.body);

      if (declaration.exported)
        exported.add(`${file}:${declaration.name}`);
    }
  }

  const seed = usedNames(tests);
  const nameOf = (key) => key.slice(key.indexOf(':') + 1);
  const named = (name, body) => new RegExp(`\\b${name}\\b`).test(body);
  const reachable = new Set([...exported].filter((key) => seed.has(nameOf(key))));

  let grew = true;

  while (grew) {
    grew = false;

    for (const [key, body] of bodies) {
      if (reachable.has(key))
        continue;

      const name = nameOf(key);

      if ([...reachable].some((user) => named(name, bodies.get(user)))) {
        reachable.add(key);
        grew = true;
      }
    }
  }

  return [...exported].filter((key) => !reachable.has(key)).sort();
}

describe('cobertura de los exports del audit', () => {
  it('todo export de un modulo interno lo ejerce algo que corre la suite', () => {
    const sources = FAMILY_FILES.map((name) => [name, auditSource(name)]);
    const tests = [
      ...EXERCISE_FILES.map((name) => auditSource(name)),
      // y el barrel con su fuente entera: lo que IMPORTA (las entradas de las reglas, que
      // compone el catalogo) cuenta como ejercitado por el, y lo que re-exporta no
      // —eso lo vigila la superficie, que es otra cosa: estar en el API no es
      // probarlo—,
      auditSource(BARREL_FILE),
    ].join('\n');

    // Las semillas son TODO lo que corre la suite: los tests, los consumidores del
    // propio audit (el diagrama, el contrato de CI, esta misma meta-guardia, la entrada)
    // y el barrel. De cada uno solo cuenta lo que IMPORTA o LLAMA: un nombre citado en un
    // fixture o en un mensaje no ha sido probado, y dejarlo pasar era sembrar la guardia.
    // Un export que solo usa el diagrama cuenta como ejercitado —lo importa y lo llama—
    // igual que uno que usa un test; con las tres semillas de antes, ese caso salia como
    // export muerto y el mensaje prometia una cobertura que no era la que miraba.
    //
    // Si el barrido se queda vacio (un fichero que no se lee, un regex roto), la
    // guardia no mira nada: los minimos lo delatan.
    expect(FAMILY_FILES.length).toBeGreaterThanOrEqual(4);
    expect(EXERCISE_FILES.length).toBeGreaterThanOrEqual(20);

    expect(
      unexercisedExports(sources, tests),
      'un export que no lo ejerce ningun test ni consumidor del audit: si es un detector'
      + ' de regla, le falta su modulo en tests/audit/rules/ (y su linea en el barrel)',
    ).toEqual([]);
  });

  it('la guardia muerde: un export que nadie nombra sale sin ejercitar', () => {
    const sources = [
      ['fam.js', 'export function usada() { return 1; }\nexport function muerta() { return 2; }\n'],
    ];

    expect(unexercisedExports(sources, 'usada();')).toEqual(['fam.js:muerta']);
    expect(unexercisedExports(sources, 'usada(); muerta();')).toEqual([]);
  });

  it('la guardia muerde: un fixture no siembra la cuenta, un import y una llamada si', () => {
    const sources = [
      ['fam.js', 'export function usada() { return 1; }\nexport function muerta() { return 2; }\n'],
    ];

    // un import la ejercita, y una llamada tambien: son las dos formas de USAR un
    // nombre, y las dos que tienen que contar
    expect(unexercisedExports(sources, "import { usada } from './fam.js';\n")).toEqual(['fam.js:muerta']);
    expect(unexercisedExports(sources, 'usada();')).toEqual(['fam.js:muerta']);

    // pero un FIXTURE que se parece a codigo no: es una cadena, y lo que hay dentro de
    // una cadena no se ha probado nunca. Era justo el caso del audit, cuyos fixtures son
    // fuentes falsas dentro de cadenas: sembraban la guardia sin ejercitar nada.
    expect(unexercisedExports(sources, "const ejemplo = 'usada();\\n';\n")).toEqual(
      ['fam.js:muerta', 'fam.js:usada']);
    expect(unexercisedExports(sources, '// usada();\n')).toEqual(['fam.js:muerta', 'fam.js:usada']);
    expect(unexercisedExports(sources, '`usada();`\n')).toEqual(['fam.js:muerta', 'fam.js:usada']);

    // y un metodo de otro es una propiedad suya, no una llamada a ese nombre
    expect(unexercisedExports(sources, 'x.usada();\n')).toEqual(['fam.js:muerta', 'fam.js:usada']);
  });

  it('la cobertura atraviesa las cadenas: un export alcanzable por otro no esta muerto', () => {
    const sources = [
      ['fam.js', 'export function a() { return b(); }\nexport function b() { return c; }\nconst c = 1;\n'],
    ];

    // `a` se nombra en el test; `b` (export) y `c` (interno) se alcanzan por la cadena.
    expect(unexercisedExports(sources, 'a();')).toEqual([]);
    expect(unexercisedExports(sources, 'nada();')).toEqual(['fam.js:a', 'fam.js:b']);
  });
});

/* ---------------------------------------------------------------------------
 * Los ayudantes: ninguno enterrado
 * ------------------------------------------------------------------------- */

/** Las declaraciones del audit que NINGUNA otra alcanza, partiendo del API (lo que el
 *  barrel declara). Con las capas y los modulos de regla repartidos, un ayudante puede
 *  vivir en una capa y usarse desde otra, asi que el cierre es GLOBAL y mira todos los
 *  modulos a la vez: un ayudante privado al que nadie llega es codigo muerto, este donde
 *  este. `names` son las raices: el API que el barrel declara MAS lo que el barrel se
 *  queda para componer el catalogo —las entradas de las reglas, que no son API—. */
function unexercisedDeclarations(sources, names) {
  const bodies = new Map();
  const where = new Map();

  for (const [file, source] of sources)
    for (const declaration of topLevelDeclarations(codeOf(source))) {
      bodies.set(declaration.name, declaration.body);
      where.set(declaration.name, file);
    }

  const reachable = new Set(names.filter((name) => bodies.has(name)));

  let grew = true;

  while (grew) {
    grew = false;

    for (const [name, body] of bodies)
      if (!reachable.has(name)
        && [...reachable].some((user) => new RegExp(`\\b${name}\\b`).test(bodies.get(user)))) {
        reachable.add(name);
        grew = true;
      }
  }

  return [...bodies.keys()]
    .filter((name) => !reachable.has(name))
    .map((name) => `${where.get(name)}:${name}`)
    .sort();
}

describe('los ayudantes del audit', () => {
  const sources = () => FAMILY_FILES.map((name) => [name, auditSource(name)]);
  const api = () => [...barrelSurface(auditSource(BARREL_FILE)).names.keys()];
  const roots = () => [...api(), ...barrelPrivateNames(auditSource(BARREL_FILE))];

  it('todo lo que vive en un modulo interno se alcanza desde el API', () => {
    expect(FAMILY_FILES.length).toBeGreaterThanOrEqual(20);
    expect(api().length).toBeGreaterThanOrEqual(90);

    expect(
      unexercisedDeclarations(sources(), roots()),
      'un ayudante que nadie llama —ni el API ni nadie del audit— es codigo muerto: se usa'
      + ' o se va, y si solo lo usan los tests, se exporta por el barrel',
    ).toEqual([]);
  });

  it('la guardia muerde: el ayudante huerfano sale por su nombre', () => {
    const source = 'export function usada() { return viva(); }\n'
      + 'function viva() { return 1; }\nfunction huerfana() { return viva(); }\n';

    expect(unexercisedDeclarations([['fam.js', source]], ['usada'])).toEqual(['fam.js:huerfana']);
    expect(unexercisedDeclarations([['fam.js', source]], ['usada', 'huerfana'])).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * La superficie del barrel: el API, no el volcado de las familias
 * ------------------------------------------------------------------------- */

/**  `duplicates` los nombres nombrados dos veces y `wildcards` los `export * from`, que
 *  volcarian la familia entera y, de paso, ocultarian la superficie. Se lee el fuente SIN
 *  comentarios: la prosa del barrel habla de `export *`, y eso no es una linea. */
function barrelSurface(barrel) {
  const code = withoutComments(barrel);
  const names = new Map();
  const duplicates = [];

  for (const block of code.matchAll(/export\s*\{([^}]*)\}\s*from\s*'\.\/([\w.\/-]+)'/g))
    for (const raw of block[1].split(',')) {
      const name = raw.trim();

      if (name === '')
        continue;
      if (names.has(name))
        duplicates.push(name);

      names.set(name, block[2]);
    }

  // una declaracion propia del barrel (`export const RULES = ...`): sin fichero de origen,
  // se declara aqui y no se re-exporta de nadie
  for (const local of code.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (names.has(local[1]))
      duplicates.push(local[1]);

    names.set(local[1], null);
  }

  return {
    names,
    duplicates,
    wildcards: [...code.matchAll(/export\s*\*[^;]*;/g)].map((match) => squeezed(match[0])),
  };
}

/** El diagnostico de la superficie, en los dos sentidos: un nombre que el barrel declara y
 *  ningun consumidor importa es superficie muerta —o se importa, o se cae del barrel—, y
 *  un nombre que un consumidor importa y el barrel no declara deja al consumidor colgando.
 *  Ademas, el barrel es la UNICA PUERTA: un consumidor no tira de una familia directa, su
 *  superficie se lee nombre a nombre (nada de `export *` ni de importarlo como namespace) y
 *  cada nombre sale de una familia de verdad. La excepcion son las FAMILIAS entre si —su
 *  cableado interno, que es lo que las hace un audit y no una carpeta de helpers—, asi que
 *  la puerta se exige a los ficheros que no son familia; antes venia escondida en como se
 *  armaba la lista de consumidores, que hoy incluye tambien las familias. `families` da
 *  los ficheros de familia: sus nombres y de donde el barrel puede re-exportar. */
function barrelSurfaceOffenses({ barrel, consumers, families }) {
  const { names, duplicates, wildcards } = barrelSurface(barrel);
  const known = new Set(families.map(([file]) => file));
  const imported = new Map();
  const off = wildcards.map((text) =>
    `el barrel usa \`${text}\`: su superficie tiene que ser explicita, nombre a nombre`);

  for (const [file, source] of consumers)
    for (const statement of importStatements(source)) {
      // el modulo de origen, escrito como lo escribe quien lo importa: un consumidor de aqui
      // pone `./docs.js` y uno de un subdirectorio de `tests/` pone `../audit/docs.js`
      const origin = statement.specifier.replace(/^\.\.\/audit\//, '').replace(/^\.\//, '');

      if (/(^|\/)detectors\.js$/.test(statement.specifier)) {
        if (statement.namespace != null)
          off.push(`${file} importa el barrel como namespace (\`* as ${statement.namespace}\`): su API se lee nombre a nombre`);

        for (const name of statement.names)
          imported.set(name, [...(imported.get(name) ?? []), file]);
      } else if (known.has(origin) && !known.has(file))
        off.push(`${file} importa de ${origin}: el barrel es la unica puerta para los consumidores`);
    }

  for (const name of names.keys())
    if (!imported.has(name))
      off.push(`${name} (el barrel lo declara y ningun consumidor lo importa: o se importa, o se cae del barrel)`);

  for (const [name, files] of imported)
    if (!names.has(name))
      off.push(`${name} (${files.join(' ')} lo importa del barrel y el barrel no lo declara)`);

  for (const [name, file] of names)
    if (file != null && !known.has(file))
      off.push(`${name} (el barrel lo re-exporta de ${file}, que no es un modulo del audit)`);

  for (const name of duplicates)
    off.push(`${name} (el barrel lo nombra dos veces)`);

  return off;
}

describe('la superficie del barrel', () => {
  const families = () => FAMILY_FILES.map((name) => [name, auditSource(name)]);
  const modules = () => AUDIT_MODULES.map(({ label, source }) => [label, source]);
  const consumers = () => AUDIT_CONSUMERS.map(({ label, source }) => [label, source]);
  const surface = () => ({ barrel: auditSource(BARREL_FILE), consumers: consumers(), families: families() });

  it('el barrel es EXACTAMENTE lo que sus consumidores importan', () => {
    // Si el barrido se queda vacio (un barrel que no se lee, un consumidor que no se
    // encuentra), la guardia no mira nada: el minimo lo delata.
    expect(barrelSurface(auditSource(BARREL_FILE)).names.size).toBeGreaterThanOrEqual(90);
    expect(consumers().length).toBeGreaterThanOrEqual(20);

    expect(
      barrelSurfaceOffenses(surface()),
      'el barrel es el API de la maquinaria: solo lo que sus consumidores importan, y el'
      + ' unico sitio del que se importa',
    ).toEqual([]);
  });

  it('la guardia muerde: la superficie muerta se cae, aunque el nombre exista', () => {
    expect(barrelSurfaceOffenses({
      barrel: "export {\n  usada,\n  muerta,\n} from './fam.js';\n",
      consumers: [['rules.js', "import { usada } from './detectors.js';\n"]],
      families: [['fam.js', '']],
    })).toEqual(['muerta (el barrel lo declara y ningun consumidor lo importa: o se importa, o se cae del barrel)']);

    expect(barrelSurfaceOffenses({
      barrel: "export {\n  usada,\n} from './fam.js';\n",
      consumers: [['rules.js', "import { usada, otra } from './detectors.js';\n"]],
      families: [['fam.js', '']],
    })).toEqual(['otra (rules.js lo importa del barrel y el barrel no lo declara)']);
  });

  it('la guardia muerde: la puerta de al lado, el namespace y el `export *`', () => {
    const barrel = "export {\n  usada,\n} from './fam.js';\n";
    const families = [['fam.js', 'export function usada() {}\nexport function interna() {}\n']];

    expect(barrelSurfaceOffenses({
      barrel, families, consumers: [['rules.js', "import { interna } from './fam.js';\n"]],
    })).toEqual([
      'rules.js importa de fam.js: el barrel es la unica puerta para los consumidores',
      'usada (el barrel lo declara y ningun consumidor lo importa: o se importa, o se cae del barrel)',
    ]);

    // Con `export *` la superficie declarada queda VACIA para esta lectura: los dos avisos
    // son los que dicen que ahi no se puede leer una API.
    expect(barrelSurfaceOffenses({
      barrel: "export * from './fam.js';\n", families,
      consumers: [['rules.js', "import * as todo from './detectors.js';\n"]],
    })).toEqual([
      "el barrel usa `export * from './fam.js';`: su superficie tiene que ser explicita, nombre a nombre",
      'rules.js importa el barrel como namespace (`* as todo`): su API se lee nombre a nombre',
    ]);

    expect(barrelSurfaceOffenses({
      barrel: "export {\n  usada,\n} from './otro.js';\n", families,
      consumers: [['rules.js', "import { usada } from './detectors.js';\n"]],
    })).toEqual(['usada (el barrel lo re-exporta de otro.js, que no es un modulo del audit)']);

    // Y lo mismo desde un subdirectorio de `tests/`, que nombra la familia con su ruta
    // entera: por el barrel no se dice nada, por la puerta de al lado si
    expect(barrelSurfaceOffenses({ barrel, families,
      consumers: [['../ui/x.test.js', "import { usada } from '../audit/detectors.js';\n"]],
    })).toEqual([]);

    expect(barrelSurfaceOffenses({ barrel, families,
      consumers: [['../ui/x.test.js', "import { interna } from '../audit/fam.js';\n"]],
    })).toEqual([
      '../ui/x.test.js importa de fam.js: el barrel es la unica puerta para los consumidores',
      'usada (el barrel lo declara y ningun consumidor lo importa: o se importa, o se cae del barrel)',
    ]);
  });

  it('el barrel es el que escribe el generador: ni una linea a mano', () => {
    // El fichero entero se GENERA (`tests/audit/barrel.js`): la cabecera, un bloque por
    // familia con los nombres que se piden de ella, y el catalogo. Asi mover un detector de
    // un modulo a otro no es reescribir su linea sino regenerar el fichero, y lo que se
    // quede a mano \u2014una linea de mas, un bloque al que se le ha olvidado anadir el
    // detector que se acaba de mudar\u2014 sale aqui con su numero de linea.
    const generated = barrelSource({ families: modules(), consumers: consumers() });

    expect(
      barrelDrift(auditSource(BARREL_FILE), generated),
      'el barrel lo escribe tests/audit/barrel.js a partir de las familias y de lo que piden'
      + ' sus consumidores: `pnpm audit:barrel` lo regenera (mover un detector no se'
      + ' escribe a mano)',
    ).toEqual([]);
  });

  // Un limite que conviene saber: si una mudanza a mano deja un nombre re-exportado del
  // modulo que no lo exporta, el enlace se rompe al cargar y el fallo es un `TypeError`
  // en el consumidor, no esta lista. Por eso el fichero se REGENERA y no se corrige a
  // mano; la guardia del texto pilla lo que si se puede comparar (una linea de mas, un
  // bloque en el sitio equivocado, un nombre ordenado despues de otro).
  it('el generador no pierde ni duplica lo que se importa', () => {
    // Lo que el generador no puede decidir solo tiene que delatarse, porque en un fichero
    // generado el error caeria lejos: un nombre que se pide y ninguna familia exporta (lo
    // diria el enlazador ESM al cargar) y un nombre que exportan dos familias (donde la
    // eleccion seria arbitraria).
    expect(barrelProblems({ families: modules(), consumers: consumers() })).toEqual([]);
  });

  it('el generador muerde: el bloque lo pone la familia que exporta el nombre', () => {
    const families = [
      ['docs.js', 'export function zeta() {}\nexport function alfa() {}\nexport function nadieLoPide() {}\n'],
      ['members.js', 'export function memberDeclarations() {}\n'],
      ['rules/moved.js', 'export function movido() {}\nexport const movidoRule = { number: 1, detector: movido };\n'],
      ['scan.js', 'export function closingIndex() {}\n'],
    ];
    // los nombres se piden en desorden, y de una familia que todavia no pide nadie no sale
    // bloque: el generador ordena, y lo que no se pide no es API.
    const consumers = [['rules.js', "import { closingIndex, movido, zeta, alfa } from './detectors.js';\n"]];
    const generated = barrelSource({ families, consumers });

    expect(generated).toContain("/** docs */\nexport {\n  alfa,\n  zeta,\n} from './docs.js';\n");
    expect(generated).toContain("/** la regla moved */\nexport {\n  movido,\n} from './rules/moved.js';\n");
    expect(generated).not.toContain('nadieLoPide');
    expect(generated).not.toContain('members.js');

    // los bloques van en orden de modulo, y el catalogo trae la entrada de cada modulo de
    // regla aunque su detector no lo pida nadie del barrel todavia
    expect(generated.indexOf("} from './docs.js';")).toBeLessThan(generated.indexOf("} from './rules/moved.js';"));
    expect(generated).toContain("\nimport { movidoRule } from './rules/moved.js';\n");
  });

  it('el generador muerde: una mudanza cambia el bloque, y el fichero viejo se delata', () => {
    // El caso que motivaba generarlo: un detector que se muda de una capa a un modulo de
    // regla. El bloque sale en el sitio nuevo, y el fichero que tenia la linea escrita a
    // mano en el viejo deja de encajar linea a linea.
    const pide = [['rules.js', "import { movido } from './detectors.js';\n"]];
    const antes = barrelSource({
      families: [['docs.js', 'export function movido() {}\n'], ['rules/moved.js', 'export const movidoRule = { number: 1, detector: movido };\n']],
      consumers: pide,
    });
    const despues = barrelSource({
      families: [['docs.js', 'export function otro() {}\n'], ['rules/moved.js', 'export function movido() {}\nexport const movidoRule = { number: 1, detector: movido };\n']],
      consumers: pide,
    });

    expect(antes).toContain("/** docs */\nexport {\n  movido,\n} from './docs.js';\n");
    expect(despues).toContain("/** la regla moved */\nexport {\n  movido,\n} from './rules/moved.js';\n");

    const drift = barrelDrift(antes, despues);

    expect(drift.length).toBeGreaterThan(0);
    expect(drift[0]).toMatch(/^linea \d+: el barrel pone `/);
    // y el caso de control: el fichero que genera el generador no se delata a si mismo
    expect(barrelDrift(despues, despues)).toEqual([]);
  });

  it('el generador muerde: la linea que falta y la que sobra se dicen con su numero', () => {
    const generated = barrelSource({
      families: [['docs.js', 'export function docBlocks() {}\n']],
      consumers: [['rules.js', "import { docBlocks } from './detectors.js';\n"]],
    });

    // un nombre borrado del bloque: desde ahi abajo ya nada cuadra, asi que el aviso cita
    // las primeras lineas y cuenta el resto, en vez de mentir con una diferencia por linea
    const sin = barrelDrift(generated.replace('  docBlocks,\n', ''), generated);

    expect(sin[0]).toMatch(/^linea \d+: el barrel pone `\} from '\.\/docs\.js';` y el generador `docBlocks,`$/);
    expect(sin[sin.length - 1]).toMatch(/^\u2026 y \d+ lineas mas que el generador no escribe$/);

    // una linea de mas al final, y un final de linea de Windows no es una diferencia de API
    expect(barrelDrift(`${generated}unRastro();\n`, generated)).toEqual([
      'linea ' + (generated.split('\n').length) + ': el barrel pone `unRastro();` y el generador `(el generador se acaba aqui)`',
    ]);
    expect(barrelDrift(generated.replace(/\n/g, '\r\n'), generated)).toEqual([]);

    // y sobre el FICHERO de verdad, que es el que se regenera: una linea que se queda a
    // mano sale con su numero y su texto, sin que nadie tenga que leer un diff
    const barrel = auditSource(BARREL_FILE);
    const conRastro = barrel.replace("} from './scan.js';", "} from './scan.js';\nunRastro();");
    const [first] = barrelDrift(conRastro, barrelSource({ families: modules(), consumers: consumers() }));

    expect(first).toMatch(/^linea \d+: el barrel pone `unRastro\(\);` y el generador `\(una linea en blanco\)`$/);
  });

  it('un nombre con dos hogares se delata aunque nadie lo pida todavia', () => {
    // El aviso del generador sale solo cuando alguien PIDE el nombre, porque su trabajo es
    // lo que el generador no puede escribir; este es el caso de antes, que no da ningun
    // fallo hoy y da el dia que alguien lo pida, con el generador cogiendo el hogar que le
    // salga. Aqui se mira siempre, y por eso el audit real —treinta y pico familias— no
    // puede tener ninguno: un nombre vive en un solo modulo, que es lo que hace que
    // Mover un detector sea mudarlo y no copiarlo.
    expect(hogaresDobles({ families: modules() }),
      'un nombre declarado en un modulo y que SOBRE en otro: el barrel no puede saber de'
      + ' que familia sacarlo, y el dia que alguien lo pida lo cogera por el').toEqual([]);
  });

  it('la guardia de los dos hogares muerde: el duplicado y el que ya lo saca', () => {
    const dosHogares = [['api.js', 'export function partido() {}\n'],
      ['docs.js', 'export function partido() {}\n'],
      ['rules/moved.js', 'export function movido() {}\n']];

    // Sin imports que lo saquen: el aviso es el de los dos hogares, y sale igual.
    expect(hogaresDobles({ families: dosHogares })).toEqual([
      'partido (lo exportan api.js docs.js: dos hogares, y el barrel no puede saber de que'
      + ' familia sacarlo)',
    ]);

    // Con un modulo que ya lo saca de uno de ellos: el aviso dice de cual, que es donde se
    // ve que la eleccion ya se hizo y por el nombre del primer modulo que se leyo.
    expect(hogaresDobles({
      families: [...dosHogares, ['split.js', "import { partido } from './docs.js';\n"]],
    })).toEqual([
      'partido (lo exportan api.js docs.js; split.js lo saca de docs.js: dos hogares, y el'
      + ' barrel no puede saber de que familia sacarlo)',
    ]);

    // Y un nombre que solo vive en un sitio, aunque se saque de el, no es un problema: el
    // caso de un modulo de regla, que compone su entrada con lo que le pasa otro.
    expect(hogaresDobles({
      families: [...dosHogares, ['rules/moved.js', 'export const movidoRule = {};\n'],
        ['split.js', "import { movido } from './rules/moved.js';\n"]],
    })).toEqual(['partido (lo exportan api.js docs.js: dos hogares, y el barrel no puede '
      + 'saber de que familia sacarlo)']);
  });

  it('el generador muerde: lo que no puede decidir solo lo delata por su nombre', () => {
    const families = [['docs.js', 'export function usada() {}\n'], ['rules/moved.js', 'export function usada() {}\n']];

    expect(barrelProblems({
      families,
      consumers: [['rules.js', "import { fantasma } from './detectors.js';\n"]],
    })).toEqual(['fantasma (rules.js lo pide al barrel y ninguna familia lo exporta)']);

    expect(barrelProblems({
      families,
      consumers: [['rules.js', "import { usada } from './detectors.js';\n"]],
    })).toEqual(['usada (lo exportan docs.js rules/moved.js: el barrel no puede saber de que familia sacarlo)']);

    // lo que declara el barrel PROPIO —su catalogo— no busca hogar en ninguna familia y
    // menos se quejara de que no se lo pidan: por eso el generador no lleva la lista de
    // esos nombres escrita, sino que la lee del epilogo que el mismo escribe
    expect(barrelProblems({
      families: [], consumers: [['rules.js', "import { RULES } from './detectors.js';\n"]],
    })).toEqual([]);

    // dos consumidores piden el mismo nombre: el mensaje los nombra a los dos
    expect(barrelProblems({
      families: [],
      consumers: [['rules.js', "import { fantasma } from './detectors.js';\n"],
        ['autoTests.js', "import { fantasma } from './detectors.js';\n"]],
    })).toEqual(['fantasma (rules.js autoTests.js los piden al barrel y ninguna familia lo exporta)']);
  });

  it('el barrido del generador no se mira en un directorio vacio', () => {
    // Si el generador no ve familias o los consumidores no piden nada, escribe un barrel
    // vacio y todo lo de arriba pasa: los minimos son los que delatan ese barrido.
    expect(AUDIT_MODULES.length, 'los modulos del audit que ve el generador').toBeGreaterThanOrEqual(25);

    // Y las dos listas no son Listas: se derivan del directorio, asi que se contrastan con
    // el. Si alguien las vuelve a escribir a mano y se le olvida un test, el generador
    // escribiria un barrel con otra superficie, y aqui se veria.
    const listed = new Set(AUDIT_CONSUMERS.map(({ label }) => label));

    for (const name of readdirSync(join(HERE, '..')).filter((one) => one.endsWith('.test.js')))
      expect(listed.has(`../${name}`), `el audit no tiene como consumidor a ${name}`).toBe(true);
    expect(consumers().length).toBeGreaterThanOrEqual(20);
    expect(barrelSurface(barrelSource({ families: modules(), consumers: consumers() })).names.size)
      .toBeGreaterThanOrEqual(90);
  });
});

/* ---------------------------------------------------------------------------
 * El catalogo de reglas: numeros y modulos
 * ------------------------------------------------------------------------- */

/** Los huecos del catalogo, que es la puerta unica por la que entra una regla: numeros
 *  repetidos o que no son enteros, numeracion con saltos, y reglas y modulos que no se
 *  corresponden (`modules` son los ficheros de `tests/audit/rules/`, sin la extension).
 *  Sin mirar las tres cosas, un modulo de regla puede quedarse fuera del catalogo —y
 *  entonces no lo corre nadie, ni la guia ni el CI— y dos reglas pueden compartir numero
 *  sin que el orden lo delate, porque el orden lo pone justo ese numero. */
function catalogueOffenses({ rules, modules }) {
  const off = [];
  const seen = new Set();

  for (const { number, name } of rules) {
    if (!Number.isInteger(number)) {
      off.push(`${name} (el numero de la regla no es un entero: ${number})`);
      continue;
    }

    if (seen.has(number))
      off.push(`${name} (la regla ${number} ya la declara otra: los numeros no se repiten)`);

    seen.add(number);
  }

  for (let expected = 1; expected <= rules.length; expected += 1)
    if (!seen.has(expected))
      off.push(`falta la regla ${expected}: la numeracion va del 1 al ${rules.length} sin huecos`);

  const catalogued = new Set(rules.map(({ name }) => name));
  const files = new Set(modules);

  for (const module of modules)
    if (!catalogued.has(module))
      off.push(`rules/${module}.js (el modulo existe y el catalogo no tiene su regla)`);

  for (const name of catalogued)
    if (!files.has(name))
      off.push(`${name} (la regla esta en el catalogo y su modulo rules/${name}.js no existe)`);

  return off;
}

describe('el catalogo de reglas: numeros y modulos', () => {
  /** Los modulos de regla que hay EN EL DISCO: uno nuevo entra en la guardia sin que
   *  nadie se acuerde de apuntarlo. */
  const ruleModules = () => readdirSync(join(HERE, 'rules'))
    .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    .map((file) => file.slice(0, -3))
    .sort();

  it('los numeros van del 1 al numero de reglas sin huecos ni repetidos, y cada modulo tiene su regla', () => {
    // Si el barrido se queda vacio (un directorio que no se lee, un catalogo sin
    // reglas), la guardia no mira nada: los minimos lo delatan.
    expect(ruleModules().length).toBeGreaterThanOrEqual(12);
    expect(RULES.length).toBeGreaterThanOrEqual(12);

    expect(
      catalogueOffenses({ rules: RULES, modules: ruleModules() }),
      'el catalogo es la unica puerta de una regla: su numero la ordena y su modulo la trae',
    ).toEqual([]);
  });

  it('la guardia muerde: el numero repetido, el hueco, el modulo suelto y el que falta', () => {
    expect(catalogueOffenses({
      rules: [{ number: 1, name: 'uno' }, { number: 2, name: 'dos' }, { number: 2, name: 'tres' }],
      modules: ['uno', 'dos', 'tres'],
    })).toEqual([
      'tres (la regla 2 ya la declara otra: los numeros no se repiten)',
      'falta la regla 3: la numeracion va del 1 al 3 sin huecos',
    ]);

    expect(catalogueOffenses({
      rules: [{ number: 1, name: 'uno' }],
      modules: ['uno', 'suelto'],
    })).toEqual(['rules/suelto.js (el modulo existe y el catalogo no tiene su regla)']);

    expect(catalogueOffenses({
      rules: [{ number: 1, name: 'uno' }, { number: 2, name: 'dos' }],
      modules: ['uno'],
    })).toEqual(['dos (la regla esta en el catalogo y su modulo rules/dos.js no existe)']);

    expect(catalogueOffenses({
      rules: [{ number: '1', name: 'uno' }],
      modules: ['uno'],
    })).toEqual([
      'uno (el numero de la regla no es un entero: 1)',
      'falta la regla 1: la numeracion va del 1 al 1 sin huecos',
    ]);
  });
});

/* ---------------------------------------------------------------------------
 * La superficie de la LIBRERIA: el API en el barrel, y ningun export muerto
 * ------------------------------------------------------------------------- */

/** El barrel de la libreria: el fichero donde vive su API publica. */
const LIBRARY_BARREL = 'components/index.js';

/** Los simbolos que un modulo DECLARA y exporta: `export (async)? (function|const|let|
 *  class) NOMBRE`. Un `export { ... } from` no declara nada —re-exporta—, y las cadenas
 *  de re-exportacion las resuelve `libraryExports`. */
function exportedSymbols(source) {
  const pattern = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** Las re-exportaciones de un modulo: `[{ name, from }]` de sus `export { ... } from`,
 *  en el orden en que se leen. */
function reExports(source) {
  return [...source.matchAll(/^export\s*\{([^}]*)\}\s*from\s*'([^']+)'/gm)]
    .flatMap((match) => match[1].split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .map((name) => ({ name, from: match[2] })));
}

/** El fichero al que apunta un `from`, resuelto contra la etiqueta del que lo escribe:
 *  `./skins/index.js` desde `components/x.js` es `components/skins/index.js`, y
 *  `../utils/index.js` desde `components/index.js` es `utils/index.js`. */
function resolveFrom(file, from) {
  const parts = file.split('/').slice(0, -1);

  for (const step of from.split('/')) {
    if (step === '.' || step === '')
      continue;

    if (step === '..')
      parts.pop();
    else
      parts.push(step);
  }

  return parts.join('/');
}

/** QUE EXPORTA CADA MODULO de la libreria, con las cadenas de re-exportacion resueltas:
 *  un modulo puede no declarar un nombre y sacarlo de otro (`utils/index.js` saca
 *  `enhanceRangeInputs` de `utils/enhanceRangeInputs.js`), asi que «el barrel lo re-exporta
 *  de X» esta bien dicho si X lo declara O si X lo saca de quien lo declara. Devuelve
 *  `provides` (fichero -> nombres que da) y `declares` (nombre -> fichero que lo declara). */
function libraryExports(sources) {
  const known = new Set(sources.map(([file]) => file));
  const provides = new Map(sources.map(([file]) => [file, new Set()]));
  const declares = new Map();
  const routes = [];

  for (const [file, source] of sources) {
    for (const name of exportedSymbols(source)) {
      provides.get(file).add(name);

      if (!declares.has(name))
        declares.set(name, file);
    }

    for (const { name, from } of reExports(source)) {
      const target = resolveFrom(file, from);

      if (known.has(target))
        routes.push({ from: file, name, target });
    }
  }

  let grew = true;

  while (grew) {
    grew = false;

    for (const { from, name, target } of routes)
      if (provides.get(target).has(name) && !provides.get(from).has(name)) {
        provides.get(from).add(name);
        grew = true;
      }
  }

  return { declares, provides };
}

/** Los imports que una documentacion PROMETE: `[{ name, from }]` de sus lineas
 *  `import { ... } from '...'`. Una mencion suelta en la prosa no promete una API; un
 *  `import` si. */
function documentedImports(source) {
  return [...source.matchAll(/^\s*import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gm)]
    .flatMap((match) => match[1].split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .map((name) => ({ name, from: match[2] })));
}

/** Si la promesa va por la PUERTA CANONICA, el barrel: `@abdsynths/shared/components` o su
 *  `index.js`. Las rutas profundas (`.../components/wheel.js`) son la OTRA puerta que el
 *  paquete publica —su mapa `exports` tiene `./components/*`— y la guia puede prometerlas:
 *  entonces el export es API de facto, y el barrel no tiene por que declararlo. */
const isBarrelDoor = (from) => /(^|\/)components(\/index\.js)?$/.test(from);

/** El diagnostico de la superficie de la libreria, con la separacion que pide un paquete
 *  compartido: la API publica vive en el barrel y cada nombre suyo tiene que salir de un
 *  modulo de verdad por una cadena de re-exportaciones, mientras que un export que el
 *  barrel no declara es un HELPER INTERNO y tiene que usarlo alguien del repo —otro
 *  modulo de la libreria, el demo, un smoke o un test—, o estar prometido en la
 *  documentacion, que es otra forma de decir que es API. */
function librarySurfaceOffenses({ modules, barrel, consumers, documented }) {
  const off = [];
  const { declares, provides } = libraryExports(modules);
  const declared = reExports(barrel.source);
  const publicNames = new Set(declared.map(({ name }) => name));
  const promised = new Set(documented.map(({ name }) => name));
  const stripped = new Map([...modules, ...consumers]
    .map(([file, source]) => [file, withoutComments(source)]));

  for (const [file] of modules)
    for (const name of exportedSymbols(stripped.get(file))) {
      const names = new RegExp(`\\b${name}\\b`);

      // El barrel no USA: declara. Contarlo de consumidor dejaria pasar una API que
      // nadie usa por el hecho de tener su linea en el barrel.
      const used = [...stripped]
        .some(([other, code]) => other !== file && other !== LIBRARY_BARREL && names.test(code));

      if (used || promised.has(name))
        continue;

      off.push(`${file}:${name} (nadie lo nombra fuera de su fichero —ni otro modulo, ni el`
        + ' demo, ni un test, ni la documentacion—: o es API y va al barrel, o deja de exportarse)');
    }

  // Lo que la doc promete importando DEL BARREL tiene que estar en el barrel: prometer una
  // API por la puerta canonica y no declararla ahi es una API a medias.
  for (const { name, from } of documented) {
    if (isBarrelDoor(from) && !publicNames.has(name))
      off.push(`${name} (la documentacion lo promete importando del barrel y el barrel no lo declara)`);
  }

  const seen = new Set();

  for (const { name, from } of declared) {
    const target = resolveFrom(LIBRARY_BARREL, from);
    const given = provides.get(target);
    const origin = declares.get(name);

    if (!/^(components|utils)\//.test(target))
      off.push(`${name} (el barrel lo saca de ${from}, y la API vive en components/ y utils/)`);
    else if (given == null || !given.has(name))
      off.push(`${name} (el barrel lo re-exporta de ${from}, que no lo declara ni lo saca de nadie`
        + (origin == null ? ')' : `: sale de ${origin})`));

    if (seen.has(name))
      off.push(`${name} (el barrel lo declara dos veces)`);

    seen.add(name);
  }

  return off;
}

describe('la superficie de la libreria', () => {
  const modules = () => LIBRARY_SOURCES.map(({ label, source }) => [label, source]);
  const consumers = () => CONSUMER_SOURCES.map(({ label, source }) => [label, source]);
  const documented = () => DOC_SOURCES.flatMap(({ source }) => documentedImports(source));
  const barrel = () => LIBRARY_SOURCES.find(({ label }) => label === LIBRARY_BARREL);

  it('el barrel es el API, y ningun export de la libreria se queda sin usar', () => {
    // Si el barrido se queda vacio (una carpeta que no se lee, un barrel que no se
    // encuentra), la guardia no mira nada: los minimos lo delatan.
    expect(modules().length).toBeGreaterThanOrEqual(25);
    expect(consumers().length).toBeGreaterThanOrEqual(15);
    expect(documented().length).toBeGreaterThanOrEqual(5);
    expect(barrel(), `la libreria no tiene su barrel (${LIBRARY_BARREL})`).toBeDefined();

    expect(
      librarySurfaceOffenses({
        modules: modules(), barrel: barrel(), consumers: consumers(), documented: documented(),
      }),
      'la API de la libreria vive en el barrel, y un export que no esta en el no puede quedarse sin usar',
    ).toEqual([]);
  });

  it('la guardia muerde: el export muerto, la promesa sin barrel y los deslices del barrel', () => {
    // La libreria minima: un modulo con su clase y un helper usado, otro con un export que
    // nadie usa, y una cadena de re-exportaciones como la de verdad (`utils/index.js` saca
    // lo suyo de otro fichero).
    const uno = ['components/uno.js', 'export class Uno { }\nexport function usada() { }\n'];
    const suelto = ['components/suelto.js', 'export function muerta() { }\n'];
    const cadenas = [
      ['utils/base.js', 'export function base() { }\n'],
      ['utils/index.js', "export { base } from './base.js';\n"],
    ];
    const surface = (barrelSource, { modules: extra = [], consumers: used = [], documented: promised = [] } = {}) =>
      librarySurfaceOffenses({
        modules: [uno, ...cadenas, ...extra, ['components/index.js', barrelSource]],
        barrel: { label: 'components/index.js', source: barrelSource },
        consumers: [['tests/uno.test.js', 'Uno usada(); base();'], ...used],
        documented: promised,
      });

    // El export que nadie nombra fuera de su fichero: muerto, y sale con su motivo entero.
    expect(surface("export { Uno } from './uno.js';\n", { modules: [suelto] })).toEqual([
      'components/suelto.js:muerta (nadie lo nombra fuera de su fichero —ni otro modulo, ni el'
      + ' demo, ni un test, ni la documentacion—: o es API y va al barrel, o deja de exportarse)',
    ]);

    // Prometido importando DEL BARREL: la promesa va por la puerta canonica y el barrel
    // no lo declara, asi que la API esta a medias.
    expect(surface("export { Uno } from './uno.js';\n", {
      modules: [suelto],
      documented: [{ name: 'muerta', from: '@abdsynths/shared/components' }],
    })).toEqual(['muerta (la documentacion lo promete importando del barrel y el barrel no lo declara)']);

    // Prometido por una RUTA PROFUNDA: es la otra puerta que el paquete publica
    // (`./components/*`), el export es API de facto y el barrel no tiene por que declararlo.
    expect(surface("export { Uno } from './uno.js';\n", {
      modules: [suelto],
      documented: [{ name: 'muerta', from: '@abdsynths/shared/components/suelto.js' }],
    })).toEqual([]);

    // La cadena se resuelve: el barrel saca `base` de `utils/index.js`, que lo saca de
    // `utils/base.js`, y el demo lo usa. Ni un aviso.
    expect(surface("export { base } from '../utils/index.js';\n",
      { consumers: [['demo/demo-controls.js', 'base();']] })).toEqual([]);

    // El barrel que saca de donde no hay, el que se sale de la libreria y el que repite.
    expect(surface("export { Otro } from './dos.js';\n"))
      .toEqual(['Otro (el barrel lo re-exporta de ./dos.js, que no lo declara ni lo saca de nadie)']);

    // Y cuando el nombre SI sale de la libreria, el aviso dice de donde: el dato que
    // convierte el hallazgo en un arreglo de una linea.
    expect(surface("export { base } from './uno.js';\n", { consumers: [['demo/x.js', 'base();']] }))
      .toEqual(['base (el barrel lo re-exporta de ./uno.js, que no lo declara ni lo saca de nadie: sale de utils/base.js)']);

    expect(surface("export { Uno } from './uno.js';\nexport { fuera } from '../otro/fuera.js';\n"))
      .toEqual(['fuera (el barrel lo saca de ../otro/fuera.js, y la API vive en components/ y utils/)']);

    expect(surface("export { Uno } from './uno.js';\nexport { Uno } from './uno.js';\n"))
      .toEqual(['Uno (el barrel lo declara dos veces)']);
  });
});

/* ---------------------------------------------------------------------------
 * Los regex de lectura: el separador de cola no se consume
 *
 * El escaner y el clasificador no son de esta mirada —viven en `regexes.js`, la capa
 * que los comparte—, asi que lo que queda aqui es el BARRIDO: que listas de fuentes
 * mira cada ambito, que la clase que se juzga no se corte por el camino, y que las
 * clases se pidan por un nombre que exista.
 * ------------------------------------------------------------------------- */

/** Los fuentes que esta mirada barre: TODO el audit —las capas, los modulos de regla, las
 *  reglas, los unitarios y los consumidores de fuera del directorio—, que es donde viven
 *  los lectores. */
const AUDITED_SOURCES = [...new Set([...FAMILY_FILES, ...EXERCISE_FILES])];

describe('los regex de lectura: el separador de cola no se consume', () => {
  // Las clases se piden por su NOMBRE, que es el vocabulario de la tabla compartida:
  // una mirada nueva no reescribe el juez, y un nombre mal escrito revienta.
  const SEPARADOR = 'se come el separador de cola';
  const CORCHETE = 'corta por corchetes donde va una llave';
  const files = () => AUDITED_SOURCES.map((name) => [name, auditSource(name)]);
  const patternsIn = (scanned) =>
    scanned.reduce((total, [, source]) => total + regexPatternsOf(source).length, 0);
  /** La LIBRERIA en el formato de la guardia: `[etiqueta, fuente]`, con la etiqueta
   *  que sale en el aviso (`components/x.js:12`). */
  const library = () => LIBRARY_SOURCES.map(({ label, source }) => [label, source]);
  /** Los CONSUMIDORES del paquete —`demo/`, `smoke/` y los tests, los tres de
   *  `CONSUMER_SOURCES`— en el mismo formato. Son quien trocea listas con un regex para
   *  assertar sobre el DOM real, y ese `(?:^|,)` que se come la coma no lo delata ningun
   *  test: la auditoria de documentacion solo vigila su propio fuente. */
  const consumers = () => CONSUMER_SOURCES.map(({ label, source }) => [label, source]);

  it('ninguna lectura exige el separador por delante y se come el de la cola', () => {
    // La asercion de hallazgos va PRIMERO: cuando sale en rojo, el mensaje tiene que ser
    // la lista de los regex delatados, no el delator del propio barrido.
    expect(
      regexOffenses(files(), SEPARADOR),
      'un regex que pide el separador por delante (`(?:^|,)`) y ADEMAS consume el de la'
      + ' cola lee uno de cada dos elementos: el que cierra un elemento ya no abre el'
      + ' siguiente. La cola se mira con un lookahead (`(?=,|$)`) o no se pide.',
    ).toEqual([]);
  });

  it('el barrido no se mira en un fuente vacio: lee los literales donde viven', () => {
    // Si el barrido se queda vacio (un fichero que no se lee, un escaner que ya no
    // reconoce los literales), la guardia de arriba no vigila nada: estos minimos lo
    // delatan, y el regex de `optionIdentifiers` —el testigo que ya se cobro el fallo,
    // salvado por su lookahead de cola— prueba que los ve donde viven.
    const scanned = files();

    expect(scanned.length).toBeGreaterThanOrEqual(20);
    expect(patternsIn(scanned), 'la guardia no esta viendo los regex del audit').toBeGreaterThanOrEqual(150);
    expect(regexPatternsOf(auditSource('options.js')).map(({ pattern }) => pattern))
      .toContain('(?:^|,)\\s*([A-Za-z_$][\\w$]*)\\s*(?==|,|$)');
  });

  it('la guardia muerde: caza el que se come el separador y perdona el lookahead', () => {
    const offenses = (source) => regexOffenses([['x.js', source]], SEPARADOR);
    const offender = (line, pattern) => `x.js:${line}: /${pattern}/`;

    // La cola CONSUMIDA: el `,` suelto, el cuantificador opcional que lo traga y el
    // separador metido en un grupo de cola (`(?:,|$)`), que se lo come igual.
    expect(offenses('const re = /(?:^|,)\\s*(\\w+)\\s*,/g;'))
      .toEqual([offender(1, '(?:^|,)\\s*(\\w+)\\s*,')]);

    expect(offenses('const re = /(?:^|,)\\s*(\\w+)\\s*,?/g;'))
      .toEqual([offender(1, '(?:^|,)\\s*(\\w+)\\s*,?')]);

    expect(offenses('const re = /(?:^|,)\\s*(\\w+)(?:,|$)/g;'))
      .toEqual([offender(1, '(?:^|,)\\s*(\\w+)(?:,|$)')]);

    // La otra forma del separador delante: una clase con `;`.
    expect(offenses('const re = /(?:^|[{};])\\s*(\\w+)\\s*;/g;'))
      .toEqual([offender(1, '(?:^|[{};])\\s*(\\w+)\\s*;')]);

    // Armado como CADENA: `new RegExp('...')`, con el escape de la cadena de por medio.
    expect(offenses("const re = new RegExp('(?:^|,)\\\\s*(\\\\w+)\\\\s*,');"))
      .toEqual([offender(1, '(?:^|,)\\s*(\\w+)\\s*,')]);

    // El hallazgo trae la linea del patron, no la del fichero.
    expect(offenses('const a = 1;\nconst b = 2;\nconst re = /(?:^|,)\\s*(\\w+)\\s*,/g;'))
      .toEqual([offender(3, '(?:^|,)\\s*(\\w+)\\s*,')]);

    // Y lo que NO es un hallazgo: el lookahead (el arreglo), el que no pide separador
    // delante, y el patron que solo lo PARECE por ir escrito en una cadena.
    expect(offenses('const re = /(?:^|,)\\s*([A-Za-z_$][\\w$]*)\\s*(?==|,|$)/g;')).toEqual([]);
    expect(offenses('const re = /^return\\s+(\\w+)\\s*[;,\\n)]/g;')).toEqual([]);
    expect(offenses("const s = '/(?:^|,)\\\\s*,';")).toEqual([]);

    // La division no abre un literal, asi que no se traga el regex de la linea siguiente.
    expect(offenses('const mitad = ancho / 2;\nconst re = /(?:^|,)\\s*(\\w+)\\s*,/g;'))
      .toEqual([offender(2, '(?:^|,)\\s*(\\w+)\\s*,')]);
  });

  it('el escaner y el clasificador se DEFINEN en una sola capa, que es la que los comparte', () => {
    // La razon de que `regexes.js` exista: dos copias no se delatan. Un segundo lector de
    // regex —el que uno se escribe porque el de al lado no devuelve lo que uno quiere—
    // mediria practicamente lo mismo, y el hallazgo que deja de aparecer no lo dice
    // nadie. Asi que no se comprueba que la clase este, sino que su juez este UNA sola
    // vez: se lee del fuente quien lo declara, y si manana aparece otro, sale por su
    // nombre. Se mira la DECLARACION (`function`/`const` al principio de linea), no la
    // mencion: el que USA el escaner lo menciona, y eso no es duplicarlo.
    const declara = (name) => new RegExp(`^(?:export )?(?:function|const) ${name}\\b`, 'm');

    for (const name of ['regexPatternsOf', 'REGEX_CLASSES', 'needsSeparatorBefore',
      'eatsSeparatorAtEnd', 'cutsWithBracketsInsteadOfBraces'])
      expect(
        files()
          .filter(([, source]) => declara(name).test(withoutComments(source)))
          .map(([file]) => file),
        `«${name}» esta declarado en mas de una capa: el clasificador esta duplicado`,
      ).toEqual(['regexes.js']);
  });

  it('ningun patron corta texto equilibrado con corchetes donde va una llave', () => {
    // La segunda clase del clasificador, y la del otro lado del equilibrio: el patron
    // abre y cierra con corchetes donde el texto que lee es un registro. Es el fallo
    // que se comio el `@param {{ x?: number, y?: number }}` de lcdMachine y el
    // `Array<{id: string, label: string}>` de themeSwitcher: al recortar por el
    // corchete equivocado el tipo se leia a medias, y de ahi salian claves de mas —el
    // `y` de un `(x, y) => void`— y de menos. Asercion de hallazgos primero: cuando
    // sale en rojo, el mensaje es la lista de los regex delatados, no el del barrido.
    expect(
      regexOffenses(files(), CORCHETE),
      'un regex que recorta el texto con corchetes donde el texto equilibrado es un'
      + ' registro: el corte cae donde no toca y el tipo se lee a medias.',
    ).toEqual([]);
  });

  it('la LIBRERIA tampoco corta texto equilibrado con corchetes', () => {
    expect(
      regexOffenses(library(), CORCHETE),
      'un regex de la LIBRERIA que recorta con corchetes donde va una llave.',
    ).toEqual([]);
  });

  it('los CONSUMIDORES tampoco cortan texto equilibrado con corchetes', () => {
    expect(
      regexOffenses(consumers(), CORCHETE),
      'un regex de un CONSUMIDOR que recorta con corchetes donde va una llave.',
    ).toEqual([]);
  });

  it('la guardia muerde con el corchete: caza el corte y perdona los dos parecidos', () => {
    // Aqui la calibracion NO es un minimo de hallazgos sino el MORDISCO, y hace falta
    // decirlo: medido sobre las tres listas, la clase sale en CERO, y porque el
    // codigo es correcto —el tipo inline lo leen `closingIndex` y
    // `literalEntryRanges`, que caminan y no recortan—, no porque el clasificador no
    // mire. Un minimo sobre una clase sin hallazgos solo mediria al clasificador, que
    // es justo lo que este test muerde: los casos de abajo, el que tiene que
    // caer y los que NO tienen que caer aunque se le parezcan.
    const offenses = (source) => regexOffenses([['x.js', source]], CORCHETE);
    const offender = (line, pattern) => `x.js:${line}: /${pattern}/`;

    // el fallo de verdad: el corchete recorta donde deberia la llave
    expect(offenses('const inner = type.match(/^\\[([^\\]]*)\\]$/);'))
      .toEqual([offender(1, '^\\[([^\\]]*)\\]$')]);
    expect(offenses('const inner = type.replace(/^\\s*\\[.*\\]/, "");'))
      .toEqual([offender(1, '^\\s*\\[.*\\]')]);

    // el parecido 1: la marca de OPCIONAL de una celda de opcion (`[options.step]`)
    expect(offenses('const name = /^\\s+\\[?([A-Za-z_$][\\w$]*)\\]?/.exec(line);'))
      .toEqual([]);

    // el parecido 2: un acceso a INDICE detras de un nombre capturado, que es lo que
    // lee el extractor de bloques del YAML del contrato
    expect(offenses('const valor = /^\\s*([A-Z]+)\\["([^"]*)"\\]\\s*$/.exec(line);'))
      .toEqual([]);

    // y la forma buena de la idea: llaves con el corchete escapado, que se comporta
    // igual que la sucia `[{[]` y por eso no se juzga
    expect(offenses('const abre = /[{\\\[\\\]]/;')).toEqual([]);

    // el hallazgo trae la linea del patron, no la del fichero
    expect(offenses('const a = 1;\nconst b = 2;\nconst inner = /^\\[.*\\]$/.exec(t);'))
      .toEqual([offender(3, '^\\[.*\\]$')]);
  });

  it('la LIBRERIA tampoco se come su separador de cola', () => {
    // La misma trampa un turno mas lejos: un componente que trocea una lista con un
    // `(?:^|,)` que ademas consume la coma lee un elemento de cada dos, y en `components/`
    // y `utils/` no hay ningun test que lo delate (la auditoria de documentacion solo
    // vigila su propio fuente). El fallo sale por su etiqueta y su linea, igual que en
    // el audit, que es lo que hace falta para ir a arreglarlo.
    expect(
      regexOffenses(library(), SEPARADOR),
      'un regex de la LIBRERIA que pide el separador por delante y ADEMAS consume el de la'
      + ' cola lee uno de cada dos elementos. La cola se mira con un lookahead (`(?=,|$)`)'
      + ' o no se pide.',
    ).toEqual([]);
  });

  it('el barrido de la libreria tampoco se mira en un fuente vacio', () => {
    // Hoy la libreria trae un UNICO regex —`/\.00 /`, el trim del separador decimal de
    // lcdMachine— y ninguno armado como cadena, asi que el minimo es 1 y no una cifra de
    // catalogo. Lo que vigila es que el barrido no se quede VACIO sin que nadie lo note;
    // si de verdad se quedan sin ninguno, hay que bajar el minimo a proposito (y decir por
    // que se apaga esa mirada), no dejarla contemplando el vacio en silencio.
    expect(library().length).toBeGreaterThanOrEqual(25);
    expect(patternsIn(library()), 'la guardia no esta viendo los regex de la libreria')
      .toBeGreaterThanOrEqual(1);
  });

  it('la guardia muerde en la libreria: el regex inyectado sale por su etiqueta y su linea', () => {
    // El mismo mordisco que en el audit, pero sobre un fichero DE LA LIBRERIA de verdad:
    // se le pega al final el regex que se come la coma y se comprueba que la guardia lo
    // delata con la etiqueta (`components/x.js`) y la linea donde se inyecto. El arreglo
    // —el lookahead de cola— no se delata.
    const COMIDO = '\nconst re = /(?:^|,)\\s*(\\w+)\\s*,/g;\n';
    const ARREGLADO = '\nconst re = /(?:^|,)\\s*(\\w+)\\s*(?==|,|$)/g;\n';
    const [label, source] = library()[0];
    const linea = source.split('\n').length + 1;   // la que ocupa lo pegado al final
    const con = (inyectada) => library()
      .map(([uno, texto], at) => [uno, at === 0 ? texto + inyectada : texto]);

    expect(regexOffenses(con(ARREGLADO), SEPARADOR)).toEqual([]);
    expect(regexOffenses(con(COMIDO), SEPARADOR))
      .toEqual([`${label}:${linea}: /(?:^|,)\\s*(\\w+)\\s*,/`]);
  });

  it('los CONSUMIDORES tampoco se comen su separador de cola', () => {
    // Un turno mas lejos que la libreria, y el mas caro: un smoke o un test que
    // trocee una lista de atributos del DOM con un `(?:^|,)` que ademas come la coma
    // lee un atributo de cada dos, y el fallo sale como un assert que no falla —o que
    // falla por otra cosa— mucho despues de escribirse. El aviso sale por la etiqueta
    // del fichero y la linea del patron, que es lo que hace falta para ir a
    // arreglarlo sin ir a buscarlo.
    expect(
      regexOffenses(consumers(), SEPARADOR),
      'un regex de un CONSUMIDOR que pide el separador por delante y ADEMAS consume el'
      + ' de la cola lee un elemento de cada dos. La cola se mira con un lookahead'
      + ' (`(?=,|$)`) o no se pide.',
    ).toEqual([]);
  });

  it('el barrido de los consumidores tampoco se mira en un fuente vacio', () => {
    // Medido sobre los ficheros de verdad, con este mismo lector: 25 consumidores en
    // `demo/`, `smoke/` y `tests/`, 17 patrones en 6 de ellos —`smoke/a11y-smoke.mjs`
    // y cinco tests— y ninguna ofensa. Los minimos van con margen (20, 10 y 5) porque lo
    // que vigilan es que el barrido no se quede VACIO o cortocircuitado sin que nadie
    // lo note, no una cifra de catalogo: si un dia se quedan sin regex, hay que bajar
    // el minimo a proposito y decir por que se apaga esa mirada.
    //
    // El tercer minimo —`conRegex`— es el que de verdad distingue un barrido roto de
    // uno entero: los 17 patrones viven en 6 ficheros, asi que un barrido que se
    // quede con el primero que encuentra daria 2 y pasaria las otras dos cuentas. Y no
    // se fija un patron testigo como en el audit (`optionIdentifiers`): el audit no
    // es dueño de NINGUN fichero de esta lista, y un testigo tomado del fichero de un
    // vecino se rompe el dia que ese vecino cambie el suyo —que es justo cuando la
    // guardia tiene que seguir mirando, no cuando tiene que ponerse roja—.
    const todos = consumers();

    expect(todos.length).toBeGreaterThanOrEqual(20);
    expect(patternsIn(todos), 'la guardia no esta viendo los regex de los consumidores')
      .toBeGreaterThanOrEqual(10);
    expect(todos.filter(([, source]) => regexPatternsOf(source).length > 0).length,
      'la guardia solo ve los regex de un consumidor: el barrido se ha cortocircuitado')
      .toBeGreaterThanOrEqual(5);
  });

  it('la guardia muerde en los consumidores: el regex inyectado sale por su etiqueta y su linea', () => {
    // El mismo mordisco que en el audit y en la libreria, sobre un fichero de
    // CONSUMIDOR de verdad: se le pega al final el regex que se come la coma y se
    // comprueba que la guardia lo delata con la etiqueta (`demo/x.js`) y la linea donde
    // se inyecto. El arreglo —el lookahead de cola— no se delata.
    const COMIDO = '\nconst re = /(?:^|,)\\s*(\\w+)\\s*,/g;\n';
    const ARREGLADO = '\nconst re = /(?:^|,)\\s*(\\w+)\\s*(?==|,|$)/g;\n';
    const [label, source] = consumers()[0];
    const linea = source.split('\n').length + 1;   // la que ocupa lo pegado al final
    const con = (inyectada) => consumers()
      .map(([uno, texto], at) => [uno, at === 0 ? texto + inyectada : texto]);

    expect(regexOffenses(con(ARREGLADO), SEPARADOR)).toEqual([]);
    expect(regexOffenses(con(COMIDO), SEPARADOR))
      .toEqual([`${label}:${linea}: /(?:^|,)\\s*(\\w+)\\s*,/`]);
  });
});

/* ---------------------------------------------------------------------------
 * La puerta del diagnostico: el informe tambien se auto-verifica
 * ------------------------------------------------------------------------- */

/** El CONTEXTO del diagnostico con ESTE repo delante: el catalogo que compone el barrel,
 *  la guia (`COMPONENTS.md`, la primera de las fuentes de documentacion), la cabecera del
 *  audit —el propio `documentedOptions.test.js`, donde esta la lista de reglas que
 *  promete—, los fuentes de la maquinaria y los de los modulos. El diagnostico es PURO y
 *  no lee el disco, asi que el contexto se lo pone quien lo trae; y quien lo trae aqui es
 *  la PUERTA, que es donde un hueco tiene que salir antes de que llegue al CI. */
const contextoDelRepo = () => {
  const families = new Map();

  for (const name of FAMILY_FILES) {
    const source = auditSource(name);

    for (const match of source.matchAll(/^(?:export\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm))
      families.set(match[1], source);
  }

  return {
    catalogo: RULES,
    guide: DOC_SOURCES[0].source,
    header: auditSource('../documentedOptions.test.js'),
    rules: auditSource('rules.js'),
    autoTests: auditSource('autoTests.js'),
    families,
    modulos: [...AUDIT_MODULES, ...AUDIT_SIN_API],
    libreria: MODULES,
  };
};

/** El catalogo REAL con una entrada cambiada, que es como se rompe una cosa sin tocar el
 *  disco: el resto del contexto sigue siendo el de verdad, asi que el hueco que sale es
 *  del cambio y no de una guia de mentira. */
const conLaRegla = (numero, extra) => RULES
  .map((rule) => (rule.number === numero ? { ...rule, ...extra } : rule));

describe('el informe del contrato se auto-verifica en la propia puerta', () => {
  it('el repo entero no tiene ni un hueco, y el contexto no esta vacio', () => {
    // Los minimos van PRIMERO y con margen: un contexto que se monta vacio —una familia
    // que ya no se lee, una guia que cambio de nombre— daria un informe limpio que no
    // vigila NADA, y la puerta se pondria verde por no mirar.
    const contexto = contextoDelRepo();

    expect(contexto.catalogo.length).toBeGreaterThanOrEqual(13);
    expect(contexto.families.size).toBeGreaterThanOrEqual(100);
    expect(contexto.modulos.length).toBeGreaterThanOrEqual(30);
    expect(contexto.guide, 'la guia es COMPONENTS.md y esta vacia').not.toBe('');
    expect(contexto.header, 'la cabecera del audit esta vacia').not.toBe('');

    const informe = informeDiagnostico(contexto);

    expect(informe.huecos, 'un hueco del repo sale por su sitio y con su arreglo')
      .toEqual([]);
    expect(informe.lineas, informe.lineas.length === 0
      ? ''
      : `\n${informe.lineas.map((linea) => ` - ${linea}`).join('\n')}\n`).toEqual([]);
  });

  it('la puerta muerde: un descuido y una entrada a medio declarar salen JUNTOS', () => {
    // Las dos clases montadas a la vez, para que el informe se vea como lo que es: una
    // lista de una vez y no un hueco por viaje. El resumen va detras, porque la lista ya
    // esta entera, y el desglose por sitio detras del resumen, porque cinco huecos en
    // cuatro sitios distintos se leen como cinco viajes.
    const tres = RULES.find(({ number }) => number === 3);
    const cuatro = RULES.find(({ number }) => number === 4);
    const catalogo = conLaRegla(3, { about: '   ' });
    const conReceta = catalogo.map((rule) => (rule.number === 4 ? { ...rule, recipe: null } : rule));

    const lineas = informeDiagnostico({
      ...contextoDelRepo(), catalogo: conReceta,
    }).lineas;

    expect(lineas).toEqual([
      `regla 3 (${tres.name}): la prosa de la tabla está declarada y en blanco`,
      `regla 4 (${cuatro.name}): el catálogo no le da receta (mutate y safe)`,
      'resumen del diagnóstico: 1 descuido, 1 entrada a medio declarar (1 hueco) y 0 huecos de sitio',
      `  descuidos · la prosa de la tabla (1): regla 3 (${tres.name})`,
      `  a medio declarar · la receta (1): regla 4 (${cuatro.name})`,
    ]);
  });

  it('la puerta muerde: el guard de claves repetidas ve un modulo de mentira', () => {
    // El guard no mira el repo: mira los modulos que le pasen, asi que se le mete uno
    // al final de la lista real que declara dos veces la misma clave. Lo que sale es el
    // aviso con las DOS lineas, que es lo que hay que borrar, y no un recuento.
    const modulos = [...AUDIT_MODULES, { label: 'capas.js', source: 'const x = { a: 1,\n  a: 2,\n};\n' }];

    const lineas = informeDiagnostico({ ...contextoDelRepo(), modulos }).lineas;

    expect(lineas[0]).toBe('capas.js: la clave a está declarada 2 veces (líneas 1, 2)');
    expect(lineas[1]).toBe('resumen del diagnóstico: 1 descuido, 0 entradas a medio declarar '
      + 'y 0 huecos de sitio');
    // El desglose de abajo se queda SIN NOMBRE a proposito: agrupa por ENTRADA del
    // catalogo, y un hueco de modulo no pertenece a ninguna. El nombre del modulo lo
    // lleva el aviso de arriba, que es donde esta el arreglo.
    expect(lineas[2].trim(), 'el desglose agrupa por entrada, y este hueco no es de ninguna')
      .toBe('descuidos · una clave declarada dos veces (1):');
  });

  it('la puerta muerde: el aviso de una clave repetida sale con la ruta del modulo', () => {
    // Un modulo de verdad con una clave repetida pegada al final. Si la ruta no llegara
    // desde la lista real, aqui saldria la etiqueta a secas y el caso pasaria por verde sin
    // haber mirado nada: por eso el aviso se lee entero y no solo su parte del medio.
    const modulos = AUDIT_MODULES.map((modulo) => (modulo.label === 'records.js'
      ? { ...modulo, source: `${modulo.source}\nconst repetida = { a: 1,\n  a: 2,\n};\n` }
      : modulo));
    const conHomonimo = [...modulos, {
      label: 'rules/records.js',
      ruta: 'tests/audit/rules/records.js',
      source: 'const y = { b: 1 };\n',
    }];
    const nombreDelAviso = (cuales) => (informeDiagnostico({ ...contextoDelRepo(), modulos: cuales })
      .lineas.find((linea) => linea.includes('la clave')) ?? '').split(':')[0];

    expect(nombreDelAviso(modulos), 'la ruta del modulo del audit, que es la que se abre')
      .toBe('tests/audit/records.js');
    expect(nombreDelAviso(conHomonimo),
      'y con un homonimo al lado, el mismo modulo sigue con SU ruta').toBe('tests/audit/records.js');
  });

  it('la puerta muerde: el guard tambien mira el barrel y los tests del audit', () => {
    // `AUDIT_MODULES` deja fuera dos cosas que el guard de claves repetidas tiene que ver:
    // el barrel, que se genera —su descuido esta en la linea del generador que lo
    // escribio — y los ficheros de los PROPIOS TESTS del audit, que es donde se declaran
    // los detectores EN LINEA, dentro de una funcion, en vez de como un modulo de regla. Se
    // comprueba con uno de verdad: una funcion con su objeto de entrada pegado al final de
    // un test del audit, porque el resto de los casos de este bloque usan modulos de las
    // capas y este necesita el fichero que la lista nueva anade. Las lineas del aviso no se
    // fijan — dependen de donde se pegue — y lo que importa es el nombre.
    const conDetectorEnLinea = AUDIT_SIN_API.map((modulo) => (modulo.label === 'detectors.test.js'
      ? {
        ...modulo,
        source: `${modulo.source}\nfunction dePrueba() {\n  return { a: 1,\n    a: 2 };\n}\n`,
      }
      : modulo));
    const claves = (modulos) => informeDiagnostico({ ...contextoDelRepo(), modulos })
      .lineas.filter((linea) => linea.includes('la clave'));

    expect(AUDIT_SIN_API.map(({ label }) => label), 'la lista lleva el barrel y los tests')
      .toEqual(['detectors.js', 'detectors.test.js']);
    expect(contextoDelRepo().modulos.map(({ label }) => label),
      'y el CONTEXTO de la puerta los mira: sin esto, el repo limpio seguiria saliendo'
      + ' limpio con la lista vacia y el caso no miraria nada').toContain('detectors.test.js');

    // Y por el CONTEXTO, que es como lo corre la puerta de verdad: el repo entero sale
    // limpio, y con el detector pegado sale el aviso. Si el contexto dejara de pasar la
    // lista, esto se pondria verde mirando una lista a mano — que es justo lo que
    // no se quiere comprobar aqui.
    expect(informeDiagnostico(contextoDelRepo()).lineas,
      'el repo entero sale limpio').toEqual([]);
    expect(informeDiagnostico({ ...contextoDelRepo(), modulos: [...AUDIT_MODULES, ...conDetectorEnLinea] })
      .lineas.find((linea) => linea.includes('la clave')),
    'el detector en linea se delata con la ruta del fichero donde esta')
      .toMatch(/^tests\/audit\/detectors\.test\.js: la clave a/);
  });

  it('la puerta muerde: una clave repetida en un control de components/', () => {
    // El guard de claves repetidas tambien mira los controles, que es donde el descuido se
    // pierde con mas facilidad: el objeto de opciones de un constructor y el mapa de
    // renderers son literales anidados, y la ultima clave repetida gana sin que nadie lo
    // note. Hoy el barrido sale en CERO, y porque el codigo es correcto —no porque la
    // mirada no se haga— su calibracion es el MORDISCO y no un minimo de hallazgos: se le
    // pega una clave repetida a un control DE VERDAD y se comprueba que el aviso sale con la
    // ruta que se abre y con el sitio que lo separa de un modulo del audit.
    const controles = MODULES.map((modulo) => (modulo.label === 'knob.js'
      ? { ...modulo, source: `${modulo.source}\nconst repetida = { a: 1,\n  a: 2,\n};\n` }
      : modulo));
    const conHueco = (modulos, libreria) => informeDiagnostico({ ...contextoDelRepo(), modulos, libreria })
      .lineas.filter((linea) => linea.includes('la clave'));

    expect(conHueco(AUDIT_MODULES, MODULES), 'el repo entero sale limpio').toEqual([]);
    expect(conHueco(AUDIT_MODULES, controles)[0])
      .toMatch(/^components\/knob\.js: la clave a está declarada 2 veces \(líneas \d+, \d+\)$/);
    expect(conHueco(AUDIT_MODULES, controles), 'una sola vez, aunque el aviso se repita')
      .toHaveLength(1);
  });

  it('la puerta muerde: el diagnostico y el informe son la misma lista', () => {
    // El contrato compara el INFORME y el guard compara el DIAGNOSTICO, asi que tienen
    // que ser la misma lista: si uno de los dos se comiese un hueco, la puerta que mira
    // el otro seguiria en verde y el hueco se colaria por el lado que nadie mira.
    const contexto = contextoDelRepo();
    const catalogo = conLaRegla(3, { about: '   ' });

    expect(diagnostico({ ...contexto, catalogo }).map(({ texto }) => texto))
      .toEqual(informeDiagnostico({ ...contexto, catalogo }).lineas.slice(0, 1));
  });
});
