/**
 * Validador mínimo de JSON Schema, compartido por los contratos.
 *
 * No se añade una dependencia al paquete compartido por unos pocos contratos:
 * lo que hace falta es comprobar required, type, enum, pattern,
 * minimum/maximum, minLength/maxLength, items y additionalProperties, resolver
 * `$ref` locales, y fallar NOMBRANDO el campo.
 *
 * LA REGLA DEL FICHERO, y la razón de que exista `unsupportedKeywords()`:
 * un esquema con cosas que este validador no ejecuta es PEOR que no tener
 * esquema, porque parece que avisa. Por eso hay dos mitades —`validate()` dice
 * si una instancia vale, `unsupportedKeywords()` dice si el esquema entero se
 * está comprobando de verdad— y un contrato tiene que pasar las dos.
 *
 * SACADO de tests/modulationMatrixContract.test.js, que lo tenia enlined. Una
 * copia por contrato es una copia que se queda vieja: los dos esquemas ya
 * admiten cosas que el validador no miraba, que es como `replacesNote` se coló
 * en el contrato de NEURONiK sin que nadie se enterara.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONTRACTS = path.resolve(__dirname, '..', '..', 'contracts');

/**
 * Las palabras que se declaran para el que LEE el fichero y no se ejecutan.
 *
 * Van aparte del conjunto de las soportadas porque esto no es cosmetico: un
 * nodo de esquema que solo tiene anotaciones NO restringe nada, y hay que
 * poder decirlo. Sin esta separacion, un `description` al lado de un `$ref` —que
 * es como se escribe de costumbre— pasaba por el validador como si fuera una
 * restriccion de tipo, y salia un falso rojo diciendo que se esperaba nada.
 */
export const ANOTACIONES = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'examples',
]);

/** Lo que este validador MIRA de verdad. Lo que no está aquí, no se comprueba. */
export const SUPPORTED_KEYWORDS = new Set([
  // Las anotaciones tambien se aceptan: estan en ANOTACIONES, arriba.
  // Anotaciones: se declaran para el que lee el fichero, no se ejecutan.
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'examples',
  // Cosas que sí se ejecutan.
  'type', 'required', 'properties', 'additionalProperties',
  'enum', 'pattern', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'items',
  // Las que NO se ejecutan: se declaran para el que lee el fichero. Se
  // separan porque un nodo que solo tiene anotaciones no restringe nada, y eso
  // hay que poder decirlo al validador y no solo al que escribe el esquema.
  // Y las referencias. Estas dos no salen en la lista por descuido: se
  // RESUELVEN. Un `$ref` a un punto de este mismo esquema se sigue como si el
  // nodo estuviera copiado donde esta la referencia, con lo que la puerta
  // de `additionalProperties` cierra TAMBIEN en lo que hay debajo de un
  // `$defs`. Un `$ref` sin resolver es un error, no un silencio.
  '$ref', '$defs',
]);

/**
 * Resuelve un `$ref` LOCAL (`#/...`) contra el esquema raiz.
 *
 * Solo locales, a proposito: este validador lee UN fichero, asi que un
 * `$ref` a otro fichero no se puede seguir sin abrirlo y decidir quien lo
 * vigila. Se declara NO soportado antes que resolverse a medias.
 *
 * @returns {{ok: true, schema: object}|{ok: false, motivo: string}}
 */
export function resolverRef(ref, raiz) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return { ok: false, motivo: `"${ref}" no es una referencia local (solo "#/...") y este validador no abre ficheros` };
  }

  // Un JSON Pointer: segmentos separados por `/`, con `~1` = `/` y `~0` = `~`.
  const segmentos = ref.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let nodo = raiz;

  for (const segmento of segmentos) {
    if (nodo === null || typeof nodo !== 'object' || !(segmento in nodo)) {
      return { ok: false, motivo: `"${ref}" no apunta a nada: no existe "${segmento}"` };
    }
    nodo = nodo[segmento];
  }
  if (nodo === null || typeof nodo !== 'object') {
    return { ok: false, motivo: `"${ref}" apunta a ${nodo === null ? 'null' : typeof nodo}, no a un esquema` };
  }
  return { ok: true, schema: nodo };
}

