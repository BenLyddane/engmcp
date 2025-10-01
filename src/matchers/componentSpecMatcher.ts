#!/usr/bin/env node

import { ComponentType, SpecType, ComponentSpecMapping } from '../types/schemas.js';
import { askClaude, askClaudeJSON, generateUUID } from '../utils/claude.js';
import { loadComponentTypes } from '../utils/csvLoader.js';
import { loadMasterSpecTypes } from '../utils/fileManager.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface MatchResult {
  specTypeName: string;
  relevant: boolean;
  category: 'PRIMARY_SIZE' | 'N/A';
  reason: string;
}

/**
 * Match a batch of spec types to a component type (with retry and error handling)
 */
async function matchBatch(
  component: ComponentType,
  specTypeBatch: SpecType[],
  retryCount = 3
): Promise<ComponentSpecMapping[]> {
  const prompt = `Which of these spec types are relevant to ${component.name}?

Component: ${component.name}
Description: ${component.description}

Spec Types to evaluate:
${specTypeBatch.map((spec, idx) => `${idx + 1}. ${spec.primaryName} - ${spec.description.substring(0, 100)}...`).join('\n')}

For EACH spec type, determine if it's relevant to this component type.

Mark as PRIMARY_SIZE if it's the main sizing parameter (like total cooling capacity for a chiller).
Mark as N/A for all other relevant specs.

Return ONLY a JSON object (no extra text):
{
  "${specTypeBatch[0].primaryName}": {
    "relevant": true/false,
    "category": "PRIMARY_SIZE" or "N/A",
    "reason": "brief explanation"
  },
  "${specTypeBatch[1].primaryName}": { ... },
  ...
}`;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      let results: Record<string, MatchResult>;
      
      try {
        results = await askClaudeJSON<Record<string, MatchResult>>(
          prompt,
          'You are an expert in MEP equipment specifications.'
        );
      } catch (parseError) {
        // If JSON parsing fails, try manual cleanup
        console.log(`    ⚠️  Parse failed (attempt ${attempt}/${retryCount}), cleaning...`);
        const rawResponse = await askClaude(prompt, 'You are an expert in MEP equipment specifications.');
        
        // Extract JSON from response
        let jsonText = rawResponse.trim();
        jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
        
        // Try to extract just the JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        
        results = JSON.parse(jsonText);
      }

      const mappings: ComponentSpecMapping[] = [];

      for (const [specTypeName, result] of Object.entries(results)) {
        if (result.relevant) {
          const specType = specTypeBatch.find(s => s.primaryName === specTypeName);
          if (specType) {
            // Validate IDs are present
            if (!component.id) {
              console.error(`    ⚠️  Component ${component.name} has no ID!`);
              continue;
            }
            if (!specType.id) {
              console.error(`    ⚠️  Spec type ${specType.primaryName} has no ID!`);
              continue;
            }
            
            mappings.push({
              componentTypeId: component.id,
              componentTypeName: component.name,
              specTypeId: specType.id,
              specTypeName: specType.primaryName,
              category: result.category,
              isRequired: result.category === 'PRIMARY_SIZE',
              notes: result.reason,
            });
          }
        }
      }

      return mappings;
    } catch (error) {
      if (attempt < retryCount) {
        console.log(`    ↻ Retry ${attempt + 1}/${retryCount}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      console.error(`    ✗ Failed after ${retryCount} attempts:`, error);
      return []; // Return empty array on final failure
    }
  }

  return []; // Shouldn't reach here
}

/**
 * Match all spec types to a single component (with batching and detailed logging)
 * Saves checkpoint after every batch
 */
async function matchComponentToAllSpecs(
  component: ComponentType,
  allSpecTypes: SpecType[],
  componentIndex: number,
  totalComponents: number,
  globalMappings: ComponentSpecMapping[],
  saveCheckpoint: (mappings: ComponentSpecMapping[]) => void
): Promise<ComponentSpecMapping[]> {
  const batchSize = 5;
  const batches = [];
  
  for (let i = 0; i < allSpecTypes.length; i += batchSize) {
    batches.push(allSpecTypes.slice(i, i + batchSize));
  }

  const mappings: ComponentSpecMapping[] = [];

  console.log(`\n[${componentIndex + 1}/${totalComponents}] ${component.name}`);
  console.log(`  Checking ${allSpecTypes.length} spec types (${batches.length} batches of 5)...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const specsProcessed = Math.min((i + 1) * batchSize, allSpecTypes.length);
    
    try {
      const batchMappings = await matchBatch(component, batch);
      
      // Log each match as it's found
      if (batchMappings.length > 0) {
        console.log(`  [${specsProcessed}/${allSpecTypes.length} specs] Batch ${i + 1}/${batches.length}: ${batchMappings.length} matches`);
        batchMappings.forEach(m => {
          console.log(`    ✓ ${m.specTypeName} → ${m.category}`);
        });
      } else {
        // Show progress even when no matches
        if ((i + 1) % 20 === 0 || i === batches.length - 1) {
          console.log(`  [${specsProcessed}/${allSpecTypes.length} specs] Batch ${i + 1}/${batches.length}: ${mappings.length} total matches so far`);
        }
      }
      
      mappings.push(...batchMappings);
      
      // SAVE AFTER EVERY BATCH
      globalMappings.push(...batchMappings);
      saveCheckpoint(globalMappings);
      
    } catch (error) {
      console.error(
        `\n  ✗ Error batch ${i + 1}:`,
        error
      );
    }
  }

  console.log(`  ✅ Complete: ${mappings.length} total matches for ${component.name}\n`);
  return mappings;
}

/**
 * Main matching function with parallel processing
 */
async function matchComponentsToSpecs() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Component-Spec Matcher (10 Parallel Processes)      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const allComponents = loadComponentTypes(
    join(process.cwd(), 'ComponentTypesFullDataDontRead.csv')
  );
  
  // Debug: Check if IDs are being loaded
  console.log(`🔍 Debug: First 3 components:`);
  allComponents.slice(0, 3).forEach(c => {
    console.log(`   ${c.name}: ID=${c.id ? c.id : 'MISSING'}, ParentID=${c.parentTypeId ? c.parentTypeId : 'MISSING'}`);
  });
  console.log('');
  
  // Filter out root-level components (only match children/grandchildren)
  const components = allComponents.filter(c => c.parentTypeId && c.parentTypeId.trim() !== '');
  const filteredOut = allComponents.length - components.length;
  
  const specTypes = loadMasterSpecTypes();

  console.log(`📦 ${allComponents.length} total component types`);
  console.log(`   - ${components.length} child/grandchild components (to match)`);
  console.log(`   - ${filteredOut} root-level components (filtered out)`);
  console.log(`📋 ${specTypes.length} spec types`);
  console.log(`🚀 30 concurrent processes\n`);

  const allMappings: ComponentSpecMapping[] = [];
  const concurrency = 30;
  const startTime = Date.now();
  
  // Load existing checkpoint if available
  const checkpointPath = join(process.cwd(), 'output', 'mappings-checkpoint.json');
  const processedComponents = new Set<string>();
  
  if (existsSync(checkpointPath)) {
    console.log('📂 Found checkpoint, loading...\n');
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
    
    if (checkpoint.mappings && checkpoint.mappings.length > 0) {
      allMappings.push(...checkpoint.mappings);
      
      // Track which components are already processed
      checkpoint.mappings.forEach((m: ComponentSpecMapping) => {
        processedComponents.add(m.componentTypeId);
      });
      
      console.log(`✅ Loaded ${allMappings.length} existing mappings`);
      console.log(`✅ ${processedComponents.size} unique components in checkpoint`);
      console.log(`   Component IDs in checkpoint:`, Array.from(processedComponents).slice(0, 3));
      console.log(`   Total components to match:`, components.length);
    }
  }
  
  // Filter out already-processed components (DEBUG THIS)
  const componentsToProcess = components.filter(c => {
    const isProcessed = processedComponents.has(c.id);
    if (components.length < 10) { // Debug for small sets
      console.log(`   Checking ${c.name} (${c.id}): ${isProcessed ? 'SKIP' : 'PROCESS'}`);
    }
    return !isProcessed;
  });
  
  console.log(`\n📝 ${componentsToProcess.length} components remaining to process`);
  console.log(`📝 ${processedComponents.size} components already done\n`);
  
  if (componentsToProcess.length === 0) {
    console.log('✅ All components already processed!\n');
    return;
  }

  // Process in chunks of 30 components at a time
  for (let i = 0; i < componentsToProcess.length; i += concurrency) {
    const chunk = componentsToProcess.slice(i, Math.min(i + concurrency, componentsToProcess.length));

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Batch ${Math.floor(i / concurrency) + 1}: Processing components ${i + 1}-${Math.min(i + concurrency, components.length)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Checkpoint save function (thread-safe)
    const saveCheckpointFn = (mappings: ComponentSpecMapping[]) => {
      const checkpointPath = join(process.cwd(), 'output', 'mappings-checkpoint.json');
      const checkpoint = {
        mappings,
        progress: {
          totalMappings: mappings.length,
          componentsInProgress: chunk.length,
        },
        metadata: {
          status: 'in-progress',
          lastUpdated: new Date().toISOString(),
        },
      };
      writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
    };

    // Process 30 components in parallel (each saves after every batch)
    const promises = chunk.map((component, idx) =>
      matchComponentToAllSpecs(
        component,
        specTypes,
        i + idx,
        components.length,
        allMappings,
        saveCheckpointFn
      )
    );

    await Promise.all(promises);

    // Overall progress
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const completedThisRun = Math.min(i + concurrency, componentsToProcess.length);
    const totalCompleted = processedComponents.size + completedThisRun;
    const progress = Math.round((totalCompleted / components.length) * 100);
    const rate = completedThisRun / elapsed || 0;
    const remaining = componentsToProcess.length - completedThisRun;
    const etaSeconds = remaining / rate || 0;
    const etaMinutes = Math.floor(etaSeconds / 60);
    const etaHours = Math.floor(etaMinutes / 60);

    console.log(`\n╔════════════════════════════════════════════════════════╗`);
    console.log(`║ Progress: ${progress}% (${totalCompleted}/${components.length})${''.padEnd(28)}║`);
    console.log(`║ Total Mappings: ${allMappings.length.toLocaleString()}${''.padEnd(37)}║`);
    console.log(`║ Speed: ${rate.toFixed(1)} comp/s | ETA: ${etaHours}h ${etaMinutes % 60}m${''.padEnd(22)}║`);
    console.log(`║ Avg Matches/Component: ${Math.round(allMappings.length / totalCompleted)}${''.padEnd(25)}║`);
    console.log(`║ From Checkpoint: ${processedComponents.size} | This Run: ${completedThisRun}${''.padEnd(10)}║`);
    console.log(`╚════════════════════════════════════════════════════════╝\n`);
    console.log(`💾 Checkpoint saved (${totalCompleted}/${components.length} total components)\n`);
  }

  // Save final results
  const output = {
    mappings: allMappings,
    metadata: {
      totalMappings: allMappings.length,
      totalComponents: components.length,
      totalSpecTypes: specTypes.length,
      avgMappingsPerComponent: Math.round(allMappings.length / components.length),
      generatedAt: new Date().toISOString(),
    },
  };

  const outputPath = join(process.cwd(), 'output', 'component-spec-mappings.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ Matching complete!`);
  console.log(`📊 Results:`);
  console.log(`   - ${output.metadata.totalMappings.toLocaleString()} total mappings`);
  console.log(`   - Avg ${output.metadata.avgMappingsPerComponent} specs per component`);
  console.log(`\n💾 Saved to: ${outputPath}\n`);
}

matchComponentsToSpecs().catch(console.error);
