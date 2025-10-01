import { ComponentType } from '../types/schemas.js';
/**
 * Load component types from CSV
 */
export declare function loadComponentTypes(filePath: string): ComponentType[];
/**
 * Old spec type from CSV (for reference context only)
 */
export interface OldSpecType {
    componentTypeName: string;
    componentTypeId: string;
    specTypeId: string;
    specTypeName: string;
    units: string;
    valueType: string;
    specCategory: string;
    description: string;
    min: string;
    max: string;
    options: string;
    alternateNames: string;
    alternateUnits: string;
}
/**
 * Load old spec types from CSV (reference only - do not use directly)
 */
export declare function loadOldSpecTypes(filePath: string): OldSpecType[];
/**
 * Get unique spec type names from old spec types for reference
 */
export declare function getOldSpecTypeNames(oldSpecTypes: OldSpecType[]): string[];
//# sourceMappingURL=csvLoader.d.ts.map