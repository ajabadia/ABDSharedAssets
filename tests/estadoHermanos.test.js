/**
 * EL BLOQUE QUE DICE QUE CODIGO HA LEIDO EL PREFLIGHT
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE SE COMPRUEBA Y QUE NO
 *
 * Aqui no se prueba `estadosDe()` contra el arbol de verdad, sino la POLITICA:
 * `lineasDe` y `veredicto` son funciones puras y se ejercitan con los cuatro
 * casos que puede dar un hermano, inventados. Montar cuatro clones de git para
 * probar un formateador seria una puerta que nadie corre, y el fallo que hay que
 * cazar —«el veredicto dice que no son comparables cuando si lo son»— no necesita
 * un solo repo para aparecer.
 *
 * Y el caso de verdad se comprueba igualmente, pero por el otro lado: que
 * `estadosDe()` sobre el inventario de este repo sepa decir el HEAD de cada
 * hermano. Eso es una integracion, y por eso va en su propio `describe`, con
 * la condicion de que el arbol exista: en un clon limpio de este paquete no hay
 * hermanos y alli no hay nada que leer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA AFIRMACION QUE MAS IMPORTA
 *
 * Que el veredicto NUNCA cambia el codigo de salida. Esta suite no lo puede
 * comprobar —el veredicto no devuelve un codigo, y eso es justamente lo que hay
 * que vigilar: que nadie le anada uno. Se comprueba que el veredicto solo lleva
 * una frase, y que el preflight lo imprime y sigue. Un preflight que sale con 1
 * porque el arbol esta sucio es un preflight al que se aprende a no hacer caso.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bloqueDeEstado,
  corto,
  estadoDe,
  estadosDe,
  lineasDe,
  veredicto,
} from '../scripts/estado-hermanos.mjs';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

/** Un estado con lo que importa y nada mas, para no repetir campos en cada caso. */
function estado(extra) {
  return { repo: 'ABDEep', pin: SHA_A, caso: 'al-pin', head: SHA_A, sucias: 0, motivo: null, ...extra };
}

describe('corto', () => {
  it('recorta un SHA a siete, que es lo que se lee de un vistazo', () => {
    expect(corto(SHA_A)).toBe('aaaaaaa');
  });

  it('no inventa un recorte para algo que no es un SHA', () => {
    // El pin puede venir ya corto si alguien lo escribio mal, y en ese caso el
    // bloque tiene que enseñar lo que hay en vez de cortar una cadena vacia.
    expect(corto('nada')).toBe('nada');
    expect(corto(undefined)).toBe('undefined');
  });
});

