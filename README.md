# ABDSharedAssets — Recursos, Estilos, Iconos y Contratos Compartidos

Repositorio centralizado de recursos graficos (modelos y marcas), iconografia vectorial monocromatica, contratos de hardware JSON y sistema de diseno/estilos CSS para todo el ecosistema de software y plugins de ABDSynths (ABDAudioLab, ABDBankManager, ABDMS2000, ABDCZ101, ABDEep, ABDJUNiO601, ABDScope, ABDMIDIKeyb, etc.).

---

## Filosofia de Diseno: Fuente Unica de la Verdad (Zero-Copy)

Para evitar duplicacion de archivos, desincronizaciones accidentales o sobreescritura de versiones (forks), los proyectos satelite nunca copian los archivos. En su lugar, se vinculan mediante Directory Junctions NTFS (mklink /J).

- Cualquier cambio realizado en este directorio maestro se refleja de forma instantanea en todos los proyectos dependientes.
- Los Junctions de Windows no requieren privilegios de administrador y son totalmente transparentes para compiladores, navegadores y DAWs.

---

## Estructura

```
D:desarrollosABDSynthsABDSharedAssets+-- brands/       <- Logotipos vectoriales SVG de fabricantes
+-- models/       <- Renders e imagenes (WebP / PNG / SVG) de sintetizadores
+-- icons/        <- Iconografia vectorial monocromatica (currentColor)
+-- contracts/    <- Contratos JSON: hardware, tablas de modulacion Y catalogos
                    de patch GENERADOS desde el motor en C++
+-- styles/       <- Sistema de diseno, tokens CSS globales, temas y componentes
+-- components/   <- Modulos JS reutilizables (wheel.js, ...)
+-- assets/       <- Assets binarios compartidos (bender.png, ...)
+-- demo/         <- Demo interactiva para QA visual de componentes
+-- docs/         <- Guias oficiales de integracion, estilos e iconografia
```

### Curvas de calibracion del S950 (GENERADO, y vacio a proposito)

`contracts/s950_calibration.json` sale del mismo sitio que el catalogo y por el
mismo motivo, pero de la **otra** tabla del S950: `ABDSharedCode/SynthCore/S950Calibration.h`.

| | |
|---|---|
| De donde sale | `pnpm generate:s950-cal` |
| Verificar sin escribir | `pnpm check:s950-cal` (sale 1 si esta desfasado) |
| Que trae | las 6 curvas con unidad, rango de panel, sentido y escala, y **cero** puntos medidos |
| Quien lo consume | `components/s950Calibration.js`, que lo indexa |

El catalogo de patches dice **que byte es cual**. Este dice **cuanto vale**, o sea
en que unidad esta cada magnitud: envolvente en segundos, LFO en hercios, cutoff
en hercios, octavas de la envolvente de filtro, sustain en dB. Son dominios
distintos, y el rango del mando no es el rango de la unidad que lleva al lado.

**El contrato esta vacio de puntos y eso es el dato, no una carencia.** Los
puntos de una curva de calibracion son resultados experimentales —alguien puso
una sonda en un osciloscopio y barrio un mando—, y los del estudio Mz950 son
AGPLv3. Asi que el contrato trae `measured: false`, `pointCount: 0`, `points: []`
y `measuredRange: null` **explícitos**, y `valueAt()` devuelve `null` para todo.
No porque sea provisional: 0 s de attack no es "no medido", es un ataque
instantaneo, que es un click; y 0 *es* un numero, asi que un `|| 0` en el panel
lo volveria indistinguible de un dato. En C++ esto es `std::nullopt`.

Lo que si se puede hacer hoy, y es de lo que trata este contrato: **dibujar los
ejes**. De las seis curvas, el eje **horizontal** se dibuja entero en las seis
—sale del dominio del panel, que ya esta probado—, pero el **vertical** solo en
dos. Las otras cuatro son logaritmicas, y un eje en log necesita un minimo REAL
que es justamente un valor medido. `s950AxisFor()` lo dice con
`needsMeasuredMinimum`, y `s950Coverage()` da el rotulo: "Ninguna curva medida
todavia". Ese par es lo que permite **marcar** en vez de inventar.

### Catalogo de patches del S950 (GENERADO, no escrito a mano)

