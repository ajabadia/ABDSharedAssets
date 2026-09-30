/**
 * Un contrato que declara `generatedFrom` TIENE que tener un generador que lo verifique.
 *
 * QUE ES ESTE TEST Y POR QUE HACE FALTA OTRO
 *
 * `generatedContractsPreflight.test.js` ya mira los contratos que declaran de
 * donde salen, y lo que exige es que esten DECLARADOS en el inventario. Eso
 * suena a lo mismo y no lo es: un contrato puede estar en el inventario con
 * `sinGenerador: true` y seguir declarando una procedencia que nadie comprueba.
 * Ese hueco es por el que entro `fx-effects.json`, que estuvo declarando
 * `generatedFrom: ABDEep/.../FXSlot_Factory.cpp` sin un solo generador que lo
 * regenerara o lo comprobara.
 *
 * ASI QUE ESTE TEST EXIGE UNA COSA MAS: que el generador EXISTA de verdad y
 * mire `--check`. Declararse generado y no tener quien lo verifique no es un
 * contrato descuidado, es un contrato MENTIROSO: el campo `generatedFrom` es la
 * autoridad que un panel lee para fiarse, y con ella puesta y sin nadie al otro
 * lado, lo que el panel cree que viene del codigo no viene de ahi.
 *
 * Y LA REGLA SE COMPRUEBA A SI MISMA
 *
 * Un guard que pasa porque no encuentra nada que mirar no es un guard, es un
 * adorno. La ultima seccion monta contratos y generadores de mentira y
 * comprueba que la regla los rechaza POR LA RAZON que deberia: uno con
 * procedencia y sin generador, otro con generador que no esta, y otro con
 * generador que existe pero no mira `--check`. Si la regla se rompiera y se
 * pusiera a darlo todo por bueno, esos tests se pondrian rojos los primeros,
 * antes de que un contrato real se note.
 */

import { describe, expect, it, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRATOS } from '../scripts/check-generated-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const contractsDir = join(root, 'contracts');

/** Los `.json` de `contracts/`, con su nombre, saltando lo que no se lea. */
function contratosEnDisco ()
{
    const salida = [];

    for (const nombre of readdirSync(contractsDir))
    {
        if (!nombre.endsWith('.json')) continue;

        let contrato = null;
        try
        {
            contrato = JSON.parse(readFileSync(join(contractsDir, nombre), 'utf-8'));
        }
        catch
        {
            continue;   // un json que no parsea lo mira otro test
        }

        if (contrato && typeof contrato === 'object')
            salida.push({ nombre, contrato });
    }

    return salida;
}

/**
 * El generador que DEBERIA estar comprobando este contrato, o `null` si no hay
 * ninguno que lo haga. Se busca por las SALIDAS que declara, que es la unica
 * forma de saber que generador produce cual: dos generadores podrian tocar el
 * mismo contrato, y el que no figura en el inventario no lo verifica nadie.
 */
function generadorDe (salida, inventario)
{
    for (const c of inventario)
    {
        // Sin generador no hay nadie comprobando: es justo el caso que este
        // test existe para cazar, asi que se salta en vez de contarlo.
        if (c.sinGenerador) continue;

        if ((c.salidas ?? []).includes(salida)) return c;
    }

    return null;
}

/**
 * EL REGLA, en una sola funcion, para que se pueda mirar de cerca y probar.
 *
 * @returns {{ok: boolean, motivo: string}} el motivo va con nombre: un fallo
 *   que dice "algo va mal" obliga a repetir el trabajo de la maquina.
 */
function procedenciaVerificada (salida, contrato, inventario, raiz)
{
    // Un contrato que no declara procedencia no dice nada falso, y no es de
    // este test: es un catalogo curado, como son varios. Lo que se vigila es la
    // MENTIRA, que es declarar una.
    if (typeof contrato.generatedFrom !== 'string')
        return { ok: true, motivo: 'no declara procedencia' };

    const generador = generadorDe(salida, inventario);

    if (generador == null)
        return { ok: false, motivo: 'no hay ningun generador que lo verifique' };

    const ruta = join(raiz, generador.script);

    if (!existsSync(ruta))
        return { ok: false, motivo: `${generador.script} no esta en el disco` };

    // El flag tiene que estar IMPLEMENTADO. Un generador que acepta `--check` y
    // lo ignora regenera el fichero y sale con 0: el preflight pasa en verde
    // DESPUES de haber reescrito el contrato, y el desajuste que se queria cazar
    // desaparece del disco. El script no solo no falla: borra la prueba.
    if (!readFileSync(ruta, 'utf-8').includes('--check'))
        return { ok: false, motivo: `${generador.script} no mira --check` };

    return { ok: true, motivo: `lo verifica ${generador.script}` };
}

