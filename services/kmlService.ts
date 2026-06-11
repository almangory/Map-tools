
import JSZipModule from 'jszip';
import { GeoPoint, KmlExportOptions, SplitterMode } from '../types';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule as any).default || JSZipModule;


// --- HELPER: Escaping XML characters ---
const escapeXML = (str: string | number | undefined) => {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// --- HELPER: Geographic Distance (Haversine) ---
export const calculatePathLength = (path: {x: number, y: number}[]): number => {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += getDistanceMeters(path[i].y, path[i].x, path[i+1].y, path[i+1].x);
    }
    return total;
};

// --- HELPER: Create Placemark String ---
const createPlacemarkXML = (pt: GeoPoint, headers?: string[], selectedHeaders?: string[]) => {
    let descriptionHTML = '<div style="font-family:sans-serif; direction:rtl; text-align:right;">';
    
    // 1. الوصف الأساسي
    if (pt.description) {
        descriptionHTML += `<div style="font-weight:bold; color:#0e3f53; margin-bottom:10px;">${escapeXML(pt.description)}</div>`;
    }

    // 2. البيانات المعززة (الشارع والحي ورابط قوقل ماب)
    const lon = pt.x.toFixed(7);
    const lat = pt.y.toFixed(7);
    const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

    descriptionHTML += '<div style="background-color:#fff9eb; padding:8px; border-radius:5px; border:1px solid #dcb13c; margin-bottom:10px;">';
    descriptionHTML += `<div style="font-size:11px;"><b>الإحداثيات:</b> ${lat}, ${lon}</div>`;
    if (pt.street) descriptionHTML += `<div style="font-size:11px;"><b>الشارع:</b> ${escapeXML(pt.street)}</div>`;
    if (pt.district) descriptionHTML += `<div style="font-size:11px;"><b>الحي:</b> ${escapeXML(pt.district)}</div>`;
    descriptionHTML += `<div style="font-size:11px; margin-top:5px;"><a href="${googleMapsLink}" style="color:#3b82f6; text-decoration:none;">فتح في خرائط Google 📍</a></div>`;
    descriptionHTML += '</div>';

    // 3. جدول البيانات الأصلية الشامل
    if (pt.originalRow && headers && headers.length > 0) {
        descriptionHTML += '<div style="font-weight:bold; font-size:12px; margin-bottom:5px; border-bottom:1px solid #eee;">البيانات المصدر:</div>';
        descriptionHTML += '<table border="1" style="border-collapse:collapse; width:100%; font-size:11px; border:1px solid #ddd;">';
        headers.forEach((header, index) => {
            if (selectedHeaders && !selectedHeaders.includes(header)) {
                return;
            }
            const val = pt.originalRow![index];
            if (val !== undefined && val !== null && val !== '') {
                descriptionHTML += `
                    <tr>
                        <td style="padding:4px; background-color:#f9f9f9; font-weight:bold; width:35%;">${escapeXML(header)}</td>
                        <td style="padding:4px;">${escapeXML(val)}</td>
                    </tr>`;
            }
        });
        descriptionHTML += '</table>';
    } else if (pt.attr1) {
        // دعم لبيانات DXF الإضافية
        descriptionHTML += `<div style="font-size:11px; margin-top:5px;"><b>خصائص إضافية:</b> ${escapeXML(pt.attr1)}</div>`;
    }

    descriptionHTML += '</div>';
    
    let geometryXML = '';
    const colorHex = (pt.color || '#3b82f6').toUpperCase();
    const cleanHex = colorHex.startsWith('#') ? colorHex.substring(1) : colorHex;
    // KML color format is AABBGGRR (Alpha, Blue, Green, Red)
    // We assume incoming is RRGGBB
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    const kmlColor = `ff${b}${g}${r}`;

    if (pt.type === 'Polygon' && pt.path && pt.path.length > 0) {
        const coordsStr = pt.path.map(p => `${p.x},${p.y},${p.z || 0}`).join(' ');
        geometryXML = `
      <Style>
        <LineStyle><color>${kmlColor}</color><width>2</width></LineStyle>
        <PolyStyle><color>80${b}${g}${r}</color><fill>1</fill></PolyStyle>
      </Style>
      <Polygon>
        <tessellate>1</tessellate>
        <outerBoundaryIs><LinearRing><coordinates>${coordsStr}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>`;
    } else if (pt.type === 'LineString' && pt.path && pt.path.length > 0) {
        const coordsStr = pt.path.map(p => `${p.x},${p.y},${p.z || 0}`).join(' ');
        geometryXML = `
      <Style>
        <LineStyle><color>${kmlColor}</color><width>3</width></LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordsStr}</coordinates>
      </LineString>`;
    } else {
        geometryXML = `
      <Style>
        <IconStyle>
          <color>${kmlColor}</color>
          <scale>0.8</scale>
          <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
        </IconStyle>
      </Style>
      <Point><coordinates>${pt.x},${pt.y},${pt.z || 0}</coordinates></Point>`;
    }

    return `
    <Placemark>
      <name>${escapeXML(pt.id)}</name>
      <description><![CDATA[${descriptionHTML}]]></description>
      ${geometryXML}
    </Placemark>`;
};

// --- MAIN: Generate KML Chunks ---
export const generateKMLFolderContent = (points: GeoPoint[], headers?: string[], selectedHeaders?: string[]): string[] => {
    return points.map(p => createPlacemarkXML(p, headers, selectedHeaders));
};

export const generateKMLChunks = (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]): string[] => {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXML(docName)}</name>`;

  const footer = `
  </Document>
