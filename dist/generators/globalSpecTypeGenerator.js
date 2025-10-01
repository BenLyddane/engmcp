import { askClaude, askClaudeJSON, generateUUID } from '../utils/claude.js';
import { loadMasterSpecTypes, saveSpecTypeToMaster } from '../utils/fileManager.js';
import { preValidateProposal } from '../utils/preValidator.js';
import { loadOldSpecTypes, getOldSpecTypeNames } from '../utils/csvLoader.js';
import { join } from 'path';
/**
 * Generate proposal for a spec type in a specific category
 */
async function generateProposal(domain, category, valueType, existingSpecTypes, oldSpecTypeNames, avoidNames = []) {
    const existingContext = existingSpecTypes.length > 0
        ? `\n\nEXISTING SPEC TYPES (DO NOT DUPLICATE):\n${existingSpecTypes
            .slice(-50)
            .map((s) => `- ${s.primaryName} (${s.domain})`)
            .join('\n')}`
        : '';
    const oldSpecContext = oldSpecTypeNames.length > 0
        ? `\n\nOLD SPEC TYPES (for reference):\n${oldSpecTypeNames
            .slice(0, 30)
            .join(', ')}`
        : '';
    const avoidContext = avoidNames.length > 0
        ? `\n\nAVOID THESE (rejected):\n${avoidNames.join(', ')}`
        : '';
    const systemPrompt = `You are an expert in ${domain} systems for construction and MEP documentation.`;
    const prompt = `Generate a proposal for ONE new GENERIC specification type in the ${category} category.

REQUIREMENTS:
- Domain: ${domain}
- Category: ${category}
- Value Type: ${valueType}
- Must be semantically UNIQUE from existing specs${existingContext}${oldSpecContext}${avoidContext}

IMPORTANT: Generate GENERIC spec types that can apply to MULTIPLE equipment types, NOT equipment-specific specs.

GOOD Examples (generic):
- "Approach Temperature" (applies to cooling towers, heat exchangers, condensers, etc.)
- "Flow Rate" (applies to pumps, chillers, piping, etc.)
- "Efficiency Rating" (applies to many equipment types)

BAD Examples (equipment-specific):
- "Cooling Tower Approach Temperature" (too specific to one equipment type)
- "Chiller Flow Rate" (too specific)
- "Boiler Efficiency" (too specific)

Return ONLY a JSON object:
{
  "primaryName": "string (GENERIC name)",
  "briefDescription": "one sentence",
  "domain": "${domain}"
}`;
    return await askClaudeJSON(prompt, systemPrompt);
}
/**
 * Cleanup malformed response using AI
 */
async function cleanupMalformedResponse(malformedResponse, systemPrompt) {
    const cleanupPrompt = `The following JSON response has formatting errors. Fix it to match the required schema EXACTLY:

REQUIRED SCHEMA:
{
  "primaryName": "string" (NOT "name"),
  "alternateNames": ["string", "string", ...],
  "notNames": ["string - explanation", "string - explanation", ...] (NOT objects with term/explanation),
  "description": "string",
  "domain": "HVAC|ELECTRICAL|PLUMBING|FIRE_PROTECTION",
  "primaryUnit": "string" (optional),
  "primaryUnitGroup": "string" (optional),
  "alternateUnits": ["string", ...] (optional),
  "valueType": "NUMERIC|SELECT|MULTI_SELECT|RANGE|BOOLEAN",
  "minValue": number (optional),
  "maxValue": number (optional),
  "allowsArray": boolean,
  "examples": ["string", ...],
  "industryStandards": ["string", ...],
  "valueOptions": [{primaryValue, alternateNames, description, domain}] (optional)
}

MALFORMED RESPONSE:
${JSON.stringify(malformedResponse, null, 2)}

FIXES NEEDED:
1. Change "name" to "primaryName"
2. Change notNames from objects to strings with format "Term - Explanation"
3. Extract primaryUnit from units array if present
4. Ensure all required fields are present

Return ONLY the corrected JSON, no explanations.`;
    console.log('   🔧 Attempting AI cleanup of malformed response...');
    return await askClaudeJSON(cleanupPrompt, systemPrompt);
}
/**
 * Generate full spec type
 */
