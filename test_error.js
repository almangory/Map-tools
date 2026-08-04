const fs = require('fs');
const content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');
console.log(content.includes('executeAction = async'));