/**
 * Valida `instance` contra `schema` y devuelve los errores NOMBRANDO el campo.
 *
 * @param schemaName  el fichero de donde salio `schema`. No es cosmetico: sin
 *                    el, un "propiedad no permitida" no dice de que esquema
 *                    habla, y quien lo lee no sabe si el que esta mal es el
 *                    contrato o el esquema. Eso es justo lo que paso con
 *                    `replacesNote` en el contrato de NEURONiK: el rojo salio,
 *                    sin nombre, y se arreglo mirando el fichero equivocado.
 * @param raiz        el esquema de ENCIMA, para poder resolver `$ref` locales.
 *                    Por defecto es el propio `schema`: en la llamada de
 *                    arriba son lo mismo, y en las de abajo viaja el de verdad.
 * @returns {string[]} vacío si la instancia vale.
 */
export function validate(instance, schema, pathPrefix = '', schemaName = null, raiz = null) {
  const errors = [];
  const where = pathPrefix || '(raíz)';

  // ── UN `$ref` SE RESUELVE O SE DICE QUE NO ──
  //
  // Antes esto no existía, y el hueco era de los gordos: un nodo con `$ref` no
  // es un objeto, no es un array y no es una hoja, así que caía de largo por
  // las TRES ramas y devolvía cero errores. O sea: la mitad del esquema —todo
  // lo que cuelgue de un `$ref`— se declaraba válida sin mirar. Cerrar
  // `additionalProperties` ahí no habría servido de nada, porque el nodo ni
  // siquiera llega a mirar campos.
  //
  // Un `$ref` que no se puede resolver es un ERROR con su motivo, porque un
  // `$ref` roto en silencio es la misma mentira que un `oneOf` sin mirar: el
  // esquema parece comprobar esa rama y no comprueba nada.
  if (schema.$ref !== undefined) {
    const resuelta = resolverRef(schema.$ref, raiz ?? schema);

    if (!resuelta.ok) {
      return [`${where}.$ref: ${resuelta.motivo}, y sin resolver esta rama NO se comprueba`];
    }

    // Solo se propaga el `schemaName`; el `raiz` sigue siendo el de arriba, que
    // es el unico que sabe donde esta `$defs`.
    errors.push(...validate(instance, resuelta.schema, pathPrefix, schemaName, raiz ?? schema));

    // Palabras al lado del `$ref`: en 2020-12 se ejecutan las dos cosas, asi que
    // se comprueban tambien. Pero SOLO las que se ejecutan: una anotacion al
    // lado (`description` al lado de un `$ref`, que es como se escribe de
    // costumbre) no es una restriccion, y hacerla pasar por `validate()` daria
    // un falso rojo de tipo en un nodo que no declara ninguno.
    const { $ref: _descartado, ...resto } = schema;
    const ejecutables = Object.fromEntries(
      Object.entries(resto).filter(([k]) => !ANOTACIONES.has(k)),
    );
    if (Object.keys(ejecutables).length > 0) {
      errors.push(...validate(instance, ejecutables, pathPrefix, schemaName, raiz ?? schema));
    }
    return errors;
  }

  // El TIPO se resuelve antes de mirar el nodo, y no después. Con `type: 'object'`
  // las dos cosas coincidían, así que daba igual; con una unión (`['object',
  // 'null']`) NO: si se comparara `schema.type === 'object'` contra la lista,
  // un nodo unión se trataría como una hoja y sus `properties` no se mirarían.
  //
  // Y eso no es un detalle: es como un esquema con cosas que nadie ejecuta, que
  // es la falta que este fichero existe para cazar. El caso que lo motivó es
  // `s950_calibration.json`, cuyo `measuredRange` es `null` mientras no haya
  // medición y un `{lo, hi}` cuando la haya: un contrato cuyo hueco declarado
  // no se comprueba es exactamente el tipo de esquema que parece que avisa.
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type])
    // Un nodo SIN `type` no restringe a nada. Sin este filtro, `types` era
    // `[undefined]` y cualquier valor daba un falso rojo de tipo: "se esperaba
    // , hay array". Solo se ha visto al meter un `description` al lado de un
    // `$ref`, que es un nodo sin tipo que solo lleva una anotacion —pero el
    // fallo era general, y un esquema con `{"minLength": 3}` sin `type` hacia
    // lo mismo.
    .filter((t) => t !== undefined);
  const isObject = types.includes('object');
  const isArray = types.includes('array');

  if (isObject) {
    // El HIJO se cuelga de `where`, que ya es `(raíz)` en el primer nivel. Sin
    // esto el error de abajo salia como `.effects[0].id`, que se entiende pero
    // parece un campo que empieza por punto. El nombre del campo es lo unico
    // que este validador da, asi que tiene que salir limpio.
    const child = (key) => `${where}.${key}`;

    // El `null` NO se descarta en esta guarda, y es el fallo que motivó todo
    // este bloque: `instance === null` estaba aqui, devolvía "se esperaba un
    // objeto" y dejaba la comprobación de tipo de más abajo como CÓDIGO MUERTO
    // para el caso que existe precisamente por eso. O sea: el esquema declaraba
    // `["object","null"]`, el validador lo aceptaba, y `measuredRange: null` —el
    // hueco que el contrato entero existe para representar— salía en rojo.
    //
    // Un esquema que parece comprobar el hueco declarado y no lo comprueba es
    // justo lo que `unsupportedKeywords()` existe para cazar, y lo cazaba por
    // el otro lado: la palabra estaba soportada pero el camino no.
    if (instance !== null && (typeof instance !== 'object' || Array.isArray(instance))) {
      const actual = Array.isArray(instance) ? 'array' : typeof instance;
      return [`${where}: se esperaba ${types.join('|')}, hay ${actual}`];
    }
    // Y aquí, con el nodo UNION ya resuelto, solo se comparan TIPOS si la
    // instancia no llegó a ser un objeto —es decir, si es un `null`—. Un
    // objeto de verdad cae de largo y lo que se ejecuta son sus `properties`.
    if (instance === null) {
      if (!types.includes('null')) {
        return [`${where}: se esperaba ${types.join('|')}, hay null`];
      }
      return errors;
    }

    for (const key of schema.required ?? []) {
      if (!(key in instance)) errors.push(`${where}.${key}: obligatorio`);
    }
    for (const [key, value] of Object.entries(instance)) {
      const sub = schema.properties?.[key];
      if (!sub) {
        if (schema.additionalProperties === false) {
          // ── EL ROJO DE UNA PROPIEDAD QUE NO EXISTE ──
          //
          // Dice las TRES cosas que hacen falta para arreglarlo sin buscar:
          // donde, contra que esquema, y las dos salidas posibles. Un "no
          // permitida" a secas obliga a reconstruir el contexto desde cero, y
          // lo primero que se hace es mirar el fichero equivocado.
          //
          // Las dos salidas van las dos porque el caso no tiene un dueño
          // claro: si el campo es de verdad parte del contrato lo que falta es
          // la linea en `properties`; si se ha colado, lo que sobra es la linea
          // en el contrato. Decidirlo es cosa de quien sabe que quiere, no del
          // validador, y por eso se ofrecen las dos en vez de asumir una.
          const contra = schemaName ? ` (${schemaName})` : '';

          errors.push(
            `${where}.${key}: propiedad que el esquema${contra} no declara. ` +
            'O se anade a `properties` del esquema si el campo es del contrato, ' +
            'o se quita del contrato si se ha colado.',
          );
        }
        continue;
      }
      errors.push(...validate(value, sub, child(key), schemaName, raiz ?? schema));
    }
    return errors;
  }

  if (isArray) {
    // Un `null` en un `['array','null']` es legal, y no tiene items que mirar:
    // es un hueco declarado, no un fallo. Se comprueba aqui y no antes para que
    // la lista vacía y el null sigan rutas distintas, que es lo que un panel
    // necesita distinguir: cero ejes, o ningun eje.
    if (instance === null) {
      return types.includes('null') ? errors : [`${where}: se esperaba ${types.join('|')}, hay null`];
    }

    if (!Array.isArray(instance)) return [`${where}: se esperaba un array`];
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push(`${where}: al menos ${schema.minItems} elementos, hay ${instance.length}`);
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push(`${where}: como mucho ${schema.maxItems} elementos, hay ${instance.length}`);
    }
    // UNIQUE.ITEMS por valor JSON, no por identidad: dos filas iguales son dos
    // filas iguales, y sin esto el aviso sale de un `Set` sobre objetos.
    if (schema.uniqueItems === true) {
      const seen = new Set();
      const dupes = new Set();
      for (const item of instance) {
        const key = JSON.stringify(item);
        if (seen.has(key)) dupes.add(key);
        seen.add(key);
      }
      if (dupes.size > 0) {
        errors.push(`${where}: ${dupes.size} elemento(s) repetido(s) (uniqueItems), el primero es ${[...dupes][0]}`);
      }
    }
    if (schema.items) {
      instance.forEach((item, index) => {
        // `${where}[i]` y no `${pathPrefix}[i]`: el array puede haber bajado
        // desde la raiz y hay que seguir deflendolo.
        errors.push(...validate(item, schema.items, `${where}[${index}]`, schemaName, raiz ?? schema));
      });
    }
    return errors;
  }

  let actual = Array.isArray(instance) ? 'array'
             : instance === null ? 'null'
             : typeof instance;

  // JSON Schema distingue `integer` de `number`: `3.5` NO es un integer. En JS
  // ambos son `number`, asi que el tipo real se calcula aqui; sin esto, un
  // campo declarado integer aceptaria 3.5 en silencio.
  if (actual === 'number' && types.includes('integer') && !types.includes('number')) {
    actual = Number.isInteger(instance) ? 'integer' : 'number';
  }

  // Sin `type` no hay restriccion de tipo que comprobar. Lo que venga despues
  // —`minLength`, `pattern`, `enum`— si se mira, y mira lo que su valor sea.
  if (types.length > 0 && !types.includes(actual)) {
    return [`${where}: se esperaba ${types.join('|')}, hay ${actual}`];
  }

  if (schema.enum && !schema.enum.includes(instance)) {
    return [`${where}: "${instance}" no está en [${schema.enum.join(', ')}]`];
  }
  if (schema.minimum !== undefined && instance < schema.minimum) {
    errors.push(`${where}: ${instance} < mínimo ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && instance > schema.maximum) {
    errors.push(`${where}: ${instance} > máximo ${schema.maximum}`);
  }
  if (schema.minLength !== undefined && String(instance).length < schema.minLength) {
    errors.push(`${where}: más corto que ${schema.minLength}`);
  }
  if (schema.maxLength !== undefined && String(instance).length > schema.maxLength) {
    errors.push(`${where}: más largo que ${schema.maxLength}`);
  }
  // PATTERN SOLO sobre string: en `["integer","string","null"]` un `pattern` es
  // una restriccion de la forma STRING y no dice nada del integer. Aplicado a
  // un null (el motor null de un campo union) daria un falso rojo, asi que
  // solo se mira cuando el valor es de verdad una cadena.
  if (schema.pattern !== undefined && typeof instance === 'string' && !new RegExp(schema.pattern).test(instance)) {
    errors.push(`${where}: "${instance}" no casa con /${schema.pattern}/`);
  }
  return errors;
}

/**
 * Las palabras clave del esquema que este validador NO ejecuta.
 * @returns {string[]} con su ruta, para que el rojo diga DÓNDE.
 */
export function unsupportedKeywords(schema, pathPrefix = '', raiz = null) {
  const found = [];

  const walk = (node, where) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) {
        found.push(`${where}.${key}`);
        continue; // una palabra desconocida puede colar cosas dentro: no se baja.
      }
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        for (const [name, sub] of Object.entries(value)) {
          walk(sub, `${where}.${name}`);
        }
      } else if (key === 'items') {
        walk(value, `${where}[]`);
      } else if (key === '$defs' && typeof value === 'object' && value !== null) {
        // BAJAR POR `$defs` ES OBLIGATORIO, y es el otro punto donde esto
        // mentia. Sin esta rama, declarar `$defs` como palabra soportada
        // habria tapado el problema sin mirarlo: lo que hay dentro se contaria
        // como comprobado sin haberse examinado nunca. Un `$defs` que nadie
        // recorre es un `$defs` que nadie vigila.
        for (const [name, sub] of Object.entries(value)) {
          walk(sub, `${where}.$defs.${name}`);
        }
      } else if (key === '$ref' && typeof value === 'string') {
        // Una referencia NO se acepta porque la palabra sea conocida: se
        // acepta porque apunte a algo. Este esquema declara `#/$defs/...` y
        // resuelve; si un dia alguien pone `#/noExiste`, sale aqui el mismo
        // rojo que le saldria a quien valida, y con el motivo.
        const resuelta = resolverRef(value, raiz ?? schema);
        if (!resuelta.ok) found.push(`${where}.$ref: ${resuelta.motivo}`);
      }
    }
  };

  walk(schema, pathPrefix || '(raíz)');
  return found;
}

