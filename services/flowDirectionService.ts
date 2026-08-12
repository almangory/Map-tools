import { GeoPoint } from '../types';
import { fetchTopographicElevations } from './elevationInterpolationService';

export interface FlowSegmentResult {
  id: string;
  originalFeature: GeoPoint;
  priority: 1 | 2 | 3;
  priorityLabelAr: string;
  priorityLabelEn: string;
  directionReasonAr: string;
  directionReasonEn: string;
  isReversed: boolean; // true if hydraulic flow moves from path[last] to path[0]
  zStart?: number;
  zEnd?: number;
  directedPath: { x: number; y: number; z?: number }[];
  startNode: { x: number; y: number; z?: number };
  endNode: { x: number; y: number; z?: number };
}

export interface OutfallNode {
  id: string;
  x: number;
  y: number;
  z?: number;
  inflowCount: number;
  outflowCount: number;
  labelAr: string;
  labelEn: string;
  isExplicitOutfall: boolean;
}

export interface NetworkFlowAnalysis {
  segments: Map<string, FlowSegmentResult>;
  outfallNodes: OutfallNode[];
  totalPipes: number;
  reversedPipesCount: number;
  statsByPriority: {
    priority1_z: number;
    priority2_attr: number;
    priority3_dem: number;
  };
}

// In-memory cache for DEM terrain elevation at coordinates to prevent repeated network calls
const globalDemCache = new Map<string, number>();

/**
 * Normalizes coordinate key for caching and node matching
 */
function getCoordKey(x: number, y: number): string {
  return `${x.toFixed(6)},${y.toFixed(6)}`;
}

/**
 * Helper to extract attributes from pt.attributes, pt direct properties, and pt.description
 */
function extractPtAttributes(pt: GeoPoint): Record<string, any> {
  const attrs: Record<string, any> = {
    ...(pt as any),
    ...(pt.attributes || {})
  };

  if (pt.description && typeof pt.description === 'string') {
    const text = pt.description
      .replace(/<\/(div|p|li|tr|h[1-6]|span|td|th)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const colIdx = line.indexOf(':');
      const eqIdx = line.indexOf('=');
      let sepIdx = -1;
      if (colIdx !== -1 && eqIdx !== -1) sepIdx = Math.min(colIdx, eqIdx);
      else if (colIdx !== -1) sepIdx = colIdx;
      else if (eqIdx !== -1) sepIdx = eqIdx;

      if (sepIdx > 0 && sepIdx < line.length - 1) {
        const k = line.substring(0, sepIdx).trim();
        const v = line.substring(sepIdx + 1).trim();
        if (k && v && attrs[k] === undefined) {
          attrs[k] = v;
        }
      }
    }
  }

  return attrs;
}

/**
 * Robust case-insensitive attribute value retriever
 */
function getAttrValue<T = any>(attrs: Record<string, any> | undefined, keys: string[]): T | undefined {
  if (!attrs) return undefined;
  const attrKeys = Object.keys(attrs);
  for (const k of keys) {
    const target = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const ak of attrKeys) {
      if (ak.toLowerCase().replace(/[^a-z0-9]/g, '') === target) {
        const val = attrs[ak];
        if (val !== null && val !== undefined && val !== '') {
          return val as T;
        }
      }
    }
  }
  return undefined;
}

/**
 * Robust numeric attribute parser
 */
function getNumAttr(attrs: Record<string, any> | undefined, keys: string[]): number | undefined {
  const raw = getAttrValue(attrs, keys);
  if (raw !== undefined) {
    const num = parseFloat(String(raw));
    if (!isNaN(num)) return num;
  }
  return undefined;
}

/**
 * PRIMARY LOGIC (Pipe Elevation):
 * Compare StartPipeElevation and EndPipeElevation.
 * If StartPipeElevation > EndPipeElevation, set flow from (StartXcoordinate, StartYcoordinate) to (EndXcoordinate, EndYcoordinate).
 */
