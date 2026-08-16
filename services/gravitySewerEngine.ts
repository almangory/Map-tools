import { GeoPoint, GravityPipeCalculations, GravityNetworkResult, SewerHydraulicStatus } from '../types';
import { calculateDistance } from './elevationInterpolationService';

export const DEFAULT_SEWER_MANNING_N = 0.013; // Concrete, VC, uPVC, HDPE standard
export const DEFAULT_MIN_COVER_DEPTH = 1.20; // 1.2 meters minimum cover depth
export const DEFAULT_MAX_TRENCH_DEPTH = 5.00; // 5.0 meters maximum trench depth before requiring lift station
export const DEFAULT_MIN_SEWER_SLOPE = 0.005; // 0.5% standard minimum self-cleansing slope (0.005 m/m)
export const DEFAULT_SEWER_DIAMETER_MM = 200; // 200 mm (8 inches) standard minimum gravity sewer
export const MIN_SELF_CLEANSING_VELOCITY = 0.60; // 0.60 m/s
export const MAX_EROSION_VELOCITY = 2.50; // 2.50 m/s

// Hydraulic Design Standards for Maximum Gravity Run / Distance to Outfall
export const DEFAULT_MAX_HYDRAULIC_OUTFLOW_DISTANCE_M = 1500; // 1,500m (Standard Maximum Recommended Gravity Sewer Reach)
export const CRITICAL_MAX_HYDRAULIC_OUTFLOW_DISTANCE_M = 2000; // 2,000m (Critical Maximum Gravity Run)
export const CAUTION_HYDRAULIC_OUTFLOW_DISTANCE_M = 1200; // 1,200m (Caution boundary)

/**
 * Calculates 2D / 3D geodesic path length in meters
 */
export function calculateLineLengthMeters(path?: { x: number; y: number; z?: number }[]): number {
  if (!path || path.length < 2) return 1.0;
  let totalDist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalDist += calculateDistance(path[i], path[i + 1]);
  }
  return Math.max(0.5, totalDist);
}

/**
 * Helper to extract numeric attribute value with multiple naming aliases
 */
export function extractNumeric(attrs: Record<string, any> | undefined, keys: string[]): number | undefined {
  if (!attrs) return undefined;
  const attrKeys = Object.keys(attrs);
  for (const targetKey of keys) {
    const cleanTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const actualKey of attrKeys) {
      if (actualKey.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget) {
        const val = attrs[actualKey];
        if (val !== null && val !== undefined && val !== '') {
          const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
          if (!isNaN(num)) return num;
        }
      }
    }
  }
  return undefined;
}

/**
 * Helper to extract string attribute value
 */