/**
 * QUE CONTRATO CORRESPONDE A QUE ESQUEMA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO ES UNA TABLA Y NO SE DEDUCE.
 *
 * Se deduce el nombre, y no funciona. El esquema se llama
 * `s950-calibration.schema.json` y el contrato `s950_calibration.json`:
 * guion contra guion bajo. Y `modulation_matrix.schema.json` vale para TRES
 * contratos —abdeep, abdms2000 y neuronik— que no tienen nada en el nombre que
 * los una a el.
 *
 * Se deduce del `$schema` que declara cada contrato, y tampoco: SOLO lo declaran
 * los tres que nacieron con esquema. Los tres de la matriz no lo tienen, asi que
 * su vinculo vive hoy en una tabla a mano DENTRO de su test, y ahi es donde no
 * se ve que es una tabla.
 *
 * Esa es la razon de que esto sea un inventario explicito: un emparejamiento
 * automatico que se queda corto no da ningun fallo, da un esquema "validado"
 * con dos de sus tres contratos sin mirar. Un inventario se puede olvidar de
 * actualizar, y eso se ve —`schemaPairs()` lo contrasta con el disco—; uno
 * automático no.
 *
 * Y `sinInstancia` existe para el caso real que hay en este paquete: un esquema
 * sin ningun contrato. No se esconde, se nombra con su motivo, y el test exige
 * que ese motivo este escrito. Ahora mismo no hay ninguno, y el test lo dice.
 *
 * Lo que NO cabe en esta lista es una entrada de cuarentena. Un contrato
 * sospechoso no es un esquema sin contrato, asi que esta en `CUARENTENAS`,
 * mas abajo, con su motivo al lado.
 */
