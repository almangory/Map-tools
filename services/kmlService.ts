
import JSZipModule from 'jszip';
import { GeoPoint, KmlExportOptions, SplitterMode } from '../types';
import { matchStatusByColor } from './colorUtils';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule && (JSZipModule as any).default) ? (JSZipModule as any).default : JSZipModule;

export const getColorGroupName = (colorHex: string): string => {
    const cleanHex = String(colorHex || '#3B82F6').trim().toUpperCase();
    const status = matchStatusByColor(cleanHex);
    if (status && status.nameAr) {
        return `${status.nameAr} (${cleanHex})`;
    }
    return `Color_${cleanHex.replace('#', '')}`;
};

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

// --- HELPER: Format Header Label (Bilingual / Arabic + English) ---
const formatHeaderLabel = (rawKey: string): string => {
    const k = rawKey.trim();
    const lower = k.toLowerCase().replace(/[._()\-]/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (/^(sr|رقم تسلسلي|الرقم التسلسلي|م|serial)$/i.test(lower)) return 'الرقم التسلسلي (.Sr)';
    if (/^(line no|line|رقم الخط|الخط)$/i.test(lower)) return 'رقم الخط (.Line No)';
    if (/^(section no|section|المقطع|رقم المقطع)$/i.test(lower)) return 'المقطع (.Section No)';
    if (/^(date of inspection|تاريخ الفحص|inspection date|تاريخ المعاينة)$/i.test(lower)) return 'تاريخ الفحص';
    if (/^(defects?|نوع العيب|العيب|العيوب)$/i.test(lower)) return 'نوع العيب (Defects)';
    if (/^(contributing factor|العامل المسبب|الملاحظة|العامل المسبب الملاحظة)$/i.test(lower)) return 'العامل المسبب / الملاحظة';
    if (/^(system type|نوع الشبكة|الشبكة)$/i.test(lower)) return 'نوع الشبكة (System Type)';
    if (/^(dia mm|dia|القطر|قطر|diameter)$/i.test(lower)) return 'القطر (DIA mm)';
    if (/^(material type|نوع المادة|المادة|material)$/i.test(lower)) return 'نوع المادة (Material Type)';
    if (/^(water meter.*|عداد المياه.*|التوصيلة.*)$/i.test(lower)) return 'عداد المياه / التوصيلة';
    if (/^(الجهة المسؤولة|responsible entity|department|dept)$/i.test(lower)) return 'الجهة المسؤولة';
    if (/^(ملاحظات الجهة المسؤولة|dept comments?|entity comments?)$/i.test(lower)) return 'ملاحظات الجهة المسؤولة';
    if (/^(contractor.*handover.*|المقاول وتاريخ الاستلام|المقاول)$/i.test(lower)) return 'المقاول وتاريخ الاستلام';
    if (/^(handover less than 10 years.*|أقل من 10 سنوات.*|اقل من 10 سنوات.*)$/i.test(lower)) return 'أقل من 10 سنوات؟';
    if (/^(comments?|حالة الملاحظة|ملاحظات)$/i.test(lower)) return 'حالة الملاحظة (Comments)';
    if (/^(cctv.*pic|cctv photo|photo|image|صورة|صورة الفحص)$/i.test(lower)) return 'صورة الفحص (CCTV)';
    if (/^(location.*google.*map|google.*map|موقع قوقل ماب|الموقع)$/i.test(lower)) return 'رابط الموقع (Google Maps)';
    
    return k;
};

// --- HELPER: Format Excel Cell Value (Handles Dates, URLs, Numbers) ---
const formatCellValue = (key: string, val: any): string => {
    if (val === undefined || val === null || val === '') return '-';
    
    const keyLower = key.toLowerCase();
    const isDateField = /date|تاريخ|handover|استلام|فحص/i.test(keyLower);
    
    // Check for Excel serial dates (e.g. 46011 -> 2025-12-20)
    if (isDateField || typeof val === 'number' || /^\d{5}$/.test(String(val).trim())) {
        const num = Number(val);
        if (!isNaN(num) && num >= 30000 && num <= 65000) {
            const utcDays = Math.floor(num - 25569);
            const date = new Date(utcDays * 86400 * 1000);
            if (!isNaN(date.getTime())) {
                return date.toISOString().slice(0, 10);
            }
        }
    }
    
    // Check if ISO date string
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
        return str.slice(0, 10);
    }
    
    return str;
};

