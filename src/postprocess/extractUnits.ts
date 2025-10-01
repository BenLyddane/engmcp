#!/usr/bin/env node

import { loadMasterSpecTypes } from '../utils/fileManager.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface UnitUsage {
  unit: string;
  count: number;
  specTypes: string[];
}

interface ExtractedUnits {
  totalUniqueUnits: number;
  units: string[];
  unitUsage: Record<string, UnitUsage>;
  preliminaryGroups: Record<string, string[]>;
  extractedAt: string;
}

/**
 * Extract all unique units from generated spec types
 */
function extractUnits(): ExtractedUnits {
  console.log('🔍 Extracting units from spec types...\n');

  const specTypes = loadMasterSpecTypes();
  console.log(`📂 Loaded ${specTypes.length} spec types\n`);

  const unitSet = new Set<string>();
  const unitUsage: Record<string, UnitUsage> = {};

  // Collect all units
  for (const spec of specTypes) {
    const allUnits: string[] = [];

    if (spec.primaryUnit) {
      allUnits.push(spec.primaryUnit);
    }
    if (spec.alternateUnits && spec.alternateUnits.length > 0) {
      allUnits.push(...spec.alternateUnits);
    }

    // Track usage
    for (const unit of allUnits) {
      if (unit) {
        unitSet.add(unit);

        if (!unitUsage[unit]) {
          unitUsage[unit] = {
            unit,
            count: 0,
            specTypes: [],
          };
        }

        unitUsage[unit].count++;
        if (!unitUsage[unit].specTypes.includes(spec.primaryName)) {
          unitUsage[unit].specTypes.push(spec.primaryName);
        }
      }
    }
  }

  // Sort units by usage count
  const sortedUnits = Array.from(unitSet).sort((a, b) => {
    const countA = unitUsage[a]?.count || 0;
    const countB = unitUsage[b]?.count || 0;
    return countB - countA;
  });

  // Preliminary grouping (will be refined by AI)
  const preliminaryGroups: Record<string, string[]> = {
    length: [],
    temperature: [],
    pressure: [],
    flowRate: [],
    power: [],
    electrical: [],
    unknown: [],
  };

  for (const unit of sortedUnits) {
    // Basic classification
    const unitLower = unit.toLowerCase();
    if (['in', 'mm', 'cm', 'm', 'ft', 'yd', 'mi'].includes(unitLower)) {
      preliminaryGroups.length.push(unit);
    } else if (['°f', '°c', 'f', 'c', 'k'].includes(unitLower)) {
      preliminaryGroups.temperature.push(unit);
    } else if (['psi', 'kpa', 'bar', 'inhg', 'mmhg', 'pa'].includes(unitLower)) {
      preliminaryGroups.pressure.push(unit);
    } else if (
      ['gpm', 'l/min', 'l/s', 'cfm', 'm³/h', 'm3/h', 'gal/min'].includes(
        unitLower
      )
    ) {
      preliminaryGroups.flowRate.push(unit);
    } else if (['w', 'kw', 'hp', 'btu/h', 'tons'].includes(unitLower)) {
      preliminaryGroups.power.push(unit);
    } else if (['v', 'kv', 'a', 'ma', 'hz', 'khz'].includes(unitLower)) {
      preliminaryGroups.electrical.push(unit);
    } else {
      preliminaryGroups.unknown.push(unit);
    }
  }

  const result: ExtractedUnits = {
    totalUniqueUnits: sortedUnits.length,
    units: sortedUnits,
    unitUsage,
    preliminaryGroups,
    extractedAt: new Date().toISOString(),
  };

  return result;
}

/**
 * Print extraction report
 */
function printReport(extracted: ExtractedUnits): void {
  console.log('═══════════════════════════════════════');
  console.log('        UNIT EXTRACTION REPORT         ');
  console.log('═══════════════════════════════════════\n');

  console.log(`📊 Total Unique Units: ${extracted.totalUniqueUnits}\n`);

  console.log('🔝 Most Common Units:');
  const topUnits = Object.values(extracted.unitUsage)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  topUnits.forEach((usage, index) => {
    console.log(
      `   ${index + 1}. ${usage.unit} (${usage.count} occurrences in ${usage.specTypes.length} spec types)`
    );
  });

  console.log('\n📦 Preliminary Groupings:');
  for (const [group, units] of Object.entries(extracted.preliminaryGroups)) {
    if (units.length > 0) {
      console.log(`   ${group}: ${units.join(', ')}`);
    }
  }

  if (extracted.preliminaryGroups.unknown.length > 0) {
    console.log('\n⚠️  Unknown Units (need classification):');
    console.log(`   ${extracted.preliminaryGroups.unknown.join(', ')}`);
  }

  console.log('\n═══════════════════════════════════════\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    const extracted = extractUnits();
    printReport(extracted);

    // Save results
    const outputPath = join(process.cwd(), 'output', 'discovered-units.json');
    writeFileSync(outputPath, JSON.stringify(extracted, null, 2));

    console.log(`💾 Saved extraction results to: ${outputPath}\n`);
    console.log('✅ Unit extraction complete!');
    console.log(
      '\nNext step: Run "npm run generate:units" to create unit groups\n'
    );
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
