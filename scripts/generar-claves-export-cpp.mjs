#!/usr/bin/env node
/**
 * GENERA la cabecera de C++ con las claves de JSON que escribe el laboratorio.
 *
 * Las claves las DECLARA `scripts/claves-export-medicion.json`, una por struct
 * que las escribe, con su tipo y con lo que significan. Este script lee ese
 * fichero y escribe `MeasurementExportKeys.generado.h`, que es lo unico que el
 * C++ deberia usar para nombrar una clave.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE HACE FALTA, Y POR QUE NO ES LO DE SIEMPRE
 *
 * Las claves estaban tecleadas en `MeasurementSerialization.cpp` y en
 * `MeasurementContainerExporter.cpp`, y ningun contrato del repositorio las
 * declaraba. Un renombrado en el lado que lee dejaba al laboratorio escribiendo
 * la clave vieja, y el fallo es SILENCIOSO por construccion: el JSON sale bien
 * formado, el panel no encuentra lo que busca, y no hay ni rojo ni crash. Es lo
 * que mas caro hay, porque no se parece a un fallo.
 *
 * Y ya habia pasado. Con `minVal`/`maxVal`/`defaultVal`: el esquema no los
 * declaraba, dos parsers de C++ seguian leyendo con el nombre corto, y 68
 * controles de este catalogo cargaron con el 0.0/1.0/0.5 del parser en vez de
 * con su valor de fabrica. Un knob que va a 0.65 porque si.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA GENERADO Y LO QUE SIGUE TECLEADO, Y POR QUE
 *
 * Solo la exportacion de modulacion y calibracion. Las claves del manifiesto,
 * de los artefactos y de las curvas siguen escritas a mano, a proposito:
 * declararlas aqui seria ampliar el contrato sin un fallo que lo justifique, y
 * una lista de nombres que nadie vigila se queda vieja igual. Las que SI van al
 * manifiesto estan marcadas una a una en el catalogo, porque esa asimetria no
 * se deduce leyendo el JSON: un grupo trae catorce campos en un sitio y cuatro en
 * otro, y quien lo lea no tiene por donde saber cual es el bueno.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE LOS ALIAS LLEVAN EL NOMBRE DEL SUBOBJECTO DELANTE
 *
 * `rateHz`, `depth` y `waveform` tienen las MISMAS claves internas: `name`,
 * `value`, `unit`, `status`, `reason`. Si el alias fuera solo el nombre, tres
 * claves distintas del JSON se llamarian igual en C++, y renombrar una pondria
 * las otras dos en silencio sin que el compilador dijera nada — que es
 * exactamente el fallo que este fichero existe para cerrar. Con el prefijo,
 * `rateHz_name` y `depth_name` son cosas distintas, y el renombrado de una
 * rompe la compilacion de la que se renombro y solo de esa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS TRES NOMBRES TECLEADOS EN ESTE FICHERO
 *
 * La ruta del catalogo, la de la cabecera, y el nombre de la palabra que
 * marca las claves del manifiesto. Los tres estan en constantes y se comparan
 * contra lo que el generador dice de si mismo, para que un renombrado aqui no
 * ponga en rojo al generador y deje en verde al que escribe.
 *
 *   node scripts/generar-claves-export-cpp.mjs          escribe la cabecera
 *   node scripts/generar-claves-export-cpp.mjs --check  compara y sale con 1
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** El catalogo que DECLARA las claves. Es la unica fuente. */
export const CATALOGO = path.resolve(aqui, 'claves-export-medicion.json');

/** La cabecera que se escribe. Vive en el hermano, que es quien la compila. */
export const DESTINO = path.resolve(
  aqui, '..', '..', 'ABDAudioLab', 'src', 'measurement',
  'MeasurementExportKeys.generado.h',
);

/**
 * La palabra que marca las claves que van tambien al manifiesto.
 *
 * Va aqui y no en un literal por el mismo motivo que `CATALOGO`: si el nombre
 * se escribe en dos sitios, buscar donde se declara el manifesto es buscar en
 * dos ficheros, y el que se queda viejo es el que nadie mira.
 */
export const MARCA_MANIFIESTO = 'vaAlManifiesto';

/** Los tipos que el generador sabe escribir en la cabecera. */
const TIPOS = new Set(['texto', 'numero', 'entero', 'booleano', 'objeto', 'array']);

