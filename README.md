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
+-- contracts/    <- Contratos JSON de especificacion de hardware
+-- styles/       <- Sistema de diseno, tokens CSS globales, temas y componentes
+-- components/   <- Modulos JS reutilizables (wheel.js, ...)
+-- assets/       <- Assets binarios compartidos (bender.png, ...)
+-- demo/         <- Demo interactiva para QA visual de componentes
+-- docs/         <- Guias oficiales de integracion, estilos e iconografia
```

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

### Componentes (10 archivos)
| Componente | Archivo | Contenido |
|---|---|---|
| Panels | components/panels.css | .chassis, .panel, .module, .module-header |
| Buttons | components/buttons.css | .btn, .btn-glow, .btn-toggle, .led-btn |
| Controls | components/controls.css | .abd-select, .abd-slider, .param-val |
| Navbar | components/navbar.css | .navbar, .mode-selector, .mode-tab |
| LCD | components/lcd.css | .lcd-container, .lcd-line-1, .lcd-nav-btn |
| Scope | components/scope.css | ABDScope display (especifico) |
| Keyboard | components/keyboard.css | Piano keyboard (especifico) |
| Wheels | components/wheels.css | Ruedas PITCH/MOD filmstrip (reutilizable, .kbd-wheel-wrapper) |
| Keyboard Buttons | components/kbd-buttons.css | Botones octava, PANIC, sustain, sostenuto, soft (reutilizable) |
| Wheel JS | components/wheel.js | Clase Wheel + factory createWheel (sprite filmstrip 101 frames) |

### Modulos JS reutilizables

| Modulo | Export | Descripcion |
|---|---|---|
| components/wheel.js | `Wheel`, `createWheel(opts)` | Rueda filmstrip (bender.png u otro sprite). opts: `type` ('pitch'/'mod'), `spriteUrl`, `frameWidth/Height`, `totalFrames`, `initialFrame`, `minValue/maxValue`, `onChange(val)`, `container`, `label`, `valueFormatter`. `renderInto(el)`, `destroy()`. |

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
familia JS de controles (Knob/Slider/Toggle/Select/Segmented/XYPad con skins,
sección 8).

```cmd
npm run demo        # sirve la raíz del paquete en http://localhost:5199
                    # abrir /demo/demo.html
```
