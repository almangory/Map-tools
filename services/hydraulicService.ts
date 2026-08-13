import * as XLSX from 'xlsx';
import { GeoPoint, PipeHydraulicData, HydraulicNetworkSummary, AsphaltCalculationParams, AsphaltRestorationScope } from '../types';
import { NetworkFlowAnalysis } from './flowDirectionService';

export const DEFAULT_ASPHALT_PARAMS: AsphaltCalculationParams = {
  scope: 'trench',
  trenchWidth: 1.0,
  laneWidth: 3.5,
  fullStreetWidth: 15.0,
  asphaltThickness: 0.10 // 10 cm
};

export const DEFAULT_MANNING_N = 0.013; // VC, uPVC, HDPE standard gravity sewer roughness
export const DEFAULT_PIPE_DIAMETER_MM = 200; // mm
export const DEFAULT_MIN_SLOPE_DECIMAL = 0.005; // 0.5% standard minimum self-cleansing slope

/**
 * Calculates accurate geodesic / Haversine length in meters for a coordinate path
 */
export function calculatePathLengthMeters(path?: { x: number; y: number }[]): number {
  if (!path || path.length < 2) return 0;
  let totalMeters = 0;
  const R = 6371008.8; // Earth radius in meters
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const φ1 = (p1.y * Math.PI) / 180;
    const φ2 = (p2.y * Math.PI) / 180;
    const Δφ = ((p2.y - p1.y) * Math.PI) / 180;
    const Δλ = ((p2.x - p1.x) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    totalMeters += R * c;
  }
  return totalMeters;
}

/**
 * Helper to extract numeric attribute value with flexible naming
 */
