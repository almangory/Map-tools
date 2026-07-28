const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

code = code.replace(
    /let cleanHex = colorHex\.toUpperCase\(\)\.replace\('#', ''\);/,
    "let cleanHex = colorHex.toUpperCase().replace('#', '').trim();"
);

fs.writeFileSync('services/kmlService.ts', code);
