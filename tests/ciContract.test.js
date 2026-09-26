/**
 * Contrato del CI con la auditoria de documentacion.
 *
 * La auditoria (tests/documentedOptions.test.js) solo es una PUERTA si el workflow la
 * corre: `docs-audit.yml` tiene que ejecutar el mismo comando que COMPONENTS.md
 * documenta, en su propio paso, en cada PR y sin filtros que lo puedan dejar sin
 * correr. Este fichero vigila ese contrato, que es justo lo que nadie nota cuando se
 * rompe: un workflow que corre otra cosa (o que no corre, por un `paths:` de mas) deja
 * la auditoria en verde, el CI en verde y la puerta en el suelo.
 *
 * Los detectores son de texto a proposito: leer el YAML con un parser obligaria a una
 * dependencia que este paquete no tiene, y aqui solo hacen falta los comandos que
 * corre, sus disparadores y el `paths:` que NO debe haber.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MODULES,
  arityMismatches,
  inertOptions,
  mismatchedExampleAccesses,
  missingExampleMethods,
  mistypedExampleArguments,
  offListValues,
  staleUsageOptions,
  undocumentedDefaults,
  undocumentedReads,
  unreadEntryKeys,
  unusedMembers,
} from './audit/detectors.js';
import {
  detectorVoices,
  edgeOfRule,
  numberedRules,
  overviewDiagramLines,
} from './audit/diagram.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const AUDIT = join(here, 'documentedOptions.test.js');
const WORKFLOW = join(root, '.github', 'workflows', 'docs-audit.yml');
const DOC = join(root, 'COMPONENTS.md');
const SUBCOMMANDS = ['exec', 'install', 'add', 'dlx', 'create'];

/** El numero de reglas en palabras, como lo proclama la cabecera de la auditoria. */
const RULE_WORDS = {
  2: 'Dos',
  3: 'Tres',
  4: 'Cuatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Siete',
  8: 'Ocho',
  9: 'Nueve',
  10: 'Diez',
  11: 'Once',
  12: 'Doce',
};

/** El fichero, o cadena vacia si no existe: el test que lo echa en falta lo dice. */
const readOrEmpty = (path) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const audit = readOrEmpty(AUDIT);
const workflow = readOrEmpty(WORKFLOW);
const doc = readOrEmpty(DOC);
const RULES_SOURCE = readOrEmpty(join(here, 'audit', 'rules.js'));

/** Las familias con el fuente que define cada detector: de ahi se derivan las
 *  voces (DOC/CODE/EX) que sostienen cada flecha del diagrama. */
const FAMILY_SOURCES = new Map();

for (const name of ['rules1to7.js', 'receivers.js']) {
  const source = readOrEmpty(join(here, 'audit', name));

  for (const match of source.matchAll(/^export\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/gm))
    FAMILY_SOURCES.set(match[1], source);
}

/* ---------------------------------------------------------------------------
 * Detectores (puros: reciben el texto, no el disco)
 * ------------------------------------------------------------------------- */

/** Los `run:` de un workflow, en orden: el comando de cada paso. */
function runCommands(source) {
  return [...source.matchAll(/^\s*(?:-\s+)?run:\s*(\S.*)$/gm)].map((match) => match[1].trim());
}

/** El bloque de una clave de primer nivel (`on:`, `jobs:`), con su indentacion. */
function topLevelBlock(source, key) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));

  if (start < 0)
    return null;

  const block = [];

  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '' || /^\s/.test(lines[i]))
      block.push(lines[i]);
    else
      break;
  }

  return block.join('\n');
}

/** Las claves que cuelgan de `pull_request:` en el `on:` (null si no dispara en PR).
 *  Un `paths:` o un `types:` aqui es lo que deja a un check requerido sin ejecutarse. */
function pullRequestKeys(source) {
  const lines = (topLevelBlock(source, 'on') ?? '').split('\n');
  const at = lines.findIndex((line) => /^  pull_request:/.test(line));

  if (at < 0)
    return null;

  const keys = [];

  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '')
      continue;

    if (/^  \S/.test(line))
      break;                            // otra entrada de `on:` (`push:`)

    const nested = /^\s+([\w-]+):/.exec(line);

    if (nested != null)
      keys.push(nested[1]);
  }

  return keys;
}

