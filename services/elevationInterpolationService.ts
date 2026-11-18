import proj4 from 'proj4';
import { GeoPoint } from '../types';
import { COMMON_EPSG } from '../constants';
import { identifyPotentialCRS } from './crs';

export interface InterpolationResult {
  updatedFeature: GeoPoint;
  startGroundElev: number;
  endGroundElev: number;
  startPipeElev: number;
  endPipeElev: number;
  interpolatedPath: { x: number; y: number; z: number }[];
  methodUsed: 'attribute_linear' | 'known_points_idw' | 'topographic_linear';
  estimatedAttributes: Record<string, string>;
}

/**
 * Calculates distance in meters between two coordinates.
 * Handles both WGS84 degrees (using Haversine) and projected UTM meters (using Euclidean).
 */
export const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
  if (!p1 || !p2) return 0;
  // If coordinates are in projected meters (e.g. UTM)
  if (Math.abs(p1.x) > 180 || Math.abs(p1.y) > 90 || Math.abs(p2.x) > 180 || Math.abs(p2.y) > 90) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.hypot(dx, dy);
  }

  const R = 6371e3; // Earth radius in meters
  const lat1 = (p1.y * Math.PI) / 180;
  const lat2 = (p2.y * Math.PI) / 180;
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return R * c;
};

/**
 * Safely converts any point (projected or geographic) to WGS84 degree { lat, lon }
 */
export const toWGS84Coord = (
  p: { x: number; y: number },
  preferredCrs?: string | null
): { lat: number; lon: number } | null => {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || isNaN(p.x) || isNaN(p.y)) {
    return null;
  }

  // Already in standard WGS84 degree range (x=lon, y=lat)
  if (Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90) {
    // Check if inverted: x is latitude [10..40] and y is longitude [30..65] (Saudi/MENA region)
    if (p.x >= 10 && p.x <= 40 && p.y >= 30 && p.y <= 65) {
      return { lat: p.x, lon: p.y };
    }
    return { lat: p.y, lon: p.x };
  }

  // If inverted where x was lat (<= 90) and y was lon (> 90 && <= 180)
  if (Math.abs(p.x) <= 90 && Math.abs(p.y) <= 180) {
    return { lat: p.x, lon: p.y };
  }

  // If projected coordinates (like UTM or Ain el Abd)
  const candidateCodes = preferredCrs ? [preferredCrs] : [
    'EPSG:32638', // UTM 38N WGS84
    'EPSG:32637', // UTM 37N WGS84
    'EPSG:32639', // UTM 39N WGS84
    'EPSG:20438', // Ain el Abd 38N
    'EPSG:20437', // Ain el Abd 37N
    'EPSG:20439'  // Ain el Abd 39N
  ];

  for (const code of candidateCodes) {
    const epsg = COMMON_EPSG.find((e) => e.code === code);
    if (!epsg) continue;
    try {
      const [lon, lat] = proj4(epsg.def, '+proj=longlat +datum=WGS84 +no_defs', [p.x, p.y]);
      if (
        typeof lat === 'number' && Number.isFinite(lat) &&
        typeof lon === 'number' && Number.isFinite(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      ) {
        return { lat, lon };
      }
    } catch {
      // try next candidate
    }
  }

  return null;
};

/**
 * 1D Linear Interpolation
 * Y = Y0 + (X - X0) * (Y1 - Y0) / (X1 - X0)
 */
