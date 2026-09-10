import shp from 'shpjs';
import fgdb from 'fgdb';

import * as XLSX from 'xlsx';
import DxfParser from 'dxf-parser';
import JSZipModule from 'jszip';
import { ParsedFile, GeoPoint, ColumnMapping, CADLayerInfo } from '../types';
import { calculatePathLength } from './geometryService';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule && (JSZipModule as any).default) ? (JSZipModule as any).default : JSZipModule;


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

export const detectColumns = (headers: string[], sampleRows?: any[][]): ColumnMapping => {
  const map: ColumnMapping = { xColumn: '', yColumn: '' };
  if (!headers || headers.length === 0) return map;

  const linkTerms = [
    'location', 'map', 'maps', 'link', 'url', 'site', 'google', 'googlemap', 'googlemaps',
    'موقع', 'رابط', 'الرابط', 'رابط الموقع', 'رابط موقع', 'رابط الخريطة', 'رابط قوقل', 'رابط ماب',
    'قوقل ماب', 'جوجل ماب', 'موقع ماب', 'الاحداثيات', 'احداثيات', 'احداثي', 'خريطة', 'خرائط',
    'قوقل', 'جوجل', 'coords', 'coord', 'coordinate', 'coordinates', 'gps', 'geo', 'مكان', 'المكان',
    'اللوكيشن', 'لوكيشن'
  ];
  const xTerms = ['east', 'easting', 'lon', 'longitude', 'long', 'lng', 'x', 'شرق', 'شرقيات', 'خط الطول', 'الشرق', 'س', 'احداثي س', 'إحداثي س'];
  const yTerms = ['north', 'northing', 'lat', 'latitude', 'y', 'شمال', 'شماليات', 'خط العرض', 'الشمال', 'ص', 'احداثي ص', 'إحداثي ص'];
  const zTerms = ['z', 'elev', 'elevation', 'height', 'alt', 'altitude', 'المنسوب', 'ارتفاع', 'مستوى', 'ع'];
  const idTerms = ['id', 'name', 'point', 'label', 'number', 'pt', 'code', 'اسم', 'معرف', 'رقم', 'النقطة', 'كود', 'المعرف', 'اسم النقطة', 'رقم النقطة', 'اسم الموقع', 'البيان', 'الوصف'];

  const findMatch = (terms: string[]) => {
    return headers.find(h => {
      const lh = String(h || '').trim().toLowerCase();
      return terms.some(t => lh === t || lh.startsWith(t + ' ') || lh.includes(' ' + t) || lh.includes('_' + t) || lh.includes(t + '_') || (lh.length > 1 && lh === t));
    }) || '';
  };

  map.xColumn = findMatch(xTerms);
  map.yColumn = findMatch(yTerms);
  map.zColumn = findMatch(zTerms);
  map.idColumn = findMatch(idTerms);
  map.linkColumn = findMatch(linkTerms);

  // Data-driven check: if sample rows are available, inspect actual cell contents
  if (sampleRows && sampleRows.length > 0) {
    const numCols = headers.length;
    const colStats: { hasMapUrl: number; hasCoords: number; isNumeric: number; numericRange: { min: number; max: number } }[] = [];

    for (let c = 0; c < numCols; c++) {
      colStats[c] = { hasMapUrl: 0, hasCoords: 0, isNumeric: 0, numericRange: { min: Infinity, max: -Infinity } };
    }

    const checkLimit = Math.min(sampleRows.length, 25);
    for (let r = 0; r < checkLimit; r++) {
      const row = sampleRows[r];
      if (!row || !Array.isArray(row)) continue;

      for (let c = 0; c < numCols; c++) {
        const val = row[c];
        if (val === undefined || val === null) continue;
        const sVal = String(val).trim();
        if (!sVal) continue;

        const lower = sVal.toLowerCase();
        if (
          lower.includes('maps.app.goo.gl') ||
          lower.includes('goo.gl/maps') ||
          lower.includes('google.com/maps') ||
          lower.includes('maps.google.') ||
          lower.includes('waze.com') ||
          lower.includes('http://') ||
          lower.includes('https://')
        ) {
          colStats[c].hasMapUrl++;
        }

        if (
          /[0-9]+\.[0-9]{4,}[,\s;/]+[0-9]+\.[0-9]{4,}/.test(sVal) ||
          /[°\x27\x22]/.test(sVal) ||
          /!3d[0-9.-]+!4d[0-9.-]+/.test(sVal) ||
          /@[0-9.-]+,[0-9.-]+/.test(sVal)
        ) {
          colStats[c].hasCoords++;
        }

        const num = parseFloat(sVal);
        if (!isNaN(num) && Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(sVal)) {
          colStats[c].isNumeric++;
          colStats[c].numericRange.min = Math.min(colStats[c].numericRange.min, num);
          colStats[c].numericRange.max = Math.max(colStats[c].numericRange.max, num);
        }
      }
    }

    // 1. If a column predominantly has map URLs or coords string, assign linkColumn
    if (!map.linkColumn) {
      let bestLinkColIdx = -1;
      let maxLinkCount = 0;
      for (let c = 0; c < numCols; c++) {
        const score = colStats[c].hasMapUrl * 2 + colStats[c].hasCoords;
        if (score > maxLinkCount && score >= 1) {
          maxLinkCount = score;
          bestLinkColIdx = c;
        }
      }
      if (bestLinkColIdx !== -1) {
        map.linkColumn = headers[bestLinkColIdx];
      }
    }

    // 2. If x/y columns are not mapped, try finding numeric coordinate columns
    if (!map.xColumn || !map.yColumn) {
      const candidateNumericCols = colStats
        .map((st, idx) => ({ idx, header: headers[idx], ...st }))
        .filter(c => c.isNumeric >= Math.min(3, checkLimit / 2));

      // Check for WGS84 Lat/Lon ranges: Lon is ~34..56 (or -180..180), Lat is ~16..33 (or -90..90)
      const lonCand = candidateNumericCols.find(c => c.numericRange.min >= 30 && c.numericRange.max <= 60);
      const latCand = candidateNumericCols.find(c => c.numericRange.min >= 15 && c.numericRange.max <= 35);
      if (lonCand && latCand && lonCand.idx !== latCand.idx) {
        if (!map.xColumn) map.xColumn = lonCand.header;
        if (!map.yColumn) map.yColumn = latCand.header;
      }
    }
  }

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
            const suggestedMapping = detectColumns(headers, rows as any[][]);
            
            if (onProgress) onProgress(100);
            resolve({ filename: file.name, type: file.name.endsWith('.csv') ? 'csv' : 'excel', headers, data: rows, preview: rows.slice(0, 5) as any[][], suggestedMapping });
        } catch (err) { reject(err); }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};