`contracts/s950_patch_fields.json` es una cosa distinta a los contratos de
arriba, y la distincion es lo que hay que tener clara: **este no se escribe, se
genera**. Sale de `ABDSharedCode/SynthCore/S950PatchFields.h`, que es la tabla
que gobierna el importador de patches y los tests en C++.

| | |
|---|---|
| De donde sale | `pnpm generate:s950-contract` |
| Verificar sin escribir | `pnpm check:s950-contract` (sale 1 si esta desfasado, para el CI) |
| Que trae | 38 campos de keygroup + 18 trims de Perform + las 11 salidas |
| Quien lo consume | `components/s950PatchFields.js`, que lo indexa |

El problema que resuelve es de los que no se ven: un panel que escribe los
nombres y los rangos a mano tiene **dos copias**, y las copias se separan sin
ruido. Alguien anade un campo al motor, el panel sigue enseñando 38, y el
desfase aparece el dia que un patch importado suena raro. Con el JSON
generado, panel y motor no pueden discrepar sobre el mismo byte: si discrepan,
es que el generador no se ha corrido, y `check:s950-contract` lo dice.

**El parser no se traga un fallo en silencio.** Dos cortes explicitos, los dos
copiados del generador de los contratos de modulacion: si la tabla sale VACIA
—el parser ha dejado de entender el codigo— no se escribe nada y el contrato
commiteado se queda como estaba; y si el numero de filas no es el que dicen los
tests de C++, el script avisa en vez de generar un contrato con 39 campos.

Un detalle que se decidio aqui y no en el dato: los nombres de salida se
guardan **crudos** (`ALL`, `MONO1`), y la tipografia la pone
`formatS950Name()`. Un contrato que maqueta se queda viejo el dia que el panel
cambie su estilo, y entonces el desfase parece del panel cuando es del dato.

## Preflight: los contratos generados no pueden llegar viejos

Los ficheros de `contracts/` que llevan `generatedFrom` son **copias**: su
verdad está en una cabecera de `ABDSharedCode` o en el código de un synth. Eso
funciona mientras alguien se acuerde de regenerar la copia cuando cambia el
original.

El fallo no es que se olvide un generador —eso se ve—. Es que **no pasa nada**:
el CI sigue en verde, el PR entra, y a partir de ahí hay dos verdades sobre las
curvas del S950, una en el `.h` y otra en el `.json`. Los paneles dibujan con la
segunda mientras el motor lee la primera, y un panel con ejes viejos no se
queja, porque un panel no sabe que sus ejes están viejos.

`pnpm run preflight` corre los tres generadores con `--check` y sale con:

| código | qué significa |
|---|---|
| `0` | todos los contratos generados al día |
| `1` | hay un contrato **desfasado**: regenéralo |
| `2` | hay un generador que **no ha podido leer sus fuentes**: el preflight no sabe si ese contrato esta al dia |

El 2 existe y va aparte del 1 a propósito. Un generador roto devolviendo 1
haría que alguien regenerase un contrato perfectamente bueno para arreglar un
parser que no entiende su código. Y un preflight que no distingue «tu contrato
está viejo» de «no puedo ni mirar» miente igual que el contrato que vigila.

Un contrato generado **sin** generador (más abajo) no es un 2: se avisa en voz
alta y el preflight sale con 0. No es que se esté mirando y aprobándose —no se
mira, no hay con qué— sino que no se puede hacer nada al respecto desde aquí, y
un rojo por eso taparía los rojos que sí se pueden arreglar.

### Y vigila también la cuarentena

La misma puerta recorre `contracts/` entero y comprueba las marcas de
**cuarentena**: los contratos que se saben dudosos y no se dan por buenos. Un
contrato retenido lleva `status: "quarantined"` y su `statusReason` en el
propio fichero, y sale con el motivo al lado, para que un Aparato que no aparece
en el cajón del laboratorio tenga una explicación a la vista en vez de solo
encontrarse cuando alguien lo busca.

La regla vive en [`utils/quarantine.js`](utils/quarantine.js), y la comparten el
preflight y el laboratorio de C++ por su mitad. La otra mitad está en
`HardwareContractQuarantine`, en el repositorio hermano, y **no se puede
compartir el fichero** porque uno es C++ y el otro es JS. Lo que ata las dos es
el enum de `contracts/hardware_profile.schema.json`: cada mitad lo compara
contra ese enum, con su propio test, y si divergen las dos se ponen rojas.

