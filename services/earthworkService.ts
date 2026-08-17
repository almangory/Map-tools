import * as XLSX from 'xlsx';
import { GeoPoint, PipeHydraulicData } from '../types';
import { calculatePathLengthMeters } from './hydraulicService';

export interface TrenchParameters {
  baseTrenchWidthFormula: 'standard' | 'fixed' | 'sbc_code'; // standard: D + 0.6m
  customTrenchWidth?: number; // meters (if fixed)
  sideSlopeRatio: number; // e.g. 0 for vertical shoring, 0.25 or 0.5 for sloped excavation
  beddingThicknessM: number; // default: 0.15 m (15 cm sand)
  haunchingThicknessM: number; // default: 0.30 m above pipe crown
  asphaltOvercutM: number; // default: 0.15 m (Cut-back on each side: 15-20 cm)
  asphaltThicknessM: number; // default: 0.10 m (10 cm)
  asphaltDensityTonPerM3: number; // default: 2.35 (Ton/m³)
  baseCourseThicknessM: number; // default: 0.20 m (20 cm)
  deductManholeArea: boolean; // default: true
  manholeDeductionAreaM2: number; // default: 1.13 m²
  unitCosts?: {
    excavationPerM3: number; // SAR/m³
    beddingSandPerM3: number; // SAR/m³
    backfillPerM3: number; // SAR/m³
    asphaltPerM2: number; // SAR/m²
    shoredTrenchPerM2: number; // SAR/m²
  };
}

export const DEFAULT_TRENCH_PARAMS: TrenchParameters = {
  baseTrenchWidthFormula: 'standard',
  sideSlopeRatio: 0, // Vertical shored trench (standard in urban water/sewer works)
  beddingThicknessM: 0.15,
  haunchingThicknessM: 0.30,
  asphaltOvercutM: 0.15, // 15 cm Cut-back from each side
  asphaltThicknessM: 0.10, // 10 cm Asphalt layer thickness
  asphaltDensityTonPerM3: 2.35, // Standard Asphalt density (2.35 Ton/m³)
  baseCourseThicknessM: 0.20,
  deductManholeArea: true,
  manholeDeductionAreaM2: 1.13, // Standard 1.2m circular manhole opening: pi * (0.6)^2 = 1.13 m²
  unitCosts: {
    excavationPerM3: 45,
    beddingSandPerM3: 35,
    backfillPerM3: 25,
    asphaltPerM2: 85,
    shoredTrenchPerM2: 60
  }
};

export interface PipeEarthworkDetail {
  id: string | number;
  name: string;
  layer: string;
  lengthM: number;
  diameterMm: number;
  diameterM: number;
  outerDiameterM: number;
  
  // Levels & Depths
  glStart: number;
  glEnd: number;
  ilStart: number;
  ilEnd: number;
  depthStart: number;
  depthEnd: number;
  avgDepth: number;
  
  // Dimensions
  trenchWidthM: number;
  trenchTopWidthM: number;
  asphaltOvercutM: number;
  actualAsphaltWidthM: number; // W = W_trench + 2 * Overcut
  
  // Volumes (m³)
  excavationVolumeM3: number;
  beddingVolumeM3: number;
  pipeDisplacementVolumeM3: number;
  initialBackfillVolumeM3: number;
  ordinaryBackfillVolumeM3: number;
  totalBackfillVolumeM3: number;
  asphaltVolumeM3: number; // V = Area * Thickness
  
  // Weights (Tons)
  asphaltWeightTon: number; // Weight = V * Density
  
  // Areas (m²)
  trenchSurfaceAreaM2: number;
  grossAsphaltAreaM2: number; // L * W
  manholeDeductionM2: number; // Manhole opening deduction
  asphaltCuttingAreaM2: number; // Net Area = (L * W) - manholeDeduction
  shoredSideAreaM2: number;
  
