#!/usr/bin/env node
/**
 * PREFLIGHT: ningun contrato GENERADO puede llegar a la rama desfasado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL AGUJERO QUE ESTE FICHERO TAPONA.
 *
 * Hay tres generadores de contratos en este paquete y los tres aceptan
 * `--check`, que es la forma de preguntar "¿el contrato de la rama coincide con
 * lo que sale del codigo?". Los tres lo hacen bien: avisan del fichero, dicen
 * como se regenera y salen con codigo 1.
 *
 * Y aqui es donde esta el problema: los tres estan bien, y no se los corre
 * nadie a la vez.
 *
 * El patron de fallo no es que un generador este roto, que se veria. Es este:
 * alguien toca `S950Calibration.h` —una columna, un nombre, un rango—, se le
 * olvida el `pnpm generate:s950-cal`, y todo lo demas sigue en verde. El CI
 * pasa porque el `--check` no estaba en el CI. El PR entra. Y a partir de ahi
 * hay dos verdades sobre las curvas del S950: la del `.h` y la del `.json`, y
 * los paneles dibujan con la segunda mientras el motor lee la primera.
 *
 * Eso no es un contrato desfasado: es un contrato MENTIROSO. Un panel con ejes
 * viejos no se queja, porque un panel no sabe que los ejes viejos estan mal. Es
 * el peor fallo posible de un contrato, y por eso la puerta va aqui y no dentro
 * de un test de schemas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE UN SCRIPT Y NO UN TEST.
 *
 * Un test de vitest comprobaria lo mismo y seria mas comodo, pero el fallo que
 * se tapa aqui es un fallo DE ORDEN: el contrato se regenera en un commit y el
 * test llega tarde. Un preflight que se corre antes que la suite falla en el
 * sitio donde el error se introduce, que es la unica vez que alguien lo puede
 * arreglar sin coste. Y el test sigue haciendo falta para lo otro: que el
 * preflight exista, este cableado y siga funcionando. Eso si lo comprueba un test.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL REGISTRO, Y POR QUE NO SE ADIVINA.
 *
 * Los generadores se declaran aqui, en `CONTRATOS`. No se descubren
 * recorriendo `scripts/`, porque descubrir significa que un generador nuevo
 * nace fuera del preflight y por tanto nace invisible: el fichero de al lado se
 * registraria solo y el script nuevo no. Un inventario explicito se puede
 * olvidar de actualizar, y eso falla ruidosamente; uno automatico se puede
 * quedado corto en silencio. La segunda es la que estamos tapando.
 *
 * Y `generators` esta en el `package.json` por lo mismo: el preflight es
 * el unico sitio que decide, y lo demas lo consulta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALIDAS: 0 todo al dia, 1 algo desfasado, 2 el preflight no se puede correr.
 *
 * El 2 es distinto del 1 a proposito, y es el caso de aqui mismo: hay un
 * generador que hoy falla por una tabla rota y no por un contrato viejo. Si
 * eso devolviera 1, el mensaje seria "el contrato esta desfasado, regenera",
 * que es mentira —regenerar no arregla un parser roto— y el que lo lea
 * perderia el tiempo en el sitio equivocado. Un preflight que no distingue
 * "tu contrato esta viejo" de "no puedo ni mirar" miente igual que el
 * contrato que vigila.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Lee el `package.json` y falla si no se puede: sin el, este script miente. */
