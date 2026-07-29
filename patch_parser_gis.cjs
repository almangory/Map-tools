const fs = require('fs');

let code = fs.readFileSync('services/parserService.ts', 'utf8');

// 1. Add imports at the top
if (!code.includes('import shp from')) {
    code = `import shp from 'shpjs';\nimport fgdb from 'fgdb';\n` + code;
}

// 2. Add geoJsonToGeoPoints helper
const helper = `
export const geoJsonToGeoPoints = (geoJson: any, sourceName: string): GeoPoint[] => {
    const points: GeoPoint[] = [];
    if (!geoJson) return points;

    const features = geoJson.features || (geoJson.type === 'Feature' ? [geoJson] : []);
    
    let counter = 1;
    for (const feature of features) {
        if (!feature.geometry) continue;
        
        const props = feature.properties || {};
        const id = props.id || props.ID || props.OBJECTID || props.FID || props.name || props.Name || \`\${sourceName}_\${counter++}\`;
        
        // Build a nice description
        let descParts = [];
        for (const [k, v] of Object.entries(props)) {
            if (v !== null && v !== undefined && v !== '') {
                descParts.push(\`\${k}: \${v}\`);
            }
        }
        const description = descParts.join(' | ');
        
        const geomType = feature.geometry.type;
        const coords = feature.geometry.coordinates;

        // Common extraction for properties to attr1 and attr2
        const keys = Object.keys(props);
        let attr1 = keys.length > 0 ? \`\${keys[0]}: \${props[keys[0]]}\` : '';
        let attr2 = keys.length > 1 ? \`\${keys[1]}: \${props[keys[1]]}\` : '';
        
        if (geomType === 'Point') {
            points.push({
                id: String(id),
                x: coords[0],
                y: coords[1],
                type: 'Point',
                layer: sourceName,
                description,
                attributes: props,
                attr1,
                attr2
            });
        } else if (geomType === 'LineString') {
            if (!Array.isArray(coords) || coords.length === 0) continue;
            points.push({
                id: String(id),
                x: coords[0][0], // use first point as representative
                y: coords[0][1],
                type: 'LineString',
                layer: sourceName,
                description,
                attributes: props,
                attr1,
                attr2,
                path: coords.map((c: any) => ({ x: c[0], y: c[1] }))
            });
        } else if (geomType === 'MultiLineString') {
            for (let i = 0; i < coords.length; i++) {
                const line = coords[i];
                if (!Array.isArray(line) || line.length === 0) continue;
                points.push({
                    id: String(id) + (coords.length > 1 ? \`_\${i+1}\` : ''),
                    x: line[0][0],
                    y: line[0][1],
                    type: 'LineString',
                    layer: sourceName,
                    description,
                    attributes: props,
                    attr1,
                    attr2,
                    path: line.map((c: any) => ({ x: c[0], y: c[1] }))
                });
            }
        } else if (geomType === 'Polygon') {
            if (!Array.isArray(coords) || coords.length === 0) continue;
            const ring = coords[0]; // exterior ring
            if (!Array.isArray(ring) || ring.length === 0) continue;
            points.push({
                id: String(id),
                x: ring[0][0],
                y: ring[0][1],
                type: 'Polygon',
                layer: sourceName,
                description,
                attributes: props,
                attr1,
                attr2,
                path: ring.map((c: any) => ({ x: c[0], y: c[1] }))
            });
        } else if (geomType === 'MultiPolygon') {
            for (let i = 0; i < coords.length; i++) {
                const poly = coords[i];
                if (!Array.isArray(poly) || poly.length === 0) continue;
                const ring = poly[0];
                if (!Array.isArray(ring) || ring.length === 0) continue;
                points.push({
                    id: String(id) + (coords.length > 1 ? \`_\${i+1}\` : ''),
                    x: ring[0][0],
                    y: ring[0][1],
                    type: 'Polygon',
                    layer: sourceName,
                    description,
                    attributes: props,
                    attr1,
                    attr2,
                    path: ring.map((c: any) => ({ x: c[0], y: c[1] }))
                });
            }
        }
    }
    
    return points;
};
`;

if (!code.includes('export const geoJsonToGeoPoints')) {
    const insertHelperIndex = code.indexOf('export const parseKMZ');
    code = code.substring(0, insertHelperIndex) + helper + '\n' + code.substring(insertHelperIndex);
}

// 3. Replace parseKMZ entirely
const oldStart = code.indexOf('export const parseKMZ = async');
// find the end of parseKMZ which is right before extractPointsFromDXF
const oldEnd = code.indexOf('export const extractPointsFromDXF');

