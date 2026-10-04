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
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS GENERADORES DE LOS HERMANOS, Y POR QUE SON UNA TERCERA COSA.
 *
 * `CONTRATOS` mira lo que se escribe en `contracts/` de ESTE paquete. Lo de
 * arriba, `GENERADOS_FUERA`, mira salidas que estan en otro repo pero cuyo
 * generador y cuyo esquema viven aqui, asi que la puerta puede ser esta. Lo de
 * esta lista es al reves: generador, esquema y salidas estan TODOS en el
 * hermano. Este paquete no puede ni leer el JSON ni decidir si esta al dia,
 * porque no tiene ni la mitad de la informacion: lo unico que puede hacer es
 * correr el generador del hermano y mirar lo que dice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y POR QUE ESO NO BASTA, Y QUE HAY QUE COMPROBAR ADEMAS
 *
 * Que el generador salga con 0 no prueba nada sobre si produce lo que declara,
 * y el motivo es el que motivo la aparicion de `--check` en los dos
 * `registry_generator.js`: un generador sin `--check` escribe siempre y sale
 * con 0 pase lo que pase. Correrlo «para comprobar» dejaria el arbol del
 * hermano modificado y el CI en verde, que es el peor resultado posible: un
 * falso verde que ademas pisa el checkout de otro repo.
 *
 * Asi que hay DOS comprobaciones y las dos tienen que hablar:
 *
 *   1. El generador SABE `--check` (no se escribe, se compara) y sale con 0.
 *   2. Lo que el generador DECLARA esta en el disco y tiene la marca de
 *      generado.
 *
 * La 2 es la que hace visible el fallo de rutas. Si el generador declara cuatro
 * `.gen` y uno se ha movido de sitio, el `--check` del generador puede seguir en
 * verde —compara lo suyo contra lo suyo— mientras el fichero que consume el
 * resto del repo ya no existe o lleva una temporada viejo. Aqui se mira que cada
 * ruta declarada exista Y que el fichero diga que es generado: un `.gen` de
 * hace tres meses no se distingue de uno al dia por existir, solo por la marca.
 *
 * Y la 3, la que hacia falta para que la lista no se pudre: si un generador
 * anade una salida y no la declara aqui, nada lo pilla. Se mitiga en
 * `tests/generatedContractsPreflight.test.js`, que contrasta esta lista con lo
 * que el propio generador imprime en su `--help` —los dos `registry_generator.js`
 * listan su manifiesto ahi— y con la cabecera `AUTO-GENERATED` de cada salida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `necesita` ES LO QUE HACE FALTA PARA PODER COMPROBAR, Y ESTA EN siblings.json
 *
 * Este paquete se baja solo a el en CI, y los hermanos se bajan a su SHA con
 * `fetch-missing-siblings.mjs`. Pero para correr el generador de un hermano hace
 * falta mas que el fichero de cabecera que leen los contratos: hace falta el
 * generador, su `package.json` (para el `type: module`) y sus fuentes. Por eso
 * estos repos estan en `siblings.json` con `necesita` incluyendo al generador,
 * y no solo la cabecera.
 *
 * Y si aun asi el hermano no esta, esto sale con 0 y lo dice. Un rojo por
 * «no he podido mirar» en un clon que solo trae este paquete seria un falso
 * rojo permanente; lo que no puede pasar es que el rojo se esconda, asi que
 * la linea sale siempre.
 */
export const GENERADORES_HERMANOS = [
  {
    // El `registry_generator.ts` que convivía con este `.js` se ha ido. Escribía
    // los mismos cuatro artefactos y el `--check` no distinguía quién lo había
    // hecho: uno era correcto y el otro leía `BIPOLAR_BYTES` —un `Set`— con
    // `Object.keys()`, que devuelve `[]`, y generaba un registro con
    // `bipolarCount: 0` en vez de 43.
    //
    // Se declara aquí, y no solo el `.js`, para que quede escrito que hubo dos. Lo
    // que impide que vuelva a pasar es `scripts/registry_generator.test.js`, que
    // falla si aparece otro fichero `registry_generator.*` o `registry_core.*` en
    // `scripts/`: un comentario no se ejecuta, un test sí.
    repo: 'ABDEep',
    generador: 'scripts/registry_generator.js',
    scriptNpm: 'check:registry',
    salidas: [
      'schemas/parameter-registry.data.json',
      'WebUI/js/registry.gen.js',
      'Source/Core/ParameterRegistry.gen.h',
      'Source/Core/ParameterRegistry.gen.cpp',
    ],
    queEs: 'el registro de parametros del DeepMind 12, que el motor y el WebUI leen del mismo sitio',
    deDondeSale: 'bridge-param-maps.js + byte_map_data.js + parameters_spec.json + el spec del host en C++',
    // El data.json es JSON y no admite comentario de cabecera, asi que no puede
    // llevar `AUTO-GENERATED`. Se identifica por las claves que el generador
    // pone y que un JSON escrito a mano no tendria: el numero de version del
    // esquema y la fecha de la ultima regeneracion.
    marcas: ['"schemaVersion"', '"generatedAt"'],
  },
  {
    // El segundo generador de ABDEep, y el que mas superficie tiene para
    //vigilar: cinco artefactos que el WebUI carga por `<script>` desde
    // `index.html`, y un loader que los recombina. Si uno falta, el sintoma NO es
    // un error: es `window.FACTORY_FX_PRESETS` a `undefined`, y el filtro de
    // presets de fabrica deja de encontrar nada sin decir por que.
    //
    // El `--check` es lo que hace falta aqui, y no es opcional: este generador
    // vivia en CommonJS en un repo `type: module`, luego no corria, luego sus
    // cinco artefactos se posthicieron a mano y quedaron con un formato que el
    // generador no produce (comillas simples donde el sale con dobles). Datos
    // identicos byte a byte una vez parseados; el formato, no. Por eso su
    // serializador emite comillas simples, para que el check sea verde sobre el
    // repo tal como esta en vez de obligar a regenerar 30 000 lineas por un
    // cambio de comillas que no cambia ni un dato.
    repo: 'ABDEep',
    generador: 'scripts/build-fx-presets.js',
    scriptNpm: 'check:presets',
    salidas: [
      'WebUI/js/fx_presets_data/fx_presets_reverbs.js',
      'WebUI/js/fx_presets_data/fx_presets_delays.js',
      'WebUI/js/fx_presets_data/fx_presets_modulation.js',
      'WebUI/js/fx_presets_data/fx_presets_advanced.js',
      'WebUI/js/factory_fx_presets.js',
    ],
    queEs: 'los presets de fabrica que el WebUI carga por script y el loader recombina',
    deDondeSale: 'WebUI/data/factory_fx_presets.json',
  },
  {
    repo: 'ABDMS2000',
    generador: 'Scripts/registry_generator.js',
    salidas: [
      'Source/State/ParameterRegistry.gen.h',
      'Source/State/ParameterRegistry.gen.cpp',
      'WebUI/src/contracts/registry.gen.js',
    ],
    queEs: 'el registro de parametros del MS-2000, y con el el ParameterLayout que JUCE monta',
    deDondeSale: 'schemas/parameters-spec.schema.v1.json',
  },
  {
    // El UNICO generador de los tres que NO es un script, y el que mas superficie
    // tiene: ABDNeural tiene TRES exportadores de C++, no uno. Todos se declaran
    // aqui, cada uno con sus salidas, porque el fallo que se quiere cazar es
    // justo el de un `.gen` que se queda viejo al lado de otros que si se
    // regeneran: con el catalogo declarado a medias, el preflight daba verde
    // sobre un repo con la mitad de sus generados sin vigilar.
    //
    // Y aqui NO se comprueba que esten al dia: los tres son ejecutables, y
    // compilar un exportador de C++ desde este paquete seria un pipeline entero
    // (CMake, toolchain y el `ABDSharedCode` de al lado). Lo que se comprueba es
    // que las salidas existan y sean generadas; que esten al dia lo dice el
    // build de ABDNeural, que es quien los compila. Se dice en voz alta para que
    // el verde de este check no se lea como mas de lo que es.
    repo: 'ABDNeural',
    generador: 'Source/DSP/FxCatalogExport.cpp',
    ejecutable: 'NEURONiK_FxExport',
    node: false,
    salidas: [
      'WebUI/generated/fx-catalog.generated.json',
      'WebUI/generated/fx-catalog.generated.js',
    ],
    queEs: 'el catalogo de efectos que la WebUI importa para pintar los slots',
    deDondeSale: 'Source/DSP/FxCatalogue.h + ABDSharedCode/DspEffects/fxDefaultCatalogue()',
  },
  {
    repo: 'ABDNeural',
    generador: 'Tests/ParameterExportTool.cpp',
    ejecutable: 'NEURONiK_ParameterExport',
    node: false,
    salidas: [
      'WebUI/generated/parameters.generated.json',
      'WebUI/generated/parameters.generated.js',
      'WebUI/generated/parameters.generated.d.ts',
    ],
    queEs: 'los descriptores de parametros, que el motor serializa y la WebUI pinta',
    deDondeSale: 'Source/State/ParameterDefinitions.h (createParameterLayout)',
  },
  {
    // El masokueto de los tres: una FINGERPRINT, no un catalogo. El `.js` lleva
    // la firma del layout global y la pagina la compara con la que le da el
    // `.wasm` que carga, para refuse a arrancar si el binario y la pagina no
    // fueron construidos contra la misma tabla.
    //
    // Esta en la lista por un motivo concreto: si la firma se queda vieja, la
    // pagina rechaza un binario que SI es el suyo, y el sintoma es «la app no
    // carga» sin que nadamentione una firma desfasada. Un `.gen` que bloquea el
    // arranque no puede estar fuera del inventario.
    repo: 'ABDNeural',
    generador: 'Tests/LayoutFingerprintExportTool.cpp',
    ejecutable: 'NEURONiK_LayoutExport',
    node: false,
    salidas: [
      'WebUI/generated/gp-layout.generated.js',
    ],
    queEs: 'la firma del layout global, que la WebUI compara con la del .wasm antes de arrancar',
    deDondeSale: 'Source/Wasm/GlobalParamsLayout.h (globalParamsLayoutFingerprint())',
  },
];