  // Costs (SAR)
  excavationCost: number;
  beddingCost: number;
  backfillCost: number;
  asphaltCost: number;
  totalEstimatedCost: number;
}

export interface EarthworkBOQSummary {
  totalPipesCount: number;
  totalLengthM: number;
  avgDepthM: number;
  maxDepthM: number;
  minDepthM: number;
  
  // Asphalt Parameters & Metrics
  asphaltOvercutM: number;
  asphaltThicknessM: number;
  asphaltDensityTonPerM3: number;
  totalAsphaltGrossAreaM2: number;
  totalManholeDeductionM2: number;
  totalAsphaltAreaM2: number; // Net Area in m² (المعتمدة في المستخلصات)
  totalAsphaltVolumeM3: number; // Volume in m³
  totalAsphaltWeightTon: number; // Weight in Tons
  
  // Total Volumes (m³)
  totalExcavationM3: number;
  totalBeddingM3: number;
  totalPipeDisplacementM3: number;
  totalBackfillM3: number;
  
  // Total Areas (m²)
  totalShoringAreaM2: number;
  
  // Total Costs (SAR)
  totalExcavationCost: number;
  totalBeddingCost: number;
  totalBackfillCost: number;
  totalAsphaltCost: number;
  grandTotalCost: number;
  
  // Items Breakdown
  items: PipeEarthworkDetail[];
  
  // Classified by Depth Ranges (مقسمة حسب فئات أعماق الحفر للمقايسات)
  depthClassifiedBOQ: {
    depth0to1_5: { count: number; lengthM: number; volumeM3: number };
    depth1_5to3_0: { count: number; lengthM: number; volumeM3: number };
    depth3_0to5_0: { count: number; lengthM: number; volumeM3: number };
    depthAbove5_0: { count: number; lengthM: number; volumeM3: number };
  };
}

/**
 * Calculates standard trench bottom width based on nominal diameter:
 * Standard engineering formula:
 * If D <= 300 mm -> B = D + 0.60 m (min 0.80 m)
 * If 300 < D <= 600 mm -> B = D + 0.70 m
 * If D > 600 mm -> B = D + 0.80 m
 */
export function calculateStandardTrenchWidth(diameterMm: number): number {
  const dM = diameterMm / 1000;
  if (diameterMm <= 300) {
    return Math.max(0.80, Number((dM + 0.60).toFixed(2)));
  } else if (diameterMm <= 600) {
    return Number((dM + 0.70).toFixed(2));
  } else {
    return Number((dM + 0.80).toFixed(2));
  }
}

/**
 * Computes complete earthwork quantities and generates BOQ for pipes
 */