async function generateFullSpecType(proposal, valueType, category, existingSpecTypes) {
    const systemPrompt = `You are an expert in MEP and Fire Protection systems.`;
    const prompt = `Generate complete details for this APPROVED spec type:

PROPOSAL:
- Name: ${proposal.primaryName}
- Description: ${proposal.briefDescription}
- Domain: ${proposal.domain}
- Category: ${category}
- Value Type: ${valueType}

REQUIREMENTS:
1. Use approved name: "${proposal.primaryName}"
2. Expand description to 2-3 sentences
3. Minimum 5 alternate names
4. Minimum 3 "not names" with explanations
5. ${valueType === 'SELECT' || valueType === 'MULTI_SELECT'
        ? 'Provide 5-10 value options, each with 3+ alternate names and description'
        : ''}
6. ${valueType === 'NUMERIC' || valueType === 'RANGE' ? 'Provide realistic min/max' : ''}
7. Include units if applicable
8. Include 2-3 examples
9. Include industry standards
10. Set allowsArray appropriately

Return JSON matching the GeneratedSpecType interface with "primaryName" NOT "name".`;
    let response;
    try {
        response = await askClaudeJSON(prompt, systemPrompt);
    }
    catch (error) {
        console.log(`   ⚠️  Initial parse failed, attempting cleanup...`);
        // If parsing fails, get the raw response and try cleanup
        const rawResponse = await askClaude(prompt, systemPrompt);
        let parsed;
        try {
            parsed = JSON.parse(rawResponse.replace(/```json\s*|\s*```/g, ''));
        }
        catch {
            throw new Error(`Failed to parse response even after cleanup attempt`);
        }
        response = await cleanupMalformedResponse(parsed, systemPrompt);
    }
    // Validate response (with cleanup if needed)
    if (!response.primaryName) {
        console.log('   ⚠️  Missing primaryName, attempting cleanup...');
        response = await cleanupMalformedResponse(response, systemPrompt);
        if (!response.primaryName) {
            throw new Error(`Still missing primaryName after cleanup`);
        }
    }
    if (!response.alternateNames || response.alternateNames.length < 3) {
        throw new Error(`Invalid response - insufficient alternateNames`);
    }
    if (!response.notNames || response.notNames.length < 2) {
        throw new Error(`Invalid response - insufficient notNames`);
    }
    if (!response.description) {
        throw new Error(`Invalid response - missing description`);
    }
    const specTypeId = generateUUID();
    const specType = {
        id: specTypeId,
        primaryName: response.primaryName,
        alternateNames: response.alternateNames,
        notNames: response.notNames,
        description: response.description,
        domain: response.domain,
        primaryUnit: response.primaryUnit,
        primaryUnitGroup: response.primaryUnitGroup,
        alternateUnits: response.alternateUnits,
        valueType: response.valueType,
        minValue: response.minValue,
        maxValue: response.maxValue,
        allowsArray: response.allowsArray,
        examples: response.examples,
        industryStandards: response.industryStandards,
    };
    if (response.valueOptions) {
        specType.valueOptions = response.valueOptions.map((opt) => ({
            id: generateUUID(),
            specTypeId,
            primaryValue: opt.primaryValue,
            alternateNames: opt.alternateNames,
            description: opt.description,
            domain: opt.domain,
        }));
    }
    return specType;
}
/**
 * Generate single spec type with retry
 */
async function generateSingleSpecType(index, total, domain, category, valueType, existingSpecTypes, oldSpecTypeNames, categoryRejectedNames = [] // Names rejected anywhere in this category
) {
    console.log(`\n[${index}/${total}] ${domain} - ${category} (${valueType})...`);
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const proposal = await generateProposal(domain, category, valueType, existingSpecTypes, oldSpecTypeNames, categoryRejectedNames // Use persistent list
            );
            console.log(`  → "${proposal.primaryName}"`);
            const validation = await preValidateProposal(proposal, existingSpecTypes);
            if (validation.isDuplicate) {
                console.log(`  ✗ Duplicate (${validation.similarity}%)`);
                categoryRejectedNames.push(proposal.primaryName); // Add to persistent list
                if (attempt < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    continue;
                }
                return null;
            }
            console.log(`  ✓ Unique`);
            const specType = await generateFullSpecType(proposal, valueType, category, existingSpecTypes);
            console.log(`  ✅ ${specType.primaryName}`);
            return specType;
        }
        catch (error) {
            console.error(`  ✗ Error:`, error);
            if (attempt === maxRetries)
                throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    return null;
}
/**
 * Generate global spec type library
 */
