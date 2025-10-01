import { SpecType } from '../types/schemas.js';
/**
 * Ensure output directory exists
 */
export declare function ensureOutputDir(): void;
/**
 * Load existing spec types from master file
 */
export declare function loadMasterSpecTypes(): SpecType[];
/**
 * Save a spec type to the master file
 */
export declare function saveSpecTypeToMaster(specType: SpecType): void;
/**
 * Clear the master file (for starting fresh)
 */
export declare function clearMasterFile(): void;
/**
 * Get the master file path
 */
export declare function getMasterFilePath(): string;
//# sourceMappingURL=fileManager.d.ts.map