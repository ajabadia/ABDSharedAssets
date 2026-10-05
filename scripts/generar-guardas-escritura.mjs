// scripts/generar-guardas-escritura.mjs
// LOS TRES GUARDAS DE ESCRITURA, GENERADOS DESDE UN SOLO SITIO.
//
// ─────────────────────────────────────────────────────────────────────────────
// EL PROBLEMA QUE ESTE FICHERO EXISTE PARA RESOLVER
//
// Hay tres `guardasDeEscritura.test.js`, uno por repo:
//
//     ABDEep/scripts/guardasDeEscritura.test.js
//     ABDMS2000/WebUI/tests/guardasDeEscritura.test.js
//     ABDNeural/WebUI/tests/guardasDeEscritura.test.js
//
// El motor de los tres —el que separa los scripts que escriben, propaga la
// condicion por los imports, y decide si el flag de la cabecera existe de verdad en
// el codigo— es el MISMO. La cabecera de cada uno explica por que se copio: los
// repos son independientes y un guard que importara del hermano dejaria de vigilar
// justo cuando ese hermano no esta clonado, que es cuando entra un script nuevo.
//
// Esa razon sigue siendo buena, y por eso los ficheros siguen siendo copias
// MATERIALIZADAS y no imports. Lo que no era buena es la consecuencia: al ser tres
// copias, cada mejora del motor hay que acordarla tres veces, y de esa omision sale
// algo asi:
//
//     el guard de ABDNeural aprende a ver PowerShell; los otros dos no se enteran, y
//     mientras tanto `manage.ps1` y `update_version.ps1` escriben en ficheros
//     VERSIONADOS sin que nadie mire.
//
// Que ya ha pasado. Asi que el modelo es: UN motor aqui, tres configuraciones, y
// un `--check` que compara lo commiteado contra lo que sale de aqui. Si alguien
// edita uno de los tres a mano, el `--check` lo dice nombrando el fichero; si cambia
// el motor, los tres se regeneran y ninguno se queda atras.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE GENERAR Y NO IMPORTAR
//
// Un import desde ABDSharedAssets seria el diseño elegante y el equivocado aqui:
// cuando el hermano no esta clonado —que es justo el caso de un clon de una sola
// rama, y el mas comun— el guard no se cae, se salta. Y un guard que se salta en
// silencio es peor que no tener guard. El fichero generado es plano, sin
// dependencias, y se lee entero sin este fichero delante.
//
// ─────────────────────────────────────────────────────────────────────────────
// USO
//   node scripts/generar-guardas-escritura.mjs              # regenera los tres
//   node scripts/generar-guardas-escritura.mjs --repo ABDEep
//   node scripts/generar-guardas-escritura.mjs --check      # NO escribe. Sal 1 si alguno se separo.
//   node scripts/generar-guardas-escritura.mjs --help
//
// La ruta de cada repo se calcula como `<este repo>/../<repo>`, el layout del
// monorepo. `--repo NOMBRE=RUTA` dice otro sitio para uno:
//   node scripts/generar-guardas-escritura.mjs --repo ABDEep=/ruta/al/otro

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizAssets = path.resolve(aqui, '..');
const monorepo = path.resolve(raizAssets, '..');

// ─────────────────────────────────────────────────────────────────────────────
// LAS LISTAS. Esto es lo unico que cambia entre repos.
//
// Un `.ps1` NO cuenta como escritura porque la convencion de flags de PowerShell no
// es la de Node, y mezclarlas haria que el test aceptase dos lenguos de contrato a
// la vez. Eso lo dice el guard de ABDNeural desde que sus dos `.ps1` tienen `-Check`
// y el motor ya sabe leerlo; los otros dos siguen sin mirar PowerShell, asi que su
// `esScript` lo deja fuera.
//
// Cada vez que se de `-Check` a los `.ps1` de un repo, se pone aqui `ps: true` y se
// ve lo que hay. No es un flag para dejar de mirar: es una lista de lo que cada repo
// ha decidido mirar, escrita en un sitio.
// ─────────────────────────────────────────────────────────────────────────────

const ESCRIBE_JS = [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'copyFileSync', 'cpSync', 'createWriteStream',
  'rmSync', 'rm', 'unlinkSync', 'rmdirSync', 'renameSync',
  'mkdirSync', 'mkdir', 'writeSync',
];

const ESCRIBE_PS = [
  'Set-Content', 'Add-Content', 'Out-File', 'New-Item',
  'Remove-Item', 'Copy-Item', 'Move-Item', 'Rename-Item',
  'WriteAllText', 'WriteAllBytes', 'WriteAllLines', 'Export-Clixml',
];

const FLAGS_JS = [
  { cabecera: '--check', codigo: '--check' },
  { cabecera: '--dry-run', codigo: '--dry-run' },
  { cabecera: '--force', codigo: '--force' },
];

// `-Force` NO es un flag de "no escribir" en PowerShell, por dos motivos que se
// refuerzan: significa lo CONTRARIO —`Remove-Item -Recurse -Force` es «borralo sin
// preguntar»— y es sufijo de media docena de cmdlet, asi que cualquier `.ps1` que
// mencione uno en su cabecera se declararia escritor con un flag que no ha
// declarado. En Node `--force` si es un flag propio, y por eso sigue en los suyos.
const FLAGS_PS = [
  { cabecera: '-Check', codigo: '$Check' },
  { cabecera: '-DryRun', codigo: '$DryRun' },
  { cabecera: '-WhatIf', codigo: '$WhatIf' },
];

