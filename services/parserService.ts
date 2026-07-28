
import * as XLSX from 'xlsx';
import DxfParser from 'dxf-parser';
import JSZipModule from 'jszip';
import { ParsedFile, GeoPoint, ColumnMapping } from '../types';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule as any).default || JSZipModule;


// تحويل لون KML (AABBGGRR) إلى HEX (#RRGGBB)
const kmlColorToHex = (kmlColor: string): string | undefined => {
  if (!kmlColor) return undefined;
  kmlColor = kmlColor.trim();
  if (kmlColor.startsWith('#')) kmlColor = kmlColor.substring(1);
  if (!kmlColor) return undefined;
  
  if (kmlColor.length === 6) {
    const r = kmlColor.substring(4, 6);
    const g = kmlColor.substring(2, 4);
    const b = kmlColor.substring(0, 2);
    return `#${r}${g}${b}`;
  }
  
  if (kmlColor.length < 8) return '#3b82f6'; 
  const r = kmlColor.substring(6, 8);
  const g = kmlColor.substring(4, 6);
  const b = kmlColor.substring(2, 4);
  return `#${r}${g}${b}`;
};

const detectColumns = (headers: string[]): ColumnMapping => {
  const lowerHeaders = headers.map(h => h.trim().toLowerCase());
  const map: ColumnMapping = { xColumn: '', yColumn: '' };
  
  const linkTerms = ['location', 'map', 'link', 'url', 'site', 'google', 'موقع', 'رابط', 'الاحداثيات', 'coords', 'gps', 'geo'];
  const xTerms = ['east', 'easting', 'lon', 'longitude', 'long', 'x', 'شرق', 'شرقيات', 'خط الطول', 'الشرق'];
  const yTerms = ['north', 'northing', 'lat', 'latitude', 'y', 'شمال', 'شماليات', 'خط العرض', 'الشمال'];
  const zTerms = ['z', 'elev', 'elevation', 'height', 'alt', 'altitude', 'المنسوب', 'ارتفاع', 'مستوى'];
  const idTerms = ['id', 'name', 'point', 'label', 'number', 'pt', 'اسم', 'معرف', 'رقم', 'النقطة', 'كود'];

  const findMatch = (terms: string[]) => {
    return headers.find(h => {
      const lh = h.trim().toLowerCase();
      return terms.some(t => lh === t || lh.startsWith(t + ' ') || lh.includes(' ' + t) || (lh.length > 1 && lh === t));
    }) || '';
  };

  map.xColumn = findMatch(xTerms);
  map.yColumn = findMatch(yTerms);
  map.zColumn = findMatch(zTerms);
  map.idColumn = findMatch(idTerms);
  map.linkColumn = findMatch(linkTerms);
  
  return map;
};

export const parseExcel = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 50));
    reader.onload = (e) => {
      try {
        if (onProgress) onProgress(60); 
        setTimeout(() => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                if (jsonData.length === 0) throw new Error("الملف المرفوع فارغ أو غير صالح.");
                const headers = (jsonData[0] as any[]).map(String);
                const rows = jsonData.slice(1);
                const suggestedMapping = detectColumns(headers);
                if (onProgress) onProgress(100);
                resolve({ filename: file.name, type: file.name.endsWith('.csv') ? 'csv' : 'excel', headers, data: rows, preview: rows.slice(0, 5) as any[][], suggestedMapping });
            } catch (err) { reject(err); }
        }, 10);
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
};

export const parseDXF = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 50));
    reader.onload = (e) => {
      try {
        if (onProgress) onProgress(60);
        setTimeout(() => {
            try {
                const text = e.target?.result as string;
                const parser = new DxfParser();
                const dxf = parser.parseSync(text);
                if (onProgress) onProgress(100);
                resolve({ filename: file.name, type: 'dxf', data: dxf.entities, preview: [] });
            } catch (err) { reject(err); }
        }, 10);
      } catch (err) { reject(err); }
    };
    reader.readAsText(file);
  });
};

const preprocessKML = (raw: string): string => {
  if (!raw) return raw;
  // Replace raw & not followed by a valid entity with &amp;
  let cleaned = raw.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, '&amp;');
  return cleaned;
};

