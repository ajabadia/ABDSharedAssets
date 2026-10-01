/**
 * El validador de esquemas: que falle cuando el contrato tiene un campo que el
 * esquema no declara.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE HAY UN FICHERO ENTERO DEDICADO A ESTO.
 *
 * Porque la regla ya existía y ya estaba probada —en `fxEffectsContract`, que
 * sabotea el contrato y mira que salga el rojo— pero solo en UNO de los cuatro
 * pares. Los otros tres dependían de que su propio test se acordara de mirar.
 *
 * Y el caso que la motiva no fue un campo malo, fue un campo BUENO en el sitio
 * equivocado: `replacesNote` se añadió al contrato de NEURONiK porque hacía
 * falta —había destinos que acumulan sobre un factor con neutro, y sin la nota
 * la tabla no explicaba por qué— y no al esquema. `additionalProperties: false`
 * lo rechazó, que es lo que debía pasar, pero el rojo decía
 * "propiedad no permitida por el esquema" y sin decir contra qué esquema. Quien
 * lo leyó no sabía si el equivocado era el contrato o el esquema, y se
 * arregló mirando el fichero equivocado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAS TRES COSAS QUE ESTE FICHERO COMPRUEBA, Y SON DISTINTAS.
 *
 *   1. Que la puerta CIERRE: un campo desconocido en la raíz y en lo anidado
 *      tienen que salir en rojo, en los cuatro pares, no solo en uno.
 *   2. Que el rojo SEA ÚTIL: tiene que nombrar el esquema y las dos salidas
 *      posibles, porque el que decide si el campo se declara o se quita es
 *      quien sabe qué quiere, no el validador.
 *   3. Que no quede un esquema SIN MIRAR, que es la forma real de que esto
 *      vuelva a pasar: no con un campo malo, sino con un contrato entero que
 *      nadie comprueba.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTRACTS,
  CONTRATOS_CON_ESQUEMA,
  contratosEnCuarentena,
  motivoDeCuarentena,
  readContract,
  readSchema,
  schemaPairs,
  unsupportedKeywords,
  validate,
  validateContract,
} from './helpers/validateSchema.js';

// La regla de cuarentena, del sitio unico donde vive. Este bloque de abajo ya
// media las DOS direcciones entre la lista y el dato; lo que anade este import
// es que las dos se lean por la MISMA regla que leen el preflight y el
// laboratorio, y no comparando el string a pelo. Si un dia cambia la regla en
// `utils/quarantine.js`, este bloque se entera; si comparase el literal,
// se quedaria mirando un string viejo sin enterarse.
import { POLITICA, comprobarContraElEsquema, veredicto } from '../utils/quarantine.js';

// La medicion del cruce AIRA, del mismo modo: los tests de mas abajo miden el
// cruce por su cuenta Y el motivo lo compara con lo que produce esta funcion.
// Son dos cosas distintas a proposito —la una comprueba, la otra produce— y
// por eso el motivo se puede quedar viejo si nadie ata las dos, que es
// exactamente lo que este import deja poder comprobar.
import { medirCruceAira, motivoDeLaCuarentena } from '../utils/cruceAira.js';

/** Copia profunda de un contrato con un campo nuevo, sin tocar el original. */
function conCampoInesperado(contrato, ...ruta) {
  const copia = structuredClone(contrato);

  let destino = copia;
  for (const paso of ruta.slice(0, -1)) {
    if (Array.isArray(paso)) destino = destino[paso[0]][paso[1]];
    else destino = destino[paso];
  }

  const ultimo = ruta[ruta.length - 1];
  if (Array.isArray(ultimo)) destino[ultimo[0]][ultimo[1]] = 'un valor';
  else destino[ultimo] = 'un valor';

  return copia;
}

//==============================================================================
describe('la puerta CIERRA: un campo que el esquema no declara, en rojo', () => {
  // Un par por cada esquema con instancia, y el campo se cuela en la RAIZ y
  // en un objeto ANIDADO, que son los dos sitios donde se puede colar y donde
  // el error dice cosas distintas.
  const conInstancia = schemaPairs().filter((p) => p.contracts.length > 0);

  it('hay seis pares que comprobar, y no se cuela ninguno por alto', () => {
    // Si el inventario se encogiera, este test pasa con menos cobertura de la
    // que cree. Fijar el numero es lo que hace que una entrada que se pierda se
    // note aqui y no por un esquema que dejo de mirarse en silencio.
    //
    // Eramos cuatro. El quinto es `hardware_profile.schema.json`, que estuvo
    // meses aqui con veintiseis contratos a un paso y declarado sin ninguno. Y
    // el sexto es el del patch_spec del AIRA, que se escribio despues de
    // encontrar que su tabla de Model ID contradecía a los cuatro contratos de
    // por dispositivo: no lo, y ningun esquema lo miraba.
    expect(conInstancia.length).toBe(6);
  });

  // Y se prueba en CADA contrato, no en el primero de cada esquema. Con el
  // quinto par atado, "el primero" habria sido `abd_sm002.json` y los otros
  // veintiseis se habrian dedicado a validar bien y a no comprobar la puerta.
  for (const par of conInstancia) {
    const schema = readSchema(par.schema);

    for (const nombre of par.contracts) {
      const contrato = readContract(nombre);

      it(`${nombre}: un campo nuevo en la RAIZ sale en rojo`, () => {
        const saboteado = conCampoInesperado(contrato, 'campoQueNoExiste');

        const errores = validate(saboteado, schema, '', `${par.schema} -> ${nombre}`);
        expect(errores.length).toBeGreaterThan(0);
        expect(errores.join(' | ')).toMatch(/campoQueNoExiste/);
      });

      it(`${nombre}: un campo nuevo en un objeto ANIDADO sale en rojo`, () => {
        // El anidado es el caso que mas se escapa: un `additionalProperties: false`
        // en la raíz no protege a los objetos de dentro, y cada uno necesita el
        // suyo. Si el anidado no cierra, un campo se cuela a cuatro niveles de
        // profundidad y no lo ve nadie.
        const anidado = primerObjetoAnidado(contrato, schema);

        // Un contrato cuyo esquema no declara ningun objeto anidado no tiene
        // este caso; se dice en vez de inventar una ruta que no existe.
        if (!anidado) {
          expect(validate(contrato, schema, '', nombre)).toEqual([]);
          return;
        }

        const saboteado = conCampoInesperado(contrato, ...anidado, 'campoQueNoExiste');
        const errores = validate(saboteado, schema, '', `${par.schema} -> ${nombre}`);

        expect(errores.length, 'un campo en un objeto anidado deberia salir en rojo').toBeGreaterThan(0);
        expect(errores.join(' | ')).toMatch(/campoQueNoExiste/);
      });
    }
  }
});

