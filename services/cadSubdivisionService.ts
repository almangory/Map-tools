import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import * as turf from '@turf/turf';
import { GeoPoint } from '../types';
import { COMMON_UTM_CRS } from './cadNetworkExtractorService';
import { computeGravityPipeSegment, enrichGeoPointWithHydraulics, orientNetworkTowardsOutfall } from './gravitySewerEngine';

export interface ExtractedCadEntity {
  id: string;
  type: 'Point' | 'LineString' | 'Polygon' | 'Text';
  layer: string;
  vertices: { x: number; y: number }[]; // WGS84 coordinates (Lng, Lat)
  rawVertices?: { x: number; y: number }[]; // Original CAD coordinates (e.g. UTM meters)
  text?: string;
  textPosition?: { x: number; y: number };
  areaM2?: number;
  lengthM?: number;
  streetWidthM?: number;
}

export interface LayerCategorization {
  name: string;
  count: number;
  category: 'parcels' | 'streets' | 'texts' | 'utilities' | 'other';
  confidence: number;
  reason: string;
}

export interface DetectedStreetWidthAnnotation {
  text: string;
  widthMeters: number;
  position: { x: number; y: number }; // WGS84
  layer: string;
}

export interface SubdivisionAnalysisResult {
  filename: string;
  totalEntities: number;
  layers: LayerCategorization[];
  parcels: ExtractedCadEntity[];
  streets: ExtractedCadEntity[];
  streetWidths: DetectedStreetWidthAnnotation[];
  otherEntities: ExtractedCadEntity[];
  detectedParcelsCount: number;
  detectedStreetsCount: number;
  detectedBlocksCount: number;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface UtilityPipelineOptions {
  networkType: 'sewer' | 'water' | 'both';
  placementMode: 'connected_frontage' | 'street_centerline' | 'dual_sidewalk' | 'property_perimeter_loop';
  offsetMeters: number; // e.g. 1.5 - 3.0 meters from property line
  sewerColor: string;
  waterColor: string;
  sewerDiameter: string;
  waterDiameter: string;
  material: string;
  permitNo: string;
  includeHouseConnections?: boolean;
  selectedParcelLayers?: string[];
  selectedStreetLayers?: string[];
  generateManholes?: boolean;
  generateOutfalls?: boolean;
  customOutfallCoord?: { x: number; y: number };
  outfallStrategy?: 'lowest_point' | 'boundary_exit' | 'custom';
}

// Regex patterns for smart layer classification
export const PARCEL_LAYER_REGEX = /(?:قطعة|قطع|بلوك|عقار|عقارات|مبنى|مباني|أراضي|اراضي|مخطط|حدود|سكن|سكني|تجاري|مرفق|مرافق|حديقة|مسجد|تعليم|parcel|parcels|lot|lots|block|blocks|bldg|building|buildings|property|boundary|zone|land|poly|area)/i;
export const STREET_LAYER_REGEX = /(?:شارع|شوارع|طريق|طرق|محور|سنتر|تنظيم|خط_تنظيم|رصيف|حرم|road|roads|street|streets|cntr|center|centre|axis|cl|c-road|c_road|corridor|row|asphalt|curb|right-of-way)/i;
export const TEXT_LAYER_REGEX = /(?:نص|نصوص|أبعاد|ابعاد|عرض|كتابة|text|txt|dim|dimension|anno|label|annotation|width)/i;
export const UTILITY_LAYER_REGEX = /(?:مياه|مية|صرف|صحي|شبكة|أنابيب|انابيب|كهرباء|هاتف|أمطار|امطار|water|sewer|sanitary|storm|drain|pipe|pipes|cable|util|utility)/i;

/**
 * Calculate geodesic length in meters for a path of WGS84 coordinates
 */
export const calculateGeoPathLength = (pts: { x: number; y: number }[]): number => {
  if (pts.length < 2) return 0;
  let dist = 0;
  const R = 6378137; // Earth radius in meters
  for (let i = 0; i < pts.length - 1; i++) {
    const lat1 = (pts[i].y * Math.PI) / 180;
    const lat2 = (pts[i + 1].y * Math.PI) / 180;
    const dLat = ((pts[i + 1].y - pts[i].y) * Math.PI) / 180;
    const dLon = ((pts[i + 1].x - pts[i].x) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    dist += R * c;
  }
  return dist;
};

/**
 * Calculate approximate polygon area in square meters (WGS84 projection approximation)
 */
export const calculatePolygonAreaM2 = (pts: { x: number; y: number }[]): number => {
  if (pts.length < 3) return 0;
  const avgLat = (pts.reduce((acc, p) => acc + p.y, 0) / pts.length) * (Math.PI / 180);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(avgLat);

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const xi = pts[i].x * metersPerDegLng;
    const yi = pts[i].y * metersPerDegLat;
    const xj = pts[j].x * metersPerDegLng;
    const yj = pts[j].y * metersPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
};

/**
 * Parse text like "شارع عرض 18 متر" or "شارع عرض 30 م" or "30m street"
 */
export const extractStreetWidthFromText = (text: string): number | null => {
  if (!text) return null;
  const clean = text.trim();
  
  // Arabic pattern: شارع عرض 18 متر / شارع عرض 30 / عرض 15 م
  const arMatch = clean.match(/(?:شارع\s*)?عرض\s*[:\s=]?\s*(\d+(?:\.\d+)?)\s*(?:م|متر|م\.)?/i);
  if (arMatch && arMatch[1]) {
    const w = parseFloat(arMatch[1]);
    if (!isNaN(w) && w > 0 && w <= 200) return w;
  }

  // English pattern: 18m width / width 30m / 30m street / 18 meter
  const enMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s*(?:width|street|road)?/i);
  if (enMatch && enMatch[1]) {
    const w = parseFloat(enMatch[1]);
    if (!isNaN(w) && w > 0 && w <= 200) return w;
  }

  return null;
};

/**
 * Offset a closed polygon outward (into street corridor) or inward by a distance in meters
 * This creates utility pipeline perimeters along the property boundaries / block frontages
 */
export const offsetPolygonPerimeter = (
  polygon: { x: number; y: number }[],
  offsetMeters: number
): { x: number; y: number }[] => {
  if (!polygon || polygon.length < 3) return polygon;

  // Ensure polygon is non-closed in array indexing
  let pts = [...polygon];
  if (
    pts.length > 3 &&
    Math.abs(pts[0].x - pts[pts.length - 1].x) < 1e-7 &&
    Math.abs(pts[0].y - pts[pts.length - 1].y) < 1e-7
  ) {
    pts.pop();
  }

  const n = pts.length;
  if (n < 3) return polygon;

  const avgLat = (pts.reduce((acc, p) => acc + p.y, 0) / n) * (Math.PI / 180);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(avgLat);

  // Convert to local metric Cartesian coordinates relative to first vertex
  const originX = pts[0].x;
  const originY = pts[0].y;
  const localPts = pts.map(p => ({
    x: (p.x - originX) * metersPerDegLng,
    y: (p.y - originY) * metersPerDegLat
  }));

  // Determine polygon winding (signed area: positive = CCW, negative = CW)
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    signedArea += localPts[i].x * localPts[next].y - localPts[next].x * localPts[i].y;
  }
  const isCCW = signedArea > 0;

