/**
 * Las once reglas de la auditoria de documentacion.
 *
 * Cada regla es un `describe` que recorre los modulos auditados; su `describe` de
 *
 * cobertura vigila que el detector siga viendo algo. Importa los detectores de
 *
 * ./detectors.js y no exporta nada: registra los tests al cargarse.
 */

import { describe, expect, it } from 'vitest';

import {
  ENTRY_SHAPED,
  MODULES,
  argumentCount,
  arityMismatches,
  branchedLiterals,
  classMembers,
  codeDefaults,
  comparedExampleArguments,
  copiedOptions,
  docBlocks,
  documentedDefaults,
  documentedMembers,
  documentsOptionsObject,
  entryShapeKeys,
  enumeratedValues,
  exampleBindings,
  exampleConstructions,
  exampleMemberAccesses,
  exampleMethodCalls,
  exampleValues,
  inertOptions,
  memberDeclarations,
  memberSignatures,
  mismatchedExampleAccesses,
  missingExampleMethods,
  mistypedExampleArguments,
  offListValues,
  optionReads,
  resolvedExampleOptions,
  staleUsageOptions,
  textChainedMembers,
  undocumentedDefaults,
  undocumentedReads,
  undocumentedExampleCalls,
  unreadEntryKeys,
  unresolvedUsageClasses,
  unusedMembers,
  usageBlocks,
} from './detectors.js';

describe('opciones documentadas', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: todo miembro documentado se menciona en el código`, () => {
      expect(unusedMembers(source)).toEqual([]);
    });
  }
});

describe('opciones leídas sin documentar', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: toda opción que el código lee está documentada`, () => {
      expect(undocumentedReads(source)).toEqual([]);
    });
  }
});

describe('claves de las entradas ricas', () => {
  for (const { label, source } of MODULES.filter(({ source }) => entryShapeKeys(source) != null)) {
    it(`${label}: toda clave que normalizeEntry guarda se lee fuera del normalizador`, () => {
      expect(unreadEntryKeys(source)).toEqual([]);
    });
  }

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

describe('opciones guardadas y nunca usadas', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: toda opción guardada se vuelve a leer`, () => {
      expect(inertOptions(source)).toEqual([]);
    });
  }
});

describe('cobertura de las opciones guardadas', () => {
  it('la auditoría ve huecos de verdad (ni lista vacía ni detector mudo)', () => {
    const withCopies = MODULES.filter(({ source }) => copiedOptions(source).size > 0);

    expect(withCopies.length).toBeGreaterThan(5);
  });
});

describe('defaults prometidos por la documentación', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: todo default literal del código está documentado`, () => {
      expect(undocumentedDefaults(source)).toEqual([]);
    });
  }
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

describe('ejemplos de uso documentados', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: las opciones del ejemplo existen de verdad`, () => {
      expect(staleUsageOptions(source)).toEqual([]);
    });
  }
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

describe('valores enumerados de las opciones', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: el código y los ejemplos usan valores de la lista documentada`, () => {
      expect(offListValues(source)).toEqual([]);
    });
  }
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

describe('métodos de los ejemplos documentados', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: todo método que llama el ejemplo existe en la clase`, () => {
      expect(missingExampleMethods(source)).toEqual([]);
    });
  }
});

describe('cobertura de los métodos de los ejemplos', () => {
  it('la auditoría ve llamadas de verdad (ni lista vacía ni detector mudo)', () => {
    const withCalls = MODULES.filter(({ source }) => exampleMethodCalls(source).length > 0);
    const total = MODULES.reduce((sum, { source }) => sum + exampleMethodCalls(source).length, 0);

    expect(withCalls.length).toBeGreaterThanOrEqual(4);
    expect(total).toBeGreaterThanOrEqual(8);
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

describe('aridad de las llamadas y construcciones de los ejemplos', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: el ejemplo llama y construye con la aridad de la firma`, () => {
      expect(arityMismatches(source)).toEqual([]);
    });
  }
});

describe('cobertura de la aridad de las llamadas y construcciones', () => {
  it('la auditoría mide llamadas y firmas de verdad (ni detector mudo ni cero argumentos)', () => {
    const withArgs = MODULES.filter(({ source }) => exampleMethodCalls(source).some(({ args }) => args !== ''));
    const total = MODULES.reduce((sum, { source }) => sum + exampleMethodCalls(source).length, 0);

    expect(withArgs.length).toBeGreaterThanOrEqual(3);
    expect(total).toBeGreaterThanOrEqual(8);
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

describe('tipos de los argumentos de los ejemplos', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: el ejemplo pasa argumentos del tipo que promete la documentación`, () => {
      expect(mistypedExampleArguments(source)).toEqual([]);
    });
  }
});

describe('cobertura de los tipos de los argumentos', () => {
  it('la auditoría cruza tipos prometidos con formas reales (ni detector mudo)', () => {
    const pairs = MODULES.flatMap(({ source }) => comparedExampleArguments(source));
    const withPairs = MODULES.filter(({ source }) => comparedExampleArguments(source).length > 0);

    expect(pairs.length).toBeGreaterThanOrEqual(6);
    expect(pairs.filter(({ kind }) => kind === 'object').length).toBeGreaterThanOrEqual(4);
    expect(withPairs.length).toBeGreaterThanOrEqual(4);
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
});

describe('forma de los accesos de los ejemplos', () => {
  for (const { label, source } of MODULES) {
    it(`${label}: el ejemplo toca cada miembro como la clase lo declara`, () => {
      expect(mismatchedExampleAccesses(source)).toEqual([]);
    });
  }
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
          const members = [...text.slice(at).matchAll(new RegExp(`\\b${variable}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'g'))]
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

        for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+([A-Za-z_$][\w$]*)\s*\(/g))
          classes.set(match[1], match[2]);

        for (let round = 0; round <= classes.size; round += 1) {
          let changed = false;

          for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
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

        for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
          const expected = classes.get(match[1]);

          // Solo se juzga un alias USADO: `alias.` tiene que aparecer en el bloque.
          if (expected != null && expected !== match[1]
            && new RegExp(`\\b${match[1]}\\s*\\.`).test(text))
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
