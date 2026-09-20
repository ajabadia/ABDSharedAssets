# ABDSharedAssets — familia de controles UI

Controles web reutilizables compartidos por toda la suite ABDSynths. Framework-agnostic:
DOM + options dentro, callbacks fuera. Ni JUCE ni bridge ni React dentro de los controles.

## Contrato de la familia

Todos los controles cumplen exactamente la misma API (el primero fue `Wheel`):

```js
import { Knob, Select, Slider, Toggle, Wheel, XYPad } from '@abdsynths/shared/components';

const knob = new Knob(container, {
    label: 'Cutoff',
    value: 0.5,                  // normalizado 0..1 (o boolean en Toggle)
    onChange: (v) => {},          // SOLO ediciones de usuario
    onDragStart: () => {},        // gesto abierto (para automatización del host)
    onDragEnd: () => {},
});

// Select: modelo de valor = INDICE de opcion (el hermano discreto del boolean de
// Toggle). Normalizar a 0..1 queda al llamador, porque en un parametro `choice` ese
// mapeo lleva su propio skew/intervalo (contrato generado).
const select = new Select(container, {
    label: 'Destination',
    options: ['Off', 'LFO 1', { label: 'Pitch Quantize', disabled: true,
                                note: 'Requires the Neurotik engine' }],
    value: 0,
    id: 'control-mod1Destination',   // opcional: asocia el <label for> y deja localizarlo
    disabled: [2],                   // indices o (entry, index) => boolean
    onChange: (index) => {},          // SOLO ediciones de usuario
});

select.setDisabled((entry, index) => index === 2);   // disponibilidad dinamica
select.isDivergent();   // true si el valor actual cae en una opcion no disponible

// XYPad: mismo contrato, valor 2D. y=1 es ARRIBA (convención NEURONiK XYPad.cpp).
// Superficie ABSOLUTA: click salta al punto. setValue({x,y}) silencioso para
// snapshots del bridge; onChange({x,y}) solo en ediciones de usuario.
const pad = new XYPad(container, {
    x: 0.5, y: 0.5,              // valor inicial normalizado
    width: 220, height: 220,
    corners: ['Piano', '', 'Bell', ''],
                                 // OPCIONAL: etiqueta por esquina [arriba-izq,
                                 // arriba-der, abajo-izq, abajo-der]; '' oculta
                                 // su esquina. Con esquinas visibles el readout
                                 // se esconde: el valor sigue en aria-valuetext.
    onChange: ({ x, y }) => {},
    onDragStart: () => {},
    onDragEnd: () => {},
});

pad.setValue({ x: 0.2, y: 0.8 });   // programático: NO dispara onChange
pad.setCorners(['Piano', 'Rhodes', '', '']); // etiquetas en caliente (morph pads)
pad.getValue();                      // -> { x, y } (copia)
pad.destroy();
```

Reglas (las cumple cualquiera que se añada en el futuro):

1. **Valor normalizado 0..1** (o boolean, o **índice de opción**). El mapeo a unidades
   reales es del llamador, igual que el contrato de parámetros del plugin. El `Select`
   usa el índice porque un parámetro `choice` guarda su índice y el mapeo
   índice<->normalizado lleva el skew del propio parámetro: meterlo aquí arrastraría
   matemática del APVTS a la capa compartida.
2. **Interacción por `drag-core.js`**: drag vertical/horizontal, rueda y flechas del
   teclado. Ningún control implementa su propia matemática de punteros. Excepción
   documentada: el `Select` NO usa drag-core — arrastrar por una lista de 28 opciones
   elige valores por accidente, que es peor que no ofrecerlo. El desplegable nativo y
   las flechas cubren la edición, y un test fija que un drag no cambia el valor.
3. **Theming solo por tokens CSS** (`styles/tokens.css`): `--color-accent`,
   `--color-panel-surface`, `--text-*`... con fallbacks literales para usarse sin tokens.
4. **Sin WebGL**: el catálogo `RESOURCES/ui_componants-main` tiene efectos de demo con
   GL; aquí se extrae el control y su brillo se resuelve con CSS box-shadow.
5. **destroy() limpia todo** — un control destruido no deja listeners ni DOM.

## Ficheros

