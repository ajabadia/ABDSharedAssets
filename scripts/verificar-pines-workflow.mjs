#!/usr/bin/env node
/**
 * VERIFICAR EL WORKFLOW CONTRA LA REALIDAD: QUE CADA CHECKOUT BAJE UN PIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE HACE Y POR QUE HACE FALTA
 *
 * Un `ref:` de `actions/checkout` que no resuelve a un SHA NO ES UN ERROR: es un
 * checkout de la rama por defecto. No sale un paso en rojo, no hay un aviso, no hay
 * nada. GitHub se queda con el valor vacio, se lo pasa a la accion y la accion
 * clona la rama. El job sigue en verde y baja el codigo de HOY en vez del de ayer,
 * que es exactamente el fallo que el diseno de los pines prohibe.
 *
 * Esa es la razon de existir de este script. Y no unificar el motivo del rojo: lo
 * unico que hacia falta era poder EVALUAR lo que el runner evaluara, y que aqui se
 * evalue con el mismo dato.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE EVALUA, Y DE DONDE SALE EL DATO
 *
 * El `fromJSON` de verdad, no una cuenta paralela:
 *
 *   1. Se EJECUTA `scripts/pines-hermanos.mjs`, con un `GITHUB_OUTPUT` de mentira,
 *      y se leen los outputs que de verdad escribe. Si el inventario esta roto, el
 *      fallo sale de ahi y con el nombre del repo.
 *   2. Se leen los workflows COMO TEXTO —`js-yaml` no es dependencia de este
 *      paquete— y se saca de cada job su `strategy.matrix`, sus `outputs:` y sus
 *      pasos.
 *   3. Se monta el contexto `steps.<id>.outputs.<x>` y `needs.<job>.outputs.<x>`
 *      siguiendo lo que el propio workflow declara: un output de job se evalua con
 *      el contexto de su job, con el output del paso que lo publica. Si alguien
 *      renombra el `id:` del paso y no actualiza el `outputs:`, aqui se ve.
 *   4. Se EVALUA cada expresion con un evaluador de la sintaxis de GitHub —`fromJSON`,
 *      `toJSON`, `a.b`, `a['b']`, `a[0]`— y se comprueba lo que sale.
 *
 * Y la expansion de la matriz es la de GitHub, no una readicion: un ARRAY da una
 * pata por elemento, y un OBJETO da UNA sola pata con todos los repos dentro. Esa
 * diferencia es la que hace que `matrix.hermano.repo` exista, y es tambien la que
 * hace que un mapa en `strategy.matrix` baje el primer repo una vez y en silencio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE FALLA, Y QUE NO
 *
 * Falla si un `ref:` no resuelve a un SHA de 40 hex; si resuelve a un SHA que no es
 * el del inventario; si un hermano del inventario no acaba en ninguna pata; si la
 * matriz ha puesto un mapa donde hace falta una lista; si un workflow vuelve a
 * escribir un SHA a mano; si un checkout baja un repo que el inventario no declara;
 * o si el paso que comprueba los ficheros no recibe la lista de `siblings.json`.
 *
 * NO comprueba que los SHA existan en GitHub, ni que el commit tenga lo que el
 * inventario dice. Eso lo comprueba el job `hermanos`, una pata por hermano, en un
 * runner de verdad, y sale con 1 diciendo cual. Aqui no hay red y no la deberia
 * haber: este script tiene que ser un relampago que corre en el primer minuto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALIDAS
 *
 *   0  todos los checkout bajan el pin que dice el inventario
 *   1  hay algun `ref:` que no resuelve a un SHA, o el inventario no se lee
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { delHermanoDe, ficherosDe, inventarioDe, leidosDe, pinesDe } from './pines-hermanos.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PAQUETE = dirname(here);

const SHA = /^[0-9a-f]{40}$/;

/* ───────────────────────────────────────────────────────────────────────────────
 * EL EVALUADOR DE EXPRESIONES DE GITHUB
 *
 * El subconjunto que este workflow usa, y no mas: `fromJSON`, `toJSON`, acceso por
 * punto, acceso por corchetes con clave o con indice, y literales. Lo que no se
 * sepa evaluar no se pasa por alto ni se devuelve como cadena: se lanza, porque una
 * expresion que este verificador no entiende es una expresion que no se ha
 * comprobado, y eso tiene que salir en rojo y no de color.
 * ─────────────────────────────────────────────────────────────────────────────── */

