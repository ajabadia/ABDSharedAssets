/**
 * Un guard sobre `.gitattributes`, para este repo y para toda la suite.
 *
 * QUE HACE FALTA AQUI, Y POR QUE NO ERA LO MISMO QUE EL DE ABDEep.
 *
 * El hermano ABDEep ya tiene este guard. Este es el segundo, y no es una copia
 * a la que le cambian el nombre: tiene una condicion que el de alli no tenia.
 *
 * El `.gitattributes` de este repo es una copia del de ABDSharedCode "con las
 * extensiones propias de este repositorio", y se le quedaron reglas de C++ que
 * aqui no cubren NINGUN fichero: este repo no tiene `.cpp`, ni `.h`, ni
 * `CMakeLists.txt`, ni un solo binario de los que lista. De las 31 reglas, 18 no
 * cubren nada hoy.
 *
 * Dieciocho. Y la conclusion facil seria que el guard del hermano, que exige que
 * toda regla cubra un fichero, esta roto aqui. No lo esta: esas 18 son
 * PREVENTIVAS. Declaran que, SI aparece un `.cpp`, tiene que ser LF, y este repo
 * comparte suite con uno que tiene C++. Borrarlas seria tirar la intention.
 *
 * Asi que el guard separa dos cosas que un "cubre 0" mezcla:
 *
 *   - Una regla por EXTENSION o por FAMILIA (un glob con doble asterisco) que
 *     no cubre nada hoy: es declaracion de futuro. Se avisa, no se falla. Con un limite
 *     ESCRITO, para que un repo que acumula quince rutas muertas lo note.
 *   - Una regla sobre un fichero o ruta CONCRETOS (`CMakeLists.txt`,
 *     `resources/bancos/*.syx`) que no cubre nada: es un error. O la ruta esta
 *     mal escrita, o el fichero se ha movido, o la regla no protege nada.
 *
 * Aqui hay una de las concretas: `CMakeLists.txt text eol=lf`, en un repo sin
 * un solo CMakeLists.txt. Y hay algo PEOR que una regla muerta, que se mide en
 * la ultima seccion.
 *
 * POR QUE NO SE USA `git check-attr` COMO UNICA FUENTE. Es la autoridad y este
 * test lo usa como contrapeso, en `las reglas coinciden con git`. Pero no sabe
 * responder "que ficheros cubre esta regla", que es justo la pregunta de una
 * regla huerfana. Se necesitan las dos.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Toda llamada a git pasa por aqui. No es una comodidad: es lo que evita que
// este guard se ponga rojo por una razon que no es suya. En una maquina donde
// el repositorio es de otro usuario, git se niega a trabajar («dubious
// ownership»), `ls-files` devuelve error, la lista queda vacia, y el primer
// test dice que no ha mirado nada — un fallo de git Leanado como un fallo de
// este guard. La ruta de `safe.directory` se deduce de donde esta el helper,
// no se escribe a mano, para que el test no dependa de donde vive el checkout.
import { GIT, gitSeguro } from './helpers/gitSeguro.js';

import {
  reglasDe, cubreLa, obligaLf, reglasQueFijan, patronARegex,
  cuentaCrlf, esPreventiva, reglasInertes,
  senasDeArtefacto, descubreArtefactos, artefactosSinFijar
} from './gitattributesGuard.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const GITATTRIBUTES = resolve(repoRoot, '.gitattributes');
const HERMANO_MODULO = resolve(repoRoot, '..', 'ABDEep', 'WebUI', 'tests', 'gitattributesGuard.js');

/**
 * Los ficheros que git lleva, que es lo unico que las reglas pueden cubrir.
 *
 * Si `git ls-files` falla, se avisa y la lista queda VACIA a proposito, no se
 * lanza. Con la lista vacia el primer test se pone rojo diciendo que no ha mirado
 * nada. Lanzar el error de git seria peor: el stack apuntaria a `execFileSync` y
 * no a que el problema es que no hay checkout. Y ahora que git va por
 * `gitSeguro`, ese error ya no sale por la excepcion de `safe.directory`: si
 * llega aqui, de verdad es que no hay checkout.
 */
