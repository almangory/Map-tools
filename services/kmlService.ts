
import JSZipModule from 'jszip';
import { GeoPoint, KmlExportOptions, SplitterMode } from '../types';
import { matchStatusByColor } from './colorUtils';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule as any).default || JSZipModule;

export const getEffectiveColor = (pt: GeoPoint, options?: KmlExportOptions): string => {
    let colorHex = pt.color;
    const type = pt.type || 'Point';
    if (type === 'Polygon' && options?.polygonStyle?.colorHex) {
        return options.polygonStyle.colorHex;
    }
    if (options?.standardizeColors) {
        return matchStatusByColor(colorHex || '#3b82f6').color;
    }
    if (options?.canonicalColorMap) {
        const upper = String(colorHex || '#3b82f6').toUpperCase();
        if (options.canonicalColorMap[upper]) {
            return options.canonicalColorMap[upper];
        }
    }
    return colorHex || '#3b82f6';
};


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
export const calculatePathLength = (path?: {x: number, y: number}[]): number => {
    if (!path || !Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        if (!path[i] || !path[i+1]) continue;
        total += getDistanceMeters(path[i].y, path[i].x, path[i+1].y, path[i+1].x);
    }
    return total;
};

// --- HELPER: Create Placemark String ---
const kmlKeyComparator = (keyA: string, keyB: string): number => {
    const aLower = String(keyA || '').toLowerCase();
    const bLower = String(keyB || '').toLowerCase();
    
    const isStreetA = ['streetname', 'street', 'الشارع'].includes(aLower);
    const isStreetB = ['streetname', 'street', 'الشارع'].includes(bLower);

    if (isStreetA && !isStreetB) return 1;
    if (isStreetB && !isStreetA) return -1;
    
    if (aLower === 'shape_length' && bLower !== 'shape_length') return 1;
    if (bLower === 'shape_length' && aLower !== 'shape_length') return -1;
    
    if (aLower.includes('segment') && (bLower.includes('permit') || bLower.includes('رخصة'))) {
        return -1;
    }
    if (bLower.includes('segment') && (aLower.includes('permit') || aLower.includes('رخصة'))) {
        return 1;
    }
    return 0;
};