</kml>`;

  const chunks: string[] = [header];

  if (options.groupByAttribute || options.groupByColumn) {
      const groups: Record<string, { pts: GeoPoint[], totalLen: number }> = {};
      
      points.forEach(pt => {
          let key = 'Default';
          if (options.groupByColumn && pt.originalRow && headers) {
              const colIdx = headers.indexOf(options.groupByColumn);
              if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                  key = String(pt.originalRow[colIdx]).trim() || 'Default';
              } else {
                  key = 'غير مصنف (Unclassified)';
              }
          } else if (options.groupByAttribute === 'color') {
              const originalColor = (pt.color || '#3b82f6').toUpperCase();
              key = options.canonicalColorMap ? (options.canonicalColorMap[originalColor] || originalColor) : originalColor;
          } else if (options.groupByAttribute === 'layer') {
              key = pt.layer || 'Default';
          } else if (options.groupByAttribute === 'attr1') {
              key = pt.attr1 || 'Default';
          }

          if (!groups[key]) groups[key] = { pts: [], totalLen: 0 };
          groups[key].pts.push(pt);
          
          if (pt.type === 'LineString' && pt.path) groups[key].totalLen += calculatePathLength(pt.path);
          else if (pt.originalLength) groups[key].totalLen += pt.originalLength;
      });

      Object.entries(groups).forEach(([groupName, data]) => {
          const lenStr = data.totalLen > 0 ? ` (${(data.totalLen / 1000).toFixed(2)} km)` : '';
          chunks.push(`\n    <Folder>\n      <name>${escapeXML(groupName)}${lenStr}</name>\n      <open>0</open>\n`);
          // Push points in chunks so we don't blow up string limits
          for (const pt of data.pts) {
              chunks.push(createPlacemarkXML(pt, headers, selectedHeaders));
          }
          chunks.push(`\n    </Folder>`);
      });
  } else {
      for (const pt of points) {
          chunks.push(createPlacemarkXML(pt, headers, selectedHeaders));
      }
  }

  chunks.push(footer);
  return chunks;
};

export const generateKML = (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]): string => {
   return generateKMLChunks(points, docName, options, headers, selectedHeaders).join('');
};

// --- MAIN: Download KMZ Grouped as ZIP ---
export const downloadKMZGroupedZip = async (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]) => {
    try {
        const groups: Record<string, { pts: GeoPoint[], totalLen: number }> = {};
        
        points.forEach(pt => {
            let key = 'Default';
            if (options.groupByColumn && pt.originalRow && headers) {
                const colIdx = headers.indexOf(options.groupByColumn);
                if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                    key = String(pt.originalRow[colIdx]).trim() || 'Default';
                } else {
                    key = 'غير مصنف (Unclassified)';
                }
            } else if (options.groupByAttribute === 'color') {
                const originalColor = (pt.color || '#3b82f6').toUpperCase();
                key = options.canonicalColorMap ? (options.canonicalColorMap[originalColor] || originalColor) : originalColor;
            } else if (options.groupByAttribute === 'layer') {
                key = pt.layer || 'Default';
            } else if (options.groupByAttribute === 'attr1') {
                key = pt.attr1 || 'Default';
            } else {
                key = 'Default';
            }
            if (!groups[key]) groups[key] = { pts: [], totalLen: 0 };
            groups[key].pts.push(pt);
            if (pt.type === 'LineString' && pt.path) groups[key].totalLen += calculatePathLength(pt.path);
            else if (pt.originalLength) groups[key].totalLen += pt.originalLength;
        });

        const zip = new JSZip();
        
        for (const [groupName, data] of Object.entries(groups)) {
            // Generate individual KMZ containing doc.kml for that single group
            const kmlChunks = generateKMLChunks(data.pts, groupName, { mode: 'none' }, headers, selectedHeaders);
            const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
            const arrayBuffer = await kmlBlob.arrayBuffer();

            const subZip = new JSZip();
            subZip.file("doc.kml", arrayBuffer);
            const subKmzBlob = await subZip.generateAsync({ type: "blob", compression: "DEFLATE" });
            const subKmzBuffer = await subKmzBlob.arrayBuffer();

            const safeName = groupName.replace(/[\\/:*?"<>|]/g, "_") || "Default";
            zip.file(`${safeName}.kmz`, subKmzBuffer);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const cleanDocName = docName.replace(/\.[^/.]+$/, "");
        downloadBlob(zipBlob, `${cleanDocName}_Grouped_KMZs.zip`);
    } catch (e: any) {
        console.error("Error creating KMZ ZIP:", e);
        alert("خطأ أثناء إنشاء المجلد المضغوط (Error creating ZIP): " + e.message);
    }
};

// --- MAIN: Download KMZ ---
export const downloadKMZ = async (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]) => {
    try {
        const kmlChunks = generateKMLChunks(points, docName, options, headers, selectedHeaders);
        const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
        const arrayBuffer = await kmlBlob.arrayBuffer();

        const zip = new JSZip();
        zip.file("doc.kml", arrayBuffer);
        
        // For large datasets, compression can run out of memory or corrupt the zip headers in browser.
        // We will try DEFLATE, and if it exceeds a cautious threshold, we fallback to STORE.
        // BUT to be safe, if points are > 50,000 we can just use STORE compression to guarantee no JSZip failure.
        const useCompression = points.length < 100000;

        const blob = await zip.generateAsync({ 
            type: "blob", 
            compression: useCompression ? "DEFLATE" : "STORE" 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docName.replace(/\.[^/.]+$/, "")}.kmz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
        console.error("Error creating KMZ:", e);
        alert("خطأ أثناء إنشاء الملف (Error creating KMZ): " + e.message);
    }
};

// --- GEOGRAPHIC CALCS (Distance) ---
const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
