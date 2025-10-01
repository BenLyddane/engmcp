import { SpecType, ValidationReport } from '../types/schemas.js';
/**
 * Validate generated spec types for duplicates and quality
 */
export declare function validateSpecTypes(specTypes: SpecType[]): Promise<ValidationReport>;
/**
 * Print validation report to console
 */
export declare function printValidationReport(report: ValidationReport): void;
//# sourceMappingURL=validator.d.ts.map