export const CONTRATOS_CON_ESQUEMA = [
  {
    schema: 'fx-effects.schema.json',
    contracts: ['fx-effects.json'],
  },
  {
    // EL SEGUNDO AIRA, Y EL QUE SI SE PUEDE VALIDAR. El otro —el catalogo de
    // 31 bloques— esta en `CUARENTENAS`, mas abajo, porque su contenido no es
    // el de la maquina. Este si lo es: es el indice, y un indice sin esquema es
    // una tabla de direcciones que nadie comprueba.
    //
    // Antes de que existiera, `devices` y `protocol` —las dos partes de este
    // fichero que se inventan sus propias claves— pasaban sin mirarse. Lo que
    // aparecio al escribir el esquema son cuatro campos que estaban ahi y que
    // no decia nadie que existieran: `submodules[].inferred` en los dos modulos
    // deducidos, y `patching.cableCondition.bitmask`.
    schema: 'roland_aira_patch_spec.schema.json',
    contracts: ['roland_aira_patch_spec.json'],
  },
  {
    schema: 'modulation_matrix.schema.json',
    // El unico esquema que sirve a mas de uno. Y el unico cuyo vinculo NO esta
    // en los datos: los tres contratos son identicos en forma y no declaran
    // `$schema`, asi que esta linea es la UNICA cosa que dice que van juntos.
    contracts: [
      'abdeep_modulation_matrix.json',
      'abdms2000_modulation_matrix.json',
      'neuronik_modulation_matrix.json',
    ],
  },
  {
    schema: 's950-calibration.schema.json',
    contracts: ['s950_calibration.json'],
  },
  {
    schema: 's950-patch-fields.schema.json',
    contracts: ['s950_patch_fields.json'],
  },
  {
    schema: 'hardware_profile.schema.json',

    // EL MAS GRANDE Y EL QUE MAS TARDE SE ENCONTRO. Este esquema lleva meses
    // aqui, con la palabra "hardware profile" en el nombre, y estaba declarado
    // SIN NINGUN CONTRATO. No porque no los hubiera: hay veintiseis, en este
    // mismo directorio, y `HardwareContractRegistry` (ABDSharedCode) los lee
    // de aqui en produccion. Lo que no habia era la DECLARACION de que son
    // suyos. (Eran veintisiete: el septimo, `roland_aira_submodules.json`, esta
    // en cuarentena por su cuenta — ver mas abajo.)
    //
    // Y el modo en que se paso por alto dice mas del fallo que el fallo: se
    // busco el nombre del esquema por todo el monorepo y salio una vez, en una
    // frase de documentacion que no lo nombra. Los contratos no llevan ninguna
    // clave que diga a que esquema pertenecen —tampoco `$schema`—, asi que el
    // vinculo no se encuentra buscando, se declara. Por eso esto es una tabla.
    //
    // Los veintiseis estan todos, incluidos los que no son una maquina fisica:
    // `generic_midi_synth`, `mock_va_synth` y `abd_sm002` (que es un MS2000
    // emulado, y por eso lleva `isSoftsynth`). No son ruido: el registro los
    // carga igual que a los otros, y un perfil emulado que no se valida es
    // justo donde se equivoca una calibracion sin que nadie lo note.
    //
    // Lo que se encontro al atarlos: 195 rojos, todos del mismo tipo —un campo
    // bueno en el sitio equivocado—. `minVal`/`maxVal`/`defaultVal` y
    // `ccNumber` (48, 48, 48 y 36 usos), `isSoftsynth`, y
    // `functions[].measurementRecipe`, que es la que mas duele: `functions[]`
    // decia QUE se puede medir y el esquema no decia COMO, que es justo lo que
    // se ha estado escribiendo a mano en tres contratos.
    contracts: [
      'abd_sm002.json',
      'behringer_deepmind12.json',
      'behringer_deepmind12d.json',
      'behringer_deepmind6.json',
      'behringer_jt4000.json',
      'behringer_modular_140.json',
      'behringer_provs_mini.json',
      'casio_cz1.json',
      'casio_cz1000.json',
      'casio_cz101.json',
      'casio_cz5000.json',
      'generic_midi_synth.json',
      'korg_microkorg.json',
      'korg_ms2000.json',
      'korg_prophecy.json',
      'manual_eurorack_vcf.json',
      'mock_va_synth.json',
      'roland_aira_bitrazer.json',
      'roland_aira_demora.json',
      'roland_aira_scooper.json',
      'roland_aira_torcido.json',
      'roland_hs60.json',
      'roland_juno106.json',
      'roland_juno6.json',
      'roland_juno60.json',
      'yamaha_dx7ii.json',
    ],
  },
];