export const linearInterpolate = (
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number => {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
};

/**
 * 2D Inverse Distance Weighting (IDW) interpolation from surrounding known 3D points
 */
export const idwInterpolate = (
  target: { x: number; y: number },
  knownPoints: { x: number; y: number; z: number }[],
  power = 2
): number => {
  if (!knownPoints || knownPoints.length === 0) return 0;

  let num = 0;
  let den = 0;

  for (const kp of knownPoints) {
    const dist = calculateDistance(target, kp);
    if (dist < 0.01) return kp.z; // Exact match at point
    const weight = 1 / Math.pow(dist, power);
    num += kp.z * weight;
    den += weight;
  }

  return den > 0 ? num / den : 0;
};

/**
 * Collects all points in the dataset that have valid 3D Z values or ground elevation attributes
 */
export const extractKnownElevationsFromDataset = (
  allPoints: GeoPoint[]
): { x: number; y: number; z: number }[] => {
  const known: { x: number; y: number; z: number }[] = [];

  for (const pt of allPoints) {
    // Check single point Z
    if (pt.z !== undefined && pt.z !== null && !isNaN(pt.z) && pt.z !== 0) {
      known.push({ x: pt.x, y: pt.y, z: pt.z });
    }

    // Check path Z values
    if (pt.path && pt.path.length > 0) {
      for (const p of pt.path) {
        if (p.z !== undefined && p.z !== null && !isNaN(p.z) && p.z !== 0) {
          known.push({ x: p.x, y: p.y, z: p.z });
        }
      }
    }

    // Check attributes
    const attrs = pt.attributes || {};
    const sg = attrs['StartPipeGroundElevation'] || attrs['StartPipeElevation'];
    if (sg && !isNaN(parseFloat(sg))) {
      known.push({ x: pt.x, y: pt.y, z: parseFloat(sg) });
    }
  }

  return known;
};

// Regional terrain elevation fallback for Saudi Arabia / MENA
export function getRegionalFallbackElevation(lat: number, lon: number): number {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) return 150;
  // Coastal West (Jeddah / Yanbu / Jizan coastline)
  if (lon >= 37 && lon <= 40 && lat >= 16 && lat <= 26) {
    if (lon <= 39.2) return 12; // Coastal Red Sea plain
    if (lat <= 22 && lon >= 40 && lon <= 43) return 1650; // Hijaz / Asir mountain range
  }
  // Asir / Abha / Khamis Mushait highlands
  if (lat >= 17.5 && lat <= 19.5 && lon >= 41.5 && lon <= 43.5) {
    return 2150;
  }
  // Taif highlands
  if (lat >= 21.1 && lat <= 21.5 && lon >= 40.2 && lon <= 40.6) {
    return 1750;
  }
  // Coastal East (Dammam / Khobar / Jubail / Gulf coastline)
  if (lon >= 49.5 && lon <= 51 && lat >= 25.5 && lat <= 28) {
    return 8; // Arabian Gulf coastal plain
  }
  // Riyadh & Central Najd Plateau
  if (lat >= 24.0 && lat <= 25.5 && lon >= 46.0 && lon <= 47.5) {
    return 612; // Riyadh average elevation
  }
  // Qassim Plateau
  if (lat >= 25.8 && lat <= 26.8 && lon >= 43.0 && lon <= 44.8) {
    return 640;
  }
  // Tabuk Basin
  if (lat >= 28.0 && lat <= 29.0 && lon >= 36.0 && lon <= 37.5) {
    return 760;
  }
  // General Arabian Peninsula inland plateau
  if (lat >= 16 && lat <= 32 && lon >= 35 && lon <= 55) {
    return 520;
  }
  // Global default
  return 150;
}

// Memory cache to avoid duplicate network queries
const elevationCache = new Map<string, number>();

/**
 * Fetches topographic elevation data from Open-Meteo API with fallback and caching.
 * Normalizes input coordinates from UTM or WGS84, and gracefully handles network/API errors.
 */