const createPlacemarkXML = (pt: GeoPoint, headers?: string[], selectedHeaders?: string[], options?: KmlExportOptions) => {
    let descriptionHTML = '';
    
    if (options?.keepOriginalDescription && pt.description) {
        descriptionHTML = pt.description;
        if (options?.removeImagesOnly) {
            descriptionHTML = descriptionHTML.replace(/<img[^>]*>/gi, '');
        }
    } else {
        descriptionHTML = '<div style="font-family:sans-serif; direction:ltr; text-align:left;">';
        
        // 1. الوصف الأساسي
        const hasAttributes = (pt.attributes && Object.keys(pt.attributes).length > 0) || (pt.originalRow && headers && headers.length > 0);
        if (pt.description) {
            const cleanDesc = options?.removeImagesOnly 
                ? pt.description.replace(/<img[^>]*>/gi, '') 
                : pt.description;

            if (!hasAttributes) {
                if (cleanDesc.trim()) {
                    descriptionHTML += `<div style="font-weight:bold; color:#0e3f53; margin-bottom:10px;">${cleanDesc}</div>`;
                }
            } else if (!options?.removeImagesOnly) {
                const images = pt.description.match(/<img[^>]+>/gi);
                if (images) {
                    descriptionHTML += `<div style="margin-bottom:10px; text-align:center;">${images.join('<br>')}</div>`;
                }
            }
        }

        // 2. البيانات المعززة (الشارع والحي ورابط قوقل ماب)
        const lon = pt.x.toFixed(7);
        const lat = pt.y.toFixed(7);
        const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

        descriptionHTML += '<div style="background-color:#fff9eb; padding:8px; border-radius:5px; border:1px solid #dcb13c; margin-bottom:10px;">';
        descriptionHTML += `<div style="font-size:11px;"><b>الإحداثيات:</b> ${lat}, ${lon}</div>`;
        const isDistrictSelected = !selectedHeaders || selectedHeaders.some(h => ['district', 'الحي'].includes(String(h || '').toLowerCase()));
        const isStreetSelected = !selectedHeaders || selectedHeaders.some(h => ['street', 'streetname', 'اسم الشارع', 'الشارع'].includes(String(h || '').toLowerCase()));

        if (pt.street && isStreetSelected) descriptionHTML += `<div style="font-size:11px;"><b>الشارع:</b> ${escapeXML(pt.street)}</div>`;
        if (pt.district && isDistrictSelected) descriptionHTML += `<div style="font-size:11px;"><b>الحي:</b> ${escapeXML(pt.district)}</div>`;
        descriptionHTML += `<div style="font-size:11px; margin-top:5px;"><a href="${googleMapsLink}" style="color:#3b82f6; text-decoration:none;">فتح في خرائط Google 📍</a></div>`;
        descriptionHTML += '</div>';

        if (pt.attr1) {
            // دعم لبيانات DXF الإضافية
            descriptionHTML += `<div style="font-size:11px; margin-top:5px;"><b>خصائص إضافية:</b> ${escapeXML(pt.attr1)}</div>`;
        }

        // 3. جدول البيانات (يتم تخطيطه وتنسيقه بحدود سوداء واضحة واتجاه LTR ليتطابق مع الصورة المطلوبة ويمنع التكرار)
        const hasAttributesToDisplay = (pt.attributes && Object.keys(pt.attributes).length > 0) || (pt.originalRow && headers && headers.length > 0);

        if (hasAttributesToDisplay && !options?.optimizeForMyMaps) {
            let tableHTML = '';
            
            // تصميم مخصص بحدود سوداء غامقة (2px solid black) ونمط جدول شبكي مع اتجاه من اليسار لليمين LTR لخرائط قوقل ماب
            const tableStyle = 'width: 100%; border: 2px solid #000000; border-collapse: collapse; font-family: sans-serif; font-size: 13px; color: #000000; background-color: #ffffff; direction: ltr !important; text-align: left !important; margin-top: 10px;';
            const trStyle = 'border: 2px solid #000000; direction: ltr !important; text-align: left !important;';
            const tdKeyStyle = 'border: 2px solid #000000; padding: 6px 10px; font-weight: bold; color: #000000; background-color: #ffffff; font-family: sans-serif; font-size: 13px; width: 45%; direction: ltr !important; text-align: left !important; word-break: break-word;';
            const tdValueStyle = 'border: 2px solid #000000; padding: 6px 10px; color: #000000; background-color: #ffffff; font-family: sans-serif; font-size: 13px; direction: ltr !important; text-align: left !important; word-break: break-word;';

            // النمط العادي في حال عدم اختيار التحسين
            const stdTableStyle = 'width: 100%; border: 0; background-color: #cbd5e1; font-size: 12px; font-family: sans-serif; direction: ltr !important; text-align: left !important; border-collapse: collapse; margin-top: 10px;';
            const stdTrStyle = 'direction: ltr !important; text-align: left !important;';
            const stdTdKeyStyle = 'background-color: #C0D9F9; font-weight: bold; color: #000000; padding: 6px 10px; direction: ltr !important; text-align: left !important; width: 45%; border: 1px solid #ffffff;';
            const stdTdValueStyle = 'background-color: #E6F2FF; color: #000000; padding: 6px 10px; direction: ltr !important; text-align: left !important; border: 1px solid #ffffff;';

            const activeTableStyle = options?.optimizeForMyMaps ? tableStyle : stdTableStyle;
            const activeTrStyle = options?.optimizeForMyMaps ? trStyle : stdTrStyle;
            const activeTdKeyStyle = options?.optimizeForMyMaps ? tdKeyStyle : stdTdKeyStyle;
            const activeTdValueStyle = options?.optimizeForMyMaps ? tdValueStyle : stdTdValueStyle;

            const activeTableAttrs = options?.optimizeForMyMaps 
                ? 'border="2" bordercolor="#000000" cellpadding="6" cellspacing="0" width="100%" dir="ltr" align="left"'
                : 'width="100%" border="0" cellpadding="4" cellspacing="1"';
                
            const activeTrAttrs = 'dir="ltr" align="left"';
            const activeTdKeyAttrs = 'width="45%" align="left" valign="middle" dir="ltr"';
            const activeTdValueAttrs = 'align="left" valign="middle" dir="ltr"';

            tableHTML += `<br><div dir="ltr" style="direction: ltr !important; text-align: left !important;"><table style="${activeTableStyle}" ${activeTableAttrs}>`;

            let keysToRender: string[] = [];
            if (selectedHeaders && selectedHeaders.length > 0) {
                keysToRender = [...selectedHeaders];
            } else if (pt.attributes) {
                keysToRender = Object.keys(pt.attributes);
            }
            
            if (keysToRender.length > 0) {
                keysToRender.sort((a, b) => kmlKeyComparator(a, b));
                keysToRender.forEach((key) => {
                    const val = pt.attributes ? pt.attributes[key] : undefined;
                    tableHTML += `
                        <tr style="${activeTrStyle}" ${activeTrAttrs}>
                            <td style="${activeTdKeyStyle}" ${activeTdKeyAttrs}>${escapeXML(key)}:</td>
                            <td style="${activeTdValueStyle}" ${activeTdValueAttrs}>${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                        </tr>`;
                });
            } else if (pt.originalRow && headers && headers.length > 0) {
                const headerIndices = headers.map((h, index) => ({ header: h, index }));
                headerIndices.sort((a, b) => kmlKeyComparator(a.header, b.header));
                headerIndices.forEach(({ header, index }) => {
                    if (selectedHeaders && !selectedHeaders.includes(header)) return;
                    const val = pt.originalRow![index];
                    tableHTML += `
                        <tr style="${activeTrStyle}" ${activeTrAttrs}>
                            <td style="${activeTdKeyStyle}" ${activeTdKeyAttrs}>${escapeXML(header)}:</td>
                            <td style="${activeTdValueStyle}" ${activeTdValueAttrs}>${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                        </tr>`;
                });
            }

            tableHTML += '</table></div>';
            descriptionHTML += tableHTML;
        }

        descriptionHTML += '</div>';
    }
    
    const colorHex = getEffectiveColor(pt, options);
    const type = pt.type || 'Point';
    const isPolygon = type === 'Polygon';
    const isLine = !isPolygon && (type === 'LineString' || type === 'Polyline' || type === 'MultiLineString' || (pt.path && pt.path.length >= 2));
    
    const { r, g, b, cleanHex, hasColor } = getKMLColorParts(colorHex);
    const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';
    const styleId = isPolygon && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${isPolygon ? 'Polygon' : isLine ? 'LineString' : 'Point'}_${hasColor ? cleanHex : 'nocolor'}_${iconHash}`;

    let geometryXML = '';
    if (isPolygon && pt.path && pt.path.length > 0) {
        let path = [...pt.path];
        if (path.length > 0) {
            const first = path[0];
            const last = path[path.length - 1];
            if (first.x !== last.x || first.y !== last.y) {
                path.push({ ...first });
            }
        }
        const coordsStr = path.map(p => `${p.x},${p.y},${p.z || 0}`).join(' ');
        geometryXML = `
      <Polygon>
        <tessellate>1</tessellate>
        <outerBoundaryIs><LinearRing><coordinates>${coordsStr}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>`;
    } else if (isLine && pt.path && pt.path.length > 0) {
        const coordsStr = pt.path.map(p => `${p.x},${p.y},${p.z || 0}`).join(' ');
        geometryXML = `
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordsStr}</coordinates>
      </LineString>`;
    } else {
        geometryXML = `<Point><coordinates>${pt.x},${pt.y},${pt.z || 0}</coordinates></Point>`;
    }

    let extendedDataXML = '';
    // في خرائط قوقل ماب (My Maps)، الطريقة الوحيدة لعرض جدول البيانات المصمم بحدود مرتبة ومنظمة هي عبر ExtendedData
    // لذلك نقوم بتفعيله دائماً، ومع تفعيل خيار التحسين نقوم بتنظيف حقل الوصف لتجنب تكرار البيانات كنصوص مسطحة
    if (true) {
        let keysToRender: string[] = [];
        if (selectedHeaders && selectedHeaders.length > 0) {
            keysToRender = [...selectedHeaders];
        } else if (pt.attributes) {
            keysToRender = Object.keys(pt.attributes);
        }

        if (keysToRender.length > 0) {
            keysToRender.sort((a, b) => kmlKeyComparator(a, b));
            extendedDataXML = `\n      <ExtendedData>\n` + 
                keysToRender.map(key => {
                    const val = pt.attributes ? pt.attributes[key] : undefined;
                    return `        <Data name="${escapeXML(key)}"><value>${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</value></Data>`;
                }).join('\n') +
                `\n      </ExtendedData>`;
        } else if (pt.originalRow && headers && headers.length > 0) {
            extendedDataXML = `\n      <ExtendedData>\n`;
            const headerIndices = headers.map((h, index) => ({ header: h, index }));
            headerIndices.sort((a, b) => kmlKeyComparator(a.header, b.header));
            headerIndices.forEach(({ header, index }) => {
                if (selectedHeaders && !selectedHeaders.includes(header)) {
                    return;
                }
                const val = pt.originalRow![index];
                extendedDataXML += `        <Data name="${escapeXML(header)}"><value>${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</value></Data>\n`;
            });
            extendedDataXML += `      </ExtendedData>`;
        }
    }

    return `
    <Placemark>
      <name>${escapeXML(pt.id)}</name>
      <description><![CDATA[${descriptionHTML}]]></description>
      <styleUrl>#${styleId}</styleUrl>${extendedDataXML}
      ${geometryXML}
    </Placemark>`;
};

// --- HELPER: Parse Color Hex for KML ---
export const getKMLColorParts = (colorHex: string | undefined) => {
    if (!colorHex) return { r: 'F6', g: '82', b: '3B', cleanHex: '3B82F6', hasColor: false };
    let cleanHex = String(colorHex || '').toUpperCase().replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    if (cleanHex.length !== 6) {
        return { r: 'F6', g: '82', b: '3B', cleanHex: '3B82F6', hasColor: false };
    }
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return { r, g, b, cleanHex, hasColor: true };
};

// --- HELPER: Generate KML Styles Block ---
export const generateKMLStyles = (points: GeoPoint[], options?: KmlExportOptions): string => {
    const uniqueStyles = new Set<string>();
    let stylesXML = '';
    
    // Default fallback style
    stylesXML += `    <Style id="myMapsBalloonStyle">
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>\n`;

    points.forEach(pt => {
        const colorHex = getEffectiveColor(pt, options);
        const type = pt.type || 'Point';
        const isPolygon = type === 'Polygon';
        const isLine = !isPolygon && (type === 'LineString' || type === 'Polyline' || type === 'MultiLineString' || (pt.path && pt.path.length >= 2));
        
        const { r, g, b, cleanHex, hasColor } = getKMLColorParts(colorHex);
        const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';
        const styleId = isPolygon && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${isPolygon ? 'Polygon' : isLine ? 'LineString' : 'Point'}_${hasColor ? cleanHex : 'nocolor'}_${iconHash}`;
        
        if (!uniqueStyles.has(styleId)) {
            uniqueStyles.add(styleId);
            const kmlColorStr = hasColor ? `\n        <color>ff${b}${g}${r}</color>` : '';
            const kmlColor = `ff${b}${g}${r}`.toLowerCase();
            const polyOpacity = options?.polygonStyle?.opacityHex || '80';
            const polyColor = `${polyOpacity}${b}${g}${r}`.toLowerCase();
            const polyOutline = options?.polygonStyle?.outline !== undefined ? options.polygonStyle.outline : 1;
            const polyWidth = options?.polygonStyle?.width !== undefined ? options.polygonStyle.width : 2;
            const lineLineWidth = options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3;

            if (isPolygon) {
                stylesXML += `    <Style id="${styleId}">
      <LineStyle>${kmlColorStr}
        <width>${polyWidth}</width>
      </LineStyle>
      <PolyStyle>
        <color>${polyColor}</color>
        <fill>1</fill>
        <outline>${polyOutline}</outline>
      </PolyStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>\n`;
            } else if (isLine) {
                stylesXML += `    <Style id="${styleId}">
      <LineStyle>${kmlColorStr}
        <width>${lineLineWidth}</width>
      </LineStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>\n`;
            } else {
                stylesXML += `    <Style id="${styleId}">
      <IconStyle>${kmlColorStr}
        <scale>0.8</scale>
        <Icon>
          <href>${pt.iconUrl || 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>\n`;
            }
        }
    });

    return stylesXML;
};

