import { SpecType, ValidationReport } from '../types/schemas.js';
import { askClaude } from './claude.js';

/**
 * Validate generated spec types for duplicates and quality
 */
export async function validateSpecTypes(
  specTypes: SpecType[]
): Promise<ValidationReport> {
  const report: ValidationReport = {
    totalSpecTypes: specTypes.length,
    exactDuplicates: [],
    semanticDuplicates: [],
    missingAlternateNames: [],
    missingNotNames: [],
    invalidValueTypes: [],
    warnings: [],
    errors: [],
  };

  // Check for exact name duplicates
  const nameMap = new Map<string, SpecType>();
  for (const spec of specTypes) {
    const lowerName = spec.primaryName.toLowerCase();
    if (nameMap.has(lowerName)) {
      report.exactDuplicates.push({
        specType1: nameMap.get(lowerName)!.primaryName,
        specType2: spec.primaryName,
      });
    } else {
      nameMap.set(lowerName, spec);
    }
  }

  // Check for missing alternate names
  for (const spec of specTypes) {
    if (spec.alternateNames.length === 0) {
      report.missingAlternateNames.push(spec.primaryName);
      report.warnings.push(
        `Spec type "${spec.primaryName}" has no alternate names`
      );
    }
  }

  // Check for missing not-names
  for (const spec of specTypes) {
    if (spec.notNames.length === 0) {
      report.missingNotNames.push(spec.primaryName);
      report.warnings.push(
        `Spec type "${spec.primaryName}" has no "not names" for disambiguation`
      );
    }
  }

  // Validate value types
  for (const spec of specTypes) {
    if (
      (spec.valueType === 'SELECT' || spec.valueType === 'MULTI_SELECT') &&
      (!spec.valueOptions || spec.valueOptions.length === 0)
    ) {
      report.invalidValueTypes.push(spec.primaryName);
      report.errors.push(
        `Spec type "${spec.primaryName}" is ${spec.valueType} but has no value options`
      );
    }

    if (
      spec.valueType === 'NUMERIC' &&
      spec.minValue !== undefined &&
      spec.maxValue !== undefined &&
      spec.minValue > spec.maxValue
    ) {
      report.errors.push(
        `Spec type "${spec.primaryName}" has minValue > maxValue`
      );
    }
  }

  // Check for semantic duplicates using AI
  if (specTypes.length > 1) {
    console.log('Checking for semantic duplicates using AI...');
    const semanticDuplicates = await detectSemanticDuplicates(specTypes);
    report.semanticDuplicates = semanticDuplicates;
  }

  return report;
}

/**
 * Use AI to detect semantic duplicates
 */
async function detectSemanticDuplicates(
  specTypes: SpecType[]
): Promise<
  Array<{ specType1: string; specType2: string; similarity: number; reason: string }>
> {
  const duplicates: Array<{
    specType1: string;
    specType2: string;
    similarity: number;
    reason: string;
  }> = [];

  // Compare all pairs
  for (let i = 0; i < specTypes.length; i++) {
    for (let j = i + 1; j < specTypes.length; j++) {
      const spec1 = specTypes[i];
      const spec2 = specTypes[j];

      const prompt = `Compare these two spec types and determine if they are semantically the same thing (representing the same physical property or characteristic) or if they are genuinely different:

Spec Type 1:
- Primary Name: ${spec1.primaryName}
- Alternate Names: ${spec1.alternateNames.join(', ')}
- Description: ${spec1.description}
- Domain: ${spec1.domain}

Spec Type 2:
- Primary Name: ${spec2.primaryName}
- Alternate Names: ${spec2.alternateNames.join(', ')}
- Description: ${spec2.description}
- Domain: ${spec2.domain}

Respond with a JSON object with this structure:
{
  "areDuplicates": true/false,
  "similarity": 0-100 (percentage),
  "reason": "explanation of why they are or aren't duplicates"
}

Consider them duplicates if they represent the same underlying physical property, even if the names differ slightly.`;

      try {
        const response = await askClaude(
          prompt,
          'You are an expert in HVAC, electrical, plumbing, and fire protection systems. Your task is to identify if two specification types are semantically equivalent.'
        );

        // Parse the response
        let jsonText = response.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
        }

        const result = JSON.parse(jsonText);

        if (result.areDuplicates || result.similarity >= 85) {
          duplicates.push({
            specType1: spec1.primaryName,
            specType2: spec2.primaryName,
            similarity: result.similarity,
            reason: result.reason,
          });
        }
      } catch (error) {
        console.error(
          `Error comparing ${spec1.primaryName} and ${spec2.primaryName}:`,
          error
        );
      }
    }
  }

  return duplicates;
}

/**
 * Print validation report to console
 */
export function printValidationReport(report: ValidationReport): void {
  console.log('\n========== VALIDATION REPORT ==========\n');
  console.log(`Total Spec Types: ${report.totalSpecTypes}`);

  if (report.exactDuplicates.length > 0) {
    console.log('\n❌ EXACT DUPLICATES FOUND:');
    for (const dup of report.exactDuplicates) {
      console.log(`  - "${dup.specType1}" and "${dup.specType2}"`);
    }
  }

  if (report.semanticDuplicates.length > 0) {
    console.log('\n⚠️  SEMANTIC DUPLICATES FOUND:');
    for (const dup of report.semanticDuplicates) {
      console.log(
        `  - "${dup.specType1}" and "${dup.specType2}" (${dup.similarity}% similar)`
      );
      console.log(`    Reason: ${dup.reason}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    for (const warning of report.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    for (const error of report.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (
    report.exactDuplicates.length === 0 &&
    report.semanticDuplicates.length === 0 &&
    report.errors.length === 0
  ) {
    console.log('\n✅ All validations passed!');
  }

  console.log('\n======================================\n');
}
