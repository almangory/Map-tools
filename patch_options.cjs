const fs = require('fs');
let types = fs.readFileSync('types.ts', 'utf8');
if (!types.includes('lineStyle?: {')) {
    types = types.replace(
        "polygonStyle?: {",
        "lineStyle?: {\n    width?: number;\n  };\n  polygonStyle?: {"
    );
    fs.writeFileSync('types.ts', types);
}
