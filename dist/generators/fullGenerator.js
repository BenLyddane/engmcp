import { askClaudeJSON, generateUUID } from '../utils/claude.js';
import { loadMasterSpecTypes, saveSpecTypeToMaster } from '../utils/fileManager.js';
import { preValidateProposal, } from '../utils/preValidator.js';
import { loadComponentTypes, loadOldSpecTypes, getOldSpecTypeNames, } from '../utils/csvLoader.js';
import { join } from 'path';
/**
 * Generate proposal using component type context
 */
async function generateProposal(componentTypeName, targetDomain, targetValueType, existingSpecTypes, oldSpecTypeNames, avoidNames = []) {
    const existingContext = existingSpecTypes.length > 0
        ? `\n\nEXISTING SPEC TYPES (DO NOT DUPLICATE):\n${existingSpecTypes
            .slice(0, 50)
            .map((s) => `- ${s.primaryName} (${s.domain})`)
            .join('\n')}`
        : '';
    const oldSpecContext = oldSpecTypeNames.length > 0
        ? `\n\nOLD SPEC TYPES (for reference only, avoid exact duplicates):\n${oldSpecTypeNames
            .slice(0, 30)
            .join(', ')}`
        : '';
    const avoidContext = avoidNames.length > 0
        ? `\n\nAVOID THESE NAMES (rejected as duplicates):\n${avoidNames
            .map((n) => `- ${n}`)
            .join('\n')}`
        : '';
    const systemPrompt = `You are an expert in ${targetDomain.toLowerCase()} systems for construction and MEP documentation.`;
    const prompt = `Generate a proposal for ONE new specification type for ${componentTypeName}.

REQUIREMENTS:
- Component Type: ${componentTypeName}
- Domain: ${targetDomain}
- Value Type: ${targetValueType}
- Must be semantically UNIQUE from all existing spec types${existingContext}${oldSpecContext}${avoidContext}

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
 * Generate full spec type
 */
async function generateFullSpecType(proposal, targetValueType, componentTypeName, existingSpecTypes) {
    const existingContext = existingSpecTypes.length > 0
        ? `\n\nEXISTING SPEC TYPES:\n${existingSpecTypes
            .slice(0, 30)
            .map((s) => `- ${s.primaryName} (${s.domain}): ${s.description.substring(0, 80)}...`)
            .join('\n')}`
        : '';
    const systemPrompt = `You are an expert in MEP (Mechanical, Electrical, Plumbing) and Fire Protection systems. Generate comprehensive specification type details for construction documentation.`;
    const prompt = `Generate complete details for this APPROVED spec type proposal:

APPROVED PROPOSAL:
- Primary Name: ${proposal.primaryName}
- Description: ${proposal.briefDescription}
- Domain: ${proposal.domain}
- Value Type: ${targetValueType}
- Component Type Context: ${componentTypeName}

CONTEXT:${existingContext}

REQUIREMENTS:
1. Use the approved primary name: "${proposal.primaryName}"
2. Expand the description to 2-3 detailed sentences explaining what this spec measures/describes
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

Return a JSON object with the structure provided.`;
    const response = await askClaudeJSON(prompt, systemPrompt);
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
    if (response.valueOptions && response.valueOptions.length > 0) {
        specType.valueOptions = response.valueOptions.map((opt) => ({
            id: generateUUID(),
            specTypeId: specTypeId,
            primaryValue: opt.primaryValue,
            alternateNames: opt.alternateNames,
            description: opt.description,
            domain: opt.domain,
        }));
    }
    return specType;
}
/**
 * Generate a single spec type with retry logic
 */
async function generateSingleSpecType(index, total, componentTypeName, existingSpecTypes, oldSpecTypeNames, targetDomain, targetValueType) {
    console.log(`\n[${index}/${total}] Generating for ${componentTypeName}...`);
    const maxRetries = 3;
    const rejectedNames = [];
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const proposal = await generateProposal(componentTypeName, targetDomain, targetValueType, existingSpecTypes, oldSpecTypeNames, rejectedNames);
            console.log(`  → Proposed: "${proposal.primaryName}"`);
            const validation = await preValidateProposal(proposal, existingSpecTypes);
            if (validation.isDuplicate) {
                console.log(`  ✗ Rejected (${validation.similarity}% similar to "${validation.conflictingSpecType}")`);
                rejectedNames.push(proposal.primaryName);
                if (attempt < maxRetries) {
                    console.log(`  ↻ Retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    continue;
                }
                else {
                    console.log(`  ⚠️  Skipped after ${maxRetries} attempts`);
                    return null;
                }
            }
            console.log(`  ✓ Validated (unique)`);
            const specType = await generateFullSpecType(proposal, targetValueType, componentTypeName, existingSpecTypes);
            console.log(`  ✅ Generated: ${specType.primaryName}`);
            return specType;
        }
        catch (error) {
            console.error(`  ✗ Error on attempt ${attempt}:`, error);
            if (attempt === maxRetries)
                throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    return null;
}
/**
 * Generate comprehensive spec types for ALL component types
 */
