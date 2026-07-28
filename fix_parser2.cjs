const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

code = code.replace(
    /export const parseKMLContentAsync = async[\s\S]*?const points = await parseKMLContentAsync\(kmlContent, onProgress\);/,
    "export const parseKMLContentAsync = async (kmlContent: string, onProgress?: (percent: number) => void): Promise<GeoPoint[]> => {\n    const points = parseKMLContent(kmlContent);"
);

fs.writeFileSync('services/parserService.ts', code);
