/**
 * El diagrama «De un vistazo» de la guia, DERIVADO del audit.
 *
 * Las reglas se leen de ./rules.js: cada `describe` de regla declara en su cuerpo el
 * detector que la ejecuta (`expect(detector(source))`), y su numero es la posicion de
 * ese detector en RULE_DETECTORS. Las voces de cada detector —DOC, CODE, EX— se
 * derivan de las familias: un detector lee la voz de sus semillas (`docBlocks`,
 * `optionReads`, `exampleMethodCalls`, ...) y la de todo lo que llama en cadena.
 * Con eso, y la flecha editorial a la que pertenece cada regla, se montan las lineas
 * del bloque: si rules.js deja de correr un detector, renombra uno o un detector deja
 * de leer una voz, el diagrama que la guia muestra deja de ser el que el audit genera
 * y el contract lo delata. Pure functions: las fuentes entran por parametro.
 */

import { closingIndex } from './detectors.js';

/** El catalogo de los detectores de regla, EN ORDEN: la posicion es el numero de la
 *  regla. Es la pieza editorial de la numeracion (junto a los nodos y los lemas de
 *  las flechas); el contract la coteja con los `describe` de rules.js y con las
 *  recetas de los fallos, de modo que un detector renombrado, añadido o retirado
 *  revienta aqui en vez de desdibujar el diagrama en silencio. */
const RULE_DETECTORS = [
  'unusedMembers',
  'undocumentedReads',
  'unreadEntryKeys',
  'undocumentedDefaults',
  'inertOptions',
  'staleUsageOptions',
  'offListValues',
  'missingExampleMethods',
  'arityMismatches',
  'mistypedExampleArguments',
  'mismatchedExampleAccesses',
];

/** Las voces del diagrama y las semillas que las leen: llamar a una de estas
 *  (directamente o a traves de otro detector) es leer esa voz. */
const VOICE_SEEDS = [
  ['DOC', ['docBlocks', 'documentedMembers', 'documentedDefaults', 'documentedParamTypes']],
  ['CODE', ['codeOnly', 'optionReads', 'codeDefaults', 'copiedOptions', 'entryShapeKeys',
    'entryParameters', 'classBody', 'classMembers', 'memberDeclarations', 'branchedLiterals']],
  ['EX', ['exampleBindings', 'exampleMethodCalls', 'exampleConstructions',
    'exampleMemberAccesses', 'exampleValues']],
];

/** Los nodos del diagrama: las tres voces con su subtitulo. */
const DIAGRAM_NODES = [
  'DOC["DOCUMENTACIÓN<br/>@param · listas · nombres"]',
  'CODE["CÓDIGO<br/>lecturas · defaults · firmas · normalizeEntry"]',
  'EX["EJEMPLOS (Usage:)<br/>new X(el, { ... }) · x.m(args) · x.prop"]',
];

/** Las flechas del diagrama, en orden: cada una agrupa las reglas cuya pareja de
 *  voces es la suya. El lema es lo que la flecha promete a quien lee la guia. */
const EDGES = [
  { from: 'DOC', to: 'CODE', arrow: '==>', slogan: 'lo documentado tiene que existir' },
  { from: 'CODE', to: 'DOC', arrow: '==>', slogan: 'lo que el código hace tiene que estar documentado' },
  { from: 'EX', to: 'CODE', arrow: '==>', slogan: 'la llamada del ejemplo cuadra con el código' },
  { from: 'EX', to: 'DOC', arrow: '==>', slogan: 'el argumento del ejemplo cuadra con el @param' },
  { from: 'CODE', to: 'CODE', arrow: '-->', slogan: 'coherencia interna del código' },
];

/** La flecha del diagrama a la que pertenece cada regla (el indice en EDGES). El
 *  contract verifica que las voces del detector de la regla sostengan los dos
 *  extremos de SU flecha: una regla en una flecha que sus voces no sostienen no se
 *  dibuja, se delata. */
const RULE_EDGE = { 1: 0, 2: 1, 3: 4, 4: 1, 5: 4, 6: 2, 7: 0, 8: 2, 9: 2, 10: 3, 11: 2 };

/** Las reglas de rules.js: numero (la posicion de su detector en RULE_DETECTORS),
 *  titulo del describe y el detector que su cuerpo ejecuta. Los describe
 *  `cobertura ...` (las guardias) no son reglas. Un detector que el catalogo no
 *  numera sale con numero 0: el desajuste revienta en el contract, no aqui. */
export function numberedRules(rulesSource) {
  const rules = [];

  for (const match of rulesSource.matchAll(/\bdescribe\s*\(\s*'([^']*)'\s*,/g)) {
    const open = rulesSource.indexOf('{', match.index + match[0].length);

    if (open < 0)
      continue;

    const close = closingIndex(rulesSource, open);

    if (close < 0)
      continue;

    const title = match[1];
    const detector = /\bexpect\s*\(\s*([A-Za-z_$][\w$]*)\s*\(\s*source\s*\)/
      .exec(rulesSource.slice(open, close + 1));

    if (/^cobertura\b/.test(title) || detector == null)
      continue;

    rules.push({ number: RULE_DETECTORS.indexOf(detector[1]) + 1, title, detector: detector[1] });
  }

  return rules.sort((a, b) => a.number - b.number);
}

/** Las voces que alimenta un detector: las de sus semillas y las de todo lo que
 *  llama dentro de las familias, en cadena. `memo` corta los ciclos. */
export function detectorVoices(name, familySources, memo = new Map()) {
  const cached = memo.get(name);

  if (cached != null)
    return cached;

  const voices = new Set();

  memo.set(name, voices);

  for (const [voice, seeds] of VOICE_SEEDS)
    if (seeds.includes(name))
      voices.add(voice);

  const source = familySources.get(name);

  if (source != null)
    for (const match of source.matchAll(/\b([a-z][A-Za-z0-9]*)\s*\(/g))
      for (const voice of detectorVoices(match[1], familySources, memo))
        voices.add(voice);

  return voices;
}

/** La flecha a la que el diagrama asigna una regla (undefined si no la tiene). */
export function edgeOfRule(number) {
  return EDGES[RULE_EDGE[number]];
}

/** Las lineas del bloque «De un vistazo»: los nodos fijos y, por cada flecha con
 *  reglas asignadas, su lema con los numeros de las reglas REALES que la
 *  sostienen. Una regla sin flecha —o sin numero— no se dibuja: revienta aqui. */
export function overviewDiagramLines(rulesSource) {
  const rules = numberedRules(rulesSource);

  if (rules.length === 0)
    throw new Error('rules.js no delata ninguna regla');

  const members = new Map();

  for (const rule of rules) {
    const at = RULE_EDGE[rule.number];

    if (at == null)
      throw new Error(rule.number === 0
        ? `el detector ${rule.detector} (${rule.title}) no esta numerado en diagram.js`
        : `la regla ${rule.number} (${rule.title}) no tiene flecha en el diagrama`);

    if (!members.has(at))
      members.set(at, []);

    members.get(at).push(rule.number);
  }

  const lines = ['flowchart TB', ...DIAGRAM_NODES.map((node) => `  ${node}`), ''];

  for (const [at, edge] of EDGES.entries()) {
    const group = members.get(at);

    if (group == null)
      continue;

    lines.push(`  ${edge.from} ${edge.arrow}|"${group.join(' · ')} — ${edge.slogan}"| ${edge.to}`);
  }

  return lines;
}
