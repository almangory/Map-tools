const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');
console.log(code.includes('newId = String(p.street)'));
