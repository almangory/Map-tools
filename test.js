import fs from 'fs';
const content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');
console.log(content.match(/executeAction = async \([\s\S]*?\n  \};/)[0]);