El preflight sale con **1** si un contrato está retenido y no dice por qué (el
laboratorio inventaría un texto de relleno, y un retenido con una explicación
inventada al lado es peor que no tener ninguna), o si un contrato usa un estado
que la regla no conoce (ese no lo retiene **ningún** lenguaje, así que su autor
creería que está marcado y no lo está). Sale con **2** si algún `.json` del
catálogo no se puede leer, que no es lo mismo: uno se arregla editando un campo
y el otro mirando por qué el fichero está roto.

Los esquemas de FX, matrices de modulación y campos de patch **no** tienen que
declarar `status`: gobiernan cosas que no son un Aparato. Lo que se comprueba es
que **algún** esquema sí lo haga, porque una regla que ningún esquema puede
aplicar no está vigente.

Corre **antes** de la suite, en su propio paso del workflow y sin filtro de
`paths:`: si se metiera dentro de un test, un `--check` olvidado se podría
saltar con un filtro de ruta, que es justo el fallo que se tapa.

**Los generadores necesitan a los repos hermanos.** Cada uno busca su fuente en
la carpeta hermana de este checkout, así que en CI este repo se descarga a
`ABDSharedAssets/` y los otros cuatro al mismo nivel: `ABDSharedCode`, `ABDEep`,
`ABDNeural` y `ABDMS2000`. Van **fijados a un SHA**, no a una rama, porque una
rama se mueve sola y el preflight pasaría en verde hoy y en rojo dentro de dos
días sin que nadie haya tocado nada. Cuando cambie una cabecera de esos
repos, hay que subir el SHA del workflow **y** regenerar los contratos en el
mismo commit: son las dos mitades del mismo hecho.

### Qué pasa si añades un generador nuevo

Está en el inventario de `scripts/check-generated-contracts.mjs`, **explícito y
a mano**. Es a propósito: un inventario se puede olvidar de actualizar y eso
falla ruidosamente, mientras que uno que se dedujera del directorio no se puede
olvidar y por eso se queda corto en silencio. `tests/generatedContractsPreflight.test.js`
recorre `scripts/` y falla si hay un generador que no esté declarado.

### Un contrato generado que no tiene generador

Hubo uno: `fx-effects.json` declaraba `generatedFrom: ABDEep/…/FXSlot_Factory.cpp`
y **no habia ningun generador** que lo produjera. El campo es la autoridad que un
panel lee para fiarse, y decia que venia del codigo.

Se resolvio **quitando el campo**, no escribiendo el generador. La cuenta no
cuadra: la fabrica tiene 56 `case` y el catalogo tiene 61 filas, y las cinco que
sobran —el 0 (bypass) y del 57 al 60— salen de `ABDSharedCode/DspEffects`
(`FxDefaultCatalogue.h`), no de ahi. Y la fabrica no tiene `family` ni `params`,
que son dos de las seis columnas de cada fila: un generador verificaria el id y la
clase, y dejaria en verde justo lo que no sabe. Eso no es una puerta, es una puerta
que no vigila.

La entrada `sinGenerador: true` se borro del inventario y **la mecanica se quedo**:
si un contrato declara de donde sale y nadie lo regenera, tiene que aparecer ahi, y
el preflight lo dice en voz alta. Una lista vacia es el estado bueno.

## El validador de esquemas miente si el esquema calla

`tests/helpers/validateSchema.js` recorre un contrato contra su esquema y
devuelve una lista de errores. Hasta hace poco **ignoraba en silencio los campos
que el esquema no declaraba**: sin `additionalProperties: false` —o con él, pero
sin mirarlo— un `replacesNote` colado en un contrato pasaba tan feliz como si
nada. Eso es exactamente la clase de campo que no aparece en el manual y que
nadie encuentra hasta que un motor lo lee y no encuentra lo que esperaba.

Ahora cada objeto cuyo esquema cierra con `additionalProperties: false` suelta
un error por cada campo sobrante, y el error dice las tres cosas que hacen falta
para arreglarlo sin buscar por todo el repositorio:

