import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import { GeoPoint } from '../types';
import { orientNetworkTowardsOutfall } from './gravitySewerEngine';

export const COMMON_UTM_CRS: Record<string, { label: string; proj4: string }> = {
  'EPSG:32638': {
    label: 'UTM Zone 38N (WGS84) - الرياض، مكة، المدينة، القصيم، حائل',
    proj4: '+proj=utm +zone=38 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
  },
  'EPSG:32639': {
    label: 'UTM Zone 39N (WGS84) - المنطقة الشرقية، الدمام، الخبر، الأحساء، الجبيل',
    proj4: '+proj=utm +zone=39 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
  },
  'EPSG:32637': {
    label: 'UTM Zone 37N (WGS84) - تبوك، جيزان، الساحل الغربي، عسير',
    proj4: '+proj=utm +zone=37 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
  },
  'EPSG:4326': {
    label: 'WGS84 (Lat / Long) - الدرجات العشرية الجغرافية',
    proj4: '+proj=longlat +datum=WGS84 +no_defs'
  },
  'AIN_EL_ABD_38': {
    label: 'Ain el Abd 1970 / UTM Zone 38N (مسار أرامكو القديم)',
    proj4: '+proj=utm +zone=38 +ellps=intl +towgs84=-143,-236,-7,0,0,0,0 +units=m +no_defs'
  },
  'AIN_EL_ABD_39': {
    label: 'Ain el Abd 1970 / UTM Zone 39N (أرامكو المنطقة الشرقية)',
    proj4: '+proj=utm +zone=39 +ellps=intl +towgs84=-143,-236,-7,0,0,0,0 +units=m +no_defs'
  }
};

export interface ExtractedCadLine {
  id: string;
  layer: string;
  entityType: string;
  vertices: { x: number; y: number }[]; // Longitude, Latitude (WGS84)
  lengthMeters: number;
}

