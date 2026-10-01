/**
 * Lectura y evaluacion de `.gitattributes`, en funciones PURAS.
 *
 * ESTE MODULO ESTA COPIADO, Y LA COPIA TIENE MOTIVO.
 *
 * Vive tambien en ABDEep, en `WebUI/tests/gitattributesGuard.js`, porque ABDSharedAssets
 * es la fuente gestionada de la suite y sus ficheros se replican hacia abajo. Es
 * la MISMA logica, no una aproximacion: un parser de `.gitattributes` escrito dos
 * veces es dos interpretaciones de la misma especificacion, y la que se queda
 * sin actualizar es la que nadie mira.
 *
 * Que las dos copias no se separen lo vigila
 * `gitattributesGuard.test.js`, que compara las dos cuando el hermano esta a mano
 * y avisa cuando no lo esta. Es el mismo patron que usa el guard del contrato de
 * efectos: si el checkout del hermano no esta, el test lo dice en vez de
 * fingir que ha comparado algo.
 */

/**
 * Lectura y evaluacion de `.gitattributes`, en funciones PURAS: reciben el
 * texto y la lista de ficheros, y devuelven estructuras. Nada lee el disco, y
 * por eso un guard puede darle reglas inventadas y comprobar que las detecta.
 *
 * POR QUE HAY QUE LEERLO EN VEZ DE CONFIAR EN `git check-attr`. `git
 * check-attr` es la autoridad y se usa como contrapeso en los tests, pero no
 * sirve para el caso principal: una regla que no cubre NINGUN fichero. Contra
 * esa hay que poder preguntar "que ficheros cubre esta regla", y `check-attr`
 * solo responde fichero a fichero.
 *
 * EL DETALLE QUE HACE FALLO ESTE GUARD. Un patron de `.gitattributes` es un
 * patron tipo `.gitignore`, donde `*` NO cruza el `/`:
 *
 *     recursos/bancos/*.syx   NO cubre recursos/bancos/FABRICANTE/A.syx
 *
 * No es un caso teorico: en el hermano ABDEep la regla `resources/banks/*.syx
 * binary` cubria CERO de los ocho bancos, porque estan en
 * `resources/banks/Factory Banks V1.1.2/`, un subdirectorio. Y no se notaba,
 * porque los bancos tienen un 47% de bytes NUL y git los detecta como binarios
 * por CONTENIDO: la proteccion era de Reposo, no de la regla.
 *
 * Ese es el fallo que este guard existe para cazar. Una proteccion que no
 * protege se lee exactamente igual que una que protege: las dos son una linea
 * de texto que dice lo que quieres oir.
 *
 * Y ESTE REPO TIENE EL OTRO LADO DE ESE MISMO PROBLEMA, en direccion contraria.
 * Su `.gitattributes` es una copia del de ABDSharedCode "con las extensiones
 * propias de este repositorio", y se le quedaron reglas de C++ que aqui no
 * cubren nada: este repo no tiene `.cpp`, ni `.h`, ni `CMakeLists.txt`. Son
 * reglas PREVENTIVAS, declaran el futuro, y por eso NO son un error. Lo que si
 * es un error es una de esas que nombra un fichero CONCRETO que no existe. De ahi
 * la distincion de `esPreventiva`, que es lo que permite que este guard sirva
 * para un repo lleno de reglas declarativas sin que haya que apagarlo.
 */

/** Una regla: el patron tal cual, sus atributos, y el texto original. */
function reglaDe (linea) {
  const texto = linea.trim();

  if (texto === '' || texto.startsWith('#')) {return null;}

  // La forma con comillas: "*.txt" text eol=lf
  const entrecomillado = /^"([^"]+)"\s+(.*)$/.exec(texto);

  if (entrecomillado) {
    return { patron: entrecomillado[1], atributos: entrecomillado[2].split(/\s+/), cruda: texto };
  }

  const partes = texto.split(/\s+/);

  if (partes.length < 2) {return null;}

  return { patron: partes[0], atributos: partes.slice(1), cruda: texto };
}

/** Todas las reglas de un `.gitattributes`, sin comentarios ni Attribute macros. */
function reglasDe (texto) {
  return texto
    .split('\n')
    .map(reglaDe)
    .filter((r) => r !== null)
    // Un patron entre corchetes es una macro de atributo, no una regla de
    // ficheros, y no se aplica a ningun path.
    .filter((r) => !r.patron.startsWith('['));
}

/**
 * Compila un patron de `.gitattributes` a una expresion regular.
 *
 * TRES cosas que un `new RegExp(patron.replace('*', '.*'))` ingenuo haria mal:
 *
 *   - `*` no cruza `/`. Sin esto, `resources/banks/*.syx` casaria con los
 *     ficheros de un subdirectorio, que es justo el fallo que hizo huerfana la
 *     regla de los bancos en este repo.
 *   - `.` hay que escaparlo, para que un nombre con punto no case con cualquier
 *     cosa.
 *   - Un patron SIN `/` NO va anclado a la raiz: `*.gen.js` matchea en CUALQUIER
 *     directorio, no solo en el nivel superior. Este es el caso contrario al de
 *     los bancos, y es facil de pasarse por alto en la direccion contraria.
 */