```
(raiz).otroCampo: propiedad que el esquema (fx-effects.schema.json) no declara.
O se anade a `properties` del esquema si el campo es del contrato, o se quita
del contrato si se ha colado.
```

El nombre del esquema entra en el mensaje, asi que `validate()` lleva un
cuarto argumento opcional (`validate(instancia, esquema, prefijo, nombre)`).
Sin el, el mensaje sale mas corto pero igual de accionable.

Las dos salidas se ofrecen las dos porque el caso **no tiene un dueño claro**: si
el campo es de verdad parte del contrato, lo que falta es su linea en
`properties`; si se ha colado, lo que sobra es su linea en el contrato.
Decidirlo es cosa de quien sabe lo que quiere, no del validador.

Dos tests de `tests/fxEffectsContract.test.js` comprueban la puerta en la raiz y
en un elemento anidado, y miran el mensaje **por partes** (la ruta, el nombre del
esquema, la palabra `no declara`) en vez de por frase entera. Fijar la redaccion
completa es lo que hizo que estos dos casos se quedaran apuntando a un mensaje
viejo el dia que el mensaje mejoro.

### El inventario es explicito: esquema contra contrato

Que un esquema exista no dice a que contrato pertenece. El vinculo vive en
`CONTRATOS_CON_ESQUEMA`, dentro del propio helper, y `tests/schemaValidator.test.js`
recorre esa lista para que ningun par se quede sin comprobar. Los nombres **no
siguen convencion** (`s950-calibration.schema.json` contra `s950_calibration.json`),
y tres contratos distintos comparten `modulation_matrix.schema.json` sin
declarar `$schema` en ninguno — por eso el vinculo no puede deducirse del fichero.

**Ya no queda ningun esquema huerfano.** `hardware_profile.schema.json` estaba
declarado sin un solo contrato, no porque no los tuviera sino porque nadie lo
habia declarado: hay **veintiseis** en el mismo directorio, y
`HardwareContractRegistry` los lee de ahi en produccion. Al atarlos salieron
**195 rojos**, todos del mismo tipo: un campo bueno en el sitio equivocado.
`minVal`/`maxVal`/`defaultVal` y `ccNumber` (48, 48, 48 y 36 usos), `isSoftsynth`,
y `functions[].measurementRecipe`, que decia QUE se puede medir sin decir COMO.
Los que faltaban se han declarado en el esquema, no: se han borrado del contrato.

Con eso son seis los esquemas y los seis tienen contrato. El sexto es
`roland_aira_patch_spec.schema.json`, que se escribio al encontrar que la tabla
de Model ID del patch_spec **contradecía** a los cuatro contratos de por
dispositivo (ver mas abajo).

### Un contrato en cuarentena no es un esquema sin contrato

`roland_aira_submodules.json` **no** esta atado a ningun esquema, y no es que se
haya olvidado: se ha medido y esta en cuarentena de forma consciente. Esa lista
se llama `CUARENTENAS` y vive aparte de `CONTRATOS_CON_ESQUEMA` — no dentro, con
`contracts: []` — porque lo dudoso aqui es un CONTRATO y no un esquema, y porque
meterlo dentro rompia el test que cuenta los ficheros del directorio: la clave se
llama `schema` y ese fichero no lo es.

El motivo, medido y escrito, no supuesto: el fichero trae **31 bloques** y el
`patch_spec` del AIRA Modular trae **31 modulos**, y **solo casan 7**
(`filter_24db`, `filter_18db`, `formant_filter`, `tube_clip`, `short_delay`,
`compressor`, `sample_and_hold`). Los otros 24 de cada lado no coinciden, y la
direccion del desajuste dice que estan mezclando mundos: el fichero trae
`fuzz_germanium`, `chorus_ensemble`, `phaser_4stage`, `pitch_transposer`, y un
AIRA Modular no tiene un fuzz de germanio; el AIRA tiene osciladores SAW y SQR, un
divisor de gates, logica y MIDI NOTE TO CV/GATE, y aqui no estan.