function evaluatePrimary_PipeElevation(pt: GeoPoint): {
  isReversed: boolean;
  zStart: number;
  zEnd: number;
  reasonAr: string;
  reasonEn: string;
} | null {
  const path = pt.path;
  if (!path || path.length < 2) return null;

  const attrs = extractPtAttributes(pt);

  const startElevKeys = [
    'startpipeelevation', 'startpipeelev', 'start_pipe_elevation', 'pipestartelevation',
    'startelev', 'startelevation', 'invertup', 'invert_up', 'invin', 'invertin',
    'zstart', 'z1', 'upelev', 'startz', 'invup', 'upstreaminvert'
  ];
  const endElevKeys = [
    'endpipeelevation', 'endpipeelev', 'end_pipe_elevation', 'pipeendelevation',
    'endelev', 'endelevation', 'invertdown', 'invert_down', 'invout', 'invertout',
    'zend', 'z2', 'downelev', 'endz', 'invdown', 'downstreaminvert'
  ];

  let startPipeElevation = getNumAttr(attrs, startElevKeys);
  let endPipeElevation = getNumAttr(attrs, endElevKeys);

  // If start or end pipe elevation is missing, check ground elevation attributes as fallback
  if (startPipeElevation === undefined || endPipeElevation === undefined) {
    const startGround = getNumAttr(attrs, ['startpipegroundelevation', 'startgroundelevation', 'start_pipe_ground_elevation', 'startgroundelev']);
    const endGround = getNumAttr(attrs, ['endpipegroundelevation', 'endgroundelevation', 'end_pipe_ground_elevation', 'endgroundelev']);
    if (startGround !== undefined && endGround !== undefined) {
      if (startPipeElevation === undefined) startPipeElevation = startGround;
      if (endPipeElevation === undefined) endPipeElevation = endGround;
    }
  }

  // Check path vertex Z values if attribute elevations aren't explicitly provided
  if (startPipeElevation === undefined || endPipeElevation === undefined) {
    const firstZ = path[0].z;
    const lastZ = path[path.length - 1].z;
    if (typeof firstZ === 'number' && !isNaN(firstZ) && typeof lastZ === 'number' && !isNaN(lastZ) && (Math.abs(firstZ) > 0.001 || Math.abs(lastZ) > 0.001)) {
      if (startPipeElevation === undefined) startPipeElevation = firstZ;
      if (endPipeElevation === undefined) endPipeElevation = lastZ;
    }
  }

  // Check root pt.z property
  if ((startPipeElevation === undefined || endPipeElevation === undefined) && typeof pt.z === 'number' && !isNaN(pt.z) && Math.abs(pt.z) > 0.001) {
    if (startPipeElevation === undefined) startPipeElevation = pt.z;
  }

  if (startPipeElevation !== undefined && endPipeElevation !== undefined && Math.abs(startPipeElevation - endPipeElevation) > 0.0001) {
    // Check vector direction using StartXcoordinate/StartYcoordinate and EndXcoordinate/EndYcoordinate if available
    const startX = getNumAttr(attrs, ['startxcoordinate', 'startx', 'start_x_coordinate', 'start_x']);
    const startY = getNumAttr(attrs, ['startycoordinate', 'starty', 'start_y_coordinate', 'start_y']);
    const endX = getNumAttr(attrs, ['endxcoordinate', 'endx', 'end_x_coordinate', 'end_x']);
    const endY = getNumAttr(attrs, ['endycoordinate', 'endy', 'end_y_coordinate', 'end_y']);

    let path0IsStartCoord = true;

    if (startX !== undefined && startY !== undefined) {
      if (endX !== undefined && endY !== undefined) {
        // Dot product between path geometry direction vector and attribute start->end coordinate vector
        const geomDx = path[path.length - 1].x - path[0].x;
        const geomDy = path[path.length - 1].y - path[0].y;
        const attrDx = endX - startX;
        const attrDy = endY - startY;

        const dot = geomDx * attrDx + geomDy * attrDy;
        if (dot < 0) {
          path0IsStartCoord = false;
        }
      } else {
        // Check if startX/startY are in WGS84 coordinates
        if (Math.abs(startX) <= 180 && Math.abs(startY) <= 90) {
          const distToStart0 = Math.hypot(path[0].x - startX, path[0].y - startY);
          const distToStartLast = Math.hypot(path[path.length - 1].x - startX, path[path.length - 1].y - startY);
          path0IsStartCoord = distToStart0 <= distToStartLast;
        }
      }
    }

    let isReversed = false;
    if (startPipeElevation > endPipeElevation) {
      // Flow moves from StartCoord to EndCoord
      isReversed = !path0IsStartCoord;
    } else {
      // Flow moves from EndCoord to StartCoord
      isReversed = path0IsStartCoord;
    }

    const reasonAr = `أولوية 1 (مناسيب الأنبوب): منسوب البداية (${startPipeElevation.toFixed(2)}م) ${startPipeElevation > endPipeElevation ? '>' : '<'} منسوب النهاية (${endPipeElevation.toFixed(2)}م)`;
    const reasonEn = `Priority 1 (Pipe Elevation): Start Pipe Elev (${startPipeElevation.toFixed(2)}m) ${startPipeElevation > endPipeElevation ? '>' : '<'} End Pipe Elev (${endPipeElevation.toFixed(2)}m)`;

    return {
      isReversed,
      zStart: startPipeElevation,
      zEnd: endPipeElevation,
      reasonAr,
      reasonEn
    };
  }

  return null;
}