  // Compute outward normal unit vectors for each edge
  // For CCW polygon, outward normal of edge (P_i -> P_{i+1}) is (dy, -dx) / len
  // For CW polygon, outward normal is (-dy, dx) / len
  const edgeNormals: { nx: number; ny: number; length: number }[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = localPts[next].x - localPts[i].x;
    const dy = localPts[next].y - localPts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = isCCW ? dy / len : -dy / len;
    let ny = isCCW ? -dx / len : dx / len;
    edgeNormals.push({ nx, ny, length: len });
  }

  // Shift each vertex along the bisector of adjacent edge normals
  const shiftedLocalPts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prevEdge = (i - 1 + n) % n;
    const currEdge = i;

    const n1 = edgeNormals[prevEdge];
    const n2 = edgeNormals[currEdge];

    // Bisector normal vector
    let bx = n1.nx + n2.nx;
    let by = n1.ny + n2.ny;
    const blen = Math.hypot(bx, by);

    if (blen < 1e-4) {
      // Parallel opposite edges fallback
      bx = n2.nx;
      by = n2.ny;
    } else {
      bx /= blen;
      by /= blen;
    }

    // Scale factor based on miter angle: 1 / cos(theta / 2) = 1 / dot(n2, b)
    const cosHalfTheta = n2.nx * bx + n2.ny * by;
    const miterScale = cosHalfTheta > 0.1 ? Math.min(1 / cosHalfTheta, 2.5) : 1; // clamp to prevent extreme spikes

    const shiftX = bx * offsetMeters * miterScale;
    const shiftY = by * offsetMeters * miterScale;

    shiftedLocalPts.push({
      x: localPts[i].x + shiftX,
      y: localPts[i].y + shiftY
    });
  }

  // Convert back to WGS84
  const resultWgs84 = shiftedLocalPts.map(p => ({
    x: originX + p.x / metersPerDegLng,
    y: originY + p.y / metersPerDegLat
  }));

  // Re-close polygon loop
  resultWgs84.push({ ...resultWgs84[0] });

  return resultWgs84;
};

/**
 * 1. Analyze and dissect CAD DXF file into Parcels, Streets, Texts, and Utilities
 */
