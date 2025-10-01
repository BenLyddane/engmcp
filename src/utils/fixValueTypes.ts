import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SpecType } from '../types/schemas.js';
import { askClaudeJSON } from './claude.js';

const MASTER_FILE = join(process.cwd(), 'output', 'spec-types-master.json');
const BACKUP_FILE = join(process.cwd(), 'output', 'spec-types-master.backup.json');

interface ValueTypeAnalysis {
  recommendedValueType: 'NUMERIC' | 'SELECT' | 'MULTI_SELECT' | 'RANGE' | 'BOOLEAN' | 'STRING';
  reasoning: string;
  shouldHaveValueOptions: boolean;
  recommendedAllowsArray: boolean;
  shouldHaveUnits: boolean;
  recommendedPrimaryUnit?: string;
  recommendedAlternateUnits?: string[];
}

/**
 * Create a backup of the master file before making changes
 */
function createBackup(): void {
  if (existsSync(MASTER_FILE)) {
    copyFileSync(MASTER_FILE, BACKUP_FILE);
    console.log(`✅ Backup created: ${BACKUP_FILE}`);
  } else {
    throw new Error('Master file not found!');
  }
}

/**
 * Analyze a spec type and determine the correct valueType and units
 */
async function analyzeSpecType(specType: SpecType): Promise<ValueTypeAnalysis> {
  const currentUnits = {
    primaryUnit: (specType as any).primaryUnit,
    alternateUnits: (specType as any).alternateUnits
  };
  
  const prompt = `Analyze this spec type and determine the correct valueType and units:

Name: ${specType.primaryName}
Current ValueType: ${specType.valueType}
Description: ${specType.description}
Domain: ${specType.domain}
${specType.valueOptions ? `Has ${specType.valueOptions.length} predefined value options` : 'No predefined value options'}
Current allowsArray: ${specType.allowsArray}
Current units: ${currentUnits.primaryUnit ? `Primary: ${currentUnits.primaryUnit}, Alternates: ${currentUnits.alternateUnits?.join(', ') || 'none'}` : 'No units assigned'}

ValueType Options:
- STRING: Free-form text data (e.g., names, descriptions, custom measurements like "24 inches")
- SELECT: Single selection from predefined options (valueOptions), but user can also enter custom string
  Example: "Pipe Size" with options ["1/2 in", "3/4 in", "1 in", "1.5 in", "2 in"] - has units!
- MULTI_SELECT: Multiple selections from predefined options (valueOptions), user can also enter custom strings
- NUMERIC: Numerical measurement with units (temperature, pressure, flow, etc.)
- RANGE: Numerical range (min-max) with units
- BOOLEAN: True/false value (rarely has units)

Rules:
1. Use STRING for free-form text like names, descriptions, model numbers, or custom measurements
2. Use SELECT when there are common predefined options (even with units like pipe sizes)
3. Use MULTI_SELECT when multiple selections make sense
4. Use NUMERIC for pure numerical measurements
5. Use RANGE for min-max numerical ranges
6. Use BOOLEAN for yes/no, on/off, enabled/disabled
7. Units are based on whether this represents a MEASURABLE QUANTITY, not the valueType
8. SELECT and STRING can have units if they represent measurements (e.g., "Pipe Size", "Custom Length")

For units:
- Ask: "Does this represent a physical measurement or quantity?"
- If yes (regardless of valueType): shouldHaveUnits = true, specify appropriate units
- If no (like "Equipment Name", "Refrigerant Type"): shouldHaveUnits = false
- Common measurement units: °F/°C, PSI/kPa, in/mm, GPM/L/s, CFM/m³/h, BTU/h/kW, V/A/W, etc.

Return JSON with:
{
  "recommendedValueType": "STRING" | "SELECT" | "MULTI_SELECT" | "NUMERIC" | "RANGE" | "BOOLEAN",
  "reasoning": "Brief explanation of why",
  "shouldHaveValueOptions": true/false,
  "recommendedAllowsArray": true/false,
  "shouldHaveUnits": true/false,
  "recommendedPrimaryUnit": "unit symbol or omit if shouldHaveUnits is false",
  "recommendedAlternateUnits": ["unit1", "unit2"] or omit if shouldHaveUnits is false
}`;

  return await askClaudeJSON<ValueTypeAnalysis>(prompt);
}

/**
 * Dry run - analyze without making changes
 */
