import JSZipModule from 'jszip';
import proj4 from 'proj4';
import { GeoPoint } from '../types';
import { COMMON_EPSG } from '../constants';
import { extractAllPointAttributes, stripHtml } from './parserService';
import { calculatePathLength } from './geometryService';

const JSZip =
  typeof JSZipModule === 'function'
    ? JSZipModule
    : JSZipModule && (JSZipModule as any).default
    ? (JSZipModule as any).default
    : JSZipModule;

// Exact Esri WKT strings compatible with Riyadh Geoportal (البوابة المكانية لمدينة الرياض - ArcGIS Enterprise)
const ESRI_WKT_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const ESRI_WKT_UTM38N =
  'PROJCS["WGS_1984_UTM_Zone_38N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",45.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const WGS84_PROJ = '+proj=longlat +datum=WGS84 +no_defs';
const UTM38N_PROJ = '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs';

/**
 * خريطة توحيد أسماء الحقول (10 أحرف ASCII كحد أقصى حسب مواصفات Esri DBF)
 */
const STANDARD_FIELD_MAP: Record<string, string> = {
  'innerdiameter': 'INNERDIAM',
  'inner_diameter': 'INNERDIAM',
  'diameter': 'INNERDIAM',
  'القطر': 'INNERDIAM',
  'القطر الداخلي': 'INNERDIAM',
  'segment id': 'SEGMENT_ID',
  'segment_id': 'SEGMENT_ID',
  'segmentid': 'SEGMENT_ID',
  'رقم المقطع': 'SEGMENT_ID',
  'رقم القطاع': 'SEGMENT_ID',
  'كود المسار': 'SEGMENT_ID',
  'كود المسار (prmt)': 'SEGMENT_ID',
  'permit no': 'PERMIT_NO',
  'permit_no': 'PERMIT_NO',
  'permitno': 'PERMIT_NO',
  'رقم الترخيص': 'PERMIT_NO',
  'رقم الرخصة': 'PERMIT_NO',
  'zone': 'ZONE',
  'المنطقة': 'ZONE',
  'نطاق': 'ZONE',
  'البلدية': 'ZONE',
  'drilling type': 'DRILL_TYPE',
  'drilling_type': 'DRILL_TYPE',
  'نوع الحفر': 'DRILL_TYPE',
  'stage': 'STAGE',
  'المرحلة': 'STAGE',
  'حالة الطلب': 'STAGE',
  'الحالة': 'STAGE',
  'contractor': 'CONTRACTOR',
  'المقاول': 'CONTRACTOR',
  'اسم المقاول': 'CONTRACTOR',
  'projectname': 'PROJ_NAME',
  'project_name': 'PROJ_NAME',
  'project name': 'PROJ_NAME',
  'اسم المشروع': 'PROJ_NAME',
  'أسم المشروع الصحيح': 'PROJ_NAME',
  'projectid': 'PROJECTID',
  'project_id': 'PROJECTID',
  'project id': 'PROJECTID',
  'رقم المشروع': 'PROJECTID',
  'shape_length': 'SHAPE_LEN',
  'shape_len': 'SHAPE_LEN',
  'length': 'SHAPE_LEN',
  'الطول': 'SHAPE_LEN',
  'طول الرخصة': 'SHAPE_LEN',
  'streetname': 'STREETNAME',
  'street_name': 'STREETNAME',
  'street': 'STREETNAME',
  'الشارع': 'STREETNAME',
  'اسم الشارع': 'STREETNAME',
  'district': 'DISTRICT',
  'neighborhood': 'DISTRICT',
  'الحي': 'DISTRICT',
  'اسم الحي': 'DISTRICT',
  'الحيّ': 'DISTRICT',
  'type': 'FEAT_TYPE',
  'النوع': 'FEAT_TYPE',
  'description': 'DESCRIPT',
  'الوصف': 'DESCRIPT'
};

export interface ShapefileExportOptions {
  /**
   * نظام الإحداثيات المستهدف للبوابة المكانية لمدينة الرياض:
   * - 'EPSG:4326' (الافتراضي: WGS 1984 الجغرافي المتوافق مع أداة إضافة البيانات في البوابة المكانية)
   * - 'EPSG:32638' (WGS 1984 UTM Zone 38N المتري لمدينة الرياض)
   */
  targetCRS?: 'EPSG:4326' | 'EPSG:32638';
}

interface CleanCoord {
  x: number;
  y: number;
}