function patronARegex (patron) {
  // Sin barra, el patron se aplica al NOMBRE del fichero en cualquier
  // directorio. Con barra, es relativo a la raiz de la repo.
  const anclaAlFinal = !patron.includes('/');
  let salida = anclaAlFinal ? '(?:.*/)?' : '';
  let i = 0;

  while (i < patron.length) {
    const c = patron[i];

    if (c === '*') {
      if (patron[i + 1] === '*') {
        // `**` cruza directorios. Se come el `/` que lo separa si lo hay.
        if (patron[i + 2] === '/') {
          salida += '(?:.*/)?';
          i += 3;
          continue;
        }
        salida += '.*';
        i += 2;
        continue;
      }
      salida += '[^/]*';
      i += 1;
      continue;
    }

    if (c === '?') {
      salida += '[^/]';
      i += 1;
      continue;
    }

    if (c === '[') {
      const cierre = patron.indexOf(']', i + 1);
      if (cierre !== -1) {
        let clase = patron.slice(i + 1, cierre);
        if (clase.startsWith('!')) {clase = '^' + clase.slice(1);}
        salida += '[' + clase + ']';
        i = cierre + 1;
        continue;
      }
    }

    salida += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }

  return new RegExp('^' + salida + '$');
}

/** Que ficheros de `ficheros` cubre una regla. */
function cubreLa (regla, ficheros) {
  const rx = patronARegex(regla.patron);
  return ficheros.filter((f) => rx.test(f));
}

/**
 * Si la regla obliga a LF en checkout.
 *
 * Hace falta distinguir tres cosas que un `toContain` no distingue: que no hay
 * ninguna regla, que hay una que dice otra cosa, y que hay una regla con glob
 * que si cubre el fichero. Solo la tercera cuenta.
 */
function obligaLf (regla) {
  if (regla === null) {return false;}
  return regla.atributos.some((a) => a === 'text' || a.startsWith('text=')) &&
    regla.atributos.includes('eol=lf');
}

/** El conjunto de reglas que de verdad fijan `ruta`. */
function reglasQueFijan (ruta, texto) {
  return reglasDe(texto).filter((r) => obligaLf(r) && patronARegex(r.patron).test(ruta));
}

/** Los CRLF de un texto. Cero es lo unico aceptable en algo que se compara. */
function cuentaCrlf (texto) {
  return (texto.match(/\r\n/g) || []).length;
}

/**
 * Si una regla es PREVENTIVA: declara una intencion sobre una extension o una
 * familia de rutas, y no sobre un fichero concreto.
 *
 * POR QUE HACE FALTA, Y POR QUE LA PRIMERA VERSION DEL GUARD ESTABA MAL.
 *
 * El guard se escribio primero para ABDEep, donde todas las reglas cubren algo y
 * no hacia falta esta distincion. Al llevarlo a ABDSharedAssets aparecieron 18
 * reglas "inertes" y eran casi todas legitimas: `*.cpp`, `*.h`, `*.cmake`,
 * `*.sh`... ese repo no tiene C++, pero su hermano ABDSharedCode si, y el
 * `.gitattributes` dice literalmente que es una copia del de ABDSharedCode. Son
 * reglas de futuro: declaran que, SI aparece un `.cpp`, tiene que ser LF.
 *
 * Un guard que exige "toda regla cubre un fichero" las marca a todas como
 * error, y lo unico que se puede hacer con ese guard es apagarlo.
 *
 * LA DISTINCION. Una extension (`*.cpp`) o una familia (`**`) es preventiva:
 * que hoy no haya ficheros que case no dice nada malo. Un nombre CONCRETO
 * (`WebUI/js/fx_contract.gen.js`, `CMakeLists.txt`, `.gitignore`) que no cubre
 * nada si es un error: o la ruta esta mal escrita, o el fichero se ha movido, o
 * la regla se ha quedado huerfana. Las tres son fallos reales y las tres son
 * silenciosas.
 *
 * Ojo con el caso limite: `*.` es lo que hace preventiva una regla, no el
 * contenido. Un patron como `sources/plataformas/windows.cpp` NO empieza por
 * `*.`, asi que cuenta como ruta concreta, que es lo que es.
 */
function esPreventiva (regla) {
  return /^\*\./.test(regla.patron) || regla.patron.includes('**');
}

/**
 * Las reglas que no cubren NINGUN fichero, separadas en las que son error y las
 * que solo son declarativas. Separarlas es el punto: mezclarlas convertia el
 * guard en algo que hay que apagar en cuanto un repo declara su futuro.
 */
function reglasInertes (reglas, ficheros) {
  const inertes = reglas.filter((r) => cubreLa(r, ficheros).length === 0);

  return {
    errores: inertes.filter((r) => !esPreventiva(r)),
    preventivas: inertes.filter(esPreventiva)
  };
}

