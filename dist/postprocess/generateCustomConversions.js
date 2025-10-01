#!/usr/bin/env node
import { askClaudeJSON, generateUUID } from '../utils/claude.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
async function classifyUnit(unit, existingGroups) {
    const prompt = `Classify this MEP unit: ${unit.symbol}
EXISTING GROUPS: ${existingGroups.join(', ')}
Return JSON: {"groupName": "exact name"}`;
    try {
        const response = await askClaudeJSON(prompt, 'MEP expert');
        return response.groupName.trim();
    }
    catch {
        return 'Uncategorized';
    }
}
function validateConversion(conv, fromUnit, allUnits) {
    if (!conv.from || !conv.to || typeof conv.multiplier !== 'number' || !conv.equation)
        return null;
    if (conv.from !== fromUnit.symbol || !allUnits.find(u => u.symbol === conv.to))
        return null;
    if (conv.multiplier <= 0 || !isFinite(conv.multiplier) || !conv.equation.includes('x'))
        return null;
    return { from: conv.from, to: conv.to, multiplier: conv.multiplier, equation: conv.equation.trim() };
}
async function generateConversionsFromUnit(fromUnit, toUnits, groupName) {
    const prompt = `Convert ${fromUnit.symbol} to: ${toUnits.map(u => u.symbol).join(', ')}
Group: ${groupName}
Examples: GPM=0.06309*L/s, CFM=0.4719*L/s, ton=12000*BTU/h
Return ${toUnits.length} conversions: [{"from":"${fromUnit.symbol}","to":"unit","multiplier":N,"equation":"x * N"}]`;
    try {
        return await askClaudeJSON(prompt, 'MEP conversion expert');
    }
    catch {
        return [];
    }
}
function loadCheckpoint() {
    const path = join(process.cwd(), 'output', 'conversions-checkpoint.json');
    if (existsSync(path)) {
        try {
            const data = JSON.parse(readFileSync(path, 'utf-8'));
            if (data.classificationComplete !== undefined)
                return data;
        }
        catch { }
    }
    return { classificationComplete: false, groupsClassified: {}, conversionsGroupsCompleted: [], currentConversionGroupId: null, unitsCompleted: [], lastUpdated: new Date().toISOString() };
}
function saveCheckpoint(cp) {
    cp.lastUpdated = new Date().toISOString();
    writeFileSync(join(process.cwd(), 'output', 'conversions-checkpoint.json'), JSON.stringify(cp, null, 2));
}
function saveData(units, groups) {
    const output = { units, unitGroups: groups, metadata: { totalUnits: units.length, totalGroups: groups.length, totalConversions: groups.reduce((s, g) => s + g.conversions.length, 0), generatedAt: new Date().toISOString() } };
    writeFileSync(join(process.cwd(), 'output', 'global-units-master.json'), JSON.stringify(output, null, 2));
}
async function main() {
    const batchGroupLimit = process.argv[2] ? parseInt(process.argv[2]) : undefined;
    console.log('Robust Per-Unit Conversion Generator');
    if (batchGroupLimit)
        console.log('Batch Mode: ' + batchGroupLimit + ' groups max');
    console.log('');
    const data = JSON.parse(readFileSync(join(process.cwd(), 'output', 'global-units-master.json'), 'utf-8'));
    const allUnits = data.units;
    const unitGroups = data.unitGroups;
    const checkpoint = loadCheckpoint();
    const unmapped = allUnits.filter(u => !u.unitGroupId);
    if (checkpoint.classificationComplete) {
        console.log('Phase 1: Already classified (resuming)');
    }
    else {
        console.log('Phase 1: Classifying ' + unmapped.length + ' units');
    }
    console.log('');
    // PHASE 1
    if (!checkpoint.classificationComplete && unmapped.length > 0) {
        const batchSize = 20;
        for (let i = 0; i < unmapped.length; i += batchSize) {
            const batch = unmapped.slice(i, Math.min(i + batchSize, unmapped.length));
            const promises = batch.map(u => classifyUnit(u, Object.keys(checkpoint.groupsClassified)));
            const groupNames = await Promise.all(promises);
            batch.forEach((unit, idx) => {
                if (!checkpoint.groupsClassified[groupNames[idx]])
                    checkpoint.groupsClassified[groupNames[idx]] = [];
                checkpoint.groupsClassified[groupNames[idx]].push(unit.id);
            });
            const completed = Math.min(i + batchSize, unmapped.length);
            console.log('  ' + Math.round(completed / unmapped.length * 100) + '% (' + completed + '/' + unmapped.length + ')');
            saveCheckpoint(checkpoint);
        }
        checkpoint.classificationComplete = true;
        saveCheckpoint(checkpoint);
        console.log('Classification complete\n');
    }
    // PHASE 2
    console.log('Phase 2: Generating Conversions\n');
    for (const [groupName, unitIds] of Object.entries(checkpoint.groupsClassified)) {
        const groupId = 'ug-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        let group = unitGroups.find(g => g.id === groupId);
        if (!group) {
            group = { id: groupId, name: groupName, description: 'Custom MEP ' + groupName, unitIds: unitIds, conversions: [] };
            unitGroups.push(group);
        }
        else {
            group.unitIds = Array.from(new Set([...group.unitIds, ...unitIds]));
        }
        for (const unitId of unitIds) {
            const unit = allUnits.find(u => u.id === unitId);
            if (unit)
                unit.unitGroupId = groupId;
        }
    }
    const groupsNeedingConversions = unitGroups.filter(g => {
        if (checkpoint.conversionsGroupsCompleted.includes(g.id))
            return false;
        const units = allUnits.filter(u => g.unitIds.includes(u.id));
        return g.conversions.length < units.length * (units.length - 1) && units.length >= 2;
    });
    console.log(groupsNeedingConversions.length + ' groups need conversions\n');
    let groupsProcessed = 0;
    for (const [idx, group] of groupsNeedingConversions.entries()) {
        if (batchGroupLimit && groupsProcessed >= batchGroupLimit) {
            console.log('\nBatch limit reached. Run again to continue.\n');
            break;
        }
        const groupUnits = allUnits.filter(u => group.unitIds.includes(u.id));
        const unitsToProcess = checkpoint.currentConversionGroupId === group.id
            ? groupUnits.filter(u => !checkpoint.unitsCompleted.includes(u.id))
            : groupUnits;
        console.log('[' + (idx + 1) + '/' + groupsNeedingConversions.length + '] ' + group.name + ' (' + groupUnits.length + ' units)');
        if (unitsToProcess.length === 0) {
            console.log('  Complete');
            continue;
        }
        console.log('  Processing ' + unitsToProcess.length + ' units...');
        let generated = 0;
        for (let i = 0; i < unitsToProcess.length; i += 20) {
            const batch = unitsToProcess.slice(i, Math.min(i + 20, unitsToProcess.length));
            const promises = batch.map(async (fromUnit) => {
                const toUnits = groupUnits.filter(u => u.id !== fromUnit.id);
                const conversions = await generateConversionsFromUnit(fromUnit, toUnits, group.name);
                const valid = conversions.map(c => validateConversion(c, fromUnit, groupUnits)).filter(Boolean);
                return { fromUnit, conversions: valid };
            });
            const results = await Promise.all(promises);
            for (const { fromUnit, conversions } of results) {
                for (const convData of conversions) {
                    const toUnit = groupUnits.find(u => u.symbol === convData.to);
                    if (!toUnit || group.conversions.some(c => c.fromUnitId === fromUnit.id && c.toUnitId === toUnit.id))
                        continue;
                    group.conversions.push({
                        id: generateUUID(),
                        fromUnitId: fromUnit.id,
                        toUnitId: toUnit.id,
                        multiplier: convData.multiplier,
                        equation: convData.equation,
                        description: fromUnit.symbol + ' to ' + toUnit.symbol
                    });
                    generated++;
                }
                checkpoint.unitsCompleted.push(fromUnit.id);
                checkpoint.currentConversionGroupId = group.id;
                saveCheckpoint(checkpoint);
                saveData(allUnits, unitGroups);
            }
            const completed = Math.min(i + 20, unitsToProcess.length);
            process.stdout.write('\r  ' + Math.round(completed / unitsToProcess.length * 100) + '% (' + completed + '/' + unitsToProcess.length + ', ' + generated + ' conversions)    ');
        }
        console.log('\n  Added ' + generated + ' conversions');
        checkpoint.conversionsGroupsCompleted.push(group.id);
        checkpoint.currentConversionGroupId = null;
        checkpoint.unitsCompleted = [];
        saveCheckpoint(checkpoint);
        groupsProcessed++;
    }
    saveData(allUnits, unitGroups);
    const total = unitGroups.reduce((s, g) => s + g.conversions.length, 0);
    console.log('\nComplete! ' + total + ' total conversions\n');
}
main().catch(console.error);
//# sourceMappingURL=generateCustomConversions.js.map