import * as XLSX from 'xlsx';
import { GeoPoint, PipeHydraulicData, HydraulicNetworkSummary, AsphaltCalculationParams, AsphaltRestorationScope } from '../types';
import { NetworkFlowAnalysis } from './flowDirectionService';
import { computeGravityPipeSegment, DEFAULT_SEWER_MANNING_N, DEFAULT_MIN_COVER_DEPTH, DEFAULT_MAX_TRENCH_DEPTH } from './gravitySewerEngine';

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
 * Computes hydraulic parameters using Manning's equation, gravity sewer levels, and asphalt restoration quantities
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

  const seg = flowAnalysis?.segments?.get(String(pt.id)) || 
              flowAnalysis?.segments?.get(pt.id as any) ||
              (typeof pt.id === 'number' ? flowAnalysis?.segments?.get(Number(pt.id)) : undefined);

  // Compute specialized Gravity Sewer Hydraulics
  const sewerCalc = computeGravityPipeSegment(pt, {
    manningN: manningN > 0 ? manningN : DEFAULT_MANNING_N,
    knownGlStart: seg?.zStart,
    knownGlEnd: seg?.zEnd
  });

  const lineLength = sewerCalc.Length;
  const diameterMm = sewerCalc.Diameter_mm;
  const diameterM = sewerCalc.Diameter_m;
  const slopeDecimal = sewerCalc.SlopeDecimal;
  const slopePercent = sewerCalc.Slope;
  const safeN = sewerCalc.Manning_n;

  let slopeSource: 'attribute' | 'elevation_diff' | 'dem_diff' | 'default' = 'default';
  if (extractNumericAttribute(attrs, ['slope', 'pipeslope', 'pipe_slope', 'gradient', 'الميل'])) {
    slopeSource = 'attribute';
  } else if (seg && seg.zStart !== undefined && seg.zEnd !== undefined) {
    slopeSource = seg.priority === 1 ? 'elevation_diff' : 'dem_diff';
  } else if (pt.path && pt.path.length >= 2 && pt.path[0].z !== undefined && pt.path[pt.path.length - 1].z !== undefined) {
    slopeSource = 'elevation_diff';
  }

  const flowArea = Math.PI * Math.pow(diameterM / 2, 2); // m²
  const hydraulicRadius = diameterM / 4; // m
  const velocity = sewerCalc.Velocity;
  const maxCapacityLs = sewerCalc.Flow_Capacity_Ls;
  const designCapacity75Ls = maxCapacityLs * 0.9118;

  // Velocity Classification
  let velocityStatus: 'low' | 'optimal' | 'high' = sewerCalc.VelocityStatus;
  let statusBadgeAr = sewerCalc.VelocityStatusLabelAr;
  let statusBadgeEn = sewerCalc.VelocityStatusLabelEn;
  let velocityColor = '#00E676';
  let animationDurationSec = 1.2;
  let animationClass: 'flow-anim-low' | 'flow-anim-optimal' | 'flow-anim-high' = 'flow-anim-optimal';

  if (velocityStatus === 'low') {
    velocityColor = '#FF9800';
    animationDurationSec = 2.5;
    animationClass = 'flow-anim-low';
  } else if (velocityStatus === 'high') {
    velocityColor = '#FF1744';
    animationDurationSec = 0.5;
    animationClass = 'flow-anim-high';
  }

  // Upstream / Downstream & Flow Direction
  const upMhKeys = ['upstreammanholeno', 'upstreammanhole', 'upstreammh', 'from_mh', 'frommanhole', 'startmanhole', 'منهل_البداية'];
  const downMhKeys = ['downstreammanholeno', 'downstreammanhole', 'downstreammh', 'to_mh', 'tomanhole', 'endmanhole', 'منهل_النهاية'];
  
  let upstreamNode = extractStringAttribute(attrs, upMhKeys) || sewerCalc.UpstreamNode;
  let downstreamNode = extractStringAttribute(attrs, downMhKeys) || sewerCalc.DownstreamNode;

  let isReversed = seg?.isReversed || sewerCalc.IsReversed || false;
  if (isReversed) {
    const tmp = upstreamNode;
    upstreamNode = downstreamNode;
    downstreamNode = tmp;
  }

  const flowDirectionTextAr = `${upstreamNode} ➔ ${downstreamNode}`;
  const flowDirectionTextEn = `${upstreamNode} -> ${downstreamNode}`;

  const priority = seg?.priority || 1;
  const priorityLabelAr = seg?.priorityLabelAr || 'أولوية 1: مناسيب الأنبوب';
  const priorityLabelEn = seg?.priorityLabelEn || 'Priority 1: Pipe Elevation';

  // Asphalt Restoration Quantities
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
    
    // Sewer Hydraulic Fields
    glStart: sewerCalc.GL_start,
    glEnd: sewerCalc.GL_end,
    ilStart: sewerCalc.IL_start,
    ilEnd: sewerCalc.IL_end,
    depthStart: sewerCalc.Depth_start,
    depthEnd: sewerCalc.Depth_end,
    sewerStatus: sewerCalc.Status,
    sewerStatusReasonAr: sewerCalc.StatusReasonAr,
    sewerStatusReasonEn: sewerCalc.StatusReasonEn,
    isLiftStationRequired: sewerCalc.IsLiftStationRequired,
    isDropManhole: sewerCalc.IsDropManhole,
    dropHeightM: sewerCalc.DropHeight_m,
    outfallId: sewerCalc.Outfall_ID,
    isOutfall: sewerCalc.IsOutfall,

    flowDirectionTextAr,
    flowDirectionTextEn,
    upstreamNode,
    downstreamNode,
    startElevation: seg?.zStart ?? sewerCalc.GL_start,
    endElevation: seg?.zEnd ?? sewerCalc.GL_end,
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

  let normalGravityCount = 0;
  let dropManholeCount = 0;
  let liftStationCount = 0;

  let totalAsphaltAreaM2 = 0;
  let totalAsphaltVolumeM3 = 0;

  const liftStationNodes: Array<{
    id: string;
    x: number;
    y: number;
    reasonAr: string;
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

  let lowestIL = Infinity;
  let primaryOutfallId: string | undefined = undefined;
  let primaryOutfallIL: number | undefined = undefined;

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

    if (data.sewerStatus === 'Normal Gravity') normalGravityCount++;
    else if (data.sewerStatus === 'Drop Manhole') dropManholeCount++;
    else if (data.sewerStatus === 'Lift Station Needed') liftStationCount++;

    const path = pt.path!;
    const endCoord = data.isReversed ? path[0] : path[path.length - 1];

    if (data.isLiftStationRequired) {
      liftStationNodes.push({
        id: `LS-${data.id}`,
        x: endCoord.x,
        y: endCoord.y,
        reasonAr: data.sewerStatusReasonAr || 'عمق حفر يتجاوز 5م / انحدار عكسي',
        requiredDepth: Math.max(data.depthStart || 1.2, data.depthEnd || 5.0),
        pipeId: data.id
      });
    }

    if (data.isDropManhole) {
      dropManholeNodes.push({
        id: `DROP-${data.id}`,
        x: endCoord.x,
        y: endCoord.y,
        dropMeters: data.dropHeightM || 0.6,
        pipeId: data.id
      });
    }

    if (data.ilEnd !== undefined && data.ilEnd < lowestIL) {
      lowestIL = data.ilEnd;
      primaryOutfallId = `OUTFALL-${data.id}`;
      primaryOutfallIL = data.ilEnd;
    }

    totalAsphaltAreaM2 += data.asphaltAreaM2;
    totalAsphaltVolumeM3 += data.asphaltVolumeM3;
  });

  // Mark outfall flag on lowest pipe
  if (primaryOutfallId) {
    const outfallPipeId = primaryOutfallId.replace('OUTFALL-', '');
    const outfallPipe = pipesMap.get(outfallPipeId);
    if (outfallPipe) {
      outfallPipe.isOutfall = true;
      outfallPipe.outfallId = primaryOutfallId;
    }
  }

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
    normalGravityCount,
    dropManholeCount,
    liftStationCount,
    primaryOutfallId,
    primaryOutfallIL,
    liftStationNodes,
    dropManholeNodes,
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

  // Sheet 1: Detailed Pipe Hydraulic & Gravity Sewer Records
  const pipeRows = summary.pipes.map((pipe, index) => {
    if (isAr) {
      return {
        'م': index + 1,
        'معرف الخط': pipe.id,
        'المنهل المصدري (Upstream)': pipe.upstreamNode,
        'المنهل المصب (Downstream)': pipe.downstreamNode,
        'منسوب الأرض بداية GL (م)': pipe.glStart !== undefined ? Number(pipe.glStart.toFixed(2)) : '',
        'منسوب الأرض نهاية GL (م)': pipe.glEnd !== undefined ? Number(pipe.glEnd.toFixed(2)) : '',
        'منسوب القاع بداية IL (م)': pipe.ilStart !== undefined ? Number(pipe.ilStart.toFixed(2)) : '',
        'منسوب القاع نهاية IL (م)': pipe.ilEnd !== undefined ? Number(pipe.ilEnd.toFixed(2)) : '',
        'عمق الحفر بداية (م)': pipe.depthStart !== undefined ? Number(pipe.depthStart.toFixed(2)) : '',
        'عمق الحفر نهاية (م)': pipe.depthEnd !== undefined ? Number(pipe.depthEnd.toFixed(2)) : '',
        'القطر (ملم)': pipe.diameterMm,
        'الميل (%)': Number(pipe.slopePercent.toFixed(3)),
        'معامل مانينغ (n)': pipe.manningN,
        'السرعة V (م/ث)': Number(pipe.velocity.toFixed(3)),
        'التصريف الكلي Q_max (لتر/ث)': Number(pipe.maxCapacityLs.toFixed(2)),
        'التصريف التصميمي Q_75% (لتر/ث)': Number(pipe.designCapacity75Ls.toFixed(2)),
        'اتجاه التدفق': pipe.flowDirectionTextAr,
        'حالة شبكة الانحدار': pipe.sewerStatus || 'انحدار طبيعي',
        'ملاحظات الهيدروليكا ومحطة الرفع': pipe.sewerStatusReasonAr || pipe.statusBadgeAr,
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
        'GL Start (m)': pipe.glStart !== undefined ? Number(pipe.glStart.toFixed(2)) : '',
        'GL End (m)': pipe.glEnd !== undefined ? Number(pipe.glEnd.toFixed(2)) : '',
        'IL Start (m)': pipe.ilStart !== undefined ? Number(pipe.ilStart.toFixed(2)) : '',
        'IL End (m)': pipe.ilEnd !== undefined ? Number(pipe.ilEnd.toFixed(2)) : '',
        'Depth Start (m)': pipe.depthStart !== undefined ? Number(pipe.depthStart.toFixed(2)) : '',
        'Depth End (m)': pipe.depthEnd !== undefined ? Number(pipe.depthEnd.toFixed(2)) : '',
        'Diameter (mm)': pipe.diameterMm,
        'Slope (%)': Number(pipe.slopePercent.toFixed(3)),
        'Manning n': pipe.manningN,
        'Velocity V (m/s)': Number(pipe.velocity.toFixed(3)),
        'Max Capacity Q_full (L/s)': Number(pipe.maxCapacityLs.toFixed(2)),
        'Design Capacity Q_75% (L/s)': Number(pipe.designCapacity75Ls.toFixed(2)),
        'Flow Direction': pipe.flowDirectionTextEn,
        'Sewer Status': pipe.sewerStatus || 'Normal Gravity',
        'Hydraulic Remarks': pipe.sewerStatusReasonEn || pipe.statusBadgeEn,
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
    { 'البند / الخاصية': 'خطوط الانحدار الطبيعي السليمة', 'القيمة': `${summary.normalGravityCount || 0} خط`, 'الوحدة': 'انحدار طبيعي' },
    { 'البند / الخاصية': 'المناهل الهدارة المقترحة (Drop Manholes)', 'القيمة': `${summary.dropManholeCount || 0} موقع`, 'الوحدة': 'تخفيض ميل/سرعة' },
    { 'البند / الخاصية': 'العقد التي تتطلب محطات رفع (Lift Stations)', 'القيمة': `${summary.liftStationCount || 0} موقع`, 'الوحدة': 'عمق حفر > 5م / انحدار عكسي' },
    { 'البند / الخاصية': 'المصب الرئيسي للشبكة (Outfall)', 'القيمة': summary.primaryOutfallId || 'غير محدد', 'الوحدة': summary.primaryOutfallIL !== undefined ? `منسوب IL: ${summary.primaryOutfallIL.toFixed(2)}م` : 'أدنى نقطة' },
    { 'البند / الخاصية': 'الأنابيب المطابقة وذات الجريان السلس (0.6 - 2.5 م/ث)', 'القيمة': `${summary.optimalVelocityCount} خط (${((summary.optimalVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'مطابق للاشتراطات' },
    { 'البند / الخاصية': 'الأنابيب المعرضة للرسوبيات (< 0.6 م/ث)', 'القيمة': `${summary.lowVelocityCount} خط (${((summary.lowVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'تتطلب مراجعة الميل أو الغسيل' },
    { 'البند / الخاصية': 'الأنابيب المعرضة للنحر والتآكل (> 2.5 م/ث)', 'القيمة': `${summary.highVelocityCount} خط (${((summary.highVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'الوحدة': 'تتطلب كواسر سرعة أو هدار' },
    { 'البند / الخاصية': 'إجمالي مسطحات إعادة السفلتة (معايير الأمانة)', 'القيمة': Number(summary.totalAsphaltAreaM2.toFixed(2)), 'الوحدة': 'متر مربع (م²)' },
    { 'البند / الخاصية': 'إجمالي كميات خرسانة الأسفلت المطلوبة', 'القيمة': Number(summary.totalAsphaltVolumeM3.toFixed(2)), 'الوحدة': 'متر مكعب (م³)' },
    { 'البند / الخاصية': 'معادلة الحساب الهيدروليكي', 'القيمة': 'معادلة مانينغ لشبكات انحدار الصرف الصحي', 'الوحدة': 'V = (1/n)*R^(2/3)*S^(1/2)' },
    { 'البند / الخاصية': 'الحد الأدنى لعمق التغطية (Min Cover)', 'القيمة': '1.20 متر', 'الوحدة': 'متر' },
    { 'البند / الخاصية': 'الحد الأقصى لعمق الحفر قبل محطة الرفع', 'القيمة': '5.00 أمتار', 'الوحدة': 'متر' },
    { 'البند / الخاصية': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-SA'), 'الوحدة': 'توقيت الرياض' }
  ] : [
    { 'Property / Metric': 'Total Network Pipe Segments', 'Value': summary.totalPipes, 'Unit': 'pipes' },
    { 'Property / Metric': 'Total Network Length', 'Value': Number(summary.totalLengthM.toFixed(2)), 'Unit': 'meters' },
    { 'Property / Metric': 'Total Network Length (km)', 'Value': Number((summary.totalLengthM / 1000).toFixed(3)), 'Unit': 'km' },
    { 'Property / Metric': 'Average Flow Velocity (Manning)', 'Value': Number(summary.avgVelocity.toFixed(2)), 'Unit': 'm/s' },
    { 'Property / Metric': 'Average Pipe Diameter', 'Value': Math.round(summary.avgDiameterMm), 'Unit': 'mm' },
    { 'Property / Metric': 'Average Pipe Slope', 'Value': Number(summary.avgSlopePercent.toFixed(3)), 'Unit': '%' },
    { 'Property / Metric': 'Total Network Capacity (Q_Total)', 'Value': Number(summary.totalCapacityLs.toFixed(2)), 'Unit': 'L/s' },
    { 'Property / Metric': 'Normal Gravity Lines', 'Value': `${summary.normalGravityCount || 0}`, 'Unit': 'Normal Gravity' },
    { 'Property / Metric': 'Suggested Drop Manholes', 'Value': `${summary.dropManholeCount || 0}`, 'Unit': 'Drop MH' },
    { 'Property / Metric': 'Lift Station Required Nodes', 'Value': `${summary.liftStationCount || 0}`, 'Unit': 'Depth > 5m / Adverse Slope' },
    { 'Property / Metric': 'Primary Network Outfall', 'Value': summary.primaryOutfallId || 'N/A', 'Unit': summary.primaryOutfallIL !== undefined ? `IL: ${summary.primaryOutfallIL.toFixed(2)}m` : 'Lowest IL' },
    { 'Property / Metric': 'Optimal Velocity Pipes (0.6 - 2.5 m/s)', 'Value': `${summary.optimalVelocityCount} (${((summary.optimalVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Compliant' },
    { 'Property / Metric': 'Low Velocity / Sedimentation Risk (< 0.6 m/s)', 'Value': `${summary.lowVelocityCount} (${((summary.lowVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Warning' },
    { 'Property / Metric': 'High Velocity / Scour Risk (> 2.5 m/s)', 'Value': `${summary.highVelocityCount} (${((summary.highVelocityCount / Math.max(1, summary.totalPipes)) * 100).toFixed(1)}%)`, 'Unit': 'Warning' },
    { 'Property / Metric': 'Total Asphalt Restoration Area', 'Value': Number(summary.totalAsphaltAreaM2.toFixed(2)), 'Unit': 'm²' },
    { 'Property / Metric': 'Total Asphalt Volume', 'Value': Number(summary.totalAsphaltVolumeM3.toFixed(2)), 'Unit': 'm³' },
    { 'Property / Metric': 'Hydraulic Model', 'Value': "Manning's Gravity Sewer Flow", 'Unit': 'V = (1/n)*R^(2/3)*S^(1/2)' },
    { 'Property / Metric': 'Minimum Cover Depth', 'Value': '1.20 m', 'Unit': 'meters' },
    { 'Property / Metric': 'Maximum Trench Depth Before Lift Station', 'Value': '5.00 m', 'Unit': 'meters' },
    { 'Property / Metric': 'Export Timestamp', 'Value': new Date().toISOString(), 'Unit': 'UTC' }
  ];

  const wb = XLSX.utils.book_new();

  // Create Pipes Sheet
  const wsPipes = XLSX.utils.json_to_sheet(pipeRows);
  const pipeCols = Object.keys(pipeRows[0] || {}).map(k => ({
    wch: Math.max(k.length * 2, 16)
  }));
  wsPipes['!cols'] = pipeCols;

  // Create Summary Sheet
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 25 }, { wch: 30 }];

  const sheet1Name = isAr ? 'شبكة الانحدار ومناسيب القاع' : 'Sewer Gravity & Hydraulics';
  const sheet2Name = isAr ? 'ملخص الشبكة ومحطات الرفع' : 'Executive Network Summary';

  XLSX.utils.book_append_sheet(wb, wsPipes, sheet1Name);
  XLSX.utils.book_append_sheet(wb, wsSummary, sheet2Name);

  const cleanFileName = (filename || 'Gravity_Sewer_Report').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  XLSX.writeFile(wb, `${cleanFileName}_Gravity_Sewer_Engine.xlsx`);
}

