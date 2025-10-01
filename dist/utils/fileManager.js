import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
const OUTPUT_DIR = join(process.cwd(), 'output');
const MASTER_FILE = join(OUTPUT_DIR, 'spec-types-master.json');
/**
 * Ensure output directory exists
 */
export function ensureOutputDir() {
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}
/**
 * Load existing spec types from master file
 */
export function loadMasterSpecTypes() {
    ensureOutputDir();
    if (!existsSync(MASTER_FILE)) {
        return [];
    }
    try {
        const content = readFileSync(MASTER_FILE, 'utf-8');
        const data = JSON.parse(content);
        return data.specTypes || [];
    }
    catch (error) {
        console.error('Error loading master file:', error);
        return [];
    }
}
/**
 * Save a spec type to the master file
 */
export function saveSpecTypeToMaster(specType) {
    ensureOutputDir();
    const existing = loadMasterSpecTypes();
    existing.push(specType);
    const data = {
        specTypes: existing,
        metadata: {
            lastUpdated: new Date().toISOString(),
            totalCount: existing.length,
        },
    };
    writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved spec type "${specType.primaryName}" to master file (${existing.length} total)`);
}
/**
 * Clear the master file (for starting fresh)
 */
export function clearMasterFile() {
    ensureOutputDir();
    if (existsSync(MASTER_FILE)) {
        const data = {
            specTypes: [],
            metadata: {
                lastUpdated: new Date().toISOString(),
                totalCount: 0,
            },
        };
        writeFileSync(MASTER_FILE, JSON.stringify(data, null, 2));
        console.log('🗑️  Cleared master file');
    }
}
/**
 * Get the master file path
 */
export function getMasterFilePath() {
    return MASTER_FILE;
}
//# sourceMappingURL=fileManager.js.map