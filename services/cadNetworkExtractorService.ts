import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import shp from 'shpjs';
import { GeoPoint } from '../types';

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

  const utmDef = COMMON_UTM_CRS[sourceCrs]?.proj4 || COMMON_UTM_CRS['EPSG:32638'].proj4;
  const wgs84 = 'EPSG:4326';

  const transformPoint = (x: number, y: number): { x: number; y: number } => {
    if (sourceCrs === 'EPSG:4326') {
      return { x, y };
    }
    const [lng, lat] = proj4(utmDef, wgs84, [x, y]);
    return { x: lng, y: lat };
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

    // Filter ONLY LINE and LWPOLYLINE / POLYLINE / ARC, ignoring texts, dimensions, blocks
    if (entity.type === 'LINE' && entity.vertices && entity.vertices.length >= 2) {
      rawPts = entity.vertices.map((v: any) => ({ x: v.x, y: v.y }));
    } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices?.length >= 2) {
      rawPts = entity.vertices.map((v: any) => ({ x: v.x, y: v.y }));
      if (entity.shape || entity.closed) {
        rawPts.push({ ...rawPts[0] });
      }
    } else if (entity.type === 'ARC' && entity.center) {
      const { center, radius, startAngle, endAngle } = entity;
      let sAngle = startAngle;
      let eAngle = endAngle;
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
    }

    if (rawPts.length >= 2) {
      const geoVertices = rawPts.map(pt => {
        const transformed = transformPoint(pt.x, pt.y);
        if (transformed.y < minLat) minLat = transformed.y;
        if (transformed.y > maxLat) maxLat = transformed.y;
        if (transformed.x < minLng) minLng = transformed.x;
        if (transformed.x > maxLng) maxLng = transformed.x;
        return transformed;
      });

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
    geojson = await shp(buffer);
  } else {
    const text = new TextDecoder().decode(buffer);
    geojson = JSON.parse(text);
  }

  const features = Array.isArray(geojson)
    ? geojson.flatMap((g: any) => g.features || [])
    : geojson.features || [];

  const utmDef = COMMON_UTM_CRS[sourceCrs]?.proj4 || COMMON_UTM_CRS['EPSG:32638'].proj4;
  const wgs84 = 'EPSG:4326';

  const transformPoint = (x: number, y: number): { x: number; y: number } => {
    if (sourceCrs === 'EPSG:4326') return { x, y };
    const [lng, lat] = proj4(utmDef, wgs84, [x, y]);
    return { x: lng, y: lat };
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
      if (coords.length < 2) return;
      const geoVertices = coords.map(c => {
        const transformed = transformPoint(c[0], c[1]);
        if (transformed.y < minLat) minLat = transformed.y;
        if (transformed.y > maxLat) maxLat = transformed.y;
        if (transformed.x < minLng) minLng = transformed.x;
        if (transformed.x > maxLng) maxLng = transformed.x;
        return transformed;
      });

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
  config: NetworkPipeCustomConfig
): GeoPoint[] => {
  return extractedLines.map((line, index) => {
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
};