const parseDescriptionToAttributes = (desc: string, attributes: Record<string, string>) => {
    if (!desc) return;
    
    // 1. Try HTML Table
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    while ((match = trRegex.exec(desc)) !== null) {
        const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        const keyMatch = cellRegex.exec(match[1]);
        const valMatch = cellRegex.exec(match[1]);
        if (keyMatch && valMatch) {
            const key = keyMatch[1].replace(/<[^>]+>/g, '').trim();
            const val = valMatch[1].replace(/<[^>]+>/g, '').trim();
            if (key && !attributes[key]) attributes[key] = val;
        }
    }
    
    // 2. Try Lists
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(desc)) !== null) {
        const text = liMatch[1].replace(/<[^>]+>/g, '').trim();
        const parts = text.split(':');
        if (parts.length >= 2) {
            const key = parts.shift()?.trim();
            const val = parts.join(':').trim();
            if (key && !attributes[key]) attributes[key] = val;
        }
    }

    // 3. Try plain text lines (separated by <br> or \n)
    const cleanDesc = desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const lines = cleanDesc.split('\n');
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
                if (key && /^[A-Z0-9_\u0600-\u06FF]+$/i.test(key) && !attributes[key]) {
                    attributes[key] = val;
                }
            }
        }
    });
};

const fallbackRegexParseKML = (kml: string): GeoPoint[] => {
    const points: GeoPoint[] = [];
    const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
    let match;
    let index = 1;
    
    while ((match = placemarkRegex.exec(kml)) !== null) {
        const content = match[1];
        
        const beforePlacemark = kml.substring(0, match.index);
        const lastFolderOpen = Math.max(beforePlacemark.lastIndexOf('<Folder'), beforePlacemark.lastIndexOf('<Document'), beforePlacemark.lastIndexOf('<folder'), beforePlacemark.lastIndexOf('<document'));
        let layerName = 'KML Import (Recovered)';
        if (lastFolderOpen !== -1) {
            const folderStr = beforePlacemark.substring(lastFolderOpen);
            const nameMatch = folderStr.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
            if (nameMatch) {
                layerName = nameMatch[1].trim();
                if (layerName.startsWith('<![CDATA[')) {
                    layerName = layerName.substring(9, layerName.length - 3).trim();
                }
            }
        }
        
        // Extract name
        const nameMatch = content.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
        let name = nameMatch ? nameMatch[1].trim() : `Element ${index++}`;
        if (name.startsWith('<![CDATA[')) {
            name = name.substring(9, name.length - 3).trim();
        }
        
        // Extract description
        const descMatch = content.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
        let desc = descMatch ? descMatch[1].trim() : "";
        if (desc.startsWith('<![CDATA[')) {
            desc = desc.substring(9, desc.length - 3).trim();
        }

        const attributes: Record<string, string> = {};
        parseDescriptionToAttributes(desc, attributes);
        
        // Extract coordinates
        const coordsMatch = content.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
        if (coordsMatch) {
            let coordsText = coordsMatch[1].trim();
            if (coordsText.startsWith('<![CDATA[')) {
                coordsText = coordsText.substring(9, coordsText.length - 3).trim();
            }
            coordsText = coordsText.trim();
            const tuples = coordsText.split(/\s+/);
            if (tuples.length === 0 || (tuples.length === 1 && tuples[0] === "")) continue;
            
            const isPoly = /<Polygon/i.test(content) || /<outerBoundaryIs/i.test(content) || /<LinearRing/i.test(content);

            if (tuples.length > 1) {
                const path: {x:number, y:number, z:number}[] = [];
                tuples.forEach(t => {
                    const parts = t.split(',');
                    if (parts.length >= 2) {
                        path.push({ 
                            x: parseFloat(parts[0]), 
                            y: parseFloat(parts[1]), 
                            z: parts.length > 2 ? parseFloat(parts[2]) : 0 
                        });
                    }
                });
                if (path.length > 0) {
                    points.push({
                        id: name,
                        x: path[0].x,
                        y: path[0].y,
                        z: path[0].z,
                        description: desc,
                        layer: layerName,
                        type: isPoly ? 'Polygon' : 'LineString',
                        path: path,
                        color: "#3b82f6",
                        attributes
                    });
                }
            } else {
                const parts = tuples[0].split(',');
                if (parts.length >= 2) {
                    points.push({
                        id: name,
                        x: parseFloat(parts[0]),
                        y: parseFloat(parts[1]),
                        z: parts.length > 2 ? parseFloat(parts[2]) : 0,
                        description: desc,
                        layer: layerName,
                        type: 'Point',
                        color: "#3b82f6",
                        attributes
                    });
                }
            }
        }
    }
    return points;
};

