#!/usr/bin/env node
import { loadMasterSpecTypes } from '../utils/fileManager.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
/**
 * Find unit by symbol or abbreviation (deterministic matching)
 */
function findUnitBySymbol(symbol, units) {
    if (!symbol)
        return null;
    return units.find(u => u.symbol === symbol ||
        u.symbol.toLowerCase() === symbol.toLowerCase() ||
        u.abbreviations.some(abbr => abbr === symbol ||
            abbr.toLowerCase() === symbol.toLowerCase())) || null;
}
/**
 * Link units to spec types using UUIDs
 */
async function linkUnits() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   Unit Linking Utility (Deterministic)                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    // Load global units
    const unitsPath = join(process.cwd(), 'output', 'global-units-master.json');
    const unitsData = JSON.parse(readFileSync(unitsPath, 'utf-8'));
    const units = unitsData.units;
    console.log(`📂 Loaded ${units.length} global units\n`);
    // Load spec types
    const specTypes = loadMasterSpecTypes();
    console.log(`📂 Loaded ${specTypes.length} spec types\n`);
    let linked = 0;
    let unmatched = 0;
    const unmatchedUnits = new Set();
    console.log('🔗 Linking units to spec types...\n');
    for (const specType of specTypes) {
        let hasChanges = false;
        // Link primary unit
        if (specType.primaryUnit) {
            const unit = findUnitBySymbol(specType.primaryUnit, units);
            if (unit) {
                specType.primaryUnitId = unit.id;
                specType.primaryUnitGroupId = unit.unitGroupId || undefined;
                hasChanges = true;
                linked++;
            }
            else {
                unmatchedUnits.add(specType.primaryUnit);
                unmatched++;
            }
        }
        // Link alternate units
        if (specType.alternateUnits && specType.alternateUnits.length > 0) {
            specType.alternateUnitIds = [];
            for (const altUnit of specType.alternateUnits) {
                const unit = findUnitBySymbol(altUnit, units);
                if (unit) {
                    specType.alternateUnitIds.push(unit.id);
                    linked++;
                }
                else {
                    unmatchedUnits.add(altUnit);
                    unmatched++;
                }
            }
            if (specType.alternateUnitIds.length > 0) {
                hasChanges = true;
            }
        }
    }
    console.log(`✅ Linking complete!`);
    console.log(`📊 Results:`);
    console.log(`   - ${linked} unit references linked`);
    console.log(`   - ${unmatched} unmatched unit references\n`);
    if (unmatchedUnits.size > 0) {
        console.log(`⚠️  Unmatched units (first 20):`);
        Array.from(unmatchedUnits).slice(0, 20).forEach(u => {
            console.log(`   - ${u}`);
        });
        console.log('');
    }
    // Save updated spec types
    const outputPath = join(process.cwd(), 'output', 'spec-types-with-unit-ids.json');
    const output = {
        specTypes,
        metadata: {
            totalSpecTypes: specTypes.length,
            linkedUnits: linked,
            unmatchedUnits: unmatched,
            updatedAt: new Date().toISOString(),
        },
    };
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    // Also update the master file
    const masterPath = join(process.cwd(), 'output', 'spec-types-master.json');
    const masterData = {
        specTypes,
        metadata: {
            lastUpdated: new Date().toISOString(),
            totalCount: specTypes.length,
        },
    };
    writeFileSync(masterPath, JSON.stringify(masterData, null, 2));
    console.log(`💾 Saved to: ${outputPath}`);
    console.log(`💾 Updated: ${masterPath}`);
    console.log(`\n✅ Unit linking complete!\n`);
}
linkUnits().catch(console.error);
//# sourceMappingURL=linkUnits.js.map