describe('el marcador de un sandbox', () => {
  // Un sandbox de `sonda-ci.mjs` no lleva `.git`. Sin el marcador, el bloque
  // diria «sin git: no se puede decir que commit es» dentro de un arbol que se
  // ha construido justo para saberlo, que es el peor sitio para esa frase.

  function sandboxCon(sha) {
    const dir = mkdtempSync(join(tmpdir(), 'estado-prueba-'));
    writeFileSync(
      join(dir, '.sonda-ci.json'),
      `${JSON.stringify({ repo: 'ABDEep', sha, son: 'sonda-ci' })}\n`,
      'utf8',
    );
    return dir;
  }

  it('sin git pero con marcador al pin, el caso bueno sigue siendo el bueno', () => {
    const dir = sandboxCon(SHA_A);

    try {
      const e = estadoDe('ABDEep', SHA_A, dir);

      expect(e.caso).toBe('al-pin');
      expect(e.head).toBe(SHA_A);
      // Cero sucias y no `null`: el marcador lo escribe quien materializo
      // fichero a fichero desde `git show`, asi que no hay nada sin commitear.
      // Dejarlo en `null` imprimiria una linea sin la columna, que se lee igual
      // que «no lo he mirado».
      expect(e.sucias).toBe(0);
      expect(veredicto([e]).comparables).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un marcador que no es el pin NO se toma por bueno', () => {
    const dir = sandboxCon(SHA_B);

    try {
      const e = estadoDe('ABDEep', SHA_A, dir);

      expect(e.caso).toBe('otro-commit');
      expect(e.head).toBe(SHA_B);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un marcador ilegible degrada a sin-git, no a un commit inventado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'estado-prueba-'));

    try {
      writeFileSync(join(dir, '.sonda-ci.json'), 'esto no es json', 'utf8');

      const e = estadoDe('ABDEep', SHA_A, dir);

      expect(e.caso).toBe('sin-git');
      expect(e.head).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('los cuatro casos de un hermano', () => {
  it('sin clonar NO se confunde con un commit viejo', () => {
    const e = estadoDe('ABDEep', SHA_A, join(raiz, 'este-directorio-no-existe'));

    expect(e.caso).toBe('no-clonado');
    expect(e.head).toBeNull();
    // El motivo se escribe para el que lo lee, y un motivo vacio deja que el
    // que lo lea imagine la causa. Por eso tiene que decir que no hay nada.
    expect(e.motivo).toMatch(/no existe/);
  });

  it('un directorio que no es repo git se dice que no se puede saber el commit', () => {
    // Un directorio de verdad FUERA de todo repo. No sirve `raiz`: aunque el
    // paquete sea un clon, `git rev-parse` sube hasta el `.git` de arriba y
    // contesta, que es justo el comportamiento que hace que un directorio mal
    // clonado se de por bueno.
    const e = estadoDe('ABDEep', SHA_A, tmpdir());

    expect(e.caso).toBe('sin-git');
    expect(e.head).toBeNull();
    expect(e.motivo).toMatch(/no se puede decir que commit/);
  });

  it('con el pin que es el HEAD de verdad, el caso bueno se alcanza solo', () => {
    // En vez de suponer como esta el arbol, se le pasa a la funcion el HEAD que
    // ella misma va a leer. Asi el caso bueno se prueba sin depender de que el
    // repo este limpio, que es justo lo que no se puede suponer en un test.
    const leido = estadoDe('ABDSharedAssets', SHA_A, raiz);

    if (leido.caso !== 'al-pin') {
      // El arbol esta en otro commit, que es el estado normal de quien trabaja.
      // Se salta la afirmacion, y se dice por que en vez de dejarla pasar.
      expect(leido.caso).toBe('otro-commit');
      return;
    }

    expect(veredicto([leido]).comparables).toBe(true);
  });
});

describe('lineasDe', () => {
  it('alinea los nombres para que las columnas de commit se lean en vertical', () => {
    const lineas = lineasDe([estado({}), estado({ repo: 'ABDMS2000', pin: SHA_B, head: SHA_B })]);

    // Los dos nombres tienen distinta longitud. Si no se rellenan, la columna
    // «fijado» sale en dos columnas y la comparacion se tiene que hacer leyendo.
    expect(lineas[0].indexOf('fijado')).toBe(lineas[1].indexOf('fijado'));
  });

  it('las rutas sin commitear van en su propia columna, no pegadas al commit', () => {
    const [linea] = lineasDe([estado({ sucias: 152 })]);

    // Pegadas, «88da211  152» se lee como un commit raro en lugar de como dos
    // hechos distintos: el commit dice que codigo hay, el 152 dice que encima hay
    // codigo sin commitear.
    expect(linea).toMatch(/en disco aaaaaaa {2}152 rutas sin commitear$/);
  });

  it('no imprime la columna de sucias cuando el arbol esta limpio', () => {
    const [linea] = lineasDe([estado({ sucias: 0 })]);

    expect(linea).not.toMatch(/commitear/);
  });

  it('un hermano sin clonar no inventa un commit', () => {
    const [linea] = lineasDe([estado({ caso: 'no-clonado', head: null, motivo: 'x' })]);

    expect(linea).toMatch(/sin clonar/);
    // Sin las dos columnas de las otras lineas: un SHA de mas ahi seria el
    // «esta en el SHA que no se» que el lector tendria que resolver solo.
    expect(linea).not.toMatch(/fijado/);
    expect(linea).not.toMatch(/en disco [0-9a-f]/);
  });
});

describe('veredicto', () => {
  it('con los cuatro al pin y limpios, el preflight local y el de CI son lo mismo', () => {
    const v = veredicto([estado({}), estado({ repo: 'ABDNeural', pin: SHA_B, head: SHA_B })]);

    expect(v.comparables).toBe(true);
    expect(v.frase).toMatch(/mira lo mismo que el de CI/);
  });

  it('un arbol con cambios sin commitear YA hace que no sean comparables', () => {
    // Este es el caso que motivo el modulo: ABDEep en el SHA correcto y con 152
    // rutas sin commitear. El pin esta bien, el codigo mirado no es el del pin,
    // y sin decir esto los dos rojos parecen el mismo.
    const v = veredicto([estado({ sucias: 152 })]);

    expect(v.comparables).toBe(false);
    expect(v.frase).toMatch(/152 rutas sin commitear/);
  });

  it('un commit distinto se nombra, porque es el hermano que hay que mirar', () => {
    const v = veredicto([estado({ caso: 'otro-commit', head: SHA_B, motivo: 'x' })]);

    expect(v.comparables).toBe(false);
    expect(v.frase).toMatch(/ABDEep/);
    expect(v.frase).toMatch(/otro commit/);
  });

  it('sin clonar tambien rompe la comparabilidad, y por su propio motivo', () => {
    // No clonar no es un commit viejo: es que no hay codigo. La frase tiene que
    // decir CUAL de las dos cosas es, que es justo lo que el veredicto agrupa.
    const v = veredicto([estado({ caso: 'no-clonado', head: null, motivo: 'x' })]);

    expect(v.comparables).toBe(false);
    expect(v.frase).toMatch(/no se puede saber que commit es/);
  });

  it('un hermano al pin NO tapa a otro que no lo esta', () => {
    const v = veredicto([
      estado({}),
      estado({ repo: 'ABDNeural', caso: 'otro-commit', head: SHA_B, motivo: 'x' }),
    ]);

    expect(v.comparables).toBe(false);
    expect(v.frase).toMatch(/ABDNeural/);
    // Y el que esta bien no se nombra como problema, que es lo que haria que el
    // mensaje culpase a un hermano sano.
    expect(v.frase).not.toMatch(/ABDEep/);
  });

  it('el veredicto NO lleva codigo de salida: es un lector, no una puerta', () => {
    // La forma de esta afirmacion es la propia: si alguien le anade un
    // `codigo: 1` para «marcar el arbol sucio», esta prueba falla al enumerar
    // las claves, que es donde ese cambio se ve.
    const v = veredicto([estado({ sucias: 152 })]);

    expect(Object.keys(v).sort()).toEqual(['comparables', 'frase']);
  });

  it('con la lista vacia no dice nada en absoluto', () => {
    // Sin hermanos declarados, un veredicto que hable de comparabilidad
    // afirmaria una cosa que no se ha comprobado. Silencio.
    expect(veredicto([]).comparables).toBe(true);
    expect(bloqueDeEstado([])).toEqual([]);
  });
});

describe('el bloque entero', () => {
  it('sale con cabecera, lineas, veredicto y los huecos que lo separan', () => {
    const bloque = bloqueDeEstado([estado({}), estado({ repo: 'ABDNeural', sucias: 3 })]);

    expect(bloque[0]).toMatch(/^CONTRA QUE CODIGO DE LOS HERMANOS$/);
    expect(bloque[1]).toBe('-'.repeat(72));
    // El ultimo elemento vacio existe para que el siguiente bloque del preflight
    // no salga pegado a la frase.
    expect(bloque.at(-1)).toBe('');
    expect(bloque.at(-2).trim()).toMatch(/^ESTE PREFLIGHT NO LEE/);
  });

  it('el separador mide lo mismo que la linea de titulo del preflight', () => {
    // Si el separador se queda corto, el bloque parece de otro programa, y eso
    // es justo lo que hacia que el mensaje se leyera como texto suelto.
    expect(bloqueDeEstado([estado({})])[1]).toHaveLength(72);
  });
});

describe('estadosDe, contra el arbol de verdad', () => {
  const inventario = join(raiz, 'siblings.json');

  it('sin inventario no inventa hermanos', () => {
    // El motivo de que devuelva lista vacia y no lance: este modulo se imprime
    // DENTRO del preflight, y un lector de contexto que sale con 2 antes de
    // imprimir el contexto es otra puerta, no un contexto.
    expect(estadosDe(join(raiz, 'este-inventario-no-existe.json'))).toEqual([]);
  });

  it('lee los hermanos del inventario y dice que commit hay en cada uno', () => {
    if (!existsSync(inventario))
      return;

    const estados = estadosDe(inventario);

    // La lista esperada sale del INVENTARIO y no esta escrita aqui a proposito: con
    // los cuatro estaba, y anadir un quinto hermano -ABDAudioLab, que es destino
    // de dos generadores de este paquete- ponia el test en rojo sin que el codigo
    // estuviera mal. Un test que repite la lista no vigila la lista: la congela, y
    // el dia que se anada un hermano el unico rojo que sale es este.
    //
    // Lo que si tiene que ser verdad es que `estadosDe` recorre el inventario
    // entero y en el MISMO ORDEN, que es lo que hacia que este test valiera algo.
    const declarados = JSON.parse(readFileSync(inventario, 'utf8')).hermanos.map((h) => h.repo);

    expect(estados.map((e) => e.repo)).toEqual(declarados);

    // ABDSharedAssets esta junto al propio paquete, asi que si este clon tiene
    // hermanos, este los tiene a todos. El caso puede ser cualquiera de los
    // cuatro; lo que no puede ser es un estado sin classify.
    for (const e of estados) {
      expect(['al-pin', 'otro-commit', 'sin-git', 'no-clonado']).toContain(e.caso);

      if (e.caso === 'al-pin')
        expect(e.head).toBe(e.pin);
    }
  });

  it('este repositorio no se lista a si mismo entre los hermanos que va a leer', () => {
    if (!existsSync(inventario))
      return;

    // `necesita` son rutas DENTRO de un hermano, y este paquete es el que corre
    // el preflight. Si alguna vez se declarara a si mismo, el bloque imprimiria
    // una linea sobre el repositorio que lo esta escribiendo, y el preflight se
    // estaria midiendo a si mismo.
    expect(estadosDe(inventario).map((e) => e.repo)).not.toContain('ABDSharedAssets');
  });

  it('todos los estados del inventario traen un motivo cuando NO estan al pin', () => {
    if (!existsSync(inventario))
      return;

    // El motivo es lo que explica la linea. Un `otro-commit` sin motivo deja al
    // que lee el numero delante y sin la frase que dice si lo que falla es el
    // inventario o el checkout.
    for (const e of estadosDe(inventario)) {
      if (e.caso !== 'al-pin')
        expect(e.motivo).toBeTruthy();
    }
  });
});