/**
 * CONTRATOS EN CUARENTENA: se saben dudosos y NO se dan por buenos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE VAN EN UNA LISTA APARTE Y NO COMO UNA ENTRADA MAS DEL INVENTARIO.
 *
 * Porque la forma que se probo primero —una entrada del inventario con
 * `contracts: []`— mezclaba dos cosas y rompia una puerta. La clave de esa
 * entrada se llama `schema`, y `roland_aira_submodules.json` no es un
 * esquema: al contarlo contra el disco salia un esquema en el inventario que
 * en disco no existe, y se ponia en rojo el test que existe para cazar justo
 * eso, un esquema que nadie mira, por una entrada que si se mira pero de otra
 * manera. Un test rojo por el motivo equivocado es peor que no tener test:
 * entrena a ignorar el rojo.
 *
 * Y por lo demas el nombre de la lista es el del CONTENIDO, no el del sitio
 * donde va. Lo dudoso aqui es un CONTRATO, no un esquema: no hay esquema que
 * atar, que es justo lo que hace que la entrada no encaje en el inventario.
 *
 * Lo que si se conserva de la idea inicial: el motivo va aqui escrito, no en un
 * fichero de texto al lado. Y `validateContract()` lo propaga, para que un
 * contrato en cuarentena que algun dia se ate a un esquema de verdad devuelva
 * su motivo en vez de un verde mudo.
 *
 * ----------------------------------------------------------------------------
 * ESTA LISTA ES UNA LISTA, NO LA REGLA. Y LA DIFERENCIA ES LA QUE CUENTA.
 *
 * La REGLA —que campo, que valor, que pasa si no hay motivo— esta en
 * `utils/quarantine.js`, y la comparten el preflight y el laboratorio de C++ (por
 * su mitad). Aqui, en una lista de tests, no se puede: un preflight no importa
 * de la suite que vigila.
 *
 * Esta lista dice QUE CONTRATOS estan retenidos, y el `status` de los ficheros
 * dice si de verdad lo estan. Lo de que las dos cosas cuadren no se supone: lo
 * miden dos tests, uno en cada direccion, en `schemaValidator.test.js`. Que los
 * mida la regla y no una comparacion de literales es lo que hace que cambiar el
 * valor de la regla no produzca un rojo falso.
 */
