
import proj4 from 'proj4';
import { GeoPoint, EPSGDefinition } from '../types';
import { COMMON_EPSG } from '../constants';
import { decodePlusCode } from './plusCodeService';

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

  const validSamples = points
    .filter(p => typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y))
    .slice(0, 10)
    .filter(p => p.x !== 0 && p.y !== 0);
  if (validSamples.length === 0) return null;

  // إذا كانت الأرقام صغيرة جداً فهي غالباً Lat/Lon WGS84
  if (Math.abs(validSamples[0].x) <= 180 && Math.abs(validSamples[0].y) <= 90) {
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
      const [lon, lat] = proj4(epsg.def, '+proj=longlat +datum=WGS84 +no_defs', [validSamples[0].x, validSamples[0].y]);
      if (typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon) && isInsideSaudi(lat, lon)) {
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
};

// Client-side cache for resolved short map links
const clientResolvedCache = new Map<string, { lat: number, lon: number }>();

/**
 * Checks if a string is a short URL that typically redirects (like maps.app.goo.gl or goo.gl/maps)
 */
export const isShortGoogleMapsUrl = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    t.includes('maps.app.goo.gl') ||
    t.includes('goo.gl/maps') ||
    t.includes('g.page') ||
    t.includes('bit.ly') ||
    t.includes('tinyurl.com') ||
    t.includes('t.co')
  );
};

/**
 * Checks if a string contains any map URL or coordinate pattern
 */
export const isPotentialMapLinkOrCoord = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 5) return false;
  const lower = t.toLowerCase();
  if (
    lower.includes('maps.app.goo.gl') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('google.com/maps') ||
    lower.includes('maps.google.') ||
    lower.includes('waze.com') ||
    lower.includes('maps.apple.com') ||
    lower.includes('geo:')
  ) {
    return true;
  }
  // Plus Code pattern e.g. HQR7+2GH or 7HP8HQR7+2GH
  if (/[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,4}/i.test(t)) {
    return true;
  }
  // Decimal pair or DMS
  if (/[0-9]+\.[0-9]{3,}/.test(t) || /[°\x27\x22]/.test(t) || /[0-9]{2}[°\s]+[0-9]{1,2}/.test(t)) {
    return true;
  }
  return false;
};

/**
 * Synchronously parses coordinates from any text format:
 * - Google Maps URL (q=, @lat,lon, !3d/!4d, staticmap, loc:)
 * - Open Location Code (Plus Code e.g. HQR7+2GH or 7HP8HQR7+2GH)
 * - DMS notations (e.g. 24°33'49.9"N 46°31'09.3"E or in Arabic 24°33'49.9"ش 46°31'09.3"ق)
 * - Decimal coordinate pairs (e.g. "24.563866, 46.519248" or "24.563866 46.519248" or "24.563866;46.519248")
 * - Waze and Geo links
 */