export const fetchTopographicElevations = async (
  path: { x: number; y: number }[],
  sourceCrs?: string | null
): Promise<number[]> => {
  if (!path || path.length === 0) return [];

  try {
    // 1. Detect CRS if projected
    let detectedCrs = sourceCrs;
    if (!detectedCrs) {
      try {
        const sampleGeo: GeoPoint[] = path.slice(0, 10).map((p, idx) => ({
          id: `sample_${idx}`,
          x: p.x,
          y: p.y,
          type: 'Point'
        }));
        detectedCrs = identifyPotentialCRS(sampleGeo);
      } catch {
        detectedCrs = null;
      }
    }

    // 2. Convert all vertices to WGS84
    const wgs84Coords: ({ lat: number; lon: number } | null)[] = path.map((p) =>
      toWGS84Coord(p, detectedCrs)
    );

    // If coordinates cannot be placed on Earth, return empty array without error
    if (wgs84Coords.every((c) => c === null)) {
      return [];
    }

    // 3. Sample path up to 40 points to avoid URL length or rate limits
    const validIndices = wgs84Coords
      .map((c, i) => (c !== null ? i : -1))
      .filter((i) => i !== -1);

    if (validIndices.length === 0) return [];

    const sampleStep = Math.max(1, Math.ceil(validIndices.length / 40));
    const sampledIndices: number[] = [];
    for (let i = 0; i < validIndices.length; i += sampleStep) {
      sampledIndices.push(validIndices[i]);
    }
    const lastValidIdx = validIndices[validIndices.length - 1];
    if (sampledIndices[sampledIndices.length - 1] !== lastValidIdx) {
      sampledIndices.push(lastValidIdx);
    }

    const sampleCoords = sampledIndices.map((idx) => wgs84Coords[idx]!);

    // Check how many sample points are in cache
    const uncachedIndices: number[] = [];
    const sampleElevations: (number | null)[] = sampleCoords.map((c, i) => {
      const key = `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
      if (elevationCache.has(key)) {
        return elevationCache.get(key)!;
      }
      uncachedIndices.push(i);
      return null;
    });

    // 4. Query uncached points if any
    if (uncachedIndices.length > 0) {
      const uncachedCoords = uncachedIndices.map((i) => sampleCoords[i]);
      let fetchedElevations: number[] | null = null;

      // Tier 1: Local Backend /api/elevation (bypasses browser CORS & provides server cache)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch('/api/elevation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: uncachedCoords.map((c) => ({ lat: c.lat, lon: c.lon }))
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.elevations) && json.elevations.length === uncachedCoords.length) {
            fetchedElevations = json.elevations;
          }
        }
      } catch {
        // Backend endpoint not ready or skipped, proceed to client tier
      }

      // Tier 2: Primary direct client provider: Open-Meteo
      if (!fetchedElevations) {
        try {
          const lats = uncachedCoords.map((p) => p.lat.toFixed(5)).join(',');
          const lons = uncachedCoords.map((p) => p.lon.toFixed(5)).join(',');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const res = await fetch(
            `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.elevation) && json.elevation.length === uncachedCoords.length) {
              fetchedElevations = json.elevation;
            }
          }
        } catch {
          // Open-Meteo direct fetch failed
        }
      }

      // Tier 3: Secondary fallback provider: Open-Elevation
      if (!fetchedElevations) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const locations = uncachedCoords.map((c) => ({
            latitude: Number(c.lat.toFixed(5)),
            longitude: Number(c.lon.toFixed(5))
          }));

          const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.results) && json.results.length === locations.length) {
              fetchedElevations = json.results.map((r: any) => Number(r.elevation) || 0);
            }
          }
        } catch {
          // Open-Elevation direct fetch failed
        }
      }

      // Tier 4: Regional Geographic DEM Terrain Fallback
      if (!fetchedElevations) {
        fetchedElevations = uncachedCoords.map((c) => getRegionalFallbackElevation(c.lat, c.lon));
      }

      if (fetchedElevations) {
        fetchedElevations.forEach((elev, idx) => {
          const sampleIdx = uncachedIndices[idx];
          if (sampleIdx !== undefined) {
            sampleElevations[sampleIdx] = elev;
            const c = uncachedCoords[idx];
            elevationCache.set(`${c.lat.toFixed(5)},${c.lon.toFixed(5)}`, elev);
          }
        });
      }
    }

    // Fill any remaining nulls in sampleElevations with fallback linear interpolation
    const knownSampleIndices = sampleElevations
      .map((e, i) => (e !== null ? i : -1))
      .filter((i) => i !== -1);

    if (knownSampleIndices.length === 0) {
      return [];
    }

    const resolvedSampleElevations: number[] = sampleElevations.map((e, i) => {
      if (e !== null) return e;
      const prevIdx = [...knownSampleIndices].reverse().find((idx) => idx < i);
      const nextIdx = knownSampleIndices.find((idx) => idx > i);
      if (prevIdx !== undefined && nextIdx !== undefined) {
        return (sampleElevations[prevIdx]! + sampleElevations[nextIdx]!) / 2;
      }
      if (prevIdx !== undefined) return sampleElevations[prevIdx]!;
      if (nextIdx !== undefined) return sampleElevations[nextIdx]!;
      return 0;
    });

    // 5. Calculate cumulative distances for sample path
    const sampleDists: number[] = [0];
    let cumDist = 0;
    for (let i = 1; i < sampledIndices.length; i++) {
      cumDist += calculateDistance(path[sampledIndices[i - 1]], path[sampledIndices[i]]);
      sampleDists.push(cumDist);
    }

    // 6. Calculate cumulative distances for full path and linearly interpolate
    const fullDists: number[] = [0];
    let fullCumDist = 0;
    for (let i = 1; i < path.length; i++) {
      fullCumDist += calculateDistance(path[i - 1], path[i]);
      fullDists.push(fullCumDist);
    }

    // 7. Linearly interpolate topographic elevations for every point in full path
    const interpolatedElevations: number[] = fullDists.map((d) => {
      if (d <= sampleDists[0]) return resolvedSampleElevations[0];
      if (d >= sampleDists[sampleDists.length - 1]) {
        return resolvedSampleElevations[resolvedSampleElevations.length - 1];
      }

      for (let j = 0; j < sampleDists.length - 1; j++) {
        if (d >= sampleDists[j] && d <= sampleDists[j + 1]) {
          return linearInterpolate(
            d,
            sampleDists[j],
            resolvedSampleElevations[j],
            sampleDists[j + 1],
            resolvedSampleElevations[j + 1]
          );
        }
      }
      return resolvedSampleElevations[0];
    });

    return interpolatedElevations;
  } catch (err) {
    console.warn('Topographic elevation estimation warning:', err);
    return [];
  }
};