export function extractString(attrs: Record<string, any> | undefined, keys: string[]): string | undefined {
  if (!attrs) return undefined;
  const attrKeys = Object.keys(attrs);
  for (const targetKey of keys) {
    const cleanTarget = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const actualKey of attrKeys) {
      if (actualKey.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget) {
        const val = attrs[actualKey];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }
  return undefined;
}

export interface ComputeSegmentOptions {
  manningN?: number;
  minCoverDepth?: number;
  maxTrenchDepth?: number;
  defaultDiameterMm?: number;
  minSlopeDecimal?: number;
  knownGlStart?: number;
  knownGlEnd?: number;
  knownIlStart?: number;
  knownIlEnd?: number;
}

/**
 * Computes complete hydraulic parameters for an individual gravity sewer pipe segment
 */
export function computeGravityPipeSegment(
  line: GeoPoint,
  options: ComputeSegmentOptions = {}
): GravityPipeCalculations {
  const attrs: Record<string, any> = {
    ...(line as any),
    ...(line.attributes || {})
  };

  const manningN = options.manningN || DEFAULT_SEWER_MANNING_N;
  const minCoverDepth = options.minCoverDepth || DEFAULT_MIN_COVER_DEPTH;
  const maxTrenchDepth = options.maxTrenchDepth || DEFAULT_MAX_TRENCH_DEPTH;
  const minSlopeDecimal = options.minSlopeDecimal || DEFAULT_MIN_SEWER_SLOPE;

  // 1. Length
  let length = line.length || 0;
  if (!length && line.path && line.path.length >= 2) {
    length = calculateLineLengthMeters(line.path);
  }
  if (length <= 0) length = 10.0; // fallback safe segment length

  // 2. Diameter
  const diameterKeys = [
    'diameter', 'diameter_mm', 'dia', 'innerdiameter', 'pipediameter',
    'القطر', 'قطر_الانبوب', 'قطر'
  ];
  let rawDiameter = extractNumeric(attrs, diameterKeys);
  let diameterMm = options.defaultDiameterMm || DEFAULT_SEWER_DIAMETER_MM;
  if (rawDiameter !== undefined && rawDiameter > 0) {
    diameterMm = rawDiameter <= 5.0 ? rawDiameter * 1000 : rawDiameter;
  }
  const diameterM = diameterMm / 1000;

  // 3. Ground Level Extraction (GL_start, GL_end)
  const glStartKeys = [
    'gl_start', 'glstart', 'startgroundelevation', 'start_ground_elevation',
    'startpipegroundelevation', 'startelev', 'ground_start', 'منسوب_الارض_بداية'
  ];
  const glEndKeys = [
    'gl_end', 'glend', 'endgroundelevation', 'end_ground_elevation',
    'endpipegroundelevation', 'endelev', 'ground_end', 'منسوب_الارض_نهاية'
  ];

  let glStart = options.knownGlStart ?? extractNumeric(attrs, glStartKeys);
  let glEnd = options.knownGlEnd ?? extractNumeric(attrs, glEndKeys);

  // If missing from attributes, inspect path Z values
  if (line.path && line.path.length >= 2) {
    const pStart = line.path[0];
    const pEnd = line.path[line.path.length - 1];
    if (glStart === undefined && pStart.z !== undefined && !isNaN(pStart.z) && pStart.z !== 0) {
      glStart = pStart.z;
    }
    if (glEnd === undefined && pEnd.z !== undefined && !isNaN(pEnd.z) && pEnd.z !== 0) {
      glEnd = pEnd.z;
    }
  }

  // Fallback defaults if no GL found (assume nominal datum 600m)
  if (glStart === undefined) glStart = 600.0;
  if (glEnd === undefined) glEnd = glStart - (length * minSlopeDecimal);

  // 4. Invert Level Extraction & Computation (IL_start, IL_end)
  const ilStartKeys = [
    'il_start', 'ilstart', 'startpipeelevation', 'start_pipe_elevation',
    'invert_start', 'invertup', 'invin', 'invert_in', 'منسوب_القاع_بداية'
  ];
  const ilEndKeys = [
    'il_end', 'ilend', 'endpipeelevation', 'end_pipe_elevation',
    'invert_end', 'invertdown', 'invout', 'invert_out', 'منسوب_القاع_نهاية'
  ];

  let ilStart = options.knownIlStart ?? extractNumeric(attrs, ilStartKeys);
  let ilEnd = options.knownIlEnd ?? extractNumeric(attrs, ilEndKeys);

  // If IL is missing, derive it from Ground Level minus standard cover depth
  if (ilStart === undefined) {
    ilStart = glStart - minCoverDepth;
  }

  let isReversed = false;
  // Natural flow moves from higher ground/invert to lower ground/invert
  if (ilEnd === undefined) {
    // If GL naturally slopes downward:
    if (glStart >= glEnd) {
      const naturalDrop = glStart - glEnd;
      const naturalSlope = naturalDrop / length;
      if (naturalSlope >= minSlopeDecimal) {
        // Match natural slope if greater than minimum
        ilEnd = glEnd - minCoverDepth;
      } else {
        // Impose minimum required gravity slope
        ilEnd = ilStart - (minSlopeDecimal * length);
      }
    } else {
      // Ground is rising uphill -> we must dig deeper to maintain minimum downward slope
      ilEnd = ilStart - (minSlopeDecimal * length);
    }
  }

  // Calculate depths
  let depthStart = Number((glStart - ilStart).toFixed(3));
  let depthEnd = Number((glEnd - ilEnd).toFixed(3));

  // If depthStart is less than minimum cover, adjust
  if (depthStart < minCoverDepth - 0.05) {
    ilStart = glStart - minCoverDepth;
    depthStart = minCoverDepth;
  }

  // Calculate direct slope: Slope (%) = ((IL_start - IL_end) / Length) * 100
  let deltaIL = ilStart - ilEnd;
  let slopeDecimal = deltaIL / length;

  // Check if flow is reversed (e.g. user drew line opposite to gravitational descent)
  if (slopeDecimal < 0) {
    // Adverse grade if fixed invert levels were given
    slopeDecimal = Math.abs(slopeDecimal);
    isReversed = true;
  }

  // Ensure positive slope value for Manning equation
  if (slopeDecimal <= 0.00001) {
    slopeDecimal = minSlopeDecimal;
  }
  const slopePercent = Number((slopeDecimal * 100).toFixed(3));

  // 5. Manning's Equation Calculations
  // Flow Area A = π * (D / 2)² (for full cross-section)
  const flowArea = Math.PI * Math.pow(diameterM / 2, 2); // m²
  // Hydraulic Radius R = D / 4
  const hydraulicRadius = diameterM / 4; // m

  // Velocity V = (1 / n) * (R^(2/3)) * (S^(1/2)) (m/s)
  const velocity = (1 / manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slopeDecimal);
  
  // Full Capacity Q = A * V (m³/s)
  const flowCapacityM3s = flowArea * velocity;
  const flowCapacityLs = flowCapacityM3s * 1000; // L/s

  // 6. Velocity Verification (0.6 <= V <= 2.5 m/s)
  let velocityStatus: 'optimal' | 'low' | 'high' = 'optimal';
  let velocityStatusLabelAr = 'مطابق وسلس (0.6 - 2.5 م/ث)';
  let velocityStatusLabelEn = 'Optimal Flow (0.6 - 2.5 m/s)';

  if (velocity < MIN_SELF_CLEANSING_VELOCITY) {
    velocityStatus = 'low';
    velocityStatusLabelAr = `رسوبيات (سرعة منخفضة ${velocity.toFixed(2)} < 0.6 م/ث)`;
    velocityStatusLabelEn = `Sedimentation Risk (${velocity.toFixed(2)} < 0.6 m/s)`;
  } else if (velocity > MAX_EROSION_VELOCITY) {
    velocityStatus = 'high';
    velocityStatusLabelAr = `نحر وتآكل (سرعة عالية ${velocity.toFixed(2)} > 2.5 م/ث)`;
    velocityStatusLabelEn = `Scour & Erosion Risk (${velocity.toFixed(2)} > 2.5 m/s)`;
  }

  // 7. Lift Station and Drop Manhole Detection Logic
  let status: SewerHydraulicStatus = 'Normal Gravity';
  let statusReasonAr = 'انحدار طبيعي سليم ومطابق للمواصفات';
  let statusReasonEn = 'Normal Gravity Flow Compliant';
  let isLiftStationRequired = false;
  let isDropManhole = false;
  let dropHeightM: number | undefined = undefined;

  // Case A: Lift Station Required
  // 1. Excavation depth exceeds 5.0m
  // 2. Or ground is rising severely uphill such that maintaining gravity requires excessive depth
  if (depthEnd > maxTrenchDepth || depthStart > maxTrenchDepth) {
    status = 'Lift Station Needed';
    isLiftStationRequired = true;
    const maxD = Math.max(depthStart, depthEnd);
    statusReasonAr = `عمق الحفر (${maxD.toFixed(2)}م) يتجاوز الحد الأقصى (${maxTrenchDepth}م) -> يلزم محطة رفع (Lift Station)`;
    statusReasonEn = `Excavation depth (${maxD.toFixed(2)}m) exceeds limit (${maxTrenchDepth}m) -> Lift Station Required`;
  } 
  // Case B: Drop Manhole (منهول هدار)
  // 1. If slope > 10% (0.10)
  // 2. Or elevation drop between incoming and outgoing exceeds 0.60m
  else if (slopePercent > 10.0 || deltaIL > 0.60 && length < 15.0) {
    status = 'Drop Manhole';
    isDropManhole = true;
    dropHeightM = Number(Math.max(0.60, deltaIL).toFixed(2));
    statusReasonAr = `ميل شديد وفارق منسوب كبير (${slopePercent.toFixed(1)}% / ${deltaIL.toFixed(2)}م) -> اقتراح منهول هدار (Drop Manhole)`;
    statusReasonEn = `Steep slope & large drop (${slopePercent.toFixed(1)}% / ${deltaIL.toFixed(2)}m) -> Drop Manhole Suggested`;
  }

  // Upstream / Downstream identifiers
  const upMhKeys = ['upstreammanholeno', 'upstreammanhole', 'upstreammh', 'from_mh', 'frommanhole', 'startmanhole', 'منهل_البداية'];
  const downMhKeys = ['downstreammanholeno', 'downstreammanhole', 'downstreammh', 'to_mh', 'tomanhole', 'endmanhole', 'منهل_النهاية'];
  
  let upstreamNode = extractString(attrs, upMhKeys) || `MH_IN_${line.id}`;
  let downstreamNode = extractString(attrs, downMhKeys) || `MH_OUT_${line.id}`;

  if (isReversed) {
    const tmp = upstreamNode;
    upstreamNode = downstreamNode;
    downstreamNode = tmp;
  }

  return {
    id: line.id,
    GL_start: Number(glStart.toFixed(2)),
    GL_end: Number(glEnd.toFixed(2)),
    IL_start: Number(ilStart.toFixed(2)),
    IL_end: Number(ilEnd.toFixed(2)),
    Depth_start: depthStart,
    Depth_end: depthEnd,
    Length: Number(length.toFixed(2)),
    Slope: slopePercent,
    SlopeDecimal: slopeDecimal,
    Diameter_mm: diameterMm,
    Diameter_m: diameterM,
    Manning_n: manningN,
    Velocity: Number(velocity.toFixed(3)),
    Flow_Capacity_Ls: Number(flowCapacityLs.toFixed(2)),
    Flow_Capacity_M3s: Number(flowCapacityM3s.toFixed(4)),
    VelocityStatus: velocityStatus,
    VelocityStatusLabelAr: velocityStatusLabelAr,
    VelocityStatusLabelEn: velocityStatusLabelEn,
    Status: status,
    StatusReasonAr: statusReasonAr,
    StatusReasonEn: statusReasonEn,
    DropHeight_m: dropHeightM,
    Outfall_ID: undefined,
    IsOutfall: false,
    IsLiftStationRequired: isLiftStationRequired,
    IsDropManhole: isDropManhole,
    UpstreamNode: upstreamNode,
    DownstreamNode: downstreamNode,
    IsReversed: isReversed
  };
}

/**
 * Analyzes an entire gravity sewer network:
 * 1. Topologically propagates Invert Levels (IL) downwards from upstream branches to downstream.
 * 2. Identifies the overall lowest Invert Level node as the network Outfall (المصب النهائي).
 * 3. Identifies all nodes requiring Lift Stations or Drop Manholes.
 * 4. Returns comprehensive summary and individual pipe calculation objects.
 */
export function analyzeGravitySewerNetwork(
  points: GeoPoint[],
  options: ComputeSegmentOptions = {}
): GravityNetworkResult {
  const lineFeatures = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  
  const pipes: GravityPipeCalculations[] = [];
  const pipesMap = new Map<string | number, GravityPipeCalculations>();

  let totalLengthM = 0;
  let sumVelocity = 0;
  let sumSlope = 0;
  let totalFlowCapacityLs = 0;

  let normalGravityCount = 0;
  let dropManholeCount = 0;
  let liftStationCount = 0;

  let optimalVelocityCount = 0;
  let lowVelocityCount = 0;
  let highVelocityCount = 0;

  const liftStationNodes: Array<{
    id: string;
    x: number;
    y: number;
    reasonAr: string;
    reasonEn: string;
    requiredDepth: number;
    pipeId: string | number;
  }> = [];

  const dropManholeNodes: Array<{
    id: string;
    x: number;
    y: number;
    dropMeters: number;
    pipeId: string | number;
  }> = [];

  // Pass 1: Compute baseline segment hydraulics
  lineFeatures.forEach(line => {
    const calc = computeGravityPipeSegment(line, options);
    pipes.push(calc);
    pipesMap.set(calc.id, calc);
    pipesMap.set(String(calc.id), calc);

    totalLengthM += calc.Length;
    sumVelocity += calc.Velocity * calc.Length;
    sumSlope += calc.Slope * calc.Length;
    totalFlowCapacityLs += calc.Flow_Capacity_Ls;

    if (calc.Status === 'Normal Gravity') normalGravityCount++;
    else if (calc.Status === 'Drop Manhole') dropManholeCount++;
    else if (calc.Status === 'Lift Station Needed') liftStationCount++;

    if (calc.VelocityStatus === 'optimal') optimalVelocityCount++;
    else if (calc.VelocityStatus === 'low') lowVelocityCount++;
    else highVelocityCount++;

    const path = line.path!;
    const endCoord = calc.IsReversed ? path[0] : path[path.length - 1];

    if (calc.IsLiftStationRequired) {
      liftStationNodes.push({
        id: `LS-${calc.id}`,
        x: endCoord.x,
        y: endCoord.y,
        reasonAr: calc.StatusReasonAr,
        reasonEn: calc.StatusReasonEn,
        requiredDepth: Math.max(calc.Depth_start, calc.Depth_end),
        pipeId: calc.id
      });
    }

    if (calc.IsDropManhole) {
      dropManholeNodes.push({
        id: `DROP-MH-${calc.id}`,
        x: endCoord.x,
        y: endCoord.y,
        dropMeters: calc.DropHeight_m || 0.6,
        pipeId: calc.id
      });
    }
  });

  // Pass 2: Outfall Detection (Lowest Invert Level node across the network)
  let lowestIL = Infinity;
  let outfallCandidate: GravityNetworkResult['outfallNode'] = undefined;
  let outfallPipeId: string | number | undefined = undefined;

  lineFeatures.forEach(line => {
    const calc = pipesMap.get(line.id);
    if (!calc) return;

    const path = line.path!;
    const endCoord = calc.IsReversed ? path[0] : path[path.length - 1];

    if (calc.IL_end < lowestIL) {
      lowestIL = calc.IL_end;
      outfallPipeId = calc.id;
      outfallCandidate = {
        id: `OUTFALL_MAIN_${calc.id}`,
        x: endCoord.x,
        y: endCoord.y,
        IL: calc.IL_end,
        GL: calc.GL_end,
        depth: calc.Depth_end,
        totalIncomingCapacityLs: calc.Flow_Capacity_Ls
      };
    }
  });

  // Mark outfall on the lowest pipe
  if (outfallPipeId !== undefined && outfallCandidate) {
    const targetPipe = pipesMap.get(outfallPipeId);
    if (targetPipe) {
      targetPipe.IsOutfall = true;
      targetPipe.Outfall_ID = outfallCandidate.id;
    }
  }

  const avgVelocity = totalLengthM > 0 ? Number((sumVelocity / totalLengthM).toFixed(3)) : 0;
  const avgSlopePercent = totalLengthM > 0 ? Number((sumSlope / totalLengthM).toFixed(3)) : 0;

  return {
    pipes,
    pipesMap,
    totalPipes: lineFeatures.length,
    totalLengthM: Number(totalLengthM.toFixed(2)),
    outfallNode: outfallCandidate,
    liftStationNodes,
    dropManholeNodes,
    stats: {
      normalGravityCount,
      dropManholeCount,
      liftStationCount,
      optimalVelocityCount,
      lowVelocityCount,
      highVelocityCount,
      avgSlopePercent,
      avgVelocity,
      totalFlowCapacityLs: Number(totalFlowCapacityLs.toFixed(2))
    }
  };
}

export interface OutfallTarget {
  id: string;
  name?: string;
  x: number;
  y: number;
  z?: number;
  color?: string;
}

export interface OutfallSummaryInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  GL: number;
  IL: number;
  depth: number;
  totalConnectedPipes: number;
  totalLengthMeters: number;
  totalIncomingFlowLs: number;
  avgSlope: number;
  avgVelocity: number;
  color: string;
}