// --- MAIN: Generate KML Chunks ---
export const generateKMLFolderContent = (points: GeoPoint[], headers?: string[], selectedHeaders?: string[], options?: KmlExportOptions): string[] => {
    return points.map(p => createPlacemarkXML(p, headers, selectedHeaders, options));
};

export const generateKMLChunks = (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]): string[] => {
  const stylesXML = generateKMLStyles(points, options);
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXML(docName)}</name>
${stylesXML}`;

  const footer = `
  </Document>
</kml>`;

  const chunks: string[] = [header];

  if (options.groupByAttribute || options.groupByColumn) {
      const groups: Record<string, { pts: GeoPoint[], totalLen: number }> = {};
      
      points.forEach(pt => {
          let key = 'Default';
          if (options.groupByColumn) {
              if (pt.originalRow && headers) {
                  const colIdx = headers.indexOf(options.groupByColumn);
                  if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                      key = String(pt.originalRow[colIdx]).trim() || 'Default';
                  } else {
                      key = 'غير مصنف (Unclassified)';
                  }
              } else if (pt.attributes && pt.attributes[options.groupByColumn] !== undefined && pt.attributes[options.groupByColumn] !== null && pt.attributes[options.groupByColumn] !== '') {
                  key = String(pt.attributes[options.groupByColumn]).trim() || 'Default';
              } else {
                  key = 'غير مصنف (Unclassified)';
              }
          } else if (options.groupByAttribute === 'color') {
              const originalColor = String(pt.color || '#3b82f6').toUpperCase();
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
              chunks.push(createPlacemarkXML(pt, headers, selectedHeaders, options));
          }
          chunks.push(`\n    </Folder>`);
      });
  } else {
      for (const pt of points) {
          chunks.push(createPlacemarkXML(pt, headers, selectedHeaders, options));
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
            if (options.groupByColumn) {
                if (pt.originalRow && headers) {
                    const colIdx = headers.indexOf(options.groupByColumn);
                    if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                        key = String(pt.originalRow[colIdx]).trim() || 'Default';
                    } else {
                        key = 'غير مصنف (Unclassified)';
                    }
                } else if (pt.attributes && pt.attributes[options.groupByColumn] !== undefined && pt.attributes[options.groupByColumn] !== null && pt.attributes[options.groupByColumn] !== '') {
                    key = String(pt.attributes[options.groupByColumn]).trim() || 'Default';
                } else {
                    key = 'غير مصنف (Unclassified)';
                }
            } else if (options.groupByAttribute === 'color') {
                const originalColor = String(pt.color || '#3b82f6').toUpperCase();
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
            const kmlChunks = generateKMLChunks(data.pts, groupName, { ...options, mode: 'none' }, headers, selectedHeaders);
            const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
            const subZip = new JSZip();
            subZip.file("doc.kml", kmlBlob);
            const subKmzBlob = await subZip.generateAsync({ type: "blob", compression: "DEFLATE" });

            const safeName = groupName.replace(/[\\/:*?"<>|]/g, "_") || "Default";
            zip.file(`${safeName}.kmz`, subKmzBlob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const cleanDocName = docName.replace(/\.[^/.]+$/, "");
        downloadBlob(zipBlob, `${cleanDocName}_Grouped_KMZs.zip`);
    } catch (e: any) {
        console.error("Error creating KMZ ZIP:", e);
        throw new Error("Error creating ZIP: " + e.message);
    }
};

// --- MAIN: Download KMZ ---
export const downloadKMZ = async (points: GeoPoint[], docName: string, options: KmlExportOptions = { mode: 'none' }, headers?: string[], selectedHeaders?: string[]) => {
    try {
        const kmlChunks = generateKMLChunks(points, docName, options, headers, selectedHeaders);
        const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });

        const zip = new JSZip();
        zip.file("doc.kml", kmlBlob);
        
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
        throw new Error("Error creating KMZ: " + e.message);
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
