
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

const geocodeCache = new Map<string, { street: string; district: string }>();

export const getReverseGeocode = async (lat: number, lon: number): Promise<{street: string, district: string}> => {
    if (!lat || !lon) return { street: "غير متوفر", district: "غير متوفر" };

    // Check cache first (~100m grid resolution)
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey)!;
    }

    let street = "";
    let district = "";

    // 1. Try ArcGIS as primary (very robust for Saudi Arabia streets with standard CORS support)
    try {
        const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&location=${lon},${lat}&langCode=ar`;
        const arcgisRes = await fetch(arcgisUrl);
        if (arcgisRes.ok) {
            const arcgisData = await arcgisRes.json();
            if (arcgisData.address) {
                const addr = arcgisData.address;
                district = addr.District || addr.Neighborhood || addr.City || "";
                let rawStreet = addr.Address || addr.ShortLabel || addr.Match_addr || "";
                street = rawStreet.replace(/^[\d\s\-]+/, '').trim();
                if (street.includes(",")) {
                    street = street.split(",")[0].trim();
                }
            }
        }
    } catch (e) {
        // Silent catch for network/CORS issues
    }

    // 2. Try Nominatim if ArcGIS failed to get street
    if (!street || street.length <= 2 || street.includes("Unnamed") || street === "غير متوفر") {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ar`;
            const nomRes = await fetch(nomUrl);
            if (nomRes.ok) {
                const nomData = await nomRes.json();
                street = nomData.address?.road || nomData.address?.pedestrian || nomData.address?.path || nomData.address?.footway || nomData.address?.residential || nomData.address?.street || nomData.address?.highway || nomData.address?.suburb || street;
                if (!district) {
                    district = nomData.address?.neighbourhood || nomData.address?.suburb || nomData.address?.city_district || nomData.address?.village || nomData.address?.quarter || "";
                }

                if (!street || street.length <= 2) {
                    if (nomData.name && !nomData.name.includes(",")) {
                        street = nomData.name;
                    }
                }
            }
        } catch (e) {
            // Silent catch
        }
    }

    // 3. Fallback to Overpass API for nearest street name if still not found
    if (!street || street.length <= 2) {
        const endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://lz4.overpass-api.de/api/interpreter',
            'https://z.overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
        ];
        // Correct Overpass QL syntax: "out tags 1;" instead of "out tags limit 1;"
        const query = `[out:json][timeout:5];way(around:100,${lat},${lon})["highway"]["name"];out tags 1;`;
        
        for (const endpoint of endpoints) {
            try {
                // Try GET first as GET requests include Access-Control-Allow-Origin on Overpass mirrors
                const getUrl = `${endpoint}?data=${encodeURIComponent(query)}`;
                let overpassRes = await fetch(getUrl);
                if (!overpassRes.ok) {
                    // Try POST as secondary
                    overpassRes = await fetch(endpoint, {
                        method: 'POST',
                        body: query
                    });
                }
                if (overpassRes.ok) {
                    const overpassData = await overpassRes.json();
                    if (overpassData.elements && overpassData.elements.length > 0) {
                        street = overpassData.elements[0].tags?.['name:ar'] || overpassData.elements[0].tags?.name || "";
                    }
                    break;
                }
            } catch (e) {
                continue;
            }
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
            // Try GET request first for better CORS compatibility across hosting providers like Vercel
            const getUrl = `${endpoint}?data=${encodeURIComponent(query)}`;
            let response = await fetch(getUrl);
            if (!response.ok) {
                response = await fetch(endpoint, { 
                    method: 'POST', 
                    body: query
                });
            }
            if (response.ok) {
                data = await response.json();
                break;
            } else {
                lastError = new Error(`Server ${endpoint} returned ${response.status}`);
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
    if (overlapLen > 5) {
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
