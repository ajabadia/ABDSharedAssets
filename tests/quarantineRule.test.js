/**
 * La regla de cuarentena, en el sitio unico donde vive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE FICHERO EXISTE CUANDO YA HAY UN `schemaValidator.test.js` QUE
 * HABLA DE CUARENTENA.
 *
 * Porque son dos cosas distintas y probarlas en el mismo sitio las hacia
 * desaparecer. `schemaValidator.test.js` vigila que la LISTA de retenidos y el
 * `status` de los FICHEROS sean la misma verdad: es una comprobacion sobre el
 * dato de este repositorio, y si el catalogo esta bien, se pone verde aunque la
 * regla este mal.
 *
 * Este fichero vigila la REGLA, con datos inventados. Nada de lo que hay aqui
 * depende de como este el catalogo hoy, y por eso puede afirmar cosas que el
 * catalogo jamas va a poder exigir: que un estado desconocido NO retiene, que un
 * motivo en blanco no cuenta, que un esquema al que la regla no le aplica no se
 * complainta. Son las cuatro combinaciones que el catalogo limpio no tiene, y
 * son justo las que rompen cuando llegan.
 *
 * Y el otro motivo: las tres puertas. El registro de C++ del laboratorio, su
 * `SharedHardwareContractAdapter` y el preflight de aqui aplican la MISMA regla.
 * No se puede compartir el fichero entre C++ y JS, asi que cada lado tiene el
 * suyo y la unica forma de que no diverjan es que los dos comparen contra el
 * MISMO enum del esquema. Este fichero comprueba la mitad de JS; la de C++ es un
 * test suyo, y los dos son el mismo enunciado escrito en dos lenguajes.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  POLITICA,
  auditar,
  comprobarContraElEsquema,
  contratoDerivaIgual,
  esquemaAplica,
  esRetenido,
  estadosDeclaradosPorElEsquema,
  motivoDe,
  motivoParaMostrar,
  ningunEsquemaAplica,
  veredicto,
} from '../utils/quarantine.js';
import { auditarCuarentena } from '../scripts/check-generated-contracts.mjs';
import { leerReglaDelEsquema } from '../scripts/generar-cuarentena-cpp.mjs';

const CONTRACTS = join(process.cwd(), 'contracts');

const ESTADO = POLITICA.valorEstado;
const MOTIVO = 'una razon que alguien ha escrito a mano';

//==============================================================================
// LA REGLA, CON DATOS INVENTADOS.
//==============================================================================

describe('veredicto: solo el literal retiene, y dice por que', () => {
  it('un contrato sin nada raro no esta retenido', () => {
    expect(esRetenido({ id: 'korg_ms2000', displayName: 'MS2000' })).toBe(false);
    expect(veredicto({ id: 'korg_ms2000' })).toEqual({
      retenido: false, motivo: null, faltaMotivo: false,
    });
  });

  it('con la marca y su motivo, retenido y con el motivo', () => {
    const v = veredicto({ [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: MOTIVO });

    expect(v.retenido).toBe(true);
    expect(v.motivo).toBe(MOTIVO);
    expect(v.faltaMotivo).toBe(false);
    expect(motivoDe({ [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: MOTIVO }))
      .toBe(MOTIVO);
  });

  it('un estado casi igual NO retiene, y dice cual es el que si', () => {
    // La familia de los "casi", uno por uno, porque son el fallo que mas cuesta
    // ver: el autor del contrato Cree que ha marcado algo y no ha marcado nada.
    // Retenerlo "por las dudas" esconderia un Aparato que su autor da por bueno;
    // no retenerlo lo saca del cajon. Que avise, que es lo unico que no esconde.
    for (const casi of ['quarantine', 'Quarantined', 'quarantined ', 'quarantineds',
      'cuarentena', 'deprecated', 'draft', '', 'QUARANTINED']) {
      expect(esRetenido({ [POLITICA.campoEstado]: casi, [POLITICA.campoMotivo]: MOTIVO }),
        `"${casi}" no es el literal y no puede retener`).toBe(false);
    }
  });

  it('sin motivo, retenido igual pero con el texto de relleno y avisando', () => {
    // Retenido SIN motivo sigue retenido: el contrato es dudoso aunque no se
    // haya escrito por que. Lo que cambia es que sale `faltaMotivo`, para que
    // quien audita pueda decirlo en vez de repetir un texto inventado.
    const sinCampo = veredicto({ [POLITICA.campoEstado]: ESTADO });
    expect(sinCampo.retenido).toBe(true);
    expect(sinCampo.motivo).toBeNull();
    expect(sinCampo.faltaMotivo).toBe(true);
    expect(motivoParaMostrar({ [POLITICA.campoEstado]: ESTADO }))
      .toBe(POLITICA.motivoPorDefecto);

    // El de espacios tambien. Un motivo de un espacio es un motivo que no
    // explica nada, y aceptarlo hace que el texto de relleno no llegue a
    // usarse, con lo que nadie se entera de que falta.
    const enBlanco = veredicto({ [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: '   \n ' });
    expect(enBlanco.faltaMotivo).toBe(true);
    expect(enBlanco.motivo).toBeNull();
  });

  it('el motivo se limpia y se cuenta como presente si tiene contenido', () => {
    const v = veredicto({ [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: `  ${MOTIVO}  ` });
    expect(v.motivo).toBe(MOTIVO);
    expect(v.faltaMotivo).toBe(false);
  });

  it('una lista o un null no son un contrato y no retienen', () => {
    // No es un caso real del catalogo. Es el caso de un `contracts/` con un
    // `.json` que es un array: `props[campo]` sobre un array es `undefined` y
    // no revienta, pero un `null` en el medio de la lista si lo hace, y un
    // preflight que revienta no es un preflight, es una bomba.
    for (const basura of [null, [], ['quarantined'], 42, 'quarantined', undefined]) {
      expect(esRetenido(basura), `${JSON.stringify(basura)} no retiene`).toBe(false);
      expect(auditar('basura.json', basura).length, 'y hay que poder auditarlo')
        .toBeGreaterThan(0);
    }
  });
});

//==============================================================================
// LO QUE EL PREFLIGHT DICE DE CADA CASO.
//==============================================================================

describe('auditar: los tres fallos de verdad, y solo esos', () => {
  it('un contrato sano no da ningun problema', () => {
    expect(auditar('korg_ms2000.json', { id: 'korg_ms2000' })).toEqual([]);
    expect(auditar('roland_aira_submodules.json', {
      [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: MOTIVO,
    })).toEqual([]);
  });

  it('un estado que la regla no conoce se queja, y NO retiene', () => {
    const problemas = auditar('korg_ms2000.json', { [POLITICA.campoEstado]: 'quarantine' });

    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain('korg_ms2000.json');
    expect(problemas[0]).toContain('quarantine');
    // Y el motivo del mensaje: el valor que si, para no tener que abrir el
    // fichero a buscarlo.
    expect(problemas[0]).toContain(ESTADO);
  });

  it('retenido sin motivo se queja nombrando el campo que falta', () => {
    const problemas = auditar('korg_ms2000.json', { [POLITICA.campoEstado]: ESTADO });

    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain(POLITICA.campoMotivo);
  });

  it('un motivo que no es texto se queja UNA vez, y no como si faltara', () => {
    // Un problema, no dos. Los dos textos veros: "no hay motivo" y "el motivo
    // es de tipo number" describen el mismo fichero y son el mismo arreglo, y
    // un mensaje que sale dos veces por lo mismo entrena a ignorar el segundo.
    const problemas = auditar('korg_ms2000.json', {
      [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: 42,
    });

    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain('number');
  });

  it('y un JSON que no se puede leer NO es un problema de regla', () => {
    // Aqui `auditar` dice "no es un objeto JSON" y ya esta. Lo que sea que
    // haya pasado al leer el fichero lo cuenta otra cosa —`ilegibles` en el
    // preflight— porque son dos fallos distintos: uno se arregla editando un
    // campo y el otro mirando por que el fichero esta roto.
    expect(auditar('roto.json', null)[0]).toContain('no es un objeto');
  });
});

//==============================================================================
// LA REGLA CONTRA EL ESQUEMA: LA MITAD DE JS DEL PIN.
//==============================================================================

describe('la regla de JS y el enum del esquema son lo mismo', () => {
  const esquema = JSON.parse(readFileSync(join(CONTRACTS, 'hardware_profile.schema.json'), 'utf8'));

  it('el esquema de perfiles declara la marca, y el enum la contiene', () => {
    expect(esquemaAplica(esquema)).toBe(true);
    expect(estadosDeclaradosPorElEsquema(esquema)).toContain(POLITICA.valorEstado);
    expect(comprobarContraElEsquema(esquema)).toEqual([]);
  });

  it('si el enum pierde el valor, la regla queda sin poder aplicarse', () => {
    const otros = {
      properties: {
        [POLITICA.campoEstado]: { enum: ['deprecated'] },
        [POLITICA.campoMotivo]: { type: 'string' },
      },
    };

    const problemas = comprobarContraElEsquema(otros);
    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain(POLITICA.valorEstado);
  });

  it('si el enum declara mas de un valor, se queja del que la regla no conoce', () => {
    // El caso que de verdad duele: alguien anade `deprecated` al enum porque es
    // un estado razonable, y no actualiza la regla. El laboratorio no va a
    // retener ese contrato, porque solo conoce un valor, y este repo tampoco lo
    // vigila. Dos verdades sobre si ese Aparato se muestra, y el fallo es
    // invisible justamente porque los dos lados hacen lo que les dicen.
    const dos = {
      properties: {
        [POLITICA.campoEstado]: { enum: [POLITICA.valorEstado, 'deprecated'] },
        [POLITICA.campoMotivo]: { type: 'string' },
      },
    };

    const problemas = comprobarContraElEsquema(dos);
    expect(problemas.length).toBe(1);
    expect(problemas[0]).toContain('deprecated');
  });

  it('un esquema al que la regla NO le aplica no se queja, y no cuenta como aplicable', () => {
    // De los seis esquemas del catalogo, cinco no declaran `status`: gobiernan
    // efectos de FX, matrices de modulacion y campos de patch, que no son un
    // Aparato y no tienen por que poder marcarse. Pedirles el campo pondria en
    // rojo una rama que esta bien, y un rojo falso es como un preflight deja de
    // importarce.
    const fx = JSON.parse(readFileSync(join(CONTRACTS, 'fx-effects.schema.json'), 'utf8'));
    expect(esquemaAplica(fx)).toBe(false);

    // Y el que lo invoca sin querer lo paga: comparar un esquema al que no le
    // aplica tiene que decir que el error es del que compara.
    expect(comprobarContraElEsquema(fx)[0]).toContain('fallo de este codigo');
  });

  it('pero que NINGUN esquema pueda aplicarla si es un fallo', () => {
    // El agujero que el punto anterior deja abierto. Sin esta comprobacion,
    // quitar `status` del esquema de perfiles deja la cuarentena sin poder
    // usarse en ninguna parte del mundo y no hay ni un rojo.
    const fx = JSON.parse(readFileSync(join(CONTRACTS, 'fx-effects.schema.json'), 'utf8'));
    expect(ningunEsquemaAplica([fx])).toBe(true);
    expect(ningunEsquemaAplica([fx, esquema])).toBe(false);
  });
});

//==============================================================================
// LA PUERTA: EL PREFLIGHT USA LA MISMA REGLA Y LA CUENTA.
//==============================================================================

describe('el preflight vigila la cuarentena, y no se la inventa', () => {
  const r = auditarCuarentena(CONTRACTS);

  it('lee el catalogo entero sin quejarse de nada', () => {
    expect(r.leidos).toBeGreaterThan(0);
    expect(r.ilegibles).toEqual([]);
    expect(r.problemas).toEqual([]);
  });

  it('y lista los retenidos CON SU MOTIVO, no solo el numero', () => {
    // El motivo es lo que hace que este dato valga la pena imprimirlo. Un
    // recuento obliga a abrir el repo para entender por que falta un Aparato.
    expect(r.retenidos.length).toBeGreaterThan(0);

    for (const retenido of r.retenidos) {
      expect(retenido.nombre).toMatch(/\.json$/);
      expect(retenido.motivo.length).toBeGreaterThan(0);
      expect(retenido.motivo).not.toBe(POLITICA.motivoPorDefecto);
    }
  });

  it('los retenidos que lista son EXACTAMENTE los que la regla dice', () => {
    // La comprobacion de que la puerta usa la regla y no una copia suya. Una
    // lista propia dentro del preflight seria una segunda verdad, y la segunda
    // verdad es justo lo que este trabajo lleva tres commits tapando.
    const aFichero = new Set();

    for (const nombre of readdirSync(CONTRACTS)) {
      if (!nombre.endsWith('.json') || nombre.endsWith('.schema.json')) continue;
      const contrato = JSON.parse(readFileSync(join(CONTRACTS, nombre), 'utf8'));
      if (esRetenido(contrato)) aFichero.add(nombre);
    }

    expect(r.retenidos.map((x) => x.nombre).sort()).toEqual([...aFichero].sort());
  });

  it('y la puerta muerde de verdad, con un catalogo roto a proposito', () => {
    // Con datos inventados, en un directorio temporal. El catalogo de verdad
    // esta bien hoy, y un test que solo puede romperse cuando el catalogo se
    // rompe no vigila la puerta: la acompana. Lo que se comprueba aqui es que
    // la puerta FUNCIONA, y eso se hace rompiendola a proposito.
    const dir = mkdtempSync(join(tmpdir(), 'abd_cuarentena_'));

    const escribir = (nombre, cuerpo) =>
      writeFileSync(join(dir, nombre), `${JSON.stringify(cuerpo, null, 2)}
`, 'utf8');

    // Un esquema, y uno al que la regla NO le aplica: gobierna otra cosa y no
    // declara `status`. Y eso, por si solo, ya es un problema: una regla que
    // ningun esquema puede aplicar no esta vigente, por muy escrita que este.
    // Sin este esquema el caso no se puede probar, porque un catalogo sin
    // esquemas no es un fallo —no hay nada que declarar— y el codigo lo trata
    // como tal, a proposito.
    escribir('otro.schema.json', { properties: { id: { type: 'string' } } });
    escribir('sano.json', { id: 'korg_ms2000' });
    escribir('retenido.json', { [POLITICA.campoEstado]: ESTADO, [POLITICA.campoMotivo]: MOTIVO });
    escribir('sin_motivo.json', { [POLITICA.campoEstado]: ESTADO });

    const r = auditarCuarentena(dir);

    expect(r.ilegibles).toEqual([]);
    expect(r.leidos).toBe(3);
    expect(r.retenidos.map((x) => x.nombre).sort())
      .toEqual(['retenido.json', 'sin_motivo.json']);

    // El de sin motivo sale con el texto de relleno, que es lo que el
    // laboratorio enseñaria, y sale ADEMAS como problema. Las dos cosas a la
    // vez, y no una o la otra: que salga con relleno sin quejarse es el fallo.
    const sinMotivo = r.retenidos.find((x) => x.nombre === 'sin_motivo.json');
    expect(sinMotivo.motivo).toBe(POLITICA.motivoPorDefecto);

    // Dos problemas, y en dos sitios distintos del array. Se comprueba por
    // pertenencia y no por posicion a proposito: el orden en que se listan no
    // es un contrato, y un test que lo fija se rompe cuando se reordena el
    // mensaje sin que nada haya cambiado.
    const porEsquema = r.problemas.filter((p) => p.includes('ningun esquema declara'));
    const porMotivo = r.problemas.filter((p) => p.includes('sin_motivo.json'));

    expect(porEsquema.length).toBe(1);
    expect(porMotivo.length).toBe(1);
    expect(r.problemas.length).toBe(2);

    // Y un JSON roto es ILEGIBLE, no un problema de regla. Por eso van en
    // listas distintas: se arreglan distinto y un mensaje que los mezcla
    // obliga a abrir el fichero para saber cual de los dos es.
    writeFileSync(join(dir, 'roto.json'), '{ esto no es json', 'utf8');
    const conRoto = auditarCuarentena(dir);

    expect(conRoto.ilegibles.length).toBe(1);
    expect(conRoto.ilegibles[0]).toContain('roto.json');
    expect(conRoto.leidos).toBe(3);
  });
});


//──────────────────────────────────────────────────────────────────────────────
// EL RENOMBRADO, QUE ES EL FALLO QUE ESTA COMPROBACION EXISTE PARA VER
//──────────────────────────────────────────────────────────────────────────────

describe("el enum que deriva el generador es el del estado, y no otro", () => {

  // El fallo, medido antes de escribir esta comprobacion. Con `status` renombrado
  // a `estado` y `statusReason` a `estadoReason`, que es como migra alguien que
  // sabe lo que hace, el generador escribia una cabecera mirando `estado` y salia
  // con un verde de "escrita". El dato seguia diciendo `status`. La
  // cabecera y el DATO ya no hablaban, el laboratorio iba a dejar de retener en
  // silencio, y el unico rojo posible era el de otra puerta, cuando el contrato ya
  // se leia como sano. Y el mensaje de arreglo decia regenera, que es justo lo que
  // fijaba el error.
  //
  // El criterio mecanico no lo podia ver: el unico enum de un valor sigue siendo
  // cierto despues del renombrado. Lo unico que cambia es DE QUE enum se trata, y
  // para eso hace falta un segundo origen, que es `POLITICA`.

  it("la regla que sale del enum es la misma que la regla declarada", () => {
    const problemas = contratoDerivaIgual(leerReglaDelEsquema());
    expect(problemas).toEqual([]);
  });

  it("los NOMBRES estan pineados contra texto fijo, no contra si mismos", () => {
    // Un test que comparase la regla consigo misma no morderia. El fallo que se
    // vigila es un renombrado COHERENTE, en el que el enum y los datos se van
    // juntos y no se rompe nada por el camino: la unica manera de verlo es contra
    // un texto escrito aqui.
    const r = leerReglaDelEsquema();

    expect(r.campoEstado).toBe('status');
    expect(r.valorEstado).toBe('quarantined');
    expect(r.campoMotivo).toBe('statusReason');
  });

  it("un renombrado del campo y del motivo se quejaria de los DOS", () => {
    const renombrado = {
      campoEstado: 'estado',
      valorEstado: 'quarantined',
      campoMotivo: 'estadoReason',
    };

    const problemas = contratoDerivaIgual(renombrado);

    // Dos de los tres, no uno: el valor no se ha movido y por eso no se queja.
    // El mensaje tiene que decir CUAL de los dos nombres va con cual, o no sirve
    // para arreglar nada.
    expect(problemas.filter((p) => p.includes('estado')).length).toBe(2);
    expect(problemas.filter((p) => p.includes('estadoReason')).length).toBe(1);
    expect(problemas.some((p) => p.includes('quarantined'))).toBe(false);

    // Y nombra tambien el lado declarado, que es el que dice el mensaje viejo.
    expect(problemas.join(' ')).toContain('status');
  });

  it("avisa de que regenerar NO es el arreglo", () => {
    // Este mensaje es la parte que evita el fallo de verdad. Sin el, el generador
    // decia regenera y regenerar escribia la cabecera rota. Un mensaje de
    // arreglo equivocado es peor que ninguno: convierte un rojo en un rojo con
    // una accion que empeora las cosas.
    const problemas = contratoDerivaIgual({
      campoEstado: 'estado',
      valorEstado: 'quarantined',
      campoMotivo: 'estadoReason',
    });

    const texto = problemas.join(' ');
    expect(texto).toContain('NO lo arregla');
    expect(texto).toContain('Regenerar');
  });

  it("un cambio en el VALOR tambien se queja, y es otro fallo", () => {
    // No es un renombrado: es una marca nueva, y el mismo enum de un valor. El
    // criterio del generador lo aceptaria sin pestanear, asi que sin esta
    // comparacion un cambio de valor tambien pasaria desapercibido.
    const otroValor = {
      campoEstado: 'status',
      valorEstado: 'deprecated',
      campoMotivo: 'statusReason',
    };

    const problemas = contratoDerivaIgual(otroValor);
    expect(problemas.filter((p) => p.includes('deprecated')).length).toBe(1);
  });

  it("algo que no es una regla se dice, en vez de comparar undefined", () => {
    // Si el generador devolviera null, comparar sin mirar daria tres
    // desacuerdos que hablan de `undefined`, que no son un renombrado: son un
    // fallo antes de tiempo, y se arregla distinto.
    expect(contratoDerivaIgual(null)).toHaveLength(1);
    expect(contratoDerivaIgual(undefined)).toHaveLength(1);
    expect(contratoDerivaIgual(null)[0]).toContain('object');
  });
});
