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
 *
 * Y como los diagramas los dibuja GitHub, el contrato pasa por el parser REAL de Mermaid
 * TODOS los bloques ```mermaid de los markdown del paquete —la guia, los README y las
 * guias de `docs/`—, no solo los de COMPONENTS.md: un diagrama roto en cualquier doc no
 * espera al navegador para reventar.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import mermaid from 'mermaid';

import {
  AUDIT_MODULES,
  AUDIT_SIN_API,
  HALF_SITES,
  MODULES,
  RECEIVER_FORMS,
  TOP_SITIOS,
  arityMismatches,
  diagnostico as diagnosticoDelAudit,
  guideMessageBlock,
  halfDeclaredRules,
  importedNames,
  informeDiagnostico as informeDelAudit,
  limiteConTexto,
  lineaDe,
  recorte,
  resumenDiagnostico,
  ruleGaps as ruleGapsDelAudit,
  sharedProse,
} from './audit/detectors.js';
import {
  auditHeaderLines,
  headerLimitLines,
  headerLimitBlock,
  LIMIT_WIDTH,
  limitBulletLines,
  limitWidthOf,
  ruleLimitLines,
  detectorVoices,
  ruleHeaderLine,
  ruleHeaderLines,
  edgeOfRule,
  recipeProseLines,
  overviewBlock,
  overviewDiagramLines,
  reachableFrom,
  ruleHeading,
  ruleTable,
  ruleTableRow,
  ruleTableRows,
  shouted,
} from './audit/diagram.js';
import { RULES } from './audit/detectors.js';

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
  13: 'Trece',
};

/** El fichero, o cadena vacia si no existe: el test que lo echa en falta lo dice. */
const readOrEmpty = (path) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const audit = readOrEmpty(AUDIT);
const auditRules = readOrEmpty(join(here, 'audit', 'rules.js'));
const auditAutoTests = readOrEmpty(join(here, 'audit', 'autoTests.js'));
const workflow = readOrEmpty(WORKFLOW);
const doc = readOrEmpty(DOC);

/** El fuente de cada modulo del audit —las capas, los modulos de regla y el barrel—, con
 *  las declaraciones que define cada uno: de ahi se derivan las voces (DOC/CODE/EX) que
 *  sostienen cada flecha del diagrama. Los modulos salen del DIRECTORIO (su raiz y su
 *  `rules/`), no de una lista de nombres: una capa o una regla nueva entra sola. */
const FAMILY_SOURCES = new Map();

for (const dir of ['audit', join('audit', 'rules')])
  for (const name of readdirSync(join(here, dir))) {
    if (!name.endsWith('.js'))
      continue;

    const source = readOrEmpty(join(here, dir, name));

    for (const match of source.matchAll(/^(?:export\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm))
      FAMILY_SOURCES.set(match[1], source);
  }

/** El CONTEXTO del diagnostico en ESTE repo: el catalogo real, la guia, la cabecera
 *  del audit, los fuentes de la maquinaria y los de los modulos. El diagnostico del
 *  audit es PURO —no lee el disco— y por eso el contexto se lo pone quien lo trae:
 *  aqui, el contrato, que es la puerta que lo corre. Un test que lo monte con unos
 *  valores sinteticos —una entrada sola, una guia vacia— lo muerde igual, y por eso el
 *  contexto es un objeto y no siete parametros con un valor por defecto escondido. */
const CONTEXTO = {
  catalogo: RULES,
  guide: doc,
  header: audit,
  rules: auditRules,
  autoTests: auditAutoTests,
  families: FAMILY_SOURCES,
  modulos: [...AUDIT_MODULES, ...AUDIT_SIN_API],
  libreria: MODULES,
};

/** El diagnostico y el informe con el contexto de este repo POR DELANTE, para que un
 *  test pueda preguntar por un sitio —la guia vacia, una entrada con un campo en blanco—
 *  sin declarar el resto. Lo que se le pasa gana sobre lo del contexto. */
const diagnostico = (opciones) => diagnosticoDelAudit({ ...CONTEXTO, ...opciones });
const informeDiagnostico = (opciones) => informeDelAudit({ ...CONTEXTO, ...opciones });

/** El diagnostico como lista de TEXTO, que es como lo comparan los tests. */
const ruleGaps = (opciones) => ruleGapsDelAudit({ ...CONTEXTO, ...opciones });

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

/** El numero de reglas en palabras de esa cabecera (`Doce reglas`). */
function declaredRuleWord(source) {
  return /mentira\. ([A-Z][a-z]+) reglas,/.exec(auditHeader(source))?.[1] ?? null;
}


/** La lista de CONVENCIONES de la cabecera del audit: el bloque de bullets que abre
 *  «Convenciones de documentacion que entiende», hasta la linea en blanco del comentario
 *  que lo cierra. Es la lista que dice QUE entiende el audit; null si no la trae. */
function auditConventions(header) {
  const lines = header.split('\n');
  const open = lines.findIndex((line) => line.includes('Convenciones de documentacion que entiende'));

  if (open < 0)
    return null;

  const rest = lines.slice(open + 1);
  const end = rest.findIndex((line) => /^ \* *$/.test(line));

  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** Las formas de receptor que enumera la guia en «Como el audit sigue un receptor»: el
 *  nombre en negrita que abre cada bullet —Atado, Alias, Encadenado, Fabrica—. La guia es
 *  la que las cuenta; la cabecera del audit solo tiene que nombrarlas. */
function guideReceiverForms(source) {
  const text = source.replace(/\r\n/g, '\n');
  const at = text.indexOf('### Cómo el audit sigue un receptor');

  if (at < 0)
    return [];

  const section = text.slice(at).split('\n').slice(1);
  const until = section.findIndex((line) => line.startsWith('### '));
  const body = (until < 0 ? section : section.slice(0, until)).join('\n');

  return [...body.matchAll(/^- \*\*(.+?)\*\*/gm)].map((match) => match[1]);
}

/** La tabla de reglas de la guía, como lista de LÍNEAS: desde su cabecera hasta la
 *  primera línea que ya no es de la tabla. Se localiza por ESTRUCTURA —una fila que
 *  abre con `| #`—, no por su prosa, para que una celda cambiada salga como una
 *  DIFERENCIA y no como una tabla que no encuentra. Una guía sin tabla devuelve vacía,
 *  que es justo lo que tiene que fallar. */
