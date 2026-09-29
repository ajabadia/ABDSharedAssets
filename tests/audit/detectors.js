/**
 * Barrel de los detectores de la auditoria de documentacion: SU API y su CATALOGO.
 *
 * Modulo PURO (no habla con vitest): re-exporta, NOMBRE A NOMBRE, solo lo que sus
 * consumidores importan de aqui —las reglas, sus auto-tests, sus unitarios, la
 * meta-guardia, el diagrama y el contrato del CI—, para que todos sigan importando de
 * un solo sitio y las capas y los modulos de regla queden detras. Las constantes y
 * MODULES viven en modules.js, el unico sitio del paquete que toca el disco, que es
 * donde tambien se cuenta quien es modulo y quien es consumidor del audit.
 *
 * Este fichero lo ESCRIBE `barrel.js` y el contrato de la superficie comprueba que es
 * exactamente lo que sale de ahi. La superficie es lo que sus consumidores importan y
 * nada mas, y cada nombre se busca en la familia que lo exporta: mover un detector de una
 * capa a un modulo de regla —o al reves— no obliga a reescribir su linea, se regenera. Un
 * nombre que deje de importar nadie se cae solo del fichero, y `export *` (que volcaria
 * los modulos enteros y ocultaria la superficie) no cabe en un barrel generado.
 *
 * Y aqui se COMPONE el catalogo: una entrada por cada modulo de `tests/audit/rules/`, en
 * el orden en que el generador las encuentra —el del nombre del fichero, que no es el de
 * las reglas: el orden lo pone el `number` que cada una declara—.
 */

/** api */
export {
  factoryApiMembers,
  moduleExporting,
} from './api.js';

/** barrel */
export {
  barrelDrift,
  barrelProblems,
  barrelSource,
  hogaresDobles,
} from './barrel.js';

/** calls */
export {
  chainedMethodCalls,
  chainedReceivers,
  textChainedMembers,
} from './calls.js';

/** diagnostico */
export {
  HALF_SITES,
  TOP_SITIOS,
  clavesDePrimerNivel,
  clavesRepetidas,
  clavesRepetidasDelModulo,
  diagnostico,
  guideMessageBlock,
  halfDeclaredRules,
  importedNames,
  indicesDeLiterales,
  informeDiagnostico,
  limiteConTexto,
  literalesDeEntrada,
  recipeCases,
  recorte,
  resumenDiagnostico,
  ruleGaps,
  sharedProse,
} from './diagnostico.js';

/** docs */
export {
  OPTION_NAMES,
  codeOnly,
  docBlockBefore,
  docBlocks,
  docParamTypes,
  documentedMembers,
  documentedParamTypes,
  documentsOptionsObject,
  usageBlocks,
} from './docs.js';

/** entries */
export {
  entrySignatures,
  optionKeysOfArgs,
  wrappedOptionEntries,
} from './entries.js';

/** examples */
export {
  RECEIVER_FORMS,
  exampleFactoryCalls,
  resolvedExampleOptions,
  undocumentedExampleCalls,
  unresolvedUsageClasses,
} from './examples.js';

/** guards */
export {
  exportedFunctions,
  undocumentedExports,
} from './guards.js';

/** members */
export {
  baseChain,
  baseClassName,
  baseSources,
  contractText,
  memberDeclarations,
} from './members.js';

/** modules */
export {
  AUDIT_CONSUMERS,
  AUDIT_MODULES,
  AUDIT_SIN_API,
  CONSUMER_SOURCES,
  DOC_SOURCES,
  ENTRY_SHAPED,
  LIBRARY_SOURCES,
  MODULES,
  normaliseEol,
} from './modules.js';

/** options */
export {
  copiedOptions,
  optionIdentifiers,
  optionNameAlternation,
  optionNames,
  optionReadPrefix,
  optionReads,
  optionsParams,
  signatureParams,
} from './options.js';

/** receptors */
export {
  ALIAS_DECLARATION,
  BOUND_CONSTRUCTION,
  RECEIVER_DECLARATION,
  boundReceiverAccesses,
  memberAccessPattern,
  memberCallPattern,
  newBeforePattern,
  newReceiverPattern,
  reassignmentOf,
  receiverDotPattern,
} from './receptors.js';

/** records */
export {
  isRecordType,
  keyValueOf,
  readableType,
  recordFields,
  recordKeys,
} from './records.js';

/** regexes */
export {
  REGEX_CLASS_NAMES,
  regexOffenses,
  regexPatternsOf,
} from './regexes.js';

/** la regla arityMismatches */
export {
  arityMismatches,
  arityRange,
  memberSignatures,
} from './rules/arityMismatches.js';

/** la regla inertOptions */
export {
  inertOptions,
} from './rules/inertOptions.js';

