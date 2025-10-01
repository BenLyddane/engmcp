#!/usr/bin/env node
import { askClaudeJSON, generateUUID } from '../utils/claude.js';
import { loadOldSpecTypes } from '../utils/csvLoader.js';
import { loadMasterSpecTypes, saveSpecTypeToMaster } from '../utils/fileManager.js';
import { preValidateProposal } from '../utils/preValidator.js';
import { join } from 'path';
/**
 * Convert and enrich a single old spec type
 */
async function enrichOldSpecType(oldSpecTypeName, oldUnit, oldValueType, oldDescription) {
    const systemPrompt = `You are an expert in HVAC, Electrical, Plumbing, and Fire Protection systems.`;
    const prompt = `Enrich this minimal spec type definition into a comprehensive specification:

OLD SPEC TYPE:
- Name: ${oldSpecTypeName}
- Units: ${oldUnit || 'none'}
- Value Type: ${oldValueType || 'NUMERIC'}
- Description: ${oldDescription || oldSpecTypeName}

TASK: Transform this into a rich specification with:
1. primaryName: Use the original name "${oldSpecTypeName}"
2. alternateNames: Generate 5+ industry synonyms for this spec type
3. notNames: Identify 3+ similar but DIFFERENT concepts (with explanations)
4. description: Write 2-3 detailed sentences explaining what this spec measures/describes
5. domain: Classify as HVAC, ELECTRICAL, PLUMBING, or FIRE_PROTECTION
6. primaryUnit: Extract from units field if present
7. primaryUnitGroup: Infer the unit group (e.g., "Flow Rate", "Temperature", "Pressure")
8. alternateUnits: List 3-5 alternate units commonly used
9. valueType: Convert to one of: NUMERIC, SELECT, MULTI_SELECT, RANGE, BOOLEAN
10. minValue/maxValue: Provide realistic range if NUMERIC or RANGE
11. allowsArray: true if this spec commonly has multiple values
12. examples: Provide 2-3 real-world examples
13. industryStandards: List relevant standards (ASHRAE, NEC, IPC, NFPA, etc.)

Return ONLY a JSON object:
{
  "primaryName": "${oldSpecTypeName}",
  "alternateNames": ["string", ...],
  "notNames": ["string - explanation", ...],
  "description": "detailed description",
  "domain": "HVAC|ELECTRICAL|PLUMBING|FIRE_PROTECTION",
  "primaryUnit": "string",
  "primaryUnitGroup": "string",
  "alternateUnits": ["string", ...],
  "valueType": "NUMERIC|SELECT|MULTI_SELECT|RANGE|BOOLEAN",
  "minValue": number,
  "maxValue": number,
  "allowsArray": boolean,
  "examples": ["string", ...],
  "industryStandards": ["string", ...]
}`;
    return await askClaudeJSON(prompt, systemPrompt);
}
/**
 * Convert all old spec types with deduplication
 */
async function convertOldSpecTypes() {
    console.log('🔄 Converting Old Spec Types to New Format...\n');
    // Load old spec types
    const oldSpecTypes = loadOldSpecTypes(join(process.cwd(), 'SpecTypesOldDONTUSETHISONETOOBIGTOREAD.csv'));
    console.log(`📜 Loaded ${oldSpecTypes.length} old spec types\n`);
    // Get unique spec type names (deduplicate old CSV internally)
    const uniqueOldSpecs = new Map();
    for (const oldSpec of oldSpecTypes) {
        const key = oldSpec.specTypeName.toLowerCase();
        if (!uniqueOldSpecs.has(key)) {
            uniqueOldSpecs.set(key, oldSpec);
        }
    }
    console.log(`📊 Found ${uniqueOldSpecs.size} unique old spec type names\n`);
    // Load any existing converted specs
    const existing = loadMasterSpecTypes();
    console.log(`📂 Loaded ${existing.length} already converted spec types\n`);
    let converted = 0;
    let skippedDuplicates = 0;
    let errors = 0;
    for (const [, oldSpec] of uniqueOldSpecs) {
        const index = converted + skippedDuplicates + errors + 1;
        const total = uniqueOldSpecs.size;
        console.log(`\n[${index}/${total}] Converting "${oldSpec.specTypeName}"...`);
        try {
            // Quick check: already converted?
            const alreadyExists = existing.some((e) => e.primaryName.toLowerCase() === oldSpec.specTypeName.toLowerCase());
            if (alreadyExists) {
                console.log(`  ⏭️  Already converted, skipping`);
                skippedDuplicates++;
                continue;
            }
            // Enrich with AI
            console.log(`  🤖 Enriching with AI...`);
            const enriched = await enrichOldSpecType(oldSpec.specTypeName, oldSpec.units, oldSpec.valueType, oldSpec.description);
            // Pre-validate against existing
            console.log(`  ✓ Validating against existing specs...`);
            const proposal = {
                primaryName: enriched.primaryName,
                briefDescription: enriched.description.substring(0, 100),
                domain: enriched.domain,
            };
            const validation = await preValidateProposal(proposal, [...existing]);
            if (validation.isDuplicate && validation.similarity >= 95) {
                console.log(`  ✗ Duplicate of "${validation.conflictingSpecType}" (${validation.similarity}%)`);
                skippedDuplicates++;
                continue;
            }
            // Convert to SpecType
            const specType = {
                id: generateUUID(),
                primaryName: enriched.primaryName,
                alternateNames: enriched.alternateNames,
                notNames: enriched.notNames,
                description: enriched.description,
                domain: enriched.domain,
                primaryUnit: enriched.primaryUnit,
                primaryUnitGroup: enriched.primaryUnitGroup,
                alternateUnits: enriched.alternateUnits,
                valueType: enriched.valueType,
                minValue: enriched.minValue,
                maxValue: enriched.maxValue,
                allowsArray: enriched.allowsArray,
                examples: enriched.examples,
                industryStandards: enriched.industryStandards,
            };
            // Save to master file
            saveSpecTypeToMaster(specType);
            existing.push(specType);
            converted++;
            console.log(`  ✅ Converted and saved`);
            // Rate limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // Progress update
            if (index % 10 === 0) {
                console.log(`\n📊 Progress: ${converted} converted, ${skippedDuplicates} skipped, ${errors} errors\n`);
            }
        }
        catch (error) {
            console.error(`  ✗ Error converting:`, error);
            errors++;
        }
    }
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Conversion complete!`);
    console.log(`📊 Results:`);
    console.log(`   Converted: ${converted}`);
    console.log(`   Skipped (duplicates): ${skippedDuplicates}`);
    console.log(`   Errors: ${errors}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
// Run conversion
convertOldSpecTypes().catch(console.error);
//# sourceMappingURL=oldSpecTypeConverter.js.map