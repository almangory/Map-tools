const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

const oldGet = `export const getKMLColorParts = (colorHex: string) => {
    let cleanHex = colorHex.toUpperCase().replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    if (cleanHex.length !== 6) {
        cleanHex = '3B82F6'; // Default fallback
    }
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return { r, g, b, cleanHex };
};`;

const newGet = `export const getKMLColorParts = (colorHex: string | undefined) => {
    if (!colorHex) return { r: 'F6', g: '82', b: '3B', cleanHex: '3B82F6', hasColor: false };
    let cleanHex = colorHex.toUpperCase().replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    if (cleanHex.length !== 6) {
        return { r: 'F6', g: '82', b: '3B', cleanHex: '3B82F6', hasColor: false };
    }
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return { r, g, b, cleanHex, hasColor: true };
};`;

if (code.includes(oldGet)) {
    code = code.replace(oldGet, newGet);
    console.log("Patched getKMLColorParts");
}

fs.writeFileSync('services/kmlService.ts', code);
