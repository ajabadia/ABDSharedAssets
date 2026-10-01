// Declara en `hardware_profile.schema.json` los campos que los contratos de
// hardware YA usan y el esquema no declaraba.
//
// El cambio va en un sentido por una razon: los contratos son de otras sesiones
// y los usa codigo que ya esta en produccion (`HardwareContractRegistry` los
// lee). Renombrar `minVal` a `min` en doce ficheros para que el esquema quede
// mas bonito es perder. El esquema es el que se pone al dia.
//
// Y no se inventa: cada campo que se anade se ha leido en los 28 contratos
// primero, con su tipo y su rango REAL. El script falla si la forma no es la
// que se espera, para que esto no sea una cita de memoria.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fichero = path.resolve(aqui, '..', 'contracts', 'hardware_profile.schema.json');
const ORIGINAL = readFileSync(fichero, 'utf8');
const esquema = JSON.parse(ORIGINAL);

const propiedades = esquema.properties;
const funcion = propiedades.functions.items;
const control = funcion.properties.controls.items;

// ── RAIZ: `isSoftsynth` ──
//
// `abd_sm002.json` lo trae a `true`: es un MS2000 emulado en software. El
// `deviceType` del esquema no tiene ningun valor que diga "esto no es una
// maquina" —los siete son de hardware o de mock— asi que el unico sitio donde
// el contrato puede decirlo es un campo propio, y ese campo no estaba
// declarado. Con la puerta cerrada, esto habria sido un rojo.
if ('isSoftsynth' in propiedades) throw new Error('isSoftsynth ya estaba declarado');
propiedades.isSoftsynth = {
  type: 'boolean',
  description:
    'true si esto emula hardware en software en lugar de describir una maquina fisica. ' +
    'Existe porque `deviceType` no tiene ningun valor de software: sin este campo, un ' +
    'perfil emulado y uno real son indistinguibles para quien lo lee.',
};

// ── CONTROL: los cuatro nombres que usan los 28 contratos ──
//
// El esquema declaraba `min`/`max`/`default` y `cc`/`midiCC`. Los contratos
// usan `minVal`/`maxVal`/`defaultVal` y `ccNumber`, en 48, 48, 48 y 36 sitios
// respectivamente. Se declaran LOS DOS, y no se quita ninguno: quitar `min` no
// rompe este contrato, pero no sabemos de quien es.
//
// Los rangos de `ccNumber` se han medido en los contratos: 36 valores, del 16
// al 81, todos enteros. Se declara con el mismo -1..127 que el `cc` de al lado,
// que es el rango del protocolo MIDI, no el rango que hoy se usa.
if ('minVal' in control.properties) throw new Error('minVal ya estaba declarado');
control.properties.minVal = { type: 'number', description: 'Valor minimo del control. Contrapartida de `min`.' };
control.properties.maxVal = { type: 'number', description: 'Valor maximo del control. Contrapartida de `max`.' };
control.properties.defaultVal = { type: 'number', description: 'Valor por defecto del control. Contrapartida de `default`.' };
control.properties.ccNumber = {
  type: 'integer',
  minimum: -1,
  maximum: 127,
  description: 'Numero de CC. Contrapartida de `cc`. El -1 es el "no hay CC", igual que en `cc`.',
};

// ── `measurementRecipe`: COMO SE MIDE ESTA FUNCION ──
//
// Este es el campo que mas duele no tener, y no por el estilo: tres contratos
// lo traen y el esquema no lo declaraba. `functions[]` dice QUE se puede medir
// (`blockType`, `captureMode`, umbrales) pero no COMO se pone el synth en las
// condiciones para que la medicion valga. Sin eso, la receta de medicion —que
// es lo mas caro de escribir— vivia solo en el fichero.
//
// Y `setupActions` es la MISMA forma que `#/$defs/setupActionArray`, que el
// esquema ya tenia para `lifecycle`. Declarada aqui otra vez seria una segunda
// fuente de verdad para el mismo dato, asi que se enlaza con un `$ref`. El
// validador resuelve `$ref` desde que se arreglo, asi que el cierre de
// `additionalProperties` llega aqui dentro sin inventar nada.
if ('measurementRecipe' in funcion.properties) throw new Error('measurementRecipe ya estaba declarado');
funcion.properties.measurementRecipe = {
  type: 'object',
  description:
    'Receta de medicion: como se deja el instrumento en las condiciones justas antes de medir. ' +
    'Sin ella, `functions[]` dice que se puede medir pero no como, y la calibracion que sale ' +
    'depende de quien la escribio.',
  required: ['recipeType', 'description'],
  properties: {
    recipeType: {
      type: 'string',
      description:
        'Tipo de excitacion. NO es un enum cerrado a proposito: hay tres en uso ' +
        '(INTERNAL_NOISE_EXCITATION, LEGATO_PITCH_SWEEP, DIRECT_AUDIO_IN) y es una lista ' +
        'que se abre, no un conjunto que se pueda contar.',
    },
    description: { type: 'string', minLength: 3, description: 'Que deja puesto el instrumento, en palabras.' },
    setupActions: { $ref: '#/$defs/setupActionArray', description: 'Los mismos pasos que usa `lifecycle`.' },
    excitationNotes: {
      type: 'array',
      description: 'Notas a tocar, si la excitacion es por nota. Vacio si no hace falta.',
      items: {
        type: 'object',
        required: ['noteNumber'],
        properties: {
          noteNumber: { type: 'integer', minimum: 0, maximum: 127 },
          velocity: { type: 'integer', minimum: 0, maximum: 127 },
          startDelayMs: { type: 'integer', minimum: 0 },
          durationMs: { type: 'integer', minimum: 0 },
          isLegato: { type: 'boolean', description: 'true si se toca sin soltar la anterior.' },
        },
        additionalProperties: false,
      },
    },
    postSettlingDelayMs: {
      type: 'integer',
      minimum: 0,
      description: 'Espera DESPUES del ultimo paso, para que elDSP se asiente antes de medir.',
    },
  },
  additionalProperties: false,
};

// ── ESCRIBIR ──
const despuesTexto = JSON.stringify(esquema, null, 2) + '\n';

// El formato no puede cambiar. Insertar lineas desplaza todo lo de abajo, asi
// que comparar linea a linea no dice nada; lo que dice algo es DESHACER: si
// quitando los campos anadidos se vuelve a obtener el fichero original byte a
// byte, entonces lo unico que ha cambiado son esos campos y nada mas.
const copia = structuredClone(esquema);
delete copia.properties.isSoftsynth;
for (const k of ['minVal', 'maxVal', 'defaultVal', 'ccNumber']) {
  delete copia.properties.functions.items.properties.controls.items.properties[k];
}
delete copia.properties.functions.items.properties.measurementRecipe;

if (JSON.stringify(copia, null, 2) + '\n' !== ORIGINAL) {
  console.error('\nDeshecho, el fichero NO vuelve a ser el original: el round-trip cambia algo mas. No se escribe nada.');
  process.exit(1);
}

const antesTexto = ORIGINAL;
const lineasAntes = antesTexto.split('\n').length;
const lineasDespues = despuesTexto.split('\n').length;

writeFileSync(fichero, despuesTexto, 'utf8');
console.log(`anadido: isSoftsynth, minVal, maxVal, defaultVal, ccNumber, measurementRecipe`);
console.log(`lineas: ${lineasAntes} -> ${lineasDespues}`);
console.log(`escrito: ${fichero}`);
