const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isFile1: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const fileExtension = String(file.name.split('.').pop() || '').toLowerCase();
      const fileBuffer = await file.arrayBuffer();
      let pts: GeoPoint[] = [];

      if (fileExtension === 'kmz' || fileExtension === 'kml') {
        const parsed = await parseKMZ(fileBuffer);
        pts = parsed.data as GeoPoint[];
      } else if (fileExtension === 'dxf') {
        const text = new TextDecoder().decode(fileBuffer);
        const dxfParsed = parseDXF(text);
        pts = extractPointsFromDXF(dxfParsed);
      } else if (fileExtension === 'xlsx' || fileExtension === 'csv' || fileExtension === 'xls') {
        const parsed = await parseExcel(fileBuffer, file.name);`;

const replace = `  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isFile1: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const fileExtension = String(file.name.split('.').pop() || '').toLowerCase();
      let pts: GeoPoint[] = [];

      if (['kmz', 'kml', 'zip', 'gdb', 'shp'].includes(fileExtension)) {
        const parsed = await parseKMZ(file);
        pts = parsed.data as GeoPoint[];
      } else if (fileExtension === 'dxf') {
        const parsed = await parseDXF(file);
        pts = extractPointsFromDXF(parsed.data);
      } else if (['xlsx', 'csv', 'xls'].includes(fileExtension)) {
        const parsed = await parseExcel(file);`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched FileComparator.tsx');
