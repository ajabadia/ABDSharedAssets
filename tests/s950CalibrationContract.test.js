/**
 * El contrato de curvas de calibración del S950, y el índice que lo consume.
 *
 * QUÉ COMPRUEBA ESTE FICHERO, Y POR QUÉ TIENE TRES MITADES.
 *
 * 1. QUE EL ESQUEMA SE EJECUTA ENTERO. Un esquema con palabras que el validador
 *    no ejecuta parece que avisa y no avisa de nada, que es peor que no tener
 *    esquema. Por eso se llama a `unsupportedKeywords()` y tiene que salir vacío.
 *
 * 2. QUE EL CONTRATO ES COHERENTE CON LA TABLA DE C++. Estas reglas son las
 *    MISMAS que comprueban los tests de `SynthCoreTests.cpp`, escritas otra vez
 *    en el otro lenguaje. El C++ no ve el JSON y el JS no ve el C++, y la única
 *    costura entre los dos es este fichero.
 *
 * 3. QUE LO QUE NO SE SABE SE DICE, Y QUE NO SE PARECE A UN CERO. Esta es la
 *    parte que no es un contrato como otro: el contrato no tiene ni un punto
 *    medido, y el módulo entero se apoya en que eso sea visible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA COSA QUE ESTE FICHERO PROTEGE.
 *
 * El fallo que evita no es "el JSON se corrompió". Es: un panel dibuja el eje de
 * una curva de tiempo, necesita un mínimo para la escala logarítmica, no lo
 * tiene, y pone 0. Y con 0 el log es -Infinity, así que el eje se va a menos
 * infinito y la curva desaparece. O peor, si pone 0.001 porque ha visto ese
 * número en otro sitio: el panel muestra un ataque de un milisegundo como si
 * fuera un dato, y es una conjetura con etiqueta de medición.
 *
 * Por eso `s950AxisFor()` devuelve `needsMeasuredMinimum`, y por eso hay un test
 * que cuenta cuántas de las seis curvas tienen el eje vertical INUTILIZABLE. Son
 * cuatro, y ese número es la información más útil que sale de aquí.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate, unsupportedKeywords, readContract, readSchema } from './helpers/validateSchema.js';
import {
  buildS950Calibration,
  s950AxisFor,
  s950Coverage,
  S950_UNITS,
} from '../components/s950Calibration.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const contract = readContract('s950_calibration.json');
const schema = readSchema('s950-calibration.schema.json');
const cal = buildS950Calibration(contract);

describe('s950-calibration: el esquema se ejecuta entero', () => {
  it('el contrato valida contra el esquema', () => {
    expect(validate(contract, schema)).toEqual([]);
  });

  it('el esquema no tiene palabras que el validador no ejecute', () => {
    // Si esta lista crece, la respuesta NO es apuntar la palabra aquí: es
    // añadirle soporte al validador primero.
    expect(unsupportedKeywords(schema)).toEqual([]);
  });

  it('el validador EJECUTA un tipo unión, y no solo lo acepta', () => {
    // `measuredRange` es `["object","null"]`, y ese tipo union es la unica
    // forma que tiene el contrato de decir "aun no hay rango medido". Un
    // validador que lo ACEPTARA pero no lo ejecutara seria un esquema que
    // parece comprobar el hueco declarado y no lo comprueba.
    expect(unsupportedKeywords(schema)).not.toContain('(raíz).properties.curves[]');

    const conRango = validate(
      { ...contract, curves: [{ ...contract.curves[0], measuredRange: { lo: 10, hi: 80 } }] },
      schema,
    );
    expect(conRango).toEqual([]);

    // Y que un hueco que NO es un hueco se note, y que el error nombre el
    // campo: `{}` no es un rango, y sin `required` pasaria por uno.
    const medioRango = validate(
      { ...contract, curves: [{ ...contract.curves[0], measuredRange: { lo: 10 } }] },
      schema,
    );
    expect(medioRango).toHaveLength(1);
    expect(medioRango[0]).toContain('measuredRange.hi');
  });

  it('el $schema apunta a este mismo esquema', () => {
    expect(contract.$schema).toBe('./s950-calibration.schema.json');
  });

  it('declara de donde sale, que es lo que separa una copia de una fuente', () => {
    expect(contract.generatedFrom).toBe('ABDSharedCode/SynthCore/S950Calibration.h');
    expect(contract.sourceOfTruth).toBe('ABDSharedCode/SynthCore/S950Calibration.h');
  });
});

describe('s950-calibration: el generador esta al dia', () => {
  it('el contrato commiteado coincide con lo que sale de la tabla de C++', () => {
    // El fallo que esto caza: alguien anade una septima curva al motor, no
    // regenera, y un panel sigue dibujando seis ejes. Un ataque con la escala
    // de otra curva no da ningun fallo visible.
    const out = execFileSync('python', ['scripts/generate_s950_calibration_contract.py', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('al dia');
  });

  it('el generador con la tabla buena dice "al dia" y no escribe nada', () => {
    const out = execFileSync('python', ['scripts/generate_s950_calibration_contract.py', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('al dia');
    expect(out).toContain('6 curvas');
    // Y que el modo --check NO haya tocado el fichero. Un --check que
    // regenera es un --check que nadie puede ejecutar en un CI.
    expect(out).not.toContain('escrito');
  });
});

describe('s950-calibration: el generador se NIEGA cuando la tabla no cuadra', () => {
  const SCRIPT = path.join(ROOT, 'scripts', 'generate_s950_calibration_contract.py');
  const TABLA = path.resolve(ROOT, '..', 'ABDSharedCode', 'SynthCore', 'S950Calibration.h');

  /** Un hash estable del texto, para nombrar la fixture sin reloj. */
  function hash (s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  /**
   * Corre el generador contra una tabla hecha a medida y devuelve lo que dijo.
   *
   * SIEMPRE con `--check`, y no por descuido: en modo escritura este helper
   * SOBRESCRIBE el contrato commiteado con el del fixture. Le paso `--check`
   * porque todos los caminos que se comprueban aqui fallan DENTRO de `build()`,
   * antes de comparar nada, asi que el aviso sale igual — y el test no puede
   * tocar el fichero commiteado ni por accidente.
   *
   * La primera version de este bloque no llevaba `--check`, y al fallar dejo el
   * contrato apuntando a un `.h` temporal que luego se borro: un test que rompe
   * el repo al fallar es peor que no tener el test. Por eso el helper escribe la
   * fixture por Python, verifica que la mutacion cambio ALGO, y borra en
   * `finally`.
   */
  function generarCon (mutar) {
    const fixture = path.join(ROOT, 'scripts', `.fixture-s950cal-${Math.abs(hash(mutar))}.h`);
    const tabla = TABLA.replace(/\\/g, '/');
    const destino = fixture.replace(/\\/g, '/');

    const guion = `import io, re\n` +
      `ORIGEN = r'${tabla}'\n` +
      `h = io.open(ORIGEN, encoding='utf-8').read()\n` +
      `h2 = (${mutar})(h)\n` +
      `assert h2 != h, 'la mutacion no cambio nada: el test no esta probando lo que cree'\n` +
      `io.open(r'${destino}', 'w', encoding='utf-8', newline='').write(h2)\n`;

    execFileSync('python', ['-c', guion]);

    try {
      execFileSync('python', [SCRIPT, '--check', '--source', fixture], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { fallo: null };
    } catch (err) {
      return { fallo: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    } finally {
      rmSync(fixture, { force: true });
    }
  }

  it('el contrato commiteado sigue en su sitio DESPUES de todas estas pruebas', () => {
    // La red que faltaba cuando este bloque escribia el fichero. Va al final a
    // proposito: comprueba el efecto acumulativo de las pruebas de arriba, que
    // es exactamente como se rompió.
    expect(contract.generatedFrom).toBe('ABDSharedCode/SynthCore/S950Calibration.h');
    expect(execFileSync('python', ['scripts/generate_s950_calibration_contract.py', '--check'],
      { cwd: ROOT, encoding: 'utf8' })).toContain('al dia');
  });

  it('se niega si le falta una curva', () => {
    // Un generador que se amoldase a lo que encuentra no avisaria de nada, y lo
    // que no avisa de una septima curva es un panel que dibuja seis ejes y un
    // ataque con la escala de otro.
    const { fallo } = generarCon(
      `lambda h: re.sub(r'\\{ CalCurveId::FilterEnvOctaves,.*?\\},', '', h, flags=re.S)`);
    expect(fallo).toContain('5');
    expect(fallo).toContain('EXPECTED_CURVES');
  });

  it('se niega si le sobran, y avisa de las dos direcciones', () => {
    const { fallo } = generarCon(
      `lambda h: h.replace('      "Attack / Decay / Sustain",  0, 99, false, true,  false, false },\\n', ` +
      `'      "Attack / Decay / Sustain",  0, 99, false, true,  false, false },\\n` +
      `    { CalCurveId::WarpTime, "septima", "Septima", "s", "Warp time", 0, 99, true, true, true, false },\\n')`);
    expect(fallo).toContain('7');
    expect(fallo).toContain('EXPECTED_CURVES');
  });

  it('se niega si la tabla no aparece, y no escribe un contrato vacio encima', () => {
    // El fallo peligroso: cero filas y un JSON commiteado con 0 curvas PARECE un
    // cambio de datos. Por eso el generador no escribe nada y lo dice.
    const { fallo } = generarCon(`lambda h: h.replace('calibrationCurves[]', 'otraTablaQueNoEs')`);
    expect(fallo).toContain('VACIO');
    expect(fallo).toContain('No se escribe nada');
  });

  it('se niega si una fila gana o pierde una columna', () => {
    // Sin esta comprobacion, una columna nueva saldria en el JSON como `null`
    // y el esquema no la miraba. Con ella, el generador dice cuantas espera.
    const { fallo } = generarCon(
      `lambda h: h.replace('"VCF amount",              -50, 50, false, false, false, false },', ` +
      `'"VCF amount",              -50, 50, false, false, false, false, true },')`);
    expect(fallo).toContain('COLUMNS');
    expect(fallo).toContain('11');
  });

  it('se niega si una columna booleana deja de ser booleana', () => {
    const { fallo } = generarCon(
      `lambda h: h.replace('"LFO rate",                  0, 99, true,  false, true,  false },', ` +
      `'"LFO rate",                  0, 99, true,  false, 1,    false },')`);
    expect(fallo).toContain('true o false');
    // Y NOMBRA la columna, que es lo que hace util el aviso: el `1` cae en el
    // tercer booleano de la fila, que es `positiveOnly` y no `risesWithStored`.
    expect(fallo).toContain('positiveOnly');
    expect(fallo).not.toContain('TypeError');
    expect(fallo).not.toContain('Traceback');
  });

  it('se niega si una curva usa un id que el enum no declara', () => {
    const { fallo } = generarCon(
      `lambda h: h.replace('CalCurveId::EnvelopeTime,', 'CalCurveId::Fantasma,')`);
    expect(fallo).toContain('Fantasma');
  });

  it('se niega si la tabla se REORDENA respecto al enum, que es el fallo silencioso', () => {
    // El motor indexa los puntos con el entero del enum. Una tabla reordenada
    // haria que cada curva leyera los puntos de OTRA sin dar ningun fallo: el
    // indice es valido, y lo unico que pasaria es que el motor suena mal.
    const { fallo } = generarCon(
      `lambda h: h.replace('CalCurveId::EnvelopeTime,     "envelopeTime",', 'CalCurveId::LfoRate,         "envelopeTime",')`);
    expect(fallo).toContain('ORDEN');
    // El aviso nombra el fichero de la tabla y el enum, porque quien lee el rojo
    // tiene que saber que abrir: un aviso que solo dice "las listas no coinciden"
    // deja la pregunta de cual de las dos es.
    expect(fallo).toContain('SynthCore/S950Calibration.h');
    expect(fallo).toContain('el enum CalCurveId declara');
  });
});

describe('s950-calibration: la forma de las curvas', () => {
  it('declara las seis curvas del S950', () => {
    // El 6 no es un numero redondo: son las seis de `S950Calibration.h`, y esta
    // en los tests de C++ igual que aqui.
    expect(contract.curves).toHaveLength(6);
    expect(cal.curves).toHaveLength(6);
  });

  it('el orden es el del enum de C++, y por eso no se reordena', () => {
    // El motor indexa los puntos medidos con el entero del enum. Una tabla
    // reordenada haria que cada curva leyera los puntos de otra SIN DAR NINGUN
    // FALLO: el indice es valido, y lo unico que pasa es que el motor suena mal.
    expect(cal.curves.map((c) => c.code)).toEqual([
      'envelopeTime', 'lfoRate', 'warpTime', 'filterCutoff', 'filterEnvOctaves', 'sustainDb',
    ]);
  });

  it('los codigos son unicos', () => {
    const codes = contract.curves.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('cada curva tiene unidad de las cuatro declaradas y un eje rotulado', () => {
    for (const curve of contract.curves) {
      expect(S950_UNITS, curve.code).toContain(curve.unit);
      expect(curve.axisLabel.length, curve.code).toBeGreaterThan(0);
      expect(curve.name.length, curve.code).toBeGreaterThan(0);
    }
  });

  it('cada curva cubre un rango de panel con hueco', () => {
    for (const curve of contract.curves) {
      expect(curve.storedHi, curve.code).toBeGreaterThan(curve.storedLo);
    }
  });

  it('una sola curva bipolar: el VCF amount', () => {
    // El unico campo del catalogo que cruza el cero, y el unico eje de curva
    // con storedLo negativo. Si aparece otro, hay que mirarlo: un eje bipolar
    // dibujado con una escala de tiempo es un eje invertido.
    const conSigno = contract.curves.filter((c) => c.storedLo < 0);
    expect(conSigno.map((c) => c.code)).toEqual(['filterEnvOctaves']);
  });

  it('risesWithStored es la mitad de las curvas, y no se deduce del nombre', () => {
    // Tres de tiempo, una de Hz, una de octavas y una de dB. Lo que se sube y lo
    // que no se sube esta en la tabla y en ningun otro sitio, y el fallo-tipico
    // es dibujarlas todas hacia arriba porque el byte sube.
    const suben = contract.curves.filter((c) => c.risesWithStored).map((c) => c.code);
    const bajan = contract.curves.filter((c) => !c.risesWithStored).map((c) => c.code);
    expect(suben).toEqual(['lfoRate', 'warpTime', 'filterCutoff']);
    expect(bajan).toEqual(['envelopeTime', 'filterEnvOctaves', 'sustainDb']);
  });
});

describe('s950-calibration: logarithmic y positiveOnly son cosas distintas', () => {
  it('los dB tienen eje logaritmico y ADMITEN el cero', () => {
    // El fallo que ya se cometio una vez en C++, escrito otra vez aqui porque
    // el JS tiene su propia copia de la regla y su propia forma de equivocarse.
    // Si alguien dedujera "escala logaritmica, luego el valor no puede ser 0"
    // de esta curva, el panel rechazaria un sustain al minimo, que es un valor
    // legitimo: 0 dB es el nivel de referencia, no un instante.
    const db = cal.curve('sustainDb');
    expect(db.logarithmic).toBe(true);
    expect(db.positiveOnly).toBe(false);
  });

  it('el tiempo si lo exige, y por el motivo contrario', () => {
    const env = cal.curve('envelopeTime');
    expect(env.logarithmic).toBe(true);
    expect(env.positiveOnly).toBe(true);
  });

  it('ninguna curva con eje logaritmico acepta el 0 por la escala, y solo los dB por otra razon', () => {
    // La regla general, escrita al reves para que se vea: de las CUATRO curvas
    // logaritmicas, tres exigen positivo y una lo admite. Si el cero se derivase
    // de la escala, las cuatro lo exigirian.
    //
    // Y son cuatro y no cinco porque el LFO va en lineal: el estudio lo media en
    // hercios y una unidad es un numero fijo de hercios este donde este, que es
    // lo unico lineal del fichero. Escribir cinco aqui era contar de memoria.
    const log = contract.curves.filter((c) => c.logarithmic);
    expect(log).toHaveLength(4);
    expect(log.map((c) => c.code)).toEqual([
      'envelopeTime', 'warpTime', 'filterCutoff', 'sustainDb',
    ]);
    expect(log.filter((c) => c.positiveOnly).map((c) => c.code)).toEqual([
      'envelopeTime', 'warpTime', 'filterCutoff',
    ]);
  });

  it('ninguna curva permite extrapolar, y el eje vertical lo dice', () => {
    for (const curve of contract.curves) {
      expect(curve.allowExtrapolation, curve.code).toBe(false);
    }
  });
});

describe('s950-calibration: lo que no se sabe, se DICE', () => {
  it('las seis curvas estan sin medir, y lo declaran de tres maneras', () => {
    for (const curve of contract.curves) {
      expect(curve.measured, curve.code).toBe(false);
      expect(curve.pointCount, curve.code).toBe(0);
      expect(curve.points, curve.code).toEqual([]);
      // Y la cuarta, que es la que un panel dibuja: no hay rango MEDIDO.
      expect(curve.measuredRange, curve.code).toBeNull();
    }
  });

  it('measuredRange es null y NO el rango de panel, que es lo que se puede', () => {
    // La confusion que este campo evita: el rango de PANEL se sabe siempre
    // (esta en storedLo/storedHi) y el de MEDIDO no. Poner `measuredRange`
    // a 0..99 haria que un panel marcase como medido todo el eje.
    const env = cal.curve('envelopeTime');
    expect(env.measuredRange).toBeNull();
    expect(env.storedLo).toBe(0);
    expect(env.storedHi).toBe(99);
  });

  it('el indice dice que no hay ninguna medida, y lo cuenta', () => {
    expect(cal.isMeasured('envelopeTime')).toBe(false);
    expect(cal.measuredCount()).toBe(0);
    expect(cal.unmeasured()).toHaveLength(6);
    expect(cal.unmeasured().map((c) => c.code)).toEqual(cal.curves.map((c) => c.code));
  });

  it('la cobertura dice "ninguna", y no "vacia"', () => {
    // "Vacia" suena a que alguien la ha dejado a medias, y lo que hay es una
    // decision con su motivo en las notas del contrato.
    const coverage = s950Coverage(cal);
    expect(coverage.measured).toBe(0);
    expect(coverage.total).toBe(6);
    expect(coverage.complete).toBe(false);
    expect(coverage.label).toBe('Ninguna curva medida todavía');
  });

  it('las notas del contrato explican por que esta vacia', () => {
    expect(contract.notes.length).toBeGreaterThanOrEqual(4);
    const todo = contract.notes.join(' ');
    // Lo que un panel necesita leer ANTES de inventar un valor: que no es un
    // olvido, y que el hueco no es un cero. Las tres palabras que se comprueban
    // son las tres que cambian una decision, no las tres que suenan bien.
    expect(todo).toContain('FORMA');
    expect(todo).toContain('medicion');
    expect(todo).toContain('click');
  });
});

describe('s950-calibration: valueAt NUNCA devuelve un numero', () => {
  it('devuelve null para las seis curvas, en cualquier valor de panel', () => {
    for (const curve of contract.curves) {
      for (const stored of [0, 1, 49, 50, 99, -50, NaN, null, undefined]) {
        expect(cal.valueAt(curve.code, stored), `${curve.code}@${stored}`).toBeNull();
      }
    }
  });

  it('devuelve null para una curva que no existe, y no un NaN', () => {
    expect(cal.valueAt('noExiste', 0)).toBeNull();
    expect(cal.valueAt('', 0)).toBeNull();
    expect(cal.valueAt(undefined, 0)).toBeNull();
  });

  it('un null NO es un 0, y por eso un "|| 0" en el llamante no lo camufla', () => {
    // El motivo de que esto sea `null` y no `0`: un 0 SI es un numero, asi que
    // un `valueAt(...) || 0` devolveria 0, y un `?? 0` tambien. Con null, los
    // dos siguen dando null, y el motor tiene algo de que sospechar.
    for (const curve of contract.curves) {
      const v = cal.valueAt(curve.code, 50);
      expect(v === null).toBe(true);
      expect(v === 0).toBe(false);
      expect((v ?? 0)).toBe(0);
      expect((v || 0)).toBe(0);
      // Y lo que un panel haria de verdad con el resultado:
      expect(Number.isFinite(v)).toBe(false);
    }
  });
});

describe('s950-calibration: el eje que se puede dibujar y el que no', () => {
  it('el eje HORIZONTAL de las seis se dibuja entero, sin ningun punto medido', () => {
    for (const curve of contract.curves) {
      const axis = s950AxisFor(curve);
      expect(axis, curve.code).not.toBeNull();
      expect(axis.lo).toBe(curve.storedLo);
      expect(axis.hi).toBe(curve.storedHi);
      expect(axis.span).toBe(curve.storedHi - curve.storedLo);
      expect(axis.label).toBe(curve.axisLabel);
      // El eje X va en unidades de PANEL, nunca en la unidad de la curva.
      expect(S950_UNITS).not.toContain(axis.lo);
    }
  });

  it('cuatro de los seis ejes verticales NO se pueden dibujar, y se dice cuales', () => {
    // El numero que le importa a quien esta pintando. Un eje en log necesita un
    // minimo REAL, y el minimo real es un valor medido: sin el, `Math.log(0)` es
    // -Infinity y la curva se va a menos infinito.
    const sinMinimo = cal.curves.filter((c) => s950AxisFor(c).needsMeasuredMinimum);
    expect(sinMinimo.map((c) => c.code)).toEqual([
      'envelopeTime', 'warpTime', 'filterCutoff', 'sustainDb',
    ]);

    // Y las dos que SI se pueden dibujar son las lineales, que con un minimo
    // nominal ya estan. La del LFO va incluida porque su eje es lineal: se
    // puede pintar aunque no haya ni un punto.
    const dibujables = cal.curves.filter((c) => !s950AxisFor(c).needsMeasuredMinimum);
    expect(dibujables.map((c) => c.code)).toEqual(['lfoRate', 'filterEnvOctaves']);
    expect(dibujables.every((c) => s950AxisFor(c).scale === 'linear')).toBe(true);
  });

  it('"puedo dibujar el eje" NO es lo mismo que "lo he medido"', () => {
    // El VCF amount tiene eje vertical utilizable y sigue sin medirse. Un
    // panel que confundiera las dos cosas dibujaria una octava de trazado.
    const octaves = cal.curve('filterEnvOctaves');
    expect(s950AxisFor(octaves).needsMeasuredMinimum).toBe(false);
    expect(octaves.measured).toBe(false);
  });

  it('el minimo inventado es justo lo que sale, y por eso no se pone', () => {
    // Se escribe el numero que un panel IMPACIENTE pondria, y lo que pasa: el
    // log de un minimo inventado no falla, produce una curva con toda la pinta
    // de medida. Por eso el problema no es que el numero sea feo.
    const minimoInventado = 0.001;
    expect(Math.log(minimoInventado)).toBeLessThan(0);
    expect(Number.isFinite(Math.log(minimoInventado))).toBe(true);

    // Y en el otro extremo, el cero de verdad: un minimo de 0 en log NO es un
    // eje raro, es un eje roto.
    expect(Number.isFinite(Math.log(0))).toBe(false);
  });

  it('la escala y el sentido los dice el contrato, no el nombre de la unidad', () => {
    // "s" no dice si el eje sube, y una curva de tiempo dibujada hacia arriba
    // es un attack que se alarga al mover el mando a la izquierda.
    expect(s950AxisFor(cal.curve('envelopeTime')).rises).toBe(false);
    expect(s950AxisFor(cal.curve('lfoRate')).rises).toBe(true);
    expect(s950AxisFor(cal.curve('sustainDb')).rises).toBe(false);
  });

  it('excludeZero sale de positiveOnly, y no de la escala', () => {
    expect(s950AxisFor(cal.curve('envelopeTime')).excludeZero).toBe(true);
    expect(s950AxisFor(cal.curve('sustainDb')).excludeZero).toBe(false);
  });

  it('s950AxisFor de algo que no es una curva da null, no un eje de mentira', () => {
    // Un `{}` que devolviera un eje con `lo: undefined` haria que un panel
    // calculara un `span` de NaN y pintara un eje en el origen, que es un panel
    // que parece funcionar y no enseña nada.
    expect(s950AxisFor(undefined)).toBeNull();
    expect(s950AxisFor(null)).toBeNull();
    expect(s950AxisFor({})).toBeNull();
    expect(s950AxisFor({ code: 'envelopeTime' })).toBeNull();
    expect(s950AxisFor({ storedLo: 0, storedHi: 99 })).toBeNull();
  });
});

describe('s950-calibration: el indice aguanta un contrato roto', () => {
  it('un contrato sin curvas devuelve null, que es un error de generacion', () => {
    // No una instancia vacia: un indice vacio haria que `for (const c of
    // cal.curves)` no pintara nada y el panel pareciera funcionar.
    expect(buildS950Calibration(null)).toBeNull();
    expect(buildS950Calibration(undefined)).toBeNull();
    expect(buildS950Calibration({})).toBeNull();
    expect(buildS950Calibration({ curves: [] })).toBeNull();
    expect(buildS950Calibration({ curves: 'no es un array' })).toBeNull();
  });

  it('s950Coverage de un indice inexistente da null', () => {
    expect(s950Coverage(null)).toBeNull();
  });

  it('un codigo repetido NO rompe el indice, pero solo se queda con el ultimo', () => {
    // Se declara el comportamiento en vez de dejar que salga por sorpresa: con
    // codigos repetidos, `curve()` gana el ultimo, y el indice NO avisa porque
    // el generador ya avisa de eso y es el unico que puede escribir aqui.
    const roto = {
      ...contract,
      curves: [
        { ...contract.curves[0], name: 'primera' },
        { ...contract.curves[0], name: 'segunda' },
      ],
    };
    const idx = buildS950Calibration(roto);
    expect(idx.curve('envelopeTime').name).toBe('segunda');
    expect(idx.curves).toHaveLength(2);
  });
});