export const parseCoordinatesFromText = (text: string): { lat: number, lon: number } | null => {
  if (!text || typeof text !== 'string') return null;
  let processedText = text.trim();
  if (clientResolvedCache.has(processedText)) {
    return clientResolvedCache.get(processedText)!;
  }

  try { processedText = decodeURIComponent(decodeURIComponent(processedText)); } catch (e) {}

  // 1. Google Maps pin data !3d... !4d... (most accurate)
  const pinMatch = processedText.match(/!3d([-+]?\d+\.\d+)!4d([-+]?\d+\.\d+)/i);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lon = parseFloat(pinMatch[2]);
    if (isValidLatLon(lat, lon)) {
      clientResolvedCache.set(text.trim(), { lat, lon });
      return { lat, lon };
    }
  }

  // 2. Plus Code check (e.g. HQR7+2GH Riyadh or 7HP8HQR7+2GH)
  const plusCodeResult = decodePlusCode(processedText);
  if (plusCodeResult && isValidLatLon(plusCodeResult.lat, plusCodeResult.lon)) {
    clientResolvedCache.set(text.trim(), plusCodeResult);
    return plusCodeResult;
  }

  // 3. Query param or location params: q=, query=, ll=, mlat=, loc:, center=, /place/
  const urlPatterns = [
    /\/place\/([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i,
    /[?&](?:q|query|ll|loc|center)=([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i,
    /[?&]mlat=([-+]?\d+\.\d+)&mlon=([-+]?\d+\.\d+)/i,
    /loc:([-+]?\d+\.\d+)[, +]+([-+]?\d+\.\d+)/i,
    /@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/i,
    /!2d([-+]?\d+\.\d+)!3d([-+]?\d+\.\d+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = processedText.match(pattern);
    if (match) {
      const v1 = parseFloat(match[1]);
      const v2 = parseFloat(match[2]);
      if (pattern.source.includes('!2d')) {
        if (isValidLatLon(v2, v1)) {
          clientResolvedCache.set(text.trim(), { lat: v2, lon: v1 });
          return { lat: v2, lon: v1 };
        }
      } else if (isValidLatLon(v1, v2)) {
        clientResolvedCache.set(text.trim(), { lat: v1, lon: v2 });
        return { lat: v1, lon: v2 };
      }
    }
  }

  // 3. DMS notation (Arabic or English: N/S/E/W or ش/ج/ق/غ)
  const dmsRegex = /(\d+)[°\s]+(\d+)[\x27\x60\u2018\u2019\s]+(\d+(?:\.\d+)?)[\x22\u201c\u201d\s]*([NSEWشطقغ])/gi;
  const dmsMatches = [...processedText.matchAll(dmsRegex)];
  if (dmsMatches.length >= 2) {
    let lat: number | null = null;
    let lon: number | null = null;
    for (const m of dmsMatches) {
      const deg = parseFloat(m[1]);
      const min = parseFloat(m[2]);
      const sec = parseFloat(m[3]);
      const dir = m[4].toUpperCase();
      let val = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'ج') val = -val;
      if (dir === 'W' || dir === 'غ') val = -val;
      if (dir === 'N' || dir === 'S' || dir === 'ش' || dir === 'ج') lat = val;
      if (dir === 'E' || dir === 'W' || dir === 'ق' || dir === 'غ') lon = val;
    }
    if (lat !== null && lon !== null && isValidLatLon(lat, lon)) {
      clientResolvedCache.set(text.trim(), { lat, lon });
      return { lat, lon };
    }
  }

  // 4. Plain Decimal Coordinate Pair e.g. "24.563866, 46.519248" or "24.563866;46.519248"
  const pairMatch = processedText.match(/(?:lat|latitude|y)?[:=\s]*([-+]?\d{1,2}\.\d{4,})[,\s;/|]+(?:lon|lng|longitude|x)?[:=\s]*([-+]?\d{1,3}\.\d{4,})/i);
  if (pairMatch) {
    const lat = parseFloat(pairMatch[1]);
    const lon = parseFloat(pairMatch[2]);
    if (isValidLatLon(lat, lon)) {
      clientResolvedCache.set(text.trim(), { lat, lon });
      return { lat, lon };
    }
  }

  // 5. Reversed Decimal Pair e.g. Easting/Longitude first (34.0..56.0) then Latitude (15.0..33.0)
  const reversedPairMatch = processedText.match(/([-+]?\d{2,3}\.\d{4,})[,\s;/|]+([-+]?\d{1,2}\.\d{4,})/);
  if (reversedPairMatch) {
    const p1 = parseFloat(reversedPairMatch[1]);
    const p2 = parseFloat(reversedPairMatch[2]);
    // If p1 is around 34..56 (Saudi Longitude) and p2 is around 15..33 (Saudi Latitude)
    if (Math.abs(p2) <= 90 && Math.abs(p1) <= 180 && p1 > p2) {
      if (isValidLatLon(p2, p1)) {
        clientResolvedCache.set(text.trim(), { lat: p2, lon: p1 });
        return { lat: p2, lon: p1 };
      }
    }
  }

  return null;
};

/**
 * Asynchronously resolves batch Google Maps short/long links via backend endpoint
 */
export const resolveGoogleMapsUrls = async (
  urls: string[],
  onProgress?: (pct: number) => void
): Promise<Map<string, { lat: number, lon: number }>> => {
  const resultMap = new Map<string, { lat: number, lon: number }>();
  if (!urls || urls.length === 0) return resultMap;

  const uniqueUrls = Array.from(new Set(urls.map(u => String(u || '').trim()).filter(Boolean)));
  const toFetchBackend: string[] = [];

  for (const u of uniqueUrls) {
    if (clientResolvedCache.has(u)) {
      resultMap.set(u, clientResolvedCache.get(u)!);
      continue;
    }
    // Try synchronous extraction first
    const syncExt = parseCoordinatesFromText(u);
    if (syncExt) {
      clientResolvedCache.set(u, syncExt);
      resultMap.set(u, syncExt);
      continue;
    }
    // If it's a URL that needs resolving
    if (u.startsWith('http://') || u.startsWith('https://')) {
      toFetchBackend.push(u);
    }
  }

  if (toFetchBackend.length === 0) {
    if (onProgress) onProgress(100);
    return resultMap;
  }

  if (onProgress) onProgress(30);

  try {
    const response = await fetch('/api/resolve-maps-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: toFetchBackend }),
    });

    if (onProgress) onProgress(80);

    if (response.ok) {
      const data = await response.json();
      if (data && data.results) {
        for (const [urlKey, resObj] of Object.entries<any>(data.results)) {
          if (resObj && typeof resObj.lat === 'number' && typeof resObj.lon === 'number') {
            const coords = { lat: resObj.lat, lon: resObj.lon };
            clientResolvedCache.set(urlKey, coords);
            resultMap.set(urlKey, coords);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error resolving Google Maps URLs via backend:', e);
  }

  if (onProgress) onProgress(100);
  return resultMap;
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
          if (typeof pt.x === 'number' && Number.isFinite(pt.x) && typeof pt.y === 'number' && Number.isFinite(pt.y)) {
            const [lon, lat] = proj4(sourceDef, destDef, [pt.x, pt.y]);
            if (typeof lon === 'number' && Number.isFinite(lon) && typeof lat === 'number' && Number.isFinite(lat)) {
              finalLon = lon;
              finalLat = lat;
            }
          }
          
          if (pt.path && Array.isArray(pt.path)) {
            transformedPath = pt.path.map(p => {
               if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) {
                 try {
                   const [plon, plat] = proj4(sourceDef, destDef, [p.x, p.y]);
                   if (typeof plon === 'number' && Number.isFinite(plon) && typeof plat === 'number' && Number.isFinite(plat)) {
                     return { x: plon, y: plat, z: p.z };
                   }
                 } catch {}
               }
               return p;
            });
          }
      }

      const origColor = (pt as any).originalColor || pt.color || '#dcb13c';
      const origLayer = (pt as any).originalLayer || pt.layer || '0';

      return {
        ...pt,
        originalColor: origColor,
        originalLayer: origLayer,
        x: finalLon,
        y: finalLat,
        path: transformedPath
      };
    } catch (e) {
      return { ...pt, x: 0, y: 0, layer: 'Error' }; 
    }
  });
};