//==============================================================================
describe('el rojo se PUEDE USAR: dice contra qué esquema y las dos salidas', () => {
  // ── ESTO ES LO QUE NO SE HIZO LA PRIMERA VEZ ──
  //
  // `replacesNote` se coló, el validador lo rechazó y el rojo fue
  // "propiedad no permitida por el esquema". Sin nombre de esquema, quien lo leyó
  // no sabía cuál de los dos ficheros arreglar, y hay tres cosas que pueden
  // estar mal: que el campo no debería estar, que debería estar en otro
  // contrato, o que falta declararlo. Sin el nombre del esquema las tres se
  // parecen.
  for (const par of schemaPairs()) {
    if (par.contracts.length === 0) continue;

    it(`${par.schema}: el error nombra el esquema`, () => {
      const schema = readSchema(par.schema);
      const saboteado = conCampoInesperado(readContract(par.contracts[0]), 'campoQueNoExiste');

      const errores = validate(saboteado, schema, '', par.schema);
      expect(errores.join(' | ')).toContain(par.schema);
    });

    it(`${par.schema}: el error ofrece las DOS salidas, y no solo una`, () => {
      // Las dos, porque la decision no es del validador. Si solo dijera "añádelo
      // al esquema", alguien acabaria declarando campos que no deberían
      // existir para que el rojo se callara, que es como un esquema se convierte
      // en una lista de lo que ha pasado en lugar de lo que es.
      const schema = readSchema(par.schema);
      const saboteado = conCampoInesperado(readContract(par.contracts[0]), 'campoQueNoExiste');

      const texto = validate(saboteado, schema, '', par.schema).join(' | ');

      expect(texto).toMatch(/properties/);       // la salida: declararlo
      expect(texto).toMatch(/quita del contrato/i); // la otra: quitarlo
    });
  }

  it('sin el nombre del esquema el mensaje es mas corto, y por eso se pasa', () => {
    // La comprobacion de que el parametro es REAL y no decorativo: el mismo
    // error con y sin nombre tiene longitudes distintas. Si un dia alguien
    // quita el `schemaName` de la llamada, esto se pone rojo.
    const schema = readSchema('fx-effects.schema.json');
    const saboteado = conCampoInesperado(readContract('fx-effects.json'), 'campoQueNoExiste');

    const conNombre = validate(saboteado, schema, '', 'fx-effects.schema.json').join('');
    const sinNombre = validate(saboteado, schema, '').join('');

    expect(conNombre.length).toBeGreaterThan(sinNombre.length);
    expect(sinNombre).not.toContain('fx-effects.schema.json');
  });
});

//==============================================================================
describe('todos los contratos del inventario validan de verdad', () => {
  for (const par of schemaPairs()) {
    if (par.contracts.length === 0) continue;

    it(`${par.schema}: sus ${par.contracts.length} contrato(s) validan limpios`, () => {
      const r = validateContract(par.schema);
      expect(r.errors, r.errors.join(' | ')).toEqual([]);
      expect(r.ok).toBe(true);
    });
  }
});

//==============================================================================
describe('el inventario cubre el directorio, y lo que no cubre se declara', () => {
  // ── LA FORMA REAL DE QUE ESTO VUELVA A PASAR ──
  //
  // No con un campo malo, sino con un esquema o un contrato que nadie mira. Un
  // esquema sin validar no da ningún rojo: da silencio, que es lo más parecido
  // a un esquema que valida.
  it('todo esquema del directorio esta en el inventario', () => {
    const enDisco = readdirSync(CONTRACTS).filter((n) => n.endsWith('.schema.json')).sort();
    const declarados = CONTRATOS_CON_ESQUEMA.map((e) => e.schema).sort();

    expect(declarados, `esquemas en disco sin inventariar: ${enDisco.filter((s) => !declarados.includes(s)).join(', ')}`)
      .toEqual(enDisco);
  });

  it('y un contrato en cuarentena NO se cuela en ese recuento como si fuera un esquema', () => {
    // La cuarentena esta FUERA del inventario a proposito, asi que la puerta de
    // arriba tiene que seguir contando solo esquemas. Y este test es lo que
    // impide que se vuelva a meter de polizona: si alguien cuela una entrada
    // de cuarentena en `CONTRATOS_CON_ESQUEMA`, el recuento de arriba ya no da
    // el mismo numero de ficheros y sale rojo —pero sale por una confusion que
    // no es la suya—. Este lo dice con su propio nombre.
    for (const { contrato } of contratosEnCuarentena()) {
      expect(contrato.endsWith('.schema.json'),
        `${contrato} esta en cuarentena como CONTRATO, y no es un esquema`).toBe(false);
      expect(CONTRATOS_CON_ESQUEMA.map((e) => e.schema),
        `${contrato} en cuarentena no puede estar tambien en el inventario de esquemas`).not.toContain(contrato);
    }
  });

  it('todo contrato del inventario existe de verdad', () => {
    for (const entrada of CONTRATOS_CON_ESQUEMA) {
      for (const contrato of entrada.contracts)
        expect(existsSync(join(CONTRACTS, contrato)), `${contrato} no existe`).toBe(true);
    }
  });

  it('y todo contrato en cuarentena tambien existe, o su motivo no vale para nada', () => {
    // Una cuarentena sobre un fichero que ya no esta no dice nada: parece una
    // declaracion de intenciones y no es ni un aviso. Con leerlo se comprueba
    // de paso que sigue siendo JSON valido, que es lo unico que se puede
    // comprobar de un contrato sin esquema.
    for (const { contrato, motivo } of contratosEnCuarentena()) {
      expect(existsSync(join(CONTRACTS, contrato)), `${contrato} esta en cuarentena pero no existe`).toBe(true);
      expect(motivo, `${contrato} esta en cuarentena sin decir por que`).toBeTruthy();
      expect(() => readContract(contrato), `${contrato} esta en cuarentena y ya no es JSON`).not.toThrow();
    }
  });

  it('un esquema sin instancia lo dice con su motivo, y no es un fallo', () => {
    // Sin contrato no se puede validar nada, y eso NO es un rojo de validacion:
    // es un hueco. Lo que no vale es que el hueco no se diga. Asi que la regla
    // se queda puesta para cuando vuelva a haber uno.
    //
    // Y ahora mismo NO hay ninguno, que es la segunda mitad de este test: los
    // cinco esquemas del directorio tienen contrato. Antes de este trabajo
    // habia uno declarado sin contrato —`hardware_profile.schema.json`— y
    // resulto que si los tenia todos, veintiseis; solo faltaba la declaracion.
    // Un hueco que se declara sin comprobar si de verdad lo es, se vuelve
    // costumbre.
    //
    // Y la cuarentena NO entra aqui, y es deliberado: un contrato sospechoso
    // no es un esquema sin contrato. Se cuenta en `CUARENTENAS`, que es una
    // lista aparte, y con su propio bloque de tests mas abajo. Cuando se
    // mezclaron las dos cosas —una entrada del inventario con `contracts: []`
    // para el fichero en cuarentena— este test se puso en rojo por un motivo
    // que no era el suyo.
    const sinInstancia = CONTRATOS_CON_ESQUEMA.filter((e) => e.contracts.length === 0);

    for (const entrada of sinInstancia) {
      expect(entrada.sinInstancia, `${entrada.schema} sin instancia necesita su motivo`).toBeTruthy();
      expect(validateContract(entrada.schema).sinInstancia).toBe(true);
    }

    expect(
      sinInstancia,
      `esquemas declarados sin contrato: ${sinInstancia.map((e) => e.schema).join(', ')}`,
    ).toEqual([]);
  });

  it('el esquema que sirve a tres contratos los mira a los tres', () => {
    // El unico caso multi-esquema, y el unico cuyo vinculo NO esta en los
    // datos: los tres contratos no declaran `$schema`. Si la lista de ese
    // esquema perdiera uno, los otros dos seguirian en verde y nadie lo veria.
    const matriz = CONTRATOS_CON_ESQUEMA.find((e) => e.schema === 'modulation_matrix.schema.json');

    expect(matriz, 'el esquema de la matriz tiene que estar en el inventario').toBeTruthy();
    expect(matriz.contracts).toHaveLength(3);

    const r = validateContract('modulation_matrix.schema.json');
    expect(r.contracts).toEqual(matriz.contracts);
    expect(r.errors, r.errors.join(' | ')).toEqual([]);
  });

  it('un esquema que NO esta en el inventario falla, en vez de no mirarse', () => {
    // Y este es el caso que hace que el inventario sea inventario y no una nota.
    // Si a alguien se le olvida añadir un esquema, esto no dice "nada que
    // validar": dice que hay un esquema que nadie mira.
    const r = validateContract('hardware_profile.schema.json.schema.json');

    expect(r.ok).toBe(false);
    expect(r.errors.join(' | ')).toMatch(/inventario/);
  });
});