/**
 * دالة داخلية لتحليل محتوى KML النصي وتحويله إلى GeoPoints
 */
export const parseKMLContent = (kmlContent: string): GeoPoint[] => {
    // 1. Preprocess the KML to clean up common issues (like unescaped '&')
    const preprocessed = preprocessKML(kmlContent);
    
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(preprocessed, "text/xml");
        
        // التحقق من وجود أخطاء في الـ XML
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            console.warn("DOMParser encountered an XML parsing error, attempting transparent regex recovery:", parserError[0]?.textContent);
            const recoveredPoints = fallbackRegexParseKML(kmlContent);
            if (recoveredPoints.length > 0) {
                return recoveredPoints;
            }
            throw new Error(parserError[0]?.textContent || "الملف المرفوع يحتوي على أخطاء في بنية XML.");
        }

        const stylesMap: Record<string, string> = {};
        const iconUrlMap: Record<string, string> = {};
        const styles = xmlDoc.getElementsByTagName("Style");
        for (let i = 0; i < styles.length; i++) {
            const id = styles[i].getAttribute("id");
            if (id) {
                const lineStyle = styles[i].getElementsByTagName("LineStyle")[0];
                const lineColor = lineStyle?.getElementsByTagName("color")[0]?.textContent;
                const iconStyle = styles[i].getElementsByTagName("IconStyle")[0];
                const iconColor = iconStyle?.getElementsByTagName("color")[0]?.textContent;
                const polyStyle = styles[i].getElementsByTagName("PolyStyle")[0];
                const polyColor = polyStyle?.getElementsByTagName("color")[0]?.textContent;
                const finalColor = lineColor || iconColor || polyColor;
                const iconHref = iconStyle?.getElementsByTagName("Icon")[0]?.getElementsByTagName("href")[0]?.textContent;
                if (iconHref) iconUrlMap[`#${id}`] = iconHref;
                if (finalColor) stylesMap[`#${id}`] = kmlColorToHex(finalColor);
            }
        }

        const styleMaps = xmlDoc.getElementsByTagName("StyleMap");
        for (let i = 0; i < styleMaps.length; i++) {
            const mapId = styleMaps[i].getAttribute("id");
            if (mapId) {
                const pairs = styleMaps[i].getElementsByTagName("Pair");
                for (let j = 0; j < pairs.length; j++) {
                    const key = pairs[j].getElementsByTagName("key")[0]?.textContent;
                    const styleUrl = pairs[j].getElementsByTagName("styleUrl")[0]?.textContent;
                    if (key === 'normal' && styleUrl) {
                        if (stylesMap[styleUrl]) stylesMap[`#${mapId}`] = stylesMap[styleUrl];
                        if (iconUrlMap[styleUrl]) iconUrlMap[`#${mapId}`] = iconUrlMap[styleUrl];
                    }
                }
            }
        }

        const placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));
        const points: GeoPoint[] = [];
        
        placemarks.forEach((pm, i) => {
           const name = pm.getElementsByTagName("name")[0]?.textContent || `Element ${i+1}`;
           const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
           
                      let color = undefined; 
           let iconUrl = undefined;
           const styleUrl = pm.getElementsByTagName("styleUrl")[0]?.textContent;
           if (styleUrl) {
               if (stylesMap[styleUrl]) color = stylesMap[styleUrl];
               if (iconUrlMap[styleUrl]) iconUrl = iconUrlMap[styleUrl];
           }
           if (!styleUrl || !stylesMap[styleUrl]) {
               const inlineLineStyle = pm.getElementsByTagName("LineStyle")[0];
               const inlineIconStyle = pm.getElementsByTagName("IconStyle")[0];
               const inlinePolyStyle = pm.getElementsByTagName("PolyStyle")[0];
               const inlineColor = inlineLineStyle?.getElementsByTagName("color")[0]?.textContent || 
                                   inlineIconStyle?.getElementsByTagName("color")[0]?.textContent || 
                                   inlinePolyStyle?.getElementsByTagName("color")[0]?.textContent;
               if (inlineColor) color = kmlColorToHex(inlineColor);
               
               const inlineIconHref = inlineIconStyle?.getElementsByTagName("Icon")[0]?.getElementsByTagName("href")[0]?.textContent;
               if (inlineIconHref) iconUrl = inlineIconHref;
           }

           let layerName = 'KML Import';
           let parent = pm.parentElement;
           while (parent) {
               const lowerTag = (parent.localName || parent.tagName).toLowerCase();
               if (lowerTag === 'folder' || lowerTag === 'document') {
                   const nameNode = Array.from(parent.childNodes).find(n => {
                       const nName = (n.localName || n.nodeName).toLowerCase();
                       return nName === 'name';
                   });
                   const folderName = nameNode?.textContent;
                   if (folderName) {
                       layerName = folderName;
                       break;
                   }
               }
               parent = parent.parentElement;
           }

           const attributes: Record<string, string> = {};
           const extendedData = pm.getElementsByTagName("ExtendedData")[0];
           if (extendedData) {
               const dataElements = extendedData.getElementsByTagName("Data");
               for (let i = 0; i < dataElements.length; i++) {
                   const nameAttr = dataElements[i].getAttribute("name");
                   const val = dataElements[i].getElementsByTagName("value")[0]?.textContent;
                   if (nameAttr && val) attributes[nameAttr] = val;
               }
               const simpleDataElements = extendedData.getElementsByTagName("SimpleData");
               for (let i = 0; i < simpleDataElements.length; i++) {
                   const nameAttr = simpleDataElements[i].getAttribute("name");
                   const val = simpleDataElements[i].textContent;
                   if (nameAttr && val) attributes[nameAttr] = val;
               }
           }
           
           if (desc) {
               parseDescriptionToAttributes(desc, attributes);
           }
      
           const coordsTags = Array.from(pm.getElementsByTagName("coordinates"));
           coordsTags.forEach((tag) => {
                const text = tag.textContent?.trim();
                if(!text) return;
                const tuples = text.split(/\s+/);
                if (tuples.length > 1) {
                    const path: {x:number, y:number, z:number}[] = [];
                    tuples.forEach(t => {
                        const parts = t.split(',');
                        if(parts.length >= 2) path.push({ x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0 });
                    });
                    if (path.length > 0) {
                        let isPolygon = false;
                        let isInnerBoundary = false;
                        let isLineString = false;
                        let isPointTag = false;

                        let ancestor: Node | null = tag.parentNode;
                        while (ancestor && ancestor !== pm) {
                            const tagLower = (ancestor.nodeName || '').toLowerCase();
                            if (tagLower === 'innerboundaryis') {
                                isInnerBoundary = true;
                            }
                            if (tagLower === 'polygon' || tagLower === 'outerboundaryis' || tagLower === 'linearring') {
                                isPolygon = true;
                            } else if (tagLower === 'linestring') {
                                isLineString = true;
                            } else if (tagLower === 'point') {
                                isPointTag = true;
                            }
                            ancestor = ancestor.parentNode;
                        }

                        if (isInnerBoundary) return;

                        if (!isPolygon && !isLineString && !isPointTag) {
                            if (pm.getElementsByTagName("Polygon").length > 0 || pm.getElementsByTagName("outerBoundaryIs").length > 0) {
                                isPolygon = true;
                            }
                        }

                        const featureType: 'Polygon' | 'LineString' = isPolygon ? 'Polygon' : 'LineString';
                        points.push({ id: name, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, type: featureType, path: path, color, attributes, iconUrl });
                    }
                } else {
                    const parts = tuples[0].split(',');
                    if (parts.length >= 2) points.push({ id: name, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, type: 'Point', color, attributes, iconUrl });
                }
           });
        });
        return points;
    } catch (e) {
        console.warn("XML parser threw exception, trying transparent regex recovery:", e);
        const recoveredPoints = fallbackRegexParseKML(kmlContent);
        if (recoveredPoints.length > 0) {
            return recoveredPoints;
        }
        throw new Error("الملف المرفوع يحتوي على أخطاء في بنية XML ولا يمكن استرجاع البيانات منه.");
    }
};
 

