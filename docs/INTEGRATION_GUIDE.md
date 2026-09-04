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

## 6. Checklist de Integracion

- Junction shared/ -> ABDSharedAssets/styles/ creado
- tokens.css importado
- Tema seleccionado aplicado (data-theme o @import)
- Componentes importados (panels.css, buttons.css, etc.)
- QA visual con demo/demo.html como referencia
- Verificar que _review/ NO esta en el proyecto