/**
 * تطبيع وتصحيح الإحداثيات لضمان وقوعها في النطاق الصحيح لمدينة الرياض / المملكة العربية السعودية
 */
function normalizeCoord(rawX: number, rawY: number, targetCRS: 'EPSG:4326' | 'EPSG:32638'): CleanCoord | null {
  if (typeof rawX !== 'number' || typeof rawY !== 'number' || !Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return null;
  }
  if (rawX === 0 && rawY === 0) {
    return null;
  }

  let lon = rawX;
  let lat = rawY;

  // 1. إذا كانت الإحداثيات مترية (مثل UTM 38N)، نحولها أولاً إلى WGS84 (Lon, Lat)
  if (Math.abs(rawX) > 180 || Math.abs(rawY) > 90) {
    // فحص ما إذا كانت معكوسة (Northing في X و Easting في Y)
    let easting = rawX;
    let northing = rawY;
    if (rawX > 1000000 && rawY < 1000000) {
      easting = rawY;
      northing = rawX;
    }

    const utm38Def = COMMON_EPSG.find(e => e.code === 'EPSG:32638')?.def || UTM38N_PROJ;
    try {
      const [cLon, cLat] = proj4(utm38Def, WGS84_PROJ, [easting, northing]);
      if (Number.isFinite(cLon) && Number.isFinite(cLat) && Math.abs(cLon) <= 180 && Math.abs(cLat) <= 90) {
        lon = cLon;
        lat = cLat;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    // 2. إذا كانت الإحداثيات عشرية ولكن معكوسة (خط العرض 15..33 في X وخط الطول 34..56 في Y داخل السعودية/الرياض)
    if (lon >= 15 && lon <= 33.5 && lat >= 34 && lat <= 56.5) {
      const tmp = lon;
      lon = lat;
      lat = tmp;
    }
  }

  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    return null;
  }

  if (targetCRS === 'EPSG:32638') {
    try {
      const [utmX, utmY] = proj4(WGS84_PROJ, UTM38N_PROJ, [lon, lat]);
      if (Number.isFinite(utmX) && Number.isFinite(utmY)) {
        return { x: utmX, y: utmY };
      }
    } catch {
      // fallback to lon/lat if projection fails
    }
  }

  return { x: lon, y: lat };
}

/**
 * إزالة النقاط المتتالية المكررة تماماً لمنع أخطاء الهندسة الصفرية في ArcGIS / البوابة المكانية
 */
function deduplicateConsecutiveCoords(coords: CleanCoord[]): CleanCoord[] {
  if (coords.length <= 1) return coords;
  const result: CleanCoord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = result[result.length - 1];
    const curr = coords[i];
    if (Math.abs(curr.x - prev.x) > 1e-9 || Math.abs(curr.y - prev.y) > 1e-9) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * ضمان دوران الحلقة الخارجية للمضلع باتجاه عقارب الساعة (Clockwise) وإغلاقها حسب مواصفات Esri Shapefile
 */
function ensureClockwiseClosedRing(coords: CleanCoord[]): CleanCoord[] {
  const cleaned = deduplicateConsecutiveCoords(coords);
  if (cleaned.length < 3) return [];

  const ring = [...cleaned];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first.x - last.x) > 1e-9 || Math.abs(first.y - last.y) > 1e-9) {
    ring.push({ x: first.x, y: first.y });
  }
  if (ring.length < 4) return [];

  // حساب المساحة الموجهة: في نظام الإحداثيات الديكارتي (X يمين، Y أعلى)،
  // إذا كان مجموع (x2 - x1)*(y2 + y1) موجباً فالحلقة باتجاه عقارب الساعة (Clockwise)
  let signedArea2 = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    signedArea2 += (ring[i + 1].x - ring[i].x) * (ring[i + 1].y + ring[i].y);
  }
  if (signedArea2 < 0) {
    ring.reverse();
  }
  return ring;
}

/**
 * استخراج وبناء جدول خصائص نظيف ومرتب لكل عنصر متوافق مع البوابة المكانية لمدينة الرياض
 */
