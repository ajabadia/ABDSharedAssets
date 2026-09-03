# Guía del Sistema de Diseño y Estilos — ABDSharedAssets

> **Propósito:** Especificación de tokens de diseño, paletas temáticas y contratos de estilo para toda la suite ABDSynths (`ABDMS2000`, `ABDCZ101`, `ABDEep`, `ABDJUNiO601`, `ABDAudioLab`, `ABDScope`, `ABDMIDIKeyb`).

---

## 1. Arquitectura de Tokens en Cascada

El sistema de estilos utiliza un patrón de cascada de 3 niveles:

```text
1. Host Tokens (Sintetizador / Plugin)
      └── Define --color-bg-base, --color-panel-bg, --color-accent
2. Global Shared Tokens (ABDSharedAssets/styles/tokens.css)
      └── Provee valores estándar y temas preconfigurados ([data-theme="ms2000"])
3. Component Tokens (scope.css, keyboard.css)
      └── Mapea variables específicas (--scope-bg, --kbd-bg) con fallback automático al Host
```

---

## 2. Tokens Globales Disponibles (`tokens.css`)

| Variable | Descripción | Valor por Defecto |
|---|---|---|
| `--color-bg-base` | Fondo principal de la ventana / chasis | `#0a0e14` |
| `--color-panel-bg` | Fondo de paneles contenedores | `#0f1620` |
| `--color-panel-surface` | Superficie elevada de tarjetas/widgets | `#151f2e` |
| `--color-panel-border` | Bordes translúcidos de paneles | `rgba(0, 195, 255, 0.2)` |
| `--color-accent` | Color primario de acento / neón | `#00c3ff` |
| `--color-text-main` | Texto principal de alta legibilidad | `#f0f7ff` |
| `--color-text-muted` | Texto secundario / etiquetas | `#7e9bb5` |
| `--color-lcd-bg` | Fondo de pantallas LCD de parámetros | `#102216` |
| `--color-lcd-text` | Texto/números de pantallas LCD | `#44ff77` |
| `--font-lcd` | Tipografía monoespaciada para telemetría | `'Courier New', monospace` |

---

## 3. Temas Predefinidos (`styles/themes/`)

Para aplicar un tema completo a un sinte o modal, añade el atributo `data-theme` o clase `skin-*` en el elemento contenedor:

```html
<!-- Korg MS2000 (Azul cian / verde LCD) -->
<div data-theme="ms2000"> ... </div>

<!-- Casio CZ-101 (Rojo vintage / gris pizarra) -->
<div data-theme="cz101"> ... </div>

<!-- Behringer DeepMind (Ámbar / grafito) -->
<div data-theme="deepmind"> ... </div>

<!-- Roland Juno-106 (Franjas tricolor / verde LCD) -->
<div data-theme="juno"> ... </div>

<!-- ABDAudioLab (Verde nórdico / oscuro científico) -->
<div data-theme="audiolab"> ... </div>
```

---

## 4. Contrato para Componentes Reutilizables

Todo componente compartido (`ABDScope`, `ABDMIDIKeyb`, etc.) debe definir sus variables internas consumiendo los tokens globales con fallback:

```css
/* Ejemplo: scope.css */
:root {
  --scope-bg: var(--color-panel-bg, #090d14);
  --scope-border: var(--color-panel-border, rgba(0, 195, 255, 0.2));
  --scope-trace-l: var(--color-accent, #00c3ff);
  --scope-trace-r: #ff007f;
  --scope-spectrum: var(--color-accent, #00e676);
  --scope-grid: rgba(255, 255, 255, 0.07);
  --scope-text-main: var(--color-text-main, #e8f4fc);
  --scope-text-muted: var(--color-text-muted, #6f8a9e);
  --scope-font: var(--font-lcd, 'Courier New', monospace);
}
```

---

## 5. Cómo Consumir los Estilos en un Sintetizador

En el `main.css` o `index.html` de la WebUI del sintetizador:

```css
/* Importar todo el bundle compartido vía Junction */
@import './shared/index.css';
```
