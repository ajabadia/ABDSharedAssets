# GUIA DEL SISTEMA DE DISENO Y ESTILOS — ABDSharedAssets

> Proposito: Especificacion de tokens de diseno, paletas tematicas y contratos de estilo para toda la suite ABDSynths.

---

## 1. Arquitectura de Tokens en Cascada

El sistema de estilos utiliza un patron de cascada de 3 niveles:

1. Host Tokens (Sintetizador / Plugin) — Define --color-bg-base, --color-panel-bg, --color-accent
2. Global Shared Tokens (ABDSharedAssets/styles/tokens.css) — Provee valores estandar y temas preconfigurados
3. Component Tokens (scope.css, keyboard.css) — Mapea variables especificas con fallback automatico al Host

---

## 2. Tokens Globales Disponibles (tokens.css)

### Surfaces & Backgrounds (4 niveles)
- --color-bg-base: Canvas, fondo principal (#0a0e14)
- --color-panel-bg: Cards, paneles, sidebars (#0f1620)
- --color-panel-surface: Paneles anidados, modulos (#151f2e)
- --color-panel-surface-elevated: Modals, popovers, tooltips (#1c2a3d)

### Borders (3 niveles)
- --color-panel-border: Borde sutil por defecto (rgba(0,195,255,0.2))
- --color-panel-border-strong: Borde enfatizado / focused (rgba(0,195,255,0.45))
- --color-panel-border-dim: Separadores casi invisibles (rgba(0,195,255,0.1))

### Accent & Interactive States
- --color-accent: #00c3ff
- --color-accent-rgb: 0, 195, 255
- --color-accent-hover: #38d3ff
- --color-accent-active: #0099cc
- --color-accent-dim: rgba(0, 195, 255, 0.15)

### Typography — Colors (3 niveles)
- --color-text-main: #f0f7ff (headings, active labels)
- --color-text-muted: #7e9bb5 (body text, descriptions)
- --color-text-dim: #4a637a (secondary info, placeholders)

### Text Size Scale (8 niveles)
- --text-2xs: 7px | --text-xs: 8px | --text-sm: 9px | --text-md: 10px
- --text-base: 11px | --text-lg: 12px | --text-xl: 13px | --text-2xl: 18px

### Spacing (11 niveles)
--space-1 (2px) hasta --space-20 (40px)

### Transitions
- --transition-fast: 0.15s ease
- --transition-normal: 0.2s ease
- --transition-slow: 0.35s ease
- --transition-spring: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)

### Radii & Geometry
- --radius-sm: 2px | --radius-md: 4px | --radius-lg: 8px
- --radius-panel: 4px | --radius-chassis: 6px

### Shadows (4 niveles)
- --shadow-elevation-1/2/3: Elevacion creciente
- --shadow-inset-bevel: Efecto bisel inset

### Z-Index Scale
--z-base(1) > --z-panel(10) > --z-navbar(30) > --z-dropdown(50) > --z-modal(100) > --z-overlay(500) > --z-toast(900)

### Layout Constants
- --navbar-height: 44px
- --module-header-height: 28px
- --panel-gap: var(--space-4)

---

## 3. Temas Predefinidos (styles/themes/)

Para aplicar un tema, anade data-theme o clase skin-* en el elemento contenedor:

- data-theme="ms2000" — Korg MS2000 (Azul cian / verde LCD)
- data-theme="cz101" — Casio CZ-101 (Rojo vintage / gris pizarra)
- data-theme="deepmind" — Behringer DeepMind (Amber / grafito)
- data-theme="juno" — Roland Juno-106 (Franjas tricolor / verde LCD)
- data-theme="audiolab" — ABDAudioLab (Verde nordico / oscuro cientifico)

Cada tema overridea: 4 bg, 3 bordes, accent+hover+active+dim, 3 text, LCD, 3 scrollbar.

---

## 4. Componentes Compartidos (styles/components/)

### 4.1 Panels & Layout (panels.css)

- .chassis: Contenedor principal tipo hardware, borde fuerte, elevacion
- .panel: Panel interior, flex column, padding y gap automatico
- .panel-row: Fila horizontal dentro de un panel
- .panel-elevated: Card elevada (modals, tooltips, popovers)
- .module: Modulo individual (flex, border, radius)
- .module-header: Cabecera de modulo, uppercase, border-bottom
- .module-header--accent: Variante con color accent
- .module-header--muted: Variante con color muted
- .panel-divider: Separador horizontal 1px

### 4.2 Buttons (buttons.css)

- .btn: Boton base
- .btn-xs / .btn-sm: Tamannos pequenos
- .btn-solid: Fondo solid accent
- .btn-outline: Borde accent, fondo transparente
- .btn-ghost: Sin borde, transparente
- .btn-glow: Con glow/box-shadow (patron CZ101)
- .btn-toggle: Boton toggle fullWidth
- .btn.active: Estado activo (cualquier variante)
- .btn-danger: Color danger (borde + hover)
- .led-btn: Boton LED estilo step sequencer
- .led-btn.active: LED encendido con glow

### 4.3 Controls (controls.css)

- .abd-select: Select dropdown tematico
- input[type="range"].abd-slider: Range slider tematico
- .param-val: Valor de parametro (fuente LCD)

### 4.4 Navbar (navbar.css)

- .navbar: Barra de navegacion principal con backdrop-filter
- .nav-left / .nav-right: Secciones izquierda/derecha
- .brand-title: Nombre del sintetizador
- .mode-selector: Contenedor de tabs segmentados
- .mode-tab: Tab individual del selector

### 4.5 LCD Display (lcd.css)

- .lcd-container: Contenedor LCD con phosphor glow
- .lcd-main: Padding y layout del contenido
- .lcd-line-1: Primera linea (titulo/grande)
- .lcd-line-2: Segunda linea (subtitulo/pequena)
- .lcd-nav-btn: Boton de navegacion LCD

---

## 5. Como Consumir los Estilos

### Opcion A: Bundle completo
@import './shared/index.css';

### Opcion B: Importacion selectiva
@import './shared/tokens.css';
@import './shared/themes/ms2000.css';
@import './shared/components/panels.css';
@import './shared/components/buttons.css';

### Opcion C: Custom host tokens
@import './shared/tokens.css';
@import './shared/components/buttons.css';
:root { --color-accent: #ff6600; --color-accent-dim: rgba(255,102,0,0.15); }

---

## 6. Contrato para Componentes Reutilizables

Todo componente compartido debe definir sus variables internas consumiendo los tokens globales con fallback:

:root {
  --scope-bg: var(--color-panel-bg, #090d14);
  --scope-border: var(--color-panel-border, rgba(0,195,255,0.2));
}

---

## 7. Demo

Para visualizar todos los componentes, abre demo/demo.html en un navegador.