//==============================================================================
describe('el esquema entero se esta comprobando de verdad', () => {
  // `additionalProperties: false` sin ejecutar es un esquema que parece cerrar
  // y no cierra. Y hay una segunda mitad: que cada objeto ANIDADO cierre, que
  // es donde se cuelan las cosas y donde la raiz no protege a nadie —un
  // `additionalProperties: false` arriba no protege a lo que hay tres niveles
  // abajo—.
  // Solo donde hay instancia, por el mismo motivo que el cierre de mas abajo: en
  // un esquema sin contrato nadie puede decir que la palabra este mal puesta, y
  // el hueco se cuenta en el test del final.
  for (const par of schemaPairs().filter((p) => p.contracts.length > 0)) {
    it(`${par.schema}: ninguna palabra clave que el validador no mire`, () => {
      expect(unsupportedKeywords(readSchema(par.schema))).toEqual([]);
    });
  }

  // ── TODOS, INCLUIDO EL QUE NO TIENE INSTANCIA ──
  //
  // Antes el cierre solo se exigia donde hay un contrato que lo revise, y el
  // esquema huerfano se quedaba con sus ocho objetos abiertos FIJADOS en un
  // recuento. Era una decision con su razon —sin instancia nadie puede decir si
  // cerrar ROMPE algo— pero dejaba el hueco permanente a cambio de un test
  // que no podia ponerse verde nunca.
  //
  // La salida no fue aflojar el requisito, fue fazerlo posible: `$ref` se
  // resuelve (abajo) y los nueve objetos se han cerrado. Ahora el cierre se
  // exige a los cinco, y un esquema nuevo que se cuele aqui sale en rojo.
  for (const par of schemaPairs()) {
    it(`${par.schema}: todo objeto con properties cierra con additionalProperties:false`, () => {
      const abiertos = objetosSinCerrar(readSchema(par.schema), '(raíz)');

      expect(abiertos, `objetos que aceptan campos sin declarar: ${abiertos.join(', ')}`).toEqual([]);
    });
  }

  // ── EL QUE SE DECLARIA SIN CONTRATO, Y AL RESULTAR QUE TENIA VEINTISIETE ──
  //
  // Esta es la parte de la historia que no cabe en un comentario al lado del
  // inventario, asi que va aqui donde se puede ver que paso.
  //
  // `hardware_profile.schema.json` estuvo meses en este repositorio declarado
  // en el inventario con `contracts: []`, con el motivo "ningun contrato usa
  // este esquema todavia", y sus ocho objetos abiertos FIJADOS en un recuento de
  // test. La razon era buena: sin instancia nadie puede decir si cerrar rompe
  // algo o solo lo endurece, y un rojo permanente es un rojo que nadie lee.
  //
  // El motivo estaba equivocado. Habia veintisiete contratos, en este mismo
  // directorio, y `HardwareContractRegistry` de ABDSharedCode los lee de aqui
  // en produccion. Lo que no habia era la DECLARACION.
  //
  // Y como se paso por alto dice mas que el fallo: se busco el nombre del
  // esquema por todo el monorepo y salio una vez, en una frase de documentacion
  // que no lo nombra. Los contratos no llevan ninguna clave que diga a que
  // esquema pertenecen —tampoco `$schema`—, asi que el vinculo no se encuentra
  // buscando: se declara. De ahi que esto sea una tabla y no un emparejamiento.
  it('el esquema de perfiles esta atado a sus veintiseis contratos', () => {
    const perfiles = schemaPairs().find((p) => p.schema === 'hardware_profile.schema.json');

    expect(perfiles, 'el esquema de perfiles tiene que estar en el inventario').toBeTruthy();
    expect(
      perfiles.contracts.length,
      `contratos atados a ${perfiles.schema}: ${perfiles.contracts.length}`,
    ).toBe(26);

    // Y que sean los de verdad, no una lista que se parece. El criterio es el
    // que se uso al atarlos: tener el bloque `midiIdentification` que es lo que
    // lee el registro. Si aparece un perfil nuevo, este test se pone rojo y hay
    // que decidir si entra.
    for (const nombre of perfiles.contracts) {
      const contrato = readContract(nombre);
      expect(
        contrato.midiIdentification ?? contrato.midiIdentity,
        `${nombre} esta atado al esquema de perfiles pero no tiene identidad MIDI`,
      ).toBeTruthy();
    }
  });

  it('y los veintiseis validan, sin un solo error', () => {
    const r = validateContract('hardware_profile.schema.json');

    expect(r.sinInstancia, 'ya no es un esquema sin contrato').toBe(false);
    expect(r.contracts).toHaveLength(26);
    expect(r.errors, r.errors.join(' | ')).toEqual([]);
  });

  it('la puerta muerde en un perfil de verdad, no solo en uno de prueba', () => {
    // Los tests de arriba sabotean contratos de mentira de los cinco esquemas.
    // Este coge uno de los veintiseis y le cuela un campo, que es lo que
    // pasaria el dia que alguien anada algo sin mirar el esquema.
    const contrato = readContract('behringer_deepmind12.json');
    const saboteado = conCampoInesperado(contrato, 'campoQueNoExiste');

    const errores = validate(saboteado, readSchema('hardware_profile.schema.json'), '', 'hardware_profile.schema.json -> behringer_deepmind12.json');

    expect(errores.join(' | ')).toMatch(/campoQueNoExiste/);
    expect(errores.join(' | ')).toContain('hardware_profile.schema.json');
  });

  it('y los controles usan los nombres que los contratos usan', () => {
    // Este es el rojo que salio al atarlos, y lo que obliga a que el test exista
    // es la ASIMETRIA: el esquema decia `min`/`max`/`default` y `cc`, y los
    // contratos de verdad dicen `minVal`/`maxVal`/`defaultVal` y `ccNumber`.
    // 48, 48, 48 y 36 usos. Los dos nombres conviven ahora, declarados los dos,
    // porque de los veintiseis atados aqui nueve usan los segundos y seis usan
    // los primeros: once no tienen ningun mando con rango. Los seis con los
    // otros nombres son `behringer_modular_140` y los cinco que usan `cc`: los
    // cuatro perfiles del AIRA —bitrazer, demora, scooper, torcido— y
    // `generic_midi_synth`. Los cuatro del AIRA siguen por aqui, que no tienen
    // nada que ver con el catalogo en cuarentena.
    //
    // Lo que este test protege es que no se vuelva a perder el segundo grupo: si
    // alguien quita `minVal` del esquema, este se pone rojo en vez de dejar que
    // los contratos con mando se cuevan en silencio otra vez.
    const controles = readContract('behringer_deepmind12.json').functions[0].controls[0];
    const declarados = readSchema('hardware_profile.schema.json')
      .properties.functions.items.properties.controls.items.properties;

    for (const campo of ['minVal', 'maxVal', 'defaultVal', 'ccNumber']) {
      expect(declarados[campo], `${campo} lo usan ${controles[campo]} y el esquema no lo declara`).toBeTruthy();
    }
  });

  it('la puerta muerde TAMBIEN debajo de un $ref', () => {
    // Esta es la prueba de que resolver el `$ref` no fue un detalle. Antes de
    // hacerlo, un nodo con `$ref` no era objeto ni array ni hoja, asi que caia
    // de largo por las tres ramas y devolvia CERO errores sin mirar nada. Los
    // nueve objetos cerrados de ese esquema estarian cerrados de mentira.
    //
    // `lifecycle.preSessionSetup` es un `$ref` a `#/$defs/setupActionArray`, y
    // el campo se cuela en el elemento de ese array: tres niveles por debajo de
    // la raiz y uno mas por debajo de la referencia.
    const contrato = readContract('behringer_deepmind12.json');
    const saboteado = structuredClone(contrato);
    saboteado.lifecycle.preSessionSetup[0].campoQueNoExiste = 'un valor';

    const errores = validate(saboteado, readSchema('hardware_profile.schema.json'), '', 'hardware_profile.schema.json -> behringer_deepmind12.json')
      .join(' | ');

    expect(errores, 'un campo sin declarar debajo de un $ref tiene que salir en rojo').toMatch(/campoQueNoExiste/);
    expect(errores).toContain('hardware_profile.schema.json');
  });

  it('la `measurementRecipe` usa el MISMO $ref que `lifecycle`, y no una copia', () => {
    // `measurementRecipe.setupActions` y `lifecycle.*` son el mismo tipo de
    // dato: una lista de pasos para dejar el instrumento en un estado. El
    // esquema ya tenia la forma en `$defs/setupActionArray`, y declararla otra
    // vez dentro de `measurementRecipe` seria una segunda fuente de verdad para
    // lo mismo —que es exactamente como se rompen las que luego nadie sabe si
    // estan al dia—.
    //
    // Asi que se comprueba que el segundo sitio es un `$ref` de verdad, no una
    // copia de la forma. Y que la puerta llegue igual por los dos caminos.
    const esquema = readSchema('hardware_profile.schema.json');
    const setupActions = esquema.properties.functions.items.properties.measurementRecipe.properties.setupActions;

    expect(setupActions.$ref, 'setupActions tiene que ser un $ref, no una copia').toBe('#/$defs/setupActionArray');

    // Y que un campo colado en la receta sale en rojo, que es la mitad
    // contratable: un `$ref` resuelto que no cierra no vigila nada.
    const contrato = readContract('behringer_deepmind12.json');
    const saboteado = structuredClone(contrato);
    const funcion = saboteado.functions.find((f) => f.measurementRecipe);
    funcion.measurementRecipe.setupActions[0].campoQueNoExiste = 'un valor';

    const errores = validate(saboteado, esquema, '', 'behringer_deepmind12.json').join(' | ');
    expect(errores).toMatch(/campoQueNoExiste/);
  });

  it('los tres sitios de `lifecycle` se comprueban todos', () => {
    // El esquema tiene TRES propiedades que apuntan al mismo `$defs`. Si el
    // validador solo resolviera la primera, las otras dos quedarian sin mirar
    // y el test de arriba pasaria con una cobertura de un tercio de la que
    // parece. Se comprueba una por una, con el mismo campo colado.
    const esquema = readSchema('hardware_profile.schema.json');
    const sitios = ['preCalibrationSetup', 'preSessionSetup', 'postSessionTeardown'];
    const cerrables = Object.keys(esquema.properties.lifecycle.properties);

    expect(cerrables, 'los tres sitios del $ref tienen que seguir declarados').toEqual(sitios);

    for (const sitio of sitios) {
      const perfil = {
        id: 'perfil_de_prueba',
        displayName: 'Perfil de prueba',
        lifecycle: { [sitio]: [{ description: 'hacer algo', campoQueNoExiste: 'un valor' }] },
      };

      const errores = validate(perfil, esquema, '', 'hardware_profile.schema.json').join(' | ');
      expect(errores, `${sitio} se comprueba`).toMatch(/campoQueNoExiste/);
    }
  });

  it('un $ref que no apunta a nada es un error, no un silencio', () => {
    // Un `$ref` roto deja su rama sin comprobar, que es exactamente lo que este
    // fichero lleva tiempo cazando en su otra forma. Se comprueba con un
    // esquema de mentira porque el del disco esta bien: si alguien lo rompe,
    // el rojo sale aqui tambien.
    const esquemaRoto = {
      type: 'object',
      properties: { hijo: { $ref: '#/$defs/noExiste' } },
    };

    const errores = validate({ hijo: { campo: 1 } }, esquemaRoto, '', 'esquemaDePrueba').join(' | ');

    expect(errores).toMatch(/\$ref/);
    expect(errores).toMatch(/no apunta a nada/);
    expect(unsupportedKeywords(esquemaRoto), 'y tambien lo dice el que recorre el esquema entero').toHaveLength(1);
  });

  it('un $defs que nadie recorre no se cuenta como comprobado', () => {
    // Y el otro lado: declarar `$defs` como palabra soportada sin BAJAR por el
    // habria tapado el problema sin mirarlo. Este test exige que lo que hay
    // dentro se examine de verdad, y que un objeto abierto ahi salga en el
    // recuento aunque viva escondido.
    const conDefAbierto = {
      type: 'object',
      properties: {},
      $defs: { cosa: { type: 'object', properties: { a: { type: 'string' } } } },
    };

    expect(unsupportedKeywords(conDefAbierto), 'una palabra sin mirar dentro de $defs').toEqual([]);
    expect(objetosSinCerrar(conDefAbierto, '(raíz)')).toContain('(raíz).$defs.cosa');
  });

});

