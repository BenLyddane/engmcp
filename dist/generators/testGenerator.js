import { askClaudeJSON, generateUUID } from '../utils/claude.js';
import { loadMasterSpecTypes, saveSpecTypeToMaster } from '../utils/fileManager.js';
import { preValidateProposal, } from '../utils/preValidator.js';
/**
 * Step 1: Generate a proposal for a spec type (cheap API call)
 */
async function generateProposal(targetDomain, targetValueType, existingSpecTypes, avoidNames = []) {
    const existingContext = existingSpecTypes.length > 0
        ? `\n\nEXISTING SPEC TYPES (DO NOT DUPLICATE):\n${existingSpecTypes
            .map((s) => `- ${s.primaryName} (${s.domain})`)
            .join('\n')}`
        : '';
    const avoidContext = avoidNames.length > 0
        ? `\n\nAVOID THESE NAMES (already rejected as duplicates):\n${avoidNames
            .map((n) => `- ${n}`)
            .join('\n')}`
        : '';
    const systemPrompt = `You are an expert in HVAC, Electrical, Plumbing, and Fire Protection systems.`;
    const prompt = `Generate a proposal for ONE new specification type.

REQUIREMENTS:
- Domain: ${targetDomain}
- Value Type: ${targetValueType}
- Must be semantically UNIQUE from all existing spec types${existingContext}${avoidContext}

Generate ONLY:
1. A primary name (clear, concise, professional)
2. A brief 1-sentence description

Return ONLY a JSON object:
{
  "primaryName": "string",
  "briefDescription": "one sentence description",
  "domain": "${targetDomain}"
}`;
    const response = await askClaudeJSON(prompt, systemPrompt);
    return response;
}
/**
 * Step 3: Generate full spec type (expensive API call)
 */
async function generateFullSpecType(proposal, targetValueType, existingSpecTypes) {
    const existingContext = existingSpecTypes.length > 0
        ? `\n\nEXISTING SPEC TYPES:\n${existingSpecTypes
            .map((s) => `- ${s.primaryName} (${s.domain}): ${s.description.substring(0, 80)}... | Alternates: ${s.alternateNames.slice(0, 3).join(', ')}`)
            .join('\n')}`
        : '';
    const systemPrompt = `You are an expert in HVAC, Electrical, Plumbing, and Fire Protection systems. Generate comprehensive specification type details for construction documentation.`;
    const prompt = `Generate complete details for this APPROVED spec type proposal:

APPROVED PROPOSAL:
- Primary Name: ${proposal.primaryName}
- Description: ${proposal.briefDescription}
- Domain: ${proposal.domain}
- Value Type: ${targetValueType}

CONTEXT:${existingContext}

REQUIREMENTS:
1. Use the approved primary name: "${proposal.primaryName}"
2. Expand the description to 2-3 detailed sentences
3. Include minimum 5 alternate names (industry synonyms)
4. Include minimum 3 "not names" (similar but DIFFERENT concepts) with brief explanations
5. ${targetValueType === 'SELECT' || targetValueType === 'MULTI_SELECT'
        ? `Provide 5-10 value options. CRITICAL: Each value MUST include:
   - primaryValue: the value name
   - alternateNames: array of 3+ alternate names for THIS specific value
   - description: 1-2 sentence description of THIS specific value
   - domain: optional context`
        : ''}
6. ${targetValueType === 'NUMERIC' || targetValueType === 'RANGE'
        ? 'Provide realistic min/max values'
        : ''}
7. Include appropriate units and unit groups if applicable
8. Include 2-3 examples
9. Include relevant industry standards (ASHRAE, NEC, IPC, NFPA, etc.)
10. Set allowsArray=true if this spec commonly has multiple values

Return a JSON object:
{
  "primaryName": "${proposal.primaryName}",
  "alternateNames": ["name1", "name2", "name3", "name4", "name5", ...],
  "notNames": ["different concept 1", "different concept 2", "different concept 3", ...],
  "description": "detailed 2-3 sentence description",
  "domain": "${proposal.domain}",
  "primaryUnit": "string (if applicable)",
  "primaryUnitGroup": "string",
  "alternateUnits": ["unit1", "unit2", ...],
  "valueType": "${targetValueType}",
  "valueOptions": [
    {
      "primaryValue": "value name",
      "alternateNames": ["alt1", "alt2", "alt3", ...],
      "description": "detailed description of this value",
      "domain": "optional context"
    }
  ],
  "minValue": number,
  "maxValue": number,
  "allowsArray": boolean,
  "examples": ["example1", "example2", "example3"],
  "industryStandards": ["standard1", "standard2", ...]
}`;
    const response = await askClaudeJSON(prompt, systemPrompt);
    // Convert to SpecType with IDs
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
    // Add value options with descriptions
    if (response.valueOptions && response.valueOptions.length > 0) {
        specType.valueOptions = response.valueOptions.map((opt) => ({
            id: generateUUID(),
            specTypeId: specTypeId,
            primaryValue: opt.primaryValue,
            alternateNames: opt.alternateNames,
            description: opt.description, // Now included
            domain: opt.domain,
        }));
    }
    return specType;
}
/**
 * Generate a single spec type with three-step flow
 */