/** Un error de evaluacion con el mensaje ya escrito para el log del runner. */
class ErrorDeExpresion extends Error {}

const ESPACIOS = /\s/;

function saltar(s, i) {
  while (i < s.length && ESPACIOS.test(s[i])) i += 1;
  return i;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*/;
const NUMERO = /^[0-9]+/;

/** Un literal de cadena, con las dos comillas que GitHub acepta. */
function cadena(s, i) {
  const comilla = s[i];

  for (let j = i + 1; j < s.length; j += 1) {
    if (s[j] === '\\') { j += 1; continue; }
    if (s[j] === comilla) return [s.slice(i + 1, j), j + 1];
  }

  throw new ErrorDeExpresion(`literal sin cerrar: "${s.slice(i)}"`);
}

/** Una propiedad de un objeto, o de un array por indice, o el `.length` de un string. */
function miembro(valor, clave, donde) {
  if (valor === null || valor === undefined)
    throw new ErrorDeExpresion(`${donde} no tiene nada de donde sacar "${clave}"`);

  if (typeof valor === 'string' && clave === 'length') return valor.length;

  if (typeof valor !== 'object')
    throw new ErrorDeExpresion(`${donde} es ${typeof valor} y no tiene "${clave}"`);

  const sale = Array.isArray(valor) && /^[0-9]+$/.test(clave) ? valor[Number(clave)] : valor[clave];

  if (sale === undefined)
    throw new ErrorDeExpresion(`${donde} no tiene la clave "${clave}"`);

  return sale;
}

/** Las dos funciones que se usan, y ninguna mas a proposito. */
function funcion(nombre, argumento) {
  if (nombre === 'fromJSON') {
    if (typeof argumento !== 'string')
      throw new ErrorDeExpresion('fromJSON necesita una cadena, que es lo que escribe un output');

    try {
      return JSON.parse(argumento);
    } catch {
      throw new ErrorDeExpresion(`fromJSON no ha podido leer: ${String(argumento).slice(0, 60)}`);
    }
  }

  if (nombre === 'toJSON') return JSON.stringify(argumento);

  throw new ErrorDeExpresion(`funcion desconocida: ${nombre}()`);
}

/** El cuerpo de una expresion: una cosa con sus sufijos. */
function cuerpo(s, i, ctx, donde) {
  i = saltar(s, i);
  const c = s[i];

  let valor;

  if (c === "'" || c === '"') {
    [valor, i] = cadena(s, i);
  } else if (NUMERO.test(s.slice(i))) {
    const m = NUMERO.exec(s.slice(i));
    valor = Number(m[0]);
    i += m[0].length;
  } else {
    const m = IDENT.exec(s.slice(i));

    if (!m) throw new ErrorDeExpresion(`no se entiende "${s.slice(i)}"`);

    const nombre = m[0];
    i += nombre.length;

    if (s[i] === '(') {
      const [argumento, j] = cuerpo(s, i + 1, ctx, `${donde}.${nombre}()`);
      i = saltar(s, j);

      if (s[i] !== ')') throw new ErrorDeExpresion(`falta el ) de ${nombre}(`);

      i += 1;
      valor = funcion(nombre, argumento);
    } else {
      valor = ctx(nombre, donde);
    }
  }

  for (;;) {
    i = saltar(s, i);

    if (s[i] === '.') {
      const m = IDENT.exec(s.slice(i + 1));

      if (!m) throw new ErrorDeExpresion(`propiedad sin nombre en "${s.slice(i)}"`);

      valor = miembro(valor, m[0], donde);
      i += 1 + m[0].length;
    } else if (s[i] === '[') {
      const [clave, j] = cuerpo(s, i + 1, ctx, `${donde}[...]`);
      i = saltar(s, j);

      if (s[i] !== ']') throw new ErrorDeExpresion('falta el ]');

      i += 1;
      valor = miembro(valor, String(clave), donde);
    } else break;
  }

  return [valor, i];
}

/**
 * Evalua un valor de YAML: si es `${{ ... }}` entero, devuelve el valor; si lleva
 * una expresion embebida en un texto, devuelve el texto con la expresion puesta.
 * Lo que no tenga ninguna expresion se devuelve tal cual.
 */
export function evaluar(valor, ctx, donde) {
  if (typeof valor !== 'string') return valor;
  if (!valor.includes('${{')) return valor;

  const entero = /^\$\{\{([\s\S]*)\}\}$/.exec(valor);

  if (entero && !entero[1].includes('${{')) {
    const [v] = cuerpo(entero[1], 0, ctx, donde);
    return v;
  }

  return valor.replace(/\$\{\{([^}]*)\}\}/g, (_, dentro) => {
    const [v] = cuerpo(dentro, 0, ctx, donde);
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

/* ───────────────────────────────────────────────────────────────────────────────
 * EL WORKFLOW LEIDO COMO TEXTO
 *
 * Se lee en la forma que hace falta y no mas: una lista de jobs, los `strategy`
 * de cada uno, los `outputs:` de cada uno y los pasos con su `with:` y su `env:`.
 * Un parser de YAML entero haria mas trabajo del que hace falta y traeria una
 * dependencia que este paquete no quiere.
 * ─────────────────────────────────────────────────────────────────────────────── */

/** Los jobs del workflow, con su identificador y su texto. */
function jobsDe(txt) {
  const jobs = [];
  let dentroDeJobs = false;
  let actual = null;

  for (const linea of txt.split('\n')) {
    if (/^jobs:\s*$/.test(linea)) { dentroDeJobs = true; continue; }
    if (!dentroDeJobs) continue;

    const cabecera = /^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*$/.exec(linea);

    if (cabecera) {
      actual = { id: cabecera[1], lineas: [] };
      jobs.push(actual);
      continue;
    }

    if (actual) actual.lineas.push(linea);
  }

  return jobs.map((j) => ({ id: j.id, texto: j.lineas.join('\n') }));
}

/** Las claves de un bloque `clave:` con sangria fija, en un objeto plano. */
function mapaDe(txt, clave, sangria) {
  const cabecera = new RegExp(`^ {${sangria}}${clave}:\\s*$`);
  const lineas = txt.split('\n');
  const at = lineas.findIndex((x) => cabecera.test(x));

  if (at < 0) return null;

  const entrada = new RegExp(`^ {${sangria + 2}}([A-Za-z_][A-Za-z0-9_-]*):\\s*(.*)$`);
  const salida = {};

  for (let i = at + 1; i < lineas.length; i += 1) {
    const m = entrada.exec(lineas[i]);

    if (m) {
      salida[m[1]] = m[2].replace(/\s+#.*$/, '').trim();
      continue;
    }

    if (lineas[i].trim() === '') continue;
    if (new RegExp(`^ {${sangria}}\\S`).test(lineas[i])) break;
  }

  return Object.keys(salida).length > 0 ? salida : null;
}

/** Los pasos de un job, con lo que hace falta saber de cada uno. */
function pasosDe(jobTxt) {
  return jobTxt.split(/^ {6}- /m).slice(1).map((bloque) => {
    const primera = /^(\S+):\s*(.*)$/.exec(bloque.split('\n')[0] ?? '');
    const nombre = primera
      ? (primera[1] === 'name'
        ? primera[2].replace(/^["']|["']$/g, '')
        : primera[2])
      : '';

    return {
      nombre: nombre || '(sin nombre)',
      id: /^ {8}id:\s*(\S+)/m.exec(bloque)?.[1] ?? null,
      uses: /^ {8}uses:\s*(\S+)/m.exec(bloque)?.[1] ?? null,
      run: /^ {8}run:\s*(.*)$/m.exec(bloque)?.[1]?.trim() ?? null,
      with: mapaDe(bloque, 'with', 8) ?? {},
      env: mapaDe(bloque, 'env', 8) ?? {},
    };
  });
}

/**
 * La matriz de un job, como mapa `dimension -> expresion`, en texto.
 *
 * @returns {Record<string,string>|null}
 */
function matrizDe(jobTxt) {
  const bloque = /^ {4}strategy:\n(?: {6}\S.*\n)*? {6}matrix:\n((?: {8}.*\n?)*)/m.exec(jobTxt);
  if (!bloque) return null;

  const salida = {};

  for (const linea of bloque[1].split('\n')) {
    const m = /^ {8}([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(linea);
    if (m) salida[m[1]] = m[2].trim();
  }

  return Object.keys(salida).length > 0 ? salida : null;
}

/**
 * Las patas de una matriz, como las expande GitHub.
 *
 * Un array da una pata por elemento; un objeto da UNA pata, con el objeto entero
 * dentro. Es la diferencia de la que depende `matrix.hermano.repo`, y por eso se
 * implementa con la regla de GitHub y no con la que seria comoda.
 *
 * @param {unknown} valor     Lo que evalua la expresion de la dimension.
 * @param {string} dimension  Como se llama la dimension dentro de `matrix`.
 */
function patasDe(valor, dimension) {
  if (Array.isArray(valor)) return valor.map((v) => ({ [dimension]: v }));

  return [{ [dimension]: valor }];
}

/* ───────────────────────────────────────────────────────────────────────────────
 * LA VERIFICACION
 * ─────────────────────────────────────────────────────────────────────────────── */

/**
 * El contexto de expresiones: resuelve `matrix`, `steps` y `needs` contra lo que
 * el workflow declara. Lo que no existe se lanza: una expresion que no se puede
 * resolver es una expresion sin comprobar.
 */
function contextoDe(ctx) {
  return (nombre, donde) => {
    if (nombre === 'matrix') return ctx.matrix ?? {};
    if (nombre === 'needs') return ctx.needs ?? {};
    if (nombre === 'steps') return ctx.steps ?? {};

    throw new ErrorDeExpresion(`${donde}: contexto desconocido "${nombre}"`);
  };
}

/** La misma lista, en el mismo orden: dos textos que describen lo mismo. */
function mismaLista(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length
    && a.every((x, i) => x === b[i]);
}

/**
 * Comprueba un workflow entero.
 *
 * @param {object} opciones
 * @param {Array<{nombre: string, txt: string}>} opciones.workflows
 * @param {object} opciones.inventario  El contenido de `siblings.json`.
 * @param {Record<string,string>} opciones.pines   `repo -> sha`, de `pinesDe`.
 * @param {Record<string,string>} opciones.ficheros `repo -> necesita`, de `ficherosDe`.
 * @param {Record<string,string>} opciones.leidos   `repo -> lee`, de `leidosDe`.
 * @param {Record<string,string>} opciones.pasos   Los outputs REALES de `pines-hermanos.mjs`,
 *                                                  tal cual los escribe: cadenas.
 * @returns {{errores: string[], lineas: string[]}}
 */
export function verificar({ workflows, inventario, pines, ficheros, leidos, pasos }) {
  const errores = [];
  const lineas = [];
  const hermanos = inventario.hermanos ?? [];

  const bajo = (msg) => errores.push(msg);

  // El SHA escrito a mano, en cualquier workflow. Es la segunda copia del dato y
  // es la que se desincroniza; no hace falta esperar a que se note.
  for (const w of workflows) {
    const aMano = w.txt.match(/[0-9a-f]{40}/g) ?? [];

    if (aMano.length > 0)
      bajo(`${w.nombre}: ${aMano.length} SHA escrito(s) a mano; el pin sale de siblings.json y lo publica el job pines`);
  }

  const jobs = workflows.flatMap((w) => jobsDe(w.txt).map((j) => ({ ...j, workflow: w.nombre })));

  // El contexto arranca con los outputs del paso que los publica, leidos de verdad.
  const ctx = { steps: {}, needs: {}, matrix: {} };
  const resolver = contextoDe(ctx);

  const pasoPines = jobs
    .flatMap((j) => pasosDe(j.texto).map((p) => ({ job: j, paso: p })))
    .find((x) => /pines-hermanos\.mjs/.test(x.paso.run ?? ''));

  if (!pasoPines) {
    bajo('ningun workflow ejecuta scripts/pines-hermanos.mjs: no hay quien publique los pines');
    return { errores, lineas };
  }

  if (!pasoPines.paso.id) {
    bajo(`el paso que publica los pines (job ${pasoPines.job.id}) no tiene id, y un output sin id no se puede leer desde otro job`);
    return { errores, lineas };
  }

  ctx.steps[pasoPines.paso.id] = { outputs: { ...pasos } };

  // Los outputs de cada job, evaluados con el contexto de ESE job, en orden de
  // dependencia: es lo que hace un output de job en GitHub, y es lo que permite que
  // un `needs.pines.outputs.hermanos` dependa de verdad del paso que lo publica.
  const hechos = new Set();
  const pendientes = [...jobs];

  while (pendientes.length > 0) {
    let progreso = false;

    for (let i = 0; i < pendientes.length; i += 1) {
      const job = pendientes[i];
      const needs = /needs:\s*\[([^\]]*)\]/m.exec(job.texto)?.[1]
        ?.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) ?? [];

      if (!needs.every((n) => hechos.has(n))) continue;

      const declarados = mapaDe(job.texto, 'outputs', 4);

      if (declarados) {
        const mio = {};

        for (const [nombre, expr] of Object.entries(declarados)) {
          const donde = `${job.workflow}: job ${job.id}, output ${nombre}`;

          try {
            mio[nombre] = evaluar(expr, resolver, donde);
          } catch (exc) {
            bajo(`${donde} no se puede evaluar (${exc.message})`);
          }
        }

        ctx.needs[job.id] = { outputs: mio };
      }

      hechos.add(job.id);
      pendientes.splice(i, 1);
      progreso = true;
      break;
    }

    if (!progreso) break;
  }

  for (const job of jobs) {
    if (!hechos.has(job.id))
      bajo(`${job.workflow}: el job "${job.id}" no se ha podido resolver; sus needs no cuadran`);
  }

  // Ahora si: cada checkout, en su job y en su pata.
  const bajados = new Map();

  for (const job of jobs) {
    const delJob = pasosDe(job.texto);
    const checkouts = delJob.filter((p) => /^actions\/checkout@/.test(p.uses ?? ''));
    if (checkouts.length === 0) continue;

    const matriz = matrizDe(job.texto);
    const dimensiones = Object.keys(matriz ?? {});

    // Con mas de una dimension el producto cartesiano es lo que haria GitHub, y este
    // workflow no lo usa: se dice en vez de suponer.
    if (dimensiones.length > 1) {
      bajo(`${job.workflow}: el job "${job.id}" declara mas de una dimension de matriz y este verificador no expande el producto`);
      continue;
    }

    let valorMatriz;

    if (dimensiones.length === 1) {
      try {
        valorMatriz = evaluar(matriz[dimensiones[0]], resolver, `${job.workflow}: job ${job.id}, matrix.${dimensiones[0]}`);
      } catch (exc) {
        bajo(`${job.workflow}: la dimension "${dimensiones[0]}" de la matriz del job "${job.id}" no se puede evaluar (${exc.message}); la matriz se queda vacia y NO SE BAJA NINGUN HERMANO`);
        continue;
      }
    }

    const patas = dimensiones.length === 1 ? patasDe(valorMatriz, dimensiones[0]) : [{}];

    for (const pata of patas) {
      const resolverPata = contextoDe({ ...ctx, matrix: pata });

      for (const checkout of checkouts) {
        // Sin `ref:` no hay pin que comprobar: es el checkout de este propio repo,
        // que va al commit que la propia corrida trae.
        if (!checkout.with.ref) continue;

        const donde = `${job.workflow}: job ${job.id}, paso "${checkout.nombre}"`;
        let ref;
        let path;

        try {
          ref = evaluar(checkout.with.ref, resolverPata, `${donde}, ref`);
        } catch (exc) {
          bajo(`${donde}: el ref no se puede resolver (${exc.message}); si se queda vacio, el checkout baja la RAMA POR DEFECTO`);
          continue;
        }

        try {
          path = checkout.with.path
            ? evaluar(checkout.with.path, resolverPata, `${donde}, path`)
            : '';
        } catch (exc) {
          bajo(`${donde}: el path no se puede resolver (${exc.message})`);
          continue;
        }

        if (typeof ref !== 'string' || !SHA.test(ref)) {
          bajo(`${donde}: el ref resuelve a ${JSON.stringify(ref)}, que no es un SHA; actions/checkout se quedaria con la RAMA POR DEFECTO`);
          continue;
        }

        if (pines[path] === undefined) {
          bajo(`${donde}: baja "${path}" a un SHA, y ese repo no esta en siblings.json`);
          continue;
        }

        if (pines[path] !== ref) {
          bajo(`${donde}: ${path} baja ${ref.slice(0, 8)} y el inventario dice ${pines[path].slice(0, 8)}`);
          continue;
        }

        if (bajados.has(path))
          bajo(`${donde}: ${path} se baja dos veces`);
        else bajados.set(path, ref);

        // Las dos listas de rutas que el checkout debe traer salen del inventario:
        // lo que se abre (`ficheros`) y lo que se corre (`leidos`). Si el paso las
        // recibiera escritas en el propio workflow serian dos copias mas, y
        // desincronizadas por el mismo motivo que el SHA.
        comprobarLista(delJob, donde, resolverPata, path, 'NECESITA', ficheros[path], bajo);
        comprobarLista(delJob, donde, resolverPata, path, 'LEIDOS', delHermanoDe(leidos[path] ?? []), bajo);
      }
    }
  }

  for (const h of hermanos) {
    if (!bajados.has(h.repo))
      bajo(`${h.repo} esta en siblings.json y ningun checkout del workflow lo baja; no llega al generador`);
  }

  lineas.push(`Pines comprobados: ${bajados.size} de ${hermanos.length} hermanos`);

  for (const h of hermanos) {
    const ref = bajados.get(h.repo);
    lineas.push(`  ${h.repo.padEnd(14)} ${ref ? ref.slice(0, 8) : 'NO SE BAJA'}`);
  }

  return { errores, lineas };
}

/**
 * El paso que comprueba una lista de rutas del hermano la baja del output que la
 * publica, y no de una lista escrita en el workflow.
 *
 * Se comprueba aqui y no en el runner porque el fallo de la lista escrita a mano no
 * sale en el runner: el paso abre lo que le digan y se pone verde.
 *
 * @param {string} variable  `NECESITA` o `LEIDOS`: la variable de entorno.
 * @param {string[]} esperada  Lo que el inventario dice para ese repo.
 */
function comprobarLista(delJob, donde, resolverPata, repo, variable, esperada, bajo) {
  const conLista = delJob.filter((p) => p.env[variable] !== undefined);

  // Una variable que el workflow no declara: no es un fallo. El `ref:` del
  // checkout de este propio repo tampoco lo es, y por lo mismo: lo que se
  // comprueba es lo que se ha declarado, no que se declare todo.
  if (conLista.length === 0) return;

  if (conLista.length > 1) {
    bajo(`${donde}: hay ${conLista.length} pasos con ${variable}; la lista solo la puede comprobar uno`);
    return;
  }

  const paso = conLista[0];
  const dondeLista = `${donde}: el paso "${paso.nombre}"`;

  let recibido;

  try {
    recibido = evaluar(paso.env[variable], resolverPata, `${dondeLista}, ${variable}`);
  } catch (exc) {
    bajo(`${dondeLista}: ${variable} no se puede resolver (${exc.message}); si se queda vacia, la comprobacion pasa sin mirar nada`);
    return;
  }

  let lista;

  try {
    lista = typeof recibido === 'string' ? JSON.parse(recibido) : recibido;
  } catch {
    bajo(`${dondeLista}: ${variable} no es una lista, es ${JSON.stringify(recibido)}`);
    return;
  }

  if (!mismaLista(lista, esperada))
    bajo(`${dondeLista}: comprueba ${JSON.stringify(lista)} y el inventario dice ${JSON.stringify(esperada)}`);
}

/* ───────────────────────────────────────────────────────────────────────────────
 * LA EJECUCION DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Ejecuta `pines-hermanos.mjs` y lee los outputs que escribe, de verdad.
 *
 * @returns {Record<string,string>}  `hermanos` y `ficheros`, como CADENAS: es lo
 *   que un output de GitHub es, y el verificador los tiene que parsear por su
 *   cuenta, que es justo lo que hara el runner con su `fromJSON`.
 */
export function pasosReales() {
  const dir = mkdtempSync(join(tmpdir(), 'pines-'));
  const destino = join(dir, 'out.txt');

  try {
    const r = spawnSync(process.execPath, [join(PAQUETE, 'scripts', 'pines-hermanos.mjs')], {
      encoding: 'utf-8',
      env: { ...process.env, GITHUB_OUTPUT: destino },
      timeout: 120_000,
      windowsHide: true,
    });

    if (r.status !== 0) {
      const ultimo = (r.stderr ?? '').trim().split('\n').slice(-2).join(' | ');
      throw new Error(`pines-hermanos.mjs ha fallado (rc=${r.status}): ${ultimo}`);
    }

    const salidas = {};

    for (const linea of readFileSync(destino, 'utf-8').split('\n')) {
      const at = linea.indexOf('=');
      if (at > 0) salidas[linea.slice(0, at)] = linea.slice(at + 1);
    }

    for (const clave of ['hermanos', 'ficheros', 'delHermano']) {
      if (salidas[clave] === undefined)
        throw new Error(`pines-hermanos.mjs no publico el output "${clave}"; nada mas puede leerlo`);
    }

    return salidas;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const soloWorkflow = argv.includes('--workflow') ? argv[argv.indexOf('--workflow') + 1] : null;
  const inventario = inventarioDe();
  const pines = pinesDe(inventario);
  const ficheros = ficherosDe(inventario);
  const leidos = leidosDe(inventario);

  const workflows = soloWorkflow
    ? [{ nombre: soloWorkflow.split(/[\\/]/).pop(), txt: readFileSync(soloWorkflow, 'utf-8') }]
    : readdirSync(join(PAQUETE, '.github', 'workflows'))
        .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
        .map((n) => ({ nombre: n, txt: readFileSync(join(PAQUETE, '.github', 'workflows', n), 'utf-8') }));

  const { errores, lineas } = verificar({
    workflows, inventario, pines, ficheros, leidos, pasos: pasosReales(),
  });

  console.log('::group::Pines de los hermanos, leidos del inventario');
  for (const l of lineas) console.log(`  ${l}`);
  console.log('::endgroup::');

  if (errores.length === 0) return 0;

  console.log('');
  console.log(`PINES QUE NO CUADRAN (${errores.length}):`);

  for (const e of errores) {
    console.log(`  ${e}`);
    console.log(`::error::${e}`);
  }

  console.log('');
  console.log('Un ref que no resuelve a un SHA no da error en el runner: se queda con la');
  console.log('rama por defecto. Por eso esto se comprueba antes de gastar el runner.');

  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (exc) {
    console.error(`verificar-pines-workflow: ${exc.message}`);
    process.exit(2);
  }
}