//==============================================================================

//==============================================================================
// CUARENTENA_ROLAND_AIRA.
//
// Este bloque no prueba una regla: MIRA. Y lo que mira es el cruce entre dos
// ficheros que los dos dicen lo mismo —31 modulos del AIRA Modular— y no son
// los mismos 31. La regla que sale de ahi ya esta escrita en `CUARENTENAS`, en
// el helper; aqui se comprueba que el motivo de ahi sigue siendo cierto.
//
// Y POR QUE MEDIR Y NO FIJAR UNA LISTA DE 31 NOMBRES.
//
// Porque esa lista se quedaria verde mientras el fichero cambiase, que es
// justo cuando dejaria de servir: pasaria a ser una segunda fuente de verdad
// por la que nadie mira. Leyendo los dos ficheros, el motivo no puede quedarse
// viejo sin que este test se ponga rojo.
//
// El cruce es por `id`, que es el unico campo que comparten los dos lados. El
// motor (`submodules.json`) no lleva `typeIdHex`, asi que no hay campo mejor.
describe('CUARENTENA_ROLAND_AIRA: dos catalogos que los dos dicen ser 31', () => {
  const LIBRERIA = 'roland_aira_submodules.json';
  const HARDWARE = 'roland_aira_patch_spec.json';

  /** Los 31 bloques del fichero de libreria, por `id`. */
  function bloquesDeLibreria() {
    return readContract(LIBRERIA).functions.map((f) => f.id);
  }

  /**
   * Los 31 modulos del patch_spec, por `id`.
   *
   * Y se quita el `empty`: el patch_spec declara 32 entradas en `submodules` y
   * la primera es `typeIdHex: "00"`, que es el slot vacio, no un modulo.
   * Contar 32 contra 31 daria un desajuste de uno que no existe, y un numero
   * que miente es peor que no dar ninguno.
   */
  function modulosDeHardware() {
    return readContract(HARDWARE).submodules.filter((s) => s.id !== 'empty').map((s) => s.id);
  }

  it('los dos lados tienen 31, y ese 31 no es el mismo 31', () => {
    // El 31 y el 31 es lo que hace que el despiste sea facil: dos listas del
    // mismo tamano se parecen mas de lo que son.
    expect(bloquesDeLibreria(), 'bloques en el fichero de libreria').toHaveLength(31);
    expect(modulosDeHardware(), 'modulos en el patch_spec').toHaveLength(31);
  });

  it('solo 7 coinciden por nombre, y son estos siete', () => {
    const hardware = new Set(modulosDeHardware());
    const comun = bloquesDeLibreria().filter((id) => hardware.has(id));

    // Los siete, escritos. No por gusto, sino porque si el cruce bajara a seis
    // este test tiene que decir CUAL se ha perdido, y un `toHaveLength(7)` a
    // secas solo diria "siete, o no siete".
    expect(comun.sort(), `de 31 bloques, casan ${comun.length} con el patch_spec`)
      .toEqual([
        'compressor',
        'filter_18db',
        'filter_24db',
        'formant_filter',
        'sample_and_hold',
        'short_delay',
        'tube_clip',
      ]);
  });

  it('y los 24 de cada lado no coinciden', () => {
    const hardware = new Set(modulosDeHardware());
    const libreria = new Set(bloquesDeLibreria());
    const soloLibreria = [...libreria].filter((id) => !hardware.has(id));
    const soloHardware = [...hardware].filter((id) => !libreria.has(id));

    expect(soloLibreria, `bloques que el AIRA no tiene: ${soloLibreria.join(', ')}`).toHaveLength(24);
    expect(soloHardware, `modulos del AIRA que faltan aqui: ${soloHardware.join(', ')}`).toHaveLength(24);
  });

  it('y la direccion del desajuste dice que son dos maquinas distintas', () => {
    // Esto es lo que convierte un recuento en un diagnostico. De 24 y 24 podria
    // ser un cambio de nombres y ya; lo que dice que no es que la libreria
    // tenga cosas que el AIRA no tiene, y al reves.
    const ids31 = new Set(bloquesDeLibreria());
    const hardware = new Set(modulosDeHardware());
    const soloLibreria = new Set([...ids31].filter((id) => !hardware.has(id)));
    const soloHardware = modulosDeHardware().filter((id) => !ids31.has(id));

    // Un AIRA Modular no tiene un fuzz de germanio, ni un chorus de ensemble,
    // ni un phaser de cuatro etapas, ni un transpositor de tono.
    for (const fantasma of ['fuzz_germanium', 'chorus_ensemble', 'phaser_4stage', 'pitch_transposer']) {
      expect(soloLibreria.has(fantasma), `${fantasma} deberia seguir sin existir en el AIRA`).toBe(true);
    }

    // Y si tiene osciladores SAW y SQR, un divisor de gates, logica, y MIDI
    // NOTE TO CV/GATE.
    for (const ausente of ['saw_oscillator', 'sqr_oscillator', 'gate_divider', 'logic_operation', 'midi_note_to_cv_gate']) {
      expect(soloHardware, `el AIRA deberia seguir teniendo ${ausente}`).toContain(ausente);
    }
  });

  // ESTE ES EL QUE FALTABA, Y EL QUE HACE QUE LOS OTROS SIRVAN.
  //
  // Los tests de arriba miden el cruce en vivo: comparan los 31 con los 31 y
  // luego el `toEqual` de los siete nombres. Eso mide. Pero el `statusReason` del
  // contrato es TEXTO LIBRE, y nadie lo compara con la medida: el texto decia
  // "solo 7 casan" mientras el cruce de al lado es el que sea. Si manana el cruce
  // pasa a ocho, el `toEqual` se pone rojo —bien— y el motivo sigue diciendo
  // siete, y el registro de C++ sigue enseñando "solo 7" a un usuario que ya
  // puede ser verdad. Un numero que se queda viejo en el sitio donde se LEE es
  // peor que no dar el numero.
  //
  // Este test ata las tres cosas a la misma fuente: la medida, el texto del
  // contrato y el motivo de la lista. Se derivan de `utils/cruceAira.js`, que
  // calcula el cruce una vez, asi que no pueden discrepar entre si; lo que se
  // comprueba aqui es que el FICHERO lleva ese texto y no otro.
  it('el motivo del fichero es el que produce la medida, no texto parecido', () => {
    const medida = medirCruceAira();
    const esperado = motivoDeLaCuarentena(medida);

    // La cuenta, otra vez, pero esta vez se comprueba que el numero que la
    // medida ha producido es el que esta escrito. Si el cruce cambia y el
    // contrato no se actualiza, este es el rojo que lo dice —y dice cual es el
    // numero nuevo, que es lo que hay que escribir.
    const escrito = readContract(LIBRERIA).statusReason;

    expect(escrito, `el cruce da ${medida.comunes.length} de ${medida.bloques}, y el `
      + `motivo del contrato dice otra cosa. El texto que toca es:`)
      .toBe(esperado);

    // Y la misma cuenta dentro del texto, por si alguien reescribe el motivo
    // entero. Un motivo puede ser largo y util; lo que no puede es llevar un
    // numero que la medida no sostiene.
    expect(escrito, 'el motivo debe decir cuantos casan')
      .toContain(`solo ${medida.comunes.length} casan`);

    expect(escrito, 'el motivo debe decir cuantos no coinciden de cada lado')
      .toContain(`los otros ${medida.desajuste} de cada lado`);

    // Y que el motivo apunte a donde se mide, no a donde se comprueba. Es la
    // diferencia entre que el proximo que lo mire sepa repetirlo y tenga que
    // buscarlo.
    expect(escrito, 'el motivo debe decir donde se mide la cuenta')
      .toContain('medir-cruce-aira.mjs');
  });

  it('y los tres sitios dicen la misma cuenta: medida, contrato y lista', () => {
    // El test de aqui arriba mira el contrato; el de mas abajo, en el bloque de
    // cuarentena, mira que el motivo de la lista sea el del fichero. Este es el
    // que cierra el triangulo, y el que evita que la lista se quede con el
    // numero viejo mientras el contrato ya dice el nuevo.
    const medida = medirCruceAira();
    const deLaLista = motivoDeCuarentena(LIBRERIA);

    expect(deLaLista, `${LIBRERIA} esta en la lista de cuarentena pero su motivo es null`)
      .toBe(motivoDeLaCuarentena(medida));

    expect(deLaLista).toBe(readContract(LIBRERIA).statusReason);
  });

  it('y el fichero en cuarentena se identifica COMO el AIRA igual', () => {
    // Y aqui esta el motivo de que sea peligroso y no solo estar feo: el
    // fichero se presenta como el AIRA Modular —`deviceType: AUTOMATED_SYSEX`,
    // mismo `midiIdentification`, nombre con "AIRA Modular", imagen del modelo—
    // y su contenido es otro catalogo. Quien lo lea por la cabecera, una
    // calibracion o un generador de programas, cree que son los modulos de la
    // maquina. Si solo estuviera feo, no haria falta cuarentena.
    const contrato = readContract(LIBRERIA);

    expect(contrato.deviceType, 'se identifica como una maquina real').toBe('AUTOMATED_SYSEX');
    expect(contrato.brand).toBe('Roland');
    expect(contrato.midiIdentification, 'y con la identidad MIDI del AIRA').toBeTruthy();
    expect(contrato.displayName).toMatch(/AIRA Modular/);
  });

  it('y la cuarentena esta escrita con SU motivo, y el motivo es este', () => {
    const entrada = contratosEnCuarentena().find((c) => c.contrato === LIBRERIA);

    // Si se quita la entrada, esto se pone rojo. No hay forma de levantar la
    // cuarentena sin decidir, porque borrar la entrada es justo lo que vigila
    // este test.
    expect(entrada, `${LIBRERIA} tiene que seguir en cuarentena`).toBeTruthy();
    expect(entrada.motivo).toMatch(/31/);
    expect(entrada.motivo).toMatch(/\b7\b/);
    expect(entrada.motivo).toMatch(/24/);
  });

  it('y el fichero en cuarentena NO lo da nadie por bueno', () => {
    // Esta es la mitad que importa. Que este en la lista de cuarentena vale
    // poco si despues se ata a un esquema y sale verde como los demas: eso
    // seria PEOR que no mirar nada, porque daria confianza.
    const atados = CONTRATOS_CON_ESQUEMA
      .filter((e) => e.contracts.includes(LIBRERIA))
      .map((e) => e.schema);

    expect(atados, `${LIBRERIA} no puede estar atado a ningun esquema`).toEqual([]);
    expect(motivoDeCuarentena(LIBRERIA), 'y su motivo tiene que seguir a mano').toBeTruthy();
  });

  it('mientras que los cuatro perfiles del AIRA si estan atados y validan limpios', () => {
    // La parte que no hay que romper al levantar la cuarentena: los cuatro
    // ficheros de por dispositivo. Son otra cosa —el perfil de cada maquina,
    // con su Model ID— y estan atados al esquema de perfiles, con el mismo
    // `min`/`max`/`default` que usan los demas.
    const CUATRO = ['roland_aira_bitrazer.json', 'roland_aira_torcido.json',
      'roland_aira_demora.json', 'roland_aira_scooper.json'];
    const atados = CONTRATOS_CON_ESQUEMA.flatMap((e) => e.contracts);

    for (const nombre of CUATRO) {
      expect(atados, `${nombre} tiene que seguir atado al esquema de perfiles`).toContain(nombre);
      expect(motivoDeCuarentena(nombre), `${nombre} no esta en cuarentena`).toBeNull();
    }

    const r = validateContract('hardware_profile.schema.json');
    expect(r.errors.filter((e) => CUATRO.some((n) => e.includes(n))), 'los cuatro AIRA validan limpios').toEqual([]);
  });

  it('y los cuatro no tienen NINGUN modulo en comun con el catalogo de 31', () => {
    // Ojo con esto, porque es tentador leerlo al reves. No es que sus funciones
    // esten mal: es que describen otra cosa. Cada uno tiene una funcion y su
    // `id` no aparece en la lista de 31 —el de bitrazer es `bitcrush_main`—.
    // Cuando a alguien le apetezca "arreglar" esto metiendo un id en la lista,
    // este test esta para que se entienda primero que el problema es de
    // CATALOGO y no de nombres.
    const ids31 = new Set(bloquesDeLibreria());
    const CUATRO = ['roland_aira_bitrazer.json', 'roland_aira_torcido.json',
      'roland_aira_demora.json', 'roland_aira_scooper.json'];

    for (const nombre of CUATRO) {
      const ids = readContract(nombre).functions.map((f) => f.id);
      expect(ids, `${nombre} deberia traer alguna funcion`).not.toEqual([]);
      expect(ids.filter((id) => ids31.has(id)), `${nombre} no comparte id con el catalogo de 31`).toEqual([]);
    }
  });
});

