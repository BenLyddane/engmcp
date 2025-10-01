import { SpecType } from '../types/schemas.js';
import { askClaude } from './claude.js';

/**
 * Proposal for a new spec type (lightweight)
 */
export interface SpecTypeProposal {
  primaryName: string;
  briefDescription: string;
  domain: string;
}

/**
 * Pre-validation result
 */
export interface PreValidationResult {
  isUnique: boolean;
  isDuplicate: boolean;
  similarity: number;
  conflictingSpecType?: string;
  reason?: string;
}

/**
 * Pre-validate a proposed spec type against existing spec types
 * This is a lightweight check before expensive full generation
 */
export async function preValidateProposal(
  proposal: SpecTypeProposal,
  existingSpecTypes: SpecType[]
): Promise<PreValidationResult> {
  // Validate proposal has a primary name
  if (!proposal.primaryName) {
    console.error('Invalid proposal - missing primaryName:', proposal);
    return {
      isUnique: false,
      isDuplicate: true,
      similarity: 100,
      reason: 'Invalid proposal - missing primaryName',
    };
  }

  // Quick check: exact name match
  const exactMatch = existingSpecTypes.find(
    (spec) => spec.primaryName && spec.primaryName.toLowerCase() === proposal.primaryName.toLowerCase()
  );

  if (exactMatch) {
    return {
      isUnique: false,
      isDuplicate: true,
      similarity: 100,
      conflictingSpecType: exactMatch.primaryName,
      reason: 'Exact name match found',
    };
  }

  // Semantic check using AI
  // Build context of existing spec types
  const existingContext = existingSpecTypes
    .map(
      (spec) =>
        `- ${spec.primaryName} (${spec.domain}): ${spec.description.substring(0, 100)}${spec.description.length > 100 ? '...' : ''}`
    )
    .join('\n');

  const prompt = `You are validating if a proposed spec type is semantically unique.

PROPOSED SPEC TYPE:
- Name: ${proposal.primaryName}
- Description: ${proposal.briefDescription}
- Domain: ${proposal.domain}

EXISTING SPEC TYPES:
${existingContext}

Task: Determine if the proposed spec type represents the SAME underlying physical property or characteristic as any existing spec type. Even if the names are different, if they measure or describe the same thing, they are duplicates.

Examples of duplicates:
- "Cooling Capacity" vs "Total Cooling Capacity" (same thing)
- "Voltage" vs "Operating Voltage" (same thing)
- "Flow Rate" vs "Water Flow Rate" (same if both measure water flow)

Examples of NOT duplicates:
- "Cooling Capacity" vs "Sensible Cooling Capacity" (different - one is total, one is sensible only)
- "Voltage" vs "Frequency" (different properties)
- "Supply Air Flow Rate" vs "Return Air Flow Rate" (different flows)

Respond with ONLY a JSON object:
{
  "isDuplicate": true/false,
  "similarity": 0-100 (percentage similarity),
  "conflictingSpecType": "name of most similar existing spec type or null",
  "reason": "brief explanation"
}`;

  try {
    const response = await askClaude(
      prompt,
      'You are an expert in HVAC, electrical, plumbing, and fire protection specification types. You excel at identifying semantic duplicates.'
    );

    // Parse response with better error handling
    let jsonText = response.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    // Extract only the first JSON object if multiple exist
    const jsonMatch = jsonText.match(/\{[^}]+\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result = JSON.parse(jsonText);

    return {
      isUnique: !result.isDuplicate && result.similarity < 85,
      isDuplicate: result.isDuplicate || result.similarity >= 85,
      similarity: result.similarity,
      conflictingSpecType: result.conflictingSpecType,
      reason: result.reason,
    };
  } catch (error) {
    console.error('Error in pre-validation:', error);
    // If validation fails, assume unique to avoid blocking generation
    return {
      isUnique: true,
      isDuplicate: false,
      similarity: 0,
      reason: 'Pre-validation check failed - assuming unique',
    };
  }
}
