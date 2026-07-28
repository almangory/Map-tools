const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

// Add assetsHeaders state
code = code.replace(
  "const [assetsStatus, setAssetsStatus] = useState<string>('');",
  "const [assetsStatus, setAssetsStatus] = useState<string>('');\n  const [assetsHeaders, setAssetsHeaders] = useState<string[]>([]);"
);

// In handleAssetsUpload, store headers and originalRow
const oldExcelMap = `
          pts = rows.map((r, i) => {
              return {
                  id: idIdx !== -1 && r[idIdx] ? String(r[idIdx]) : \`Asset_\${i}\`,
                  x: parseFloat(r[xIdx]),
                  y: parseFloat(r[yIdx]),
                  type: 'Point',
                  layer: 'Excel Import'
              };
          }).filter(p => !isNaN(p.x) && !isNaN(p.y));
`;

const newExcelMap = `
          setAssetsHeaders(headers);
          pts = rows.map((r, i) => {
              return {
                  id: idIdx !== -1 && r[idIdx] ? String(r[idIdx]) : \`Asset_\${i}\`,
                  x: parseFloat(r[xIdx]),
                  y: parseFloat(r[yIdx]),
                  type: 'Point',
                  layer: 'Excel Import',
                  originalRow: r
              };
          }).filter(p => !isNaN(p.x) && !isNaN(p.y));
`;
code = code.replace(oldExcelMap, newExcelMap);

// In downloadMergedExcel, include originalRow or attributes
const oldDownload = `
  const downloadMergedExcel = () => {
    if (classifiedResults.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(classifiedResults.map(r => ({
      ID: r.id,
      Type: r.type,
      Longitude: r.x,
      Latitude: r.y,
      District: r.district,
      Layer: r.layer || '',
      Description: r.description || ''
    })));
`;

const newDownload = `
  const downloadMergedExcel = () => {
    if (classifiedResults.length === 0) return;
    const exportData = classifiedResults.map(r => {
      const baseRow: any = {
        ID: r.id,
        District: r.district,
        Longitude: r.x,
        Latitude: r.y,
        Type: r.type,
        Layer: r.layer || '',
        Description: r.description || ''
      };
      
      // If we have original headers and rows (from Excel)
      if (assetsHeaders.length > 0 && r.originalRow) {
          assetsHeaders.forEach((h, idx) => {
              if (baseRow[h] === undefined) {
                  baseRow[h] = r.originalRow![idx];
              }
          });
      }
      
      // If we have KML/GDB attributes
      if (r.attributes) {
          Object.keys(r.attributes).forEach(k => {
             if (baseRow[k] === undefined) {
                 baseRow[k] = r.attributes![k];
             }
          });
      }
      
      return baseRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
`;

code = code.replace(oldDownload, newDownload);

fs.writeFileSync('components/MapClassifier.tsx', code);