//==============================================================================
// LOS CINCO SITIOS QUE DICEN COMO ES EL AIRA MODULAR.
//
// Este bloque no mira el esquema: mira que cinco ficheros del monorepo, que
// declaran cosas del MISMO aparato, no se contradigan entre si. Un esquema
// puede estar perfecto y aun asi los datos ser mentira: el esquema dice de
// que tipo es cada campo, no que el valor sea el bueno.
//
// Y donde se contradician, esto no vale como aviso: el arreglo ya esta hecho y
// lo que queda es la red, para que el dia que alguien cambie un Model ID
// volviendo a hacerlo bien no pueda cambiar solo uno de los cinco.
describe('el AIRA Modular: los Model ID no se contradicen', () => {
  const CUATRO = ['bitrazer', 'torcido', 'demora', 'scooper'];

  /** El Model ID que dice cada uno de los cuatro contratos de por dispositivo. */
  function idsDeLosContratos() {
    return CUATRO.map((m) => ({
      maquina: m,
      id: readContract(`roland_aira_${m}.json`).midiIdentification.modelIdHex,
    }));
  }

  it('los cuatro contratos dan cuatro Model ID distintos', () => {
    const ids = idsDeLosContratos().map((x) => x.id);

    // Lo mas basico y lo que mas caro seria romper: si dos maquinas comparten
    // Model ID, un SysEx no sabe a cual de las dos va.
    expect(new Set(ids).size, `Model ID repetidos: ${ids.join(', ')}`).toBe(4);
  });

  it('y la tabla `devices` del patch_spec dice lo MISMO que los cuatro contratos', () => {
    // ESTE TEST EN ROJO ENCONTRÓ UN ERROR DE DATOS, y no un problema de estilo.
    //
    // La tabla decia torcido = 16 y demora = 17. Los cuatro contratos de por
    // dispositivo, y la nota `_note` de al lado —que cita el README de la
    // fuente—, dicen lo contrario: demora = 16, torcido = 17. Dos fuentes
    // contra una, y la nota es literalmente la cita.
    //
    // Por que importa mas de lo que parece: el Model ID es el byte que va en el
    // SysEx. Con la tabla cambiada, un programa de patches del AIRA identifica
    // un Demora como Torcido, escribe en el, y el programa no se entera. Y
    // `HardwareContractRegistry` lee los contratos de por dispositivo, que son
    // los correctos, asi que el detector de MIDI y el editor de patches
    // discrepaban sin que nada los enfrentara.
    //
    // El arreglo esta hecho. Lo que queda es que no se descoloquen solos.
    const devices = readContract('roland_aira_patch_spec.json').devices;

    for (const { maquina, id } of idsDeLosContratos()) {
      expect(devices[maquina].modelIdHex,
        `${maquina}: el patch_spec dice ${devices[maquina].modelIdHex} y su contrato dice ${id}`)
        .toBe(id);
    }
  });

  it('y son 15, 16, 17 y 18, en ese orden, como dice la nota de la fuente', () => {
    // La nota `_note` cita el README de mugenkidou: "15H-18H = BITRAZER, DEMORA,
    // TORCIDO, SCOOPER". Se comprueba contra ella y no contra una lista escrita
    // aqui, para que la lista siga siendo la fuente y no este test.
    const patch = readContract('roland_aira_patch_spec.json');
    const ids = idsDeLosContratos();
    const porId = ids.slice().sort((a, b) => Number.parseInt(a.id, 16) - Number.parseInt(b.id, 16));

    expect(porId.map((x) => `${x.maquina.toUpperCase()}=${x.id}`))
      .toEqual(['BITRAZER=15', 'DEMORA=16', 'TORCIDO=17', 'SCOOPER=18']);

    // Y que la nota los nombre en ese mismo orden, que es lo que cita.
    const citados = ['BITRAZER', 'DEMORA', 'TORCIDO', 'SCOOPER']
      .filter((n) => patch.devices._note.includes(n));
    expect(citados, 'la nota de la fuente tiene que nombrar las cuatro en orden')
      .toEqual(porId.map((x) => x.maquina.toUpperCase()));
  });
});

