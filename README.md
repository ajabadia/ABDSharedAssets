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
+-- demo/         <- Demo interactiva para QA visual de componentes
+-- docs/         <- Guias oficiales de integracion, estilos e iconografia
```

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

### Componentes (7 archivos)
| Componente | Archivo | Contenido |
|---|---|---|
| Panels | components/panels.css | .chassis, .panel, .module, .module-header |
| Buttons | components/buttons.css | .btn, .btn-glow, .btn-toggle, .led-btn |
| Controls | components/controls.css | .abd-select, .abd-slider, .param-val |
| Navbar | components/navbar.css | .navbar, .mode-selector, .mode-tab |
| LCD | components/lcd.css | .lcd-container, .lcd-line-1, .lcd-nav-btn |
| Scope | components/scope.css | ABDScope display (especifico) |
| Keyboard | components/keyboard.css | Piano keyboard (especifico) |

---

## Uso Rapido

```css
/* En tu proyecto, via junction shared/ -> ABDSharedAssets/styles/ */
@import './shared/tokens.css';
@import './shared/themes/ms2000.css';
@import './shared/components/panels.css';
@import './shared/components/buttons.css';
@import './shared/components/lcd.css';
```

---

## Documentacion Detallada

- Guia de Integracion Zero-Copy (docs/INTEGRATION_GUIDE.md)
- Guia del Sistema de Diseno y Tokens CSS (docs/STYLES_GUIDE.md)
- Guia de Iconografia Monocromatica (docs/ICONS_GUIDE.md)

---

## Demo

Para visualizar los componentes, abre demo/demo.html en un navegador.
Incluye selector de temas interactivo y todos los componentes documentados.
