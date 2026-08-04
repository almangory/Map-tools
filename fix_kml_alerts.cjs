const fs = require('fs');
let content = fs.readFileSync('services/kmlService.ts', 'utf8');

content = content.replace(/alert\("خطأ أثناء إنشاء المجلد المضغوط \(Error creating ZIP\): " \+ e\.message\);/g, 'throw new Error("Error creating ZIP: " + e.message);');
content = content.replace(/alert\("خطأ أثناء إنشاء الملف \(Error creating KMZ\): " \+ e\.message\);/g, 'throw new Error("Error creating KMZ: " + e.message);');

fs.writeFileSync('services/kmlService.ts', content, 'utf8');
console.log("Fixed kml alerts");