//==============================================================================
// `inferred`: lo que NO se ha verificado contra el hardware, marcado en el dato.
describe('el AIRA Modular: lo deducido va marcado como deducido', () => {
  it('los dos modulos deducidos son el 0x0F y el 0x10, y estan marcados', () => {
    // El patch_spec declara en `notes[2]` que los Type ID 0x0F (MIDI CLOCK TO
    // GATE) y 0x10 (SHORT DELAY) estan INFERIDOS: la tabla oficial se salta el
    // 15 y el 16. Eso es exactamente lo que un `inferred: true` en el dato
    // significa, y es la unica forma de que quien programe el AIRA lo sepa sin
    // leer las notas.
    const submodules = readContract('roland_aira_patch_spec.json').submodules;
    const deducidos = submodules.filter((s) => s.inferred === true);

    expect(deducidos.map((s) => `${s.typeIdHex} ${s.id}`).sort())
      .toEqual(['0F midi_clock_to_gate', '10 short_delay']);
  });

  it('y la nota que lo explica menciona los dos', () => {
    const patch = readContract('roland_aira_patch_spec.json');
    const submodules = patch.submodules.filter((s) => s.inferred === true);

    for (const s of submodules)
      expect(patch.notes.join(' '), `notes[] deberia hablar de 0x${s.typeIdHex}`).toContain(`0x${s.typeIdHex}`);
  });

  it('y el resto NO lo lleva, porque `inferred: false` no esta puesto en ningun sitio', () => {
    // Lo contrario de la trampa de "marcarlo todo": si los 33 llevaran la
    // marca, la marca no diria nada. Se comprueba que la marca es selectiva.
    const submodules = readContract('roland_aira_patch_spec.json').submodules;
    const marcados = submodules.filter((s) => 'inferred' in s);

    expect(marcados).toHaveLength(2);
    expect(marcados.every((s) => s.inferred === true), 'los marcados son `inferred: true`, no `false`').toBe(true);
  });
});