Lo que lo hace peligroso es que el fichero se identifica **como el AIRA**:
`deviceType: AUTOMATED_SYSEX`, el `midiIdentification` del AIRA, la imagen del
modelo. Quien lo lea por la cabecera —una calibracion, un generador de programas—
cree que son los modulos de la maquina. Por eso el test `CUARENTENA_ROLAND_AIRA`
mide el cruce leyendo los dos ficheros, en vez de fiarse de una lista de 31
nombres escrita a mano que se quedaria verde mientras el fichero cambiase.

### Los Model ID del AIRA se cruzan entre cinco ficheros

Escribir el esquema del patch_spec salio con un error de datos debajo. La tabla
`devices` decia **torcido = 16** y **demora = 17**. Los cuatro contratos de por
dispositivo, y la nota `_note` de al lado —que cita el README de la fuente—
dicen lo contrario: **demora = 16, torcido = 17**. Dos fuentes contra una, y la
nota es la cita.

Por que importa mas de lo que parece: el Model ID es el byte que va en el SysEx.
Con la tabla cambiada, un editor de patches del AIRA identifica un Demora como
Torcido, escribe en el, y no se entera. Y como `HardwareContractRegistry` lee los
contratos de por dispositivo —que son los correctos—, el detector de MIDI y el
editor de patches discrepaban sin que nada los enfrentara. La tabla esta
arreglada, y un test cruza ahora los cinco sitios para que no se descoloquen
solos.

### Un `$ref` se resuelve, o se dice que no

Antes de cerrar el esquema huerfano hubo que arreglar una cosa mas pequena y
peor: un nodo con `$ref` no es un objeto, no es un array y no es una hoja, asi
que en `validate()` caia de largo por las TRES ramas y devolvia **cero errores
sin mirar nada**. Todo lo que colgase de un `$ref` —en
`hardware_profile.schema.json` son `preCalibrationSetup`, `preSessionSetup` y
`postSessionTeardown`— se declaraba valido por no mirarse.

Ahora `validate()` resuelve los `$ref` locales (`#/...`, con `~0` y `~1`) contra
el esquema raiz, y un `$ref` que no apunta a nada es un **error con su motivo**,
no un silencio: es la misma mentira que un `oneOf` sin ejecutar, en otra forma.

Con eso, `hardware_profile.schema.json` —que no tiene contrato, ni consumidor, ni
un solo test en la suite— se pudo cerrar de verdad: sus **nueve** objetos con
`properties` declaran `additionalProperties: false`, incluido el que vive dentro
de `$defs`, porque un objeto de datos sigue siendo un objeto de datos alla donde
este definido. Antes sus ocho objetos abiertos estaban **fijados** en un recuento
de test, con la razon de que sin instancia nadie puede decir si cerrar rompe algo
o solo lo endurece. La salida no fue aflojar el requisito: fue hacerlo posible, y
el hueco ahora lo vigila un test que puede ponerse verde.

Y para que el esquema sin contrato se pudiera mirar de verdad, el test montaba una
**instancia minima** y la pasaba por el validador, con un campo colado debajo de
cada uno de los tres `$ref`. Eso ya no hace falta: el esquema tiene veintiseis
contratos de verdad que lo comprueban, que es un monton de instancias que nadie
tiene que inventar. La instancia minima se queda como red por si un dia vuelve a
haber un esquema sin contrato —que se declararia con su motivo, no en silencio—.

### Un solo nombre para el rango de un mando

Habia dos vivos: `min`/`max`/`default` y `minVal`/`maxVal`/`defaultVal`. El
esquema declaraba los dos porque cada grupo de contratos usaba uno —9 con los
segundos, 6 con los primeros—, que es lo que hace un esquema honesto: declarar
lo que los datos usan, no lo que uno memoria de los datos. Lo que no era honesto
era tener dos.

Se ha unificado en `minVal`/`maxVal`/`defaultVal` (el mayoritario), los seis
contratos migrados y el esquema ha dejado de declarar el nombre viejo. Cuatro
tests lo fijan: que el esquema no lo declara, que ningun contrato del inventario
lo usa, que el contrato **en cuarentena** tampoco —que no valida contra nada y
es justo donde se cuela una cuarta variante— y, de paso, **cual es el reparto que
queda**: `cc` frente a `ccNumber`. Ese ultimo sigue sin resolverse y aqui se dice
por que: el numero de MIDI del AIRA viene en el SysEx (`sysexAddress`) y no es el
mismo dato, asi que unificar los dos sin decidir cual es cual seria cambiar lo
que significan.

