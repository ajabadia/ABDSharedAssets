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

### Contratos de matriz de modulacion

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