/**
 * SECONDARY LOGIC (Manholes):
 * If pipe elevations are missing/null, determine direction from UpstreamManholeNo towards DownstreamManholeNo.
 */
function evaluateSecondary_Manholes(
  pt: GeoPoint,
  manholeMap: Map<string, { x: number; y: number }>
): {
  isReversed: boolean;
  reasonAr: string;
  reasonEn: string;
} | null {
  const attrs = extractPtAttributes(pt);
  const path = pt.path;
  if (!path || path.length < 2) return null;

  const upMhKeys = [
    'upstreammanholeno', 'upstreammanhole', 'upstream_manhole_no', 'upstream_manhole',
    'upstreammh', 'up_mh', 'us_mh', 'from_mh', 'frommanhole', 'frommanholeno',
    'startmanholeno', 'startmanhole', 'منهل_البداية', 'المنهل_المصدري'
  ];
  const downMhKeys = [
    'downstreammanholeno', 'downstreammanhole', 'downstream_manhole_no', 'downstream_manhole',
    'downstreammh', 'down_mh', 'ds_mh', 'to_mh', 'tomanhole', 'tomanholeno',
    'endmanholeno', 'endmanhole', 'منهل_النهاية', 'منهل_المصب'
  ];

  const upMh = getAttrValue(attrs, upMhKeys);
  const downMh = getAttrValue(attrs, downMhKeys);

  if (upMh || downMh) {
    const upMhStr = upMh ? String(upMh).trim() : '';
    const downMhStr = downMh ? String(downMh).trim() : '';

    const upPos = upMhStr ? manholeMap.get(upMhStr.toLowerCase()) : undefined;
    const downPos = downMhStr ? manholeMap.get(downMhStr.toLowerCase()) : undefined;

    let isReversed = false;

    if (upPos) {
      const distToStart = Math.hypot(path[0].x - upPos.x, path[0].y - upPos.y);
      const distToEnd = Math.hypot(path[path.length - 1].x - upPos.x, path[path.length - 1].y - upPos.y);
      isReversed = distToEnd < distToStart;
    } else if (downPos) {
      const distToStart = Math.hypot(path[0].x - downPos.x, path[0].y - downPos.y);
      const distToEnd = Math.hypot(path[path.length - 1].x - downPos.x, path[path.length - 1].y - downPos.y);
      isReversed = distToStart < distToEnd;
    }

    const labelUp = upMhStr || 'Upstream';
    const labelDown = downMhStr || 'Downstream';

    return {
      isReversed,
      reasonAr: `أولوية 2 (المناهل): الاتجاه من المنهل المصدري (${labelUp}) إلى المنهل المصب (${labelDown})`,
      reasonEn: `Priority 2 (Manholes): Flow from Upstream MH (${labelUp}) to Downstream MH (${labelDown})`
    };
  }

  // Also check general Flow_Direction attributes if present
  for (const [key, val] of Object.entries(attrs)) {
    const kLower = key.toLowerCase().trim();
    if (kLower.includes('flow') || kLower.includes('direction') || kLower === 'dir' || kLower === 'اتجاه') {
      const vStr = String(val).toLowerCase().trim();
      if (['forward', 'fwd', 'starttoend', 's2e', 'downstream', '1', 'down', 'out', 'positive', 'مباشر', 'أمام'].includes(vStr)) {
        return { isReversed: false, reasonAr: `خاصية الاتجاه (${key}: ${val})`, reasonEn: `Direction attribute (${key}: ${val})` };
      }
      if (['backward', 'bwd', 'endtostart', 'e2s', 'upstream', '-1', 'up', 'in', 'negative', 'عكسي', 'خلف'].includes(vStr)) {
        return { isReversed: true, reasonAr: `خاصية الاتجاه (${key}: ${val})`, reasonEn: `Direction attribute (${key}: ${val})` };
      }
    }
  }

  return null;
}

