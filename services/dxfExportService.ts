import { GeoPoint } from '../types';

/**
 * Convert hex or named color to RGB
 */
const parseColorToRgb = (colorStr?: string): { r: number; g: number; b: number } => {
  if (!colorStr) return { r: 255, g: 255, b: 255 };
  
  const str = colorStr.trim().toLowerCase();
  
  const namedColors: Record<string, [number, number, number]> = {
    red: [255, 0, 0],
    green: [0, 255, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    orange: [255, 165, 0],
    purple: [128, 0, 128],
    white: [255, 255, 255],
    black: [0, 0, 0],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    brown: [165, 42, 42],
    pink: [255, 192, 203],
    lime: [50, 205, 50],
    teal: [0, 128, 128],
    navy: [0, 0, 128],
    gold: [255, 215, 0]
  };

  if (namedColors[str]) {
    const [r, g, b] = namedColors[str];
    return { r, g, b };
  }

  let hex = str.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length === 6 || hex.length === 8) {
    const num = parseInt(hex.substring(0, 6), 16);
    if (!isNaN(num)) {
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }
  }

  // Check rgb(r, g, b) format
  const rgbMatch = str.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return {
      r: Math.min(255, parseInt(rgbMatch[1], 10)),
      g: Math.min(255, parseInt(rgbMatch[2], 10)),
      b: Math.min(255, parseInt(rgbMatch[3], 10))
    };
  }

  return { r: 255, g: 255, b: 255 };
};

/**
 * Match RGB to closest AutoCAD Color Index (ACI 1-255)
 */
const rgbToAci = (r: number, g: number, b: number): number => {
  const standardAci = [
    { aci: 1, r: 255, g: 0, b: 0 },       // Red
    { aci: 2, r: 255, g: 255, b: 0 },     // Yellow
    { aci: 3, r: 0, g: 255, b: 0 },       // Green
    { aci: 4, r: 0, g: 255, b: 255 },     // Cyan
    { aci: 5, r: 0, g: 0, b: 255 },       // Blue
    { aci: 6, r: 255, g: 0, b: 255 },     // Magenta
    { aci: 7, r: 255, g: 255, b: 255 },   // White / Black
    { aci: 8, r: 128, g: 128, b: 128 },   // Dark Gray
    { aci: 9, r: 192, g: 192, b: 192 },   // Light Gray
    { aci: 30, r: 255, g: 127, b: 0 },    // Orange
    { aci: 40, r: 255, g: 191, b: 0 },    // Amber
    { aci: 50, r: 255, g: 255, b: 0 },    // Yellow
    { aci: 90, r: 0, g: 255, b: 127 },    // Light Green
    { aci: 130, r: 0, g: 127, b: 255 },   // Sky Blue
    { aci: 170, r: 127, g: 0, b: 255 },   // Purple
    { aci: 210, r: 139, g: 69, b: 19 }    // Brown
  ];

  let closest = 7;
  let minDistance = Infinity;
  for (const item of standardAci) {
    const d = Math.hypot(r - item.r, g - item.g, b - item.b);
    if (d < minDistance) {
      minDistance = d;
      closest = item.aci;
    }
  }
  return closest;
};

/**
 * Convert RGB to 24-bit TrueColor integer (Group 420 in DXF)
 */
const rgbToTrueColor = (r: number, g: number, b: number): number => {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
};

/**
 * Clean layer name to adhere to strict AutoCAD layer naming specifications
 */
