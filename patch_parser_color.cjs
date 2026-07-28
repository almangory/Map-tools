const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

// In parseKMLContentAsync, change `let color = "#3b82f6";` to `let color = undefined;`
code = code.replace(/let color = "#3b82f6";/g, 'let color = undefined;');

// In kmlColorToHex, handle undefined
const kmlHexBlock = `const kmlColorToHex = (kmlColor: string): string => {
  kmlColor = kmlColor.trim();
  if (kmlColor.startsWith('#')) kmlColor = kmlColor.substring(1);
  if (!kmlColor) return '#3b82f6';`;

const newKmlHexBlock = `const kmlColorToHex = (kmlColor: string): string | undefined => {
  if (!kmlColor) return undefined;
  kmlColor = kmlColor.trim();
  if (kmlColor.startsWith('#')) kmlColor = kmlColor.substring(1);
  if (!kmlColor) return undefined;`;

if (code.includes(kmlHexBlock)) {
    code = code.replace(kmlHexBlock, newKmlHexBlock);
}

fs.writeFileSync('services/parserService.ts', code);
console.log("Patched parserService colors");