//==============================================================================
// UN SOLO NOMBRE PARA EL RANGO DE UN MANDO.
//
// Antes de esto habia dos vivos: `min`/`max`/`default` y
// `minVal`/`maxVal`/`defaultVal`, y el esquema declaraba los dos porque cada
// grupo de contratos usaba uno. Decidido unificar al segundo. Este bloque es
// la parte que hace que la decision no se deshaga sola.
describe('un solo nombre para el rango de un mando', () => {
  const VIEJOS = ['min', 'max', 'default'];

  it('el esquema ya no declara el nombre viejo', () => {
    const declarados = readSchema('hardware_profile.schema.json')
      .properties.functions.items.properties.controls.items.properties;

    for (const viejo of VIEJOS) {
      expect(declarados[viejo], `el esquema todavia declara "${viejo}"`).toBeUndefined();
      expect(declarados[`${viejo}Val`], `el esquema deberia declarar "${viejo}Val"`).toBeTruthy();
    }
  });

  it('y ningun contrato del inventario lo usa ya', () => {
    // Si uno se colara, no saldria en rojo: `additionalProperties: false` solo
    // vigila lo que el esquema declara, y el nombre viejo ya no esta
    // declarado... lo vigila todavia, si. Por eso esto parece redundante: no lo
    // es. El esquema lo delata con un mensaje que dice "esta en el sitio
    // equivocado", que es justo el mensaje que Provoca que se mire el
    // fichero equivocado. Este dice el nombre viejo, y dice quien.
    for (const par of schemaPairs()) {
      for (const nombre of par.contracts) {
        const contrato = readContract(nombre);
        for (const funcion of contrato.functions ?? []) {
          for (const control of funcion.controls ?? []) {
            for (const viejo of VIEJOS) {
              expect(control[viejo], `${nombre}: un control usa "${viejo}" y no "${viejo}Val"`)
                .toBeUndefined();
            }
          }
        }
      }
    }
  });

  it('ni el contrato en cuarentena, que no valida pero cuenta igual', () => {
    // Este no lo mira el esquema de nada. Se mira a mano, porque un fichero
    // que nadie valida es justo donde se cuela una cuarta variante.
    const enCuarentena = readContract('roland_aira_submodules.json');

    for (const funcion of enCuarentena.functions) {
      for (const control of funcion.controls ?? []) {
        for (const viejo of VIEJOS)
          expect(control[viejo], `roland_aira_submodules.json usa "${viejo}"`).toBeUndefined();
      }
    }
  });

  it('quedan dos nombres de CC, y eso es OTRO problema, sin resolver', () => {
    // `cc` (cinco contratos: los cuatro del AIRA y el generico) y `ccNumber`
    // (siete). Los dos declarados, los dos vivos. No se unifican aqui porque
    // no estan dentro de lo que se decidio, y porque el numero de MIDI en el
    // AIRA viene en el SysEx (`sysexAddress`) y no es el mismo dato: unificar
    // los dos sin decidir cual es cual seria cambiar lo que significan.
    //
    // Lo que si se deja escrito es el reparto, para que la proxima vez que se
    // toque esto no haya que volver a contarlo desde cero.
    const conCC = [];
    const conCCNumber = [];

    for (const par of schemaPairs()) {
      for (const nombre of par.contracts) {
        for (const funcion of readContract(nombre).functions ?? []) {
          for (const control of funcion.controls ?? []) {
            if ('cc' in control) conCC.push(nombre);
            if ('ccNumber' in control) conCCNumber.push(nombre);
          }
        }
      }
    }

    expect([...new Set(conCC)].sort(), 'los que usan `cc`').toEqual([
      'generic_midi_synth.json',
      'roland_aira_bitrazer.json',
      'roland_aira_demora.json',
      'roland_aira_scooper.json',
      'roland_aira_torcido.json',
    ].sort());
    expect(new Set(conCCNumber).size, 'los que usan `ccNumber`').toBe(7);
  });
});