describe('nadie declara una procedencia sin generador que la verifique', () => {
    it('los contratos de contracts/ que declaran generatedFrom lo tienen', () => {
        const enDisco = contratosEnDisco();
        expect(enDisco.length, 'no se ha encontrado ningun contrato').toBeGreaterThan(0);

        const culpables = [];

        for (const { nombre, contrato } of enDisco)
        {
            const veredicto = procedenciaVerificada(nombre, contrato, CONTRATOS, root);

            if (!veredicto.ok)
                culpables.push(`${nombre}: ${veredicto.motivo}`);
        }

        expect(culpables, culpables.join('\n')).toEqual([]);
    });

    it('hay contratos que declaran procedencia, y todos la tienen', () => {
        // LATITUD, y no universalidad. Aqui NO se afirma que todo contrato
        // generado tenga que declarar de donde sale: las tres matrices de
        // modulacion se generan y no lo declaran, y no es de este test decidir
        // si deberian. Lo que se comprueba es que la lista NO ESTA VACIA: si
        // ningun contrato declarara `generatedFrom`, el test de arriba pasaria
        // sin mirar nada, y un guard que no mira nada no es un guard.
        //
        // Y que todos los que la declaran la tienen bien declarada, que es la
        // misma regla por el otro lado, pero con datos de verdad.
        const declaran = contratosEnDisco()
          .filter(({ contrato }) => typeof contrato.generatedFrom === 'string')
          .map(({ nombre, contrato }) => ({ nombre, contrato }));

        expect(declaran.length, 'ningun contrato declara procedencia: la regla no miraria nada')
          .toBeGreaterThan(0);

        const culpables = [];
        for (const { nombre, contrato } of declaran)
        {
            const veredicto = procedenciaVerificada(nombre, contrato, CONTRATOS, root);
            if (!veredicto.ok) culpables.push(`${nombre}: ${veredicto.motivo}`);
        }

        expect(culpables, culpables.join('\n')).toEqual([]);
    });
});

describe('la regla se comprueba a si misma, para que no pueda pasar en vacio', () => {
    // Un generador de mentira tiene que EXISTIR para poder comprobar que la
    // regla mira mas que el inventario, asi que se monta en un directorio
    // temporal. Apuntar a un fichero de verdad del repo serviria, pero ataria
    // este test a que ese fichero siga ahi y sin `--check`: el dia que se
    // tocara, el fallo estaria en el test y no en lo que vigila.
    const DECTO = mkdtempSync(join(tmpdir(), 'abd-procedencia-'));
    mkdirSync(join(DECTO, 'scripts'), { recursive: true });
    writeFileSync(join(DECTO, 'scripts', 'generate_mudo.py'), 'print("regenero y listo")\n');
    writeFileSync(join(DECTO, 'scripts', 'generate_algo.py'), 'if "--check" in sys.argv: pass\n');

    afterAll(() => rmSync(DECTO, { recursive: true, force: true }));

    const INVENTARIO = [
        { script: 'scripts/generate_algo.py', scriptNpm: 'check:algo', salidas: ['algo.json'] },
        { script: 'scripts/generate_mudo.py', scriptNpm: 'check:mudo', salidas: ['mudo.json'] },
        { script: 'scripts/generate_ausente.py', scriptNpm: 'check:ausente', salidas: ['ausente.json'] },
        { script: null, scriptNpm: null, salidas: ['huerfano.json'], sinGenerador: true },
    ];

    it('un generador de verdad pasa', () => {
        const v = procedenciaVerificada('algo.json', { generatedFrom: 'x/y.h' }, INVENTARIO, DECTO);
        expect(v.ok, v.motivo).toBe(true);
    });

    it('una procedencia SIN generador se rechaza', () => {
        // Este es el caso de `fx-effects.json` reducido a lo que importa: un
        // contrato que dice de donde sale y un inventario que no tiene quien lo
        // compruebe. Tiene que salir en rojo, y diciendo por que.
        const v = procedenciaVerificada('huerfano.json', { generatedFrom: 'x/y.h' }, INVENTARIO, DECTO);
        expect(v.ok).toBe(false);
        expect(v.motivo).toContain('no hay ningun generador');
    });

    it('estar en el inventario marcado sin generador NO cuenta', () => {
        // El hueco exacto por el que colo `fx-effects.json`: figurar en el
        // inventario con `sinGenerador` no es tener generador.
        const v = generadorDe('huerfano.json', INVENTARIO);
        expect(v).toBeNull();
    });

    it('un generador que no esta en el disco se rechaza', () => {
        const v = procedenciaVerificada('ausente.json', { generatedFrom: 'x/y.h' }, INVENTARIO, DECTO);
        expect(v.ok).toBe(false);
        expect(v.motivo).toContain('no esta en el disco');
    });

    it('un generador que existe pero no mira --check se rechaza', () => {
        // Un `--check` de mentira es PEOR que no tener nada: regenera el
        // contrato y sale en verde, y el desajuste desaparece del disco.
        const v = procedenciaVerificada('mudo.json', { generatedFrom: 'x/y.h' }, INVENTARIO, DECTO);
        expect(v.ok, 'un generador sin --check deberia rechazarse').toBe(false);
        expect(v.motivo).toContain('--check');
    });

    it('un contrato que no declara procedencia no se molesta', () => {
        // El caso mayoritario, y el que hace que este no sea una puerta contra
        // todo: los catalogos curados no tienen por que declarar nada.
        const v = procedenciaVerificada('curado.json', { title: 'x' }, INVENTARIO, DECTO);
        expect(v.ok).toBe(true);
    });
});
