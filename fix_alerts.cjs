const fs = require('fs');
let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

content = content.replace(/catch \(e: any\) \{ alert\("Error exporting KMZ: " \+ e\.message\);/g, 'catch (e: any) { setActionError("Error exporting KMZ: " + e.message);');
content = content.replace(/catch \(e: any\) \{ alert\("Error exporting DXF: " \+ e\.message\);/g, 'catch (e: any) { setActionError("Error exporting DXF: " + e.message);');
content = content.replace(/catch \(e: any\) \{ alert\("Error exporting Excel: " \+ e\.message\);/g, 'catch (e: any) { setActionError("Error exporting Excel: " + e.message);');
content = content.replace(/catch \(e: any\) \{ alert\("Error exporting PDF: " \+ e\.message\);/g, 'catch (e: any) { setActionError("Error exporting PDF: " + e.message);');

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log("Fixed alerts");