function buildFeatureProperties(pt: GeoPoint, index: number): Record<string, any> {
  const rawExtracted = extractAllPointAttributes(pt);
  const normalizedLookup: Record<string, string> = {};

  Object.entries(rawExtracted).forEach(([k, v]) => {
    const cleanKey = String(k || '').trim();
    const cleanVal = stripHtml(String(v ?? '')).trim();
    if (!cleanKey || !cleanVal || cleanVal === 'undefined' || cleanVal === 'null') return;
    normalizedLookup[cleanKey.toLowerCase()] = cleanVal;
  });

  const getAttr = (...keys: string[]): string => {
    for (const k of keys) {
      const val = normalizedLookup[k.toLowerCase()];
      if (val !== undefined && val !== '') return val;
    }
    return '';
  };

  const rawStreetName = (pt as any).streetName as string | undefined;
  const rawNeighborhood = (pt as any).neighborhood as string | undefined;

  const streetVal =
    (pt.street && pt.street !== 'غير متوفر' && pt.street !== 'غير معروف' ? pt.street : '') ||
    (rawStreetName && rawStreetName !== 'غير متوفر' ? rawStreetName : '') ||
    getAttr('STREETNAME', 'Street', 'الشارع', 'اسم الشارع', 'اسم المحور / الشارع الرئيسى');

  const districtVal =
    (pt.district && pt.district !== 'غير متوفر' && pt.district !== 'غير معروف' ? pt.district : '') ||
    (rawNeighborhood && rawNeighborhood !== 'غير متوفر' ? rawNeighborhood : '') ||
    getAttr('DISTRICT', 'الحي', 'اسم الحي', 'الحى');

  let calcLen = pt.length ?? pt.originalLength ?? 0;
  if ((!calcLen || calcLen <= 0) && pt.path && pt.path.length >= 2) {
    calcLen = calculatePathLength(pt.path);
  }
  const shapeLenStr = getAttr('SHAPE_Length', 'SHAPE_LEN', 'Length', 'الطول', 'طول الرخصة');
  const finalShapeLen = shapeLenStr && !isNaN(parseFloat(shapeLenStr))
    ? Number(parseFloat(shapeLenStr).toFixed(2))
    : Number((calcLen || 0).toFixed(2));

  // الحقول القياسية المعتمدة بالترتيب (تجنب حقل OBJECTID المحجوز في أنظمة ArcGIS / البوابة المكانية)
  const props: Record<string, any> = {
    FEAT_ID: index + 1,
    NAME: String(pt.name || streetVal || pt.id || `F_${index + 1}`).substring(0, 120),
    INNERDIAM: getAttr('INNERDIAMETER', 'INNERDIAM', 'DIAMETER', 'القطر', 'القطر الداخلي'),
    SEGMENT_ID: getAttr('segment id', 'SEGMENT_ID', 'segmentid', 'رقم المقطع', 'رقم القطاع', 'كود المسار (PRMT)'),
    PERMIT_NO: getAttr('Permit No', 'PERMIT_NO', 'permitno', 'رقم الترخيص', 'رقم الرخصة'),
    ZONE: getAttr('ZONE', 'المنطقة', 'البلدية', 'نطاق'),
    DRILL_TYPE: getAttr('Drilling type', 'DRILL_TYPE', 'نوع الحفر'),
    STAGE: getAttr('Stage', 'STAGE', 'المرحلة', 'حالة الطلب', 'الحالة'),
    CONTRACTOR: getAttr('CONTRACTOR', 'المقاول', 'اسم المقاول'),
    PROJ_NAME: getAttr('PROJECTNAME', 'PROJ_NAME', 'Project Name', 'اسم المشروع', 'أسم المشروع الصحيح'),
    PROJECTID: getAttr('PROJECTID', 'Project ID', 'رقم المشروع'),
    SHAPE_LEN: finalShapeLen,
    STREETNAME: streetVal,
    DISTRICT: districtVal,
    LAYER: String(pt.layer || '0').substring(0, 80),
    COLOR: String(pt.color || '').substring(0, 20)
  };

  // إضافة أي حقول إضافية من الملف المصدر مع ضمان عدم تجاوز 10 أحرف ASCII وعدم التكرار
  let customIdx = 1;
  Object.entries(rawExtracted).forEach(([k, v]) => {
    const cleanKeyLower = String(k || '').trim().toLowerCase();
    if (!cleanKeyLower) return;
    if (
      cleanKeyLower === 'shape' ||
      cleanKeyLower === 'fid' ||
      cleanKeyLower === 'objectid' ||
      cleanKeyLower.includes('google') ||
      cleanKeyLower.includes('رابط')
    ) {
      return;
    }

    const mappedStandard = STANDARD_FIELD_MAP[cleanKeyLower];
    if (mappedStandard && props[mappedStandard] !== undefined) {
      if (!props[mappedStandard] && v !== undefined && v !== null) {
        props[mappedStandard] = stripHtml(String(v)).trim();
      }
      return;
    }

    let asciiName = String(k)
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!asciiName || !/^[A-Z]/.test(asciiName)) {
      asciiName = `ATTR_${customIdx++}`;
    }
    asciiName = asciiName.substring(0, 10);

    if (props[asciiName] === undefined) {
      props[asciiName] = stripHtml(String(v ?? '')).trim();
    }
  });

  return props;
}

