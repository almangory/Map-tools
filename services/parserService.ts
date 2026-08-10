import shp from 'shpjs';
import fgdb from 'fgdb';

import * as XLSX from 'xlsx';
import DxfParser from 'dxf-parser';
import JSZipModule from 'jszip';
import { ParsedFile, GeoPoint, ColumnMapping } from '../types';
import { calculatePathLength } from './geometryService';

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
  const lowerHeaders = headers.map(h => String(h || '').trim().toLowerCase());
  const map: ColumnMapping = { xColumn: '', yColumn: '' };
  
  const linkTerms = ['location', 'map', 'link', 'url', 'site', 'google', 'موقع', 'رابط', 'الاحداثيات', 'coords', 'gps', 'geo'];
  const xTerms = ['east', 'easting', 'lon', 'longitude', 'long', 'x', 'شرق', 'شرقيات', 'خط الطول', 'الشرق'];
  const yTerms = ['north', 'northing', 'lat', 'latitude', 'y', 'شمال', 'شماليات', 'خط العرض', 'الشمال'];
  const zTerms = ['z', 'elev', 'elevation', 'height', 'alt', 'altitude', 'المنسوب', 'ارتفاع', 'مستوى'];
  const idTerms = ['id', 'name', 'point', 'label', 'number', 'pt', 'اسم', 'معرف', 'رقم', 'النقطة', 'كود'];

  const findMatch = (terms: string[]) => {
    return headers.find(h => {
      const lh = String(h || '').trim().toLowerCase();
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

export const isWaterPoint = (pt: any): boolean => {
  if (!pt) return false;
  const layerUpper = String(pt.layer || '').toUpperCase();
  const descUpper = String(pt.description || '').toUpperCase();
  const idUpper = String(pt.id || '').toUpperCase();
  const attr1Upper = String(pt.attr1 || '').toUpperCase();
  const attr2Upper = String(pt.attr2 || '').toUpperCase();
  const attrStr = JSON.stringify(pt.attributes || {}).toUpperCase();
  const fullText = `${layerUpper} ${descUpper} ${idUpper} ${attr1Upper} ${attr2Upper} ${attrStr}`;

  return (
    layerUpper.includes('W_MAINLINE') ||
    fullText.includes('WATER') ||
    fullText.includes('WTR') ||
    fullText.includes('POTABLE') ||
    fullText.includes('MOW') ||
    fullText.includes('ماء') ||
    fullText.includes('مياه') ||
    fullText.includes('شرب') ||
    pt.color === '#00c8b3' ||
    pt.color === '#0000ff' ||
    pt.color === '#00a8e8' ||
    pt.color === '#00b0ff'
  );
};

export const isSewerPoint = (pt: any): boolean => {
  if (!pt) return false;
  const layerUpper = String(pt.layer || '').toUpperCase();
  const descUpper = String(pt.description || '').toUpperCase();
  const idUpper = String(pt.id || '').toUpperCase();
  const attr1Upper = String(pt.attr1 || '').toUpperCase();
  const attr2Upper = String(pt.attr2 || '').toUpperCase();
  const attrStr = JSON.stringify(pt.attributes || {}).toUpperCase();
  const fullText = `${layerUpper} ${descUpper} ${idUpper} ${attr1Upper} ${attr2Upper} ${attrStr}`;

  return (
    layerUpper.includes('WW_MAINLINE') ||
    layerUpper.includes('S_GRAVITY_MAIN') ||
    fullText.includes('SEWER') ||
    fullText.includes('SAN') ||
    fullText.includes('WW') ||
    fullText.includes('DRAIN') ||
    fullText.includes('WASTEWATER') ||
    fullText.includes('صرف') ||
    fullText.includes('مجاري') ||
    pt.color === '#d946ef' ||
    pt.color === '#a78bfa' ||
    pt.color === '#9000ff' ||
    pt.color === '#800080'
  );
};

export const parseExcel = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  await yieldToMain();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 40) + 10);
    reader.onload = async (e) => {
      try {
        if (onProgress) onProgress(60); 
        await yieldToMain();
        
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            
            if (onProgress) onProgress(80);
            await yieldToMain();

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
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};

export const parseDXF = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  await yieldToMain();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 40) + 10);
    reader.onload = async (e) => {
      try {
        if (onProgress) onProgress(60);
        await yieldToMain();
        
        try {
            const text = e.target?.result as string;
            const parser = new DxfParser();
            const dxf = parser.parseSync(text);
            
            if (onProgress) onProgress(100);
            resolve({ filename: file.name, type: 'dxf', data: dxf.entities, preview: [] });
        } catch (err) { reject(err); }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

const preprocessKML = (raw: string): string => {
  if (!raw) return raw;
  // Replace raw & not followed by a valid entity with &amp;
  let cleaned = raw.replace(/&(?!(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, '&amp;');
  return cleaned;
};

export const stripHtml = (html?: string): string => {
  if (!html) return '';
  return String(html)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
};

export const extractNumbersOnly = (val: any): string => {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';

  // 1. Convert Eastern Arabic numerals (٠-٩) to standard English digits (0-9)
  str = str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  // 2. Normalize comma decimal separator between digits (e.g., "100,5" -> "100.5")
  str = str.replace(/(\d+),(\d+)/g, '$1.$2');

  // 3. Remove all non-digit and non-dot characters
  let cleaned = str.replace(/[^\d.]/g, '');

  // 4. Ensure at most one decimal point exists
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }

  return cleaned;
};

export const isNumericTargetField = (fieldName: string): boolean => {
  if (!fieldName) return false;
  const normalized = fieldName.toLowerCase().replace(/[\s_#-]/g, '');
  const numericKeywords = [
    'zone', 'zonenu', 'zoneno', 'منطقة', 'المنطقة', 'رقمالمنطقة', 'النطاق', 'زون', 'رقمالزون',
    'permitno', 'permit', 'رقمالترخيص', 'رقمالرخصة', 'رقمالرخصه', 'رقمالتصريح',
    'innerdiameter', 'القطرالداخلي', 'قطرداخلي',
    'outerdiameter', 'القطرالخارجي', 'قطرخارجي',
    'shapelength', 'actuallength', 'طولالخط', 'طولالعنصر', 'الاطوال'
  ];
  return numericKeywords.some(nk => normalized === nk || normalized.includes(nk));
};

export const isZoneField = (fieldName: string): boolean => {
  if (!fieldName) return false;
  const normalized = fieldName.toLowerCase().replace(/[\s_#-]/g, '');
  const zoneKeywords = ['zone', 'zonenu', 'zoneno', 'منطقة', 'المنطقة', 'رقمالمنطقة', 'النطاق', 'زون', 'رقمالزون'];
  return zoneKeywords.some(zk => normalized === zk || normalized.includes(zk));
};

export const cleanZoneValue = (val: any): string => {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (!str) return '';

  if (str.includes('|') || str.includes('/') || str.includes(',')) {
    const parts = str.split(/([|/,])/);
    return parts.map(p => {
      if (p === '|' || p === '/' || p === ',') return p;
      return cleanZoneValue(p.trim());
    }).join('');
  }

  str = str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  let numStr = extractNumbersOnly(str);
  if (!numStr) {
    return str.replace(/\b0+(\d+)\b/g, '$1').trim();
  }

  if (/^0+\d+$/.test(numStr)) {
    numStr = numStr.replace(/^0+/, '');
  } else if (/^0+$/.test(numStr)) {
    numStr = '0';
  } else if (/^0+/.test(numStr) && !numStr.startsWith('0.')) {
    numStr = numStr.replace(/^0+/, '') || '0';
  }

  return numStr;
};

const cleanAttributeValue = (key: string, rawVal: string): string => {
  if (isZoneField(key)) return cleanZoneValue(rawVal);
  if (isNumericTargetField(key)) return extractNumbersOnly(rawVal);
  return rawVal;
};

export const isKnownAttributeKey = (str: string): boolean => {
    if (!str) return false;
    const s = str.toLowerCase().trim().replace(/[\s_#-]/g, '');
    return (
        s === 'innerdiameter' || s === 'outerdiameter' || s === 'diameter' || s === 'pipediameter' || s === 'dn' || s === 'dia' || s === 'size' || s === 'pipesize' || s === 'قطر' || s === 'القطر' || s === 'القطرالداخلي' || s === 'القطرالخارجي' ||
        s === 'zone' || s === 'zonenu' || s === 'zonenumber' || s === 'zoneid' || s === 'district' || s === 'districtname' || s === 'منطقة' || s === 'المنطقة' || s === 'حي' || s === 'الحي' || s === 'النطاق' || s === 'زون' ||
        s === 'permitno' || s === 'permit' || s === 'permitnumber' || s === 'ركمالترخيص' || s === 'ترخيص' || s === 'رقمترخيص' || s === 'رقمارخصة' ||
        s === 'segmentid' || s === 'segment' || s === 'segid' || s === 'رقمالشريحة' || s === 'شريحة' ||
        s === 'drillingtype' || s === 'stage' || s === 'contractor' || s === 'projectname' || s === 'projectid' || s === 'shapelength' || s === 'streetname' || s === 'street' || s === 'lineno' || s === 'maintroute' || s === 'material'
    );
};

export const parseDescriptionToAttributes = (desc?: string, attributes: Record<string, string> = {}): Record<string, string> => {
    if (!desc || typeof desc !== 'string') return attributes;
    
    const cleanDesc = desc.trim();
    if (!cleanDesc) return attributes;

    // 1. Parse HTML <tr> blocks dynamically
    const trBlockRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trBlockRegex.exec(cleanDesc)) !== null) {
        const rowContent = trMatch[1];
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            cells.push(stripHtml(cellMatch[1]).trim());
        }
        if (cells.length >= 2) {
            let rawKey = cells[0];
            let rawVal = cells[1];
            if (cells.length >= 3 && /^\d+$/.test(rawKey)) {
                rawKey = cells[1];
                rawVal = cells[2];
            }

            // Swap if rawVal is a known key or rawKey is value-like
            if (isKnownAttributeKey(rawVal) && !isKnownAttributeKey(rawKey)) {
                const tmp = rawKey; rawKey = rawVal; rawVal = tmp;
            } else if (/^-?\d+(\.\d+)?$/.test(rawKey) && !/^-?\d+(\.\d+)?$/.test(rawVal) && !/^\d+$/.test(rawVal)) {
                const tmp = rawKey; rawKey = rawVal; rawVal = tmp;
            }

            const lowerK = String(rawKey || '').toLowerCase();
            const lowerV = String(rawVal || '').toLowerCase();
            const isHeader = (lowerK === 'key' && lowerV === 'value') ||
                             (lowerK === 'field' && lowerV === 'value') ||
                             (lowerK === 'attribute' && lowerV === 'value') ||
                             (rawKey === 'الحقل' && rawVal === 'القيمة') ||
                             (rawKey === 'العنصر' && rawVal === 'القيمة') ||
                             (rawKey === 'اسم الحقل' && rawVal === 'القيمة');
            if (rawKey && !isHeader) {
                if (!attributes[rawKey]) {
                    attributes[rawKey] = cleanAttributeValue(rawKey, rawVal);
                }
            }
        }
    }

    // 2. Parse <li> tags
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(cleanDesc)) !== null) {
        const text = stripHtml(liMatch[1]);
        const sepIdx = text.indexOf(':') !== -1 ? text.indexOf(':') : text.indexOf('=');
        if (sepIdx > 0) {
            let k = text.substring(0, sepIdx).trim();
            let v = text.substring(sepIdx + 1).trim();
            if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                const tmp = k; k = v; v = tmp;
            }
            if (k && !attributes[k]) {
                attributes[k] = cleanAttributeValue(k, v);
            }
        } else {
            const spaceIdx = text.indexOf(' ');
            if (spaceIdx > 0) {
                let k = text.substring(0, spaceIdx).trim();
                let v = text.substring(spaceIdx + 1).trim();
                if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                    const tmp = k; k = v; v = tmp;
                }
                if (k && k.length < 50 && !attributes[k]) {
                    attributes[k] = cleanAttributeValue(k, v);
                }
            }
        }
    }

    // 3. Parse <br> or line break separated Key: Value, Key = Value, or Key Value
    const lines = cleanDesc
        .split(/<br\s*\/?>|<\/p>|\r?\n/gi)
        .map(l => stripHtml(l))
        .filter(Boolean);

    for (const line of lines) {
        if (line.includes('google.com/maps') || line.includes('http://') || line.includes('https://')) {
            const urlMatch = line.match(/(https?:\/\/[^\s\)]+)/);
            if (urlMatch && !attributes['Google Maps Link']) {
                attributes['Google Maps Link'] = urlMatch[1];
                continue;
            }
        }

        const colonIdx = line.indexOf(':');
        const equalIdx = line.indexOf('=');
        let sepIdx = -1;
        if (colonIdx !== -1 && equalIdx !== -1) sepIdx = Math.min(colonIdx, equalIdx);
        else if (colonIdx !== -1) sepIdx = colonIdx;
        else if (equalIdx !== -1) sepIdx = equalIdx;

        if (sepIdx > 0 && sepIdx < line.length - 1) {
            let k = line.substring(0, sepIdx).trim();
            let v = line.substring(sepIdx + 1).trim();
            if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                const tmp = k; k = v; v = tmp;
            }
            if (k && k.length < 60 && !attributes[k]) {
                attributes[k] = cleanAttributeValue(k, v);
            }
        } else if (sepIdx === -1) {
            const knownMultiWordKeys = [
                'قطر الخط', 'قطر الأنبوب', 'قطر الانبوب', 'نوع الحفر', 'اسم المشروع', 'رقم المشروع',
                'القطر الداخلي', 'القطر الخارجي', 'اسم الشارع', 'اسم الحي', 'سنة التركيب', 'سنة التشغيل',
                'حالة العنصر', 'نوع الخرسانة', 'طول الخط', 'مادة الخط', 'قطر الانبوب مم', 'قطر الخط مم',
                'segment id', 'SEGMENT ID', 'SEGMENT_ID', 'Segment ID', 'Segment Id', 'segment_id', 'SEGMENT NO',
                'segment no', 'SEG ID', 'seg id', 'رقم الشريحة', 'كود الشريحة', 'معرف الشريحة', 'رقم القطاع',
                'Permit No', 'Drilling type', 'Pipe Diameter', 'Line No', 'Asset Status',
                'Project Name', 'Project ID', 'Inner Diameter', 'Outer Diameter', 'INNERDIAMETER',
                'INNER_DIAMETER', 'INNER DIAMETER', 'InnerDiameter', 'ZONE', 'Zone'
            ];
            
            let matchedMulti = false;
            for (const key of knownMultiWordKeys) {
                const lowerLine = line.toLowerCase();
                const lowerKey = key.toLowerCase();
                if (lowerLine.startsWith(lowerKey + ' ') || lowerLine.startsWith(lowerKey + ':') || lowerLine.startsWith(lowerKey + '=')) {
                    const k = key;
                    const v = line.substring(key.length).replace(/^[:=\s]+/, '').trim();
                    if (v && !attributes[k]) {
                        attributes[k] = cleanAttributeValue(k, v);
                    }
                    matchedMulti = true;
                    break;
                } else if (lowerLine.endsWith(' ' + lowerKey) || lowerLine.endsWith(':' + lowerKey) || lowerLine.endsWith('=' + lowerKey)) {
                    const k = key;
                    const v = line.substring(0, line.length - key.length).replace(/[:=\s]+$/, '').trim();
                    if (v && !attributes[k]) {
                        attributes[k] = cleanAttributeValue(k, v);
                    }
                    matchedMulti = true;
                    break;
                }
            }

            if (!matchedMulti) {
                const spaceIdx = line.indexOf(' ');
                if (spaceIdx > 0 && spaceIdx < line.length - 1) {
                    let k = line.substring(0, spaceIdx).trim();
                    let v = line.substring(spaceIdx + 1).trim();
                    if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                        const tmp = k; k = v; v = tmp;
                    }
                    if (k && k.length < 50 && v && !attributes[k]) {
                        attributes[k] = cleanAttributeValue(k, v);
                    }
                }
            }
        }
    }

    return attributes;
};

