#!/usr/bin/env node
/**
 * PREFLIGHT: ningun contrato GENERADO puede llegar a la rama desfasado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL AGUJERO QUE ESTE FICHERO TAPONA.
 *
 * Hay tres generadores de contratos en este paquete y los tres aceptan
 * `--check`, que es la forma de preguntar "¿el contrato de la rama coincide con
 * lo que sale del codigo?". Los tres lo hacen bien: avisan del fichero, dicen
 * como se regenera y salen con codigo 1.
 *
 * Y aqui es donde esta el problema: los tres estan bien, y no se los corre
 * nadie a la vez.
 *
 * El patron de fallo no es que un generador este roto, que se veria. Es este:
 * alguien toca `S950Calibration.h` —una columna, un nombre, un rango—, se le
 * olvida el `pnpm generate:s950-cal`, y todo lo demas sigue en verde. El CI
 * pasa porque el `--check` no estaba en el CI. El PR entra. Y a partir de ahi
 * hay dos verdades sobre las curvas del S950: la del `.h` y la del `.json`, y
 * los paneles dibujan con la segunda mientras el motor lee la primera.
 *
 * Eso no es un contrato desfasado: es un contrato MENTIROSO. Un panel con ejes
 * viejos no se queja, porque un panel no sabe que los ejes viejos estan mal. Es
 * el peor fallo posible de un contrato, y por eso la puerta va aqui y no dentro
 * de un test de schemas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE UN SCRIPT Y NO UN TEST.
 *
 * Un test de vitest comprobaria lo mismo y seria mas comodo, pero el fallo que
 * se tapa aqui es un fallo DE ORDEN: el contrato se regenera en un commit y el
 * test llega tarde. Un preflight que se corre antes que la suite falla en el
 * sitio donde el error se introduce, que es la unica vez que alguien lo puede
 * arreglar sin coste. Y el test sigue haciendo falta para lo otro: que el
 * preflight exista, este cableado y siga funcionando. Eso si lo comprueba un test.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL REGISTRO, Y POR QUE NO SE ADIVINA.
 *
 * Los generadores se declaran aqui, en `CONTRATOS`. No se descubren
 * recorriendo `scripts/`, porque descubrir significa que un generador nuevo
 * nace fuera del preflight y por tanto nace invisible: el fichero de al lado se
 * registraria solo y el script nuevo no. Un inventario explicito se puede
 * olvidar de actualizar, y eso falla ruidosamente; uno automatico se puede
 * quedado corto en silencio. La segunda es la que estamos tapando.
 *
 * Y `generators` esta en el `package.json` por lo mismo: el preflight es
 * el unico sitio que decide, y lo demas lo consulta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 todo al dia, 1 algo desfasado, 2 el preflight no se puede correr.
 *
 * El 2 es distinto del 1 a proposito, y es el caso de aqui mismo: hay un
 * generador que hoy falla por una tabla rota y no por un contrato viejo. Si
 * eso devolviera 1, el mensaje seria "el contrato esta desfasado, regenera",
 * que es mentira —regenerar no arregla un parser roto— y el que lo lea
 * perderia el tiempo en el sitio equivocado. Un preflight que no distingue
 * "tu contrato esta viejo" de "no puedo ni mirar" miente igual que el
 * contrato que vigila.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// La regla de cuarentena, desde el sitio unico donde vive. Se importa del
// barril y no de `utils/quarantine.js` a proposito: asi, si el barril se
// desincroniza con el fichero, esto se rompe aqui y no en un navegador.
import {
  auditar,
  comprobarContraElEsquema,
  esquemaAplica,
  motivoParaMostrar,
  ningunEsquemaAplica,
} from '../utils/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Lee el `package.json` y falla si no se puede: sin el, este script miente. */
function manifiesto() {
  const ruta = join(root, 'package.json');

  if (!existsSync(ruta))
    throw new Error('no encuentro package.json en ' + root);

  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

/**
 * Los contratos GENERADOS, declarados aqui y no deducidos.
 *
 * `script`    el generador, relativo a la raiz del paquete.
 * `salidas`   los ficheros que tiene que producir. Se declaran aunque el script
 *             ya lo sepa, porque hay dos cosas distintas que verificar y es
 *             mejor que las dos sean explicitas: que el generador soporte
 *             `--check` y que TODO lo que dice producir este en el disco.
 * `scriptNpm` el nombre del script de `package.json`, para el mensaje.
 *
 * Si un generador nuevo anade una salida y no la declara aqui, el test de
 * `generatedContractsPreflight.test.js` lo pilla: compara lo declarado aqui con
 * lo que hay en disco y con lo que dice el propio generador.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS GENERADOS QUE NO SON CONTRATOS, Y LA PUERTA QUE LES HACE FALTA.
 *
 * Un generado fuera de `contracts/`: la cabecera de C++ con los literales de la
 * regla de cuarentena, escrita desde el enum del esquema. Vive en el
 * laboratorio porque alli se compila, y se comprueba desde aqui porque el
 * esquema vive aqui.
 *
 * POR QUE NO VALE CON LO QUE YA HAY.
 *
 * La version anterior ataba las dos mitades con dos tests cruzados, uno por
 * lenguaje, y los dos hacen SKIP cuando el repositorio hermano no esta —el
 * clon limpio—. Sin hermano, la mitad de C++ no se puede ni comparar. Con un
 * fichero generado no hay mitad que comparar: hay un fichero, y el `--check`
 * no necesita al hermano para decidir, solo necesita el esquema, que es la
 * unica fuente. Por eso esta lista no comparte puerta con `CONTRATOS`: son
 * cosas distintas y sus fallos se leen distinto.
 *
 * Y el destino puede no existir —el CI de ABDSharedAssets no baja el
 * laboratorio—. El script sale con 0 y lo dice, porque ahi no hay cabecera que
 * comprobar. En el CI de ABDAudioLab el hermano SI esta, y entonces se
 * comprueba de verdad.
 */
export const GENERADOS_FUERA = [
  {
    script: 'scripts/generar-cuarentena-cpp.mjs',
    scriptNpm: 'check:cuarentena-cpp',
    salidas: ['../ABDAudioLab/src/core/HardwareContractQuarantine.generado.h'],
    queEs: 'la cabecera de C++ con los literales de la regla de cuarentena',
    deDondeSale: 'el enum de contracts/hardware_profile.schema.json',
  },
];

export const CONTRATOS = [
  {
    script: 'scripts/generate_modulation_contracts.py',
    scriptNpm: 'check:mod-contracts',
    salidas: [
      'abdeep_modulation_matrix.json',
      'abdms2000_modulation_matrix.json',
      'neuronik_modulation_matrix.json',
    ],
  },
  {
    script: 'scripts/generate_s950_patch_contract.py',
    scriptNpm: 'check:s950-contract',
    salidas: ['s950_patch_fields.json'],
  },
  {
    script: 'scripts/generate_s950_calibration_contract.py',
    scriptNpm: 'check:s950-cal',
    salidas: ['s950_calibration.json'],
  },
  // ── LOS QUE SE DECLARAN GENERADOS Y NO TIENEN GENERADOR ──
  //
  // Esta lista se vacio el 2026-09-30. `fx-effects.json` declaraba
  // `generatedFrom: ABDEep/.../FXSlot_Factory.cpp` sin que hubiera ningun
  // generador que lo produjera, y el campo es la autoridad que un panel lee
  // para fiarse. No se resolvio escribiendo el generador: la fabrica tiene 56
  // `case` y el catalogo 61 filas, y las cinco que sobran (el 0 y del 57 al
  // 60) salen de `ABDSharedCode/DspEffects`. Se resolvio quitandole el campo.
  //
  // La entrada se borro, la MECANICA se queda: si manana un contrato vuelve a
  // declarar de donde sale y no hay `--check` que lo vigile, tiene que
  // aparecer aqui para que el preflight lo pueda decir en voz alta. Una lista
  // vacia es el estado bueno de esta lista, no un sitio que haya que rellenar.
];

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LAS COPIAS DE `contracts/`, Y EL AGUJERO QUE SON.
 *
 * Hay un directorio entero, fuera de este repo, con una copia de estos
 * contratos. No es un symlink ni un artefacto de build: son ficheros, y los
 * carga el registro de C++ cuando no encuentra ni esta copia ni la del hermano
 * (`ABDAudioLab/src/gui/MainContentComponent.cpp`, la cadena de busqueda va de
 * `ABDSharedAssets/contracts` a sibling y de ahi a `contracts/hardware`).
 *
 * El problema no es que exista: es que nadie la compara. Treinta y nueve
 * ficheros, de los que hoy solo UNO —`hardware_profile.schema.json`— es
 * distinto, y se quedo distinto en silencio. Un esquema de perfiles cerrado
 * con `additionalProperties: false` en un sitio y abierto en el otro es
 * exactamente el fallo que este preflight existe para tapar, con la forma
 * nueva: dos verdades y ninguna que avise.
 *
 * Y el orden de la cadena lo hace peor, no mejor: la copia se usa cuando las
 * otras dos NO estan. O sea, que la version vieja solo se ve cuando ya no hay
 * forma de compararla.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE AHORA FALLA, Y QUE SE HACE PARA ARREGLARLO.
 *
 * Antes esto avisaba, y la razon era que un preflight que bloquea el trabajo
 * de otro repo se apaga. La razon era buena, y el diagnostico tambien: el
 * problema de un rojo que salta a diario es que nadie se fia de el.
 *
 * Lo que ha cambiado no es el tono, es el alcance. Esta lista es la UNICA
 * puerta que vigila la copia, y mientras estaba vacia no habia ninguna. El
 * snapshot del laboratorio es lo que sobrevive a una maquina donde no hay
 * repositorio hermano, que es un clon limpio y el CI: ahi no hay con quien
 * compararlo y nadie lo comprueba. Si el origen cambia y la copia no, los dos
 * lados siguen dando verde y el unico sintoma es que un comportamiento medido
 * no se reproduce.
 *
 * Sigue siendo revisable, y de una linea: vaciar `COPIAS_BLOQUEANTES` devuelve
 * el aviso. Lo que ya no puede pasar es que se vacie sin que alguien lo
 * decida, y por eso hay un test que comprueba que la copia del laboratorio
 * esta en la lista.
 *
 * SE ARREGLA COPIANDO, Y POR ESO EL FALLO DICE COMO. Un rojo que dice "la
 * copia esta desfasada" obliga a investigar; uno que dice que ficheros copiar
 * se ejecuta y se acaba. Y los tres casos se listan por separado —distinto,
 * falta, sobra— porque arreglar cada uno es una operacion distinta, y un
 * mensaje que los mezcla obliga a abrir el diff para saber cual es cual.
 *
 * Y de paso sigue en pie: si la copia no existe, no dice nada. Que es lo que
 * tiene que pasar el dia que se borre, que es el arreglo de verdad.
 */
export const COPIAS = [
  {
    // La del laboratorio. Es la unica que se ha encontrado, y se declara a mano
    // por la misma razon que los generadores: descubrirla recorriendo el disco
    // significa que la copia siguiente nace sin vigilar.
    destino: 'ABDAudioLab/contracts/hardware',
    usaComo: 'ultimo recurso de la cadena de busqueda de HardwareContractRegistry',
  },
];

/**
 * Las copias cuyo desfase BLOQUEA el preflight.
 *
 * No es una lista de adorno: una entrada aqui que no estuviera en `COPIAS`
 * seria una puerta que no se abre nunca, porque el preflight solo recorre
 * `COPIAS`. Por eso hay un test que comprueba que toda bloqueante esta
 * declarada, y no al reves.
 */
export const COPIAS_BLOQUEANTES = [
  'ABDAudioLab/contracts/hardware',
];

/**
 * Dice si una copia esta desfasada, y si su desfase bloquea.
 *
 * Es una FUNCION, y no codigo suelto dentro de `main`, por la misma razon que
 * `compararCopia`: la puerta tiene que poder probarse sin desincronizar el
 * snapshot de verdad del laboratorio. El test la ejercita con las cuatro
 * combinaciones de (desfasada, bloqueante) usando datos inventados, que es
 * donde un guard se rompe: cuando un caso se olvida, el rojo sale en la
 * maquina de alguien en lugar de salir en la suite.
 *
 * Que una copia NO exista no es estar desfasada: no hay nada que sincronizar,
 * y ese es un final valido.
 *
 * @param {{destino: string}} copia
 * @param {{existe: boolean, distintos: string[], soloEnOrigen: string[], soloEnCopia: string[]}} resultado
 * @param {string[]} bloqueantes
 * @returns {{destino: string, desfasada: boolean, bloquea: boolean}}
 */
/**
 * Dice si una ruta es un enlace y no un directorio de verdad.
 *
 * Se usa `lstat` y no `stat` a proposito, y es lo unico que lo distingue.
 * `stat` sigue el enlace antes de mirar sus atributos, asi que una junction
 * de `mklink /J` sale como un directorio normal y no se ve. `lstat` mira la
 * entrada en si, que en Windows lleva el bit de punto de reanálisis.
 *
 * Y no es un detalle de esta plataforma: en Linux sale por el mismo sitio
 * con `isSymbolicLink()`, de modo que la comprobacion funciona en los dos
 * sin ramificar por el sistema.
 *
 * @param {string} ruta
 * @returns {boolean}
 */
export function esEnlace(ruta) {
  try {
    return lstatSync(ruta).isSymbolicLink();
  } catch {
    // Una ruta que no existe no es un enlace. Y una que no se puede mirar
    // tampoco, y eso lo recoge la comparacion de mas abajo como "no existe".
    return false;
  }
}

/**
 * Que es esta copia, en una palabra, y si su problema cierra la puerta.
 *
 * Vive fuera de `main()` por una razon concreta: para comprobar esta politica
 * con datos inventados. La politica es lo que decide si el preflight sale con 0
 * o con 1, y probarla dentro de `main()` obligaria a montar una junction de
 * verdad sobre el snapshot del laboratorio para ver que un caso bloquea. Un
 * test que no se puede correr sin tocar el repo no se corre nunca.
 *
 * La politica del enlace es deliberadamente mas dura que la del desfase, y no
 * por simetria: una copia vieja se ha comprobado y ha salido distinta, asi que
 * alguien tiene algo que arreglar. Un enlace no se ha comprobado NADA, asi que
 * lo que hay que arreglar es el preflight. Por eso `ciega` bloquea aunque su
 * destino no este declarado en COPIAS_BLOQUEANTES: no bloquear ahi dejaria a
 * alguien creyendo que el laboratorio vigila un snapshot que no existe.
 *
 * @returns {{caso: 'no-existe'|'ciega'|'desfasada'|'al-dia', bloquea: boolean, desfasada: boolean, puertaCiega: boolean}}
 */
export function clasificarCopia(copia, resultado, bloqueantes = COPIAS_BLOQUEANTES) {
  // No hay copia. No es un fallo: no hay nada que sincronizar, y el dia que
  // se borre —que es el arreglo de verdad— esto tiene que callarse.
  if (!resultado.existe)
    return { caso: 'no-existe', bloquea: false, desfasada: false, puertaCiega: false };

  // Un enlace no es una copia: es una ventana al origen. Compararlo devuelve
  // "todo igual" sobre una cosa que no ha sido comparada con nada, y eso sale
  // verde. Aqui se corta, antes de comparar.
  if (resultado.esEnlace)
    return { caso: 'ciega', bloquea: true, desfasada: false, puertaCiega: true };

  const v = veredictoCopia(copia, resultado, bloqueantes);

  return {
    caso: v.desfasada ? 'desfasada' : 'al-dia',
    bloquea: v.bloquea,
    desfasada: v.desfasada,
    puertaCiega: false,
  };
}

export function veredictoCopia(copia, resultado, bloqueantes = COPIAS_BLOQUEANTES) {
  const desfasada = resultado.existe
    && (resultado.distintos.length > 0
      || resultado.soloEnOrigen.length > 0
      || resultado.soloEnCopia.length > 0);

  // La puerta ciega es un caso aparte de "desfasada", y va aparte a
  // proposito.
  //
  // Una junction al origen no esta desfasada: esta PERFECTA, porque no
  // hay dos cosas que comparar sino una contandose a si misma. Por eso no
  // puede entrar por `desfasada`: esa bandera dice que una comparacion
  // salio distinta, y aqui no se ha comparado nada.
  //
  // Y por eso devuelve su propia razon. Un guard que mezcla "el snapshot
  // esta viejo" con "el snapshot no existe y no lo puedo comprobar" obliga
  // a quien lee el mensaje a abrir el codigo para saber cual de los dos es.
  const puertaCiega = resultado.existe === true && resultado.esEnlace === true;

  return {
    destino: copia.destino,
    desfasada,
    puertaCiega,
    bloquea: bloqueantes.includes(copia.destino),
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LA CUARENTENA, Y EL HUECO QUE ESTA PUERTA TENIA.
 *
 * Este preflight es la puerta que BLOQUEA, vigila el catalogo de contratos
 * entero y lo recorre entero —generadores y copias— y era incapaz de decir que
 * un contrato estaba retenido. No por descuido: porque la regla de retener no
 * estaba escrita en ningun sitio al que este script pudiera mirar. Estaba en el
 * helper de tests de este repo, y un preflight no puede importar de la suite
 * que vigila.
 *
 * Asi que la regla se escribio donde las dos mitades pueden verla —
 * `utils/quarantine.js`— y esta puerta la usa. Es la tercera puerta de la misma
 * regla, junto al registro de C++ del laboratorio y a su adapter.
 *
 * QUE COMPRUEBA, Y QUE NO.
 *
 * Que todo retenido diga POR QUE. Un retenido sin motivo no es un dato
 * incompleto: el laboratorio inventa un texto de relleno y el cajon lo enseña.
 * Lo que sale es un retenido con una explicacion inventada al lado, que es peor
 * que no tener ninguna, porque parece contestada.
 *
 * Que ningun contrato use un estado que la regla no conoce. Ese es el fallo en
 * la direccion contraria: el campo puesto, el valor mal escrito, y NINGUN
 * lenguaje lo va a retener. Quien lo escribio creyo que estaba haciendo algo y
 * no esta haciendo nada.
 *
 * Y que la regla de este repo siga siendo la del esquema. El enum de
 * `hardware_profile.schema.json` y `POLITICA` se comparan aqui. Esa
 * comparacion es la mitad de este lado; la otra mitad la hace un test de C++ en
 * el laboratorio, porque el literal de C++ no se puede compartir con un modulo
 * de JS. Las dos comparan contra el MISMO enum.
 *
 * QUE NO COMPRUEBA, Y POR QUE NO.
 *
 * No dice si un contrato DEBERIA estar retenido. Esa es una decision editorial
 * y el que la toma es quien conoce el Aparato, no un script. Aqui solo se
 * comprueba que si se ha retenido, se ha dicho por que.
 *
 * Y un JSON que no se puede parsear no se cuenta como problema de cuarentena:
 * se cuenta como ilegible, y sale con 2. No es lo mismo que una regla mal
 * guardada —eso se arregla editando un campo— que un fichero que no se puede
 * leer, que se arregla mirando por que esta roto. Un preflight que no
 * distingue los dos miente sobre cual de los dos es.
 *
 * @returns {{problemas: string[], retenidos: object[], leidos: number, ilegibles: string[]}}
 */
export function auditarCuarentena(directorio) {
  const problemas = [];
  const retenidos = [];
  const ilegibles = [];
  let leidos = 0;

  const nombres = existsSync(directorio)
    ? readdirSync(directorio).filter((nombre) => nombre.endsWith('.json')).sort()
    : [];

  // Los esquemas se miran aparte: declaran la regla en vez de cumplirla.
  const esquemas = nombres.filter((n) => n.endsWith('.schema.json'));
  const contratos = nombres.filter((n) => !n.endsWith('.schema.json'));
  const leidosEsquemas = [];

  // Los esquemas NO se comparan todos con la regla. De los que hay, solo el de
  // perfiles de hardware declara `status`; los otros cinco gobiernan cosas que
  // no son un Aparato y no tienen por que poder marcarse. Pedirles el campo
  // pondria en rojo una rama que esta bien.
  //
  // Lo que si se comprueba es que ALGO pueda aplicar la regla. Sin eso, quitar
  // `status` del esquema de perfiles dejaria la cuarentena sin poder usarse en
  // ninguna parte y no habria ni un rojo.
  for (const nombre of esquemas) {
    try {
      leidosEsquemas.push({
        nombre,
        esquema: JSON.parse(readFileSync(join(directorio, nombre), 'utf-8')),
      });
    } catch (exc) {
      ilegibles.push(`${nombre}: no se ha podido leer (${String(exc.message ?? exc)})`);
    }
  }

  if (leidosEsquemas.length > 0 && ningunEsquemaAplica(leidosEsquemas.map((e) => e.esquema))) {
    problemas.push(
      'ningun esquema declara "status", asi que la regla de cuarentena no se puede '
      + 'aplicar a ningun contrato. No es que no haya retenidos: es que ya no hay '
      + 'manera de marcar uno, y el laboratorio dejaria de retener en silencio.');
  }

  for (const { nombre, esquema } of leidosEsquemas) {
    if (!esquemaAplica(esquema))
      continue;

    for (const problema of comprobarContraElEsquema(esquema))
      problemas.push(`${nombre}: ${problema}`);
  }

  for (const nombre of contratos) {
    let contrato;

    try {
      contrato = JSON.parse(readFileSync(join(directorio, nombre), 'utf-8'));
    } catch (exc) {
      ilegibles.push(`${nombre}: no se ha podido leer (${String(exc.message ?? exc)})`);
      continue;
    }

    leidos += 1;
    problemas.push(...auditar(nombre, contrato));

    const motivo = motivoParaMostrar(contrato);

    if (motivo !== null)
      retenidos.push({ nombre, motivo });
  }

  return { problemas, retenidos, leidos, ilegibles };
}

/**
 * El comando que arregla una copia, en el shell de quien esta leyendo.
 *
 * Se imprime en vez de solo describirlo porque el fallo mas caro de un
 * preflight es el que obliga a investigar. Esta linea lo cierra.
 */
function comandoCopiar(destino) {
  const bs = String.fromCharCode(92);
  const d = destino.split('/').join(bs);

  if (process.platform === 'win32')
    return `xcopy /Y /I "ABDSharedAssets${bs}contracts${bs}*.json" "..${d}${bs}"`;

  return `cp ABDSharedAssets/contracts/*.json ../${destino}/`;
}

/**
 * Compara una copia contra `contracts/`.
 *
 * Byte a byte, no "el mismo JSON": dos ficheros con el mismo contenido y
 * distinto formato son la misma verdad, y un preflight que los declara
 * distintos obliga a normalizar formato por formato, que es trabajo de nadie.
 *
 * @returns {{existe: boolean, iguales: string[], distintos: string[], soloEnOrigen: string[], soloEnCopia: string[]}}
 */
export function compararCopia(destino) {
  const vacio = {
    existe: false,
    esEnlace: false,
    apuntaA: null,
    iguales: [],
    distintos: [],
    soloEnOrigen: [],
    soloEnCopia: [],
  };
  const dir = join(root, '..', destino);

  if (!existsSync(dir)) return vacio;

  // Si esto es un enlace se registra AHORA. El resto de la comparacion
  // sigue, porque el contenido de un enlace se puede leer, y esa lectura
  // es justo lo que hace el daño: sale "40 ficheros iguales" sobre una
  // copia que no existe.
  const enlace = esEnlace(dir);

  let apuntaA = null;

  if (enlace) {
    try {
      apuntaA = realpathSync(dir);
    } catch {
      apuntaA = null;
    }
  }

  const json = (d) => (existsSync(d)
    ? readdirSync(d).filter((n) => n.endsWith('.json')).sort()
    : []);

  const origen = json(join(root, 'contracts'));
  const copiados = json(dir);
  const enOrigen = new Set(origen);
  const enCopia = new Set(copiados);
  const iguales = [];
  const distintos = [];

  for (const nombre of origen) {
    if (!enCopia.has(nombre)) continue;
    const a = readFileSync(join(root, 'contracts', nombre));
    const b = readFileSync(join(dir, nombre));
    (a.equals(b) ? iguales : distintos).push(nombre);
  }

  return {
    existe: true,
    esEnlace: enlace,
    apuntaA,
    iguales,
    distintos,
    soloEnOrigen: origen.filter((n) => !enCopia.has(n)),
    soloEnCopia: copiados.filter((n) => !enOrigen.has(n)),
  };
}

/** Como se pide python. En Windows `python` y en Unix `python3` son cosas distintas. */
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

/** Cuanto puede tardar un `--check` antes de darse por colgado. 120 s por generador: uno lee codigo de otros repos, y eso es lento. */
const TIEMPO_MS = 120000;

/**
 * Corre un generador en modo `--check`.
 *
 * @returns {{codigo: number, salida: string, colgado: boolean, noExiste: boolean}}
 */
export function correrCheck(script) {
  const ruta = join(root, script);

  if (!existsSync(ruta))
    return { codigo: 2, salida: '', colgado: false, noExiste: true };

  const r = spawnSync(PYTHON, [ruta, '--check'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: TIEMPO_MS,
    windowsHide: true,
  });

  if (r.error) {
    // Un spawn que falla del todo suele ser python ausente. Se distingue del
    // caso de un generador que sale con 2, que es un problema de codigo.
    return { codigo: 2, salida: String(r.error.message ?? r.error), colgado: false, noExiste: false };
  }

  if (r.signal)
    return { codigo: 2, salida: `el proceso ha terminado con la senal ${r.signal}`, colgado: true, noExiste: false };

  return {
    codigo: typeof r.status === 'number' ? r.status : 2,
    salida: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    colgado: false,
    noExiste: false,
  };
}

/**
 * Corre un generador de Node en modo `--check`.
 *
 * Y existe al lado de `correrCheck`, no dentro de ella, porque los dos no son
 * el mismo Lenguaje: `correrCheck` invoca Python y por eso no admite argumentos,
 * y este generador es JavaScript y necesita pasarle `--check` como argumento. La
 * forma de volver es la misma a proposito —codigo, salida, colgado, no existe—
 * para que quien llama no tenga que saber de que lenguaje es cada cosa.
 *
 * `process.execPath` y no la palabra `node`: es el mismo Node que esta corriendo
 * el preflight, sin depender de que haya otro en el PATH con otra version.
 *
 * @param {string} script relativo a la raiz de este paquete
 * @param {string[]} [args]
 * @returns {{codigo: number, salida: string, colgado: boolean, noExiste: boolean}}
 */
export function correrNode(script, args = []) {
  const ruta = join(root, script);

  if (!existsSync(ruta))
    return { codigo: 2, salida: '', colgado: false, noExiste: true };

  const r = spawnSync(process.execPath, [ruta, ...args], {
    cwd: root,
    encoding: 'utf-8',
    timeout: TIEMPO_MS,
    windowsHide: true,
  });

  if (r.error)
    return { codigo: 2, salida: String(r.error.message ?? r.error), colgado: false, noExiste: false };

  if (r.signal)
    return { codigo: 2, salida: `el proceso ha terminado con la senal ${r.signal}`, colgado: true, noExiste: false };

  return {
    codigo: typeof r.status === 'number' ? r.status : 2,
    salida: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    colgado: false,
    noExiste: false,
  };
}

/** Los `scripts.` de `package.json` cuyo nombre empieza por el prefijo dado. */
export function scriptsQueEmpiezanPor(man, prefijo) {
  return Object.keys(man.scripts ?? {}).filter((k) => k.startsWith(prefijo));
}

function main() {
  let man;

  try {
    man = manifiesto();
  } catch (exc) {
    console.error('PREFLIGHT: no puedo leer el manifiesto.');
    console.error(String(exc.message ?? exc));
    return 2;
  }

  // ── Que el inventario y el manifiesto no se hayan desincronizado ──
  //
  // Este script corre los generadores, pero el CI y los docs citan los
  // `scripts.` de `package.json`. Si uno de los de aqui no existe ahi, quien
  // lea el mensaje de fallo va a correr un comando que no existe y pierde el
  // rato justo cuando menos puede. Se avisa ANTES de correr nada.
  const sinGenerador = CONTRATOS.filter((c) => c.sinGenerador);

  const faltan = CONTRATOS.filter(
    (c) => !c.sinGenerador && !man.scripts?.[c.scriptNpm],
  );

  if (faltan.length > 0) {
    console.error('PREFLIGHT: el inventario y package.json no coinciden.');
    for (const c of faltan)
      console.error(`  falta el script "${c.scriptNpm}" para ${c.script}`);
    return 2;
  }

  console.log('PREFLIGHT de contratos generados');
  console.log('='.repeat(72));

  const desfasados = [];
  const ilegibles = [];

  for (const c of CONTRATOS) {
    // Un contrato que declara `generatedFrom` y no tiene generador se avisa y
    // se sigue. No se cuenta como desfasado —no se puede saber si lo esta— ni
    // se deja pasar en silencio, que es lo que hacia el inventario viejo.
    if (c.sinGenerador) {
      console.log(`  SIN GENERADOR  ${c.salidas.join(', ')}`);
      console.log('                 declara generatedFrom pero no hay script que lo regenere');
      continue;
    }

    const r = correrCheck(c.script);

    if (r.noExiste) {
      ilegibles.push(`${c.script}: el generador no existe`);
      console.log(`  SIN GENERADOR  ${c.script}`);
      continue;
    }

    if (r.codigo === 0) {
      console.log(`  al dia         ${c.salidas.join(', ')}`);
      continue;
    }

    // ── Aqui se separan las dos cosas que se parecian ──
    //
    // Codigo 2 y mas: el generador no ha podido LEER sus fuentes. No es que el
    // contrato este viejo, es que el preflight no puede saber si lo esta. Se
    // cuenta aparte y se dice aparte, porque arreglarlo y lo otro son cosas
    // distintas: uno se regenera, el otro se arregla.
    if (r.codigo === 2) {
      ilegibles.push(`${c.script}: no ha podido leer sus fuentes`);
      console.log(`  NO SE PUEDE    ${c.script} (salida ${r.codigo})`);
      if (r.colgado) console.log(`                 se ha colgado: puede ser que falte python`);
      for (const linea of r.salida.split('\n').filter(Boolean).slice(0, 4))
        console.log(`                 ${linea}`);
      continue;
    }

    desfasados.push(c);
    console.log(`  DESFASADO      ${c.salidas.join(', ')}`);

    for (const linea of r.salida.split('\n').filter(Boolean).slice(0, 6))
      console.log(`                 ${linea}`);
  }

  console.log('='.repeat(72));

  // ── El resumen: los dos fallos, y por qué son dos ──
  //
  // Se cuentan TODOS antes de salir. Un preflight que para en el primero es un
  // preflight que obliga a tres viajes para arreglar tres contratos, y el
  // tercero se queda sin comprobar hasta que alguien se acuerde.
  if (desfasados.length > 0) {
    console.log('');
    console.log(`DESFASADOS (${desfasados.length}):`);
    for (const c of desfasados) console.log(`  ${c.script}: ${c.salidas.join(', ')}`);
    console.log('');
    console.log('Un panel esta dibujando con un contrato viejo. Se regenera con:');
    // SOLO los comandos de los que estan desfasados, y nunca el del contrato sin
    // generador. Recorrer `CONTRATOS` entero aqui hacia dos cosas malas: el
    // `scriptNpm` del que no tiene generador es null y reventaba el script
    // entero —que es justo lo que hacia, caerse cuando hay algo que avisar— y
    // ademas ofrecia regenerar contratos que estan al dia, que es ruido que
    // manda a tocar ficheros que no hay que tocar.
    for (const c of desfasados) console.log(`  pnpm ${c.scriptNpm.replace(/^check:/, 'generate:')}`);
  }

  if (ilegibles.length > 0) {
    console.log('');
    console.log(`NO SE HAN PODIDO COMPROBAR (${ilegibles.length}):`);
    for (const i of ilegibles) console.log(`  ${i}`);
    console.log('');
    console.log('Esto NO es un contrato desfasado: es que el generador no ha podido');
    console.log('leer sus fuentes, asi que nadie sabe si el contrato esta al dia.');
    console.log('Regenerar no lo arregla. Mira la tabla que lee el generador.');
  }

  if (sinGenerador.length > 0) {
    console.log('');
    console.log(`SIN GENERADOR (${sinGenerador.length}):`);
    for (const c of sinGenerador) console.log(`  ${c.salidas.join(', ')}`);
    console.log('');
    console.log('Declaran `generatedFrom` pero no hay script que los regenere ni --check');
    console.log('que los vigile. Nadie sabe si estan al dia, y el campo dice que si.');
  }

  // ── Lo generado que no es un contrato, antes de las copias ──
  //
  // Antes que nada lo demas, porque es lo barato y es lo que mas duele cuando
  // se queda viejo: una cabecera desfasada deja a C++ mirando un nombre que el
  // esquema ya no declara, y `evaluar` devuelve "no retenido" para siempre.
  const generadosDesfasados = [];

  for (const g of GENERADOS_FUERA) {
    if (!existsSync(join(root, g.script))) {
      console.log(`  sin generador  ${g.queEs} (no esta ${g.script})`);
      generadosDesfasados.push({ ...g, codigo: 2, salida: 'el script no existe' });
      continue;
    }

    const r = correrNode(g.script, ['--check']);
    const etiqueta = r.codigo === 0 ? 'al dia' : 'DESFASADO';

    console.log(`  generado ${etiqueta.padEnd(9)} ${g.queEs}, desde ${g.deDondeSale}`);

    if (r.codigo === 0)
      continue;

    generadosDesfasados.push({ ...g, codigo: r.codigo, salida: r.salida });

    if (r.colgado) {
      console.log('                 el generador se ha pasado de tiempo sin responder');
      continue;
    }

    for (const linea of r.salida.split('\n').filter((l) => l.trim() !== '').slice(0, 8))
      console.log(`                 ${linea.trim()}`);
  }

  if (generadosDesfasados.length > 0) {
    console.log('');
    console.log(`GENERADOS DESFASADOS (${generadosDesfasados.length}):`);
    for (const g of generadosDesfasados)
      console.log(`  ${g.queEs}  ${g.script} salio con ${g.codigo}`);
    console.log('');
    console.log('Un generado desfasado no es un contrato viejo: es codigo que no se ha');
    console.log('vuelto a escribir despues de que cambiara su fuente. SE ARREGLA ASI:');

    for (const g of generadosDesfasados) {
      if (g.codigo === 2) continue;
      console.log('');
      console.log(`  ${g.queEs}:`);
      console.log(`      pnpm ${g.scriptNpm.replace(/^check:/, 'generate:')}`);
    }

    console.log('');
    console.log('Y si el --check dice que el script no existe, el arreglo es escribirlo,');
    console.log('no regenerar.');
  }

  // ── Las copias, y aqui es donde el aviso se vuelve puerta ──
  //
  // Las ciegas van en su propia lista y no en la de las desfasadas porque no
  // son lo mismo. Una desfasada se ha comparado y ha salido distinta. Una
  // ciega no se ha comparado: se ha leido a traves de un enlace, que es mirar
  // el origen y llamarlo copia. Meterlas en la misma lista obligaria a quien
  // lee el mensaje a adivinar cual de las dos cosas ha pasado.
  const copiasDesfasadas = [];
  const copiasCiegas = [];

  for (const c of COPIAS) {
    const r = compararCopia(c.destino);
    const caso = clasificarCopia(c, r);

    if (caso.caso === 'no-existe') {
      console.log(`  sin copia      ${c.destino} (no existe, y no hace falta)`);
      continue;
    }

    // La comparacion se salta entera a proposito. Compararla no daria un
    // error: daria "40 ficheros iguales" leyendo el origen a traves del
    // enlace, que es la razon exacta de este caso.
    if (caso.caso === 'ciega') {
      copiasCiegas.push({ ...c, ...r, bloquea: caso.bloquea });
      const donde = r.apuntaA === null ? '(destino ilegible)' : r.apuntaA;
      console.log(`  COPIA CIEGA   ${c.destino}`);
      console.log(`                 es un enlace a ${donde}`);
      console.log('                 no se ha comparado nada: leer el enlace es leer el origen');
      console.log(`                 se usa como ${c.usaComo}`);
      continue;
    }

    if (caso.caso === 'al-dia') {
      console.log(`  copia al dia   ${c.destino} (${r.iguales.length} ficheros iguales)`);
      continue;
    }

    copiasDesfasadas.push({ ...c, ...r, bloquea: caso.bloquea });
    console.log(`  COPIA VIEJA    ${c.destino}`);
    console.log(`                 ${r.distintos.length} distintos, ${r.iguales.length} iguales`);
    console.log(`                 se usa como ${c.usaComo}`);

    // Los tres casos por separado, porque se arreglan distinto: los dos
    // primeros se resuelven copiando, el tercero se resuelve borrando.
    for (const n of r.distintos)
      console.log(`                 distinto: ${n}  (el origen cambio, la copia no)`);
    for (const n of r.soloEnOrigen)
      console.log(`                 falta en la copia: ${n}`);
    for (const n of r.soloEnCopia)
      console.log(`                 sobra en la copia: ${n}  (esta en la copia y no en el origen)`);
  }

  const copiasBloqueantes = [...copiasDesfasadas, ...copiasCiegas]
    .filter((c) => c.bloquea);

  if (copiasCiegas.length > 0) {
    console.log('');
    console.log(`COPIAS QUE NO SON COPIAS (${copiasCiegas.length}):`);
    for (const c of copiasCiegas) {
      const donde = c.apuntaA === null ? '(destino ilegible)' : c.apuntaA;
      console.log(`  ${c.destino}  ->  ${donde}`);
    }
    console.log('');
    console.log('No es un desfase: es una copia que no existe porque es una junction.');
    console.log('El preflight la recorre, ve el origen a traves del enlace y dice que');
    console.log('los ficheros son iguales. No ha comparado dos cosas: ha comparado una');
    console.log('consigo misma, y por eso sale verde.');
    console.log('');
    console.log('SE ARREGLA ASI:');
    console.log('');
    console.log('  1. Borra el enlace. SIN /S, y a proposito: /S se lleva por delante');
    console.log('     el directorio al que apunta.');
    console.log('       cmd //c rmdir "\\ABDAudioLab\\contracts\\hardware"');
    console.log('');
    console.log('  2. Deja un directorio de verdad y copia dentro los .json del origen:');
    console.log('       xcopy /Y /I "\\ABDSharedAssets\\contracts\\*.json"');
    console.log('                  "\\..\\ABDAudioLab\\contracts\\hardware\\"');
    console.log('');
    console.log('  Si prefieres no tener la copia, la alternativa es borrar el');
    console.log('  destino y que el laboratorio lea el repositorio hermano. Pero eso');
    console.log('  se decide a mano; el preflight solo dice que aqui no hay nada que');
    console.log('  comparar.');
  }

  if (copiasDesfasadas.length > 0) {
    console.log('');
    console.log(`COPIAS DESFASADAS (${copiasDesfasadas.length}):`);
    for (const c of copiasDesfasadas)
      console.log(`  ${c.destino}${c.bloquea ? '  [BLOQUEANTE]' : '  [solo aviso]'}`);
    console.log('');
    console.log('No es un contrato generado que este viejo: es una COPIA que se ha quedado');
    console.log('vieja. El original de arriba esta bien.');
    console.log('');
    console.log('SE ARREGLA ASI:');
    console.log('');
    console.log('  1. Copia los .json del origen encima de la copia:');

    for (const c of copiasDesfasadas)
      console.log(`       ${comandoCopiar(c.destino)}`);

    console.log('');
    console.log('  2. Si la copia no hace falta —el laboratorio tiene el repositorio');
    console.log('     hermano al lado—, el arreglo de verdad es borrar el directorio.');
    console.log('     Una copia que nadie sincroniza es justo lo que ha creado esto.');
    console.log('');
    console.log('  3. Si has anadido o quitado ficheros, los recuentos del inventario');
    console.log('     del laboratorio (cuantos contratos y cuantos schemas) cambian');
    console.log('     tambien, o su test fallara por otra causa y no por esta.');
  }

  // ── La cuarentena, que hasta ahora no la miraba nadie desde aqui ──
  //
  // Se imprime SIEMPRE, tambien cuando todo esta bien, y no solo el recuento:
  // el recuento es lo que se lee para saber si algo va mal, y el motivo de cada
  // retenido es lo que se lee para entender por que un Aparato no aparece. Un
  // preflight que solo dice "1 retenido" obliga a abrir el repo; uno que dice
  // cual y por que, no.
  const cuarentena = auditarCuarentena(join(root, 'contracts'));

  if (cuarentena.retenidos.length > 0) {
    console.log(`  en cuarentena ${cuarentena.retenidos.length} (retenido por el`
      + ' catalogo, no se cargan y se muestran en el cajon con su motivo):');

    for (const r of cuarentena.retenidos)
      console.log(`                 ${r.nombre}  ${r.motivo}`);
  } else {
    console.log('  en cuarentena 0');
  }

  if (cuarentena.problemas.length > 0) {
    console.log('');
    console.log(`CUARENTENA MAL DECLARADA (${cuarentena.problemas.length}):`);
    for (const p of cuarentena.problemas) console.log(`  ${p}`);
    console.log('');
    console.log('No es un contrato viejo: es una marca de retencion que no se sostiene.');
    console.log('Un retenido sin motivo aparece en el cajon con un texto de relleno, que');
    console.log('es peor que no aparecer. Un estado mal escrito no lo retiene NINGUN');
    console.log('lenguaje, asi que el contrato sale del cajon sin estar marcado de nada.');
    console.log('SE ARREGLA EDITANDO EL FICHERO:');
    console.log('  - retenido sin statusReason -> escribir statusReason');
    console.log('  - status que no es "quarantined" -> o se corrige a ese valor, o se');
    console.log('    quita el campo; un estado que la regla no conoce no retiene nada');
  }

  if (cuarentena.ilegibles.length > 0) {
    console.log('');
    console.log(`CONTRATOS QUE NO SE HAN PODIDO LEER (${cuarentena.ilegibles.length}):`);
    for (const i of cuarentena.ilegibles) console.log(`  ${i}`);
    console.log('');
    console.log('Esto NO es un problema de cuarentena: es que hay un JSON roto en el');
    console.log('catalogo y no se puede mirar. Salir con 1 diria "el contrato esta');
    console.log('viejo, regenera", que es mentira: regenerar no arregla un parser roto.');
  }

  if (generadosDesfasados.length > 0) {
    console.log('');
    console.log(`preflight FALLIDO: ${generadosDesfasados.length} generado(s) fuera de contracts/ desfasado(s).`);
    return 1;
  }

  if (copiasBloqueantes.length > 0) {
    console.log('');
    const bloqueantesDesfasadas = copiasDesfasadas.filter((c) => c.bloquea).length;
    const bloqueantesCiegas = copiasCiegas.filter((c) => c.bloquea).length;

    // La coletilla del enlace es CONDICIONAL, y hace falta que lo sea. Con la
    // frase fija, un desfase normal —que es el caso de todos los dias— salia
    // anunciando '0 sin comprobar, por ser un enlace'. Eso no es ruido: es
    // una frase que manda a mirar un enlace que no existe, mientras el
    // fichero que hay que copiar esta tres lineas mas arriba.
    const porEnlace = bloqueantesCiegas > 0
      ? `, ${bloqueantesCiegas} sin comprobar por ser un enlace`
      : '';

    console.log(`preflight FALLIDO: ${copiasBloqueantes.length} copia(s) bloqueante(s):`
      + ` ${bloqueantesDesfasadas} desfasada(s)${porEnlace}.`);
    return 1;
  }

  // Y estos dos, antes de que el resumen pueda decir que todo esta bien.
  if (cuarentena.problemas.length > 0) {
    console.log('');
    console.log(`preflight FALLIDO: ${cuarentena.problemas.length} problema(s) de cuarentena.`);
    return 1;
  }

  if (cuarentena.ilegibles.length > 0) {
    console.log('');
    console.log('preflight INCOMPLETO: hay contratos del catalogo que nadie ha podido leer.');
    return 2;
  }

  if (desfasados.length > 0 && ilegibles.length > 0) return 1;

  if (desfasados.length > 0) {
    console.log('');
    console.log('preflight FALLIDO. Nada de esto deberia llegar a la rama.');
    return 1;
  }

  if (ilegibles.length > 0) {
    console.log('');
    console.log('preflight INCOMPLETO: hay contratos que nadie ha podido comprobar.');
    return 2;
  }

  const conCopias = COPIAS.length > 0
    ? `, y ${COPIAS.length} copia(s) vigilada(s) esta(n) al dia`
    : '';

  // El numero de retenidos va aqui y no solo arriba porque este es el sitio que
  // alguien lee cuando todo lo demas esta en verde, y "todo al dia" con un
  // Aparato escondido dentro no es un resumen honesto.
  const conCuarentena = cuarentena.retenidos.length > 0
    ? `, y ${cuarentena.retenidos.length} contrato(s) retenido(s) por cuarentena, `
      + 'todos con motivo'
    : ', y ninguno retenido por cuarentena';

  console.log(`preflight OK: ningun contrato generado esta desfasado${conCopias}`
    + `${conCuarentena}.`);
  return 0;
}

// Solo cuando se ejecuta como programa. Importado desde un test, no.
if (process.argv[1] && existsSync(process.argv[1])
    && process.argv[1].replace(/\\/g, '/').endsWith('check-generated-contracts.mjs'))
  process.exit(main());