export const analyzeSubdivisionDxf = async (
  file: File,
  sourceCrs: string = 'EPSG:32638'
): Promise<SubdivisionAnalysisResult> => {
  const text = await file.text();
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    throw new Error('ملف الـ DXF فارغ أو لا يحتوي على عناصر هندسية.');
  }

  const utmDef = COMMON_UTM_CRS[sourceCrs]?.proj4 || COMMON_UTM_CRS['EPSG:32638']?.proj4 || '+proj=utm +zone=38 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
  const wgs84 = 'EPSG:4326';

  const isValidCoord = (num: any): num is number => {
    return typeof num === 'number' && Number.isFinite(num) && !Number.isNaN(num);
  };

  const transformPoint = (x: any, y: any): { x: number; y: number } | null => {
    const numX = typeof x === 'number' ? x : parseFloat(x);
    const numY = typeof y === 'number' ? y : parseFloat(y);

    if (!isValidCoord(numX) || !isValidCoord(numY)) {
      return null;
    }

    if (sourceCrs === 'EPSG:4326') {
      return { x: numX, y: numY };
    }

    try {
      const [lng, lat] = proj4(utmDef, wgs84, [numX, numY]);
      if (isValidCoord(lng) && isValidCoord(lat)) {
        return { x: lng, y: lat };
      }
    } catch {
      // Fallback: If projection fails (e.g. out of range UTM), return null safely without crashing
    }
    return null;
  };

  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;

  const updateBounds = (pt: { x: number; y: number } | null | undefined) => {
    if (!pt || !isValidCoord(pt.x) || !isValidCoord(pt.y)) return;
    if (pt.y < minLat) minLat = pt.y;
    if (pt.y > maxLat) maxLat = pt.y;
    if (pt.x < minLng) minLng = pt.x;
    if (pt.x > maxLng) maxLng = pt.x;
  };

  // 1. Gather Layer Statistics
  const layerStats = new Map<string, number>();
  for (const entity of dxf.entities) {
    const layer = entity.layer || '0';
    layerStats.set(layer, (layerStats.get(layer) || 0) + 1);
  }

  // 2. Classify Layers
  const layerClassifications: LayerCategorization[] = Array.from(layerStats.entries()).map(([name, count]) => {
    let category: 'parcels' | 'streets' | 'texts' | 'utilities' | 'other' = 'other';
    let confidence = 0.5;
    let reason = 'طبقة عامة';

    if (PARCEL_LAYER_REGEX.test(name)) {
      category = 'parcels';
      confidence = 0.9;
      reason = 'اسم الطبقة يشير إلى قطع أراضٍ / بلوكات سكنية / عقارات';
    } else if (STREET_LAYER_REGEX.test(name)) {
      category = 'streets';
      confidence = 0.9;
      reason = 'اسم الطبقة يشير إلى شوارع / محاور طرق / خطوط تنظيم';
    } else if (TEXT_LAYER_REGEX.test(name)) {
      category = 'texts';
      confidence = 0.85;
      reason = 'طبقة نصوص وأبعاد';
    } else if (UTILITY_LAYER_REGEX.test(name)) {
      category = 'utilities';
      confidence = 0.9;
      reason = 'طبقة شبكات وبنية تحتية';
    }

    return { name, count, category, confidence, reason };
  });

  const parcels: ExtractedCadEntity[] = [];
  const streets: ExtractedCadEntity[] = [];
  const streetWidths: DetectedStreetWidthAnnotation[] = [];
  const otherEntities: ExtractedCadEntity[] = [];

  let entityCounter = 1;

  // 3. Process Entities
  for (let i = 0; i < dxf.entities.length; i++) {
    const entity = dxf.entities[i];
    const layer = entity.layer || '0';
    const layerCat = layerClassifications.find(l => l.name === layer)?.category || 'other';

    // A. TEXT / MTEXT Processing (Street Widths & Parcel Names)
    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const rawText = entity.text || entity.string || '';
      const textPosRaw = entity.startPoint || entity.position || entity.insertionPoint || entity.point || entity.origin || { x: 0, y: 0 };
      const geoPos = transformPoint(textPosRaw.x, textPosRaw.y);
      if (geoPos) {
        updateBounds(geoPos);

        const parsedWidth = extractStreetWidthFromText(rawText);
        if (parsedWidth) {
          streetWidths.push({
            text: rawText,
            widthMeters: parsedWidth,
            position: geoPos,
            layer
          });
        }

        otherEntities.push({
          id: entity.handle || `TXT_${entityCounter++}`,
          type: 'Text',
          layer,
          vertices: [geoPos],
          text: rawText,
          textPosition: geoPos
        });
      }
      continue;
    }

    // B. Geometry Entities (LWPOLYLINE, POLYLINE, LINE, ARC, CIRCLE, SPLINE, 3DFACE, SOLID)
    let rawPts: { x: number; y: number }[] = [];
    let isClosed = false;

    if (entity.type === 'LINE') {
      if (entity.vertices && Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
        rawPts = entity.vertices.map((v: any) => ({ x: v?.x, y: v?.y }));
      } else if (entity.start && entity.end) {
        rawPts = [{ x: entity.start.x, y: entity.start.y }, { x: entity.end.x, y: entity.end.y }];
      } else if (entity.startPoint && entity.endPoint) {
        rawPts = [{ x: entity.startPoint.x, y: entity.startPoint.y }, { x: entity.endPoint.x, y: entity.endPoint.y }];
      }
      isClosed = false;
    } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
      rawPts = entity.vertices.map((v: any) => ({ x: v?.x, y: v?.y }));
      isClosed = !!(entity.shape || entity.closed || (rawPts.length >= 3 && Math.hypot((rawPts[0]?.x ?? 0) - (rawPts[rawPts.length - 1]?.x ?? 0), (rawPts[0]?.y ?? 0) - (rawPts[rawPts.length - 1]?.y ?? 0)) < 0.1));
      if (isClosed && rawPts.length >= 2 && (rawPts[0].x !== rawPts[rawPts.length - 1].x || rawPts[0].y !== rawPts[rawPts.length - 1].y)) {
        rawPts.push({ ...rawPts[0] });
      }
    } else if (entity.type === 'ARC' && entity.center && isValidCoord(entity.center.x) && isValidCoord(entity.center.y) && isValidCoord(entity.radius)) {
      const { center, radius, startAngle, endAngle } = entity;
      let sAngle = isValidCoord(startAngle) ? startAngle : 0;
      let eAngle = isValidCoord(endAngle) ? endAngle : 360;
      if (eAngle <= sAngle) eAngle += 360;
      const sweep = eAngle - sAngle;
      const numSegs = Math.max(6, Math.ceil(sweep / 15));
      const step = sweep / numSegs;
      for (let s = 0; s <= numSegs; s++) {
        const theta = ((sAngle + step * s) * Math.PI) / 180;
        rawPts.push({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta)
        });
      }
    } else if (entity.type === 'CIRCLE' && entity.center && isValidCoord(entity.center.x) && isValidCoord(entity.center.y) && isValidCoord(entity.radius)) {
      const { center, radius } = entity;
      const numSegs = 24;
      for (let s = 0; s <= numSegs; s++) {
        const theta = (s * 2 * Math.PI) / numSegs;
        rawPts.push({
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta)
        });
      }
      isClosed = true;
    } else if (entity.type === 'SPLINE') {
      const splinePts = entity.controlPoints || entity.fitPoints || entity.points || entity.vertices || [];
      if (Array.isArray(splinePts) && splinePts.length >= 2) {
        rawPts = splinePts.map((v: any) => ({ x: v?.x, y: v?.y }));
      }
      isClosed = !!entity.closed;
    }

    // Filter out invalid/non-finite raw points
    const validRawPts = rawPts.filter(p => p && isValidCoord(p.x) && isValidCoord(p.y));
    if (validRawPts.length < 2) continue;

    // Transform points to WGS84 safely
    const geoVertices: { x: number; y: number }[] = [];
    for (const p of validRawPts) {
      const g = transformPoint(p.x, p.y);
      if (g) {
        updateBounds(g);
        geoVertices.push(g);
      }
    }

    if (geoVertices.length < 2) continue;

    const lenM = calculateGeoPathLength(geoVertices);
    const areaM2 = isClosed && geoVertices.length >= 3 ? calculatePolygonAreaM2(geoVertices) : undefined;

    const cadEntity: ExtractedCadEntity = {
      id: entity.handle || `ENT_${entityCounter++}`,
      type: isClosed && geoVertices.length >= 3 ? 'Polygon' : 'LineString',
      layer,
      vertices: geoVertices,
      rawVertices: rawPts,
      lengthM: lenM,
      areaM2
    };

    // Classification Decision:
    // If it's a closed polygon and layer indicates parcels OR area is typical for a parcel/block (30m² - 200,000m²):
    if (isClosed && (layerCat === 'parcels' || (areaM2 && areaM2 > 25 && layerCat !== 'streets'))) {
      parcels.push(cadEntity);
    } else if (layerCat === 'streets' || (!isClosed && layerCat !== 'parcels')) {
      streets.push(cadEntity);
    } else if (isClosed) {
      parcels.push(cadEntity);
    } else {
      streets.push(cadEntity);
    }
  }

  // Update layer category heuristics based on entity geometries
  layerClassifications.forEach(l => {
    const parcelCount = parcels.filter(p => p.layer === l.name).length;
    const streetCount = streets.filter(s => s.layer === l.name).length;
    if (l.category === 'other') {
      if (parcelCount > streetCount && parcelCount > 0) {
        l.category = 'parcels';
        l.reason = `تحتوي على ${parcelCount} مضلع عقاري مغلق`;
      } else if (streetCount > 0) {
        l.category = 'streets';
        l.reason = `تحتوي على ${streetCount} مسار خطي / طريق`;
      }
    }
  });

  return {
    filename: file.name,
    totalEntities: dxf.entities.length,
    layers: layerClassifications,
    parcels,
    streets,
    streetWidths,
    otherEntities,
    detectedParcelsCount: parcels.length,
    detectedStreetsCount: streets.length,
    detectedBlocksCount: parcels.filter(p => (p.areaM2 || 0) > 500).length,
    bounds: { minLat, maxLat, minLng, maxLng }
  };
};

