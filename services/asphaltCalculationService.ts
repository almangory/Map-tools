import * as turf from '@turf/turf';
import * as XLSX from 'xlsx';
import { GeoPoint, AsphaltPolygonCalculation } from '../types';
import { parseKMZ, parseDXF, extractPointsFromDXF, parseExcel } from './parserService';
import { isPointInPolygon, getDistanceMeters } from './geometryService';

export interface AsphaltCalculationOptions {
  name?: string;
  thicknessCm?: number; // default: 10 cm (0.10 m)
  densityTonM3?: number; // default: 2.40 ton/m3
  primeCoatRateKgM2?: number; // default: 1.0 kg/m2 (MC-70)
  tackCoatRateKgM2?: number; // default: 0.5 kg/m2 (RC-250)
  includeBaseCourse?: boolean;
  baseCourseThicknessCm?: number; // default: 15 cm (0.15 m)
  baseCourseDensityTonM3?: number; // default: 2.20 ton/m3
  trenchWidthM?: number; // default: 1.0 m for pipes
  unitPricePerTon?: number;
  unitPricePerM2?: number;
  source?: 'draw' | 'file';
  filename?: string;
}

/**
 * Calculates geodesic polygon area in square meters (m²) using Turf / spherical geometry
 */
export function calculateGeodesicPolygonArea(coords: { x: number; y: number }[]): number {
  if (!coords || coords.length < 3) return 0;
  try {
    const ring = coords.map(c => [c.x, c.y]);
    // Ensure ring is closed for Turf
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([...ring[0]]);
    }
    const polygon = turf.polygon([ring]);
    const area = turf.area(polygon);
    if (!isNaN(area) && area > 0) return area;
  } catch (e) {
    // Fallback to spherical polygon area
  }

  return calculateSphericalPolygonArea(coords);
}

/**
 * Fallback spherical polygon area (in m²)
 */
function calculateSphericalPolygonArea(coords: { x: number; y: number }[]): number {
  if (!coords || coords.length < 3) return 0;
  const R = 6371008.8; // Earth radius in meters
  let total = 0;
  const n = coords.length;

  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    const lat1 = (p1.y * Math.PI) / 180;
    const lat2 = (p2.y * Math.PI) / 180;
    const lon1 = (p1.x * Math.PI) / 180;
    const lon2 = (p2.x * Math.PI) / 180;
    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((total * R * R) / 2);
  return isNaN(area) ? 0 : area;
}

/**
 * Calculates geodesic polygon perimeter in meters
 */
export function calculatePolygonPerimeter(coords: { x: number; y: number }[]): number {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    total += getDistanceMeters(p1.y, p1.x, p2.y, p2.x);
  }
  return total;
}

/**
 * Analyzes network pipes intersecting or located within the polygon
 */
export function getPipesInsidePolygon(
  polygonCoords: { x: number; y: number }[],
  allPoints: GeoPoint[]
): {
  pipes: GeoPoint[];
  totalLengthMeters: number;
} {
  if (!polygonCoords || polygonCoords.length < 3 || !allPoints || allPoints.length === 0) {
    return { pipes: [], totalLengthMeters: 0 };
  }

  const pipesInside: GeoPoint[] = [];
  let totalLen = 0;

  for (const pt of allPoints) {
    if (pt.type === 'LineString' && pt.path && pt.path.length >= 2) {
      // Check if any point is in polygon or intersects
      const anyPointIn = pt.path.some(p => isPointInPolygon(p, polygonCoords));
      if (anyPointIn) {
        pipesInside.push(pt);
        // Calculate length of this line
        let lineLen = 0;
        for (let i = 0; i < pt.path.length - 1; i++) {
          lineLen += getDistanceMeters(pt.path[i].y, pt.path[i].x, pt.path[i + 1].y, pt.path[i + 1].x);
        }
        totalLen += lineLen;
      }
    }
  }

  return { pipes: pipesInside, totalLengthMeters: totalLen };
}

