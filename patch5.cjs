const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

// Ensure JSZip is imported? wait, downloadKMZ handles it internally if we import it.
code = code.replace(
  "import { identifyPotentialCRS, transformPoints } from '../services/crs';",
  "import { identifyPotentialCRS, transformPoints } from '../services/crs';\nimport { downloadKMZ } from '../services/kmlService';"
);

// We need to implement downloadAssetsKMZ properly
const newKMZExport = `
  const downloadAssetsKMZ = async () => {
    if (classifiedResults.length === 0) return;
    
    // Map ClassifiedAsset back to GeoPoint format required for export
    const exportPoints: GeoPoint[] = classifiedResults.map(r => ({
      ...r,
      layer: r.district, // The classification becomes the layer for grouping by "name"
      name: r.id
    }));

    let exportOptions: any = { mode: 'none' };
    
    if (kmzGroupOption === 'name') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'layer' };
    } else if (kmzGroupOption === 'color') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'color' };
    }

    try {
      await downloadKMZ(exportPoints, "Classified_Assets", exportOptions);
    } catch (e) {
      console.error(e);
      alert('Error generating KMZ');
    }
  };
`;

code = code.replace(
  "  const downloadAssetsKMZ = async () => {\n    if (classifiedResults.length === 0) return;\n    // We would generate KMZ here based on kmzGroupOption\n    // Since we don't have direct access to generateKMZ here without importing, \n    // let's do a simple alert or see if we can import generateKMZ\n    alert(lang === 'ar' ? 'سيتم تصدير KMZ قريباً' : 'KMZ export coming soon');\n  };",
  newKMZExport
);

fs.writeFileSync('components/MapClassifier.tsx', code);