export function calculateEarthworkBOQ(
  points: GeoPoint[],
  hydraulicMap?: Map<string | number, PipeHydraulicData> | null,
  params: TrenchParameters = DEFAULT_TRENCH_PARAMS
): EarthworkBOQSummary {
  const linePoints = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  
  const items: PipeEarthworkDetail[] = [];
  let totalLengthM = 0;
  let totalExcavationM3 = 0;
  let totalBeddingM3 = 0;
  let totalPipeDisplacementM3 = 0;
  let totalBackfillM3 = 0;
  
  let totalAsphaltGrossAreaM2 = 0;
  let totalManholeDeductionM2 = 0;
  let totalAsphaltAreaM2 = 0;
  let totalAsphaltVolumeM3 = 0;
  let totalAsphaltWeightTon = 0;
  
  let totalShoringAreaM2 = 0;
  
  let totalExcavationCost = 0;
  let totalBeddingCost = 0;
  let totalBackfillCost = 0;
  let totalAsphaltCost = 0;
  
  let maxDepthM = 0;
  let minDepthM = 999;
  let depthSumWeighted = 0;

  const depthClassified = {
    depth0to1_5: { count: 0, lengthM: 0, volumeM3: 0 },
    depth1_5to3_0: { count: 0, lengthM: 0, volumeM3: 0 },
    depth3_0to5_0: { count: 0, lengthM: 0, volumeM3: 0 },
    depthAbove5_0: { count: 0, lengthM: 0, volumeM3: 0 }
  };

  const costs = params.unitCosts || DEFAULT_TRENCH_PARAMS.unitCosts!;
  const asphaltOvercut = params.asphaltOvercutM !== undefined ? params.asphaltOvercutM : 0.15;
  const asphaltThickness = params.asphaltThicknessM !== undefined ? params.asphaltThicknessM : 0.10;
  const asphaltDensity = params.asphaltDensityTonPerM3 !== undefined ? params.asphaltDensityTonPerM3 : 2.35;
  const manholeOpeningArea = params.manholeDeductionAreaM2 !== undefined ? params.manholeDeductionAreaM2 : 1.13;

  for (const pt of linePoints) {
    const length = pt.length || calculatePathLengthMeters(pt.path);
    if (length <= 0) continue;

    // Get Hydraulic / Level info if available
    const hydro = hydraulicMap?.get(pt.id);
    
    // Extract diameter
    let diameterMm = 200; // default
    if (hydro?.diameterMm) {
      diameterMm = hydro.diameterMm;
    } else {
      const fullText = `${pt.layer || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''} ${JSON.stringify(pt.attributes || {})}`;
      const diaMatch = fullText.match(/(?:dia|diameter|dn|قطر|id)[\s:=_-]*([0-9]{2,4})/i);
      if (diaMatch) {
        diameterMm = parseInt(diaMatch[1], 10);
      }
    }

    const diameterM = diameterMm / 1000;
    // Pipe wall thickness estimate (approx 5-10% of D)
    const outerDiameterM = diameterM * 1.10;

    // Determine Ground and Invert Levels
    let glStart = hydro?.glStart ?? pt.path![0].z ?? 100;
    let glEnd = hydro?.glEnd ?? pt.path![pt.path!.length - 1].z ?? 99.5;
    
    // Invert level fallback if not in hydraulic calculation
    let depthStart = hydro?.depthStart ?? 1.80; // default 1.8m min cover
    let depthEnd = hydro?.depthEnd ?? 1.95;
    
    if (depthStart <= 0) depthStart = 1.80;
    if (depthEnd <= 0) depthEnd = 1.95;

    let ilStart = hydro?.ilStart ?? (glStart - depthStart);
    let ilEnd = hydro?.ilEnd ?? (glEnd - depthEnd);

    const avgDepth = (depthStart + depthEnd) / 2;
    if (avgDepth > maxDepthM) maxDepthM = avgDepth;
    if (avgDepth < minDepthM) minDepthM = avgDepth;
    depthSumWeighted += avgDepth * length;

    // Trench bottom width (B / W_trench)
    let trenchBottomWidth = calculateStandardTrenchWidth(diameterMm);
    if (params.baseTrenchWidthFormula === 'fixed' && params.customTrenchWidth) {
      trenchBottomWidth = params.customTrenchWidth;
    }

    // Trench top width (if sloped sides: Top = Bottom + 2 * m * H)
    const sideSlope = Math.max(0, params.sideSlopeRatio);
    const trenchTopWidthStart = trenchBottomWidth + 2 * sideSlope * depthStart;
    const trenchTopWidthEnd = trenchBottomWidth + 2 * sideSlope * depthEnd;
    const avgTrenchTopWidth = (trenchTopWidthStart + trenchTopWidthEnd) / 2;

    // 1. Excavation Volume (حجم الحفر):
    const areaStart = (trenchBottomWidth + sideSlope * depthStart) * depthStart;
    const areaEnd = (trenchBottomWidth + sideSlope * depthEnd) * depthEnd;
    const excavationVolumeM3 = Number((((areaStart + areaEnd) / 2) * length).toFixed(2));

    // 2. Bedding Sand Volume (طبقة الرمل أسفل الأنبوب):
    const beddingVolumeM3 = Number((params.beddingThicknessM * trenchBottomWidth * length).toFixed(2));

    // 3. Pipe Displacement Volume (حجم إزاحة الأنبوب):
    const pipeDisplacementVolumeM3 = Number((Math.PI * Math.pow(outerDiameterM / 2, 2) * length).toFixed(2));

    // 4. Initial Backfill (الردم المختار حول الأنبوب حتى 30 سم فوق التاج):
    const haunchingDepth = outerDiameterM + params.haunchingThicknessM;
    const initialBackfillGross = (trenchBottomWidth + sideSlope * haunchingDepth) * haunchingDepth * length;
    const initialBackfillVolumeM3 = Math.max(0, Number((initialBackfillGross - pipeDisplacementVolumeM3).toFixed(2)));

    // 5. Asphalt Restoration Calculations (حسابات كميات الإسفلت المعتمدة):
    // 5.1 عرض الإسفلت الفعلي (W): W = W_trench + 2 * Overcut
    const actualAsphaltWidthM = Number((trenchBottomWidth + (2 * asphaltOvercut)).toFixed(2));
    
    // 5.2 المساحة الإجمالية قبل الخصم: Gross Area = L * W
    const grossAsphaltAreaM2 = Number((actualAsphaltWidthM * length).toFixed(2));
    
    // 5.3 مساحة فتحات المناهل المخصومة (Manhole Deductions):
    // Standard circular manhole (1.2m dia) area ~ 1.13 m²
    const manholeDeductionM2 = params.deductManholeArea ? Math.min(grossAsphaltAreaM2, manholeOpeningArea) : 0;
    
    // 5.4 صافي المساحة بالمتر المربع (Net Area m² - المعتمدة في المستخلصات):
    const netAsphaltAreaM2 = Math.max(0, Number((grossAsphaltAreaM2 - manholeDeductionM2).toFixed(2)));
    
    // 5.5 حجم الإسفلت بالمتر المكعب (Volume m³): V = A * T
    const asphaltVolumeM3 = Number((netAsphaltAreaM2 * asphaltThickness).toFixed(3));
    
    // 5.6 وزن الإسفلت بالطن (Weight Ton): Weight = V * Density (2.35 Ton/m³)
    const asphaltWeightTon = Number((asphaltVolumeM3 * asphaltDensity).toFixed(2));

    // 5.7 Pavement Volume for Backfill subtraction:
    const roadPavementDepth = asphaltThickness + params.baseCourseThicknessM;
    const pavementVolumeM3 = netAsphaltAreaM2 * roadPavementDepth;

    // 6. Ordinary Backfill (الردم العادي المدموك حتى منسوب طبقات الرصف):
    const ordinaryBackfillVolumeM3 = Math.max(
      0,
      Number((excavationVolumeM3 - beddingVolumeM3 - pipeDisplacementVolumeM3 - pavementVolumeM3).toFixed(2))
    );
    const totalBackfillVolumeM3 = Number((beddingVolumeM3 + initialBackfillVolumeM3 + ordinaryBackfillVolumeM3).toFixed(2));

    // Shoring area (مساحة سند جوانب الحفر = 2 * متوسط العمق * الطول)
    const shoredSideAreaM2 = Number((2 * avgDepth * length).toFixed(2));

    // Costs
    const excavationCost = Number((excavationVolumeM3 * costs.excavationPerM3).toFixed(2));
    const beddingCost = Number((beddingVolumeM3 * costs.beddingSandPerM3).toFixed(2));
    const backfillCost = Number((ordinaryBackfillVolumeM3 * costs.backfillPerM3).toFixed(2));
    const asphaltCost = Number((netAsphaltAreaM2 * costs.asphaltPerM2).toFixed(2));
    const totalEstimatedCost = Number((excavationCost + beddingCost + backfillCost + asphaltCost).toFixed(2));

    // Aggregate
    totalLengthM += length;
    totalExcavationM3 += excavationVolumeM3;
    totalBeddingM3 += beddingVolumeM3;
    totalPipeDisplacementM3 += pipeDisplacementVolumeM3;
    totalBackfillM3 += ordinaryBackfillVolumeM3;
    
    totalAsphaltGrossAreaM2 += grossAsphaltAreaM2;
    totalManholeDeductionM2 += manholeDeductionM2;
    totalAsphaltAreaM2 += netAsphaltAreaM2;
    totalAsphaltVolumeM3 += asphaltVolumeM3;
    totalAsphaltWeightTon += asphaltWeightTon;
    
    totalShoringAreaM2 += shoredSideAreaM2;

    totalExcavationCost += excavationCost;
    totalBeddingCost += beddingCost;
    totalBackfillCost += backfillCost;
    totalAsphaltCost += asphaltCost;

    // Categorize by depth
    if (avgDepth <= 1.5) {
      depthClassified.depth0to1_5.count++;
      depthClassified.depth0to1_5.lengthM += length;
      depthClassified.depth0to1_5.volumeM3 += excavationVolumeM3;
    } else if (avgDepth <= 3.0) {
      depthClassified.depth1_5to3_0.count++;
      depthClassified.depth1_5to3_0.lengthM += length;
      depthClassified.depth1_5to3_0.volumeM3 += excavationVolumeM3;
    } else if (avgDepth <= 5.0) {
      depthClassified.depth3_0to5_0.count++;
      depthClassified.depth3_0to5_0.lengthM += length;
      depthClassified.depth3_0to5_0.volumeM3 += excavationVolumeM3;
    } else {
      depthClassified.depthAbove5_0.count++;
      depthClassified.depthAbove5_0.lengthM += length;
      depthClassified.depthAbove5_0.volumeM3 += excavationVolumeM3;
    }

    items.push({
      id: pt.id,
      name: String(pt.id || pt.layer || 'Line'),
      layer: pt.layer || 'Pipeline',
      lengthM: Number(length.toFixed(2)),
      diameterMm,
      diameterM,
      outerDiameterM: Number(outerDiameterM.toFixed(3)),
      glStart: Number(glStart.toFixed(2)),
      glEnd: Number(glEnd.toFixed(2)),
      ilStart: Number(ilStart.toFixed(2)),
      ilEnd: Number(ilEnd.toFixed(2)),
      depthStart: Number(depthStart.toFixed(2)),
      depthEnd: Number(depthEnd.toFixed(2)),
      avgDepth: Number(avgDepth.toFixed(2)),
      trenchWidthM: trenchBottomWidth,
      trenchTopWidthM: Number(avgTrenchTopWidth.toFixed(2)),
      asphaltOvercutM: asphaltOvercut,
      actualAsphaltWidthM,
      excavationVolumeM3,
      beddingVolumeM3,
      pipeDisplacementVolumeM3,
      initialBackfillVolumeM3,
      ordinaryBackfillVolumeM3,
      totalBackfillVolumeM3,
      asphaltVolumeM3,
      asphaltWeightTon,
      trenchSurfaceAreaM2: netAsphaltAreaM2,
      grossAsphaltAreaM2,
      manholeDeductionM2,
      asphaltCuttingAreaM2: netAsphaltAreaM2,
      shoredSideAreaM2,
      excavationCost,
      beddingCost,
      backfillCost,
      asphaltCost,
      totalEstimatedCost
    });
  }

  const grandTotalCost = Number((totalExcavationCost + totalBeddingCost + totalBackfillCost + totalAsphaltCost).toFixed(2));
  const avgDepthOverall = totalLengthM > 0 ? Number((depthSumWeighted / totalLengthM).toFixed(2)) : 0;

  return {
    totalPipesCount: items.length,
    totalLengthM: Number(totalLengthM.toFixed(2)),
    avgDepthM: avgDepthOverall,
    maxDepthM: Number(maxDepthM.toFixed(2)),
    minDepthM: minDepthM === 999 ? 0 : Number(minDepthM.toFixed(2)),
    asphaltOvercutM: asphaltOvercut,
    asphaltThicknessM: asphaltThickness,
    asphaltDensityTonPerM3: asphaltDensity,
    totalAsphaltGrossAreaM2: Number(totalAsphaltGrossAreaM2.toFixed(2)),
    totalManholeDeductionM2: Number(totalManholeDeductionM2.toFixed(2)),
    totalAsphaltAreaM2: Number(totalAsphaltAreaM2.toFixed(2)),
    totalAsphaltVolumeM3: Number(totalAsphaltVolumeM3.toFixed(3)),
    totalAsphaltWeightTon: Number(totalAsphaltWeightTon.toFixed(2)),
    totalExcavationM3: Number(totalExcavationM3.toFixed(2)),
    totalBeddingM3: Number(totalBeddingM3.toFixed(2)),
    totalPipeDisplacementM3: Number(totalPipeDisplacementM3.toFixed(2)),
    totalBackfillM3: Number(totalBackfillM3.toFixed(2)),
    totalShoringAreaM2: Number(totalShoringAreaM2.toFixed(2)),
    totalExcavationCost: Number(totalExcavationCost.toFixed(2)),
    totalBeddingCost: Number(totalBeddingCost.toFixed(2)),
    totalBackfillCost: Number(totalBackfillCost.toFixed(2)),
    totalAsphaltCost: Number(totalAsphaltCost.toFixed(2)),
    grandTotalCost,
    items,
    depthClassifiedBOQ: {
      depth0to1_5: {
        count: depthClassified.depth0to1_5.count,
        lengthM: Number(depthClassified.depth0to1_5.lengthM.toFixed(2)),
        volumeM3: Number(depthClassified.depth0to1_5.volumeM3.toFixed(2))
      },
      depth1_5to3_0: {
        count: depthClassified.depth1_5to3_0.count,
        lengthM: Number(depthClassified.depth1_5to3_0.lengthM.toFixed(2)),
        volumeM3: Number(depthClassified.depth1_5to3_0.volumeM3.toFixed(2))
      },
      depth3_0to5_0: {
        count: depthClassified.depth3_0to5_0.count,
        lengthM: Number(depthClassified.depth3_0to5_0.lengthM.toFixed(2)),
        volumeM3: Number(depthClassified.depth3_0to5_0.volumeM3.toFixed(2))
      },
      depthAbove5_0: {
        count: depthClassified.depthAbove5_0.count,
        lengthM: Number(depthClassified.depthAbove5_0.lengthM.toFixed(2)),
        volumeM3: Number(depthClassified.depthAbove5_0.volumeM3.toFixed(2))
      }
    }
  };
}