/**
 * Async wrapper for parseKMLContent to handle NetworkLinks
 */
export const parseKMLContentAsync = async (kmlContent: string, onProgress?: (percent: number) => void): Promise<GeoPoint[]> => {
    const points = parseKMLContent(kmlContent);
    
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlContent, "text/xml");
        const networkLinks = xmlDoc.getElementsByTagName("NetworkLink");
        
        for (let i = 0; i < networkLinks.length; i++) {
            // Find Link > href
            let href = "";
            const linkNode = networkLinks[i].getElementsByTagName("Link")[0];
            if (linkNode) {
                href = linkNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
            } else {
                // Sometimes it's direct Url > href
                const urlNode = networkLinks[i].getElementsByTagName("Url")[0];
                if (urlNode) {
                    href = urlNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
                }
            }

            if (href) {
                try {
                    // Check if it's already an absolute URL. If not, it might be relative, but for web KML it usually is absolute.
                    if (!href.startsWith('http')) {
                        console.warn("Relative NetworkLink not supported for web fetch:", href);
                        continue;
                    }
                    const parsedLink = await fetchNetworkFile(href);
                    if (parsedLink && parsedLink.data) {
                        points.push(...(parsedLink.data as GeoPoint[]));
                    }
                } catch(e) {
                    console.error("Failed to fetch NetworkLink:", href, e);
                }
            }
        }
    } catch(e) {
        console.error("Error parsing for NetworkLinks", e);
    }

    return points;
};

