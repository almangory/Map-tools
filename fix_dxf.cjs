const fs = require('fs');
let content = fs.readFileSync('services/dxfExportService.ts', 'utf8');

content = content.replace('URL.revokeObjectURL(url);', 'setTimeout(() => URL.revokeObjectURL(url), 1000);');

fs.writeFileSync('services/dxfExportService.ts', content, 'utf8');
console.log("Fixed DXF revoke");