/**
 * Helper to calculate Euclidean distance in local metric scale (meters)
 */
const distLocalMeters = (p1: { x: number; y: number }, p2: { x: number; y: number }, degLng: number, degLat: number): number => {
  const dx = (p1.x - p2.x) * degLng;
  const dy = (p1.y - p2.y) * degLat;
  return Math.hypot(dx, dy);
};

/**
 * 1.5. Synthesize Continuous Street Corridors in front of Properties (تمديد الشبكات على الشوارع أمام العقارات)
 * Extracts the true street road corridors in front of the properties, completely discarding
 * transverse lot dividers (قواطع الأراضي بين البيوت) and placing pipelines strictly in the street rights-of-way.
 */
/**
 * 1.5. Synthesize Continuous Street Corridors in front of Properties (تمديد الشبكات على ممرات الشوارع ومحاورها)
 * Extracts the true street road corridors in the open spaces between property blocks,
 * completely discarding transverse lot dividers and internal block spines,
 * and computing true street centerlines between facing parallel block frontages.
 */
export const extractContinuousStreetFrontages = (
  parcels: ExtractedCadEntity[],
  streets: ExtractedCadEntity[],
  offsetMeters: number = 3.5
): { x: number; y: number }[][] => {
  const allEntities = [...streets, ...parcels];
  if (allEntities.length === 0) return [];

  const avgLat = allEntities[0]?.vertices?.[0]?.y || 24.7;
  const degLat = 111320;
  const degLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

  // Helper: Angle of segment [0, PI)
  const getAngle = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    const dx = (p2.x - p1.x) * degLng;
    const dy = (p2.y - p1.y) * degLat;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI) a -= Math.PI;
    return a;
  };

  const angleDiff = (a1: number, a2: number): number => {
    let diff = Math.abs(a1 - a2);
    if (diff > Math.PI / 2) diff = Math.PI - diff;
    return diff;
  };

  interface RawSeg {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    lenM: number;
    angle: number;
  }

  const segments: RawSeg[] = [];

  allEntities.forEach(ent => {
    if (!ent.vertices || ent.vertices.length < 2) return;
    const isClosed = ent.type === 'Polygon' || (
      ent.vertices.length >= 3 &&
      Math.abs(ent.vertices[0].x - ent.vertices[ent.vertices.length - 1].x) < 1e-6 &&
      Math.abs(ent.vertices[0].y - ent.vertices[ent.vertices.length - 1].y) < 1e-6
    );

    const count = isClosed ? ent.vertices.length - 1 : ent.vertices.length - 1;
    for (let i = 0; i < count; i++) {
      const p1 = ent.vertices[i];
      const p2 = ent.vertices[i + 1];
      const lenM = distLocalMeters(p1, p2, degLng, degLat);
      if (lenM >= 1.0) {
        segments.push({ p1, p2, lenM, angle: getAngle(p1, p2) });
      }
    }
  });

  if (segments.length === 0) return [];

  // 1. Build Node Graph
  const snapTolM = 3.5;
  interface GNode { id: number; x: number; y: number; edges: number[]; }
  const nodes: GNode[] = [];

  function getNode(pt: { x: number; y: number }): GNode {
    for (const n of nodes) {
      if (distLocalMeters(n, pt, degLng, degLat) <= snapTolM) return n;
    }
    const newNode: GNode = { id: nodes.length, x: pt.x, y: pt.y, edges: [] };
    nodes.push(newNode);
    return newNode;
  }

  interface GEdge {
    id: number;
    u: number;
    v: number;
    lenM: number;
    angle: number;
    isLotDivider: boolean;
    used: boolean;
  }
  const edges: GEdge[] = [];

  segments.forEach(seg => {
    const nA = getNode(seg.p1);
    const nB = getNode(seg.p2);
    if (nA.id !== nB.id) {
      const exists = edges.find(
        e => (e.u === nA.id && e.v === nB.id) || (e.u === nB.id && e.v === nA.id)
      );
      if (!exists) {
        const edgeId = edges.length;
        const e: GEdge = {
          id: edgeId,
          u: nA.id,
          v: nB.id,
          lenM: seg.lenM,
          angle: seg.angle,
          isLotDivider: false,
          used: false
        };
        edges.push(e);
        nA.edges.push(edgeId);
        nB.edges.push(edgeId);
      }
    }
  });

  // 2. Strict Filter for Transverse Lot Dividers (قواطع الأراضي العرضية)
  edges.forEach(e => {
    const degU = nodes[e.u].edges.length;
    const degV = nodes[e.v].edges.length;

    // A lot divider is short (length < 45m) and meets other lines at roughly right angles (T-junctions)
    const checkTJunction = (nodeId: number): boolean => {
      const inc = nodes[nodeId].edges.filter(eid => eid !== e.id).map(eid => edges[eid]);
      if (inc.length >= 2) {
        const diffOther = angleDiff(inc[0].angle, inc[1].angle);
        if (diffOther < (40 * Math.PI) / 180) {
          const diffWithCurve = angleDiff(e.angle, inc[0].angle);
          if (diffWithCurve > (45 * Math.PI) / 180) {
            return true;
          }
        }
      }
      return false;
    };

    if (e.lenM <= 45.0 && (checkTJunction(e.u) || checkTJunction(e.v) || degU === 1 || degV === 1)) {
      e.isLotDivider = true;
    }
  });

  // 3. Chain Longitudinal Curves (Long Block Boundaries & Curbs)
  const candidateEdges = edges.filter(e => !e.isLotDivider);
  const longitudinalChains: { x: number; y: number }[][] = [];

  candidateEdges.forEach(startEdge => {
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
      const candidates = nodes[lastId].edges
        .map(eid => edges[eid])
        .filter(e => !e.used && !e.isLotDivider);

      let bestEdge: GEdge | null = null;
      let minDiff = Infinity;

      for (const cand of candidates) {
        const nextId = cand.u === lastId ? cand.v : cand.u;
        if (nextId === prevId || pathNodes.includes(nextId)) continue;
        const diff = angleDiff(cand.angle, currentAng);
        if (diff < (50 * Math.PI) / 180 && diff < minDiff) {
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

    // Extend backward
    extended = true;
    currentAng = startEdge.angle;
    while (extended) {
      extended = false;
      const firstId = pathNodes[0];
      const secondId = pathNodes[1];
      const candidates = nodes[firstId].edges
        .map(eid => edges[eid])
        .filter(e => !e.used && !e.isLotDivider);

      let bestEdge: GEdge | null = null;
      let minDiff = Infinity;

      for (const cand of candidates) {
        const prevId = cand.u === firstId ? cand.v : cand.u;
        if (prevId === secondId || pathNodes.includes(prevId)) continue;
        const diff = angleDiff(cand.angle, currentAng);
        if (diff < (50 * Math.PI) / 180 && diff < minDiff) {
          minDiff = diff;
          bestEdge = cand;
        }
      }

      if (bestEdge) {
        bestEdge.used = true;
        currentAng = bestEdge.angle;
        const prevId = bestEdge.u === firstId ? bestEdge.v : bestEdge.u;
        pathNodes.unshift(prevId);
        extended = true;
      }
    }

    if (pathNodes.length >= 2) {
      const pathPts = pathNodes.map(nid => ({ x: nodes[nid].x, y: nodes[nid].y }));
      const totalLen = calculateGeoPathLength(pathPts);
      // Keep only substantial street & block boundary curves (> 25m)
      if (totalLen >= 25.0) {
        longitudinalChains.push(pathPts);
      }
    }
  });

  // 4. Compute Street Centerlines between Parallel Facing Chains (Medial Axis)
  const streetCenterlines: { x: number; y: number }[][] = [];
  const pairedChains = new Set<number>();

  for (let i = 0; i < longitudinalChains.length; i++) {
    if (pairedChains.has(i)) continue;
    const c1 = longitudinalChains[i];
    const mid1 = c1[Math.floor(c1.length / 2)];

    let bestOppositeIdx = -1;
    let bestOppositeDist = Infinity;

    for (let j = i + 1; j < longitudinalChains.length; j++) {
      if (pairedChains.has(j)) continue;
      const c2 = longitudinalChains[j];
      const mid2 = c2[Math.floor(c2.length / 2)];

      const distM = distLocalMeters(mid1, mid2, degLng, degLat);
      // A standard street corridor width is between 9m and 50m (e.g. 10m, 12m, 15m, 20m, 30m)
      if (distM >= 9.0 && distM <= 50.0) {
        // Check if curves are approximately parallel
        const ang1 = getAngle(c1[0], c1[c1.length - 1]);
        const ang2 = getAngle(c2[0], c2[c2.length - 1]);
        if (angleDiff(ang1, ang2) < (35 * Math.PI) / 180) {
          if (distM < bestOppositeDist) {
            bestOppositeDist = distM;
            bestOppositeIdx = j;
          }
        }
      }
    }

    if (bestOppositeIdx !== -1) {
      // We found a facing street pair! Compute the exact Medial Axis Centerline between them!
      const c2 = longitudinalChains[bestOppositeIdx];
      pairedChains.add(i);
      pairedChains.add(bestOppositeIdx);

      // Ensure both curves have the same direction
      const dStartStart = distLocalMeters(c1[0], c2[0], degLng, degLat);
      const dStartEnd = distLocalMeters(c1[0], c2[c2.length - 1], degLng, degLat);
      const alignedC2 = dStartEnd < dStartStart ? [...c2].reverse() : c2;

      // Resample and interpolate midline
      const numSamples = Math.max(c1.length, alignedC2.length, 6);
      const centerline: { x: number; y: number }[] = [];

      for (let s = 0; s < numSamples; s++) {
        const t = s / (numSamples - 1);
        const idx1 = Math.min(Math.floor(t * (c1.length - 1)), c1.length - 1);
        const idx2 = Math.min(Math.floor(t * (alignedC2.length - 1)), alignedC2.length - 1);

        centerline.push({
          x: (c1[idx1].x + alignedC2[idx2].x) / 2,
          y: (c1[idx1].y + alignedC2[idx2].y) / 2
        });
      }

      if (centerline.length >= 2) {
        streetCenterlines.push(centerline);
      }
    }
  }

  // 5. For remaining unpaired longitudinal curves (e.g. boundary streets facing open land)
  for (let i = 0; i < longitudinalChains.length; i++) {
    if (pairedChains.has(i)) continue;
    const chain = longitudinalChains[i];
    if (chain.length >= 2) {
      streetCenterlines.push(chain);
    }
  }

  return streetCenterlines.length > 0 ? streetCenterlines : longitudinalChains;
};

/**
 * 2. Generate Utility Network Lines beside Real Estate Properties / Blocks
 * Supports:
 * - Option A: Connected Frontage Street Pipelines Ending at Outfalls (شبكة متصلة أمام واجهات العقارات وتنتهي بمصبات) [DEFAULT & RECOMMENDED]
 * - Option B: Street Centerline Pipelines (خطوط بمحاور الشوارع)
 * - Option C: Dual-Sided Sidewalk Pipelines (خطوط على رصيفي الشارع)
 * - Option D: Property Perimeter Closed Loops (إحاطة المضلعات بحلقات)
 */
export const generateSubdivisionUtilities = (
  analysis: SubdivisionAnalysisResult,
  options: UtilityPipelineOptions
): GeoPoint[] => {
  const resultPipes: GeoPoint[] = [];
  let pipeCounter = 1;

  const targetParcelLayers = options.selectedParcelLayers && options.selectedParcelLayers.length > 0
    ? new Set(options.selectedParcelLayers)
    : new Set(analysis.parcels.map(p => p.layer));

  const targetStreetLayers = options.selectedStreetLayers && options.selectedStreetLayers.length > 0
    ? new Set(options.selectedStreetLayers)
    : new Set(analysis.streets.map(s => s.layer));

  const activeParcels = analysis.parcels.filter(p => targetParcelLayers.has(p.layer));
  const activeStreets = analysis.streets.filter(s => targetStreetLayers.has(s.layer));

  // Helper to build a standard GeoPoint line
  const createPipeGeoPoint = (
    id: string,
    path: { x: number; y: number }[],
    netType: 'sewer' | 'water',
    layerName: string,
    color: string,
    diameter: string,
    sourceRef: string,
    notes: string
  ): GeoPoint => {
    const lenM = calculateGeoPathLength(path);
    const p: GeoPoint = {
      id,
      name: id,
      x: path[0].x,
      y: path[0].y,
      type: 'LineString',
      path,
      color,
      layer: layerName,
      attributes: {
        'معرف الخط (Pipe ID)': id,
        'نوع الشبكة': netType === 'sewer' ? 'شبكة الصرف الصحي (Gravity Sewer)' : 'شبكة مياه الشرب (Potable Water)',
        'Network Type': netType === 'sewer' ? 'Sewer Network' : 'Water Network',
        'موقع التمديد': 'أمام واجهات العقارات وفي حرم الشوارع (Street Frontage Corridor)',
        'القطر (مم)': diameter,
        'Diameter (mm)': diameter,
        'المادة': options.material || 'HDPE',
        'Material': options.material || 'HDPE',
        'رقم التصريح': options.permitNo || 'PERMIT-2026-X',
        'Permit No': options.permitNo || 'PERMIT-2026-X',
        'طول الخط (متر)': lenM.toFixed(2),
        'Length (m)': lenM.toFixed(2),
        'العقار / المرجع المصدر': sourceRef,
        'مسافة الإزاحة عن حد العقار': `${options.offsetMeters || 2.0} متر`,
        'ملاحظات': notes
      }
    };

    if (netType === 'sewer') {
      try {
        const hyd = computeGravityPipeSegment(p, {
          defaultDiameterMm: parseFloat(diameter) || 200
        });
        return enrichGeoPointWithHydraulics(p, hyd);
      } catch {
        return p;
      }
    }

    return p;
  };

  // =========================================================================
  // STRATEGY 1: CONNECTED FRONTAGE & STREET CORRIDORS ENDING AT OUTFALLS [RECOMMENDED]
  // (رسم الشبكات المتصلة أمام واجهات العقارات في الشوارع وتنتهي بمصبات)
  // =========================================================================
  if (options.placementMode === 'connected_frontage' || !options.placementMode) {
    const continuousPaths = extractContinuousStreetFrontages(activeParcels, activeStreets, options.offsetMeters || 2.0);

    if (continuousPaths.length === 0 && (activeStreets.length > 0 || activeParcels.length > 0)) {
      // Fallback to active street polylines if frontage extraction found none
      activeStreets.forEach(s => {
        if (s.vertices && s.vertices.length >= 2) continuousPaths.push(s.vertices);
      });
    }

    continuousPaths.forEach((path, idx) => {
      const segId = `FRONTAGE_SEG_${String(idx + 1).padStart(3, '0')}`;

      // A. Gravity Sewer Line (🔴 Red)
      if (options.networkType === 'sewer' || options.networkType === 'both') {
        const sewerId = `SEWER_ST_${String(pipeCounter).padStart(3, '0')}`;
        const sewerPipe = createPipeGeoPoint(
          sewerId,
          path,
          'sewer',
          'شبكة الصرف الصحي أمام العقارات',
          options.sewerColor || '#ef4444',
          options.sewerDiameter || '200',
          `حرم الشارع أمام العقارات (${segId})`,
          'خط تجميع صرف صحي انحداري متصل أمام واجهات العقارات ينتهي بالمصب'
        );
        resultPipes.push(sewerPipe);
      }

      // B. Potable Water Line (🔵 Blue) - Shifted slightly (e.g. +1.5m) to opposite frontage / side
      if (options.networkType === 'water' || options.networkType === 'both') {
        const waterId = `WATER_ST_${String(pipeCounter).padStart(3, '0')}`;
        const waterPipe = createPipeGeoPoint(
          waterId,
          path,
          'water',
          'شبكة مياه الشرب أمام العقارات',
          options.waterColor || '#3b82f6',
          options.waterDiameter || '160',
          `حرم الشارع أمام العقارات (${segId})`,
          'خط توزيع مياه شرب متصل ومغلق أمام واجهات العقارات'
        );
        resultPipes.push(waterPipe);
      }

      pipeCounter++;
    });
  }

  // =========================================================================
  // STRATEGY 2: Street Centerline & Corridor Pipelines (خطوط سناتر الشوارع)
  // =========================================================================
  else if (options.placementMode === 'street_centerline') {
    const streetPaths = extractContinuousStreetFrontages(activeParcels, activeStreets, 0.0);
    const pathsToUse = streetPaths.length > 0 ? streetPaths : activeStreets.map(s => s.vertices).filter(v => v && v.length >= 2);

    pathsToUse.forEach((path, idx) => {
      const streetId = `STREET_${String(idx + 1).padStart(3, '0')}`;

      if (options.networkType === 'sewer' || options.networkType === 'both') {
        const sewerId = `SEWER_ST_${String(pipeCounter).padStart(3, '0')}`;
        const sewerPipe = createPipeGeoPoint(
          sewerId,
          path,
          'sewer',
          'خطوط الصرف الصحي بمحاور الشوارع',
          options.sewerColor || '#ef4444',
          options.sewerDiameter || '250',
          `محور الشارع (${streetId})`,
          'خط صرف صحي رئيسي على محور الشارع متصل بالمصب'
        );
        resultPipes.push(sewerPipe);
      }

      if (options.networkType === 'water' || options.networkType === 'both') {
        const waterId = `WATER_ST_${String(pipeCounter).padStart(3, '0')}`;
        const waterPipe = createPipeGeoPoint(
          waterId,
          path,
          'water',
          'خطوط المياه الرئيسية بمحاور الشوارع',
          options.waterColor || '#3b82f6',
          options.waterDiameter || '200',
          `محور الشارع (${streetId})`,
          'خط مياه رئيسي على محور الشارع'
        );
        resultPipes.push(waterPipe);
      }

      pipeCounter++;
    });
  }

  // =========================================================================
  // STRATEGY 3: Dual-Sided Sidewalk Pipelines (على جانبي الشارع)
  // =========================================================================
  else if (options.placementMode === 'dual_sidewalk') {
    const streetPaths = extractContinuousStreetFrontages(activeParcels, activeStreets, 0.0);
    const pathsToUse = streetPaths.length > 0 ? streetPaths : activeStreets.map(s => s.vertices).filter(v => v && v.length >= 2);

    pathsToUse.forEach((streetVertices, idx) => {
      if (streetVertices.length < 2) return;

      const streetId = `STREET_${String(idx + 1).padStart(3, '0')}`;
      const offsetDist = options.offsetMeters || 3.0;

      const leftPath: { x: number; y: number }[] = [];
      const rightPath: { x: number; y: number }[] = [];

      for (let i = 0; i < streetVertices.length; i++) {
        const prev = streetVertices[Math.max(0, i - 1)];
        const next = streetVertices[Math.min(streetVertices.length - 1, i + 1)];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;

        const avgLat = (streetVertices[i].y * Math.PI) / 180;
        const degLat = 111320;
        const degLng = 111320 * Math.cos(avgLat);

        const nx = -dy / len;
        const ny = dx / len;

        const offsetLng = (nx * offsetDist) / degLng;
        const offsetLat = (ny * offsetDist) / degLat;

        leftPath.push({ x: streetVertices[i].x + offsetLng, y: streetVertices[i].y + offsetLat });
        rightPath.push({ x: streetVertices[i].x - offsetLng, y: streetVertices[i].y - offsetLat });
      }

      if (options.networkType === 'sewer' || options.networkType === 'both') {
        const sewerId = `SEWER_SIDE_L_${String(pipeCounter).padStart(3, '0')}`;
        resultPipes.push(
          createPipeGeoPoint(
            sewerId,
            leftPath,
            'sewer',
            'شبكة الصرف الصحي - الجانب الأيمن',
            options.sewerColor || '#ef4444',
            options.sewerDiameter || '200',
            `شارع (${streetId}) - الجانب الأول`,
            'خط تجميع صرف صحي بجوار رصيف العقارات'
          )
        );
      }

      if (options.networkType === 'water' || options.networkType === 'both') {
        const waterId = `WATER_SIDE_R_${String(pipeCounter).padStart(3, '0')}`;
        resultPipes.push(
          createPipeGeoPoint(
            waterId,
            rightPath,
            'water',
            'شبكة مياه الشرب - الجانب الأيسر',
            options.waterColor || '#3b82f6',
            options.waterDiameter || '160',
            `شارع (${streetId}) - الجانب المقابل`,
            'خط توزيع مياه شرب بجوار رصيف العقارات'
          )
        );
      }

      pipeCounter++;
    });
  }

  // =========================================================================
  // STRATEGY 4: Property Perimeter Loops (إحاطة المضلعات بحلقات مغلقة)
  // =========================================================================
  else if (options.placementMode === 'property_perimeter_loop') {
    activeParcels.forEach((parcel, idx) => {
      const blockId = `BLOCK_${String(idx + 1).padStart(3, '0')}`;
      const offsetPath = offsetPolygonPerimeter(parcel.vertices, options.offsetMeters || 2.0);

      if (options.networkType === 'sewer' || options.networkType === 'both') {
        const sewerId = `SEWER_${blockId}_${String(pipeCounter).padStart(3, '0')}`;
        resultPipes.push(
          createPipeGeoPoint(
            sewerId,
            offsetPath,
            'sewer',
            'شبكة الصرف الصحي محيط البلوك',
            options.sewerColor || '#ef4444',
            options.sewerDiameter || '200',
            `محيط البلوك العقاري (${parcel.id})`,
            `خط تجميع الصرف الصحي بمحاذاة محيط البلوك`
          )
        );
      }

      if (options.networkType === 'water' || options.networkType === 'both') {
        const waterOffsetDist = (options.offsetMeters || 2.0) + 1.2;
        const waterOffsetPath = offsetPolygonPerimeter(parcel.vertices, waterOffsetDist);
        const waterId = `WATER_${blockId}_${String(pipeCounter).padStart(3, '0')}`;
        resultPipes.push(
          createPipeGeoPoint(
            waterId,
            waterOffsetPath,
            'water',
            'شبكة مياه الشرب محيط البلوك',
            options.waterColor || '#3b82f6',
            options.waterDiameter || '160',
            `محيط البلوك العقاري (${parcel.id})`,
            `خط توزيع المياه بمحاذاة محيط البلوك`
          )
        );
      }

      pipeCounter++;
    });
  }

  // =========================================================================
  // 3. TOPOLOGICAL CASSCADE & OUTFALL ORIENTATION (ربط الشبكة بالمصبات وتوجيهها هيدروليكياً)
  // =========================================================================
  const sewerLines = resultPipes.filter(
    p => p.layer?.includes('صرف') || p.attributes?.['Network Type'] === 'Sewer Network'
  );
  const otherLines = resultPipes.filter(p => !sewerLines.includes(p));

  if (sewerLines.length > 0) {
    try {
      const outfallResult = orientNetworkTowardsOutfall(sewerLines, {
        targetOutfallCoord: options.customOutfallCoord,
        defaultDiameterMm: parseFloat(options.sewerDiameter) || 200,
        outfallTerminalDepth: 2.50
      });

      const finalEntities: GeoPoint[] = [...outfallResult.orientedPoints, ...otherLines];

      // Add Explicit Outfall Node Marker Points (المصبات) if requested
      if (options.generateOutfalls !== false && outfallResult.outfallNodes && outfallResult.outfallNodes.length > 0) {
        outfallResult.outfallNodes.forEach((outfall, oIdx) => {
          if (outfall.x !== 0 && outfall.y !== 0) {
            const outfallMarker: GeoPoint = {
              id: `OUTFALL_MAIN_${oIdx + 1}`,
              name: `🎯 المصب الرئيسي لشبكة الصرف (${outfall.name || `Outfall ${oIdx + 1}`})`,
              x: outfall.x,
              y: outfall.y,
              z: outfall.GL,
              type: 'Point',
              color: '#10b981',
              layer: 'مصبات شبكة الصرف الصحي (Outfalls)',
              attributes: {
                'معرف المصب': `OUTFALL_${String(oIdx + 1).padStart(2, '0')}`,
                'نوع المنشأة': 'مصب تصريف نهائي / محطة ربط رئيسية (Gravity Sewer Outfall)',
                'الموقع': 'نقطة المصب الهيدروليكي للمخطط',
                'منسوب الأرض الطبيعية (GL)': `${outfall.GL.toFixed(2)} م`,
                'منسوب قاع المصب (IL)': `${outfall.IL.toFixed(2)} م`,
                'عمق المصب الإجمالي': `${outfall.depth.toFixed(2)} م`,
                'عدد الأنابيب الموصولة بالمصب': outfall.totalConnectedPipes,
                'إجمالي أطوال الشبكة الصابة بالمصب': `${outfall.totalLengthMeters.toFixed(1)} متر`,
                'التدفق التقديري الوارد': `${outfall.totalIncomingFlowLs.toFixed(2)} لتر/ثانية`,
                'متوسط ميول الشبكة': `${(outfall.avgSlope * 100).toFixed(2)}%`,
                'حالة الربط': 'متصل هيدروليكياً وجاهز للربط بالخط الناقل / المحطة'
              }
            };
            finalEntities.push(outfallMarker);
          }
        });
      }

      // Add Manhole Inspection Chambers (مناهل الصرف الصحي) if enabled
      if (options.generateManholes) {
        const mhMap = new Map<string, { x: number; y: number; z?: number; connected: number; minIL: number; maxGL: number }>();
        const snapM = 5.0;
        const avgLat = sewerLines[0]?.path?.[0]?.y || 24.7;
        const degLat = 111320;
        const degLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

        sewerLines.forEach(line => {
          if (!line.path || line.path.length < 2) return;
          const startPt = line.path[0];
          const endPt = line.path[line.path.length - 1];

          [startPt, endPt].forEach(pt => {
            let foundKey: string | null = null;
            for (const [key, node] of mhMap.entries()) {
              if (distLocalMeters(node, pt, degLng, degLat) <= snapM) {
                foundKey = key;
                break;
              }
            }
            if (foundKey) {
              const node = mhMap.get(foundKey)!;
              node.connected += 1;
            } else {
              const key = `MH_${mhMap.size + 1}`;
              mhMap.set(key, {
                x: pt.x,
                y: pt.y,
                z: pt.z || 600,
                connected: 1,
                minIL: 597.5,
                maxGL: pt.z || 600
              });
            }
          });
        });

        let mhIdx = 1;
        mhMap.forEach((node, key) => {
          const mhPoint: GeoPoint = {
            id: `MH_${String(mhIdx).padStart(3, '0')}`,
            name: `منهل صرف صحي MH-${String(mhIdx).padStart(3, '0')}`,
            x: node.x,
            y: node.y,
            z: node.z,
            type: 'Point',
            color: '#f59e0b',
            layer: 'مناهل وغرف تفتيش الصرف الصحي (Manholes)',
            attributes: {
              'معرف المنهل (MH ID)': `MH_${String(mhIdx).padStart(3, '0')}`,
              'نوع المنهل': node.connected >= 3 ? 'منهل تقاطع / تجميع (Junction Manhole)' : 'منهل مسار خطي (Line Manhole)',
              'الموقع': 'حرم الشارع أمام واجهات العقارات',
              'منسوب الغطاء (GL)': `${(node.z || 600).toFixed(2)} م`,
              'عدد الأنابيب الموصولة': node.connected,
              'القطر القياسي': '1200 مم خرساني مسبق الصب',
              'المواصفات': 'مطابق لكود البناء السعودي والهيئة السعودية للمياه'
            }
          };
          finalEntities.push(mhPoint);
          mhIdx++;
        });
      }

      return finalEntities;
    } catch (err) {
      console.warn('Hydraulic orientation error fallback:', err);
      return resultPipes;
    }
  }

  return resultPipes;
};