export const CUARENTENAS = [
  {
    // ── EN CUARENTENA ──
    //
    // Este NO esta atado a ningun esquema a proposito. Y no es que se haya
    // olvidado: se ha medido y esta en cuarentena de forma consciente, que es
    // una cosa distinta de no mirarlo.
    //
    // Que trae 31 bloques y que el `patch_spec` del AIRA tiene 31 modulos NO
    // quiere decir que sean los mismos 31. Medido, solo CASAN 7:
    // filter_24db, filter_18db, formant_filter, tube_clip, short_delay,
    // compressor y sample_and_hold. Los otros 24 de cada lado no coinciden.
    //
    // Y la direccion del desajuste dice que estan mezclando mundos:
    //
    //   - Este fichero trae bloques que el AIRA NO tiene: fuzz_germanium,
    //     chorus_ensemble, phaser_4stage, pitch_transposer, svf_filter,
    //     bit_crusher... Un Roland AIRA Modular no tiene un fuzz de germanio.
    //   - El AIRA tiene modulos que aqui no estan: osciladores SAW y SQR, un
    //     divisor de gates, logica, MIDI NOTE TO CV/GATE, curve converter.
    //
    // O sea: este fichero describe el motor del AIRA ("Universal 31-Submodule
    // DSP Engine shared across Bitrazer, Torcido, Demora & Scooper", dice su
    // descripcion) y lleva el `midiIdentification` del AIRA con
    // `deviceType: AUTOMATED_SYSEX`, pero su contenido es un catalogo distinto.
    // Con esos metadatos, cualquier programa que lo lea —una calibracion, un
    // editor— cree que son los modulos de la maquina.
    //
    // No se decide cual de las dos listas es la buena, porque no se puede desde
    // aqui: el laboratorio esta en desarrollo y puede que sea un error suyo. Por
    // eso la cuarentena y no un arreglo. Lo que NO se hace es dejarlo pasar como
    // si nada: un contrato que se sabe dudoso, validado en verde, es peor
    // que uno sin validar, porque da confianza.
    //
    // Levantar la cuarentena es borrar esta entrada de aqui Y atar el fichero
    // con su esquema, pero solo cuando se sepa cual de las dos listas describe
    // el hardware. El test que cuenta el 24 esta a proposito, para que ese dia
    // salte y haya que mirarlo en vez de que se note por los reds de otro.
    contrato: 'roland_aira_submodules.json',
    motivo: 'De 31 bloques, solo 7 casan por nombre con los 31 modulos del patch_spec; los otros 24 de cada lado no coinciden. Medido por CUARENTENA_ROLAND_AIRA en tests/schemaValidator.test.js',
  },
];

