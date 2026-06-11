
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

export const getReverseGeocode = async (lat: number, lon: number): Promise<{street: string, district: string}> => {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ar`;
        const response = await fetch(url);
        const data = await response.json();
        return {
            street: data.address?.road || data.address?.pedestrian || "شارع غير معروف",
            district: data.address?.suburb || data.address?.neighbourhood || "حي غير معروف"
        };
    } catch {
        return { street: "غير متوفر", district: "غير متوفر" };
    }
};

export const fetchStreetsInPolygon = async (polygon: {x: number, y: number}[], shouldClip: boolean = true, highwayTypes: string[] = []): Promise<GeoPoint[]> => {
    if (polygon.length < 3) throw new Error("يرجى تحديد منطقة صالحة على الخريطة أولاً.");
    
    const polyStr = polygon.map(p => `${p.y} ${p.x}`).join(' ');
    
    // بناء الفلتر حسب الأنواع المختارة
    let highwayFilter = highwayTypes.length > 0 
        ? `["highway"~"${highwayTypes.join('|')}"]` 
        : `["highway"]`;
        
    const query = `[out:json][timeout:25]; ( way${highwayFilter}(poly:"${polyStr}"); ); out body geom;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!response.ok) throw new Error("فشل الاتصال بخادم البيانات الجغرافية.");
    const data = await response.json();
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
