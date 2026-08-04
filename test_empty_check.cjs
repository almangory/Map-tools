const fs = require('fs');
let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// Ensure early returns set error message
content = content.replace(/if \(processedPoints\.length === 0\) return;/g, 'if (processedPoints.length === 0) { setActionError("لا توجد بيانات صالحة للتصدير (No valid data to export)"); return; }');

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log("Fixed early returns");
