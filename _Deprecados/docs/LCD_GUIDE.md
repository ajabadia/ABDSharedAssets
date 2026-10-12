# GUÍA DEL LCD UNIVERSAL — pantalla + máquina de menú + D-pad

> Un solo mecanismo para toda la suite: NEURONiK (8.3), CZ101, MS2000 y
> ABDEep comparten la MECÁNICA; cada synth aporta sus DATOS (árbol de menú,
> líneas de reposo, formato de valores) y sus EFECTOS (callbacks).
> Herencia: NEURONiK nativo (máquina + preview), CZ101 (scroller + menú como
> datos), ABDEep (cola de mensajes con prioridad).

---

## 1. Las tres piezas JS (ABDSharedAssets/components)

| Fichero | Qué es | Hereda de |
|---|---|---|
| `lcdMachine.js` | Máquina de estados PURA (sin DOM): Idle / Navigation / Edit, árbol inyectado, `onMenuPress/onOkPress/onEncoderRotate/onArrow` | `LcdMenuManager.h` de NEURONiK |
| `lcdScreen.js` | Pantalla DOM de N líneas: autoscroll **ping-pong** carácter a carácter, `preview()` con timeout, `message()` con **cola de prioridad** | `lcdScroller.js` de CZ101 + `LcdDisplay.h` + `script_lcd_core.js` de ABDEep |
| `lcdPanel.js` | Composición: pantalla + máquina + **D-pad** (MENU/OK/‹›^v) con hold-repeat | keypad de CZ101 + D-pad del 8.3 |

```js
import { createLcdPanel } from '@abdsynths/shared/components';
import '@abdsynths/shared/components/lcd.css';

const lcd = createLcdPanel(host, {
  menu: SYNTH_MENU,                     // DATOS del synth (abajo)
  hooks: {
    onEdit: (paramId, dir) => engine.nudge(paramId, dir),   // EFECTOS del synth
    onAction: (item) => { if (item.paramId === 'RESET_MIDI') midiResetAll(); },
    onPreview: (item, dir) => engine.previewParam(item.paramId, dir), // opcional
  },
  idle: () => [presetName, bankName],   // líneas de reposo (el synth las compone)
  editValue: (item) => formatMyParam(item.paramId),
});

// Avisos transitorios (la cola vive en la línea 0; prioridad menor gana):
lcd.screen.message('saving', 'GUARDANDO...', { priority: 1, durationMs: 1500 });
lcd.screen.clearMessage('saving');
lcd.screen.preview(1, '0.75', { durationMs: 800 });
```

### El árbol de menú (datos, no código)

```js
const SYNTH_MENU = [
  { label: 'GLOBAL', sub: [
    { label: 'MASTER VOL', paramId: 'masterLevel' },
    { label: 'MIDI CH',    paramId: 'midiChannel' },
  ]},
  { label: 'CC CUTOFF', paramId: 'filterCutoff', type: 'cc' },  // aprendizaje MIDI CC
  { label: 'PANIC', type: 'action' },                            // OK dispara onAction
];
```

- `type`: `'parameter'` (default) | `'cc'` | `'action'`.
- `sub`: subniveles de **profundidad libre** (el nativo se quedaba en 2).
- Depender del `engineType`/modo (como el nativo) = cambiar `menu` y llamar a
  `lcd.machine.setMenu(...)` — la máquina es stateless respecto a los datos.
- `formatValue(value, { type, choices, unit, decimals })` (en lcdMachine.js)
  formatea para la línea: choices → etiqueta, bool → ON/OFF, unidad...

### Rutinas del D-pad (idénticas al hardware del 8.3)

- **MENU**: en EDIT cancela; en subnivel sube; en la raíz vuelve el cursor al
  primer ítem y, ya en él, sale al reposo (dos MENU máximo desde cualquier sitio).
- **OK**: entra en subnivel → edita `parameter`/`cc` → dispara `action` al momento.
- **‹ ›**: ±1 (navegar/editar). **^ v**: ±5 (ajuste grueso).
- Mantener pulsado repite (initial 400 ms, repeat 120 ms).

---

## 2. La pieza C++ (ABDSharedCode/LcdDisplay)

| Fichero | Qué es |
|---|---|
| `LcdDisplay.h` | `juce::Component` de 2 líneas: autoscroll, preview con timeout, cola de mensajes con prioridad (herencia ABDEep), colores via `setColours` (tema del synth) |
| `LcdMenuManager.h` | La MISMA máquina que el JS, en C++: árbol inyectado (`setMenu`), hooks `std::function` (`onEdit/onAction/onPreview`), profundidad libre |

```cmake
target_link_libraries(mi_synth PRIVATE ABDShared::LcdDisplay)   # INTERFACE, header-only
```

Gated a `NOT EMSCRIPTEN` (como WebView2Bridge): los builds WASM no llevan
`juce_gui_basics`. Nota de propiedad: la pila de navegación guarda punteros al
árbol, así que `setMenu()` resetea la navegación; deja el árbol estable mientras
se navega.

---

## 3. Adopción por synth (el plan de convergencia)

| Synth | Hoy | Camino |
|---|---|---|
| **NEURONiK (8.3)** | nada (el nativo se retiró con la UI C++) | Consumidor de referencia: `createLcdPanel` + árbol GLOBAL/RESONATOR/FILTER/EFFECTS/MIDI CONTROL (recuperable de `LcdMenuManager.h` en git) |
| **CZ101** | ~880 líneas propias (lcdPanel + modos + scroller) | Sustituir su scroller por `createLcdScreen`; sus modos BNK/MDL/Write son *mods* del panel: composición, no fork |
| **MS2000** | `lcdProgrammer.js` propio | El readout por `createLcdScreen`; su navegación de programas por `createLcdMachine` |
| **ABDEep** | `script_lcd_core.js` (cola + fades) | La cola ya está subsumida (`message()`); sus fades son CSS del skin |

## 4. Tematización

La pantalla es **autoiluminada**: no cambia con el tema claro/oscuro (igual que
los tokens `--color-lcd-*` de tokens.css). Un synth que quiera otro fósforo
(ámbar, azul) redefine `--color-lcd-bg/text/border` en SU tema; el mecanismo no
toca colores. Los botones del D-pad sí siguen el tema (tokens estándar).
