const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const startIdx = code.indexOf('const safeName = imgName.split(\'/\').pop()?.replace');
if (startIdx !== -1) {
    const endIdx = code.indexOf(';\n                if (safeName) {', startIdx);
    if (endIdx !== -1) {
        // We replace this whole section with the correct safeName assignment
        const before = code.substring(0, startIdx);
        const after = code.substring(endIdx);
        const replacement = "const safeName = imgName.split('/').pop()?.replace(/[.*+?^$!()|[\\]\\\\]/g, '\\\\$&')";
        code = before + replacement + after;
        fs.writeFileSync('services/parserService.ts', code);
        console.log("Fixed!");
    } else {
        console.log("Could not find end index");
    }
} else {
    console.log("Could not find start index");
}
