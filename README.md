# MEP Spec Type Generation System

AI-powered system for generating comprehensive specification types for Mechanical, Electrical, Plumbing (MEP), and Fire Protection equipment.

## Table of Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Commands](#commands)
- [Output Files](#output-files)
- [Data Structures](#data-structures)
- [Workflow](#workflow)
- [Examples](#examples)

## Overview

This system generates a comprehensive database of:
1. **Global Spec Types** - Reusable specification types across all MEP domains
2. **Unit Groups & Conversions** - Complete unit database with conversion equations
3. **Component-Spec Mappings** - Join table linking component types to applicable spec types

### Key Features
- ✅ AI-powered generation using Claude
- ✅ Incremental saving with resume capability
- ✅ Automatic deduplication and validation
- ✅ UUID-based relationships
- ✅ Parallel processing (10 concurrent operations)
- ✅ Rich metadata (alternate names, descriptions, examples, standards)

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│ INPUT DATA                                               │
├─────────────────────────────────────────────────────────┤
│ • ComponentTypesFullDataDontRead.csv (562 components)   │
│ • SpecTypesOldDONTUSETHISONETOOBIGTOREAD.csv (old specs)│
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ PHASE 1: SPEC TYPE GENERATION                           │
├─────────────────────────────────────────────────────────┤
│ 1. Convert Old Specs → Rich Format (902 specs)          │
│ 2. Generate New Global Specs → Fill Gaps                │
│ 3. Deduplicate → Remove Semantic Duplicates             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ PHASE 2: UNIT PROCESSING                                │
├─────────────────────────────────────────────────────────┤
│ 1. Extract Units → From Spec Types (1419 unique)        │
│ 2. Generate Unit Groups → Standard (convert-units)      │
│ 3. Generate Custom Conversions → MEP-specific units     │
│ 4. Link Units → UUID references                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ PHASE 3: COMPONENT MATCHING                             │
├─────────────────────────────────────────────────────────┤
│ 1. Match Components to Specs → AI-powered (parallel)    │
│ 2. Categorize → PRIMARY_SIZE vs N/A                     │
│ 3. Create Join Table → ComponentSpecMapping             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ OUTPUT: Complete MEP Specification Database             │
└─────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Clone repository
git clone <repo-url>
cd EngMcp

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your CLAUDE_API_KEY to .env.local
```

## Commands

### Spec Type Generation

#### `npm run generate:test`
Generate 5 test spec types for validation.

#### `npm run convert:old-specs`
Convert old spec types from CSV to rich format.
- Input: `SpecTypesOldDONTUSETHISONETOOBIGTOREAD.csv`
- Output: `output/spec-types-master.json`
- Features: AI enrichment, deduplication, alternate names

#### `npm run generate:full`
Generate additional global spec types to fill gaps.
- Uses category-based exhaustive generation
- Auto-detects category exhaustion (10 consecutive duplicates)
- Outputs generic (not equipment-specific) spec types

### Unit Processing

#### `npm run extract:units`
Extract all units from generated spec types.
- Input: `output/spec-types-master.json`
- Output: `output/discovered-units.json`
- Collects: primaryUnit, alternateUnits from all spec types

#### `npm run generate:units`
Create unit groups using convert-units library.
- Input: `output/discovered-units.json`
- Output: `output/global-units-master.json`
- Generates: 220 standard conversions (m↔ft, °C↔°F, etc.)

#### `npm run generate:custom-conversions`
Generate conversion equations for custom MEP units.
- Input: Unmapped units from `global-units-master.json`
- Output: Updates `global-units-master.json`
- Classifies: GPM, CFM, tons, BTU/h, etc.
- Generates: Custom conversion equations using AI

#### `npm run link:units`
Link unit UUIDs to spec types (deterministic matching).
- Input: `global-units-master.json`, `spec-types-master.json`
- Output: Updates `spec-types-master.json` with unit IDs
- Adds: primaryUnitId, alternateUnitIds fields

### Component Matching

#### `npm run match:components`
Match component types to relevant spec types (10 parallel processes).
- Input: `ComponentTypesFullDataDontRead.csv`, `spec-types-master.json`
- Output: `output/component-spec-mappings.json`
- Features: Parallel processing, incremental checkpointing
- Time: ~3 hours for 562 components

### Utilities

#### `npm run cleanup:duplicates`
Find and report semantic duplicates.
- Input: `output/spec-types-master.json`
- Output: `output/duplicate-report.json`
- Features: AI-powered semantic analysis, batched processing

#### `npm run postprocess:all`
Run complete unit processing pipeline.
- Equivalent to: extract:units → generate:units → link:units

## Output Files

### Core Data Files

#### `output/spec-types-master.json`
**Structure:**
```json
{
  "specTypes": [
    {
      "id": "uuid",
      "primaryName": "Cooling Capacity",
      "alternateNames": ["Total Cooling Capacity", "Cooling Load", ...],
      "notNames": ["Sensible Cooling Capacity - Different concept", ...],
      "description": "Detailed 2-3 sentence description...",
      "domain": "HVAC",
      "primaryUnit": "tons",
      "primaryUnitId": "unit-uuid",
      "primaryUnitGroup": "Cooling Capacity",
      "primaryUnitGroupId": "ug-uuid",
      "alternateUnits": ["BTU/h", "kW", "MBH"],
      "alternateUnitIds": ["unit-uuid-1", "unit-uuid-2", "unit-uuid-3"],
      "valueType": "NUMERIC",
      "minValue": 0.5,
      "maxValue": 10000,
      "allowsArray": false,
      "examples": ["150 tons for office building chiller"],
      "industryStandards": ["ASHRAE 90.1", "AHRI 550/590"],
      "valueOptions": [] // For SELECT/MULTI_SELECT types
    }
  ],
  "metadata": {
    "lastUpdated": "2025-09-30T22:00:00Z",
    "totalCount": 902
  }
}
```

**Fields:**
- `primaryName`: Main specification name
- `alternateNames`: Industry synonyms (5+ per spec)
- `notNames`: Similar but different concepts (for disambiguation)
- `description`: Detailed explanation
- `domain`: HVAC | ELECTRICAL | PLUMBING | FIRE_PROTECTION
- `primaryUnit/primaryUnitId`: Primary measurement unit
- `alternateUnits/alternateUnitIds`: Alternative units
- `valueType`: NUMERIC | SELECT | MULTI_SELECT | RANGE | BOOLEAN
- `valueOptions`: For SELECT types, with alternate names and descriptions
- `examples`: Real-world usage examples
- `industryStandards`: Relevant codes and standards

#### `output/global-units-master.json`
**Structure:**
```json
{
  "units": [
    {
      "id": "unit-uuid",
      "symbol": "GPM",
      "name": "gallons per minute",
      "abbreviations": ["GPM", "gpm", "gal/min", "gallons per minute"],
      "unitGroupId": "ug-volumetric-flow-rate"
    }
  ],
  "unitGroups": [
    {
      "id": "ug-volumetric-flow-rate",
      "name": "Volumetric Flow Rate",
      "description": "Flow rate measurement units",
      "baseUnitId": "unit-uuid-base",
      "unitIds": ["unit-uuid-1", "unit-uuid-2", ...],
      "conversions": [
        {
          "id": "conv-uuid",
          "fromUnitId": "unit-uuid-1",
          "toUnitId": "unit-uuid-2",
          "multiplier": 3.78541,
          "equation": "x * 3.78541",
          "description": "GPM to L/min"
        }
      ]
    }
  ],
  "metadata": {
    "totalUnits": 1410,
    "totalGroups": 50,
    "totalConversions": 3500,
    "generatedAt": "2025-09-30T22:00:00Z"
  }
}
```

#### `output/component-spec-mappings.json`
**Structure:**
```json
{
  "mappings": [
    {
      "componentTypeId": "comp-uuid",
      "componentTypeName": "Absorption Water Chillers",
      "specTypeId": "spec-uuid",
      "specTypeName": "Cooling Capacity",
      "category": "PRIMARY_SIZE",
      "isRequired": true,
      "notes": "Main sizing parameter for chillers"
    }
  ],
  "metadata": {
    "totalMappings": 15000,
    "totalComponents": 562,
    "totalSpecTypes": 902,
    "avgMappingsPerComponent": 27
  }
}
```

### Supporting Files

- `discovered-units.json` - Unit extraction report
- `duplicate-report.json` - Duplicate analysis results
- `conversions-checkpoint.json` - Resume point for unit conversions
- `mappings-checkpoint.json` - Resume point for component matching
- `classification-checkpoint.json` - Resume point for unit classification

## Data Structures

### SpecType
Complete specification type with metadata, units, and validation.

### Unit
Individual measurement unit with abbreviations and group membership.

### UnitGroup
Collection of related units with conversion equations.

### ConversionEquation
Bidirectional conversion formula between two units.

### ComponentSpecMapping
Join table linking component types to applicable spec types.

## Workflow

### Complete Generation Pipeline

```bash
# 1. Generate Spec Types
npm run convert:old-specs           # Convert 888 old specs
npm run generate:full               # Generate additional specs

# 2. Process Units
npm run extract:units               # Extract 1419 units
npm run generate:units              # Create standard groups (220 conversions)
npm run generate:custom-conversions # Add MEP conversions (~3000+)
npm run link:units                  # Link UUIDs (4282 references)

# 3. Create Mappings
npm run match:components            # 562 components × 902 specs

# 4. Cleanup (Optional)
npm run cleanup:duplicates          # Find any remaining duplicates
```

### Resume from Checkpoint

All long-running processes save checkpoints. If interrupted:
- Spec generation: Resumes from last saved spec
- Unit classification: Resumes from checkpoint
- Component matching: Resumes from checkpoint

## Examples

### Use Case: Document Extraction

```typescript
// 1. Extract from PDF: "Chiller: 450 GPM, 150 tons"

// 2. Match component type
const component = matchComponentType("Chiller");
// → componentId: "abc-123"

// 3. Find applicable spec types
const specs = getSpecsForComponent("abc-123");
// → [{ specTypeName: "Flow Rate", ... }, 
//    { specTypeName: "Cooling Capacity", ... }]

// 4. Parse values with units
const flowRate = {
  value: 450,
  unitSymbol: "GPM"
};

// 5. Look up unit UUID
const unit = findUnitBySymbol("GPM");
// → { id: "unit-003", unitGroupId: "ug-flow-rate" }

// 6. Store normalized data
const data = {
  componentId: "abc-123",
  specTypeId: "spec-789",
  value: 450,
  unitId: "unit-003"
};

// 7. Convert units for calculations
const litersPerMin = convertUnit(450, "unit-003", "unit-100");
// → 1703.43 L/min
```

### Use Case: Engineering Calculations

```typescript
// Calculate chiller efficiency (kW/ton)
const coolingCapacity = {
  value: 150,
  unitId: "unit-tons"
};

const powerInput = {
  value: 530,
  unitId: "unit-kW"
};

// Convert cooling to kW
const coolingInKW = convertUnit(
  coolingCapacity.value,
  coolingCapacity.unitId,
  powerInput.unitId
);

const efficiency = powerInput.value / coolingInKW;
// → 1.0 kW/ton (COP ≈ 3.5)
```

## Technical Details

### Technologies
- **Language**: TypeScript
- **AI**: Anthropic Claude (Sonnet 4)
- **Unit Conversions**: convert-units library + AI-generated MEP-specific
- **Data Format**: JSON with UUID references

### Performance Optimizations
- Pre-validation before generation (saves ~13% API costs)
- Parallel processing (10x speedup for component matching)
- String similarity filtering (reduces comparisons by 99%+)
- Incremental checkpointing (resume from any point)

### Quality Assurance
- Semantic duplicate detection
- Bidirectional conversion validation
- Required field validation
- AI response cleanup and retry logic

## Project Structure

```
EngMcp/
├── src/
│   ├── types/
│   │   └── schemas.ts              # TypeScript interfaces
│   ├── utils/
│   │   ├── claude.ts               # AI integration
│   │   ├── fileManager.ts          # File I/O
│   │   ├── csvLoader.ts            # CSV parsing
│   │   ├── validator.ts            # Validation
│   │   └── preValidator.ts         # Pre-generation validation
│   ├── generators/
│   │   ├── testGenerator.ts        # Test mode (5 specs)
│   │   ├── globalSpecTypeGenerator.ts  # Global library generator
│   │   └── fullGenerator.ts        # Legacy (unused)
│   ├── converters/
│   │   └── oldSpecTypeConverter.ts # Old→New format converter
│   ├── postprocess/
│   │   ├── extractUnits.ts         # Unit extraction
│   │   ├── generateUnitGroups.ts   # Standard unit groups
│   │   ├── generateCustomConversions.ts  # Custom MEP conversions
│   │   ├── linkUnits.ts            # UUID linking
│   │   └── cleanupDuplicates.ts    # Duplicate detection
│   ├── matchers/
│   │   └── componentSpecMatcher.ts # Component-spec matching
│   └── main.ts                     # Entry point
├── output/
│   ├── spec-types-master.json      # Main spec type database
│   ├── global-units-master.json    # Units + conversions
│   ├── component-spec-mappings.json # Join table
│   └── [various checkpoint files]
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

### Adding New Spec Types
1. Run `npm run generate:full`
2. System will generate until categories are exhausted
3. Review `output/spec-types-master.json`

### Adding Custom Unit Conversions
1. Add unit to a spec type
2. Run `npm run extract:units`
3. Run `npm run generate:custom-conversions`
4. System will classify and generate conversions

## License

ISC

## Support

For issues or questions, contact the development team.

---

**Generated**: September 30, 2025  
**Version**: 1.0.0