/**
 * Que se puede generar con una clave: el nombre tiene que servir de identificador
 * de C++, porque de ahi sale el alias.
 *
 * No es una formality. El alias del grupo es el NOMBRE de la clave con la
 * primera letra en minuscula, y un nombre con guion o con punto generaria algo
 * que no compila — lo que seria mejor que un alias silenciosamente distinto del
 * nombre. Se comprueba aqui para que el error salga en el generador, que no
 * depende de un compilador.
 */
const IDENTIFICADOR = /^[a-z][A-Za-z0-9]*$/;

/**
 * Lee el catalogo y falla si no se puede generar nada de el.
 *
 * Cada problema se NOMBRA, y en el sitio donde esta: un catalogo con tres
 * grupos y una clave mala tiene que decir cual es. Un mensaje que solo dijera
 * "el catalogo esta mal" obligaria a abrir el fichero entero a adivinar, que es
 * lo que se hace cuando un generador no dice nada.
 *
 * Lo que NO hace es elegir. Si dos claves se llaman igual dentro de un grupo, o
 * si una clave declara un tipo que no existe, se para. Rellenar el hueco con un
 * valor inventado seria escribir una clave que el contrato no respalda, que es
 * justo la mitad de lo que este fichero viene a impedir.
 *
 * @param {string} [rutaCatalogo]
 * @returns {{grupos: Array<object>, claves: Array<object>}}
 * @throws {Error} si el catalogo no se sostiene
 */
export function leerCatalogo(rutaCatalogo = CATALOGO) {
  const bruto = readFileSync(rutaCatalogo, 'utf8');

  let documento;
  try {
    documento = JSON.parse(bruto);
  }
  catch (e) {
    throw new Error('el catalogo no es JSON: ' + e.message);
  }

  const gruposDeclarados = documento?.grupos;

  if (!Array.isArray(gruposDeclarados) || gruposDeclarados.length === 0) {
    throw new Error(
      'el catalogo no declara una lista no vacia de grupos. Un catalogo sin grupos '
      + 'no escribe ninguna clave, y eso parece funcionar hasta que el laboratorio '
      + 'vuelve a teclear literales.');
  }

  // El orden de los grupos es el orden de la cabecera, y de ahi el del JSON que
  // sale, porque `ordered_json` conserva el de insercion. Por eso se comprueba
  // que el `code` no este repetido: dos grupos con el mismo nombre generarian dos
  // namespaces que se pisan, y el segundo se escribiria encima del primero sin aviso.
  const repetidos = gruposDeclarados
    .map((g) => g?.code)
    .filter((c, i, todos) => todos.indexOf(c) !== i);

  if (repetidos.length > 0)
    throw new Error('el catalogo declara mas de un grupo con el codigo ' + repetidos.join(' y ')
      + '. No son dos grupos: es el mismo dos veces, y el segundo se escribiria encima del primero.');

  const grupos = [];
  const claves = [];

  for (const grupo of gruposDeclarados) {
    const donde = 'el grupo ' + (grupo?.code ?? '(sin code)');

    if (typeof grupo?.code !== 'string' || !IDENTIFICADOR.test(grupo.code))
      throw new Error(donde + ' no tiene un `code` que sirva de namespace de C++.');

    if (typeof grupo.queEscribe !== 'string' || grupo.queEscribe.length < 20)
      throw new Error(donde + ' no dice que funcion lo escribe. Sin eso, arreglar un renombrado '
        + 'obliga a abrir el repositorio entero.');

    // El contenedor puede no existir: un grupo puede colgar de la raiz del
    // documento. Lo que no puede es llevar un nombre que no sea identificador,
    // porque sale igual que el resto de alias.
    if (grupo.claveContenedor !== null
      && (typeof grupo.claveContenedor !== 'string' || !IDENTIFICADOR.test(grupo.claveContenedor))) {
      throw new Error(donde + ' tiene un `claveContenedor` que no sirve de identificador, o null '
        + 'si el grupo cuelga de la raiz.');
    }

    const declaradas = grupo.claves;

    if (!Array.isArray(declaradas) || declaradas.length === 0)
      throw new Error(donde + ' no declara ninguna clave. Un grupo vacio no genera nada.');

    const leidas = declaradas.map((clave, i) => leerClave(clave, `${donde}, clave ${i}`));

    // Dos claves con el mismo nombre dentro de un grupo son la misma clave dos
    // veces. En el JSON eso no se ve: sale una, y la segunda asignacion pisa la
    // primera en silencio.
    const repetidas = leidas
      .map((c) => c.nombre)
      .filter((n, j, todos) => todos.indexOf(n) !== j);

    if (repetidas.length > 0)
      throw new Error(`${donde} declara mas de una clave llamada ${repetidas.join(' y ')}. `
        + 'En el JSON solo sale una, y la segunda pisa a la primera sin avisar.');

    grupos.push({
      code: grupo.code,
      queEscribe: grupo.queEscribe,
      nota: typeof grupo.nota === 'string' ? grupo.nota : '',
      claveContenedor: grupo.claveContenedor,
      claves: leidas,
    });

    for (const clave of leidas) {
      claves.push({ ...clave, grupo: grupo.code, contenedor: grupo.claveContenedor });
    }
  }

  return { grupos, claves };
}

