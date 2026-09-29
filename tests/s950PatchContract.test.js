/**
 * El contrato de patches del S950 y el índice que lo consume.
 *
 * QUÉ COMPRUEBA ESTE FICHERO, Y POR QUÉ SON TRES COSAS DISTINTAS.
 *
 * 1. QUE EL ESQUEMA SE EJECUTA ENTERO. No basta con que el contrato pase: un
 *    esquema con palabras que el validador no ejecuta parece que avisa y no
 *    avisa de nada, que es peor que no tener esquema. Por eso se llama a
 *    `unsupportedKeywords()` y tiene que salir vacío.
 *
 * 2. QUE EL CONTRATO ES COHERENTE. Estas reglas son las MISMAS que comprueban
 *    los tests de C++ en `SynthCoreTests.cpp`, escritas otra vez en el otro
 *    lenguaje. No es duplicación gratuita: el C++ no ve el JSON y el JS no ve el
 *    C++, y la única costura entre los dos es este fichero. Si el JSON se
 *    corrompiera al generarse —una fila a medias, un número como cadena— estos
 *    tests lo cazan aquí y no en el motor.
 *
 * 3. QUE ESTÁ AL DÍA. El generador tiene modo `--check`; un contrato
 *    desfasado respecto a la tabla de C++ significa un panel enseñando lo
 *    viejo, y eso no se ve en ningún test de JavaScript.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate, unsupportedKeywords, readContract, readSchema } from './helpers/validateSchema.js';
import {
  buildS950Catalogue,
  formatS950Name,
  isS950Bipolar,
  S950_ENCODINGS,
  S950_GROUPS,
} from '../components/s950PatchFields.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const contract = readContract('s950_patch_fields.json');
const schema = readSchema('s950-patch-fields.schema.json');

describe('s950-patch-fields: el esquema se ejecuta entero', () => {
  it('el contrato valida contra el esquema', () => {
    expect(validate(contract, schema)).toEqual([]);
  });

  it('el esquema no tiene palabras que el validador no ejecute', () => {
    // Si esta lista crece, la respuesta NO es apuntar la palabra aqui: es
    // anadirle soporte al validador primero. Un esquema con cosas que nadie
    // ejecuta es peor que no tener esquema, porque parece que avisa.
    expect(unsupportedKeywords(schema)).toEqual([]);
  });

  it('el $schema apunta a este mismo esquema', () => {
    expect(contract.$schema).toBe('./s950-patch-fields.schema.json');
  });

  it('declara de donde sale, que es lo que separa una copia de una fuente', () => {
    expect(contract.generatedFrom).toBe('ABDSharedCode/SynthCore/S950PatchFields.h');
    expect(contract.sourceOfTruth).toBe('ABDSharedCode/SynthCore/S950PatchFields.h');
  });
});

describe('s950-patch-fields: el generador esta al dia', () => {
  it('el contrato commiteado coincide con lo que sale del catalogo de C++', () => {
    // El fallo que esto caza: alguien anade un campo a S950PatchFields.h, no
    // regenera, y un panel sigue enseñando 38 controles. Aqui no se ve nada
    // raro, asi que sin este check el desfase dura hasta el siguiente patch.
    const out = execFileSync('python', ['scripts/generate_s950_patch_contract.py', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('al dia');
  });
});

describe('s950-patch-fields: la forma del catalogo', () => {
  it('tiene los 38 campos de un keygroup del S950', () => {
    // El 38 no es un numero redondo: es el numero de campos que tiene un
    // keygroup, y esta fijado en el generador y en los tests de C++ igual.
    expect(contract.fields).toHaveLength(38);
  });

  it('tiene los 18 trims de Perform y las 11 salidas', () => {
    expect(contract.performTrims).toHaveLength(18);
    expect(contract.outputPorts).toHaveLength(11);
  });

  it('todo byte cae dentro del registro de 70', () => {
    // Un byteOffset de 74 no es "casi vale": lee la cabecera del keygroup
    // siguiente, y como el keygroup puede empezar en cualquier punto de un
    // programa encadenado, la lectura sigue siendo valida y devuelve basura
    // con toda naturalidad.
    const size = contract.geometry.keygroupRecordSize;
    for (const f of contract.fields) {
      expect(f.byteOffset, `${f.code} dentro del registro`).toBeGreaterThanOrEqual(0);
      expect(f.byteOffset, `${f.code} dentro del registro`).toBeLessThan(size);
    }
  });

  it('dos campos no se pisan en el mismo byte, salvo los flags', () => {
    // Dos campos en el mismo byte con la misma codificacion son un byte con dos
    // verdades, y el que escriba ultimo gana sin avisar. Los Bit SI pueden
    // compartir byte, y DEBEN: es lo que hace posible cambiar uno sin perder
    // los otros tres.
    for (let i = 0; i < contract.fields.length; i++) {
      for (let j = i + 1; j < contract.fields.length; j++) {
        const a = contract.fields[i];
        const b = contract.fields[j];
        if (a.byteOffset !== b.byteOffset) continue;
        if (a.encoding === 'Bit' && b.encoding === 'Bit') continue;
        expect(`${a.code}/${b.code} byte ${a.byteOffset}`).toBe('');
      }
    }
  });

  it('los codigos son unicos, porque un preset los referencia por codigo', () => {
    const codes = contract.fields.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('los rangos no estan al reves y caben en su byte', () => {
    for (const f of contract.fields) {
      expect(f.lo, `${f.code} con lo<=hi`).toBeLessThanOrEqual(f.hi);
      expect(f.hi, `${f.code} cabe en el byte`).toBeLessThanOrEqual(255);
      expect(f.lo, `${f.code} cabe en el byte`).toBeGreaterThanOrEqual(-128);
    }
  });

  it('los con signo van de -50 a +50, que es lo que imprime el panel', () => {
    // La regla se fija para que un Signed nuevo no se cuele con 0..99 y luego
    // produzca un byte que significa otra cosa.
    for (const f of contract.fields.filter((x) => x.encoding === 'Signed')) {
      expect([f.lo, f.hi], `${f.code} con signo`).toEqual([-50, 50]);
    }
  });

  it('todo campo tiene nombre, grupo y unidad', () => {
    // Un nombre vacio no rompe nada al compilar: rompe el panel, en un sitio
    // donde nadie mira hasta que sale un control sin etiqueta.
    for (const f of contract.fields) {
      expect(f.name.length, `${f.code} con nombre`).toBeGreaterThan(0);
      expect(f.group.length, `${f.code} con grupo`).toBeGreaterThan(0);
      expect(f.unit.length, `${f.code} con unidad`).toBeGreaterThan(0);
      expect(S950_GROUPS, `${f.code} en una pestaña real`).toContain(f.group);
    }
  });

  it('los fines de zona van 0..255, que es el byte bajo de una altura de 16 bits', () => {
    // El detalle que hace que esto sea una tabla y no un array: el fine y el
    // transpose son el byte bajo y el alto de un offset en dieciseiseavos de
    // semitono. Recortarlos a 99 seria un cuarto de tono de error que no da
    // ningun fallo.
    for (const code of ['softFine', 'loudFine']) {
      const f = contract.fields.find((x) => x.code === code);
      expect([f.lo, f.hi], code).toEqual([0, 255]);
    }
  });

  it('el switch de velocidad va 1..128, y el 128 es "no hay segunda zona"', () => {
    // El rango empieza en 1 porque el 0 es el hueco que deja el switch cuando no
    // hay nada que repartir, y una velocidad MIDI llega a 127: nunca a 128.
    const sw = contract.fields.find((x) => x.code === 'velocitySwitch');
    expect([sw.lo, sw.hi]).toEqual([1, 128]);
    expect(sw.hi).toBe(contract.geometry.keygroupVelocityCount);
  });

  it('el puerto va 0..10, con ALL al principio y LEFT/RIGHT al final', () => {
    const port = contract.fields.find((x) => x.code === 'outputPort');
    expect([port.lo, port.hi]).toEqual([0, 10]);
    expect(contract.outputPorts[0].name).toBe('ALL');
    expect(contract.outputPorts[9].name).toBe('LEFT');
    expect(contract.outputPorts[10].name).toBe('RIGHT');
  });

  it('ninguna salida se queda muda', () => {
    for (const p of contract.outputPorts) {
      expect(p.left + p.right, `${p.name} no se queda muda`).toBeGreaterThan(0);
    }
  });
});

describe('s950-patch-fields: los flags del byte 18', () => {
  it('son cuatro, con bits distintos y rango 0..1', () => {
    const flags = contract.fields.filter((f) => f.encoding === 'Bit');
    expect(flags).toHaveLength(4);

    const masks = new Set();
    for (const f of flags) {
      expect([f.lo, f.hi], `${f.code} es 0 o 1`).toEqual([0, 1]);
      expect(f.bitMask, `${f.code} es un bit suelto`).toBeGreaterThan(0);
      // Un numero y su potencia de dos: (n & (n-1)) === 0
      expect(f.bitMask & (f.bitMask - 1), `${f.code} mascara de un bit`).toBe(0);
      expect(masks.has(f.bitMask), `${f.code} no repite mascara`).toBe(false);
      masks.add(f.bitMask);
    }
  });

  it('viven en el byte 18 y cubren exactamente lo conocido', () => {
    const flags = contract.fields.filter((f) => f.encoding === 'Bit');
    for (const f of flags) expect(f.byteOffset).toBe(contract.geometry.keygroupFlagsByte);

    // Los cuatro conocidos cubren 0x1D, y lo que queda dentro del byte es de
    // alguien que todavia no lo ha descifrado. Esta comprobacion es la que
    // obliga a que las dos mascaras sigan siendo verdad a la vez.
    const sum = flags.reduce((acc, f) => acc | f.bitMask, 0);
    expect(sum).toBe(contract.geometry.knownFlagsMask);
    expect(sum & contract.geometry.reservedBitMask).toBe(0);
  });
});

describe('s950-patch-fields: los trims de Perform', () => {
  it('apuntan a campos que existen', () => {
    // Un trim que mueve un campo que ya no esta en la tabla es un mando que no
    // hace nada, y no da ningun error: simplemente se queda ahi.
    const codes = new Set(contract.fields.map((f) => f.code));
    for (const t of contract.performTrims) {
      if (t.fieldCode === '') continue;
      expect(codes, `el trim ${t.code} mueve un campo real`).toContain(t.fieldCode);
    }
  });

  it('el trimId de un campo, si lo tiene, existe como trim', () => {
    const trims = new Set(contract.performTrims.map((t) => t.code));
    for (const f of contract.fields) {
      if (f.trimId === '') continue;
      expect(trims, `${f.code} apunta a un trim real`).toContain(f.trimId);
    }
  });

  it('el offset es mas estrecho que el campo que mueve, o no cabe', () => {
    // Un offset de 99 sobre un campo de 0..50 no es un mando que llega lejos,
    // es un mando cuyo valor se sale. La INVERSA no se exige y no es un olvido:
    // el VCF amount lleva 50 sobre un campo que recorre 100, y no llega a los
    // dos extremos desde cualquier sitio, que es una decision medida.
    for (const t of contract.performTrims) {
      if (t.fieldCode === '') continue;
      const f = contract.fields.find((x) => x.code === t.fieldCode);
      const reach = Math.max(Math.abs(t.lo), Math.abs(t.hi));
      expect(reach, `${t.code} cabe sobre ${t.fieldCode}`).toBeLessThanOrEqual(f.hi - f.lo);
    }
  });

  it('el VCF amount es la excepcion, y se fija a mano', () => {
    // Sin esta comprobacion, alguien que lo "arreglara" poniendo 100 pasaria el
    // test general de arriba sin que nadie supiera que ha estropeado un mando
    // que ya funcionaba.
    const t = contract.performTrims.find((x) => x.code === 'vcfAmount');
    const f = contract.fields.find((x) => x.code === 'vcfAmount');
    expect([t.lo, t.hi]).toEqual([-50, 50]);
    expect(f.hi - f.lo).toBe(100);
  });

  it('las envolventes si llegan a los dos extremos, con 99', () => {
    // Un span de 99 deja llevar un decay de 80 a 0 y uno de 5 a 99. El coste es
    // que el centro del mando no es el centro del rango, y es el intercambio
    // correcto: el centro es "como estaba grabado".
    for (const code of ['vcaAttack', 'vcaDecay', 'vcaSustain', 'vcaRelease',
      'vcfAttack', 'vcfDecay', 'vcfSustain', 'vcfRelease']) {
      const t = contract.performTrims.find((x) => x.code === code);
      expect([t.lo, t.hi], code).toEqual([-99, 99]);
    }
  });

  it('cada trim es bipolar, profundidad, o absoluto: y nunca dos cosas', () => {
    // Las profundidades solo suman. Casi todos los patches de la biblioteca
    // dejan la profundidad del LFO en 0, asi que un mando simetrico gastaria
    // media vuelta pidiendo menos que nada.
    const depths = new Set(['lfoDepth', 'velToFilter', 'velToLoudness', 'lfoToFilter', 'resonance']);
    const absolutes = new Set(['lfoShape']);

    for (const t of contract.performTrims) {
      const classes = Number(t.bipolar) + Number(depths.has(t.code)) + Number(absolutes.has(t.code));
      expect(classes, `${t.code} es una sola cosa`).toBe(1);
      if (t.bipolar) {
        expect(t.lo, `${t.code} bipolar cruza el cero`).toBeLessThan(0);
        expect(t.hi, `${t.code} bipolar cruza el cero`).toBeGreaterThan(0);
      }
    }
  });

  it('solo hay un trim absoluto: la forma del LFO, que no esta en el disco', () => {
    // Un indice de cuatro formas no es un offset: no hay nada en el keygroup
    // que offsetear, asi que es un valor absoluto y se dice.
    const absolutes = contract.performTrims.filter((t) => t.fieldCode === '');
    expect(absolutes.map((t) => t.code).sort())
      .toEqual(['lfoShape', 'lfoToFilter', 'resonance']);
  });
});

describe('s950PatchFields: el indice del componente', () => {
  const cat = buildS950Catalogue(contract);

  it('indexa por codigo, y un codigo que no existe es undefined', () => {
    expect(cat.field('softFine').byteOffset).toBe(42);
    expect(cat.field('noExiste')).toBeUndefined();
  });

  it('un flag y un campo no se confunden aunque los dos accepten 0 y 1', () => {
    expect(cat.flag('oneShot').bitMask).toBe(0x08);
    // `vcaSustain` acepta 0 y 1 como un valor cualquiera, pero no es un bit.
    expect(cat.flag('vcaSustain')).toBeUndefined();
  });

  it('dice que campos comparten byte, que es lo que obliga a leer-modificar', () => {
    // La pregunta que hay que hacer ANTES de escribir en un byte. Salir sin
    // ella es perder el otro campo, y el bit reservado con el.
    const sharing = cat.sharingByte(18);
    expect(sharing).toHaveLength(4);
    expect(sharing.every((f) => f.encoding === S950_ENCODINGS.BIT)).toBe(true);
    expect(cat.sharingByte(4)).toHaveLength(1);
  });

  it('pagina por la pestana del panel, en el orden de la tabla', () => {
    const filter = cat.page('FILTER');
    expect(filter.length).toBeGreaterThan(0);
    // El orden es parte del contrato: es como un panel los va a buscar.
    const idx = filter.map((f) => contract.fields.indexOf(f));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('devuelve el trim que mueve un campo', () => {
    expect(cat.trimFor('softFilter').code).toBe('vcfCutoff');
    // Un campo con trimId vacio no tiene trim, y eso es una respuesta.
    expect(cat.trimFor('softFine')).toBeUndefined();
  });

  it('indexa las salidas por valor y por codigo', () => {
    expect(cat.port(0).name).toBe('ALL');
    expect(cat.port(10).name).toBe('RIGHT');
    expect(cat.portByCode('mono3').panelValue).toBe(3);
  });

  it('suma el trim y RECORTA al rango del campo', () => {
    expect(cat.effectiveValue('vcaDecay', 50, 20)).toBe(70);
    // El recorte importa: un offset de +99 sobre un campo que acaba en 50 no es
    // un mando que llega lejos. Un panel que sumara sin recortar ensenaria un
    // 149 donde el motor suena con 50.
    expect(cat.effectiveValue('vcfAmount', 50, 50)).toBe(50);
    expect(cat.effectiveValue('vcfAmount', -50, -50)).toBe(-50);
    expect(cat.effectiveValue('vcaDecay', 50, -99)).toBe(0);
    expect(cat.effectiveValue('noExiste', 1, 1)).toBeUndefined();
  });

  it('un contrato sin campos devuelve null, que es un error de generacion', () => {
    expect(buildS950Catalogue(null)).toBeNull();
    expect(buildS950Catalogue({})).toBeNull();
    expect(buildS950Catalogue({ fields: [] })).toBeNull();
  });
});

describe('s950PatchFields: los nombres', () => {
  it('el contrato guarda el nombre CRUDO de la maquina', () => {
    // Un contrato que maqueta se queda viejo el dia que el panel cambie su
    // estilo, y entonces el desfase parece del panel cuando es del dato.
    expect(contract.outputPorts[0].name).toBe('ALL');
  });

  it('la tipografia la pone quien pinta, en el componente', () => {
    expect(formatS950Name('ALL')).toBe('All');
    expect(formatS950Name('MONO1')).toBe('Mono 1');
    expect(formatS950Name('MONO8')).toBe('Mono 8');
    expect(formatS950Name('LEFT')).toBe('Left');
    expect(formatS950Name('VCF amount')).toBe('Vcf amount');
  });
});

describe('s950PatchFields: bipolar', () => {
  it('se DERIVA del rango, en vez de ser una columna mas', () => {
    // Si el rango cambia, esto cambia con el y no puede quedarse viejo. Por eso
    // no esta en el JSON: la columna se desfasaria el dia que cambiara un
    // rango, y nadie se enteraria.
    const cat = buildS950Catalogue(contract);

    // Con signo: bipolar.
    expect(isS950Bipolar(cat.field('vcfAmount'))).toBe(true);
    expect(isS950Bipolar(cat.field('warpDepth'))).toBe(true);
    // Sin signo que no cruza el cero: no.
    expect(isS950Bipolar(cat.field('vcaDecay'))).toBe(false);
    // El fine, que llega a 255 pero no baja de 0: no, y es el caso que importa,
    // porque es el unico con `hi` > 99 que no es bipolar.
    expect(isS950Bipolar(cat.field('softFine'))).toBe(false);
    // Un flag no es bipolar por tener rango 0..1: es un bit, no un mando.
    expect(isS950Bipolar(cat.flag('oneShot'))).toBe(false);
  });

  it('los controles solo ascendentes del panel se pintan como no bipolar', () => {
    const cat = buildS950Catalogue(contract);
    // La profundidad del LFO va 0..99: un mando centrado haria que la mitad de
    // su recorrido pidiera menos que nada.
    for (const code of ['lfoDepth', 'velToFilter', 'velToLoudness']) {
      expect(isS950Bipolar(cat.field(code)), code).toBe(false);
    }
  });
});
