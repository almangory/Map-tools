import { GeoPoint, PipeHydraulicData } from '../types';
import { calculatePathLengthMeters } from './hydraulicService';

export interface LiftStationSimulationConfig {
  stationId: string;
  stationName: string;
  stationCoords: { x: number; y: number; z?: number };
  wetWellCapacityM3: number; // default: 25 m³
  averageInflowLs: number; // L/s
  emergencyTankerCapacityM3: number; // default: 32 m³ per tanker
}

export interface OverflowManholeCandidate {
  id: string;
  coords: { x: number; y: number };
  glRim: number; // Ground Level rim elevation (m)
  ilInvert: number; // Invert level elevation (m)
  depthM: number;
  distanceFromStationM: number;
  upstreamPipeCount: number;
  timeToOverflowMinutes: number;
  overflowRiskLevel: 'extreme' | 'high' | 'moderate' | 'low';
  riskLabelAr: string;
  riskLabelEn: string;
  spillSequenceOrder: number;
}

export interface OverflowSimulationResult {
  station: LiftStationSimulationConfig;
  totalUpstreamPipes: number;
  totalUpstreamLengthM: number;
  totalPipeStorageCapacityM3: number;
  totalManholeStorageM3: number;
  totalNetworkStorageCapacityM3: number;
  
  // Time To Overflow (TTO)
  timeToWetWellFullMinutes: number;
  timeToFirstOverflowMinutes: number;
  timeToFirstOverflowFormatted: string;
  
  // Critical First Overflow Point
  criticalFirstSpillManhole: OverflowManholeCandidate | null;
  
  // Upstream manholes ordered by spill order
  vulnerableManholes: OverflowManholeCandidate[];
  
  // Hazard Buffer Zones for Map Visualization
  hazardZones: Array<{
    id: string;
    center: { x: number; y: number };
    radiusMeters: number;
    riskLevel: 'extreme' | 'high' | 'moderate';
    color: string;
    descriptionAr: string;
    descriptionEn: string;
  }>;
  
  // Emergency Mitigation Recommendations
  mitigation: {
    requiredTankersPerHour: number;
    recommendedBypassPumpCapacityLs: number;
    recommendedGeneratorKW: number;
    actionPlanAr: string[];
    actionPlanEn: string[];
  };
}

/**
 * Runs Lift Station Failure & Surcharging Overflow Simulation
 */