// --- HELPER: Key Priority for Inspection / Municipal Data ---
const getKeyPriority = (rawKey: string): number => {
    const k = rawKey.toLowerCase();
    if (/^(\.?sr|رقم تسلسلي|الرقم التسلسلي|م$)/i.test(k)) return 10;
    if (/line/i.test(k) || /خط/i.test(k)) return 20;
    if (/section/i.test(k) || /مقطع/i.test(k)) return 30;
    if (/date/i.test(k) || /تاريخ/i.test(k)) return 40;
    if (/defect/i.test(k) || /عيب/i.test(k)) return 50;
    if (/contributing/i.test(k) || /عامل/i.test(k) || /مسبب/i.test(k)) return 60;
    if (/system/i.test(k) || /شبكة/i.test(k)) return 70;
    if (/dia/i.test(k) || /قطر/i.test(k)) return 80;
    if (/material/i.test(k) || /مادة/i.test(k)) return 90;
    if (/meter/i.test(k) || /عداد/i.test(k) || /توصيل/i.test(k)) return 100;
    if (/الجهة المسؤولة/i.test(k) || /responsible/i.test(k)) return 110;
    if (/ملاحظات الجهة/i.test(k) || /dept.*comment/i.test(k)) return 120;
    if (/contractor/i.test(k) || /مقاول/i.test(k)) return 130;
    if (/handover/i.test(k) || /سنوات/i.test(k) || /10/i.test(k)) return 140;
    if (/comment/i.test(k) || /حالة/i.test(k) || /ملاحظ/i.test(k)) return 150;
    if (/location/i.test(k) || /map/i.test(k) || /خريطة/i.test(k)) return 160;
    if (/cctv/i.test(k) || /pic/i.test(k) || /صورة/i.test(k) || /photo/i.test(k)) return 170;
    if (/coord/i.test(k) || /إحداثي/i.test(k)) return 200;
    return 100;
};

// --- HELPER: Create Placemark String ---
const kmlKeyComparator = (keyA: string, keyB: string): number => {
    const prioA = getKeyPriority(keyA);
    const prioB = getKeyPriority(keyB);
    if (prioA !== prioB) return prioA - prioB;
    return keyA.localeCompare(keyB);
};

