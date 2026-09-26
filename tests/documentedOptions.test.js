/**
 * Auditoria de documentacion: lo documentado tiene que existir en el codigo, y lo
 * que el codigo lee tiene que estar documentado.
 *
 * Nace de un fallo real: el flag `disabled` de una entrada de Select/Segmented se
 * documentaba, se registraba en `normalizeEntry`... y no lo leia nadie. Vetaba de
 * mentira. Once reglas, cada una calibrada a su clase de fallo:
 *
 *   1. OPCIONES DOCUMENTADAS: el nombre documentado tiene que mencionarse ALGUNA vez
 *      en el codigo. Regla debil a proposito: persigue el miembro que solo vive en
 *      la documentacion.
 *   2. OPCIONES LEIDAS: al reves. Si el codigo lee `options.x` (o desestructura la x
 *      de su objeto de opciones, en la firma o en el cuerpo), `x` tiene que estar
 *      documentado. Esta direccion es la que impide que la API crezca en silencio.
 *   3. CLAVES DE ENTRADA: cada clave que `normalizeEntry` guarda tiene que LEERSE
 *      como `entry.clave` fuera del normalizador. Regla estricta, y la que habria
 *      cazado el flag.
 *   4. DEFAULTS: el literal que el codigo aplica como default tiene que estar
 *      prometido en la documentacion. Regla estrecha a proposito: solo juzga
 *      defaults que SON un literal (o una eleccion entre literales), nunca uno
 *      calculado, donde los numeros son aritmetica y no el default.
 *   5. OPCIONES GUARDADAS: una opcion que el codigo solo copia a un hueco (el
 *      objeto de opciones o un campo) y no vuelve a leer en ningun sitio esta
 *      muerta: no hay nada que configurar con ella. Es la regla que caza el
 *      `step` que se guardaba y no se usaba.
 *   6. EJEMPLOS DE USO: toda opcion que aparece en un `new Clase(el, { ... })` de un
 *      bloque de documentacion (los `Usage:` y las construcciones de la prosa) tiene
 *      que ser una opcion que el codigo de ESA clase lee de verdad. Se compara contra
 *      las LECTURAS y no contra la lista de miembros documentados porque la lista
 *      puede mentir sobre si misma: en themeSwitcher/wheel el propio bloque `Usage:`
 *      alimenta la lista (sus lineas casan con la celda de nombres), asi que juzgar
 *      el ejemplo contra ella seria circular. Aqui el ejemplo se audita como codigo.
 *   7. VALORES ENUMERADOS: cuando la documentacion enumera una lista de valores para
 *      una opcion (dos o mas cadenas en SU linea), esa lista es la unica: ni el
 *      codigo ramifica con un valor que no este en ella, ni un ejemplo le pasa uno.
 *      Solo se juzga lo que ES una lista: una sola cadena es el default, no el
 *      dominio (`skin: 'ms2000'` y `color: 'orange'` son valores de dato), y `0..1`
 *      o `default false` son un rango y un escalar.
 *   8. METODOS DE LOS EJEMPLOS: todo metodo que un ejemplo LLAMA sobre el objeto
 *      que el mismo bloque construye, ya lo ate a una variable —directa (`const pad
 *      = new XYPad(el)`) o por alias (`const pad2 = pad;`)— o lo encadene sin
 *      atarlo (`new XYPad(el).setCorners(...)`): tiene que estar DECLARADO por esa clase. Se juzga
 *      contra las DECLARACIONES (los miembros del cuerpo de la clase) y no contra
 *      las menciones, que es lo que la regla 1 ya da por bueno: un metodo que solo
 *      vive en el ejemplo no existe. Cuenta tambien las llamadas que el ejemplo
 *      trae comentadas con `//`, que son la misma promesa.
 *   9. ARIDAD DE LOS METODOS DE LOS EJEMPLOS: la misma llamada de la regla 8 tiene
 *      que pasarle al metodo un numero de argumentos que su firma DECLARADA acepte:
 *      ni menos que los obligatorios (`pad.setCorners()` donde la firma pide las
 *      esquinas) ni mas de los que declara (`setValue(0.2, true, 'extra')` donde solo
 *      caben dos). Un parametro con default (`notify = true`), un `= {}` detras del
 *      destructuring o un `...resto` no obligan; el troceo respeta el anidamiento,
 *      asi que el `{ x: 0.2, y: 0.8 }` de un `setValue` es UN argumento y no dos.
 *      Mide lo mismo en el `new Clase(...)` con el que el ejemplo construye: la firma
 *      que se le exige es la de su `constructor` (un default no obliga, asi que
 *      `new XYPad(el, { ... })` cabe en `constructor(container, options = {})`, que
 *      son dos parametros de los que solo el primero es obligatorio). Juzga tambien la
 *      llamada que el ejemplo trae comentada con `//`, igual que la 8, y no juzga un
 *      metodo que la clase no declara: de ese ya se encarga la 8, y las dos reglas se
 *      reparten el fallo en vez de contarlo dos veces.
 *  10. TIPOS DE LOS ARGUMENTOS: el argumento de un ejemplo tiene que ser de la familia
 *      que promete el `@param {tipo}` de su firma. Solo juzga el cruce en el que los
 *      DOS lados hablan claro: un tipo que la regla sabe leer (`string`, `number`,
 *      `boolean`, `object`, `array`, `Function`, `null`, `*`, o un objeto inline como
 *      `{{ x: number, y: number }}`) y un argumento cuya FORMA
 *      lo delata (un literal, un objeto, un array, una funcion). Donde la
 *      documentacion no pone tipo, o el argumento es un identificador
 *      (`new Pad(el, ...)`), no hay nada que contrastar y no se inventa: es estrecha a
 *      proposito, como la 4 con los defaults. Las claves del objeto de opciones
 *      (`@param {number} [options.step]`) no son parametros de la llamada y no cuentan.
 *  11. FORMA DE LOS ACCESOS: el ejemplo tiene que tocar cada miembro COMO la clase lo
 *      declara: un metodo se LLAMA (`wheel.destroy()`), un getter se LEE (`ts.value`),
 *      un setter se ESCRIBE (`ts.value = 1`) y un campo se lee y se escribe. Llamar a
 *      un getter (`ts.value()`), leer un metodo como si fuera un dato (`ts.setValue`) o
 *      escribir un nombre que solo tiene getter son la misma clase de mentira: la
 *      documentacion promete un uso que el codigo no admite. Se juzga el receptor que
 *      el bloque ata —directo o por alias— (`const ts = new ThemeSwitcher(...)`) y
 *      tambien el encadenado que no ata nada, directo u opcional
 *      (`new XYPad(el)?.setCorners(...)`, que la 8 tambien sigue), y solo
 *      contra miembros DECLARADOS: un campo de instancia (`this.value = ...` en el
 *      constructor) no es una declaracion, y sin forma declarada no hay nada que
 *      comparar.
 *
 * Convenciones de documentacion que entiende (todas las del repo, y las tres
 * primeras salieron de fallos de esta misma auditoria):
 *   - celda de nombres de una lista: ` *   nombre  descripcion`, con grupos
 *     separados por `/` (`frameWidth/frameHeight/frames`, `onChange / onDragEnd`);
 *   - bullets de callbacks: ` *   - onPreview(paramId, dir, state)  descripcion`;
 *   - JSDoc: `@param {tipo} [options.nombre]`, `@param {{ campo?: tipo }} spec`,
 *     y cualquier mencion `options.nombre` dentro de un bloque;
 *   - ejemplos de uso: el `new Clase(el, { ... })` de un bloque, leido como codigo
 *     (objeto a varias lineas, comentarios `//` al lado, claves abreviadas);
 *   - metodos de los ejemplos: el receptor que el bloque ata con
 *     `const x = new X(...)` (o por alias: `const y = x;`) y las llamadas `x.m(...)`
 *     que le siguen, incluidas las comentadas con `//`;
 *   - firma de un metodo o del constructor de un ejemplo: los parametros que declara
 *     su parentesis (`setValue(value, notify = true)`, `attachEvents()`,
 *     `constructor(container, options = {})`), con su default y su `...resto`;
 *   - tipo prometido de un parametro: el `{tipo}` de su `@param`, en orden de firma
 *     (`@param {number} value`, `@param {object} options`), y sin las claves del objeto
 *     de opciones (`@param {number} [options.step]`), que no son parametros;
 *   - forma del acceso a un miembro en un ejemplo: la llamada `x.m(...)`, la lectura
 *     `x.prop` y la escritura `x.prop = v` (una comparacion `==` no escribe nada);
 *   - lista de valores de una opcion: ` *   type   'pitch' | 'mod', default 'mod'.`
 *     (dos o mas cadenas citadas en la linea del nombre: es el unico sitio que
 *     enumera el dominio).
 *
 * Trampas de este tipo de auditoria, todas con auto-test aqui abajo, y todas
 * encontradas al escribirla: mirar solo el primer bloque de documentacion (la lista
 * de opciones vive en el JSDoc del constructor, no en la cabecera de fichero), no
 * reconocer los grupos de nombres (`a / b`) ni los bullets de callbacks, contar la
 * prosa castellana "p. ej." como la mencion de un miembro llamado `ej`, e iterar el
 * array de parametros como si fueran caracteres (la regla del destructuring no
 * funcionaba y ningun fichero lo delataba), empujar el patron del cuerpo ya sin sus
 * llaves (el `const { lines = 2 } = options` quedaba invisible) y no contar como
 * documentados los campos que solo viven en un tipo inline, y dar por uso la
 * propia copia (la clave del objeto de opciones no es leer la opcion), parsear el
 * ejemplo como si fuera una sola linea (los objetos de opciones van a varias, y el
 * canal ` * ` de cada linea se cuela en medio) y resolver al modulo del fichero la
 * clase construida cuando el ejemplo construye otra (`index.js` documenta `Knob`), y
 * dar por lista de una opcion las cadenas de una linea de continuacion (el
 * `type: 'parameter' | 'cc' | 'action'` de un item ajeno acababa siendo la lista de
 * valores de `spec.type`), y dar por declarado un metodo que solo se LLAMA (el
 * `clearTimeout(...)` de un cuerpo, un `destroy();` que arranca una linea: miembro es
 * un nombre a profundidad 0 dentro de la clase, no una llamada), y contar los
 * argumentos de una llamada por las comas que se ven sin mirar la profundidad ni
 * las cadenas (el `{ x: 0.2, y: 0.8 }` de la regla 9 era UN argumento, no dos), contar
 * como parametros de la llamada las claves del objeto de opciones (el
 * `@param {number} [options.step]` desplazaba todos los argumentos de la 10) y cortar
 * el tipo en su primera llave (el `{{ x?: number, y?: number }}` de un parametro
 * entero se leia a medias), leer la forma declarada como un PREFIJO del nombre (un
 * `getValue()` pasaba por getter por empezar por `get`) y dar por escritura una
 * comparacion (`pad.value == 0.5`).
 *
 * Limites honestos: la regla 1 no distingue un miembro leido de uno meramente
 * nombrado; la 2 ve las lecturas via el objeto de opciones (propiedades y
 * destructuring), no el trasiego de valores por parametros; la 4 solo ve defaults
 * que son literales (una constante como `FRAME_HEIGHT` o un `Math.floor` no se
 * juzgan) y compara contra los literales de la linea del miembro, no contra su
 * significado; y nada de esto verifica que lo documentado sea CIERTO, solo que
 * existe, se usa y promete los mismos literales que el codigo aplica. La 5 solo
 * reconoce las dos formas de copia de este repo (valor de una clave del objeto de
 * opciones y asignacion a un campo) y juzga el destructuring por apariciones, no
 * por flujo: una copia que pasa por una funcion (`this.value = clamp01(options.value)`)
 * cuenta como consumo. La 6 juzga solo las CLAVES del objeto de opciones que va como
 * segundo argumento de un `new Clase(...)`: no juzga las llamadas a metodos del
 * ejemplo (`tape.setBPM(120)`, que son de la 8), ni un objeto de opciones construido
 * aparte y pasado
 * por variable, ni una clase que no exporte ningun modulo auditado (se salta, y un
 * guard exige que los `Usage:` resuelvan). La 7 solo juzga opciones cuya linea
 * documenta dos o mas cadenas: no ve un dominio que la documentacion deja implicito
 * (los nombres de `color` y `skin` son datos), no ve una rama que decide sin literal
 * (`if (type)`, un `switch`, un `includes`) y lee la lista de la linea del nombre, asi
 * que si esa linea cita valores de OTRA cosa como ejemplo (`size  px, default 100
 * ('preset') / 60 ('normal').`), esos se cuelan como lista de `size`: la regla es tan
 * buena como la forma en que el repo escribe sus listas. La 8 sigue el receptor que
 * el propio bloque ata (`const x = new X(...)`, directo o por alias `const y = x;`),
 * la API que una FABRICA devuelve (`const lcd = createLcdScreen(el, {...})`, leyendo
 * el objeto que retorna) y el encadenado (`new X().m()`), pero no un objeto
 * construido aparte y pasado por variable, ni un metodo HEREDADO de una clase base;
 * y solo mira las clases/fabricas que exporta un modulo auditado. Un alias
 * reasignado a otro objeto en el mismo bloque (`y = other;`) deja de seguirse: el
 * track se corta en la reasignacion.
 * La 9 hereda el mismo alcance de receptor que la 8 (si la 8 no ve la llamada, la 9 no
 * la mide) y solo cuenta, no comprueba: ni el TIPO del argumento, que es cosa de la 10
 * (y solo cuando el `@param` lo declara de una familia legible), ni la aridad de un
 * metodo heredado o sobrecargado, ni la de una firma que se lo traga todo
 * (`setValue(...args)` no tiene techo, con lo que nunca se queja). Del `new Clase(...)`
 * solo mide su aridad contra el `constructor` declarado: no comprueba que el nombre
 * construido sea el que la documentacion pretendia, ni los argumentos de un `new` que
 * la prosa escribe sin parentesis (`new Clase` a secas), ni la de una clase sin
 * `constructor` propio (que hereda el de su base, invisible desde su cuerpo). La 10
 * solo juzga el cruce en el que los dos lados son legibles: no ve un tipo propio
 * (`HTMLElement`, `Theme`), ni un generico
 * (`Array<{...}>`), ni un tipo con una alternativa ilegible en su union
 * (`HTMLElement|string` no se juzga: el argumento podria ser justo ese); no infiere el
 * tipo de un identificador, de una llamada ni de una operacion (`value * 2`), no mira
 * el contenido del objeto de opciones (eso es la 6) y no ve un tipo que viva en la
 * prosa (`width   px, default 220`) ni un JSDoc que no sea el que precede a la
 * declaracion. La 11 sigue los dos receptores, atado y encadenado
 * (`new XYPad(el).setCorners(...)`), y solo compara FORMA: no juzga un
 * acceso a un miembro que la clase no declare (un campo de instancia asignado en el
 * constructor es invisible: sin forma declarada no hay comparacion), ve tambien el
 * encadenado opcional (`ts?.value`, `pad.setValue?.()`), cuenta como lectura el metodo
 * que se pasa como callback (`el.onclick = pad.setValue`) y tambien una escritura
 * compuesta (`pad.value += 1`), y no mira la forma que la PROSA promete en su lugar
 * (una lista de opciones no dice como se toca cada miembro).
 */

import './audit/rules.js';
import './audit/autoTests.js';
import './audit/metaGuard.js';