export function simulateLiftStationOverflow(
  points: GeoPoint[],
  hydraulicMap: Map<string | number, PipeHydraulicData> | null | undefined,
  config: Partial<LiftStationSimulationConfig> = {}
): OverflowSimulationResult | null {
  const linePoints = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  if (linePoints.length === 0) return null;

  // Find lift station coordinates: either supplied or lowest point/outfall
  let stationX = config.stationCoords?.x;
  let stationY = config.stationCoords?.y;
  let stationZ = config.stationCoords?.z;

  if (!stationX || !stationY) {
    // Find downstream terminus or lowest point
    let minZ = Infinity;
    let bestPt = { x: linePoints[0].path![0].x, y: linePoints[0].path![0].y, z: 100 };

    for (const line of linePoints) {
      for (const p of line.path!) {
        const z = p.z !== undefined ? p.z : 100;
        if (z < minZ) {
          minZ = z;
          bestPt = { x: p.x, y: p.y, z };
        }
      }
    }
    stationX = bestPt.x;
    stationY = bestPt.y;
    stationZ = bestPt.z;
  }

  const wetWellCapM3 = config.wetWellCapacityM3 || 25;
  const tankerCapM3 = config.emergencyTankerCapacityM3 || 32;

  // Compute upstream pipes and storage volumes
  let totalUpstreamLengthM = 0;
  let totalPipeStorageCapacityM3 = 0;
  let totalCalculatedInflowLs = 0;
  
  // Map of unique junction nodes
  const nodeMap = new Map<string, { x: number; y: number; gl: number; il: number; pipeCount: number; distToStation: number }>();

  for (const line of linePoints) {
    const hydro = hydraulicMap?.get(line.id);
    const len = line.length || calculatePathLengthMeters(line.path);
    const diaMm = hydro?.diameterMm || 200;
    const diaM = diaMm / 1000;
    
    // Pipe storage volume = Pi * (D/2)^2 * L
    const pipeVol = Math.PI * Math.pow(diaM / 2, 2) * len;
    totalPipeStorageCapacityM3 += pipeVol;
    totalUpstreamLengthM += len;

    // Incoming flow
    const flowCapacity = hydro?.maxCapacityLs || 15;
    totalCalculatedInflowLs += flowCapacity * 0.35; // 35% typical dry weather load

    // Nodes
    const pStart = line.path![0];
    const pEnd = line.path![line.path!.length - 1];

    const distStart = Math.hypot(pStart.x - stationX, pStart.y - stationY) * 111320;
    const distEnd = Math.hypot(pEnd.x - stationX, pEnd.y - stationY) * 111320;

    const glStart = hydro?.glStart ?? pStart.z ?? 100;
    const glEnd = hydro?.glEnd ?? pEnd.z ?? 100;
    const ilStart = hydro?.ilStart ?? (glStart - (hydro?.depthStart ?? 1.8));
    const ilEnd = hydro?.ilEnd ?? (glEnd - (hydro?.depthEnd ?? 2.0));

    const keyStart = `${pStart.x.toFixed(5)}_${pStart.y.toFixed(5)}`;
    const keyEnd = `${pEnd.x.toFixed(5)}_${pEnd.y.toFixed(5)}`;

    if (!nodeMap.has(keyStart)) {
      nodeMap.set(keyStart, { x: pStart.x, y: pStart.y, gl: glStart, il: ilStart, pipeCount: 1, distToStation: distStart });
    } else {
      nodeMap.get(keyStart)!.pipeCount++;
    }

    if (!nodeMap.has(keyEnd)) {
      nodeMap.set(keyEnd, { x: pEnd.x, y: pEnd.y, gl: glEnd, il: ilEnd, pipeCount: 1, distToStation: distEnd });
    } else {
      nodeMap.get(keyEnd)!.pipeCount++;
    }
  }

  // Manhole storage: approx 1.2m diameter manholes with avg depth 2.2m
  const manholeCount = nodeMap.size;
  const avgManholeStorageM3 = Math.PI * Math.pow(1.2 / 2, 2) * 2.2;
  const totalManholeStorageM3 = Number((manholeCount * avgManholeStorageM3).toFixed(2));
  const totalNetworkStorageCapacityM3 = Number((totalPipeStorageCapacityM3 + totalManholeStorageM3 + wetWellCapM3).toFixed(2));

  // Determine average inflow rate
  const inflowLs = config.averageInflowLs && config.averageInflowLs > 0
    ? config.averageInflowLs
    : Math.max(10, Number((totalCalculatedInflowLs / Math.max(1, linePoints.length * 0.4)).toFixed(1)));

  // Time To Fill Wet Well (minutes)
  const timeToWetWellMinutes = (wetWellCapM3 * 1000) / (inflowLs * 60);

  // Time To Fill Entire Network until first spill
  // Evaluate each node to find lowest rim GL that will overflow first
  const candidates: OverflowManholeCandidate[] = [];
  let minTimeToOverflow = Infinity;
  let criticalManhole: OverflowManholeCandidate | null = null;

  let nodeIdx = 1;
  for (const [key, node] of nodeMap.entries()) {
    const depth = Math.max(0.5, node.gl - node.il);
    
    // Upstream storage up to this node's elevation
    const fractionOfNetwork = Math.min(1.0, (node.distToStation + 50) / (totalUpstreamLengthM * 0.3 + 100));
    const effectiveAvailableStorageM3 = wetWellCapM3 + (totalPipeStorageCapacityM3 + totalManholeStorageM3) * fractionOfNetwork * 0.6;
    
    // Time in minutes = (Storage in liters) / (Inflow in L/min)
    const ttoMinutes = Number(((effectiveAvailableStorageM3 * 1000) / (inflowLs * 60)).toFixed(1));

    let riskLevel: OverflowManholeCandidate['overflowRiskLevel'] = 'low';
    let riskAr = 'مخاطر منخفضة (> ساعتين)';
    let riskEn = 'Low Risk (> 2 hrs)';

    if (ttoMinutes <= 30) {
      riskLevel = 'extreme';
      riskAr = 'خطر فيضان حرج فوري (< 30 دقيقة)';
      riskEn = 'Extreme Immediate Hazard (< 30 mins)';
    } else if (ttoMinutes <= 60) {
      riskLevel = 'high';
      riskAr = 'خطر فيضان مرتفع (30 - 60 دقيقة)';
      riskEn = 'High Risk (30 - 60 mins)';
    } else if (ttoMinutes <= 120) {
      riskLevel = 'moderate';
      riskAr = 'خطر فيضان متوسط (1 - 2 ساعة)';
      riskEn = 'Moderate Risk (1 - 2 hrs)';
    }

    const candidate: OverflowManholeCandidate = {
      id: `MH_${nodeIdx++}`,
      coords: { x: node.x, y: node.y },
      glRim: Number(node.gl.toFixed(2)),
      ilInvert: Number(node.il.toFixed(2)),
      depthM: Number(depth.toFixed(2)),
      distanceFromStationM: Number(node.distToStation.toFixed(1)),
      upstreamPipeCount: node.pipeCount,
      timeToOverflowMinutes: ttoMinutes,
      overflowRiskLevel: riskLevel,
      riskLabelAr: riskAr,
      riskLabelEn: riskEn,
      spillSequenceOrder: 0
    };

    candidates.push(candidate);

    if (ttoMinutes < minTimeToOverflow) {
      minTimeToOverflow = ttoMinutes;
      criticalManhole = candidate;
    }
  }

  // Sort candidates by Time to Overflow ascending
  candidates.sort((a, b) => a.timeToOverflowMinutes - b.timeToOverflowMinutes);
  candidates.forEach((c, idx) => {
    c.spillSequenceOrder = idx + 1;
  });

  if (candidates.length > 0) {
    criticalManhole = candidates[0];
  }

  // Hazard Buffer Zones
  const hazardZones: OverflowSimulationResult['hazardZones'] = [];
  
  // 1. Extreme Risk Buffer (< 30 mins)
  if (criticalManhole) {
    hazardZones.push({
      id: 'ZONE_EXTREME',
      center: criticalManhole.coords,
      radiusMeters: 120,
      riskLevel: 'extreme',
      color: '#dc2626', // Red
      descriptionAr: `نطاق الخطر الحرج الفوري: أول نقطة طفح متوقعة خلال (${criticalManhole.timeToOverflowMinutes} دقيقة) عند المنهل ${criticalManhole.id}.`,
      descriptionEn: `Extreme Hazard Zone: First projected spill point in (${criticalManhole.timeToOverflowMinutes} mins) at ${criticalManhole.id}.`
    });
  }

  // 2. High Risk Buffer (Station zone)
  hazardZones.push({
    id: 'ZONE_STATION',
    center: { x: stationX, y: stationY },
    radiusMeters: 200,
    riskLevel: 'high',
    color: '#ea580c', // Orange
    descriptionAr: `نطاق محطة الرفع: امتلاء حوض التجميع (Wet Well) خلال (${timeToWetWellMinutes.toFixed(1)} دقيقة) وبدء ارتداد التدفق بالشبكة.`,
    descriptionEn: `Lift Station Zone: Wet well capacity saturated in (${timeToWetWellMinutes.toFixed(1)} mins) triggering upstream backwater.`
  });

  // 3. Moderate Risk Buffer
  if (candidates.length > 1) {
    const secondCritical = candidates[1];
    hazardZones.push({
      id: 'ZONE_MODERATE',
      center: secondCritical.coords,
      radiusMeters: 150,
      riskLevel: 'moderate',
      color: '#eab308', // Yellow
      descriptionAr: `نطاق الخطر المتوسط: احتمالية حدوث طفح خلال (${secondCritical.timeToOverflowMinutes} دقيقة) عند المنهل ${secondCritical.id}.`,
      descriptionEn: `Moderate Hazard Zone: Potential spill in (${secondCritical.timeToOverflowMinutes} mins) at ${secondCritical.id}.`
    });
  }

  // Emergency Mitigation Calculations:
  // Required tankers per hour = (Inflow in m³/h) / Tanker Capacity
  const inflowM3PerHour = (inflowLs * 3.6);
  const requiredTankersPerHour = Math.max(1, Math.ceil(inflowM3PerHour / tankerCapM3));
  const recommendedBypassPumpLs = Number((inflowLs * 1.5).toFixed(1)); // 150% safety factor
  const recommendedGenKW = Math.ceil(recommendedBypassPumpLs * 1.2 + 25);

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins.toFixed(0)} دقيقة`;
    const hrs = Math.floor(mins / 60);
    const remMins = Math.round(mins % 60);
    return `${hrs} ساعة و ${remMins} دقيقة`;
  };

  return {
    station: {
      stationId: config.stationId || 'LIFT_STATION_01',
      stationName: config.stationName || 'محطة الرفع الرئيسية',
      stationCoords: { x: stationX, y: stationY, z: stationZ },
      wetWellCapacityM3: wetWellCapM3,
      averageInflowLs: inflowLs,
      emergencyTankerCapacityM3: tankerCapM3
    },
    totalUpstreamPipes: linePoints.length,
    totalUpstreamLengthM: Number(totalUpstreamLengthM.toFixed(1)),
    totalPipeStorageCapacityM3: Number(totalPipeStorageCapacityM3.toFixed(2)),
    totalManholeStorageM3,
    totalNetworkStorageCapacityM3,
    timeToWetWellFullMinutes: Number(timeToWetWellMinutes.toFixed(1)),
    timeToFirstOverflowMinutes: Number(minTimeToOverflow.toFixed(1)),
    timeToFirstOverflowFormatted: formatMinutes(minTimeToOverflow),
    criticalFirstSpillManhole: criticalManhole,
    vulnerableManholes: candidates.slice(0, 15),
    hazardZones,
    mitigation: {
      requiredTankersPerHour,
      recommendedBypassPumpCapacityLs: recommendedBypassPumpLs,
      recommendedGeneratorKW: recommendedGenKW,
      actionPlanAr: [
        `توجيه صهاريج الكسح فورا: يلزم تواجد ${requiredTankersPerHour} صهريج بسعة 32م³ كل ساعة لسحب التدفق القادم (${inflowM3PerHour.toFixed(1)} م³/ساعة).`,
        `تشغيل مضخة تحويل طوارئ (Bypass Pump) بسعة لا تقل عن ${recommendedBypassPumpLs} لتر/ثانية مع خط طرد مؤقت.`,
        `توفير مولد كهرباء احتياطي بقدرة ${recommendedGenKW} ك.ف.أ (kVA) لإعادة تشغيل المحطة فوراً قبل مرور ${minTimeToOverflow.toFixed(0)} دقيقة.`,
        `إغلاق أو تقليل ضخ محطات المياه المغذية للمنطقة للحد من التصرفات المنصرفة خلال فترة الانقطاع.`
      ],
      actionPlanEn: [
        `Deploy suction tankers: ${requiredTankersPerHour} tankers (32m³ each) required every hour to handle (${inflowM3PerHour.toFixed(1)} m³/hr inflow).`,
        `Activate emergency diesel bypass pump with at least ${recommendedBypassPumpLs} L/s capacity.`,
        `Deploy mobile power generator of ${recommendedGenKW} kVA to restore station power within ${minTimeToOverflow.toFixed(0)} minutes.`,
        `Throttling water network distribution upstream to curtail wastewater production during emergency.`
      ]
    }
  };
}
