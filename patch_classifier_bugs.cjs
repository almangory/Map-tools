const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

// Fix handleZonesUpload
code = code.replace(
  "const potentialCRS = identifyPotentialCRS(fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data);\n        const sourceData = fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data;",
  "const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);\n        const sourceData = result.data as GeoPoint[];"
);

// Fix handleAssetsUpload
code = code.replace(
  "const potentialCRS = identifyPotentialCRS(fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data);\n        const sourceData = fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data;",
  "const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);\n        const sourceData = result.data as GeoPoint[];"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
