#!/usr/bin/env node
/**
 * QUE CODIGO DE LOS HERMANOS HA LEIDO ESTE PREFLIGHT, Y POR QUE HACE FALTA
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ROJO QUE NO SE PUEDE COMPARAR CON OTRO ROJO
 *
 * El preflight da 1 en un arbol con 151 rutas sin commitear en ABDEep, y da 0 en
 * CI, donde los hermanos se bajan al SHA que dice `siblings.json`. Los dos rojos
 * son el MISMO comando y son fallos DISTINTOS: uno mira codigo que nadie ha
 * commiteado y el otro mira el commit fijado. Con el mensaje de antes —«el
 * contrato esta DESFASADO, regenera»— no hay forma de saber cual de los dos se
 * tiene delante, y la accion que uno pide no arregla el otro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE UN MODULO Y NO UNA FUNCION DENTRO DEL PREFLIGHT
 *
 * Porque el mensaje lo necesitan DOS programas: el preflight, que es la puerta
 * que bloquea, y `scripts/check-hermanos-generadores.mjs`, que es el paso del
 * workflow cuyo nombre SI dice que mira a los hermanos. Los dos leen de los
 * hermanos y los dos pueden dar el mismo rojo. Si el texto viviera en el
 * preflight, el segundo script tendria que importarlo de ahi —y con el, con el
 * inventario entero de contratos—, que es importar un preflight para imprimir
 * cuatro lineas.
 *
 * Y la politica se prueba aparte del texto que la imprime: `lineasDe` y
 * `veredicto` son funciones puras sobre datos inventados, asi que un test puede
 * ejercitar los cuatro casos —al pin y limpio, al pin y sucio, en otro commit,
 * sin clonar— sin un solo `git`. Un guard que solo se puede probar montando un
 * clon es un guard que no se prueba nunca.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE NO HACE: NO FALLA
 *
 * Deliberadamente. Un arbol con cambios locales es el estado normal de quien
 * esta programando, y el preflight que sale con 1 porque el arbol esta sucio
 * enseña a ignorar el 1. El bloque es un LECTOR: dice que codigo se ha mirado,
 * avisa en voz alta cuando no es el que va a leer CI, y deja que cada rojo sea
 * el que le corresponda. Si esto hiciera fallar, el rojo de contrato —que es el
 * que importa— se esconderia detras de uno de arbol, que es el que se puede
 * arreglar en diez segundos y no es el que duele.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// El lector del marcador de `sonda-ci.mjs`, que es el unico sitio donde existe.
// Se importa en vez de reimplementar la lectura del fichero porque el nombre y
// la forma del marcador son de ese script: si los dos se desincronizan, el que
// falla es el bloque de estado —que diria `sin-git` sin decir por que— y no la
// sonda, que escribiria un marcador que nadie lee sin avisar.
import { shaDelMarcador } from './sonda-ci.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const RAIZ_PAQUETE = dirname(here);

/**
 * Git con el directorio marcado como seguro.
 *
 * Sin esto, `rev-parse` en un clon cuyo dueno es otra cuenta —que es lo que
 * pasa en el runner, donde el checkout lo hace el servicio y no quien lo
 * consulta— sale con «detected dubious ownership» y codigo 128. Un lector que
 * degrada a «no se ha podido leer» por culpa de una comprobacion de git
 * miente sobre lo que el preflight ha mirado, que es justo lo que este modulo
 * existe para no hacer.
 */
const GIT = ['-c', 'safe.directory=*'];

/** Un `git` que no cuelgue el preflight si alguien tiene un indice en un estado raro. */
const TIEMPO_MS = 15000;

/**
 * Corre un `git` y devuelve lo que imprimo, o null si no se pudo.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{salida: string, codigo: number}|null}
 */
function git(args, cwd) {
  const r = spawnSync('git', [...GIT, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: TIEMPO_MS,
    windowsHide: true,
  });

  if (r.error || typeof r.status !== 'number' || r.status !== 0)
    return null;

  return { salida: String(r.stdout ?? '').trim(), codigo: r.status };
}

/** Los siete caracteres de un SHA, que es lo que se lee de un vistazo. */
export function corto(sha) {
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : String(sha);
}

