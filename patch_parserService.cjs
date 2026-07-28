const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const oldParseLines = `    const lines = cleanDesc.split('\\n');
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        let separatorIdx = line.indexOf(':');
        if (separatorIdx !== -1) {
            const key = line.substring(0, separatorIdx).trim();
            const val = line.substring(separatorIdx + 1).trim();
            if (key && !attributes[key]) attributes[key] = val;
        }
    });`;

const newParseLines = `    const lines = cleanDesc.split('\\n');
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        let separatorIdx = line.indexOf(':');
        if (separatorIdx === -1) separatorIdx = line.indexOf('：');
        if (separatorIdx === -1) separatorIdx = line.indexOf('-');
        if (separatorIdx === -1) separatorIdx = line.indexOf('=');

        if (separatorIdx !== -1) {
            const key = line.substring(0, separatorIdx).trim();
            const val = line.substring(separatorIdx + 1).trim();
            if (key && !attributes[key]) attributes[key] = val;
        }
    });`;

if (code.includes(oldParseLines)) {
    code = code.replace(oldParseLines, newParseLines);
    fs.writeFileSync('services/parserService.ts', code);
    console.log("Patched parseDescriptionToAttributes for KML description!");
} else {
    console.log("Could not find oldParseLines");
}
