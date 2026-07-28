const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

// Fix getKMLColorParts to handle undefined
const oldGet = `const getKMLColorParts = (hex: string) => {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) cleanHex = '3b82f6';
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return { r, g, b, cleanHex };
};`;

const newGet = `const getKMLColorParts = (hex: string | undefined) => {
    if (!hex) return { r: 'f6', g: '82', b: '3b', cleanHex: '3b82f6', hasColor: false };
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return { r: 'f6', g: '82', b: '3b', cleanHex: '3b82f6', hasColor: false };
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return { r, g, b, cleanHex, hasColor: true };
};`;

if (code.includes(oldGet)) {
    code = code.replace(oldGet, newGet);
} else {
    console.log("Could not find oldGet");
}

// In generateKMLChunks
const oldChunks1 = `        let colorHex = pt.color || '#3b82f6';
        if (type === 'Polygon' && options?.polygonStyle?.colorHex) {
            colorHex = options.polygonStyle.colorHex;
        }
        
        const { r, g, b, cleanHex } = getKMLColorParts(colorHex);
        const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';
        const styleId = type === 'Polygon' && options?.polygonStyle ? \`style_Polygon_Custom_\${cleanHex}\` : \`style_\${type}_\${cleanHex}_\${iconHash}\`; // Added icon hash to styleId
        
        if (!uniqueStyles.has(styleId)) {
            uniqueStyles.add(styleId);
            const kmlColor = \`ff\${b}\${g}\${r}\`.toLowerCase();`;

const newChunks1 = `        let colorHex = pt.color;
        if (type === 'Polygon' && options?.polygonStyle?.colorHex) {
            colorHex = options.polygonStyle.colorHex;
        }
        if (type === 'Polygon' && !colorHex) colorHex = '#3b82f6'; // Fallback for polygon if undefined
        if (type === 'LineString' && !colorHex) colorHex = '#3b82f6'; // Fallback for lines if undefined
        
        const { r, g, b, cleanHex, hasColor } = getKMLColorParts(colorHex);
        const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';
        const styleId = type === 'Polygon' && options?.polygonStyle ? \`style_Polygon_Custom_\${cleanHex}\` : \`style_\${type}_\${hasColor ? cleanHex : 'nocolor'}_\${iconHash}\`;
        
        if (!uniqueStyles.has(styleId)) {
            uniqueStyles.add(styleId);
            const kmlColorStr = hasColor ? \`\\n        <color>ff\${b}\${g}\${r}</color>\` : '';
            const kmlColor = \`ff\${b}\${g}\${r}\`.toLowerCase();`;

if (code.includes(oldChunks1)) {
    code = code.replace(oldChunks1, newChunks1);
} else {
    console.log("Could not find oldChunks1");
}

// In generateKMLChunks style generation
const oldPoly = `      <LineStyle>
        <color>\${kmlColor}</color>
        <width>\${polyWidth}</width>
      </LineStyle>
      <PolyStyle>
        <color>\${polyColor}</color>`;
        
const newPoly = `      <LineStyle>\${kmlColorStr}
        <width>\${polyWidth}</width>
      </LineStyle>
      <PolyStyle>
        <color>\${polyColor}</color>`;
code = code.replace(oldPoly, newPoly);

const oldLine = `      <LineStyle>
        <color>\${kmlColor}</color>
        <width>\${options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3}</width>
      </LineStyle>`;

const newLine = `      <LineStyle>\${kmlColorStr}
        <width>\${options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3}</width>
      </LineStyle>`;
code = code.replace(oldLine, newLine);

const oldIcon = `      <IconStyle>
        <color>\${kmlColor}</color>
        <scale>0.8</scale>`;

const newIcon = `      <IconStyle>\${kmlColorStr}
        <scale>0.8</scale>`;
code = code.replace(oldIcon, newIcon);

fs.writeFileSync('services/kmlService.ts', code);
console.log("Patched kmlService colors");