export const extractAllPointAttributes = (pt: any): Record<string, string> => {
    const attrs: Record<string, string> = {};
    if (pt?.attributes) {
        Object.entries(pt.attributes).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
                const valStr = String(v);
                attrs[k] = cleanAttributeValue(k, valStr);
            }
        });
    }
    if (pt?.description) {
        parseDescriptionToAttributes(pt.description, attrs);
    }
    // Clean all target numeric/zone fields
    Object.keys(attrs).forEach(k => {
        if (attrs[k]) {
            attrs[k] = cleanAttributeValue(k, attrs[k]);
        }
    });

    // Auto-populate SHAPE_Length if missing and pt has geometry
    const hasShapeLength = Object.keys(attrs).some(k => {
        const lower = k.toLowerCase().replace(/[\s_#-]/g, '');
        return lower === 'shapelength' || lower === 'actuallength';
    });
    if (!hasShapeLength && pt) {
        const calcLen = (pt.path && pt.path.length >= 2) ? calculatePathLength(pt.path) : (pt.originalLength || 0);
        if (calcLen > 0) {
            attrs['SHAPE_Length'] = calcLen.toFixed(2);
        }
    }
    return attrs;
};

export const extractHeadersFromPoints = (points: GeoPoint[]): string[] => {
    const keysSet = new Set<string>();
    points.forEach(p => {
        if (p?.attributes) {
            Object.keys(p.attributes).forEach(k => {
                if (k && typeof k === 'string' && k.trim()) keysSet.add(k.trim());
            });
        }
        if (p?.description) {
            const descAttrs = parseDescriptionToAttributes(p.description, {});
            Object.keys(descAttrs).forEach(k => {
                if (k && typeof k === 'string' && k.trim()) keysSet.add(k.trim());
            });
        }
    });
    return Array.from(keysSet);
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

        // Also extract ExtendedData if present
        const extDataMatch = content.match(/<ExtendedData[^>]*>([\s\S]*?)<\/ExtendedData>/i);
        if (extDataMatch) {
            const extData = extDataMatch[1];
            // Match <Data name="Key"><value>Value</value></Data>
            const dataRegex = /<Data[^>]*name=['"]([^'"]+)['"][^>]*>\s*<value[^>]*>([\s\S]*?)<\/value>\s*<\/Data>/gi;
            let dMatch;
            while ((dMatch = dataRegex.exec(extData)) !== null) {
                const k = dMatch[1].trim();
                let v = dMatch[2].trim();
                if (v.startsWith('<![CDATA[')) v = v.substring(9, v.length - 3).trim();
                if (k && v && !attributes[k]) attributes[k] = stripHtml(v);
            }
            
            // Match <SimpleData name="Key">Value</SimpleData>
            const simpleDataRegex = /<SimpleData[^>]*name=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/SimpleData>/gi;
            let sdMatch;
            while ((sdMatch = simpleDataRegex.exec(extData)) !== null) {
                const k = sdMatch[1].trim();
                let v = sdMatch[2].trim();
                if (v.startsWith('<![CDATA[')) v = v.substring(9, v.length - 3).trim();
                if (k && v && !attributes[k]) attributes[k] = stripHtml(v);
            }
        }
        
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
                    const uniqueId = name ? `${name}_${points.length + 1}` : `KML_Feature_${points.length + 1}`;
                    points.push({
                        id: uniqueId,
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
                    const uniqueId = name ? `${name}_${points.length + 1}` : `KML_Point_${points.length + 1}`;
                    points.push({
                        id: uniqueId,
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

const yieldToMain = async () => {
  return new Promise(resolve => { requestAnimationFrame(() => { setTimeout(resolve, 20); }); });
};

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
               const lowerTag = String(parent.localName || parent.tagName || '').toLowerCase();
               if (lowerTag === 'folder' || lowerTag === 'document') {
                   const nameNode = Array.from(parent.childNodes).find(n => {
                       const nName = String(n.localName || n.nodeName || '').toLowerCase();
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
           const extendedDataTags = Array.from(pm.getElementsByTagName("ExtendedData"));
           extendedDataTags.forEach(extendedData => {
               const dataElements = extendedData.getElementsByTagName("Data");
               for (let i = 0; i < dataElements.length; i++) {
                   const nameAttr = dataElements[i].getAttribute("name");
                   const val = dataElements[i].getElementsByTagName("value")[0]?.textContent;
                   if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
               }
               const simpleDataElements = extendedData.getElementsByTagName("SimpleData");
               for (let i = 0; i < simpleDataElements.length; i++) {
                   const nameAttr = simpleDataElements[i].getAttribute("name");
                   const val = simpleDataElements[i].textContent;
                   if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
               }
           });
           
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
                            const tagLower = String(ancestor.nodeName || '').toLowerCase();
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
                        const uniqueId = name ? `${name}_${points.length + 1}` : `Feature_${points.length + 1}`;
                        points.push({ id: uniqueId, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, type: featureType, path: path, color, attributes, iconUrl });
                    }
                } else {
                    const parts = tuples[0].split(',');
                    if (parts.length >= 2) {
                        const uniqueId = name ? `${name}_${points.length + 1}` : `Point_${points.length + 1}`;
                        points.push({ id: uniqueId, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, type: 'Point', color, attributes, iconUrl });
                    }
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
 * Async wrapper for parseKMLContent to handle NetworkLinks with UI yielding & progress
 */
export const parseKMLContentAsync = async (kmlContent: string, onProgress?: (percent: number) => void): Promise<GeoPoint[]> => {
    const preprocessed = preprocessKML(kmlContent);
    if (onProgress) onProgress(10);
    await yieldToMain();

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(preprocessed, "text/xml");
        
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            console.warn("DOMParser encountered XML parsing error, attempting transparent regex recovery:", parserError[0]?.textContent);
            const recoveredPoints = fallbackRegexParseKML(kmlContent);
            if (recoveredPoints.length > 0) {
                if (onProgress) onProgress(100);
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
        let lastYieldTime = Date.now();

        for (let i = 0; i < placemarks.length; i++) {
            if (Date.now() - lastYieldTime > 20) {
                if (onProgress) onProgress(10 + Math.round((i / placemarks.length) * 80));
                await yieldToMain();
                lastYieldTime = Date.now();
            }

            const pm = placemarks[i];
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
                const lowerTag = String(parent.localName || parent.tagName || '').toLowerCase();
                if (lowerTag === 'folder' || lowerTag === 'document') {
                    const nameNode = Array.from(parent.childNodes).find(n => {
                        const nName = String(n.localName || n.nodeName || '').toLowerCase();
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
            const extendedDataTags = Array.from(pm.getElementsByTagName("ExtendedData"));
            extendedDataTags.forEach(extendedData => {
                const dataElements = extendedData.getElementsByTagName("Data");
                for (let j = 0; j < dataElements.length; j++) {
                    const nameAttr = dataElements[j].getAttribute("name");
                    const val = dataElements[j].getElementsByTagName("value")[0]?.textContent;
                    if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
                }
                const simpleDataElements = extendedData.getElementsByTagName("SimpleData");
                for (let j = 0; j < simpleDataElements.length; j++) {
                    const nameAttr = simpleDataElements[j].getAttribute("name");
                    const val = simpleDataElements[j].textContent;
                    if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
                }
            });
            
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
                             const tagLower = String(ancestor.nodeName || '').toLowerCase();
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
                         const uniqueId = name ? `${name}_${points.length + 1}` : `Feature_${points.length + 1}`;
                         points.push({ id: uniqueId, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, type: featureType, path: path, color, attributes, iconUrl });
                     }
                 } else {
                     const parts = tuples[0].split(',');
                     if (parts.length >= 2) {
                         const uniqueId = name ? `${name}_${points.length + 1}` : `Point_${points.length + 1}`;
                         points.push({ id: uniqueId, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, type: 'Point', color, attributes, iconUrl });
                     }
                 }
            });
        }

        const networkLinks = xmlDoc.getElementsByTagName("NetworkLink");
        for (let i = 0; i < networkLinks.length; i++) {
            let href = "";
            const linkNode = networkLinks[i].getElementsByTagName("Link")[0];
            if (linkNode) {
                href = linkNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
            } else {
                const urlNode = networkLinks[i].getElementsByTagName("Url")[0];
                if (urlNode) {
                    href = urlNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
                }
            }

            if (href && href.startsWith('http')) {
                try {
                    const parsedLink = await fetchNetworkFile(href);
                    if (parsedLink && parsedLink.data) {
                        points.push(...(parsedLink.data as GeoPoint[]));
                    }
                } catch(e: any) {
                    console.error("Failed to fetch NetworkLink:", href, e);
                    throw new Error("NETWORK_LINK_ERROR:" + (e.message || ''));
                }
            }
        }

        if (onProgress) onProgress(100);
        return points;
    } catch(e: any) {
        if (e.message && e.message.startsWith("NETWORK_LINK_ERROR:")) {
            throw new Error("فشل تحميل بيانات الخريطة المتصلة (NetworkLink). يرجى التأكد من أن رابط الخريطة المصدرية عام (Public) وليس خاصاً. " + e.message.replace("NETWORK_LINK_ERROR:", ""));
        }
        console.warn("XML parser threw exception, trying transparent regex recovery:", e);
        const recoveredPoints = fallbackRegexParseKML(kmlContent);
        if (recoveredPoints.length > 0) {
            if (onProgress) onProgress(100);
            return recoveredPoints;
        }
        throw new Error("الملف المرفوع يحتوي على أخطاء في بنية XML ولا يمكن استرجاع البيانات منه.");
    }
};


export const geoJsonToGeoPoints = (geoJson: any, sourceName: string): GeoPoint[] => {
    const points: GeoPoint[] = [];
    if (!geoJson) return points;

    const features = geoJson.features || (geoJson.type === 'Feature' ? [geoJson] : []);
    
    let counter = 1;
    for (const feature of features) {
        if (!feature.geometry) continue;
        
        const props = { ...(feature.properties || {}) };
        const id = props.id || props.ID || props.OBJECTID || props.FID || props.name || props.Name || `${sourceName}_${counter++}`;
        
        // Build a nice description
        let descParts = [];
        for (const [k, v] of Object.entries(props)) {
            if (v !== null && v !== undefined && v !== '') {
                descParts.push(`${k}: ${v}`);
            }
        }
        const description = descParts.join(' | ');
        
        const geomType = feature.geometry.type;
        const coords = feature.geometry.coordinates;

        // Common extraction for properties to attr1 and attr2
        const keys = Object.keys(props);
        let attr1 = keys.length > 0 ? `${keys[0]}: ${props[keys[0]]}` : '';
        let attr2 = keys.length > 1 ? `${keys[1]}: ${props[keys[1]]}` : '';
        
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
                    id: String(id) + (coords.length > 1 ? `_${i+1}` : ''),
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
                    id: String(id) + (coords.length > 1 ? `_${i+1}` : ''),
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


export const parseKMZ = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  try {
    if (onProgress) onProgress(10);
    const fileName = String(file.name || '').toLowerCase();
    
    // --- 1. SHAPEFILE (.shp or .zip containing .shp) ---
    if (fileName.endsWith('.shp')) {
        const arrayBuffer = await file.arrayBuffer();
        await yieldToMain();
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
        return { filename: file.name, type: 'shp', data: points, headers: extractHeadersFromPoints(points), preview: [] };
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
        return { filename: file.name, type: 'kml', data: points, headers: extractHeadersFromPoints(points), preview: [] };
    }
    
    // --- 4. ZIP (can be KMZ, SHP, GDB) ---
    if (fileName.endsWith('.zip') || fileName.endsWith('.kmz') || fileName.endsWith('.gdb')) {
        const arrayBuffer = await file.arrayBuffer();
        
        // First try to peek inside the zip without fully parsing it to see what we have
        const zip = await JSZip.loadAsync(arrayBuffer);
        const filesList = Object.keys(zip.files);
        
        const hasGDB = filesList.some(name => String(name || '').toLowerCase().includes('.gdb/') || String(name || '').toLowerCase().endsWith('.gdbtable'));
        const hasSHP = filesList.some(name => String(name || '').toLowerCase().endsWith('.shp'));
        const hasKML = filesList.some(name => String(name || '').toLowerCase().endsWith('.kml'));
        
        if (hasGDB) {
            if (onProgress) onProgress(30);
            try {
                // fgdb requires an arraybuffer
                await yieldToMain();
                const gdbResult = await fgdb(arrayBuffer);
                let points: GeoPoint[] = [];
                for (const [layerName, geojson] of Object.entries(gdbResult)) {
                     points = points.concat(geoJsonToGeoPoints(geojson, layerName));
                }
                if (onProgress) onProgress(100);
                return { filename: file.name, type: 'gdb', data: points, headers: extractHeadersFromPoints(points), preview: [] };
            } catch (err) {
                console.error("GDB Parsing Error:", err);
                throw new Error("Failed to parse Geodatabase. Make sure the ZIP contains a valid .gdb folder.");
            }
        }
        
        if (hasSHP) {
            if (onProgress) onProgress(30);
            try {
                await yieldToMain();
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
                return { filename: file.name, type: 'shp', data: points, headers: extractHeadersFromPoints(points), preview: [] };
            } catch (err) {
                console.error("Shapefile Parsing Error:", err);
                throw new Error("Failed to parse Shapefile. Make sure the ZIP contains .shp, .shx, and .dbf files.");
            }
        }
        
        if (hasKML) {
            const kmlFilename = filesList.find(name => String(name || '').toLowerCase().endsWith('.kml'));
            if (!kmlFilename) throw new Error("Invalid KMZ: No .kml file found inside.");
            let kmlContent = await zip.file(kmlFilename)?.async("string") || "";
            
            // Extract images and replace in KML
            const imageFiles = filesList.filter(name => /\.(png|jpg|jpeg|gif|svg)$/i.test(name));
            for (const imgName of imageFiles) {
                const base64 = await zip.file(imgName)?.async("base64");
                if (base64) {
                    const ext = String(imgName.split('.').pop() || '').toLowerCase();
                    const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                    const dataURI = `data:${mimeType};base64,${base64}`;
                    const safeName = imgName.split('/').pop()?.replace(/[.*+?^$!()|[\]\\]/g, '\\$&');
                    if (safeName) {
                        kmlContent = kmlContent.replace(new RegExp(`<href>[^<]*?${safeName}<\/href>`, 'gi'), `<href>${dataURI}</href>`);
                        kmlContent = kmlContent.replace(new RegExp(`src=['"][^'"]*?${safeName}['"]`, 'gi'), `src="${dataURI}"`);
                    }
                }
            }
            if (onProgress) onProgress(60);
            const points = await parseKMLContentAsync(kmlContent, onProgress);
            if (onProgress) onProgress(100);
            return { filename: file.name, type: 'kmz', data: points, headers: extractHeadersFromPoints(points), preview: [] };
        }
        
        throw new Error("Invalid ZIP file: No recognizable GDB, Shapefile, or KML content found.");
    }

    throw new Error("Unsupported file format.");
  } catch (err) { 
    throw err; 
  }
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
  const urlLower = String(url || '').toLowerCase();
  
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
        headers: extractHeadersFromPoints(points),
        preview: []
     };
  }
};