const createPlacemarkXML = (pt: GeoPoint, headers?: string[], selectedHeaders?: string[], options?: KmlExportOptions) => {
    let descriptionHTML = '';
    
    // Check if description already contains complete HTML markup
    const isDescriptionPureHtmlCard = pt.description && (pt.description.includes('<table') || pt.description.includes('<div style='));
    
    if (options?.keepOriginalDescription && pt.description && isDescriptionPureHtmlCard) {
        descriptionHTML = pt.description;
        if (options?.removeImagesOnly) {
            descriptionHTML = descriptionHTML.replace(/<img[^>]*>/gi, '');
        }
    } else {
        const lon = pt.x.toFixed(7);
        const lat = pt.y.toFixed(7);
        
        // Check if description contains a custom Google Maps link or generate standard one
        let googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
        if (pt.description && /https?:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps|maps\.google\.com)[^\s<]*/i.test(pt.description)) {
            const match = pt.description.match(/https?:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps|maps\.google\.com)[^\s<]*/i);
            if (match) {
                googleMapsLink = match[0];
            }
        }
        
        // Detect if RTL / Arabic is needed
        const fullContentStr = String(pt.id || '') + ' ' + String(pt.description || '') + ' ' + JSON.stringify(pt.attributes || {}) + ' ' + (headers || []).join(' ');
        const isArabic = /[\u0600-\u06FF]/.test(fullContentStr);
        const useGoldenRtl = options?.cardTheme === 'goldenCardRtl' || (!options?.cardTheme && isArabic);
        const dir = useGoldenRtl ? 'rtl' : 'ltr';
        const textAlign = useGoldenRtl ? 'right' : 'left';

        // Extract key domain fields
        let srVal = '';
        let lineNoVal = '';
        let sectionVal = '';
        let defectVal = '';
        let deptVal = '';
        let cctvPicUrl = '';

        const allAttrs = pt.attributes || {};
        if (pt.originalRow && headers) {
            headers.forEach((h, idx) => {
                if (pt.originalRow && pt.originalRow[idx] !== undefined) {
                    allAttrs[h] = pt.originalRow[idx];
                }
            });
        }

        Object.keys(allAttrs).forEach(k => {
            const val = String(allAttrs[k] || '').trim();
            if (!val) return;
            if (/^(\.?sr|رقم تسلسلي|الرقم التسلسلي|م)$/i.test(k)) srVal = val;
            if (/line/i.test(k) || /خط/i.test(k)) lineNoVal = val;
            if (/section/i.test(k) || /مقطع/i.test(k)) sectionVal = val;
            if (/defect/i.test(k) || /نوع العيب|عيب/i.test(k)) defectVal = val;
            if (/الجهة|department|dept|المسؤولة/i.test(k) && !deptVal) deptVal = val;
            if (/cctv|pic|photo|image|صورة/i.test(k) && /^(https?:\/\/|data:image\/)/i.test(val)) cctvPicUrl = val;
        });

        if (!srVal) {
            const numMatch = String(pt.id || '').match(/\d+/);
            if (numMatch) srVal = numMatch[0];
        }

        // 1. Determine Card Title & Subtitle Badge
        let cardTitle = '';
        if (lineNoVal) {
            cardTitle = isArabic ? `موقع العيب رقم [${srVal || pt.id}] - ${lineNoVal}` : `Defect Location [${srVal || pt.id}] - ${lineNoVal}`;
        } else {
            cardTitle = `📍 ${escapeXML(pt.id)}`;
        }

        let badgeText = '';
        let badgeColor = '#16a34a'; // Green badge as in image 2
        if (deptVal) {
            badgeText = deptVal.startsWith('الجهة') ? deptVal : `الجهة: ${deptVal}`;
        } else if (options?.badgeColumn && allAttrs[options.badgeColumn]) {
            badgeText = String(allAttrs[options.badgeColumn]);
        } else if (pt.layer) {
            badgeText = pt.layer;
        } else if (pt.attr1) {
            badgeText = pt.attr1;
        }

        if (pt.color && !deptVal) {
            badgeColor = pt.color;
        }

        const badgeHtml = badgeText ? `<div style="display:inline-block; padding:4px 14px; font-size:12px; font-weight:bold; color:#ffffff; background-color:${badgeColor}; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.1); margin-top:4px;">${escapeXML(badgeText)}</div>` : '';

        // 2. Extract and format images
        let imgTagsHtml = '';
        let foundImageUrl = cctvPicUrl;

        if (pt.description && !options?.removeImagesOnly) {
            const imgMatches = pt.description.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatches && imgMatches[1]) {
                foundImageUrl = imgMatches[1];
            }
        }

        if (foundImageUrl && !options?.removeImagesOnly) {
            imgTagsHtml = `
            <div style="margin-top:14px; text-align:center;">
                <div style="font-size:12px; color:#334155; margin-bottom:6px; font-weight:bold;">📷 ${isArabic ? 'صورة الفحص التلفزيوني (CCTV)' : 'Inspection Photo (CCTV)'}</div>
                <img src="${escapeXML(foundImageUrl)}" style="max-width:100%; max-height:280px; height:auto; border-radius:6px; border:1px solid #cbd5e1; box-shadow:0 2px 6px rgba(0,0,0,0.12);" />
            </div>`;
        }

        // 3. Build Attribute Rows
        let rowsHtml = '';
        let keysToRender: string[] = [];
        if (selectedHeaders && selectedHeaders.length > 0) {
            keysToRender = [...selectedHeaders];
        } else if (pt.attributes) {
            keysToRender = Object.keys(pt.attributes);
        } else if (headers && headers.length > 0) {
            keysToRender = [...headers];
        }

        const renderRow = (key: string, rawVal: any) => {
            // If this is a CCTV PIC column and we already display it as an image, format cleanly
            const isImageCol = /cctv.*pic|photo|image|صورة/i.test(key);
            const valFormatted = formatCellValue(key, rawVal);
            
            const isUrl = typeof valFormatted === 'string' && /^(https?:\/\/|www\.)[^\s<]+/i.test(valFormatted.trim());
            const isHighlight = /عيب|defects?|issue|ملاحظة|كسر|شروخ|تسريب|crack|break|leak|خطر|warning|طفح|غرق/i.test(key) || (options?.highlightColumns && options.highlightColumns.includes(key));
            const valStyle = isHighlight ? 'color:#dc2626; font-weight:bold;' : 'color:#0f172a; font-weight:500;';
            const displayLabel = formatHeaderLabel(key);

            let cellContent = escapeXML(valFormatted);
            if (isImageCol && (valFormatted.startsWith('http') || valFormatted === '-')) {
                cellContent = isArabic ? '-' : '-';
            } else if (isUrl) {
                cellContent = `<a href="${escapeXML(valFormatted)}" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:500; word-break:break-all;">${escapeXML(valFormatted)}</a>`;
            }

            return `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="width:48%; color:#334155; font-weight:700; padding:6px 10px; text-align:${textAlign}; vertical-align:middle; font-size:12.5px;">${escapeXML(displayLabel)}</td>
                <td style="${valStyle} width:52%; padding:6px 10px; text-align:${textAlign}; word-break:break-word; vertical-align:middle; font-size:12.5px;">${cellContent}</td>
            </tr>`;
        };

        if (keysToRender.length > 0) {
            keysToRender.sort((a, b) => kmlKeyComparator(a, b));
            keysToRender.forEach(key => {
                let val: any = undefined;
                if (pt.attributes && pt.attributes[key] !== undefined) {
                    val = pt.attributes[key];
                } else if (pt.originalRow && headers) {
                    const idx = headers.indexOf(key);
                    if (idx !== -1) val = pt.originalRow[idx];
                }
                rowsHtml += renderRow(key, val);
            });
        }

        // Geographic Coords row
        rowsHtml += `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="width:48%; color:#334155; font-weight:700; padding:6px 10px; text-align:${textAlign}; vertical-align:middle; font-size:12.5px;">${isArabic ? 'الإحداثيات الجغرافية' : 'Coordinates'}</td>
            <td style="color:#0f172a; width:52%; padding:6px 10px; text-align:${textAlign}; font-family:monospace; font-size:12px; vertical-align:middle;">${lat}, ${lon}</td>
        </tr>`;

        const mapsBtnHtml = `
        <div style="text-align:center; margin-top:14px; margin-bottom:4px;">
            <a href="${googleMapsLink}" target="_blank" style="display:inline-block; padding:9px 24px; background-color:#0284c7; color:#ffffff; text-decoration:none; font-weight:bold; font-size:13px; border-radius:6px; box-shadow:0 2px 5px rgba(2,132,199,0.3); border:1px solid #0369a1;">
                📍 ${isArabic ? 'فتح الموقع في Google Maps' : 'Open in Google Maps'}
            </a>
        </div>
        <div style="font-size:11px; margin-top:8px; color:#64748b; text-align:right;">
            ${isArabic ? `الاتجاهات: <a href="https://maps.google.com/maps?daddr=${lat},${lon}" target="_blank" style="color:#0284c7; text-decoration:underline;">إلى هنا</a> - <a href="https://maps.google.com/maps?saddr=${lat},${lon}" target="_blank" style="color:#0284c7; text-decoration:underline;">من هنا</a>` : `Directions: <a href="https://maps.google.com/maps?daddr=${lat},${lon}" target="_blank" style="color:#0284c7; text-decoration:underline;">To here</a> - <a href="https://maps.google.com/maps?saddr=${lat},${lon}" target="_blank" style="color:#0284c7; text-decoration:underline;">From here</a>`}
        </div>`;

        descriptionHTML = `
<div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12.5px; color:#1e293b; margin:0; padding:4px; background-color:#ffffff; direction:${dir}; text-align:${textAlign}; line-height:1.5; min-width:380px; max-width:540px; box-sizing:border-box;">
  <div style="border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 4px 10px rgba(0,0,0,0.06); background-color:#ffffff;">
    <div style="border-bottom:1px solid #f1f5f9; padding-bottom:10px; margin-bottom:10px; text-align:center;">
      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:4px;">${escapeXML(cardTitle)}</div>
      ${badgeHtml}
    </div>
    
    <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:12.5px; direction:${dir}; text-align:${textAlign};">
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    
    ${imgTagsHtml}
    ${mapsBtnHtml}
  </div>
</div>`;
    }
    
    // Construct rich placemark name if attributes exist
    let placemarkDisplayName = pt.id;
    if (pt.attributes) {
        const line = pt.attributes['Line No'] || pt.attributes['.Line No'] || pt.attributes['رقم الخط'] || pt.attributes['line'];
        const sect = pt.attributes['Section No'] || pt.attributes['.Section No'] || pt.attributes['المقطع'] || pt.attributes['section'];
        const defect = pt.attributes['Defects'] || pt.attributes['Defect'] || pt.attributes['نوع العيب'] || pt.attributes['عيب'];
        const sr = pt.attributes['Sr'] || pt.attributes['.Sr'] || pt.attributes['الرقم التسلسلي'] || pt.attributes['sr'];
        
        if (line || sect || defect) {
            const parts: string[] = [];
            if (line) parts.push(String(line));
            if (sect) parts.push(`(${sect})`);
            let mainTitle = parts.join(' ');
            if (defect) mainTitle += ` - ${defect}`;
            if (sr) mainTitle += ` [${sr}]`;
            else if (pt.id) mainTitle += ` [${pt.id}]`;
            placemarkDisplayName = mainTitle;
        }
    }
    
    const colorHex = getEffectiveColor(pt, options);
    const type = pt.type || 'Point';
    const isPolygon = type === 'Polygon';
    const isLine = !isPolygon && (type === 'LineString' || (type as string) === 'Polyline' || (type as string) === 'MultiLineString' || (pt.path && pt.path.length >= 2));
    
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
    // في خرائط قوقل ماب (My Maps)، الطريقة لعرض جدول البيانات عبر ExtendedData
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
                    const valFormatted = formatCellValue(key, val);
                    const label = formatHeaderLabel(key);
                    return `        <Data name="${escapeXML(label)}"><value>${escapeXML(valFormatted)}</value></Data>`;
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
                const valFormatted = formatCellValue(header, val);
                const label = formatHeaderLabel(header);
                extendedDataXML += `        <Data name="${escapeXML(label)}"><value>${escapeXML(valFormatted)}</value></Data>\n`;
            });
            extendedDataXML += `      </ExtendedData>`;
        }
    }

    return `
    <Placemark>
      <name>${escapeXML(placemarkDisplayName || pt.id)}</name>
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
        <bgColor>ffffffff</bgColor>
        <textColor>ff000000</textColor>
        <text><![CDATA[$[description]]]></text>
      </BalloonStyle>
    </Style>\n`;

    points.forEach(pt => {
        const colorHex = getEffectiveColor(pt, options);
        const type = pt.type || 'Point';
        const isPolygon = type === 'Polygon';
        const isLine = !isPolygon && (type === 'LineString' || (type as string) === 'Polyline' || (type as string) === 'MultiLineString' || (pt.path && pt.path.length >= 2));
        
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
            const labelScale = options?.labelScale !== undefined ? options.labelScale : 0;

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
        <scale>${labelScale}</scale>
      </LabelStyle>
      <BalloonStyle>
        <bgColor>ffffffff</bgColor>
        <textColor>ff000000</textColor>
        <text><![CDATA[$[description]]]></text>
      </BalloonStyle>
    </Style>\n`;
            } else if (isLine) {
                stylesXML += `    <Style id="${styleId}">
      <LineStyle>${kmlColorStr}
        <width>${lineLineWidth}</width>
      </LineStyle>
      <LabelStyle>
        <scale>${labelScale}</scale>
      </LabelStyle>
      <BalloonStyle>
        <bgColor>ffffffff</bgColor>
        <textColor>ff000000</textColor>
        <text><![CDATA[$[description]]]></text>
      </BalloonStyle>
    </Style>\n`;
            } else {
                stylesXML += `    <Style id="${styleId}">
      <IconStyle>${kmlColorStr}
        <scale>0.8</scale>
        <Icon>
          <href>${pt.iconUrl || 'https://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>${labelScale}</scale>
      </LabelStyle>
      <BalloonStyle>
        <bgColor>ffffffff</bgColor>
        <textColor>ff000000</textColor>
        <text><![CDATA[$[description]]]></text>
      </BalloonStyle>
    </Style>\n`;
            }
        }
    });

    return stylesXML;
};

// --- HIERARCHICAL FOLDER TREE TYPES & HELPERS ---
export interface FolderTreeNode {
    name: string;
    points: GeoPoint[];
    children: Map<string, FolderTreeNode>;
}

export const buildFolderTree = (points: GeoPoint[]): { rootPoints: GeoPoint[]; rootFolders: Map<string, FolderTreeNode> } => {
    const rootFolders = new Map<string, FolderTreeNode>();
    const rootPoints: GeoPoint[] = [];

    points.forEach(pt => {
        const path = (pt.folderPath && pt.folderPath.length > 0)
            ? pt.folderPath
            : (pt.layer ? [pt.layer] : []);

        if (path.length === 0) {
            rootPoints.push(pt);
            return;
        }

        let currentMap = rootFolders;
        let currentNode: FolderTreeNode | null = null;

        for (let i = 0; i < path.length; i++) {
            const seg = path[i];
            if (!currentMap.has(seg)) {
                currentMap.set(seg, {
                    name: seg,
                    points: [],
                    children: new Map()
                });
            }
            currentNode = currentMap.get(seg)!;
            currentMap = currentNode.children;
        }

        if (currentNode) {
            currentNode.points.push(pt);
        } else {
            rootPoints.push(pt);
        }
    });

    return { rootPoints, rootFolders };
};

export const renderFolderTreeNode = (
    node: FolderTreeNode,
    chunks: string[],
    indent: string,
    headers?: string[],
    selectedHeaders?: string[],
    options?: KmlExportOptions
) => {
    let totalLen = 0;
    const calculateSubtreeLength = (n: FolderTreeNode) => {
        for (const pt of n.points) {
            if (pt.type === 'LineString' && pt.path) totalLen += calculatePathLength(pt.path);
            else if (pt.originalLength) totalLen += pt.originalLength;
        }
        for (const child of n.children.values()) {
            calculateSubtreeLength(child);
        }
    };
    calculateSubtreeLength(node);
    
    // Prevent adding duplicate length string if name already contains (XX.XX km) or (XX m)
    const alreadyHasLength = /\(\s*\d+(\.\d+)?\s*(km|m|كم|م)\s*\)\s*$/i.test(node.name.trim());
    const shouldAddLength = !alreadyHasLength && Boolean(options?.includeFolderLengths || options?.groupByColumn || options?.groupByAttribute);
    const lenStr = (shouldAddLength && totalLen > 0) ? ` (${(totalLen / 1000).toFixed(2)} km)` : '';

    chunks.push(`\n${indent}<Folder>\n${indent}  <name>${escapeXML(node.name)}${lenStr}</name>\n${indent}  <open>0</open>\n`);

    for (const pt of node.points) {
        chunks.push(createPlacemarkXML(pt, headers, selectedHeaders, options));
    }

    for (const child of node.children.values()) {
        renderFolderTreeNode(child, chunks, indent + '  ', headers, selectedHeaders, options);
    }

    chunks.push(`\n${indent}</Folder>`);
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

  const hasExplicitFolders = points.some(p => p.folderPath && p.folderPath.length > 0);
  const isLayerGrouping = options.groupByAttribute === 'layer';
  const shouldRenderHierarchy = isLayerGrouping || (!options.groupByAttribute && !options.groupByColumn && hasExplicitFolders);

  if (shouldRenderHierarchy) {
      const { rootPoints, rootFolders } = buildFolderTree(points);
      for (const pt of rootPoints) {
          chunks.push(createPlacemarkXML(pt, headers, selectedHeaders, options));
      }
      for (const folderNode of rootFolders.values()) {
          renderFolderTreeNode(folderNode, chunks, '    ', headers, selectedHeaders, options);
      }
  } else if (options.groupByAttribute || options.groupByColumn) {
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
              const canonical = options.canonicalColorMap ? (options.canonicalColorMap[originalColor] || originalColor) : originalColor;
              key = getColorGroupName(canonical);
          } else if (options.groupByAttribute === 'geometry') {
              const t = pt.type || 'Point';
              key = t === 'Polygon' ? 'مضلعات (Polygons)' : t === 'LineString' ? 'مسارات وخطوط (Lines)' : 'نقاط وعلامات (Points)';
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
        const hasExplicitFolders = points.some(p => p.folderPath && p.folderPath.length > 0);
        const isLayerGrouping = options.groupByAttribute === 'layer';
        const shouldRenderHierarchy = isLayerGrouping || (!options.groupByAttribute && !options.groupByColumn && hasExplicitFolders);

        const usedFileNames = new Set<string>();
        const getUniqueKmzName = (baseName: string): string => {
            let clean = baseName.replace(/[\\/:*?"<>|]/g, "_").trim() || "Map";
            let candidate = `${clean}.kmz`;
            let counter = 1;
            while (usedFileNames.has(candidate.toLowerCase())) {
                candidate = `${clean}_(${counter}).kmz`;
                counter++;
            }
            usedFileNames.add(candidate.toLowerCase());
            return candidate;
        };

        if (shouldRenderHierarchy) {
            let { rootPoints, rootFolders } = buildFolderTree(points);
            const zip = new JSZip();

            // Unwrap single parent container if it has multiple subfolders/maps
            while (rootFolders.size === 1 && rootPoints.length === 0) {
                const singleNode = Array.from(rootFolders.values())[0];
                if (singleNode.children.size > 0) {
                    if (singleNode.points.length > 0) {
                        rootPoints.push(...singleNode.points);
                    }
                    rootFolders = singleNode.children;
                } else {
                    break;
                }
            }

            if (rootPoints.length > 0) {
                const kmlChunks = generateKMLChunks(rootPoints, `${docName}_General`, { ...options, mode: 'none' }, headers, selectedHeaders);
                const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
                const subZip = new JSZip();
                subZip.file("doc.kml", kmlBlob);
                const subKmzBlob = await subZip.generateAsync({ type: "blob", compression: "DEFLATE" });
                const mainFileName = getUniqueKmzName("Main_Elements");
                zip.file(mainFileName, subKmzBlob);
            }

            for (const [folderName, node] of rootFolders.entries()) {
                const collectPoints = (n: FolderTreeNode): GeoPoint[] => {
                    let res = [...n.points];
                    for (const child of n.children.values()) {
                        res = res.concat(collectPoints(child));
                    }
                    return res;
                };
                const folderPoints = collectPoints(node);
                if (folderPoints.length === 0) continue;

                const stylesXML = generateKMLStyles(folderPoints, options);
                const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escapeXML(folderName)}</name>\n${stylesXML}`;
                const kmlFooter = `\n  </Document>\n</kml>`;
                const kmlChunks: string[] = [kmlHeader];

                if (node.children.size === 0) {
                    for (const pt of node.points) {
                        kmlChunks.push(createPlacemarkXML(pt, headers, selectedHeaders, options));
                    }
                } else {
                    renderFolderTreeNode(node, kmlChunks, '    ', headers, selectedHeaders, options);
                }
                kmlChunks.push(kmlFooter);

                const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
                const subZip = new JSZip();
                subZip.file("doc.kml", kmlBlob);
                const subKmzBlob = await subZip.generateAsync({ type: "blob", compression: "DEFLATE" });
                const fileName = getUniqueKmzName(folderName);
                zip.file(fileName, subKmzBlob);
            }

            const zipBlob = await zip.generateAsync({ type: "blob" });
            const cleanDocName = docName.replace(/\.[^/.]+$/, "");
            downloadBlob(zipBlob, `${cleanDocName}_Grouped_KMZs.zip`);
            return;
        }

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
                const canonical = options.canonicalColorMap ? (options.canonicalColorMap[originalColor] || originalColor) : originalColor;
                key = getColorGroupName(canonical);
            } else if (options.groupByAttribute === 'geometry') {
                const t = pt.type || 'Point';
                key = t === 'Polygon' ? 'مضلعات (Polygons)' : t === 'LineString' ? 'مسارات وخطوط (Lines)' : 'نقاط وعلامات (Points)';
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
            if (data.pts.length === 0) continue;
            const kmlChunks = generateKMLChunks(data.pts, groupName, { ...options, mode: 'none' }, headers, selectedHeaders);
            const kmlBlob = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
            const subZip = new JSZip();
            subZip.file("doc.kml", kmlBlob);
            const subKmzBlob = await subZip.generateAsync({ type: "blob", compression: "DEFLATE" });

            const safeName = getUniqueKmzName(groupName);
            zip.file(safeName, subKmzBlob);
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
        
        if (options?.imageFolder) {
            for (const [imgPath, imgData] of Object.entries(options.imageFolder)) {
                zip.file(imgPath, imgData);
            }
        }
        
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