/** El inventario tal cual, indexado por nombre de esquema. */
const INVENTARIO = new Map(CONTRATOS_CON_ESQUEMA.map((e) => [e.schema, e]));

/**
 * Valida TODOS los contratos de un esquema, leyéndolos del disco.
 *
 * Y es una entrada separada, no un `validate` con un argumento más, por una
 * razón concreta: el nombre del esquema tiene que viajar SOLO. Si depende de
 * que quien llama se acuerde de pasarlo, hay un test que se olvida y ese vuelve
 * a ver un rojo sin contexto —que es el fallo que se quiere tapar—. Con una
 * función que lee los dos ficheros, no hay forma de hacerlo mal.
 *
 * @param schemaFile nombre del esquema, tal cual está en `contracts/`
 * @returns {{ok: boolean, errors: string[], contracts: string[], sinInstancia: boolean, cuarentena: string[]}}
 */
export function validateContract(schemaFile) {
  const entrada = INVENTARIO.get(schemaFile);

  if (!entrada) {
    return {
      ok: false,
      sinInstancia: false,
      cuarentena: [],
      contracts: [],
      errors: [
        `${schemaFile}: no esta en el inventario CONTRATOS_CON_ESQUEMA, ` +
        'asi que nadie lo va a validar. Anadelo con sus contratos.',
      ],
    };
  }

  // Sin instancia no es un fallo de validacion: no hay nada que validar. Que
  // lo diga con su palabra y no como un error vacio es lo que permite que el
  // test lo distinga de "el contrato no vale". Y no se mezcla con la
  // cuarentena, que es otra cosa y va en su propia lista: aqui lo que falta
  // es un contrato, no que el contenido de uno sea dudoso.
  if (entrada.contracts.length === 0) {
    return {
      ok: true,
      sinInstancia: true,
      cuarentena: [],
      contracts: [],
      errors: [],
    };
  }

  const schema = readSchema(schemaFile);
  const errors = [];

  for (const nombre of entrada.contracts) {
    // El nombre del esquema va en el error, y el del contrato tambien: un rojo
    // que no diga de que par de ficheros habla obliga a reconstruir el contexto.
    errors.push(...validate(readContract(nombre), schema, '', `${schemaFile} -> ${nombre}`, schema));
  }

  return {
    ok: errors.length === 0,
    sinInstancia: false,
    cuarentena: entrada.contracts.flatMap((n) => motivosDeCuarentena(n)),
    contracts: entrada.contracts,
    errors,
  };
}