/**
 * Export Earthwork BOQ directly into an organized Excel Spreadsheet (.xlsx)
 */
export function exportEarthworkBOQExcel(boq: EarthworkBOQSummary, filename: string = 'Earthwork_BOQ_Report'): void {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet (ملخص جدول الكميات والأسعار)
  const summaryRows = [
    ['المشروع / الملف:', filename],
    ['تاريخ التوليد:', new Date().toLocaleDateString('ar-SA')],
    ['معادلات حساب الإسفلت:', `W = W_trench + 2*(Overcut=${boq.asphaltOvercutM}m) | Net Area = (L*W) - Manholes | V = Area*${boq.asphaltThicknessM}m | Weight = V*${boq.asphaltDensityTonPerM3} ton/m³`],
    [''],
    ['--- ملخص الأعمال والكميات الإجمالية (Earthwork BOQ Summary) ---'],
    ['البند', 'الوصف الهندسي', 'الوحدة', 'الكمية الإجمالية', 'سعر الوحدة التقديري (ر.س)', 'الإجمالي التقديري (ر.س)'],
    ['1.0', 'أعمال الحفر في جميع أنواع التربة للخنادق وتجهيز المسار', 'م³ (m³)', boq.totalExcavationM3, 45, boq.totalExcavationCost],
    ['2.0', 'توريد وفرش طبقة رمل نظيف (Bedding Sand) أسفل وحول الأنابيب بسماكة 15 سم', 'م³ (m³)', boq.totalBeddingM3, 35, boq.totalBeddingCost],
    ['3.0', 'أعمال الردم بمواد صالحة مدموكة على طبقات حتى منسوب الرصف', 'م³ (m³)', boq.totalBackfillM3, 25, boq.totalBackfillCost],
    ['4.0', `أعمال قطع وإعادة سفلتة الشوارع (صافي المساحة المعتمدة بالمستخلصات بعد خصم المناهل)`, 'م² (m²)', boq.totalAsphaltAreaM2, 85, boq.totalAsphaltCost],
    ['4.1', `حجم الإسفلت الفعلي المطلوب (سماكة ${boq.asphaltThicknessM * 100} سم)`, 'م³ (m³)', boq.totalAsphaltVolumeM3, '-', '-'],
    ['4.2', `وزن الإسفلت التقديري بالطن (كثافة ${boq.asphaltDensityTonPerM3} طن/م³)`, 'طن (Ton)', boq.totalAsphaltWeightTon, '-', '-'],
    ['5.0', 'أعمال سند جوانب الحفر (Shoring) للأعماق الحرجة (تقديري)', 'م² (m²)', boq.totalShoringAreaM2, 60, Number((boq.totalShoringAreaM2 * 60).toFixed(2))],
    [''],
    ['إجمالي التكلفة التقديرية لكامل شبكة المشروع (ر.س):', '', '', '', '', boq.grandTotalCost],
    [''],
    ['--- تفاصيل كميات الإسفلت المعتمدة للمستخلصات ---'],
    ['البيان', 'القيمة', 'الوحدة', 'ملاحظات'],
    ['مسافة القص الإضافي للجانبين (Cut-back Overcut)', boq.asphaltOvercutM, 'متر', 'مسافة القص الإضافي من كل جانب (15-20 سم)'],
    ['إجمالي مساحة الإسفلت الإجمالية (Gross)', boq.totalAsphaltGrossAreaM2, 'م²', 'الطول × عرض الإسفلت الفعلي'],
    ['إجمالي مساحة خصم فتحات المناهل (Deductions)', boq.totalManholeDeductionM2, 'م²', 'خصم مساحات فتحات المناهل والغرف'],
    ['صافي مساحة الإسفلت المعتمدة (Net Area)', boq.totalAsphaltAreaM2, 'م²', 'المساحة المعتمدة في جداول الكميات والمستخلصات'],
    ['إجمالي حجم الإسفلت (Volume)', boq.totalAsphaltVolumeM3, 'م³', 'المساحة الصافية × سماكة الإسفلت'],
    ['إجمالي وزن الإسفلت (Weight)', boq.totalAsphaltWeightTon, 'طن (Ton)', 'الحجم × الكثافة (2.35 طن/م³)'],
    [''],
    ['--- تصنيف بنود الحفر حسب فئات الأعماق القياسية (Depth Ranges Breakdown) ---'],
    ['فئة العمق (Depth Range)', 'عدد الخطوط', 'إجمالي الأطوال (م)', 'إجمالي حجم الحفر (م³)', 'النسبة من حجم الحفر %'],
    [
      'عمق أقل من 1.5 م (0.0 - 1.5m)',
      boq.depthClassifiedBOQ.depth0to1_5.count,
      boq.depthClassifiedBOQ.depth0to1_5.lengthM,
      boq.depthClassifiedBOQ.depth0to1_5.volumeM3,
      boq.totalExcavationM3 > 0 ? `${((boq.depthClassifiedBOQ.depth0to1_5.volumeM3 / boq.totalExcavationM3) * 100).toFixed(1)}%` : '0%'
    ],
    [
      'عمق من 1.5 إلى 3.0 م (1.5 - 3.0m)',
      boq.depthClassifiedBOQ.depth1_5to3_0.count,
      boq.depthClassifiedBOQ.depth1_5to3_0.lengthM,
      boq.depthClassifiedBOQ.depth1_5to3_0.volumeM3,
      boq.totalExcavationM3 > 0 ? `${((boq.depthClassifiedBOQ.depth1_5to3_0.volumeM3 / boq.totalExcavationM3) * 100).toFixed(1)}%` : '0%'
    ],
    [
      'عمق من 3.0 إلى 5.0 م (3.0 - 5.0m)',
      boq.depthClassifiedBOQ.depth3_0to5_0.count,
      boq.depthClassifiedBOQ.depth3_0to5_0.lengthM,
      boq.depthClassifiedBOQ.depth3_0to5_0.volumeM3,
      boq.totalExcavationM3 > 0 ? `${((boq.depthClassifiedBOQ.depth3_0to5_0.volumeM3 / boq.totalExcavationM3) * 100).toFixed(1)}%` : '0%'
    ],
    [
      'عمق أكبر من 5.0 م (> 5.0m - حفر عميق)',
      boq.depthClassifiedBOQ.depthAbove5_0.count,
      boq.depthClassifiedBOQ.depthAbove5_0.lengthM,
      boq.depthClassifiedBOQ.depthAbove5_0.volumeM3,
      boq.totalExcavationM3 > 0 ? `${((boq.depthClassifiedBOQ.depthAbove5_0.volumeM3 / boq.totalExcavationM3) * 100).toFixed(1)}%` : '0%'
    ]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص الكميات BOQ');

  // 2. Detailed Sheet (جدول الكميات التفصيلي لكل ماسورة)
  const detailHeaders = [
    'معرف الخط (ID)',
    'الطبقة (Layer)',
    'الطول (م)',
    'القطر (مم)',
    'منسوب البداية GL',
    'منسوب النهاية GL',
    'قاع البداية IL',
    'قاع النهاية IL',
    'عمق البداية (م)',
    'عمق النهاية (م)',
    'متوسط العمق (م)',
    'عرض الخندق W_trench (م)',
    'مسافة القص الإضافي Overcut (م)',
    'عرض الإسفلت الفعلي W (م)',
    'حجم الحفر (م³)',
    'طبقة الرمل (م³)',
    'إزاحة الأنبوب (م³)',
    'حجم الردم (م³)',
    'مساحة الإسفلت الإجمالية (م²)',
    'مساحة خصم المناهل (م²)',
    'صافي مساحة الإسفلت (م²)',
    'حجم الإسفلت V (م³)',
    'وزن الإسفلت (طن)',
    'مساحة السند (م²)',
    'التكلفة الإجمالية (ر.س)'
  ];

  const detailRows = boq.items.map(item => [
    item.id,
    item.layer,
    item.lengthM,
    item.diameterMm,
    item.glStart,
    item.glEnd,
    item.ilStart,
    item.ilEnd,
    item.depthStart,
    item.depthEnd,
    item.avgDepth,
    item.trenchWidthM,
    item.asphaltOvercutM,
    item.actualAsphaltWidthM,
    item.excavationVolumeM3,
    item.beddingVolumeM3,
    item.pipeDisplacementVolumeM3,
    item.ordinaryBackfillVolumeM3,
    item.grossAsphaltAreaM2,
    item.manholeDeductionM2,
    item.asphaltCuttingAreaM2,
    item.asphaltVolumeM3,
    item.asphaltWeightTon,
    item.shoredSideAreaM2,
    item.totalEstimatedCost
  ]);

  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'تفاصيل الأنابيب والإسفلت');

  XLSX.writeFile(wb, `${filename}_BOQ_Quantities.xlsx`);
}
