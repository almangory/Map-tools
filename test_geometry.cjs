const fs = require('fs');
const content = fs.readFileSync('services/geometryService.ts', 'utf8');
const match = content.match(/export const detectExactDuplicates = [\s\S]*?return overlaps;\n};/);
console.log(match[0]);
