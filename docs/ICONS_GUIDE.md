# Guía de Iconografía Monocromática — ABDSharedAssets

> **Propósito:** Estándar oficial de diseño, consumo y catálogo de iconos vectoriales monocromáticos para toda la suite ABDSynths (`ABDMS2000`, `ABDCZ101`, `ABDEep`, `ABDJUNiO601`, `ABDAudioLab`, `ABDScope`, `ABDMIDIKeyb`).

---

## 1. Regla de Oro: Cero Emojis (Zero Emojis Policy)

- **Prohibición Total:** NUNCA utilizar emojis Unicode (`📷`, `⚙️`, `🔴`, `❌`, `🎛️`) para botones, controles, estados o telemetría.
- **Razón Técnica:** Los emojis se renderizan de forma inconsistente y con colores impredecibles según el sistema operativo (Windows, macOS, Linux, Android), no se pueden tintar con CSS y se pixelan en monitores HiDPI.
- **Solución Obligatoria:** Usar iconos vectoriales SVG monocromáticos que hereden `currentColor` y los tokens de diseño (`--color-accent`, `--scope-text-muted`).

---

## 2. Especificación Técnica de los Iconos (`icons/*.svg`)

Todos los archivos en `ABDSharedAssets/icons/` deben cumplir este estándar geométrico:

```xml
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 24 24" 
     width="16" 
     height="16" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <!-- Trazos geométricos limpios -->
</svg>
```

| Parámetro | Valor Estándar | Razón |
|---|---|---|
| `viewBox` | `0 0 24 24` | Cuadrícula simétrica universal |
| `stroke` | `currentColor` | Se tiñe automáticamente con el color del texto o botón contenedor |
| `fill` | `none` (o `currentColor` en glifos rellenos) | Permite renderizado de línea limpio y transparente |
| `stroke-width` | `2` (ó `1.5` en tamaños compactos) | Proporción visual equilibrada |

---

## 3. Formas de Uso en WebUI / CSS

Los iconos se consumen desde `ABDSharedAssets/icons/` (fuente única); cada aplicación/componente importa **solo los iconos que usa**. Para componentes web reutilizables se recomienda el **Método C** (módulo generado); los métodos A/B quedan para usos puntuales en hosts (nunca copiar SVG a mano dentro del código de un módulo).

### Método A: SVG Inline (interactividad y hover)
Permite que el icono herede los estados `:hover` y `:active` del botón de forma nativa sin CSS adicional:

```html
<button class="btn-action">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
  Snapshot
</button>
```

### Método B: Máscara CSS (`mask-image` para botones sin DOM extra)
Ideal para botones con icono exclusivo o pseudo-elementos:

```css
.icon-freeze {
  display: inline-block;
  width: 16px;
  height: 16px;
  background-color: var(--color-accent, #00c3ff);
  mask: url('../../shared/icons/freeze.svg') no-repeat center / contain;
  -webkit-mask: url('../../shared/icons/freeze.svg') no-repeat center / contain;
}

.icon-freeze:hover {
  background-color: var(--color-accent-hover, #38d3ff);
}
```

### Método C: Módulo de iconos generado (recomendado para componentes WebUI)

El componente genera un pequeño módulo que incrusta el markup canónico de **los iconos que usa** (p. ej. ABDScope: `WebUI/src/icons.js` con `camera`, `close`, `freeze`) y lo mantiene sincronizado con un **test de paridad** contra estos ficheros (p. ej. `WebUI/tests/icons.test.js`, que compara contenido normalizando BOM/CRLF). El modo embed (binary data) queda autocontenido: el módulo se genera en desarrollo y nunca lee disco en runtime.

---

## 4. Catálogo de Iconos Disponibles

| Archivo | Icono / Nombre | Uso Principal |
|---|---|---|
| `camera.svg` | Cámara fotográfica | Captura de imagen / Snapshot a PNG o portapapeles |
| `freeze.svg` | Pausa vertical | Congelar fotograma / Freeze en osciloscopio |
| `play.svg` | Triángulo Play | Reanudar osciloscopio / Iniciar audio |
| `close.svg` | Aspa X | Cerrar modal o panel flotante |
| `oscilloscope.svg` | Traza de pulso | Pestaña / modo de osciloscopio temporal |
| `spectrum.svg` | Barras de ecualizador | Pestaña / modo analizador de espectro FFT |

---

## 5. Cómo Añadir Nuevos Iconos

1. Diseñar o exportar el icono en una cuadrícula de **24x24 px**.
2. Limpiar estilos embebidos (eliminar atributos `style="..."`, `class="..."`, colores fijos `#000` o `#fff`).
3. Asegurar `stroke="currentColor"` y `fill="none"`.4. Guardar en `D:\desarrollos\ABDSynths\ABDSharedAssets\icons/[nombre-en-ingles].svg` en kebab-case.
5. Actualizar los módulos de iconos de los consumidores afectados (p. ej. `WebUI/src/icons.js` del scope) copiando el markup canónico, y mantener sus tests de paridad en verde.
