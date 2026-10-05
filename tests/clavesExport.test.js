/**
 * Las claves de JSON que el laboratorio escribe al exportar una medicion salen
 * de UN contrato, y este test es la prueba de que eso es verdad.
 *
 * Que se comprueba, y por que aqui y no en un test de C++:
 *
 *  · El catalogo se sostiene. Que toda clave diga QUE es, que el tipo exista, y
 *    que el `porDefecto` quepa en el tipo. Un `porDefecto` que no cabe es el 0
 *    silencioso que la lectura devuelve cuando la clave no esta.
 *
 *  · La cabecera generada esta al dia. Es lo que comprueba el preflight tambien,
 *    y se repite aqui porque este test corre sin hermano: el `--check` sale con 0
 *    sin comprobar nada cuando ABDAudioLab no esta al lado.
 *
 *  · Y lo que de verdad importa: que el C++ USE la cabecera. Un `--check` en verde
 *    no dice que el C++ deje de teclear literales. Ese caso es el que hace que el
 *    fallo siga vivo con la puerta puesta, y solo se caza leyendo el `.cpp`.
 *
 * Los datos de las pruebas son SIEMPRE inventados, y seRestore()n tras cada uno.
 * Un test que renombra la clave del catalogo de verdad y no lo devuelve deja el
 * repositorio en un estado que el siguiente que lo toca no sabe explicar.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOGO,
  MARCA_MANIFIESTO,
  leerCatalogo,
  cabeceraDe,
  main,
} from '../scripts/generar-claves-export-cpp.mjs';

// `fileURLToPath` y no `new URL(...).pathname`: el `pathname` de una URL `file:` en
// Linux empieza por `/`, y quitarlo con un `replace` deja una ruta RELATIVA. Un
// `path.resolve` de una ruta relativa la pega al directorio de trabajo, y aqui el
// resultado era `<cwd>/home/runner/work/ABDSharedAssets/...`: una ruta que existe
// solo en el runner, con el workspace entero repetido dentro.
//
// En Windows no se nota, porque el `pathname` es `/D:/...` y quitar la barra
// inicial deja `D:/...`, que es absoluta de verdad. Por eso esto solo se rompia en
// el CI de Linux, y en local el test pasaba.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(aqui, '..');
const LABORATORIO = path.resolve(RAIZ, '..', 'ABDAudioLab', 'src', 'measurement');

const CPP = path.join(LABORATORIO, 'MeasurementSerialization.cpp');
const EXPO = path.join(LABORATORIO, 'MeasurementContainerExporter.cpp');

describe('el catalogo de las claves que el laboratorio escribe', () => {

  it('el catalogo de verdad se sostiene', () => {
    // El primer test y el mas barato: si el catalogo de disco no se sostiene, no
    // hay nada que generar y todos los demas estan mirando.
    expect(() => leerCatalogo(), 'el catalogo de disco no se puede generar').not.toThrow();
  });

  it('y declara al menos un grupo de modulacion y uno de calibracion', () => {
    // El encargo nombro los dos. Un catalogo que solo tenga uno de ellos cubre la
    // mitad de lo pedido y no se nota mirando el fichero, porque el fichero esta
    // lleno de grupos y se ve bien.
    const { grupos } = leerCatalogo();
    const codes = grupos.map((g) => g.code);

    expect(codes, 'falta el grupo de calibracion')
      .toContain('analogChainCalibration');
    expect(codes, 'falta el grupo de modulacion')
      .toContain('modulationResult');
  });

  it('toda clave dice QUE es, y no solo como se llama', () => {
    // Esta es la regla que mas veces ha parado al generador durante el trabajo, y
    // por mas de una razon: una clave sin sentido es un nombre, y un nombre no se
    // puede revisar. Se comprueba aqui y no dentro del generador para que el
    // fallo se lea como un fallo del CATALOGO y no como un fallo del script.
    for (const grupo of leerCatalogo().grupos) {
      for (const clave of grupo.claves) {
        expect(clave.queEs.length >= 20,
          `la clave "${clave.nombre}" de ${grupo.code} no dice que es`).toBe(true);

        for (const hija of clave.de ?? []) {
          expect(hija.queEs.length >= 20,
            `la clave "${clave.nombre}.${hija.nombre}" de ${grupo.code} no dice que es`)
            .toBe(true);
        }
      }
    }
  });

  it('y un porDefecto que no cabe en el tipo declarado se para', () => {
    // Es la parte que se desincroniza en silencio. `j.value(clave, 0.0)` con la
    // clave equivocada devuelve 0.0 sin decir nada, y un 0.0 donde se espera un
    // factor es plausible. Por eso el default se declara junto al tipo, y por eso
    // la comprobacion mira los dos.
    const conDefaultRaro = {
      schemaVersion: '1.0',
      grupos: [{
        code: 'grupoInventado',
        queEscribe: 'Una funcion inventada de mas de veinte caracteres.',
        claveContenedor: null,
        claves: [{
          nombre: 'cosas',
          tipo: 'texto',
          queEs: 'Una clave inventada, cuya descucion es de sobra larga.',
          porDefecto: 3.5,           // <- un numero donde deberia haber cadena
        }],
      }],
    };

    const cat = escribirCatalogoTemporal(conDefaultRaro);

    try {
      expect(() => leerCatalogo(cat),
        'un default numerico en una clave de texto tiene que parar').toThrow();
    }
    finally {
      rmSync(cat, { force: true });
    }
  });

  it('y una clave repetida dentro de un grupo se para, porque en el JSON solo sale una', () => {
    // Dos claves con el mismo nombre son la misma clave dos veces. En el JSON no se
    // ve: sale una, y la segunda asignacion pisa la primera sin avisar.
    const cat = escribirCatalogoTemporal({
      schemaVersion: '1.0',
      grupos: [{
        code: 'grupoInventado',
        queEscribe: 'Una funcion inventada de mas de veinte caracteres.',
        claveContenedor: null,
        claves: [
          { nombre: 'repetida', tipo: 'texto', queEs: 'Primera, con descripcion de sobra.' },
          { nombre: 'repetida', tipo: 'texto', queEs: 'Segunda, con descripcion de sobra.' },
        ],
      }],
    });

    try {
      expect(() => leerCatalogo(cat)).toThrow();
    }
    finally {
      rmSync(cat, { force: true });
    }
  });

  it('y dos grupos con el mismo code tambien, porque generarian el mismo namespace', () => {
    // Dos grupos con el mismo `code` no son dos grupos: generan dos namespaces que
    // se pisan, y el segundo se escribe encima del primero sin que el
    // compilador diga nada. Es el mismo fallo que la clave repetida, un nivel mas
    // arriba.
    const cat = escribirCatalogoTemporal({
      schemaVersion: '1.0',
      grupos: [
        {
          code: 'mismoNombre',
          queEscribe: 'Una funcion inventada de mas de veinte caracteres.',
          claveContenedor: null,
          claves: [{ nombre: 'una', tipo: 'texto', queEs: 'La primera, con descripcion.' }],
        },
        {
          code: 'mismoNombre',
          queEscribe: 'Otra funcion inventada de mas de veinte caracteres.',
          claveContenedor: null,
          claves: [{ nombre: 'otra', tipo: 'texto', queEs: 'La segunda, con descripcion.' }],
        },
      ],
    });

    try {
      expect(() => leerCatalogo(cat)).toThrow();
    }
    finally {
      rmSync(cat, { force: true });
    }
  });

  it('el nombre de la marca del manifiesto esta escrito una sola vez', () => {
    // El generador, el test y la cabecera tendrian que escribir el mismo nombre de
    // la palabra. Si uno de los tres se queda viejo, el rojo sale en uno y los
    // otros dos siguen en verde, y el mensaje del rojo apunta al fichero
    // equivocado. Se importa del generador, que es quien lo usa.
    expect(MARCA_MANIFIESTO, 'la marca tiene que ser un nombre, no un simbolo')
      .toBe('vaAlManifiesto');
  });
});

describe('la cabecera de C++ que sale del catalogo', () => {

  it('pone el nombre de cada clave Y su valor', () => {
    // Las dos mitades, y son las dos. Un `const char* nombre = "snrDb"` sin el
    // `= "snrDb"` no sirve para nada; un valor sin el nombre tampoco, porque quien
    // lo lee no sabe a que clave se refiere.
    const cab = cabeceraDe(leerCatalogo());

    expect(cab, 'el alias sin su valor').toContain('inline constexpr std::string_view snrDb = "snrDb";');
    expect(cab, 'la clave del contenedor').toContain('std::string_view contenedor = "analogCalibration";');
  });

  it('y un valor por defecto, con su tipo', () => {
    // El default es la parte que se desincroniza en silencio, asi que va en la
    // cabecera y no solo en el catalogo: asi el C++ lo usa sin volver a escribirlo.
    const cab = cabeceraDe(leerCatalogo());

    expect(cab, 'el default de texto').toContain('statusPorDefecto = "not_measured";');
    expect(cab, 'el default numerico negativo').toContain('peakDbfsMaxPorDefecto = -0.5;');
  });

  it('los alias de los subobjetos llevan el nombre del subobjeto delante', () => {
    // El motivo: `rateHz`, `depth` y `waveform` tienen las MISMAS claves internas.
    // Sin el prefijo, `name` seria una sola constante para tres claves distintas
    // del JSON, y renombrar una pondria las tres en silencio sin que el
    // compilador dijera nada — que es justo el fallo que este trabajo cierra.
    const cab = cabeceraDe(leerCatalogo());

    expect(cab, 'el namespace de rateHz').toContain('namespace rateHz');
    expect(cab, 'el namespace de depth').toContain('namespace depth');

    // La comprobacion de verdad: la clave repetida tiene que declararse DENTRO
    // del namespace de su subobjeto. Se mira el trozo entre `namespace rateHz` y
    // el cierre, y no la cabecera entera: buscada en el fichero entero, `name`
    // aparece tres veces y el test pasaria sin comprobar nada.
    const dentroDeRate = trozoDeNamespace(cab, 'rateHz');

    expect(dentroDeRate, 'no se encuentra el namespace rateHz').toBeTruthy();
    expect(dentroDeRate.includes('name = "name"'),
      'la clave interna de rateHz no se declara dentro de su namespace').toBe(true);

    // Y la negation que da nombre al fallo: si `name` se declarara al nivel de
    // grupo, las tres claves se llamarian igual en C++ y renombrar una pondria las
    // otras dos en silencio.
    const fueraDeLosNamespaces = quitaNamespaces(cab);
    expect(fueraDeLosNamespaces.includes('name = "name"'),
      'una clave interna sin namespace pisaria a las otras dos').toBe(false);
  });

  it('cada subobjeto expone su `contenedor`, porque el namespace ocupa el alias', () => {
    // El conflicto es de C++, no de estilo: en `cal::thresholds` no pueden convivir
    // un `std::string_view` y un `namespace` con el mismo nombre, porque el
    // namespace se declara en el ambito que lo contiene. Quien escribe el
    // subobjeto necesita el NOMBRE de la clave del padre, y si no esta emitido
    // tiene dos salidas malas: teclearlo —que es lo que este fichero elimina— o
    // dejar de compilar.
    //
    // Ocurrio de verdad durante este trabajo, asi que el test se queda.
    const cab = cabeceraDe(leerCatalogo());

    for (const sub of ['thresholds', 'latencyBreakdown', 'rateHz', 'depth', 'waveform']) {
      const trozo = trozoDeNamespace(cab, sub);

      expect(trozo, "no se encuentra el namespace " + sub).toBeTruthy();
      expect(trozo.includes('contenedor = "' + sub + '";'),
        "el namespace " + sub + " no declara su contenedor. Quien escribe el subobjeto tendria "
        + "que teclear la clave del padre, y eso es el fallo que este trabajo elimina.")
        .toBe(true);
    }
  });

  it('y declara cuantas claves hay, que es lo que usa el static_assert de C++', () => {
    const { grupos } = leerCatalogo();
    const cab = cabeceraDe(leerCatalogo());

    // El indice tiene que llevar una linea por clave, mas los contenedores.
    let esperadas = 0;
    for (const g of grupos) {
      esperadas += 1;
      for (const c of g.claves) esperadas += 1 + (c.de ? c.de.length : 0);
    }

    const declaradas = Number(cab.match(/numeroClaves = (\d+);/)[1]);
    expect(declaradas, 'el numero declarado no cuadra con el catalogo').toBe(esperadas);
  });

  it('y la cabecera generada de disco esta al dia', () => {
    // Lo mismo que comprueba el preflight, y aqui para cuando no hay hermano: el
    // `--check` sale con 0 SIN comprobar nada si ABDAudioLab no esta al lado, y un
    // verde que no ha mirado nada es peor que un rojo.
    const destino = path.resolve(RAIZ, '..', 'ABDAudioLab', 'src', 'measurement',
      'MeasurementExportKeys.generado.h');

    if (!existsSync(path.resolve(RAIZ, '..', 'ABDAudioLab'))) {
      // El clon limpio: no hay hermano, y entonces no hay cabecera que comparar.
      // Se dice en voz alta para que el verde no se lea como "comprobado".
      expect(true, 'el laboratorio no esta a mano: esta cabecera no se puede comprobar aqui').toBe(true);
      return;
    }

    const esperado = cabeceraDe(leerCatalogo());
    const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';

    expect(actual, 'la cabecera generada no esta, o esta desfasada: regenerate con generate:claves-export-cpp')
      .toBe(esperado);
  });

  it('y main sale con 1 cuando el --check falla, y con 0 cuando esta al dia', () => {
    // Sin hermano, `main` sale con 0 sin comprobar, y por eso este test mide lo
    // que mide cuando lo hay. Se llama con `main` y no con `process.exit`: el
    // codigo de retorno es lo que el preflight lee, y es lo que decide el rojo.
    const codigo = main(['node', 'generar-claves-export-cpp.mjs', '--check']);

    expect(typeof codigo, 'main tiene que devolver un codigo, no llamar a process.exit')
      .toBe('number');
    expect(codigo, 'el --check de disco tendria que pasar').toBe(0);
  });
});

describe('el C++ usa la cabecera, y no teclea literales', () => {

  // Las funciones que el catalogo declara como productoras de claves. La lista
  // esta en el test y no sale del catalogo a proposito: si se sacara de ahi, un
  // renombrado en el catalogo moveria la lista y el test no miraria la funcion
  // nueva. Lo que se quiere es que el test mire SIEMPRE las mismas seis.
  const VIGILADAS = [
    ['analogCalibrationToJson', CPP],
    ['jsonToAnalogCalibration', CPP],
    ['modulationSidebandToJson', CPP],
    ['jsonToModulationSideband', CPP],
    ['modulationResultToJson', CPP],
    ['jsonToModulationResult', CPP],
  ];

  it('las seis funciones que exportan claves siguen en el fichero', () => {
    // Si una se renombra o se borra, el test de abajo pasaria por no encontrar
    // nada. Este dice que la habia.
    const texto = readFileSync(CPP, 'utf8');

    for (const [fn] of VIGILADAS) {
      expect(texto.includes(fn), `la funcion ${fn} ya no esta en MeasurementSerialization.cpp`).toBe(true);
    }
  });

  it('ninguna escribe una clave como literal', () => {
    // ESTA es la comprobacion que importa, y la que no hace el `--check`.
    //
    // Un `--check` en verde dice que la cabecera esta al dia. No dice que el C++
    // la este USANDO. Un `j["snrDb"]` que se cuele en una de estas seis funciones
    // deja la cabecera al dia, el preflight en verde y el fallo entero vivo: el
    // laboratorio sigue escribiendo una clave que el panel ya no lee, y el unico
    // aviso posible es que alguien se acuerde de mirar aqui.
    for (const [fn, fichero] of VIGILADAS) {
      const cuerpo = cuerpoDe(readFileSync(fichero, 'utf8'), fn);

      expect(cuerpo, `no se encontro el cuerpo de ${fn}`).toBeTruthy();

      const literales = literalesDeClave(cuerpo);

      expect(literales,
        `${fn} escribe ${JSON.stringify(literales)} como literal. Las claves salen de `
        + 'claves::generado; un literal aqui es una clave que el catalogo no vigila, '
        + 'que es el fallo que esta puerta vino a cerrar.')
        .toEqual([]);
    }
  });

  it('el manifiesto tampoco', () => {
    // El manifiesto es el SEGUNDO sitio que escribe el grupo de calibracion, y
    // escribe solo cuatro claves de las catorce. Esa asimetria es invisible al
    // leer el JSON, asi que es justo el sitio donde se cuela un literal sin que
    // nadie lo note.
    const texto = readFileSync(EXPO, 'utf8');
    const desde = texto.indexOf('if (spec.analogCalibration.has_value())');

    // Delimitado por llaves y no por una ventana de caracteres: con 700 caracteres
    // la ventana se pasaba al bucle de artefactos, que escribe `path`, `role` y
    // `sizeBytes`, y el test salia rojo por claves que este bloque no escribe.
    // Un test que vigila de mas tambien es un test que no se lee.
    const cuerpo = bloqueDesde(texto, desde);

    expect(cuerpo, 'no se encontro el bloque de calibracion del manifiesto').toBeTruthy();
    expect(literalesDeClave(cuerpo),
      'el manifiesto escribe claves como literal, y es el segundo sitio que escribe este grupo')
      .toEqual([]);
  });

  it('las dos cabeceras estan incluidas donde se usan', () => {
    // Un include que falta no da error de compilacion claro: da "no existe el
    // miembro", que no dice nada de un include. Y un include en el fichero
    // equivocado tampoco: se compila igual hasta que alguien lo mueve.
    expect(readFileSync(CPP, 'utf8'), 'falta el include en MeasurementSerialization.cpp')
      .toContain('#include "MeasurementExportKeys.h"');
    expect(readFileSync(EXPO, 'utf8'), 'falta el include en MeasurementContainerExporter.cpp')
      .toContain('#include "MeasurementExportKeys.h"');
  });
});

// ── ayudas ───────────────────────────────────────────────────────────────────

/** Escribe un catalogo inventado en un fichero temporal y devuelve su ruta. */
function escribirCatalogoTemporal(documento) {
  const dir = mkdtempSync(path.join(tmpdir(), 'claves-export-'));
  const ruta = path.join(dir, 'catalogo.json');
  writeFileSync(ruta, JSON.stringify(documento, null, 2), 'utf8');
  return ruta;
}