// LAS RUTAS DE ESTE BLOQUE VAN CON BARRA, SIEMPRE, Y NO CON `path.join`.
//
// MEDIDO, y no es hipotesis: el rojo de CI eran tres guardas "DESFASADO" en un
// repo donde el motor no habia cambiado. La causa es que `carpetas` se hornea
// LITERAL en el fichero generado con `JSON.stringify`, asi que el separador del
// sistema que genera se queda escrito dentro del guard. El commiteado tenia
// `path.join(RAIZ, "WebUI\\scripts")` porque se genero en Windows; el runner de
// Ubuntu produce `path.join(RAIZ, "WebUI/scripts")` y el `--check` ve un fichero
// distinto. Y el fallo solo aparece en CI, porque en local los dos lados se
// generan en la misma maquina y se compensan solos.
//
// Que `path.join` este aqui no era un descuido de estilo: en Linux `WebUI/scripts`
// y en Windows `WebUI\\scripts` apuntan al mismo directorio. El problema no es la
// ruta que se abre, es la que se ESCRIBE DENTRO del fichero. Un fichero
// generado tiene que ser el mismo en las dos plataformas, y para eso la ruta
// tiene que estar en la notacion que las dos comparten.
const REPOS = {
  ABDEep: {
    raizRelativo: '..',
    destino: 'scripts/guardasDeEscritura.test.js',
    carpetas: ['scripts', 'WebUI/scripts'],
    ps: false,
    exencion: null,
    titulo: 'scripts/ — el que escribe, pregunta antes',
    escritores: [
      ['scripts/registry_generator.js', 'el generador del registro, con `--check`'],
      ['scripts/migrate-to-logger.js', 'la migracion, con `--dry-run`'],
      ['scripts/fuzz_roundtrip.js', 'uno de los que solo escriben con `--force`'],
      ['WebUI/scripts/export-calibration-run.js', 'el que esta FUERA de `scripts/` y tambien escribe'],
    ],
    helper: {
      ruta: 'scripts/escrituraSegura.mjs',
      delegan: ['scripts/fuzz_roundtrip.js', 'scripts/check_wasm_build.js', 'scripts/roundtrip_corpus.js'],
      nota: 'Los tres no tienen ni una llamada de node:fs: delegan en escrituraSegura.mjs.',
    },
    noEscritores: [
      'scripts/verify_docs_ci_jobs.js',
      'scripts/security_scan.js',
      'scripts/build_webui.js',
      'scripts/mutation_bank.data.js',
    ],
   writersPlaceholder: null,
  },

  ABDMS2000: {
    raizRelativo: '../..',
    destino: 'WebUI/tests/guardasDeEscritura.test.js',
    carpetas: ['Scripts', 'WebUI/scripts', 'tools'],
    ps: false,
    exencion: 'SIN-GUARDIA:',
    titulo: 'Scripts/ — el que escribe, pregunta antes',
    escritores: [
      ['Scripts/sync_assets.js', 'sustituye el destino entero'],
      ['Scripts/sync_bankmanager.js', 'sustituye el destino entero'],
      ['Scripts/sync_scope.js', 'sustituye el destino entero'],
      ['Scripts/generate_korg_channel.js', 'un generador de header'],
      ['Scripts/generate_host_model_id.js', 'el otro generador de header'],
    ],
    helper: {
      ruta: 'Scripts/syncSeguro.mjs',
      delegan: [
        'Scripts/sync_assets.js', 'Scripts/sync_bankmanager.js', 'Scripts/sync_scope.js',
        'Scripts/sync_bankmanager_ui.js', 'Scripts/generate_korg_channel.js',
        'Scripts/generate_host_model_id.js',
      ],
      soloDelegan: [
        'Scripts/sync_bankmanager.js', 'Scripts/sync_scope.js', 'Scripts/sync_bankmanager_ui.js',
        'Scripts/generate_korg_channel.js', 'Scripts/generate_host_model_id.js',
      ],
      nota: 'Los sincronizadores delegan la escritura en syncSeguro.mjs. Un detector que solo mirase el fichero pasaria por alto justo a los que se dejaron el `rmSync` en un helper.',
      propio: ['Scripts/sync_assets.js', ['mkdirSync', 'copyFileSync'],
        'escribe por las dos vias: delega los directorios y ademas replica los placeholders a mano'],
    },
    noEscritores: ['Scripts/registry_core.js'],
    exentos: ['Scripts/build_webui.js'],
    exentosNota: 'No se fija un numero: si alguien anade un script eximido sale en rojo con SU nombre, y la pregunta que hay que responder es si el motivo aguanta. Fijar la lista aqui solo haria que el proximo se colase por lo contrario.',
  },

  ABDNeural: {
    raizRelativo: '../..',
    destino: 'WebUI/tests/guardasDeEscritura.test.js',
    carpetas: ['WebUI/scripts', 'Scripts', 'tools'],
    ps: true,
    exencion: 'SIN-GUARDIA:',
    titulo: 'ABDNeural — el que escribe, pregunta antes',
    escritores: [
      ['WebUI/scripts/sync-wasm.mjs', 'el unico escritor de JavaScript: el DSP compilado que sirve el AudioWorklet'],
      ['Scripts/manage.ps1', 'escribe la version en `BuildVersion.h`, que esta versionado'],
      ['Scripts/update_version.ps1', 'reescribe `Version.h`, que esta versionado'],
    ],
    helper: null,
    noEscritores: [],
    exentos: ['Scripts/selftest_verify_all_node.js', 'Scripts/verify_all_node.js'],
    exentosMotivos: [
      ['Scripts/selftest_verify_all_node.js', 'temporal'],
      ['Scripts/verify_all_node.js', 'destino'],
    ],
    exentosNota: 'La lista se fija a proposito: si alguien exime un tercer script, sale en rojo con SU nombre, y la pregunta que hay que responder es si el motivo aguanta.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EL MOTOR. Se emite tal cual en los tres ficheros, con las listas ya horneadas.
//
// Va sin parametros a proposito: lo que cambia entre repos son las LISTAS, no el
// algoritmo. Un motor parametrizado que Cohen para un repo produce tres ficheros
// parecidos pero distintos, y para volver a mirarlos hay que volver a mirar el
// parametro. Con las listas escritas en el fichero generado, el codigo es el mismo en
// los tres y se lee sin este fichero delante.
// ─────────────────────────────────────────────────────────────────────────────

const motor = (cfg) => `
// ═══════════════════════════════════════════════════════════════════ GENERADO
// ESTE FICHERO NO SE EDITA A MANO.
//
// Motor y configuracion: ABDSharedAssets/scripts/generar-guardas-escritura.mjs
// Repo: ${cfg.repo}
//
//   Regenerar:  node ../ABDSharedAssets/scripts/generar-guardas-escritura.mjs --repo ${cfg.repo}
//   Comprobar:  node ../ABDSharedAssets/scripts/generar-guardas-escritura.mjs --check
//
// Editarlo a mano no da error: da un \`--check\` en rojo la proxima vez que corra
// alguien. Se materializa aqui y no se importa a proposito — un guard que
// dependiera del repo hermano dejaria de vigilar justo cuando ese repo no esta
// clonado, que es cuando un script nuevo entra.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ${JSON.stringify(cfg.raizRelativo)});

const CARPETAS = [
${cfg.carpetas.map((c) => `  path.join(RAIZ, ${JSON.stringify(c)}),`).join('\n')}
];

/**
 * Flags que significan «no escribo sin que me lo pidas». Todos valen: cada script
 * elige el que le encaja, y lo que se exige es que ELGIA uno.
 */
const CONTRATOS = {
  js: [${FLAGS_JS.map((f) => `{ cabecera: ${JSON.stringify(f.cabecera)}, codigo: ${JSON.stringify(f.codigo)} }`).join(', ')}],
${cfg.ps ? `  ps1: [${FLAGS_PS.map((f) => `{ cabecera: ${JSON.stringify(f.cabecera)}, codigo: ${JSON.stringify(f.codigo)} }`).join(', ')}],` : ''}
};

// ─────────────────────────────────────────────────────────────────────────────
// QUE CUENTA COMO ESCRIBIR
//
// Los cmdlets de PowerShell que tocan el disco. \`Write-Host\`, \`Write-Error\`,
// \`Write-Warning\` y \`Write-Output\` NO estan y no deben estar: escriben en la
// consola, no en el disco. Un guard que contara \`Write-Host\` como escribir
// declararia casi todos los scripts del repo, que es no distinguir nada.
//
// \`Remove-Item\` si esta: borrar un arbol es lo que un clean o un sincronizador no
// deben hacer sin que alguien lo haya pedido.
const ESCRIBE = {
  js: [
${ESCRIBE_JS.map((f) => `    ${JSON.stringify(f)},`).join('\n')}
  ],
${cfg.ps ? `  ps1: [\n${ESCRIBE_PS.map((f) => `    ${JSON.stringify(f)},`).join('\n')}\n  ],` : ''}
};

const EXENCION = ${JSON.stringify(cfg.exencion)};

const esPowerShell = (nombre) => /\\.ps1$/i.test(nombre);
const lenguajeDe = (nombre) => (esPowerShell(nombre) ? 'ps1' : 'js');

// Los scripts de PowerShell se llaman SIN parentesis (\`Set-Content \$ruta\`), asi que
// el detector de Node —que exige \`(\`— no los veria. En el regex es opcional.
const reJs = (fn) => new RegExp(\`(?<![\\\\w$])\${fn}\\\\s*\\\\(\`);
const rePs = (fn) => new RegExp(\`(?<![\\\\w$-])\${fn}\\\\b\`);

// Lo que hay entre comillas dentro de una linea no es codigo que se ejecuta: es un
// mensaje. Sin esto, un \`Write-Host "... un Remove-Item ..."\` —escrito para EXPLICAR
// el borrado— contaria como si el script borrara algo, y el script se declararia
// escritor de si mismo.
const sinCadenas = (linea) => linea
  .replace(/"(?:[^"\\\\]|\\\\.)*"/g, '""')
  .replace(/'(?:[^'\\\\]|\\\\.)*'/g, "''");

function noEsCodigo(linea, powerShell) {
  const t = linea.trim();
  if (t === '') return true;
  if (powerShell) return t.startsWith('#');
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/');
}

function esScript(fichero) {
  return (${cfg.ps ? "/(\\.[mc]?js$|\\.ps1$)/i.test(fichero)" : '/\\.m?js$/.test(fichero)'})
    && !${cfg.ps ? '/\\.test\\.[cm]?js$/i.test(fichero)' : '/\\.test\\.[cm]?js$/.test(fichero)'};
}

// La cabecera de un \`.ps1\` es el bloque \`<# ... #>\` del principio, o los comentarios
// \`#\` que precedan al \`param(\`. Las lineas de texto plano DENTRO del bloque no
// empiezan por \`#\`, asi que la regla de «linea de comentario» por si sola cortaria
// la cabecera en la primera, y ni el flag documentado ni el marcador de exencion se
// verian.
function cabeceraDe(lineas, powerShell) {
  const cabecera = [];
  let enBloque = false;
  for (const linea of lineas) {
    const t = linea.trim();
    if (!powerShell) {
      // El shebang cuenta como cabecera: si no, un script que empieza por
      // \`#!/usr/bin/env node\` tendria la cabecera cortada en la primera linea.
      if (noEsCodigo(linea, false) || linea.startsWith('#!')) { cabecera.push(linea); continue; }
      break;
    }
    if (!enBloque && t.startsWith('<#')) { enBloque = true; cabecera.push(linea); continue; }
    if (enBloque) {
      cabecera.push(linea);
      if (t.startsWith('#>')) { enBloque = false; }
      continue;
    }
    if (t === '' || t.startsWith('#')) { cabecera.push(linea); continue; }
    break;
  }
  return cabecera;
}

const llamadas = (linea, lenguaje) => {
  const fuente = lenguaje === 'ps1' ? sinCadenas(linea) : linea;
  const lista = ESCRIBE[lenguaje] || [];
  const re = lenguaje === 'ps1' ? rePs : reJs;
  return lista.filter((fn) => re(fn).test(fuente));
};
const conFlags = (linea, lenguaje) => (CONTRATOS[lenguaje] || [])
  .map((c) => c.codigo)
  .filter((f) => linea.includes(f));

/**
 * Lo que dice de un script: escribe?, lo declara en la cabecera?, y el flag existe
 * en codigo o solo en el texto?
 */
export function analizar(texto, nombre = 'x.js') {
  const lenguaje = lenguajeDe(nombre);
  const powerShell = esPowerShell(nombre);
  const lineas = texto.split('\\n');
  const cabecera = cabeceraDe(lineas, powerShell);

  const escribe = new Set();
  const alcanzables = new Set();
  const importados = new Set();
  for (const linea of lineas) {
    if (noEsCodigo(linea, powerShell)) continue;
    if (!powerShell && linea.startsWith('#!')) continue;
    for (const fn of llamadas(linea, lenguaje)) { escribe.add(fn); }
    for (const f of conFlags(linea, lenguaje)) { alcanzables.add(f); }
    // Solo los imports RELATIVOS: los de un paquete no se pueden seguir sin leer
    // node_modules, y ningun escritor de estos repos llega ahi para escribir.
    for (const m of linea.matchAll(/\\bfrom\\s+['"](\\.[^'"]+)['"]/g)) { importados.add(m[1]); }
  }

  const declarados = (CONTRATOS[lenguaje] || [])
    .filter((c) => cabecera.some((l) => l.includes(c.cabecera)))
    .map((c) => c.cabecera);

  // Lo declarado y lo implementado se comparan por CONTRATO, no comparando cadenas.
  // En Node coinciden (\`--check\` en la cabecera, \`--check\` en el codigo) y comparar
  // los textos funciona. En PowerShell NO: se documenta \`-Check\` y se lee \`\$Check\`,
  // asi que comparar los dos conjuntos de cadenas no encuentra nada y todos los
  // \`.ps1\` parecerian declarar un flag que no usan.
  const implementados = declarados.filter((cual) => {
    const contrato = (CONTRATOS[lenguaje] || []).find((c) => c.cabecera === cual);
    return contrato !== undefined && alcanzables.has(contrato.codigo);
  });

  // La exencion es un PARRAFO, no una palabra: se lee desde el marcador hasta la
  // linea en blanco siguiente. Recoger solo la primera linea dejaria el motivo a
  // medias, que es justo el fallo que la exencion existe para evitar.
  const i = cabecera.findIndex((l) => l.includes(EXENCION));
  let exencion = null;
  if (i >= 0) {
    const parrafo = [cabecera[i]];
    for (let j = i + 1; j < cabecera.length && cabecera[j].trim() !== ''; j++) {
      parrafo.push(cabecera[j]);
    }
    exencion = parrafo.join(' ');
  }

  return {
    escribe: escribe.size > 0,
    llamadas: [...escribe],
    importados: [...importados],
    declarados,
    implementados,
    exencion,
    via: null,
  };
}

/** Donde acaba un \`./x\` si el repo lo tiene: con extension o sin ella. */
function resolver(desde, especificador) {
  const base = path.resolve(path.dirname(desde), especificador);
  for (const candidata of [base, base + '.js', base + '.mjs', path.join(base, 'index.js')]) {
    if (existsSync(candidata) && statSync(candidata).isFile()) { return candidata; }
  }
  return null;
}

/** Todos los scripts de las carpetas vigiladas, con la propagacion de escritores. */
export function inventario() {
  const entradas = [];
  for (const carpeta of CARPETAS) {
    if (!existsSync(carpeta)) continue;
    for (const nombre of readdirSync(carpeta)) {
      if (!esScript(nombre)) continue;
      const absoluta = path.join(carpeta, nombre);
      if (!statSync(absoluta).isFile()) continue;
      entradas.push({
        absoluta,
        ruta: path.relative(RAIZ, absoluta).replace(/\\\\/g, '/'),
        ...analizar(readFileSync(absoluta, 'utf8'), nombre),
      });
    }
  }

  const porRuta = new Map(entradas.map((e) => [e.absoluta, e]));
  for (const e of entradas) {
    e.deps = e.importados.map((spec) => resolver(e.absoluta, spec)).map((p) => porRuta.get(p)).filter(Boolean);
  }

  // Punto fijo: escribir a traves de un helper que escribe a traves de otro sigue
  // siendo escribir. El tope no es por cycling: es por no depender de que el grafo
  // de imports este bien formado, que no depende de este test.
  for (let ronda = 0; ronda < 10; ronda++) {
    let cambio = false;
    for (const e of entradas) {
      if (e.escribe) continue;
      const escritor = e.deps.find((d) => d.escribe);
      if (!escritor) continue;
      e.escribe = true;
      e.via = escritor.ruta;
      e.llamadas = [\`via \${escritor.ruta}\`];
      cambio = true;
    }
    if (!cambio) break;
  }

  return entradas;
}

/** El motivo de una exencion, sin el adorno de comentario de la cabecera. */
export const motivoDe = (s) => (s.exencion === null
  ? ''
  : s.exencion.replace(EXENCION, '').replace(/^[\\s/*#]+/, '').trim());

/** Los que escriben y NO se han eximido: la lista que tiene que estar justificada. */
const escritores = () => inventario().filter((s) => s.escribe && !s.exencion);
`;

// ─────────────────────────────────────────────────────────────────────────────
// LOS TESTS
//
// Los comunes son los mismos en los tres, y esa es la parte que se ha ganado: el
// detector deja de estar probado solo en ABDEep. Los de cada repo son los que
// nombran SUS escritores, que es lo unico que de verdad difiere entre ellos.
// ─────────────────────────────────────────────────────────────────────────────

const testsComunes = () => `
describe('lo que escribe, pregunta antes', () => {
  it('todo el que escribe declara en su cabecera como NO escribir', () => {
    const sinDeclarar = escritores().filter((s) => s.declarados.length === 0);

    expect(
      sinDeclarar.map((s) => \`\${s.ruta} (escribe con \${s.llamadas.join(', ')})\`),
    ).toEqual([]);
  });

  it('y el flag que declara existe en codigo: no es decoracion', () => {
    // Un flag en la cabecera que nadie parsea es peor que no tenerlo: el que lo lea
    // se creera que puede preguntar, y no habra nadie al otro lado.
    const deMentira = escritores().filter((s) => s.declarados.length > 0 && s.implementados.length === 0);

    expect(
      deMentira.map((s) => \`\${s.ruta} declara \${s.declarados.join('/')} pero no lo lee en ningun sitio\`),
    ).toEqual([]);
  });
});

describe('el detector — para que los tests de arriba no puedan pasar por nada', () => {
  it('este detector VE a los escritores de verdad, no un conjunto vacio', () => {
    const rutas = inventario().filter((s) => s.escribe).map((s) => s.ruta);

    expect(rutas.length).toBeGreaterThan(0);
  });

  it('un comentario que MENCIONA una escritura no convierte al script en escritor', () => {
    const r = analizar([
      '/**',
      ' * Antes escribia con writeFileSync, ahora no.',
      ' */',
      "import fs from 'node:fs';",
      'fs.readFileSync(1);',
    ].join('\\n'));

    expect(r.escribe).toBe(false);
    expect(r.llamadas).toEqual([]);
  });

  it('una escritura en codigo, con el flag en la cabecera y en el parseo', () => {
    const r = analizar([
      '#!/usr/bin/env node',
      '/**',
      ' * Uso: node x.js [--check]',
      ' */',
      "import fs from 'node:fs';",
      'const check = args.includes("--check");',
      'if (!check) fs.writeFileSync(dest, txt);',
    ].join('\\n'));

    expect(r.escribe).toBe(true);
    expect(r.llamadas).toEqual(['writeFileSync']);
    expect(r.declarados).toEqual(['--check']);
    expect(r.implementados).toEqual(['--check']);
  });

  it('NEGATIVO: escribir sin declarar nada', () => {
    const r = analizar([
      '/**',
      ' * Un script de verdad.',
      ' */',
      "import fs from 'node:fs';",
      'fs.writeFileSync(dest, txt);',
    ].join('\\n'));

    expect(r.escribe).toBe(true);
    expect(r.declarados).toEqual([]);
    expect(r.implementados).toEqual([]);
  });

  it('NEGATIVO: flag en la cabecera que no aparece en codigo', () => {
    const r = analizar([
      '/**',
      ' * Uso: node x.js [--check]',
      ' */',
      "import fs from 'node:fs';",
      'fs.writeFileSync(dest, txt);',
    ].join('\\n'));

    expect(r.declarados).toEqual(['--check']);
    expect(r.implementados).toEqual([]);
  });

  it('los tres flags valen igual: el que pide el script es el que importa', () => {
    for (const flag of ['--check', '--dry-run', '--force']) {
      const r = analizar([
        \` * Uso: node x.js [\${flag}]\`,
        "import fs from 'node:fs';",
        \`const modo = args.includes("\${flag}");\`,
        'fs.copyFileSync(a, b);',
      ].join('\\n'));

      expect(r.implementados).toEqual([flag]);
    }
  });

  it('cuenta las tres familias de escritura, no solo writeFileSync', () => {
    const r = analizar([
      ' * [--check]',
      "import fs from 'node:fs';",
      'const a = fs.mkdirSync(dir);',
      'const b = fs.copyFileSync(x, y);',
      'fs.rmSync(z, { force: true });',
    ].join('\\n'));

    expect(r.llamadas).toEqual(expect.arrayContaining(['mkdirSync', 'copyFileSync', 'rmSync']));
  });

  it('recoge los imports RELATIVOS y no los de paquete', () => {
    const r = analizar([
      ' * [--check]',
      "import fs from 'node:fs';",
      "import { x } from './escrituraSegura.mjs';",
      "import { y } from '../WebUI/js/registry.gen.js';",
      "import { z } from '@abdsynths/shared/components';",
    ].join('\\n'));

    // El de paquete no se puede seguir sin leer node_modules, y ningun escritor de
    // estos repos escribe por ahi. Los dos relativos si, y son los que propagan la
    // condicion de escritor en el inventario.
    expect(r.importados).toEqual(['./escrituraSegura.mjs', '../WebUI/js/registry.gen.js']);
  });

  it('el \`fs.\` de delante NO cuenta como «otra cosa»: es justo el caso que hay que cazar', () => {
    const r = analizar([
      ' * [--check]',
      "import fs from 'node:fs';",
      'fs.copyFileSync(a, b);',
    ].join('\\n'));

    expect(r.llamadas).toEqual(['copyFileSync']);
  });
});
`;

const testsPowerShell = () => `
describe('PowerShell — su convencion, no la de Node', () => {
  const escribir = (cuerpo, cabecera = '<#\\n  Documentacion.\\n#>') =>
    \`\${cabecera}\\nparam ([switch]$Check)\\n\${cuerpo}\\n\`;
  const enPs1 = (cuerpo, cabecera) => analizar(escribir(cuerpo, cabecera), 'x.ps1');

  it('reconoce los cmdlets que tocan el disco', () => {
    for (const cmdlet of ['Set-Content $ruta', 'Add-Content $ruta', 'Remove-Item $dir',
      'New-Item -ItemType Directory', 'Copy-Item $a $b']) {
      expect({ cmdlet, esEscritor: enPs1(cmdlet).escribe })
        .toEqual({ cmdlet, esEscritor: true });
    }
  });

  it('NO cuenta como escribir lo que solo va a la consola', () => {
    // Si \`Write-Host\` contara, casi todos los scripts del repo serian «escritores»
    // — que es no distinguir nada. Y \`manage.ps1\` escribe una linea que MENCIONA un
    // \`Remove-Item\` para explicar que es lo que hace sin \`-Check\`.
    for (const cmd of ['Write-Host "hola"', 'Write-Error "mal"', 'Write-Warning "ojo"',
      'Write-Host "sin -Check esto es un Remove-Item -Recurse -Force"']) {
      expect({ cmd, esEscritor: enPs1(cmd).escribe })
        .toEqual({ cmd, esEscritor: false });
    }
  });

  it('un nombre de cmdlet DENTRO de un texto no cuenta', () => {
    expect(enPs1('Write-Host "esto NO borra: Remove-Item en el manual"').escribe).toBe(false);
  });

  it('el flag se busca como -Check en la cabecera y como $Check en el codigo', () => {
    // Las dos formas son distintas a proposito. En PowerShell se documenta \`-Check\` y
    // se lee \`$Check\`, porque eso es lo que hay que escribir para que funcione.
    const conLosDos = enPs1('$Check', '<#\\n  Usa -Check.\\n#>');
    expect({ declarados: conLosDos.declarados, implementados: conLosDos.implementados })
      .toEqual({ declarados: ['-Check'], implementados: ['-Check'] });

    // Documentado pero NO leido: es decoracion, y el guard tiene que verlo. El
    // \`param\` va aparte a proposito: si el script declarase \`[switch]$Check\`, ya
    // estaria leyendolo, y este caso no seria el que dice ser.
    const deMentira = analizar('<#\\n  Usa -Check.\\n#>\\nSet-Content $ruta\\n', 'x.ps1');
    expect({ declarados: deMentira.declarados, implementados: deMentira.implementados })
      .toEqual({ declarados: ['-Check'], implementados: [] });
  });

  it('NO acepta el --check de Node: ese no es el contrato de este lenguaje', () => {
    // Lo contrario de mezclar los dos lenguas seria hacer que este test aceptara
    // \`--check\`, que en PowerShell funciona pero que nadie escribiria. Aceptarlo es
    // justo el fallo que la exclusion original queria evitar.
    const r = enPs1('Set-Content $ruta', '<#\\n  Usa --check.\\n#>');

    expect({ declarados: r.declarados, esEscritor: r.escribe })
      .toEqual({ declarados: [], esEscritor: true });
  });

  it('y -Force tampoco: en PowerShell significa lo contrario', () => {
    // \`Remove-Item -Recurse -Force\` es «borralo sin preguntar». Aceptarlo como flag de
    // «no escribas» haria que un .ps1 que nombra un cmdlet se declarara escritor con un
    // flag que no ha declarado nunca.
    const r = enPs1('Set-Content $ruta', '<#\\n  Hace Remove-Item -Recurse -Force.\\n#>');

    expect({ declarados: r.declarados, esEscritor: r.escribe })
      .toEqual({ declarados: [], esEscritor: true });
  });

  it('la cabecera de un .ps1 es el bloque <# #>, aunque dentro haya texto sin #', () => {
    // Las lineas de prosa dentro del bloque de comentario no empiezan por \`#\`, asi
    // que la regla de «linea de comentario» por si sola cortaria la cabecera en la
    // primera y no se veria ni el flag documentado ni el marcador de exencion.
    const texto = [
      '<#',
      '  Script que escribe.',
      \`  \${EXENCION} porque solo escribe en su temporal.\`,
      '',
      '  Followed by prose that does not start with a hash.',
      '#>',
      'Set-Content $ruta',
    ].join('\\n');

    const r = analizar(texto, 'x.ps1');

    expect({
      exencion: r.exencion !== null,
      mencionaElMotivo: (r.exencion || '').includes('temporal'),
    }).toEqual({ exencion: true, mencionaElMotivo: true });
  });

  it('NEGATIVO: un .ps1 sin cabecera no puede declarar nada', () => {
    const r = analizar('Set-Content $ruta\\n', 'x.ps1');

    expect({ declarados: r.declarados, esEscritor: r.escribe })
      .toEqual({ declarados: [], esEscritor: true });
  });
});
`;

function testsDelRepo(cfg) {
  const partes = [];

  partes.push(`
describe('${cfg.titulo}', () => {
  it('este test VE a los escritores de verdad, no un conjunto vacio', () => {
    // La asercion que hace que las de abajo valgan: si el detector se rompe y no ve
    // a nadie, todas pasan en verde y el test no vigila nada. Por eso se nombran
    // ficheros concretos de mecanismos distintos.
    const rutas = escritores().map((s) => s.ruta);

${cfg.escritores.map(([r, nota]) => `    // ${nota}.\n    expect(rutas).toContain(${JSON.stringify(r)});`).join('\n')}

    // Y que el filtro de extension no se los haya tragado.
${cfg.escritores.slice(0, 3).map(([r]) => `    expect(esScript(${JSON.stringify(path.basename(r))})).toBe(true);`).join('\n')}
    expect(esScript('registry_generator.test.js')).toBe(false);
${cfg.ps ? "    expect(esScript('verify_all_node.test.js')).toBe(false);" : "    expect(esScript('bundle_code.ps1')).toBe(false);"}
  });`);

  if (cfg.helper) {
    partes.push(`
  it('ve a los que escriben a TRAVES de un helper, que es donde se le escaparian', () => {
    // ${cfg.helper.nota}
    const porRuta = new Map(inventario().map((s) => [s.ruta, s]));

    for (const ruta of ${JSON.stringify(cfg.helper.delegan)}) {
      expect({ ruta, escribe: porRuta.get(ruta).escribe }).toEqual({ ruta, escribe: true });
    }
${cfg.helper.soloDelegan ? `
    for (const ruta of ${JSON.stringify(cfg.helper.soloDelegan)}) {
      expect({ ruta, via: porRuta.get(ruta).via }).toEqual({ ruta, via: ${JSON.stringify(cfg.helper.ruta)} });
    }
` : `
    for (const ruta of ${JSON.stringify(cfg.helper.delegan)}) {
      expect({ ruta, via: porRuta.get(ruta).via }).toEqual({ ruta, via: ${JSON.stringify(cfg.helper.ruta)} });
    }
`}${cfg.helper.propio ? `
    // ${cfg.helper.propio[2]}. Por eso \`via\` es null aqui: no lo ha heredado de nadie.
    const propio = porRuta.get(${JSON.stringify(cfg.helper.propio[0])});
    expect(propio.via).toBeNull();
    expect(propio.llamadas).toEqual(expect.arrayContaining(${JSON.stringify(cfg.helper.propio[1])}));
` : ''}
    // Y el helper en si es escritor por su cuenta, no por herencia.
    const helper = porRuta.get(${JSON.stringify(cfg.helper.ruta)});
    expect(helper.via).toBeNull();
    expect(helper.llamadas).toContain('writeFileSync');
  });`);
  }

  if (cfg.noEscritores.length > 0) {
    partes.push(`
  it('el inventario no se inventa escritores de la nada', () => {
    // El otro extremo del mismo problema: si \`escribe\` se detectase por cualquier
    // cosa, el test pasaria por haber marcado de escritor a media carpeta y estorbaria
    // mas de lo que vigila.
    const rutas = inventario().filter((s) => s.escribe).map((s) => s.ruta);

    for (const quieto of ${JSON.stringify(cfg.noEscritores)}) {
      expect(rutas).not.toContain(quieto);
    }
  });`);
  }

  partes.push('});');
  return partes.join('\n');
}

function testsExencion(cfg) {
  if (!cfg.exencion) return '';

  const partes = [`
describe('la exencion — con motivo escrito, no con una palabra', () => {`];

  if (cfg.exentos) {
    partes.push(`
  it(${JSON.stringify(cfg.exentos.length === 1
    ? 'solo hay una, y su motivo aguanta'
    : 'las que hay, y cada una con su motivo')}, () => {
    // ${cfg.exentosNota}
    const exentos = inventario().filter((s) => s.exencion);

    expect(exentos.map((s) => s.ruta)).toEqual(${JSON.stringify(cfg.exentos)});
${cfg.exentosMotivos ? `
    // Y el motivo de cada una dice algo, no solo que hay uno. \`motivoDe\` toma la
    // ENTRADA del inventario, no la ruta: el motivo vive en la cabecera de ese
    // fichero y hay que haberla leido para tenerlo delante.
    const porRuta = new Map(inventario().map((s) => [s.ruta, s]));
${cfg.exentosMotivos.map(([r, palabra]) => `
    expect({ ruta: ${JSON.stringify(r)}, tieneMotivo: motivoDe(porRuta.get(${JSON.stringify(r)})).length > 0 })
      .toEqual({ ruta: ${JSON.stringify(r)}, tieneMotivo: true });
    expect(motivoDe(porRuta.get(${JSON.stringify(r)}))).toContain(${JSON.stringify(palabra)});`).join('\n')}` : ''}
  });`);
  }

  partes.push(`
  it('NEGATIVO: la exencion sin motivo NO exonera', () => {
    // Es la unica defensa contra un \`${cfg.exencion}\` pegado por prisa: el motivo tiene
    // que existir, no solo la palabra.
    const sinMotivo = analizar([
      '// ${cfg.exencion}',
      "import fs from 'node:fs';",
      'fs.writeFileSync(dest, txt);',
    ].join('\\n'));
    const conMotivo = analizar([
      '// ${cfg.exencion} es un build, su contenido cambia en cada ejecucion.',
      "import fs from 'node:fs';",
      'fs.writeFileSync(dest, txt);',
    ].join('\\n'));

    // La linea de la cabecera viene con su propio adorno de comentario (\`// \` o
    // \` * \`): sin quitarselo, un \`${cfg.exencion}\` a secas tendria «motivo» = \`//\`, que
    // es largo y no dice nada.
    expect({ hay: sinMotivo.exencion !== null, motivo: motivoDe(sinMotivo) })
      .toEqual({ hay: true, motivo: '' });
    expect({ motivo: motivoDe(conMotivo).length > 0 }).toEqual({ motivo: true });
  });
});`);

  return partes.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAR
// ─────────────────────────────────────────────────────────────────────────────

const cabeceraDe = (cfg) => `/**
 * guardasDeEscritura.test.js — todo script que escriba tiene que decir COMO no escribir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE ESTE TEST VIGILA, Y POR QUE HACE FALTA UN TEST QUE VIGILE LOS TESTS
 *
 * ${cfg.resumen}
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESCRIBIR A TRAVES DE UN HELPER TAMBIEN ES ESCRIBIR
 *
 * El fallo mas probable de este test no es que se le escape un \`writeFileSync\` en un
 * script nuevo: es el contrario. En cuanto se escribe un helper que escribe —que es
 * justo lo que se hace para que el guardia este en UN sitio y no en varios—, los
 * scripts que lo usan dejan de tener ninguna llamada de \`node:fs\` y desaparecerian
 * del inventario. Un guard que se queda sin ver al que vigila cuando este mejora es
 * un guard que ya no vigila.
 *
 * Por eso el inventario es transitivo: un script que importa un modulo RELATIVO que
 * escribe, escribe. Se propaga hasta que no cambia nada (y con tope de rondas, que
 * evita el bucle infinito si alguien se importa a si mismo).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE FICHERO ESTA COPIADO Y NO IMPORTADO
 *
 * Los tres repos tienen un guard identico, y podria haber uno solo en
 * ABDSharedAssets. No puede, por un motivo concreto: un guard que importara del
 * hermano dejaria de vigilar justo cuando ese hermano no este clonado —que es justo
 * cuando un script nuevo entra— y no se caeria, se saltaria. Un guard que se salta
 * en silencio es peor que no tener guard.
 *
 * Lo que si se hace es que los tres no se separen: los genera
 * ABDSharedAssets/scripts/generar-guardas-escritura.mjs, y su \`--check\` falla si
 * este fichero deja de ser lo que sale de ahi. Editarlo a mano no esta prohibido —
 * se nota en la siguiente corrida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE SE LEE Y QUE NO, Y POR QUE ESTA HECHO ASI
 *
 * El criterio de «escribe» es una lista de llamadas de \`node:fs\`, y se busca SOLO en
 * lineas que no sean de comentario. Eso evita el falso positivo de un comentario que
 * explica que el script no escribe nunca, pero tiene dos limitaciones que conviene
 * decir aqui en vez de descubrir dentro de seis meses:
 *
 *   · Un \`writeFileSync\` que aparezca dentro de una cadena de texto SI cuenta como
 *     escritura. No hay parser de JavaScript aqui a proposito —un test que necesita
 *     el parser del proyecto para leer un test no puede correr cuando el proyecto
 *     esta roto, que es justo cuando hace falta— y el coste de ese falso positivo es
 *     un test mas conservador, no uno que deja pasar al escritor. Para PowerShell si
 *     se quitan las cadenas antes de buscar, porque hay un \`Write-Host\` que MENciona
 *     \`Remove-Item\` para explicar que hace.
 *   · ${cfg.ps
    ? 'Los `.ps1` SI se miran, con su propia convencion: `-Check` en la cabecera y `$Check` en el codigo. Mezclar `--check` y `-Check` seria aceptar dos lenguas de contrato a la vez.'
    : 'Los `.ps1` NO se miran. La convencion de flags de PowerShell no es la de Node, y meterlos aqui haria que el test aceptase dos lenguos de contrato distintos. Queda NOMBRADO en la configuracion del generador para que la exclusion se lea como decision y no como agujero.'}
 *
 * Y los \`*.test.js\` se excluyen del inventario: un test escribe ficheros a proposito
 * (este no, pero los de la bateria si), y exigirles un flag seria pedirles que no se
 * proben.
 */
`;

const RESUMENES = {
  ABDEep: `Este repo tiene once scripts que escriben en disco, y cada uno con su manera de
 * preguntar antes: \`--check\` en los generadores, \`--dry-run\` en la migracion,
 * \`--force\` en los que solo escriben con \`--out\`. Eso se decidio uno por uno, y cada
 * decision quedo en la cabecera del script. El problema es el siguiente script: uno
 * nuevo, con un \`fs.writeFileSync\` y sin ninguna pregunta, entra en el repo sin que
 * nadie se entere, porque no hay nada que revise la lista.
 *
 * Este test es esa revision. Exige dos cosas de cada uno: que su CABECERA declare un
 * flag de los tres, y que ese flag aparezca ademas en CODIGO.`,
  ABDMS2000: `En ABDEep y ABDNeural hay el mismo guard. Este es su hermano, y existe porque un guard
 * que solo vigila un repo vigila la mitad del problema: los \`sync_*.js\` de este repo
 * hacen \`rmSync(destino, { recursive: true })\` y luego \`cpSync\`, o sea SUSTITUYEN el
 * destino entero. Eso es mas peligroso que generar un header, y estaba sin ninguna
 * forma de preguntar.
 *
 * Exige dos cosas de cada script que escribe: que su cabecera declare \`--check\`,
 * \`--dry-run\` o \`--force\`, y que ese flag exista ademas en codigo (un flag documentado
 * que nadie parsea es peor que ninguno).
 *
 * Y hay una tercera puerta, la \`SIN-GUARDIA:\`. Sirve para los scripts que escriben y
 * NO PUEDEN tener un check que sea verde —\`build_webui.js\` estampa la fecha y la hora
 * en sus dos salidas, asi que su contenido cambia en cada build por diseno—. Con la
 * excepcion no se salta el test: hay que escribir el motivo, el motivo se lee en el
 * mensaje de fallo si alguien anade otro, y la linea esta en el fichero para el que
 * lo lea. Un script que se autoexime sin explicar nada no se exonera: el motivo vacio
 * es motivo insuficiente.`,
  ABDNeural: `Este repo tiene tres escritores reales y son de dos lenguas: \`sync-wasm.mjs\` copia el
 * DSP compilado ENCIMA del que sirve el AudioWorklet, y \`manage.ps1\` y
 * \`update_version.ps1\` escriben en \`BuildVersion.h\` y \`Version.h\`, que estan
 * VERSIONADOS. Los tres tienen su forma de preguntar antes.
 *
 * El inventario es corto, y no es que falte cobertura: es lo que encontro la
 * auditoria. Dos estan eximidos con \`verify_all_node.js\` —recibe su destino desde la
 * linea de comandos y ya se niega a escribir encima de sus propias entradas— y
 * \`selftest_verify_all_node.js\`, que solo escribe en el temporal que el mismo crea.`,
};

function generar(repo) {
  const cfg = { ...REPOS[repo], repo, resumen: RESUMENES[repo] };
  const bloque = [
    cabeceraDe(cfg),
    motor(cfg),
    testsDelRepo(cfg),
    testsComunes(),
    cfg.ps ? testsPowerShell() : '',
    testsExencion(cfg),
  ].join('\n');

  // Una sola LF final y sin espacios al final de linea: si el fichero commiteado
  // tiene CRLF por el checkout, el `--check` lo compara ya normalizado (abajo) para
  // no dar un rojo que no es de este generador.
  return `${bloque.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const check = args.includes('--check');
const ayuda = args.includes('--help') || args.includes('-h');

if (ayuda) {
  console.log([
    'Genera los tres guardasDeEscritura.test.js desde un motor comun.',
    '',
    'Uso:',
    '  node scripts/generar-guardas-escritura.mjs                # regenera los tres',
    '  node scripts/generar-guardas-escritura.mjs --repo ABDEep # solo uno',
    '  node scripts/generar-guardas-escritura.mjs --check        # NO escribe. Sal 1 si alguno se separo.',
    '  node scripts/generar-guardas-escritura.mjs --help',
    '',
    '  --repo NOMBRE=RUTA   donde vive ese repo, si no es el layout del monorepo.',
    '',
    `Repos: ${Object.keys(REPOS).join(', ')}`,
  ].join('\n'));
  process.exit(0);
}

// El valor que sigue a `--repo` NO es un argumento desconocido: se filtra antes, o
// `manage.ps1`-style un `--repo NoExiste` se quejaria de la ortografia en vez de
// decir que el repo no existe, que es lo que hay que arreglar.
const valoresDeRepo = new Set();
args.forEach((a, i) => { if (a === '--repo') { valoresDeRepo.add(args[i + 1]); } });
const desconocidos = args.filter((a) => !['--check', '--help', '-h'].includes(a)
  && !a.startsWith('--repo') && !valoresDeRepo.has(a));
if (desconocidos.length > 0) {
  console.error(`[guardas] argumento desconocido: ${desconocidos.join(' ')}`);
  console.error('[guardas] Uso: --repo ABDEep | --repo ABDEep=/ruta | --check | --help');
  process.exit(2);
}

// `--repo` puede repetirse y admite `NOMBRE` o `NOMBRE=RUTA`.
const pedidos = [];
const rutas = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--repo') continue;
  const valor = args[i + 1];
  if (valor === undefined) {
    console.error('[guardas] --repo necesita un valor.');
    process.exit(2);
  }
  const [nombre, ruta] = valor.split('=');
  if (!REPOS[nombre]) {
    console.error(`[guardas] repo desconocido: ${nombre}. Conocidos: ${Object.keys(REPOS).join(', ')}`);
    process.exit(2);
  }
  pedidos.push(nombre);
  if (ruta) { rutas[nombre] = ruta; }
}

const seleccionados = pedidos.length > 0 ? [...new Set(pedidos)] : Object.keys(REPOS);

/** Compara ignorando los finales de linea: `core.autocrlf=true` no es un rojo nuestro. */
const normaliza = (texto) => texto.replace(/\r\n/g, '\n');

let desfasados = 0;
for (const repo of seleccionados) {
  const raizRepo = rutas[repo] || path.join(monorepo, repo);
  const destino = path.join(raizRepo, REPOS[repo].destino);
  const generado = generar(repo);

  if (!fs.existsSync(raizRepo)) {
    console.error(`[guardas] ${repo}: no existe ${raizRepo} — no clonado. Su guard no se ha comprobado.`);
    desfasados++;
    continue;
  }

  const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : null;

  if (check) {
    if (actual === null) {
      console.error(`[guardas] ${repo}: DESFASADO — ${REPOS[repo].destino} no existe.`);
      desfasados++;
      continue;
    }
    if (normaliza(actual) === generado) {
      console.log(`[guardas] ${repo}: al dia.`);
      continue;
    }
    console.error(`[guardas] ${repo}: DESFASADO — ${REPOS[repo].destino} no es lo que sale del generador.`);
    console.error('          Alguien lo edito a mano, o el motor cambio y este repo no se regenero.');
    console.error('          Arreglo: node scripts/generar-guardas-escritura.mjs --repo ' + repo);
    desfasados++;
    continue;
  }

  if (actual !== null && normaliza(actual) === generado) {
    console.log(`[guardas] ${repo}: ya estaba al dia (no se toca).`);
    continue;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, generado, 'utf8');
  console.log(`[guardas] ${repo}: escrito ${REPOS[repo].destino} (${generado.split('\n').length} lineas).`);
}

if (check && desfasados > 0) {
  process.exit(1);
}