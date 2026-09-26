/**
 * Barrel de los detectores de la auditoria de documentacion.
 *
 * Modulo PURO (no habla con vitest): re-exporta TODO lo que vivia aqui, ahora
 * partido por familias, para que los consumidores (rules.js, autoTests.js,
 * metaGuard.js, detectors.test.js) no cambien. Las constantes y MODULES viven en
 * modules.js, el unico sitio del paquete que toca el disco.
 */

export * from './rules1to7.js';
export * from './receivers.js';
export * from './modules.js';