export const ACI_PALETTE = [
  "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FFFFFF", "#808080", "#C0C0C0",
  "#FF0000", "#FFAAAA", "#BD0000", "#BD7E7E", "#810000", "#815656", "#680000", "#684545", "#4F0000", "#4F3535",
  "#FF3F00", "#FFBFAA", "#BD2E00", "#BD8D7E", "#812000", "#816056", "#681900", "#684E45", "#4F1300", "#4F3B35",
  "#FF7F00", "#FFD4AA", "#BD5E00", "#BD9D7E", "#814000", "#816B56", "#683400", "#685645", "#4F2700", "#4F4235",
  "#FFBF00", "#FFEAAA", "#BD8D00", "#BDAD7E", "#816000", "#817656", "#684E00", "#685F45", "#4F3B00", "#4F4935",
  "#FFFF00", "#FFFF4D", "#BDBD00", "#BDBD7E", "#818100", "#818156", "#686800", "#686845", "#4F4F00", "#4F4F35",
  "#BFFF00", "#E5FF4D", "#8DBD00", "#ADBD7E", "#608100", "#768156", "#4E6800", "#5F6845", "#3B4F00", "#494F35",
  "#7FFF00", "#BFFF4D", "#5EBD00", "#9DBD7E", "#408100", "#6B8156", "#346800", "#566845", "#274F00", "#424F35",
  "#3FFF00", "#99FF4D", "#2EBD00", "#8DBD7E", "#208100", "#608156", "#196800", "#4E6845", "#134F00", "#3B4F35",
  "#00FF00", "#73FF4D", "#00BD00", "#7EBD7E", "#008100", "#568156", "#006800", "#456845", "#004F00", "#354F35",
  "#00FF3F", "#4DFF73", "#00BD2E", "#7EBD8D", "#008120", "#568160", "#006819", "#45684E", "#004F13", "#354F3B",
  "#00FF7F", "#4DFFB2", "#00BD5E", "#7EBD9D", "#008140", "#56816B", "#006834", "#456856", "#004F27", "#354F42",
  "#00FFBF", "#4DFFE5", "#00BD8D", "#7EBDAE", "#008160", "#568176", "#00684E", "#45685F", "#004F3B", "#354F49",
  "#00FFFF", "#4DFFFF", "#00BDBD", "#7EBDBD", "#008181", "#568181", "#006868", "#456868", "#004F4F", "#354F4F",
  "#00BFFF", "#4DE5FF", "#008DBD", "#7EADBD", "#006081", "#567681", "#004E68", "#455F68", "#003B4F", "#35494F",
  "#007FFF", "#4DBFFF", "#005EBD", "#7E9DBD", "#004081", "#566B81", "#003468", "#455668", "#00274F", "#35424F",
  "#003FFF", "#4D99FF", "#002EBD", "#7E8DBD", "#002081", "#566081", "#001968", "#454E68", "#00134F", "#353B4F",
  "#0000FF", "#4D73FF", "#0000BD", "#7E7EBD", "#000081", "#565681", "#000068", "#454568", "#00004F", "#35354F",
  "#3F00FF", "#734DFF", "#2E00BD", "#8D7EBD", "#200081", "#605681", "#190068", "#4E4568", "#13004F", "#3B354F",
  "#7F00FF", "#B24DFF", "#5E00BD", "#9D7EBD", "#400081", "#6B5681", "#340068", "#564568", "#27004F", "#42354F",
  "#BF00FF", "#E54DFF", "#8D00BD", "#AE7EBD", "#600081", "#765681", "#4E0068", "#5F4568", "#3B004F", "#49354F",
  "#FF00FF", "#FF4DFF", "#BD00BD", "#BD7EBD", "#810081", "#815681", "#680068", "#684568", "#4F004F", "#4F354F",
  "#FF00BF", "#FF4DE5", "#BD008D", "#BD7EAE", "#810060", "#815676", "#68004E", "#68455F", "#4F003B", "#4F3549",
  "#FF007F", "#FF4DBF", "#BD005E", "#BD7E9D", "#810040", "#81566B", "#680034", "#684556", "#4F0027", "#4F3542",
  "#FF003F", "#FF4D99", "#BD002E", "#BD7E8D", "#810020", "#815660", "#680019", "#68454E", "#4F0013", "#4F353B",
  "#333333", "#505050", "#696969", "#828282", "#bebebe", "#ffffff"
];