/** la regla inlineRegistryOffenses */
export {
  callableBodyAfter,
  inlineRegistryOffenses,
  inlineReturnFields,
  literalKeys,
  patternKeys,
  propertyFields,
  registryOf,
  returnedKeys,
  typedefFields,
} from './rules/inlineRegistryOffenses.js';

/** la regla mismatchedExampleAccesses */
export {
  accessKind,
  chainedMemberAccesses,
  exampleMemberAccesses,
  mismatchedExampleAccesses,
} from './rules/mismatchedExampleAccesses.js';

/** la regla misplacedOptions */
export {
  misplacedOptions,
} from './rules/misplacedOptions.js';

/** la regla missingExampleMethods */
export {
  classMembers,
  membersWithBases,
  missingExampleMethods,
} from './rules/missingExampleMethods.js';

/** la regla mistypedExampleArguments */
export {
  acceptsArgument,
  argumentType,
  boundedCallsWithLabels,
  callbackArityErrors,
  comparedExampleArguments,
  exampleObjectEntries,
  exportedFunctionParamTypes,
  mistypedExampleArguments,
  recordFieldErrors,
} from './rules/mistypedExampleArguments.js';

/** la regla offListValues */
export {
  branchedLiterals,
  enumeratedValues,
  exampleValues,
  offListValues,
} from './rules/offListValues.js';

/** la regla staleUsageOptions */
export {
  staleUsageOptions,
} from './rules/staleUsageOptions.js';

/** la regla undocumentedDefaults */
export {
  codeDefaults,
  documentedDefaults,
  literalsOf,
  stripParens,
  undocumentedDefaults,
} from './rules/undocumentedDefaults.js';

/** la regla undocumentedReads */
export {
  undocumentedReads,
} from './rules/undocumentedReads.js';

/** la regla unreadEntryKeys */
export {
  entryKeyIsRead,
  entryShapeKeys,
  unreadEntryKeys,
} from './rules/unreadEntryKeys.js';

/** la regla unusedMembers */
export {
  memberIsConsulted,
  unusedMembers,
} from './rules/unusedMembers.js';

/** scan */
export {
  closingIndex,
  depthAt,
  importStatements,
  lineOf,
  lineaDe,
  skipString,
  withoutComments,
  withoutLiterals,
} from './scan.js';

/** split */
export {
  argumentCount,
  argumentList,
  splitTopLevel,
} from './split.js';

/** usage */
export {
  constructedWith,
  exampleBindings,
  exampleConstructions,
  exampleMethodCalls,
} from './usage.js';

/* --------------------------------------------------------------------------
 * El catalogo, compuesto de las entradas de los modulos de regla
 * ------------------------------------------------------------------------- */

import { arityMismatchesRule } from './rules/arityMismatches.js';
import { inertOptionsRule } from './rules/inertOptions.js';
import { inlineRegistryOffensesRule } from './rules/inlineRegistryOffenses.js';
import { mismatchedExampleAccessesRule } from './rules/mismatchedExampleAccesses.js';
import { misplacedOptionsRule } from './rules/misplacedOptions.js';
import { missingExampleMethodsRule } from './rules/missingExampleMethods.js';
import { mistypedExampleArgumentsRule } from './rules/mistypedExampleArguments.js';
import { offListValuesRule } from './rules/offListValues.js';
import { staleUsageOptionsRule } from './rules/staleUsageOptions.js';
import { undocumentedDefaultsRule } from './rules/undocumentedDefaults.js';
import { undocumentedReadsRule } from './rules/undocumentedReads.js';
import { unreadEntryKeysRule } from './rules/unreadEntryKeys.js';
import { unusedMembersRule } from './rules/unusedMembers.js';

/** Las entradas, en el orden en que las encuentra el generador: el del nombre del
 *  fichero, que no es el de las reglas —el orden lo pone el `number` de cada una—. */
const DECLARED = [
  arityMismatchesRule,
  inertOptionsRule,
  inlineRegistryOffensesRule,
  mismatchedExampleAccessesRule,
  misplacedOptionsRule,
  missingExampleMethodsRule,
  mistypedExampleArgumentsRule,
  offListValuesRule,
  staleUsageOptionsRule,
  undocumentedDefaultsRule,
  undocumentedReadsRule,
  unreadEntryKeysRule,
  unusedMembersRule,
];

/** El CATALOGO resuelto: cada regla con su numero y su NOMBRE, que sale del propio
 *  detector (`detector.name`): el detector y su nombre no pueden desincronizarse porque
 *  el nombre no se escribe. Una entrada sin detector del barrel ni siquiera carga: el
 *  enlazador ESM la delata. */
export const RULES = DECLARED
  .map((rule) => {
    if (typeof rule.detector !== 'function')
      throw new Error('una entrada del catalogo no trae un detector');

    return { ...rule, number: rule.number, name: rule.detector.name };
  })
  .sort((one, other) => one.number - other.number);

if (RULES.length !== DECLARED.length)
  throw new Error('el catalogo perdio reglas por el camino');
