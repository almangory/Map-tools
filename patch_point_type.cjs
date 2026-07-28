const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    "type: (targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? 'Polygon' : p.type",
    "type: (targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? 'Polygon' : (targetTemplate === 'grids' ? 'Point' : p.type)"
);

fs.writeFileSync('components/DataFormatter.tsx', code);
