const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const oldLines = `    const lines = cleanDesc.split('\\n');
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        let separatorIdx = line.indexOf(':');
        if (separatorIdx !== -1) {
            const key = line.substring(0, separatorIdx).trim();
            const val = line.substring(separatorIdx + 1).trim();
            if (key && !attributes[key]) attributes[key] = val;
        } else {
            separatorIdx = line.indexOf(' ');
            if (separatorIdx !== -1) {
                const key = line.substring(0, separatorIdx).trim();
                const val = line.substring(separatorIdx + 1).trim();
                if (key && /^[A-Z0-9_]+$/i.test(key) && !attributes[key]) {
                    attributes[key] = val;
                }
            }
        }
    });`;

const newLines = `    const lines = cleanDesc.split('\\n');
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
        } else {
            separatorIdx = line.indexOf(' ');
            if (separatorIdx !== -1) {
                const key = line.substring(0, separatorIdx).trim();
                const val = line.substring(separatorIdx + 1).trim();
                if (key && /^[A-Z0-9_\\u0600-\\u06FF]+$/i.test(key) && !attributes[key]) {
                    attributes[key] = val;
                }
            }
        }
    });`;

if (code.includes(oldLines)) {
    code = code.replace(oldLines, newLines);
    fs.writeFileSync('services/parserService.ts', code);
    console.log("Patched parserService successfully");
} else {
    console.log("Could not find oldLines");
}
