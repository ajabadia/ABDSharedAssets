import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// ─────────────────────────────────────────────────────────────────────────────
// QUE SE CONSIDERA SUCIO, Y QUE NO
//
// El proyecto escribe en espanol sin tildes en el codigo, y con ellas en los
// mensajes de commit y en algunos comentarios. Asi que "no latino" NO es el
// criterio: un acento es correcto y un ideograma no.
//
// Se separa en tres conjuntos:
//
//   PERMITIDO  lo que el proyecto usa a proposito. Tildes, enye, dieresis, el
//              guion largo, la raya de caja de los encabezados, las comillas
//              latinas y las angulares, y el emoji del pie de Codebuff.
//
//   SOSPECHOSO  no es sucio, pero en este proyecto no deberia aparecer nunca:
//              ideogramas CJK, hiragana, katakana, hangul, cirilico, arabe,
//              hebreo. Todos los que se han colado hasta ahora son de aqui.
//
//   RARO        ASCII permitido, pero palabras inglesas que en los comentarios de
//              este proyecto delatan un texto generado y no escrito: "actively",
//              "written a mano", "announcing". Se buscan aparte porque son
//              ASCII y el escaner de rangos no las ve.
//
// La diferencia entre los dos ultimos conjuntos es la que importa: un ideograma
// se ve leyendo la linea; una palabra inglesa se ve solo si se sabe que el
// proyecto no escribe asi.
// ─────────────────────────────────────────────────────────────────────────────

const PERMITIDO = new Set(
  ('áéíóúüñÁÉÍÓÚÜÑ'          // tildes y enye, con y sin mayuscula
  + '—–'                      // guion largo y corto
  + '─━│┌┐└┘'                 // raya de caja, la de los encabezados
  + '«»‹›'                    // angulares
  + '“”‘’'                    // comillas tipograficas
  + '¿¡'                      // interrogacion y exclamacion de apertura
  + '·•'                      // punto medio
  + ' '                  // espacio duro
  + '🤖').split(''),   // el emoji del pie de Codebuff
);

// Rangos que en este proyecto solo pueden ser basura colada.
const SOSPECHOSO = [
  [0x0400, 0x04ff],   // cirílico
  [0x0590, 0x05ff],   // hebreo
  [0x0600, 0x06ff],   // arabe
  [0x0750, 0x077f],   // arabe extendido
  [0x0900, 0x097f],   // devanagari
  [0x0e00, 0x0e7f],   // tailandés
  [0x3040, 0x309f],   // hiragana
  [0x30a0, 0x30ff],   // katakana
  [0x3400, 0x4dbf],   // ideogramas extensión A
  [0x4e00, 0x9fff],   // ideogramas
  [0xa960, 0xa97f],   // hangul jamo extendido A
  [0xac00, 0xd7af],   // hangul silaba
  [0xf900, 0xfaff],   // compatibilidad ideogramas
  [0xff00, 0xffef],   // formas anchas y emoji
];

// Solo secuencias que en este proyecto delatan texto generado y no escrito.
// Cuanto mas corta la palabra, mas falsos positivos da: "it is" aparece en
// cada cabecera de JUCE y en los ficheros de terceros de docs/, asi que no
// sirve de nada. Estas cinco si: son mezclas de ingles que en espanol no
// se escriben asi.
const RARO = [
  'actively', 'written a mano', 'announcing', 'misleading', 'forget de',
  'hand-written', 'split de', 'split the', 'checked by', ' WHICH',
];

const esSospechoso = (cp) => SOSPECHOSO.some(([a, b]) => cp >= a && cp <= b);

// En Windows git se niega a trabajar en un repositorio propiedad de otro
// usuario ("dubious ownership"), asi que hay que forzar la excepcion cada vez.
//
// La ruta se DEDUCE de donde esta este fichero, no se escribe a mano. Estaba
// escrita (`D:/desarrollos/ABDSynths/...`) y por eso este script solo audtaba
// el checkout de una maquina concreta: en un clon limpio, o en una copia del
// repo en otro sitio, `git ls-files` fallaba y la auditoria se quedaba sin
// ficheros que mirar sin decir por que.
//
// Se declara tambien el hermano, `ABDAudioLab`, porque este script recorre los
// dos repositorios. Esa ruta si lleva el nombre del hermano, y es correcta
// mientras el workspace se llame asi; lo que no puede hacer esta excepcion es
// assumir donde vive ESTE repositorio, que es justo lo que cambia al clonarlo.
const RAIZ_AQUI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HERMANO = resolve(RAIZ_AQUI, '..', 'ABDAudioLab');
const rutaParaGit = (ruta) => ruta.replace(/\\/g, '/').replace(/\/+$/, '');
const GIT = ['-c', `safe.directory=${rutaParaGit(RAIZ_AQUI)}`,
             '-c', `safe.directory=${rutaParaGit(HERMANO)}`];