/**
 * Primary Service Function:
 * Estimates missing elevation points and attributes (StartPipeGroundElevation, StartPipeElevation,
 * EndPipeGroundElevation, EndPipeElevation) using linear interpolation based on surrounding
 * topographic data or existing dataset 3D points.
 */
export const estimateMissingElevations = async (
  feature: GeoPoint,
  allDatasetPoints: GeoPoint[] = [],
  defaultPipeDepth = 1.5
): Promise<InterpolationResult> => {
  const path = feature.path || [{ x: feature.x, y: feature.y, z: feature.z }];
  const attrs = { ...(feature.attributes || {}) };

  let startGround = attrs['StartPipeGroundElevation']
    ? parseFloat(attrs['StartPipeGroundElevation'])
    : undefined;
  let startPipe = attrs['StartPipeElevation']
    ? parseFloat(attrs['StartPipeElevation'])
    : undefined;
  let endGround = attrs['EndPipeGroundElevation']
    ? parseFloat(attrs['EndPipeGroundElevation'])
    : undefined;
  let endPipe = attrs['EndPipeElevation']
    ? parseFloat(attrs['EndPipeElevation'])
    : undefined;

  let methodUsed: 'attribute_linear' | 'known_points_idw' | 'topographic_linear' =
    'topographic_linear';

  // 1. Calculate cumulative distance for each vertex along path
  const dists: number[] = [0];
  let totalDist = 0;
  for (let i = 1; i < path.length; i++) {
    totalDist += calculateDistance(path[i - 1], path[i]);
    dists.push(totalDist);
  }

  // Check if geometry path has existing valid Z values
  const knownIndices: number[] = [];
  path.forEach((p, idx) => {
    if (p.z !== undefined && p.z !== null && !isNaN(p.z) && p.z !== 0) {
      knownIndices.push(idx);
    }
  });

  let elevations: number[] = new Array(path.length).fill(0);

  // Case A: Path already has some valid Z values -> 1D Linear Interpolation along path
  if (knownIndices.length > 0) {
    methodUsed = 'attribute_linear';
    if (knownIndices.length === 1) {
      // Only 1 point known, assign same Z everywhere
      elevations.fill(path[knownIndices[0]].z!);
    } else {
      // Linear interpolation between known indices
      for (let i = 0; i < path.length; i++) {
        if (knownIndices.includes(i)) {
          elevations[i] = path[i].z!;
        } else {
          // Find prev and next known index
          const prevIdx = [...knownIndices].reverse().find((idx) => idx < i);
          const nextIdx = knownIndices.find((idx) => idx > i);

          if (prevIdx !== undefined && nextIdx !== undefined) {
            elevations[i] = linearInterpolate(
              dists[i],
              dists[prevIdx],
              path[prevIdx].z!,
              dists[nextIdx],
              path[nextIdx].z!
            );
          } else if (prevIdx !== undefined) {
            elevations[i] = path[prevIdx].z!;
          } else if (nextIdx !== undefined) {
            elevations[i] = path[nextIdx].z!;
          }
        }
      }
    }
  } 
  // Case B: Start and End ground attributes exist -> 1D Linear Interpolation between start & end
  else if (
    startGround !== undefined &&
    endGround !== undefined &&
    !isNaN(startGround) &&
    !isNaN(endGround)
  ) {
    methodUsed = 'attribute_linear';
    elevations = dists.map((d) =>
      linearInterpolate(d, 0, startGround!, totalDist, endGround!)
    );
  } 
  // Case C: Check surrounding dataset points for 2D Spatial IDW / Linear Interpolation
  else {
    const knownDatasetElevations = extractKnownElevationsFromDataset(allDatasetPoints);

    if (knownDatasetElevations.length >= 3) {
      methodUsed = 'known_points_idw';
      elevations = path.map((p) => idwInterpolate(p, knownDatasetElevations));
    } else {
      // Case D: Fetch topographic DEM elevations for area, then apply linear interpolation
      methodUsed = 'topographic_linear';
      const topoElevations = await fetchTopographicElevations(path);
      if (topoElevations && topoElevations.length === path.length) {
        elevations = topoElevations;
      } else if (knownDatasetElevations.length > 0) {
        // Fallback: Interpolate from any known points in the dataset
        methodUsed = 'known_points_idw';
        elevations = path.map((p) => idwInterpolate(p, knownDatasetElevations));
      } else if (startGround !== undefined && !isNaN(startGround) && endGround !== undefined && !isNaN(endGround)) {
        // Fallback: Linear interpolation between start and end attributes
        methodUsed = 'attribute_linear';
        elevations = dists.map((d) => linearInterpolate(d, 0, startGround!, totalDist, endGround!));
      } else {
        // Fallback: Base elevation from single defined ground attribute or zero
        const baseZ = (startGround !== undefined && !isNaN(startGround))
          ? startGround
          : (endGround !== undefined && !isNaN(endGround))
          ? endGround
          : 0;
        elevations = new Array(path.length).fill(baseZ);
      }
    }
  }

  // Derive start & end ground elevations
  if (startGround === undefined || isNaN(startGround)) {
    startGround = elevations[0] || 0;
  }
  if (endGround === undefined || isNaN(endGround)) {
    endGround = elevations[elevations.length - 1] || 0;
  }

  // Derive pipe elevations (ground - pipe depth if missing)
  if (startPipe === undefined || isNaN(startPipe)) {
    startPipe = startGround - defaultPipeDepth;
  }
  if (endPipe === undefined || isNaN(endPipe)) {
    endPipe = endGround - defaultPipeDepth;
  }

  // Update attributes object
  const estimatedAttributes: Record<string, string> = {
    StartPipeGroundElevation: startGround.toFixed(2),
    StartPipeElevation: startPipe.toFixed(2),
    EndPipeGroundElevation: endGround.toFixed(2),
    EndPipeElevation: endPipe.toFixed(2),
    ElevationInterpolationMethod:
      methodUsed === 'attribute_linear'
        ? 'استيفاء خطي (Linear Interpolation)'
        : methodUsed === 'known_points_idw'
        ? 'استيفاء مكاني (Spatial IDW Interpolation)'
        : 'استيفاء طبوغرافي (Topographic DEM Interpolation)',
    ElevationStatus: 'تم تقدير الارتفاعات بنجاح (Interpolated)'
  };

  // Merge into existing attributes
  Object.assign(attrs, estimatedAttributes);

  // Update path vertices with 3D Z coordinate
  const interpolatedPath = path.map((p, i) => ({
    ...p,
    z: Number(elevations[i].toFixed(2))
  }));

  const updatedFeature: GeoPoint = {
    ...feature,
    z: Number(elevations[0].toFixed(2)),
    path: interpolatedPath,
    attributes: attrs
  };

  return {
    updatedFeature,
    startGroundElev: Number(startGround.toFixed(2)),
    endGroundElev: Number(endGround.toFixed(2)),
    startPipeElev: Number(startPipe.toFixed(2)),
    endPipeElev: Number(endPipe.toFixed(2)),
    interpolatedPath,
    methodUsed,
    estimatedAttributes
  };
};