/**
 * TERTIARY FALLBACK (Terrain/DEM Elevation):
 * Queries/fetches underlying terrain ground elevation for start and end coordinates.
 */
async function evaluatePriority3_Terrain(
  startCoord: { x: number; y: number },
  endCoord: { x: number; y: number },
  demCache: Map<string, number>
): Promise<{ isReversed: boolean; elevStart: number; elevEnd: number } | null> {
  const keyStart = getCoordKey(startCoord.x, startCoord.y);
  const keyEnd = getCoordKey(endCoord.x, endCoord.y);

  let elevStart = demCache.get(keyStart);
  let elevEnd = demCache.get(keyEnd);

  // If missing from DEM cache, query elevation API
  if (elevStart === undefined || elevEnd === undefined) {
    try {
      const elevations = await fetchTopographicElevations([startCoord, endCoord]);
      if (elevations && elevations.length >= 2) {
        elevStart = elevations[0];
        elevEnd = elevations[1];
        demCache.set(keyStart, elevStart);
        demCache.set(keyEnd, elevEnd);
      }
    } catch (err) {
      console.warn('DEM topographic fallback error:', err);
    }
  }

  if (elevStart !== undefined && elevEnd !== undefined && Math.abs(elevStart - elevEnd) > 0.01) {
    return {
      isReversed: elevStart < elevEnd,
      elevStart,
      elevEnd
    };
  }

  return null;
}

/**
 * Analyzes hydraulic flow direction for a list of GeoPoints (lines)
 */
