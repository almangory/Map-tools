
import * as turf from '@turf/turf';
import { GeoPoint } from '../types';

/**
 * دالة للتحقق مما إذا كانت النقطة داخل المضلع باستخدام خوارزمية Ray Casting
 */
export const isPointInPolygon = (point: {x: number, y: number}, polygon: {x: number, y: number}[]): boolean => {
    if (!point || !polygon || !Array.isArray(polygon) || polygon.length === 0) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (!polygon[i] || !polygon[j]) continue;
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * دالة لتوسيع المضلع بنطاق معين (Buffer بسيط عبر توسيع المربع المحيط)
 */
export const bufferPolygon = (polygon: {x: number, y: number}[], meters: number): {x: number, y: number}[] => {
    if (!polygon || !Array.isArray(polygon) || polygon.length === 0) return [];
    if (meters <= 0) return polygon;
    // تحويل الأمتار إلى درجات تقريبية (0.00001 درجة تقريباً تساوي 1.1 متر)
    const degreeOffset = meters / 111320; 
    
    let minX = Math.min(...polygon.map(p => p.x)) - degreeOffset;
    let maxX = Math.max(...polygon.map(p => p.x)) + degreeOffset;
    let minY = Math.min(...polygon.map(p => p.y)) - degreeOffset;
    let maxY = Math.max(...polygon.map(p => p.y)) + degreeOffset;

    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ];
};

/**
 * حساب المربع المحيط (Bounding Box) لمجموعة من النقاط
 */
export const calculateBoundingBox = (points: {x: number, y: number}[]): {x: number, y: number}[] => {
    if (!points || !Array.isArray(points) || points.length === 0) return [];
    
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;

    points.forEach(p => {
        if (!p) return;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ];
};

/**
 * دالة لحساب الغلاف المحدب (Convex Hull) لمجموعة من النقاط
 */
export const calculateConvexHull = (points: {x: number, y: number}[]): {x: number, y: number}[] => {
    if (!points || !Array.isArray(points) || points.length <= 2) return points || [];

    const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

    const crossProduct = (a: any, b: any, c: any) => {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    };

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
};

const getLineIntersection = (p1: any, p2: any, p3: any, p4: any) => {
    if (!p1 || !p2 || !p3 || !p4) return null;
    const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denominator === 0) return null;
    let ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
    if (ua < 0 || ua > 1) return null;
    let ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;
    if (ub < 0 || ub > 1) return null;
    return {
        x: p1.x + ua * (p2.x - p1.x),
        y: p1.y + ua * (p2.y - p1.y)
    };
};

export const clipLineToPolygon = (line: {x: number, y: number}[], polygon: {x: number, y: number}[]): {x: number, y: number}[][] => {
    if (!line || !Array.isArray(line) || !polygon || !Array.isArray(polygon) || line.length < 2 || polygon.length < 3) return [];
    const clippedLines: {x: number, y: number}[][] = [];
    let currentSegment: {x: number, y: number}[] = [];

    for (let i = 0; i < line.length - 1; i++) {
        const p1 = line[i];
        const p2 = line[i + 1];
        const p1In = isPointInPolygon(p1, polygon);
        const p2In = isPointInPolygon(p2, polygon);

        if (p1In && p2In) {
            if (currentSegment.length === 0) currentSegment.push(p1);
            currentSegment.push(p2);
        } else if (p1In && !p2In) {
            if (currentSegment.length === 0) currentSegment.push(p1);
            for (let j = 0; j < polygon.length; j++) {
                const v1 = polygon[j];
                const v2 = polygon[(j + 1) % polygon.length];
                const inter = getLineIntersection(p1, p2, v1, v2);
                if (inter) {
                    currentSegment.push(inter);
                    break;
                }
            }
            clippedLines.push(currentSegment);
            currentSegment = [];
        } else if (!p1In && p2In) {
            for (let j = 0; j < polygon.length; j++) {
                const v1 = polygon[j];
                const v2 = polygon[(j + 1) % polygon.length];
                const inter = getLineIntersection(p1, p2, v1, v2);
                if (inter) {
                    currentSegment.push(inter);
                    break;
                }
            }
            currentSegment.push(p2);
        }
    }

    if (currentSegment.length > 1) clippedLines.push(currentSegment);
    return clippedLines;
};


export const splitLineIntoParts = (path: {x: number, y: number, z?: number}[], partsCount: number): {x: number, y: number, z?: number}[][] => {
    if (!path || !Array.isArray(path) || path.length < 2 || partsCount <= 1) return path ? [path] : [];
    const totalLen = calculatePathLength(path);
    if (totalLen <= 0) return [path];
    return splitLineString(path, totalLen / partsCount);
};

export const splitLineString = (path: {x: number, y: number, z?: number}[], maxLength: number): {x: number, y: number, z?: number}[][] => {
    if (!path || !Array.isArray(path) || path.length < 2) return path ? [path] : [];
    
    const segments: {x: number, y: number, z?: number}[][] = [];
    let currentSegment: {x: number, y: number, z?: number}[] = [path[0]];
    let currentSegmentLength = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        const dist = getDistanceMeters(p1.y, p1.x, p2.y, p2.x);

        if (currentSegmentLength + dist <= maxLength) {
            currentSegment.push(p2);
            currentSegmentLength += dist;
        } else {
            let remainingDist = dist;
            let lastPoint = p1;
            
            while (currentSegmentLength + remainingDist > maxLength) {
                const neededDist = maxLength - currentSegmentLength;
                const ratio = neededDist / remainingDist;
                
                const interpolatedPoint = {
                    x: lastPoint.x + (p2.x - lastPoint.x) * ratio,
                    y: lastPoint.y + (p2.y - lastPoint.y) * ratio,
                    z: lastPoint.z !== undefined && p2.z !== undefined ? lastPoint.z + (p2.z - lastPoint.z) * ratio : undefined
                };
                
                currentSegment.push(interpolatedPoint);
                segments.push(currentSegment);
                
                lastPoint = interpolatedPoint;
                currentSegment = [lastPoint];
                currentSegmentLength = 0;
                remainingDist = getDistanceMeters(lastPoint.y, lastPoint.x, p2.y, p2.x);
            }
            
            currentSegment.push(p2);
            currentSegmentLength += remainingDist;
        }
    }
    
    if (currentSegment.length > 1) {
        segments.push(currentSegment);
    }
    
    return segments;
};

export const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

export const calculatePathLength = (path?: {x: number, y: number}[], attributes?: any): number => {
    if (!path || !Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        if (!path[i] || !path[i+1]) continue;
        total += getDistanceMeters(path[i].y, path[i].x, path[i+1].y, path[i+1].x);
    }
    return total;
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 3000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err) {
        clearTimeout(id);
        return null;
    }
};

const pointToSegmentDistanceMeters = (
    plat: number, plon: number,
    lat1: number, lon1: number,
    lat2: number, lon2: number
): number => {
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    if (dx === 0 && dy === 0) return getDistanceMeters(plat, plon, lat1, lon1);

    const t = Math.max(0, Math.min(1, ((plon - lon1) * dx + (plat - lat1) * dy) / (dx * dx + dy * dy)));
    const projLon = lon1 + t * dx;
    const projLat = lat1 + t * dy;
    return getDistanceMeters(plat, plon, projLat, projLon);
};

export const utmToLatLon = (easting: number, northing: number, zone: number = 38, northern: boolean = true) => {
  const k0 = 0.9996;
  const a = 6378137;
  const e = 0.081819191;
  const e1sq = 0.006739497;
  
  const x = easting - 500000;
  const y = northern ? northing : northing - 10000000;

  const m = y / k0;
  const mu = m / (a * (1 - Math.pow(e, 2) / 4 - 3 * Math.pow(e, 4) / 64 - 5 * Math.pow(e, 6) / 256));

  const phi1Rad = mu + (3 * e1sq / 2 - 27 * Math.pow(e1sq, 3) / 32) * Math.sin(2 * mu)
    + (21 * Math.pow(e1sq, 2) / 16 - 55 * Math.pow(e1sq, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1sq, 3) / 96) * Math.sin(6 * mu);

  const n1 = a / Math.sqrt(1 - Math.pow(e * Math.sin(phi1Rad), 2));
  const t1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  const c1 = e1sq * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  const r1 = a * (1 - Math.pow(e, 2)) / Math.pow(1 - Math.pow(e * Math.sin(phi1Rad), 2), 1.5);
  const d = x / (n1 * k0);

  let lat = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (Math.pow(d, 2) / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * Math.pow(d, 4) / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) * Math.pow(d, 6) / 720);
  lat = (lat * 180) / Math.PI;

  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  let lon = (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) * Math.pow(d, 5) / 120) / Math.cos(phi1Rad);
  lon = lonOrigin + (lon * 180) / Math.PI;

  return { lat, lon };
};