### Lo que el validador sigue sin mirar

- **Un `$ref` a OTRO fichero** no se resuelve. Este validador lee un fichero, y
  seguir una referencia externa obliga a decidir quien vigila ese segundo
  fichero. Se declara no soportado antes que resolverse a medias.
- **`$schema` no se exige** en ningun contrato, precisamente porque la matriz
  sirve a tres.

Un hueco que no se cuenta es un hueco que se olvida, asi que esto vive en el
propio test y no solo aqui.

### La copia de contratos del laboratorio se compara, y su desfase FALLA

`ABDAudioLab/contracts/hardware/` no es un symlink ni un artefacto de build: son
**40 ficheros** de este mismo `contracts/`, y los carga el registro de C++ cuando
no encuentra ni esta copia ni la del hermano. El problema no es que exista, es
que **nadie la compara**: hace tiempo 38 eran identicos y solo uno se habia
quedado viejo, en silencio.

El orden de la cadena lo hace peor, no mejor: la copia se usa cuando las otras dos
NO estan. O sea, que la version vieja solo se ve cuando ya no hay forma de
compararla. Y es justo la copia que sobrevive a una maquina sin repositorio
hermano, que es un clon limpio y el CI del laboratorio: ahi no hay con quien
compararla y nadie lo hace por ella.

Asi que el preflight la compara y **falla**, con codigo 1. Antes solo avisaba, y
la razon —que un rojo a diario se apaga— era buena pero el alcance no: la lista
`COPIAS_BLOQUEANTES` era la unica puerta que vigilaba la copia, y vacia no habia
ninguna. La lista esta en el propio script, sigue siendo reversible en una linea
(vaciarla devuelve el aviso) y hay un test que comprueba que la copia del
laboratorio esta dentro, para que bajarla sea una decision y no un olvido.

El fallo dice **que se hace**, no solo que algo va mal:

```
COPIAS DESFASADAS (1):
  ABDAudioLab/contracts/hardware  [BLOQUEANTE]

SE ARREGLA ASI:

  1. Copia los .json del origen encima de la copia:
       xcopy /Y /I "ABDSharedAssets\contracts\*.json" "..\ABDAudioLab\contracts\hardware\"

  2. Si la copia no hace falta —el laboratorio tiene el repositorio
     hermano al lado—, el arreglo de verdad es borrar el directorio.
```

Y lista los tres casos por separado —distinto, falta, sobra— porque se arreglan
distinto: los dos primeros se resuelven copiando, el tercero borrando. Un mensaje
que los mezclaria obligaria a abrir el diff para saber cual es cual.
`ABDAudioLab/contracts/hardware/` no es un symlink ni un artefacto de build: son
**39 ficheros** de este mismo `contracts/`, y los carga el registro de C++ cuando
no encuentra ni esta copia ni la del hermano. El problema no es que exista, es
que **nadie la compara**: hasta ahora 38 eran identicos y solo uno se habia
quedado viejo, en silencio.

El orden de la cadena lo hace peor, no mejor: la copia se usa cuando las otras dos
NO estan. O sea, que la version vieja solo se ve cuando ya no hay forma de
compararla. El preflight la compara ahora y la avisa. **Avisa, y no falla**,
porque `ABDAudioLab` esta en desarrollo y un preflight que bloquea el trabajo de
otro repo se apaga — y apagarse es peor que no existir. La lista
`COPIAS_BLOQUEANTES`, en el propio script, esta **vacia a proposito**, y un test
comprueba que lo sigue estando, para que el vacio sea una decision y no un
olvido.

## Contratos de matriz de modulacion

`contracts/modulation_matrix.schema.json` declara la forma de la tabla de
modulacion de un synth: que fuentes y que destinos existen, en que orden, y que
politica aplica a cada destino. Hay tres instancias:

| Contrato | Synth | `authority` | De donde sale |
|---|---|---|---|
| `abdeep_modulation_matrix.json` | DeepMind 12 | `hardware` | manual + rango de byte + **medido** en los bancos de fabrica |
| `abdms2000_modulation_matrix.json` | Korg MS-2000 | `hardware` | `VirtualPatchMatrix.h` |
| `neuronik_modulation_matrix.json` | NEURONiK | `design` | `getModDestinationTable()` + el `switch` del motor |

