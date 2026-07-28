const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

// The replacement for handleAssetsUpload
const oldAssetsUpload = `
      let pts = result.data;
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
`;

const newAssetsUpload = `
      let pts: GeoPoint[] = [];
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
          const rows = result.data as any[][];
          const headers = result.headers as string[];
          const mapping = result.suggestedMapping as any;
          
          if (!mapping.xColumn || !mapping.yColumn) {
              setAssetsStatus(lang === 'ar' ? 'تعذر العثور على أعمدة الإحداثيات تلقائياً' : 'Could not automatically find coordinate columns');
              setLoading(false);
              return;
          }
          
          const xIdx = headers.indexOf(mapping.xColumn);
          const yIdx = headers.indexOf(mapping.yColumn);
          const idIdx = mapping.idColumn ? headers.indexOf(mapping.idColumn) : -1;
          
          pts = rows.map((r, i) => {
              return {
                  id: idIdx !== -1 && r[idIdx] ? String(r[idIdx]) : \`Asset_\${i}\`,
                  x: parseFloat(r[xIdx]),
                  y: parseFloat(r[yIdx]),
                  type: 'Point',
                  layer: 'Excel Import'
              };
          }).filter(p => !isNaN(p.x) && !isNaN(p.y));
      } else {
          pts = result.data as GeoPoint[];
      }
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
`;

code = code.replace(oldAssetsUpload, newAssetsUpload);

fs.writeFileSync('components/MapClassifier.tsx', code);
