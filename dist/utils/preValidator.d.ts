import { SpecType } from '../types/schemas.js';
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
export declare function preValidateProposal(proposal: SpecTypeProposal, existingSpecTypes: SpecType[]): Promise<PreValidationResult>;
//# sourceMappingURL=preValidator.d.ts.map