export async function generateFullSpecTypes() {
    console.log(`🏭 Generating comprehensive spec types for ALL component types...\n`);
    // Load context
    const existing = loadMasterSpecTypes();
    console.log(`📂 Loaded ${existing.length} existing spec types\n`);
    const componentTypes = loadComponentTypes(join(process.cwd(), 'ComponentTypesFullDataDontRead.csv'));
    console.log(`📦 Loaded ${componentTypes.length} component types\n`);
    const oldSpecTypes = loadOldSpecTypes(join(process.cwd(), 'SpecTypesOldDONTUSETHISONETOOBIGTOREAD.csv'));
    const oldSpecTypeNames = getOldSpecTypeNames(oldSpecTypes);
    console.log(`📜 Loaded ${oldSpecTypeNames.length} old spec type names for reference\n`);
    // Generate multiple spec types per component type (covering all value types)
    const valueTypes = ['NUMERIC', 'SELECT', 'MULTI_SELECT', 'RANGE', 'BOOLEAN'];
    const domains = ['HVAC', 'ELECTRICAL', 'PLUMBING', 'FIRE_PROTECTION'];
    // Build targets: For each component type, generate spec types for each value type
    const targets = [];
    for (const component of componentTypes) {
        // Determine domain based on component type (heuristic)
        const domainForComponent = determineDomain(component.name);
        // Generate 3-5 spec types per component type across different value types
        const specTypesPerComponent = Math.min(5, valueTypes.length);
        for (let i = 0; i < specTypesPerComponent; i++) {
            targets.push({
                componentTypeName: component.name,
                domain: domainForComponent,
                valueType: valueTypes[i % valueTypes.length],
            });
        }
    }
    console.log(`🎯 Target: Generate ~${targets.length} spec types\n`);
    console.log(`📊 Breakdown: ${componentTypes.length} components × ~${Math.ceil(targets.length / componentTypes.length)} spec types each\n`);
    const newSpecTypes = [];
    let skipped = 0;
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const allExisting = [...existing, ...newSpecTypes];
        const specType = await generateSingleSpecType(i + 1, targets.length, target.componentTypeName, allExisting, oldSpecTypeNames, target.domain, target.valueType);
        if (specType) {
            saveSpecTypeToMaster(specType);
            newSpecTypes.push(specType);
        }
        else {
            skipped++;
        }
        // Rate limiting
        if (i < targets.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        // Progress update every 10 spec types
        if ((i + 1) % 10 === 0) {
            console.log(`\n📈 Progress: ${i + 1}/${targets.length} (${Math.round(((i + 1) / targets.length) * 100)}%)`);
            console.log(`   Generated: ${newSpecTypes.length}, Skipped: ${skipped}\n`);
        }
    }
    console.log(`\n✅ Generated ${newSpecTypes.length} spec types successfully!`);
    if (skipped > 0) {
        console.log(`⚠️  Skipped ${skipped} spec types (could not generate unique ones)`);
    }
    return newSpecTypes;
}
/**
 * Determine domain based on component type name
 */
function determineDomain(componentName) {
    const name = componentName.toLowerCase();
    if (name.includes('chiller') || name.includes('boiler') || name.includes('hvac') ||
        name.includes('air') || name.includes('fan') || name.includes('cooling') ||
        name.includes('heating') || name.includes('ventilation')) {
        return 'HVAC';
    }
    if (name.includes('electrical') || name.includes('panel') || name.includes('transformer') ||
        name.includes('circuit') || name.includes('switch') || name.includes('power')) {
        return 'ELECTRICAL';
    }
    if (name.includes('plumbing') || name.includes('pump') || name.includes('pipe') ||
        name.includes('water') || name.includes('drain') || name.includes('fixture')) {
        return 'PLUMBING';
    }
    if (name.includes('fire') || name.includes('sprinkler') || name.includes('alarm') ||
        name.includes('suppression')) {
        return 'FIRE_PROTECTION';
    }
    // Default to HVAC for unknown types
    return 'HVAC';
}
//# sourceMappingURL=fullGenerator.js.map