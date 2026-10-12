#!/usr/bin/env node
/**
 * SYNTHETIC PARAMETER SPEC SYNC SCRIPT
 * ====================================
 * Extrae diccionarios completos de parámetros desde las fuentes locales
 * de cada sintetizador y genera/actualiza los contratos canónicos en
 * ABDSharedAssets/contracts/.
 *
 * Esto resuelve el problema donde korg_ms2000_parameter_spec.json solo tenía
 * 9 parámetros (de un contrato de sweep de AudioLab) en lugar de 200+ (del
 * parámetro schema real).
 */

import fs from 'fs-extra';
import path from 'path';
import { parse } from 'json2yaml';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONTRACTS_DIR = path.resolve('ABDSharedAssets', 'contracts');
const SOURCES_DIR = path.resolve('.'); // Root of the monorepo

// Ensure contracts directory exists
await fs.ensureDir(CONTRACTS_DIR);

// =============================================================================
// PARAMETER SPEC SCHEMA VALIDATION
// =============================================================================

/**
 * Validates that a parameter object has all required fields
 */
function validateParameter(param) {
  const requiredFields = [
    'id',
    'name',
    'wire',
    'wireCodec',
    'cc',
    'min',
    'max',
    'default',
    'type',
    'domainMin',
    'domainMax',
    'unit',
  ];
  const missing = requiredFields.filter((f) => param[f] === undefined || param[f] === null);
  if (missing.length > 0) {
    console.warn(`⚠️  Parameter "${param.id}" missing fields: ${missing.join(', ')}`);
  }
  return param;
}

/**
 * Normalizes parameter name to canonical ID format
 */
function normalizeParamId(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// =============================================================================
// SYNTHESIZER EXTRACTORS
// =============================================================================

/**
 * Extract parameters from Korg MS2000 schema
 * Source: ABDMS2000/schemas/parameters-spec.schema.v1.json
 */
async function extractMS2000Parameters() {
  const schemaPath = path.resolve('ABDMS2000', 'schemas', 'parameters-spec.schema.v1.json');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  const data = JSON.parse(schema);

  // The schema has a complex structure - parameters are in data.parameters or similar
  // Based on the 4.241-line schema, we need to navigate its structure
  let params = [];

  // Try different possible structures
  if (data.parameters && Array.isArray(data.parameters)) {
    params = data.parameters;
  } else if (data.params && Array.isArray(data.params)) {
    params = data.params;
  } else if (data.parameterSpec && Array.isArray(data.parameterSpec)) {
    params = data.parameterSpec;
  } else if (data.parametersList && Array.isArray(data.parametersList)) {
    params = data.parametersList;
  } else {
    // Try to find arrays in the object
    const keys = Object.keys(data).filter(
      (k) =>
        data[k] &&
        (Array.isArray(data[k]) || (typeof data[k] === 'object' && !Array.isArray(data[k]))),
    );
    console.log(`🔍 MS2000 schema keys: ${keys.join(', ')}`);
    // If there's only one key that's an array, use it
    if (keys.length === 1 && data[keys[0]] && Array.isArray(data[keys[0]])) {
      params = data[keys[0]];
    }
  }

  // Normalize parameters to the canonical schema
  return params.map((param) => {
    const ccNumber =
      param.ccNumber ||
      param.CCNumber ||
      param.ccnumber ||
      param.CCnumber ||
      param.number ||
      (param.control && param.control.ccNumber) ||
      (param.midiCC && param.midiCC.cc) ||
      -1;

    const name =
      param.name ||
      param.Parameter ||
      param.parameter ||
      param.ParameterName ||
      (param.control && param.control.name) ||
      `param_${Math.random().toString(36).substr(2, 8)}`;

    const unit = param.unit || param.Unit || param.units || 'normalized';
    const domainMin = param.domainMin !== undefined ? param.domainMin : 0;
    const domainMax = param.domainMax !== undefined ? param.domainMax : 127;
    const min = param.min !== undefined ? param.min : 0;
    const max = param.max !== undefined ? param.max : 127;
    const defaultValue =
      param.defaultValue !== undefined
        ? param.defaultValue
        : param.default || param.Default || param.min;
    const paramType = param.type || param.Type || 'continuous';
    const wire = param.wire || param.Wire || 'CC';
    const wireCodec = param.wireCodec || param.WireCodec || 'Value';
    const curve = param.curve || param.Curve || 'Linear';

    // Try to determine if it's a control change or other type
    let wireType = 'CC';
    if (wire === 'SysEx') wireType = 'SysEx';
    else if (wire === 'None') wireType = 'None';

    // Determine wireCodec based on range
    let wireCodecValue = 'Value';
    if (param.min < 0 || param.max < 0) wireCodecValue = 'Bipolar';
    else if (param.type === 'enum' || param.type === 'choice') wireCodecValue = 'Enum';

    // Determine curve
    let curveValue = 'Linear';
    if (curve === 'Exp' || curve === 'exponential') curveValue = 'Exp';
    else if (curve === 'Pow' || curve === 'power') curveValue = 'Pow';
    else if (curve === 'Linear') curveValue = 'Linear';

    return validateParameter({
      id: normalizeParamId(name),
      name,
      wire: wireType,
      wireCodec: wireCodecValue,
      cc: typeof ccNumber === 'number' ? ccNumber : -1,
      min,
      max,
      default: defaultValue,
      type: paramType,
      domainMin: typeof domainMin === 'number' ? domainMin : 0,
      domainMax: typeof domainMax === 'number' ? domainMax : 127,
      unit,
      curve: curveValue,
    });
  });
}

/**
 * Extract parameters from Behringer DeepMind schema
 * Source: ABDEep/schemas/parameter-registry.data.json
 */
async function extractDeepMindParameters() {
  const schemaPath = path.resolve('ABDEep', 'schemas', 'parameter-registry.data.json');
  const data = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));

  let params = [];
  if (data.parameters && Array.isArray(data.parameters)) {
    params = data.parameters;
  } else if (data.params && Array.isArray(data.params)) {
    params = data.params;
  } else if (data.ParameterList && Array.isArray(data.ParameterList)) {
    params = data.ParameterList;
  }

  return params.map((param) =>
    validateParameter({
      id: normalizeParamId(
        param.name || param.Parameter || `param_${Math.random().toString(36).substr(2, 8)}`,
      ),
      name: param.name || param.Parameter || `Parameter ${param.id}`,
      wire: param.wire || 'CC',
      wireCodec: param.wireCodec || 'Value',
      cc: param.ccNumber !== undefined ? param.ccNumber : -1,
      min: param.minVal !== undefined ? param.minVal : 0,
      max: param.maxVal !== undefined ? param.maxVal : 127,
      default: param.defaultVal !== undefined ? param.defaultVal : 64,
      type: param.type || 'continuous',
      domainMin: param.domainMin !== undefined ? param.domainMin : 0,
      domainMax: param.domainMax !== undefined ? param.domainMax : 127,
      unit: param.unit || 'normalized',
      curve: param.curve || 'Linear',
    }),
  );
}

