const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const oldKMZBlock = `    } else {
        // إذا كان الملف KMZ (مضغوط)
        const zip = await JSZip.loadAsync(file);
        const kmlFilename = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
        if (!kmlFilename) throw new Error("Invalid KMZ: No .kml file found inside.");
        kmlContent = await zip.file(kmlFilename)?.async("string") || "";
        if (onProgress) onProgress(60);
    }`;

const newKMZBlock = `    } else {
        // إذا كان الملف KMZ (مضغوط)
        const zip = await JSZip.loadAsync(file);
        const kmlFilename = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
        if (!kmlFilename) throw new Error("Invalid KMZ: No .kml file found inside.");
        kmlContent = await zip.file(kmlFilename)?.async("string") || "";
        
        // Extract images and replace in KML
        const imageFiles = Object.keys(zip.files).filter(name => /\\.(png|jpg|jpeg|gif|svg)$/i.test(name));
        for (const imgName of imageFiles) {
            const base64 = await zip.file(imgName)?.async("base64");
            if (base64) {
                const ext = imgName.split('.').pop()?.toLowerCase();
                const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : \`image/\${ext}\`;
                const dataURI = \`data:\${mimeType};base64,\${base64}\`;
                const safeName = imgName.split('/').pop()?.replace(/[.*+?^$!()|[\\]\\\\]/g, '\\\\$&');
                if (safeName) {
                    kmlContent = kmlContent.replace(new RegExp(\`<href>[^<]*?\${safeName}<\\\\/href>\`, 'gi'), \`<href>\${dataURI}</href>\`);
                    kmlContent = kmlContent.replace(new RegExp(\`src=['"][^'"]*?\${safeName}['"]\`, 'gi'), \`src="\${dataURI}"\`);
                }
            }
        }
        
        if (onProgress) onProgress(60);
    }`;

if (code.includes(oldKMZBlock)) {
    code = code.replace(oldKMZBlock, newKMZBlock);
    fs.writeFileSync('services/parserService.ts', code);
    console.log('Successfully patched parseKMZ');
} else {
    console.log('Failed to find old KMZ block');
}