const newParseKMZ = `
export const parseKMZ = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  try {
    if (onProgress) onProgress(10);
    const fileName = file.name.toLowerCase();
    
    // --- 1. SHAPEFILE (.shp or .zip containing .shp) ---
    if (fileName.endsWith('.shp')) {
        const arrayBuffer = await file.arrayBuffer();
        const geojson = await shp(arrayBuffer);
        let points: GeoPoint[] = [];
        if (Array.isArray(geojson)) {
            geojson.forEach((gc) => {
                points = points.concat(geoJsonToGeoPoints(gc, gc.fileName || 'Shapefile'));
            });
        } else {
            points = geoJsonToGeoPoints(geojson, fileName.replace('.shp', ''));
        }
        if (onProgress) onProgress(100);
        return { filename: file.name, type: 'shp', data: points, preview: [] };
    }
    
    // --- 2. GEODATABASE (.gdb or .zip containing .gdb) ---
    if (fileName.endsWith('.gdb')) {
         // Some browsers might allow uploading .gdb folders as files, but usually it's a zip.
         // Let's assume they zipped the .gdb.
         // Fallthrough to zip handler.
    }
    
    // --- 3. KML ---
    if (fileName.endsWith('.kml')) {
        const kmlContent = await file.text();
        if (onProgress) onProgress(60);
        const points = await parseKMLContentAsync(kmlContent, onProgress);
        if (onProgress) onProgress(100);
        return { filename: file.name, type: 'kml', data: points, preview: [] };
    }
    
    // --- 4. ZIP (can be KMZ, SHP, GDB) ---
    if (fileName.endsWith('.zip') || fileName.endsWith('.kmz') || fileName.endsWith('.gdb')) {
        const arrayBuffer = await file.arrayBuffer();
        
        // First try to peek inside the zip without fully parsing it to see what we have
        const zip = await JSZip.loadAsync(arrayBuffer);
        const filesList = Object.keys(zip.files);
        
        const hasGDB = filesList.some(name => name.toLowerCase().includes('.gdb/') || name.toLowerCase().endsWith('.gdbtable'));
        const hasSHP = filesList.some(name => name.toLowerCase().endsWith('.shp'));
        const hasKML = filesList.some(name => name.toLowerCase().endsWith('.kml'));
        
        if (hasGDB) {
            if (onProgress) onProgress(30);
            try {
                // fgdb requires an arraybuffer
                const gdbResult = await fgdb(arrayBuffer);
                let points: GeoPoint[] = [];
                for (const [layerName, geojson] of Object.entries(gdbResult)) {
                     points = points.concat(geoJsonToGeoPoints(geojson, layerName));
                }
                if (onProgress) onProgress(100);
                return { filename: file.name, type: 'gdb', data: points, preview: [] };
            } catch (err) {
                console.error("GDB Parsing Error:", err);
                throw new Error("Failed to parse Geodatabase. Make sure the ZIP contains a valid .gdb folder.");
            }
        }
        
        if (hasSHP) {
            if (onProgress) onProgress(30);
            try {
                const geojson = await shp(arrayBuffer);
                let points: GeoPoint[] = [];
                if (Array.isArray(geojson)) {
                    geojson.forEach((gc) => {
                        points = points.concat(geoJsonToGeoPoints(gc, gc.fileName || 'Shapefile'));
                    });
                } else {
                    points = geoJsonToGeoPoints(geojson, 'Shapefile');
                }
                if (onProgress) onProgress(100);
                return { filename: file.name, type: 'shp', data: points, preview: [] };
            } catch (err) {
                console.error("Shapefile Parsing Error:", err);
                throw new Error("Failed to parse Shapefile. Make sure the ZIP contains .shp, .shx, and .dbf files.");
            }
        }
        
        if (hasKML) {
            const kmlFilename = filesList.find(name => name.toLowerCase().endsWith('.kml'));
            if (!kmlFilename) throw new Error("Invalid KMZ: No .kml file found inside.");
            let kmlContent = await zip.file(kmlFilename)?.async("string") || "";
            
            // Extract images and replace in KML
            const imageFiles = filesList.filter(name => /\\.(png|jpg|jpeg|gif|svg)$/i.test(name));
            for (const imgName of imageFiles) {
                const base64 = await zip.file(imgName)?.async("base64");
                if (base64) {
                    const ext = imgName.split('.').pop()?.toLowerCase();
                    const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : \`image/\${ext}\`;
                    const dataURI = \`data:\${mimeType};base64,\${base64}\`;
                    const safeName = imgName.split('/').pop()?.replace(/[.*+?^$!()|[\\]\\\\]/g, '\\\\$&');
                    if (safeName) {
                        kmlContent = kmlContent.replace(new RegExp(\`<href>[^<]*?\${safeName}<\\/href>\`, 'gi'), \`<href>\${dataURI}</href>\`);
                        kmlContent = kmlContent.replace(new RegExp(\`src=['"][^'"]*?\${safeName}['"]\`, 'gi'), \`src="\${dataURI}"\`);
                    }
                }
            }
            if (onProgress) onProgress(60);
            const points = await parseKMLContentAsync(kmlContent, onProgress);
            if (onProgress) onProgress(100);
            return { filename: file.name, type: 'kmz', data: points, preview: [] };
        }
        
        throw new Error("Invalid ZIP file: No recognizable GDB, Shapefile, or KML content found.");
    }

    throw new Error("Unsupported file format.");
  } catch (err) { 
    throw err; 
  }
};
\n`;

code = code.substring(0, oldStart) + newParseKMZ + code.substring(oldEnd);

fs.writeFileSync('services/parserService.ts', code);
console.log('Successfully patched parseKMZ');