/**
 * Una clave, comprobada por separado.
 *
 * Las claves anidadas —las de `thresholds`, `latencyBreakdown`, `rateHz`— se
 * leen con la misma regla que las de fuera, y por eso la comprobacion es
 * recursiva en vez de treatingas como un caso aparte. Un grupo de dentro que no
 * cumple lo mismo que uno de fuera no tendria por que ser un caso especial, y
 * un caso especial es un sitio donde la puerta no llega.
 */
function leerClave(clave, donde) {
  const nombre = clave?.nombre;
  const tipo = clave?.tipo;
  const queEs = clave?.queEs;

  if (typeof nombre !== 'string' || !IDENTIFICADOR.test(nombre)) {
    throw new Error(donde + ' no declara un `nombre` que sea identificador de C++. El alias sale de '
      + 'ahi, asi que un nombre con guion no tendria ni donde esconderse.');
  }

  if (typeof tipo !== 'string' || !TIPOS.has(tipo)) {
    throw new Error(donde + ` ("${nombre}") declara el tipo "${tipo}", que no es uno de `
      + [...TIPOS].join(', ') + '. El tipo no es decoracion: es lo que hace que una clave que pasa '
      + 'de numero a texto se note sin abrir el C++.');
  }

  if (typeof queEs !== 'string' || queEs.length < 20) {
    throw new Error(donde + ` ("${nombre}") no dice que es el dato. Una clave cuyo sentido no esta `
      + 'escrito es un nombre, y un nombre no se puede revisar.');
  }

  // Un `porDefecto` que no cabe en el tipo declarado es un default que el C++
  // no va a poder usar: se perderia al convertir, o mejor, se convertira a otra
  // cosa sin decir nada. Se comprueba aqui y no en la cabecera porque aqui se
  // puede decir QUE clave es la que no encaja.
  if ('porDefecto' in clave) {
    const d = clave.porDefecto;

    if (tipo === 'texto' && typeof d !== 'string')
      throw new Error(donde + ` ("${nombre}") es de texto y su porDefecto no es una cadena. `
        + 'Al leerlo, la conversion daria una clave que el contrato no declara.');

    if ((tipo === 'numero' || tipo === 'entero') && typeof d !== 'number')
      throw new Error(donde + ` ("${nombre}") es numerica y su porDefecto no es un numero. `
        + 'Un default de otro tipo es el 0 silencioso que la lectura devuelve cuando la clave no esta.');

    if (tipo === 'booleano' && typeof d !== 'boolean')
      throw new Error(donde + ` ("${nombre}") es booleana y su porDefecto no lo es.`);
  }

  const dentro = clave.de;

  // Solo un objeto puede tener claves dentro. Un array con `de` seria un array
  // de subobjetos, y entonces el generador tendria que saber tambien el nombre
  // de cada elemento, que es informacion que este formato no tiene.
  if (dentro !== undefined) {
    if (tipo !== 'objeto')
      throw new Error(donde + ` ("${nombre}") declara claves dentro pero es de tipo "${tipo}". `
        + 'Solo un objeto las puede tener.');

    if (!Array.isArray(dentro) || dentro.length === 0)
      throw new Error(donde + ` ("${nombre}") declara un "de" vacio. Un objeto sin claves dentro no `
        + 'genera nada y no tiene por que estar declarado.');

    const hijas = dentro.map((c, i) => leerClave(c, `${donde} -> "${nombre}", clave ${i}`));

    const repetidas = hijas
      .map((c) => c.nombre)
      .filter((n, j, todos) => todos.indexOf(n) !== j);

    if (repetidas.length > 0)
      throw new Error(`${donde} -> "${nombre}" declara mas de una clave llamada `
        + repetadas.join(' y ') + '. Las de dentro tienen la misma regla que las de fuera.');

    return {
      nombre,
      tipo,
      queEs,
      porDefecto: clave.porDefecto,
      vaAlManifiesto: clave[MARCA_MANIFIESTO] === true,
      de: hijas,
    };
  }

  return {
    nombre,
    tipo,
    queEs,
    porDefecto: clave.porDefecto,
    vaAlManifiesto: clave[MARCA_MANIFIESTO] === true,
    de: null,
  };
}

