const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

code = code.replace(
    /if \(path\.length > 0\) points\.push\(\{ id: name, x: path\[0\]\.x, y: path\[0\]\.y, z: path\[0\]\.z, description: desc, layer: layerName, type: 'LineString', path: path, color, attributes \}\);/,
    "if (path.length > 0) points.push({ id: name, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, type: 'LineString', path: path, color, attributes, iconUrl });"
);

code = code.replace(
    /if \(parts\.length >= 2\) points\.push\(\{ id: name, x: parseFloat\(parts\[0\]\), y: parseFloat\(parts\[1\]\), z: parts\.length > 2 \? parseFloat\(parts\[2\]\) : 0, description: desc, layer: layerName, type: 'Point', color, attributes \}\);/,
    "if (parts.length >= 2) points.push({ id: name, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, type: 'Point', color, attributes, iconUrl });"
);

fs.writeFileSync('services/parserService.ts', code);