//==============================================================================
// LA CUARENTENA ESTA EN EL DATO, NO SOLO EN LA LISTA.
//
// `CUARENTENAS` es JS de test, y el registro de C++ del laboratorio no la puede
// leer. Si la marca viviera solo ahi, el cajon de hardware seguiria mostrando el
// contrato como si fuera una maquina real. Por eso el dato lleva su propio
// `status: "quarantined"` y su `statusReason`, y el registro lo respeta.
//
// El precio de tener la verdad en dos sitios —el contrato y la lista— es que
// pueden divergir, asi que este bloque mide las DOS direcciones:
//
//   - un contrato de la lista que no lleva la marca  -> el C++ lo cargaria
//   - un contrato con la marca que no esta en la lista -> el JS no lo vigilaria
//
// Las dos son fallos de la misma clase: dos verdades sobre si un contrato dudoso
// se muestra o no.
describe('la cuarentena del dato y la de la lista son la misma', () => {
  /** Todos los contratos del directorio, con su `status` si lo llevan. */
  function contratosConEstado() {
    return readdirSync(CONTRACTS)
      .filter((n) => n.endsWith('.json') && !n.endsWith('.schema.json'))
      .map((nombre) => ({ nombre, contrato: readContract(nombre) }));
  }

  it('todo contrato de la lista lleva `status: quarantined` en el fichero', () => {
    // En la lista la clave se llama `contrato`, y es el NOMBRE DEL FICHERO: aqui
    // se lee ese nombre, no el objeto. Se distingue a proposito, porque en el
    // inventario de esquemas `schema` es un esquema y `contracts` son contratos,
    // y mezclar los dos niveles es como se confunde una cosa con la otra.
    //
    // Y el "dice `quarantined`" se afirma con la REGLA, no con el literal. La
    // diferencia no es de estilo: si el valor de `POLITICA` cambia manana, este
    // test tiene que seguir diciendo la verdad sobre el dato, y no seguir
    // comprobando que el dato tiene la cadena de texto que se le
    // escribio aqui hace tres meses. Con el literal, cambiar la regla en un
    // sitio pondria este test en rojo sin que nada este mal, y la costumbre de
    // arreglarlo volviendo a cambiar el literal es exactamente como se pierde
    // una regla compartida.
    for (const { contrato: nombre } of contratosEnCuarentena()) {
      const v = veredicto(readContract(nombre));

      expect(v.retenido,
        `${nombre} esta en CUARENTENAS pero el fichero no lleva `
        + `"${POLITICA.campoEstado}": "${POLITICA.valorEstado}", y el registro de C++ `
        + 'no lo va a saltar')
        .toBe(true);
    }
  });

  it('y su motivo es el mismo palabra por palabra', () => {
    // El motivo esta duplicado a proposito, porque cada lado lo necesita: el
    // registro lo muestra en un aviso y el test lo afirma. Un motivo que se
    // puede reescribir en un sitio y no en el otro deja de ser el motivo de
    // nada. Este test no deja que eso ocurra sin que se note.
    for (const { contrato: nombre, motivo } of contratosEnCuarentena()) {
      expect(readContract(nombre).statusReason,
        `${nombre}: el motivo del fichero y el de la lista no son el mismo`)
        .toBe(motivo);
    }
  });

  it('y ningun contrato del directorio lleva la marca sin estar en la lista', () => {
    // La direccion que importa mas. Un contrato marcado en el dato pero ausente
    // de la lista es el peor de los dos fallos: el C++ lo esconderia —bien— y el
    // JS no lo vigilaria —mal—, asi que nadie en este repo podria dizer por que
    // no aparece en el cajon.
    const enLista = new Set(contratosEnCuarentena().map((c) => c.contrato));

    for (const { nombre, contrato } of contratosConEstado()) {
      if (contrato.status === undefined) continue;
      expect(enLista.has(nombre),
        `${nombre} lleva status: "${contrato.status}" pero no esta en CUARENTENAS, asi que el test no lo vigila`).toBe(true);
    }
  });

  it('y el esquema declara los dos campos, para que no sean un extra tolerado', () => {
    // Si el esquema no los declarara, `additionalProperties: false` rechazaria
    // marcar un contrato que este atado a el —y la cuarentena se quedaria sin
    // poder aplicarse justamente en los perfiles que si se validan.
    //
    // Y esta afirmacion pasa por la MISMA comprobacion que hace el preflight, con
    // la misma funcion. No por parecerse un caso a otro: porque son la misma
    // regla y si se separaran volverian a ser dos verdades, que es justo lo que
    // este bloque de test lleva dos commits intentando que no vuelva a pasar.
    const esquema = readSchema('hardware_profile.schema.json');
    const declarados = esquema.properties;

    expect(declarados[POLITICA.campoEstado],
      `el esquema no declara \`${POLITICA.campoEstado}\``).toBeTruthy();
    expect(declarados[POLITICA.campoEstado].enum,
      'y el enum es lo que dice que valores valen').toContain(POLITICA.valorEstado);
    expect(declarados[POLITICA.campoMotivo],
      `el esquema no declara \`${POLITICA.campoMotivo}\``).toBeTruthy();

    // Y la funcion entera, que es la que el preflight corre en cada rama.
    expect(comprobarContraElEsquema(esquema),
      'la regla de JS y el enum del esquema no son lo mismo')
      .toEqual([]);
  });

  it('y marcar uno no rompe la validacion de los otros', () => {
    // El aviso de que anadir campos al contrato rompe la puerta. Con los dos
    // campos declarados, marcar un perfil atado sigue validando; y si alguien
    // anade un tercero sin declararlo, esto se pone rojo.
    const r = validateContract('hardware_profile.schema.json');
    expect(r.errors, r.errors.join(' | ')).toEqual([]);

    // Y el caso concreto: un perfil atado, marcado, sigue validando. No hay
    // ninguno todavia —el unico en cuarentena no esta atado— asi que se
    // construye la situacion con una copia y se pasa por el validador.
    const esquema = readSchema('hardware_profile.schema.json');
    const marcado = conCampoInesperado(readContract('behringer_deepmind12.json'), 'status');
    marcado.status = 'quarantined';
    marcado.statusReason = 'un motivo cualquiera';

    const errores = validate(marcado, esquema, '', 'hardware_profile.schema.json -> behringer_deepmind12.json', esquema);
    expect(errores, `un perfil con status declarado tiene que validar: ${errores.join(' | ')}`).toEqual([]);
  });
});

/** La primera ruta de un objeto anidado con `properties`, o `null`. */
function primerObjetoAnidado(contrato, schema) {
  const propiedades = schema?.properties ?? {};
  for (const [nombre, sub] of Object.entries(propiedades)) {
    if (!Array.isArray(sub.items)) continue;
    if (!sub.items?.properties) continue;

    const lista = contrato[nombre];
    if (Array.isArray(lista) && lista.length > 0) return [nombre, 0];
  }
  return null;
}

/**
 * Las rutas de los objetos que NO declaran `additionalProperties: false`.
 *
 * Baja tambien por `$defs`, y no por adorno: un objeto de datos sigue siendo
 * un objeto de datos alla donde este definido. Sin esta rama, un
 * `setupActionArray[]` sin cerrar no saldria en el recuento, que es
 * exactamente el hueco que un `$defs` esconde.
 */
function objetosSinCerrar(nodo, donde) {
  const abiertos = [];
  if (nodo === null || typeof nodo !== 'object' || Array.isArray(nodo)) return abiertos;

  if (nodo.properties && nodo.additionalProperties !== false)
    abiertos.push(donde);

  for (const [nombre, sub] of Object.entries(nodo.properties ?? {}))
    abiertos.push(...objetosSinCerrar(sub, `${donde}.${nombre}`));

  if (nodo.items) abiertos.push(...objetosSinCerrar(nodo.items, `${donde}[]`));

  for (const [nombre, sub] of Object.entries(nodo.$defs ?? {}))
    abiertos.push(...objetosSinCerrar(sub, `${donde}.$defs.${nombre}`));

  return abiertos;
}