/** El nombre del alias de una clave, en su namespace de grupo. */
function aliasDe(nombre) {
  // La primera letra a minuscula para que el alias sea una constante de C++ y no
  // un tipo. `snrDb` sale como `snrDb` y no como `SnrDb`.
  return nombre;
}

/**
 * El texto de la cabecera.
 *
 * Determinista byte a byte: `--check` compara ficheros, y una cabecera que
 * cambia de blanco en cada regeneracion pondria el preflight en rojo sin que
 * nada hubiese cambiado.
 *
 * Emite, por grupo: el alias del contenedor, y un alias por clave con el
 * prefijo del subobjeto cuando la clave vive dentro de otro. Los `inline
 * constexpr std::string_view` son lo que usa el consumidor con `j[clave]`.
 *
 * @param {{grupos: Array<object>}} catalogo
 * @returns {string}
 */
export function cabeceraDe(catalogo) {
  const L = [];

  L.push('// ==============================================================================');
  L.push('// ABDAudioLab - GENERADO. NO EDITAR ESTE FICHERO A MANO.');
  L.push('// ==============================================================================');
  L.push('//');
  L.push('// Las claves de JSON que este laboratorio escribe al exportar una medicion.');
  L.push('// Las DECLARA ABDSharedAssets/scripts/claves-export-medicion.json, una por struct');
  L.push('// que las escribe, con su tipo y con lo que significan. Ninguno de estos nombres');
  L.push('// esta tecleado en ningun sitio de este repositorio: sale de ahi.');
  L.push('//');
  L.push('//   Se escribe con:  node scripts/generar-claves-export-cpp.mjs     (ABDSharedAssets)');
  L.push('//   Se comprueba con: node scripts/generar-claves-export-cpp.mjs --check');
  L.push('//');
  L.push('// El preflight corre el --check, y eso es lo que lo ata: no necesita al hermano');
  L.push('// para decidir, solo necesita el catalogo.');
  L.push('//');
  L.push('// SI ESTE FICHERO SE DESFASA, EL LABORATORIO ESTA ESCRIBIENDO UNA CLAVE QUE');
  L.push('// NADIE LEE. Eso no da crash ni rojo: el JSON sale bien formado y el panel no');
  L.push('// encuentra lo que busca. Por eso el desfasado se comprueba antes de nada.');
  L.push('// ==============================================================================');
  L.push('');
  L.push('#pragma once');
  L.push('');
  L.push('#include <cstddef>');
  L.push('#include <string_view>');
  L.push('');
  L.push('namespace abdaudiolab::measurement::claves::generado');
  L.push('{');
  L.push('');

  // Un indice de todo lo declarado. Sirve para lo que viene despues y para que
  // quien abra el fichero sepa de un vistazo cuantas claves hay.
  let total = 0;
  for (const g of catalogo.grupos) {
    total += 1;   // el contenedor
    for (const c of g.claves) total += 1 + (c.de ? c.de.length : 0);
  }

  L.push('/** Cuantas claves declara el catalogo, contando los contenedores. */');
  L.push('inline constexpr std::size_t numeroClaves = ' + total + ';');
  L.push('');

  for (const g of catalogo.grupos) {
    L.push('// ==============================================================================');
    L.push('// ' + g.code);
    L.push('// ==============================================================================');
    L.push('//');
    L.push('// ' + g.queEscribe);
    if (g.nota) {
      L.push('//');
      for (const linea of g.nota.split('\n')) L.push('// ' + linea);
    }
    L.push('');
    L.push('namespace ' + g.code);
    L.push('{');

    if (g.claveContenedor) {
      L.push('');
      L.push('/** La clave del objeto padre. null en el catalogo = cuelga de la raiz. */');
      L.push('inline constexpr std::string_view contenedor = "' + g.claveContenedor + '";');
    }

    for (const c of g.claves) {
      L.push('');
      L.push('/** ' + c.queEs.replace(/\n/g, ' ') + ' */');

      if (c.de) {
        // Subobjeto: el namespace lleva su nombre, porque sus claves pueden
        // repetirse en otro subobjeto del mismo grupo.
        //
        // Y dentro se emite `contenedor`, que es la clave del subobjeto. Hace
        // falta porque el nombre del namespace OCUPA el sitio del alias: en
        // `cal::thresholds` no puede haber a la vez un `std::string_view` y un
        // `namespace`, y sin el `contenedor` el que escribe tendria que teclear
        // la clave del padre, que es justo lo que este fichero elimina.
        L.push('namespace ' + c.nombre);
        L.push('{');

        L.push('');
        L.push('/** La clave del subobjeto. El namespace ocupa el nombre del alias. */');
        L.push('inline constexpr std::string_view contenedor = "' + c.nombre + '";');

        for (const h of c.de) {
          L.push('');
          L.push('/** ' + h.queEs.replace(/\n/g, ' ') + ' */');
          L.push('inline constexpr std::string_view ' + aliasDe(h.nombre) + ' = "' + h.nombre + '";');
          if (h.porDefecto !== undefined) {
            L.push('/** El valor que la lectura usa cuando la clave no esta. */');
            L.push('inline constexpr auto ' + aliasDe(h.nombre) + 'PorDefecto = '
              + literalDe(h.porDefecto) + ';');
          }
        }

        L.push('');
        L.push('} // namespace ' + c.nombre);
      }
      else {
        L.push('inline constexpr std::string_view ' + aliasDe(c.nombre) + ' = "' + c.nombre + '";');
        if (c.porDefecto !== undefined) {
          L.push('/** El valor que la lectura usa cuando la clave no esta. */');
          L.push('inline constexpr auto ' + aliasDe(c.nombre) + 'PorDefecto = '
            + literalDe(c.porDefecto) + ';');
        }
      }
    }

    L.push('');
    L.push('} // namespace ' + g.code);
    L.push('');
  }

  // El indice. Es lo que permite a un test de C++ recorrer TODAS las claves sin
  // tenerlas escritas, y es lo que hace que "anadir una clave al catalogo" sea
  // un cambio que el laboratorio ve en vez de uno que se pierde.
  L.push('// ==============================================================================');
  L.push('// EL INDICE, Y PARA QUE ESTA');
  L.push('// ==============================================================================');
  L.push('//');
  L.push('// Un array con el nombre de cada clave, para poder recorrerlas todas sin');
  L.push('// escribirlas una a una. Un consumidor que solo sepa atender las que hay');
  L.push('// en su lista no se entera de que hay una nueva, y esa es la forma que');
  L.push('// toma un clave que se escribe y no se lee.');
  L.push('//');
  L.push('// El `numeroClaves` de arriba y la longitud de este array tienen que');
  L.push('// coincidir, y el `static_assert` de `MeasurementExportKeys.h` lo comprueba.');
  L.push('// ==============================================================================');
  L.push('');
  L.push('inline constexpr std::string_view todasLasClaves[] = {');

  // El indice, y de paso la cuenta de nombres distintos. Se cuentan aqui y no
  // durante la escritura porque el indice se arma justo despues, y recorrerlo dos
  // veces por el mismo dato es un sitio mas donde pueden no cuadrar.
  const unicas = new Set();

  for (const g of catalogo.grupos) {
    if (g.claveContenedor) {
      L.push('    "' + g.claveContenedor + '",');
      unicas.add(g.claveContenedor);
    }
    for (const c of g.claves) {
      L.push('    "' + c.nombre + '",');
      unicas.add(c.nombre);
      if (c.de) for (const h of c.de) {
        L.push('    "' + h.nombre + '",');
        unicas.add(h.nombre);
      }
    }
  }

  L.push('};');
  L.push('');
  L.push('/**');
  L.push(' * Cuantas claves DISTINTAS hay en el indice, contando cada nombre una vez.');
  L.push(' *');
  L.push(' * No es lo mismo que `numeroClaves`, y la diferencia es el motivo de que este');
  L.push(' * numero exista: `rateHz`, `depth` y `waveform` declaran las MISMAS claves');
  L.push(' * internas —`name`, `value`, `unit`, `status`, `reason`—, asi que el indice las');
  L.push(' * cuenta cinco veces y el catalogo las declara tres. El conteo de arriba es la');
  L.push(' * suma de las entradas; este es el numero de nombres.');
  L.push(' *');
  L.push(' * Es lo que compara el `static_assert` de `MeasurementExportKeys.h` con el');
  L.push(' * inventario que ese header mantiene, y por eso se emite aqui: el header no');
  L.push(' * puede contarlo sin recorrer el indice, y un recorrido en tiempo de compilacion');
  L.push(' * para obtener una constante es un numero que cambia de sitio cuando cambia el');
  L.push(' * generador, que es justo cuando nadie lo mira.');
  L.push(' */');
  // `size`, no `length`: un Set no tiene length, y escribirlo ahi no da error sino
  // un `undefined` dentro del C++ generado que se lleva por delante el
  // `static_assert` que lo compara. Es la clase de fallo que no se ve hasta que
  // alguien compila, y por eso el `static_assert` del header es la puerta buena.
  L.push('inline constexpr std::size_t numeroEntradasUnicas = ' + unicas.size + ';');
  L.push('');
  L.push('} // namespace abdaudiolab::measurement::claves::generado');
  L.push('');

  return L.join('\n');
}

