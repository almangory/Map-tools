const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

code = code.replace(
    /const styleId = type === 'Polygon' && options\?\.polygonStyle \? `style_Polygon_Custom_\$\{cleanHex\}` : `style_\$\{type\}_\$\{cleanHex\}`;/,
    "const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';\n        const styleId = type === 'Polygon' && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${type}_${cleanHex}_${iconHash}`; // Added icon hash to styleId"
);

fs.writeFileSync('services/kmlService.ts', code);