/**
 * Main engine to compute full asphalt BOQ quantities from a polygon
 */
export function calculateAsphaltPolygonBOQ(
  polygon: { x: number; y: number; z?: number }[],
  options: AsphaltCalculationOptions = {},
  networkPoints: GeoPoint[] = []
): AsphaltPolygonCalculation {
  const cleanPolygon = polygon.filter(p => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
  
  const areaM2 = calculateGeodesicPolygonArea(cleanPolygon);
  const perimeterM = calculatePolygonPerimeter(cleanPolygon);

  const thicknessCm = options.thicknessCm ?? 10; // Default: 10 cm
  const thicknessM = thicknessCm / 100;
  const densityTonM3 = options.densityTonM3 ?? 2.40; // Default: 2.40 ton/m3

  const volumeM3 = areaM2 * thicknessM;
  const weightTons = volumeM3 * densityTonM3;

  // Bituminous Coats
  const primeCoatRateKgM2 = options.primeCoatRateKgM2 ?? 1.0; // 1.0 kg/m2 MC-70
  const primeCoatTotalKg = areaM2 * primeCoatRateKgM2;

  const tackCoatRateKgM2 = options.tackCoatRateKgM2 ?? 0.5; // 0.5 kg/m2 RC-250
  const tackCoatTotalKg = areaM2 * tackCoatRateKgM2;

  // Base Course / Subbase
  const includeBaseCourse = options.includeBaseCourse ?? false;
  const baseCourseThicknessCm = options.baseCourseThicknessCm ?? 15;
  const baseCourseThicknessM = baseCourseThicknessCm / 100;
  const baseCourseDensityTonM3 = options.baseCourseDensityTonM3 ?? 2.20;
  const baseCourseVolumeM3 = includeBaseCourse ? areaM2 * baseCourseThicknessM : 0;
  const baseCourseWeightTons = includeBaseCourse ? baseCourseVolumeM3 * baseCourseDensityTonM3 : 0;

  // Network Pipes within polygon
  const { pipes, totalLengthMeters: pipesTotalLengthM } = getPipesInsidePolygon(cleanPolygon, networkPoints);
  const trenchWidthM = options.trenchWidthM ?? 1.0;
  const pipesTrenchAsphaltAreaM2 = pipesTotalLengthM * trenchWidthM;
  const pipesTrenchAsphaltVolumeM3 = pipesTrenchAsphaltAreaM2 * thicknessM;
  const pipesTrenchAsphaltWeightTons = pipesTrenchAsphaltVolumeM3 * densityTonM3;

  // Cost estimation
  let estimatedTotalCost: number | undefined;
  if (options.unitPricePerTon && options.unitPricePerTon > 0) {
    estimatedTotalCost = weightTons * options.unitPricePerTon;
  } else if (options.unitPricePerM2 && options.unitPricePerM2 > 0) {
    estimatedTotalCost = areaM2 * options.unitPricePerM2;
  }

  return {
    id: `asphalt-poly-${Date.now()}`,
    name: options.name || (options.source === 'file' ? (options.filename || 'مضلع أسفلت مرفق') : 'مضلع حصر الأسفلت'),
    polygon: cleanPolygon,
    areaM2,
    perimeterM,
    thicknessM,
    thicknessCm,
    densityTonM3,
    volumeM3,
    weightTons,
    primeCoatRateKgM2,
    primeCoatTotalKg,
    tackCoatRateKgM2,
    tackCoatTotalKg,
    includeBaseCourse,
    baseCourseThicknessM,
    baseCourseVolumeM3,
    baseCourseWeightTons,
    pipesInsideCount: pipes.length,
    pipesTotalLengthM,
    pipesTrenchAsphaltAreaM2,
    pipesTrenchAsphaltVolumeM3,
    pipesTrenchAsphaltWeightTons,
    unitPricePerTon: options.unitPricePerTon,
    unitPricePerM2: options.unitPricePerM2,
    estimatedTotalCost,
    source: options.source || 'draw',
    filename: options.filename,
    createdAt: new Date().toISOString()
  };
}

/**
 * Extracts polygon vertices from an attached file (KML, KMZ, DXF, GeoJSON, Excel, CSV)
 */
export async function extractPolygonFromUploadedFile(file: File): Promise<{
  polygon: { x: number; y: number; z?: number }[];
  name: string;
  filename: string;
  allFeaturesCount: number;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  let items: GeoPoint[] = [];

  try {
    if (ext === 'kmz' || ext === 'kml' || ext === 'zip') {
      const parsed = await parseKMZ(file);
      items = parsed.data || [];
    } else if (ext === 'dxf') {
      const parsed = await parseDXF(file);
      const extracted = extractPointsFromDXF(parsed.data, 'EPSG:4326');
      items = extracted.data || [];
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const parsed = await parseExcel(file, 'EPSG:4326');
      items = parsed.data || [];
    } else {
      // Fallback try KMZ then Excel
      try {
        const parsed = await parseKMZ(file);
        items = parsed.data || [];
      } catch {
        const parsed = await parseExcel(file, 'EPSG:4326');
        items = parsed.data || [];
      }
    }
  } catch (e: any) {
    throw new Error(`تعذر قراءة أو استخراج البيانات من الملف: ${e?.message || 'خطأ غير معروف'}`);
  }

  if (!items || items.length === 0) {
    throw new Error('الملف لا يحتوي على أية بيانات هندسية أو إحداثيات صالحة.');
  }

  // 1. Look for explicit Polygon or MultiPolygon
  const polygonItem = items.find(p => p.type === 'Polygon' && p.path && p.path.length >= 3);
  if (polygonItem && polygonItem.path) {
    return {
      polygon: polygonItem.path,
      name: String(polygonItem.id || polygonItem.description || file.name),
      filename: file.name,
      allFeaturesCount: items.length
    };
  }

  // 2. Look for closed LineString
  const closedLine = items.find(p => {
    if (p.type === 'LineString' && p.path && p.path.length >= 3) {
      const first = p.path[0];
      const last = p.path[p.path.length - 1];
      const isClosed = Math.abs(first.x - last.x) < 0.00001 && Math.abs(first.y - last.y) < 0.00001;
      return isClosed || p.path.length >= 3;
    }
    return false;
  });

  if (closedLine && closedLine.path) {
    return {
      polygon: closedLine.path,
      name: String(closedLine.id || closedLine.description || file.name),
      filename: file.name,
      allFeaturesCount: items.length
    };
  }

  // 3. If multiple point vertices (e.g. from Excel/CSV coordinate list), use all coordinates as polygon ring
  const validCoords = items
    .filter(p => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y) && p.x !== 0 && p.y !== 0)
    .map(p => ({ x: p.x, y: p.y, z: p.z }));

  if (validCoords.length >= 3) {
    return {
      polygon: validCoords,
      name: file.name.replace(/\.[^/.]+$/, ""),
      filename: file.name,
      allFeaturesCount: items.length
    };
  }

  throw new Error('تعذر العثور على مضلع مغلق أو على الأقل 3 نقاط إحداثيات صالحة داخل الملف المرفق.');
}