export const getDXFColorToHex = (entityColor?: number, colorIndex?: number, layerObj?: any): string => {
  if (typeof entityColor === 'number' && entityColor > 255) {
    return '#' + entityColor.toString(16).padStart(6, '0').toUpperCase();
  }
  if (typeof colorIndex === 'number' && colorIndex >= 1 && colorIndex <= 255) {
    return ACI_PALETTE[colorIndex] || '#00c8b3';
  }
  if (typeof entityColor === 'number' && entityColor >= 1 && entityColor <= 255) {
    return ACI_PALETTE[entityColor] || '#00c8b3';
  }
  if (layerObj) {
    if (typeof layerObj.color === 'number' && layerObj.color > 255) {
      return '#' + layerObj.color.toString(16).padStart(6, '0').toUpperCase();
    }
    if (typeof layerObj.colorIndex === 'number' && layerObj.colorIndex >= 1 && layerObj.colorIndex <= 255) {
      return ACI_PALETTE[layerObj.colorIndex] || '#00c8b3';
    }
    if (typeof layerObj.color === 'number' && layerObj.color >= 1 && layerObj.color <= 255) {
      return ACI_PALETTE[layerObj.color] || '#00c8b3';
    }
  }
  return '#00c8b3';
};

export const parseDXF = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  await yieldToMain();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) reader.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 40) + 10);
    reader.onload = async (e) => {
      try {
        if (onProgress) onProgress(50);
        await yieldToMain();
        
        try {
          const text = e.target?.result as string;
          const parser = new DxfParser();
          const dxf = parser.parseSync(text);
          
          if (onProgress) onProgress(80);
          await yieldToMain();

          const points = extractPointsFromDXF(dxf);
          
          // Compute Layer statistics and unique layer metadata from CAD file
          const layerMap = new Map<string, CADLayerInfo>();
          const rawLayers = dxf.tables?.layer?.layers || {};

          // 1. Seed from layer table definitions
          Object.keys(rawLayers).forEach(lName => {
            const lObj = rawLayers[lName];
            layerMap.set(lName, {
              name: lName,
              color: getDXFColorToHex(undefined, undefined, lObj),
              count: 0,
              types: [],
              totalLength: 0,
              visible: lObj.visible !== false
            });
          });

          // 2. Accumulate entity metrics per layer
          points.forEach(pt => {
            const lName = pt.layer || 'Default';
            if (!layerMap.has(lName)) {
              layerMap.set(lName, {
                name: lName,
                color: pt.color || '#00c8b3',
                count: 0,
                types: [],
                totalLength: 0,
                visible: true
              });
            }
            const info = layerMap.get(lName)!;
            info.count += 1;
            const geomType = pt.type || 'Point';
            if (!info.types?.includes(geomType)) {
              info.types?.push(geomType);
            }
            if (pt.originalLength) {
              info.totalLength = (info.totalLength || 0) + pt.originalLength;
            }
          });

          const layersList = Array.from(layerMap.values()).filter(l => l.count > 0 || rawLayers[l.name]);
          const headers = ['ID', 'Layer', 'Type', 'Color', 'LineType', 'Length', 'Text', 'Elevation', 'X', 'Y'];
          const preview = points.slice(0, 50).map(p => p.originalRow || [
            p.id,
            p.layer || '',
            p.type || 'Point',
            p.color || '#00c8b3',
            p.attributes?.['LineType'] || 'Continuous',
            p.originalLength ? p.originalLength.toFixed(2) : '',
            p.attributes?.['Text'] || '',
            p.z !== undefined ? p.z.toString() : '',
            p.x ? p.x.toFixed(3) : '',
            p.y ? p.y.toFixed(3) : ''
          ]);

          if (onProgress) onProgress(100);
          resolve({
            filename: file.name,
            type: 'dxf',
            headers,
            data: points,
            preview,
            layers: layersList
          });
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

export const decodeHtmlEntities = (str: string): string => {
    if (!str) return '';
    return str
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ');
};

export const parseDescriptionToAttributes = (desc?: string, attributes: Record<string, string> = {}): Record<string, string> => {
    if (!desc || typeof desc !== 'string') return attributes;
    
    let cleanDesc = desc.trim();
    if (!cleanDesc) return attributes;

    // Decode HTML entities if present in encoded HTML (e.g. &lt;table&gt;)
    if (cleanDesc.includes('&lt;') || cleanDesc.includes('&gt;')) {
        cleanDesc = decodeHtmlEntities(cleanDesc);
    }

    // 1. Parse HTML <tr> blocks dynamically (Tables)
    const trBlockRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trBlockRegex.exec(cleanDesc)) !== null) {
        const rowContent = trMatch[1];
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const rawCellText = decodeHtmlEntities(stripHtml(cellMatch[1])).trim();
            if (rawCellText) cells.push(rawCellText);
        }

        if (cells.length >= 2) {
            let rawKey = cells[0];
            let rawVal = cells[1];
            if (cells.length >= 3 && /^\d+$/.test(rawKey)) {
                rawKey = cells[1];
                rawVal = cells[2];
            }

            rawKey = rawKey.replace(/[:=]+$/, '').trim();

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
                             (lowerK === 'name' && lowerV === 'value') ||
                             (rawKey === 'الحقل' && rawVal === 'القيمة') ||
                             (rawKey === 'العنصر' && rawVal === 'القيمة') ||
                             (rawKey === 'اسم الحقل' && rawVal === 'القيمة');
            if (rawKey && !isHeader && rawKey.length < 80) {
                if (!attributes[rawKey]) {
                    attributes[rawKey] = cleanAttributeValue(rawKey, rawVal);
                }
            }
        } else if (cells.length === 1) {
            const text = cells[0];
            const sepIdx = text.indexOf(':') !== -1 ? text.indexOf(':') : text.indexOf('=');
            if (sepIdx > 0 && sepIdx < text.length - 1) {
                let k = text.substring(0, sepIdx).trim().replace(/[:=]+$/, '');
                let v = text.substring(sepIdx + 1).trim();
                if (k && k.length < 80 && !attributes[k]) {
                    attributes[k] = cleanAttributeValue(k, v);
                }
            }
        }
    }

    // 2. Parse <li> tags
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(cleanDesc)) !== null) {
        const text = decodeHtmlEntities(stripHtml(liMatch[1])).trim();
        const sepIdx = text.indexOf(':') !== -1 ? text.indexOf(':') : text.indexOf('=');
        if (sepIdx > 0) {
            let k = text.substring(0, sepIdx).trim().replace(/[:=]+$/, '');
            let v = text.substring(sepIdx + 1).trim();
            if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                const tmp = k; k = v; v = tmp;
            }
            if (k && k.length < 80 && !attributes[k]) {
                attributes[k] = cleanAttributeValue(k, v);
            }
        }
    }

    // 3. Prepare text by converting HTML block/closing tags to newlines before stripping remaining HTML
    let textWithNewlines = cleanDesc
        .replace(/<\/(div|p|li|tr|h[1-6]|span|td|th|font)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');

    textWithNewlines = decodeHtmlEntities(stripHtml(textWithNewlines));

    const lines = textWithNewlines
        .split(/\r?\n/)
        .map(l => l.trim())
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
            let k = line.substring(0, sepIdx).trim().replace(/[:=]+$/, '');
            let v = line.substring(sepIdx + 1).trim();
            if (isKnownAttributeKey(v) && !isKnownAttributeKey(k)) {
                const tmp = k; k = v; v = tmp;
            }
            if (k && k.length < 80 && !attributes[k]) {
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

export const extractFolderHierarchy = (pm: Element): { folderPath: string[]; layerName: string } => {
    const folderNames: string[] = [];
    let curr = pm.parentElement;
    while (curr) {
        const tagName = String(curr.localName || curr.tagName || '').toLowerCase();
        if (tagName === 'folder' || tagName === 'networklink') {
            const nameEl = Array.from(curr.childNodes).find(n => {
                const nName = String((n as any).localName || n.nodeName || '').toLowerCase();
                return nName === 'name';
            });
            let fName = nameEl?.textContent?.trim();
            if (fName) {
                if (fName.startsWith('<![CDATA[')) {
                    fName = fName.substring(9, fName.length - 3).trim();
                }
                if (fName) folderNames.unshift(fName);
            }
        } else if (tagName === 'document') {
            const parentTag = String((curr.parentElement as any)?.localName || curr.parentElement?.tagName || '').toLowerCase();
            // Include document name if it is nested or if there are multiple documents
            const isRootKml = parentTag === 'kml';
            const hasSiblingDocs = isRootKml && (curr.parentElement?.getElementsByTagName('Document').length || 0) > 1;
            if (parentTag === 'folder' || parentTag === 'document' || hasSiblingDocs) {
                const nameEl = Array.from(curr.childNodes).find(n => {
                    const nName = String((n as any).localName || n.nodeName || '').toLowerCase();
                    return nName === 'name';
                });
                let dName = nameEl?.textContent?.trim();
                if (dName) {
                    if (dName.startsWith('<![CDATA[')) {
                        dName = dName.substring(9, dName.length - 3).trim();
                    }
                    if (dName) folderNames.unshift(dName);
                }
            }
        }
        curr = curr.parentElement;
    }

    const layerName = folderNames.length > 0 ? folderNames[folderNames.length - 1] : 'KML Import';
    return {
        folderPath: folderNames.length > 0 ? folderNames : [layerName],
        layerName
    };
};

const getActiveFolderPathRegex = (kml: string, charIndex: number): { folderPath: string[]; layerName: string } => {
    const textBefore = kml.substring(0, charIndex);
    const tagRegex = /<(\/)?(Folder)[\s>]/gi;
    let m;
    const activeOpenIndices: number[] = [];
    while ((m = tagRegex.exec(textBefore)) !== null) {
        if (!m[1]) {
            activeOpenIndices.push(m.index);
        } else {
            activeOpenIndices.pop();
        }
    }
    const folderNames: string[] = [];
    for (const openIdx of activeOpenIndices) {
        const afterTag = textBefore.substring(openIdx, Math.min(openIdx + 600, textBefore.length));
        const nameMatch = afterTag.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
        if (nameMatch) {
            let fName = nameMatch[1].trim();
            if (fName.startsWith('<![CDATA[')) {
                fName = fName.substring(9, fName.length - 3).trim();
            }
            if (fName) folderNames.push(fName);
        }
    }
    const layerName = folderNames.length > 0 ? folderNames[folderNames.length - 1] : 'KML Import (Recovered)';
    return {
        folderPath: folderNames.length > 0 ? folderNames : [layerName],
        layerName
    };
};

const fallbackRegexParseKML = (kml: string): GeoPoint[] => {
    const points: GeoPoint[] = [];
    const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
    let match;
    let index = 1;
    
    while ((match = placemarkRegex.exec(kml)) !== null) {
        const content = match[1];
        
        const { folderPath, layerName } = getActiveFolderPathRegex(kml, match.index);
        
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
                        folderPath: folderPath,
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
                        folderPath: folderPath,
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

           const { folderPath, layerName } = extractFolderHierarchy(pm);

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
               const schemaDataElements = extendedData.getElementsByTagName("SchemaData");
               for (let s = 0; s < schemaDataElements.length; s++) {
                   const sd = schemaDataElements[s];
                   for (let c = 0; c < sd.children.length; c++) {
                       const child = sd.children[c];
                       const tagName = child.localName || child.tagName;
                       if (tagName && tagName.toLowerCase() !== 'simpledata') {
                           const key = child.getAttribute('name') || tagName;
                           const val = child.textContent?.trim();
                           if (key && val && !attributes[key]) {
                               attributes[key.trim()] = val;
                           }
                       }
                   }
               }
               for (let c = 0; c < extendedData.children.length; c++) {
                   const child = extendedData.children[c];
                   const tagName = child.localName || child.tagName;
                   if (tagName && !['data', 'schemadata'].includes(tagName.toLowerCase())) {
                       const key = child.getAttribute('name') || tagName;
                       const val = child.textContent?.trim();
                       if (key && val && !attributes[key]) {
                           attributes[key.trim()] = val;
                       }
                   }
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
                        points.push({ id: uniqueId, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, folderPath, type: featureType, path: path, color, attributes, iconUrl });
                    }
                } else {
                    const parts = tuples[0].split(',');
                    if (parts.length >= 2) {
                        const uniqueId = name ? `${name}_${points.length + 1}` : `Point_${points.length + 1}`;
                        points.push({ id: uniqueId, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, folderPath, type: 'Point', color, attributes, iconUrl });
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
export const parseKMLContentAsync = async (kmlContent: string, onProgress?: (percent: number) => void, zipContext?: any): Promise<GeoPoint[]> => {
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

            const { folderPath, layerName } = extractFolderHierarchy(pm);

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
                const schemaDataElements = extendedData.getElementsByTagName("SchemaData");
                for (let s = 0; s < schemaDataElements.length; s++) {
                    const sd = schemaDataElements[s];
                    for (let c = 0; c < sd.children.length; c++) {
                        const child = sd.children[c];
                        const tagName = child.localName || child.tagName;
                        if (tagName && tagName.toLowerCase() !== 'simpledata') {
                            const key = child.getAttribute('name') || tagName;
                            const val = child.textContent?.trim();
                            if (key && val && !attributes[key]) {
                                attributes[key.trim()] = val;
                            }
                        }
                    }
                }
                for (let c = 0; c < extendedData.children.length; c++) {
                    const child = extendedData.children[c];
                    const tagName = child.localName || child.tagName;
                    if (tagName && !['data', 'schemadata'].includes(tagName.toLowerCase())) {
                        const key = child.getAttribute('name') || tagName;
                        const val = child.textContent?.trim();
                        if (key && val && !attributes[key]) {
                            attributes[key.trim()] = val;
                        }
                    }
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
                         points.push({ id: uniqueId, x: path[0].x, y: path[0].y, z: path[0].z, description: desc, layer: layerName, folderPath, type: featureType, path: path, color, attributes, iconUrl });
                     }
                 } else {
                     const parts = tuples[0].split(',');
                     if (parts.length >= 2) {
                         const uniqueId = name ? `${name}_${points.length + 1}` : `Point_${points.length + 1}`;
                         points.push({ id: uniqueId, x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parts.length > 2 ? parseFloat(parts[2]) : 0, description: desc, layer: layerName, folderPath, type: 'Point', color, attributes, iconUrl });
                     }
                 }
            });
        }

        const networkLinks = xmlDoc.getElementsByTagName("NetworkLink");
        for (let i = 0; i < networkLinks.length; i++) {
            const nl = networkLinks[i];
            let href = "";
            const linkNode = nl.getElementsByTagName("Link")[0];
            if (linkNode) {
                href = linkNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
            } else {
                const urlNode = nl.getElementsByTagName("Url")[0];
                if (urlNode) {
                    href = urlNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
                }
            }

            // Extract the NetworkLink's direct name
            const nlNameNode = Array.from(nl.childNodes).find(n => {
                const nName = String((n as any).localName || n.nodeName || '').toLowerCase();
                return nName === 'name';
            });
            let nlName = nlNameNode?.textContent?.trim() || '';
            if (nlName.startsWith('<![CDATA[')) {
                nlName = nlName.substring(9, nlName.length - 3).trim();
            }

            // Extract parent folder hierarchy of the NetworkLink element
            const { folderPath: nlParentPath } = extractFolderHierarchy(nl);
            let nlPrefixPath: string[] = [];
            if (nlName) {
                if (nlParentPath.length > 0 && nlParentPath[nlParentPath.length - 1] === nlName) {
                    nlPrefixPath = nlParentPath;
                } else {
                    nlPrefixPath = [...nlParentPath, nlName];
                }
            } else {
                nlPrefixPath = nlParentPath;
            }

            href = href.replace(/&amp;/g, '&');
            
            // Check if href is a local file in zipContext
            let childPoints: GeoPoint[] | null = null;
            if (zipContext && href && !href.startsWith('http')) {
                const cleanHref = href.replace(/^\.\//, '').trim();
                const zipFiles = Object.keys(zipContext.files);
                const matchingFile = zipFiles.find(f => f === cleanHref || f.toLowerCase() === cleanHref.toLowerCase() || f.endsWith('/' + cleanHref));
                
                if (matchingFile) {
                    try {
                        if (matchingFile.toLowerCase().endsWith('.kmz')) {
                            const subBuffer = await zipContext.file(matchingFile)?.async("arraybuffer");
                            if (subBuffer) {
                                const subZip = await JSZip.loadAsync(subBuffer);
                                const subKmlName = Object.keys(subZip.files).find(name => name.toLowerCase().endsWith('.kml')) || 'doc.kml';
                                const subKmlText = await subZip.file(subKmlName)?.async("string") || "";
                                if (subKmlText) {
                                    childPoints = await parseKMLContentAsync(subKmlText, undefined, subZip);
                                }
                            }
                        } else if (matchingFile.toLowerCase().endsWith('.kml')) {
                            const subKmlText = await zipContext.file(matchingFile)?.async("string") || "";
                            if (subKmlText) {
                                childPoints = await parseKMLContentAsync(subKmlText, undefined, zipContext);
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to load local NetworkLink from zip:", matchingFile, err);
                    }
                }
            }

            // If not found in zip or is an HTTP url, fetch remotely
            if (!childPoints && href && href.startsWith('http')) {
                if (onProgress) onProgress(70 + Math.round((i / networkLinks.length) * 25));
                await yieldToMain();
                try {
                    const parsedLink = await fetchNetworkFile(href, (pct) => {
                        if (onProgress) onProgress(70 + Math.round((pct / 100) * 25));
                    });
                    if (parsedLink && parsedLink.data) {
                        childPoints = parsedLink.data as GeoPoint[];
                    }
                } catch(e: any) {
                    console.warn("Failed to fetch NetworkLink:", href, e);
                    if (points.length === 0 && i === networkLinks.length - 1) {
                        throw new Error("NETWORK_LINK_ERROR:" + (e.message || ''));
                    }
                }
            }

            if (childPoints && childPoints.length > 0) {
                childPoints.forEach(lp => {
                    const existingPath = (lp.folderPath && lp.folderPath.length > 0) ? lp.folderPath : (lp.layer ? [lp.layer] : []);
                    if (nlPrefixPath.length > 0) {
                        lp.folderPath = [...nlPrefixPath, ...existingPath];
                    } else {
                        lp.folderPath = existingPath;
                    }
                    if (nlName && (!lp.layer || lp.layer === 'KML Import' || lp.layer === 'Default')) {
                        lp.layer = nlName;
                    }
                });
                points.push(...childPoints);
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
            const points = await parseKMLContentAsync(kmlContent, onProgress, zip);
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

export const extractPointsFromDXF = (dxfInput: any): GeoPoint[] => {
  if (!dxfInput) return [];

  // If already an array of GeoPoints (e.g. from transformPoints or state)
  if (Array.isArray(dxfInput) && dxfInput.length > 0 && ('x' in dxfInput[0] || 'y' in dxfInput[0]) && ('layer' in dxfInput[0] || 'color' in dxfInput[0])) {
    return dxfInput as GeoPoint[];
  }

  const entities: any[] = Array.isArray(dxfInput) ? dxfInput : (dxfInput.entities || []);
  const rawLayers: Record<string, any> = (!Array.isArray(dxfInput) && dxfInput.tables?.layer?.layers) ? dxfInput.tables.layer.layers : {};

  const points: GeoPoint[] = [];
  let counter = 1;

  const getExtras = (entity: any) => {
    const parts: string[] = [];
    const ignored = new Set(['type', 'layer', 'handle', 'vertices', 'position', 'center', 'startPoint', 'endPoint', 'insertionPoint', 'box', 'max', 'min', 'color', 'colorIndex', 'lineType']);
    Object.keys(entity).forEach(k => {
      if (!ignored.has(k)) {
        const val = entity[k];
        if (val !== null && val !== undefined && typeof val !== 'object' && typeof val !== 'function') {
          parts.push(`${k}: ${val}`);
        }
      }
    });
    return parts.join(' | ');
  };

  entities.forEach(entity => {
    const layer = String(entity.layer || 'Default').trim();
    const layerObj = rawLayers[layer];
    const colorHex = getDXFColorToHex(entity.color, entity.colorIndex, layerObj);
    const lineType = entity.lineType || layerObj?.lineType || 'Continuous';
    const folderPath = [layer];
    const extras = getExtras(entity);

    // 1. POINT & INSERT (Blocks)
    if ((entity.type === 'POINT' || entity.type === 'INSERT') && (entity.position || entity.insertionPoint)) {
      const pos = entity.position || entity.insertionPoint;
      const id = String(entity.name || entity.handle || `CAD_${counter++}`);
      const textVal = entity.name || '';
      const startX = pos.x || 0;
      const startY = pos.y || 0;
      const zVal = pos.z !== undefined ? pos.z : 0;
      
      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': entity.type,
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': '',
        'Text': textVal,
        'Elevation': zVal.toString(),
        'X': startX.toFixed(3),
        'Y': startY.toFixed(3)
      };

      points.push({
        id,
        x: startX,
        y: startY,
        z: zVal,
        layer,
        folderPath,
        color: colorHex,
        description: entity.type === 'INSERT' ? `Block: ${entity.name || id}` : `CAD Point (${id})`,
        attr1: extras,
        type: 'Point',
        attributes: attrs,
        originalRow: [id, layer, entity.type, colorHex, lineType, '', textVal, zVal.toString(), startX.toFixed(3), startY.toFixed(3)]
      });
    }
    // 2. CIRCLE
    else if (entity.type === 'CIRCLE' && entity.center) {
      const { center, radius = 0 } = entity;
      const id = String(entity.handle || `CAD_${counter++}`);
      const circumference = 2 * Math.PI * radius;
      const zVal = center.z || 0;
      
      // Approximate circle path with 32 segments for accurate geographic representation
      const numSegments = 32;
      const path: { x: number; y: number; z?: number }[] = [];
      for (let i = 0; i <= numSegments; i++) {
        const theta = (i / numSegments) * 2 * Math.PI;
        path.push({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta),
          z: zVal
        });
      }

      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': 'Circle',
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': circumference.toFixed(2),
        'Radius': radius.toFixed(2),
        'Text': '',
        'Elevation': zVal.toString(),
        'X': center.x.toFixed(3),
        'Y': center.y.toFixed(3)
      };

      points.push({
        id,
        x: center.x,
        y: center.y,
        z: zVal,
        layer,
        folderPath,
        color: colorHex,
        originalLength: circumference,
        length: circumference,
        description: `Circle (R=${radius.toFixed(2)}m, L=${circumference.toFixed(2)}m)`,
        attr1: extras,
        type: 'LineString',
        path,
        attributes: attrs,
        originalRow: [id, layer, 'Circle', colorHex, lineType, circumference.toFixed(2), '', zVal.toString(), center.x.toFixed(3), center.y.toFixed(3)]
      });
    }
    // 3. ARC
    else if (entity.type === 'ARC' && entity.center) {
      const { center, radius = 0, startAngle = 0, endAngle = 0 } = entity;
      const id = String(entity.handle || `CAD_${counter++}`);
      let sAngle = startAngle;
      let eAngle = endAngle;
      if (eAngle <= sAngle) eAngle += 360;
      const sweep = eAngle - sAngle;
      const arcLength = radius * (sweep * (Math.PI / 180));
      const numSegments = Math.max(12, Math.ceil(sweep / 5));
      const step = sweep / numSegments;
      const path: { x: number; y: number; z?: number }[] = [];
      const zVal = center.z || 0;

      for (let i = 0; i <= numSegments; i++) {
        const theta = (sAngle + (step * i)) * (Math.PI / 180);
        path.push({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta),
          z: zVal
        });
      }

      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': 'Arc',
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': arcLength.toFixed(2),
        'Radius': radius.toFixed(2),
        'Text': '',
        'Elevation': zVal.toString(),
        'X': path[0].x.toFixed(3),
        'Y': path[0].y.toFixed(3)
      };

      points.push({
        id,
        x: path[0].x,
        y: path[0].y,
        z: zVal,
        layer,
        folderPath,
        color: colorHex,
        originalLength: arcLength,
        length: arcLength,
        description: `Arc (R=${radius.toFixed(2)}m, L=${arcLength.toFixed(2)}m)`,
        attr1: extras,
        type: 'LineString',
        path,
        attributes: attrs,
        originalRow: [id, layer, 'Arc', colorHex, lineType, arcLength.toFixed(2), '', zVal.toString(), path[0].x.toFixed(3), path[0].y.toFixed(3)]
      });
    }
    // 4. LWPOLYLINE & POLYLINE
    else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices && entity.vertices.length > 0) {
      const id = String(entity.handle || `CAD_${counter++}`);
      const path = entity.vertices.map((v: any) => ({ x: v.x, y: v.y, z: v.z || 0 }));
      const isClosed = Boolean(entity.shape || entity.closed);
      if (isClosed && path.length > 2) {
        path.push({ ...path[0] });
      }

      let totalLen = 0;
      for (let i = 0; i < path.length - 1; i++) {
        totalLen += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y, (path[i + 1].z || 0) - (path[i].z || 0));
      }

      const geomType = isClosed ? 'Polygon' : 'LineString';
      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': entity.type,
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': totalLen.toFixed(2),
        'Text': '',
        'Elevation': path[0]?.z !== undefined ? path[0].z.toString() : '',
        'X': path[0].x.toFixed(3),
        'Y': path[0].y.toFixed(3)
      };

      points.push({
        id,
        x: path[0].x,
        y: path[0].y,
        z: path[0].z || 0,
        layer,
        folderPath,
        color: colorHex,
        originalLength: totalLen,
        length: totalLen,
        description: `Polyline (L=${totalLen.toFixed(2)}m)`,
        attr1: extras,
        type: geomType,
        path,
        attributes: attrs,
        originalRow: [id, layer, entity.type, colorHex, lineType, totalLen.toFixed(2), '', (path[0]?.z || 0).toString(), path[0].x.toFixed(3), path[0].y.toFixed(3)]
      });
    }
    // 5. LINE
    else if (entity.type === 'LINE' && entity.vertices && entity.vertices.length >= 2) {
      const id = String(entity.handle || `CAD_${counter++}`);
      const p1 = entity.vertices[0];
      const p2 = entity.vertices[1];
      const path = [
        { x: p1.x, y: p1.y, z: p1.z || 0 },
        { x: p2.x, y: p2.y, z: p2.z || 0 }
      ];
      const lineLen = Math.hypot(p2.x - p1.x, p2.y - p1.y, (p2.z || 0) - (p1.z || 0));

      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': 'Line',
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': lineLen.toFixed(2),
        'Text': '',
        'Elevation': (p1.z || 0).toString(),
        'X': p1.x.toFixed(3),
        'Y': p1.y.toFixed(3)
      };

      points.push({
        id,
        x: p1.x,
        y: p1.y,
        z: p1.z || 0,
        layer,
        folderPath,
        color: colorHex,
        originalLength: lineLen,
        length: lineLen,
        description: `Line (L=${lineLen.toFixed(2)}m)`,
        attr1: extras,
        type: 'LineString',
        path,
        attributes: attrs,
        originalRow: [id, layer, 'Line', colorHex, lineType, lineLen.toFixed(2), '', (p1.z || 0).toString(), p1.x.toFixed(3), p1.y.toFixed(3)]
      });
    }
    // 6. SPLINE
    else if (entity.type === 'SPLINE' && (entity.controlPoints || entity.fitPoints || entity.vertices)) {
      const id = String(entity.handle || `CAD_${counter++}`);
      const rawPts = entity.controlPoints || entity.fitPoints || entity.vertices || [];
      const path = rawPts.map((p: any) => ({ x: p.x, y: p.y, z: p.z || 0 }));
      let totalLen = 0;
      for (let i = 0; i < path.length - 1; i++) {
        totalLen += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y, (path[i + 1].z || 0) - (path[i].z || 0));
      }

      if (path.length > 0) {
        const attrs: Record<string, string> = {
          'Layer': layer,
          'Type': 'Spline',
          'Handle': String(entity.handle || id),
          'Color': colorHex,
          'LineType': lineType,
          'Length': totalLen.toFixed(2),
          'Text': '',
          'Elevation': (path[0]?.z || 0).toString(),
          'X': path[0].x.toFixed(3),
          'Y': path[0].y.toFixed(3)
        };

        points.push({
          id,
          x: path[0].x,
          y: path[0].y,
          z: path[0].z || 0,
          layer,
          folderPath,
          color: colorHex,
          originalLength: totalLen,
          length: totalLen,
          description: `Spline (L=${totalLen.toFixed(2)}m)`,
          attr1: extras,
          type: 'LineString',
          path,
          attributes: attrs,
          originalRow: [id, layer, 'Spline', colorHex, lineType, totalLen.toFixed(2), '', (path[0]?.z || 0).toString(), path[0].x.toFixed(3), path[0].y.toFixed(3)]
        });
      }
    }
    // 7. 3DFACE / SOLID / HATCH
    else if ((entity.type === '3DFACE' || entity.type === 'SOLID' || entity.type === 'HATCH') && entity.vertices && entity.vertices.length >= 3) {
      const id = String(entity.handle || `CAD_${counter++}`);
      const path = entity.vertices.map((v: any) => ({ x: v.x, y: v.y, z: v.z || 0 }));
      path.push({ ...path[0] });

      const attrs: Record<string, string> = {
        'Layer': layer,
        'Type': entity.type,
        'Handle': String(entity.handle || id),
        'Color': colorHex,
        'LineType': lineType,
        'Length': '',
        'Text': '',
        'Elevation': (path[0]?.z || 0).toString(),
        'X': path[0].x.toFixed(3),
        'Y': path[0].y.toFixed(3)
      };

      points.push({
        id,
        x: path[0].x,
        y: path[0].y,
        z: path[0].z || 0,
        layer,
        folderPath,
        color: colorHex,
        description: `CAD ${entity.type}`,
        attr1: extras,
        type: 'Polygon',
        path,
        attributes: attrs,
        originalRow: [id, layer, entity.type, colorHex, lineType, '', '', (path[0]?.z || 0).toString(), path[0].x.toFixed(3), path[0].y.toFixed(3)]
      });
    }
    // 8. TEXT & MTEXT
    else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const pos = entity.position || entity.insertionPoint;
      if (pos) {
        const id = String(entity.handle || `CAD_${counter++}`);
        const textContent = String(entity.text || entity.string || '').trim();
        const startX = pos.x || 0;
        const startY = pos.y || 0;
        const zVal = pos.z !== undefined ? pos.z : 0;

        const attrs: Record<string, string> = {
          'Layer': layer,
          'Type': entity.type,
          'Handle': String(entity.handle || id),
          'Color': colorHex,
          'LineType': lineType,
          'Length': '',
          'Text': textContent,
          'Elevation': zVal.toString(),
          'X': startX.toFixed(3),
          'Y': startY.toFixed(3)
        };

        points.push({
          id: textContent || id,
          x: startX,
          y: startY,
          z: zVal,
          layer,
          folderPath,
          color: colorHex,
          description: `CAD Text: ${textContent}`,
          attr1: extras,
          type: 'Point',
          attributes: attrs,
          originalRow: [id, layer, entity.type, colorHex, lineType, '', textContent, zVal.toString(), startX.toFixed(3), startY.toFixed(3)]
        });
      }
    }
  });

  return points;
};

