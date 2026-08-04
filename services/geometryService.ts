
import { GeoPoint } from '../types';

/**
 * دالة للتحقق مما إذا كانت النقطة داخل المضلع باستخدام خوارزمية Ray Casting
 */
export const isPointInPolygon = (point: {x: number, y: number}, polygon: {x: number, y: number}[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
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
    if (points.length === 0) return [];
    
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;

    points.forEach(p => {
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
    if (points.length <= 2) return points;

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

export const splitLineString = (path: {x: number, y: number, z?: number}[], maxLength: number): {x: number, y: number, z?: number}[][] => {
    if (path.length < 2) return [path];
    
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

export const calculatePathLength = (path: {x: number, y: number}[]): number => {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
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

const geocodeCache = new Map<string, { street: string; district: string }>();

export const getReverseGeocode = async (
    lat: number, 
    lon: number, 
    mode: 'accurate' | 'fast' = 'accurate'
): Promise<{street: string, district: string}> => {
    if (!lat || !lon) return { street: "غير متوفر", district: "غير متوفر" };

    // Check cache: in accurate mode, use 4 decimal precision (~11m); in fast mode, use 3 decimal precision (~110m)
    const cacheKey = mode === 'accurate' 
        ? `${lat.toFixed(4)},${lon.toFixed(4)}` 
        : `${lat.toFixed(3)},${lon.toFixed(3)}`;

    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey)!;
    }

    let street = "";
    let district = "";

    const isAccurate = mode === 'accurate';
    const primaryTimeout = isAccurate ? 3000 : 1800;

    // 1. Primary: ArcGIS World Geocoding Service (high precision in Middle East & KSA, reliable & fast)
    try {
        const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&location=${lon},${lat}&langCode=ar`;
        const arcgisRes = await fetchWithTimeout(arcgisUrl, {}, primaryTimeout);
        if (arcgisRes && arcgisRes.ok) {
            const arcgisData = await arcgisRes.json();
            if (arcgisData && arcgisData.address) {
                const addr = arcgisData.address;
                district = addr.District || addr.Neighborhood || addr.City || addr.Subregion || "";
                let rawStreet = addr.Address || addr.ShortLabel || addr.Match_addr || addr.StAddr || "";
                // Clean leading numbers/house codes if present
                street = rawStreet.replace(/^[\d\s\-]+/, '').trim();
                if (street.includes(",")) {
                    street = street.split(",")[0].trim();
                }
            }
        }
    } catch (e) {
        // Fallback silently
    }

    // 2. Query Overpass only if street name is missing or invalid
    if (!street || street.length <= 2 || street === "غير متوفر") {
        const endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter'
        ];
        
        const radius = isAccurate ? 80 : 50;
        const query = `[out:json][timeout:3];way(around:${radius},${lat},${lon})["highway"~"primary|secondary|tertiary|residential|unclassified|living_street|service"]["name"];out body geom;`;
        
        for (const endpoint of endpoints) {
            try {
                const res = await fetchWithTimeout(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `data=${encodeURIComponent(query)}`
                }, 2000);

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
                                        lat, lon,
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

    // 3. Fallback: Nominatim if street or district is still incomplete
    if (!street || street.length <= 2 || !district) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ar`;
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
    
    const result = {
        street: street || "غير متوفر",
        district: district || "غير متوفر"
    };

    geocodeCache.set(cacheKey, result);
    return result;
};

export const fetchStreetsInPolygon = async (polygon: {x: number, y: number}[], shouldClip: boolean = true, highwayTypes: string[] = []): Promise<GeoPoint[]> => {
    if (polygon.length < 3) throw new Error("يرجى تحديد منطقة صالحة على الخريطة أولاً.");
    
    const polyStr = polygon.map(p => `${p.y} ${p.x}`).join(' ');
    
    // بناء الفلتر حسب الأنواع المختارة
    let highwayFilter = highwayTypes.length > 0 
        ? `["highway"~"${highwayTypes.join('|')}"]` 
        : `["highway"]`;
        
    const query = `[out:json][timeout:25]; ( way${highwayFilter}(poly:"${polyStr}"); ); out body geom;`;

    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

    let data = null;
    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            let response = await fetchWithTimeout(endpoint, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            }, 12000);
            if (response && response.ok) {
                data = await response.json();
                break;
            } else {
                lastError = new Error(`Server ${endpoint} failed or returned error status`);
            }
        } catch (err) {
            lastError = err;
        }
    }

    if (!data) {
        console.error("Overpass API Error:", lastError);
        throw new Error("فشل الاتصال بخادم البيانات الجغرافية. جميع الخوادم غير متاحة.");
    }

    const results: GeoPoint[] = [];
    if (data.elements) {
        data.elements.forEach((el: any) => {
            if (el.type === 'way' && el.geometry) {
                const rawPath = el.geometry.map((g: any) => ({ x: g.lon, y: g.lat }));
                
                const segmentsToProcess = shouldClip ? clipLineToPolygon(rawPath, polygon) : [rawPath];
                
                segmentsToProcess.forEach((segment, idx) => {
                    const name = el.tags?.name || el.tags?.name_ar || `شارع ${el.id}`;
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
    }
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
    } else if (pt.type === 'Polygon' && pt.path && pt.path.length > 0) {
      const pathStrs = [...pt.path].map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).sort().join('|');
      return `PL:${pathStrs}`;
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

export const isLineOverlay = (l1: GeoPoint, l2: GeoPoint, maxMeters = 1.0): boolean => {
  if (!l1.path || !l2.path || l1.path.length < 2 || l2.path.length < 2) return false;

  // Strict tolerance limit for direct line-on-line overlays (خط فوق خط):
  // Lines running parallel beside each other (lines side-by-side, e.g. 1.5m to 5m apart) must NOT be flagged as duplicates.
  const strictMaxMeters = Math.min(maxMeters, 1.0);

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
  const samplePointsOnPath = (path: {x: number, y: number}[], targetSamples = 20): {x: number, y: number}[] => {
    const pts: {x: number, y: number}[] = [];
    if (path.length === 0) return pts;

    // Add all actual vertices
    for (const p of path) pts.push(p);

    // Compute total path length
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

  const samples1 = samplePointsOnPath(l1.path, 20);
  const samples2 = samplePointsOnPath(l2.path, 20);

  if (samples1.length === 0 || samples2.length === 0) return false;

  // Count sample points of l1 close to l2 and track average distance
  let near1 = 0;
  let totalDist1 = 0;
  for (const s of samples1) {
    const dist = pointToPolylineDist(s, l2.path);
    totalDist1 += dist;
    if (dist <= strictMaxMeters) {
      near1++;
    }
  }

  // Count sample points of l2 close to l1 and track average distance
  let near2 = 0;
  let totalDist2 = 0;
  for (const s of samples2) {
    const dist = pointToPolylineDist(s, l1.path);
    totalDist2 += dist;
    if (dist <= strictMaxMeters) {
      near2++;
    }
  }

  const avgDist1 = totalDist1 / samples1.length;
  const avgDist2 = totalDist2 / samples2.length;

  // If average distance exceeds tolerance, lines are adjacent (جوار بعض) not direct line-on-line overlays (فوق بعض)
  if (avgDist1 > strictMaxMeters || avgDist2 > strictMaxMeters) return false;

  const ratio1 = near1 / samples1.length;
  const ratio2 = near2 / samples2.length;

  return (ratio1 >= 0.7 && ratio2 >= 0.7) || (ratio1 >= 0.85 && ratio2 >= 0.4) || (ratio2 >= 0.85 && ratio1 >= 0.4);
};

// ==========================================
// 1. التطابق (Duplicates / Line-on-Line Overlays): خط فوق خط
// ==========================================
export const detectExactDuplicates = (points: GeoPoint[], maxMeters = 0.5): OverlapResult[] => {
  const overlaps: OverlapResult[] = [];
  
  // A. Detect Point / Polygon duplicate overlaps
  for (let i = 0; i < points.length; i++) {
    const pt1 = points[i];

    for (let j = i + 1; j < points.length; j++) {
      const pt2 = points[j];
      if (pt1.type !== pt2.type) continue;

      if (pt1.type === 'Point' || !pt1.type) {
        if (getPointDistanceMeters(pt1, pt2) <= maxMeters) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Point' });
        }
      } else if (pt1.type === 'Polygon' && pt1.path && pt2.path) {
        if (isLineOverlay(pt1, pt2, maxMeters)) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Polygon' });
        }
      }
    }
  }

  // B. Detect LineString direct overlays (خط فوق خط)
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i];
      const l2 = lines[j];

      if (isLineOverlay(l1, l2, maxMeters)) {
        const len1 = calculatePathLength(l1.path!);
        const len2 = calculatePathLength(l2.path!);
        
        const minLen = Math.min(len1, len2);
        const maxLen = Math.max(len1, len2);
        const lengthDiff = maxLen - minLen;
        
        const isFullDuplicate = lengthDiff < 1.0 || (lengthDiff / maxLen) < 0.05;
        
        let overlayType = 'LineString';
        if (isFullDuplicate) {
            overlayType = 'تطابق كامل';
        } else if (minLen > 5.0) {
            overlayType = 'تطابق جزئي';
        } else {
            overlayType = 'تقاطع';
        }

        if (overlayType !== 'تقاطع') {
            overlaps.push({
              id1: l1.id,
              id2: l2.id,
              type: overlayType
            });
        }
      }
    }
  }

  return overlaps;
};

// ==========================================
// 2. التداخل (Line Intersections / Junctions): منطقة التقاء الخطوط
// ==========================================
export const detectLineIntersections = (points: GeoPoint[]): OverlapResult[] => {
  const overlaps: OverlapResult[] = [];
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);
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

      // Check for line overlays
      if (isLineOverlay(l1, l2, 5.0)) {
          const len1 = calculatePathLength(l1.path!);
          const len2 = calculatePathLength(l2.path!);
          const minLen = Math.min(len1, len2);
          
          if (minLen <= 5.0) {
              // It's a short overlay, considered an intersection!
              // Use the midpoint of the shorter line as the intersection point
              const shorterLine = len1 < len2 ? l1 : l2;
              const midIndex = Math.floor(shorterLine.path!.length / 2);
              const ixPt = shorterLine.path![midIndex];
              
              overlaps.push({
                  id1: l1.id,
                  id2: l2.id,
                  type: 'تقاطع (تطابق قصير)',
                  isIntersection: true,
                  intersectionPoint: { x: ixPt.x, y: ixPt.y }
              });
          }
          continue; // Skip further mathematical intersection checks for overlays
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

  return overlaps;
};

// ==========================================
// 3. معالجة التطابق (حذف العناصر المتطابقة)
// ==========================================
export const resolveExactDuplicates = (points: GeoPoint[], maxMeters = 5.0): { cleanedPoints: GeoPoint[]; removedCount: number } => {
  const cleanedPoints: GeoPoint[] = [];
  let removedCount = 0;

  for (const pt of points) {
    let isDup = false;

    for (const existing of cleanedPoints) {
      if (pt.type !== existing.type && (pt.type === 'LineString' || existing.type === 'LineString')) {
        continue;
      }

      if (pt.type === 'Point' || !pt.type) {
        if (getPointDistanceMeters(pt, existing) <= maxMeters) {
          isDup = true;
          break;
        }
      } else if ((pt.type === 'Polygon' || pt.type === 'LineString') && pt.path && existing.path) {
        if (isLineOverlay(pt, existing, maxMeters)) {
          if (pt.type === 'LineString') {
            const len1 = calculatePathLength(pt.path);
            const len2 = calculatePathLength(existing.path);
            const minLen = Math.min(len1, len2);
            if (minLen <= 5.0) {
              // User specified: If the element length is <= 5m, it's an intersection, not a duplicate.
              // So we do not remove it as a duplicate.
              continue;
            }
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
    }
  }

  return { cleanedPoints, removedCount };
};

// ==========================================
// 4. معالجة التداخل (تقصير طول الخط فقط عند منطقة التقاء الخطوط بدون حذف العنصر)
// ==========================================
export const trimLinesAtIntersections = (points: GeoPoint[]): { cleanedPoints: GeoPoint[]; trimmedCount: number } => {
  const intersections = detectLineIntersections(points);
  
  if (intersections.length === 0) {
    return { cleanedPoints: points, trimmedCount: 0 };
  }

  // Map of line ID -> array of intersection points
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

  // Process EVERY point (1:1 mapping - no elements are EVER deleted)
  const cleanedPoints = points.map(pt => {
    if (pt.type !== 'LineString' || !pt.path || pt.path.length < 2) {
      return pt;
    }

    const ptId = String(pt.id);
    const inters = lineIntersectionsMap.get(ptId);

    if (!inters || inters.length === 0) {
      // Unrelated line: 100% untouched
      return pt;
    }

    // Line has intersection with another line
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
          // Trim end overshoot to stop cleanly at junction ip
          currentPath[segIndex + 1] = { x: ip.x, y: ip.y };
          isModified = true;
        } else if (isNearStart && distAP > 0.1 && distPB > 0.1) {
          // Trim start overshoot to start cleanly at junction ip
          currentPath[segIndex] = { x: ip.x, y: ip.y };
          isModified = true;
        } else if (distAP > 0.5 && distPB > 0.5) {
          // Insert junction vertex ip into line path
          currentPath.splice(segIndex + 1, 0, { x: ip.x, y: ip.y });
          isModified = true;
        }
      }
    }

    if (isModified) {
      trimmedCount++;
      return { ...pt, path: currentPath };
    }

    return pt;
  });

  return { cleanedPoints, trimmedCount };
};

export const resolveSpatialOverlaps = (points: GeoPoint[]): { cleanedPoints: GeoPoint[]; removedCount: number; trimmedCount: number } => {
  const { cleanedPoints: deduplicated, removedCount } = resolveExactDuplicates(points);
  const { cleanedPoints, trimmedCount } = trimLinesAtIntersections(deduplicated);
  return { cleanedPoints, removedCount, trimmedCount };
};