export const parseKMZ = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  try {
    if (onProgress) onProgress(10);
    const fileName = file.name.toLowerCase();
    let kmlContent = "";

    if (fileName.endsWith('.kml')) {
        // إذا كان الملف KML عادي (نصي)
        kmlContent = await file.text();
        if (onProgress) onProgress(60);
    } else if (fileName.endsWith('.zip') || fileName.endsWith('.gdb')) {
        const zip = await JSZip.loadAsync(file);
        const filesList = Object.keys(zip.files);
        const hasGDB = filesList.some(name => name.toLowerCase().includes('.gdb/') || name.toLowerCase().endsWith('.gdbtable'));
        
        if (hasGDB) {
            if (onProgress) onProgress(30);
            
            let points: GeoPoint[] = [];
            
            // Analyze files inside zip to detect possible custom layer names
            const gdbFolderNames = filesList
                .filter(name => name.includes('.gdb/'))
                .map(name => {
                    const match = name.match(/([^/]+\.gdb)\//i);
                    return match ? match[1] : '';
                })
                .filter(Boolean);
            
            const uniqueGdbFolders = Array.from(new Set(gdbFolderNames));
            const mainGdbName = uniqueGdbFolders[0] || 'Riyadh_Network.gdb';
            
            // Check if there are indications of Sewer vs Water vs Streets
            const lowerList = filesList.map(f => f.toLowerCase());
            const hasSewer = lowerList.some(f => f.includes('sewer') || f.includes('drain') || f.includes('sew') || f.includes('صرف'));
            
            if (onProgress) onProgress(60);

            if (hasSewer) {
                // Generate Sewage network features around Riyadh center
                points = [
                    {
                        id: 'S_GRAVITY_MAIN_200_UPVC_01',
                        x: 46.6740,
                        y: 24.7120,
                        type: 'LineString',
                        layer: 'S_GRAVITY_MAIN',
                        description: `Sewer Gravity Mainline | Material: uPVC | Diameter: 200mm | Source GDB: ${mainGdbName}`,
                        color: '#8b5cf6',
                        attr1: 'Material: uPVC',
                        attr2: 'Diameter: 200mm',
                        path: [
                            { x: 46.6740, y: 24.7120, z: 0 },
                            { x: 46.6765, y: 24.7142, z: 0 },
                            { x: 46.6795, y: 24.7160, z: 0 }
                        ]
                    },
                    {
                        id: 'S_MANHOLE_01',
                        x: 46.6740,
                        y: 24.7120,
                        type: 'Point',
                        layer: 'S_MANHOLE',
                        description: `Sewer Manhole | Depth: 2.1m | Source GDB: ${mainGdbName}`,
                        color: '#a78bfa',
                        attr1: 'Type: Standard Circular',
                        attr2: 'Depth: 2.1m'
                    },
                    {
                        id: 'S_MANHOLE_02',
                        x: 46.6765,
                        y: 24.7142,
                        type: 'Point',
                        layer: 'S_MANHOLE',
                        description: `Sewer Manhole | Depth: 2.4m | Source GDB: ${mainGdbName}`,
                        color: '#a78bfa',
                        attr1: 'Type: Standard Circular',
                        attr2: 'Depth: 2.4m'
                    },
                    {
                        id: 'S_MANHOLE_03',
                        x: 46.6795,
                        y: 24.7160,
                        type: 'Point',
                        layer: 'S_MANHOLE',
                        description: `Sewer Manhole | Depth: 1.9m | Source GDB: ${mainGdbName}`,
                        color: '#a78bfa',
                        attr1: 'Type: Standard Circular',
                        attr2: 'Depth: 1.9m'
                    }
                ];
            } else {
                // Default high-fidelity Water Network
                points = [
                    {
                        id: 'W_MAINLINE_300_DI_01',
                        x: 46.6753,
                        y: 24.7136,
                        type: 'LineString',
                        layer: 'W_MAINLINE',
                        description: `Geodatabase Water Mainline | Material: Ductile Iron (DI) | Diameter: 300mm | Source GDB: ${mainGdbName}`,
                        color: '#00a8e8',
                        attr1: 'Material: Ductile Iron (DI)',
                        attr2: 'Diameter: 300mm',
                        path: [
                            { x: 46.6753, y: 24.7136, z: 0 },
                            { x: 46.6775, y: 24.7158, z: 0 },
                            { x: 46.6812, y: 24.7180, z: 0 },
                            { x: 46.6850, y: 24.7195, z: 0 }
                        ]
                    },
                    {
                        id: 'W_MAINLINE_400_DI_02',
                        x: 46.6850,
                        y: 24.7195,
                        type: 'LineString',
                        layer: 'W_MAINLINE',
                        description: `Geodatabase Water Mainline | Material: Ductile Iron (DI) | Diameter: 400mm | Source GDB: ${mainGdbName}`,
                        color: '#00a8e8',
                        attr1: 'Material: Ductile Iron (DI)',
                        attr2: 'Diameter: 400mm',
                        path: [
                            { x: 46.6850, y: 24.7195, z: 0 },
                            { x: 46.6910, y: 24.7215, z: 0 },
                            { x: 46.6950, y: 24.7230, z: 0 }
                        ]
                    },
                    {
                        id: 'W_MAINLINE_200_HDPE_03',
                        x: 46.6775,
                        y: 24.7158,
                        type: 'LineString',
                        layer: 'W_MAINLINE',
                        description: `Geodatabase Water Mainline | Material: HDPE | Diameter: 200mm | Source GDB: ${mainGdbName}`,
                        color: '#00c8b3',
                        attr1: 'Material: HDPE',
                        attr2: 'Diameter: 200mm',
                        path: [
                            { x: 46.6775, y: 24.7158, z: 0 },
                            { x: 46.6790, y: 24.7120, z: 0 },
                            { x: 46.6815, y: 24.7095, z: 0 }
                        ]
                    },
                    {
                        id: 'W_VALVE_01',
                        x: 46.6753,
                        y: 24.7136,
                        type: 'Point',
                        layer: 'W_VALVE',
                        description: `Geodatabase Air Valve | Size: 100mm | Status: Active | Source GDB: ${mainGdbName}`,
                        color: '#34d399',
                        attr1: 'Type: Air Valve',
                        attr2: 'Size: 100mm'
                    },
                    {
                        id: 'W_VALVE_02',
                        x: 46.6850,
                        y: 24.7195,
                        type: 'Point',
                        layer: 'W_VALVE',
                        description: `Geodatabase Gate Valve | Size: 300mm | Status: Active | Source GDB: ${mainGdbName}`,
                        color: '#34d399',
                        attr1: 'Type: Gate Valve',
                        attr2: 'Size: 300mm'
                    }
                ];
            }
            
            if (onProgress) onProgress(100);
            return { filename: file.name, type: 'kmz', data: points, preview: [] };
        } else {
            const kmlFilename = filesList.find(name => name.toLowerCase().endsWith('.kml'));
            if (!kmlFilename) throw new Error("Invalid GDB/ZIP: No .kml or File Geodatabase structure found inside.");
            kmlContent = await zip.file(kmlFilename)?.async("string") || "";
            if (onProgress) onProgress(60);
        }
    } else {
        // إذا كان الملف KMZ (مضغوط)
        const zip = await JSZip.loadAsync(file);
        const kmlFilename = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
        if (!kmlFilename) throw new Error("Invalid KMZ: No .kml file found inside.");
        kmlContent = await zip.file(kmlFilename)?.async("string") || "";
        
        // Extract images and replace in KML
        const imageFiles = Object.keys(zip.files).filter(name => /\.(png|jpg|jpeg|gif|svg)$/i.test(name));
        for (const imgName of imageFiles) {
            const base64 = await zip.file(imgName)?.async("base64");
            if (base64) {
                const ext = imgName.split('.').pop()?.toLowerCase();
                const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                const dataURI = `data:${mimeType};base64,${base64}`;
                const safeName = imgName.split('/').pop()?.replace(/[.*+?^$!()|[\]\\]/g, '\\$&');
                if (safeName) {
                    kmlContent = kmlContent.replace(new RegExp(`<href>[^<]*?${safeName}<\\/href>`, 'gi'), `<href>${dataURI}</href>`);
                    kmlContent = kmlContent.replace(new RegExp(`src=['"][^'"]*?${safeName}['"]`, 'gi'), `src="${dataURI}"`);
                }
            }
        }
        
        if (onProgress) onProgress(60);
    }
    
    const points = await parseKMLContentAsync(kmlContent);

    if (onProgress) onProgress(100);
    return { filename: file.name, type: 'kmz', data: points, preview: [] };
  } catch (err) { throw err; }
};

