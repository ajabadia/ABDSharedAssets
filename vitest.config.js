import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],

    // Los tests de este paquete lanzan Python y leen ficheros del disco, asi
    // que el default de 5 s se queda corto: con el, la suite da rojos
    // intermitentes que dependen de la carga de la maquina y no de nada que
    // haya cambiado en el codigo.
    //
    // MEDIDO el 2026-10-03 con los 8 nucleos saturados, que es la condicion en
    // la que aparecian: el test mas lento tardaba 37,4 s y el p95 eran 13,1 s.
    // En una pasada limpia el mas lento son 6,97 s y el p95 son 4,56 s, o sea
    // que el p95 limpio ya se comia casi todo el default de 5 s. Por eso el
    // techo son 120 s y no 30: deja 3,2 veces de margen sobre el peor caso
    // medido, y por debajo de unos 60 s el rojo intermitente vuelve. Sigue
    // siendo un techo y no una espera normal, porque solo lo consume un test
    // que se cuelga de verdad, y ese cuelga aqui y no en ningun lado.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