export const getReverseGeocode = async (
    lat: number, 
    lon: number, 
    mode: 'accurate' | 'fast' = 'accurate'
): Promise<{street: string, district: string}> => {
    if (!lat || !lon) return { street: "غير متوفر", district: "غير متوفر" };

    let queryLat = lat;
    let queryLon = lon;

    // Handle UTM or projected coordinates automatically
    if (Math.abs(queryLat) > 90 || Math.abs(queryLon) > 180) {
      let easting = Math.min(Math.abs(queryLat), Math.abs(queryLon));
      let northing = Math.max(Math.abs(queryLat), Math.abs(queryLon));
      
      if (northing > 100000 && easting > 100000) {
        let bestConverted: { lat: number; lon: number } | null = null;
        for (const z of [38, 37, 39, 36]) {
          const converted = utmToLatLon(easting, northing, z, true);
          if (converted.lat >= 12 && converted.lat <= 36 && converted.lon >= 33 && converted.lon <= 60) {
            bestConverted = converted;
            break;
          }
        }
        if (!bestConverted) {
          bestConverted = utmToLatLon(easting, northing, 38, true);
        }
        if (Math.abs(bestConverted.lat) <= 90 && Math.abs(bestConverted.lon) <= 180) {
          queryLat = bestConverted.lat;
          queryLon = bestConverted.lon;
        } else {
          return { street: "غير متوفر", district: "غير متوفر" };
        }
      } else {
        return { street: "غير متوفر", district: "غير متوفر" };
      }
    }

    let street = "";
    let district = "";

    const isAccurate = mode === 'accurate';
    const primaryTimeout = isAccurate ? 2400 : 1200;

    // 1. Layer 1 (Primary): Google Maps Reverse Geocoding & Street Search (Arabic / Localized)
    try {
        const googleGeocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${queryLat},${queryLon}&language=ar`;
        const googleRes = await fetchWithTimeout(googleGeocodeUrl, {}, primaryTimeout);
        if (googleRes && googleRes.ok) {
            const googleData = await googleRes.json();
            if (googleData && Array.isArray(googleData.results) && googleData.results.length > 0) {
                for (const res of googleData.results) {
                    for (const comp of res.address_components || []) {
                        const types: string[] = comp.types || [];
                        if (types.includes('route') || types.includes('street_address') || types.includes('premise')) {
                            if (!street && comp.long_name) {
                                street = comp.long_name;
                            }
                        }
                        if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
                            if (!district && comp.long_name) {
                                district = comp.long_name;
                            }
                        }
                        if (!district && (types.includes('locality') || types.includes('administrative_area_level_2'))) {
                            district = comp.long_name;
                        }
                    }
                    if (street && district) break;
                }
            }
        }
    } catch (e) {
        // Fallback to next layer
    }

    // 2. Layer 2: ArcGIS World Geocoding Service (Esri High Precision in KSA & Riyadh)
    if (!street || street.length <= 2 || !district) {
        try {
            const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&location=${queryLon},${queryLat}&langCode=ar`;
            const arcgisRes = await fetchWithTimeout(arcgisUrl, {}, primaryTimeout);
            if (arcgisRes && arcgisRes.ok) {
                const arcgisData = await arcgisRes.json();
                if (arcgisData && arcgisData.address) {
                    const addr = arcgisData.address;
                    if (!district) {
                        district = addr.District || addr.Neighborhood || addr.City || addr.Subregion || "";
                    }
                    if (!street || street.length <= 2) {
                        let rawStreet = addr.Address || addr.ShortLabel || addr.Match_addr || addr.StAddr || "";
                        street = rawStreet.replace(/^[\d\s\-]+/, '').trim();
                        if (street.includes(",")) {
                            street = street.split(",")[0].trim();
                        }
                    }
                }
            }
        } catch (e) {
            // Fallback silently
        }
    }

    // 3. Layer 3: Overpass OSM Road Network Multi-Endpoints (High-Density Street Geometry)
    if (!street || street.length <= 2 || street === "غير متوفر") {
        const endpoints = [
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass-api.de/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.private.coffee/api/interpreter',
            'https://overpass.osm.ch/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://z.overpass-api.de/api/interpreter'
        ];
        
        const radius = isAccurate ? 85 : 50;
        const query = `[out:json][timeout:3];way(around:${radius},${queryLat},${queryLon})["highway"~"primary|secondary|tertiary|residential|unclassified|living_street|service|trunk|motorway"]["name"];out body geom;`;
        
        for (const endpoint of endpoints) {
            try {
                const getUrl = `${endpoint}?data=${encodeURIComponent(query)}`;
                const res = await fetchWithTimeout(getUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                }, 2500);

                if (res && res.ok) {
                    const text = await res.text();
                    if (!text || !text.trim().startsWith('{')) continue;
                    const overpassData = JSON.parse(text);
                    if (overpassData.elements && overpassData.elements.length > 0) {
                        let minDistance = Infinity;
                        let bestStreetName = "";

                        for (const way of overpassData.elements) {
                            const wayName = way.tags?.['name:ar'] || way.tags?.name || "";
                            if (!wayName || wayName.length <= 2) continue;

                            if (way.geometry && way.geometry.length > 0) {
                                for (let i = 0; i < way.geometry.length - 1; i++) {
                                    const dist = pointToSegmentDistanceMeters(
                                        queryLat, queryLon,
                                        way.geometry[i].lat, way.geometry[i].lon,
                                        way.geometry[i+1].lat, way.geometry[i+1].lon
                                    );
                                    if (dist < minDistance) {
                                        minDistance = dist;
                                        bestStreetName = wayName;
                                    }
                                }
                            } else if (!bestStreetName) {
                                bestStreetName = wayName;
                            }
                        }

                        if (bestStreetName) {
                            street = bestStreetName;
                        }
                    }
                    break;
                }
            } catch (e) {
                continue;
            }
        }
    }

    // 4. Layer 4: BigDataCloud Localized Reverse Geocoding
    if (!street || street.length <= 2 || !district) {
        try {
            const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${queryLat}&longitude=${queryLon}&localityLanguage=ar`;
            const bdcRes = await fetchWithTimeout(bdcUrl, {}, 2200);
            if (bdcRes && bdcRes.ok) {
                const bdcData = await bdcRes.json();
                if (bdcData) {
                    if (!district) {
                        district = bdcData.locality || bdcData.city || bdcData.principalSubdivision || "";
                    }
                    if (!street || street.length <= 2) {
                        const info = bdcData.localityInfo?.informative || [];
                        const streetObj = info.find((it: any) => 
                            (it.description && (it.description.toLowerCase().includes('road') || it.description.toLowerCase().includes('street'))) || 
                            (it.order && it.order >= 8)
                        );
                        if (streetObj?.name) {
                            street = streetObj.name;
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // 5. Layer 5: Photon Geocoding Engine (Komoot / OSM)
    if (!street || street.length <= 2 || !district) {
        try {
            const photonUrl = `https://photon.komoot.io/reverse?lat=${queryLat}&lon=${queryLon}`;
            const photonRes = await fetchWithTimeout(photonUrl, {}, 2000);
            if (photonRes && photonRes.ok) {
                const photonData = await photonRes.json();
                if (photonData?.features?.[0]?.properties) {
                    const props = photonData.features[0].properties;
                    if (!street || street.length <= 2) {
                        street = props.street || props.name || street;
                    }
                    if (!district) {
                        district = props.district || props.suburb || props.locality || props.city || district;
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // 6. Layer 6: OpenStreetMap Nominatim Engine
    if (!street || street.length <= 2 || !district) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${queryLat}&lon=${queryLon}&zoom=18&addressdetails=1&accept-language=ar`;
            const nomRes = await fetchWithTimeout(nomUrl, {}, 2000);
            if (nomRes && nomRes.ok) {
                const text = await nomRes.text();
                if (text && text.trim().startsWith('{')) {
                    const nomData = JSON.parse(text);
                    if (!street || street.length <= 2) {
                        street = nomData.address?.road || nomData.address?.pedestrian || nomData.address?.path || nomData.address?.residential || nomData.address?.street || nomData.name || street;
                    }
                    if (!district) {
                        district = nomData.address?.neighbourhood || nomData.address?.suburb || nomData.address?.city_district || nomData.address?.village || nomData.address?.quarter || district;
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Cleanup and normalize names
    if (street) {
        street = street
            .replace(/^[\d\s\-]+/, '')
            .replace(/,.*$/, '')
            .replace(/^Unnamed Road/i, '')
            .replace(/^طريق غير مسمى/i, '')
            .trim();
    }
    
    const result = {
        street: street || "غير متوفر",
        district: district || "غير متوفر"
    };

    return result;
};

/**
 * Fast in-memory spatial matching of a point/coordinate to the nearest street from a pre-fetched street network
 */
export const matchNearestStreetName = (
    lat: number,
    lon: number,
    streetLines: GeoPoint[],
    maxDistanceMeters: number = 85
): { street: string; district: string } | null => {
    if (!streetLines || streetLines.length === 0) return null;
    let minDistance = maxDistanceMeters;
    let bestStreet: string | null = null;
    let bestDistrict: string | null = null;

    for (const s of streetLines) {
        const name = s.street || s.name || (s.attributes && (s.attributes['name:ar'] || s.attributes['name'] || s.attributes['STREETNAME'] || s.attributes['الشارع']));
        if (!name || name === 'غير متوفر' || name === 'غير معروف' || name.length <= 2) continue;

        const path = s.path;
        if (path && path.length > 1) {
            for (let i = 0; i < path.length - 1; i++) {
                const dist = pointToSegmentDistanceMeters(lat, lon, path[i].y, path[i].x, path[i+1].y, path[i+1].x);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestStreet = name;
                    bestDistrict = s.district || (s.attributes && (s.attributes['district'] || s.attributes['الحي'])) || null;
                }
            }
        } else if (s.x && s.y) {
            const dist = getDistanceMeters(lat, lon, s.y, s.x);
            if (dist < minDistance) {
                minDistance = dist;
                bestStreet = name;
                bestDistrict = s.district || (s.attributes && (s.attributes['district'] || s.attributes['الحي'])) || null;
            }
        }
    }

    if (bestStreet) {
        return { street: bestStreet, district: bestDistrict || '' };
    }
    return null;
};


export const fetchStreetsInPolygon = async (
    polygon: {x: number, y: number}[], 
    shouldClip: boolean = true, 
    highwayTypes: string[] = [],
    onProgress?: (statusMsg: string, pct: number) => void
): Promise<GeoPoint[]> => {
    if (!polygon || polygon.length < 3) {
        throw new Error("يرجى تحديد منطقة صالحة على الخريطة أولاً.");
    }

    onProgress?.("جاري تجهيز النطاق الجغرافي للمنطقة...", 25);
    
    // Normalize polygon vertices into WGS84 Lat/Lon (convert UTM if necessary)
    const normalizedPolygon = polygon.map(p => {
        let lat = p.y;
        let lon = p.x;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            let easting = Math.min(Math.abs(lat), Math.abs(lon));
            let northing = Math.max(Math.abs(lat), Math.abs(lon));
            if (northing > 100000 && easting > 100000) {
                for (const z of [38, 37, 39, 36]) {
                    const converted = utmToLatLon(easting, northing, z, true);
                    if (converted.lat >= 12 && converted.lat <= 36 && converted.lon >= 33 && converted.lon <= 60) {
                        lat = converted.lat;
                        lon = converted.lon;
                        break;
                    }
                }
            }
        }
        return { x: lon, y: lat };
    });

    const minLat = Math.min(...normalizedPolygon.map(p => p.y));
    const maxLat = Math.max(...normalizedPolygon.map(p => p.y));
    const minLon = Math.min(...normalizedPolygon.map(p => p.x));
    const maxLon = Math.max(...normalizedPolygon.map(p => p.x));

    // Build Highway Filter
    let highwayFilter = highwayTypes.length > 0 
        ? `["highway"~"${highwayTypes.join('|')}"]` 
        : `["highway"~"primary|secondary|tertiary|residential|unclassified|living_street|service|trunk|motorway"]`;
        
    // Use Bounding Box query (much faster, resilient against complex polygon geometry errors in Overpass)
    // Then clip accurately to polygon using clipLineToPolygon below
    const bboxQuery = `[out:json][timeout:15]; ( way${highwayFilter}(${minLat.toFixed(5)},${minLon.toFixed(5)},${maxLat.toFixed(5)},${maxLon.toFixed(5)}); ); out body geom;`;

    // Also prepare polygon query if small polygon
    const polyStr = normalizedPolygon.slice(0, 30).map(p => `${p.y.toFixed(5)} ${p.x.toFixed(5)}`).join(' ');
    const polyQuery = `[out:json][timeout:15]; ( way${highwayFilter}(poly:"${polyStr}"); ); out body geom;`;

    const queriesToTry = normalizedPolygon.length <= 20 ? [polyQuery, bboxQuery] : [bboxQuery];

    const endpoints = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass.osm.ch/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter'
    ];

    let data: any = null;
    let lastError: any = null;

    onProgress?.("جاري الاتصال بخوادم الخرائط واسترجاع شبكة الشوارع...", 45);

    for (const endpoint of endpoints) {
        for (const query of queriesToTry) {
            try {
                const getUrl = `${endpoint}?data=${encodeURIComponent(query)}`;
                const response = await fetchWithTimeout(getUrl, { 
                    method: 'GET', 
                    headers: { 'Accept': 'application/json' }
                }, 10000);
                
                if (response && response.ok) {
                    const text = await response.text();
                    if (text && text.trim().startsWith('{')) {
                        const parsed = JSON.parse(text);
                        if (parsed && Array.isArray(parsed.elements)) {
                            data = parsed;
                            break;
                        }
                    }
                } else if (response) {
                    lastError = new Error(`Server ${endpoint} returned status ${response.status}`);
                }
            } catch (err: any) {
                lastError = err;
            }
        }
        if (data) break;
    }

    if (!data || !data.elements) {
        console.warn("Overpass API fallback notice:", lastError);
        // Fallback: return empty list gracefully rather than breaking app state
        return [];
    }

    onProgress?.(`جاري معالجة وتصفية ${data.elements.length} عنصر شارع مسترجع...`, 75);

    const results: GeoPoint[] = [];
    data.elements.forEach((el: any) => {
        if (el.type === 'way' && el.geometry && el.geometry.length > 1) {
            const rawPath = el.geometry.map((g: any) => ({ x: g.lon, y: g.lat }));
            
            const segmentsToProcess = shouldClip ? clipLineToPolygon(rawPath, normalizedPolygon) : [rawPath];
            
            segmentsToProcess.forEach((segment, idx) => {
                if (!segment || segment.length < 2) return;
                const name = el.tags?.['name:ar'] || el.tags?.name || `شارع ${el.id}`;
                const type = el.tags?.highway || 'street';
                let color = '#dcb13c';
                if (['primary', 'motorway', 'trunk'].includes(type)) color = '#ef4444';
                if (['secondary', 'tertiary'].includes(type)) color = '#3b82f6';
                if (['residential', 'service'].includes(type)) color = '#10b981';
                results.push({ 
                    id: segmentsToProcess.length > 1 ? `${name} [${idx + 1}]` : name, 
                    x: segment[0].x, 
                    y: segment[0].y, 
                    description: `نوع الطريق: ${type}`, 
                    layer: 'Overpass Streets', 
                    type: 'LineString', 
                    path: segment, 
                    color, 
                    originalLength: calculatePathLength(segment) 
                });
            });
        }
    });

    return results;
};
export const splitLinesAtIntersections = (lines: import('../types').GeoPoint[]): import('../types').GeoPoint[] => {
    // Count vertex occurrences to find intersections
    const vertexMap = new Map<string, Set<string>>(); // coordinate -> set of line ids
    
    // Helper to format coordinate
    const coordKey = (x: number, y: number) => `${x.toFixed(7)},${y.toFixed(7)}`;

    lines.forEach(line => {
        if (line.type === 'LineString' && line.path) {
            line.path.forEach(v => {
                const k = coordKey(v.x, v.y);
                if (!vertexMap.has(k)) {
                    vertexMap.set(k, new Set());
                }
                vertexMap.get(k)!.add(line.id);
            });
        }
    });

    const result: import('../types').GeoPoint[] = [];

    lines.forEach(line => {
        if (line.type === 'LineString' && line.path) {
            const currentPath = line.path;
            let segmentStartIdx = 0;
            let partIndex = 1;

            for (let i = 0; i < currentPath.length; i++) {
                const k = coordKey(currentPath[i].x, currentPath[i].y);
                const intersectingWaysCount = vertexMap.get(k)?.size || 0;
                
                // If this is an intersection with ANOTHER way, or it's the last point
                if ((intersectingWaysCount > 1 && i > segmentStartIdx && i < currentPath.length - 1) || i === currentPath.length - 1) {
                    const segmentPath = currentPath.slice(segmentStartIdx, i + 1);
                    if (segmentPath.length >= 2) {
                        result.push({
                            ...line,
                            id: `${line.id} [${partIndex++}]`,
                            path: segmentPath,
                            originalLength: calculatePathLength(segmentPath)
                        });
                    }
                    segmentStartIdx = i;
                }
            }
        } else {
            result.push(line);
        }
    });

    return result;
};
export interface OverlapResult {
  id1: string | number;
  id2: string | number;
  type: string;
  isIntersection?: boolean;
  intersectionPoint?: {x: number, y: number};
}

export const detectSpatialOverlap = (points: GeoPoint[]): OverlapResult[] => {
  const overlaps: OverlapResult[] = [];
  
  // 1. Detect Point / Polygon overlaps (identical coordinates)
  const map = new Map<string, GeoPoint[]>();
  
  const getSignature = (pt: GeoPoint) => {
    if (pt.type === 'Point' || !pt.type) {
      return `PT:${pt.x.toFixed(5)},${pt.y.toFixed(5)}`;
    } else if (pt.type === 'Polygon') {
      // Skip polygon overlap checks completely as requested
      return '';
    }
    return '';
  };

  for (const pt of points) {
    if (pt.type === 'LineString') continue; // Handle lines separately
    const sig = getSignature(pt);
    if (!sig) continue;
    if (!map.has(sig)) map.set(sig, []);
    map.get(sig)!.push(pt);
  }

  for (const [sig, pts] of map.entries()) {
    if (pts.length > 1) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          overlaps.push({
             id1: pts[i].id,
             id2: pts[j].id,
             type: pts[i].type || 'Point'
          });
        }
      }
    }
  }

  // 2. Detect LineString overlaps (partial collinear segments)
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);
  const segmentMap = new Map<string, {lineId: string | number, length: number}[]>();

  const getSegSig = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
    // order points so A->B and B->A have same signature
    const isReversed = (p1.x > p2.x || (p1.x === p2.x && p1.y > p2.y));
    if (isReversed) {
      return `${p2.x.toFixed(5)},${p2.y.toFixed(5)}|${p1.x.toFixed(5)},${p1.y.toFixed(5)}`;
    }
    return `${p1.x.toFixed(5)},${p1.y.toFixed(5)}|${p2.x.toFixed(5)},${p2.y.toFixed(5)}`;
  };

  for (const line of lines) {
    for (let i = 0; i < line.path!.length - 1; i++) {
      const p1 = line.path![i];
      const p2 = line.path![i+1];
      const sig = getSegSig(p1, p2);
      const len = getDistanceMeters(p1.y, p1.x, p2.y, p2.x);
      
      if (!segmentMap.has(sig)) segmentMap.set(sig, []);
      segmentMap.get(sig)!.push({lineId: line.id, length: len});
    }
  }

  const lineOverlapPairs = new Map<string, number>(); // lineId1|lineId2 => overlap length

  for (const [sig, segs] of segmentMap.entries()) {
    if (segs.length > 1) {
       for (let i = 0; i < segs.length; i++) {
         for (let j = i + 1; j < segs.length; j++) {
            const idA = segs[i].lineId;
            const idB = segs[j].lineId;
            if (idA === idB) continue; // Same line overlapping itself? Ignore for now
            
            const pairKey = String(idA) < String(idB) ? `${idA}|${idB}` : `${idB}|${idA}`;
            const currentLen = lineOverlapPairs.get(pairKey) || 0;
            lineOverlapPairs.set(pairKey, currentLen + segs[i].length);
         }
       }
    }
  }

  for (const [pairKey, overlapLen] of lineOverlapPairs.entries()) {
    if (overlapLen > 0.1) {
      const [id1, id2] = pairKey.split('|');
      overlaps.push({
        id1: id1,
        id2: id2,
        type: 'LineString'
      });
    }
  }

  // Detect intersections
  const EPSILON = 1e-9;
  
  const getIntersection = (p1: {x:number, y:number}, p2: {x:number, y:number}, p3: {x:number, y:number}, p4: {x:number, y:number}) => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < EPSILON) return null;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      const ix = p1.x + ua * (p2.x - p1.x);
      const iy = p1.y + ua * (p2.y - p1.y);
      
      const isEndpoint = 
          ((Math.abs(ix - p1.x) < EPSILON && Math.abs(iy - p1.y) < EPSILON) || (Math.abs(ix - p2.x) < EPSILON && Math.abs(iy - p2.y) < EPSILON)) &&
          ((Math.abs(ix - p3.x) < EPSILON && Math.abs(iy - p3.y) < EPSILON) || (Math.abs(ix - p4.x) < EPSILON && Math.abs(iy - p4.y) < EPSILON));
      
      if (isEndpoint) return null;

      return { x: ix, y: iy };
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i];
      const l2 = lines[j];
      
      // Skip if they are already exact overlaps
      if (overlaps.some(o => (o.id1 === l1.id && o.id2 === l2.id) || (o.id1 === l2.id && o.id2 === l1.id))) {
         continue;
      }

      let found = false;
      for (let m = 0; m < l1.path!.length - 1 && !found; m++) {
        for (let n = 0; n < l2.path!.length - 1 && !found; n++) {
          const pt = getIntersection(l1.path![m], l1.path![m+1], l2.path![n], l2.path![n+1]);
          if (pt) {
            overlaps.push({
              id1: l1.id,
              id2: l2.id,
              type: 'LineString',
              isIntersection: true,
              intersectionPoint: pt
            });
            found = true; // only record first intersection to avoid duplicates
          }
        }
      }
    }
  }

  return overlaps;
};

// Helper functions for spatial distance calculations
export const getPointDistanceMeters = (p1: {x: number, y: number}, p2: {x: number, y: number}): number => {
  if (Math.abs(p1.y) <= 90 && Math.abs(p2.y) <= 90 && Math.abs(p1.x) <= 180 && Math.abs(p2.x) <= 180) {
    return getDistanceMeters(p1.y, p1.x, p2.y, p2.x);
  }
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

export const getPointToSegDistMeters = (
  p: {x: number, y: number},
  s1: {x: number, y: number},
  s2: {x: number, y: number}
): number => {
  if (Math.abs(p.y) <= 90 && Math.abs(s1.y) <= 90) {
    return pointToSegmentDistanceMeters(p.y, p.x, s1.y, s1.x, s2.y, s2.x);
  }
  const dx = s2.x - s1.x;
  const dy = s2.y - s1.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - s1.x, p.y - s1.y);
  const t = Math.max(0, Math.min(1, ((p.x - s1.x) * dx + (p.y - s1.y) * dy) / (dx * dx + dy * dy)));
  const projX = s1.x + t * dx;
  const projY = s1.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
};

export const isBlackLine = (pt: GeoPoint): boolean => {
  if (pt.isDuplicateOverlay) return true;
  if (!pt.color) return false;
  const c = String(pt.color || '').trim().toLowerCase();
  return c === '#000000' || c === '#000' || c === 'black' || c === 'rgb(0,0,0)' || c === '#000000ff';
};

export const isLineOverlay = (l1: GeoPoint, l2: GeoPoint, maxMeters = 1.5): boolean => {
  if (!l1.path || !l2.path || l1.path.length < 2 || l2.path.length < 2) return false;

  // Use a reasonable tolerance for line-on-line overlays (minimum 1.5m)
  const toleranceMeters = Math.max(maxMeters, 1.5);

  // Helper to compute minimum distance from a point P to a polyline path
  const pointToPolylineDist = (p: {x: number, y: number}, path: {x: number, y: number}[]): number => {
    let minDist = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const d = getPointToSegDistMeters(p, path[i], path[i + 1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  };

  // Sample points uniformly along polyline path
  const samplePointsOnPath = (path: {x: number, y: number}[], targetSamples = 30): {x: number, y: number}[] => {
    const pts: {x: number, y: number}[] = [];
    if (path.length === 0) return pts;

    for (const p of path) pts.push(p);

    let totalLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
      totalLen += getPointDistanceMeters(path[i], path[i+1]);
    }

    if (totalLen > 0) {
      const step = Math.max(0.5, totalLen / targetSamples);
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        const segLen = getPointDistanceMeters(p1, p2);

        if (segLen <= 0) continue;

        let d = step;
        while (d < segLen) {
          const t = d / segLen;
          pts.push({
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y)
          });
          d += step;
        }
      }
    }
    return pts;
  };

  const len1 = calculatePathLength(l1.path);
  const len2 = calculatePathLength(l2.path);
  if (len1 <= 0 || len2 <= 0) return false;

  const targetSamples1 = Math.max(30, Math.ceil(len1 / 0.5));
  const targetSamples2 = Math.max(30, Math.ceil(len2 / 0.5));

  const samples1 = samplePointsOnPath(l1.path, targetSamples1);
  const samples2 = samplePointsOnPath(l2.path, targetSamples2);

  if (samples1.length === 0 || samples2.length === 0) return false;

  // Track near sample points of l1 close to l2
  let near1 = 0;
  let sumNearDist1 = 0;
  for (const s of samples1) {
    const dist = pointToPolylineDist(s, l2.path);
    if (dist <= toleranceMeters) {
      near1++;
      sumNearDist1 += dist;
    }
  }

  // Track near sample points of l2 close to l1
  let near2 = 0;
  let sumNearDist2 = 0;
  for (const s of samples2) {
    const dist = pointToPolylineDist(s, l1.path);
    if (dist <= toleranceMeters) {
      near2++;
      sumNearDist2 += dist;
    }
  }

  if (near1 === 0 || near2 === 0) return false;

  const ratio1 = near1 / samples1.length;
  const ratio2 = near2 / samples2.length;

  const approxOverlapLen1 = ratio1 * len1;
  const approxOverlapLen2 = ratio2 * len2;
  const maxOverlapLen = Math.max(approxOverlapLen1, approxOverlapLen2);

  const avgNearDist1 = sumNearDist1 / near1;
  const avgNearDist2 = sumNearDist2 / near2;

  // Average distance of the overlapping sample points must be within toleranceMeters
  if (avgNearDist1 > toleranceMeters || avgNearDist2 > toleranceMeters) return false;

  // Lines are considered collinear overlays (تطابق كامل / تطابق جزئي) if:
  // 1. Either line is mostly covered by the other (ratio2 >= 0.5 or ratio1 >= 0.5)
  // 2. OR both lines have significant overlap ratio (ratio1 >= 0.25 && ratio2 >= 0.25)
  // 3. OR the overlapping length in meters is >= 3.0 meters (and both have at least 5% overlap)
  const isOverlay = 
    (ratio1 >= 0.5 || ratio2 >= 0.5) ||
    (ratio1 >= 0.25 && ratio2 >= 0.25) ||
    (maxOverlapLen >= 3.0 && ratio1 >= 0.05 && ratio2 >= 0.05);

  return isOverlay;
};

// Helper interface for Bounding Box
export interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const getGeoPointBBox = (pt: GeoPoint): BBox => {
  if ((pt.type === 'LineString' || pt.type === 'Polygon') && pt.path && pt.path.length > 0) {
    let minX = pt.path[0].x, maxX = pt.path[0].x;
    let minY = pt.path[0].y, maxY = pt.path[0].y;
    for (let i = 1; i < pt.path.length; i++) {
      const p = pt.path[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }
  return { minX: pt.x, maxX: pt.x, minY: pt.y, maxY: pt.y };
};

export const bboxesIntersect = (b1: BBox, b2: BBox, marginDegrees: number): boolean => {
  return (
    b1.minX - marginDegrees <= b2.maxX &&
    b1.maxX + marginDegrees >= b2.minX &&
    b1.minY - marginDegrees <= b2.maxY &&
    b1.maxY + marginDegrees >= b2.minY
  );
};

export const buildSpatialGridIndex = (
  points: GeoPoint[],
  marginMeters: number = 5.0
): {
  bboxes: BBox[];
  marginDegrees: number;
  getCandidateIndices: (index: number) => number[];
} => {
  const marginDegrees = Math.max(marginMeters / 111000, 0.00005);
  const CELL_SIZE = 0.005; // ~500m grid cell size for fast spatial lookups

  const bboxes = points.map(p => getGeoPointBBox(p));
  const grid = new Map<string, number[]>();

  for (let i = 0; i < points.length; i++) {
    const b = bboxes[i];
    const minCellX = Math.floor((b.minX - marginDegrees) / CELL_SIZE);
    const maxCellX = Math.floor((b.maxX + marginDegrees) / CELL_SIZE);
    const minCellY = Math.floor((b.minY - marginDegrees) / CELL_SIZE);
    const maxCellY = Math.floor((b.maxY + marginDegrees) / CELL_SIZE);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = `${cx},${cy}`;
        let cell = grid.get(key);
        if (!cell) {
          cell = [];
          grid.set(key, cell);
        }
        cell.push(i);
      }
    }
  }

  const getCandidateIndices = (i: number): number[] => {
    const b1 = bboxes[i];
    const minCellX = Math.floor((b1.minX - marginDegrees) / CELL_SIZE);
    const maxCellX = Math.floor((b1.maxX + marginDegrees) / CELL_SIZE);
    const minCellY = Math.floor((b1.minY - marginDegrees) / CELL_SIZE);
    const maxCellY = Math.floor((b1.maxY + marginDegrees) / CELL_SIZE);

    const resultSet = new Set<number>();
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = grid.get(`${cx},${cy}`);
        if (cell) {
          for (const j of cell) {
            if (j > i && bboxesIntersect(b1, bboxes[j], marginDegrees)) {
              resultSet.add(j);
            }
          }
        }
      }
    }
    return Array.from(resultSet);
  };

  return { bboxes, marginDegrees, getCandidateIndices };
};

const yieldToMain = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

// ==========================================
// 1. التطابق (Duplicates / Line-on-Line Overlays): خط فوق خط
// ==========================================
export const detectExactDuplicates = async (
  points: GeoPoint[],
  maxMeters = 0.5,
  onProgress?: (percent: number) => void
): Promise<OverlapResult[]> => {
  const overlaps: OverlapResult[] = [];
  if (points.length === 0) return overlaps;

  const { getCandidateIndices } = buildSpatialGridIndex(points, Math.max(maxMeters, 5.0));
  let lastYieldTime = Date.now();

  for (let i = 0; i < points.length; i++) {
    if (Date.now() - lastYieldTime > 20) {
      if (onProgress) onProgress(Math.round((i / points.length) * 100));
      await yieldToMain();
      lastYieldTime = Date.now();
    }

    const pt1 = points[i];
    const candidateIndices = getCandidateIndices(i);

    for (const j of candidateIndices) {
      const pt2 = points[j];
      if (pt1.type !== pt2.type) continue;

      if (pt1.type === 'Point' || !pt1.type) {
        if (getPointDistanceMeters(pt1, pt2) <= maxMeters) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Point' });
        }
      } else if (pt1.type === 'LineString' && pt1.path && pt2.path) {
        if (isLineOverlay(pt1, pt2, maxMeters)) {
          const len1 = calculatePathLength(pt1.path);
          const len2 = calculatePathLength(pt2.path);
          
          const minLen = Math.min(len1, len2);
          const maxLen = Math.max(len1, len2);
          const lengthDiff = maxLen - minLen;
          
          const isFullDuplicate = lengthDiff < 1.5 && (lengthDiff / maxLen) < 0.05;
          const overlayType = isFullDuplicate ? 'تطابق كامل' : 'تطابق جزئي';

          overlaps.push({
            id1: pt1.id,
            id2: pt2.id,
            type: overlayType
          });
        }
      }
    }
  }

  if (onProgress) onProgress(100);
  return overlaps;
};

// ==========================================
// 2. التداخل (Line Intersections / Junctions): منطقة التقاء الخطوط
// ==========================================
export const detectLineIntersections = async (
  points: GeoPoint[],
  onProgress?: (percent: number) => void
): Promise<OverlapResult[]> => {
  const overlaps: OverlapResult[] = [];
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);
  if (lines.length === 0) return overlaps;

  const EPSILON = 1e-9;
  const getIntersection = (p1: {x:number, y:number}, p2: {x:number, y:number}, p3: {x:number, y:number}, p4: {x:number, y:number}) => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < EPSILON) return null;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      const ix = p1.x + ua * (p2.x - p1.x);
      const iy = p1.y + ua * (p2.y - p1.y);
      
      const isEndpoint = 
          ((Math.abs(ix - p1.x) < EPSILON && Math.abs(iy - p1.y) < EPSILON) || (Math.abs(ix - p2.x) < EPSILON && Math.abs(iy - p2.y) < EPSILON)) &&
          ((Math.abs(ix - p3.x) < EPSILON && Math.abs(iy - p3.y) < EPSILON) || (Math.abs(ix - p4.x) < EPSILON && Math.abs(iy - p4.y) < EPSILON));
      
      if (isEndpoint) return null;

      return { x: ix, y: iy };
    }
    return null;
  };

  const { getCandidateIndices } = buildSpatialGridIndex(lines, 10.0);
  let lastYieldTime = Date.now();

  for (let i = 0; i < lines.length; i++) {
    if (Date.now() - lastYieldTime > 20) {
      if (onProgress) onProgress(Math.round((i / lines.length) * 100));
      await yieldToMain();
      lastYieldTime = Date.now();
    }

    const l1 = lines[i];
    const candidateIndices = getCandidateIndices(i);

    for (const j of candidateIndices) {
      const l2 = lines[j];

      if (isLineOverlay(l1, l2, 5.0)) {
        continue;
      }

      let found = false;
      for (let m = 0; m < l1.path!.length - 1 && !found; m++) {
        for (let n = 0; n < l2.path!.length - 1 && !found; n++) {
          const pt = getIntersection(l1.path![m], l1.path![m+1], l2.path![n], l2.path![n+1]);
          if (pt) {
            overlaps.push({
              id1: l1.id,
              id2: l2.id,
              type: 'LineString',
              isIntersection: true,
              intersectionPoint: pt
            });
            found = true;
          }
        }
      }
    }
  }

  if (onProgress) onProgress(100);
  return overlaps;
};

// ==========================================
// 3. معالجة التطابق (حذف العناصر المتطابقة)
// ==========================================
export const resolveExactDuplicates = async (
  points: GeoPoint[],
  maxMeters = 5.0,
  onProgress?: (percent: number) => void
): Promise<{ cleanedPoints: GeoPoint[]; removedCount: number }> => {
  const cleanedPoints: GeoPoint[] = [];
  let removedCount = 0;
  if (points.length === 0) return { cleanedPoints, removedCount };

  let lastYieldTime = Date.now();
  const cleanedBBoxes: BBox[] = [];
  const marginDegrees = Math.max(maxMeters / 111000, 0.00005);

  for (let i = 0; i < points.length; i++) {
    if (Date.now() - lastYieldTime > 20) {
      if (onProgress) onProgress(Math.round((i / points.length) * 100));
      await yieldToMain();
      lastYieldTime = Date.now();
    }

    const pt = points[i];
    const ptBBox = getGeoPointBBox(pt);
    let isDup = false;

    for (let cIdx = 0; cIdx < cleanedPoints.length; cIdx++) {
      const existing = cleanedPoints[cIdx];
      if (pt.type !== existing.type && (pt.type === 'LineString' || existing.type === 'LineString')) {
        continue;
      }

      if (!bboxesIntersect(ptBBox, cleanedBBoxes[cIdx], marginDegrees)) {
        continue;
      }

      if (pt.type === 'Point' || !pt.type) {
        if (getPointDistanceMeters(pt, existing) <= maxMeters) {
          isDup = true;
          break;
        }
      } else if (pt.type === 'Polygon') {
        // Skip resolving polygons
      } else if (pt.type === 'LineString' && pt.path && existing.path) {
        if (isLineOverlay(pt, existing, maxMeters)) {
          const len1 = calculatePathLength(pt.path);
          const len2 = calculatePathLength(existing.path);
          const minLen = Math.min(len1, len2);
          if (minLen <= 5.0) {
            continue;
          }
          isDup = true;
          break;
        }
      }
    }

    if (isDup) {
      removedCount++;
    } else {
      cleanedPoints.push(pt);
      cleanedBBoxes.push(ptBBox);
    }
  }

  if (onProgress) onProgress(100);
  return { cleanedPoints, removedCount };
};

// ==========================================
// 4. معالجة التداخل (تقصير طول الخط فقط عند منطقة التقاء الخطوط بدون حذف العنصر)
// ==========================================
export const trimLinesAtIntersections = async (
  points: GeoPoint[],
  onProgress?: (percent: number) => void
): Promise<{ cleanedPoints: GeoPoint[]; trimmedCount: number }> => {
  const intersections = await detectLineIntersections(points, onProgress);
  
  if (intersections.length === 0) {
    return { cleanedPoints: points, trimmedCount: 0 };
  }

  const lineIntersectionsMap = new Map<string, {x: number, y: number}[]>();

  for (const item of intersections) {
    if (item.intersectionPoint) {
      const id1 = String(item.id1);
      const id2 = String(item.id2);

      if (!lineIntersectionsMap.has(id1)) lineIntersectionsMap.set(id1, []);
      lineIntersectionsMap.get(id1)!.push(item.intersectionPoint);

      if (!lineIntersectionsMap.has(id2)) lineIntersectionsMap.set(id2, []);
      lineIntersectionsMap.get(id2)!.push(item.intersectionPoint);
    }
  }

  let trimmedCount = 0;
  let lastYieldTime = Date.now();
  const cleanedPoints: GeoPoint[] = [];

  for (let pIdx = 0; pIdx < points.length; pIdx++) {
    if (Date.now() - lastYieldTime > 20) {
      await yieldToMain();
      lastYieldTime = Date.now();
    }

    const pt = points[pIdx];
    if (pt.type !== 'LineString' || !pt.path || pt.path.length < 2) {
      cleanedPoints.push(pt);
      continue;
    }

    const ptId = String(pt.id);
    const inters = lineIntersectionsMap.get(ptId);

    if (!inters || inters.length === 0) {
      cleanedPoints.push(pt);
      continue;
    }

    let currentPath = [...pt.path];
    let isModified = false;

    for (const ip of inters) {
      let segIndex = -1;
      let minSegDist = Infinity;

      for (let i = 0; i < currentPath.length - 1; i++) {
        const dist = getPointToSegDistMeters(ip, currentPath[i], currentPath[i+1]);
        if (dist < minSegDist) {
          minSegDist = dist;
          segIndex = i;
        }
      }

      if (segIndex !== -1 && minSegDist <= 10) {
        const pA = currentPath[segIndex];
        const pB = currentPath[segIndex + 1];

        const distAP = getPointDistanceMeters(pA, ip);
        const distPB = getPointDistanceMeters(ip, pB);

        const isNearStart = (segIndex === 0 && distAP <= 25);
        const isNearEnd = (segIndex === currentPath.length - 2 && distPB <= 25);

        if (isNearEnd && distPB > 0.1 && distAP > 0.1) {
          currentPath[segIndex + 1] = { x: ip.x, y: ip.y };
          isModified = true;
        } else if (isNearStart && distAP > 0.1 && distPB > 0.1) {
          currentPath[segIndex] = { x: ip.x, y: ip.y };
          isModified = true;
        } else if (distAP > 0.5 && distPB > 0.5) {
          currentPath.splice(segIndex + 1, 0, { x: ip.x, y: ip.y });
          isModified = true;
        }
      }
    }

    if (isModified) {
      trimmedCount++;
      cleanedPoints.push({ ...pt, path: currentPath });
    } else {
      cleanedPoints.push(pt);
    }
  }

  return { cleanedPoints, trimmedCount };
};

export interface NetworkGap {
  id: string;
  lineId: string | number;
  lineName?: string;
  layer?: string;
  color?: string;
  endpointType: 'start' | 'end';
  startCoord: { x: number; y: number }; // Start point of missing connection (the dangling line endpoint)
  endCoord?: { x: number; y: number }; // Nearest line point/endpoint candidate if within threshold
  gapDistanceMeters?: number;
  nearestLineId?: string | number;
  street?: string;
  district?: string;
}

/**
 * دالة لكشف الفجوات الشبكية (Network Gaps / Dangling Ends)
 * تقوم ببحث أطراف الخطوط (Start / End) التي لا تتصل بأي خط آخر أو عقدة ضمن مسافة حدية (مثلاً 10 إلى 50 متر)
 */
export const detectNetworkGaps = async (
  points: GeoPoint[],
  maxGapDistanceMeters: number = 35.0,
  onProgress?: (percent: number) => void
): Promise<NetworkGap[]> => {
  const gaps: NetworkGap[] = [];
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  if (lines.length === 0) return gaps;

  // 1. Build spatial grid index for all segments of all lines
  const { getCandidateIndices, bboxes } = buildSpatialGridIndex(lines, maxGapDistanceMeters);
  
  let lastYield = Date.now();

  for (let i = 0; i < lines.length; i++) {
    if (Date.now() - lastYield > 20) {
      if (onProgress) onProgress(Math.round((i / lines.length) * 100));
      await yieldToMain();
      lastYield = Date.now();
    }

    const currentLine = lines[i];
    const path = currentLine.path!;
    const endpoints: Array<{ type: 'start' | 'end'; point: { x: number; y: number } }> = [
      { type: 'start', point: path[0] },
      { type: 'end', point: path[path.length - 1] }
    ];

    for (const ep of endpoints) {
      let isConnected = false;
      let minDistance = Infinity;
      let nearestCandidate: { x: number; y: number } | undefined = undefined;
      let nearestLineId: string | number | undefined = undefined;

      // Check against all candidate lines in spatial neighborhood
      const candidates = getCandidateIndices(i);
      
      // Also check against candidates where j <= i (since getCandidateIndices only returns j > i)
      const allNeighborLineIndices: number[] = [];
      const marginDeg = Math.max(maxGapDistanceMeters / 111000, 0.00005);
      const epBBox = { minX: ep.point.x, maxX: ep.point.x, minY: ep.point.y, maxY: ep.point.y };
      
      for (let j = 0; j < lines.length; j++) {
        if (i === j) continue;
        if (bboxesIntersect(epBBox, bboxes[j], marginDeg)) {
          allNeighborLineIndices.push(j);
        }
      }

      for (const j of allNeighborLineIndices) {
        const otherLine = lines[j];
        const otherPath = otherLine.path!;

        for (let k = 0; k < otherPath.length - 1; k++) {
          const segA = otherPath[k];
          const segB = otherPath[k + 1];
          const dist = getPointToSegDistMeters(ep.point, segA, segB);

          // If endpoint is practically touching another segment (< 0.3 meters), it's connected!
          if (dist <= 0.3) {
            isConnected = true;
            break;
          }

          if (dist < minDistance && dist <= maxGapDistanceMeters) {
            minDistance = dist;
            nearestLineId = otherLine.id;
            
            // Calculate project point on segment
            const distAB = getPointDistanceMeters(segA, segB);
            const distAP = getPointDistanceMeters(segA, ep.point);
            const distBP = getPointDistanceMeters(segB, ep.point);
            if (distAP < distBP) {
              nearestCandidate = segA;
            } else {
              nearestCandidate = segB;
            }
          }
        }

        if (isConnected) break;
      }

      // If not connected to any existing network line within 0.3m, it's a dangling end / network gap
      if (!isConnected) {
        gaps.push({
          id: `GAP_${currentLine.id}_${ep.type}`,
          lineId: currentLine.id,
          lineName: String(currentLine.id),
          layer: currentLine.layer || 'Default',
          color: currentLine.color || '#dcb13c',
          endpointType: ep.type,
          startCoord: ep.point,
          endCoord: nearestCandidate,
          gapDistanceMeters: minDistance < Infinity ? minDistance : undefined,
          nearestLineId: nearestLineId,
          street: currentLine.street,
          district: currentLine.district
        });
      }
    }
  }

  return gaps;
};

export const resolveSpatialOverlaps = async (
  points: GeoPoint[],
  onProgress?: (percent: number) => void
): Promise<{ cleanedPoints: GeoPoint[]; removedCount: number; trimmedCount: number }> => {
  const { cleanedPoints: deduplicated, removedCount } = await resolveExactDuplicates(points, 5.0, (p) => {
    if (onProgress) onProgress(Math.round(p * 0.5));
  });
  const { cleanedPoints, trimmedCount } = await trimLinesAtIntersections(deduplicated, (p) => {
    if (onProgress) onProgress(Math.round(50 + p * 0.5));
  });
  return { cleanedPoints, removedCount, trimmedCount };
};

/**
 * بنية بيانات لتمثيل حدود العقار المستكشف
 */
export interface DetectedPropertyBoundary {
  id: string | number;
  polygon: { x: number; y: number }[];
  areaM2: number;
  perimeterM: number;
  center: { x: number; y: number };
}

/**
 * 1. اكتشاف حدود العقارات والمباني تلقائياً من النقاط والمضلعات
 * Automatically detects property polygons and closed lot boundaries from GeoPoint data
 */
export const detectPropertyPolygons = (
  points: GeoPoint[]
): DetectedPropertyBoundary[] => {
  if (!points || points.length === 0) return [];

  const detected: DetectedPropertyBoundary[] = [];

  points.forEach((pt, index) => {
    let vertices: { x: number; y: number }[] = [];

    if (pt.type === 'Polygon' && pt.path && pt.path.length >= 3) {
      vertices = [...pt.path];
    } else if (pt.type === 'LineString' && pt.path && pt.path.length >= 3) {
      // Check if the line forms a closed loop (start and end vertices match)
      const pFirst = pt.path[0];
      const pLast = pt.path[pt.path.length - 1];
      const distStartEnd = getPointDistanceMeters(pFirst, pLast);
      if (distStartEnd < 2.0 || pt.path.length >= 4) {
        vertices = [...pt.path];
      }
    }

    if (vertices.length < 3) return;

    // Close polygon ring if needed
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.x - last.x) > 1e-7 || Math.abs(first.y - last.y) > 1e-7) {
      vertices.push({ x: first.x, y: first.y });
    }

    // Calculate metric area
    let areaM2 = 0;
    try {
      const turfPoly = turf.polygon([vertices.map(v => [v.x, v.y])]);
      areaM2 = turf.area(turfPoly);
    } catch {
      // Fallback rough area
      const avgLat = vertices[0].y;
      const degLat = 111320;
      const degLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
      let signedArea = 0;
      for (let i = 0; i < vertices.length - 1; i++) {
        const x1 = vertices[i].x * degLng;
        const y1 = vertices[i].y * degLat;
        const x2 = vertices[i + 1].x * degLng;
        const y2 = vertices[i + 1].y * degLat;
        signedArea += (x1 * y2 - x2 * y1);
      }
      areaM2 = Math.abs(signedArea) / 2;
    }

    // Properties typically have areas between 25 m² and 250,000 m²
    if (areaM2 >= 20 && areaM2 <= 500000) {
      const perimeterM = calculatePathLength(vertices);
      let sumX = 0, sumY = 0;
      const n = vertices.length - 1;
      for (let i = 0; i < n; i++) {
        sumX += vertices[i].x;
        sumY += vertices[i].y;
      }
      detected.push({
        id: pt.id || `PROP_${index + 1}`,
        polygon: vertices,
        areaM2: Math.round(areaM2 * 100) / 100,
        perimeterM: Math.round(perimeterM * 100) / 100,
        center: { x: sumX / n, y: sumY / n }
      });
    }
  });

  return detected;
};

/**
 * 2. توليد ورسم مسارات الشبكة الهندسية في منتصف الشوارع المحيطة بالعقارات
 * Generates street network centerlines in the middle of streets surrounding properties
 * without intersecting or overlapping property boundaries.
 */
export const generateStreetCenterlinesFromProperties = (options: {
  points?: GeoPoint[];
  propertyPolygons?: { x: number; y: number }[][];
  streetWidthMeters?: number;
  layerName?: string;
  color?: string;
  linePrefix?: string;
}): GeoPoint[] => {
  const {
    points = [],
    propertyPolygons = [],
    streetWidthMeters = 12.0,
    layerName = 'Street Network (Centerline)',
    color = '#0284c7',
    linePrefix = 'ST_CENTER'
  } = options;

  // 1. Gather all property polygons
  const polygonsToProcess: { x: number; y: number }[][] = [];

  if (propertyPolygons.length > 0) {
    propertyPolygons.forEach(p => {
      if (p && p.length >= 3) polygonsToProcess.push(p);
    });
  }

  if (points.length > 0) {
    const detected = detectPropertyPolygons(points);
    detected.forEach(d => {
      polygonsToProcess.push(d.polygon);
    });
  }

  if (polygonsToProcess.length === 0) return [];

  const avgLat = polygonsToProcess[0][0]?.y || 24.7;
  const degLat = 111320;
  const degLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

  // 2. Convert to Turf Polygons and dissolve adjacent lots into unified urban blocks
  const turfPolys: turf.Feature<turf.Polygon>[] = [];
  polygonsToProcess.forEach((ring, idx) => {
    const coords = ring.map(pt => [pt.x, pt.y]);
    if (coords.length >= 3) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7) {
        coords.push([first[0], first[1]]);
      }
      if (coords.length >= 4) {
        try {
          const poly = turf.polygon([coords], { id: idx });
          if (turf.area(poly) > 5) {
            turfPolys.push(poly);
          }
        } catch {}
      }
    }
  });

  if (turfPolys.length === 0) return [];

  // 3. Union adjacent lots into macro-blocks to eliminate internal lot dividing lines
  const blockPerimeters: { x: number; y: number }[][] = [];

  try {
    const bufferedPolys: turf.Feature<turf.Polygon | turf.MultiPolygon>[] = [];
    turfPolys.forEach(tp => {
      try {
        const buf = turf.buffer(tp, 0.0002, { units: 'kilometers' }); // 0.2m buffer to close drafting seams
        if (buf) bufferedPolys.push(buf as any);
      } catch {
        bufferedPolys.push(tp);
      }
    });

    let unioned: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = null;
    if (bufferedPolys.length === 1) {
      unioned = bufferedPolys[0];
    } else if (bufferedPolys.length > 1) {
      try {
        unioned = turf.union(turf.featureCollection(bufferedPolys as any));
      } catch {
        let cur = bufferedPolys[0];
        for (let i = 1; i < bufferedPolys.length; i++) {
          try {
            const u = turf.union(turf.featureCollection([cur, bufferedPolys[i]]));
            if (u) cur = u;
          } catch {}
        }
        unioned = cur;
      }
    }

    if (unioned && unioned.geometry) {
      const geom = unioned.geometry;
      if (geom.type === 'Polygon') {
        blockPerimeters.push(geom.coordinates[0].map(c => ({ x: c[0], y: c[1] })));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(polyCoords => {
          blockPerimeters.push(polyCoords[0].map(c => ({ x: c[0], y: c[1] })));
        });
      }
    }
  } catch (err) {
    console.warn('Turf union fallback for properties:', err);
  }

  // Fallback if union was empty: use individual property polygons
  if (blockPerimeters.length === 0) {
    polygonsToProcess.forEach(p => blockPerimeters.push(p));
  }

  // 4. Extract Block Frontage Edges facing streets
  interface FrontageEdge {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    mid: { x: number; y: number };
    lenM: number;
    angle: number;
    nx: number; // Unit outward normal
    ny: number;
  }

  const frontageEdges: FrontageEdge[] = [];

  blockPerimeters.forEach(perimeter => {
    if (perimeter.length < 3) return;

    // Calculate signed area to determine winding order (CCW vs CW)
    let signedArea = 0;
    const n = perimeter.length;
    for (let i = 0; i < n - 1; i++) {
      signedArea += (perimeter[i].x * perimeter[i + 1].y - perimeter[i + 1].x * perimeter[i].y);
    }
    const isCCW = signedArea > 0;

    for (let i = 0; i < n - 1; i++) {
      const p1 = perimeter[i];
      const p2 = perimeter[i + 1];
      const dxM = (p2.x - p1.x) * degLng;
      const dyM = (p2.y - p1.y) * degLat;
      const lenM = Math.hypot(dxM, dyM);

      if (lenM < 3.0) continue; // Skip micro edges

      // Unit outward normal
      const nx = isCCW ? dyM / lenM : -dyM / lenM;
      const ny = isCCW ? -dxM / lenM : dxM / lenM;

      let ang = Math.atan2(dyM, dxM);
      if (ang < 0) ang += Math.PI;

      frontageEdges.push({
        p1,
        p2,
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        lenM,
        angle: ang,
        nx,
        ny
      });
    }
  });

  if (frontageEdges.length === 0) return [];

  // 5. Synthesize Street Centerlines between facing property blocks or by outward offset
  // Half the street width places the pipeline right in the center of the road corridor
  const halfStreetWidth = streetWidthMeters / 2;
  const rawCenterlineSegments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

  const matchedPairs = new Set<number>();

  // Check if two frontages face each other across a street (distance 8m - 40m and opposing normals)
  for (let i = 0; i < frontageEdges.length; i++) {
    const e1 = frontageEdges[i];
    let bestMatch = -1;
    let minStreetDist = Infinity;

    for (let j = i + 1; j < frontageEdges.length; j++) {
      if (matchedPairs.has(j)) continue;
      const e2 = frontageEdges[j];

      // Angle difference between edges
      let diffAng = Math.abs(e1.angle - e2.angle);
      if (diffAng > Math.PI / 2) diffAng = Math.PI - diffAng;

      // Must be roughly parallel (< 25 degrees)
      if (diffAng < (25 * Math.PI) / 180) {
        const dMid = Math.hypot((e1.mid.x - e2.mid.x) * degLng, (e1.mid.y - e2.mid.y) * degLat);
        // Opposing normals dot product < -0.3 (facing each other)
        const normalDot = e1.nx * e2.nx + e1.ny * e2.ny;

        if (dMid >= 6.0 && dMid <= 45.0 && normalDot < -0.3) {
          if (dMid < minStreetDist) {
            minStreetDist = dMid;
            bestMatch = j;
          }
        }
      }
    }

    if (bestMatch !== -1) {
      // Compute true street centerline midway between the two opposing block frontages
      const e2 = frontageEdges[bestMatch];
      matchedPairs.add(i);
      matchedPairs.add(bestMatch);

      const midP1 = { x: (e1.p1.x + e2.p2.x) / 2, y: (e1.p1.y + e2.p2.y) / 2 };
      const midP2 = { x: (e1.p2.x + e2.p1.x) / 2, y: (e1.p2.y + e2.p1.y) / 2 };
      rawCenterlineSegments.push({ p1: midP1, p2: midP2 });
    } else if (!matchedPairs.has(i)) {
      // Outer peripheral frontage facing open road: offset outward into middle of the street corridor
      const shiftLng = (e1.nx * halfStreetWidth) / degLng;
      const shiftLat = (e1.ny * halfStreetWidth) / degLat;

      const shiftedP1 = { x: e1.p1.x + shiftLng, y: e1.p1.y + shiftLat };
      const shiftedP2 = { x: e1.p2.x + shiftLng, y: e1.p2.y + shiftLat };
      rawCenterlineSegments.push({ p1: shiftedP1, p2: shiftedP2 });
    }
  }

  // 6. Filter out any centerline segment points that fall inside any property polygon
  const validCenterlines: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

  rawCenterlineSegments.forEach(seg => {
    let p1Inside = false;
    let p2Inside = false;

    for (const poly of polygonsToProcess) {
      if (!p1Inside && isPointInPolygon(seg.p1, poly)) p1Inside = true;
      if (!p2Inside && isPointInPolygon(seg.p2, poly)) p2Inside = true;
      if (p1Inside && p2Inside) break;
    }

    // Only keep segments that reside purely in the street outside properties
    if (!p1Inside && !p2Inside) {
      validCenterlines.push(seg);
    }
  });

  // 7. Topological Chaining into Continuous Street Lines
  const snapTolM = 5.0; // 5m snapping tolerance for street intersections
  interface CNode {
    id: number;
    x: number;
    y: number;
    edges: number[];
  }

  const nodes: CNode[] = [];
  const getNode = (pt: { x: number; y: number }): CNode => {
    for (const n of nodes) {
      const d = Math.hypot((n.x - pt.x) * degLng, (n.y - pt.y) * degLat);
      if (d <= snapTolM) return n;
    }
    const newNode: CNode = { id: nodes.length, x: pt.x, y: pt.y, edges: [] };
    nodes.push(newNode);
    return newNode;
  };

  interface CEdge {
    id: number;
    u: number;
    v: number;
    lenM: number;
    angle: number;
    used: boolean;
  }

  const cEdges: CEdge[] = [];
  validCenterlines.forEach(seg => {
    const nA = getNode(seg.p1);
    const nB = getNode(seg.p2);
    if (nA.id !== nB.id) {
      const exists = cEdges.find(e => (e.u === nA.id && e.v === nB.id) || (e.u === nB.id && e.v === nA.id));
      if (!exists) {
        const eId = cEdges.length;
        const dx = (nB.x - nA.x) * degLng;
        const dy = (nB.y - nA.y) * degLat;
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI;

        const ce: CEdge = {
          id: eId,
          u: nA.id,
          v: nB.id,
          lenM: Math.hypot(dx, dy),
          angle: ang,
          used: false
        };
        cEdges.push(ce);
        nA.edges.push(eId);
        nB.edges.push(eId);
      }
    }
  });

  const continuousStreetChains: { x: number; y: number }[][] = [];

  cEdges.forEach(startEdge => {
    if (startEdge.used) return;

    const pathNodes: number[] = [startEdge.u, startEdge.v];
    startEdge.used = true;
    let currentAng = startEdge.angle;

    // Extend forward
    let extended = true;
    while (extended) {
      extended = false;
      const lastId = pathNodes[pathNodes.length - 1];
      const prevId = pathNodes[pathNodes.length - 2];
      const candidates = nodes[lastId].edges.map(eid => cEdges[eid]).filter(e => !e.used);

      let bestEdge: CEdge | null = null;
      let minDiff = Infinity;

      for (const cand of candidates) {
        const nextId = cand.u === lastId ? cand.v : cand.u;
        if (nextId === prevId || pathNodes.includes(nextId)) continue;

        let diff = Math.abs(cand.angle - currentAng);
        if (diff > Math.PI / 2) diff = Math.PI - diff;

        if (diff < (55 * Math.PI) / 180 && diff < minDiff) {
          minDiff = diff;
          bestEdge = cand;
        }
      }

      if (bestEdge) {
        bestEdge.used = true;
        currentAng = bestEdge.angle;
        const nextId = bestEdge.u === lastId ? bestEdge.v : bestEdge.u;
        pathNodes.push(nextId);
        extended = true;
      }
    }

    if (pathNodes.length >= 2) {
      const pathPts = pathNodes.map(nid => ({ x: nodes[nid].x, y: nodes[nid].y }));
      const totalLen = calculatePathLength(pathPts);
      if (totalLen >= 10.0) {
        continuousStreetChains.push(pathPts);
      }
    }
  });

  // 8. Output as GeoPoint array
  const outputNetwork: GeoPoint[] = continuousStreetChains.map((path, idx) => {
    const num = String(idx + 1).padStart(3, '0');
    const pathLen = calculatePathLength(path);
    return {
      id: `${linePrefix}_${num}`,
      x: path[0].x,
      y: path[0].y,
      type: 'LineString',
      layer: layerName,
      path: path,
      originalLength: Math.round(pathLen * 100) / 100,
      color: color,
      description: `مسار شبكة في منتصف الشارع - طول ${pathLen.toFixed(1)}م`,
      diameterMm: 200,
      material: 'uPVC'
    };
  });

  return outputNetwork;
};