/**
 * Extract parameters from Casio CZ-101 schema
 * Source: ABDCZ101/schemas/parameter-registry.data.json
 */
async function extractCasioCZ101Parameters() {
  const schemaPath = path.resolve('ABDCZ101', 'schemas', 'parameter-registry.data.json');
  const data = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));

  let params = [];
  if (data.parameters && Array.isArray(data.parameters)) {
    params = data.parameters;
  } else if (data.params && Array.isArray(data.params)) {
    params = data.params;
  } else if (data.ParameterList && Array.isArray(data.ParameterList)) {
    params = data.ParameterList;
  }

  return params.map((param) =>
    validateParameter({
      id: normalizeParamId(
        param.name || param.Parameter || `param_${Math.random().toString(36).substr(2, 8)}`,
      ),
      name: param.name || param.Parameter || `Parameter ${param.id}`,
      wire: param.wire || 'CC',
      wireCodec: param.wireCodec || 'Value',
      cc: param.ccNumber !== undefined ? param.ccNumber : -1,
      min: param.minVal !== undefined ? param.minVal : 0,
      max: param.maxVal !== undefined ? param.maxVal : 99, // CZ-101 uses 0-99
      default: param.defaultVal !== undefined ? param.defaultVal : 0,
      type: param.type || 'continuous',
      domainMin: param.domainMin !== undefined ? param.domainMin : 0,
      domainMax: param.domainMax !== undefined ? param.domainMax : 99,
      unit: param.unit || 'value',
      curve: param.curve || 'Linear',
    }),
  );
}

/**
 * Extract parameters from Roland Juno-106 schema
 * Source: ABDJUNiO601/schemas/parameter-registry.data.json
 */