/** Los scripts de `package.json` que un workflow invoca (`pnpm test`, `pnpm run x`). */
function invokedScripts(source) {
  const invoked = [];

  for (const command of runCommands(source)) {
    for (const match of command.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
      if (!SUBCOMMANDS.includes(match[1]))
        invoked.push(match[1]);
    }
  }

  return invoked;
}

/** La cabecera de la auditoria: su primer bloque de documentacion. */
function auditHeader(source) {
  const end = source.indexOf('*/');

  return end < 0 ? source : source.slice(0, end);
}

/** Los numeros de regla que enumera la cabecera de la auditoria: [1, 2, ...]. */
function auditedRules(source) {
  return [...auditHeader(source).matchAll(/^ \* +(\d+)\. [A-Z]/gm)].map((match) => Number(match[1]));
}

/** El numero de reglas en palabras de esa cabecera (`Once reglas`). */
function declaredRuleWord(source) {
  return /mentira\. ([A-Z][a-z]+) reglas,/.exec(auditHeader(source))?.[1] ?? null;
}

/** Las filas numeradas de la tabla de reglas de COMPONENTS.md. */
function documentedRules(source) {
  return [...source.matchAll(/^\| *(\d+) *\|/gm)].map((match) => Number(match[1]));
}

/** El numero que proclama el titulo de la seccion de auditoria. */
function documentedRuleCount(source) {
  const match = /^## Auditoría de documentación \((\d+) reglas\)$/m.exec(source);

  return match == null ? null : Number(match[1]);
}

/** El comando que COMPONENTS.md documenta para correr la auditoria, a secas. */
function documentedAuditCommand(source) {
  return /`([^`]*vitest run tests\/documentedOptions\.test\.js[^`]*)`/.exec(source)?.[1] ?? null;
}

/** Los bloques ```mermaid de la guia, cada uno como lista de lineas (sin la
 *  linea vacia final que el salto de la valla de cierre deja en la captura). */
function mermaidFlowcharts(source) {
  return [...source.matchAll(/^```mermaid\r?\n([\s\S]*?)^```/gm)]
    .map((match) => {
      const lines = match[1].split(/\r?\n/);

      while (lines.at(-1) === '')
        lines.pop();

      return lines;
    });
}

/** La sintaxis de un `flowchart` de Mermaid que esta guia usa, linea a linea:
 *  la cabecera `flowchart TB|LR`, la declaracion de nodo `ID["texto"]`, la arista
 *  `A -->|etiqueta| B` (tambien `==>` y `-.->`) y la linea en blanco. Un diagrama que
 *  no la cumple es un diagrama que GitHub NO dibuja: el render roto se descubre aqui
 *  y no en el PR. Text-mode a proposito: sin parser de Mermaid, que el paquete no
 *  tiene, pero tapando justo la sintaxis que la guia emplea. */
function mermaidLineErrors(lines) {
  const declared = new Set();
  const referenced = new Set();
  const errors = [];
  const node = /^\s*([A-Z][A-Z0-9_]+)\["([^"]*)"\]\s*$/;
  const edge = /^\s*([A-Z][A-Z0-9_]+)\s*(?:-{2,3}>|==+>|-\.->)\s*(?:\|([^|]*)\|\s*)?([A-Z][A-Z0-9_]+)\s*$/;

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '' || /^\s*flowchart\s+(TB|LR|RL|BT)\s*$/.test(line))
      continue;

    const isNode = node.exec(line);
    const isEdge = isNode == null ? edge.exec(line) : null;

    if (isNode != null) {
      declared.add(isNode[1]);
      continue;
    }

    if (isEdge != null) {
      referenced.add(isEdge[1]);
      referenced.add(isEdge[3]);
      continue;
    }

    errors.push(`linea ${index + 1}: no es ni declaracion de nodo ni arista: ${line.trim()}`);
  }

  for (const id of referenced)
    if (!declared.has(id)) errors.push(`el nodo ${id} se usa y no se declara`);

  return errors;
}