export interface OutfallCascadeResult {
  orientedPoints: GeoPoint[];
  outfallNodes: OutfallSummaryInfo[];
  outfallNode: OutfallSummaryInfo;
  totalPipesOriented: number;
  reversedCount: number;
  liftStationCount: number;
  dropManholeCount: number;
  avgSlope: number;
  avgVelocity: number;
}

export const OUTFALL_PALETTE = [
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];

/**
 * Topologically orients an entire sewer network towards one or multiple designated or auto-detected Outfalls (المصبات),
 * partitions the network into optimal gravity catchments (basins),
 * cascades all Invert Levels (IL), depths, slopes, velocities, and records the flow data directly onto GeoPoint attributes.
 */
export function orientNetworkTowardsOutfall(
  points: GeoPoint[],
  options: {
    targetOutfallCoord?: { x: number; y: number; z?: number };
    targetOutfallId?: string;
    targetOutfalls?: OutfallTarget[];
    outfallTargets?: OutfallTarget[];
    defaultDiameterMm?: number;
    minCoverDepth?: number;
    maxTrenchDepth?: number;
    minSlopeDecimal?: number;
    manningN?: number;
    outfallTerminalDepth?: number;
    maxHydraulicDistanceM?: number;
  } = {}
): OutfallCascadeResult {
  const minCoverDepth = options.minCoverDepth ?? DEFAULT_MIN_COVER_DEPTH;
  const maxTrenchDepth = options.maxTrenchDepth ?? DEFAULT_MAX_TRENCH_DEPTH;
  const minSlopeDecimal = options.minSlopeDecimal ?? DEFAULT_MIN_SEWER_SLOPE;
  const defaultDiameterMm = options.defaultDiameterMm ?? DEFAULT_SEWER_DIAMETER_MM;
  const manningN = options.manningN ?? DEFAULT_SEWER_MANNING_N;
  const outfallTerminalDepth = options.outfallTerminalDepth ?? 2.50;
  const standardLimitMeters = options.maxHydraulicDistanceM ?? DEFAULT_MAX_HYDRAULIC_OUTFLOW_DISTANCE_M;
  const targetOutfalls = options.targetOutfalls || options.outfallTargets;

  // Separate line features from point/polygon features
  const otherPoints: GeoPoint[] = [];
  const linePoints: GeoPoint[] = [];

  points.forEach(p => {
    if (p.type === 'LineString' && p.path && p.path.length >= 2) {
      linePoints.push(p);
    } else {
      otherPoints.push(p);
    }
  });

  const emptyOutfall: OutfallSummaryInfo = {
    id: 'OUTFALL_NONE',
    name: 'مصب افتراضي',
    x: 0,
    y: 0,
    GL: 600,
    IL: 597.5,
    depth: 2.5,
    totalConnectedPipes: 0,
    totalLengthMeters: 0,
    totalIncomingFlowLs: 0,
    avgSlope: 0,
    avgVelocity: 0,
    color: OUTFALL_PALETTE[0]
  };

  if (linePoints.length === 0) {
    return {
      orientedPoints: points,
      outfallNodes: [emptyOutfall],
      outfallNode: emptyOutfall,
      totalPipesOriented: 0,
      reversedCount: 0,
      liftStationCount: 0,
      dropManholeCount: 0,
      avgSlope: 0,
      avgVelocity: 0
    };
  }

  // 1. Build Spatial Node Graph (Tolerance ~ 5m / 0.000045 deg)
  const nodeToleranceDeg = 5.0 / 111320;

  interface GraphNode {
    id: string;
    customName?: string;
    x: number;
    y: number;
    z: number; // Ground elevation
    assignedIL?: number;
    distToOutfall: number;
    hopCount: number;
    assignedOutfall?: GraphNode;
    outfallColor?: string;
    connectedEdges: GraphEdge[];
    degree: number;
    isExplicitOutfall: boolean;
  }

  interface GraphEdge {
    pipe: GeoPoint;
    nodeA: GraphNode;
    nodeB: GraphNode;
    length: number;
    directedFrom?: GraphNode;
    directedTo?: GraphNode;
    assignedOutfall?: GraphNode;
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  function getOrCreateNode(x: number, y: number, fallbackZ?: number): GraphNode {
    for (const n of nodes) {
      const dist = Math.hypot(n.x - x, n.y - y);
      if (dist <= nodeToleranceDeg) {
        if (fallbackZ !== undefined && !isNaN(fallbackZ) && fallbackZ !== 0 && (n.z === 600 || n.z === 0)) {
          n.z = fallbackZ;
        }
        return n;
      }
    }
    const newNode: GraphNode = {
      id: `MH_${nodes.length + 1}`,
      x,
      y,
      z: fallbackZ !== undefined && !isNaN(fallbackZ) && fallbackZ !== 0 ? fallbackZ : 600.0,
      distToOutfall: Infinity,
      hopCount: Infinity,
      connectedEdges: [],
      degree: 0,
      isExplicitOutfall: false
    };
    nodes.push(newNode);
    return newNode;
  }

  linePoints.forEach(line => {
    const path = line.path!;
    const startPt = path[0];
    const endPt = path[path.length - 1];

    const attrs = line.attributes || {};
    const glStart = extractNumeric(attrs, ['gl_start', 'glstart', 'startgroundelevation', 'startelev']) ?? startPt.z;
    const glEnd = extractNumeric(attrs, ['gl_end', 'glend', 'endgroundelevation', 'endelev']) ?? endPt.z;

    const nodeA = getOrCreateNode(startPt.x, startPt.y, glStart);
    const nodeB = getOrCreateNode(endPt.x, endPt.y, glEnd);

    const length = calculateLineLengthMeters(path);
    const edge: GraphEdge = {
      pipe: line,
      nodeA,
      nodeB,
      length
    };

    nodeA.connectedEdges.push(edge);
    nodeA.degree += 1;
    nodeB.connectedEdges.push(edge);
    nodeB.degree += 1;
    edges.push(edge);
  });

  // Check other points for explicit outfall markers
  otherPoints.forEach(pt => {
    const layerLower = (pt.layer || '').toLowerCase();
    const descLower = (pt.description || '').toLowerCase();
    const idLower = String(pt.id || '').toLowerCase();
    const isOutfall = ['outfall', 'discharge', 'مصب', 'wwtp', 'treatment', 'محطة الصرف', 'حوض التهدئة'].some(k => 
      layerLower.includes(k) || descLower.includes(k) || idLower.includes(k)
    );
    if (isOutfall) {
      const matchNode = nodes.find(n => Math.hypot(n.x - pt.x, n.y - pt.y) <= nodeToleranceDeg * 3);
      if (matchNode) {
        matchNode.isExplicitOutfall = true;
        if (!matchNode.customName) matchNode.customName = pt.description || pt.id || 'مصب محدد';
      }
    }
  });

  // 2. Determine Outfall Nodes (Multiple Outfalls or Single Target)
  const activeOutfallNodes: GraphNode[] = [];

  // Helper to find closest node to a coord
  function findClosestNode(coord: { x: number; y: number }): GraphNode | undefined {
    let minDist = Infinity;
    let closest: GraphNode | undefined = undefined;
    for (const n of nodes) {
      const d = Math.hypot(n.x - coord.x, n.y - coord.y);
      if (d < minDist) {
        minDist = d;
        closest = n;
      }
    }
    return closest;
  }

  if (targetOutfalls && targetOutfalls.length > 0) {
    targetOutfalls.forEach((target, idx) => {
      const matched = findClosestNode(target);
      if (matched && !activeOutfallNodes.includes(matched)) {
        matched.isExplicitOutfall = true;
        matched.customName = target.name || target.id || `مصب ${idx + 1}`;
        matched.outfallColor = target.color || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length];
        activeOutfallNodes.push(matched);
      }
    });
  } else if (options.targetOutfallCoord) {
    const matched = findClosestNode(options.targetOutfallCoord);
    if (matched) {
      matched.isExplicitOutfall = true;
      matched.customName = 'المصب الرئيسي المحدد';
      matched.outfallColor = OUTFALL_PALETTE[0];
      activeOutfallNodes.push(matched);
    }
  } else if (options.targetOutfallId) {
    const matched = nodes.find(n => n.id.toLowerCase() === options.targetOutfallId?.toLowerCase());
    if (matched) {
      matched.isExplicitOutfall = true;
      matched.customName = `مصب ${matched.id}`;
      matched.outfallColor = OUTFALL_PALETTE[0];
      activeOutfallNodes.push(matched);
    }
  }

  // If no explicit targets passed, check explicit nodes found in layers/data
  if (activeOutfallNodes.length === 0) {
    const explicitNodes = nodes.filter(n => n.isExplicitOutfall);
    explicitNodes.forEach((n, idx) => {
      n.customName = n.customName || `مصب ${idx + 1}`;
      n.outfallColor = OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length];
      activeOutfallNodes.push(n);
    });
  }

  // If still none found, auto-detect: find perimeter leaf nodes (degree === 1) with lowest elevations
  if (activeOutfallNodes.length === 0) {
    const leafNodes = nodes.filter(n => n.degree === 1);
    if (leafNodes.length > 0) {
      leafNodes.sort((a, b) => a.z - b.z);
      // Pick the lowest leaf node as primary outfall
      const primary = leafNodes[0];
      primary.customName = 'مصب رئيسي تلقائي (الأوطى تضاريسياً)';
      primary.outfallColor = OUTFALL_PALETTE[0];
      activeOutfallNodes.push(primary);
    } else {
      nodes.sort((a, b) => a.z - b.z);
      const primary = nodes[0];
      primary.customName = 'أوطى نقطة بالشبكة (مصب)';
      primary.outfallColor = OUTFALL_PALETTE[0];
      activeOutfallNodes.push(primary);
    }
  }

  // 3. Multi-Source Dijkstra: Partition Network Graph into Optimal Outfall Catchments
  // Initialize all outfall roots
  const queue: GraphNode[] = [];
  activeOutfallNodes.forEach((outfall, idx) => {
    outfall.distToOutfall = 0;
    outfall.hopCount = 0;
    outfall.assignedOutfall = outfall;
    if (!outfall.outfallColor) {
      outfall.outfallColor = OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length];
    }
    queue.push(outfall);
  });

  const visited = new Set<string>();

  while (queue.length > 0) {
    queue.sort((a, b) => a.distToOutfall - b.distToOutfall);
    const curr = queue.shift()!;
    if (visited.has(curr.id)) continue;
    visited.add(curr.id);

    for (const edge of curr.connectedEdges) {
      const neighbor = edge.nodeA.id === curr.id ? edge.nodeB : edge.nodeA;
      
      // Effective hydraulic distance factor based on ground slope
      // Moving upstream against gravity is slightly penalized to encourage natural gravity catchment basins
      const deltaZ = neighbor.z - curr.z;
      const slopeFactor = deltaZ >= 0 ? 1.0 : 1.35; // Downward flow towards outfall is favored
      const effectiveDist = edge.length * slopeFactor;

      const newDist = curr.distToOutfall + effectiveDist;
      const newHops = curr.hopCount + 1;

      if (newDist < neighbor.distToOutfall) {
        neighbor.distToOutfall = newDist;
        neighbor.hopCount = newHops;
        neighbor.assignedOutfall = curr.assignedOutfall;
        neighbor.outfallColor = curr.assignedOutfall?.outfallColor || OUTFALL_PALETTE[0];
        queue.push(neighbor);
      }
    }
  }

  // Handle any disconnected components by connecting them to their closest reachable outfall
  nodes.forEach(n => {
    if (n.distToOutfall === Infinity) {
      // Find closest active outfall by geographic Euclidean distance
      let closestOutfall = activeOutfallNodes[0];
      let minGeoDist = Infinity;
      for (const outfall of activeOutfallNodes) {
        const d = Math.hypot(n.x - outfall.x, n.y - outfall.y);
        if (d < minGeoDist) {
          minGeoDist = d;
          closestOutfall = outfall;
        }
      }

      n.distToOutfall = 0;
      n.hopCount = 0;
      n.assignedOutfall = closestOutfall;
      n.outfallColor = closestOutfall.outfallColor;

      const subQueue: GraphNode[] = [n];
      while (subQueue.length > 0) {
        const curr = subQueue.shift()!;
        for (const edge of curr.connectedEdges) {
          const neighbor = edge.nodeA.id === curr.id ? edge.nodeB : edge.nodeA;
          const newDist = curr.distToOutfall + edge.length;
          if (newDist < neighbor.distToOutfall) {
            neighbor.distToOutfall = newDist;
            neighbor.hopCount = curr.hopCount + 1;
            neighbor.assignedOutfall = closestOutfall;
            neighbor.outfallColor = closestOutfall.outfallColor;
            subQueue.push(neighbor);
          }
        }
      }
    }
  });

  // 4. Orient Edges: Upstream -> Downstream (Towards the assigned Outfall)
  let reversedCount = 0;

  edges.forEach(edge => {
    const { nodeA, nodeB, pipe } = edge;
    let upstreamNode: GraphNode;
    let downstreamNode: GraphNode;

    if (nodeA.distToOutfall > nodeB.distToOutfall) {
      upstreamNode = nodeA;
      downstreamNode = nodeB;
    } else if (nodeB.distToOutfall > nodeA.distToOutfall) {
      upstreamNode = nodeB;
      downstreamNode = nodeA;
    } else {
      // Tie-breaker: flow from higher ground to lower ground
      if (nodeA.z >= nodeB.z) {
        upstreamNode = nodeA;
        downstreamNode = nodeB;
      } else {
        upstreamNode = nodeB;
        downstreamNode = nodeA;
      }
    }

    edge.directedFrom = upstreamNode;
    edge.directedTo = downstreamNode;
    edge.assignedOutfall = downstreamNode.assignedOutfall || upstreamNode.assignedOutfall || activeOutfallNodes[0];

    // Check if original geometry path needs reversal
    const path = pipe.path!;
    const startPt = path[0];
    const distStartToUpstream = Math.hypot(startPt.x - upstreamNode.x, startPt.y - upstreamNode.y);
    const distStartToDownstream = Math.hypot(startPt.x - downstreamNode.x, startPt.y - downstreamNode.y);

    if (distStartToDownstream < distStartToUpstream) {
      // Path was drawn from downstream to upstream -> reverse it!
      pipe.path = [...path].reverse();
      reversedCount++;
    }
  });

  // 5. Invert Level (IL), Depth & Slope Cascade per Outfall
  // Initialize assigned Invert Level at each outfall node
  activeOutfallNodes.forEach(outfall => {
    outfall.assignedIL = Number((outfall.z - outfallTerminalDepth).toFixed(2));
  });

  // Sort edges by downstream node's distToOutfall ascending (process from Outfalls upstream)
  edges.sort((a, b) => a.directedTo!.distToOutfall - b.directedTo!.distToOutfall);

  let liftStationCount = 0;
  let dropManholeCount = 0;
  let sumSlope = 0;
  let sumVelocity = 0;
  let totalLength = 0;

  // Track per-outfall metrics
  const outfallStatsMap = new Map<string, {
    totalPipes: number;
    totalLength: number;
    totalFlowLs: number;
    sumSlope: number;
    sumVel: number;
  }>();

  activeOutfallNodes.forEach(o => {
    outfallStatsMap.set(o.id, {
      totalPipes: 0,
      totalLength: 0,
      totalFlowLs: 0,
      sumSlope: 0,
      sumVel: 0
    });
  });

  const orientedPipes: GeoPoint[] = [];

  // Track furthest pipe and vertex for each outfall
  const outfallFurthestMap = new Map<string, {
    maxDirectDist: number;
    maxHydraulicRunDist: number;
    furthestPoint: { x: number; y: number; z?: number };
    pipe: GeoPoint;
    node: GraphNode;
  }>();

  edges.forEach(edge => {
    const pipe = edge.pipe;
    const U = edge.directedFrom!;
    const D = edge.directedTo!;
    const outfall = edge.assignedOutfall || D.assignedOutfall || activeOutfallNodes[0];
    const length = edge.length;

    // Track distance to outfall for furthest pipe detection
    const outfallCoord = { x: outfall.x, y: outfall.y };
    const distU = calculateDistance(outfallCoord, { x: U.x, y: U.y });
    const distD = calculateDistance(outfallCoord, { x: D.x, y: D.y });
    const netDistU = U.distToOutfall !== Infinity ? U.distToOutfall : distU;
    const netDistD = D.distToOutfall !== Infinity ? D.distToOutfall : distD;

    let maxEdgeDirectDist = Math.max(distU, distD);
    let maxEdgeNetDist = Math.max(netDistU, netDistD);
    let maxVertex = distU >= distD ? { x: U.x, y: U.y, z: U.z } : { x: D.x, y: D.y, z: D.z };

    if (pipe.path && pipe.path.length > 0) {
      for (const pt of pipe.path) {
        const d = calculateDistance(outfallCoord, pt);
        if (d > maxEdgeDirectDist) {
          maxEdgeDirectDist = d;
          maxVertex = { x: pt.x, y: pt.y, z: pt.z };
        }
      }
    }

    const currentFurthest = outfallFurthestMap.get(outfall.id);
    if (!currentFurthest || maxEdgeDirectDist > currentFurthest.maxDirectDist) {
      outfallFurthestMap.set(outfall.id, {
        maxDirectDist: maxEdgeDirectDist,
        maxHydraulicRunDist: Math.max(maxEdgeNetDist, maxEdgeDirectDist),
        furthestPoint: maxVertex,
        pipe,
        node: distU >= distD ? U : D
      });
    }

    const attrs = pipe.attributes || {};
    const rawDia = extractNumeric(attrs, ['diameter', 'diameter_mm', 'dia', 'القطر']);
    const diaMm = rawDia && rawDia > 0 ? (rawDia <= 5 ? rawDia * 1000 : rawDia) : defaultDiameterMm;
    const diaM = diaMm / 1000;

    const glStart = U.z;
    const glEnd = D.z;

    // Downstream Invert Level
    if (D.assignedIL === undefined) {
      D.assignedIL = glEnd - minCoverDepth;
    }
    const ilEnd = D.assignedIL;

    // Design Slope calculation
    const terrainSlope = ((glStart - glEnd) / length) * 100;
    let designSlope = Math.max(minSlopeDecimal * 100, Math.min(6.0, terrainSlope));
    if (terrainSlope < minSlopeDecimal * 100) {
      designSlope = minSlopeDecimal * 100;
    }

    let ilStart = Number((ilEnd + (designSlope / 100) * length).toFixed(2));
    let depthStart = Number((glStart - ilStart).toFixed(2));
    let depthEnd = Number((glEnd - ilEnd).toFixed(2));

    // Ensure minimum cover at Upstream
    if (depthStart < minCoverDepth) {
      depthStart = minCoverDepth;
      ilStart = Number((glStart - minCoverDepth).toFixed(2));
      designSlope = Number((((ilStart - ilEnd) / length) * 100).toFixed(3));
    }

    // Update Upstream Node assigned Invert Level
    if (U.assignedIL === undefined || ilStart < U.assignedIL) {
      U.assignedIL = ilStart;
    }

    // Hydraulic calculations (Manning)
    const slopeDec = Math.max(0.0001, designSlope / 100);
    const flowArea = Math.PI * Math.pow(diaM / 2, 2);
    const hydraulicRadius = diaM / 4;
    const velocity = (1 / manningN) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slopeDec);
    const flowCapacityLs = flowArea * velocity * 1000;
    const designQ75Ls = flowCapacityLs * 0.75;

    // Status classification
    let status: SewerHydraulicStatus = 'Normal Gravity';
    let statusReasonAr = `انحدار طبيعي سلس نحو مصب ${outfall.customName || outfall.id}`;
    let isLiftStation = false;
    let isDropManhole = false;
    let dropHeightM = 0;

    if (depthStart > maxTrenchDepth || depthEnd > maxTrenchDepth) {
      status = 'Lift Station Needed';
      isLiftStation = true;
      liftStationCount++;
      const maxD = Math.max(depthStart, depthEnd);
      statusReasonAr = `عمق حفر كبير (${maxD.toFixed(2)}م > ${maxTrenchDepth}م) -> يلزم محطة رفع (Lift Station)`;
    } else if (designSlope > 8.0 || (ilStart - ilEnd) > 0.60 && length < 20.0) {
      status = 'Drop Manhole';
      isDropManhole = true;
      dropManholeCount++;
      dropHeightM = Number(Math.max(0.60, ilStart - ilEnd).toFixed(2));
      statusReasonAr = `فارق منسوب وميل كبير (${designSlope.toFixed(1)}%) -> مقترح منهول هدار (Drop Manhole)`;
    }

    sumSlope += designSlope * length;
    sumVelocity += velocity * length;
    totalLength += length;

    // Update Outfall Stats
    const oStat = outfallStatsMap.get(outfall.id);
    if (oStat) {
      oStat.totalPipes += 1;
      oStat.totalLength += length;
      oStat.totalFlowLs += flowCapacityLs;
      oStat.sumSlope += designSlope * length;
      oStat.sumVel += velocity * length;
    }

    const isDirectToOutfall = D.id === outfall.id;

    // Update attributes with comprehensive bilingual keys
    const outfallDisplayName = outfall.customName || outfall.id;
    const enrichedAttrs: Record<string, any> = {
      ...attrs,
      'Flow_Direction': `Towards Outfall (${outfallDisplayName})`,
      'Direction': 'Forward',
      'اتجاه_الجريان': `نحو ${outfallDisplayName}`,
      'Outfall_ID': outfall.id,
      'Outfall_Name': outfallDisplayName,
      'مصب_الشبكة': outfallDisplayName,
      'حوض_التصريف': outfallDisplayName,
      'Catchment_Zone': outfall.id,
      'Catchment_Color': outfall.outfallColor || '#06b6d4',
      'GL_start': glStart.toFixed(2),
      'GL_end': glEnd.toFixed(2),
      'IL_start': ilStart.toFixed(2),
      'IL_end': ilEnd.toFixed(2),
      'Depth_start': depthStart.toFixed(2),
      'Depth_end': depthEnd.toFixed(2),
      'Slope': `${designSlope.toFixed(2)}%`,
      'Slope_%': designSlope.toFixed(2),
      'Slope_decimal': slopeDec.toFixed(4),
      'Diameter_mm': String(diaMm),
      'القطر': `${diaMm} مم`,
      'Velocity': `${velocity.toFixed(2)} m/s`,
      'Velocity_m_s': velocity.toFixed(2),
      'السرعة': `${velocity.toFixed(2)} م/ث`,
      'Flow_Capacity_Ls': flowCapacityLs.toFixed(1),
      'التصريف_لتر_ث': flowCapacityLs.toFixed(1),
      'Design_Q75_Ls': designQ75Ls.toFixed(1),
      'Status': status,
      'حالة_الانحدار': status === 'Normal Gravity' ? 'انحدار طبيعي' : (status === 'Drop Manhole' ? 'منهول هدار' : 'محطة رفع'),
      'Status_Reason': statusReasonAr,
      'Upstream_Node': U.id,
      'منهل_البداية': U.id,
      'Downstream_Node': D.id,
      'منهل_النهاية': D.id,
      'Distance_To_Outfall_m': edge.directedTo!.distToOutfall.toFixed(1),
      'Hop_Level': edge.directedTo!.hopCount,
      'Is_Outfall_Trunk': isDirectToOutfall ? 'YES' : 'NO'
    };

    // Update 3D Z elevations on pipe path
    const updatedPath = pipe.path!.map((pt, idx) => {
      const ratio = idx / Math.max(1, pipe.path!.length - 1);
      const z = Number((ilStart - (ilStart - ilEnd) * ratio).toFixed(2));
      return { ...pt, z };
    });

    const updatedPipe: GeoPoint = {
      ...pipe,
      x: updatedPath[0].x,
      y: updatedPath[0].y,
      z: ilStart,
      path: updatedPath,
      attributes: enrichedAttrs
    };

    orientedPipes.push(updatedPipe);
  });

  // Build Outfall summaries
  const outfallSummaries: OutfallSummaryInfo[] = activeOutfallNodes.map((outfall, idx) => {
    const oStat = outfallStatsMap.get(outfall.id) || { totalPipes: 0, totalLength: 0, totalFlowLs: 0, sumSlope: 0, sumVel: 0 };
    const furthest = outfallFurthestMap.get(outfall.id);
    
    let furthestPipeInfo: OutfallFurthestPipeInfo | undefined = undefined;
    let isDistanceExceeded = false;

    if (furthest && furthest.maxDirectDist > 0) {
      const maxDirectM = Number(furthest.maxDirectDist.toFixed(1));
      const maxNetM = Number(furthest.maxHydraulicRunDist.toFixed(1));
      const exceeds = maxDirectM > standardLimitMeters || maxNetM > standardLimitMeters;
      isDistanceExceeded = exceeds;

      let severity: 'safe' | 'caution' | 'critical' = 'safe';
      if (maxDirectM > CRITICAL_MAX_HYDRAULIC_OUTFLOW_DISTANCE_M || maxNetM > CRITICAL_MAX_HYDRAULIC_OUTFLOW_DISTANCE_M) {
        severity = 'critical';
      } else if (maxDirectM > CAUTION_HYDRAULIC_OUTFLOW_DISTANCE_M || maxNetM > CAUTION_HYDRAULIC_OUTFLOW_DISTANCE_M) {
        severity = 'caution';
      }

      const formattedDist = maxDirectM >= 1000 ? `${(maxDirectM / 1000).toFixed(2)} كم` : `${maxDirectM.toFixed(0)} م`;
      const formattedLimit = standardLimitMeters >= 1000 ? `${(standardLimitMeters / 1000).toFixed(1)} كم` : `${standardLimitMeters} م`;

      const warningMessageAr = exceeds
        ? `⚠️ تنبيه هيدروليكي: المسافة بين المصب وأبعد خط موجه إليه (${formattedDist}) تتجاوز الحد الأقصى المعتمد للشبكات الانحدارية (${formattedLimit}). هذا الامتداد قد يسبب زيادة أعماق الحفر عن 6م وتراكم الغازات. يُوصى بنقل المصب أو إضافة مصب وسيط أو محطة رفع.`
        : undefined;

      const warningMessageEn = exceeds
        ? `⚠️ Hydraulic Alert: Distance from outfall to furthest pipe (${formattedDist}) exceeds the gravity design standard (${formattedLimit}). Intermediate outfall or lift station recommended.`
        : undefined;

      furthestPipeInfo = {
        pipeId: String(furthest.pipe.id),
        pipeName: furthest.pipe.attributes?.['Name'] || furthest.pipe.attributes?.['اسم_الخط'] || (furthest.pipe as any).name || String(furthest.pipe.id),
        distanceMeters: maxDirectM,
        hydraulicRunLengthMeters: maxNetM,
        furthestPoint: furthest.furthestPoint,
        exceedsStandard: exceeds,
        standardLimitMeters: standardLimitMeters,
        severity,
        warningMessageAr,
        warningMessageEn
      };
    }

    return {
      id: outfall.id,
      name: outfall.customName || `مصب ${idx + 1} (${outfall.id})`,
      x: outfall.x,
      y: outfall.y,
      z: outfall.z,
      GL: outfall.z,
      IL: outfall.assignedIL ?? (outfall.z - outfallTerminalDepth),
      depth: outfallTerminalDepth,
      totalConnectedPipes: oStat.totalPipes,
      totalLengthMeters: Number(oStat.totalLength.toFixed(1)),
      totalIncomingFlowLs: Number(oStat.totalFlowLs.toFixed(1)),
      avgSlope: oStat.totalLength > 0 ? Number((oStat.sumSlope / oStat.totalLength).toFixed(2)) : 0,
      avgVelocity: oStat.totalLength > 0 ? Number((oStat.sumVel / oStat.totalLength).toFixed(2)) : 0,
      color: outfall.outfallColor || OUTFALL_PALETTE[idx % OUTFALL_PALETTE.length],
      furthestPipe: furthestPipeInfo,
      isDistanceExceeded
    };
  });

  const finalPoints = [...otherPoints, ...orientedPipes];

  return {
    orientedPoints: finalPoints,
    outfallNodes: outfallSummaries,
    outfallNode: outfallSummaries[0] || emptyOutfall,
    totalPipesOriented: orientedPipes.length,
    reversedCount,
    liftStationCount,
    dropManholeCount,
    avgSlope: totalLength > 0 ? Number((sumSlope / totalLength).toFixed(2)) : 0,
    avgVelocity: totalLength > 0 ? Number((sumVelocity / totalLength).toFixed(2)) : 0
  };
}