/**
 * La marca que un fichero generado tiene que llevar para no ser una suplantacion.
 *
 * Las tres primeras son comentarios de cabecera, que es lo que se puede poner en
 * un `.h`, un `.cpp` y un `.js`. Un `.json` NO admite comentarios, asi que un
 * generador que emite JSON no tiene forma de llevar ninguna. Por eso cada
 * entrada puede declarar `marcas` propias: es lo que hace `parameter-registry.data.json`
 * de ABDEep, que se identifica por sus claves (`schemaVersion`, `generatedAt`,
 * `sourceHashes`) en lugar de por un comentario que no se puede escribir.
 *
 * Y esa es justo la razon de que el campo exista en vez de relajar la comprobacion
 * para todos: aceitar «cualquier cosa» como marca dejaria pasar un JSON escrito a
 * mano. Exigir el comentario a un `.json` daria un rojo permanente. Las dos cosas
 * son defectos de la regla, y la salida es que la regla la dice el generador.
 */
const MARCAS_GENERADO = [
  'AUTO-GENERATED',
  'AUTO-GENERATED BY',
  'DO NOT EDIT',
  // Los exportadores de C++ de ABDNeural usan la convencion de JSDoc, que es lo
  // que un `.js` generado por una tool de C++ suele llevar. Se aceptan aqui y no
  // por entrada porque son marcas de facto, no de un generador concreto.
  '@generated',
  // El `.json` de NEURONiK_ParameterExport no puede llevar comentario, asi que
  // se identifica por el campo que si lleva: el origen del que sale.
  '"source"',
  // La convencion de los generadores de ABDEep que ya estaban en el repo, con el
  // aviso de emoji. Es la marca de los presets de fabrica y de otros artefactos
  // viejos, y es tan de facto como las tres primeras: aceptarla aqui evita que
  // cada uno de esos ficheros necesite una entrada con `marcas` propias.
  'GENERATED FILE',
];

/**
 * La raiz del hermano: la CARPETA HERMANA de este paquete, la misma cuenta que
 * usan los generadores y que `siblings.json` ya fija. Si un dia cambia, cambia
 * aqui y alla el mismo dia — es lo que `siblingsPins.test.js` vigila.
 */
function raizHermano(repo) {
  return join(root, '..', repo);
}

/** Un hermano esta disponible si se puede leer al menos uno de sus ficheros. */
export function hermanoDisponible(hermano) {
  return hermano.salidas.some((rel) => existsSync(join(raizHermano(hermano.repo), ...rel.split('/'))));
}