/**
 * جلب خريطة Google My Maps من الرابط وتحليلها عن طريق بروكسي CORS
 */
export const fetchMyMapsKML = async (url: string, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  await yieldToMain();

  const midMatch = url.match(/mid=([a-zA-Z0-9_-]+)/);
  if (!midMatch) {
    throw new Error("رابط غير صالح. يرجى توفير رابط خريطة Google My Maps يحتوي على معرّف الخريطة (mid=...).");
  }
  const mid = midMatch[1];
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;
  
  const proxyEndpoints = [
    `/api/proxy?url=${encodeURIComponent(kmlUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(kmlUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(kmlUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(kmlUrl)}`
  ];

  let kmlContent = "";
  let lastError = null;

  if (onProgress) onProgress(25);
  await yieldToMain();

  for (let i = 0; i < proxyEndpoints.length; i++) {
    const endpoint = proxyEndpoints[i];
    try {
      if (onProgress) onProgress(25 + Math.round((i / proxyEndpoints.length) * 25));
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
      if (onProgress) onProgress(50);
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

  if (onProgress) onProgress(60);
  await yieldToMain();

  const points = await parseKMLContentAsync(kmlContent, (p) => {
    if (onProgress) onProgress(60 + Math.round((p / 100) * 38));
  });

  if (onProgress) onProgress(100);

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
  
  let targetUrl = url.trim().replace(/&amp;/g, '&');
  if (!targetUrl.includes('/kml?')) {
    const midMatch = targetUrl.match(/mid=([a-zA-Z0-9_-]+)/);
    if (midMatch) {
      targetUrl = `https://www.google.com/maps/d/kml?mid=${midMatch[1]}&forcekml=1`;
    }
  } else if (!targetUrl.includes('forcekml=1')) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'forcekml=1';
  }
  
  const proxyEndpoints = [
    `/api/proxy?url=${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(targetUrl)}`
  ];
  
  let response: Response | null = null;
  let lastError: any = null;

  for (const endpoint of proxyEndpoints) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        response = res;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!response) {
    try {
      const directRes = await fetch(targetUrl);
      if (directRes.ok) response = directRes;
    } catch (e) {
      // Direct fetch failed due to CORS
    }
  }

  if (!response || !response.ok) {
    throw new Error("تعذر جلب البيانات من الرابط الشبكي بسبب قيود الحماية (CORS) أو أن الرابط غير متاح للعامة.");
  }

  if (onProgress) onProgress(40);
  
  const contentType = response.headers.get('content-type') || '';
  const urlLower = String(targetUrl || '').toLowerCase();
  
  // Check if it is KMZ (zip) or KML (text)
  if (urlLower.endsWith('.kmz') || urlLower.endsWith('.zip') || contentType.includes('application/vnd.google-earth.kmz') || contentType.includes('application/zip')) {
     const buffer = await response.arrayBuffer();
     const file = new File([buffer], "network_file.kmz", { type: "application/vnd.google-earth.kmz" });
     return await parseKMZ(file, (p) => onProgress && onProgress(40 + (p * 0.6)));
  } else {
     const text = await response.text();
     if (!text || !text.includes('<kml')) {
         throw new Error("الملف الشبكي لا يحتوي على بيانات KML صالحة.");
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