function extractNumericAttribute(
  attrs: Record<string, any> | undefined,
  keys: string[]
): number | undefined {
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
function extractStringAttribute(
  attrs: Record<string, any> | undefined,
  keys: string[]
): string | undefined {
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

/**
 * Computes hydraulic parameters using Manning's equation and asphalt restoration quantities
 */
export function computePipeHydraulics(
  pt: GeoPoint,
  flowAnalysis: NetworkFlowAnalysis | null | undefined,
  manningN: number = DEFAULT_MANNING_N,
  asphaltParams: AsphaltCalculationParams = DEFAULT_ASPHALT_PARAMS
): PipeHydraulicData {
  const attrs: Record<string, any> = {
    ...(pt as any),
    ...(pt.attributes || {})
  };

  // 1. Length in meters
  let lineLength = pt.length || 0;
  if (!lineLength && pt.path && pt.path.length >= 2) {
    lineLength = calculatePathLengthMeters(pt.path);
  }
  if (lineLength <= 0) lineLength = 1.0; // fallback safe length

  // 2. Diameter in mm & meters
  const diameterKeys = [
    'diameter', 'innerdiameter', 'pipediameter', 'pipe_diameter',
    'dia', 'size', 'pipe_size', 'pipesize', 'قطر', 'القطر', 'قطر_الانبوب'
  ];
  let rawDiameter = extractNumericAttribute(attrs, diameterKeys);
  let diameterMm = DEFAULT_PIPE_DIAMETER_MM;
  if (rawDiameter !== undefined && rawDiameter > 0) {
    // If raw diameter is small (e.g. 0.2 or 0.3), assume meters and convert to mm
    if (rawDiameter <= 5.0) {
      diameterMm = rawDiameter * 1000;
    } else {
      diameterMm = rawDiameter;
    }
  }
  const diameterM = diameterMm / 1000; // D in meters

  // 3. Slope calculation
  const slopeKeys = ['slope', 'pipeslope', 'pipe_slope', 'gradient', 'الميل', 'ميل_الانبوب'];
  let rawSlope = extractNumericAttribute(attrs, slopeKeys);
  let slopeDecimal = DEFAULT_MIN_SLOPE_DECIMAL;
  let slopeSource: 'attribute' | 'elevation_diff' | 'dem_diff' | 'default' = 'default';

  const seg = flowAnalysis?.segments?.get(String(pt.id)) || 
              flowAnalysis?.segments?.get(pt.id as any) ||
              (typeof pt.id === 'number' ? flowAnalysis?.segments?.get(Number(pt.id)) : undefined);

  if (rawSlope !== undefined && rawSlope > 0) {
    // If slope > 0.5, assume it was provided as percentage (%)
    if (rawSlope > 0.2) {
      slopeDecimal = rawSlope / 100;
    } else {
      slopeDecimal = rawSlope;
    }
    slopeSource = 'attribute';
  } else if (seg && seg.zStart !== undefined && seg.zEnd !== undefined && lineLength > 0) {
    const diffZ = Math.abs(seg.zStart - seg.zEnd);
    if (diffZ > 0.0001) {
      slopeDecimal = Math.max(0.0005, diffZ / lineLength);
      slopeSource = seg.priority === 1 ? 'elevation_diff' : 'dem_diff';
    }
  } else if (pt.path && pt.path.length >= 2) {
    const z1 = pt.path[0].z;
    const z2 = pt.path[pt.path.length - 1].z;
    if (z1 !== undefined && z2 !== undefined && Math.abs(z1 - z2) > 0.0001 && lineLength > 0) {
      slopeDecimal = Math.max(0.0005, Math.abs(z1 - z2) / lineLength);
      slopeSource = 'elevation_diff';
    }
  }

  // Safety clamps for slope
  if (slopeDecimal <= 0 || isNaN(slopeDecimal)) {
    slopeDecimal = DEFAULT_MIN_SLOPE_DECIMAL;
    slopeSource = 'default';
  }
  const slopePercent = slopeDecimal * 100;

  // 4. Manning's Equation:
  // Area A = π * (D / 2)²
  const flowArea = Math.PI * Math.pow(diameterM / 2, 2); // m²
  // Hydraulic Radius R = D / 4
  const hydraulicRadius = diameterM / 4; // m

  // Velocity V = (1 / n) * R^(2/3) * S^(1/2) (m/s)
  const safeN = manningN > 0 ? manningN : DEFAULT_MANNING_N;
  const velocity = (1 / safeN) * Math.pow(hydraulicRadius, 2 / 3) * Math.sqrt(slopeDecimal);

  // Full Capacity Q_full = A * V (m³/s) -> Liters/Second (L/s)
  const maxCapacityLs = flowArea * velocity * 1000;

  // Design Capacity at 75% depth (Q_75%):
  // For standard circular pipe at 0.75 D fill depth:
  // θ = 2 * acos(1 - 2 * 0.75) = 4π/3 ≈ 4.18879
  // A_75 = (D²/8)*(θ - sin(θ)) ≈ 0.8045 * A_full
  // P_75 = (θ * D) / 2 ≈ 2.0944 * D
  // R_75 = A_75 / P_75 ≈ 0.3017 * D ≈ 1.2068 * (D/4)
  // V_75 = (1/n) * R_75^(2/3) * S^(1/2) = (1.2068)^(2/3) * V_full ≈ 1.1333 * V_full
  // Q_75 = A_75 * V_75 = 0.8045 * 1.1333 * Q_full ≈ 0.9118 * Q_full
  const designCapacity75Ls = maxCapacityLs * 0.9118;

  // 5. Velocity Classification
  // Low: V < 0.6 m/s -> Orange/Yellow (#FF9800), 'رسوبيات' (Sedimentation), 2.5s duration
  // Optimal: 0.6 <= V <= 3.0 m/s -> Bright Green (#00E676), 'سلس ومطابق' (Optimal), 1.2s duration
  // High: V > 3.0 m/s -> Red (#FF1744), 'نحر وتآكل' (Scour), 0.5s duration
  let velocityStatus: 'low' | 'optimal' | 'high' = 'optimal';
  let statusBadgeAr = 'سلس ومطابق';
  let statusBadgeEn = 'Optimal Flow';
  let velocityColor = '#00E676';
  let animationDurationSec = 1.2;
  let animationClass: 'flow-anim-low' | 'flow-anim-optimal' | 'flow-anim-high' = 'flow-anim-optimal';

  if (velocity < 0.6) {
    velocityStatus = 'low';
    statusBadgeAr = 'رسوبيات (سرعة منخفضة)';
    statusBadgeEn = 'Sedimentation Risk';
    velocityColor = '#FF9800';
    animationDurationSec = 2.5;
    animationClass = 'flow-anim-low';
  } else if (velocity > 3.0) {
    velocityStatus = 'high';
    statusBadgeAr = 'نحر وتآكل (سرعة عالية)';
    statusBadgeEn = 'High Scour Risk';
    velocityColor = '#FF1744';
    animationDurationSec = 0.5;
    animationClass = 'flow-anim-high';
  }

  // 6. Upstream / Downstream & Flow Direction Information
  const upMhKeys = ['upstreammanholeno', 'upstreammanhole', 'upstreammh', 'from_mh', 'frommanhole', 'startmanhole', 'منهل_البداية'];
  const downMhKeys = ['downstreammanholeno', 'downstreammanhole', 'downstreammh', 'to_mh', 'tomanhole', 'endmanhole', 'منهل_النهاية'];
  
  let upstreamNode = extractStringAttribute(attrs, upMhKeys) || 'Start-MH';
  let downstreamNode = extractStringAttribute(attrs, downMhKeys) || 'End-MH';

  let isReversed = seg?.isReversed || false;
  if (isReversed) {
    // Swap upstream & downstream if flow was determined in reverse
    const tmp = upstreamNode;
    upstreamNode = downstreamNode;
    downstreamNode = tmp;
  }

  const flowDirectionTextAr = `${upstreamNode} ➔ ${downstreamNode}`;
  const flowDirectionTextEn = `${upstreamNode} -> ${downstreamNode}`;

  const priority = seg?.priority || 1;
  const priorityLabelAr = seg?.priorityLabelAr || 'أولوية 1: مناسيب الأنبوب';
  const priorityLabelEn = seg?.priorityLabelEn || 'Priority 1: Pipe Elevation';

  // 7. Asphalt Restoration Quantities (Riyadh Municipality Standards)
  let restorationWidth = asphaltParams.trenchWidth;
  if (asphaltParams.scope === 'lane') {
    restorationWidth = asphaltParams.laneWidth;
  } else if (asphaltParams.scope === 'full_street') {
    const streetWidthKeys = ['streetwidth', 'street_width', 'roadwidth', 'road_width', 'width', 'عرض_الشارع', 'عرض'];
    const attrWidth = extractNumericAttribute(attrs, streetWidthKeys);
    if (attrWidth !== undefined && attrWidth > 0) {
      restorationWidth = attrWidth;
    } else {
      restorationWidth = asphaltParams.fullStreetWidth;
    }
  }

  const asphaltAreaM2 = lineLength * restorationWidth;
  const asphaltVolumeM3 = asphaltAreaM2 * asphaltParams.asphaltThickness;

  return {
    id: pt.id,
    length: lineLength,
    diameterMm,
    diameterM,
    slopeDecimal,
    slopePercent,
    slopeSource,
    manningN: safeN,
    flowArea,
    hydraulicRadius,
    velocity,
    maxCapacityLs,
    designCapacity75Ls,
    velocityStatus,
    statusBadgeAr,
    statusBadgeEn,
    velocityColor,
    animationDurationSec,
    animationClass,
    flowDirectionTextAr,
    flowDirectionTextEn,
    upstreamNode,
    downstreamNode,
    startElevation: seg?.zStart,
    endElevation: seg?.zEnd,
    priority,
    priorityLabelAr,
    priorityLabelEn,
    isReversed,
    restorationWidth,
    asphaltAreaM2,
    asphaltVolumeM3
  };
}

/**
 * Computes network-wide hydraulic summary and returns map of individual pipe results
 */
export function analyzeNetworkHydraulics(
  points: GeoPoint[],
  flowAnalysis: NetworkFlowAnalysis | null | undefined,
  manningN: number = DEFAULT_MANNING_N,
  asphaltParams: AsphaltCalculationParams = DEFAULT_ASPHALT_PARAMS
): HydraulicNetworkSummary {
  const lineFeatures = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  
  const pipes: PipeHydraulicData[] = [];
  const pipesMap = new Map<string | number, PipeHydraulicData>();

  let totalLengthM = 0;
  let sumVelocity = 0;
  let sumDiameter = 0;
  let sumSlope = 0;
  let totalCapacityLs = 0;

  let lowVelocityCount = 0;
  let lowVelocityLengthM = 0;
  let optimalVelocityCount = 0;
  let optimalVelocityLengthM = 0;
  let highVelocityCount = 0;
  let highVelocityLengthM = 0;

  let totalAsphaltAreaM2 = 0;
  let totalAsphaltVolumeM3 = 0;

  lineFeatures.forEach(pt => {
    const data = computePipeHydraulics(pt, flowAnalysis, manningN, asphaltParams);
    pipes.push(data);
    pipesMap.set(data.id, data);
    pipesMap.set(String(data.id), data);

    totalLengthM += data.length;
    sumVelocity += data.velocity * data.length;
    sumDiameter += data.diameterMm * data.length;
    sumSlope += data.slopePercent * data.length;
    totalCapacityLs += data.maxCapacityLs;

    if (data.velocityStatus === 'low') {
      lowVelocityCount++;
      lowVelocityLengthM += data.length;
    } else if (data.velocityStatus === 'optimal') {
      optimalVelocityCount++;
      optimalVelocityLengthM += data.length;
    } else {
      highVelocityCount++;
      highVelocityLengthM += data.length;
    }

    totalAsphaltAreaM2 += data.asphaltAreaM2;
    totalAsphaltVolumeM3 += data.asphaltVolumeM3;
  });

  const totalPipes = lineFeatures.length;
  const avgVelocity = totalLengthM > 0 ? sumVelocity / totalLengthM : 0;
  const avgDiameterMm = totalLengthM > 0 ? sumDiameter / totalLengthM : DEFAULT_PIPE_DIAMETER_MM;
  const avgSlopePercent = totalLengthM > 0 ? sumSlope / totalLengthM : 0.5;

  return {
    totalPipes,
    totalLengthM,
    avgVelocity,
    averageVelocity: avgVelocity,
    avgDiameterMm,
    avgSlopePercent,
    totalCapacityLs,
    totalFullCapacityLs: totalCapacityLs,
    lowVelocityCount,
    lowVelocityLengthM,
    optimalVelocityCount,
    optimalVelocityLengthM,
    highVelocityCount,
    highVelocityLengthM,
    statsByVelocity: {
      low: lowVelocityCount,
      optimal: optimalVelocityCount,
      high: highVelocityCount
    },
    totalAsphaltAreaM2,
    totalAsphaltVolumeM3,
    pipes,
    pipesMap
  };
}

/**
 * Generates and downloads a comprehensive Excel file (.xlsx) using SheetJS
 */
export function exportHydraulicFlowExcel(
  summary: HydraulicNetworkSummary,
  filename: string = 'Hydraulic_Flow_Report',
  lang: 'ar' | 'en' = 'ar'
): void {
  const isAr = lang === 'ar';

  // Sheet 1: Detailed Pipe Hydraulic Records
  const pipeRows = summary.pipes.map((pipe, index) => {
    if (isAr) {
      return {
        'م': index + 1,
        'معرف الخط': pipe.id,
        'المنهل المصدري (Upstream)': pipe.upstreamNode,
        'المنهل المصب (Downstream)': pipe.downstreamNode,
        'القطر (ملم)': pipe.diameterMm,
        'الميل (%)': Number(pipe.slopePercent.toFixed(3)),
        'معامل مانينغ (n)': pipe.manningN,
        'السرعة V (م/ث)': Number(pipe.velocity.toFixed(3)),
        'التصريف الكلي Q_max (لتر/ث)': Number(pipe.maxCapacityLs.toFixed(2)),
        'التصريف التصميمي Q_75% (لتر/ث)': Number(pipe.designCapacity75Ls.toFixed(2)),
        'اتجاه التدفق': pipe.flowDirectionTextAr,
        'الحالة الهيدروليكية': pipe.statusBadgeAr,
        'أولوية التحديد': pipe.priorityLabelAr,
        'طول الخط (م)': Number(pipe.length.toFixed(2)),
        'عرض إعادة السفلتة (م)': pipe.restorationWidth,
        'مساحة الأسفلت (م²)': Number(pipe.asphaltAreaM2.toFixed(2)),
        'حجم الأسفلت (م³)': Number(pipe.asphaltVolumeM3.toFixed(2))
      };
    } else {
      return {
        'No': index + 1,
        'Line ID': pipe.id,
        'Upstream MH': pipe.upstreamNode,
        'Downstream MH': pipe.downstreamNode,
        'Diameter (mm)': pipe.diameterMm,
        'Slope (%)': Number(pipe.slopePercent.toFixed(3)),
        'Manning n': pipe.manningN,
        'Velocity V (m/s)': Number(pipe.velocity.toFixed(3)),
        'Max Capacity Q_full (L/s)': Number(pipe.maxCapacityLs.toFixed(2)),
        'Design Capacity Q_75% (L/s)': Number(pipe.designCapacity75Ls.toFixed(2)),
        'Flow Direction': pipe.flowDirectionTextEn,
        'Hydraulic Status': pipe.statusBadgeEn,
        'Priority': pipe.priorityLabelEn,
        'Length (m)': Number(pipe.length.toFixed(2)),
        'Restoration Width (m)': pipe.restorationWidth,
        'Asphalt Area (m²)': Number(pipe.asphaltAreaM2.toFixed(2)),
        'Asphalt Volume (m³)': Number(pipe.asphaltVolumeM3.toFixed(2))
      };
    }
  });

  // Sheet 2: Executive Network Summary & Riyadh Asphalt Quantities
  const summaryRows = isAr ? [
    { 'البند / الخاصية': 'إجمالي عدد خطوط الشبكة', 'القيمة': summary.totalPipes, 'الوحدة': 'خط / أنبوب' },
    { 'البند / الخاصية': 'إجمالي أطوال الشبكة', 'القيمة': Number(summary.totalLengthM.toFixed(2)), 'الوحدة': 'متر طولي' },
    { 'البند / الخاصية': 'إجمالي أطوال الشبكة بالكيلومتر', 'القيمة': Number((summary.totalLengthM / 1000).toFixed(3)), 'الوحدة': 'كم' },
    { 'البند / الخاصية': 'متوسط سرعة الجريان (Manning Velocity)', 'القيمة': Number(summary.avgVelocity.toFixed(2)), 'الوحدة': 'متر / ثانية' },
    { 'البند / الخاصية': 'متوسط أقطار الأنابيب', 'القيمة': Math.round(summary.avgDiameterMm), 'الوحدة': 'ملم' },
    { 'البند / الخاصية': 'متوسط ميل خطوط الشبكة', 'القيمة': Number(summary.avgSlopePercent.toFixed(3)), 'الوحدة': '%' },
    { 'البند / الخاصية': 'إجمالي القدرة الاستيعابية للشبكة (Q_Total)', 'القيمة': Number(summary.totalCapacityLs.toFixed(2)), 'الوحدة': 'لتر / ثانية' },
    { 'البند / الخاصية': 'الأنابيب المطابقة وذات الجريان السلس (0.6 - 3.0 م/ث)', 'القيمة': `${summary.optimalVelocityCount} خط (${((summary.optimalVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'مطابق للاشتراطات' },
    { 'البند / الخاصية': 'الأنابيب المعرضة للرسوبيات (< 0.6 م/ث)', 'القيمة': `${summary.lowVelocityCount} خط (${((summary.lowVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'تتطلب مراجعة الميل أو الغسيل' },
    { 'البند / الخاصية': 'الأنابيب المعرضة للنحر والتآكل (> 3.0 م/ث)', 'القيمة': `${summary.highVelocityCount} خط (${((summary.highVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'تتطلب كواسر سرعة أو تهدئة' },
    { 'البند / الخاصية': 'إجمالي مسطحات إعادة السفلتة (معايير الأمانة)', 'القيمة': Number(summary.totalAsphaltAreaM2.toFixed(2)), 'الوحدة': 'متر مربع (م²)' },
    { 'البند / الخاصية': 'إجمالي كميات خرسانة الأسفلت المطلوبة', 'القيمة': Number(summary.totalAsphaltVolumeM3.toFixed(2)), 'الوحدة': 'متر مكعب (م³)' },
    { 'البند / الخاصية': 'معادلة الحساب الهيدروليكي', 'القيمة': 'معادلة مانينغ للجريان الحر بالجاذبية (Manning Gravity Equation)', 'الوحدة': 'V = (1/n)*R^(2/3)*S^(1/2)' },
    { 'البند / الخاصية': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-SA'), 'الوحدة': 'توقيت الرياض' }
  ] : [
    { 'Property / Metric': 'Total Network Pipe Segments', 'Value': summary.totalPipes, 'Unit': 'pipes' },
    { 'Property / Metric': 'Total Network Length', 'Value': Number(summary.totalLengthM.toFixed(2)), 'Unit': 'meters' },
    { 'Property / Metric': 'Total Network Length (km)', 'Value': Number((summary.totalLengthM / 1000).toFixed(3)), 'Unit': 'km' },
    { 'Property / Metric': 'Average Flow Velocity (Manning)', 'Value': Number(summary.avgVelocity.toFixed(2)), 'Unit': 'm/s' },
    { 'Property / Metric': 'Average Pipe Diameter', 'Value': Math.round(summary.avgDiameterMm), 'Unit': 'mm' },
    { 'Property / Metric': 'Average Pipe Slope', 'Value': Number(summary.avgSlopePercent.toFixed(3)), 'Unit': '%' },
    { 'Property / Metric': 'Total Network Capacity (Q_Total)', 'Value': Number(summary.totalCapacityLs.toFixed(2)), 'Unit': 'L/s' },
    { 'Property / Metric': 'Optimal Velocity Pipes (0.6 - 3.0 m/s)', 'Value': `${summary.optimalVelocityCount} (${((summary.optimalVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Compliant' },
    { 'Property / Metric': 'Low Velocity / Sedimentation Risk (< 0.6 m/s)', 'Value': `${summary.lowVelocityCount} (${((summary.lowVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Warning' },
    { 'Property / Metric': 'High Velocity / Scour Risk (> 3.0 m/s)', 'Value': `${summary.highVelocityCount} (${((summary.highVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Warning' },
    { 'Property / Metric': 'Total Asphalt Restoration Area', 'Value': Number(summary.totalAsphaltAreaM2.toFixed(2)), 'Unit': 'm²' },
    { 'Property / Metric': 'Total Asphalt Volume', 'Value': Number(summary.totalAsphaltVolumeM3.toFixed(2)), 'Unit': 'm³' },
    { 'Property / Metric': 'Hydraulic Model', 'Value': "Manning's Equation for Gravity Flow", 'Unit': 'V = (1/n)*R^(2/3)*S^(1/2)' },
    { 'Property / Metric': 'Export Timestamp', 'Value': new Date().toISOString(), 'Unit': 'UTC' }
  ];

  const wb = XLSX.utils.book_new();

  // Create Pipes Sheet
  const wsPipes = XLSX.utils.json_to_sheet(pipeRows);
  // Auto-width columns
  const pipeCols = Object.keys(pipeRows[0] || {}).map(k => ({
    wch: Math.max(k.length * 2, 14)
  }));
  wsPipes['!cols'] = pipeCols;

  // Create Summary Sheet
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 25 }, { wch: 30 }];

  const sheet1Name = isAr ? 'تقرير التدفق والسرعات' : 'Hydraulic Flow & Capacity';
  const sheet2Name = isAr ? 'ملخص الشبكة والأسفلت' : 'Executive Network Summary';

  XLSX.utils.book_append_sheet(wb, wsPipes, sheet1Name);
  XLSX.utils.book_append_sheet(wb, wsSummary, sheet2Name);

  const cleanFileName = (filename || 'Hydraulic_Report').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  XLSX.writeFile(wb, `${cleanFileName}_Flow_Quantities.xlsx`);
}