`authority` no es decorativo: los dos `hardware` emulan un dispositivo y sus
indices son indices de BYTE, con el orden del manual. El `design` es un synth
propio, pero su tabla es ademas el **formato de preset** (los choices guardan
indice). Los tres tienen el mismo motivo, asi que la misma regla: **solo se
appendea al final**, porque insertar una fila en medio re-mapea todos los presets
guardados. Eso lo verifica `tests/modulationMatrixContract.test.js`.

Dos campos de la tabla de destinos llevan la politica que antes vivia dentro de
codigo:

- **`perNote`**: el destino se resuelve por voz. Una envolvente no es global.
- **`replaces`**: cuando la fuente es una envolvente, la ruta REEMPLAZA el
  factor del destino en vez de sumar encima (sintesis de reemplazo). En
  NEURONiK son los destinos 1, 10 y 12-16, y es lo que no puede perderse al
  sacar el `switch` de 31 casos a la tabla.

Y un detalle que no es uniforme: **el indice 0 no siempre es inerte**. En ABDEep
y NEURONiK es el 'None'/'Off', pero en ABDMS2000 el 0 es el EG1, una fuente de
verdad, y una ruta se apaga con la intensidad a cero. El motor compartido
(`ABDSharedCode/SynthCore/ModMatrix.h`) lo lleva como parametro de plantilla
(`kZeroIdInert`) justamente para no suponerlo.

Los `@import` de `wheel.js`/`wheels.css`/`kbd-buttons.css` y `assets/bender.png`
se publican via `package.json` (exports `./components/*`, `./styles/*`, `./assets/*`,
field `files` incluye `components`, `styles`, `assets`), de modo que funcionan tanto
con la junction NTFS como instalando el paquete npm por nombre.

---

## Sistema de Estilos — Resumen Rapido

### Tokens (120+ variables)
Colores (4 bg, 3 bordes, accent + estados, 3 text), tipografia (8 tamanos), espaciado (11 niveles), transiciones, radii, sombras, z-index, constantes de layout.

### Temas (5 disponibles)
| Tema | Color Principal | Archivo |
|---|---|---|
| MS2000 | Teal / cyan | themes/ms2000.css |
| CZ-101 | Red / slate | themes/cz101.css |
| DeepMind | Amber / graphite | themes/deepmind.css |
| Juno | Tricolor | themes/juno.css |
| AudioLab | Green / dark | themes/audiolab.css |

Ademas de los temas por synth, la suite trae un MODO CLARO generico: `[data-theme="light"]`
en `styles/tokens.css` (contraste WCAG medido; el LCD no cambia: es autoiluminado). El
interruptor universal es `components/themeSwitcher.js` (`ThemeSwitcher`): aplica `data-theme`
en `<html>` o `<body>`, persiste opcionalmente y el fondo tintable (`--abd-bg-tint`) sigue al
tema solo. Principio: un synth define SOLO tokens de color y elige tipos de elemento; lo demas
(widgets, skins de forma, mecanismos) es universal en este paquete.

### Componentes (11 archivos)
| Componente | Archivo | Contenido |
|---|---|---|
| Panels | components/panels.css | .chassis, .panel, .module, .module-header |
| Buttons | components/buttons.css | .btn, .btn-glow, .btn-toggle, .led-btn |
| Controls | components/controls.css | .abd-select, .abd-slider, .param-val |
| Navbar | components/navbar.css | .navbar, .mode-selector, .mode-tab |
| LCD | components/lcd.css | .lcd-container, .lcd-line-1, .lcd-nav-btn |
| Envelope | components/envelope.css | Curva ADSR y su aguja (.abd-envpad, .abd-envpad__line, __area, __needle, __handle, __values, __caption, __stage) |
| Scope | components/scope.css | ABDScope display (especifico) |
| Keyboard | components/keyboard.css | Piano keyboard (especifico) |
| Wheels | components/wheels.css | Ruedas PITCH/MOD filmstrip (reutilizable, .kbd-wheel-wrapper) |
| Keyboard Buttons | components/kbd-buttons.css | Botones octava, PANIC, sustain, sostenuto, soft (reutilizable) |
| Wheel JS | components/wheel.js | Clase Wheel + factory createWheel (sprite filmstrip 101 frames) |