/** Los ficheros de texto que se COMPARAN como datos, no se ejecutan. */
function pareceComparadoComoDato (fichero) {
  return /\.(gen\.js|gen\.h|gen\.cpp|data\.json)$/.test(fichero) ||
    /\.gen\.[a-z]+$/.test(fichero);
}

/**
 * LAS SENAS DE UN ARTEFACTO GENERADO: lo que permite que un artefacto nazca
 * protegido sin que nadie tenga que acordarse de anadirlo a una lista.
 *
 * HASTA AQUI EL GUARD SOLO MIRABA LAS REGLAS. Que reglas hay, cuales son
 * huerfanas, cuales fijan LF: todo eso va de `.gitattributes`. Esto va de los
 * FICHEROS, y es la direccion contraria: dados los ficheros que hay, cuales son
 * generados y cuales de ellos se comparan sin que ninguna regla los proteja.
 *
 * Y para eso hay que RECONOCERLOS, no conocerlos. Tres senas, y ninguna
 * bastante por si sola:
 *
 *   - `nombre`: algo asi como `registry.gen.js`, `ParameterRegistry.gen.h` o
 *     `parameter-registry.data.json`. Es la que ya usaba
 *     `pareceComparadoComoDato`, y es la unica que no hay que escribir.
 *   - `cabecera`: `AUTO-GENERATED` en las cinco primeras lineas. La ponen los
 *     generadores de ABDEep (`GEN_HEADER_JS` y `GEN_HEADER_CPP`).
 *   - `procedencia`: una clave de PRIMER nivel `generatedBy` o `generatedFrom`
 *     en un JSON. La ponen los contratos de ABDSharedAssets, que no tienen
 *     nombre de artefacto ni cabecera: se llaman `abdeep_modulation_matrix.json`
 *     y no dicen si los escribio una persona o un script.
 *
 * LO QUE ESTA SENAL NO RESUELVE, Y HAY QUE DECIRLO. No descubre un artefacto
 * nuevo y desconocido: descubre los que el generador ha decidido marcar. Por
 * eso la convencion va PRIMERO y el guard despues. Un guard que hiciera
 * promesas de descubrirlo todo sin marcar nada seria un guard que descubre
 * cero, que es el peor resultado posible porque es verde.
 *
 * POR QUE LA SENAL DE PROCEDENCIA MIRA LA SANGRIA. En
 * `contracts/s950-calibration.schema.json` la palabra `generatedFrom` aparece
 * dos veces, y ninguna significa que ese esquema este generado: una es la lista
 * de propiedades obligatorias del contrato y la otra es la declaracion de esa
 * propiedad. Un esquema que nombra `generatedFrom` es un fichero MANUAL que
 * habla de artefactos, no un artefacto, y marcarlo seria un falso positivo que
 * ensea a ignorar al guard. Por eso solo cuenta a dos espacios de sangria, que
 * es donde caen las claves de primer nivel del JSON que escriben estos
 * generadores (`json.dumps(indent=2)`).
 */
function senasDeArtefacto (ruta, contenido) {
  const senas = [];
  const texto = contenido || '';

  if (pareceComparadoComoDato(ruta))
    senas.push('nombre');

  if (texto.split('\n').slice(0, 5).join('\n').includes('AUTO-GENERATED'))
    senas.push('cabecera');

  if (/^ {2}"generated(?:From|By)":/m.test(texto))
    senas.push('procedencia');

  return senas;
}

/** Un artefacto generado: un fichero con al menos una de las senas. */
function esArtefacto (ruta, contenido) {
  return senasDeArtefacto(ruta, contenido).length > 0;
}

/**
 * Los artefactos de una lista de `{ ruta, contenido }`, cada uno con la sena que
 * lo delato. Devolver la sena es lo que permite que un fallo diga POR QUE se
 * considera artefacto: "sin regla y solo por el nombre" es un diagnostico
 * distinto de "sin regla y solo porque se leyo como generado".
 */
function descubreArtefactos (ficheros) {
  return (ficheros || [])
    .map((f) => ({ ruta: f.ruta, senas: senasDeArtefacto(f.ruta, f.contenido) }))
    .filter((f) => f.senas.length > 0);
}

/**
 * Los artefactos que NADIE fija en LF.
 *
 * Un artefacto generado se COMPARA byte a byte en cada regeneracion, asi que si
 * los saltos de linea cambian solos el diff que sale es el fichero entero: la
 * revision que deberia decir "cambia este destino" dice "cambia todo el
 * fichero", y el dia que hace falta de verdad nadie lo lee. Esa es la defensa
 * que estos numeros comprueban que existe.
 */
function artefactosSinFijar (artefactos, texto) {
  return artefactos.filter((a) => reglasQueFijan(a.ruta, texto).length === 0);
}

export {
  reglaDe, reglasDe, patronARegex, cubreLa, obligaLf,
  reglasQueFijan, cuentaCrlf, pareceComparadoComoDato,
  esPreventiva, reglasInertes,
  senasDeArtefacto, esArtefacto, descubreArtefactos, artefactosSinFijar
};