export async function dryRunValueTypeFixes(limit: number = 10): Promise<void> {
  console.log('🔍 DRY RUN MODE - No changes will be saved');
  console.log('Loading spec types from master file...');
  
  const fileContent = readFileSync(MASTER_FILE, 'utf-8');
  const data = JSON.parse(fileContent);
  const specTypes: SpecType[] = data.specTypes || [];
  
  console.log(`Analyzing first ${limit} spec types (total: ${specTypes.length})`);
  
  const recommendations: Array<{
    name: string;
    currentValueType: string;
    recommendedValueType: string;
    reasoning: string;
    wouldChange: boolean;
  }> = [];
  
  for (let i = 0; i < Math.min(limit, specTypes.length); i++) {
    const specType = specTypes[i];
    
    console.log(`\n[${i + 1}/${limit}] Analyzing: ${specType.primaryName}`);
    
    try {
      const analysis = await analyzeSpecType(specType);
      
      const wouldChange = analysis.recommendedValueType !== specType.valueType ||
                         analysis.recommendedAllowsArray !== specType.allowsArray;
      
      recommendations.push({
        name: specType.primaryName,
        currentValueType: specType.valueType,
        recommendedValueType: analysis.recommendedValueType,
        reasoning: analysis.reasoning,
        wouldChange
      });
      
      if (wouldChange) {
        console.log(`  ⚠️  WOULD CHANGE: ${specType.valueType} → ${analysis.recommendedValueType}`);
        console.log(`  Reason: ${analysis.reasoning}`);
      } else {
        console.log(`  ✓ No change needed`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }
  }
  
  const changesCount = recommendations.filter(r => r.wouldChange).length;
  console.log('\n' + '='.repeat(60));
  console.log(`DRY RUN SUMMARY: ${changesCount} of ${recommendations.length} would be changed`);
  console.log('='.repeat(60));
  
  if (changesCount > 0) {
    console.log('\nSpec types that would be modified:');
    recommendations.filter(r => r.wouldChange).forEach(r => {
      console.log(`  • ${r.name}: ${r.currentValueType} → ${r.recommendedValueType}`);
    });
  }
}

/**
 * Process a chunk of spec types (for parallel processing)
 */
async function processChunk(
  specTypes: SpecType[],
  chunkIndex: number,
  totalChunks: number
): Promise<{ fixed: number; skipped: number; errors: number; updatedSpecTypes: SpecType[] }> {
  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < specTypes.length; i++) {
    const specType = specTypes[i];
    const specTypeAny = specType as any;
    
    console.log(`[Worker ${chunkIndex + 1}/${totalChunks}] [${i + 1}/${specTypes.length}] ${specType.primaryName}`);
    
    try {
      const analysis = await analyzeSpecType(specType);
      
      let changed = false;
      
      // Fix valueType
      if (analysis.recommendedValueType !== specType.valueType) {
        console.log(`  ✏️  valueType: ${specType.valueType} → ${analysis.recommendedValueType}`);
        specType.valueType = analysis.recommendedValueType;
        changed = true;
        fixedCount++;
      }
      
      // Fix allowsArray
      if (analysis.recommendedAllowsArray !== specType.allowsArray) {
        console.log(`  ✏️  allowsArray: ${specType.allowsArray} → ${analysis.recommendedAllowsArray}`);
        specType.allowsArray = analysis.recommendedAllowsArray;
        changed = true;
      }
      
      // Handle units based on measurability (not valueType)
      if (analysis.shouldHaveUnits) {
        // Should have units - add or update them
        if (analysis.recommendedPrimaryUnit) {
          if (!specTypeAny.primaryUnit || specTypeAny.primaryUnit !== analysis.recommendedPrimaryUnit) {
            console.log(`  ✏️  primaryUnit: ${specTypeAny.primaryUnit || 'none'} → ${analysis.recommendedPrimaryUnit}`);
            specTypeAny.primaryUnit = analysis.recommendedPrimaryUnit;
            changed = true;
          }
        }
        
        if (analysis.recommendedAlternateUnits && analysis.recommendedAlternateUnits.length > 0) {
          const currentAlternates = specTypeAny.alternateUnits || [];
          const newAlternates = analysis.recommendedAlternateUnits;
          
          if (JSON.stringify(currentAlternates) !== JSON.stringify(newAlternates)) {
            console.log(`  ✏️  alternateUnits updated (${newAlternates.length} units)`);
            specTypeAny.alternateUnits = newAlternates;
            changed = true;
          }
        }
      } else {
        // Should NOT have units (not measurable) - remove them if present
        if (specTypeAny.primaryUnit) {
          console.log(`  🗑️  Removing primaryUnit (not a measurable quantity)`);
          delete specTypeAny.primaryUnit;
          delete specTypeAny.primaryUnitId;
          delete specTypeAny.primaryUnitGroup;
          delete specTypeAny.primaryUnitGroupId;
          changed = true;
        }
        
        if (specTypeAny.alternateUnits) {
          console.log(`  🗑️  Removing alternateUnits (not a measurable quantity)`);
          delete specTypeAny.alternateUnits;
          delete specTypeAny.alternateUnitIds;
          changed = true;
        }
      }
      
      if (!changed) {
        skippedCount++;
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      errorCount++;
    }
  }
  
  return { fixed: fixedCount, skipped: skippedCount, errors: errorCount, updatedSpecTypes: specTypes };
}

/**
 * Fix valueTypes for all spec types with parallel processing
 */
export async function fixAllValueTypes(parallelWorkers: number = 10): Promise<void> {
  console.log(`🔧 LIVE MODE - Processing with ${parallelWorkers} parallel workers`);
  console.log('\nCreating backup...');
  createBackup();
  
  console.log('\nLoading spec types from master file...');
  
  const fileContent = readFileSync(MASTER_FILE, 'utf-8');
  const data = JSON.parse(fileContent);
  const specTypes: SpecType[] = data.specTypes || [];
  
  console.log(`Found ${specTypes.length} spec types to analyze`);
  
  // Split into chunks for parallel processing
  const chunkSize = Math.ceil(specTypes.length / parallelWorkers);
  const chunks: SpecType[][] = [];
  
  for (let i = 0; i < specTypes.length; i += chunkSize) {
    chunks.push(specTypes.slice(i, i + chunkSize));
  }
  
  console.log(`Split into ${chunks.length} chunks of ~${chunkSize} spec types each\n`);
  console.log('Starting parallel processing...\n');
  
  // Process all chunks in parallel
  const results = await Promise.all(
    chunks.map((chunk, index) => processChunk(chunk, index, chunks.length))
  );
  
  // Merge results back into original array
  let allUpdatedSpecTypes: SpecType[] = [];
  let totalFixed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  results.forEach(result => {
    allUpdatedSpecTypes = allUpdatedSpecTypes.concat(result.updatedSpecTypes);
    totalFixed += result.fixed;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  });
  
  // Save final result once
  console.log('\n💾 Saving final results...');
  data.specTypes = allUpdatedSpecTypes;
  data.metadata.lastUpdated = new Date().toISOString();
  data.metadata.totalCount = allUpdatedSpecTypes.length;
  writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Complete!`);
  console.log(`   Fixed: ${totalFixed} spec types`);
  console.log(`   Unchanged: ${totalSkipped} spec types`);
  console.log(`   Errors: ${totalErrors} spec types`);
  console.log(`   Backup saved to: ${BACKUP_FILE}`);
  console.log('='.repeat(60));
}

/**
 * Fix valueTypes for a specific range of spec types (for testing or resuming)
 */
export async function fixValueTypesRange(startIndex: number, endIndex: number): Promise<void> {
  console.log(`🔧 Processing range ${startIndex} to ${endIndex}`);
  console.log('\nCreating backup...');
  createBackup();
  
  console.log(`\nLoading spec types from master file...`);
  
  const fileContent = readFileSync(MASTER_FILE, 'utf-8');
  const data = JSON.parse(fileContent);
  const specTypes: SpecType[] = data.specTypes || [];
  
  const actualEnd = Math.min(endIndex, specTypes.length);
  console.log(`Processing spec types ${startIndex} to ${actualEnd} of ${specTypes.length}`);
  
  let fixedCount = 0;
  
  for (let i = startIndex; i < actualEnd; i++) {
    const specType = specTypes[i];
    
    console.log(`\n[${i + 1}/${specTypes.length}] Analyzing: ${specType.primaryName}`);
    
    try {
      const analysis = await analyzeSpecType(specType);
      
      let changed = false;
      
      if (analysis.recommendedValueType !== specType.valueType) {
        console.log(`  ✏️  ${specType.valueType} → ${analysis.recommendedValueType}: ${analysis.reasoning}`);
        specType.valueType = analysis.recommendedValueType;
        changed = true;
        fixedCount++;
      }
      
      if (analysis.recommendedAllowsArray !== specType.allowsArray) {
        specType.allowsArray = analysis.recommendedAllowsArray;
        changed = true;
      }
      
      if (changed) {
        data.metadata.lastUpdated = new Date().toISOString();
        data.metadata.totalCount = specTypes.length;
        writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
        console.log(`  💾 Saved`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }
  }
  
  console.log(`\n✅ Fixed ${fixedCount} spec types in range ${startIndex}-${actualEnd}`);
}