### Modulos JS reutilizables

| Modulo | Export | Descripcion |
|---|---|---|
| components/wheel.js | `Wheel`, `createWheel(opts)` | Rueda filmstrip (bender.png u otro sprite). opts: `type` ('pitch'/'mod'), `spriteUrl`, `frameWidth/Height`, `totalFrames`, `initialFrame`, `minValue/maxValue`, `onChange(val)`, `container`, `label`, `valueFormatter`. `renderInto(el)`, `destroy()`. |
| components/envelopePad.js | `EnvelopePad` | Editor ADSR con tres asas arrastrables (la central mueve decay y sustain a la vez). Mismo contrato de familia que `Knob`/`XYPad`: `setValue`/`getValue`/`destroy`/`onChange`/`onDragStart`/`onDragEnd`, y `editable:false` lo convierte en vista. |
| components/envelopeCurve.js | `createEnvelopeCurve`, `envelopePoints`, `envelopeLinePath`, `envelopeAreaPath`, `envelopeNeedlePath`, `ENVELOPE_SEGMENTS`, `ENVELOPE_VIEWBOX`, `DEFAULT_ENVELOPE`, `NEEDLE_FLOOR` | La geometria pura y la vista de fabrica, **sin asas**: sirve para pintar la curva de solo lectura (la del cajon) y para testear la geometria sin DOM. |

`envelopeGestures.js` (el gesto) NO se exporta por el barrel a proposito: lo consume el pad y
nadie mas. Si alguna vez hace falta, se exporta con el resto.

---

## Uso Rapido

```css
/* En tu proyecto, via junction shared/ -> ABDSharedAssets/styles/ */
@import './shared/tokens.css';
@import './shared/themes/ms2000.css';
@import './shared/components/panels.css';
@import './shared/components/buttons.css';
@import './shared/components/lcd.css';
@import './shared/components/wheels.css';
@import './shared/components/kbd-buttons.css';
@import './shared/components/envelope.css';
```

```js
// Rueda filmstrip compartida (ABDSharedCode/MidiKeyboard la consume asi)
import { createWheel } from '@abdsynths/shared/components/wheel.js';

const pitch = createWheel({
  type: 'pitch',
  container: document.getElementById('pitch-wheel-container'),
  onChange: (val) => console.log(val)
});
pitch.renderInto();
// pitch.destroy() al desmontar
```

### Como paquete npm `@abdsynths/shared` (vía preferida con bundler/Vite)

```cmd
npm install @abdsynths/shared@file:..\ABDSharedAssets
```

```js
import '@abdsynths/shared/styles/index.css';   // bundle completo
```

Cascada de 3 niveles: importa los tokens compartidos primero y carga tus overrides host
(`themes.css`, `--synth-*`, `--kbd-*`...) después — el look actual del proyecto se conserva.
Ver `docs/INTEGRATION_GUIDE.md` §5 bis.

---

## Documentacion Detallada

- Guia de Integracion Zero-Copy (docs/INTEGRATION_GUIDE.md)
- Guia del Sistema de Diseno y Tokens CSS (docs/STYLES_GUIDE.md)
- Guia de Iconografia Monocromatica (docs/ICONS_GUIDE.md)

---

## Demo

Para visualizar los componentes, abre demo/demo.html en un navegador.
Incluye selector de temas interactivo, todos los componentes documentados y la
familia JS de controles (Knob/Slider/Toggle/Select/Segmented/XYPad/**EnvelopePad**
con skins, sección 8) más los instrumentos que no caben ahí (**EffectLEDButton,
PeakLED, SevenSegmentDisplay, SilverFilmstripKnob, Wheel, TapeEchoVisual,
ModMatrix y el cajón**, sección 9).

`FilmstripFader` no está en la demo a propósito: exige un sprite de tira
(`ST_Fader_*.png`) que vive en el repo del MS-2000, no en este. Por lo mismo, los
sliders con skin `ms2000` piden ese sprite y salen vacíos aquí: es un 404
preexistente, no una rotura.

```cmd
npm run demo        # sirve la raíz del paquete en http://localhost:5199
                    # abrir /demo/demo.html
```