/**
 * Batch Service Function:
 * Processes an entire array of GeoPoints and estimates missing elevations & attributes for all line strings & polygons.
 */
export const interpolateDatasetMissingElevations = async (
  points: GeoPoint[]
): Promise<{ updatedPoints: GeoPoint[]; processedCount: number }> => {
  const updatedPoints: GeoPoint[] = [];
  let processedCount = 0;

  for (const pt of points) {
    if (pt.type === 'LineString' || pt.type === 'Polygon') {
      const result = await estimateMissingElevations(pt, points);
      updatedPoints.push(result.updatedFeature);
      processedCount++;
    } else {
      updatedPoints.push(pt);
    }
  }

  return { updatedPoints, processedCount };
};

/**
 * Finds all adjacent/connected line features in the dataset that touch any endpoint
 * of the currently selected seed features within a distance threshold (default 30m).
 */
export const findAdjacentConnectedFeatures = (
  seedFeatures: GeoPoint[],
  allPoints: GeoPoint[],
  thresholdMeters = 30
): GeoPoint[] => {
  if (!seedFeatures || seedFeatures.length === 0) return [];

  const selectedIds = new Set(seedFeatures.map((f) => f.id));
  const candidateFeatures = allPoints.filter(
    (pt) =>
      ['LineString', 'Polygon'].includes(pt.type || '') &&
      pt.path &&
      pt.path.length >= 2 &&
      !selectedIds.has(pt.id)
  );

  const activeSeeds = [...seedFeatures];
  const addedFeatures: GeoPoint[] = [];

  let newlyAdded = true;
  while (newlyAdded) {
    newlyAdded = false;

    // Collect all endpoints of active seeds
    const seedEndpoints: { x: number; y: number }[] = [];
    for (const seed of activeSeeds) {
      if (seed.path && seed.path.length >= 2) {
        seedEndpoints.push(seed.path[0]);
        seedEndpoints.push(seed.path[seed.path.length - 1]);
      }
    }

    for (let i = candidateFeatures.length - 1; i >= 0; i--) {
      const cand = candidateFeatures[i];
      const candStart = cand.path![0];
      const candEnd = cand.path![cand.path!.length - 1];

      // Check if candidate start or end is within threshold of any seed endpoint
      const isConnected = seedEndpoints.some(
        (ep) =>
          calculateDistance(ep, candStart) <= thresholdMeters ||
          calculateDistance(ep, candEnd) <= thresholdMeters
      );

      if (isConnected) {
        addedFeatures.push(cand);
        activeSeeds.push(cand);
        selectedIds.add(cand.id);
        candidateFeatures.splice(i, 1);
        newlyAdded = true;
      }
    }
  }

  return [...seedFeatures, ...addedFeatures];
};