export const GENERADOS_FUERA = [
  {
    script: 'scripts/generar-cuarentena-cpp.mjs',
    scriptNpm: 'check:cuarentena-cpp',
    salidas: ['../ABDAudioLab/src/core/HardwareContractQuarantine.generado.h'],
    queEs: 'la cabecera de C++ con los literales de la regla de cuarentena',
    deDondeSale: 'el enum de contracts/hardware_profile.schema.json',
  },
  {
    // Misma forma de puerta y mismo motivo, pero sobre un fallo distinto y peor:
    // una clave desfasada no deja a C++ mirando un nombre viejo, lo deja
    // ESCRIENDO una clave que el panel ya no lee. El JSON sale bien formado, asi
    // que no hay crash ni rojo: el laboratorio funciona y el dato no aparece.
    //
    // Lo que hay que mirar para entender por que es un `GENERADOS_FUERA` y no un
    // `CONTRATOS` es que la salida es codigo y la fuente es un catalogo, no un
    // esquema. La cabecera vive en el laboratorio porque alli se compila, y se
    // comprueba desde aqui porque el catalogo vive aqui.
    script: 'scripts/generar-claves-export-cpp.mjs',
    scriptNpm: 'check:claves-export-cpp',
    salidas: ['../ABDAudioLab/src/measurement/MeasurementExportKeys.generado.h'],
    queEs: 'la cabecera de C++ con las claves de JSON que el laboratorio escribe al exportar',
    deDondeSale: 'scripts/claves-export-medicion.json',
  },
  {
    // Y AQUI SI SE ROMPE EL PATRON DE ARRIBA, Y HAY QUE DECIR POR QUE.
    //
    // Los dos anteriores se comprueban SIN el hermano, y por eso viven aqui:
    // su fuente esta en este repo, asi que un clon limpio tambien puede
    // mirarlos. Este no puede. `generar-guardas-escritura.mjs` escanea las
    // carpetas `scripts/`, `WebUI/scripts/` y `tools/` de ABDEep, ABDMS2000 y
    // ABDNeural para descubrir QUIEN ESCRIBE, y las listas de escritores que
    // hornea en el guard estan sacadas de ahi. Sin esos tres repos el motor no
    // tiene nada que mirar y el `--check` sale con 1.
    //
    // Se mete igualmente, y el motivo es que la alternativa es peor: dejarlo
    // fuera del inventario significa que `pnpm check:guardas` corre solo cuando
    // alguien se acuerda, y un guard de escritura que se queda viejo no da
    // ningun rojo en ningun sitio. Aqui el rojo sale en el preflight.
    //
    // Lo que cambia respecto a los otros dos es QUE PASA SI FALTA UN HERMANO, y
    // por eso el mensaje tiene que decirlo en voz alta en vez de dejar que se
    // lea como un guard desfasado. En local, un clon limpio de este repo solo da
    // este rojo y no ningun otro.
    //
    // ── CI, Y LO QUE HACE FALTA ANTES DE QUE ESTE ──
    //
    // MEDIDO, y es el motivo de que esta entrada sea un ROJO DE CI y no solo una
    // mejora del preflight local. Los tres guards siguen SIN COMMITEAR en sus
    // repos (`git log` sale vacio en los tres), y `docs-audit.yml` clona los
    // hermanos con un SHA FIJADO, no con `main`. Con el estado de ahora, el
    // checkout de CI llega al SHA fijado SIN `guardasDeEscritura.test.js`, el
    // `--check` responde `DESFASADO - no existe` y sale con 1.
    //
    // O sea: esta entrada da por hecho que los tres guards estan commiteados en
    // sus repos Y que los SHA de `docs-audit.yml` los incluyen. Para que el
    // preflight de CI vuelva a verde hacen falta las dos mitades, en este
    // orden: commitear el guard en ABDEep, ABDMS2000 y ABDNeural; despues subir
    // los tres SHA de `docs-audit.yml` a un commit que ya los contenga. Si se
    // sube el SHA sin el commit, el rojo es el mismo pero con otro motivo.
    script: 'scripts/generar-guardas-escritura.mjs',
    scriptNpm: 'check:guardas',
    salidas: [
      '../ABDEep/scripts/guardasDeEscritura.test.js',
      '../ABDMS2000/WebUI/tests/guardasDeEscritura.test.js',
      '../ABDNeural/WebUI/tests/guardasDeEscritura.test.js',
    ],
    queEs: 'los tres guardas de escritura, que enumeran quien escribe en cada hermano y como se le pide antes',
    deDondeSale: 'los scripts de ABDEep, ABDMS2000 y ABDNeural, que el generador escanea: sin los tres clonados este rojo es "no clonado", no "guard viejo"',
  },
];

/**
 * Que la fuente que un generado DECLARA exista de verdad.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUE COMPRUEBA, Y POR QUE NO LO HACIA ANTES
 *
 * El preflight ya comprobaba que un contrato generado tenga script, y eso es lo
 * que hace que el `--check` sirva. Lo que no comprobaba es que la ruta que el
 * propio contrato escribe en `generatedFrom` siga ahi.
 *
 * Y ese campo es una autoridad, no un comentario: es lo que un panel lee para
 * fiarse de que el contenido tiene un origen. Si el `.h` de ABDSharedCode se
 * renombra o se mueve, el contrato sigue diciendo "vengo de aqui" con la misma
 * seguridad de siempre, y nadie se entera hasta que alguien vaya a leer la
 * fuente y no la encuentre.
 *
 * Es el mismo fallo que el de `fx-effects.json` que se resolvio en `CONTRATOS`,
 * por el otro lado: ahi faltaba el generador, aqui falta la fuente. Los dos son
 * un campo que declara una verdad sin que ninguna puerta la compruebe.
 *
 * Que se compruebe SOLO si la ruta es de este monorepo. Una fuente externa —un
 * volcado de hardware, un manual— no esta en ningun sitio que este repositorio
 * pueda mirar, y exigirla seria un falso rojo permanente. Las de ABDSharedCode si
 * se comprueban, porque es hermano y esta aqui al lado.
 *
 * @param {string} raizDelPaquete donde vive `contracts/`.
 * @returns {string[]} problemas. Vacio = toda fuente declarada existe.
 */
export function fuentesQueNoExisten(raizDelPaquete = root) {
  const problemas = [];

  for (const salida of salidasDeclaradas()) {
    const ruta = join(raizDelPaquete, 'contracts', salida);

    if (!existsSync(ruta)) {
      problemas.push(`${salida}: no esta en contracts/, asi que su fuente no se puede comprobar`);
      continue;
    }

    let contrato;

    try {
      contrato = JSON.parse(readFileSync(ruta, 'utf8'));
    }
    catch (e) {
      // Un JSON ilegible NO es un problema de fuente. Se cuenta como ilegible, y lo
      // cuentan el validador de esquemas y la auditoria de cuarentena, que saben
      // decir mas. Mezclarlos aqui seria obscurecer un fallo que ya tiene su puerta.
      continue;
    }

    const fuente = contrato?.generatedFrom;

    // `generatedBy` es la OTRA forma de declarar procedencia, y la que usan los
    // contratos de matriz de modulacion. Dice quien COPIO el fichero a disco, que
    // es justo la pregunta que `generatedFrom` no contesta. Se comprueba aqui
    // por la misma razon que `generatedFrom`: un contrato generado por un script
    // que no esta, o que no es el que dice escribirlo, es un contrato que nadie
    // puede volver a producir — y entonces su contenido es copia a mano con un
    // nombre que miente.
    const generador = contrato?.generatedBy;

    if (typeof generador === 'string' && generador !== '') {
      // `generatedBy` se declara como ruta DESDE LA RAIZ DEL PAQUETE
      // (`scripts/...`), no desde la raiz del monorepo como hace
      // `generatedFrom` (`ABDSharedCode/...`). Son dos bases distintas y por eso
      // van un `join` distinto cada uno: con el equivocado, esta comprobacion
      // daria siempre «no esta» sobre un repositorio sano.
      if (!existsSync(join(raizDelPaquete, generador)))
        problemas.push(`${salida} declara generatedBy "${generador}" y ese script no esta. Sin el, el contrato no se puede regenerar y sus cambios serian copia a mano.`);
    }

    // `provenance.sourceFiles` es lo mismo para la EVIDENCIA: `source` la
    // escribe en prosa para que se lea, y estas son las rutas que se pueden
    // comprobar. Sin ellas, un contrato puede citar un manual que no existe y
    // seguir en verde, que es justo el fallo que hace que una referencia en
    // prosa no sirva de autoridad.
    const evidencia = contrato?.provenance?.sourceFiles;

    if (Array.isArray(evidencia)) {
      for (const fichero of evidencia) {
        // Se resuelven desde la raiz del MONOREPO, que es donde viven los tres
        // synths, y por eso el `..`. Una ruta que no este se avisa: es la
        // misma idea que con `generatedFrom`, aplicada a la evidencia.
        if (typeof fichero === 'string' && fichero !== ''
          && !existsSync(join(raizDelPaquete, '..', fichero)))
          problemas.push(`${salida} declara provenance.sourceFiles "${fichero}" y ese fichero no esta. La evidencia que el contrato declara como su autoridad no se puede abrir.`);
      }
    }

    if (typeof fuente !== 'string' || fuente === '')
      continue;

    // Solo las rutas de este monorepo. Una fuente que apunte fuera no se puede
    // comprobar desde aqui, y fingir lo contrario seria un verde falso.
    if (!fuente.startsWith("ABDSharedCode/"))
      continue;

    if (!existsSync(join(raizDelPaquete, '..', fuente)))
      problemas.push(`${salida} declara generatedFrom "${fuente}" y ese fichero no esta. El campo es la autoridad que un panel lee para fiarse del origen, asi que mientras apunte a un sitio que no existe no dice nada.`);
  }

  return problemas;
}

