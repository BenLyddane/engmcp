#!/usr/bin/env node
import { generateUUID } from '../utils/claude.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import convert from 'convert-units';
/**
 * Normalize unit string to canonical form
 */
function normalizeUnit(unitString) {
    const normalized = unitString.trim();
    // Try to match with convert-units library
    try {
        const measures = ['length', 'area', 'mass', 'volume', 'temperature', 'time',
            'frequency', 'speed', 'pressure', 'energy', 'power',
            'current', 'voltage'];
        for (const measure of measures) {
            const possibilities = convert().possibilities(measure);
            const match = possibilities.find((p) => p.toLowerCase() === normalized.toLowerCase() ||
                p === normalized);
            if (match) {
                return match; // Return library's canonical form
            }
        }
    }
    catch (error) {
        // Not in library, return as-is
    }
    return normalized;
}
/**
 * Create unit groups from extracted units
 */
async function generateUnitGroups() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   Unit Group Generator                                 ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    // Load extracted units
    const discoveredPath = join(process.cwd(), 'output', 'discovered-units.json');
    const discovered = JSON.parse(readFileSync(discoveredPath, 'utf-8'));
    console.log(`📂 Loaded ${discovered.totalUniqueUnits} extracted units\n`);
    // Normalize and deduplicate units
    const unitMap = new Map();
    for (const unit of discovered.units) {
        const canonical = normalizeUnit(unit);
        if (!unitMap.has(canonical)) {
            unitMap.set(canonical, new Set());
        }
        unitMap.get(canonical).add(unit);
    }
    console.log(`✨ Normalized to ${unitMap.size} canonical units\n`);
    // Create unit records with UUIDs
    const units = [];
    const unitIdMap = new Map();
    for (const [canonical, variations] of unitMap.entries()) {
        const unitId = generateUUID();
        unitIdMap.set(canonical, unitId);
        units.push({
            id: unitId,
            symbol: canonical,
            name: canonical, // Will be enriched later if needed
            abbreviations: Array.from(variations),
            unitGroupId: '', // Will be set when creating groups
        });
    }
    console.log(`📦 Created ${units.length} unit records\n`);
    // Group units by type using convert-units library
    const unitGroups = [];
    const processedUnits = new Set();
    const measures = [
        'length', 'area', 'mass', 'volume', 'temperature', 'time',
        'frequency', 'speed', 'pressure', 'energy', 'power',
        'current', 'voltage'
    ];
    for (const measure of measures) {
        console.log(`\r📊 Processing ${measure} units...`);
        const groupId = `ug-${measure}`;
        const groupUnits = [];
        const conversions = [];
        try {
            const possibilities = convert().possibilities(measure);
            for (const unit of units) {
                if (processedUnits.has(unit.symbol))
                    continue;
                if (possibilities.some((p) => p === unit.symbol || p.toLowerCase() === unit.symbol.toLowerCase())) {
                    unit.unitGroupId = groupId;
                    groupUnits.push(unit);
                    processedUnits.add(unit.symbol);
                }
            }
            if (groupUnits.length > 0) {
                // Generate conversions between all units in group
                for (const fromUnit of groupUnits) {
                    for (const toUnit of groupUnits) {
                        if (fromUnit.id === toUnit.id)
                            continue;
                        try {
                            const result = convert(1).from(fromUnit.symbol).to(toUnit.symbol);
                            conversions.push({
                                id: generateUUID(),
                                fromUnitId: fromUnit.id,
                                toUnitId: toUnit.id,
                                multiplier: result,
                                equation: `x * ${result}`,
                                description: `${fromUnit.symbol} to ${toUnit.symbol}`,
                            });
                        }
                        catch (error) {
                            // Conversion not available
                        }
                    }
                }
                unitGroups.push({
                    id: groupId,
                    name: measure.charAt(0).toUpperCase() + measure.slice(1),
                    description: `${measure} measurement units`,
                    baseUnitId: groupUnits[0]?.id,
                    unitIds: groupUnits.map(u => u.id),
                    conversions,
                });
                console.log(`  ✓ ${measure}: ${groupUnits.length} units, ${conversions.length} conversions`);
            }
        }
        catch (error) {
            console.error(`  ✗ Error processing ${measure}:`, error);
        }
    }
    // Handle custom MEP units not in library
    const unmappedUnits = units.filter(u => !processedUnits.has(u.symbol));
    console.log(`\n📝 ${unmappedUnits.length} custom MEP units need manual classification\n`);
    if (unmappedUnits.length > 0) {
        console.log('Custom units (first 20):');
        unmappedUnits.slice(0, 20).forEach(u => {
            console.log(`   - ${u.symbol} (${u.abbreviations.length} variations)`);
        });
    }
    // Save results
    const output = {
        units,
        unitGroups,
        metadata: {
            totalUnits: units.length,
            totalGroups: unitGroups.length,
            totalConversions: unitGroups.reduce((sum, g) => sum + g.conversions.length, 0),
            unmappedUnits: unmappedUnits.length,
            generatedAt: new Date().toISOString(),
        },
    };
    const outputPath = join(process.cwd(), 'output', 'global-units-master.json');
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved to: ${outputPath}`);
    console.log(`\n✅ Unit group generation complete!`);
    console.log(`📊 Summary:`);
    console.log(`   - ${output.metadata.totalUnits} units`);
    console.log(`   - ${output.metadata.totalGroups} unit groups`);
    console.log(`   - ${output.metadata.totalConversions} conversions`);
    console.log(`   - ${output.metadata.unmappedUnits} unmapped units\n`);
}
generateUnitGroups().catch(console.error);
//# sourceMappingURL=generateUnitGroups.js.map