/**
 * Stitches multiple GeoPoint line features into a single ordered, connected continuous path.
 * Intelligently reverses paths if necessary so that endpoints align sequentially.
 */
export const chainAdjacentFeatures = (features: GeoPoint[]): { x: number; y: number; z: number }[] => {
  if (!features || features.length === 0) return [];
  if (features.length === 1) {
    const f = features[0];
    const path = f.path || [{ x: f.x, y: f.y, z: f.z || 0 }];
    return path.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  }

  // Work on copies of paths
  const remaining = features.map((f) => ({
    id: f.id,
    path: (f.path || [{ x: f.x, y: f.y, z: f.z || 0 }]).map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z || 0
    }))
  }));

  let combinedPath: { x: number; y: number; z: number }[] = [...remaining[0].path];
  remaining.shift();

  while (remaining.length > 0) {
    const tailPoint = combinedPath[combinedPath.length - 1];
    const headPoint = combinedPath[0];

    let bestIdx = -1;
    let bestDist = Infinity;
    let shouldReverse = false;
    let attachToHead = false;

    for (let i = 0; i < remaining.length; i++) {
      const candPath = remaining[i].path;
      const candStart = candPath[0];
      const candEnd = candPath[candPath.length - 1];

      // Distance to tail of combinedPath
      const dTailStart = calculateDistance(tailPoint, candStart);
      const dTailEnd = calculateDistance(tailPoint, candEnd);

      // Distance to head of combinedPath
      const dHeadStart = calculateDistance(headPoint, candStart);
      const dHeadEnd = calculateDistance(headPoint, candEnd);

      if (dTailStart < bestDist) {
        bestDist = dTailStart;
        bestIdx = i;
        shouldReverse = false;
        attachToHead = false;
      }
      if (dTailEnd < bestDist) {
        bestDist = dTailEnd;
        bestIdx = i;
        shouldReverse = true;
        attachToHead = false;
      }
      if (dHeadEnd < bestDist) {
        bestDist = dHeadEnd;
        bestIdx = i;
        shouldReverse = false;
        attachToHead = true;
      }
      if (dHeadStart < bestDist) {
        bestDist = dHeadStart;
        bestIdx = i;
        shouldReverse = true;
        attachToHead = true;
      }
    }

    if (bestIdx !== -1) {
      const chosen = remaining[bestIdx];
      let p = [...chosen.path];
      if (shouldReverse) p.reverse();

      if (attachToHead) {
        // Prepend to combinedPath
        combinedPath = [...p, ...combinedPath];
      } else {
        // Append to combinedPath
        combinedPath = [...combinedPath, ...p];
      }
      remaining.splice(bestIdx, 1);
    } else {
      // Fallback break if no match
      break;
    }
  }

  // Remove duplicate adjacent vertices (closer than 0.1m)
  const cleaned: { x: number; y: number; z: number }[] = [combinedPath[0]];
  for (let i = 1; i < combinedPath.length; i++) {
    if (calculateDistance(cleaned[cleaned.length - 1], combinedPath[i]) > 0.05) {
      cleaned.push(combinedPath[i]);
    }
  }

  return cleaned;
};