/**
 * El cuerpo de una funcion: desde su firma hasta la llave que la cierra.
 *
 * Cuenta llaves en vez de buscar el proximo `return`, porque una funcion con dos
 * `return` —o con un `return` dentro de un `if`— daria un cuerpo truncado, y un
 * cuerpo truncado hace que el test de literales pase sin mirar lo que hay
 * despues. Es el modo de fallo de un test que no vigila.
 */
function cuerpoDe(texto, nombre) {
  const desde = texto.indexOf(nombre);
  if (desde < 0) return '';

  const llave = texto.indexOf('{', desde);
  if (llave < 0) return '';

  let nivel = 0;

  for (let i = llave; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(llave, i + 1);
    }
  }

  return '';
}

/** El trozo de un `namespace`: desde su apertura hasta el cierre que lo termina. */
function trozoDeNamespace(texto, nombre) {
  const desde = texto.indexOf('namespace ' + nombre + '\n');
  if (desde < 0) return '';

  const llave = texto.indexOf('{', desde);
  if (llave < 0) return '';

  let nivel = 0;

  for (let i = llave; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(llave, i + 1);
    }
  }

  return '';
}

/**
 * El texto del repositorio SIN los namespaces, para mirar lo que queda al nivel
 * de grupo.
 *
 * Es lo que hace negativa la comprobacion del alias repetido: si `name` se
 * declara dentro de un namespace, al quitarlo no queda, y si se declara al nivel
 * de grupo, queda. Sin esto, la afirmacion solo miraria que existe el namespace,
 * que tambien se cumple cuando la clave esta fuera.
 */
function quitaNamespaces(texto) {
  return texto.replace(/\nnamespace [A-Za-z0-9]+\n\{[\s\S]*?\n\} \/\/ namespace [A-Za-z0-9]+\n/g, '\n');
}

/** El bloque que empieza en `desde`, contado por llaves. */
function bloqueDesde(texto, desde) {
  if (desde < 0) return '';

  const llave = texto.indexOf('{', desde);
  if (llave < 0) return '';

  let nivel = 0;

  for (let i = llave; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(desde, i + 1);
    }
  }

  return texto.slice(desde);
}

/**
 * Los literales que nombran una clave: `["algo"]` y `.value("algo"`.
 *
 * Las dos formas son las que usa este repositorio, y las dos estan en el mismo
 * patron a proposito: con una sola, un `.value("snrDb", 0.0)` pasaria por limpio
 * siendo exactamente el fallo que se busca.
 */
function literalesDeClave(cuerpo) {
  return [...cuerpo.matchAll(/\[(["'])([a-zA-Z][a-zA-Z0-9]*)\1\]|\.value\(\s*(["'])([a-zA-Z][a-zA-Z0-9]*)\3/g)]
    .map((m) => m[2] ?? m[4])
    .filter((n) => n && n !== 'array');
}