function documentedRuleTable(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const head = lines.findIndex((line) => /^\| *# *\|/.test(line));

  if (head < 0)
    return [];

  const rows = [];

  for (const line of lines.slice(head)) {
    if (!line.startsWith('|'))
      break;

    rows.push(line);
  }

  return rows;
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

/** Todos los numeros que el WORKFLOW escribe a mano sobre cuantas reglas tiene la
 *  puerta: el comentario de su cabecera y el nombre de su paso. Se busca el numero
 *  que precede a la palabra y no el parentesis, porque las dos formas lo llevan
 *  distinto: `Audit documentation (13 rules)` y
 *  `(tests/documentedOptions.test.js, 13 reglas)`. Castellano o Ingles, da igual:
 *  lo que no puede pasar es que uno de los dos se quede viejo. */
function declaredRuleCounts(source) {
  return [...source.matchAll(/\b(\d+)\s+(?:reglas|rules)\b/g)].map((match) => Number(match[1]));
}

/** Lo que el workflow dice de la puerta contra lo que la puerta es. El numero va
 *  escrito a mano en el yml, que es el unico sitio del contrato donde nadie lo
 *  deriva: la guia lo comprueba contra el catalogo y la cabecera del audit tambien,
 *  pero el nombre del paso no lo comprueba nadie. Un job que ejecuta trece reglas
 *  y se llama doce no rompe la puerta —la puerta esta bien—, solo miente sobre lo
 *  que ejecuta, y eso se nota cuando alguien busca un fallo en la CI y lee el
 *  nombre del paso para saber que estaba corriendo. */
function workflowCountOffenses({ workflow, count }) {
  const declarados = declaredRuleCounts(workflow);

  if (declarados.length === 0)
    return ['el workflow no dice cuantas reglas tiene la puerta'];

  return declarados
    .filter((dicho) => dicho !== count)
    .map((dicho) => `el workflow dice ${dicho} reglas y la puerta tiene ${count}`);
}

/** El comando que COMPONENTS.md documenta para correr la auditoria, a secas. */
function documentedAuditCommand(source) {
  return /`([^`]*vitest run tests\/documentedOptions\.test\.js[^`]*)`/.exec(source)?.[1] ?? null;
}

/** El arbol ```text de «Estructura del audit» de la guia, o null si no esta. */
function auditStructureTree(source) {
  const header = source.indexOf('### Estructura del audit');

  if (header < 0)
    return null;

  const fence = source.indexOf('```text', header);

  if (fence < 0)
    return null;

  const open = source.indexOf('\n', fence) + 1;
  const close = source.indexOf('```', open);

  return close < 0 ? null : source.slice(open, close);
}

/** Los modulos que ese arbol nombra en sus ramas (las lineas de rama del dibujo). */
function structureTreeModules(tree) {
  return new Set([...tree.matchAll(/[\u251c\u2514]\u2500\s+([A-Za-z][\w.-]*\.js)/g)].map((match) => match[1]));
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

/* ---------------------------------------------------------------------------
 * El barrido de markdown del paquete
 * ------------------------------------------------------------------------- */

/** Los markdown VIGILADOS del paquete: todos los `.md` que cuelgan de su raiz menos los
 *  de una dependencia (`node_modules`), una carpeta oculta (`.git`) o una copia de
 *  trabajo (`_review`, `_Deprecados`...): esos no son documentacion del paquete. Cada
 *  uno con su ruta relativa —para que la guardia diga DONDE esta el diagrama roto— y su
 *  fuente. */
function markdownFiles() {
  const files = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name.startsWith('_'))
        continue;

      const path = join(dir, entry.name);

      if (entry.isDirectory())
        walk(path);
      else if (entry.name.endsWith('.md'))
        // la ruta relativa, en barras normales: es lo que hace legible el mensaje y lo
        // que deja comparar con `docs/...` sin depender del separador del sistema
        files.push({
          relative: relative(root, path).split(sep).join('/'),
          source: readFileSync(path, 'utf-8'),
        });
    }
  };

  walk(root);

  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

/** Todos los bloques ```mermaid del paquete, cada uno con el fichero del que sale y si es
 *  un `flowchart` —la unica gramatica que conoce el chequeo de lineas; otro tipo de
 *  diagrama lo valida el parser real—. La guardia no mira solo el diagrama de la guia. */
function markdownMermaidBlocks(files = markdownFiles()) {
  return files.flatMap(({ relative: file, source }) =>
    mermaidFlowcharts(source).map((lines) => ({
      file,
      lines,
      flowchart: /^\s*flowchart\s+(TB|LR|RL|BT)\s*$/.test(lines[0] ?? ''),
    })));
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

/**
 * Las RECETAS, generadas del CATALOGO (el que compone `tests/audit/detectors.js` con las
 * entradas de los modulos de regla): la mutacion de una linea sobre el modulo real y los
 * mensajes que su detector tiene que seguir soltando. Si un detector cambia su salida, o
 * la guia cambia de ejemplo sin contar a nadie, el contrato delata cual de los dos se
 * movio: la guia no puede quedarse obsoleta en silencio.
 *
 * Una regla que sigue DOS formas de receptor trae, ademas de su caso base, el de la FABRICA
 * (`recipe.factory`, con el mismo contrato). Los dos salen de aqui, asi que la guia reproduce
 * los dos y el snapshot fija los dos: el caso de fabrica no se queda sin probar por no ser el
 * de siempre.
 */
const RULE_CASES = RULES.flatMap(({ number, detector, assertion, recipe }) => {
  const { factory, ...base } = recipe;

  return [
    { rule: number, detector, assertion, form: null, ...base },
    ...(factory == null
      ? []
      : [{ rule: number, detector, assertion, form: 'el caso de fábrica', ...factory }]),
  ];
});

/** La etiqueta de un caso en los mensajes de fallo (`regla 11 (el caso de fábrica)`). */
const caseAt = ({ rule, form }) => `regla ${rule}${form == null ? '' : ` (${form})`}`;

/* ---------------------------------------------------------------------------
 * Los bloques de mensaje de la guia, generados desde las recetas
 * ------------------------------------------------------------------------- */

/** Todos los bloques de mensaje de la guia, en el orden de las reglas —y el caso de
 *  fabrica de una regla justo detras del suyo—: el modulo y las citas de la receta con la
 *  ASERCION de la regla —que es el sufijo que su `it()` imprime, porque rules.js registra
 *  `${label}: ${assertion}`—, los tres del catalogo. */
function guideMessageBlocks() {
  return RULE_CASES.map(({ rule, assertion, module, cited }) => {
    expect(assertion, `la regla ${rule} no trae la aserción de su it()`).toBeTruthy();

    return guideMessageBlock({ module, cited }, assertion);
  });
}

/* ---------------------------------------------------------------------------
 * El contrato
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * EL LIMITE DE TAMANO: lo que la guia promete y nadie miraba
 * ------------------------------------------------------------------------- */

/** Las lineas que la guia se pone por encima a cada fichero de `components/`. */
const LIMITE_LINEAS = 300;

/** Los controles que HOY no caben en ese limite. No es una lista donde crecer:
 *  es la foto de una deuda, y una entrada que se queda sin motivo (el fichero ya
 *  cabe) es un fallo del contrato, que lo dice para que se borre. */
const EXCEPCIONES_DE_TAMANO = new Set([
  'segmented.js',
  'select.js',
  'modMatrix.js',
  'numberbox.js',
  'xypad.js',
]);

/** Cuantas lineas tiene un texto: los saltos de linea, mas el trozo final solo si
 *  no acaba en salto. Es lo que cuenta `wc -l`, que es como se cuenta de verdad;
 *  un `split('\n').length` de mas dice que un fichero de 300 lineas tiene 301 y
 *  manda en rojo a un control que esta justo en el limite. */
const linesOf = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/** Los `components/*.js` que existen, con sus lineas. `index.js` fuera: es el
 *  barrel, y su tamano lo manda cuantos controles haya, no el criterio de uno. */
function controlSizes(dir) {
  const archivos = readdirSync(dir)
    .filter((name) => name.endsWith('.js') && name !== 'index.js');

  return new Map(archivos.map((name) =>
    [name, linesOf(readOrEmpty(join(dir, name)))]));
}

/** Lo que el limite delata: una deuda sin motivo (el fichero ya cabe, o el
 *  nombre ya no existe) y un control que se ha pasado sin apuntarse. Las dos
 *  mitades en una lista porque son el mismo contrato: la lista de excepciones
 *  solo es una foto de la deuda si lo que se pasa sin estar en ella tambien
 *  salta. */
function sizeOffenses({ sizes, excepciones, limite = LIMITE_LINEAS }) {
  const off = [];

  for (const nombre of excepciones) {
    if (!sizes.has(nombre))
      off.push(`${nombre} esta en las excepciones y no existe`);
    else if (sizes.get(nombre) <= limite)
      off.push(`${nombre} ya cabe en ${sizes.get(nombre)} lineas: borralo de las excepciones`);
  }

  for (const [nombre, lineas] of sizes)
    if (!excepciones.has(nombre) && lineas > limite)
      off.push(`${nombre} esta en ${lineas} lineas y no esta en las excepciones`);

  return off;
}

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

  it('la guía enumera las formas de receptor que el audit resuelve, ni una menos ni una de más', () => {
    // El CODIGO es la referencia: `RECEIVER_FORMS` (en la capa de ejemplos) declara las
    // formas que el audit resuelve, cada una con su testigo y la prueba de que lo resuelve,
    // asi que la tabla no puede mentir. La guia tiene que enumerarlas TODAS —y ninguna que
    // el audit no resuelva—: anadir al codigo una forma sin tocar la seccion del receptor
    // es lo unico que no pasa, y es justo lo que se quiere.
    const forms = RECEIVER_FORMS.map(({ name }) => name);

    expect(forms.length, 'el audit declara menos formas de las que resuelve').toBeGreaterThanOrEqual(5);

    for (const { name, module, usage, sees } of RECEIVER_FORMS)
      expect(
        sees(module + usage, [{ label: 'receptor.js', source: module }]),
        `el testigo de «${name}» no sale del audit como esa forma`,
      ).toBe(true);

    expect(guideReceiverForms(doc), 'la guía no enumera las formas que el audit resuelve').toEqual(forms);
  });

  it('la cabecera del audit nombra cada forma de receptor que el audit resuelve', () => {
    // La otra mitad, en el fichero de tests: la lista de convenciones de la cabecera tiene
    // que nombrar las mismas formas, para que quien lee la cabecera sepa que caminos
    // entiende el audit. Las tres listas —codigo, guia y cabecera— las ata este contrato,
    // asi que ninguna se queda atras en silencio.
    const conventions = auditConventions(auditHeader(audit));

    expect(conventions, 'la cabecera del audit no tiene la lista de convenciones').not.toBeNull();

    for (const { name } of RECEIVER_FORMS)
      expect(
        shouted(conventions).includes(shouted(name)),
        `la cabecera del audit no nombra la forma «${name}»`,
      ).toBe(true);
  });

  it('el árbol de estructura nombra todos los módulos del audit (no se queda atrás)', () => {
    // El arbol enumeraba su numero de tests ("69 unitarios"), una cifra que envejece con
    // cada unitario nuevo —igual que le pasaba al conteo de reglas antes de su contrato—.
    // Se quito la cifra y, en su lugar, el contrato exige que el arbol NOMBRE cada pieza
    // que hay: anadir un modulo sin tocar su rama ya no pasa en silencio.
    const tree = auditStructureTree(doc);

    expect(tree, 'la guía no tiene el árbol de «Estructura del audit»').not.toBeNull();

    const listed = structureTreeModules(tree);
    const modules = readdirSync(join(here, 'audit'))
      .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'));

    expect(modules.length, 'el árbol no puede proteger una carpeta vacía').toBeGreaterThanOrEqual(8);

    for (const name of modules)
      expect(listed.has(name), `el árbol no nombra ${name}`).toBe(true);
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

  it('la cabecera del audit lleva las trece identidades del catálogo, en orden', () => {
    // La cabecera del audit es un comentario que abre cada regla con su `N. TÍTULO:`. Esa
    // identidad se GENERA desde el catálogo —el número y el título en mayúsculas—, y lo
    // que va detrás del dos puntos es la explicación de la cabecera. El bloque entero se
    // compara línea a línea: una identidad que sobra, una que falta o una que cambia de
    // sitio dejan la cabecera completa y con las trece reglas dentro, y por eso el
    // recorrido tiene que ser exacto, no un `includes` por regla.
    const generated = ruleHeaderLines();
    const written = auditHeaderLines(audit).map(({ head }) => head);
    const at = generated.findIndex((line, index) => written[index] !== line);
    const igual = at < 0 && written.length === generated.length;

    expect(igual, igual ? '' : [
      `la cabecera del audit no lleva las identidades del catálogo: ${written.length} `
        + `líneas escritas, ${generated.length} generadas`,
      ...generated.map((line, index) => written[index] === line ? null
        : `  línea ${index + 1}—el catálogo dice «${line}» y la cabecera dice `
          + `«${written[index] ?? '(nada)'}»`),
    ].filter((linea) => linea != null).join('\n')).toBe(true);
  });
  it('los límites honestos de la cabecera son los del catálogo, uno por regla', () => {
    // La sección de límites es la que más envejece: un detector se estrecha o se ensancha
    // y el `describe`, la tabla y la cabecera siguen saliendo del catálogo solos, mientras
    // el límite se queda prometiendo en voz alta lo que la regla ya no cumple. Por eso el
    // límite también es de la entrada, y el contrato compara el bloque ENTERO —regla a
    // regla, con el texto reunido tras el envolverlo— en vez de conformarse con que los
    // trece números estén: un límite viejo cambia una línea, y ahí tiene que salir.
    const generated = RULES.map(({ number, limit }) => ({ number, limit }));
    const written = headerLimitLines(audit);
    const at = generated.findIndex(({ number, limit }, index) => {
      const one = written[index];

      return one == null || one.number !== number || one.limit !== limit;
    });
    const igual = at < 0 && written.length === generated.length;

    expect(igual, igual ? '' : [
      `los límites de la cabecera no son los del catálogo: ${written.length} reglas `
        + `escritas, ${generated.length} generadas`,
      ...generated.map(({ number, limit }, index) => {
        const one = written[index];

        return one != null && one.number === number && one.limit === limit ? null
          : `  la ${number}—el catálogo dice «${limit}» y la cabecera dice `
            + `«${one?.limit ?? '(nada)'}»`;
      }),
    ].filter((linea) => linea != null).join('\n')).toBe(true);
  });

  it('el bloque de límites que falta entero es un hueco, no trece, y el bullet suelto sigue siendo de su regla', () => {
    // Sin el bloque, lo que falta es la SECCIÓN de la cabecera, y decirlo trece veces con
    // la misma frase no le ahorra una línea a quien lee el diagnóstico ni le enseña qué se
    // ha perdido de golpe: por eso se agrupa y nombra las trece. Pero un bullet suelto,
    // con el bloque en su sitio, sí es de su regla y se nombra sola —si no, el agrupar
    // taparía justo el caso que el contraste de prosa no ve—.
    const sinCabecera = ruleGaps({ header: '' });
    const delBloque = sinCabecera.filter((gap) => gap.startsWith('el bloque «Límites honestos»'));
    const conLimite = RULES
      .filter(({ limit }) => limiteConTexto(limit))
      .map(({ number }) => number);

    expect(delBloque).toEqual([
      `el bloque «Límites honestos» no está en la cabecera del audit: falta de una vez `
        + `el límite de ${conLimite.length} reglas (${conLimite.join(', ')})`,
    ]);
    expect(sinCabecera.filter((gap) => gap.includes('límite honesto en la cabecera')))
      .toEqual([]);

    // y el bullet que falta de un bloque que sí está sale solo, con su número
    const tres = RULES.find(({ number }) => number === 3);
    const suBullet = headerLimitLines(audit)
      .find(({ number }) => number === tres.number)
      .lineas.join('\n');
    const sinBullet = audit.replace(suBullet, '');

    expect(ruleGaps({ header: sinBullet })).toEqual([
      `regla 3 (${tres.name}): falta el límite honesto en la cabecera, o no es el que `
        + `genera el catálogo`,
    ]);

    // Y un limite DECLARADO y en blanco no entra en el agrupado, que ya tiene su propio
    // aviso de descuido: un hueco no son dos en el mismo diagnostico, una vez como limite
    // de su regla en la lista de las trece y otra como el descuido de esa misma regla. Sin
    // el `sinBordes` del filtro, un limite de espacios pasaba por no ser la cadena vacia y
    // salia en las dos listas —y el arreglo de un hueco de espacios, que es borrar la linea
    // que se puso de mas, se leia como el arreglo del bloque entero de la cabecera.
    const enBlanco = RULES.map((rule) => rule.number === tres.number
      ? { ...rule, limit: '   ' }
      : rule);
    const delBloqueEnBlanco = ruleGaps({ catalogo: enBlanco, header: '' });
    const sinLaTres = conLimite.filter((uno) => uno !== tres.number);

    expect(delBloqueEnBlanco.filter((gap) => gap.startsWith('el bloque «Límites honestos»')))
      .toEqual([
        `el bloque «Límites honestos» no está en la cabecera del audit: falta de `
          + `una vez el límite de ${sinLaTres.length} reglas (${sinLaTres.join(', ')})`,
      ]);
    expect(delBloqueEnBlanco.filter((gap) => gap.includes('en blanco')))
      .toEqual([`regla 3 (${tres.name}): el límite honesto está declarado y en blanco`]);
  });
  it('el límite honesto no es la prosa de la tabla con otras palabras', () => {
    // Son dos campos de la misma entrada y para dos sitios distintos: la tabla cuenta qué
    // persigue la regla, el bloque de la cabecera cuenta qué NO juzga. El modo de que uno
    // se lo lleve al otro es pegarlo, y entonces nada se rompe —dos campos, dos cadenas sin
    // barra, la tabla generándose sola—: el catálogo queda tan completo como antes y la
    // guía igual de guapa. Por eso el guard es de PALABRAS, y no de que sean iguales: dos
    // textos que se parecen mucho sin ser el mismo son el otro modo de tener un texto.
    const repetidas = RULES
      .map(({ number, about, limit }) => ({ number, racha: sharedProse(about, limit) }))
      .filter(({ racha }) => racha !== '');

    expect(repetidas, repetidas.map(({ number, racha }) => `  la ${number} repite «${racha}»`).join('\n'))
      .toEqual([]);

    // el corte está medido, no elegido a ojo: el solape más largo del catálogo son seis
    // palabras —la 13 dice `una entrada de un solo parámetro` en las dos prosas, porque es
    // la misma excepción contada desde dentro y desde fuera— y ahí no hay empalme que
    // nadie quiera cortar: son menos de la mitad del texto más corto. Un párrafo pegado
    // se come el campo entero, y ese sale.
    for (const { about, limit } of RULES)
      expect(sharedProse(about, limit)).toBe('');

    // Y el diagnóstico lo nombra. Con el límite de la 3 ampliado a su propia prosa la
    // entrada sigue estando ENTERA —los dos campos están, ninguno está vacío y ninguno
    // lleva una barra— y el aviso sale igual, y sale solo él: lo que se repite no es un
    // sitio que falte, es un texto que se ha pegado al de al lado.
    const tres = RULES.find(({ number }) => number === 3);
    const pegado = `${tres.about}; y además cuenta lo que no lee`;
    const catalogo = RULES.map((rule) => rule.number === tres.number
      ? { ...rule, limit: pegado }
      : rule);
    const gaps = ruleGaps({ catalogo });

    expect(gaps).toEqual([
      `regla 3 (${tres.name}): el límite honesto repite la prosa de la tabla `
        + `(«${recorte(sharedProse(tres.about, pegado))}»): son dos textos distintos`,
    ]);
  });
  it('un campo en blanco no es un campo que falta: los cuatro lo dicen con su nombre', () => {
    // Hay dos formas de que un campo de prosa no esté, y no son la misma cosa. La primera
    // es la de una entrada a medio declarar: el campo no está, hay trabajo por hacer, y el
    // aviso lo dice como falta de catálogo —y el resto de sitios de esa regla también
    // salen, porque el arreglo es la lista entera—. La segunda es un campo declarado y
    // vacío, que es un descuido: la línea se puso y su contenido no. Con el aviso de la
    // primera, quien lo leyera iría a buscar un texto entero donde lo único que hay es un
    // hueco, y además el hueco se multiplicaba por cada sitio que depende de ese texto.
    // Los cuatro campos se quejan por su nombre, y ninguno de los dos casos se mezcla con
    // el otro: de espacios es el mismo descuido que en blanco.
    const campos = [
      ['title', 'el título está declarado y en blanco', 'el catálogo no le da título'],
      ['assertion', 'la aserción está declarada y en blanco',
        'el catálogo no le da aserción (el it() por módulo)'],
      ['about', 'la prosa de la tabla está declarada y en blanco',
        'el catálogo no le da la prosa de la tabla'],
      ['limit', 'el límite honesto está declarado y en blanco',
        'el catálogo no le da límite honesto'],
    ];
    const tres = RULES.find(({ number }) => number === 3);

    for (const [campo, enBlanco, falta] of campos) {
      const conBlanco = RULES.map((rule) => rule.number === tres.number
        ? { ...rule, [campo]: '   ' }
        : rule);
      const sinCampo = RULES.map((rule) => rule.number === tres.number
        ? Object.fromEntries(Object.entries(rule).filter(([uno]) => uno !== campo))
        : rule);

      // el descuido es UN aviso, y no se multiplica por los sitios que dependen del texto
      expect(ruleGaps({ catalogo: conBlanco }), campo).toEqual([
        `regla 3 (${tres.name}): ${enBlanco}`,
      ]);
      // y el que no está sale como falta de catálogo, con la lista de sitios detrás
      expect(ruleGaps({ catalogo: sinCampo }), campo)
        .toContain(`regla 3 (${tres.name}): ${falta}`);
    }

    // y con la cabecera vacía el descuido tampoco se multiplica: el bloque entero falta, y
    // eso es un aviso —el agrupado—, no un límite por regla
    const enBlanco = RULES.map((rule) => rule.number === tres.number
      ? { ...rule, about: '   ' }
      : rule);

    expect(ruleGaps({ catalogo: enBlanco, header: '' })
      .filter((gap) => gap.includes('falta el límite honesto en la cabecera')))
      .toEqual([]);
  });
  it('una receta con el módulo o una cita en blanco es un descuido, no una receta muda', () => {
    // La receta es prosa de la guía con otro nombre: su módulo y sus citas se imprimen en
    // el bloque de mensaje, así que un hueco ahí tiene los dos avisos de siempre. Y la
    // trampa es la misma, con las dos mitades del contrato: una entrada a medio declarar
    // sale con la lista entera de sitios, y un descuido sale solo, sin los sitios que
    // dependen de su texto. Lo que faltaba era la mitad de la primera, la del hueco: una
    // cita en blanco seguía contando como cita —el bloque se generaba con un hueco
    // dentro y de su ausencia salía otro aviso—, y un módulo declarado y vacío se
    // contaba como una receta que no dice el módulo. El caso de fábrica es otra receta,
    // con su bloque, y corta igual —y solo el suyo: el descuido de una receta no calla lo
    // que no es suyo.
    const once = RULES.find(({ number }) => number === 11);
    const at = `regla ${once.number} (${once.name})`;
    const catalogoDe = (receta) => RULES.map((rule) => (rule.number === once.number
      ? { ...rule, recipe: receta(rule.recipe) }
      : rule));
    const sinCampo = (receta, campo) => Object.fromEntries(
      Object.entries(receta).filter(([uno]) => uno !== campo));
    const ultima = once.recipe.cited.length + 1;

    // cada hueco dice SU nombre y sale solo, sin el bloque de mensaje detrás
    expect(ruleGaps({ catalogo: catalogoDe((r) => ({ ...r, module: '  ' })) }), 'modulo')
      .toEqual([`${at}: el módulo de la receta está declarado y en blanco`]);
    expect(ruleGaps({ catalogo: catalogoDe((r) => ({ ...r, cited: [...r.cited, ''] })) }),
      'cita').toEqual([`${at}: la cita ${ultima} de la receta está declarada y en blanco`]);
    expect(ruleGaps({
      catalogo: catalogoDe((r) => ({ ...r, factory: { ...r.factory, module: '' } })),
    }), 'modulo de fabrica').toEqual([
      `${at}: el módulo del caso de fábrica de la receta está declarado y en blanco`,
    ]);
    expect(ruleGaps({
      catalogo: catalogoDe((r) => ({ ...r, factory: { ...r.factory, cited: ['  '] } })),
    }), 'cita de fabrica').toEqual([
      `${at}: la cita 1 del caso de fábrica de la receta está declarada y en blanco`,
    ]);

    // y una lista con dos huecos son dos descuidos, no uno: el numero los separa, que es
    // lo que hay que arreglar, y quien lee el aviso sabe cuál de los dos mensajes falta
    expect(ruleGaps({ catalogo: catalogoDe((r) => ({ ...r, cited: [' ', ''] })) }), 'dos')
      .toEqual([
        `${at}: la cita 1 de la receta está declarada y en blanco`,
        `${at}: la cita 2 de la receta está declarada y en blanco`,
      ]);

    // y el que NO declara nada sigue siendo trabajo pendiente, con su propio texto: son
    // dos arreglos distintos, buscar el texto entero o borrar la línea que se puso de más
    expect(ruleGaps({ catalogo: catalogoDe((r) => sinCampo(r, 'module')) }), 'sin modulo')
      .toContain(`${at}: la receta no dice el módulo real`);
    expect(ruleGaps({ catalogo: catalogoDe((r) => ({ ...r, cited: [] })) }), 'sin citas')
      .toContain(`${at}: la receta no cita ningún mensaje`);
    expect(ruleGaps({
      catalogo: catalogoDe((r) => ({ ...r, factory: sinCampo(r.factory, 'module') })),
    }), 'fabrica sin modulo')
      .toContain(`${at}: el caso de fábrica de la receta no dice el módulo real`);
    expect(ruleGaps({
      catalogo: catalogoDe((r) => ({ ...r, factory: { ...r.factory, cited: [] } })),
    }), 'fabrica sin citas')
      .toContain(`${at}: el caso de fábrica de la receta no cita ningún mensaje`);

    // y el descuido de la receta no silencia el de su caso de fábrica, que es otra receta:
    // los dos huecos salen, cada uno con su nombre, y ninguno multiplica al otro
    expect(ruleGaps({
      catalogo: catalogoDe((r) => ({ ...r, module: '', factory: { ...r.factory, module: '' } })),
    }), 'los dos').toEqual([
      `${at}: el módulo de la receta está declarado y en blanco`,
      `${at}: el módulo del caso de fábrica de la receta está declarado y en blanco`,
    ]);
  });
  it('la prosa de la receta tiene los mismos tres guards que la de la entrada', () => {
    // Son los mismos dos campos opcionales de la entrada —qué demuestra y hasta dónde—
    // pero sobre la RECETA, y la guía los imprime pegados a su bloque de mensaje. Los tres
    // guards de la entrada tienen que venir con ellos: un campo declarado y en blanco es un
    // descuido y sale solo, dos textos pegados son un empalme, y una frase que ya enseña
    // otra receta es la misma frase dos veces. Y lo que NO es guard: que no esté declarado
    // no avisa de nada, porque opcional significa opcional.
    const tres = RULES.find(({ number }) => number === 3);
    const cuatro = RULES.find(({ number }) => number === 4);
    const once = RULES.find(({ number }) => number === 11);
    const con = (recipe) => RULES.map((rule) => rule.number === tres.number
      ? { ...rule, recipe }
      : rule);
    const huecosDe = (recipe) => ruleGaps({ catalogo: con(recipe) });
    const de = (texto, otro) => `«${recorte(sharedProse(texto, otro))}»`;

    // 1. EN BLANCO, y solo el descuido: sin texto no hay bloque que buscar, y el de mensaje
    // no se calla —que sale del modulo y de las citas, no de estos campos.
    expect(huecosDe({ ...tres.recipe, about: '   ' }))
      .toEqual([`regla 3 (${tres.name}): la prosa de la receta está declarada y en blanco`]);
    expect(huecosDe({ ...tres.recipe, limit: '  ' }))
      .toEqual([`regla 3 (${tres.name}): el límite de la receta está declarado y en blanco`]);
    // y sin los dos la guía no imprime nada de la receta, que es lo que declara el hueco
    expect(huecosDe({ ...tres.recipe, about: null, limit: null })).toEqual([]);

    // 2. PROSA PEGADA: los dos campos de la receta entre si, que es donde la guía los
    // imprime pegados, y contra los de la entrada, que salen en la misma pantalla.
    const pegadas = huecosDe({ ...tres.recipe, limit: tres.recipe.about });

    expect(pegadas.filter((gap) => gap.includes('repite'))).toEqual([
      `regla 3 (${tres.name}): la prosa de la receta repite el límite de la receta `
        + `(${de(tres.recipe.about, tres.recipe.about)}): son dos textos distintos`,
    ]);
    expect(huecosDe({ ...tres.recipe, about: tres.limit })
      .filter((gap) => gap.includes('repite'))).toEqual([
      `regla 3 (${tres.name}): la prosa de la receta repite el límite honesto `
        + `(${de(tres.limit, tres.limit)}): la guía lo dice dos veces`,
    ]);

    // 3. CITA CRUZADA: con las citas de SU bloque, que es el mismo guard de empalme de
    // antes, y con las de las recetas de al lado, que son dos guías enseñando la misma
    // frase. El caso propio va sobre la 11 porque su cita es larga: el guard de empalme
    // pide una racha Y que se coma media parte del texto mas corto, y una cita de una
    // sola palabra —como las de la mayoría de reglas— no llega ni a la racha.
    const conDe = (numero, recipe) => RULES.map((rule) => rule.number === numero
      ? { ...rule, recipe }
      : rule);
    const larga = once.recipe.cited[0];

    expect(ruleGaps({ catalogo: conDe(once.number, { ...once.recipe, about: larga }) })
      .filter((gap) => gap.includes('las repite'))).toEqual([
      `regla 11 (${once.name}): la cita repite la prosa de la receta `
        + `(${de(larga, larga)}): el bloque de la guía las repite`,
      // y tambien la de su caso de fabrica, que comparte la cola con la del caso base
      `regla 11 (${once.name}): la cita (el caso de fabrica) repite la prosa de la receta `
        + `(${de(once.recipe.factory.cited[0], larga)}): el bloque de la guía las repite`,
    ]);
    const citaAjena = larga;
    expect(huecosDe({ ...tres.recipe, limit: citaAjena })
      .filter((gap) => gap.includes('la guía lo repite'))).toEqual([
      `regla 3 (${tres.name}): el límite de la receta dice lo mismo que la cita de `
        + `regla 11 (${once.name}) (${de(citaAjena, citaAjena)}): `
        + `la guía lo repite`,
      `regla 3 (${tres.name}): el límite de la receta dice lo mismo que la cita de `
        + `regla 11 (${once.name}) (el caso de fabrica) `
        + `(${de(once.recipe.factory.cited[0], citaAjena)}): `
        + `la guía lo repite`,
    ]);
    expect(huecosDe({ ...tres.recipe, about: cuatro.recipe.limit })
      .filter((gap) => gap.includes('misma frase'))).toEqual([
      `regla 3 (${tres.name}): la prosa de la receta dice lo mismo que el de `
        + `regla 4 (${cuatro.name}) (${de(cuatro.recipe.limit, cuatro.recipe.limit)}): `
        + `dos reglas con la misma frase`,
    ]);
  });
  it('un descuido en un campo no silencia los avisos que no dependen de su texto', () => {
    // Donde va el corte del descuido es parte del contrato y no una decision de
    // implementacion: la receta y la flecha se declaran con sus propias piezas y no se leen
    // de la prosa de la entrada, asi que un hueco en el `about` no puede callarlos. Si los
    // callara, el arreglo de un campo vacio salia como `no tiene receta`, que es OTRO
    // arreglo —y ademas falso, porque la receta si esta— y quien lo ejecutara no arreglaria
    // nada. Los dos lados se montan a la vez, con la prosa en blanco en los dos: la 3 con
    // la receta rota —le falta `mutate`— y una regla de mentira sin flecha, que el
    // diagrama no le puede dar porque ese numero no existe.
    const tres = RULES.find(({ number }) => number === 3);
    // la regla de mentira es una COPIA de la 3, asi que sin esta limpieza su prosa seria
    // la misma que la de la 3 y el guard de prosa cruzada —que es lo que tiene que pasar
    // con dos recetas de verdad— saltaria aqui por una coincidencia del test
    const sinFlecha = {
      ...tres,
      number: 14,
      name: `${tres.name}Inventada`,
      about: '   ',
      recipe: { ...tres.recipe, about: null, limit: null },
    };
    const conHueco = RULES.map((rule) => rule.number === tres.number
      ? { ...rule, about: '   ', recipe: { ...rule.recipe, mutate: 'no es una función' } }
      : rule);
    const gaps = ruleGaps({ catalogo: [...conHueco, sinFlecha] });

    // cada hueco habla de lo suyo y sale junto a lo demas, en el orden en que se miran
    expect(gaps.filter((gap) => gap.startsWith('regla 3'))).toEqual([
      `regla 3 (${tres.name}): la prosa de la tabla está declarada y en blanco`,
      `regla 3 (${tres.name}): el catálogo no le da receta (mutate y safe)`,
    ]);

    // y en la de mentira solo falta su bullet, que es de otro campo: la cabecera no tiene
    // el limite de una regla que no existe. Los sitios que SI dependen del texto —el
    // encabezado, la fila, la linea de cabecera y el bloque de mensaje— no salen, que es
    // justo lo que el test de los cuatro campos comprueba desde el otro lado.
    expect(gaps.filter((gap) => gap.startsWith('regla 14'))).toEqual([
      `regla 14 (${sinFlecha.name}): la prosa de la tabla está declarada y en blanco`,
      `regla 14 (${sinFlecha.name}): falta el límite honesto en la cabecera, o no es el `
        + `que genera el catálogo`,
      `regla 14 (${sinFlecha.name}): no tiene flecha en el diagrama`,
    ]);
  });
  it('una flecha declarada y en blanco es un descuido, no una regla sin flecha', () => {
    // La flecha es el quinto campo que la entrada declara uno a uno, y el unico que no es
    // prosa: la declara con el numero de la flecha del diagrama y ahi se dibuja. El hueco es
    // el de siempre —la linea se puso y su contenido no— y lo que trae de nuevo es a que
    // hueco se parece: a una regla SIN flecha, que se arregla de otra manera, porque una es
    // cablear una entrada y la otra borrar la linea que se puso de mas.
    const tres = RULES.find(({ number }) => number === 3);
    const conFlecha = (edge) => RULES.map((rule) => rule.number === tres.number
      ? { ...rule, edge }
      : rule);

    // en blanco, y de espacios, que es el mismo descuido: sale SOLO, y el aviso de que no
    // tiene flecha calla, que no es otro hueco sino consecuencia de este
    for (const hueco of ['', '   '])
      expect(ruleGaps({ catalogo: conFlecha(hueco) }), `flecha ${JSON.stringify(hueco)}`)
        .toEqual([`regla 3 (${tres.name}): la flecha de la regla está declarada y en blanco`]);

    // y la que no tiene flecha de verdad sigue con su propio texto, que es del SITIO: una
    // regla a la que el diagrama no le da ninguna. Su receta no trae prosa, que la del 3
    // seria la misma prosa con otro numero delante.
    const fuera = { ...tres, number: 14, name: `${tres.name}Inventada`,
      recipe: { ...tres.recipe, about: null, limit: null } };
    const catalogo = RULES.map((rule) => rule.number === tres.number ? fuera : rule);

    expect(ruleGaps({ catalogo }).filter((gap) => gap.includes('flecha')))
      .toEqual([`regla 14 (${fuera.name}): no tiene flecha en el diagrama`]);
  });
  it('una clave declarada dos veces es un descuido, y no se ve en el objeto', () => {
    // En JavaScript la ULTIMA clave repetida gana y la anterior no deja ni un rastro en
    // el objeto ya evaluado: el catalogo sale entero, la guia imprime el texto de la que
    // gana, y el resto del diagnostico da verde. Por eso el aviso se mira en el FUENTE
    // de la entrada, y no en el objeto —que ya no lo sabe—.
    const tres = RULES.find(({ number }) => number === 3);
    const at = `regla ${tres.number} (${tres.name})`;
    // El fuente de la entrada tal y como lo declara su modulo, que es lo que el guard
    // lee: busca el literal por el nombre de la entrada, no el objeto del catalogo.
    const fuente = readOrEmpty(join(here, 'audit', 'rules', `${tres.name}.js`));
    const salida = (texto) => ruleGaps({
      catalogo: RULES, families: new Map([[`${tres.name}Rule`, texto]]) })
      .filter((gap) => gap.includes('clave'));

    // Una clave repetida en la ENTRADA y otra en la RECETA: dos avisos del mismo
    // descuido, cada uno con las lineas donde se repite, que es lo que hay que borrar.
    const entrada = fuente.replace('  assertion:',
      `  about: 'la prosa repetida',\n  assertion:`);
    const receta = fuente.replace('  recipe: {', `  recipe: {\n    about: 'la prosa repetida',`);
    // Las dos lineas del aviso son las de las dos CLAVES repetidas, no las del TEXTO
    // repetido: la que se inserta aqui trae el suyo y la que ya estaba en el fuente trae
    // el suyo, asi que un `lineaDe` del texto nuevo solo la encontraria una vez. Y la
    // receta se cuenta desde su `recipe:`, porque `about:` sale antes —el de la entrada— y
    // sin ese arranque el numero de linea seria el de la otra clave, que no se repite.
    const dosVeces = (donde, texto, arranque = 0) => `${at}: la clave about de ${donde} `
      + `está declarada 2 veces (líneas ${lineaDe(texto, 'about:', 0, arranque)}, `
      + `${lineaDe(texto, 'about:', 1, arranque)})`;

    expect(salida(entrada)).toEqual([dosVeces('la entrada', entrada)]);
    expect(salida(receta)).toEqual([dosVeces('la receta', receta,
      receta.indexOf('recipe: {'))]);

    // Y el aviso NO se lleva por delante el resto, que es la diferencia con un campo en
    // blanco: aqui el sitio se imprime con la clave que GANA, asi que lo que depende
    // del texto sigue siendo cierto y no se calla.
    const huecos = diagnostico({ catalogo: RULES,
      families: new Map([[`${tres.name}Rule`, receta]]) })
      .filter(({ texto }) => texto.includes(tres.name));

    expect(huecos.filter(({ clase }) => clase === 'descuido')).toHaveLength(1);
    expect(huecos.filter(({ clase }) => clase !== 'descuido')).toEqual([]);

    // Y el catalogo de verdad, que no repite ninguna clave, calla: si el guard delatara
    // algo aqui seria thirteen veces en cada corrida.
    expect(salida(fuente)).toEqual([]);
  });
  it('una clave repetida en un detector sale por su ruta, con sus dos lineas', () => {
    // Las ENTRADAS ya tienen su aviso, una por regla y diciendo si lo que se repite es la
    // entrada o su receta; esto es el RESTO del audit —las capas, la maquinaria y el
    // generador—, que no pertenece a ninguna regla. El hueco lo nombra por el modulo, que
    // es donde esta la linea que sobra, y el sitio es el mismo descuido porque el arreglo
    // es el mismo: por eso el resumen los cuenta juntos sin distinguirlos.
    const salida = (modulos) => ruleGaps({ modulos }).filter((gap) => gap.includes('la clave'));
    // El ANCLA tiene que seguir donde estaba: si el fuente crece y el patron no casa, el
    // modulo se queda sin repetir, el guard no llega a mirarlo y el fallo sale como
    // «faltan huecos», que es un sintoma que este test no quiere tener.
    const repetir = (label, ancla, repetida) => AUDIT_MODULES.map((modulo) => {
      if (modulo.label !== label)
        return modulo;

      const source = modulo.source.replace(ancla, repetida);

      expect(source, `el ancla de ${label} no casa`).not.toBe(modulo.source);

      return { ...modulo, source };
    });
    const fuenteDe = (modulos, label) => modulos.find((modulo) => modulo.label === label).source;

    // Una clave repetida en una CONSTANTE de una capa…
    const arriba = repetir('records.js', `  string: 'string',${'\n'}`,
      `  string: 'string',${'\n'}  string: 'string',${'\n'}`);
    const arribaTexto = fuenteDe(arriba, 'records.js');

    expect(salida(arriba)).toEqual([
      `tests/audit/records.js: la clave string está declarada 2 veces (líneas `
      + `${lineaDe(arribaTexto, `string: 'string'`)}, `
      + `${lineaDe(arribaTexto, `string: 'string'`, 1)})`,
    ]);

    // …y otra dentro de un literal ANIDADO —el objeto que devuelve un `map` dentro de una
    // funcion—, que es donde se acaba mirando solo el nivel de arriba: el aviso sale igual,
    // con las dos lineas de donde esta.
    const dentro = repetir('metaGuard.js', `    name: mark[2],${'\n'}`,
      `    name: mark[2],${'\n'}    name: mark[2],${'\n'}`);
    const dentroTexto = fuenteDe(dentro, 'metaGuard.js');

    expect(salida(dentro)).toEqual([
      `tests/audit/metaGuard.js: la clave name está declarada 2 veces (líneas `
      + `${lineaDe(dentroTexto, 'name: mark[2]')}, `
      + `${lineaDe(dentroTexto, 'name: mark[2]', 1)})`,
    ]);

    // Y una clave repetida en un modulo de `rules/` NO sale por aqui: de esas se ocupa el
    // aviso por regla, que ademas esta vivo con el catalogo de verdad, y mirarlas aqui
    // tambien las contaria dos veces en el mismo diagnostico.
    const enLaRegla = repetir('rules/unreadEntryKeys.js', '  assertion:',
      `  about: 'la prosa repetida',${'\n'}  assertion:`);

    expect(salida(enLaRegla)).toEqual([]);

    // Y el audit de verdad calla: el guard esta mirando quince modulos en cada
    // diagnostico y no tiene nada que decir de ninguno.
    expect(salida(AUDIT_MODULES)).toEqual([]);
  });
  it('todos los pares de prosa pegados salen en la misma pasada, no uno por viaje', () => {
    // El diagnóstico de los sitios que faltan da la lista entera de una vez, y el de las
    // prosas pegadas tiene que dar la suya: si solo puede decir un par por llamada,
    // quien limpia va viendo los fallos de uno en uno, y con trece reglas y cuatro pares
    // posibles por entrada eso son viajes de sobra. Aquí se montan cuatro pares pegados
    // de golpe —dos de prosa en su entrada y dos citas que se pisan entre reglas— y tienen
    // que salir los cuatro en la misma lista, sin que el segundo espere a que se arregle
    // el primero.
    const [tres, siete, uno, dos, nueve, once] = [3, 7, 1, 2, 9, 10]
      .map((number) => RULES.find((rule) => rule.number === number));
    const conLaProsaPega = (rule) => ({ ...rule, limit: `${rule.about}, otra vez` });
    const conLaCitaAjena = (rule, otra) => ({
      ...rule,
      recipe: { ...rule.recipe, cited: [...otra.recipe.cited] },
    });
    const catalogo = RULES.map((rule) => {
      if (rule.number === tres.number || rule.number === siete.number)
        return conLaProsaPega(rule);

      if (rule.number === uno.number)
        return conLaCitaAjena(rule, nueve);

      if (rule.number === dos.number)
        return conLaCitaAjena(rule, once);

      return rule;
    });
    const empalmes = ruleGaps({ catalogo })
      .filter((gap) => gap.includes('repite') || gap.includes('lo mismo'));

    expect(empalmes, empalmes.join('\n')).toHaveLength(4);

    // los de su PROPIA entrada van en orden de catalogo —que es como se lee la guia, y el
    // aviso se puede seguir con el dedo sobre el documento— y los de entre reglas cierran,
    // que esos son un barrido del documento entero y no de una entrada
    expect(empalmes.slice(0, 2).map((gap) => gap.slice(0, 8)))
      .toEqual(['regla 3 ', 'regla 7 ']);
    expect(empalmes.slice(2).map((gap) => gap.slice(0, 8)))
      .toEqual(['regla 1 ', 'regla 2 ']);
    expect(empalmes.filter((gap) => gap.includes('la prosa de la tabla'))).toHaveLength(2);
    expect(empalmes.filter((gap) => gap.includes('guía serían el mismo'))).toHaveLength(2);
  });
  it('las citas de dos recetas no pueden ser el mismo texto, o la guía enseña dos bloques iguales', () => {
    // El bloque de mensaje de la guía tiene dos líneas: la aserción del `it()` y el volcado
    // con la cita, y la cita es REAL —la imprime el detector cuando se le da el módulo
    // mutado—, así que no se reescribe para callar un contrato. Lo que sí se pega sin
    // querer es el texto de otra receta: dos reglas enseñando el mismo mensaje son dos
    // bloques que son el mismo con dos títulos, y con trece reglas en el documento el que
    // se lee al lado no dice de quién es. El caso de fábrica se salta a propósito: es esa
    // misma regla sobre otro módulo, y el mensaje lo imprime el mismo detector.
    const pares = [];

    for (const [i, una] of RULE_CASES.entries())
      for (const otra of RULE_CASES.slice(i + 1)) {
        if (una.rule === otra.rule)
          continue;

        for (const cita of una.cited)
          for (const gemela of otra.cited) {
            const racha = sharedProse(cita, gemela);

            if (racha !== '')
              pares.push(`  la ${una.rule}${una.form} y la ${otra.rule}${otra.form} `
                + `dicen «${racha}»`);
          }
      }

    expect(pares.join('\n')).toBe('');

    // Y el diagnóstico muerde. Con la 1 citando el texto de la 9 —lo que pasa al copiar un
    // mensaje que ya estaba puesto— su entrada sigue completa, la cita es real y el bloque
    // de la guía sale igual: lo único que cambia es que dos bloques son el mismo.
    const uno = RULES.find(({ number }) => number === 1);
    const nueve = RULES.find(({ number }) => number === 9);
    const catalogo = RULES.map((rule) => rule.number === uno.number
      ? { ...rule, recipe: { ...rule.recipe, cited: [...nueve.recipe.cited] } }
      : rule);
    const gaps = ruleGaps({ catalogo });

    // dos avisos y no uno: el bloque de la guia de la 1 ya no encaja con su cita, y
    // ademas su cita es la de la 9 —que es como se entra en este aviso, pegando un
    // mensaje que ya estaba puesto en el sitio de otro—
    expect(gaps).toEqual([
      `regla 1 (${uno.name}): falta el bloque de mensaje en la guía`,
      expect.stringContaining(
        `regla 1 (${uno.name}): su cita dice lo mismo que la de regla 9 (${nueve.name})`),
    ]);
    expect(gaps[1]).toContain('sus dos bloques de la guía serían el mismo');
  });
  it('cada bullet de límites se parte al ancho que declara su entrada, y solo al suyo', () => {
    // La prosa del bloque ya se compara regla a regla, y al volver a unir los dos lados
    // sale el mismo texto aunque el bullet este partido de otra manera —así que un bullet
    // rehecho a ojo, o con la caja movida, pasaba—. Ahora el bloque se GENERA, y lo que se
    // compara son las LÍNEAS, con el ancho que declara cada entrada: la caja común son
    // 76 columnas, y la 6 no cabe en ella sin dejar «contra esta» deacolado, así que la
    // ensancha para ella sola. Un límite que no cabe no puede estar pidiendo que los otros
    // doce se muevan con él, y menos aún que el que se ensancha sea el que manda.
    const generated = ruleLimitLines();
    const written = headerLimitBlock(audit);
    const at = generated.findIndex((line, index) => written[index] !== line);
    const igual = at < 0 && written.length === generated.length;

    expect(igual, igual ? '' : [
      `los bullets de límites no están partidos como los parte el catálogo: `
        + `${written.length} líneas escritas, ${generated.length} generadas`,
      ...generated.map((line, index) => written[index] === line ? null
        : `  la ${index + 1}—el catálogo la parte en «${line.trim()}» y la cabecera en `
          + `«${written[index]?.trim() ?? '(nada)'}»`),
    ].filter((linea) => linea != null).join('\n')).toBe(true);

    // el ancho sale de la entrada, y solo de ella: la caja común, salvo que la regla diga
    // otra cosa, y la 6 dice otra cosa
    const seis = RULES.find(({ number }) => number === 6);
    const una = RULES.find(({ number }) => number === 1);

    expect(limitWidthOf(una)).toBe(LIMIT_WIDTH);
    expect(limitWidthOf(seis)).toBeGreaterThan(LIMIT_WIDTH);

    // y se nota: en la caja común el bullet de la 6 son tres líneas y la última es
    // de once columnas; en la suya son dos que se leen enteras
    expect(limitBulletLines({ ...seis, limitWidth: LIMIT_WIDTH }).length).toBe(3);
    expect(limitBulletLines(seis).length).toBe(2);

    // Y el diagnóstico lo nombra. Con la 6 devuelta a la caja común la entrada sigue
    // completa —el límite es el mismo, el bullet entero y la prosa igual— y sale su
    // aviso, y sale solo él: lo que está mal no es un texto, es dónde acaba cada línea.
    const catalogo = RULES.map((rule) => rule.number === seis.number
      ? { ...rule, limitWidth: undefined }
      : rule);

    expect(ruleGaps({ catalogo })).toEqual([
      `regla 6 (${seis.name}): el bullet del límite no está partido como lo parte el `
        + `catálogo (ancho ${LIMIT_WIDTH}): la cabecera lo parte en otro sitio, o la `
        + `entrada ya no declara ese limitWidth`,
    ]);
  });
  it('la tabla de la guía es la del catálogo, línea a línea', () => {
    // La tabla no se escribe a mano: sus filas salen del catálogo, la prosa de «Qué
    // persigue» incluida. El contrato la compara ENTERA y EN ORDEN, que es lo que hace
    // falta: fila a fila, una prosa puede ser la de otra regla y seguir «en la tabla»
    // sin que nadie lo note, y una fila cambiada de sitio deja la tabla completa.
    const generated = ruleTable();
    const written = documentedRuleTable(doc);
    const at = generated.findIndex((line, index) => written[index] !== line);
    const igual = at < 0 && written.length === generated.length;

    expect(igual, igual ? '' : [
      `la tabla de la guía no es la del catálogo: ${written.length} líneas escritas, `
        + `${generated.length} generadas`,
      ...generated.map((line, index) => written[index] === line ? null
        : `  línea ${index + 1}—el catálogo pone\n    ${line}\n  la guía pone\n`
          + `    ${written[index] ?? '(nada)'}`),
    ].filter((linea) => linea != null).join('\n')).toBe(true);
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

  it('el workflow nombra la puerta con el número de reglas que tiene', () => {
    const count = auditedRules(audit).length;

    expect(declaredRuleCounts(workflow).length, 'el yardaje: el yml declara su número')
      .toBeGreaterThanOrEqual(2);
    expect(workflowCountOffenses({ workflow, count })).toEqual([]);
  });

  it('el workflow que cita la guía es el que existe', () => {
    const cited = [...doc.matchAll(/`([\w-]+\.yml)`/g)].map((match) => match[1]);

    expect(cited).toContain(basename(WORKFLOW));
    expect(cited.filter((name) => !existsSync(join(root, '.github', 'workflows', name)))).toEqual([]);
  });

  it('los diagramas Mermaid de todo markdown del paquete se pueden dibujar', () => {
    const blocks = markdownMermaidBlocks();
    const flowcharts = blocks.filter(({ flowchart }) => flowchart);

    // Si el barrido no encuentra diagramas, la validacion no mira nada: es otra forma de
    // quedarse ciego. La guia de la auditoria trae dos por si sola.
    expect(flowcharts.length).toBeGreaterThanOrEqual(2);

    for (const { file, lines } of flowcharts)
      expect(mermaidLineErrors(lines), `${file}:\n${lines.join('\n')}`).toEqual([]);
  });

  it('el barrido de markdown llega a docs/ y a los README, y no a las copias de trabajo', () => {
    const names = markdownFiles().map(({ relative: name }) => name);

    // no mira un vacio, y llega a donde vive la documentacion del paquete
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toContain('COMPONENTS.md');
    expect(names.some((name) => name.endsWith('README.md'))).toBe(true);
    expect(names.some((name) => name.startsWith('docs/'))).toBe(true);

    // ni las tripas de una dependencia ni una copia de trabajo (`_review` y sus
    // node_modules): esas no son documentacion del paquete, y un `.md` ajeno roto no
    // puede poner esta suite en rojo
    expect(names.filter((name) => /(^|\/)(node_modules|\.|_)/.test(name))).toEqual([]);
  });

  it('el barrido del markdown muerde: un diagrama roto en CUALQUIER fichero se delata', async () => {
    const [overview] = mermaidFlowcharts(doc);
    const broken = markdownMermaidBlocks([{
      relative: 'docs/OTRO.md',
      source: `\u0060\u0060\u0060mermaid\n${[...overview, '  DOC ==>|"13 — sin destino"|'].join('\n')}\n\u0060\u0060\u0060\n`,
    }]);

    expect(broken.map(({ file }) => file)).toEqual(['docs/OTRO.md']);
    expect(mermaidLineErrors(broken[0].lines).join('\n'))
      .toContain('no es ni declaracion de nodo ni arista');

    await expect(mermaid.parse(broken[0].lines.join('\n'))).rejects.toThrow();
  });

  it('la cabecera numerada de una regla sale del catálogo, con su inicial en mayúscula', () => {
    expect(ruleHeading({ number: 3, title: 'aridad', name: 'arityMismatches' }))
      .toBe('**3. Aridad** (`arityMismatches`).');
  });

  it('la fila de la tabla sale del catálogo, entera: número, título y prosa', () => {
    // La fila generada no es el título: es la fila ENTERA que la guía imprime, con el
    // número en la celda de la tabla del repo (`| 3  |`, `| 12 |`) y con la prosa de
    // «Qué persigue», que sale de la misma entrada del catálogo. Por eso el contrato la
    // compara tal cual en vez de leer la celda y conformarse con que el texto case.
    const regla = (number, title, about) => ({ number, title, about });

    expect(ruleTableRow(regla(3, 'aridad', 'una aridad')))
      .toBe('| 3  | Aridad | una aridad |');
    expect(ruleTableRow(regla(12, 'registros prometidos', 'cada clave se usa')))
      .toBe('| 12 | Registros prometidos | cada clave se usa |');
    expect(ruleTableRows([regla(1, 'uno', 'la primera'), regla(2, 'dos', 'la segunda')]))
      .toEqual(['| 1  | Uno | la primera |', '| 2  | Dos | la segunda |']);

    // y la tabla ENTERA, con su cabecera y su separador, que es lo que el contrato
    // compara línea a línea: todas las filas del catálogo, en su orden.
    expect(ruleTable([regla(1, 'uno', 'la primera')])).toEqual([
      '| #  | Regla | Qué persigue |',
      '|----|-------|--------------|',
      '| 1  | Uno | la primera |',
    ]);
  });

  it('cada regla lee las dos voces de la flecha que el diagrama le asigna', () => {
    for (const { number, name } of RULES) {
      const edge = edgeOfRule(number);

      expect(edge, `la regla ${number} no tiene flecha en el diagrama`).toBeDefined();

      if (edge == null)
        continue;

      for (const voice of new Set([edge.from, edge.to]))
        expect(
          detectorVoices(name, FAMILY_SOURCES).has(voice),
          `la regla ${number} (${name}) no lee la voz ${voice} de su flecha`,
        ).toBe(true);
    }
  });

  it('cada regla del catálogo tiene todos sus sitios (el diagnóstico los dice de una vez)', () => {
    // Anadir una regla empieza por su entrada en el catalogo, y el resto son sitios que
    // tienen que seguirla: el detector, el titulo y la asercion de la entrada, su receta,
    // su flecha, el encabezado y la fila de la guia, la linea de la cabecera y su bloque
    // de mensaje. Este contrato es UNA puerta con la lista entera, para que una regla a
    // medio cablear no se descubra sitio a sitio.
    const informe = informeDiagnostico();

    expect(informe.lineas, informe.lineas.length === 0 ? '' : `\n${informe.lineas.map((linea) => ` - ${linea}`).join('\n')}\n`)
      .toEqual([]);
  });

  it('el diagnostico cierra con un bloque resumen que separa los tres arreglos', () => {
    // El texto de un hueco dice QUE falta, no QUE hay que hacer: `no le da receta` y `falta
    // el encabezado` son los dos una entrada a medio cablear, pero el primero se arregla en
    // el catalogo y el segundo en la guia, y un descuido no se arregla en ninguno de los dos
    // —es borrar una linea que se puso de mas—. El resumen esta para eso: cuantos hay de
    // cada clase y que ENTRADAS son, en un bloque al final, porque la lista de arriba ya
    // esta entera y se lee de uno en uno.
    const tres = RULES.find(({ number }) => number === 3);
    const cuatro = RULES.find(({ number }) => number === 4);
    const cinco = RULES.find(({ number }) => number === 5);
    const catalogo = RULES.map((rule) => {
      if (rule.number === tres.number)
        return { ...rule, about: '   ' };
      if (rule.number === cuatro.number)
        return { ...rule, recipe: { ...rule.recipe, mutate: null } };

      return rule;
    });
    const sinCabecera = audit.replace(ruleHeaderLine(cinco), '');

    // una entrada por clase, montadas a la vez: el descuido, la que no se cableo y el hueco
    // de un sitio de una entrada que si esta entera
    expect(informeDiagnostico({ catalogo, header: sinCabecera }).lineas).toEqual([
      `regla 3 (${tres.name}): la prosa de la tabla está declarada y en blanco`,
      `regla 4 (${cuatro.name}): el catálogo no le da receta (mutate y safe)`,
      `regla 5 (${cinco.name}): falta la línea de la cabecera (5. ${shouted(cinco.title)})`,
      'resumen del diagnóstico: 1 descuido, 1 entrada a medio declarar (1 hueco) '
        + `y 1 hueco de sitio`,
      `  descuidos · la prosa de la tabla (1): regla 3 (${tres.name})`,
      `  a medio declarar · la receta (1): regla 4 (${cuatro.name})`,
      `  sitios · la línea de la cabecera (1): regla 5 (${cinco.name})`,
    ]);

    // y lo que de verdad agrupa es POR SITIO: vaciar la guía deja a las trece reglas sin
    // sus cuatro sitios de la guía, y eso no son cincuenta y tres trabajos sino cuatro,
    // uno por sitio, cada uno con su numero. La linea de la cabecera NO sale porque la
    // cabecera de verdad sigue ahi —que es justo lo que hace el recuento útil: dice qué
    // falta, no solo cuánto—, y el bloque del caso de fábrica sale con su entrada, que
    // es lo único de la regla que lo declara.
    const sinGuia = informeDiagnostico({ guide: '' }).lineas
      .filter((linea) => linea === '' || linea.startsWith('resumen') || linea.startsWith('  '));

    expect(sinGuia[0]).toBe('resumen del diagnóstico: 0 descuidos, 0 entradas a medio declarar '
      + `y ${RULES.length * 4 + 1} huecos de sitio`);
    expect(sinGuia.slice(1)).toEqual([
      `  sitios · el encabezado de la guía (${RULES.length})`,
      `  sitios · la fila de la tabla (${RULES.length})`,
      `  sitios · el bloque de mensaje (${RULES.length})`,
      `  sitios · la prosa de la receta en la guía (${RULES.length})`,
      '  sitios · el bloque de mensaje del caso de fábrica (1): '
        + `regla 11 (${RULES[10].name})`,
    ]);

    // y la media regla entra por ENTRADA, no por hueco: son once lineas de una sola, y el
    // parentesis dice cuantas para que no se lea como once reglas distintas. Como sus once
    // sitios son once distintos y solo caben ocho, el resto sale contado.
    const families = new Map([
      ['alcanzado', 'export function alcanzado(modules) {\n  return modules;\n}\n'],
      ['fantasma', 'export function fantasma(modules) {\n  return modules;\n}\n'],
    ]);
    const resumen = resumenDiagnostico(diagnostico({
      guide: '', header: '',
      rules: "import { alcanzado } from './detectors.js';\n",
      autoTests: "import { alcanzado, fantasma } from './detectors.js';\n",
      families,
    }));

    expect(resumen[0]).toContain('0 descuidos, 1 entrada a medio declarar '
      + `(${HALF_SITES.length} huecos) y `);
    expect(resumen[1])
      .toBe('  a medio declarar · número de regla (1): regla a medio declarar (fantasma)');
    expect(resumen.filter((linea) => linea.startsWith('  a medio declarar')))
      .toHaveLength(TOP_SITIOS);
    expect(resumen[TOP_SITIOS + 1])
      .toBe(`  … y ${HALF_SITES.length - TOP_SITIOS} sitios más de a medio declarar`);

    // y un diagnostico limpio no lleva resumen: no hay nada que resumir, y la lista vacia
    // es justo lo que la puerta del CI compara
    expect(informeDiagnostico().lineas).toEqual([]);
  });
  it('las tres piezas de una regla salen de su entrada y no pueden separarse', () => {
    // Las tres piezas que el audit repite de cada regla —su encabezado de la guía, la
    // línea de su cabecera y su fila de la tabla— se derivan de la MISMA entrada del
    // catálogo. Por eso no pueden separarse: si la entrada se mueve, las tres se mueven
    // con ella, y si a una le falta su sitio en la guía, el diagnóstico nombra esa pieza y
    // solo esa, con las otras doce enteras.
    const piezasDe = (regla) => [ruleHeading(regla), ruleHeaderLine(regla), ruleTableRow(regla)];
    const regla = RULES.find(({ number }) => number === 5);
    const antes = piezasDe(regla);
    const despues = piezasDe({ ...regla, title: 'una regla movida' });

    // ninguna de las tres se queda quieta, y las tres siguen nombrando la MISMA regla
    expect(antes.filter((pieza, at) => pieza === despues[at]),
      'una pieza no se ha movido con la entrada: las tres no vienen del mismo sitio')
      .toEqual([]);
    for (const pieza of despues)
      expect(pieza, `una pieza no nombra la regla que la genera: ${pieza}`).toContain('5');

    // y el catalogo entero trae las tres piezas de las trece reglas
    for (const una of RULES)
      for (const pieza of piezasDe(una))
        expect(pieza, `una pieza de la regla ${una.number} sale vacia`).not.toBe('');

    // la garantia es de diagnostico, no de buena fe: sin la fila de la regla 12 sale la
    // fila, y las otras doce —sus encabezados, sus lineas de cabecera y sus filas— quedan
    // enteras, porque el hueco es de una pieza y no de la regla entera
    const sinFila = ruleGaps({ guide: doc.replace(ruleTableRow(RULES[11]), '') });

    expect(sinFila).toEqual([
      `regla 12 (${RULES[11].name}): falta la fila de la tabla, o no es la que genera el catalogo`,
    ]);

    // lo mismo con la linea de la cabecera, que es la tercera pieza: quitarla de la
    // cabecera del audit tambien sale sola, y no arrastra a las otras doce
    const numero = 12;
    const linea = ruleHeaderLine(RULES[11]);
    // la linea se borra ENTERA, no se la deja en blanco: un ` *` a secas es la linea en
    // blanco que cierra la lista numerada de la cabecera, y si se colara aqui se llevaria
    // por delante las reglas siguientes —que estan enteras— y el hueco seria de mas.
    const cabeza = audit.replace(new RegExp('^(\\s*\\*\\s+)' + linea.replace(/\./g, '\\.') + '.*\n', 'm'), '');

    expect(cabeza).not.toBe(audit);
    expect(ruleGaps({ header: cabeza })).toEqual([
      `regla ${numero} (${RULES[11].name}): falta la línea de la cabecera (${linea})`,
    ]);
  });
  it('el diagnóstico muerde: media regla cableada sale con sus huecos, no solo con el primero', () => {
    // una guia sin ningun sitio: el diagnostico tiene que nombrar los sitios que ocupa cada
    // regla —los TRES de la guia (encabezado, fila y bloque), su linea de cabecera y su
    // limite honesto—, para las trece reglas, de una vez; y encima el bloque de la prosa de
    // la receta, que solo existe si la receta declara alguno, y el del caso de fabrica, que
    // solo lo tiene la regla que lo declara. El bloque entero de limites de la cabecera no
    // se cuenta trece veces: es UN hueco, el de la seccion, asi que va aparte.
    const empty = ruleGaps({ guide: '', header: '' });
    const factories = RULES.filter(({ recipe }) => recipe?.factory != null).length;
    const prosas = RULES.filter(({ recipe }) => recipeProseLines({ recipe }).length > 0).length;
    const agrupados = empty.filter((gap) => gap.startsWith('el bloque «Límites honestos»'));

    expect(prosas).toBe(RULES.length);
    expect(empty.length).toBe(RULES.length * 4 + prosas + factories + agrupados.length);
    expect(agrupados).toHaveLength(1);
    expect(empty.filter((gap) => !agrupados.includes(gap))
      .every((gap) => /^regla \d+ \(\w+\): /.test(gap))).toBe(true);

    // y con UN solo sitio quitado, sale ese y solo ese
    const rule12 = RULES.find((rule) => rule.number === 12);

    expect(ruleGaps({ guide: doc.replace(ruleHeading(rule12), '') })).toEqual([
      `regla 12 (${rule12.name}): falta el encabezado en la guía (${ruleHeading(rule12)})`,
    ]);

    // y la tabla: la fila se exige GENERADA y ENTERA, prosa incluida. Quitándole la fila
    // al catálogo, la guía se queda con doce filas y con una prosa menos, y sale la fila
    // que falta —no el numero, que sigue estando, ni el titulo, que es el mismo—.
    const row12 = ruleTableRow(rule12);

    expect(ruleGaps({ guide: doc.replace(row12, '') })).toEqual([
      `regla 12 (${rule12.name}): falta la fila de la tabla, o no es la que genera el catalogo`,
    ]);

    // y ademas en su sitio: dos filas cambiadas de lugar dejan la tabla COMPLETA (celdas,
    // titulos y numeros siguen siendo los que son), asi que hace falta el orden. Con trece
    // reglas, el aviso dice cual va donde va cual.
    const rule11 = RULES.find((rule) => rule.number === 11);
    const lines = doc.replace(/\r\n/g, '\n').split('\n');
    const at11 = lines.findIndex((line) => line.startsWith(ruleTableRow(rule11)));
    const at12 = lines.findIndex((line) => line.startsWith(ruleTableRow(rule12)));

    [lines[at11], lines[at12]] = [lines[at12], lines[at11]];

    expect(ruleGaps({ guide: lines.join('\n') })).toEqual([
      'las filas de la tabla están fuera de orden (la 12 va donde va la 11)',
    ]);
  });

  it('el diagnóstico muerde por el otro lado: media regla con auto-tests sale con sus sitios', () => {
    // El caso que hasta aqui pasaba inadvertido, y que no se puede montar con el catalogo
    // real (hoy no hay ninguno): un detector con sus auto-tests escritos —el meta-guard de
    // exports lo ve EJERCITADO, que es justo lo que hace que su autor lo de por terminado—
    // al que la maquinaria de las reglas no alcanza, de modo que NADIE lo corre contra el
    // inventario. Con fuentes sinteticas: dos nombres declarados, uno que la entrada de las
    // reglas alcanza y otro que solo aparece en el import de los auto-tests.
    const families = new Map([
      ['alcanzado', 'export function alcanzado(modules) {\n  return modules;\n}\n'],
      ['fantasma', 'export function fantasma(modules) {\n  return modules;\n}\n'],
    ]);
    const both = "import { alcanzado, fantasma } from './detectors.js';\n";

    expect(halfDeclaredRules({ catalogo: RULES,
      rules: "import { alcanzado } from './detectors.js';\n",
      autoTests: both, families })).toEqual(['fantasma']);

    // y el caso de control: en cuanto la entrada de las reglas lo alcanza, deja de delatarse
    expect(halfDeclaredRules({ catalogo: RULES, rules: both, autoTests: both, families }))
      .toEqual([]);

    // y por el diagnostico sale ENTERO, con los mismos sitios que una declarada, uno por
    // linea, para que el arreglo sea una lista y no un misterio
    const half = ruleGaps({ guide: '', header: '',
      rules: "import { alcanzado } from './detectors.js';\n",
      autoTests: both, families }).filter((gap) => gap.startsWith('regla a medio declarar'));

    // el numero de sitios no se escribe: es la lista, y anadir uno a la lista tiene que
    // notarse aqui como un sitio mas y no como un fallo.
    expect(half).toHaveLength(HALF_SITES.length);
    expect(half[0]).toBe('regla a medio declarar (fantasma): le falta número de regla');
    expect(half.every((gap) => gap.startsWith('regla a medio declarar (fantasma): le falta '))).toBe(true);
  });

  it('el barrido de las medias reglas no se mira en un grafo vacio', () => {
    // El delate solo vale si el grafo se construye de verdad. Un minimo del inventario por
    // lado (los nombres que se declaran, los que la entrada de las reglas importa, los que
    // los auto-tests ejercitan) y un TECHO: un cierre que alcanza TODO lo declarado no
    // puede delatar a nadie, y se leeria como que el catalogo esta completo.
    const declared = FAMILY_SOURCES.size;
    const roots = [...new Set([...importedNames(auditRules, './detectors.js'),
      ...RULES.map((rule) => rule.name)])];
    const reached = reachableFrom(roots, FAMILY_SOURCES);

    expect(declared, 'los nombres declarados en el audit han bajado mucho').toBeGreaterThanOrEqual(200);
    expect(importedNames(auditRules, './detectors.js').length, 'la entrada de las reglas no importa nada del barrel')
      .toBeGreaterThanOrEqual(10);
    expect(importedNames(auditAutoTests, './detectors.js').length, 'los auto-tests no importan nada del barrel')
      .toBeGreaterThanOrEqual(30);
    expect(reached.size, 'el cierre no llega ni a las reglas que si son reglas').toBeGreaterThanOrEqual(RULES.length * 2);
    expect(reached.size, 'el cierre alcanza TODO lo declarado: asi no puede delatar a nadie')
      .toBeLessThan(declared);
    expect(halfDeclaredRules({ catalogo: RULES, rules: auditRules,
      autoTests: auditAutoTests, families: FAMILY_SOURCES })).toEqual([]);
  });

  it('el bloque «De un vistazo» es el que el audit genera, línea a línea', () => {
    // El bloque se deriva del catálogo —la flecha de cada regla y el lema de su arista— y
    // el contrato lo vuelve a derivar para compararlo. Se busca por SU TÍTULO y no por su
    // posición: `charts[0]` compararía el primer mermaid de la página, que es el que
    // toque, y un diagrama nuevo por delante se llevaría la comparación sin que nadie lo
    // note. Y la comparación es línea a línea, porque el bloque entero cambia entero: una
    // arista con un lema retocado a mano es una línea distinta, y se ve cual.
    const generated = overviewDiagramLines();
    const written = overviewBlock(doc);

    expect(written, 'la guía no tiene el bloque «De un vistazo» del audit').not.toBeNull();
    expect(written.length, 'el bloque del diagrama tiene otras líneas').toBe(generated.length);

    for (const [at, line] of generated.entries())
      expect(written[at], `la línea ${at + 1} del bloque no es la del catálogo`).toBe(line);
  });

  it('los bloques mermaid de todo el paquete los valida el parser REAL de mermaid', async () => {
    // El chequeo de lineas de arriba conoce la gramatica que estos diagramas usan; este no
    // conoce nada: se los traga el parser de verdad, el mismo que GitHub renderiza.
    const blocks = markdownMermaidBlocks();

    expect(blocks.length).toBeGreaterThanOrEqual(2);

    for (const { file, lines, flowchart } of blocks) {
      const text = lines.join('\n');
      const parsed = await mermaid.parse(text);

      expect(parsed, `${file}:\n${text}`).toBeTruthy();

      if (flowchart)
        expect(String(parsed.diagramType ?? parsed), `${file}:\n${text}`).toMatch(/^flowchart/);
    }
  });

  it('una línea rota en un diagrama de la guía no pasa (la guardia puede fallar)', async () => {
    const [overview] = mermaidFlowcharts(doc);
    const broken = [...overview, '  DOC ==>|"13 — sin destino"|'].join('\n');

    await expect(mermaid.parse(broken)).rejects.toThrow();
  });

  it('los fallos que cita la guía siguen saliendo de los detectores', () => {
    // Cada ejemplo de la guia se REPRODUCE: se aplica la mutacion documentada al modulo
    // real y el detector tiene que soltar el mensaje citado, letra a letra. Si un
    // detector cambia su salida, o la guia cambia de ejemplo sin contar a nadie, este
    // test dice cual de los dos se movio.
    // Cada regla con su caso base, y las que siguen una fabrica, con el suyo detras.
    expect([...new Set(RULE_CASES.map(({ rule }) => rule))])
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(RULE_CASES.length, 'ninguna regla declara el caso de fábrica de su receta')
      .toBeGreaterThan(RULES.length);

    for (const { rule, form, module, detector, mutate, cited } of RULE_CASES) {
      const source = moduleSource(module);

      expect(source, `${module} no esta entre los modulos auditados`).toBeDefined();
      expect(detector(mutate(source)), caseAt({ rule, form })).toEqual(cited);

      for (const message of cited)
        expect(doc.includes(message), `la guia ya no cita el mensaje de la regla ${rule}`).toBe(true);
    }
  });

  it('los bloques de mensaje de la guía se generan desde las recetas (snapshot)', () => {
    // La guia y las recetas no pueden describir dos fallos distintos: los bloques que
    // imprime la guia se GENERAN de RULE_CASES (modulo, citas y el `it()` de rules.js)
    // y quedan fijados aqui. Un cambio de receta o de titulo sale como diff del
    // snapshot, y el test de abajo obliga a regenerar la guia a mano.
    expect(guideMessageBlocks()).toMatchSnapshot();
  });

  it('los detectores no falsean ante una variación válida (caso control)', () => {
    // El test de arriba prueba que el detector MUERDE ante un fallo. Este prueba lo
    // contrario: una variación documentalmente VÁLIDA del mismo módulo no puede soltar
    // nada. Si una regla se ensancha de más —el fallo clásico de una auditoría—, la
    // variación válida deja de dar [] y el contrato dice cual se movió. La variación
    // tiene que CAMBIAR el fuente: si el `replace` no encaja y devuelve el original,
    // el control no probaría nada y este test lo delata.
    for (const { rule, form, module, detector, safe } of RULE_CASES) {
      const source = moduleSource(module);
      const at = caseAt({ rule, form });

      expect(source, `${module} no esta entre los modulos auditados`).toBeDefined();
      expect(typeof safe, `${at} no trae caso valido`).toBe('function');

      const varied = safe(source);

      expect(varied, `la variacion valida de ${at} no cambia el fuente`).not.toEqual(source);
      expect(detector(varied), `${at}: falso positivo ante una variacion valida`).toEqual([]);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Auto-tests del contrato: sus detectores tienen que MORDER
 * ------------------------------------------------------------------------- */

describe('el límite de tamaño que promete la guía', () => {
  it('los controles que se pasan están fichados, y solo se pasan los fichados', () => {
    const sizes = controlSizes(join(root, 'components'));

    // El yardaje: sin esto, una carpeta vacía o una lista de excepciones vacía
    // dan un contrato en verde que no ha mirado nada.
    expect(sizes.size, 'el yardaje: no hay controles que medir').toBeGreaterThanOrEqual(10);
    expect(EXCEPCIONES_DE_TAMANO.size, 'el yardaje: nadie ha fichado la deuda')
      .toBeGreaterThanOrEqual(1);

    expect(sizeOffenses({ sizes, excepciones: EXCEPCIONES_DE_TAMANO })).toEqual([]);
  });
});

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

  it('lee la lista de convenciones de la cabecera y las formas del receptor', () => {
    const header = '/**\n * Convenciones de documentacion que entiende:\n'
      + ' *   - una forma de fabrica: `const x = createY(el)`;\n'
      + ' *     con su continuacion;\n'
      + ' *\n * Trampas: nada;\n */\n';

    expect(auditConventions(header)).toContain('una forma de fabrica');
    expect(auditConventions(header)).toContain('con su continuacion');
    expect(auditConventions(header)).not.toContain('Trampas');
    expect(auditConventions(' * nada\n')).toBeNull();

    const guide = '# Guia\n\n### Cómo el audit sigue un receptor\n\n'
      + '- **Atado** — x\n- **Fábrica** — y\n\n### Otra\n- **No** — z\n';

    expect(guideReceiverForms(guide)).toEqual(['Atado', 'Fábrica']);
    expect(guideReceiverForms('# sin la seccion\n')).toEqual([]);
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

  it('la guardia del workflow muerde: el número viejo y el número que no está', () => {
    const yml = '      - name: Audit documentation (12 rules)\n'
      + '# la auditoria (tests/documentedOptions.test.js, 13 reglas)\n';

    expect(workflowCountOffenses({ workflow: yml, count: 13 }))
      .toEqual(['el workflow dice 12 reglas y la puerta tiene 13']);
    expect(declaredRuleCounts(yml)).toEqual([12, 13]);
    expect(workflowCountOffenses({ workflow: 'on: push\n', count: 13 }))
      .toEqual(['el workflow no dice cuantas reglas tiene la puerta']);
  });

  it('la guardia del tamaño muerde: el control que se pasa y la deuda ya pagada', () => {
    const sizes = new Map([
      ['corto.js', 120], ['justo.js', 300], ['al-limite.js', 301], ['largo.js', 412],
    ]);

    // El limite son 300 lineas: 300 cabe y 301 no. Los numeros van en el mapa ya
    // contados, que es lo que hace `controlSizes` con `linesOf` sobre el disco. El que se pasa sin apuntarse
    // es el offense, y el que esta justo en el limite no aparece en la lista
    // aunque lo sirva de cerca.
    expect(sizeOffenses({ sizes, excepciones: new Set() })).toEqual([
      'al-limite.js esta en 301 lineas y no esta en las excepciones',
      'largo.js esta en 412 lineas y no esta en las excepciones',
    ]);

    // Y las dos formas de deuda sin motivo: el fichero que ya cabe y el nombre
    // que ya no existe. Sin esto, la lista crece sola y no dice nada.
    expect(sizeOffenses({
      sizes: new Map([['corto.js', 120]]),
      excepciones: new Set(['corto.js', 'fantasma.js']),
    })).toEqual([
      'corto.js ya cabe en 120 lineas: borralo de las excepciones',
      'fantasma.js esta en las excepciones y no existe',
    ]);
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
    const rules = [
      { number: 1, name: 'unusedMembers', title: 'uno', edge: 0 },
      { number: 2, name: 'undocumentedReads', title: 'dos', edge: 1 },
    ];

    expect(overviewDiagramLines(rules)).toEqual([
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
