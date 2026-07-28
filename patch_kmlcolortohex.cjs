const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

code = code.replace(
    /const kmlColorToHex = \(kmlColor: string\): string => \{/,
    "const kmlColorToHex = (kmlColor: string): string => {\n  kmlColor = kmlColor.trim();"
);

fs.writeFileSync('services/parserService.ts', code);
