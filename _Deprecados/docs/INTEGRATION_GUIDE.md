# GUIA DE INTEGRACION — ABDSharedAssets (Zero-Copy)

> Proposito: Guia oficial para enlazar recursos compartidos (marcas, modelos, contratos y estilos) en cualquier plugin, sintetizador o herramienta de la suite ABDSynths.

---

## 1. Filosofia Zero-Copy (NTFS Directory Junctions)

Para cumplir con la directriz DRY (Don't Repeat Yourself):
- Los proyectos satelite nunca copian los archivos de este directorio.
- Se vinculan mediante Directory Junctions NTFS (mklink /J).
- Los cambios realizados en ABDSharedAssets se reflejan instantaneamente en todos los proyectos vinculados.

---

## 2. Los Cinco Pilares Compartidos

D:desarrollosABDSynthsABDSharedAssets+-- brands/       -> Logotipos vectoriales SVG de fabricantes
+-- models/       -> Renders WebP/PNG de sintetizadores, modulos y bancos
+-- contracts/    -> Contratos JSON de hardware y automatizacion
+-- styles/       -> Sistema de diseno, tokens CSS globales, temas y componentes
+-- demo/         -> Demo interactiva para QA visual

---

## 3. Mapa de Enlaces por Proyecto

| Proyecto | Carpeta Local | Comando NTFS |
|---|---|---|
| Sintetizadores VST/AU | WebUIassetsrands | mklink /J "WebUIassetsrands" "..\..\ABDSharedAssets\brands" |
| Sintetizadores VST/AU | WebUIsrcstylesshared | mklink /J "WebUIsrcstylesshared" "..\..\..\ABDSharedAssets\styles" |
| ABDAudioLab | assetsrands | mklink /J "assetsrands" "..\ABDSharedAssets\brands" |
| ABDAudioLab | contractshardware | mklink /J "contractshardware" "..\ABDSharedAssets\contracts" |
| ABDBankManager | WebUIimages | mklink /J "WebUIimages" "..\..\ABDSharedAssets\models" |

---

## 4. Script Automatizado (setup_links.bat)

@echo off
set "SHARED=..\ABDSharedAssets"
if not exist "%SHARED%" (echo [ERROR] No se encuentra ABDSharedAssets & exit /b 1)
if not exist "WebUI\assets" mkdir "WebUI\assets"
if not exist "WebUI\assets\brands" mklink /J "WebUI\assets\brands" "%SHARED%\brands"
if not exist "WebUI\assets\models" mklink /J "WebUI\assets\models" "%SHARED%\models"
if not exist "WebUI\src\styles" mkdir "WebUI\src\styles"
if not exist "WebUI\src\styles\shared" mklink /J "WebUI\src\styles\shared" "%SHARED%\styles"
echo [OK] Junctions creados correctamente.

---

## 5. Integracion de Componentes CSS

### Estructura de estilos compartidos

styles/
+-- tokens.css              -> 120+ tokens de diseno
+-- index.css               -> Bundle completo
+-- themes/
|   +-- ms2000.css, cz101.css, deepmind.css, juno.css, audiolab.css
+-- components/
    +-- panels.css          -> .chassis, .panel, .module
    +-- buttons.css         -> .btn, .btn-glow, .btn-toggle, .led-btn
    +-- controls.css        -> .abd-select, .abd-slider, .param-val
    +-- navbar.css          -> .navbar, .mode-selector, .mode-tab
    +-- lcd.css             -> .lcd-container, .lcd-line-1, .lcd-nav-btn
    +-- scope.css           -> ABDScope display
    +-- keyboard.css        -> Piano keyboard

### Importacion recomendada

/* Para nuevos proyectos */
@import './shared/tokens.css';
@import './shared/themes/ms2000.css';
@import './shared/components/panels.css';
@import './shared/components/buttons.css';
@import './shared/components/controls.css';
@import './shared/components/navbar.css';
@import './shared/components/lcd.css';

/* Para proyectos existentes (migracion gradual) */
@import './shared/tokens.css';
/* Usar tokens en estilos existentes */
.my-panel {
  background: var(--color-panel-bg);
  border: 1px solid var(--color-panel-border);
}

### Cambio de tema

document.documentElement.setAttribute('data-theme', 'cz101');

---

## 5 bis. Estilos como paquete npm (`@abdsynths/shared`) — vía preferida

A partir de septiembre 2026, `styles/` se exporta también como paquete npm `@abdsynths/shared`
(`package.json` con `exports` → `./styles/*`). Es la forma recomendada para proyectos que ya tienen
bundler (Vite) o quieren importar el CSS **por nombre**. Las junctions/quotes del punto 4 siguen
funcionando para proyectos raw-ESM sin bundler.

**Instalar** (proyecto consumidor):
```cmd
npm install @abdsynths/shared@file:..\ABDSharedAssets
```

**Importar por nombre** (funciona con Vite):
```js
import '@abdsynths/shared/styles/index.css';   // bundle completo (tokens + tema + componentes)
// o por partes:
import '@abdsynths/shared/styles/tokens.css';
import '@abdsynths/shared/styles/themes/ms2000.css';
```

**Cascada de 3 niveles (host MS2000 intacto):** los tokens compartidos se importan primero y los
overrides del proyecto se cargan después (sus `themes.css`, `--synth-*`, `--kbd-*`, etc.). En
ABDMS2000 esto se hace con `WebUI/src/styles/shared-cascade.css` + un plugin Vite que lo inyecta
como primer stylesheet; `themes.css` del host gana la cascada. El prototipo Vite original
(`demo/proto/`) fue absorbido por `demo/demo.html` y eliminado.

---

## 5 ter. Componentes Transversales de UI (`@abdsynths/shared/components`)

Los módulos JavaScript interactivos se importan directamente desde el barrel de componentes:

```js
import { 
  SynthNavBar, 
  createSynthNavBar, 
  AboutDialog, 
  createAboutDialog,
  LiveSysExInspector,
  createLiveSysExInspector
} from '@abdsynths/shared/components';
```

### 1. Barra de Navegación (`SynthNavBar`)
* **Propósito:** Barra superior estándar de menús con soporte para menús declarativos (File / Edit / Mode / View / Help), submenús en cascada (`▸`), checkmarks (`✓`), atajos `<kbd>` y slots personalizables.
* **Auto-conexión:** Se vincula automáticamente con `AboutDialog` al invocar `about` o `checkForUpdates`.
* **Estilos:** `styles/components/navbar.css` (incluido en `styles/index.css`).

### 2. Diálogo About y Actualizador (`AboutDialog`)
* **Propósito:** Ventana modal de información del sintetizador, versión, build y sincronización reactiva con `ABDShared::AutoUpdater` (eventos `checkForUpdates`, `getUpdateStatus`, `openBrowserUrl`, `updateCheckResult`).
* **Fallback Web:** Consulta automática a GitHub Releases API si se ejecuta fuera de JUCE.
* **Accesibilidad:** Trampa de foco accesible y aislamiento `inert` vía `overlayFocus.js`.
* **Estilos:** `styles/components/about-dialog.css` (incluido en `styles/index.css`).

### 3. Monitor de Tramas en Vivo (`LiveSysExInspector`)
* **Propósito:** Inspector reactivo desacoplable y flotante para diagnosticar y auditar en tiempo real las mutaciones del Edit Buffer MIDI SysEx.
* **Características:**
  - Resaltado micro-animado de mutaciones byte a byte (`sysex-pulse`).
  - Comparativa diferencial Diff A/B con conteo reactivo de discrepancias (`Δ N B`).
  - Decodificación semántica automática de fabricante (`Casio 0x44`, `Korg 0x42`, `Roland 0x41`, `Yamaha 0x43`, `Behringer 0x00 0x20 0x32`), Device ID y validación `EOX (0xF7)`.
  - Exportación directa de archivos binarios `.syx` y copia rápida al portapapeles (`Copy Hex` y `Copy Array`).
  - Ventana flotante desacoplable con cabecera arrastrable (`draggable`), minimizable y cierre limpio mediante tecla `Escape` o botón `✕` sin destruir la instancia.
* **Interface Pública:**
  - `show(): this` — Muestra el inspector (dispara `onOpen`).
  - `hide(): this` — Oculta el inspector conservando buffers y estado (dispara `onClose`).
  - `toggle(): this` — Alterna visibilidad.
  - `isOpen(): boolean` — Estado de visibilidad actual.
  - `updateBuffer(buf: Uint8Array | number[]): this` — Actualiza la trama e ilumina las mutaciones reactivas.
  - `setBuffer(buf)` — Alias de conveniencia para `updateBuffer`.
  - `getBuffer(): Uint8Array` — Devuelve copia del buffer actual.
  - `destroy(): void` — Desmonta del DOM y libera event listeners y timers.
* **Estilos:** `styles/components/live-sysex-inspector.css` (o importado en la primera línea de `overlays.css`).

---

## 6. Checklist de Integracion

- Junction shared/ -> ABDSharedAssets/styles/ creado **o** `@abdsynths/shared` en package.json (vía preferida con bundler)
- tokens.css importado
- Tema seleccionado aplicado (data-theme o @import)
- Componentes importados (panels.css, buttons.css, navbar.css, about-dialog.css, etc.)
- Componentes transversales (`SynthNavBar`, `AboutDialog`, `LiveSysExInspector`) montados según aplique
- QA visual con demo/demo.html como referencia
- Cascada host verificada: los overrides del proyecto ganan a los tokens compartidos
- Verificar que _review/ NO esta en el proyecto
