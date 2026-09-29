/**
 * Auditoria de documentacion: lo documentado tiene que existir en el codigo, y lo
 * que el codigo lee tiene que estar documentado.
 *
 * Nace de un fallo real: el flag `disabled` de una entrada de Select/Segmented se
 * documentaba, se registraba en `normalizeEntry`... y no lo leia nadie. Vetaba de
 * mentira. Trece reglas, cada una calibrada a su clase de fallo:
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
 *   9. ARIDAD: la misma llamada de la regla 8 tiene que pasarle al metodo un numero de
 *      argumentos que su firma DECLARADA acepte:
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
 *  12. REGISTROS PROMETIDOS: toda clave prometida en un registro tiene que usarse de
 *      verdad en el codigo. Cubre las TRES formas: el tipo inline de un `@param`, el
 *      `@typedef` que ese `@param` nombra —cruzando sus `@property` con las lecturas
 *      reales— y el `@returns {{ ... }}` de un callable. Sin la tercera, el `@typedef`
 *      que escribe la gente se quedaba en silencio: leia una forma que no era la que
 *      prompia, sus claves no llegaban a ninguna lista y la regla no vigilaba nada.
 *  13. OPCIONES EN SU SITIO: el objeto de opciones va detras de otro parametro, y una
 *      entrada de un solo parametro se exime. No es un juicio de documentacion —el
 *      codigo funciona igual en las dos posiciones—, es la convencion del repo, y lo
 *      que protege es la diferencia real entre las dos: con el objeto de opciones
 *      delante, todo lo que sepa que son «el segundo argumento» —un ejemplo, una
 *      llamada, un atajo— mira el elemento.
 *
 * Límites honestos de cada regla: lo que NO juzga, para que nadie lo prometa.
 * El porqué está en su regla, y esta lista sale del catálogo, que es donde vive
 * la entrada: un detector que se estrecha ensancha su límite, y un límite
 * envejecido promete lo que la regla ya no cumple. El bullet se parte al ancho
 * de una caja, y la regla que no cabe en ella lo ensancha con su `limitWidth`.
 *   1. cuenta cualquier mencion del nombre, aunque este en un comentario:
 *      no juzga si la mencion llega a ser una lectura; de eso responde la 2
 *   2. solo ve lo que el codigo LEE: no juzga que la documentacion este
 *      completa, ni que la lectura sirva para algo
 *   3. solo cuenta la lectura `entry.clave` de fuera del normalizador: por
 *      `this`, desestructurada o con un indice dinamico no cuenta
 *   4. solo juzga el default que ES un literal, o una eleccion entre
 *      literales: uno calculado no se juzga, porque ahi el numero es
 *      aritmetica y no un default
 *   5. no juzga el VALOR que se guarda, solo que se lea: una opcion que se
 *      copia y se vuelve a leer con otro default no sale
 *   6. audita el ejemplo como codigo, no la prosa: una mencion suelta en el texto
 *      no es un ejemplo, y un ejemplo de otra clase no se juzga contra esta
 *   7. solo juzga lo que ES una lista, dos o mas cadenas en la linea del
 *      nombre: una cadena suelta es el default, y `0..1` o `default false`
 *      son un rango y un escalar
 *   8. no juzga la aridad ni la forma del acceso: de eso responden la 9 y
 *      la 11, y las tres se reparten el fallo en vez de contarlo tres veces
 *   9. cuenta los argumentos por la firma, no por las comas: un default, un
 *      `= {}` detras del destructuring y un `...resto` no obligan
 *   10. solo juzga el cruce en el que los dos lados hablan claro: sin tipo
 *      documentado, o con un argumento que es un identificador, no hay nada
 *      que contrastar y no se inventa
 *   11. solo juzga contra miembros DECLARADOS: un campo de instancia no lo
 *      es, y sin forma declarada no hay nada que comparar
 *   12. se calla donde no puede saber (binding ilegible, un `...resto`, un
 *      acceso `opts[clave]`, un cuerpo ilegible) y no juzga la prosa: de
 *      eso responden la 1 y la 2
 *   13. se calla donde no hay decision que tomar: una entrada de un solo
 *      parametro no declara nada mas
 *
 * Convenciones de documentacion que entiende (todas las del repo, y las tres
 * primeras salieron de fallos de esta misma auditoria):
 *   - celda de nombres de una lista: ` *   nombre  descripcion`, con grupos
 *     separados por `/` (`frameWidth/frameHeight/frames`, `onChange / onDragEnd`);
 *   - bullets de callbacks: ` *   - onPreview(paramId, dir, state)  descripcion`;
 *   - JSDoc: `@param {tipo} [options.nombre]`, `@param {{ campo?: tipo }} spec`,
 *     `@typedef {object} Nombre` con sus `@property {tipo} clave` —las tres formas
 *     del typedef: el registro inline en la propia etiqueta, el nombre suelto, o el
 *     `object` a secas con la promesa en los `@property` de debajo— nombrado desde un
 *     `@param {Nombre}`, y cualquier mencion `options.nombre` dentro de un bloque;
 *   - ejemplos de uso: el `new Clase(el, { ... })` de un bloque, leido como codigo
 *     (objeto a varias lineas, comentarios `//` al lado, claves abreviadas);
 *   - metodos de los ejemplos: el receptor que el bloque ata —atado, con
 *     `const x = new X(...)`, o por alias, `const y = x;`—, el encadenado sin nombre
 *     (`new X(el).m()`) o en su forma OPCIONAL (`x?.m(...)`, `new X(el)?.m(...)`) y las
 *     llamadas `x.m(...)` que los siguen, incluidas las
 *     comentadas con `//`. La forma de FABRICA entra por el mismo camino: el receptor
 *     tambien puede nacer de una fabrica documentada
 *     (`const lcd = createLcdScreen(el, { lines: 2 })`), y la clase contra la que se
 *     juzgan sus llamadas es la API que esa fabrica RETORNA —el objeto de su
 *     `return { ... }` o de su `const api = { ... }`—, no una clase;
 *   - firma de un metodo o del constructor de un ejemplo: los parametros que declara
 *     su parentesis (`setValue(value, notify = true)`, `attachEvents()`,
 *     `constructor(container, options = {})`), con su default y su `...resto`; en un
 *     receptor de fabrica, la del metodo que devuelve la API de esa fabrica;
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
 * entero se leia a medias, y con un registro ANIDADO dentro —`Array<{label: string}>`
 * en el tipo de un campo— el tipo entero quedaba fuera: ni se leia, o quedaba abierto
 * o con una llave de mas, y de ahi salian claves de mas —el `y` de un campo
 * `(x, y) => void`— y de menos), cortar el tipo por CORCHETES donde va una
 * llave (el mismo registro, leido con `/^\[\([^\\]]*)\]$/`:
 * el corchete del hermano se come el texto entero y el tipo se lee a medias por
 * el otro lado: le paso con el `@param {{ x?: number, y?: number }}` de lcdMachine y
 * el `Array<{id: string, label: string}>` de themeSwitcher, que salen de un tipo
 * recortado por el delimitador equivocado), y escribir un SEGUNDO escaner de
 * regex en vez de usar el de `regexes.js`, que es justo el fallo que esa capa
 * existe para evitar: dos lectores miden casi lo mismo, el hallazgo que el
 * segundo deja de dar no lo dice nadie, y por eso la meta-guardia comprueba que
 * el escaner y los jueces se declaren UNA sola vez—
 * consumir el separador de COLA de una lista (un
 * `(?:^|,)` que ademas termina en la coma lee uno de cada dos elementos: el
 * `wire(el, handlers, n)` perdia su parametro de en medio), acotar la lectura de los
 * parametros al PRIMERO (el objeto de opciones va en el segundo en casi todo el repo, y
 * las cuatro firmas que lo desmembran en el primero taparian la cuenta: la regla 2 se
 * quedaria ciega en la convencion mayoritaria sin que nada lo delatara), atar el
 * `@param` a la posicion de la firma y quedarse con el primero (las reglas 10 y 12
 * cruzan por indice —`params[i]` contra `argumentList(args)[i]`, el `@param` contra
 * la posicion de la firma—, y el registro inline mas vivo fuera del primero,
 * el `handlers` de `attachDrag`, se perdia con la misma mudieza que el objeto de
 * opciones, sin que nada lo dijera), atar el `@param` al ARGUMENTO DE SU POSICION en
 * vez de al parametro que lo nombra (un bloque que lista sus `@param` en otro orden
 * hacia que cada uno se midiera contra el argumento de otro: la 10 se quejaba de que
 * un objeto no fuera una cadena y se comia la clave fantasma del registro de verdad,
 * y la 12 ponia en el mensaje el nombre del parametro equivocado), llevar su PROPIA
 * lista de nombres de opcion escrita a mano —estaba en seis sitios: dos en la 4, una
 * en la 5, dos mas entre la 1 y la 2, y otra en la 7; un nombre nuevo llegaba a una y
 * se quedaba sin vigilar en las demas sin que nadie lo dijera, y con las listas a
 * mano un `opciones = {}` en una firma nueva no lo veía ninguna—,
 * escribir a mano la columna que el catálogo declara —la prosa de
 * «Qué persigue» de cada regla se queda en la guía, y una
 * palabra cambiada en un sitio no tiene por qué cambiar en el otro: ahora la
 * tabla se GENERA entera y el contrato la compara línea a línea—,
 * copiar el título de una regla a su linea de la CABECERA y que se
 * quede viejo — la cabecera es un comentario y no se puede generar
 * entera, pero su identidad—el `N. TÍTULO:`— si sale del catálogo,
 * y el contrato exige el bloque entero: una linea que falta, una que sobra o
 * escribir a mano el límite honesto de cada regla en el bloque «Límites honestos»
 * de la cabecera y que se quede viejo en silencio (un comentario no lo vigila nadie:
 * el patrón se estrecha en el código y el bloque sigue prometiendo más, o al revés,
 * y no hay quien compare), ahora el bloque sale del `limit` de la entrada y el
 * contrato lo exige regla a regla con la prosa reunida, aunque el bullet se reparta
 * en varias líneas—,
 * dejar que los dos textos de prosa de una entrada SE CONVIERTAN en uno (el límite
 * honesto pegado al de «Qué persigue» hasta comerse medio campo: la entrada sigue con
 * sus dos campos, ninguno vacío, y la tabla igual de guapa, así que el único que lo ve
 * es el contrato —que compara palabras sin tildes ni signos, y solo llama empalme a la
 * racha que además se come media parte del texto más corto—),
 * reescribir un bullet de límites a mano y partirlo donde se tercia (con la prosa
 * reunida el texto sale igual, así que el contraste de prosa no lo ve, y el bloque se
 * vuelve a generar al ancho de cada entrada: 76 columnas de caja común, y la regla
 * que no cabe en ella la ensancha con su `limitWidth` —la 6, que si no deja «contra
 * esta» deacolado— sin que eso mueva a los otros doce),
 * copiar el mensaje de una receta al de otra, o repetirlo dos veces en la misma:
 * son dos bloques de mensaje que son el mismo con dos títulos —con trece reglas, el que
 * se lee al lado no dice de quién es—, y el repetido es el mismo mensaje dos veces en la
 * misma línea de `expected`. Todos los pares de prosa de una entrada se miran en la
 * misma pasada, para que el arreglo de un empalme no tapa el del otro,
 * declarar uno de los cuatro campos de prosa y dejarlo en blanco (que no es lo mismo
 * que no declararlo: una entrada a medio declarar sale con la lista entera de sitios,
 * un campo vacío sale solo —es un descuido, y los sitios que dependen de su texto son
 * consecuencia suya, no huecos nuevos; los que NO dependen de su texto siguen hablando, y
 * son otro arreglo: la receta y la flecha se declaran con sus propias piezas, y si el hueco
 * las callara, quien fuera a corregir «no tiene receta» no arreglaba nada—, y con el mismo
 * aviso de los dos quien lo leyera
 * iría a buscar un texto entero donde no hay ninguno; y de espacios también, que es
 * el mismo descuido con Excerpt; y el aviso que agrupa el bloque entero de límites
 * tampoco lo cuenta —con el bloque fuera de la cabecera, ese aviso nombra las reglas que
 * declaran un límite CON texto, y un límite en blanco ya sale por su regla: un hueco, no
 * dos en el mismo diagnóstico, que es como se leía el arreglo de uno como si fuera el
 * de la sección entera),
 * declarar el módulo de una receta, o una de sus citas, y dejarlo en blanco (lo mismo
 * que en la entrada, y con el mismo corte: el bloque de mensaje solo se busca si la receta
 * tiene texto con el que generarlo —con el módulo o una cita en blanco el bloque que
 * saldría no es el que la guía puede tener, y que falte es consecuencia del descuido—; una
 * receta que no declara módulo, o que no cita nada, sigue siendo trabajo pendiente y lo
 * dice con su propio texto; una lista con dos citas vacías son dos descuidos y el número
 * las separa; y el caso de fábrica es otra receta, que calla su bloque y no el de la base),
 * declarar la flecha de una entrada y dejarla en blanco (es el quinto campo que declara, y el
 * único que no es prosa: la entrada la da por el número de la flecha del diagrama y ahí se
 * dibuja. El hueco sale como descuido y el aviso de que esa regla no tiene flecha calla, que
 * es consecuencia suya — una cosa es cablear una entrada y otra borrar la línea que se
 * puso de más —, mientras que una entrada sin flecha sigue siendo trabajo pendiente, porque
 * la resuelve el diagrama y no el catálogo),
 * declarar dos veces una clave de prosa de la entrada o de su receta (la última gana y
 * la anterior no deja ni un rastro en el objeto ya evaluado: el catálogo sale entero, la
 * guía imprime el texto de la que gana y todo lo demás da verde, así que el duplicado
 * solo se ve en el FUENTE, y por eso el aviso sale de las dos líneas que hay que borrar
 * y no de un hueco de prosa; es el mismo corte que el campo en blanco —borrar la línea
 * que se puso de más— pero no el mismo efecto, porque el sitio se sigue imprimiendo con
 * la clave que gana y lo que depende de su texto sigue siendo cierto: el descuido no se
 * lleva por delante del resto del diagnóstico; y el patrón que busca el literal va con
 * `String.raw`, porque en una PLANTILLA `\s` no es una barra y una `s` sino la letra `s`,
 * y un regex mal escrito ahí no avisa de nada: `exec` devuelve null, la entrada vale -1 y
 * el guard entero se calla, que es justo lo que delata un guard que nunca se ha mordido;
 * y dejar un detector DECLARADO en dos modulos del audit, con el barrel en medio (el
 * generador busca cada nombre en la familia que lo exporta, y cuando hay dos coge la que
 * le salga: la superficie sale de una familia sin que nadie lo haya pedido, y el aviso de
 * generador —que si lo delata— sale solo cuando alguien PIDE el nombre, que llega mas tarde que la
 * mudanza que lo duplico; por eso los dos hogares se miran SIEMPRE, y el aviso nombra
 * tambien el modulo que ya lo saca de uno de los dos, que es donde se ve que la eleccion
 * ya esta hecha),
 * —y el mismo guard se extiende al RESTO del audit, las capas, la maquinaria y el
 * generador, que no es de ninguna regla: ahí el hueco lo nombra por su módulo y por las dos líneas, y los literales
 * ANIDADOS también se miran, que el valor de una clave puede tener la suya repetida; los
 * módulos de `rules/` se dejan fuera porque de sus entradas se ocupa el aviso por regla, que además
 * dice si lo que se repite es la entrada o su receta, y mirarlos también los contaría dos veces en el
 * mismo diagnóstico),
 * y leer las claves solo con la forma `clave: valor`, que es media lectura: la OTRA forma de
 * declarar una clave no lleva dos puntos. Es la abreviada (`{ a, a }`) y es el binding de
 * una firma o de un `const` (`function f({ a, a }) {}`, `const { a, a } = opts`), y ahí lo
 * que se repite es la clave del objeto del que se lee, con el mismo silencio y el mismo
 * arreglo. Se cuentan igual y el aviso no las distingue a propósito: borrar una de las dos
 * líneas es lo mismo en las dos formas,
 * y buscar las llaves en el fuente CRUDO, que convierte la prosa del propio audit en
 * código: sus párrafos están llenos de `{ a, a }` de ejemplo, y una llave de ejemplo no es un
 * literal. Las llaves se buscan con los dos lectores de `scan.js`, que conservan longitud
 * y números de línea. Eso además deja la plantilla en sus dos mitades, que es donde la prosa
 * mentía: su TEXTO es un ejemplo y no se ve, pero el código de una interpolación sí se ve,
 * porque es código de verdad. Y lo que no se ve, y tiene que ser así, es el contenido de
 * una CADENA: un fixture es código que nadie ha ejecutado, y delatarlo sería inventar un fallo,
 * y dejar de saltarlo es como este guard acabó delatándose a sí mismo,
 * y dejar el guard fuera de dos ficheros del audit, que es lo que hacia con los detectores
 * declarados EN LÍNEA dentro de una función: los tests del propio audit, donde viven los
 * detectores de mentira con su objeto y sus citas, y el barrel, que se genera y cuyo
 * descuido está en la línea del generador que lo escribió. Van en `AUDIT_SIN_API`, aparte de
 * los módulos, porque ni el barrel ni un test exportan nada y la lista de módulos se usa
 * para otras cosas que si los necesitan,
 * y dejar la clave repetida solo en el audit, que en un control se pierde con más
 * facilidad y sin nadie que lo note: el objeto de opciones de un constructor y el mapa de
 * renderers son literales anidados, la última clave repetida gana, la anterior desaparece
 * del objeto evaluado y el control se registra con sus defaults sin que quede rastro de la
 * opción que se perdió. El mismo guard, la misma homonimia y las mismas dos líneas, pero
 * con otro SITIO en el resumen (`una clave repetida en un control`) para que un control no
 * se lea como un módulo del audit. Y nombrar el módulo por su etiqueta, que no sirve
 * ni aquí: el aviso lleva siempre la RUTA COMPLETA (`components/knob.js`), porque la
 * etiqueta de un control es un nombre pelado que en el log no dice ni de dónde es, y
 * porque con dos módulos HOMÓNIMOS —una capa y una regla que toman el mismo nombre, que
 * es lo que pasa en cuanto una regla nueva se llama como una capa— dos avisos con el
 * mismo nombre a secas no se distinguen y con la ruta sí,
 * cerrar el informe del CI con la lista de huecos y nada más (el bloque resumen
 * cuenta las tres clases —descuidos, entradas a medio declarar y huecos de sitio— y las
 * lista POR SITIO, del más lleno al más vacío: trece «falta el encabezado» son un
 * trabajo y no trece, y el número es el que dice cuánto hay de cada clase; las tres
 * clases salen siempre, aunque una valga cero, porque un cero ausencia no es lo mismo
 * que un cero hueco; y un sitio con un solo hueco añade la entrada a la que pertenece,
 * que es justo cuando el sitio por sí solo no dice dónde hay que ir —con varios no se
 * listan, que ya están todos escritos arriba, y con más de ocho sale el más lleno y
 * el resto se cuenta, que un log de CI se lee de un vistazo—),
 * dejar en blanco uno de los dos campos de prosa de la receta, o copiar en ella un párrafo
 * que ya está en la entrada o en otra receta (los dos campos son opcionales, así que no
 * declarar ninguno no es un hueco: el descuido avisa solo, sin el bloque de prosa que debajo
 * ya no tendría sentido buscar, y una frase repetida es el mismo texto en dos guías),
 * un título viejo salen con el numero de linea—, leer la forma
 * declarada como un PREFIJO del
 * nombre (un `getValue()` pasaba por getter por empezar por `get`), no leer el
 * `@typedef` que se escribe de verdad —`@typedef {object} Point`
 * con la promesa en los `@property` de debajo: sus claves no llegaban ni a la lista de
 * documentados ni a la promesa de la regla 12, asi que leer una era un falso positivo
 * de la 2 y prometerla no vigilaba nada; lo destapa el `ValueSpec` vivo de
 * lcdMachine.js, y una cobertura exige que la forma no vuelva a vivir solo en un
 * dar por buena una convencion de FIRMA sin decir donde esta el objeto de opciones
 * (la 13 mira la posicion con el mismo lector que el resto —una lectura acotada al
 * primer parametro no se enteraria de la forma mayoritaria—, y su exencion para la
 * entrada de un solo parametro tiene que quedar dicha: es lo que la deja limpia),
 * test— (el meta-guard de exports lo ve usado, que es justo lo que hace que su
 * autor lo de por terminado), ni dar por buena una convencion de FIRMA sin decir
 * donde esta el objeto de opciones: la 13 mira la posicion con el mismo lector que
 * el resto —una lectura acotada al primer parametro no se enteraria de la forma
 * mayoritaria—, y su exencion para la entrada de un solo parametro tiene que
 * quedar dicha, que es lo que la deja limpia.
 * (el meta-guard de exports lo ve usado —que es justo lo que hace que su autor lo
 * de por terminado— y el diagnostico del catalogo solo miraba las reglas declaradas, asi
 * que nadie lo corria contra el inventario y nada lo decia: ahora sale como la regla a
 * MEDIO declarar que es, con sus sitios de una vez),
 * dejar el diagnostico donde estaba, y—esto es lo que mas caro sale— darlo por bueno
 * porque el CI lo corre (el diagnostico se mudo a `tests/audit/diagnostico.js`, que es de
 * donde salen sus piezas puras: `diagnostico`, `informeDiagnostico` y `ruleGaps` entran
 * TODO por parametro —el catalogo, la guia, la cabecera, los fuentes y los modulos—, y
 * no por un valor por defecto escondido, que es lo que permitia montarlo con una entrada
 * sola y una guia vacia; mientras vivia en el contrato, un fallo suyo no lo veia nadie
 * hasta el CI, y el CI es donde se descubre que el informe estaba mal).
 * El informe tiene ahora su caso MORDIDO en las DOS suites, que es lo que lo deja
 * verificado de verdad y no solo ejecutado: en los unitarios
 * (`tests/audit/detectors.test.js`), con una entrada y una guia vacia, para que un fallo
 * localize la PIEZA rota y no un caso del inventario real; y aqui, en la puerta, con el
 * contexto de este repo montado entero, que es lo unico que puede afirmar que la lista
 * entera sale vacia —una lista vacia de un contexto que ya no se lee no vigila nada, asi
 * que los minimos del contexto van delante del `toEqual([])`— y con los mismos fallos
 * mountados uno a uno, para que se vea que el informe losenseña todos y no uno por viaje),
 * mantener a mano la superficie del
 * barrel —la lista de lo que piden los consumidores la sabe hacer el generador, y un
 * detector mudado de familia dejaba su linea en el bloque viejo sin que nada lo dijera
 * hasta que otro test lo encontraba por el camino—, ni volver a escribir a mano quien es
 * modulo del audit y quien consumidor (las dos listas se derivan del directorio, con
 * sus subdirectorios: un test nuevo se cuela por la puerta de al lado sin que nadie lo
 * mirara cuando la lista eran dos ficheros), dar por ejercitado un export que solo
 * esta NOMBRADO (los fixtures del audit son codigo dentro de cadenas y sembraban la
 * cuenta: ahora cuenta un import o una llamada, y no un literal, un comentario ni un
 * metodo de otro), y leer un regex como si fuera una cadena al vaciar literales (una
 * comilla dentro de `/'([^']*)'/` se comia el codigo que venia detras), dar por
 * releer los fuentes del audit en cada llamada y montar el cierre con una REGEX por
 * par (`reachableFrom` era el 90% del diagnostico: 370 ms de 390, con 349 declaraciones y
 * una regex recien compilada por cada par en cada ronda del punto fijo, mientras el
 * contrato lo corre sesenta veces; el grafo `declaracion -> a quien alcanza` se levanta una
 * vez y se memoiza por la IDENTIDAD del `Map` de fuentes, que en el contrato es el mismo
 * objeto, y el cierre pasa a ser una COLA que visita cada nombre una vez en vez de repetir
 * hasta que no crezca: el conjunto alcanzable sale igual, 171 de 171, lo que el guard
 * delata no cambia, solo lo tarda —medido alternando las dos versiones para que la carga
 * norase la cifra: 370 ms -> 21 ms por diagnostico, y el contrato entero de 30 s a 4—;
 * y la clave de esa memoria es el `Map` y no su
 * contenido, asi que el mapa que monta un test recalcula, que es lo que tiene que pasar —
 * para morderla hay que romper la CLAVE, no la condicion: una `WeakMap` no tiene `size`,
 * asi que un «si ya hay algo guardado» escrito sobre ella es un no-op silencioso y el
 * mordisco se queda verde sin haber mordido nada—),
 * releer lo que no hace falta releer, que se paga en el hueco mas pequeno del
 * diagnostico (con el cierre ya arreglado, `sharedProse` era el 59% del tiempo tibio y
 * `lineOf` el 16%, y juntos eran tres de cada cuatro milisegundos). El cruce de la prosa
 * era un par de bucles sobre TODAS las palabras de los dos textos, y su mayor parte no
 * podia hacer nada: si las dos palabras del par no coinciden la racha sale de longitud
 * cero, y `0 > mejor` no es cierto nunca —ni al principio ni despues—. Con un indice
 * palabra -> posiciones se miran solo los que coinciden, y en el MISMO orden, porque el
 * maximo y el desempate tienen que salir igual. Ademas las palabras y esa tabla se
 * MEMORIZAN por el texto, que en el cruce del catalogo son setecientos ochenta pares
 * sobre treinta y ocho textos, y `lineOf` —que contaba los saltos con un
 * `slice(0, at).split('\\n')` por clave, y son cientos de claves sobre ficheros de mil
 * lineas— pasa a preguntar a una tabla de saltos construida una vez (`lineLocator`), sin
 * tocar `lineOf`, que la usan el meta-guard y los tests. Y un `flatMap` de la lista de
 * citas que se reconstruia DENTRO del bucle de la prosa, veintiseis veces, siendo la
 * funcion pura: el trabajo no cambia, solo se hacia veintiseis veces,
 * y acordarse de esto ultimo, que una pieza de PUREZAS —trabajo que se puede quitar sin
 * que cambie una sola letra de la salida— no se muerde como un guard. Un guard que
 * DECIDE algo se rompe y tiene que decir otra cosa; una pureza no puede decir nada
 * distinto, porque su salida es la misma con ella y sin ella, asi que un mordisco que se
 * queda verde ahi no esta mal hecho: esta MINTIENDO sobre lo que comprueba. Las dos se
 * comprueban de otra manera —la equivalencia contra la forma anterior en todos los pares
 * del catalogo, y el reloj alternando las dos versiones—, y las dos tienen que quedar
 * escritas, porque un guard que se ha mordido de la manera que no toca no es un guard
 * verificado: es un guard que nadie ha mirado,
 * y dar por escritura una comparacion (`pad.value == 0.5`).
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
 * segundo argumento de un `new Clase(...)`, tambien si el objeto vive tras un
 * envoltorio transparente (`new X(el, wrap({ ... }))`): una llamada cuyo UNICO
 * argumento es un objeto literal, que el audit lee asumiendo que pasa las claves tal
 * cual, y ante mas argumentos o un argumento por variable se calla. No juzga las
 * llamadas a metodos del ejemplo (`tape.setBPM(120)`, que son de la 8), ni un objeto
 * de opciones construido aparte y pasado por variable, ni una clase que no exporte
 * ningun modulo auditado (se salta, y un
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
 * declaracion. Lo que SI lee desde la firma inline: `function(a, b): c` es una
 * familia function con su aridad y su retorno dentro, y el callback que el ejemplo
 * pasa a un campo de funcion se cruza con ella (una flecha que nombre mas
 * parametros de los recibidos, o un retorno literal de otra familia, es un fallo;
 * nombrar menos es legal, como en TS, y un cuerpo `{ ... }` no promete nada). Se
 * juzga SOLO en llamadas atadas a la funcion exportada (`const x = createY(...)`):
 * una suelta (`createY(...)` a secas) sigue fuera a proposito, porque hay fabricas
 * documentadas sin `@param` (createLcdScreen, registerSkin) cuya guardia de firmas
 * despertaria sin que nadie se lo pida — ese es el riesgo que se acepta a cambio:
 * el hueco de una llamada suelta mal escrita no lo ve nadie. La 11 sigue los dos
 * receptores, atado y encadenado
 * (`new XYPad(el).setCorners(...)`), y solo compara FORMA: no juzga un
 * acceso a un miembro que la clase no declare (un campo de instancia asignado en el
 * constructor es invisible: sin forma declarada no hay comparacion), ve tambien el
 * encadenado opcional (`ts?.value`, `pad.setValue?.()`), cuenta como lectura el metodo
 * que se pasa como callback (`el.onclick = pad.setValue`) y tambien una escritura
 * compuesta (`pad.value += 1`), y no mira la forma que la PROSA promete en su lugar
 * (una lista de opciones no dice como se toca cada miembro).
 * La 12 —la guardia de los REGISTROS INLINE (`@param {{ clave: tipo }}`): cada
 * clave prometida en el tipo inline tiene que leerse como `binding.clave` (o
 * desestructurarse, renombre incluido) en el callable que el bloque documenta,
 * ligada al parametro en SU posicion de la firma. No juzga la prosa (de eso
 * responden las reglas 1 y 2), se calla si el binding no se puede leer (un
 * `...rest`, un default complejo) y no ve accesos dinamicos (`opts[clave]`) ni
 * claves leidas detras de un spread: ahi la promesa sigue verificable a mano y el
 * detector prefiere callarse a delatar de mas.
 */

import './audit/rules.js';
import './audit/autoTests.js';
import './audit/metaGuard.js';
