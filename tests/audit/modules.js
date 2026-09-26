/**
 * Constantes compartidas y LAS FUENTES AUDITADAS: los modulos que el audit lee del
 * disco. Es el unico punto del paquete que habla con el sistema de ficheros.
 *
 * Generado al partir tests/audit/detectors.js: el barrel (`./detectors.js`) vuelve a
 * exponer todo, asi que los consumidores no cambian.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';


export const here = dirname(fileURLToPath(import.meta.url));
export const componentsDir = join(here, '../../components');

/** Controles que se sabe que toman entradas ricas: si esto falla, el detector se rompio. */
export const ENTRY_SHAPED = ['select.js', 'segmented.js'];

/** Identificadores que suelen ser el objeto de opciones aunque no lleven default. */
export const OPTION_IDENTIFIERS = /^(options|opts|config|handlers|hooks|spec|params)$/;


/** CRLF -> LF: sin esto, `\S.*$` no casa y el parseo se cae en silencio. */
export const normaliseEol = (source) => source.replace(/\r\n/g, '\n');

/* ---------------------------------------------------------------------------
 * Las fuentes auditadas
 * ------------------------------------------------------------------------- */

export const MODULES = [
  ...readdirSync(componentsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ label: name, path: join(componentsDir, name) })),
  { label: 'skins/index.js', path: join(componentsDir, 'skins', 'index.js') },
].map(({ label, path }) => ({ label, source: normaliseEol(readFileSync(path, 'utf-8')) }));