/**
 * El estado de UN hermano: lo que dice el inventario, lo que hay en disco y si
 * las dos cosas son lo mismo.
 *
 * Los cuatro casos que se distinguen, y por que los cuatro:
 *
 *   `no-clonado`  el directorio no existe. No hay nada que mirar, y decirlo
 *                 como si fuera un commit viejo seria inventar.
 *   `sin-git`     el directorio existe pero no es un clon. Puede ser un
 *                 directorio de trabajo vacio o una copia descomprimida. No se
 *                 puede decir que commit es, asi que se dice que no se puede.
 *   `al-pin`      esta en el SHA fijado. Es lo que va a leer CI, y el preflight
 *                 que corre aqui y el del runner miran lo mismo.
 *   `otro-commit` el HEAD no es el fijado. Aqui el rojo local y el de CI ya no
 *                 son comparables, y es lo que hay que decir antes del rojo.
 *
 * `sucias` son las rutas modificadas sin commitear del hermano. No es un caso
 * aparte porque no cambia el HEAD, pero si es lo que mas se confunde con «el
 * pin esta mal»: el pin es correcto y aun asi el codigo mirado no es el del pin,
 * porque encima hay trabajo sin commitear. Por eso son un campo aparte y no una
 * nota.
 *
 * @param {string} repo  el nombre del hermano, como esta en `siblings.json`.
 * @param {string} pin   el SHA que el inventario fija para el.
 * @param {string} base  el directorio donde esta el hermano en disco.
 * @returns {{repo: string, pin: string, caso: string, head: string|null, sucias: number|null, motivo: string|null}}
 */
export function estadoDe(repo, pin, base) {
  const comun = { repo, pin, head: null, sucias: null, motivo: null };

  if (!existsSync(base))
    return { ...comun, caso: 'no-clonado', motivo: 'el directorio no existe' };

  const head = git(['rev-parse', 'HEAD'], base);

  if (head === null) {
    // Un sandbox de `sonda-ci.mjs` no lleva `.git` —son ficheros copiados de
    // `git show`— pero deja escrito que SHA ha materializado, porque el que lo
    // montó si lo sabe. Sin leerlo, el preflight que corre dentro del sandbox
    // declararia que no puede decir que commit es sobre un arbol que se ha
    // construido justo para saberlo.
    const delMarcador = shaDelMarcador(base);

    if (delMarcador === null) {
      return {
        ...comun,
        caso: 'sin-git',
        motivo: 'el directorio existe pero no responde a git, asi que no se puede decir que commit es',
      };
    }

    if (delMarcador !== pin) {
      return {
        ...comun,
        caso: 'otro-commit',
        head: delMarcador,
        sucias: null,
        motivo: 'el marcador del sandbox no coincide con el SHA que el inventario fija',
      };
    }

    // `sucias: 0` y no `null`: el marcador lo escribe quien materializo fichero a
    // fichero desde `git show`, asi que no hay nada sin commitear. Dejarlo en
    // `null` haria que la columna no imprimiese nada, y eso se lee igual que
    // «no lo he mirado» cuando en realidad si.
    return { ...comun, caso: 'al-pin', head: delMarcador, sucias: 0 };
  }

  const estado = git(['status', '--porcelain'], base);
  const sucias = estado === null
    ? null
    : estado.salida.split('\n').filter((l) => l.trim() !== '').length;

  if (head.salida !== pin) {
    return {
      ...comun,
      caso: 'otro-commit',
      head: head.salida,
      sucias,
      motivo: 'el HEAD de este arbol no es el SHA que el inventario fija, asi que este preflight no mira lo mismo que CI',
    };
  }

  return { ...comun, caso: 'al-pin', head: head.salida, sucias };
}

/**
 * Una linea por hermano, alineadas.
 *
 * La sucia va en su propia columna y no pegada al commit porque es una
 * informacion de OTRO tipo: el commit dice que codigo hay, las sucias dicen que
 * encima hay codigo sin commitear. Juntas en un solo campo, «f32163f (151)», se
 * leen como un commit raro en lugar de como dos hechos.
 *
 * @param {{repo: string, caso: string, sucias: number|null, motivo: string|null}[]} estados
 * @returns {string[]}
 */
export function lineasDe(estados) {
  const ancho = Math.max(0, ...estados.map((e) => e.repo.length));

  return estados.map((e) => {
    const nombre = e.repo.padEnd(ancho);
    // El plural se cuenta. «1 rutas sin commitear» en una linea que existe para
    // que se lea de un vistazo es el detalle que hace que un ojo entrenado
    // dude de si el numero de al lado es el que cree.
    const sucias = e.sucias === null || e.sucias === 0
      ? ''
      : `  ${e.sucias} ${e.sucias === 1 ? 'ruta' : 'rutas'} sin commitear`;

    if (e.caso === 'no-clonado')
      return `  ${nombre}  sin clonar en disco${sucias}`;

    if (e.caso === 'sin-git')
      return `  ${nombre}  sin git: no se puede decir que commit hay${sucias}`;

    return `  ${nombre}  fijado ${corto(e.pin)}  en disco ${corto(e.head)}${sucias}`;
  });
}

