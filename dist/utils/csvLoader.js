import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
/**
 * Load component types from CSV
 */
export function loadComponentTypes(filePath) {
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
        return records.map((record) => {
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
    }
    catch (error) {
        console.error(`Error loading component types from ${filePath}:`, error);
        return [];
    }
}
/**
 * Load old spec types from CSV (reference only - do not use directly)
 */
export function loadOldSpecTypes(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
        });
        return records.map((record) => ({
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
    }
    catch (error) {
        console.error(`Error loading old spec types from ${filePath}:`, error);
        return [];
    }
}
/**
 * Get unique spec type names from old spec types for reference
 */
export function getOldSpecTypeNames(oldSpecTypes) {
    const names = new Set();
    oldSpecTypes.forEach((spec) => {
        if (spec.specTypeName) {
            names.add(spec.specTypeName);
        }
    });
    return Array.from(names).sort();
}
//# sourceMappingURL=csvLoader.js.map