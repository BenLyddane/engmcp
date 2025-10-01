import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { ComponentType } from '../types/schemas.js';

/**
 * Load component types from CSV
 */
export function loadComponentTypes(filePath: string): ComponentType[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Remove BOM (Byte Order Mark) if present - this fixes the 'id' column issue
    const cleanContent = content.replace(/^\uFEFF/, '');
    
    const records = parse(cleanContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Debug: Show what columns were detected
    if (records.length > 0) {
      console.log('🔍 CSV Columns detected:', Object.keys(records[0]));
      console.log('🔍 First record:', {
        id: records[0].id,
        name: records[0].name,
        parentTypeId: records[0].parentTypeId
      });
    }

    return records.map((record: any) => {
      // Validate required fields
      if (!record.id) {
        console.error(`Warning: Component type "${record.name}" missing ID`);
      }
      
      return {
        id: record.id || '',
        name: record.name || '',
        description: record.description || '',
        parentTypeId: record.parentTypeId || '',
        csiCode: record.csiCode || '',
      };
    });
  } catch (error) {
    console.error(`Error loading component types from ${filePath}:`, error);
    return [];
  }
}

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
export function loadOldSpecTypes(filePath: string): OldSpecType[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
    });

    return records.map((record: any) => ({
      componentTypeName: record.componentTypeName || '',
      componentTypeId: record.componentTypeId || '',
      specTypeId: record.specTypeId || '',
      specTypeName: record.specTypeName || '',
      units: record.units || '',
      valueType: record.valueType || '',
      specCategory: record.specCategory || '',
      description: record.description || '',
      min: record.min || '',
      max: record.max || '',
      options: record.options || '',
      alternateNames: record.alternateNames || '',
      alternateUnits: record.alternateUnits || '',
    }));
  } catch (error) {
    console.error(`Error loading old spec types from ${filePath}:`, error);
    return [];
  }
}

/**
 * Get unique spec type names from old spec types for reference
 */
export function getOldSpecTypeNames(oldSpecTypes: OldSpecType[]): string[] {
  const names = new Set<string>();
  oldSpecTypes.forEach((spec) => {
    if (spec.specTypeName) {
      names.add(spec.specTypeName);
    }
  });
  return Array.from(names).sort();
}
