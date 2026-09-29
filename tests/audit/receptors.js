/**
 * Modulo COMPARTIDO de los patrones de RECEPTOR de la auditoria.
 *
 * Un ejemplo de uso habla de un objeto de cuatro maneras —ATADO (`const x = new X(...)`),
 * ALIAS (`const y = x;`), ENCADENADO (`new X(...).m(...)`) y OPCIONAL (`x?.m(...)`,
 * `new X(...)?.m(...)`)— y varias reglas los leen (6, 8, 9, 10, 11 y 12). La quinta forma
 * del receptor —la FABRICA (`const x = createY(...)`), cuya API sale del objeto que la
 * funcion devuelve— no es gramatica de este modulo: la resuelve la capa de API, y la
 * lista COMPLETA de las formas que el audit sigue vive en `RECEIVER_FORMS`
 * (`examples.js`), que es la que la guia enumera y el contrato del CI vigila. Antes cada
 * lector repetia sus propias regex y sus propias guardias: anadir o cambiar una forma
 * obligaba a tocar cuatro regex y tres guardias a la vez, y bastaba olvidar una para que
 * dos reglas discrepasen en silencio. Aqui viven los patrones UNA vez.
 *
 * Solo el GRAMMAR: fragmentos, constructores de regex y la guardia de liveness del alias.
 * El recorrido —que bindings hay, en que orden, donde arranca el scan— sigue en cada
 * detector, y las guardias de cobertura conservan su resolucion de alias INDEPENDIENTE
 * aunque compartan estas piezas lexicas, que es lo que de verdad se quiere una sola vez.
 *
 * Modulo PURO (no importa nada): lo consumen las capas y los modulos de regla sin ciclo.
 */

/** Un identificador de JavaScript. */
const IDENT = '[A-Za-z_$][\\w$]*';

/** El punto de acceso a un miembro, con el `?.` de la forma opcional. */
const MEMBER_DOT = '\\s*\\??\\.\\s*';

/** Declaracion de un receptor ATADO (`const x = new X(...)`) o de un ALIAS
 *  (`const y = x;`): grupo 1 es la variable, 2 la clase del `new` y 3 la variable
 *  fuente del alias. La resolucion del alias a su clase es cosa de cada lector. */
export const RECEIVER_DECLARATION = new RegExp(
  `\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:new\\s+(${IDENT})\\s*\\(|(${IDENT})\\b)`, 'g');

/** Solo el receptor ATADO con `new` (`const x = new X(...)`): grupo 1 la variable,
 *  grupo 2 la clase. Lo usa la guardia que re-deriva las clases del texto. */
export const BOUND_CONSTRUCTION = new RegExp(
  `\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*new\\s+(${IDENT})\\s*\\(`, 'g');

/** Solo el ALIAS (`const y = x;`): grupo 1 la variable, grupo 2 su fuente. */
export const ALIAS_DECLARATION = new RegExp(
  `\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(${IDENT})\\s*;`, 'g');

/** El `new Clase(` con el que un ejemplo construye un receptor (atado o encadenado):
 *  grupo 1 la clase. Devuelve SIEMPRE una regex fresca (nada de `lastIndex` compartido). */
export const newReceiverPattern = () => new RegExp(`\\bnew\\s+(${IDENT})\\s*\\(`, 'g');

/** Un acceso `variable.miembro` (o `variable?.miembro`): grupo 1 el miembro. */
export const memberAccessPattern = (variable) =>
  new RegExp(`\\b${variable}${MEMBER_DOT}(${IDENT})`, 'g');

/** Una llamada `variable.miembro(...)` (o `variable?.miembro(...)`): grupo 1 el miembro. */
export const memberCallPattern = (variable) =>
  new RegExp(`\\b${variable}${MEMBER_DOT}(${IDENT})\\s*\\(`, 'g');

/** El `new ` que PRECEDE a un nombre (`... new X(`): distingue la construccion atada
 *  (`const x = new X(...)`) de la llamada a una funcion exportada, que es lo que la
 *  guardia de firmas tiene que saltarse porque ya la inventaria otra regla. */
export const newBeforePattern = () => /\bnew\s+$/;

/** El nombre de miembro que abre justo tras un punto (`/^\s*(miembro)/`): lo leen los
 *  dos recorridos del encadenado sobre el texto que sigue al `.`. */
export const memberNamePattern = () => new RegExp(`^\\s*(${IDENT})`);

/** La aparicion `variable.` (un punto sin miembro obligatorio): la guardia la usa para
 *  saber si un alias se USA antes de tomarlo en cuenta. */
export const receiverDotPattern = (variable) => new RegExp(`\\b${variable}\\s*\\.`);

/** La REASIGNACION de una variable (`y = other`) que NO es su declaracion
 *  (`const y = ...`): el punto donde un alias deja de senalar al mismo objeto. */
export const reassignmentOf = (variable) =>
  new RegExp(`(?<!\\b(?:const|let|var)\\s+)\\b${variable}\\s*=[^=]`);

/** Los accesos de un receptor ATADO dentro del bloque de su declaracion, con las dos
 *  guardias ya aplicadas —un acceso anterior a la declaracion no es del receptor, y un
 *  alias reasignado antes del acceso corta el track—: [{ variable, className, match }].
 *  `callsOnly` exige que el miembro se LLAME (`x.m(`) en vez de solo accederse (`x.m`).
 *  Es la fuente comun de exampleMethodCalls (reglas 8/9/10) y exampleMemberAccesses
 *  (regla 11), para que las dos no puedan discrepar en que accesos ven. */
export function boundReceiverAccesses(blockText, { variable, className, at }, { callsOnly = false } = {}) {
  const pattern = callsOnly ? memberCallPattern(variable) : memberAccessPattern(variable);
  const accesses = [];

  for (const match of blockText.matchAll(pattern)) {
    if (match.index <= at)
      continue;                        // la declaracion (o algo anterior) no es un acceso
    if (reassignmentOf(variable).test(blockText.slice(at, match.index)))
      continue;                        // alias reasignado: el receptor se corta aqui

    accesses.push({ variable, className, match });
  }

  return accesses;
}