/**
 * Si el preflight de aqui y el de CI van a mirar lo mismo, y la frase que lo
 * dice.
 *
 * Un solo caso es el bueno, y es el unico que puede llevar la frase de que los
 * dos rojos son comparables. Los demas llevan la de que NO lo son, porque es la
 * informacion que hace falta antes de leer cualquier otro rojo de la salida.
 *
 * @param {{caso: string, sucias: number|null}[]} estados
 * @returns {{comparables: boolean, frase: string}}
 */
export function veredicto(estados) {
  const iguales = estados.filter((e) => e.caso === 'al-pin');
  const conSucias = iguales.filter((e) => (e.sucias ?? 0) > 0);
  const distintos = estados.filter((e) => e.caso !== 'al-pin');

  if (distintos.length === 0 && conSucias.length === 0) {
    return {
      comparables: true,
      frase: 'Los hermanos estan en el SHA fijado y sin cambios sin commitear: '
        + 'este preflight mira lo mismo que el de CI, asi que un rojo aqui es un rojo alla.',
    };
  }

  const partes = [];

  if (distintos.length > 0) {
    partes.push(
      `${distintos.map((e) => e.repo).join(', ')} ${distintos.length === 1 ? 'esta' : 'estan'} `
      + 'en otro commit o no se puede saber que commit es',
    );
  }

  if (conSucias.length > 0) {
    partes.push(
      `${conSucias.map((e) => e.repo).join(', ')} tiene `
      + `${conSucias.reduce((n, e) => n + (e.sucias ?? 0), 0)} rutas sin commitear`,
    );
  }

  return {
    comparables: false,
    frase: `ESTE PREFLIGHT NO LEE LO QUE LEERA CI: ${partes.join('; ')}. `
      + 'Lo de arriba es lo que hay en este arbol y el runner baja el SHA fijado. '
      + 'Un rojo de aqui sobre un hermano asi no se compara con el de CI: mira otro codigo.',
  };
}

/**
 * Los estados de TODOS los hermanos del inventario, en el orden en que estan
 * declarados.
 *
 * El inventario se lee aqui y no se pasa, para que quien lo llame no tenga que
 * acordarse de leerlo y el bloque no pueda salir con la lista a medias. Y si el
 * inventario no se puede leer, esto NO lanza: el preflight ya tiene su propia
 * puerta para el manifiesto, y un lector de contexto que sale con 2 antes de
 * imprimir el contexto no es un contexto, es otra puerta.
 *
 * @param {string} [rutaInventario]
 * @param {string} [raizMonorepo]
 * @returns {{repo: string, caso: string, head: string|null, sucias: number|null, motivo: string|null}[]}
 */
export function estadosDe(rutaInventario = join(RAIZ_PAQUETE, 'siblings.json'), raizMonorepo = dirname(RAIZ_PAQUETE)) {
  if (!existsSync(rutaInventario))
    return [];

  let inventario;

  try {
    inventario = JSON.parse(readFileSync(rutaInventario, 'utf-8'));
  } catch {
    return [];
  }

  if (!Array.isArray(inventario?.hermanos))
    return [];

  return inventario.hermanos.map(
    (h) => estadoDe(h?.repo, h?.sha, join(raizMonorepo, String(h?.repo ?? ''))),
  );
}

/**
 * El bloque entero, tal y como se imprime.
 *
 * Devuelve lineas y no un string por una razon que se nota al probarlo: una
 * funcion que devuelve texto hay que compararla con cadenas literales, y en una
 * consola cp1252 el acento de «codigo» hace que la comparacion falle en la
 * maquina y no en el runner. Con lineas se compara el ancho y el contenido por
 * partes, y no depende de la codificacion de quien lee.
 *
 * @returns {string[]} vacio si el inventario no se puede leer.
 */
export function bloqueDeEstado(estados) {
  if (estados.length === 0)
    return [];

  const v = veredicto(estados);

  return [
    'CONTRA QUE CODIGO DE LOS HERMANOS',
    '-'.repeat(72),
    ...lineasDe(estados),
    '',
    `  ${v.frase}`,
    '',
  ];
}

if (process.argv[1] && process.argv[1].endsWith('estado-hermanos.mjs')) {
  for (const linea of bloqueDeEstado(estadosDe()))
    console.log(linea);
}