/* ---------------------------------------------------------------------------
 * Las recetas de los ejemplos que cita la guia
 * ------------------------------------------------------------------------- */

/** La fuente actual de un modulo auditado (undefined si el label ya no existe). */
const moduleSource = (label) => MODULES.find((item) => item.label === label)?.source;

/** Cada ejemplo de fallo de "Las once reglas, con un fallo real de cada una"
 *  (COMPONENTS.md) como RECETA reproducible: la mutacion de una linea sobre el modulo
 *  real y el mensaje que el detector tiene que seguir soltando. Si un detector cambia
 *  su salida, o la guia cambia de ejemplo sin contar a nadie, el contrato delata cual
 *  de los dos se movio: la guia no puede quedarse obsoleta en silencio. */
const RULE_RECIPES = [
  {
    rule: 1, module: 'themeSwitcher.js', detector: unusedMembers, cited: ['zzzGhost'],
    mutate: (source) => source.replace(' * @param ',
      ' * @param {number} [options.zzzGhost] opcion que solo vive en la doc\n * @param '),
  },
  {
    rule: 2, module: 'effectLEDButton.js', detector: undocumentedReads, cited: ['zzzGhost'],
    mutate: (source) => source.replace('constructor(container, options = {}) {',
      'constructor(container, options = {}) { this.zzzGhost = options.zzzGhost;'),
  },
  {
    rule: 3, module: 'select.js', detector: unreadEntryKeys, cited: ['zzzGhostKey'],
    mutate: (source) => {
      const normalizer = source.indexOf('function normalizeEntry');
      const literal = source.indexOf('return {', normalizer);

      return source.slice(0, literal + 8) + '\n      zzzGhostKey: true,' + source.slice(literal + 8);
    },
  },
  {
    rule: 4, module: 'effectLEDButton.js', detector: undocumentedDefaults, cited: ['size=gigante'],
    mutate: (source) => source.replace("size: options.size ?? 'normal',", "size: options.size ?? 'gigante',"),
  },
  {
    rule: 5, module: 'effectLEDButton.js', detector: inertOptions, cited: ['zzzGhost'],
    mutate: (source) => source.replace('value: options.value ?? false,',
      'value: options.value ?? false,\n            zzzGhost: options.zzzGhost ?? null,'),
  },
  {
    rule: 6, module: 'xypad.js', detector: staleUsageOptions, cited: ['XYPad.zzzGhost'],
    mutate: (source) => source.replace('{ x: 0.5, y: 0.5, onChange, onDragStart, onDragEnd }',
      '{ x: 0.5, y: 0.5, zzzGhost: 1 }'),
  },
  {
    rule: 7, module: 'wheel.js', detector: offListValues, cited: ['type=zzzGhost'],
    mutate: (source) => `${source}\nif (this.type === 'zzzGhost') this.value = 0;\n`,
  },
  {
    rule: 8, module: 'wheel.js', detector: missingExampleMethods, cited: ['Wheel.zzzGhost()'],
    mutate: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.zzzGhost();\n *   wheel.destroy();'),
  },
  {
    rule: 9, module: 'wheel.js', detector: arityMismatches,
    cited: ['Wheel.setValue(): recibe 3, la firma acepta 1..2'],
    mutate: (source) => source.replace('wheel.setValue(0.5, false)', 'wheel.setValue(0.5, false, 1)'),
  },
  {
    rule: 10, module: 'wheel.js', detector: mistypedExampleArguments,
    cited: ['Wheel.setValue(): el argumento 1 es string y la firma promete number'],
    mutate: (source) => source.replace('wheel.setValue(0.5, false)', "wheel.setValue('0.5', false)"),
  },
  {
    rule: 11, module: 'wheel.js', detector: mismatchedExampleAccesses,
    cited: ['Wheel.destroy: el ejemplo lo lee, la clase lo declara metodo'],
    mutate: (source) => source.replace(' *   wheel.destroy();', ' *   wheel.destroy;'),
  },
];

/* ---------------------------------------------------------------------------
 * El contrato
 * ------------------------------------------------------------------------- */

