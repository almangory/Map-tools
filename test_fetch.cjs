const fs = require('fs');
let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');
const match = content.match(/if \(autoFetchStreets && fetchStreets\) \{[\s\S]*?\} else \{/);
console.log(match[0]);
