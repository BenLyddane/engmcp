#!/usr/bin/env node
import { loadMasterSpecTypes } from '../utils/fileManager.js';
import { askClaudeJSON } from '../utils/claude.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
/**
 * Calculate string similarity (Jaccard similarity)
 */
function calculateStringSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return (intersection.size / union.size) * 100;
}
/**
 * Batch duplicate detection using AI
 */
async function batchDetectDuplicates(candidates, totalSpecTypes) {
    const duplicateGroups = [];
    const reportPath = join(process.cwd(), 'output', 'duplicate-report-in-progress.json');
    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, Math.min(i + batchSize, candidates.length));
        const prompt = `Analyze these ${batch.length} potential duplicate pairs and identify which are true semantic duplicates:

${batch.map((cand, idx) => `
PAIR ${idx + 1}:
Spec A: ${cand.spec1.primaryName} (${cand.spec1.domain})
  Description: ${cand.spec1.description.substring(0, 100)}...
Spec B: ${cand.spec2.primaryName} (${cand.spec2.domain})
  Description: ${cand.spec2.description.substring(0, 100)}...
`).join('\n')}

For each pair, determine if they represent the SAME underlying property.

Return JSON array:
[
  {
    "pairIndex": 0-${batch.length - 1},
    "areDuplicates": true/false,
    "similarity": 0-100,
    "reason": "brief explanation"
  }
]`;
        try {
            const results = await askClaudeJSON(prompt, 'You are an expert at identifying duplicate MEP specifications.');
            for (const result of results) {
                if (result.areDuplicates || result.similarity >= 85) {
                    const cand = batch[result.pairIndex];
                    duplicateGroups.push({
                        similarity: result.similarity,
                        reason: result.reason,
                        specTypes: [cand.spec1, cand.spec2],
                    });
                }
            }
        }
        catch (error) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, error);
        }
        // Show progress
        const progress = Math.min(100, Math.round(((i + batchSize) / candidates.length) * 100));
        process.stdout.write(`\r🔍 AI Analysis: ${progress}% (${Math.min(i + batchSize, candidates.length)}/${candidates.length} candidates) | Found: ${duplicateGroups.length} duplicates    `);
        // Save progress incrementally
        const progressReport = {
            totalSpecTypes,
            candidatesAnalyzed: Math.min(i + batchSize, candidates.length),
            totalCandidates: candidates.length,
            duplicateGroups: duplicateGroups.map((g) => ({
                similarity: g.similarity,
                reason: g.reason,
                specTypes: g.specTypes.map((s) => ({
                    id: s.id,
                    primaryName: s.primaryName,
                    domain: s.domain,
                })),
            })),
            status: 'in-progress',
            lastUpdated: new Date().toISOString(),
        };
        writeFileSync(reportPath, JSON.stringify(progressReport, null, 2));
    }
    console.log(''); // New line after progress
    return duplicateGroups;
}
/**
 * Efficient duplicate detection
 */
async function findSemanticDuplicates(specTypes) {
    console.log('🔍 Finding duplicate candidates...\n');
    // Step 1: Group by domain
    const byDomain = {};
    for (const spec of specTypes) {
        if (!byDomain[spec.domain]) {
            byDomain[spec.domain] = [];
        }
        byDomain[spec.domain].push(spec);
    }
    console.log('📊 Spec types by domain:');
    for (const [domain, specs] of Object.entries(byDomain)) {
        console.log(`   ${domain}: ${specs.length}`);
    }
    console.log('');
    // Step 2: Find candidate pairs using string similarity (cheap)
    const candidates = [];
    for (const [domain, specs] of Object.entries(byDomain)) {
        console.log(`\r🔎 Filtering ${domain} domain...`);
        for (let i = 0; i < specs.length; i++) {
            for (let j = i + 1; j < specs.length; j++) {
                const similarity = calculateStringSimilarity(specs[i].primaryName, specs[j].primaryName);
                // Only check with AI if string similarity is high
                if (similarity >= 30) {
                    candidates.push({
                        spec1: specs[i],
                        spec2: specs[j],
                        stringSimilarity: similarity,
                    });
                }
            }
        }
    }
    console.log(`\n✓ Found ${candidates.length} candidate pairs (filtered from ${(specTypes.length * (specTypes.length - 1)) / 2} total)\n`);
    if (candidates.length === 0) {
        return [];
    }
    // Step 3: Use AI to check candidates (in batches)
    console.log(`🤖 Analyzing candidates with AI (batched)...\n`);
    const duplicateGroups = await batchDetectDuplicates(candidates, specTypes.length);
    return duplicateGroups;
}
/**
 * Main cleanup function
 */
async function cleanupDuplicates() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   Duplicate Cleanup Utility (Efficient)                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    const specTypes = loadMasterSpecTypes();
    console.log(`📂 Loaded ${specTypes.length} spec types\n`);
    if (specTypes.length === 0) {
        console.log('❌ No spec types found in master file\n');
        return;
    }
    const startTime = Date.now();
    // Find duplicates
    const duplicateGroups = await findSemanticDuplicates(specTypes);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (duplicateGroups.length === 0) {
        console.log(`\n✅ No duplicates found! Library is clean. (${elapsed}s)\n`);
        return;
    }
    console.log(`\n⚠️  Found ${duplicateGroups.length} duplicate groups (${elapsed}s):\n`);
    // Report duplicates
    duplicateGroups.forEach((group, index) => {
        console.log(`\nGroup ${index + 1} (${group.similarity}% similar):`);
        console.log(`Reason: ${group.reason}`);
        group.specTypes.forEach((spec) => {
            console.log(`  - ${spec.primaryName} (${spec.domain})`);
            console.log(`    ID: ${spec.id}`);
            console.log(`    Alternates: ${spec.alternateNames.slice(0, 3).join(', ')}...`);
        });
    });
    // Save duplicate report
    const report = {
        totalSpecTypes: specTypes.length,
        duplicateGroups: duplicateGroups.map((g) => ({
            similarity: g.similarity,
            reason: g.reason,
            specTypes: g.specTypes.map((s) => ({
                id: s.id,
                primaryName: s.primaryName,
                domain: s.domain,
                alternateNames: s.alternateNames,
            })),
        })),
        generatedAt: new Date().toISOString(),
    };
    const reportPath = join(process.cwd(), 'output', 'duplicate-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Duplicate report saved to: ${reportPath}`);
    console.log('\n⚠️  Review the report and manually remove duplicates as needed.\n');
}
cleanupDuplicates().catch(console.error);
//# sourceMappingURL=cleanupDuplicates.js.map