function manifiesto() {
  const ruta = join(root, 'package.json');

  if (!existsSync(ruta))
    throw new Error('no encuentro package.json en ' + root);

  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

/**
 * Los contratos GENERADOS, declarados aqui y no deducidos.
 *
 * `script`    el generador, relativo a la raiz del paquete.
 * `salidas`   los ficheros que tiene que producir. Se declaran aunque el script
 *             ya lo sepa, porque hay dos cosas distintas que verificar y es
 *             mejor que las dos sean explicitas: que el generador soporte
 *             `--check` y que TODO lo que dice producir este en el disco.
 * `scriptNpm` el nombre del script de `package.json`, para el mensaje.
 *
 * Si un generador nuevo anade una salida y no la declara aqui, el test de
 * `generatedContractsPreflight.test.js` lo pilla: compara lo declarado aqui con
 * lo que hay en disco y con lo que dice el propio generador.
 */
export const CONTRATOS = [
  {
    script: 'scripts/generate_modulation_contracts.py',
    scriptNpm: 'check:mod-contracts',
    salidas: [
      'abdeep_modulation_matrix.json',
      'abdms2000_modulation_matrix.json',
      'neuronik_modulation_matrix.json',
    ],
  },
  {
    script: 'scripts/generate_s950_patch_contract.py',
    scriptNpm: 'check:s950-contract',
    salidas: ['s950_patch_fields.json'],
  },
  {
    script: 'scripts/generate_s950_calibration_contract.py',
    scriptNpm: 'check:s950-cal',
    salidas: ['s950_calibration.json'],
  },
  // ── EL QUE NO TIENE GENERADOR, Y POR ESO SE DECLARA APARTE ──
  //
  // `fx-effects.json` declara `generatedFrom: ABDEep/.../FXSlot_Factory.cpp`, asi
  // que es un contrato GENERADO por definicion: un panel puede leer de donde sale
  // cada efecto. Y no hay ningun generador que lo produzca, ni ningun `--check`
  // que lo verifique. Se declara aqui con `script: null` a proposito, y el
  // preflight lo dice en voz alta en vez de dejar pasar el que si.
  //
  // Es el caso que hace que este fichero exista: un contrato que se declara
  // generado y que nadie regenera cuando su fuente cambia es un contrato que
  // MIENTE, y miente con la autoridad de un `generatedFrom` bien puesto. Un
  // panel creyera que lo que lee viene del codigo, y no viene de ahi.
  //
  // Ponerlo en el inventario es lo que lo hace visible. Dejarlo fuera haria que
  // este test —que recorre `contracts/` buscando `generatedFrom`— fallara, que
  // es justo lo que ha pasado: lo ha encontrado el test, no una lectura.
  {
    script: null,
    scriptNpm: null,
    salidas: ['fx-effects.json'],
    sinGenerador: true,
  },
];

/** Como se pide python. En Windows `python` y en Unix `python3` son cosas distintas. */
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

/** Cuanto puede tardar un `--check` antes de darse por colgado. 120 s por generador: uno lee codigo de otros repos, y eso es lento. */
const TIEMPO_MS = 120000;

/**
 * Corre un generador en modo `--check`.
 *
 * @returns {{codigo: number, salida: string, colgado: boolean, noExiste: boolean}}
 */
export function correrCheck(script) {
  const ruta = join(root, script);

  if (!existsSync(ruta))
    return { codigo: 2, salida: '', colgado: false, noExiste: true };

  const r = spawnSync(PYTHON, [ruta, '--check'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: TIEMPO_MS,
    windowsHide: true,
  });

  if (r.error) {
    // Un spawn que falla del todo suele ser python ausente. Se distingue del
    // caso de un generador que sale con 2, que es un problema de codigo.
    return { codigo: 2, salida: String(r.error.message ?? r.error), colgado: false, noExiste: false };
  }

  if (r.signal)
    return { codigo: 2, salida: `el proceso ha terminado con la senal ${r.signal}`, colgado: true, noExiste: false };

  return {
    codigo: typeof r.status === 'number' ? r.status : 2,
    salida: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    colgado: false,
    noExiste: false,
  };
}

/** Los `scripts.` de `package.json` cuyo nombre empieza por el prefijo dado. */
export function scriptsQueEmpiezanPor(man, prefijo) {
  return Object.keys(man.scripts ?? {}).filter((k) => k.startsWith(prefijo));
}

function main() {
  let man;

  try {
    man = manifiesto();
  } catch (exc) {
    console.error('PREFLIGHT: no puedo leer el manifiesto.');
    console.error(String(exc.message ?? exc));
    return 2;
  }

  // ── Que el inventario y el manifiesto no se hayan desincronizado ──
  //
  // Este script corre los generadores, pero el CI y los docs citan los
  // `scripts.` de `package.json`. Si uno de los de aqui no existe ahi, quien
  // lea el mensaje de fallo va a correr un comando que no existe y pierde el
  // rato justo cuando menos puede. Se avisa ANTES de correr nada.
  const sinGenerador = CONTRATOS.filter((c) => c.sinGenerador);

  const faltan = CONTRATOS.filter(
    (c) => !c.sinGenerador && !man.scripts?.[c.scriptNpm],
  );

  if (faltan.length > 0) {
    console.error('PREFLIGHT: el inventario y package.json no coinciden.');
    for (const c of faltan)
      console.error(`  falta el script "${c.scriptNpm}" para ${c.script}`);
    return 2;
  }

  console.log('PREFLIGHT de contratos generados');
  console.log('='.repeat(72));

  const desfasados = [];
  const ilegibles = [];

  for (const c of CONTRATOS) {
    // Un contrato que declara `generatedFrom` y no tiene generador se avisa y
    // se sigue. No se cuenta como desfasado —no se puede saber si lo esta— ni
    // se deja pasar en silencio, que es lo que hacia el inventario viejo.
    if (c.sinGenerador) {
      console.log(`  SIN GENERADOR  ${c.salidas.join(', ')}`);
      console.log('                 declara generatedFrom pero no hay script que lo regenere');
      continue;
    }

    const r = correrCheck(c.script);

    if (r.noExiste) {
      ilegibles.push(`${c.script}: el generador no existe`);
      console.log(`  SIN GENERADOR  ${c.script}`);
      continue;
    }

    if (r.codigo === 0) {
      console.log(`  al dia         ${c.salidas.join(', ')}`);
      continue;
    }

    // ── Aqui se separan las dos cosas que se parecian ──
    //
    // Codigo 2 y mas: el generador no ha podido LEER sus fuentes. No es que el
    // contrato este viejo, es que el preflight no puede saber si lo esta. Se
    // cuenta aparte y se dice aparte, porque arreglarlo y lo otro son cosas
    // distintas: uno se regenera, el otro se arregla.
    if (r.codigo === 2) {
      ilegibles.push(`${c.script}: no ha podido leer sus fuentes`);
      console.log(`  NO SE PUEDE    ${c.script} (salida ${r.codigo})`);
      if (r.colgado) console.log(`                 se ha colgado: puede ser que falte python`);
      for (const linea of r.salida.split('\n').filter(Boolean).slice(0, 4))
        console.log(`                 ${linea}`);
      continue;
    }

    desfasados.push(c);
    console.log(`  DESFASADO      ${c.salidas.join(', ')}`);

    for (const linea of r.salida.split('\n').filter(Boolean).slice(0, 6))
      console.log(`                 ${linea}`);
  }

  console.log('='.repeat(72));

  // ── El resumen: los dos fallos, y por qué son dos ──
  //
  // Se cuentan TODOS antes de salir. Un preflight que para en el primero es un
  // preflight que obliga a tres viajes para arreglar tres contratos, y el
  // tercero se queda sin comprobar hasta que alguien se acuerde.
  if (desfasados.length > 0) {
    console.log('');
    console.log(`DESFASADOS (${desfasados.length}):`);
    for (const c of desfasados) console.log(`  ${c.script}: ${c.salidas.join(', ')}`);
    console.log('');
    console.log('Un panel esta dibujando con un contrato viejo. Se regenera con:');
    // SOLO los comandos de los que estan desfasados, y nunca el del contrato sin
    // generador. Recorrer `CONTRATOS` entero aqui hacia dos cosas malas: el
    // `scriptNpm` del que no tiene generador es null y reventaba el script
    // entero —que es justo lo que hacia, caerse cuando hay algo que avisar— y
    // ademas ofrecia regenerar contratos que estan al dia, que es ruido que
    // manda a tocar ficheros que no hay que tocar.
    for (const c of desfasados) console.log(`  pnpm ${c.scriptNpm.replace(/^check:/, 'generate:')}`);
  }

  if (ilegibles.length > 0) {
    console.log('');
    console.log(`NO SE HAN PODIDO COMPROBAR (${ilegibles.length}):`);
    for (const i of ilegibles) console.log(`  ${i}`);
    console.log('');
    console.log('Esto NO es un contrato desfasado: es que el generador no ha podido');
    console.log('leer sus fuentes, asi que nadie sabe si el contrato esta al dia.');
    console.log('Regenerar no lo arregla. Mira la tabla que lee el generador.');
  }

  if (sinGenerador.length > 0) {
    console.log('');
    console.log(`SIN GENERADOR (${sinGenerador.length}):`);
    for (const c of sinGenerador) console.log(`  ${c.salidas.join(', ')}`);
    console.log('');
    console.log('Declaran `generatedFrom` pero no hay script que los regenere ni --check');
    console.log('que los vigile. Nadie sabe si estan al dia, y el campo dice que si.');
  }

  if (desfasados.length > 0 && ilegibles.length > 0) return 1;

  if (desfasados.length > 0) {
    console.log('');
    console.log('preflight FALLIDO. Nada de esto deberia llegar a la rama.');
    return 1;
  }

  if (ilegibles.length > 0) {
    console.log('');
    console.log('preflight INCOMPLETO: hay contratos que nadie ha podido comprobar.');
    return 2;
  }

  console.log('preflight OK: ningun contrato generado esta desfasado.');
  return 0;
}

// Solo cuando se ejecuta como programa. Importado desde un test, no.
if (process.argv[1] && existsSync(process.argv[1])
    && process.argv[1].replace(/\\/g, '/').endsWith('check-generated-contracts.mjs'))
  process.exit(main());