/**
 * Enriches a GeoPoint line feature with all calculated sewer hydraulic properties,
 * formatting them directly into attributes for persistent storage and database export.
 */
export function enrichGeoPointWithHydraulics(
  point: GeoPoint,
  calc: GravityPipeCalculations
): GeoPoint {
  const currentAttrs = { ...(point.attributes || {}) };

  const sewerAttributes: Record<string, string> = {
    GL_start: calc.GL_start.toFixed(2),
    GL_end: calc.GL_end.toFixed(2),
    IL_start: calc.IL_start.toFixed(2),
    IL_end: calc.IL_end.toFixed(2),
    Depth_start: calc.Depth_start.toFixed(2),
    Depth_end: calc.Depth_end.toFixed(2),
    Slope: `${calc.Slope.toFixed(2)}%`,
    Slope_percent: calc.Slope.toFixed(2),
    Slope_decimal: calc.SlopeDecimal.toFixed(4),
    Diameter_mm: String(calc.Diameter_mm),
    Manning_n: String(calc.Manning_n),
    Velocity: `${calc.Velocity.toFixed(3)} m/s`,
    Velocity_ms: calc.Velocity.toFixed(3),
    Flow_Capacity: `${calc.Flow_Capacity_Ls.toFixed(2)} L/s`,
    Flow_Capacity_Ls: calc.Flow_Capacity_Ls.toFixed(2),
    Flow_Capacity_M3s: calc.Flow_Capacity_M3s.toFixed(4),
    Status: calc.Status,
    Status_Reason: calc.StatusReasonAr,
    Velocity_Status: calc.VelocityStatusLabelAr,
    Is_Lift_Station_Required: calc.IsLiftStationRequired ? 'YES' : 'NO',
    Is_Drop_Manhole: calc.IsDropManhole ? 'YES' : 'NO',
    ...(calc.DropHeight_m ? { Drop_Height_m: calc.DropHeight_m.toFixed(2) } : {}),
    ...(calc.Outfall_ID ? { Outfall_ID: calc.Outfall_ID } : {}),
    Upstream_Node: calc.UpstreamNode,
    Downstream_Node: calc.DownstreamNode
  };

  const updatedAttrs = {
    ...currentAttrs,
    ...sewerAttributes
  };

  // Update path vertices with 3D elevations (IL)
  const path = point.path || [{ x: point.x, y: point.y, z: point.z }];
  const updatedPath = path.map((p, idx) => {
    if (idx === 0) return { ...p, z: calc.IL_start };
    if (idx === path.length - 1) return { ...p, z: calc.IL_end };
    const ratio = idx / Math.max(1, path.length - 1);
    const interpolatedIL = calc.IL_start - (calc.IL_start - calc.IL_end) * ratio;
    return { ...p, z: Number(interpolatedIL.toFixed(2)) };
  });

  return {
    ...point,
    length: calc.Length,
    z: calc.IL_start,
    path: updatedPath,
    attributes: updatedAttrs
  };
}