const sanitizeLayerName = (name?: string): string => {
  if (!name || !name.trim()) return '0';
  const clean = name.replace(/[<>/\":;?*|=,\r\n\t]/g, '_').trim();
  return clean || '0';
};

interface PreparedEntity {
  item: GeoPoint;
  layer: string;
  aci: number;
  trueColor: number;
  coords: { x: number; y: number; z: number }[];
  isPolygon: boolean;
  isLine: boolean;
  isPoint: boolean;
  label?: string;
}

/**
 * Generate a complete, fully standards-compliant AutoCAD 2000 (AC1015) DXF file
 * Compatible with AutoCAD, Civil 3D, QGIS, ArcGIS, MicroStation, BricsCAD, etc.
 */
export const generateDXF = (data: GeoPoint[]): string => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n`;
  }

  let handleSeed = 0x30;
  const getNextHandle = () => (handleSeed++).toString(16).toUpperCase();

  // Bounding box tracking for AutoCAD zoom-extents & viewport initialization
  let minX = Infinity;
  let minY = Infinity;
  let minZ = 0;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = 0;

  const layerSet = new Map<string, { aci: number; trueColor: number }>();
  // Layer 0 is always required
  layerSet.set('0', { aci: 7, trueColor: 16777215 });

  const preparedEntities: PreparedEntity[] = [];

  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    if (!p) continue;

    let pts: { x: number; y: number; z: number }[] = [];

    if (p.path && Array.isArray(p.path) && p.path.length > 0) {
      for (let j = 0; j < p.path.length; j++) {
        const pt = p.path[j];
        if (pt && typeof pt.x === 'number' && typeof pt.y === 'number' && !isNaN(pt.x) && !isNaN(pt.y)) {
          pts.push({
            x: pt.x,
            y: pt.y,
            z: typeof pt.z === 'number' && !isNaN(pt.z) ? pt.z : 0
          });
        }
      }
    }

    if (pts.length === 0) {
      const x = typeof p.x === 'number' ? p.x : parseFloat(String(p.x || ''));
      const y = typeof p.y === 'number' ? p.y : parseFloat(String(p.y || ''));
      const z = typeof p.z === 'number' ? p.z : 0;
      if (!isNaN(x) && !isNaN(y)) {
        pts.push({ x, y, z: !isNaN(z) ? z : 0 });
      }
    }

    if (pts.length === 0) continue;

    // Update bounding box
    for (let k = 0; k < pts.length; k++) {
      const pt = pts[k];
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
      if (pt.z > maxZ) maxZ = pt.z;
    }

    // Geometry classification
    const isLine = pts.length >= 2 && p.type !== 'Polygon';
    const isPolygon = p.type === 'Polygon' || (pts.length >= 3 && (p.path && p.path[0]?.x === p.path[p.path.length - 1]?.x && p.path[0]?.y === p.path[p.path.length - 1]?.y));
    const isPoint = pts.length === 1 || p.type === 'Point';

    const layerName = sanitizeLayerName(p.layer || (isPoint ? 'Points' : isPolygon ? 'Polygons' : 'Pipes_Lines'));
    const rgb = parseColorToRgb(p.color);
    const aci = rgbToAci(rgb.r, rgb.g, rgb.b);
    const trueColor = rgbToTrueColor(rgb.r, rgb.g, rgb.b);

    if (!layerSet.has(layerName)) {
      layerSet.set(layerName, { aci, trueColor });
    }

    // Extract text label if available
    const label = p.description || p.attributes?.['ASSETNAME'] || p.attributes?.['STREETNAME'] || (p.id ? String(p.id) : undefined);

    preparedEntities.push({
      item: p,
      layer: layerName,
      aci,
      trueColor,
      coords: pts,
      isPolygon,
      isLine,
      isPoint,
      label
    });
  }

  // Safe fallback bounds if drawing is empty or singular
  if (minX === Infinity || isNaN(minX)) {
    minX = 0; minY = 0; minZ = 0;
    maxX = 100; maxY = 100; maxZ = 0;
  }
  if (minX === maxX) { minX -= 10; maxX += 10; }
  if (minY === maxY) { minY -= 10; maxY += 10; }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const viewHeight = Math.max(maxY - minY, 10) * 1.15;
  const viewWidth = Math.max(maxX - minX, 10) * 1.15;
  const textHeight = Math.max(viewHeight / 200, 1.2);

  let dxf = '';

  // ==========================================
  // 1. HEADER SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nHEADER\n';
  dxf += '  9\n$ACADVER\n  1\nAC1015\n'; // AutoCAD 2000 format
  dxf += '  9\n$HANDSEED\n  5\nFFFF\n';
  dxf += '  9\n$MEASUREMENT\n 70\n1\n'; // Metric (meters / mm)
  dxf += '  9\n$INSUNITS\n 70\n6\n'; // Meters
  dxf += '  9\n$LUNITS\n 70\n2\n'; // Decimal units
  dxf += '  9\n$PDMODE\n 70\n34\n'; // Point display: circle with cross
  dxf += '  9\n$PDSIZE\n 40\n0.0\n'; // Relative scale point size
  dxf += `  9\n$EXTMIN\n 10\n${minX}\n 20\n${minY}\n 30\n${minZ}\n`;
  dxf += `  9\n$EXTMAX\n 10\n${maxX}\n 20\n${maxY}\n 30\n${maxZ}\n`;
  dxf += `  9\n$LIMMIN\n 10\n${minX}\n 20\n${minY}\n`;
  dxf += `  9\n$LIMMAX\n 10\n${maxX}\n 20\n${maxY}\n`;
  dxf += '  0\nENDSEC\n';

  // ==========================================
  // 2. CLASSES SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nCLASSES\n  0\nENDSEC\n';

  // ==========================================
  // 3. TABLES SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nTABLES\n';

  // VPORT Table (*ACTIVE viewport with auto-zoom to extents)
  dxf += '  0\nTABLE\n  2\nVPORT\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n1\n';
  dxf += '  0\nVPORT\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbViewportTableRecord\n  2\n*ACTIVE\n 70\n0\n';
  dxf += ` 10\n0.0\n 20\n0.0\n 11\n1.0\n 21\n1.0\n 12\n${centerX}\n 22\n${centerY}\n 40\n${viewHeight}\n 41\n${viewWidth / (viewHeight || 1)}\n`;
  dxf += '  0\nENDTAB\n';

  // LTYPE Table (Continuous Line)
  dxf += '  0\nTABLE\n  2\nLTYPE\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n1\n';
  dxf += '  0\nLTYPE\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n  2\nCONTINUOUS\n 70\n0\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n';
  dxf += '  0\nENDTAB\n';

  // LAYER Table (All detected layers + 0)
  dxf += '  0\nTABLE\n  2\nLAYER\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n' + layerSet.size + '\n';
  layerSet.forEach((style, layerName) => {
    dxf += '  0\nLAYER\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\n' + layerName + '\n 70\n0\n 62\n' + style.aci + '\n420\n' + style.trueColor + '\n  6\nCONTINUOUS\n';
  });
  dxf += '  0\nENDTAB\n';

  // STYLE Table (Standard Text Font)
  dxf += '  0\nTABLE\n  2\nSTYLE\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n1\n';
  dxf += '  0\nSTYLE\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n  2\nSTANDARD\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n 42\n2.5\n  3\ntxt\n  4\n\n';
  dxf += '  0\nENDTAB\n';

  // APPID Table
  dxf += '  0\nTABLE\n  2\nAPPID\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n1\n';
  dxf += '  0\nAPPID\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n  2\nACAD\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // BLOCK_RECORD Table
  dxf += '  0\nTABLE\n  2\nBLOCK_RECORD\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTable\n 70\n2\n';
  dxf += '  0\nBLOCK_RECORD\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\n*MODEL_SPACE\n';
  dxf += '  0\nBLOCK_RECORD\n  5\n' + getNextHandle() + '\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\n*PAPER_SPACE\n';
  dxf += '  0\nENDTAB\n';

  dxf += '  0\nENDSEC\n';

  // ==========================================
  // 4. BLOCKS SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nBLOCKS\n';
  dxf += '  0\nBLOCK\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\n*MODEL_SPACE\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*MODEL_SPACE\n  1\n\n';
  dxf += '  0\nENDBLK\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n';
  dxf += '  0\nBLOCK\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\n*PAPER_SPACE\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*PAPER_SPACE\n  1\n\n';
  dxf += '  0\nENDBLK\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n';
  dxf += '  0\nENDSEC\n';

  // ==========================================
  // 5. ENTITIES SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nENTITIES\n';

  for (let i = 0; i < preparedEntities.length; i++) {
    const ent = preparedEntities[i];

    if (ent.isPoint || ent.coords.length === 1) {
      const pt = ent.coords[0];
      // POINT Entity
      dxf += '  0\nPOINT\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n' + ent.layer + '\n 62\n' + ent.aci + '\n420\n' + ent.trueColor + '\n100\nAcDbPoint\n';
      dxf += ` 10\n${pt.x}\n 20\n${pt.y}\n 30\n${pt.z}\n`;

      // Optional circle indicator around the point to guarantee visibility on any CAD viewer
      const markerRadius = Math.max(textHeight * 0.8, 0.5);
      dxf += '  0\nCIRCLE\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n' + ent.layer + '\n 62\n' + ent.aci + '\n420\n' + ent.trueColor + '\n100\nAcDbCircle\n';
      dxf += ` 10\n${pt.x}\n 20\n${pt.y}\n 30\n${pt.z}\n 40\n${markerRadius}\n`;

      // Optional text label
      if (ent.label && ent.label.trim()) {
        const cleanLabel = ent.label.replace(/[\r\n\t]/g, ' ').substring(0, 100);
        dxf += '  0\nTEXT\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n' + ent.layer + '\n 62\n' + ent.aci + '\n420\n' + ent.trueColor + '\n100\nAcDbText\n';
        dxf += ` 10\n${pt.x + markerRadius * 1.3}\n 20\n${pt.y + markerRadius * 1.3}\n 30\n${pt.z}\n 40\n${textHeight}\n  1\n${cleanLabel}\n100\nAcDbText\n`;
      }
    } else {
      // 2D Lightweight Polyline (LWPOLYLINE)
      dxf += '  0\nLWPOLYLINE\n  5\n' + getNextHandle() + '\n100\nAcDbEntity\n  8\n' + ent.layer + '\n 62\n' + ent.aci + '\n420\n' + ent.trueColor + '\n100\nAcDbPolyline\n';
      dxf += ` 90\n${ent.coords.length}\n 70\n${ent.isPolygon ? 1 : 0}\n 43\n0.0\n`;
      
      for (let j = 0; j < ent.coords.length; j++) {
        const pt = ent.coords[j];
        dxf += ` 10\n${pt.x}\n 20\n${pt.y}\n`;
      }
    }
  }

  dxf += '  0\nENDSEC\n';

  // ==========================================
  // 6. OBJECTS SECTION
  // ==========================================
  dxf += '  0\nSECTION\n  2\nOBJECTS\n';
  dxf += '  0\nDICTIONARY\n  5\n' + getNextHandle() + '\n100\nAcDbDictionary\n 281\n1\n';
  dxf += '  0\nENDSEC\n';

  // EOF
  dxf += '  0\nEOF\n';

  return dxf;
};

/**
 * Trigger immediate browser download of the generated DXF file
 */
export const downloadDXF = (data: GeoPoint[], filename: string) => {
  if (!data || data.length === 0) {
    console.warn("downloadDXF called with empty data");
  }
  const cleanBaseName = String(filename || 'Export').replace(/\.[^/.]+$/, "").trim() || 'Export';
  const dxfContent = generateDXF(data);
  const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanBaseName}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
