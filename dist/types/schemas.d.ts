/**
 * Core data schemas for spec type generation
 */
export type Domain = 'HVAC' | 'ELECTRICAL' | 'PLUMBING' | 'FIRE_PROTECTION';
export type ValueType = 'NUMERIC' | 'SELECT' | 'MULTI_SELECT' | 'RANGE' | 'BOOLEAN';
export type ComponentSpecCategory = 'PRIMARY_SIZE' | 'N/A';
/**
 * Unit definition within a unit group
 */
export interface Unit {
    id: string;
    symbol: string;
    name: string;
    abbreviations: string[];
    unitGroupId: string;
}
/**
 * Conversion equation between units
 */
export interface ConversionEquation {
    id: string;
    fromUnitId: string;
    toUnitId: string;
    multiplier: number;
    equation: string;
    description: string;
}
/**
 * Unit group (e.g., Length, Temperature, Pressure)
 */
export interface UnitGroup {
    id: string;
    name: string;
    description: string;
    baseUnitId?: string;
    unitIds: string[];
    conversions: ConversionEquation[];
}
/**
 * Value option for SELECT or MULTI_SELECT spec types
 */
export interface SpecTypeValue {
    id: string;
    specTypeId: string;
    primaryValue: string;
    alternateNames: string[];
    description: string;
    domain?: string;
    metadata?: {
        isStandard?: boolean;
        commonUseCases?: string[];
        notes?: string;
    };
}
/**
 * Main spec type definition
 */
export interface SpecType {
    id: string;
    primaryName: string;
    alternateNames: string[];
    notNames: string[];
    description: string;
    domain: Domain;
    primaryUnit?: string;
    primaryUnitId?: string;
    primaryUnitGroup?: string;
    primaryUnitGroupId?: string;
    alternateUnits?: string[];
    alternateUnitIds?: string[];
    valueType: ValueType;
    valueOptions?: SpecTypeValue[];
    minValue?: number;
    maxValue?: number;
    allowsArray: boolean;
    examples?: string[];
    industryStandards?: string[];
}
/**
 * Mapping between component types and spec types
 */
export interface ComponentSpecMapping {
    componentTypeId: string;
    componentTypeName: string;
    specTypeId: string;
    specTypeName: string;
    category: ComponentSpecCategory;
    isRequired?: boolean;
    notes?: string;
}
/**
 * Component type from CSV
 */
export interface ComponentType {
    id: string;
    name: string;
    description: string;
    parentTypeId: string;
    csiCode: string;
}
/**
 * Test generation configuration
 */
export interface TestConfig {
    generateCount: number;
    domains: Domain[];
    valueTypes: ValueType[];
    requiresArray: boolean[];
}
/**
 * Validation report for generated spec types
 */
export interface ValidationReport {
    totalSpecTypes: number;
    exactDuplicates: Array<{
        specType1: string;
        specType2: string;
    }>;
    semanticDuplicates: Array<{
        specType1: string;
        specType2: string;
        similarity: number;
        reason: string;
    }>;
    missingAlternateNames: string[];
    missingNotNames: string[];
    invalidValueTypes: string[];
    warnings: string[];
    errors: string[];
}
/**
 * Generation output bundle
 */
export interface GenerationOutput {
    specTypes: SpecType[];
    unitGroups: UnitGroup[];
    componentMappings: ComponentSpecMapping[];
    validationReport: ValidationReport;
    metadata: {
        generatedAt: string;
        mode: 'test' | 'full';
        totalSpecTypes: number;
        domains: Record<Domain, number>;
    };
}
//# sourceMappingURL=schemas.d.ts.map