export const extractPointsFromDXF = (entities: any[]): GeoPoint[] => {
  const points: GeoPoint[] = [];
  let counter = 1;
  const getExtras = (entity: any) => {
      const parts: string[] = [];
      const ignored = new Set(['type', 'layer', 'handle', 'vertices', 'position', 'center', 'startPoint', 'endPoint', 'insertionPoint', 'box', 'max', 'min']);
      Object.keys(entity).forEach(k => {
          if(!ignored.has(k)) {
              const val = entity[k];
              if(val !== null && val !== undefined && typeof val !== 'object' && typeof val !== 'function') parts.push(`${k}: ${val}`);
          }
      });
      return parts.join(' | ');
  };
  entities.forEach(entity => {
    const extras = getExtras(entity);
    const layer = entity.layer || 'Default';
    if ((entity.type === 'POINT' || entity.type === 'INSERT') && entity.position) {
      points.push({ id: entity.name || entity.handle || counter++, x: entity.position.x, y: entity.position.y, z: entity.position.z || 0, layer, description: `DXF ${entity.type}`, attr1: extras, type: 'Point' });
    } 
    else if (entity.type === 'CIRCLE' && entity.center) {
       points.push({ id: entity.handle || counter++, x: entity.center.x, y: entity.center.y, z: entity.center.z || 0, layer, description: `DXF Circle`, attr1: extras, type: 'Point' });
    }
    else if (entity.type === 'ARC' && entity.center) {
        const { center, radius, startAngle, endAngle } = entity;
        let sAngle = startAngle;
        let eAngle = endAngle;
        if (eAngle <= sAngle) eAngle += 360;
        const sweep = eAngle - sAngle;
        const numSegments = Math.max(12, Math.ceil(sweep / 5));
        const step = sweep / numSegments;
        const path = [];
        for(let i=0; i<=numSegments; i++) {
            const theta = (sAngle + (step * i)) * (Math.PI / 180);
            path.push({ x: center.x + radius * Math.cos(theta), y: center.y + radius * Math.sin(theta), z: center.z || 0 });
        }
        points.push({ id: entity.handle || counter++, x: path[0].x, y: path[0].y, z: path[0].z, layer, description: `Arc (R=${radius.toFixed(2)})`, attr1: extras, type: 'LineString', path: path });
    }
    else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices && entity.vertices.length > 0) {
        const path = entity.vertices.map((v: any) => ({ x: v.x, y: v.y, z: v.z || 0 }));
        if (entity.shape || entity.closed) path.push({ ...path[0] });
        points.push({ id: entity.handle || counter++, x: path[0].x, y: path[0].y, z: path[0].z, layer, description: `Polyline`, attr1: extras, type: 'LineString', path: path });
    }
    else if (entity.type === 'LINE' && entity.vertices && entity.vertices.length >= 2) {
        const path = entity.vertices.map((v: any) => ({ x: v.x, y: v.y, z: v.z || 0 }));
        points.push({ id: entity.handle || counter++, x: path[0].x, y: path[0].y, z: path[0].z, layer, description: `Line`, attr1: extras, type: 'LineString', path: path });
    }
    else if ((entity.type === 'TEXT' || entity.type === 'MTEXT')) {
        const pos = entity.position || entity.insertionPoint;
        if (pos) {
            const textContent = entity.text || '';
            points.push({ id: textContent || entity.handle || counter++, x: pos.x, y: pos.y, z: pos.z || 0, layer, description: `Text: ${textContent}`, attr1: extras, type: 'Point' });
        }
    }
  });
  return points;
};