/**
 * تحويل مجموعة نقاط GeoPoint إلى كائن GeoJSON FeatureCollection
 */
export const convertGeoPointsToGeoJSON = (
  points: GeoPoint[],
  options?: ShapefileExportOptions
): any => {
  const targetCRS = options?.targetCRS || 'EPSG:4326';
  const features: any[] = [];

  points.forEach((pt, idx) => {
    if (!pt || pt.isDuplicateOverlay) return;

    const props = buildFeatureProperties(pt, idx);

    if (pt.type === 'Polygon' && pt.path && pt.path.length >= 3) {
      const normalized = pt.path
        .map(p => normalizeCoord(p.x, p.y, targetCRS))
        .filter((p): p is CleanCoord => p !== null);
      const ring = ensureClockwiseClosedRing(normalized);
      if (ring.length >= 4) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [ring.map(c => [c.x, c.y])]
          },
          properties: props
        });
      }
      return;
    }

    if ((pt.type === 'LineString' || (pt.path && pt.path.length >= 2)) && pt.path && pt.path.length >= 2) {
      const normalized = deduplicateConsecutiveCoords(
        pt.path
          .map(p => normalizeCoord(p.x, p.y, targetCRS))
          .filter((p): p is CleanCoord => p !== null)
      );
      if (normalized.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: normalized.map(c => [c.x, c.y])
          },
          properties: props
        });
      }
      return;
    }

    const rawX = pt.x ?? (pt.path && pt.path[0]?.x) ?? 0;
    const rawY = pt.y ?? (pt.path && pt.path[0]?.y) ?? 0;
    const normPt = normalizeCoord(rawX, rawY, targetCRS);
    if (normPt) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [normPt.x, normPt.y]
        },
        properties: props
      });
    }
  });

  return {
    type: 'FeatureCollection',
    features
  };
};

/**
 * قطع النص بترميز UTF-8 بأمان عند حدود المحارف الكاملة بحيث لا يتجاوز عدد البايتات المحدد
 */
function encodeUtf8Bounded(text: string, maxBytes: number, encoder: TextEncoder): Uint8Array {
  const fullBytes = encoder.encode(text);
  if (fullBytes.byteLength <= maxBytes) {
    return fullBytes;
  }
  // الرجوع للخلف حتى لا نقطع حرفاً عربياً (2 بايت) في المنتصف
  let cut = maxBytes;
  while (cut > 0 && (fullBytes[cut] & 0xc0) === 0x80) {
    cut--;
  }
  return fullBytes.subarray(0, cut);
}

interface DbfFieldSpec {
  name: string;
  type: 'C' | 'N';
  length: number;
  decimals: number;
}

/**
 * توليد ملف .dbf متوافق 100% مع Esri ArcGIS والبوابة المكانية لمدينة الرياض ويدعم اللغة العربية (UTF-8)
 */