function describe(c) {
  const cp = c.codePointAt(0);
  const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  return c + ' (' + hex + ')';
}

// ── recorredores ────────────────────────────────────────────────────────────

function ficherosDelRepo(repo, sufijo = '') {
  // Se usa git para el listado: respeta .gitignore y no se mete en build/ ni
  // node_modules/, que es donde estorba un arbol fantasma.
  const salida = execFileSync('git', [...GIT, 'ls-files', sufijo || '.'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return salida.split('\n').filter(Boolean);
}

function auditarFichero(repo, rel) {
  let bruto;
  try {
    bruto = readFileSync(join(repo, rel));
  }
  catch (e) {
    return null;   // no legible: no es codigo
  }

  // Un binario leido como utf8 es ruido puro: aparece un careto por byte. Se
  // detecta por el byte nulo, que ningun fichero de texto lleva.
  const muestra = bruto.subarray(0, 4096);
  if (muestra.includes(0)) return null;

  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bruto);
  }
  catch (e) {
    return null;   // no es utf-8 valido: no es un fichero de texto
  }

  const malos = new Map();
  const raros = [];
  const lineas = texto.split('\n');

  lineas.forEach((linea, i) => {
    for (const c of linea) {
      const cp = c.codePointAt(0);
      if (cp < 128) continue;
      if (PERMITIDO.has(c)) continue;
      if (esSospechoso(cp) && !malos.has(c)) malos.set(c, i + 1);
    }
    for (const w of RARO) {
      if (linea.includes(w) && !raros.some((r) => r.palabra === w)) {
        raros.push({ palabra: w, linea: i + 1 });
      }
    }
  });

  if (malos.size === 0 && raros.length === 0) return null;

  return { rel, malos, raros };
}

function auditarCommits(repo) {
  // El rango es el primer argumento que no sea una opcion propia del escaner.
const rango = process.argv.slice(2).find((a) => !a.startsWith('--')) || '--all';
  const salida = execFileSync('git', [...GIT, 'log', '--format=%H%x00%B%x00', rango], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const trozos = salida.split('\0');
  const hallazgos = [];

  for (let i = 0; i < trozos.length; i += 2) {
    const sha = (trozos[i] || '').trim();
    const cuerpo = trozos[i + 1] || '';
    if (!sha) continue;

    const hash = sha.slice(0, 7);
    const malos = new Map();
    const raros = [];

    for (const c of cuerpo) {
      const cp = c.codePointAt(0);
      if (cp < 128) continue;
      if (PERMITIDO.has(c)) continue;
      if (esSospechoso(cp) && !malos.has(c)) malos.set(c, 1);
    }

    for (const w of RARO) {
      if (cuerpo.includes(w) && !raros.includes(w)) raros.push(w);
    }

    if (malos.size > 0 || raros.length > 0) hallazgos.push({ hash, malos, raros });
  }

  return hallazgos;
}

// ── main ───────────────────────────────────────────────────────────────────

const REPOS = [
  'D:/desarrollos/ABDSynths/ABDSharedAssets',
  'D:/desarrollos/ABDSynths/ABDAudioLab',
];

const soloCommits = process.argv.includes('--commits');
const soloCodigo = process.argv.includes('--codigo');

let totalFallos = 0;

for (const repo of REPOS) {
  const nombre = repo.split('/').pop();
  console.log('='.repeat(70));
  console.log('  ' + nombre);
  console.log('='.repeat(70));

  if (!soloCodigo) {
    const commits = auditarCommits(repo);
    if (commits.length === 0) {
      console.log('  mensajes de commit: limpios');
    }
    else {
      console.log('  mensajes de commit: ' + commits.length + ' con basura');
      for (const c of commits) {
        totalFallos += c.malos.size + c.raros.length;
        const marcas = [...c.malos.keys()].map(describe).join('  ');
        const Mixingles = c.raros.map((w) => 'palabra: "' + w + '"').join('  ');
        console.log('    ' + c.hash + '  ' + [marcas, Mixingles].filter(Boolean).join('  '));
      }
    }
  }

  if (!soloCommits) {
    const ficheros = ficherosDelRepo(repo);
    const sucios = [];
    for (const f of ficheros) {const r = auditarFichero(repo, f);
      if (r) sucios.push(r);
    }

    if (sucios.length === 0) {
      console.log('  codigo: limpio (' + ficheros.length + ' ficheros)');
    }
    else {
      console.log('  codigo: ' + sucios.length + ' ficheros con algo raro');
      for (const s of sucios) {
        for (const [, linea] of s.malos) totalFallos++;
        for (const r of s.raros) totalFallos++;
        console.log('    ' + s.rel);
        for (const [c, linea] of s.malos) console.log('        L' + linea + '  ' + describe(c));
        for (const r of s.raros) console.log('        L' + r.linea + '  palabra: "' + r.palabra + '"');
      }
    }
  }

  console.log('');
}

console.log('total de hallazgos: ' + totalFallos);