/** El literal de C++ para un valor por defecto, segun lo que sea. */
function literalDe(valor) {
  if (typeof valor === 'string')
    return '"' + valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

  if (typeof valor === 'boolean')
    return valor ? 'true' : 'false';

  if (valor === null)
    return 'nullptr';

  return String(valor);
}

/** Lo que hace el script cuando se ejecuta. Exportada para poder probarla. */
export function main(argv = process.argv) {
  const checking = argv.includes('--check');

  const hermano = path.resolve(aqui, '..', '..', 'ABDAudioLab');

  if (!existsSync(hermano)) {
    console.log('  la cabecera no se comprueba: ' + hermano + ' no esta a mano.');
    console.log('  En el CI de ABDSharedAssets es lo normal, porque ese workflow no baja el');
    console.log('  laboratorio. En el de ABDAudioLab el hermano SI esta y esto si se comprueba.');
    return 0;
  }

  if (checking && !existsSync(DESTINO)) {
    console.error('  la cabecera generada no esta: ' + DESTINO);
    console.error('  Se crea con: node scripts/generar-claves-export-cpp.mjs');
    return 1;
  }

  let catalogo;
  try {
    catalogo = leerCatalogo();
  }
  catch (e) {
    console.error('  el catalogo no declara unas claves que se puedan generar: ' + e.message);
    return 1;
  }

  const { grupos, claves } = catalogo;
  const cuanto = grupos.length === 1 ? '1 grupo' : grupos.length + ' grupos';
  const esperado = cabeceraDe(catalogo);
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  const nombre = path.basename(DESTINO);

  if (checking) {
    if (actual === esperado) {
      console.log('  al dia         ' + nombre + ' (' + cuanto + ', ' + claves.length + ' claves)');
      return 0;
    }

    console.error('  DESFASADA      ' + nombre);
    console.error('                 el catalogo declara ' + grupos.map((g) => g.code).join(', ')
      + ', y la cabecera no lo dice.');
    console.error('  LO QUE PASA SI ESTO SE DEJA ASI:');
    console.error('       el laboratorio escribe una clave que nadie lee. El JSON sale bien');
    console.error('       formado, asi que no hay crash ni rojo: solo un panel que no');
    console.error('       encuentra lo que busca.');
    console.error('  SE ARREGLA ASI:');
    console.error('       node scripts/generar-claves-export-cpp.mjs');
    return 1;
  }

  if (actual === esperado) {
    console.log('  sin cambios    ' + nombre);
    return 0;
  }

  writeFileSync(DESTINO, esperado, 'utf8');
  console.log('  escrita        ' + nombre + ' (' + cuanto + ', ' + claves.length + ' claves)');
  return 0;
}

// El guard no es cosmetico: los tests importan el modulo, y sin esto el main se
// ejecutaria al importarlo y el test se encontraria con un process.exit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main());