function buildDbfBuffer(rows: Record<string, any>[]): ArrayBuffer {
  const encoder = new TextEncoder();

  // جمع كافة أسماء الحقول مع الحفاظ على ترتيب الحقول الأساسية أولاً
  const fieldOrder: string[] = [];
  const seenFields = new Set<string>();
  const usedDbfNames = new Set<string>();
  const keyToDbfName: Record<string, string> = {};

  rows.forEach(row => {
    Object.keys(row).forEach(k => {
      if (!seenFields.has(k)) {
        seenFields.add(k);
        fieldOrder.push(k);
      }
    });
  });

  if (fieldOrder.length === 0) {
    fieldOrder.push('FEAT_ID');
  }

  // ضمان أن كل اسم حقل ASCII لا يتجاوز 10 بايت ولا يتكرر
  fieldOrder.forEach((origKey, idx) => {
    let candidate = origKey
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/^[^A-Z]+/, '');
    if (!candidate) candidate = `FLD_${idx + 1}`;
    candidate = candidate.substring(0, 10);

    let uniqueCandidate = candidate;
    let suffix = 1;
    while (usedDbfNames.has(uniqueCandidate)) {
      const sfx = `_${suffix++}`;
      uniqueCandidate = candidate.substring(0, 10 - sfx.length) + sfx;
    }
    usedDbfNames.add(uniqueCandidate);
    keyToDbfName[origKey] = uniqueCandidate;
  });

  const fieldSpecs: DbfFieldSpec[] = fieldOrder.map(origKey => {
    const dbfName = keyToDbfName[origKey];
    if (dbfName === 'FEAT_ID') {
      return { name: dbfName, type: 'N', length: 10, decimals: 0 };
    }
    if (dbfName === 'SHAPE_LEN') {
      return { name: dbfName, type: 'N', length: 14, decimals: 2 };
    }

    // حساب أقصى طول بالبايتات (UTF-8) لهذا الحقل عبر جميع السجلات
    let maxByteLen = 10;
    for (let i = 0; i < rows.length; i++) {
      const val = rows[i][origKey];
      if (val !== undefined && val !== null && val !== '') {
        const byteLen = encoder.encode(String(val)).byteLength;
        if (byteLen > maxByteLen) {
          maxByteLen = byteLen;
        }
      }
    }
    return {
      name: dbfName,
      type: 'C',
      length: Math.min(254, Math.max(10, maxByteLen + 2)),
      decimals: 0
    };
  });

  const numRecords = rows.length;
  const numFields = fieldSpecs.length;
  const headerBytes = 32 + numFields * 32 + 1;
  const recordBytes = 1 + fieldSpecs.reduce((acc, f) => acc + f.length, 0);
  const totalBytes = headerBytes + numRecords * recordBytes + 1;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  const now = new Date();
  view.setUint8(0, 0x03); // dBASE III+
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, numRecords, true);
  view.setUint16(8, headerBytes, true);
  view.setUint16(10, recordBytes, true);
  view.setUint8(29, 0x00); // Language driver ID = 0x00 (uses .cpg UTF-8 in Esri ArcGIS)

  // كتابة تعريف الحقول
  fieldSpecs.forEach((spec, idx) => {
    const fOffset = 32 + idx * 32;
    for (let c = 0; c < Math.min(10, spec.name.length); c++) {
      view.setUint8(fOffset + c, spec.name.charCodeAt(c) & 0x7f);
    }
    view.setUint8(fOffset + 11, spec.type.charCodeAt(0));
    view.setUint8(fOffset + 16, spec.length);
    view.setUint8(fOffset + 17, spec.decimals);
  });

  // نهاية الترويسة 0x0D
  view.setUint8(32 + numFields * 32, 0x0d);

  // كتابة السجلات
  let rOffset = headerBytes;
  for (let r = 0; r < numRecords; r++) {
    const row = rows[r];
    uint8[rOffset] = 0x20; // سجل نشط غير محذوف
    let fCursor = rOffset + 1;

    for (let f = 0; f < numFields; f++) {
      const spec = fieldSpecs[f];
      const origKey = fieldOrder[f];
      const rawVal = row[origKey];

      // تعبئة مبدئية بمسافات ASCII (0x20)
      uint8.fill(0x20, fCursor, fCursor + spec.length);

      if (spec.type === 'N') {
        const num = Number(rawVal);
        const numStr = Number.isFinite(num)
          ? spec.decimals > 0
            ? num.toFixed(spec.decimals)
            : String(Math.round(num))
          : '0';
        const asciiBytes = encoder.encode(numStr.substring(0, spec.length));
        // محاذاة الأرقام لليمين حسب معيار dBASE
        const startPos = fCursor + Math.max(0, spec.length - asciiBytes.byteLength);
        uint8.set(asciiBytes, startPos);
      } else {
        const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        if (strVal) {
          const utf8Bytes = encodeUtf8Bounded(strVal, spec.length, encoder);
          uint8.set(utf8Bytes, fCursor);
        }
      }

      fCursor += spec.length;
    }

    rOffset += recordBytes;
  }

  // علامة نهاية الملف 0x1A
  uint8[totalBytes - 1] = 0x1a;

  return buffer;
}

/**
 * توليد ملفي .shp و .shx الثنائيين لمجموعة نقاط (Shape Type = 1)
 */