export interface CadExtractionSummary {
  filename: string;
  totalEntities: number;
  availableLayers: { name: string; lineCount: number; isLikelyStreet: boolean }[];
  detectedStreetLayers: string[];
  extractedLines: ExtractedCadLine[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

// Regex to identify street / road centerline / network axis layers
export const STREET_LAYER_REGEX = /(?:road|street|cntr|center|centre|axis|corridor|cl|c-road|c-line|c_road|c_line|path|network|pipeline|water|sewer|محور|سنتر|شارع|طريق|طرق|شوارع|مسار|شبكة|أنابيب|خطوط)/i;

// Haversine formula to compute geodesic distance in meters
export const calculatePathLengthMeters = (pts: { x: number; y: number }[]): number => {
  if (pts.length < 2) return 0;
  let dist = 0;
  const R = 6371000; // Earth radius in meters
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
 * 1. Extract street centerlines and lines from CAD DXF
 */
export const extractStreetNetworkFromDxf = async (
  file: File,
  sourceCrs: string = 'EPSG:32638',
  selectedLayers?: string[]
): Promise<CadExtractionSummary> => {
  const text = await file.text();
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    throw new Error('ملف الـ DXF لا يحتوي على عناصر هندسية قابلة للقراءة.');
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
      // Ignore proj4 calculation error for single point
    }
    return null;
  };

  const layerStats = new Map<string, number>();
  const extractedLines: ExtractedCadLine[] = [];

  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;

  // Pass 1: gather layers
  for (const entity of dxf.entities) {
    const layer = entity.layer || '0';
    layerStats.set(layer, (layerStats.get(layer) || 0) + 1);
  }

  const detectedStreetLayers: string[] = [];
  const availableLayers = Array.from(layerStats.entries()).map(([name, count]) => {
    const isLikelyStreet = STREET_LAYER_REGEX.test(name);
    if (isLikelyStreet) {
      detectedStreetLayers.push(name);
    }
    return { name, lineCount: count, isLikelyStreet };
  });

  // If user passed specific layers, use them; otherwise auto-use detected street layers or all
  const targetLayers =
    selectedLayers && selectedLayers.length > 0
      ? new Set(selectedLayers)
      : detectedStreetLayers.length > 0
      ? new Set(detectedStreetLayers)
      : new Set(layerStats.keys());

  let lineCounter = 1;

  for (let i = 0; i < dxf.entities.length; i++) {
    const entity = dxf.entities[i];
    const layer = entity.layer || '0';

    if (!targetLayers.has(layer)) continue;

    let rawPts: { x: number; y: number }[] = [];

    // Filter ONLY LINE and LWPOLYLINE / POLYLINE / ARC / CIRCLE / SPLINE, ignoring texts, dimensions, blocks
    if (entity.type === 'LINE') {
      if (entity.vertices && Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
        rawPts = entity.vertices.map((v: any) => ({ x: v?.x, y: v?.y }));
      } else if (entity.start && entity.end) {
        rawPts = [{ x: entity.start.x, y: entity.start.y }, { x: entity.end.x, y: entity.end.y }];
      } else if (entity.startPoint && entity.endPoint) {
        rawPts = [{ x: entity.startPoint.x, y: entity.startPoint.y }, { x: entity.endPoint.x, y: entity.endPoint.y }];
      }
    } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && Array.isArray(entity.vertices) && entity.vertices.length >= 2) {
      rawPts = entity.vertices.map((v: any) => ({ x: v?.x, y: v?.y }));
      if (entity.shape || entity.closed) {
        if (rawPts.length >= 2) rawPts.push({ ...rawPts[0] });
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
    } else if (entity.type === 'SPLINE') {
      const splinePts = entity.controlPoints || entity.fitPoints || entity.points || entity.vertices || [];
      if (Array.isArray(splinePts) && splinePts.length >= 2) {
        rawPts = splinePts.map((v: any) => ({ x: v?.x, y: v?.y }));
      }
    }

    const validRawPts = rawPts.filter(p => p && isValidCoord(p.x) && isValidCoord(p.y));
    if (validRawPts.length >= 2) {
      const geoVertices: { x: number; y: number }[] = [];
      for (const pt of validRawPts) {
        const transformed = transformPoint(pt.x, pt.y);
        if (transformed) {
          if (transformed.y < minLat) minLat = transformed.y;
          if (transformed.y > maxLat) maxLat = transformed.y;
          if (transformed.x < minLng) minLng = transformed.x;
          if (transformed.x > maxLng) maxLng = transformed.x;
          geoVertices.push(transformed);
        }
      }

      if (geoVertices.length >= 2) {
        const lengthM = calculatePathLengthMeters(geoVertices);

        extractedLines.push({
          id: entity.handle || `STREET_${lineCounter++}`,
          layer,
          entityType: entity.type,
          vertices: geoVertices,
          lengthMeters: lengthM
        });
      }
    }
  }

  return {
    filename: file.name,
    totalEntities: dxf.entities.length,
    availableLayers,
    detectedStreetLayers,
    extractedLines,
    bounds: { minLat, maxLat, minLng, maxLng }
  };
};

/**
 * 2. Extract street network from Shapefile (.zip) or GeoJSON
 */
export const extractStreetNetworkFromShpOrGeoJson = async (
  file: File,
  sourceCrs: string = 'EPSG:4326',
  selectedLayers?: string[]
): Promise<CadExtractionSummary> => {
  const buffer = await file.arrayBuffer();
  let geojson: any;

  if (file.name.toLowerCase().endsWith('.zip')) {
    const shpModule = await import('shpjs');
    const shpParser = (shpModule.default || shpModule) as any;
    geojson = await shpParser(buffer);
  } else {
    const text = new TextDecoder().decode(buffer);
    geojson = JSON.parse(text);
  }

  const features = Array.isArray(geojson)
    ? geojson.flatMap((g: any) => g.features || [])
    : geojson.features || [];

  const utmDef = COMMON_UTM_CRS[sourceCrs]?.proj4 || COMMON_UTM_CRS['EPSG:32638']?.proj4 || '+proj=utm +zone=38 +ellps=WGS84 +datum=WGS84 +units=m +no_defs';
  const wgs84 = 'EPSG:4326';

  const transformPoint = (x: any, y: any): { x: number; y: number } | null => {
    const numX = typeof x === 'number' ? x : parseFloat(x);
    const numY = typeof y === 'number' ? y : parseFloat(y);

    if (!isValidCoord(numX) || !isValidCoord(numY)) {
      return null;
    }

    if (sourceCrs === 'EPSG:4326') return { x: numX, y: numY };

    try {
      const [lng, lat] = proj4(utmDef, wgs84, [numX, numY]);
      if (isValidCoord(lng) && isValidCoord(lat)) {
        return { x: lng, y: lat };
      }
    } catch {
      // safe fallback
    }
    return null;
  };

  const layerStats = new Map<string, number>();
  const extractedLines: ExtractedCadLine[] = [];

  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;

  for (const feat of features) {
    const layer = feat.properties?.layer || feat.properties?.Layer || feat.properties?.LAYER || 'Streets';
    layerStats.set(layer, (layerStats.get(layer) || 0) + 1);
  }

  const detectedStreetLayers: string[] = [];
  const availableLayers = Array.from(layerStats.entries()).map(([name, count]) => {
    const isLikelyStreet = STREET_LAYER_REGEX.test(name);
    if (isLikelyStreet) detectedStreetLayers.push(name);
    return { name, lineCount: count, isLikelyStreet };
  });

  const targetLayers =
    selectedLayers && selectedLayers.length > 0
      ? new Set(selectedLayers)
      : detectedStreetLayers.length > 0
      ? new Set(detectedStreetLayers)
      : new Set(layerStats.keys());

  let lineCounter = 1;

  for (const feat of features) {
    const layer = feat.properties?.layer || feat.properties?.Layer || feat.properties?.LAYER || 'Streets';
    if (!targetLayers.has(layer)) continue;

    const geom = feat.geometry;
    if (!geom) continue;

    const processCoords = (coords: number[][]) => {
      if (!Array.isArray(coords) || coords.length < 2) return;
      const geoVertices: { x: number; y: number }[] = [];
      for (const c of coords) {
        if (Array.isArray(c) && c.length >= 2) {
          const transformed = transformPoint(c[0], c[1]);
          if (transformed) {
            if (transformed.y < minLat) minLat = transformed.y;
            if (transformed.y > maxLat) maxLat = transformed.y;
            if (transformed.x < minLng) minLng = transformed.x;
            if (transformed.x > maxLng) maxLng = transformed.x;
            geoVertices.push(transformed);
          }
        }
      }

      if (geoVertices.length < 2) return;

      const lengthM = calculatePathLengthMeters(geoVertices);
      extractedLines.push({
        id: feat.properties?.id || feat.properties?.ID || `LINE_${lineCounter++}`,
        layer,
        entityType: geom.type,
        vertices: geoVertices,
        lengthMeters: lengthM
      });
    };

    if (geom.type === 'LineString') {
      processCoords(geom.coordinates);
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach((lineCoords: number[][]) => processCoords(lineCoords));
    }
  }

  return {
    filename: file.name,
    totalEntities: features.length,
    availableLayers,
    detectedStreetLayers,
    extractedLines,
    bounds: { minLat, maxLat, minLng, maxLng }
  };
};

/**
 * 3. Batch generate network pipe GeoPoints from extracted street axes
 */
export interface NetworkPipeCustomConfig {
  networkType: string;
  pipeHierarchy: string; // 'main' | 'sub' | 'service'
  diameter: string;
  material: string;
  permitNo: string;
  segmentPrefix: string;
  linePrefix: string;
  layerName: string;
  color: string;
}

export const generateNetworkPipesFromStreets = (
  extractedLines: ExtractedCadLine[],
  config: NetworkPipeCustomConfig,
  targetOutfallCoord?: { x: number; y: number; z?: number }
): GeoPoint[] => {
  if (extractedLines.length === 0) return [];

  const avgLat = extractedLines[0]?.vertices?.[0]?.y || 24.7;
  const degLat = 111320;
  const degLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

  // Helper distance in meters
  const distM = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    return Math.hypot((p1.x - p2.x) * degLng, (p1.y - p2.y) * degLat);
  };