```text
components/drag-core.js     núcleo DRY de arrastre (attachDrag, clamp)
components/knob.js          knob rotatorio (270°) — comportamiento + contrato
components/select.js        lista de opciones (nativa <select>), opciones deshabilitables
components/slider.js        slider horizontal/vertical, thumb filmstrip opcional
components/toggle.js        botón LED (latched o momentary), estado en [aria-pressed]
components/wheel.js         rueda pitch/mod filmstrip (la original de la familia)
components/xypad.js         pad 2D absoluto ({x,y}, y-up) — morphing, filtros XY
components/skins/index.js   SKINS: cómo se dibuja cada control (registry + 3 skins)
components/index.js         barrel: controles + registerSkin/getSkin/applySkin
styles/components/widgets.css     estilos base de knob/slider/toggle/select
styles/components/skins-junio.css   estilos de la skin 'junio'
tests/controls.test.js      vitest: contrato, clamping, semántica, gestos, skins, cleanup
tests/setup.js              polyfill PointerEvent para jsdom
```

## Skins: cada synthe elige su look

El COMPORTAMIENTO vive en el control (valor, drag-core, contrato); el ASPECTO vive en una
skin intercambiable. Una skin es un **mapa de renderers por tipo de control**
(`{ knob, slider, toggle }`): se declara el nombre una vez y cada control resuelve el
suyo — sin prefijos 'toggle-'/'slider-':

```js
import { Knob, Slider, Toggle, registerSkin } from '@abdsynths/shared/components';

new Knob(el,   { skin: 'ms2000' });  // knob vector rim/cap/dot (extracto ABDMS2000)
new Slider(el, { skin: 'junio'  });  // fader slot+cap fotográfico (extracto JUNiO)
new Toggle(el, { skin: 'junio', colorName: 'orange' });  // sprite PNG on/off por color
new Knob(el);                        // 'vector' (por defecto, sin assets)

// Skin propia de un proyecto (mapa parcial: lo que falte cae al renderer 'vector'):
registerSkin('mysynth', {
    knob (host, control) {
        const root = document.createElement('div');
        /* ...pintar; update() relee control.getValue()... */
        host.appendChild(root);
        return { root, update () {}, destroy () {} };
    },
});
```

Despacho: `applySkin()` etiqueta cada instancia con `CONTROL_KIND` (knob | slider |
toggle | select) y elige `map[kind]`; si la skin no define ese tipo, usa el renderer
'vector' del mismo tipo (skins parciales siguen siendo utilizables).
Nombre de skin desconocido → la skin entera es 'vector'.


Origen de las skins incluidas:

Un tipo sin renderer en NINGUNA parte ahora falla con un error explícito, porque
antes salía como "fn is not a function" y parecía un error del llamador.

| Skin      | Extraída de           | Cubre | Mecánica |
|-----------|-----------------------|-------|----------|
| `vector`  | nueva (base)          | knob, slider, toggle, select | CSS/SVG puro, sin assets |
| `ms2000`  | ABDMS2000 `rotaryKnob.js` | knob, toggle, select | SVG rim+cap+indicador; toggle y select variantes de tokens |
| `junio`   | ABDJUNiO601 assets (`knob.png`, `slider_cap/slot.png`, `button_*_on/off.png`) | knob, slider, toggle | PNGs por transform/position; toggle elige sprite por `colorName` + `aria-pressed` |

Ojo con los nombres: `styles/components/controls.css` (la librería CSS, anterior a la
familia JS) ya estiliza un `<select class="abd-select">` crudo, y hay páginas que cargan
las dos hojas. Por eso el bloque `.abd-select` de `widgets.css` no impone layout — el
apilado es opt-in vía `.abd-select--labelled`, que el control añade solo cuando tiene
etiqueta — y el campo lleva su propia clase. Un `<select>` suelto sigue viéndose igual.

La skin 'junio' necesita sus sprites servidos desde la raíz del paquete
(`assets/junio/`); las URLs del CSS son **relativas al propio CSS**, así que funciona
con `file://` y con cualquier servidor estático. Para páginas en subcarpetas (p. ej.
`demo/`), el knob acepta `spriteUrl` explícita. Las otras skins no necesitan assets.

### Fondo de lienzo tintable (`assets/backgrounds/`)