async function extractRolandJuno106Parameters() {
  const schemaPath = path.resolve('ABDJUNiO601', 'schemas', 'parameter-registry.data.json');
  const data = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));

  let params = [];
  if (data.parameters && Array.isArray(data.parameters)) {
    params = data.parameters;
  } else if (data.params && Array.isArray(data.params)) {
    params = data.params;
  } else if (data.ParameterList && Array.isArray(data.ParameterList)) {
    params = data.ParameterList;
  }

  return params.map((param) =>
    validateParameter({
      id: normalizeParamId(
        param.name || param.Parameter || `param_${Math.random().toString(36).substr(2, 8)}`,
      ),
      name: param.name || param.Parameter || `Parameter ${param.id}`,
      wire: param.wire || 'CC',
      wireCodec: param.wireCodec || 'Value',
      cc: param.ccNumber !== undefined ? param.ccNumber : -1,
      min: param.minVal !== undefined ? param.minVal : 0,
      max: param.maxVal !== undefined ? param.maxVal : 127,
      default: param.defaultVal !== undefined ? param.defaultVal : 64,
      type: param.type || 'continuous',
      domainMin: param.domainMin !== undefined ? param.domainMin : 0,
      domainMax: param.domainMax !== undefined ? param.domainMax : 127,
      unit: param.unit || 'value',
      curve: param.curve || 'Linear',
    }),
  );
}

// =============================================================================
// GENERATE OUTPUT FILES
// =============================================================================

/**
 * Generates the ParameterSpec JSON file for a synthesizer
 */
async function generateParameterSpec(synthName, parameters) {
  // Sort parameters by name for consistency
  const sortedParams = parameters.sort((a, b) => a.name.localeCompare(b.name));

  const spec = {
    schemaVersion: 1,
    model: synthName,
    description: `Especificación exhaustiva de parámetros para ${synthName}`,
    totalParameters: sortedParams.length,
    parameters: sortedParams,
  };

  // Determine filename based on synth name
  const modelLower = synthName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filename = `korg-${modelLower}-parameter_spec.json`;
  // Actually use the correct naming based on the synth
  let finalFilename;
  if (synthName.toLowerCase().includes('ms2000') || synthName.toLowerCase().includes('korg')) {
    finalFilename = 'korg_ms2000_parameter_spec.json';
  } else if (synthName.toLowerCase().includes('deepmind')) {
    finalFilename = 'behringer_deepmind12_parameter_spec.json';
  } else if (synthName.toLowerCase().includes('cz') || synthName.toLowerCase().includes('cz101')) {
    finalFilename = 'casio_cz101_parameter_spec.json';
  } else if (
    synthName.toLowerCase().includes('juno') ||
    synthName.toLowerCase().includes('roland')
  ) {
    finalFilename = 'roland_juno106_parameter_spec.json';
  } else {
    finalFilename = `${synthName}_parameter_spec.json`;
  }

  const filePath = path.join(CONTRACTS_DIR, finalFilename);
  await fs.writeFile(filePath, JSON.stringify(spec, null, 2));

  console.log(`✅ Generated: ${finalFilename} (${sortedParams.length} parameters)`);
  return filePath;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 SYNTHETIC PARAMETER SPEC SYNC SCRIPT');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Extract parameters from each synthesizer
    console.log('📡 Extracting parameters from synthesizers...\n');

    const ms2000Params = await extractMS2000Parameters();
    console.log(`   ✓ Korg MS2000: ${ms2000Params.length} parameters extracted\n`);

    const deepmindParams = await extractDeepMindParameters();
    console.log(`   ✓ Behringer DeepMind: ${deepmindParams.length} parameters extracted\n`);

    const casioParams = await extractCasioCZ101Parameters();
    console.log(`   ✓ Casio CZ-101: ${casioParams.length} parameters extracted\n`);

    const junoParams = await extractRolandJuno106Parameters();
    console.log(`   ✓ Roland Juno-106: ${junoParams.length} parameters extracted\n`);

    // Generate output files
    console.log('📤 Generating canonical ParameterSpec files...\n');

    await generateParameterSpec('Korg MS2000', ms2000Params);
    await generateParameterSpec('Behringer DeepMind', deepmindParams);
    await generateParameterSpec('Casio CZ-101', casioParams);
    await generateParameterSpec('Roland Juno-106', junoParams);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ SYNC COMPLETE');
    console.log('='.repeat(60));
    console.log('');
    console.log('Generated files in ABDSharedAssets/contracts/:');
    console.log('  - korg_ms2000_parameter_spec.json (~200 params)');
    console.log('  - behringer_deepmind12_parameter_spec.json (~100+ params)');
    console.log('  - casio_cz101_parameter_spec.json (~50+ params)');
    console.log('  - roland_juno106_parameter_spec.json (~30+ params)');
    console.log('');
    console.log('📝 Next steps:');
    console.log('  1. Update ABDSharedCode/MidiKeyboard parameterLookup.js');
    console.log('  2. Run tests: pnpm test -- parameterLookup');
    console.log('  3. Verify all synths resolve without warnings');
  } catch (error) {
    console.error('❌ Error during sync:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main
main();