export async function analyzeNetworkFlowDirections(
  points: GeoPoint[],
  demCache: Map<string, number> = globalDemCache
): Promise<NetworkFlowAnalysis> {
  const segments = new Map<string, FlowSegmentResult>();
  let priority1Count = 0;
  let priority2Count = 0;
  let priority3Count = 0;
  let reversedCount = 0;

  // Build manhole coordinate map from point features in dataset
  const manholeMap = new Map<string, { x: number; y: number }>();
  points.forEach(p => {
    if (p.type === 'Point' || !p.type) {
      const candidateKeys = [
        p.id,
        p.attributes?.ManholeNo,
        p.attributes?.MANHOLE_NO,
        p.attributes?.UpstreamManholeNo,
        p.attributes?.DownstreamManholeNo,
        p.attributes?.MH_NO,
        p.attributes?.MH_ID,
        p.attributes?.Name
      ];
      candidateKeys.forEach(k => {
        if (k !== null && k !== undefined && String(k).trim() !== '') {
          manholeMap.set(String(k).trim().toLowerCase(), { x: p.x, y: p.y });
        }
      });
    }
  });

  const linesToFetchDem: Array<{
    id: string;
    pt: GeoPoint;
    startCoord: { x: number; y: number };
    endCoord: { x: number; y: number };
  }> = [];

  // Step 1: Synchronous Primary (Pipe Elevation) & Secondary (Manholes) Pass
  const lineFeatures = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);

  lineFeatures.forEach(pt => {
    const path = pt.path!;
    const startNode = path[0];
    const endNode = path[path.length - 1];

    // Primary Logic: Pipe Elevation
    const p1Result = evaluatePrimary_PipeElevation(pt);
    if (p1Result) {
      priority1Count++;
      if (p1Result.isReversed) reversedCount++;

      const directedPath = p1Result.isReversed ? [...path].reverse() : path;

      segments.set(pt.id, {
        id: pt.id,
        originalFeature: pt,
        priority: 1,
        priorityLabelAr: 'الأولوية 1: منسوب الأنبوب (Pipe Elevation)',
        priorityLabelEn: 'Priority 1: Pipe Elevation',
        directionReasonAr: p1Result.reasonAr,
        directionReasonEn: p1Result.reasonEn,
        isReversed: p1Result.isReversed,
        zStart: p1Result.zStart,
        zEnd: p1Result.zEnd,
        directedPath,
        startNode: p1Result.isReversed ? endNode : startNode,
        endNode: p1Result.isReversed ? startNode : endNode
      });
      return;
    }

    // Secondary Logic: Manholes
    const p2Result = evaluateSecondary_Manholes(pt, manholeMap);
    if (p2Result) {
      priority2Count++;
      if (p2Result.isReversed) reversedCount++;

      const directedPath = p2Result.isReversed ? [...path].reverse() : path;

      segments.set(pt.id, {
        id: pt.id,
        originalFeature: pt,
        priority: 2,
        priorityLabelAr: 'الأولوية 2: المناهل (Upstream -> Downstream)',
        priorityLabelEn: 'Priority 2: Manholes',
        directionReasonAr: p2Result.reasonAr,
        directionReasonEn: p2Result.reasonEn,
        isReversed: p2Result.isReversed,
        directedPath,
        startNode: p2Result.isReversed ? endNode : startNode,
        endNode: p2Result.isReversed ? startNode : endNode
      });
      return;
    }

    // Tertiary Logic Queue: DEM Terrain Fallback
    linesToFetchDem.push({
      id: pt.id,
      pt,
      startCoord: { x: startNode.x, y: startNode.y },
      endCoord: { x: endNode.x, y: endNode.y }
    });

    segments.set(pt.id, {
      id: pt.id,
      originalFeature: pt,
      priority: 3,
      priorityLabelAr: 'الأولوية 3: منسوب الأرض (DEM)',
      priorityLabelEn: 'Priority 3: Terrain Elevation (DEM)',
      directionReasonAr: 'جاري جلب منسوب الأرض من نموذج التضاريس...',
      directionReasonEn: 'Fetching ground elevation from DEM...',
      isReversed: false,
      directedPath: path,
      startNode,
      endNode
    });
  });

  // Step 2: Batch Async Tertiary Pass (Terrain DEM Fallback)
  if (linesToFetchDem.length > 0) {
    const missingCoords: { x: number; y: number }[] = [];
    linesToFetchDem.forEach(item => {
      const k1 = getCoordKey(item.startCoord.x, item.startCoord.y);
      const k2 = getCoordKey(item.endCoord.x, item.endCoord.y);
      if (!demCache.has(k1)) missingCoords.push(item.startCoord);
      if (!demCache.has(k2)) missingCoords.push(item.endCoord);
    });

    if (missingCoords.length > 0) {
      try {
        const elevations = await fetchTopographicElevations(missingCoords);
        missingCoords.forEach((coord, idx) => {
          if (elevations[idx] !== undefined) {
            demCache.set(getCoordKey(coord.x, coord.y), elevations[idx]);
          }
        });
      } catch (e) {
        console.warn('Batch DEM fetch failed:', e);
      }
    }

    linesToFetchDem.forEach(item => {
      const path = item.pt.path!;
      const startNode = path[0];
      const endNode = path[path.length - 1];

      const k1 = getCoordKey(item.startCoord.x, item.startCoord.y);
      const k2 = getCoordKey(item.endCoord.x, item.endCoord.y);

      const elevStart = demCache.get(k1);
      const elevEnd = demCache.get(k2);

      let isReversed = false;
      let reasonAr = 'الاتجاه الطبيعي لمسار الأنبوب (Default)';
      let reasonEn = 'Default line sequence order';

      if (elevStart !== undefined && elevEnd !== undefined && Math.abs(elevStart - elevEnd) > 0.01) {
        priority3Count++;
        isReversed = elevStart < elevEnd;
        if (isReversed) reversedCount++;

        reasonAr = `أولوية 3 (منسوب الأرض DEM): منسوب البداية (${elevStart.toFixed(2)}م) ${elevStart > elevEnd ? '>' : '<'} منسوب النهاية (${elevEnd.toFixed(2)}م)`;
        reasonEn = `Priority 3 (Terrain DEM): Start ground elev (${elevStart.toFixed(2)}m) ${elevStart > elevEnd ? '>' : '<'} End ground elev (${elevEnd.toFixed(2)}m)`;
      }

      const directedPath = isReversed ? [...path].reverse() : path;

      segments.set(item.id, {
        id: item.id,
        originalFeature: item.pt,
        priority: 3,
        priorityLabelAr: 'الأولوية 3: منسوب الأرض (DEM)',
        priorityLabelEn: 'Priority 3: Terrain Elevation (DEM)',
        directionReasonAr: reasonAr,
        directionReasonEn: reasonEn,
        isReversed,
        zStart: elevStart,
        zEnd: elevEnd,
        directedPath,
        startNode: isReversed ? endNode : startNode,
        endNode: isReversed ? startNode : endNode
      });
    });
  }

  // Step 3: Outfall Node Detection
  const nodeRegistry = new Map<string, {
    key: string;
    x: number;
    y: number;
    z?: number;
    inflowCount: number;
    outflowCount: number;
    labelAr?: string;
    labelEn?: string;
    isExplicitOutfall: boolean;
  }>();

  segments.forEach(seg => {
    const startKey = getCoordKey(seg.startNode.x, seg.startNode.y);
    const endKey = getCoordKey(seg.endNode.x, seg.endNode.y);

    if (!nodeRegistry.has(startKey)) {
      nodeRegistry.set(startKey, {
        key: startKey,
        x: seg.startNode.x,
        y: seg.startNode.y,
        z: seg.startNode.z,
        inflowCount: 0,
        outflowCount: 0,
        isExplicitOutfall: false
      });
    }

    if (!nodeRegistry.has(endKey)) {
      nodeRegistry.set(endKey, {
        key: endKey,
        x: seg.endNode.x,
        y: seg.endNode.y,
        z: seg.endNode.z,
        inflowCount: 0,
        outflowCount: 0,
        isExplicitOutfall: false
      });
    }

    const startEntry = nodeRegistry.get(startKey)!;
    const endEntry = nodeRegistry.get(endKey)!;

    startEntry.outflowCount += 1;
    endEntry.inflowCount += 1;
  });

  points.forEach(pt => {
    if (pt.type === 'Point' || !pt.type) {
      const layerLower = (pt.layer || '').toLowerCase();
      const descLower = (pt.description || '').toLowerCase();
      const idLower = String(pt.id || '').toLowerCase();

      const isOutfall = ['outfall', 'discharge', 'مصب', 'محطة', 'wwtp', 'treatment', 'محطة الصرف'].some(term => 
        layerLower.includes(term) || descLower.includes(term) || idLower.includes(term)
      );

      if (isOutfall) {
        const key = getCoordKey(pt.x, pt.y);
        if (!nodeRegistry.has(key)) {
          nodeRegistry.set(key, {
            key,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            inflowCount: 1,
            outflowCount: 0,
            labelAr: String(pt.id),
            labelEn: String(pt.id),
            isExplicitOutfall: true
          });
        } else {
          const entry = nodeRegistry.get(key)!;
          entry.isExplicitOutfall = true;
          entry.labelAr = String(pt.id);
          entry.labelEn = String(pt.id);
        }
      }
    }
  });

  const outfallNodes: OutfallNode[] = [];
  let outfallIdx = 1;

  nodeRegistry.forEach(node => {
    if ((node.inflowCount > 0 && node.outflowCount === 0) || node.isExplicitOutfall) {
      outfallNodes.push({
        id: node.labelAr || `OUTFALL-${outfallIdx}`,
        x: node.x,
        y: node.y,
        z: node.z,
        inflowCount: node.inflowCount,
        outflowCount: node.outflowCount,
        labelAr: node.labelAr || `نقطة المصب (${outfallIdx})`,
        labelEn: node.labelEn || `Outfall Point (${outfallIdx})`,
        isExplicitOutfall: node.isExplicitOutfall
      });
      outfallIdx++;
    }
  });

  return {
    segments,
    outfallNodes,
    totalPipes: lineFeatures.length,
    reversedPipesCount: reversedCount,
    statsByPriority: {
      priority1_z: priority1Count,
      priority2_attr: priority2Count,
      priority3_dem: priority3Count
    }
  };
}

