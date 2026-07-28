const fs = require('fs');
let code = fs.readFileSync('types.ts', 'utf8');

code = code.replace(
    /attributes\?: Record<string, string>; \/\/ Extracted extended data/,
    "attributes?: Record<string, string>; // Extracted extended data\n  iconUrl?: string; // Custom KML icon URL"
);

fs.writeFileSync('types.ts', code);