/** Todos los ficheros que los generadores de CONTRATOS dicen producir. */
export function salidasDeclaradas() {
  return CONTRATOS.flatMap((c) => c.salidas);
}

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

/**
 * Corre un generador del HERMANO, con su `--check`, sin escribir nada.
 *
 * `correrNode` de arriba no sirve aqui: resuelve el script contra `root` (este
 * paquete) y corre con `cwd` en este paquete. Un generador del hermano calcula
 * sus rutas con `import.meta.dirname` y espera estar en SU repo, asi que correrlo
 * desde aqui lo haria fallar por el cwd —que es justo la clase de fallo que este
 * mecanismo quiere hacer visible, no crear—. Por eso va con `cwd` al hermano y
 * el script resuelto contra el hermano.
 *
 * Y el `--check` es OBLIGATORIO, no una cortesia: sin el, correr «para comprobar»
 * dejaria el arbol del hermano modificado y el CI en verde. Si un generador no
 * acepta `--check`, se dice en vez de correrlo a pelo.
 *
 * @returns {{codigo: number, salida: string, colgado: boolean, noExiste: boolean}}
 */
export function correrGeneradorHermano(hermano, args = ['--check']) {
  const base = raizHermano(hermano.repo);
  const ruta = join(base, ...hermano.generador.split('/'));

  if (!existsSync(ruta))
    return { codigo: 2, salida: '', colgado: false, noExiste: true };

  const r = spawnSync(process.execPath, [ruta, ...args], {
    cwd: base,
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

/**
 * Que el generador de un hermano produces lo que declara. Las TRES cosas.
 *
 * 1. `--check` sale con 0. Es la que dice si lo commiteado esta al dia, y es la
 *    unica que puede decirlo: comparar el contenido commiteado con el que sale
 *    de las fuentes solo lo sabe el generador, que es quien las lee.
 * 2. Cada salida DECLARADA existe. Una salida que el generador declara y no esta
 *    en el disco es un `.gen` que el resto del repo cree que existe.
 * 3. Y lleva la marca de generado. Un fichero en su sitio no dice si es de hoy:
 *    `existsSync` da el mismo «si» para un `.gen` regenerado hace un minuto que
 *    para uno que nadie ha vuelto a generar desde que cambio el motor. Lo que lo
 *    distingue es la cabecera, y es lo unico que separa «esta al dia» de
 *    «tiene buena pinta».
 *
 * El punto 3 avisa en vez de romper cuando hay marca de fecha en el JSON, porque
 * un `.gen` con `generatedFrom` pero sin `AUTO-GENERATED` es legitimo —asi lo
 * emite ABDNeural— y exigirle la marca de C++ seria un falso rojo. Lo que no se
 * acepta es un `.gen` sin NINGUNA marca: eso no lo ha escrito ningun generador.
 *
 * @param {object} hermano una entrada de `GENERADORES_HERMANOS`
 * @returns {{problemas: string[], avisos: string[], comprobado: boolean}}
 *   `comprobado` es «se ha podido MIRAR el repo», no «ha ido bien». Un generador
 *   que no esta en su sitio o una salida que falta DEVUELVEN `comprobado: true`
 *   con un problema: se ha mirado y se ha encontrado algo roto, que es distinto
 *   de no haber podido mirar. Confundir las dos cosas hacia que un `.gen` que
 *   falta —un fallo de rutas de verdad— se contara como «no comprobado» y
 *   saliera con 0.
 */
export function generadorHermanoProduceLoQueDice(hermano) {
  const problemas = [];
  const avisos = [];
  const base = raizHermano(hermano.repo);

  if (!existsSync(base)) {
    return {
      problemas: [],
      avisos: [`${hermano.repo}: no esta clonado, no se ha comprobado`],
      comprobado: false,
    };
  }

  // ── 1. Lo declarado tiene que estar en el disco ──
  //
  // Antes que correr nada: si el generador no esta en su sitio, correrlo no
  // diria nada del fallo de rutas, que es lo que mas duele de todo esto.
  if (!existsSync(join(base, ...hermano.generador.split('/')))) {
    problemas.push(
      `${hermano.repo}: el generador no esta en ${hermano.generador}. O el repo se ha movido de `
      + 'sitio, o el generador se ha renombrado. El repositorio esta ahi pero no se puede ni '
      + 'ejecutar, asi que sus salidas no se pueden comprobar.',
    );
    return { problemas, avisos, comprobado: true };
  }

  const ausentes = hermano.salidas.filter((rel) => !existsSync(join(base, ...rel.split('/'))));

  if (ausentes.length > 0) {
    for (const rel of ausentes) {
      problemas.push(
        `${hermano.repo}: declara que produce ${rel} y ese fichero NO esta en el disco. `
        + 'O el generador escribe a otro sitio, o la salida esta mal escrita aqui. Un fichero '
        + 'generado que falta no da error: el que lo incluye se queda con la copia vieja y nadie '
        + 'se entera hasta que un valor sale mal.',
      );
    }
    return { problemas, avisos, comprobado: true };
  }

  // ── 2. Y tiene que ser de verdad generado ──
  //
  // Las marcas son las de cabecera MAS las que declare la entrada. Se exige
  // CUALQUIERA de ellas, no todas: el `.json` de ABDEep no lleva `AUTO-GENERATED`
  // porque un JSON no admite comentarios, y exigirlo seria un rojo permanente que
  // nadie podria arreglar sin romper el formato.
  const marcas = [...MARCAS_GENERADO, '"generatedFrom"', ...(hermano.marcas ?? [])];

  for (const rel of hermano.salidas) {
    const bytes = readFileSync(join(base, ...rel.split('/')), 'utf-8');

    if (!marcas.some((marca) => bytes.includes(marca))) {
      problemas.push(
        `${hermano.repo}: ${rel} existe pero NO lleva ninguna marca de generado (ni `
        + `${marcas.join(', ')}). Un .gen sin marca no lo ha `
        + 'escrito ningun generador: o esta a mano, o lo que hay ahi es un fichero viejo que '
        + 'nadie ha vuelto a generar y por eso nadie lo ha mirando.',
      );
    }
  }

  // ── 3. Y el generador tiene que saber comprobar ──
  //
  // El `node: false` de ABDNeural no entra aqui: su generador es un ejecutable
  // de C++ y no hay nada que correr con Node desde este paquete. Lo que se
  // comprueba de el son los puntos 1 y 2, y lo que NO —que este al dia— lo dice
  // el build de ABDNeural. Se dice en voz alta para que el verde de este check no
  // se lea como mas de lo que es.
  if (hermano.node === false) {
    avisos.push(
      `${hermano.repo}: ${hermano.ejecutable} es un ejecutable de C++, no se ha corrido. `
      + 'Comprobadas sus ' + hermano.salidas.length + ' salidas (existen y son generadas); '
      + 'QUE ESTEN AL DIA lo comprueba el build de ABDNeural, que es quien lo compila.',
    );
    return { problemas, avisos, comprobado: true };
  }

  const r = correrGeneradorHermano(hermano);

  if (r.noExiste) {
    problemas.push(`${hermano.repo}: el generador no existe (${hermano.generador})`);
    return { problemas, avisos, comprobado: true };
  }

  if (r.colgado) {
    problemas.push(
      `${hermano.repo}: ${hermano.generador} --check se ha pasado de tiempo sin responder. `
      + `El limite son ${TIEMPO_MS / 1000} s.`,
    );
    return { problemas, avisos, comprobado: true };
  }

  if (r.codigo !== 0) {
    // Un generador que acepta `--check` y sale con != 0 esta diciendo que lo
    // commiteado esta desfasado, o que no ha podido leer una fuente. Las dos
    // cosas son un rojo, pero se leen distinto y por eso se cita su salida.
    const pareceFalloDeRutas = /FALLO DE RUTAS/.test(r.salida);

    problemas.push(
      `${hermano.repo}: ${hermano.generador} --check sale con ${r.codigo}, asi que `
      + (pareceFalloDeRutas
        ? 'no se ha podido ni comprobar. El mensaje de arriba dice que FALLA UNA RUTA: '
          + 'una fuente se ha movido o ha cambiado de nombre.'
        : `${hermano.queEs} esta DESFASADO. Ejecuta \`node ${hermano.generador}\` en ${hermano.repo} `
          + 'y commitea lo que salga.'),
    );

    for (const linea of r.salida.split('\n').filter((l) => l.trim() !== '').slice(-12))
      problemas.push(`    | ${linea.trim()}`);
  }

  return { problemas, avisos, comprobado: true };
}

/** Los `scripts.` de `package.json` cuyo nombre empieza por el prefijo dado. */
export function scriptsQueEmpiezanPor(man, prefijo) {
  return Object.keys(man.scripts ?? {}).filter((k) => k.startsWith(prefijo));
}

// ─────────────────────────────────────────────────────────────────────────
// QUE EL GENERADOR PRODUZCA REALMENTE LO QUE DECLARA PRODUCIR
// ─────────────────────────────────────────────────────────────────────────
//
// EL HUECO, DICHO CON EL SCRIPT QUE LO DEMUESTRA
//
// Todo lo de arriba comprueba que el `--check` del generador salga con 0. Pero
// salir con 0 no es lo mismo que haber regenerado nada: un script que imprime
// «al dia» y no toca un solo fichero sale con 0, y este preflight lo aceptaba.
// Eso no es hipotetico, es lo que hace un generador al que le han cambiado el
// nombre de la constante de salida, y es la forma mas cara de estos fallos: el
// generador parece vivo, el preflight parece vigilarlo, y el contrato se
// desfasa sin que nada se entere.
//
// EL OTRO HUECO, EL INVERSO, Y ES EL MAS FACIL DE NO VER
//
// Que un script escriba lo que dice no dice que escriba TODO lo que tiene que
// escribir. Si `salidas` lista tres ficheros y el generador solo produce dos,
// el tercero se queda viejo para siempre y el preflight no lo nota: solo mira
// los que el propio generador menciona. Un contrato que nadie regenera es un
// contrato que nadie vigila, y sigue pareciendo vigilado.
//
// ─────────────────────────────────────────────────────────────────────────
// COMO SE COMPRUEBA SIN ROMPER NADA
//
// No se puede simplemente correr el generador y mirar: escribiria sobre los
// contratos de verdad. Asi que se mide por FECHAS DE MODIFICACION, que es lo
// unico que se puede observar sin tocar el contenido.
//
// Y se mide antes y despues, por una razon que no es de redundancia sino de
// LIMITACION: si el generador no ha escrito un fichero, su fecha no cambia, y
// no hay forma de distinguir «el generador no lo produce» de «el generador no lo
// ha producido todavia» solo mirando el estado final. Comparando se distingue.
//
// Se copia el contrato entero antes, se corre el generador, y se restaura
// SIEMPRE —tambien cuando todo ha ido bien, y no por prudencia sino por
// principio: un preflight que deja el arbol modificado, aunque lo deje igual,
// es un preflight del que nadie se fia la segunda vez que lo corre.

/** Los ficheros de `contracts/` con su fecha de ultima modificacion. */
/**
 * Los ficheros de un directorio de contratos y cuando se tocaron por ultima vez.
 *
 * El parametro existe porque ahora hay DOS directorios de contratos: el de
 * verdad, que no se debe tocar, y el de la arena, que es donde escribe el
 * generador. Antes solo habia uno y por eso no lo necesitaba.
 *
 * @param {string} dir directorio a listar; por defecto, `contracts/` de verdad.
 * @returns {Map<string, number>} nombre -> mtimeMs.
 */
function fechasDeContratos(dir = join(root, 'contracts')) {
  const fechas = new Map();

  if (!existsSync(dir))
    return fechas;

  for (const nombre of readdirSync(dir)) {
    const est = lstatSync(join(dir, nombre));

    if (est.isFile())
      fechas.set(nombre, est.mtimeMs);
  }

  return fechas;
}

/** Corre un generador SIN `--check`, para ver que ficheros toca de verdad. */
/**
 * Montar una COPIA de este repo para correr dentro el generador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE UNA COPIA Y NO UN PARAMETRO
 *
 * Los tres generadores resuelven sus rutas desde su propio fichero —`HERE =
 * dirname(abspath(__file__))` en los tres— asi que no hay forma de decirles
 * «escribe en otro sitio» sin tocar los tres, y tocar los tres para que el
 * preflight no ensucie es cambiar los generadores por culpa del preflight.
 *
 * Lo que si se puede es ponerlos en un sitio donde ese «otro sitio» sea una
 * copia. La arena tiene la MISMA forma que el repo: `scripts/` y `contracts/` de
 * verdad, y los hermanos del monorepo apuntando a los de verdad. El generador no
 * se entera de nada y escribe donde escribiria —que es justo lo que se quiere
 * medir—.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE LOS HERMANOS SON ENLACES Y NO COPIAS
 *
 * Porque los generadores LEEN las tablas de los synths
 * (`ABDSharedCode/SynthCore/S950PatchFields.h`, `ABDNeural/.../ModDestinationTable.h`,
 * `ABDEep/WebUI/js/modmatrix_data.js`). Copiar esas tablas seria una foto: el dia
 * que cambie una, la arena leeria la foto y el preflight compararia contra lo que
 * el generador ve HOY en el codigo de verdad. Con un enlace la lectura es la de
 * siempre, que es lo que hace que la comprobacion signifique algo.
 *
 * Y la lista de hermanos NO esta escrita en ningun sitio: se lee el directorio de
 * al lado. Un repo nuevo queda enlazado sin que nadie tenga que acordarse de
 * anadirlo aqui, que es como se queda viejo un catalogo de este tipo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA EN `tmpdir()` Y NO DENTRO DEL REPO
 *
 * Porque los enlaces apuntan al monorepo, y el monorepo contiene este repo. Un
 * enlace a si mismo metido dentro del arbol es un bucle para cualquier cosa que
 * lo recorra —un `git status`, un indexador, un antivirus—, y eso si que puede
 * colgar una maquina.
 *
 * @returns {{raiz: string, paquete: string, contratos: string}}
 */
function montarArena() {
  const arena = mkdtempSync(join(tmpdir(), 'preflight-arena-'));
  const paquete = basename(root);
  const arenaPaquete = join(arena, paquete);

  mkdirSync(arenaPaquete, { recursive: true });

  // `preserveTimestamps` es el que importa y no es el de serie explicito: sin el,
  // los ficheros de la arena tendrian fecha de AHORA, y la deteccion de «lo que
  // el generador ha escrito» que compara fechas dejaria de funcionar —todo
  // pareceria escrito—. Con el, se parece a como lo hacia el respaldo.
  const copia = { recursive: true, preserveTimestamps: true };

  cpSync(join(root, 'scripts'), join(arenaPaquete, 'scripts'), copia);
  cpSync(join(root, 'contracts'), join(arenaPaquete, 'contracts'), copia);

  const monorepo = dirname(root);

  for (const nombre of readdirSync(monorepo)) {
    if (nombre === paquete)
      continue;

    const origen = join(monorepo, nombre);
    const est = lstatSync(origen);

    if (!est.isDirectory() && !est.isSymbolicLink())
      continue;

    // 'junction' en Windows es un enlace de directorio que no necesita
    // privilegios —a diferencia de un symlink— y fuera de Windows Node lo
    // trata como un enlace normal. Asi que el mismo codigo funciona en la
    // maquina de desarrollo y en el runner de Linux sin mirar la plataforma.
    symlinkSync(origen, join(arena, nombre), 'junction');
  }

  return { raiz: arena, paquete: arenaPaquete, contratos: join(arenaPaquete, 'contracts') };
}

/**
 * Correr el generador `script` con la raiz de `raiz`.
 *
 * @param {string} script ruta relativa dentro del repo, como `scripts/x.py`.
 * @param {string} [raiz] donde se corre; por defecto, el repo de verdad.
 */
function correrGenerador(script, raiz = root) {
  const ruta = join(raiz, script);

  if (!existsSync(ruta))
    return { codigo: 2, salida: '', colgado: false, noExiste: true };

  const r = spawnSync(PYTHON, [ruta], {
    cwd: raiz,
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

/**
 * Poner `desde` en `hasta` cambiando de sitio, que es distinto de reescribir.
 *
 * Reescribir un contrato que otro proceso esta leyendo tiene una ventana: el
 * fichero se trunca al abrirlo y se vuelve a llenar detras, y quien lea en medio
 * se encuentra un JSON a medias. Un `rename` no tiene ventana, porque el lector
 * que ya tiene abierto el fichero sigue leyendo el viejo entero y el que abre
 * despues abre el nuevo entero.
 *
 * En Windows el `rename` encima de un destino abierto puede salir con
 * EPERM/EBUSY —un antivirus, un indexador, o el worker que esta leyendo ese
 * contrato en este instante—, y ese es justo el caso que atraviesa la carrera
 * que esta restauracion arregla. Por eso se reintenta: dar por buena una
 * restauracion que fallo por un instante seria inventarse un problema que no
 * tiene.
 *
 * @param {string} desde temporal, ya escrito y con sus permisos puestos.
 * @param {string} hasta contrato a sustituir.
 */
function renombrar(desde, hasta) {
  const reintentables = ['EPERM', 'EBUSY', 'EACCES'];
  const espera = 20;
  const intentos = 25;

  // En Windows un fichero no se puede sustituir mientras otro proceso lo tiene
  // abierto, y aqui hay otro worker leyendo `contracts/` en este instante. Por
  // eso la espera es de verdad y no un reintento a pelo: MEDIDO con un lector
  // leyendo en bucle por encima, cinco intentos seguidos fallan con EPERM en
  // cuanto el lector pilla el fichero, y dar por restaurado lo que no se ha
  // restaurado seria un rojo que no existe.
  const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

  for (let intento = 1; ; intento++) {
    try {
      renameSync(desde, hasta);
      return;
    }
    catch (e) {
      if (intento >= intentos || !reintentables.includes(e.code))
        throw e;

      dormir(espera);
    }
  }
}

/**
 * Que el generador toque de verdad cada fichero que declara en `salidas`.
 *
 * @param {object} contrato una entrada de `CONTRATOS`.
 * @returns {{problemas: string[], tocado: boolean, restaurado: boolean}}
 */
export function generadorProduceLoQueDice(contrato) {
  const problemas = [];
  const copia = mkdtempSync(join(tmpdir(), 'preflight-gen-'));
  const contratosReales = join(root, 'contracts');
  const antes = fechasDeContratos(contratosReales);
  const respaldos = new Map();
  let arena = null;

  // Respaldo ANTES de correr nada. Es lo que hace esta comprobacion destructiva
  // y por eso se hace con tanto cuidado: se copia el contrato entero a un sitio
  // fuera, y se restaura pase lo que pase.
  for (const [nombre, fecha] of antes) {
    const origen = join(contratosReales, nombre);
    const copiaFichero = join(copia, nombre);
    // El modo se guarda aparte porque la restauracion va a terminar en un
    // `rename`, y un `rename` cambia el inodo: los permisos del temporal no se
    // heredan solos y hay que volver a ponerlos a mano.
    respaldos.set(nombre, {
      origen,
      copia: copiaFichero,
      bytes: readFileSync(origen),
      modo: lstatSync(origen).mode,
      fecha,
    });
    writeFileSync(copiaFichero, respaldos.get(nombre).bytes);
  }

  let r;

  try {
    // El generador corre en la arena, y la comparacion tambien. `antes` son las
    // fechas del `contracts/` DE VERDAD, que es el que hay que dejar como estaba;
    // `antesArena` son las de la copia, que es donde el generador va a escribir
    // y donde hay que mirar si ha escrito algo.
    arena = montarArena();

    const antesArena = fechasDeContratos(arena.contratos);

    r = correrGenerador(contrato.script, arena.paquete);

    if (r.noExiste) {
      problemas.push(`${contrato.script}: el generador no existe`);
    }
    else if (r.codigo !== 0) {
      // Un generador que falla al escribir no es un generador que produce otra
      // cosa: es un generador roto, y eso lo dice ya `--check`. Aqui solo se
      // anota para no mezclar las dos cosas en el mismo rojo.
      problemas.push(`${contrato.script}: al regenerar sale con ${r.codigo}, asi que no se puede comprobar que produzca lo que declara`);
    }
    else {
      const despues = fechasDeContratos(arena.contratos);

    // Lo que el generador ha escrito son los ficheros NUEVOS mas los que han
    // cambiado de fecha. Un fichero que se regenera con el mismo contenido puede
    // tener la misma fecha si el sistema no la actualiza, asi que se mira tambien
    // si ha cambiado el contenido: se compara byte a byte con el respaldo.
    const escritos = new Set();

    for (const [nombre, fecha] of despues) {
      const previo = antesArena.get(nombre);
      const copiaPrevia = respaldos.get(nombre);

      const nuevo = (previo !== fecha)
        || (copiaPrevia !== undefined
          && !readFileSync(join(arena.contratos, nombre)).equals(copiaPrevia.bytes));

      if (nuevo)
        escritos.add(nombre);
    }

    for (const nombre of despues.keys())
      if (!antesArena.has(nombre))
        escritos.add(nombre);

    // 1. Lo declarado tiene que haberse escrito.
    for (const salida of contrato.salidas) {
      if (!escritos.has(salida)) {
        problemas.push(
          `${contrato.script} declara que produce "${salida}" y al correrlo ese fichero no se ha `
          + 'escrito. O el generador ha cambiado y todavia escribe a otro sitio, o el nombre de la '
          + 'salida esta mal escrito en el catalogo. Un generador que no escribe lo que declara '
          + 'sale con 0 igual, asi que el --check no lo pilla por si solo.'
        );
      }
    }

    // 2. Y lo escrito tiene que estar declarado.
    for (const nombre of [...escritos].sort()) {
      if (!contrato.salidas.includes(nombre)) {
        problemas.push(
          `${contrato.script} escribe "${nombre}", que NO esta en sus salidas declaradas `
          + `(${contrato.salidas.join(', ')}). Un fichero que el generador escribe y el catalogo `
          + 'no vigila es un contrato que se queda viejo sin que nada lo mire.'
        );
      }
    }
    }
  }
  catch (e) {
    // Un generador que revienta con una excepcion se mide igual que un rojo
    // normal, no como una excepcion del preflight: quien lee el resultado
    // quiere saber que el contrato no se ha comprobado, no que el preflight ha
    // fallado por otra cosa.
    problemas.push(`${contrato.script}: al regenerar ha lanzado ${e.message}`);
  }
  finally {
    // ─────────────────────────────────────────────────────────────────────
    // EL GENERADOR HA CORRIDO EN LA ARENA, ASI QUE AQUI NO DEBERIA HABER NADA
    // QUE RESTAURAR. Y «no deberia» no es «no va a pasar»: esto sigue siendo la
    // red de seguridad para un generador que se escape —una ruta absoluta, un
    // `../..` de mas— y que escriba en el arbol de verdad.
    //
    // Lo que cambia respecto a antes es que se RESTAURA SOLO LO QUE SE HA
    // TOCADO, y ademas se DICE. Antes se reescribian los cuarenta contratos
    // siempre, y un generador que escribiera en el arbol real se deshacia en
    // silencio: un silencio asi es un fallo que no se ve hasta que alguien
    // compara el contrato con el codigo del synth a mano.
    // ─────────────────────────────────────────────────────────────────────
    let restaurado = true;
    const tocados = [];

    // Y la arena se borra pase lo que pase: si el generador se cuelga, el
    // temporal se queda en el disco de por vida.
    if (arena !== null)
      rmSync(arena.raiz, { recursive: true, force: true });

    // El directorio del temporal se crea solo si hay algo que restaurar: un
    // preflight que no ha tocado nada no deja un directorio de mas en la raiz
    // aunque se le olvide borrar.
    let dirTemporal = null;

    for (const [nombre, { origen, bytes, modo, fecha }] of respaldos) {
      let intacto = false;

      try {
        intacto = existsSync(origen)
          && lstatSync(origen).mtimeMs === fecha
          && readFileSync(origen).equals(bytes);
      }
      catch (e) {
        intacto = false;
      }

      // Intacto es el caso NORMAL, y no escribir nada en ese caso es parte del
      // arreglo: restaurar «por si acaso» son cuarenta `rename` por generador
      // sobre el arbol de verdad, y ese trabajo no hacia falta para nada.
      if (intacto)
        continue;

      tocados.push(nombre);

      // Y aqui se restaura MOVIENDO el temporal encima, no reescribiendo: la
      // razon esta en `renombrar`. El temporal va en un directorio con punto
      // en la raiz del repo porque `rename` solo es atomico dentro del mismo
      // sistema de ficheros, y `tmpdir()` esta en `C:` mientras que el repo
      // vive en `D:`.
      if (dirTemporal === null)
        dirTemporal = mkdtempSync(join(root, '.preflight-restaurar-'));

      const temporal = join(dirTemporal, nombre);

      try {
        writeFileSync(temporal, bytes);
        chmodSync(temporal, modo);
        renombrar(temporal, origen);
      }
      catch (e) {
        restaurado = false;
      }
    }

    if (dirTemporal !== null)
      rmSync(dirTemporal, { recursive: true, force: true });

    // Y se BORRA lo que el generador haya creado en el arbol de verdad. Con la
    // arena esto no deberia ocurrir —el generador escribe en su copia—, pero un
    // generador que se escape por una ruta absoluta lo haria, y su fichero se
    // quedaria en `contracts/` para siempre si nadie lo quita. Restaurar los que ya
    // existen no basta: hay que deshacer tambien lo que se anadio.
    for (const nombre of readdirSync(contratosReales)) {
      if (antes.has(nombre))
        continue;

      tocados.push(nombre);

      try {
        rmSync(join(contratosReales, nombre), { force: true });
      }
      catch (e) {
        restaurado = false;
      }
    }

    // Y las fechas de los que se han restaurado, para que el arbol quede
    // EXACTAMENTE como estaba. Solo de esos: los demas no se han escrito, y su
    // fecha sigue siendo la que tenian.
    for (const nombre of tocados) {
      const respaldo = respaldos.get(nombre);

      if (respaldo === undefined)
        continue;

      try {
        utimesSync(respaldo.origen, respaldo.fecha / 1000, respaldo.fecha / 1000);
      }
      catch (e) {
        restaurado = false;
      }
    }

    // Y si se ha tocado algo, se dice POR QUE se ha tocado. Un preflight que
    // deshace un desastre en silencio parece sano, y la proxima vez que se
    // compruebe el arbol ya no sabra nadie cuando aparecio.
    if (tocados.length > 0) {
      problemas.push(
        `${contrato.script} ha escrito en el contracts/ de verdad `
        + `(${[...new Set(tocados)].sort().join(', ')}), que es justo lo que la arena `
        + 'existe para evitar. Se ha restaurado, pero un generador que escriba en el '
        + 'arbol real no se puede comprobar sin ensuciarlo.'
      );
    }

    rmSync(copia, { recursive: true, force: true });

    if (!restaurado) {
      problemas.push(`${contrato.script}: no se ha podido restaurar contracts/ tras regenerar. Revisa el arbol antes de continuar.`);
    }
  }

  return { problemas, tocado: true, restaurado: true };
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

  // `--comprobar-generadores` regenera de verdad, y solo se pide a mano.
  //
  // No va por defecto porque escribir sobre `contracts/` para comprobar que se
  // escribe es una cosa que un preflight no debe hacer sin que alguien lo pida,
  // aunque restaure despues: si se interrumpe a mitad, el arbol se queda
  // modificado y el que llega despues no sabe si es un cambio suyo.
  const comprobarGeneradores = process.argv.includes('--comprobar-generadores');
  const generadoresMienten = [];

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

  // ── Que los generadores PRODUCAN lo que dicen, no solo que existan ──
  //
  // Despues de mirar si estan al dia, y separado de eso a proposito: «estar al
  // dia» es que el contenido sea el correcto, y esto es que el generador siga
  // escribiendo. Un generador al que le han cambiado la ruta de salida se queda
  // «al dia» para siempre, porque `--check` lee la misma ruta equivocada y por
  // eso no se entera nadie.
  if (comprobarGeneradores) {
    console.log('');
    console.log('QUE LOS GENERADORES PRODUCAN LO QUE DECLARAN');
    console.log('-'.repeat(72));

    for (const c of CONTRATOS) {
      if (c.sinGenerador)
        continue;

      const r = generadorProduceLoQueDice(c);

      if (r.problemas.length === 0) {
        console.log(`  produce        ${c.script}`);
        console.log(`                 ${c.salidas.join(', ')}`);
        continue;
      }

      generadoresMienten.push(...r.problemas);

      console.log(`  NO PRODUCE    ${c.script}`);

      for (const p of r.problemas)
        console.log(`                 ${p}`);
    }
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

  // ── Los generadores de los HERMANOS ──
  //
  // Des pus de lo de arriba y antes de las fuentes, porque es lo barato y es
  // lo que mas duele cuando falla: un `.gen` de un hermano que no esta al dia
  // deja a SU motor mirando un valor que su panel ya no enseña, y no hay ningun
  // rojo en ningun sitio porque aqui nadie ha mirado.
  //
  // Cada uno dice su estado en una linea y siempre: los que no se han podido
  // comprobar salen igual que los que estan bien, en su propia linea y con la
  // palabra `NO COMPROBADO`. Un verde que no distingue «comprobado y bien» de
  // «no mirado» es un verde que no significa nada.
  console.log('');

  const hermanosDesfasados = [];
  const hermanosNoComprobados = [];

  for (const hermano of GENERADORES_HERMANOS) {
    if (!existsSync(join(root, '..', hermano.repo))) {
      console.log(`  hermano NO     ${hermano.repo} (no esta clonado, no se comprueba)`);
      hermanosNoComprobados.push(`${hermano.repo}: no esta clonado`);
      continue;
    }

    const r = generadorHermanoProduceLoQueDice(hermano);

    for (const a of r.avisos)
      console.log(`  hermano aviso  ${a}`);

    if (r.problemas.length === 0) {
      const etiq = hermano.node === false ? 'generado' : 'al dia';
      console.log(`  hermano ${etiq.padEnd(7)} ${hermano.repo}: ${hermano.queEs}`);
      for (const rel of hermano.salidas)
        console.log(`                 ${rel}`);
      continue;
    }

    console.log(`  hermano ROJO   ${hermano.repo}: ${hermano.queEs}`);
    for (const p of r.problemas)
      console.log(`                 ${p}`);

    // `comprobado` es «se ha podido mirar», no «ha ido bien»: con la otra
    // lectura, un `.gen` que falta se contaria como «no he podido mirar» y
    // este preflight saldria con 0 sobre un repo al que le falta un fichero.
    if (r.comprobado)
      hermanosDesfasados.push(hermano);
    else
      hermanosNoComprobados.push(`${hermano.repo}: ${r.problemas[0]}`);
  }

  // ── La fuente que declara cada generado tiene que existir. Va antes de las copias
  // porque es la misma clase de fallo en el otro extremo: un campo que declara un
  // origen y ninguna puerta que lo compruebe.
  const fuentes = fuentesQueNoExisten();

  if (fuentes.length > 0) {
    console.error(`FUENTES QUE NO EXISTEN (${fuentes.length}):`);

    for (const f of fuentes)
      console.error(`  ${f}`);

    console.error(`  Un contrato que dice de donde sale y cuya fuente no esta no`);
    console.error(`  dice nada: el campo es la autoridad y no puede apuntar a un sitio vacio.`);
    console.error(`  Arreglarlo es una de dos: se corrige la ruta que declara, o se`);
    console.error(`  escribe el generador de verdad que la produzca.`);
    return 1;
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

  // Un hermano que no se ha podido comprobar NO es un rojo —este paquete se
  // clona solo en un layout de monorepo, y exigir el hermano ahi seria un falso
  // rojo permanente— pero si tiene que quedar escrito, porque el resumen de
  // abajo dice «todo en verde» y ese verde incluiria lo que nadie ha mirado.
  if (hermanosNoComprobados.length > 0) {
    console.log('');
    console.log(`HERMANOS QUE NO SE HAN PODIDO COMPROBAR (${hermanosNoComprobados.length}):`);

    for (const h of hermanosNoComprobados)
      console.log(`  ${h}`);

    console.log('');
    console.log('Esto NO es un generador roto: es que no se ha podido ni mirar.');
    console.log('El resumen de abajo cuenta estos .gen como comprobados, y no lo son.');
    console.log('Para que se comprueben: `node scripts/fetch-missing-siblings.mjs`.');
  }

  // Los generadores de los hermanos van con los generados fuera de `contracts/`
  // y no con `generadoresMienten`, que es lo de los generadores de `scripts/`:
  // la razon por la que se separan es que aqui el arreglo NO es un
  // `pnpm generate:*` de este paquete, es ir al repo hermano y regenerar ahi. En
  // la misma lista, el mensaje de arreglo senalaria al sitio equivocado.
  if (hermanosDesfasados.length > 0) {
    console.log('');
    console.log(`preflight FALLIDO: ${hermanosDesfasados.length} generador(es) de hermano(s) desfasado(s):`);

    for (const h of hermanosDesfasados) {
      console.log('');
      console.log(`  ${h.repo} — ${h.queEs}`);
      console.log(`     Sources:  ${h.deDondeSale}`);
      console.log(`      Arreglo:  cd ../${h.repo} && node ${h.generador}`);
      console.log(`      Luego:    commit dea los ${h.salidas.length} ficheros que salida, dentro de ${h.repo}.`);
    }

    console.log('');
    console.log('El arreglo NO es regenerar aqui: el generador, sus fuentes y sus salidas');
    console.log('estan todos en el repo hermano. Este paquete solo los mira.');

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

  if (generadoresMienten.length > 0) {
    console.log('');
    console.log(`GENERADORES QUE NO PRODUCEN LO QUE DECLARAN (${generadoresMienten.length}):`);

    for (const p of generadoresMienten)
      console.log(`  ${p}`);

    console.log('');
    console.log('Un generador que existe y sale con 0 no esta produciendo nada, o produce');
    console.log('menos de lo que declara. El --check no lo pilla por si solo, porque lee la');
    console.log('misma ruta que el generador escribe: si esa ruta esta mal, los dos se');
    console.log('-equivocan a la vez y todo queda verde.');
    return 1;
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