describe('el CI corre la auditoría de documentación', () => {
  it('la auditoría, el workflow y la guía existen', () => {
    expect(existsSync(AUDIT)).toBe(true);
    expect(existsSync(WORKFLOW)).toBe(true);
    expect(existsSync(DOC)).toBe(true);
  });

  it('la entrada de la auditoría importa sus módulos (entrada + tests/audit/)', () => {
    const source = readOrEmpty(AUDIT);

    // La estructura entrada + módulos es parte del contrato: la entrada lleva la
    // cabecera que este fichero lee, y cada pieza vive importable en tests/audit/.
    for (const name of ['rules.js', 'autoTests.js', 'metaGuard.js'])
      expect(source.includes(`./audit/${name}`), `la entrada no importa ${name}`).toBe(true);

    const header = auditHeader(source);

    expect(header).toContain('OPCIONES DOCUMENTADAS');
  });

  it('el workflow corre el MISMO comando que documenta COMPONENTS.md', () => {
    const command = documentedAuditCommand(doc);

    expect(command).not.toBeNull();
    expect(runCommands(workflow)).toContain(command);
  });

  it('la auditoría es un paso propio, para que el fallo se lea como tal', () => {
    const command = documentedAuditCommand(doc);
    const steps = runCommands(workflow).filter((line) => line.includes('documentedOptions.test.js'));

    expect(steps).toEqual([command]);       // ni encadenada ni duplicada
  });

  it('dispara en cada pull request y sin filtros que lo puedan dejar sin correr', () => {
    expect(pullRequestKeys(workflow)).toEqual([]);
  });

  it('los scripts que invoca existen en package.json', () => {
    const invoked = invokedScripts(workflow);

    expect(invoked.length).toBeGreaterThanOrEqual(2);
    expect(invoked.filter((name) => !(name in manifest.scripts))).toEqual([]);
  });

  it('el número de reglas cuadra entre la cabecera, el título y la tabla de la guía', () => {
    const rules = auditedRules(audit);

    expect(rules.length).toBeGreaterThanOrEqual(11);
    expect(rules).toEqual(rules.map((_, index) => index + 1));       // 1..N, sin huecos
    expect(documentedRuleCount(doc)).toBe(rules.length);
    expect(documentedRules(doc)).toEqual(rules);
  });

  it('la cabecera proclama ese número con la palabra que toca', () => {
    const count = auditedRules(audit).length;

    expect(declaredRuleWord(audit)).toBe(RULE_WORDS[count]);
  });

  it('el workflow que cita la guía es el que existe', () => {
    const cited = [...doc.matchAll(/`([\w-]+\.yml)`/g)].map((match) => match[1]);

    expect(cited).toContain(basename(WORKFLOW));
    expect(cited.filter((name) => !existsSync(join(root, '.github', 'workflows', name)))).toEqual([]);
  });

  it('los diagramas Mermaid de la guía se pueden dibujar', () => {
    const charts = mermaidFlowcharts(doc);

    // Si la guia no tiene diagramas, la validacion no mira nada: es otra forma de
    // quedarse ciego. La seccion de la auditoria promete dos.
    expect(charts.length).toBeGreaterThanOrEqual(1);

    for (const lines of charts)
      expect(mermaidLineErrors(lines), lines.join('\n')).toEqual([]);
  });

  it('las reglas del diagrama salen de los describe del audit y numeran como las recetas', () => {
    const rules = numberedRules(RULES_SOURCE);

    // El numero que diagram.js deriva (posicion del detector en su catalogo) es
    // el que las recetas de abajo reproducen; el detector que rules.js corre
    // para cada regla, el mismo que muta la receta. Dos catalogos que no pueden
    // divergir sin que este test diga cual de los dos se movio.
    expect(rules.map(({ number }) => number)).toEqual(RULE_RECIPES.map(({ rule }) => rule));
    expect(Object.fromEntries(rules.map(({ number, detector }) => [number, detector])))
      .toEqual(Object.fromEntries(RULE_RECIPES.map(({ rule, detector }) => [rule, detector.name])));
  });

  it('cada regla lee las dos voces de la flecha que el diagrama le asigna', () => {
    for (const { number, detector } of numberedRules(RULES_SOURCE)) {
      const edge = edgeOfRule(number);

      expect(edge, `la regla ${number} no tiene flecha en el diagrama`).toBeDefined();

      if (edge == null)
        continue;

      for (const voice of new Set([edge.from, edge.to]))
        expect(
          detectorVoices(detector, FAMILY_SOURCES).has(voice),
          `la regla ${number} (${detector}) no lee la voz ${voice} de su flecha`,
        ).toBe(true);
    }
  });

  it('el bloque «De un vistazo» es el que el audit genera', () => {
    const charts = mermaidFlowcharts(doc);

    expect(charts.length).toBeGreaterThanOrEqual(2);
    expect(charts[0], 'el diagrama de la guia no es el que genera tests/audit/diagram.js')
      .toEqual(overviewDiagramLines(RULES_SOURCE));
  });

  it('los fallos que cita la guía siguen saliendo de los detectores', () => {
    // Cada ejemplo de la guia se REPRODUCE: se aplica la mutacion documentada al modulo
    // real y el detector tiene que soltar el mensaje citado, letra a letra. Si un
    // detector cambia su salida, o la guia cambia de ejemplo sin contar a nadie, este
    // test dice cual de los dos se movio.
    expect(RULE_RECIPES.map(({ rule }) => rule)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    for (const { rule, module, detector, mutate, cited } of RULE_RECIPES) {
      const source = moduleSource(module);

      expect(source, `${module} no esta entre los modulos auditados`).toBeDefined();
      expect(detector(mutate(source)), `regla ${rule}`).toEqual(cited);

      for (const message of cited)
        expect(doc.includes(message), `la guia ya no cita el mensaje de la regla ${rule}`).toBe(true);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests del contrato: sus detectores tienen que MORDER
 * ------------------------------------------------------------------------- */

describe('auto-tests del contrato del CI', () => {
  it('caza el `paths:` que deja el check sin correr', () => {
    const source = 'on:\n  pull_request:\n    paths:\n      - "components/**"\n  push:\n    branches:\n      - main\n';

    expect(pullRequestKeys(source)).toEqual(['paths']);
  });

  it('no se inventa un pull_request que el workflow no tiene', () => {
    expect(pullRequestKeys('on:\n  push:\n    branches:\n      - main\n')).toBeNull();
    expect(pullRequestKeys('name: X\n')).toBeNull();
  });

  it('lee los comandos que corre el workflow', () => {
    expect(runCommands('      - name: X\n        run: pnpm test\n')).toEqual(['pnpm test']);
  });

  it('distingue un script de un subcomando de pnpm', () => {
    expect(invokedScripts('run: pnpm install --frozen-lockfile\nrun: pnpm exec vitest run x\nrun: pnpm run smoke:a11y\n'))
      .toEqual(['smoke:a11y']);
  });

  it('cuenta las reglas de la cabecera y las de la tabla de la guía', () => {
    const header = ' *   1. UNO: x\n *   2. DOS: y\n';
    const guide = '# T\n\n## Auditoría de documentación (2 reglas)\n\n| 1 | a | b |\n| 2 | c | d |\n';

    expect(auditedRules(header)).toEqual([1, 2]);
    expect(documentedRuleCount(guide)).toBe(2);
    expect(documentedRules(guide)).toEqual([1, 2]);
  });

  it('lee la palabra y el comando que promete la documentación', () => {
    expect(declaredRuleWord(' * mentira. Tres reglas, cada una:')).toBe('Tres');
    expect(documentedAuditCommand('Se corre con `pnpm exec vitest run tests/documentedOptions.test.js` (o `pnpm test`).'))
      .toBe('pnpm exec vitest run tests/documentedOptions.test.js');
    expect(documentedAuditCommand('sin comando')).toBeNull();
  });

  it('valida un flowchart con nodos, aristas, etiquetas y su cabecera', () => {
    const lines = [
      'flowchart TB',
      '  DOC["DOCUMENTACIÓN<br/>@param"]',
      '  CODE["CÓDIGO"]',
      '  EX["EJEMPLOS"]',
      '',
      '  DOC ==>|"1 · 7 — existe"| CODE',
      '  CODE -->|"2 · 4"| DOC',
      '  EX -.->|sigue| CODE',
    ];

    expect(mermaidLineErrors(lines)).toEqual([]);
  });

  it('caza el nodo que se usa y nadie declara', () => {
    const lines = ['flowchart TB', '  DOC ==>|flecha| CODE'];

    expect(mermaidLineErrors(lines)).toEqual([
      'el nodo DOC se usa y no se declara',
      'el nodo CODE se usa y no se declara',
    ]);
  });

  it('caza la línea que ni declara nodo ni es arista', () => {
    const lines = ['flowchart TB', '  DOC-- CODE'];

    expect(mermaidLineErrors(lines))
      .toEqual(['linea 2: no es ni declaracion de nodo ni arista: DOC-- CODE']);
  });

  it('deriva las reglas de un rules.js sintetico, numeradas por su detector', () => {
    const source = [
      "describe('uno', () => {",
      "  it('x', () => { expect(unusedMembers(source)).toEqual([]); });",
      '});',
      "describe('cobertura de la uno', () => {",
      "  it('y', () => { expect(1).toBe(1); });",
      '});',
      "describe('dos', () => {",
      "  it('z', () => { expect(undocumentedReads(source)).toEqual([]); });",
      '});',
    ].join('\n');

    // El numero sale del detector que el cuerpo corre (posicion en el catalogo
    // RULE_DETECTORS), no del orden de los describe; la cobertura no es regla.
    expect(numberedRules(source)).toEqual([
      { number: 1, title: 'uno', detector: 'unusedMembers' },
      { number: 2, title: 'dos', detector: 'undocumentedReads' },
    ]);
  });

  it('clasifica un detector por sus semillas de voz y sus llamadas', () => {
    const families = new Map([
      ['documentedMembers', 'export function documentedMembers(source) { return docBlocks(source); }'],
      ['unusedMembers', 'export function unusedMembers(source) { return documentedMembers(source); }'],
      ['inertOptions', 'export function inertOptions(source) { return copiedOptions(source); }'],
    ]);
    const voices = (name) => [...detectorVoices(name, families)].sort();

    expect(voices('unusedMembers')).toEqual(['DOC']);
    expect(voices('inertOptions')).toEqual(['CODE']);
    expect(voices('desconocido')).toEqual([]);
  });

  it('monta el diagrama con una arista por familia de reglas y ninguna vacia', () => {
    const source = [
      "describe('1. UNO', () => {",
      "  it('x', () => { expect(unusedMembers(source)).toEqual([]); });",
      '});',
      "describe('2. DOS', () => {",
      "  it('z', () => { expect(undocumentedReads(source)).toEqual([]); });",
      '});',
    ].join('\n');

    expect(overviewDiagramLines(source)).toEqual([
      'flowchart TB',
      '  DOC["DOCUMENTACIÓN<br/>@param · listas · nombres"]',
      '  CODE["CÓDIGO<br/>lecturas · defaults · firmas · normalizeEntry"]',
      '  EX["EJEMPLOS (Usage:)<br/>new X(el, { ... }) · x.m(args) · x.prop"]',
      '',
      '  DOC ==>|"1 — lo documentado tiene que existir"| CODE',
      '  CODE ==>|"2 — lo que el código hace tiene que estar documentado"| DOC',
    ]);
  });

  it('la receta es un mecanismo vivo, no un texto copiado', () => {
    // La comparacion del contrato solo vale si la mutacion es REAL: una mutacion
    // distinta tiene que producir un mensaje distinto. Un copy-paste que no muta
    // no pasaria este test.
    const source = 'export class Pad {\n  setValue(v, notify = true) {\n    this.value = v;\n  }\n}\n';
    const modules = [{ label: 'pad.js', source }];
    const usage = (call) => `/**\n * Usage:\n *   const p = new Pad(el);\n *   p.${call};\n */\n${source}`;

    expect(arityMismatches(usage('setValue(0.5, false, 1)'), modules))
      .toEqual(['Pad.setValue(): recibe 3, la firma acepta 1..2']);
    expect(arityMismatches(usage('setValue(0.5, false, 1, 2)'), modules))
      .toEqual(['Pad.setValue(): recibe 4, la firma acepta 1..2']);
  });
});