function buildPointShpAndShx(coords: CleanCoord[]): { shp: ArrayBuffer; shx: ArrayBuffer } {
  const numRecords = coords.length;
  const shpByteLength = 100 + numRecords * 28; // 8 bytes record header + 20 bytes Point content
  const shxByteLength = 100 + numRecords * 8;

  const shpBuffer = new ArrayBuffer(shpByteLength);
  const shxBuffer = new ArrayBuffer(shxByteLength);
  const shpView = new DataView(shpBuffer);
  const shxView = new DataView(shxBuffer);

  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;

  for (const pt of coords) {
    if (pt.x < xmin) xmin = pt.x;
    if (pt.y < ymin) ymin = pt.y;
    if (pt.x > xmax) xmax = pt.x;
    if (pt.y > ymax) ymax = pt.y;
  }

  if (!Number.isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  // ترويسة .shp (100 بايت)
  shpView.setInt32(0, 9994, false);
  shpView.setInt32(24, shpByteLength / 2, false); // الطول بوحدة 16-bit words
  shpView.setInt32(28, 1000, true);
  shpView.setInt32(32, 1, true); // Shape Type 1 = Point
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  // ترويسة .shx (100 بايت)
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, shxByteLength / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, 1, true);
  shxView.setFloat64(36, xmin, true);
  shxView.setFloat64(44, ymin, true);
  shxView.setFloat64(52, xmax, true);
  shxView.setFloat64(60, ymax, true);

  let shpOffset = 100;
  let shxOffset = 100;

  for (let i = 0; i < numRecords; i++) {
    const pt = coords[i];

    // فهرس .shx
    shxView.setInt32(shxOffset, shpOffset / 2, false); // الإزاحة بـ 16-bit words
    shxView.setInt32(shxOffset + 4, 10, false); // طول المحتوى = 20 بايت = 10 words
    shxOffset += 8;

    // ترويسة ومحتوى السجل في .shp
    shpView.setInt32(shpOffset, i + 1, false); // رقم السجل يبدأ من 1
    shpView.setInt32(shpOffset + 4, 10, false); // 10 words (20 bytes)
    shpView.setInt32(shpOffset + 8, 1, true); // Shape Type = 1
    shpView.setFloat64(shpOffset + 12, pt.x, true);
    shpView.setFloat64(shpOffset + 20, pt.y, true);
    shpOffset += 28;
  }

  return { shp: shpBuffer, shx: shxBuffer };
}

/**
 * توليد ملفي .shp و .shx الثنائيين للخطوط (Shape Type = 3) أو المضلعات (Shape Type = 5)
 */
function buildPolyShpAndShx(
  paths: CleanCoord[][],
  shapeType: 3 | 5
): { shp: ArrayBuffer; shx: ArrayBuffer } {
  const numRecords = paths.length;

  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;

  let totalShpBytes = 100;
  for (let i = 0; i < numRecords; i++) {
    const ring = paths[i];
    const numPoints = ring.length;
    // 8 bytes record header + 44 bytes (shapeType + bbox + numParts + numPoints) + 4 bytes (1 part) + 16 * numPoints
    const recordContentBytes = 48 + numPoints * 16;
    totalShpBytes += 8 + recordContentBytes;

    for (const pt of ring) {
      if (pt.x < xmin) xmin = pt.x;
      if (pt.y < ymin) ymin = pt.y;
      if (pt.x > xmax) xmax = pt.x;
      if (pt.y > ymax) ymax = pt.y;
    }
  }

  if (!Number.isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  const totalShxBytes = 100 + numRecords * 8;
  const shpBuffer = new ArrayBuffer(totalShpBytes);
  const shxBuffer = new ArrayBuffer(totalShxBytes);
  const shpView = new DataView(shpBuffer);
  const shxView = new DataView(shxBuffer);

  // ترويسة .shp (100 بايت)
  shpView.setInt32(0, 9994, false);
  shpView.setInt32(24, totalShpBytes / 2, false);
  shpView.setInt32(28, 1000, true);
  shpView.setInt32(32, shapeType, true);
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  // ترويسة .shx (100 بايت)
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, totalShxBytes / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, shapeType, true);
  shxView.setFloat64(36, xmin, true);
  shxView.setFloat64(44, ymin, true);
  shxView.setFloat64(52, xmax, true);
  shxView.setFloat64(60, ymax, true);

  let shpOffset = 100;
  let shxOffset = 100;

  for (let i = 0; i < numRecords; i++) {
    const ring = paths[i];
    const numPoints = ring.length;
    const contentBytes = 48 + numPoints * 16;
    const contentWords = contentBytes / 2;

    let rXmin = Infinity;
    let rYmin = Infinity;
    let rXmax = -Infinity;
    let rYmax = -Infinity;
    for (const pt of ring) {
      if (pt.x < rXmin) rXmin = pt.x;
      if (pt.y < rYmin) rYmin = pt.y;
      if (pt.x > rXmax) rXmax = pt.x;
      if (pt.y > rYmax) rYmax = pt.y;
    }

    // سجل الفهرس في .shx
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, contentWords, false);
    shxOffset += 8;

    // ترويسة السجل في .shp (8 بايت)
    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, contentWords, false);

    // محتوى السجل في .shp
    const cOffset = shpOffset + 8;
    shpView.setInt32(cOffset, shapeType, true);
    shpView.setFloat64(cOffset + 4, rXmin, true);
    shpView.setFloat64(cOffset + 12, rYmin, true);
    shpView.setFloat64(cOffset + 20, rXmax, true);
    shpView.setFloat64(cOffset + 28, rYmax, true);
    shpView.setInt32(cOffset + 36, 1, true); // NumParts = 1
    shpView.setInt32(cOffset + 40, numPoints, true); // NumPoints
    shpView.setInt32(cOffset + 44, 0, true); // First part starts at index 0

    let ptOffset = cOffset + 48;
    for (let k = 0; k < numPoints; k++) {
      shpView.setFloat64(ptOffset, ring[k].x, true);
      shpView.setFloat64(ptOffset + 8, ring[k].y, true);
      ptOffset += 16;
    }

    shpOffset += 8 + contentBytes;
  }

  return { shp: shpBuffer, shx: shxBuffer };
}

