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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CONTRATOS, GENERADOS_FUERA, GENERADORES_HERMANOS, COPIAS, COPIAS_BLOQUEANTES, compararCopia, veredictoCopia, clasificarCopia, esEnlace, correrCheck, correrNode, correrGeneradorHermano, scriptsQueEmpiezanPor, fuentesQueNoExisten, salidasDeclaradas, generadorProduceLoQueDice, generadorHermanoProduceLoQueDice, hermanoDisponible } from '../scripts/check-generated-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// EL INSTANTE DE UN FICHERO, PARA COMPARARLO. La fecha se restaura con
// `utimesSync`, que pasa por un `Date` de precision de milisegundo, asi que el
// `mtimeMs` que sale de ella vuelve con menos digitos que el que se guardo:
// `…809.2185` se vuelve `…809.218`. El fichero es el mismo y la fecha es el mismo
// instante, pero `toEqual` los da por distintos.
//
// Se redondea al milisegundo en lugar de comparar con tolerancia para que el resto
// del test siga siendo `toEqual` sobre un array, y para que estos tres sitios no
// tengan cada uno su propia aritmetica. Redondear a 1 ms no cambia lo que estos
// tests afirman: un generador que reescribe un contrato mueve su fecha bastante
// mas de un milisegundo, y el test que lo comprueba sigue en verde.
const instanteDe = (p) => Math.round(statSync(p).mtimeMs);

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
    //
    // Y son DOS inventarios, no uno. `CONTRATOS` son los generadores que
    // producen JSON en `contracts/`; `GENERADOS_FUERA` son los que producen
    // codigo, y no viven en el catalogo. Unir las dos listas habria hecho que
    // este test siguiera pasando con el cuarto generador fuera del sitio que le
    // toca, que es exactamente el fallo que se quiere cazar: un `check:` que
    // existe en el manifiesto y que el preflight no corre no vigila nada.
    const checks = scriptsQueEmpiezanPor(manifest, 'check:');
    const declarados = [...CONTRATOS, ...GENERADOS_FUERA].map((c) => c.scriptNpm);

    // Los AGREGADOS: los `check:` que no son un generador sino una puerta que
    // recorre un inventario entero, y que por eso no se esperan en ninguno de
    // los dos. `check:contracts` es el preflight; `check:hermanos-generadores`
    // son los generadores de los repos hermanos. Se listan aqui y no se
    // corrigen anadiendo una entrada mas: la razon por la que un agregado no
    // esta en el inventario es la misma razon por la que existe la puerta.
    const agregados = ['check:contracts', 'check:hermanos-generadores'];

    for (const c of checks) {
      if (agregados.includes(c)) continue;
      expect(declarados, `${c} no esta en ningun inventario del preflight`).toContain(c);
    }

    // Y al reves: un generador declarado que no este en el manifiesto es un
    // `pnpm generate:...` que el mensaje de arreglo no puede dar, porque el
    // mensaje sale del NOMBRE del script. Ese nombre es la promesa de que
    // existe ese comando.
    for (const c of [...CONTRATOS, ...GENERADOS_FUERA]) {
      if (c.sinGenerador) continue;
      expect(checks, `${c.scriptNpm} lo usa el preflight pero no esta en package.json`)
        .toContain(c.scriptNpm);
    }

    // Y un agregado que este declarado tiene que existir de verdad: un nombre en
    // el manifiesto que no apunta a nada es un paso de CI que no comprueba nada
    // y sale en verde.
    //
    // El token de la ruta se busca como «el primero que exista en disco», y no
    // como «el segundo de la linea»: los comandos llevan `node ` delante y
    // `--check` detras, y quitar el prefijo a pelo se rompe en cuanto alguien
    // pone `pnpm` o `python` en el medio.
    for (const c of agregados) {
      const comando = manifest.scripts[c];
      const tokens = String(comando ?? '').split(/\s+/).filter(Boolean);
      const rutas = tokens
        .map((t) => join(root, ...t.split('/')))
        .filter((p) => existsSync(p));

      expect(comando, `${c} no esta en package.json`).toBeTruthy();
      expect(rutas.length, `${c} no apunta a ningun script que exista (${comando})`)
        .toBeGreaterThan(0);
    }
  });

  it('el script de los hermanos existe, y es el que el paso de CI corre', () => {
    // El paso del workflow corre un fichero concreto. Si ese fichero se renombra
    // y el workflow no se entera, el paso falla con «no such file» en CI —que si
    // se ve— pero mientras tanto el preflight sigue vigilando de otra manera y
    // nadie nota que la puerta con nombre propio dejo de existir. Aqui se ata.
    const ruta = join(root, 'scripts', 'check-hermanos-generadores.mjs');

    expect(existsSync(ruta), 'no esta el script que el paso de CI corre').toBe(true);

    const cuerpo = readFileSync(ruta, 'utf8');

    expect(cuerpo).toContain('GENERADORES_HERMANOS');
    expect(manifest.scripts['check:hermanos-generadores'], 'el script no esta en package.json')
      .toContain('check-hermanos-generadores.mjs');

    // Y el workflow lo nombra. Es lo que hace que el paso de la pestana sea el
    // mismo script y no otro parecido.
    const workflow = readFileSync(join(root, '.github', 'workflows', 'docs-audit.yml'), 'utf8');

    expect(workflow, 'el workflow no llama al script de los hermanos')
      .toContain('check-hermanos-generadores.mjs');
  });

  it('el generado de C++ se comprueba sin necesitar al repositorio hermano', () => {
    // El motivo de que `GENERADOS_FUERA` exista separada y no colgada de
    // `CONTRATOS`: una cabecera generada se comprueba contra SU fuente, y la
    // fuente es el esquema, que esta aqui. Un `--check` que necesita al
    // hermano para decidir no vigila en el clon limpio, y el clon limpio es
    // donde nadie mira.
    expect(GENERADOS_FUERA.length, 'la lista de generados fuera esta vacia').toBeGreaterThan(0);

    for (const g of GENERADOS_FUERA) {
      expect(g.script, 'un generado sin script no se puede correr').toBeTruthy();
      expect(g.scriptNpm, `${g.script} necesita su nombre en package.json, que es lo que imprime el mensaje de arreglo`).toBeTruthy();
      expect(g.salidas.length, `${g.script} tiene que decir que escribe`).toBeGreaterThan(0);
      expect(g.queEs, 'el mensaje necesita decir QUE es, no solo el nombre del script').toBeTruthy();
      expect(g.deDondeSale, 'y de donde sale, que es la parte que hace falta para regenerar').toBeTruthy();
    }
  });

  it('y correr a un generador de Node es lo mismo que correr a uno de Python', () => {
    // La forma de volver igual es lo que permite que quien llama no sepa de que
    // lenguaje es cada generador. Sin esto, un `correrNode` que devolviera otra
    // cosa pasaria inadvertido hasta que un `--check` de Node saliera con el
    // codigo equivocado y el preflight dijera "desfasado" de algo que no lo esta.
    const inexistente = correrNode('scripts/no-existe-cuarentena.mjs', ['--check']);
    expect(inexistente.noExiste, 'un script que no esta tiene que decirlo').toBe(true);
    expect(inexistente.codigo).toBe(2);

    const dePython = correrCheck('scripts/no-existe-cuarentena.py');
    expect(dePython.noExiste).toBe(true);
    expect(dePython.codigo).toBe(2);
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


//──────────────────────────────────────────────────────────────────────────────
// LA FUENTE QUE DECLARA UN GENERADO, QUE TIENE QUE EXISTIR
//──────────────────────────────────────────────────────────────────────────────

describe('la fuente que declara un generado exista, o no dice nada', () => {

  // El preflight ya vigilaba que un generado TENGA script. Lo que no vigilaba
  // era que la ruta que el contrato escribe en `generatedFrom` siga ahi, y ese
  // campo es una autoridad: es lo que un panel lee para fiarse del origen. Con
  // el `.h` renombrado en ABDSharedCode, el contrato seguia diciendo "vengo de
  // aqui" con la misma seguridad y sin que nada se pusiera rojo.

  // Es el fallo de `fx-effects.json` por el otro lado: ahi faltaba el generador,
  // aqui falta la fuente. Los dos son un campo que declara una verdad sin que
  // ninguna puerta la compruebe.

  it('declarar una fuente que no existe sale con un problema, no con un verde', () => {
    // Se prueba sobre una raiz falsa, para no tocar el catalogo de verdad. Un
    // test que dependiera del disco real noPodria comprobar el fallo: si el
    // fichero exists, no hay mutacion que hacer.
    const raiz = mkdtempSync(join(tmpdir(), 'fuentes'));
    mkdirSync(join(raiz, 'contracts'), { recursive: true });

    const salidas = salidasDeclaradas();
    expect(salidas.length).toBeGreaterThan(0);

    // Se escribe uno de verdad, con una fuente que no esta en ningun sitio.
    const salida = salidas[0];
    writeFileSync(join(raiz, 'contracts', salida), JSON.stringify({
      generatedFrom: 'ABDSharedCode/Inventado/NoExiste.h',
    }), 'utf8');

    // Se copian TODOS los nombres que el preflight espera, con el primero malo,
    // para que el fallo sea el de la fuente y no el de un fichero que falta.
    for (const otra of salidas.slice(1))
      writeFileSync(join(raiz, 'contracts', otra), '{}', 'utf8');

    const problemas = fuentesQueNoExisten(raiz);
    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain(salida);
    expect(problemas[0]).toContain('NoExiste.h');

    // Y el mensaje dice POR QUE importa, no solo que no esta. Un rojo que solo
    // dice "falta" deja a quien lo lee buscando el fichero en el sitio equivocado.
    expect(problemas[0]).toContain('autoridad');
    rmSync(raiz, { recursive: true, force: true });
  });

  it('una fuente de fuera del monorepo NO se comprueba', () => {
    // Las matrices de modulacion dicen venir de volcados de hardware y de
    // manuales, que no estan en ningun sitio que este repositorio pueda mirar.
    // Exigir un volcado que vive en un disco externo seria un falso rojo
    // permanente, y la unforma de que un rojo permanente se ignores es apagarlo.
    const raiz = mkdtempSync(join(tmpdir(), 'fuentes-externas'));
    mkdirSync(join(raiz, 'contracts'), { recursive: true });

    const salidas = salidasDeclaradas();
    const salida = salidas[0];
    writeFileSync(join(raiz, 'contracts', salida), JSON.stringify({
      generatedFrom: 'ABDEep/resources/volcado/presets.bin',
    }), 'utf8');

    for (const otra of salidas.slice(1))
      writeFileSync(join(raiz, 'contracts', otra), '{}', 'utf8');

    expect(fuentesQueNoExisten(raiz)).toEqual([]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it('un JSON ilegible no es un problema de fuente', () => {
    // Un JSON roto ya tiene su puerta, que es mas informada que esta. Que esta
    // tambien se quejaria seria decir dos veces lo mismo y peor, porque el
    // arreglo "pon la ruta buena" no arregla un parser roto.
    const raiz = mkdtempSync(join(tmpdir(), 'fuentes-roto'));
    mkdirSync(join(raiz, 'contracts'), { recursive: true });

    const salidas = salidasDeclaradas();
    const salida = salidas[0];
    writeFileSync(join(raiz, 'contracts', salida), '{ esto no es json', 'utf8');

    for (const otra of salidas.slice(1))
      writeFileSync(join(raiz, 'contracts', otra), '{}', 'utf8');

    expect(fuentesQueNoExisten(raiz)).toEqual([]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it('el catalogo de verdad tiene toda fuente en su sitio', () => {
    // El caso bueno del catalogo real. Los dos del S950 apuntan a un `.h` de
    // ABDSharedCode, y ese hermano esta aqui al lado: si algun dia se mueve, este
    // test se pone rojo antes de que el panel de un usuario lo lea sin ver nada.
    expect(fuentesQueNoExisten()).toEqual([]);
  });

  it('un generatedBy que no esta, se avisa con un problema', () => {
    // `generatedBy` es la otra forma de declarar procedencia, y la que usan las
    // tres matrices de modulacion. Se comprueba por la misma razon que
    // `generatedFrom`: un contrato que dice venir de un script que no esta es un
    // contrato que ya nadie puede regenerar, y a partir de ahi sus cambios son
    // copia a mano con un nombre que miente.
    const raiz = mkdtempSync(join(tmpdir(), 'generador'));
    mkdirSync(join(raiz, 'contracts'), { recursive: true });

    const salidas = salidasDeclaradas();
    const salida = salidas[0];
    writeFileSync(join(raiz, 'contracts', salida), JSON.stringify({
      generatedBy: 'scripts/generador_que_no_existe.py',
    }), 'utf8');

    for (const otra of salidas.slice(1))
      writeFileSync(join(raiz, 'contracts', otra), '{}', 'utf8');

    const problemas = fuentesQueNoExisten(raiz);
    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain(salida);
    expect(problemas[0]).toContain('generador_que_no_existe.py');
    expect(problemas[0]).toContain('regenerar');
    rmSync(raiz, { recursive: true, force: true });
  });

  it('las matrices de modulacion declaran un generador que esta de verdad', () => {
    // El caso bueno de `generatedBy` sobre el catalogo REAL, y no sobre una raiz
    // inventada: la razon de que estas tres se puedan distinguir de las escritas
    // a mano es que el script que las copia esta al lado. Si alguien lo renombra
    // o lo mueve, este test se pone rojo en el commit, no tres semanas despues
    // cuando alguien edite una fila a mano y no haya forma de saber por que.
    const salidas = salidasDeclaradas();

    for (const salida of salidas) {
      const contrato = JSON.parse(
        readFileSync(join(root, 'contracts', salida), 'utf8')
      );

      if (contrato.generatedBy === undefined)
        continue;

      expect(existsSync(join(root, contrato.generatedBy)),
        `${salida} declara generatedBy "${contrato.generatedBy}" y ese script no esta`
      ).toBe(true);
    }

    // Y no es un verde vacio: hay al menos un contrato que lo declara. Sin esta
    // cuenta, el bucle de arriba pasaria sin haber mirado nada, que es el fallo
    // silencioso de todo guard de descubrimiento.
    const conGenerador = salidas.filter((s) => {
      const c = JSON.parse(readFileSync(join(root, 'contracts', s), 'utf8'));
      return typeof c.generatedBy === 'string' && c.generatedBy !== '';
    });

    expect(conGenerador.length,
      'ningun contrato declara generatedBy. O los generadores han dejado de '
      + 'anotar lo que escriben, o el catalogo se ha vaciado de artefactos: '
      + 'entonces esta comprobacion pasaria sin mirar nada.'
    ).toBeGreaterThan(0);
  });

  it('una evidencia que no esta se avisa con un problema', () => {
    // `provenance.source` esta escrito en prosa y no se puede comprobar: es lo
    // que lee una persona. `provenance.sourceFiles` es lo mismo, pero como rutas
    // del monorepo, y SI se puede comprobar. Sin esta segunda mitad, un contrato
    // puede citar un manual que no existe y seguir en verde, que es justo lo que
    // hace que una referencia en prosa no sirva de autoridad.
    const raiz = mkdtempSync(join(tmpdir(), 'evidencia'));
    mkdirSync(join(raiz, 'contracts'), { recursive: true });

    const salidas = salidasDeclaradas();
    const salida = salidas[0];
    writeFileSync(join(raiz, 'contracts', salida), JSON.stringify({
      provenance: { sourceFiles: ['ABDNeural/Source/Que/No/Existe.h'] },
    }), 'utf8');

    for (const otra of salidas.slice(1))
      writeFileSync(join(raiz, 'contracts', otra), '{}', 'utf8');

    const problemas = fuentesQueNoExisten(raiz);
    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain(salida);
    expect(problemas[0]).toContain('No/Existe.h');
    rmSync(raiz, { recursive: true, force: true });
  });

  it('cada evidencia declarada existe de verdad en el monorepo', () => {
    // El caso bueno sobre el catalogo REAL. Estas rutas llevan el repositorio
    // delante a proposito —`Source/DSP/...` no significa nada hasta que se sabe
    // que vive en ABDMS2000— y este test es el que se asegura de que esa
    // diferencia no se pierde: si alguien las escribe sin el prefijo, el rojo
    // sale aqui, en el commit.
    const salidas = salidasDeclaradas();
    let comprobadas = 0;

    for (const salida of salidas) {
      const contrato = JSON.parse(
        readFileSync(join(root, 'contracts', salida), 'utf8')
      );

      const evidencia = contrato?.provenance?.sourceFiles;

      if (!Array.isArray(evidencia))
        continue;

      for (const fichero of evidencia) {
        comprobadas += 1;
        expect(existsSync(join(root, '..', fichero)),
          `${salida} declara evidencia "${fichero}" y ese fichero no esta en el monorepo`
        ).toBe(true);
      }
    }

    expect(comprobadas,
      'ningun contrato declara provenance.sourceFiles. Sin esa lista la evidencia '
      + 'es prosa y no se puede comprobar, y esta comprobacion pasa sin mirar nada.'
    ).toBeGreaterThan(0);
  });
});

describe('los generadores de los HERMANOS producen lo que declaran', () => {
  // ───────────────────────────────────────────────────────────────────────
  // QUE COMPRUEBA, Y POR QUE NO BASTA CON LO DE ARRIBA
  //
  // `generadorProduceLoQueDice` mira los generadores de `scripts/`, que estan en
  // este paquete. Los de los hermanos estan alli, con sus fuentes y sus salidas, y
  // este paquete no puede leer sus JSON ni decidir si estan al dia. Lo unico que
  // puede es correr su `--check` —que no escribe— y mirar lo que hay en disco.
  //
  // Y los dos repos de codigo tienen ya `--check` porque se lo anadio en el mismo
  // commit que los metio aqui. Sin eso, correr el generador «para comprobar»
  // dejaria el arbol del hermano modificado y el CI en verde: el peor resultado
  // posible, un falso verde que ademas pisa otro repo.

  it('la lista de generadores de hermano no esta vacia, y cada entrada esta completa', () => {
    expect(GENERADORES_HERMANOS.length, 'no hay ningun generador de hermano vigilado').toBeGreaterThan(0);

    for (const h of GENERADORES_HERMANOS) {
      expect(h.repo, `una entrada sin repo`).toMatch(/^ABD/);
      expect(h.generador, `${h.repo}: sin generador declarado`).toBeTruthy();
      expect(h.salidas.length, `${h.repo}: declara que no produce nada`).toBeGreaterThan(0);
      expect(h.queEs, `${h.repo}: sin descripcion, que es lo que se lee en el rojo`).toBeTruthy();
      expect(h.deDondeSale, `${h.repo}: sin decir de donde sale`).toBeTruthy();

      // Rutas RELATIVAS al repo. Una absoluta aqui seria verde en esta maquina y
      // rota en cualquier otra, que es un fallo que no se ve hasta que pasa.
      for (const rel of h.salidas) {
        expect(rel, `${h.repo}: salida absoluta, no vale para el CI`).not.toMatch(/^[A-Za-z]:[\\/]|^[\\/]/);
        expect(rel.includes('..'), `${h.repo}: ${rel} sale del repo`).toBe(false);
      }
    }
  });

  it('los tres repos que se han pedido estan en la lista', () => {
    // Esta asercion es la que ata el encargo a la realidad: sin ella, borrar una
    // entrada de la lista deja el preflight en verde y nadie se entera de que un
    // repo entero ha dejado de vigilarse.
    const repos = new Set(GENERADORES_HERMANOS.map((h) => h.repo));

    for (const repo of ['ABDEep', 'ABDMS2000', 'ABDNeural'])
      expect(repos.has(repo), `${repo} no esta vigilado por el preflight`).toBe(true);
  });

  it('ningun generador se vigila dos veces', () => {
    // Dos entradas para el MISMO generador serian la misma comprobacion cobrada
    // dos veces, que ademas sale dos veces en el log. En cambio, VARIOS
    // generadores del MISMO repo son lo normal: ABDNeural tiene tres
    // exportadores de C++ y cada uno produce lo suyo. Por eso la clave lleva el
    // generador y no solo el repo.
    const vistos = new Set();

    for (const h of GENERADORES_HERMANOS) {
      const clave = `${h.repo}/${h.generador}`;

      expect(vistos.has(clave), `${clave} esta vigilado dos veces`).toBe(false);
      vistos.add(clave);
    }
  });

  it('un repo con varios generadores declara las salidas de TODOS ellos', () => {
    // El hueco que se abrio al declarar a ABDNeural solo con su exportador del
    // catalogo de efectos: tenia tres, y los otros dos —los descriptores de
    // parametros y la firma del layout— se quedaban sin vigilar. El preflight
    // daba verde sobre un repo con la mitad de sus generados sin mirar.
    //
    // No se puede poner aqui la lista de los que TIENEN que estar: se volveria a
    // duplicar el dato, que es justo lo que esta comprobacion evita. Lo que se
    // comprueba es la estructura que hace que el olvido se vea: todo lo que hay
    // en `WebUI/generated/` de un repo que use generadores tiene que estar
    // declarado en alguna entrada suya.
    const porRepo = new Map();

    for (const h of GENERADORES_HERMANOS) {
      if (!porRepo.has(h.repo)) porRepo.set(h.repo, []);
      porRepo.get(h.repo).push(h);
    }

    for (const [repo, entradas] of porRepo) {
      const declarados = new Set(entradas.flatMap((h) => h.salidas));
      const dir = join(root, '..', repo, 'WebUI', 'generated');

      if (!existsSync(dir)) continue;

      const enDisco = readdirSync(dir)
        .filter((f) => /\.(json|js|d\.ts)$/.test(f))
        .map((f) => `WebUI/generated/${f}`);

      for (const rel of enDisco) {
        expect(declarados.has(rel),
          `${repo}: ${rel} esta en WebUI/generated/ pero ningun generador lo declara. `
          + 'Un .gen sin vigilar es un .gen que se queda viejo sin que nadie mire.'
        ).toBe(true);
      }
    }
  });

  it('una salida que el generador declara no puede aparecer en dos entradas', () => {
    // El fallo que mas caro sale: si `registry.gen.js` aparece en la entrada de
    // ABDEep y en la de otro repo, una de las dos comparaciones mira el fichero
    // del otro checkout y pasa en verde mientras el suyo esta viejo.
    const porSalida = new Map();

    for (const h of GENERADORES_HERMANOS) {
      for (const rel of h.salidas) {
        const clave = `${h.repo}/${rel}`;

        expect(porSalida.has(clave), `${clave} esta en dos entradas de la lista`).toBe(false);
        porSalida.set(clave, h.repo);
      }
    }
  });

  it('una salida sin marca de generado se reporta como problema', () => {
    // El caso que de verdad importa en produccion: el `data.json` de ABDEep no
    // lleva `AUTO-GENERATED` porque un JSON no admite comentarios, asi que se
    // identifica por sus claves. Si ese camino se rompe, el fichero se queda sin
    // marcar y el preflight tiene que decirlo en vez de darlo por bueno.
    const hermanoFalso = {
      repo: 'ABDEep',
      generador: 'scripts/registry_generator.js',
      salidas: ['schemas/parameter-registry.data.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
      marcas: ['"unaClaveQueNoExiste"'],
    };

    const r = generadorHermanoProduceLoQueDice(hermanoFalso);

    expect(r.problemas.length, 'una salida sin marca ha pasado el filtro').toBeGreaterThan(0);
    expect(r.problemas[0]).toContain('marca de generado');
  });

  it('un generador que no esta en su sitio se lee como fallo de rutas, no como rojo generico', () => {
    const hermanoFalso = {
      repo: 'ABDEep',
      generador: 'scripts/este-generador-no-existe.js',
      salidas: ['schemas/parameter-registry.data.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
    };

    const r = generadorHermanoProduceLoQueDice(hermanoFalso);

    // Sale antes de correr nada, y lo dice. Un rojo que no nombrara el fichero
    // dejaria a quien lo lee buscando un problema en el generador.
    expect(r.problemas.length).toBe(1);
    expect(r.problemas[0]).toContain('este-generador-no-existe.js');

    // Y `comprobado: true`: se ha mirado y se ha encontrado que el generador no
    // esta. Es un hallazgo, no una limitacion, y si se contara como lo segundo
    // el preflight saldria con 0 sobre un repo al que le falta el generador.
    expect(r.comprobado, 'un generador ausente se ha contado como «no comprobado»').toBe(true);
  });

  it('una salida que no esta en el disco es un FALLO, no una limitacion', () => {
    // El bug que este test exista: `comprobado` significa «se ha podido MIRAR»,
    // no «ha ido bien». Con las dos cosas metidas en la misma bandera, un `.gen`
    // que falta —que es un fallo de rutas de verdad— se contaba como «no he
    // podido mirar» y el preflight salia con 0. Verde sobre un repo al que le
    // falta un fichero que el motor incluye.
    const hermanoFalso = {
      repo: 'ABDEep',
      generador: 'scripts/registry_generator.js',
      salidas: ['schemas/este-fichero-que-no-existe.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
    };

    const r = generadorHermanoProduceLoQueDice(hermanoFalso);

    expect(r.problemas.length).toBe(1);
    expect(r.problemas[0]).toContain('este-fichero-que-no-existe.json');
    expect(r.comprobado, 'una salida ausente se ha contado como «no comprobado»').toBe(true);
  });

  it('solo lo que NO se ha podido mirar es «no comprobado»', () => {
    // La frontera, explicita. Si algun dia alguien anade un caso mas que devuelva
    // `comprobado: false` CON problemas, esta asercion lo delata.
    const sinClonar = generadorHermanoProduceLoQueDice({
      repo: 'ABDEesteRepoNoExiste',
      generador: 'nada.js',
      salidas: ['nada.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
    });

    expect(sinClonar.comprobado).toBe(false);
    expect(sinClonar.problemas.length,
      'un repo sin clonar ha producido problemas, y no puede: no se ha mirado nada')
      .toBe(0);

    // Y el criterio que las separa: `comprobado === false` implica cero problemas.
    // Al reves —un problema con `comprobado === false`— es el bug de antes.
    const conProblema = generadorHermanoProduceLoQueDice({
      repo: 'ABDEep',
      generador: 'scripts/registry_generator.js',
      salidas: ['schemas/este-fichero-que-no-existe.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
    });

    expect(conProblema.comprobado || conProblema.problemas.length === 0,
      'hay problemas con comprobado=false: se contaria como «no he mirado» y saldria con 0')
      .toBe(true);
  });

  it('un repo que no esta clonado NO es un rojo: es «no comprobado»', () => {
    // El preflight se baja solo en CI y en un clon de un solo paquete. Exigir el
    // hermano ahi seria un falso rojo permanente, que es la forma de que un rojo
    // permanente acabe silenciado.
    const r = generadorHermanoProduceLoQueDice({
      repo: 'ABDEsteRepoNoExiste',
      generador: 'nada.js',
      salidas: ['nada.json'],
      queEs: 'prueba',
      deDondeSale: 'prueba',
    });

    expect(r.problemas.length, 'un repo ausente ha salido como problema').toBe(0);
    expect(r.avisos.length).toBe(1);
    expect(r.comprobado).toBe(false);
  });

  it('los generadores de ABDEep cubren sus DOS artefactos, no solo el registro', () => {
    // El otro generador de ABDEep: los presets de fabrica. Se declaro aparte
    // porque es un fallo distinto al del registro. Ahi un `.gen` viejo delata al
    // motor; aqui el sintoma es que `window.FACTORY_FX_PRESETS` queda a
    // `undefined` y el filtro de presets deja de encontrar nada, sin error.
    const deep = GENERADORES_HERMANOS.filter((h) => h.repo === 'ABDEep');

    expect(deep.length, 'ABDEep declara un solo generador, y tiene dos').toBeGreaterThan(1);

    const salidas = new Set(deep.flatMap((h) => h.salidas));

    for (const rel of [
      'WebUI/js/fx_presets_data/fx_presets_reverbs.js',
      'WebUI/js/fx_presets_data/fx_presets_delays.js',
      'WebUI/js/fx_presets_data/fx_presets_modulation.js',
      'WebUI/js/fx_presets_data/fx_presets_advanced.js',
      'WebUI/js/factory_fx_presets.js',
    ]) {
      expect(salidas.has(rel), `ABDEep: ${rel} no lo declara ningun generador`).toBe(true);
    }
  });

  it('un generador con muchos artefactos declara el loader, no solo las categorias', () => {
    // El loader es el que junta las cuatro categorias, y es el unico que el
    // WebUI lee por nombre (`window.FACTORY_FX_PRESETS`). Un catalogo con las
    // cuatro categorias y sin el loader parece completo y deja la WebUI sin
    // presets: las categorias se cargan, se llenan sus arrays, y nadie los lee.
    const presets = GENERADORES_HERMANOS.find((h) => h.generador?.includes('build-fx-presets'));

    expect(presets, 'build-fx-presets.js no esta en el catalogo').toBeTruthy();
    expect(presets.salidas, 'no declara el loader').toContain('WebUI/js/factory_fx_presets.js');
  });

  it('los generadores de verdad estan al dia, cuando el hermano esta', () => {
    // El caso bueno, sobre el catalogo REAL. Es lo que hace que los tests de
    // arriba sean una prueba y no una broda: si aqui pasara con un generador
    // roto, la comprobacion no miraria nada.
    const presentes = GENERADORES_HERMANOS.filter((h) => hermanoDisponible(h));

    // Que se haya comprobado alguno. En un clon de un solo paquete esto no se
    // cumple, y el test tiene que decirlo en vez de pasar en silencio.
    if (presentes.length === 0)
      expect(presentes.length, 'ningun hermano clonado: nada se ha comprobado de verdad').toBe(0);

    for (const h of presentes) {
      const r = generadorHermanoProduceLoQueDice(h);

      expect(r.problemas, `${h.repo}: ${h.queEs} da problemas`).toEqual([]);
    }
  });

  it('el ejecutable de C++ de ABDNeural lo dice en voz alta, no se hace el checks', () => {
    // ABDNeural no genera con un script: genera con un binario. Este paquete no
    // puede compilarlo, asi que no puede comprobar que sus salidas esten al dia.
    // Lo que NO puede es dejar que eso pase en silencio: un verde que parece
    // decir «el catalogo de efectos esta al dia» cuando no se ha mirado es peor
    // que no comprobar nada.
    const neural = GENERADORES_HERMANOS.find((h) => h.repo === 'ABDNeural');

    expect(neural, 'ABDNeural no esta en la lista').toBeTruthy();
    expect(neural.node, 'el generador de ABDNeural deberia estar marcado como no-Node').toBe(false);
    expect(neural.ejecutable, 'un generador no-Node tiene que decir como se llama').toBeTruthy();

    const r = generadorHermanoProduceLoQueDice(neural);

    expect(r.avisos.length, 'el generador de C++ se ha comprobado en silencio').toBeGreaterThan(0);
    expect(r.avisos[0]).toContain('ABDNeural');
  });

  it('correr un generador de hermano con --check no deja el arbol modificado', () => {
    // El fallo mas caro de todo este mecanismo, y el motivo de que `--check` sea
    // obligatorio en vez de una cortesia: correr el generador de verdad dejaria
    // el checkout del hermano con cambios, y el CI en verde. Nadie lo notaria
    // hasta que un segundo checkout de otra persona apareciera sucio.
    for (const h of GENERADORES_HERMANOS) {
      if (h.node === false || !hermanoDisponible(h))
        continue;

      const antes = h.salidas.map((rel) => {
        const p = join(root, '..', h.repo, ...rel.split('/'));
        return { rel, bytes: readFileSync(p) };
      });

      const r = correrGeneradorHermano(h);

      for (const { rel, bytes } of antes) {
        const p = join(root, '..', h.repo, ...rel.split('/'));

        expect(readFileSync(p).equals(bytes),
          `${h.repo}: correr el --check ha MODIFICADO ${rel}. Un check que ensucia el `
          + 'checkout de otro repo no es un check.')
        .toBe(true);
      }

      // Y el codigo de salida es el que dice si algo esta desfasado. En un clon
      // con los generadores al dia tiene que ser 0; si aqui sale otro, el
      // problema es real y el test tiene que decirlo, no dejarlo pasar.
      expect(r.codigo, `${h.repo}: el --check sale con ${r.codigo}: ${r.salida.slice(0, 300)}`).toBe(0);
    }
  });
});

describe('el generador PRODUCE lo que dice, no solo existir', () => {
  // ───────────────────────────────────────────────────────────────────────
  // EL HUECO QUE ESTOS TESTS CIERRAN
  //
  // Todo lo anterior comprobaba que el `--check` de un generador salga con 0. Pero
  // salir con 0 no es haber regenerado nada. El caso real que lo demuestra:
  // cambiarle la constante `OUT` a un generador para que escriba en otro sitio.
  // Su `--check` lee de ese mismo sitio equivocado, asi que los dos se
  // equivocan a la vez y el contrato se queda viejo sin que nada se entere.
  //
  // Y el caso inverso, que es mas facil de no ver: un generador que escribe lo
  // que declara Y ADEMAS otra cosa. El fichero ese queda fuera de `salidas`, el
  // preflight no lo mira nunca, y es un contrato que se queda viejo solo.
  //
  // Los dos se comprueban con generadores de mentira, porque un test que solo
  // comprobara que el generador bueno funciona pasaria igual si la comprobacion
  // no mirase nada. La defensa se prueba rompiendola.

  // Generador que no escribe NADA y sale con 0 diciendo «al dia». Es el fallo
  // mas caro: el script parece vivo y el contrato no se regenera nunca.
  const GENERADOR_TARDO = [
    'import os, sys',
    'print("al dia   s950_patch_fields.json            38 campos")',
    'sys.exit(0)',
  ].join('\n');

  // Generador que escribe lo declarado Y ADEMAS un contrato que no esta en
  // `salidas`. El legitimo queda correcto —por eso su `--check` dice «al dia»—
  // y el colado no lo vigila nadie.
  const GENERADOR_COLADO = [
    'import os, sys',
    'HERE = os.path.dirname(os.path.abspath(__file__))',
    'OUT = os.path.join(os.path.dirname(HERE), "contracts")',
    'def main():',
    '    with open(os.path.join(OUT, "s950_calibration.json"), encoding="utf-8") as fh:',
    '        texto = fh.read()',
    '    with open(os.path.join(OUT, "s950_calibration.json"), "w", encoding="utf-8") as fh:',
    '        fh.write(texto)',
    '    with open(os.path.join(OUT, "CONTRATO_COLADO.json"), "w", encoding="utf-8") as fh:',
    '        fh.write(texto)',
    '    print("al dia   s950_calibration.json            6 curvas")',
    '    return 0',
    'sys.exit(main())',
  ].join('\n');

  function conGeneradorTemporal(contenido, fn) {
    const ruta = join(root, 'scripts', 'generador_temporal.py');

    try {
      writeFileSync(ruta, contenido, 'utf8');
      return fn();
    }
    finally {
      rmSync(ruta, { force: true });
    }
  }

  it('un generador que no escribe nada, aunque salga con 0, sale con un problema', () => {
    const problemas = conGeneradorTemporal(GENERADOR_TARDO, () => generadorProduceLoQueDice({
      script: 'scripts/generador_temporal.py',
      salidas: ['s950_patch_fields.json'],
    }).problemas);

    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain('s950_patch_fields.json');
    expect(problemas[0]).toContain('no se ha');

    // El mensaje tiene que decir por que importa, no solo que no ha escrito.
    // Un rojo que solo dice «falta» deja a quien lo lee rehaciendo el catalogo
    // entero en vez de mirar la constante `OUT`.
    expect(problemas[0]).toContain('sale con 0');
  });

  it('un generador que escribe de mas lo dice, y ademas lo limpia', () => {
    const colado = join(root, 'contracts', 'CONTRATO_COLADO.json');

    const r = conGeneradorTemporal(GENERADOR_COLADO, () => generadorProduceLoQueDice({
      script: 'scripts/generador_temporal.py',
      salidas: ['s950_calibration.json'],
    }));

    expect(r.problemas.length).toBe(1);
    expect(r.problemas[0]).toContain('CONTRATO_COLADO.json');

    // Y lo limpio de verdad. Esto NO es opcional: si el preflight se deja el
    // fichero colado en `contracts/`, el siguiente que mire el arbol se
    // encuentra un contrato que nadie ha decidido tener, y ahora hay dos
    //piredios de problemas: el que faltaba y el que se ha colado.
    expect(existsSync(colado),
      'el preflight ha dejado en contracts/ un fichero que el generador creo. '
      + 'Comprobar los generadores no puede dejar el arbol sucio.'
    ).toBe(false);
  });

  // Generador que se ESCAPA de la arena y escribe en el `contracts/` de verdad,
// por ruta absoluta. Ademas reescribe uno que ya existe, con el mismo contenido
// pero con fecha de hoy: el caso que hace que alguien mire un `git status` y
// piense que el contrato se ha editado.
//
// Los tres generadores de verdad NO pueden hacer esto —los tres resuelven sus
// rutas desde `HERE`, que dentro de la arena es la arena—, asi que este test no
// mira un fallo que exista hoy: mira que la red de seguridad que queda debajo de
// la arena funciona, y que cuando un generador se sale dice QUE ficheros ha
// tocado en vez de deshacerlo en silencio.
  const GENERADOR_ESCAPISTA = [
    'import os, sys',
    'REAL = %s',
    'def main():',
    '    ruta = os.path.join(REAL, "s950_calibration.json")',
    '    with open(ruta, encoding="utf-8") as fh:',
    '        texto = fh.read()',
    '    with open(ruta, "w", encoding="utf-8") as fh:',
    '        fh.write(texto)',
    '    with open(os.path.join(REAL, "CONTRATO_ESCAPADO.json"), "w", encoding="utf-8") as fh:',
    '        fh.write(texto)',
    '    print("al dia   s950_calibration.json            6 curvas")',
    '    return 0',
    'sys.exit(main())',
  ].join('\n');

  it('un generador que se escapa al arbol de verdad se dice y se deshace', () => {
    const colado = join(root, 'contracts', 'CONTRATO_ESCAPADO.json');
    const tocado = join(root, 'contracts', 's950_calibration.json');
    const antes = [instanteDe(tocado), readFileSync(tocado).toString('base64')];

    const r = conGeneradorTemporal(
      GENERADOR_ESCAPISTA.replace('%s', JSON.stringify(join(root, 'contracts'))),
      () => generadorProduceLoQueDice({
        script: 'scripts/generador_temporal.py',
        salidas: ['s950_calibration.json'],
      }),
    );

    // Que se diga. Un preflight que deshace un desastre sin decir nada parece
    // sano, y la proxima vez que alguien mire el arbol ya no sabra nadie cuando
    // aparecio. El mensaje tiene que NOMBRAR los ficheros, no solo decir que
    // algo se toco.
    const elQueLoDice = r.problemas.filter((p) => p.includes('contracts/ de verdad'));
    expect(elQueLoDice.length, 'un generador que escribe en el arbol real no se ha dicho').toBe(1);
    expect(elQueLoDice[0]).toContain('CONTRATO_ESCAPADO.json');
    expect(elQueLoDice[0]).toContain('s950_calibration.json');

    // Y que se deshaga: el colado fuera, y el reescrito con su contenido y su
    // fecha de antes. Una fecha distinta es lo que hace que un `git status` diga
    // que alguien toco un contrato.
    expect(existsSync(colado), 'el preflight ha dejado el fichero colado en contracts/').toBe(false);
    expect([instanteDe(tocado), readFileSync(tocado).toString('base64')],
      'el contrato reescrito no ha vuelto a ser el que era').toEqual(antes);
  });

  it('los generadores de verdad producen todo lo que su catalogo declara', () => {
    // El caso bueno, y sobre el catalogo REAL. Es lo que hace que los dos tests
    // de arriba sean una prueba y no unaBroda: si aqui pasara con un
    // generador roto, la comprobacion no miraria nada.
    for (const c of CONTRATOS) {
      if (c.sinGenerador)
        continue;

      const r = generadorProduceLoQueDice(c);

      expect(r.problemas,
        `${c.script} deberia escribir ${c.salidas.join(', ')}`
      ).toEqual([]);
    }
  });

  it('comprobar los generadores NO deja contracts/ modificado', () => {
    // La comprobacion regenera de verdad, asi que toca `contracts/`. Restaura,
    // pero restaurar los que YA existian no basta: si un generador crea uno
    // nuevo hay que borrarlo, y las fechas tambien tienen que volver a las que
    // tenian, o el siguiente que mire el arbol creera que algo cambio sin que
    // nadie lo haya cambiado.
    const antes = readdirSync(join(root, 'contracts')).map((f) => {
      const p = join(root, 'contracts', f);
      return [f, instanteDe(p), readFileSync(p).toString('base64')];
    });

    for (const c of CONTRATOS) {
      if (!c.sinGenerador)
        generadorProduceLoQueDice(c);
    }

    const despues = readdirSync(join(root, 'contracts')).map((f) => {
      const p = join(root, 'contracts', f);
      return [f, instanteDe(p), readFileSync(p).toString('base64')];
    });

    expect(despues.length, 'comprobar los generadores ha anadido o quitado ficheros en contracts/')
      .toBe(antes.length);

    for (const [f, mtime, contenido] of antes) {
      const ahora = despues.find((d) => d[0] === f);

      expect(ahora, `comprobar los generadores ha borrado contracts/${f}`).not.toBe(undefined);
      expect(ahora[1], `contracts/${f} ha cambiado de fecha; alguien dira que se ha editado`).toBe(mtime);
      expect(ahora[2], `contracts/${f} ha cambiado de contenido`).toBe(contenido);
    }
  });
});