async function generateSingleSpecType(index, total, existingSpecTypes, targetDomain, targetValueType) {
    console.log(`\n🔨 Generating spec type ${index}/${total}...`);
    console.log(`   Domain: ${targetDomain}, Value Type: ${targetValueType}`);
    const maxRetries = 3;
    const rejectedNames = [];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // STEP 1: Generate proposal (cheap)
            console.log(`   Step 1: Generating proposal (attempt ${attempt}/${maxRetries})...`);
            const proposal = await generateProposal(targetDomain, targetValueType, existingSpecTypes, rejectedNames);
            console.log(`   ✓ Proposed: "${proposal.primaryName}"`);
            // STEP 2: Pre-validate (cheap)
            console.log(`   Step 2: Pre-validating against existing spec types...`);
            const validation = await preValidateProposal(proposal, existingSpecTypes);
            if (validation.isDuplicate) {
                console.log(`   ✗ REJECTED: ${validation.similarity}% similar to "${validation.conflictingSpecType}"`);
                console.log(`      Reason: ${validation.reason}`);
                rejectedNames.push(proposal.primaryName);
                if (attempt < maxRetries) {
                    console.log(`   ↻ Retrying with different name...`);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    continue;
                }
                else {
                    console.log(`   ✗ Max retries reached. Skipping this spec type.`);
                    return null;
                }
            }
            console.log(`   ✓ Validated: Unique (${validation.similarity}% similarity)`);
            // STEP 3: Generate full spec type (expensive)
            console.log(`   Step 3: Generating complete spec type...`);
            const specType = await generateFullSpecType(proposal, targetValueType, existingSpecTypes);
            console.log(`\n   ✅ Generated: ${specType.primaryName}`);
            console.log(`      Alternate Names: ${specType.alternateNames.slice(0, 3).join(', ')}...`);
            console.log(`      Not Names: ${specType.notNames.slice(0, 2).join(', ')}...`);
            if (specType.valueOptions) {
                console.log(`      Value Options: ${specType.valueOptions.length}`);
                specType.valueOptions.slice(0, 2).forEach((opt) => {
                    console.log(`        - ${opt.primaryValue}: ${opt.description.substring(0, 60)}...`);
                });
            }
            return specType;
        }
        catch (error) {
            console.error(`   ✗ Error on attempt ${attempt}:`, error);
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    return null;
}
/**
 * Generate 5 diverse spec types for testing with new three-step flow
 */
export async function generateTestSpecTypes() {
    console.log('🧪 Generating 5 test spec types (with pre-validation)...\n');
    const existing = loadMasterSpecTypes();
    console.log(`📂 Loaded ${existing.length} existing spec types from master file\n`);
    const targets = [
        { domain: 'HVAC', valueType: 'NUMERIC' },
        { domain: 'ELECTRICAL', valueType: 'SELECT' },
        { domain: 'PLUMBING', valueType: 'MULTI_SELECT' },
        { domain: 'FIRE_PROTECTION', valueType: 'RANGE' },
        { domain: 'HVAC', valueType: 'BOOLEAN' },
    ];
    const newSpecTypes = [];
    let skipped = 0;
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const allExisting = [...existing, ...newSpecTypes];
        const specType = await generateSingleSpecType(i + 1, targets.length, allExisting, target.domain, target.valueType);
        if (specType) {
            saveSpecTypeToMaster(specType);
            newSpecTypes.push(specType);
        }
        else {
            skipped++;
            console.log(`⚠️  Skipped spec type ${i + 1} due to duplicate rejections`);
        }
        if (i < targets.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    console.log(`\n✅ Generated ${newSpecTypes.length} test spec types successfully!`);
    if (skipped > 0) {
        console.log(`⚠️  Skipped ${skipped} spec types (could not generate unique ones)`);
    }
    return newSpecTypes;
}
//# sourceMappingURL=testGenerator.js.map