/**
 * Core data schemas for spec type generation
 */

export type Domain = 'HVAC' | 'ELECTRICAL' | 'PLUMBING' | 'FIRE_PROTECTION';

export type ValueType = 'NUMERIC' | 'SELECT' | 'MULTI_SELECT' | 'RANGE' | 'BOOLEAN' | 'STRING';

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
  equation: string; // e.g., "x * 3.281" for meters to feet
  description: string;
}

/**
 * Unit group (e.g., Length, Temperature, Pressure)
 */
export interface UnitGroup {
  id: string;
  name: string;
  description: string;
  baseUnitId?: string; // Reference to SI base unit
  unitIds: string[]; // References to units in this group
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
  description: string; // Detailed description of this value option
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
  notNames: string[]; // Similar but semantically different concepts
  description: string;
  domain: Domain;
  primaryUnit?: string; // Unit symbol (for readability)
  primaryUnitId?: string; // UUID reference to unit
  primaryUnitGroup?: string; // Unit group name
  primaryUnitGroupId?: string; // UUID reference to unit group
  alternateUnits?: string[]; // Unit symbols (for readability)
  alternateUnitIds?: string[]; // UUID references to units
  valueType: ValueType;
  valueOptions?: SpecTypeValue[]; // For SELECT/MULTI_SELECT types
  minValue?: number; // For NUMERIC/RANGE types
  maxValue?: number; // For NUMERIC/RANGE types
  allowsArray: boolean; // If multiple values can be specified
  examples?: string[]; // Example values
  industryStandards?: string[]; // e.g., "ASHRAE 90.1", "NEC Article 430"
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
  exactDuplicates: Array<{ specType1: string; specType2: string }>;
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