/**
 * Exports complete Asphalt Polygon BOQ report to formatted Excel (XLSX)
 */
export function exportAsphaltPolygonExcel(
  calc: AsphaltPolygonCalculation,
  pipesInside: GeoPoint[] = [],
  lang: 'ar' | 'en' = 'ar'
): void {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: General Summary (ملخص كميات الأسفلت) ---
  const summaryRows = isAr ? [
    ['تقرير جدول حصر كميات الأسفلت للمضلع (Asphalt BOQ Report)'],
    ['تاريخ التقرير:', new Date().toLocaleString('ar-SA')],
    ['اسم المضلع:', calc.name],
    ['مصدر البيانات:', calc.source === 'file' ? `ملف مرفق (${calc.filename || ''})` : 'رسم مباشر على الخريطة'],
    [],
    ['البند الهيدروليكي / الإنشائي', 'القيمة', 'الوحدة', 'ملاحظات وتفاصيل'],
    ['المساحة السطحية الإجمالية (Surface Area)', calc.areaM2.toFixed(2), 'متر مربع (m²)', 'مساحة المضلع الجيوديسية الدقيقة'],
    ['محيط المضلع (Perimeter)', calc.perimeterM.toFixed(2), 'متر طولي (m)', 'مجموع أطوال حدود المضلع'],
    ['سماكة طبقة الأسفلت (Thickness)', calc.thicknessCm.toFixed(1), 'سنتيمتر (cm)', `${calc.thicknessM.toFixed(2)} متر`],
    ['كثافة الأسفلت (Bulk Density)', calc.densityTonM3.toFixed(2), 'طن / م³', 'الكثافة النوعية المعتمدة للخلطة الإسفلتية'],
    ['حجم الأسفلت الإجمالي (Asphalt Volume)', calc.volumeM3.toFixed(2), 'متر مكعب (m³)', 'المساحة × السماكة'],
    ['وزن الأسفلت الإجمالي (Asphalt Weight)', calc.weightTons.toFixed(2), 'طن (Ton)', 'الحجم × الكثافة'],
    [],
    ['--- طبقات العزل والتشريب الإسفلتية (Bituminous Prime & Tack Coats) ---'],
    ['معدل رش طبقة الأساس MC-70 (Prime Coat Rate)', calc.primeCoatRateKgM2.toFixed(2), 'كجم / م²', 'طبقة تشريب إسفلتي على الأساس الترابي'],
    ['إجمالي كمية طبقة MC-70 (Total Prime Coat)', calc.primeCoatTotalKg.toFixed(2), 'كيلوغرام (kg)', `${(calc.primeCoatTotalKg / 1000).toFixed(2)} طن / لتر تقريباً`],
    ['معدل رش طبقة اللصق RC-250 (Tack Coat Rate)', calc.tackCoatRateKgM2.toFixed(2), 'كجم / م²', 'طبقة لصق بين طبقات الأسفلت'],
    ['إجمالي كمية طبقة RC-250 (Total Tack Coat)', calc.tackCoatTotalKg.toFixed(2), 'كيلوغرام (kg)', `${(calc.tackCoatTotalKg / 1000).toFixed(2)} طن / لتر تقريباً`],
  ] : [
    ['Asphalt Polygon BOQ Calculation Report'],
    ['Date:', new Date().toISOString()],
    ['Polygon Name:', calc.name],
    ['Source:', calc.source === 'file' ? `Attached File (${calc.filename || ''})` : 'Interactive Map Draw'],
    [],
    ['Item Description', 'Value', 'Unit', 'Notes'],
    ['Total Surface Area', calc.areaM2.toFixed(2), 'm²', 'Geodesic surface area'],
    ['Polygon Perimeter', calc.perimeterM.toFixed(2), 'm', 'Total boundary perimeter'],
    ['Asphalt Layer Thickness', calc.thicknessCm.toFixed(1), 'cm', `${calc.thicknessM.toFixed(2)} meters`],
    ['Asphalt Density', calc.densityTonM3.toFixed(2), 'Ton/m³', 'Standard hot mix asphalt density'],
    ['Total Asphalt Volume', calc.volumeM3.toFixed(2), 'm³', 'Area × Thickness'],
    ['Total Asphalt Weight', calc.weightTons.toFixed(2), 'Tons', 'Volume × Density'],
    [],
    ['--- Bituminous Prime & Tack Coats ---'],
    ['Prime Coat Rate (MC-70)', calc.primeCoatRateKgM2.toFixed(2), 'kg/m²', 'Bituminous prime coat'],
    ['Total Prime Coat (MC-70)', calc.primeCoatTotalKg.toFixed(2), 'kg', `${(calc.primeCoatTotalKg / 1000).toFixed(2)} Tons`],
    ['Tack Coat Rate (RC-250)', calc.tackCoatRateKgM2.toFixed(2), 'kg/m²', 'Bituminous tack coat'],
    ['Total Tack Coat (RC-250)', calc.tackCoatTotalKg.toFixed(2), 'kg', `${(calc.tackCoatTotalKg / 1000).toFixed(2)} Tons`],
  ];

  if (calc.includeBaseCourse) {
    if (isAr) {
      summaryRows.push(
        [],
        ['--- طبقة الأساس الحجري (Aggregate Base Course) ---'],
        ['سماكة الأساس الحجري (Base Course Thickness)', ((calc.baseCourseThicknessM || 0.15) * 100).toFixed(1), 'سنتيمتر (cm)', 'طبقة أساس ركامية مدموكة'],
        ['حجم الأساس الحجري (Base Course Volume)', (calc.baseCourseVolumeM3 || 0).toFixed(2), 'متر مكعب (m³)', 'المساحة × سماكة الأساس'],
        ['وزن الأساس الحجري (Base Course Weight)', (calc.baseCourseWeightTons || 0).toFixed(2), 'طن (Ton)', 'كثافة ركام تقريبية 2.20 طن/م³']
      );
    } else {
      summaryRows.push(
        [],
        ['--- Aggregate Base Course ---'],
        ['Base Course Thickness', ((calc.baseCourseThicknessM || 0.15) * 100).toFixed(1), 'cm', 'Compacted crushed aggregate'],
        ['Base Course Volume', (calc.baseCourseVolumeM3 || 0).toFixed(2), 'm³', 'Area × Thickness'],
        ['Base Course Weight', (calc.baseCourseWeightTons || 0).toFixed(2), 'Tons', 'Aggregate density ~2.20 Ton/m³']
      );
    }
  }

  // Network Pipes in Polygon section
  if (calc.pipesInsideCount > 0) {
    if (isAr) {
      summaryRows.push(
        [],
        ['--- خطوط الشبكة والخنادق المتقاطعة داخل المضلع (Pipes in Polygon) ---'],
        ['عدد خطوط الشبكة داخل المضلع', calc.pipesInsideCount.toString(), 'خط', 'أنابيب واقعة كلياً أو جزئياً داخل المضلع'],
        ['إجمالي أطوال الأنابيب (Total Pipes Length)', calc.pipesTotalLengthM.toFixed(2), 'متر طولي (m)', 'أطوال مسارات الأنابيب'],
        ['مساحة إعادة سفلتة الخنادق (Trench Asphalt Area)', calc.pipesTrenchAsphaltAreaM2.toFixed(2), 'متر مربع (m²)', 'بعرض خندق افتراضي 1.0 متر'],
        ['حجم أسفلت الخنادق (Trench Asphalt Volume)', calc.pipesTrenchAsphaltVolumeM3.toFixed(2), 'متر مكعب (m³)', 'مساحة الخندق × سماكة الأسفلت'],
        ['وزن أسفلت الخنادق (Trench Asphalt Weight)', calc.pipesTrenchAsphaltWeightTons.toFixed(2), 'طن (Ton)', 'وزن الأسفلت المطلوب للخنادق فقط']
      );
    } else {
      summaryRows.push(
        [],
        ['--- Network Pipes Inside Polygon ---'],
        ['Total Pipes Inside Polygon', calc.pipesInsideCount.toString(), 'pipes', 'Lines intersecting polygon'],
        ['Total Pipe Length', calc.pipesTotalLengthM.toFixed(2), 'm', 'Total cumulative pipeline length'],
        ['Trench Asphalt Restoration Area', calc.pipesTrenchAsphaltAreaM2.toFixed(2), 'm²', 'Standard 1.0m trench width'],
        ['Trench Asphalt Volume', calc.pipesTrenchAsphaltVolumeM3.toFixed(2), 'm³', 'Trench area × Thickness'],
        ['Trench Asphalt Weight', calc.pipesTrenchAsphaltWeightTons.toFixed(2), 'Tons', 'Trench volume × Density']
      );
    }
  }

  // Cost estimation section
  if (calc.estimatedTotalCost !== undefined && calc.estimatedTotalCost > 0) {
    if (isAr) {
      summaryRows.push(
        [],
        ['--- التكلفة التقديرية (Estimated Cost) ---'],
        ['سعر الوحدة المعتمد', (calc.unitPricePerTon || calc.unitPricePerM2 || 0).toFixed(2), calc.unitPricePerTon ? 'ريال / طن' : 'ريال / م²', 'السعر الإفرادي'],
        ['التكلفة الإجمالية التقديرية (Total Estimated Cost)', calc.estimatedTotalCost.toFixed(2), 'ريال سعودي (SAR)', 'شامل توريد وتنفيذ الأسفلت']
      );
    } else {
      summaryRows.push(
        [],
        ['--- Estimated Cost ---'],
        ['Unit Price', (calc.unitPricePerTon || calc.unitPricePerM2 || 0).toFixed(2), calc.unitPricePerTon ? 'SAR / Ton' : 'SAR / m²', 'Unit rate'],
        ['Total Estimated Cost', calc.estimatedTotalCost.toFixed(2), 'SAR', 'Total calculated cost']
      );
    }
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, isAr ? 'حصر كميات الأسفلت' : 'Asphalt BOQ');

  // --- Sheet 2: Polygon Vertices Coordinates (إحداثيات المضلع) ---
  const coordRows = isAr ? [
    ['رقم النقطة', 'خط الطول (X / Longitude)', 'دائرة العرض (Y / Latitude)', 'المنسوب (Z / Elevation)']
  ] : [
    ['Vertex #', 'Longitude (X)', 'Latitude (Y)', 'Elevation (Z)']
  ];

  calc.polygon.forEach((pt, idx) => {
    coordRows.push([
      (idx + 1).toString(),
      pt.x.toFixed(7),
      pt.y.toFixed(7),
      pt.z !== undefined ? pt.z.toFixed(2) : '-'
    ]);
  });

  const wsCoords = XLSX.utils.aoa_to_sheet(coordRows);
  wsCoords['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsCoords, isAr ? 'إحداثيات أركان المضلع' : 'Polygon Coordinates');

  // --- Sheet 3: Pipes Inside Details (if any) ---
  if (pipesInside.length > 0) {
    const pipeRows = isAr ? [
      ['رقم الأنبوب / المعرف', 'الطبقة / Layer', 'الوصف', 'عدد النقاط المسارية', 'أول إحداثي (X, Y)', 'آخر إحداثي (X, Y)']
    ] : [
      ['Pipe ID / Name', 'Layer', 'Description', 'Vertices Count', 'Start Coord (X, Y)', 'End Coord (X, Y)']
    ];

    pipesInside.forEach(pipe => {
      const path = pipe.path || [];
      const startStr = path.length > 0 ? `(${path[0].x.toFixed(5)}, ${path[0].y.toFixed(5)})` : '-';
      const endStr = path.length > 1 ? `(${path[path.length - 1].x.toFixed(5)}, ${path[path.length - 1].y.toFixed(5)})` : '-';
      pipeRows.push([
        String(pipe.id),
        pipe.layer || 'Default',
        pipe.description || '',
        path.length.toString(),
        startStr,
        endStr
      ]);
    });

    const wsPipes = XLSX.utils.aoa_to_sheet(pipeRows);
    wsPipes['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsPipes, isAr ? 'الأنابيب المتقاطعة' : 'Pipes Details');
  }

  // Trigger download
  const safeName = calc.name.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_');
  XLSX.writeFile(wb, `${safeName}_Asphalt_BOQ_${Date.now()}.xlsx`);
}

/**
 * Exports the asphalt polygon to Google Earth KML with rich popup table
 */
export function exportAsphaltPolygonKML(calc: AsphaltPolygonCalculation, lang: 'ar' | 'en' = 'ar'): void {
  const isAr = lang === 'ar';
  const coordsKml = calc.polygon.map(p => `${p.x},${p.y},${p.z || 0}`).join(' ');
  // Ensure closing coordinate for KML ring
  const first = calc.polygon[0];
  const closedCoords = `${coordsKml} ${first.x},${first.y},${first.z || 0}`;

  const descriptionHtml = `
    <div style="font-family: Arial, sans-serif; direction: ${isAr ? 'rtl' : 'ltr'}; text-align: ${isAr ? 'right' : 'left'}; font-size: 13px; color: #1e293b; max-width: 400px;">
      <h3 style="margin: 0 0 10px; color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 5px;">
        🏗️ ${isAr ? 'حصر كميات الأسفلت للمضلع' : 'Asphalt BOQ Polygon'}
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px;">
        <tr style="background: #f1f5f9;">
          <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #cbd5e1;">${isAr ? 'المساحة السطحية:' : 'Surface Area:'}</td>
          <td style="padding: 6px 8px; font-weight: bold; color: #0284c7; border: 1px solid #cbd5e1;">${calc.areaM2.toFixed(2)} m²</td>
        </tr>
        <tr>
          <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #cbd5e1;">${isAr ? 'محيط المضلع:' : 'Perimeter:'}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${calc.perimeterM.toFixed(2)} m</td>
        </tr>
        <tr style="background: #f1f5f9;">
          <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #cbd5e1;">${isAr ? 'سماكة الأسفلت:' : 'Thickness:'}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${calc.thicknessCm} cm (${calc.thicknessM} m)</td>
        </tr>
        <tr>
          <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #cbd5e1;">${isAr ? 'حجم الأسفلت:' : 'Volume:'}</td>
          <td style="padding: 6px 8px; font-weight: bold; color: #d97706; border: 1px solid #cbd5e1;">${calc.volumeM3.toFixed(2)} m³</td>
        </tr>
        <tr style="background: #fef3c7;">
          <td style="padding: 6px 8px; font-weight: bold; border: 1px solid #cbd5e1;">${isAr ? 'وزن الأسفلت الإجمالي:' : 'Total Weight:'}</td>
          <td style="padding: 6px 8px; font-weight: bold; color: #b45309; border: 1px solid #cbd5e1;">${calc.weightTons.toFixed(2)} ${isAr ? 'طن' : 'Tons'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${isAr ? 'طبقة تشريب MC-70:' : 'Prime Coat MC-70:'}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${calc.primeCoatTotalKg.toFixed(1)} kg</td>
        </tr>
        <tr style="background: #f1f5f9;">
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${isAr ? 'طبقة لصق RC-250:' : 'Tack Coat RC-250:'}</td>
          <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${calc.tackCoatTotalKg.toFixed(1)} kg</td>
        </tr>
      </table>
      <div style="font-size: 10px; color: #64748b;">
        ${isAr ? 'تم الإنشاء بواسطة المحول الشامل للخرائط والمناسيب الهيدروليكية' : 'Generated by Comprehensive GIS & Hydraulic Converter'}
      </div>
    </div>
  `;

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${calc.name}</name>
    <Style id="asphaltPolyStyle">
      <LineStyle>
        <color>ff0099ff</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>7f1e293b</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${calc.name}</name>
      <description><![CDATA[${descriptionHtml}]]></description>
      <styleUrl>#asphaltPolyStyle</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${closedCoords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = calc.name.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_');
  a.download = `${safeName}_Asphalt_Polygon_${Date.now()}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