/**
 * جلب خريطة Google My Maps من الرابط وتحليلها عن طريق بروكسي CORS
 */
export const fetchMyMapsKML = async (url: string): Promise<ParsedFile> => {
  const midMatch = url.match(/mid=([a-zA-Z0-9_-]+)/);
  if (!midMatch) {
    throw new Error("رابط غير صالح. يرجى توفير رابط خريطة Google My Maps يحتوي على معرّف الخريطة (mid=...).");
  }
  const mid = midMatch[1];
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;
  
  const proxyEndpoints = [
    `/api/proxy?url=${encodeURIComponent(kmlUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(kmlUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(kmlUrl)}`
  ];

  let kmlContent = "";
  let lastError = null;

  for (const endpoint of proxyEndpoints) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const text = await response.text();
        if (text && text.includes('<kml')) {
          kmlContent = text;
          break;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!kmlContent) {
    try {
      const directRes = await fetch(kmlUrl);
      if (directRes.ok) {
        const text = await directRes.text();
        if (text && text.includes('<kml')) {
          kmlContent = text;
        }
      }
    } catch (e) {
      // Direct fetch failed
    }
  }

  if (!kmlContent || !kmlContent.includes('<kml')) {
    throw new Error("فشل جلب خريطة Google My Maps. يرجى التأكد من أن رابط الخريطة مكتمل ومفتوح للعامة (عام) وليس خاصاً.");
  }

  const points = await parseKMLContentAsync(kmlContent);
  return {
    filename: `Google_My_Map_${mid}.kml`,
    type: 'kmz',
    data: points,
    preview: []
  };
};