function listaTrackeada () {
  try {
    return gitSeguro(['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    }).split('\n').filter((f) => f !== '');
  } catch (e) {
    console.error('[gitattributesGuard] `git ls-files` fallo en ' + repoRoot + ': ' + e.message);
    return [];
  }
}

/** Si el repositorio tiene al menos un commit, que es lo que hace existir un blob. */
function tieneHistorial () {
  try {
    gitSeguro(['rev-parse', '--verify', 'HEAD'], {
      cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore']
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * El contenido de los ficheros trackeados que se pueden leer como texto.
 *
 * Ni los bancos `.syx` ni los PNG sirven para buscar una cabecera, y leerlos
 * enteros para comprobar que NO la tienen es tirar el tiempo del guard. Se
 * cortan por tamano y se descartan los que tienen bytes NUL, que es como se
 * distingue un binario de un texto sin depender de la extension.
 */
function contenidos (ficheros) {
  const salida = [];

  for (const f of ficheros) {
    try {
      if (statSync(resolve(repoRoot, f)).size > 2 * 1024 * 1024)
        continue;

      const texto = readFileSync(resolve(repoRoot, f), 'utf8');

      if (texto.indexOf('\u0000') !== -1)
        continue;

      salida.push({ ruta: f, contenido: texto });
    } catch (e) {
      // Un fichero que no se puede leer no se puede desproteger: se avisa en
      // consola y se sigue, porque reventar aqui dejaria el resto del guard sin
      // comprobar por un unico banco corrupto.
      console.warn('[gitattributesGuard] no se pudo leer ' + f + ': ' + e.message);
    }
  }

  return salida;
}

const TRACKEADOS = listaTrackeada();
const ga = readFileSync(GITATTRIBUTES, 'utf8');
const REGLAS = reglasDe(ga);

describe('el .gitattributes protege de verdad, y se ve', () => {
  it('el guard tiene ficheros con los que trabajar', () => {
    // La costura de todo lo de abajo. Sin lista, "ninguna regla cubre nada"
    // seria cierto y el guard pasaria sin haber mirado un solo fichero.
    expect(TRACKEADOS.length, 'la lista de ficheros trackeados esta vacia: `git ls-files` no ha '
      + 'funcionado, y sin ella este guard no comprueba nada').toBeGreaterThan(100);
    expect(REGLAS.length).toBeGreaterThan(5);
  });

  it('ninguna regla sobre un fichero CONCRETO queda huerfana', () => {
    // EL CASO QUE ESTA GUARD EXISTE PARA ATRAPAR, y el hermano lo pago caro:
    // `resources/banks/*.syx binary` cubria cero de los ocho bancos, porque estan
    // en un subdirectorio y `*` no cruza `/`. Una proteccion que no protege se
    // lee igual que una que protege.
    const { errores } = reglasInertes(REGLAS, TRACKEADOS);

    expect(
      errores.map((r) => r.cruda),
      'reglas de .gitattributes sobre un fichero o ruta CONCRETOS que no cubren NINGUN '
      + 'fichero trackeado. O la ruta esta mal (`*` NO cruza `/`, hace falta `**`), o el '
      + 'fichero se ha movido, o la regla se ha quedado sin nada que proteger.'
    ).toEqual([]);
  });

  it('las reglas por extension que hoy no cubren nada son pocas y estan justificadas', () => {
    // Este repo DECLARA su futuro con reglas por extension, y eso es correcto: es
    // una copia del .gitattributes del hermano de C++, y aqui no hay C++. Asi que
    // el limite no es cero, es un numero escrito.
    //
    // Y el numero no se deduce: esta medido. Con las 31 reglas actuales, 18 no
    // cubren nada y las 18 son por extension. Asi que 20 deja margen para las
    // que se añadan, y salta si alguien empieza a colar rutas muertas.
    const { preventivas } = reglasInertes(REGLAS, TRACKEADOS);

    expect(preventivas.length,
      'reglas por extension que hoy no cubren nada. En este repo son la norma y esta '
      + 'copia las declara a proposito, pero si la lista crece sin que aparezcan los '
      + 'ficheros, hay reglas muertas:\n  ' + preventivas.map((r) => r.cruda).join('\n  ')
    ).toBeLessThanOrEqual(20);
  });

  it('este repo se fija a si mismo con el .gitattributes', () => {
    // El fichero de reglas tiene que estar cubierto por sus propias reglas. Si
    // no, un checkout en Windows lo trae con CRLF y el parser que lo lee se
    // lleva por delante un patron que no tendria que ver.
    expect(reglasQueFijan('.gitattributes', ga).length).toBeGreaterThan(0);
  });

  it('los contratos, que son lo que ABDSharedAssets exporta, estan fijados', () => {
    // Este repo es la FUENTE UNICA DE LA VERDAD de la suite para los contratos.
    // Un `fx-effects.json` con CRLF hace que el hash que calcula el generador del
    // hermano sea distinto en cada plataforma, y que el `.gen` no pueda ser el
    // mismo fichero en las dos. Es el fallo de una sola plataforma, aqui.
    const contratos = TRACKEADOS.filter((f) => f.startsWith('contracts/') && f.endsWith('.json'));

    expect(contratos.length, 'no hay contratos trackeados: el filtro esta mal')
      .toBeGreaterThan(0);

    const sinFijar = contratos.filter((f) => reglasQueFijan(f, ga).length === 0);

    expect(sinFijar, 'contratos sin eol=lf').toEqual([]);
  });

  it('y ningun contrato tiene CRLF en el BLOB, que es donde se decide', () => {
    // AQI ESTA LA MEDIDA QUE CAMBIO EL ENFOQUE.
    //
    // El disco de este checkout tiene 55 ficheros de texto con CRLF, y `git
    // status` los da por LIMPIOS. No es un fallo: el blob esta en LF, y el disco
    // tiene CRLF porque este checkout se materializo antes de que existiera la
    // regla, o con un editor de Windows. Git compara NORMALIZADO, asi que no ve
    // diferencia.
    //
    // Por eso este test mira el BLOB y no el disco. El blob es la fuente de
    // verdad y es el mismo en todas las máquinas; el disco es el estado local de
    // quien lo ha comprobado. Una defensa que depende del disco se pone roja sin
    // que haya pasado nada, y la gente la apaga.
    const contratos = TRACKEADOS.filter((f) => f.startsWith('contracts/') && f.endsWith('.json'));

    // Sin historial no hay blob que mirar: `git show HEAD:fichero` falla y el
    // error que sale no dice que lo que falta es un commit. Pasa en un `git init`
    // recien hecho, que es justo lo que hace uno al montar un laboratorio.
    expect(
      tieneHistorial(),
      'este repositorio no tiene commits, y este test mira el BLOB, que solo existe '
      + 'en un commit. Sin historial no hay nada que comprobar.'
    ).toBe(true);

    const conCrlf = [];

    for (const f of contratos) {
      const blob = gitSeguro(['show', 'HEAD:' + f], {
        cwd: repoRoot, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024
      });
      const c = blob.toString('latin1').match(/\r\n/g);

      if (c !== null) { conCrlf.push(f + ' -> ' + c.length + ' CRLF'); }
    }

    expect(conCrlf, 'contratos con CRLF en el blob:\n  ' + conCrlf.join('\n  ')).toEqual([]);
  });

  describe('las reglas coinciden con git, que es la autoridad', () => {
    // `git check-attr` es quien manda. Este guard implementa la especificacion
    // por su cuenta, y una implementacion propia se equivoca. Estos tests toman
    // un subconjunto de ficheros y le preguntan a git de verdad, para que si el
    // parser y git dejan de coincidir, se note aqui y no en un `.gen` de Windows.
    const MUESTRA = [
      '.gitignore', '.gitattributes', 'README.md', 'package.json',
      'scripts/ci-local.mjs', 'contracts/fx-effects.json',
      'docs/fuentes-sin-consumidor.md', 'components/ADR-Generator.js'
    ].filter((f) => existsSync(resolve(repoRoot, f)));

    it('hay muestra para comparar', () => {
      expect(MUESTRA.length).toBeGreaterThan(4);
    });

    it('git y el parser coinciden en que cada fichero lleva eol=lf', () => {
      const discrepancias = [];

      for (const f of MUESTRA) {
        const deGit = gitSeguro(['check-attr', 'eol', '--', f], {
          cwd: repoRoot, encoding: 'utf8'
        }).trim();
        const gitDice = deGit.endsWith('lf');
        const nosotrosDecimos = reglasQueFijan(f, ga).length > 0;

        if (gitDice !== nosotrosDecimos) {
          discrepancias.push(f + ': git dice "' + deGit + '", el parser dice ' + nosotrosDecimos);
        }
      }

      expect(discrepancias, 'el parser y `git check-attr` no coinciden:\n  ' + discrepancias.join('\n  '))
        .toEqual([]);
    });
  });

  describe('y el parser se equivoca en todos los sentidos que importan', () => {
    it('`*` NO cruza el `/`, el fallo que hizo huerfana la regla de los bancos', () => {
      expect(cubreLa(reglasDe('resources/bancos/*.syx binary')[0],
        ['resources/bancos/FABRICANTE/A.syx'])).toEqual([]);
      expect(cubreLa(reglasDe('resources/bancos/**/*.syx binary')[0],
        ['resources/bancos/FABRICANTE/A.syx'])).toEqual(['resources/bancos/FABRICANTE/A.syx']);
    });

    it('un patron SIN barra matchea en cualquier directorio', () => {
      // El caso contrario, y el que se pasa por alto en la direccion contraria:
      // `*.json` no es solo para la raiz. Anchado a la raiz, ese patron no
      // encuentra NADA, que es un contrato real perdido de vista.
      expect(cubreLa(reglasDe('*.json text eol=lf')[0], ['contracts/fx-effects.json']).length).toBe(1);
      expect(cubreLa(reglasDe('*.json text eol=lf')[0], ['fixtures/x.json']).length).toBe(1);
      // Con barra si va anclado, y entonces no cruza.
      expect(cubreLa(reglasDe('contracts/*.json text eol=lf')[0], ['contracts/sub/x.json'])).toEqual([]);
      expect(cubreLa(reglasDe('contracts/*.json text eol=lf')[0], ['contracts/x.json']).length).toBe(1);
    });

    it('el punto se escapa', () => {
      expect(cubreLa(reglasDe('a.js text eol=lf')[0], ['aXjs'])).toEqual([]);
      expect(cubreLa(reglasDe('a.js text eol=lf')[0], ['a.js'])).toEqual(['a.js']);
    });

    it('un patron entre corchetes es una macro, no una regla de ficheros', () => {
      expect(reglasDe('[attr]miAttr text eol=lf')).toEqual([]);
      expect(reglasDe('*.txt text eol=lf').length).toBe(1);
    });

    it('la forma con comillas se lee bien', () => {
      const r = reglasDe('"*.txt" text eol=lf')[0];

      expect(r.patron).toBe('*.txt');
      expect(obligaLf(r)).toBe(true);
    });

    it('obligaLf distingue las tres cosas que un toContain no distingue', () => {
      expect(reglasQueFijan('x.js', '')).toEqual([]);
      expect(reglasQueFijan('x.js', 'x.js text eol=crlf')).toEqual([]);
      expect(reglasQueFijan('x.js', 'x.js -text eol=lf')).toEqual([]);
      expect(reglasQueFijan('x.js', 'y.js text eol=lf')).toEqual([]);
      expect(reglasQueFijan('x.js', 'x.js text eol=lf').length).toBe(1);
      expect(reglasQueFijan('contracts/x.json', '*.json text eol=lf').length).toBe(1);
    });

    it('esPreventiva separa "declaro una extension" de "nombro este fichero"', () => {
      // La distincion que hace que este guard sirva para un repo con 18 reglas
      // de futuro. Sin ella, este guard solo se podria apagar.
      for (const p of ['*.cpp', '*.h', '*.txt', '**/*.tmp', 'a/**/b.js']) {
        expect(esPreventiva({ patron: p }), p + ' deberia ser preventiva').toBe(true);
      }
      for (const p of ['CMakeLists.txt', '.gitignore', 'contracts/fx-effects.json',
        'resources/bancos/*.syx']) {
        expect(esPreventiva({ patron: p }), p + ' deberia ser concreta').toBe(false);
      }
    });

    it('y reglasInertes separa las dos clases sin perder ninguna', () => {
      const reglas = reglasDe([
        '*.cpp text eol=lf',                        // preventiva, no cubre
        '*.json text eol=lf',                       // preventiva, SI cubre
        'contracts/fx-effects.json text eol=lf',    // concreta, SI cubre
        'contracts/inexistente.json text eol=lf'    // concreta, NO cubre
      ].join('\n'));
      const { errores, preventivas } = reglasInertes(reglas, ['contracts/fx-effects.json']);

      expect(errores.map((r) => r.cruda)).toEqual(['contracts/inexistente.json text eol=lf']);
      expect(preventivas.map((r) => r.cruda)).toEqual(['*.cpp text eol=lf']);
      expect(errores.length + preventivas.length).toBe(2);
    });

    it('cuentaCrlf ve los CRLF y no ve los LF', () => {
      expect(cuentaCrlf('a\nb\nc')).toBe(0);
      expect(cuentaCrlf('a\r\nb\r\nc')).toBe(2);
      expect(cuentaCrlf('a\rb')).toBe(0);
    });
  });

  describe('y las dos copias del modulo no se separan', () => {
    // El modulo de reglas esta en este repo y en ABDEep, y es una copia
    // gestionada. Un parser de `.gitattributes` escrito dos veces son dos
    // interpretaciones de la misma especificacion, y la que se queda sin
    // actualizar es la que nadie mira. Este test compara las dos cuando el
    // hermano esta a mano, y AVISA cuando no lo esta, en vez de fingir que ha
    // comparado algo.
    it('el hermano se ve si esta, y si esta, las dos copias coinciden', () => {
      if (!existsSync(HERMANO_MODULO)) {
        console.warn('[gitattributesGuard] ABDEep no esta a mano: no se ha comparado la copia ' +
          'del modulo. El guard de ABDEep tiene su propio test para esto.');
        return;
      }

      const aqui = readFileSync(resolve(here, 'gitattributesGuard.js'), 'utf8');
      const alla = readFileSync(HERMANO_MODULO, 'utf8');
      // Solo el cuerpo: las cabeceras de cada copia explican cosas distintas.
      const cuerpo = (s) => s.slice(s.indexOf('function reglaDe'));

      expect(cuerpo(alla), 'el modulo de ABDEep ha cambiado y esta copia no. Se comparan solo '
        + 'las FUNCIONES, porque las cabeceras dicen cosas distintas.'
      ).toBe(cuerpo(aqui));
    });
  });
});

describe('y los artefactos generados se descubren, no se cuentan a mano', () => {
  // La parte del guard que no tiene lista. Todo lo de arriba va de las REGLAS;
  // esto va de los FICHEROS: cuales son generados y cuales de ellos se comparan
  // sin que ninguna regla los proteja.
  const ARTEFACTOS = descubreArtefactos(contenidos(TRACKEADOS));

  it('este repo DESCUBRE artefactos, que es lo que evita el verde vacio', () => {
    // EL RIESGO DE ESTA DEFENSA, DICHO EN VOZ ALTA. Un guard que descubre cero
    // pasa todos sus tests: no hay nada que comprobar y no hay nada que
    // proteger. Aqui se mide, porque el fallo silencioso de un guard de
    // descubrimiento no es que se ponga rojo, es que nunca se pone.
    expect(ARTEFACTOS.length,
      'el guard no descubre NINGUN artefacto generado. O los generadores han dejado de '
      + 'marcar lo que escriben, o la sena que los delata se ha roto. Un guard que '
      + 'descubre cero esta verde sin comprobar nada.'
    ).toBeGreaterThan(0);
  });

  it('los delata por su propio campo generatedBy, no por su nombre', () => {
    // Estos cinco contratos son la razon de que la sena de procedencia exista.
    // Sus nombres (`abdeep_modulation_matrix.json`, `s950_calibration.json`) no
    // dicen si los escribio una persona o un script, y hasta ayer no lo decia
    // nada: el nombre no los delata y el `.json` no lleva cabecera.
    //
    // Y son un MINIMO, no una lista cerrada. Un sexto artefacto con su
    // `generatedBy` tiene que aparecer aqui sin que nadie edite este test: esa
    // es la promesa del descubrimiento, y una lista exacta la revocaria. Lo que
    // si tiene que ser exacto es el test de abajo, que es donde se ve que un
    // artefacto esta SIN proteger.
    const porProcedencia = ARTEFACTOS
      .filter((a) => a.senas.includes('procedencia'))
      .map((a) => a.ruta)
      .sort();

    expect(porProcedencia.length, 'han desaparecido artefactos que el guard descubria antes')
      .toBeGreaterThanOrEqual(5);

    expect(porProcedencia).toEqual(expect.arrayContaining([
      'contracts/abdeep_modulation_matrix.json',
      'contracts/abdms2000_modulation_matrix.json',
      'contracts/neuronik_modulation_matrix.json',
      'contracts/s950_calibration.json',
      'contracts/s950_patch_fields.json'
    ]));
  });

  it('un esquema que NOMBRA generatedFrom no es un artefacto generado', () => {
    // El falso positivo que habria enseado a ignorar al guard. Estas dos tablas
    // declaran la propiedad `generatedFrom` porque describen un contrato que la
    // tiene, y eso las hace hablar de artefactos, no SER artefactos.
    for (const f of ['contracts/s950-calibration.schema.json',
      'contracts/s950-patch-fields.schema.json']) {
      const contenido = readFileSync(resolve(repoRoot, f), 'utf8');

      expect(contenido.includes('generatedFrom'), f + ' deberia nombrarla, si no este test no prueba nada')
        .toBe(true);
      expect(senasDeArtefacto(f, contenido), f + ' nombra generatedFrom pero NO esta generado')
        .toEqual([]);
    }
  });

  it('y ningun artefacto descubierto se queda sin regla que lo fije en LF', () => {
    const sinFijar = artefactosSinFijar(ARTEFACTOS, ga);

    expect(sinFijar.map((a) => a.ruta + ' [' + a.senas.join(', ') + ']'),
      'artefactos generados que se COMPARAN byte a byte sin que ninguna regla los fije en '
      + 'LF. La proxima regeneracion los devuelve con los saltos de linea cambiados y el '
      + 'diff ensucia el fichero entero.'
    ).toEqual([]);
  });

  it('la defensa muerde: sin reglas, TODOS los artefactos salen en rojo', () => {
    // Una defensa que no se ejecuta es indistinguible de una que funciona, asi
    // que hay que verla fallar una vez. Aqui se le da un `.gitattributes` vacio
    // y se exige que todos los artefactos aparezcan.
    expect(artefactosSinFijar(ARTEFACTOS, '').length).toBe(ARTEFACTOS.length);
    expect(artefactosSinFijar(ARTEFACTOS, '*.json text eol=crlf').length).toBe(ARTEFACTOS.length);
  });
});

describe('git se invoca de una forma que no depende de la maquina', () => {
  // ESTE describe es la defensa de todo lo de arriba.
  //
  // En una maquina donde el repositorio es de otro usuario, git se niega a
  // trabajar («dubious ownership»). Entonces `ls-files` falla, `listaTrackeada()`
  // devuelve la lista VACIA, y este guard se pone rojo diciendo que no descubre
  // ningun artefacto — un fallo de git Leanado como un fallo del guard. Fue lo
  // que paso: seis de los ocho rojos de la auditoria de contratos eran esto.
  //
  // Asi que la excepcion se pone en el comando, y se comprueba que este lo pide
  // de verdad en vez de confiar en que lo hara.
  it('la excepcion de safe.directory va en TODA llamada a git', () => {
    expect(GIT.length).toBeGreaterThan(0);

    // Y tiene que ser la opcion que evita el fallo, no una cualquiera: `-c`
    // antes del subcomando, y apuntando a un sitio.
    const i = GIT.indexOf('-c');

    expect(i, 'git no recibe ninguna excepcion de safe.directory: en una maquina '
      + 'donde el repositorio es de otro usuario, este guard no mira nada').toBe(0);
    expect(GIT[i + 1]).toContain('safe.directory=');
  });

  it('la ruta sale de donde esta el helper, no de una constante escrita a mano', () => {
    // La excepcion sin ruta NO hace nada, y con la ruta de otra maquina hace
    // daño en el sentido contrario: pone rojo un checkout sano. Se comprueba que
    // la ruta que se pasa es de hecho la de ESTE repositorio.
    const enGIT = GIT[GIT.indexOf('-c') + 1].split('=')[1];

    expect(enGIT).toBe(repoRoot.replace(/\\/g, '/').replace(/\/+$/, ''));
  });

  it('git responde de verdad cuando se le pregunta con la excepcion puesta', () => {
    // La asercion que de verdad importa, porque las dos de arriba pueden pasar
    // con una excepcion mal formada. Si `gitSeguro` no funciona, esto falla; y
    // si NO se pone la excepcion, tambien — que es justo lo que se quiere ver.
    // Sin esto, un `GIT` mal escrito pasaria los tests anteriores y dejaria el
    // guard en verde sin mirar nada.
    const salida = gitSeguro(['ls-files']);

    expect(salida.length).toBeGreaterThan(0);
    expect(salida).toContain('contracts/');
  });
});
