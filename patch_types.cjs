const fs = require('fs');
let code = fs.readFileSync('types.ts', 'utf8');
if (!code.includes("BaseMapType")) {
  code += "\nexport type BaseMapType = 'satellite' | 'streets' | 'terrain' | 'osm';\n";
  fs.writeFileSync('types.ts', code);
}