/**
 * تنظيف اسم الطبقة الداخلي داخل ملف الـ ZIP ليكون بحروف إنجليزية وأرقام فقط (متطلب أساسي لخوادم ArcGIS والبوابة المكانية)
 */
function sanitizeInternalLayerName(rawName: string, fallback: string = 'Riyadh_GIS_Layer'): string {
  const cleaned = String(rawName || '')
    .split('.')[0]
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!cleaned || !/[a-zA-Z]/.test(cleaned)) {
    return fallback;
  }
  return cleaned.substring(0, 40);
}

export interface GeneratedShapefilePackage {
  zipName: string;
  layerName: string;
  geometryType: 'LineString' | 'Polygon' | 'Point';
  count: number;
  blob: Blob;
}

/**
 * بناء حزم الشيب فايل (كل نوع هندسي في ملف ZIP مستقل بملفات مسطحة في الجذر)
 * لأن البوابة المكانية لمدينة الرياض (ArcGIS Enterprise) تشترط وجود طبقة شيب فايل واحدة فقط داخل كل ملف ZIP.
 */
export const buildShapefilePackages = async (
  data: GeoPoint[],
  filename: string = 'Riyadh_Geoportal_Layer',
  options?: ShapefileExportOptions
): Promise<GeneratedShapefilePackage[]> => {
  const targetCRS = options?.targetCRS || 'EPSG:4326';
  const prjWkt = targetCRS === 'EPSG:32638' ? ESRI_WKT_UTM38N : ESRI_WKT_WGS84;

  const pointItems: { coords: CleanCoord; props: Record<string, any> }[] = [];
  const lineItems: { path: CleanCoord[]; props: Record<string, any> }[] = [];
  const polygonItems: { ring: CleanCoord[]; props: Record<string, any> }[] = [];

  data.forEach((pt, idx) => {
    if (!pt || pt.isDuplicateOverlay) return;

    const props = buildFeatureProperties(pt, idx);

    if (pt.type === 'Polygon' && pt.path && pt.path.length >= 3) {
      const normalized = pt.path
        .map(p => normalizeCoord(p.x, p.y, targetCRS))
        .filter((p): p is CleanCoord => p !== null);
      const ring = ensureClockwiseClosedRing(normalized);
      if (ring.length >= 4) {
        props.FEAT_ID = polygonItems.length + 1;
        polygonItems.push({ ring, props });
      }
      return;
    }

    if ((pt.type === 'LineString' || (pt.path && pt.path.length >= 2)) && pt.path && pt.path.length >= 2) {
      const normalized = deduplicateConsecutiveCoords(
        pt.path
          .map(p => normalizeCoord(p.x, p.y, targetCRS))
          .filter((p): p is CleanCoord => p !== null)
      );
      if (normalized.length >= 2) {
        props.FEAT_ID = lineItems.length + 1;
        lineItems.push({ path: normalized, props });
      }
      return;
    }

    const rawX = pt.x ?? (pt.path && pt.path[0]?.x) ?? 0;
    const rawY = pt.y ?? (pt.path && pt.path[0]?.y) ?? 0;
    const normPt = normalizeCoord(rawX, rawY, targetCRS);
    if (normPt) {
      props.FEAT_ID = pointItems.length + 1;
      pointItems.push({ coords: normPt, props });
    }
  });

  const activeTypesCount =
    (lineItems.length > 0 ? 1 : 0) +
    (pointItems.length > 0 ? 1 : 0) +
    (polygonItems.length > 0 ? 1 : 0);

  if (activeTypesCount === 0) {
    throw new Error('لم يتم العثور على إحداثيات هندسية صالحة للتصدير.');
  }

  const baseInternalName = sanitizeInternalLayerName(filename, 'Riyadh_GIS_Layer');
  const cleanDownloadName =
    String(filename || 'Riyadh_Geoportal')
      .split('.')[0]
      .trim() || 'Riyadh_Geoportal';

  const packages: GeneratedShapefilePackage[] = [];

  const createZipPackage = async (
    geometryType: 'LineString' | 'Polygon' | 'Point',
    layerName: string,
    zipName: string,
    shp: ArrayBuffer,
    shx: ArrayBuffer,
    rows: Record<string, any>[]
  ) => {
    const zip = new JSZip();
    const dbf = buildDbfBuffer(rows);
    zip.file(`${layerName}.shp`, shp);
    zip.file(`${layerName}.shx`, shx);
    zip.file(`${layerName}.dbf`, dbf);
    zip.file(`${layerName}.prj`, prjWkt);
    zip.file(`${layerName}.cpg`, 'UTF-8');

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    packages.push({
      zipName,
      layerName,
      geometryType,
      count: rows.length,
      blob
    });
  };

  if (lineItems.length > 0) {
    const layerName = activeTypesCount === 1 ? baseInternalName : `${baseInternalName}_Lines`;
    const zipName = activeTypesCount === 1 ? `${cleanDownloadName}_SHP.zip` : `${cleanDownloadName}_Lines_SHP.zip`;
    const { shp, shx } = buildPolyShpAndShx(lineItems.map(item => item.path), 3);
    await createZipPackage('LineString', layerName, zipName, shp, shx, lineItems.map(item => item.props));
  }

  if (polygonItems.length > 0) {
    const layerName = activeTypesCount === 1 ? baseInternalName : `${baseInternalName}_Polygons`;
    const zipName = activeTypesCount === 1 ? `${cleanDownloadName}_SHP.zip` : `${cleanDownloadName}_Polygons_SHP.zip`;
    const { shp, shx } = buildPolyShpAndShx(polygonItems.map(item => item.ring), 5);
    await createZipPackage('Polygon', layerName, zipName, shp, shx, polygonItems.map(item => item.props));
  }

  if (pointItems.length > 0) {
    const layerName = activeTypesCount === 1 ? baseInternalName : `${baseInternalName}_Points`;
    const zipName = activeTypesCount === 1 ? `${cleanDownloadName}_SHP.zip` : `${cleanDownloadName}_Points_SHP.zip`;
    const { shp, shx } = buildPointShpAndShx(pointItems.map(item => item.coords));
    await createZipPackage('Point', layerName, zipName, shp, shx, pointItems.map(item => item.props));
  }

  return packages;
};

/**
 * تصدير البيانات إلى ملف Shapefile بصيغة ZIP مسطحة (Flat Root Structure)
 * جاهزة ومتوافقة تماماً للعمل والرفع المباشر على خريطة البوابة المكانية لمدينة الرياض (ArcGIS Portal / Geoportal)
 */
export const downloadShapefile = async (
  data: GeoPoint[],
  filename: string = 'Riyadh_Geoportal_Layer',
  options?: ShapefileExportOptions
) => {
  if (!data || data.length === 0) {
    alert('لا توجد بيانات متاحة للتصدير إلى Shapefile!');
    return;
  }

  try {
    const packages = await buildShapefilePackages(data, filename, options);

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const url = URL.createObjectURL(pkg.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pkg.zipName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 1500);
    }
  } catch (err: any) {
    console.error('Shapefile export error:', err);
    throw new Error(err?.message || 'Failed to generate Shapefile');
  }
};