/** Todos los pares del inventario, para quien quiera recorrerlos. */
export function schemaPairs() {
  return CONTRATOS_CON_ESQUEMA.map(({ schema, contracts, sinInstancia }) => ({
    schema,
    contracts,
    sinInstancia: sinInstancia ?? null,
  }));
}

/**
 * Los contratos en cuarentena, con su motivo.
 *
 * Van aparte de `sinInstancia` porque son dos cosas distintas y confundirlas es
 * justo el fallo: un esquema sin contrato no tiene nada que validar; un
 * contrato en cuarentena TIENE contrato y ademas tiene esquema, lo que no tiene
 * es contenido en el que confiar.
 *
 * @returns {{contrato: string, motivo: string}[]}
 */
export function contratosEnCuarentena() {
  return CUARENTENAS.map(({ contrato, motivo }) => ({ contrato, motivo }));
}

/** El motivo de cuarentena de un contrato, o `null` si no esta en cuarentena. */
export function motivoDeCuarentena(contractName) {
  return CUARENTENAS.find((c) => c.contrato === contractName)?.motivo ?? null;
}

/** Los motivos de cuarentena de un contrato: `[]` si no esta en cuarentena. */
function motivosDeCuarentena(contractName) {
  const motivo = motivoDeCuarentena(contractName);
  return motivo ? [`${contractName}: ${motivo}`] : [];
}
/** Lee un contrato por nombre de fichero y lo devuelve ya parseado. */
export function readContract(fileName) {
  return JSON.parse(readFileSync(path.join(CONTRACTS, fileName), 'utf8'));
}

/** Lee un esquema por nombre de fichero y lo devuelve ya parseado. */
export function readSchema(fileName) {
  return JSON.parse(readFileSync(path.join(CONTRACTS, fileName), 'utf8'));
}