`bg_neutral.png` (1672x941, gris medio-acromático) es el fondo GENÉRICO de la suite y el
MÁSTER bit-exacto; `bg_neutral.webp` (sin pérdida, pixel-exacto) es el que se sirve. El PNG:
no lleva color — el tema lo tiñe. Uso: `class="abd-theme-bg"` en el contenedor y
`--abd-bg-tint` con el color del tema (`styles/components/backgrounds.css`, mezcla
`soft-light` para que el tono y la luminancia del tema manden y la textura module). Un
tema puede usar OTRO fondo con `--abd-bg-image` (URL relativa a SU css). Pesos y
convención de nombres de fondos nuevos: ver la cabecera de `backgrounds.css`.

### Temas — modo claro (`[data-theme="light"]`)

`styles/tokens.css` define el tema oscuro en `:root` y el MODO CLARO en `[data-theme="light"]`:
el MISMO juego de tokens de color/sombra con valores de contraste medido (ratios WCAG en la
cabecera del bloque). El test `tests/tokens.test.js` vigila las dos direcciones: todo token
de color/sombra del :root tiene version clara, y el claro no inventa tokens ni pisa
tamanos/espaciados/fuentes. Se activa con `data-theme="light"` en `<html>` (convencion
MS2000) o en `<body>` (convencion del demo, que tiene un boton Light). El LCD no cambia —
es autoiluminado como el hardware. El fondo tintable sigue automaticamente: `--abd-bg-tint`
por defecto es `var(--color-bg-base)` y `backgrounds.css` re-resuelve el tinte en el
elemento tematizado (`[data-theme]`), asi funciona con las dos convenciones de colocacion.

**Selector universal — `components/themeSwitcher.js` (`ThemeSwitcher`):** el interruptor es
compartido, los TEMAS son de cada synth. Aplica `data-theme` en el elemento raiz que se le de
(`<html>` o `<body>`), marca el activo (`is-active`/`aria-pressed`), persiste opcionalmente y
su `destroy()` desacopla listeners de verdad. El tema `dark` se aplica SIN atributo (es el
`:root`): el default de la pagina no depende del atributo.

El principio de la suite aqui: un synth define SOLO los tokens de color (bloques
`[data-theme=...]`) y ELIGE los tipos de elemento que usa (knob, slider, XYPad, fondo
tintable, LCD...). Los estilos de los elementos, las sombras, el comportamiento y los
mecanismos (temas, fondo, ajuste al viewport) son UNIVERSALES en este paquete: los skins
cambian FORMA (registerSkin), los temas cambian COLOR (tokens), ambos se resuelven con las
mismas variables.

## Demo

`demo/demo.html` (sección 8) muestra la familia completa: knob/slider/toggle en las tres
skins, colores del toggle junio y un toggle momentary. Sirve la raíz del paquete y abre
`/demo/demo.html`:

```bash
cd ABDSharedAssets && npx vite . --port 5199   # o cualquier servidor estático
```

El bootstrap de la sección vive en `demo/demo-controls.js` (HTML declarativo, controles
instanciados desde el módulo).

Todo fichero se mantiene por debajo de ~300 líneas; si un control crece, se divide.

## Consumo sin NTFS junctions

La vía preferida hoy es **npm/pnpm**, no enlaces de directorio:

- Proyectos del workspace pnpm: `"@abdsynths/shared": "workspace:*"` (como ya hace
  `@abdsynths/midi-keyb` en ABDMS2000).
- Proyectos fuera del workspace (ABDNeural/WebPilot): instalar con
  `pnpm add @abdsynths/shared --workspace-root` no aplica; usar `file:../ABDSharedAssets`
  en `dependencies`, o servir `components/` y `styles/` como recursos estáticos del host.
  Los NTFS junctions de `docs/INTEGRATION_GUIDE.md` quedan como mecanismo legacy para
  los proyectos que ya los usan; nada nuevo debe depender de ellos.

## Añadir un control nuevo

1. Crear `components/<nombre>.js` con el contrato de arriba (menos de 300 líneas).
2. Añadir su CSS a `styles/components/widgets.css` (o fichero propio si es grande).
3. Exportarlo en `components/index.js` y añadir un renderer para su `CONTROL_KIND`
   en la skin `vector` (si no, `applySkin` lanza "no renderer for control kind").
4. Tests en `tests/controls.test.js`: contrato, límites, semántica onChange/setValue,
   destroy sin fugas.
5. Si viene del catálogo `RESOURCES/ui_componants-main`: extraer la clase, quitar el
   acoplamiento a la página de demo y sustituir WebGL por CSS cuando sea cosmético.