export async function generateGlobalSpecTypes() {
    console.log(`🌍 Generating GLOBAL Spec Type Library...\n`);
    const existing = loadMasterSpecTypes();
    console.log(`📂 Loaded ${existing.length} existing spec types\n`);
    const oldSpecTypes = loadOldSpecTypes(join(process.cwd(), 'SpecTypesOldDONTUSETHISONETOOBIGTOREAD.csv'));
    const oldSpecTypeNames = getOldSpecTypeNames(oldSpecTypes);
    console.log(`📜 Loaded ${oldSpecTypeNames.length} old spec types\n`);
    // Define categories by domain
    const categories = {
        HVAC: [
            'Cooling Capacity & Performance',
            'Heating Capacity & Performance',
            'Airflow & Ventilation',
            'Temperature Control',
            'Humidity Control',
            'Refrigerants & Fluids',
            'Energy Efficiency',
            'Controls & Automation',
            'Ductwork & Distribution',
            'Filters & Air Quality',
        ],
        ELECTRICAL: [
            'Power & Capacity',
            'Voltage & Current',
            'Protection & Safety',
            'Distribution & Panels',
            'Circuits & Breakers',
            'Grounding & Bonding',
            'Lighting',
            'Controls & Automation',
            'Emergency Power',
            'Energy Metering',
        ],
        PLUMBING: [
            'Flow Rates',
            'Pressure & Head',
            'Pipe Materials & Sizing',
            'Fixtures & Fittings',
            'Water Quality',
            'Drainage & Venting',
            'Pumps & Equipment',
            'Controls & Valves',
            'Insulation',
            'Water Treatment',
        ],
        FIRE_PROTECTION: [
            'Suppression Systems',
            'Detection & Alarms',
            'Sprinkler Systems',
            'Flow & Pressure',
            'Coverage & Spacing',
            'Agent Types',
            'Controls & Monitoring',
            'Standpipes & Hose',
            'Emergency Response',
            'Testing & Inspection',
        ],
    };
    const valueTypes = ['NUMERIC', 'SELECT', 'MULTI_SELECT', 'RANGE', 'BOOLEAN'];
    // Exhaustive generation settings
    const EXHAUSTION_THRESHOLD = 10; // Consecutive duplicates before considering category complete
    const MAX_PER_CATEGORY = 100; // Safety limit per category
    const PROGRESS_INTERVAL = 10; // Show progress every N spec types
    console.log(`🎯 Exhaustive generation - no fixed limits`);
    console.log(`📊 ${Object.keys(categories).length} domains × multiple categories`);
    console.log(`⚙️  Settings: ${EXHAUSTION_THRESHOLD} consecutive duplicates = category exhausted\n`);
    const newSpecTypes = [];
    let totalSkipped = 0;
    let totalGenerated = 0;
    // Process each domain and category exhaustively
    for (const [domain, cats] of Object.entries(categories)) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📦 ${domain} Domain`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        for (const category of cats) {
            console.log(`\n🔹 Category: ${category}`);
            let categoryCount = 0;
            let consecutiveDuplicates = 0;
            let valueTypeIndex = 0;
            const categoryRejectedNames = []; // Persist across all attempts in this category
            // Keep generating until category is exhausted
            while (consecutiveDuplicates < EXHAUSTION_THRESHOLD && categoryCount < MAX_PER_CATEGORY) {
                const valueType = valueTypes[valueTypeIndex % valueTypes.length];
                const allExisting = [...existing, ...newSpecTypes];
                totalGenerated++;
                const specType = await generateSingleSpecType(totalGenerated, 0, // No fixed total - show 0 for unlimited
                domain, category, valueType, allExisting, oldSpecTypeNames, categoryRejectedNames // Pass persistent rejected list
                );
                if (specType) {
                    saveSpecTypeToMaster(specType);
                    newSpecTypes.push(specType);
                    categoryCount++;
                    consecutiveDuplicates = 0; // Reset counter on success
                }
                else {
                    totalSkipped++;
                    consecutiveDuplicates++;
                    console.log(`   ⚠️  ${consecutiveDuplicates}/${EXHAUSTION_THRESHOLD} consecutive duplicates`);
                }
                valueTypeIndex++;
                // Rate limiting
                await new Promise((resolve) => setTimeout(resolve, 1000));
                // Progress update
                if (totalGenerated % PROGRESS_INTERVAL === 0) {
                    console.log(`\n📊 Overall: ${newSpecTypes.length} generated, ${totalSkipped} skipped`);
                }
            }
            if (consecutiveDuplicates >= EXHAUSTION_THRESHOLD) {
                console.log(`   ✓ Category exhausted (${categoryCount} spec types generated)`);
            }
            else if (categoryCount >= MAX_PER_CATEGORY) {
                console.log(`   ⚠️  Reached safety limit (${MAX_PER_CATEGORY} spec types)`);
            }
        }
    }
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Exhaustive generation complete!`);
    console.log(`📊 Final: ${newSpecTypes.length} spec types generated`);
    console.log(`⚠️  ${totalSkipped} duplicates skipped`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return newSpecTypes;
}
//# sourceMappingURL=globalSpecTypeGenerator.js.map