import fs from 'fs';
const content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');
const match = content.match(/const getProcessedPoints = [\s\S]*?return \{ processedPoints/);
console.log(match ? match[0] : "Not found");
