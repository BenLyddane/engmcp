import { dryRunValueTypeFixes, fixAllValueTypes, fixValueTypesRange } from '../utils/fixValueTypes.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (command === 'dry-run') {
    const limit = parseInt(args[1]) || 10;
    console.log(`Running dry-run mode for ${limit} spec types...`);
    await dryRunValueTypeFixes(limit);
  } else if (command === 'fix-all') {
    console.log('⚠️  WARNING: This will modify spec-types-master.json');
    console.log('A backup will be created automatically.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await fixAllValueTypes();
  } else if (command === 'fix-range') {
    const start = parseInt(args[1]) || 0;
    const end = parseInt(args[2]) || 10;
    
    console.log(`⚠️  WARNING: This will modify spec types ${start} to ${end}`);
    console.log('A backup will be created automatically.');
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await fixValueTypesRange(start, end);
  } else {
    console.log('Usage:');
    console.log('  npm run fix-value-types dry-run [limit]     - Test without saving (default: 10)');
    console.log('  npm run fix-value-types fix-all              - Fix all spec types');
    console.log('  npm run fix-value-types fix-range <start> <end> - Fix spec types in range');
    console.log('');
    console.log('Examples:');
    console.log('  npm run fix-value-types dry-run 20          - Preview first 20 changes');
    console.log('  npm run fix-value-types fix-range 0 50      - Fix first 50 spec types');
    console.log('  npm run fix-value-types fix-all              - Fix all 902 spec types');
  }
}

main().catch(console.error);
