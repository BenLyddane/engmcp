#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { join } from 'path';
import { generateTestSpecTypes } from './generators/testGenerator.js';
import { validateSpecTypes, printValidationReport } from './utils/validator.js';
import { GenerationOutput } from './types/schemas.js';
import {
  loadMasterSpecTypes,
  clearMasterFile,
  ensureOutputDir,
  getMasterFilePath,
} from './utils/fileManager.js';

/**
 * Main entry point for the spec type generator
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'test';
  const clearFlag = args.includes('--clear');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   MEP Spec Type Generator                              ║');
  console.log('║   Powered by Claude AI                                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (mode !== 'test' && mode !== 'full') {
    console.error('❌ Invalid mode. Use "test" or "full"');
    console.error('   Optional: Add --clear flag to start fresh');
    process.exit(1);
  }

  console.log(`Mode: ${mode.toUpperCase()}\n`);

  // Clear master file if requested
  if (clearFlag) {
    console.log('🗑️  Clearing master file...');
    clearMasterFile();
    console.log('');
  }

  try {
    if (mode === 'test') {
      await runTestMode();
    } else {
      await runFullMode();
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Run test mode - generate 5 spec types for validation
 */
async function runTestMode() {
  console.log('Running in TEST MODE - generating 5 spec types for validation\n');

  // Generate test spec types (saved incrementally to master file)
  const newSpecTypes = await generateTestSpecTypes();

  // Load all spec types from master file
  const allSpecTypes = loadMasterSpecTypes();

  // Validate all spec types
  console.log('\n📋 Validating all spec types...\n');
  const validationReport = await validateSpecTypes(allSpecTypes);

  // Print validation report
  printValidationReport(validationReport);

  // Create output directory
  ensureOutputDir();

  // Save test summary
  const output: GenerationOutput = {
    specTypes: allSpecTypes,
    unitGroups: [],
    componentMappings: [],
    validationReport,
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'test',
      totalSpecTypes: allSpecTypes.length,
      domains: {
        HVAC: allSpecTypes.filter((s) => s.domain === 'HVAC').length,
        ELECTRICAL: allSpecTypes.filter((s) => s.domain === 'ELECTRICAL')
          .length,
        PLUMBING: allSpecTypes.filter((s) => s.domain === 'PLUMBING').length,
        FIRE_PROTECTION: allSpecTypes.filter(
          (s) => s.domain === 'FIRE_PROTECTION'
        ).length,
      },
    },
  };

  const outputPath = join(process.cwd(), 'output', 'test-summary.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n💾 Test summary saved to: ${outputPath}`);
  console.log(`💾 Master file: ${getMasterFilePath()}`);
  console.log(`   Total spec types in master file: ${allSpecTypes.length}`);
  console.log('\n✅ Test generation complete!');
  console.log('\nReview the results and validation report.');
  console.log(
    'If satisfied, run "npm run generate:full" for full generation.'
  );
  console.log(
    'To start fresh, run with --clear flag: "npm run generate:test -- --clear"\n'
  );
}

/**
 * Run full mode - generate comprehensive spec types
 */
async function runFullMode() {
  console.log('Running in FULL MODE - generating GLOBAL spec type library\n');

  // Import global generator dynamically
  const { generateGlobalSpecTypes } = await import('./generators/globalSpecTypeGenerator.js');

  // Generate global spec type library (saved incrementally to master file)
  const newSpecTypes = await generateGlobalSpecTypes();

  // Load all spec types from master file
  const allSpecTypes = loadMasterSpecTypes();

  // Validate all spec types
  console.log('\n📋 Validating all spec types...\n');
  const validationReport = await validateSpecTypes(allSpecTypes);

  // Print validation report
  printValidationReport(validationReport);

  // Create output directory
  ensureOutputDir();

  // Save full summary
  const output: GenerationOutput = {
    specTypes: allSpecTypes,
    unitGroups: [],
    componentMappings: [],
    validationReport,
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'full',
      totalSpecTypes: allSpecTypes.length,
      domains: {
        HVAC: allSpecTypes.filter((s) => s.domain === 'HVAC').length,
        ELECTRICAL: allSpecTypes.filter((s) => s.domain === 'ELECTRICAL')
          .length,
        PLUMBING: allSpecTypes.filter((s) => s.domain === 'PLUMBING').length,
        FIRE_PROTECTION: allSpecTypes.filter(
          (s) => s.domain === 'FIRE_PROTECTION'
        ).length,
      },
    },
  };

  const outputPath = join(process.cwd(), 'output', 'full-summary.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n💾 Full summary saved to: ${outputPath}`);
  console.log(`💾 Master file: ${getMasterFilePath()}`);
  console.log(`   Total spec types in master file: ${allSpecTypes.length}`);
  console.log('\n✅ Full generation complete!');
  console.log('\nNext steps:');
  console.log('  1. npm run extract:units    - Extract all units');
  console.log('  2. npm run generate:units   - Create unit groups');
  console.log('  3. npm run link:units       - Link units to spec types\n');
}

// Run the main function
main().catch(console.error);
