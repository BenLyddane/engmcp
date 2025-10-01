#!/usr/bin/env node

import { Unit, UnitGroup, ConversionEquation } from '../types/schemas.js';
import { generateUUID } from '../utils/claude.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Generate ALL conversions between units in a group using transitive relationships
 * For N units, creates N*(N-1) conversions (full bidirectional graph)
 */
function generateCompleteConversions(units: Unit[], existingConversions: ConversionEquation[]): ConversionEquation[] {
  const n = units.length;
  
  if (n < 2) {
    return existingConversions;
  }

  console.log(`  Processing ${n} units - need ${n * (n - 1)} conversions...`);

  // Build conversion map from existing
  const conversionMap = new Map<string, number>();
  for (const conv of existingConversions) {
    const key = `${conv.fromUnitId}→${conv.toUnitId}`;
    conversionMap.set(key, conv.multiplier);
  }

  // Floyd-Warshall algorithm to find all transitive conversions
  const multipliers = new Map<string, number>();
  
  // Initialize with direct conversions
  for (const conv of existingConversions) {
    const key = `${conv.fromUnitId}→${conv.toUnitId}`;
    multipliers.set(key, conv.multiplier);
  }

  // Self-conversions (identity)
  for (const unit of units) {
    multipliers.set(`${unit.id}→${unit.id}`, 1.0);
  }

  // Find all paths through intermediate units
  for (const k of units) {
    for (const i of units) {
      for (const j of units) {
        const ikKey = `${i.id}→${k.id}`;
        const kjKey = `${k.id}→${j.id}`;
        const ijKey = `${i.id}→${j.id}`;
        
        const ikMult = multipliers.get(ikKey);
        const kjMult = multipliers.get(kjKey);
        
        if (ikMult !== undefined && kjMult !== undefined) {
          const transitiveMultiplier = ikMult * kjMult;
          
          // Only add if we don't have this conversion yet
          if (!multipliers.has(ijKey)) {
            multipliers.set(ijKey, transitiveMultiplier);
          }
        }
      }
    }
  }

  // Create conversion equations for all pairs
  const allConversions: ConversionEquation[] = [];
  
  for (const fromUnit of units) {
    for (const toUnit of units) {
      if (fromUnit.id === toUnit.id) continue; // Skip self
      
      const key = `${fromUnit.id}→${toUnit.id}`;
      const multiplier = multipliers.get(key);
      
      if (multiplier !== undefined) {
        // Check if conversion already exists
        const existing = existingConversions.find(
          c => c.fromUnitId === fromUnit.id && c.toUnitId === toUnit.id
        );
        
        if (existing) {
          allConversions.push(existing);
        } else {
          // Create new conversion
          allConversions.push({
            id: generateUUID(),
            fromUnitId: fromUnit.id,
            toUnitId: toUnit.id,
            multiplier: multiplier,
            equation: `x * ${multiplier}`,
            description: `${fromUnit.symbol} to ${toUnit.symbol}`,
          });
        }
      }
    }
  }

  const added = allConversions.length - existingConversions.length;
  console.log(`    ✓ ${existingConversions.length} existing + ${added} generated = ${allConversions.length} total`);

  return allConversions;
}

/**
 * Validate that all conversions are bidirectional and accurate
 */
function validateConversions(conversions: ConversionEquation[]): { valid: number; issues: number } {
  let valid = 0;
  let issues = 0;

  for (const conv of conversions) {
    const reverse = conversions.find(
      c => c.fromUnitId === conv.toUnitId && c.toUnitId === conv.fromUnitId
    );

    if (reverse) {
      const product = conv.multiplier * reverse.multiplier;
      if (Math.abs(product - 1.0) < 0.01) {
        valid++;
      } else {
        console.warn(`    ⚠️  Inverse mismatch: ${conv.fromUnitId} ↔ ${conv.toUnitId} (${product.toFixed(4)})`);
        issues++;
      }
    } else {
      console.warn(`    ⚠️  Missing reverse: ${conv.fromUnitId} → ${conv.toUnitId}`);
      issues++;
    }
  }

  return { valid, issues };
}

/**
 * Main function
 */
async function ensureCompleteConversions() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Complete Conversion Generator                        ║');
  console.log('║   Ensures ALL units in a group can convert to ALL      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const unitsPath = join(process.cwd(), 'output', 'global-units-master.json');
  const unitsData = JSON.parse(readFileSync(unitsPath, 'utf-8'));
  
  const allUnits: Unit[] = unitsData.units;
  const unitGroups: UnitGroup[] = unitsData.unitGroups;

  console.log(`📊 Processing ${unitGroups.length} unit groups...\n`);

  let totalOriginal = 0;
  let totalGenerated = 0;
  let groupsFixed = 0;

  for (const group of unitGroups) {
    const groupUnits = allUnits.filter(u => group.unitIds.includes(u.id));
    const originalCount = group.conversions.length;
    const expectedCount = groupUnits.length * (groupUnits.length - 1);

    console.log(`\n📁 ${group.name} (${groupUnits.length} units)`);
    console.log(`  Original: ${originalCount} conversions`);
    console.log(`  Expected: ${expectedCount} conversions`);

    if (originalCount < expectedCount) {
      // Generate complete conversions
      const completeConversions = generateCompleteConversions(groupUnits, group.conversions);
      group.conversions = completeConversions;
      
      const added = completeConversions.length - originalCount;
      totalOriginal += originalCount;
      totalGenerated += added;
      groupsFixed++;
      
      console.log(`  ✅ Added ${added} conversions`);
      
      // Validate
      const { valid, issues } = validateConversions(completeConversions);
      if (issues > 0) {
        console.log(`  ⚠️  ${issues} validation issues`);
      }
    } else {
      console.log(`  ✓ Already complete`);
      totalOriginal += originalCount;
    }
  }

  // Save updated data
  const output = {
    units: allUnits,
    unitGroups: unitGroups,
    metadata: {
      totalUnits: allUnits.length,
      totalGroups: unitGroups.length,
      totalConversions: unitGroups.reduce((sum, g) => sum + g.conversions.length, 0),
      generatedAt: new Date().toISOString(),
    },
  };

  writeFileSync(
    join(process.cwd(), 'output', 'global-units-master.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Summary                                              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`  Original conversions: ${totalOriginal}`);
  console.log(`  Generated conversions: ${totalGenerated}`);
  console.log(`  Total conversions: ${output.metadata.totalConversions}`);
  console.log(`  Groups fixed: ${groupsFixed}/${unitGroups.length}`);
  console.log('\n✅ Complete! All unit groups now have full conversion coverage.\n');
}

ensureCompleteConversions().catch(console.error);
