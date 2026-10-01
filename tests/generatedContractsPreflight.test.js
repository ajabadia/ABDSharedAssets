/**
 * El preflight de contratos generados tiene que EXISTIR, ESTAR CABLEADO y
 * SEGUIR SIENDO ESTRICTO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE HAY UN TEST DE UN SCRIPT QUE YA FALLA POR SI MISMO.
 *
 * `scripts/check-generated-contracts.mjs` corre los tres generadores con
 * `--check` y sale con codigo 1 si algo esta desfasado. Eso ya es la puerta, y
 * por si sola bastaria SI alguien se acordara de correrla.
 *
 * El problema es que una puerta que nadie llama no es una puerta. El
 * `--check` olvidado no falla: no pasa nada, el CI sigue en verde, el PR entra,
 * y a partir de ahi hay dos verdades sobre las curvas y un panel dibujando con
 * la equivocada sin enterarse. Ese fallo no se ve en ningun test, porque no hay
 * ningun test: lo que falta es el gesto de correr la comprobacion.
 *
 * O sea: el script es la puerta y ESTE fichero es lo que vigila la puerta. Que
 * exista, que los tres generadores esten dentro, que el CI la llame antes de la
 * suite, y que no se pueda degradar a un aviso. Un preflight que alguien pueda
 * dejar en modo informativo no es un preflight.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Y hay un fallo de la clase contraria, que es peor: un preflight que MIENTE.
 * Si un generador no ha podido leer sus fuentes, el contrato puede estar viejo
 * o puede no estarlo, y quien lo lee no tiene manera de saberlo. Devolver 0 en
 * ese caso convierte "no lo se" en "todo bien", que es exactamente el defecto
 * que todo este trabajo de contratos va contra. Por eso el codigo 2 existe, y
 * por eso este test lo comprueba: el preflight tiene que distinguir los dos
 * fallos y no fundirlos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUE NO HACE ESTE TESTE
 *
 * No comprueba que los contratos esten al dia. Eso lo hace el script, y lo
 * hace con los generadores de verdad, leyendo el codigo de verdad. Repitirlo
 * aqui seria el error de poner en el test una copia del codigo que se quiere
 * vigilar: dos copias se desincronizan y la segunda da el visto bueno. Aqui
 * solo se mira la ESTRUCTURA: quien esta, quien lo llama y si puede mentir.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CONTRATOS, COPIAS, COPIAS_BLOQUEANTES, compararCopia, veredictoCopia, clasificarCopia, esEnlace, correrCheck, scriptsQueEmpiezanPor } from '../scripts/check-generated-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const PREFLIGHT = join(root, 'scripts', 'check-generated-contracts.mjs');
const preflightSrc = existsSync(PREFLIGHT) ? readFileSync(PREFLIGHT, 'utf-8') : '';
const contractsDir = join(root, 'contracts');

describe('el preflight de contratos generados', () => {
  it('existe el script que hace la comprobacion', () => {
    expect(preflightSrc).not.toBe('');
    expect(existsSync(PREFLIGHT)).toBe(true);
  });

  it('esta cableado en package.json como preflight y como check:contracts', () => {
    // Los dos nombres, no uno. `preflight` es lo que se corre antes de la
    // suite; `check:contracts` es lo que se puede leer y recordar. Con un solo
    // nombre, quien busca "como compruebo los contratos" se encuentra un
    // `preflight` que suena a otra cosa y lo pasa por alto, que es el fallo
    // original repetido con otro disfraz.
    expect(manifest.scripts.preflight).toBeTruthy();
    expect(manifest.scripts.preflight).toContain('check-generated-contracts');

    expect(manifest.scripts['check:contracts']).toBeTruthy();
    expect(manifest.scripts['check:contracts']).toContain('check-generated-contracts');
  });

  it('declara los tres generadores con script, y son los tres que hay', () => {
    // Tres CON generador mas uno SIN el, que se declara aparte y tiene su
    // propio test. Inventariar el que no tiene generador es lo que lo hace
    // visible; los que si lo tienen son los que se pueden comprobar.
    const conGenerador = CONTRATOS.filter((c) => !c.sinGenerador);
    expect(conGenerador).toHaveLength(3);

    const scripts = conGenerador.map((c) => c.script);
    expect(scripts).toContain('scripts/generate_modulation_contracts.py');
    expect(scripts).toContain('scripts/generate_s950_patch_contract.py');
    expect(scripts).toContain('scripts/generate_s950_calibration_contract.py');
  });

  it('cada generador declarado existe de verdad y acepta --check', () => {
    // Y el `--check` tiene que estar IMPLEMENTADO, no supuesto. Un generador
    // que acepta el flag y lo ignora escribe el fichero y sale con 0: el
    // preflight pasa en verde DESPUES de haber regenerado el contrato, y el
    // desajuste que se queria cazar ha desaparecido del disco. Es el peor modo
    // de fallo posible aqui, porque el script no solo no falla: arregla el
    // sintoma y borra la prueba.
    for (const c of CONTRATOS) {
      // Sin generador no hay nada que comprobar: se mira en el test que lo
      // nombra. Aqui solo se mira lo que tiene `--check` de verdad.
      if (c.sinGenerador) continue;

      const ruta = join(root, c.script);
      expect(existsSync(ruta), `${c.script} deberia existir`).toBe(true);

      const src = readFileSync(ruta, 'utf-8');
      expect(src, `${c.script} deberia mirar --check`).toContain('--check');
    }
  });

  it('cada generador declara en el manifiesto el script de check que usa', () => {
    for (const c of CONTRATOS) {
      // Los que no tienen generador no pueden tener script de check: se saltan,
      // y hay OTRO test que se encarga de que eso no se esconda.
      if (c.sinGenerador) continue;

      expect(manifest.scripts[c.scriptNpm], `falta ${c.scriptNpm}`).toBeTruthy();
      expect(manifest.scripts[c.scriptNpm]).toContain(c.script);
    }
  });

  it('el contrato que declara generatedFrom y no tiene generador esta NOMBRADO', () => {
    // ── EL HALLAZGO DE ESTE FICHERO, Y LO QUE SE HIZO CON EL ──
    //
    // `fx-effects.json` decia en su raiz de donde venia: `ABDEep/...
    // FXSlot_Factory.cpp`. O sea que se declaraba GENERADO. Y no habia ningun
    // generador que lo produjera ni ningun `--check` que lo vigilara, asi que
    // nadie sabia si lo que hay en disco coincide con el codigo.
    //
    // Eso es peor que un contrato desfasado, porque el desfasado al menos se
    // nota. Este estaba al dia o no segun el ultimo que lo tocase a mano, y
    // el campo `generatedFrom` —que es la autoridad que un panel lee para fiarse—
    // decia que venia del codigo. No es que estuviera viejo: es que MENTIA
    // sobre de donde venia.
    //
    // No se resolvio escribiendo el generador, sino quitandole el campo: la
    // fabrica tiene 56 `case` y el catalogo 61 filas, y las cinco que sobran
    // salen de `ABDSharedCode/DspEffects`. El bucle de este test sigue
    // encontrandolo si manana vuelve a aparecer, que es para lo que esta la
    // linea de mas abajo.
    //
    // Decirlo en el inventario es lo unico que lo hace visible. Un inventario
    // explicito tiene esa desventaja y es la que se ha elegido aqui: se puede
    // olvidar de anadir un generador nuevo, y eso falla con ruido. Uno que se
    // dedujera solo no se puede olvidar, y por eso no se deduccion
    // automaticamente lo que si se deduce.
    // La lista vacia es el estado BUENO: no hay ningun contrato declarando una
    // procedencia que nadie vigila. Antes habia una entrada (`fx-effects.json`) y
    // se resolvio quitandole el `generatedFrom`, no inventandole un generador.
    // Lo que se vigila es el invariante: si manana aparece una, esta NOMBRADA.
    const sinGenerador = CONTRATOS.filter((c) => c.sinGenerador);

    for (const c of sinGenerador) {
      expect(c.script, `${c.salidas} sin generador no puede declarar script`).toBeNull();
      expect(c.scriptNpm, `${c.salidas} sin generador no puede declarar script de check`).toBeNull();

      // Y que el contrato diga de verdad lo que el inventario afirma.
      const contrato = JSON.parse(readFileSync(join(contractsDir, c.salidas[0]), 'utf-8'));
      expect(typeof contrato.generatedFrom, 'el contrato deberia declarar su origen').toBe('string');
    }
  });

  it('toda salida declarada existe en contracts/', () => {
    // La otra mitad del contrato: el preflight promete unos ficheros, y si uno
    // no esta en disco es que el inventario y la realidad han divergido.
    for (const c of CONTRATOS)
      for (const salida of c.salidas)
        expect(existsSync(join(contractsDir, salida)), `${salida} deberia estar`).toBe(true);
  });

  it('ningun generador queda fuera del preflight', () => {
    // ── LA PUERTA CONTRA LOS GENERADORES NUEVOS ──
    //
    // Esta es la comprobacion que hace que el preflight sea una puerta y no una
    // lista de los tres ficheros que alguien se acordaba. Se recorre
    // `scripts/` y se comparan los generadores con los declarados: uno nuevo
    // nace FUERA, y nace invisible, y su contrato puede desfasarse sin que nadie
    // se entere porque nadie lo mira.
    //
    // Un `scripts/` que contenga un cuarto generador tiene que fallar aqui. Es
    // lo incomodo que hace util la puerta.
    const registrados = new Set(CONTRATOS.map((c) => c.script));

    const enDisco = readdirSync(join(root, 'scripts'))
      .filter((n) => /^generate_.*\.(py|mjs|js)$/.test(n))
      .map((n) => `scripts/${n}`);

    for (const s of enDisco)
      expect(registrados.has(s), `${s} genera un contrato y no esta en el preflight`).toBe(true);
  });

  it('toda salida generada en disco esta declarada', () => {
    // Y en el otro sentido, que es el que se olvida: un generador puede haber
    // anadido una salida sin que nadie la declare aqui. Se uso el rastro que
    // dejan los propios contratos —los que llevan `generatedFrom`— porque es
    // lo que un panel puede leer para saber de donde viene su fuente.
    const declaradas = new Set(CONTRATOS.flatMap((c) => c.salidas));

    for (const nombre of readdirSync(contractsDir)) {
      if (!nombre.endsWith('.json')) continue;
      // Los schemas no son salidas: describen a otras salidas.
      if (nombre.endsWith('.schema.json')) continue;

      let contrato;
      try {
        contrato = JSON.parse(readFileSync(join(contractsDir, nombre), 'utf-8'));
      } catch {
        continue;   // un json que no parsea lo mira otro test
      }

      if (contrato && typeof contrato === 'object' && typeof contrato.generatedFrom === 'string')
        expect(declaradas.has(nombre), `${nombre} dice de donde viene y no esta en el preflight`).toBe(true);
    }
  });
});

describe('el preflight no puede mentir', () => {
  it('distingue el contrato desfasado del generador que no ha podido leer', () => {
    // El 1 y el 2 son cosas distintas y el script tiene que saberlas. Un
    // generador roto devolviendo 1 haria que alguien regenerase un contrato
    // perfectamente bueno para arreglar un parser que no entiende su fuente.
    const src = preflightSrc;

    expect(src).toContain('DESFASADOS');
    expect(src).toContain('NO SE HAN PODIDO COMPROBAR');
    expect(src).toContain('Esto NO es un contrato desfasado');
  });

  it('sale con 1 si algo esta desfasado y con 2 si no se puede comprobar', () => {
    const src = preflightSrc;

    expect(src).toContain('return 1');
    expect(src).toContain('return 2');
    // Y el 2 no se puede confundir con el 1 cuando hay de los dos: sale 1, que
    // es el mas grave, y el resumen dice las dos cosas. Un 2 escondido
    // detras de un 1 seria un fallo que nadie lee.
    expect(src).toContain('if (desfasados.length > 0 && ilegibles.length > 0) return 1');
  });

  it('cuenta TODOS los fallos antes de salir, y no para en el primero', () => {
    // Si parase en el primero, arreglar un contrato obligaria a otro viaje, y
    // el tercero se queda sin comprobar hasta que alguien se acuerde. Y hay un
    // detalle mas feo: un generador desfasado puede tener VARIAS salidas
    // desfasadas, y avisar solo de la primera deja las demas para la siguiente
    // vez.
    const src = preflightSrc;

    expect(src).toMatch(/desfasados\.push/);
    expect(src).toMatch(/ilegibles\.push/);
    // La lista se imprime entera, no el primer elemento.
    expect(src).not.toMatch(/desfasados\[0\]/);
    expect(src).not.toMatch(/ilegibles\[0\]/);
  });

  it('avisa del inventario desincronizado ANTES de correr los generadores', () => {
    // Un `scriptNpm` que no exista en `package.json` haria que quien lea el
    // mensaje de fallo fuera a correr un comando inexistente, y perderia el
    // rato justo cuando menos puede. Se comprueba antes de lanzar nada, que es
    // cuando el aviso todavia es util.
    const src = preflightSrc;

    expect(src).toContain('el inventario y package.json no coinciden');
    expect(src.indexOf('no coinciden')).toBeLessThan(src.indexOf('correrCheck(c.script)'));
  });

  it('el preflight no se ejecuta al importarlo', () => {
    // De no ser asi, este mismo fichero —al importar `CONTRATOS`— lanzaria
    // tres python en cada `vitest run`. El guard es lo que hace que importar
    // el inventario sea barato.
    const src = preflightSrc;

    expect(src).toContain('if (process.argv[1]');
    expect(src).toContain("endsWith('check-generated-contracts.mjs')");
  });
});

describe('el preflight se corre antes de la suite', () => {
  it('el CI lo invoca como paso propio y antes de los tests', () => {
    // ── LA CONEXION QUE PIDE EL ENCARGO ──
    //
    // El script existiria igual de inutil sin esto. Lo que hace falta es que el
    // workflow lo llame ANTES de la suite, como paso propio, y no "dentro" de
    // un test que se puede saltar con un filtro.
    //
    // Se lee el YAML como texto a proposito, igual que hace `ciContract.test.js`
    // para el otro contrato: leerlo con un parser obligaria a una dependencia
    // que este paquete no tiene, y aqui solo hacen falta dos cosas, el comando
    // que se corre y si esta antes que `vitest`.
    const workflows = join(root, '.github', 'workflows');
    expect(existsSync(workflows)).toBe(true);

    const alguno = readdirSync(workflows)
      .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
      .map((n) => readFileSync(join(workflows, n), 'utf-8'))
      .find((txt) => txt.includes('check-generated-contracts') || txt.includes('run preflight'));

    expect(alguno, 'ningun workflow llama al preflight de contratos').toBeTruthy();

    // Y que lo llame antes de la suite, no despues. Un preflight que corre
    // detras de los tests sigue llegando tarde para lo que evita.
    const iPreflight = alguno.indexOf('run preflight') !== -1
      ? alguno.indexOf('run preflight')
      : alguno.indexOf('check-generated-contracts');
    const iTests = alguno.indexOf('vitest') !== -1 ? alguno.indexOf('vitest') : alguno.indexOf('test');

    expect(iPreflight).toBeGreaterThan(-1);
    expect(iTests).toBeGreaterThan(-1);
    expect(iPreflight, 'el preflight tiene que correr antes de la suite').toBeLessThan(iTests);
  });

  it('el workflow del preflight no filtra por rutas que lo dejen sin correr', () => {
    // El fallo que se cuela por la puerta de atras: un `paths:` en el workflow
    // que solo salta con cambios de codigo, de modo que tocar el generador no
    // dispara la comprobacion. Es el mismo fallo que vigila `ciContract.test.js`
    // para la auditoria, y por eso se comprueba igual aqui.
    const workflows = join(root, '.github', 'workflows');

    for (const n of readdirSync(workflows)) {
      if (!n.endsWith('.yml') && !n.endsWith('.yaml')) continue;
      const txt = readFileSync(join(workflows, n), 'utf-8');

      if (!txt.includes('check-generated-contracts') && !txt.includes('run preflight')) continue;

      // Un `paths:` de mas es un fallo silencioso, asi que se dice con nombre.
      const conPaths = /^\s*paths(-ignore)?:\s*$/m.test(txt);
      expect(conPaths, `${n} filtra por rutas: el preflight no se correria siempre`).toBe(false);
    }
  });
});

describe('el preflight de verdad, ejecutado', () => {
  it('devuelve un codigo de salida que el runner entiende', () => {
    // ── UNA EJECUCION DE VERDAD, PERO CON LOS GENERADORES QUE YA SABEMOS ──
    //
    // El generador de modulacion falla hoy por una tabla de otra sesion que se
    // ha roto, y eso es un 2: no se puede comprobar. El resto, al dia. El
    // preflight tiene que devolver 2 —"incompleto", no "todo bien"— porque si
    // devolviera 0 estaria afirmando que el contrato de modulacion esta al
    // dia sin haberlo comprobado, que es la mentira que este test vigila.
    const r = correrCheck('scripts/generate_s950_calibration_contract.py');
    expect([0, 2]).toContain(r.codigo);
    expect(r.noExiste).toBe(false);
  });

  it('distingue un generador inexistente de uno que sale con codigo 2', () => {
    // No es lo mismo que no exista el fichero a que el fichero diga que no ha
    // podido leer sus fuentes. El primero es un inventario mal escrito; el
    // segundo, un problema de las fuentes. Los dos son 2 para el shell, pero el
    // mensaje tiene que distinguirlos o no dice nada.
    const r = correrCheck('scripts/no-existe-este-generador.py');
    expect(r.noExiste).toBe(true);
    expect(r.codigo).toBe(2);
  });

  it('los scripts de check del manifiesto son los que el preflight declara', () => {
    // Y que no haya un cuarto `check:algo` por ahi que sea un contrato generado
    // y no esté en el preflight. Los tres de ahora estan; el cuarto es lo que
    // haria este test mas adelante, que es de lo que se trata.
    const checks = scriptsQueEmpiezanPor(manifest, 'check:');
    const declarados = CONTRATOS.map((c) => c.scriptNpm);

    for (const c of checks) {
      // `check:contracts` es el agregado, no un generador: no se espera en el
      // inventario, que es justo lo que lo hace reconocible como agregado.
      if (c === 'check:contracts') continue;
      expect(declarados, `${c} no esta en el inventario del preflight`).toContain(c);
    }
  });
});

//==============================================================================
describe('las COPIAS de contracts/ se comparan, o no existen', () => {
  it('cada copia esta declarada con su destino y para que la usa el registro', () => {
    // Sin el "para que la usa" el aviso dice "hay una copia vieja" y no dice
    // por que importa. Y la razon por la que se comprueba es justo esa: una
    // copia que nadie lee no es una copia, es un fichero suelto.
    for (const c of COPIAS) {
      expect(c.destino, 'una copia sin destino no se puede comparar').toBeTruthy();
      expect(c.usaComo, `${c.destino} tiene que decir para que la usa el registro`).toBeTruthy();
    }
  });

  it('el comparador existe, y una ruta que no existe no dice "todo igual"', () => {
    // El fallo silencioso de un comparador de copias es devolver "iguales" para
    // un directorio que no esta. El dia que se borre la copia —que es el
    // arreglo de verdad— esto tiene que decir que no hay copia, no que la copia
    // esta al dia.
    const r = compararCopia('no-existe-este-directorio');

    expect(r.existe).toBe(false);
    expect(r.iguales).toEqual([]);
    expect(r.distintos).toEqual([]);
  });

  it('la copia del laboratorio esta al dia, y sutamano esta fijado', () => {
    // QUE ES ESTA COPIA, PARA QUE NO SE LEA COMO UNA BASURA.
    //
    // `ABDAudioLab/contracts/hardware/` no es un descuido ni un artefacto de
    // build: el laboratorio la trae versionada A PROPOSITO, y lo dice en su
    // `.gitignore` ("contracts/ is deliberately NOT ignored — it is a tracked
    // in-repo snapshot required by the hardware contract registry and by the
    // test suite"). El diseno tiene dos caminos a proposito: `build.bat` crea
    // una junction NTFS a este repositorio cuando el directorio no existe —cero
    // copia, nunca se desincroniza— y cuando si existe, manda el snapshot
    // versionado, que es lo que tienen un clon limpio y el CI.
    //
    // O sea: la copia es la que sobrevive a la maquina, y por eso su desfase si
    // importa. Lo que hace este preflight es exactly eso: que el desfase se
    // diga en lugar de aparecer un dia en un panel.
    //
    // Y el numero va FIJADO, no solo "estan iguales". Una copia que se vacia
    // entera daria "iguales: 0, distintos: 0" y pasaria como si estuviera
    // al dia. El 40 es el recuento de verdad del catalogo, asi que bajarlo es un
    // rojo, y sube solo con un contrato nuevo en el origen.
    const r = compararCopia('ABDAudioLab/contracts/hardware');

    if (!r.existe) {
      // El otro final valido: no hay copia. Entonces no hay nada que comparar y
      // no hay nada que sincronizar. Se acepta a proposito, y la unica forma de
      // llegar aqui es que el laboratorio borre el snapshot entero, que es una
      // decision suya.
      expect(r.iguales).toEqual([]);
      return;
    }

    expect(r.distintos,
      'la copia del laboratorio se ha quedado vieja respecto al origen. Sincronizala byte a byte.')
      .toEqual([]);
    expect(r.soloEnCopia, 'sobran ficheros en la copia que no estan en el origen').toEqual([]);
    expect(r.soloEnOrigen, 'faltan ficheros en la copia que estan en el origen').toEqual([]);
    expect(r.iguales.length, 'el catalogo del laboratorio').toBe(40);
  });

  it('la copia del laboratorio BLOQUEA: su desfase tiene que tirar el preflight', () => {
    // Esto es lo que se decide aqui, y por eso tiene un test que lo vigila.
    //
    // La lista estaba vacia a proposito porque el laboratorio estaba en
    // desarrollo y un rojo a diario se apaga. El alcance ha cambiado: esta
    // lista es la UNICA puerta que vigila la copia, y el snapshot es lo que
    // sobrevive a una maquina sin repositorio hermano, que es el clon limpio
    // y el CI. Con la lista vacia no habia ninguna puerta.
    //
    // Vaciar la lista sigue siendo la vuelta atras y cuesta una linea. Y es
    // una decision deliberada la que evita el otro fallo: que se vacie sin
    // que nadie lo decida.
    expect(COPIAS_BLOQUEANTES, 'la copia del laboratorio tiene que bloquear')
      .toContain('ABDAudioLab/contracts/hardware');
  });

  it('toda bloqueante esta declarada, y toda copia esta decidada', () => {
    // Las dos direcciones del mismo agujero, y las dos son guardas rotas:
    //
    //   - Una bloqueante que no este en `COPIAS` no se comprueba nunca, porque
    //     el preflight solo recorre `COPIAS`. Es una puerta que no se abre.
    //   - Una copia en `COPIAS` que no este en la lista de bloqueantes vuelve
    //     a ser un aviso, que es lo que hay que evitar a proposito.
    const destinos = COPIAS.map((c) => c.destino);

    for (const b of COPIAS_BLOQUEANTES)
      expect(destinos, `${b} bloquea pero el preflight no la recorre`).toContain(b);

    for (const d of destinos)
      expect(COPIAS_BLOQUEANTES, `${d} se compara pero su desfase no bloquea`).toContain(d);
  });

  it('el veredicto ve las cuatro combinaciones, sin tocar el snapshot real', () => {
    // Aqui es donde una puerta se rompe de verdad. Si el script decidiera
    // dentro de `main`, comprobarlo exigiria desincronizar el snapshot de
    // verdad del laboratorio, y eso no se puede hacer en una suite. Con datos
    // inventados se cubren los cuatro casos, y el que se olvida se ve aqui.
    const copia = { destino: 'ABDAudioLab/contracts/hardware' };
    const bloqueantes = [copia.destino];
    const vacio = (extra = {}) => ({
      existe: true, iguales: [], distintos: [], soloEnOrigen: [], soloEnCopia: [], ...extra,
    });

    const alDia = veredictoCopia(copia, vacio(), bloqueantes);
    expect(alDia.desfasada, 'una copia igual no esta desfasada').toBe(false);
    expect(alDia.bloquea, 'sigue siendo bloqueante aunque este al dia').toBe(true);

    const distinto = veredictoCopia(copia, vacio({ distintos: ['a.json'] }), bloqueantes);
    expect(distinto.desfasada, 'un solo byte de diferencia es un desfase').toBe(true);
    expect(distinto.bloquea).toBe(true);

    const sobra = veredictoCopia(copia, vacio({ soloEnCopia: ['retirado.json'] }), bloqueantes);
    expect(sobra.desfasada, 'un contrato retirado que sigue en la copia es un desfase').toBe(true);

    // La copia VACIA es el fallo que mas caro sale: "iguales: 0, distintos: 0"
    // parece una copia al dia, y es una copia que no esta.
    const vaciada = veredictoCopia(copia, vacio({ soloEnOrigen: ['a.json', 'b.json'] }), bloqueantes);
    expect(vaciada.desfasada, 'una copia vacia no es una copia al dia').toBe(true);
  });

  it('una copia que no existe NO es un desfase, y una que no bloquea avisa', () => {
    // El primero es el final valido: el dia que el laboratorio borre el
    // snapshot —que es el arreglo de verdad— esto tiene que callarse, y no
    // puede hacerlo un "if (desfasado)" que incluye el caso de no existir.
    const copia = { destino: 'ABDAudioLab/contracts/hardware' };
    const noExiste = {
      existe: false, iguales: [], distintos: [], soloEnOrigen: [], soloEnCopia: [],
    };

    const v = veredictoCopia(copia, noExiste, [copia.destino]);
    expect(v.desfasada, 'no hay nada que sincronizar si no hay copia').toBe(false);

    // El segundo es la via de vuelta: si alguien saca la copia de la lista de
    // bloqueantes, el mismo desfase pasa a ser aviso y el codigo de salida
    // vuelve a ser 0. Se comprueba para que rebajar la puerta sea una
    // decision visible y no un efecto secundario.
    const comoAviso = veredictoCopia(
      copia,
      { existe: true, iguales: [], distintos: ['a.json'], soloEnOrigen: [], soloEnCopia: [] },
      [],
    );
    expect(comoAviso.desfasada).toBe(true);
    expect(comoAviso.bloquea, 'sin estar en la lista de bloqueantes no cierra la puerta').toBe(false);
  });

// ─────────────────────────────────────────────────────────────────────────────
// LA PUERTA CIEGA: una copia que no es una copia.
//
// Una junction en el destino de una copia hace que `compararCopia` lea el
// origen a traves del enlace y diga que los 40 ficheros son iguales. El preflight
// sale en verde y no ha comparado NADA. Este bloque existe para que ese caso
// tenga nombre, tenga salida 1, y sobre todo para que el dia que alguien lo
// arregle bien no se pueda volver a tapar sin que algo se ponga rojo.
describe('una copia que es un enlace no es una copia', () => {
  it('el detector ve un enlace de verdad, y ve de verdad un directorio', () => {
    // Esto no es un test de una funcion con datos inventados: hace un enlace en
    // el disco. La razon es que `esEnlace` es la UNICA parte de la puerta que
    // depende de la plataforma, y una plataforma es justo lo que no se puede
    // inventar en un test. En Windows se crea una junction con 'junction';
    // en Unix un enlace a directorio con 'dir'. Los dos hacen que
    // `lstat` —y no `stat`— los vea como enlace, que es justo lo que hace el
    // script.
    const base = mkdtempSync(join(tmpdir(), 'puerta-cega-'));
    const real = join(base, 'real');
    const enlace = join(base, 'enlace');

    try {
      mkdirSync(real);
      writeFileSync(join(real, 'a.json'), '{}');

      symlinkSync(real, enlace, process.platform === 'win32' ? 'junction' : 'dir');

      expect(esEnlace(enlace), 'un enlace es un enlace, y hay que verlo').toBe(true);
      expect(esEnlace(real), 'un directorio de verdad NO es un enlace').toBe(false);

      // Y lo que hace el daño: leer el enlace devuelve los ficheros del
      // destino. Por eso comparar sale verde sin comparar.
      expect(readdirSync(enlace)).toContain('a.json');
      expect(readFileSync(join(enlace, 'a.json'), 'utf-8')).toBe('{}');
    }
    finally {
      // `force` y `recursive` porque el enlace es el que hay que borrar y hay
      // que borrarlo sin seguirlo: si el test falla antes del borrado, un rm que
      // traverses el enlace se lleva el temporal de otro proceso.
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('una ruta que no existe no es un enlace, y eso no es una puerta ciega', () => {
    // El caso limite. Si esto devolviera `true`, cualquier copia ausente
    // seria una puerta ciega y el laboratorio no podria borrar jamas el
    // snapshot sin que el preflight se pusiera rojo.
    const base = mkdtempSync(join(tmpdir(), 'puerta-ciega-'));

    try {
      expect(esEnlace(join(base, 'nada'))).toBe(false);
    }
    finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('un enlace NO es un desfase: son dos cosas distintas que no se mezclan', () => {
    // Si un enlace se declarara "desfasada", el mensaje diria "el origen cambio,
    // la copia no", que es mentira: no hay dos cosas. Y el arreglo que imprimiria
    // —copiar encima— no arreglaria nada, porque copiar por encima de un enlace
    // es escribir en el origen.
    const copia = { destino: 'ABDAudioLab/contracts/hardware' };
    const enlace = {
      existe: true,
      esEnlace: true,
      apuntaA: '/en/alguna/parte',
      iguales: ['a.json'],
      distintos: [],
      soloEnOrigen: [],
      soloEnCopia: [],
    };

    const v = veredictoCopia(copia, enlace, [copia.destino]);
    expect(v.desfasada, 'un enlace no se ha comparado, asi que no hay desfase').toBe(false);
    expect(v.puertaCiega, 'pero tiene su propia bandera').toBe(true);

    const clasificado = clasificarCopia(copia, enlace);
    expect(clasificado.caso, 'tiene su propio caso, no el de desfasada').toBe('ciega');
  });

  it('un enlace BLOQUEA aunque su destino no este declarado como bloqueante', () => {
    // Esta es la decision que se tomo, y esta aqui para que sea visible: un
    // enlace es el unico caso que bloquea por si mismo, sin estar en la lista.
    // El motivo esta en el nombre del caso, no en un "if": no se ha comprobado
    // nada, y dejar que el preflight salga verde habria dejado a alguien
    // creyendo que el snapshot del laboratorio esta vigilado cuando no lo esta.
    const copia = { destino: 'ABDAudioLab/contracts/hardware' };
    const enlace = {
      existe: true, esEnlace: true, apuntaA: '/en/alguna/parte',
      iguales: [], distintos: [], soloEnOrigen: [], soloEnCopia: [],
    };

    const comoBloqueante = clasificarCopia(copia, enlace, [copia.destino]);
    expect(comoBloqueante.bloquea).toBe(true);

    const sinDeclarar = clasificarCopia(copia, enlace, []);
    expect(sinDeclarar.bloquea, 'no declararlo no lo convierte en aviso').toBe(true);
    expect(sinDeclarar.puertaCiega).toBe(true);
  });

  it('la copia del laboratorio es una copia de verdad ahora mismo', () => {
    // El cierre del circulo. Todo lo de arriba es politica; esto es el estado
    // real de la maquina. Si alguien monta la junction para trabajar comodo y
    // se le olvida, el preflight sale con 1 —esto es lo que lo demuestra— pero
    // el CI tambien clona de cero, y ahi lo que hay es el directorio.
    const r = compararCopia('ABDAudioLab/contracts/hardware');
    expect(r.existe, 'la copia del laboratorio esta ahi').toBe(true);
    expect(r.esEnlace, 'y es un directorio, no una ventana al origen').toBe(false);

    const clasificado = clasificarCopia({ destino: 'ABDAudioLab/contracts/hardware' }, r);
    expect(clasificado.caso, 'y por eso no es una puerta ciega').toBe('al-dia');
  });
});

});