  // Build topological graph to detect and discard transverse lot dividers
  interface NNode {
    id: number;
    x: number;
    y: number;
    edgeIndices: number[];
  }

  const nodes: NNode[] = [];
  const getNode = (pt: { x: number; y: number }): NNode => {
    for (const n of nodes) {
      if (distM(n, pt) <= 4.0) return n;
    }
    const newNode: NNode = { id: nodes.length, x: pt.x, y: pt.y, edgeIndices: [] };
    nodes.push(newNode);
    return newNode;
  };

  interface NEdge {
    id: number;
    line: ExtractedCadLine;
    u: number;
    v: number;
    lenM: number;
    angle: number;
    isDivider: boolean;
  }

  const getAng = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    let a = Math.atan2((p2.y - p1.y) * degLat, (p2.x - p1.x) * degLng);
    if (a < 0) a += Math.PI;
    return a;
  };

  const edges: NEdge[] = [];
  extractedLines.forEach(line => {
    if (!line.vertices || line.vertices.length < 2) return;
    const nA = getNode(line.vertices[0]);
    const nB = getNode(line.vertices[line.vertices.length - 1]);
    const eId = edges.length;
    const ang = getAng(line.vertices[0], line.vertices[line.vertices.length - 1]);
    const e: NEdge = {
      id: eId,
      line,
      u: nA.id,
      v: nB.id,
      lenM: line.lengthMeters,
      angle: ang,
      isDivider: false
    };
    edges.push(e);
    nA.edgeIndices.push(eId);
    nB.edgeIndices.push(eId);
  });

  // Identify transverse lot dividers (short dead-end segments < 45m or perpendicular T-junctions)
  const isSubdivisionWithLots = edges.some(e => e.lenM < 45.0 && (nodes[e.u].edgeIndices.length === 1 || nodes[e.v].edgeIndices.length === 1));

  if (isSubdivisionWithLots && edges.length > 5) {
    edges.forEach(e => {
      if (e.lenM > 50.0) return;
      const degU = nodes[e.u].edgeIndices.length;
      const degV = nodes[e.v].edgeIndices.length;
      if ((degU === 1 || degV === 1) && e.lenM < 45.0) {
        e.isDivider = true;
      }
    });
  }

  const validLines = edges.filter(e => !e.isDivider).map(e => e.line);
  const linesToUse = validLines.length > 0 ? validLines : extractedLines;

  const rawPipes = linesToUse.map((line, index) => {
    const numStr = String(index + 1).padStart(3, '0');
    const lineId = `${config.linePrefix}_${numStr}`;
    const segmentId = `${config.segmentPrefix}-${numStr}`;

    const geoPoint: GeoPoint = {
      id: lineId,
      name: lineId,
      x: line.vertices[0].x,
      y: line.vertices[0].y,
      type: 'LineString',
      path: line.vertices,
      color: config.color,
      layer: config.layerName,
      attributes: {
        'اسم الخط': lineId,
        'Line ID': lineId,
        'نوع الشبكة': config.networkType,
        'Network Type': config.networkType,
        'تصنيف الماسورة': config.pipeHierarchy === 'main' ? 'خط رئيسي (Main Pipe)' : 'خط فرعي (Branch Pipe)',
        'Pipe Category': config.pipeHierarchy,
        'القطر (مم)': config.diameter,
        'Diameter (mm)': config.diameter,
        'المادة': config.material,
        'Material': config.material,
        'رقم التصريح': config.permitNo,
        'Permit No': config.permitNo,
        'معرف الشريحة': segmentId,
        'Segment ID': segmentId,
        'طول المقطع (متر)': line.lengthMeters.toFixed(2),
        'Length (m)': line.lengthMeters.toFixed(2),
        'طبقة الـ CAD المصدر': line.layer,
        'CAD Source Layer': line.layer
      }
    };

    return geoPoint;
  });

  // Automatically Orient Network Flow & Cascade Gravity Hydraulics Towards Outfall
  try {
    const diameterNum = parseFloat(config.diameter) || 200;
    const cascade = orientNetworkTowardsOutfall(rawPipes, {
      targetOutfallCoord,
      defaultDiameterMm: diameterNum
    });
    return cascade.orientedPoints;
  } catch (err) {
    console.warn('Auto network outfall orientation notice:', err);
    return rawPipes;
  }
};