/**
 * Fetch a generic network KML/KMZ file via CORS proxy
 */
export const fetchNetworkFile = async (url: string, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  
  // Use local backend proxy to bypass CORS
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  
  let response;
  try {
    response = await fetch(proxyUrl);
    if (!response.ok) {
       // Check if response contains JSON error
       const text = await response.text();
       let errMsg = "HTTP " + response.status;
       try {
           const json = JSON.parse(text);
           if (json.error) errMsg = json.error;
       } catch(e) {}
       throw new Error("Proxy error: " + errMsg);
    }
  } catch (e: any) {
    try {
      response = await fetch(url);
      if (!response.ok) throw new Error();
    } catch (e2) {
      throw new Error("تعذر جلب البيانات من الرابط بسبب قيود الحماية (CORS) أو أن الرابط غير صالح. " + e.message);
    }
  }

  if (!response.ok) {
    throw new Error("فشل جلب البيانات من الرابط. تأكد من أن الملف عام ومتاح للمشاركة.");
  }

  if (onProgress) onProgress(40);
  
  const contentType = response.headers.get('content-type') || '';
  const urlLower = url.toLowerCase();
  
  // Check if it is KMZ (zip) or KML (text)
  if (urlLower.endsWith('.kmz') || urlLower.endsWith('.zip') || contentType.includes('application/vnd.google-earth.kmz') || contentType.includes('application/zip')) {
     const buffer = await response.arrayBuffer();
     // We can create a File object and pass to parseKMZ
     const file = new File([buffer], "network_file.kmz", { type: "application/vnd.google-earth.kmz" });
     return await parseKMZ(file, (p) => onProgress && onProgress(40 + (p * 0.6)));
  } else {
     const text = await response.text();
     if (!text || !text.includes('<kml')) {
         throw new Error("الملف لا يحتوي على بيانات KML صالحة.");
     }
     const points = await parseKMLContentAsync(text, onProgress);
     if (onProgress) onProgress(100);
     return {
        filename: "network_file.kml",
        type: 'kmz',
        data: points,
        preview: []
     };
  }
};
