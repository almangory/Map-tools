import { GeoPoint } from '../types';

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
 * Calculates Haversine distance in meters between two coordinates (lon, lat)
 */
export const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
  const R = 6371e3; // Earth radius in meters
  const lat1 = (p1.y * Math.PI) / 180;
  const lat2 = (p2.y * Math.PI) / 180;
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

/**
 * Fetches topographic elevation data from Open-Meteo API for given path vertices
 */
export const fetchTopographicElevations = async (
  path: { x: number; y: number }[]
): Promise<number[]> => {
  if (!path || path.length === 0) return [];

  try {
    // Sample path up to 100 points to stay within URL limits
    const samplePath =
      path.length > 100
        ? path.filter((_, i) => i % Math.ceil(path.length / 100) === 0)
        : [...path];

    if (samplePath[samplePath.length - 1] !== path[path.length - 1]) {
      samplePath.push(path[path.length - 1]);
    }

    const lats = samplePath.map((p) => p.y.toFixed(5)).join(',');
    const lons = samplePath.map((p) => p.x.toFixed(5)).join(',');

    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
    );

    if (!res.ok) throw new Error('Elevation API request failed');

    const json = await res.json();
    if (!json.elevation || !Array.isArray(json.elevation)) {
      throw new Error('Invalid elevation response format');
    }

    const sampledElevations: number[] = json.elevation;

    // Calculate cumulative distances for sample path
    const sampleDists: number[] = [0];
    let cumDist = 0;
    for (let i = 1; i < samplePath.length; i++) {
      cumDist += calculateDistance(samplePath[i - 1], samplePath[i]);
      sampleDists.push(cumDist);
    }

    // Calculate cumulative distances for full path and linearly interpolate
    const fullDists: number[] = [0];
    let fullCumDist = 0;
    for (let i = 1; i < path.length; i++) {
      fullCumDist += calculateDistance(path[i - 1], path[i]);
      fullDists.push(fullCumDist);
    }

    // Linearly interpolate topographic elevations for every point in full path
    const interpolatedElevations: number[] = fullDists.map((d) => {
      // Find bounding interval in sampleDists
      if (d <= sampleDists[0]) return sampledElevations[0];
      if (d >= sampleDists[sampleDists.length - 1])
        return sampledElevations[sampledElevations.length - 1];

      for (let j = 0; j < sampleDists.length - 1; j++) {
        if (d >= sampleDists[j] && d <= sampleDists[j + 1]) {
          return linearInterpolate(
            d,
            sampleDists[j],
            sampledElevations[j],
            sampleDists[j + 1],
            sampledElevations[j + 1]
          );
        }
      }
      return sampledElevations[0];
    });

    return interpolatedElevations;
  } catch (err) {
    console.error('Error fetching topographic elevations:', err);
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
      if (topoElevations.length === path.length) {
        elevations = topoElevations;
      } else {
        // Fallback: Default flat 0 if offline/error
        elevations = new Array(path.length).fill(0);
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

