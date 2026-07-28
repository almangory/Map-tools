const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const searchStr = `        ...((targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? {
            polygonStyle: {`;

const replaceStr = `        ...(targetTemplate === 'pipes' ? {
            lineStyle: { width: 3 }
        } : {}),
        ...((targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? {
            polygonStyle: {`;

code = code.replace(searchStr, replaceStr);

fs.writeFileSync('components/DataFormatter.tsx', code);
