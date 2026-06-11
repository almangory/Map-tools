
import proj4 from 'proj4';
import { GeoPoint, EPSGDefinition } from '../types';
import { COMMON_EPSG } from '../constants';

/**
 * نطاق المملكة العربية السعودية التقريبي للتحقق من صحة الإحداثيات
 */
const SAUDI_BOUNDS = {
  minLat: 15.5,
  maxLat: 32.5,
  minLon: 34.0,
  maxLon: 55.5
};

/**
 * التحقق من وقوع النقطة داخل السعودية
 */
const isInsideSaudi = (lat: number, lon: number) => {
    return lat >= SAUDI_BOUNDS.minLat && lat <= SAUDI_BOUNDS.maxLat && 
           lon >= SAUDI_BOUNDS.minLon && lon <= SAUDI_BOUNDS.maxLon;
};

/**
 * دالة ذكية لمحاولة تخمين نظام الإحداثيات للملف المرفوع
 */
export const identifyPotentialCRS = (points: GeoPoint[]): string | null => {
  if (points.length === 0) return null;

  // نأخذ عينة من النقاط لتسريع العملية
  const samples = points.slice(0, 10).filter(p => p.x !== 0 && p.y !== 0);
  if (samples.length === 0) return null;

  // إذا كانت الأرقام صغيرة جداً فهي غالباً Lat/Lon WGS84
  if (Math.abs(samples[0].x) <= 180 && Math.abs(samples[0].y) <= 90) {
      return 'EPSG:4326';
  }

  // تجربة الأنظمة الشائعة في السعودية بالترتيب (WGS84 ثم Ain el Abd)
  const candidates = [
    'EPSG:32638', // UTM 38N WGS84 (الرياض)
    'EPSG:32637', // UTM 37N WGS84 (الغربية)
    'EPSG:32639', // UTM 39N WGS84 (الشرقية)
    'EPSG:20438', // Ain el Abd 38N
    'EPSG:20437', // Ain el Abd 37N
    'EPSG:20439'  // Ain el Abd 39N
  ];

  for (const code of candidates) {
    const epsg = COMMON_EPSG.find(e => e.code === code);
    if (!epsg) continue;
    
    try {
      const [lon, lat] = proj4(epsg.def, '+proj=longlat +datum=WGS84 +no_defs', [samples[0].x, samples[0].y]);
      if (isInsideSaudi(lat, lon)) {
        return epsg.code;
      }
    } catch (e) {
      continue;
    }
  }

  return null;
};

const isValidLatLon = (lat: number, lon: number) => {
    return !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

export const parseCoordinatesFromText = (text: string): { lat: number, lon: number } | null => {
  if (!text || typeof text !== 'string') return null;
  let processedText = text.trim();
  try { processedText = decodeURIComponent(decodeURIComponent(processedText)); } catch (e) {}

  const urlPatterns = [
      /ll=([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i,
      /q=([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i,
      /@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/i,
      /!3d([-+]?\d+\.\d+)!4d([-+]?\d+\.\d+)/i,
      /!2d([-+]?\d+\.\d+)!3d([-+]?\d+\.\d+)/i,
  ];

  for (const pattern of urlPatterns) {
      const match = processedText.match(pattern);
      if (match) {
          const v1 = parseFloat(match[1]);
          const v2 = parseFloat(match[2]);
          if (pattern.source.includes('!2d')) return { lat: v2, lon: v1 };
          if (isValidLatLon(v1, v2)) return { lat: v1, lon: v2 };
      }
  }
  return null;
};

export const transformPoints = (points: GeoPoint[], sourceDef: string): GeoPoint[] => {
  const destDef = '+proj=longlat +datum=WGS84 +no_defs';
  const isSourceWGS84 = sourceDef.includes('+proj=longlat') && sourceDef.includes('+datum=WGS84');

  return points.map(pt => {
    try {
      let finalLat = pt.y;
      let finalLon = pt.x;
      let transformedPath = pt.path;

      if (!isSourceWGS84 && (Math.abs(pt.x) > 180 || Math.abs(pt.y) > 90)) {
          const [lon, lat] = proj4(sourceDef, destDef, [pt.x, pt.y]);
          finalLon = lon;
          finalLat = lat;
          
          if (pt.path) {
            transformedPath = pt.path.map(p => {
               const [plon, plat] = proj4(sourceDef, destDef, [p.x, p.y]);
               return { x: plon, y: plat, z: p.z };
            });
          }
      }

      return { ...pt, x: finalLon, y: finalLat, path: transformedPath };
    } catch (e) {
      return { ...pt, x: 0, y: 0, layer: 'Error' }; 
    }
  });
};
