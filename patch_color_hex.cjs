const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const oldFunc = `const kmlColorToHex = (kmlColor: string): string => {
  kmlColor = kmlColor.trim();
  if (!kmlColor) return '#3b82f6';
  
  if (kmlColor.length === 6) {
    const r = kmlColor.substring(4, 6);
    const g = kmlColor.substring(2, 4);
    const b = kmlColor.substring(0, 2);
    return \`#\${r}\${g}\${b}\`;
  }
  
  if (kmlColor.length < 8) return '#3b82f6'; 
  const r = kmlColor.substring(6, 8);
  const g = kmlColor.substring(4, 6);
  const b = kmlColor.substring(2, 4);
  return \`#\${r}\${g}\${b}\`;
};`;

const newFunc = `const kmlColorToHex = (kmlColor: string): string => {
  kmlColor = kmlColor.trim();
  if (kmlColor.startsWith('#')) kmlColor = kmlColor.substring(1);
  if (!kmlColor) return '#3b82f6';
  
  if (kmlColor.length === 6) {
    const r = kmlColor.substring(4, 6);
    const g = kmlColor.substring(2, 4);
    const b = kmlColor.substring(0, 2);
    return \`#\${r}\${g}\${b}\`;
  }
  
  if (kmlColor.length < 8) return '#3b82f6'; 
  const r = kmlColor.substring(6, 8);
  const g = kmlColor.substring(4, 6);
  const b = kmlColor.substring(2, 4);
  return \`#\${r}\${g}\${b}\`;
};`;

if (code.includes(oldFunc)) {
    code = code.replace(oldFunc, newFunc);
    fs.writeFileSync('services/parserService.ts', code);
    console.log("Fixed kmlColorToHex!");
} else {
    console.log("Could not find oldFunc in parserService");
}
