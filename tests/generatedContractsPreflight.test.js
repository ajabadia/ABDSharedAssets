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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRATOS, correrCheck, scriptsQueEmpiezanPor } from '../scripts/check-generated-contracts.mjs';

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
    // Tres, y los tres CON generador. Habia un cuarto, `fx-effects.json`, que se
    // declaraba generado sin que nadie lo regenerara ni lo comprobara: se le
    // quito el campo `generatedFrom` en vez de inventarle un generador, asi que
    // ya no aparece aqui. La entrada `sinGenerador: true` se borro con el y la
    // MECANICA se quedo, para que un contrato que vuelva a declarar una
    // procedencia sin generador tenga que aparecer en CONTRATOS y salir en voz
    // alta en el preflight.
    //
    // El guard de que NADIE declare una procedencia sin tener quien la verifique
    // esta en `contractProvenance.test.js`, y mira mas que este: que el
    // generador exista de verdad y mire `--check`. Aqui lo unico que se pedia
    // era que estuviera declarado, y por ese hueco entro el que no tenia.
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
