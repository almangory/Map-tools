import * as XLSX from 'xlsx';
import { GeoPoint } from '../types';
import { isWaterPoint, isSewerPoint } from './parserService';

export interface UtilityClashItem {
  id: string;
  intersectionPoint: { x: number; y: number; z1?: number; z2?: number };
  line1: {
    id: string | number;
    name: string;
    layer: string;
    type: 'water' | 'sewer' | 'storm' | 'other';
    elevationAtCross: number;
    depthAtCross?: number;
    diameterMm?: number;
  };
  line2: {
    id: string | number;
    name: string;
    layer: string;
    type: 'water' | 'sewer' | 'storm' | 'other';
    elevationAtCross: number;
    depthAtCross?: number;
    diameterMm?: number;
  };
  verticalClearanceM: number; // Delta Z in meters
  severity: 'collision' | 'critical' | 'warning' | 'safe';
  severityLabelAr: string;
  severityLabelEn: string;
  issueDescriptionAr: string;
  issueDescriptionEn: string;
  recommendationAr: string;
  recommendationEn: string;
}

export interface ClashDetectionSummary {
  totalCrossingsFound: number;
  criticalClashesCount: number;
  collisionCount: number;
  warningCount: number;
  safeCount: number;
  waterSewerCrossingsCount: number;
  clashes: UtilityClashItem[];
  scannedLayers: string[];
}

/**
 * Line segment intersection in 2D with parametric interpolation parameter t
 */
function getLineSegmentIntersection(
  p1: { x: number; y: number; z?: number },
  p2: { x: number; y: number; z?: number },
  p3: { x: number; y: number; z?: number },
  p4: { x: number; y: number; z?: number }
): { x: number; y: number; t1: number; t2: number } | null {
  const dX1 = p2.x - p1.x;
  const dY1 = p2.y - p1.y;
  const dX2 = p4.x - p3.x;
  const dY2 = p4.y - p3.y;

  const denom = dX1 * dY2 - dY1 * dX2;
  if (Math.abs(denom) < 1e-11) return null; // Parallel or collinear

  const t1 = ((p3.x - p1.x) * dY2 - (p3.y - p1.y) * dX2) / denom;
  const t2 = ((p3.x - p1.x) * dY1 - (p3.y - p1.y) * dX1) / denom;

  // Check if intersection lies strictly within both segments
  const EPS = 0.001;
  if (t1 >= EPS && t1 <= 1 - EPS && t2 >= EPS && t2 <= 1 - EPS) {
    return {
      x: p1.x + t1 * dX1,
      y: p1.y + t1 * dY1,
      t1,
      t2
    };
  }

  return null;
}

/**
 * Interpolates Z elevation along polyline at a given coordinate
 */
function interpolateZAtPoint(path: { x: number; y: number; z?: number }[], crossPt: { x: number; y: number }): number {
  if (!path || path.length === 0) return 0;
  if (path.length === 1) return path[0].z || 0;

  // Find nearest segment
  let bestDist = Infinity;
  let bestZ = path[0].z || 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    
    // Vector AB
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const lenSq = abX * abX + abY * abY;
    if (lenSq === 0) continue;

    // Projection of CrossPt onto AB
    const t = Math.max(0, Math.min(1, ((crossPt.x - a.x) * abX + (crossPt.y - a.y) * abY) / lenSq));
    const projX = a.x + t * abX;
    const projY = a.y + t * abY;
    
    const distSq = (crossPt.x - projX) ** 2 + (crossPt.y - projY) ** 2;
    if (distSq < bestDist) {
      bestDist = distSq;
      const zA = a.z !== undefined ? a.z : 100;
      const zB = b.z !== undefined ? b.z : zA;
      bestZ = zA + t * (zB - zA);
    }
  }

  return Number(bestZ.toFixed(2));
}

/**
 * Classifies network type from layer or description
 */
function classifyUtilityType(pt: GeoPoint): 'water' | 'sewer' | 'storm' | 'other' {
  if (isWaterPoint(pt)) return 'water';
  if (isSewerPoint(pt)) return 'sewer';
  
  const text = `${pt.layer || ''} ${pt.description || ''}`.toLowerCase();
  if (text.includes('storm') || text.includes('مطر') || text.includes('سيول')) return 'storm';
  if (text.includes('water') || text.includes('مياه') || text.includes('شرب')) return 'water';
  if (text.includes('sewer') || text.includes('صرف') || text.includes('ww') || text.includes('sanitary')) return 'sewer';
  
  return 'other';
}

/**
 * Extracts nominal diameter in mm
 */
function getDiameterFromPoint(pt: GeoPoint): number {
  const attrs = pt.attributes || {};
  const fullText = `${pt.layer || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''} ${JSON.stringify(attrs)}`;
  const match = fullText.match(/(?:dia|diameter|dn|قطر|id)[\s:=_-]*([0-9]{2,4})/i);
  if (match) return parseInt(match[1], 10);
  return 200;
}

/**
 * Scans all lines in dataset for utility crossing clashes (Water vs Sewer / Storm / Other)
 */
export function detectUtilityClashes(
  points: GeoPoint[],
  minVerticalClearanceM: number = 0.50
): ClashDetectionSummary {
  const linePoints = points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  const clashes: UtilityClashItem[] = [];
  const layersSet = new Set<string>();

  let criticalCount = 0;
  let collisionCount = 0;
  let warningCount = 0;
  let safeCount = 0;
  let waterSewerCount = 0;

  for (let i = 0; i < linePoints.length; i++) {
    const lineA = linePoints[i];
    if (lineA.layer) layersSet.add(lineA.layer);
    const pathA = lineA.path!;
    const typeA = classifyUtilityType(lineA);
    const diaA = getDiameterFromPoint(lineA);

    for (let j = i + 1; j < linePoints.length; j++) {
      const lineB = linePoints[j];
      const pathB = lineB.path!;
      const typeB = classifyUtilityType(lineB);
      const diaB = getDiameterFromPoint(lineB);

      // Check each segment of A against each segment of B
      for (let sA = 0; sA < pathA.length - 1; sA++) {
        const pA1 = pathA[sA];
        const pA2 = pathA[sA + 1];

        for (let sB = 0; sB < pathB.length - 1; sB++) {
          const pB1 = pathB[sB];
          const pB2 = pathB[sB + 1];

          const cross = getLineSegmentIntersection(pA1, pA2, pB1, pB2);
          if (cross) {
            const zA = interpolateZAtPoint(pathA, cross);
            const zB = interpolateZAtPoint(pathB, cross);
            const deltaZ = Math.abs(zA - zB);

            const isWaterSewer = (typeA === 'water' && typeB === 'sewer') || (typeA === 'sewer' && typeB === 'water');
            if (isWaterSewer) waterSewerCount++;

            let severity: UtilityClashItem['severity'] = 'safe';
            let sevLabelAr = 'تقاطع آمن ومطابق';
            let sevLabelEn = 'Safe Crossing';
            let issueAr = '';
            let issueEn = '';
            let recAr = '';
            let recEn = '';

            // Direct collision (physical crash in same elevation)
            if (deltaZ < 0.15) {
              severity = 'collision';
              sevLabelAr = 'اصطدام مباشر فيزيائي 💥';
              sevLabelEn = 'Direct Physical Collision 💥';
              issueAr = `تداخل الأنبوبين في نفس المنسوب تماماً (فارق الارتفاع ${deltaZ.toFixed(2)} م فقط).`;
              issueEn = `Direct physical clash at the exact same elevation (vertical delta ${deltaZ.toFixed(2)}m).`;
              recAr = 'يلزم فوراً تعديل مسار أحد الخطين أو خفض منسوب ماسورة الصرف الصحي لتوفير خلوص رأسي لا يقل عن 0.50 م.';
              recEn = 'Immediately realign one route or lower the sewer invert to achieve at least 0.50m vertical clearance.';
              collisionCount++;
            } else if (isWaterSewer) {
              // Critical Water vs Sewer Rules:
              // Water line must be strictly HIGHER than sewer line with at least 0.5m clearance
              const waterZ = typeA === 'water' ? zA : zB;
              const sewerZ = typeA === 'sewer' ? zA : zB;

              if (waterZ <= sewerZ) {
                // Water is BELOW Sewer -> Highly dangerous contamination risk
                severity = 'critical';
                sevLabelAr = 'تعارض حرج (خطر تلوث مياه) 🚨';
                sevLabelEn = 'Critical Hazard (Water Below Sewer) 🚨';
                issueAr = `خط مياه الشرب يقع أسفل خط الصرف الصحي بمنسوب (${waterZ.toFixed(2)} م مياه مقابل ${sewerZ.toFixed(2)} م صرف). خطر تسرب تلوث بيئي.`;
                issueEn = `Water main is positioned BELOW sewer line (${waterZ.toFixed(2)}m vs ${sewerZ.toFixed(2)}m). Severe contamination hazard.`;
                recAr = 'مخالفة كود صريحة: يجب رفع خط المياه ليكون أعلى من الصرف بمسافة 0.50 م على الأقل، أو تغليف ماسورة الصرف بقفص خرساني C25 بطول 3 م على الجانبين.';
                recEn = 'Code Violation: Water main must be raised above sewer by >= 0.50m, or enclose sewer with reinforced concrete sleeve for 3m each side.';
                criticalCount++;
              } else if (deltaZ < minVerticalClearanceM) {
                // Water above sewer but clearance < 0.5m
                severity = 'warning';
                sevLabelAr = 'خلوص رأسي غير كافٍ ⚠️';
                sevLabelEn = 'Insufficient Clearance ⚠️';
                issueAr = `الخلوص الرأسي بين المياه والصرف (${deltaZ.toFixed(2)} م) أقل من الحد الأدنى المعتمد بكود البناء (${minVerticalClearanceM} م).`;
                issueEn = `Vertical clearance (${deltaZ.toFixed(2)}m) is less than standard minimum code (${minVerticalClearanceM}m).`;
                recAr = 'يلزم صب فرشة وتغليف خرساني واقٍ (Concrete Encasement) حول خط الصرف بطول 3 أمتار.';
                recEn = 'Install reinforced concrete encasement around sewer pipe for 3 meters at intersection.';
                warningCount++;
              } else {
                severity = 'safe';
                sevLabelAr = 'تقاطع مطابق للكود ✅';
                sevLabelEn = 'Code Compliant Crossing ✅';
                issueAr = `خط المياه أعلى من خط الصرف بخلوص رأسي آمن قدره ${deltaZ.toFixed(2)} م (أكبر من 0.50 م).`;
                issueEn = `Water line safely above sewer with ${deltaZ.toFixed(2)}m vertical separation (> 0.50m).`;
                recAr = 'لا يلزم إجراء، التقاطع مستوفٍ لكود البناء واشتراطات شركة المياه.';
                recEn = 'No action needed. Crossing is fully compliant with standards.';
                safeCount++;
              }
            } else {
              // General utilities crossing
              if (deltaZ < 0.30) {
                severity = 'warning';
                sevLabelAr = 'تقارب مسارات ⚠️';
                sevLabelEn = 'Close Proximity ⚠️';
                issueAr = `المسافة الرأسية بين الخطين (${deltaZ.toFixed(2)} م) متقاربة جداً.`;
                issueEn = `Vertical separation (${deltaZ.toFixed(2)}m) is tight.`;
                recAr = 'تأكد من تركيب وسائد رملية عازلة بين الخطين أثناء التنفيذ الميداني.';
                recEn = 'Ensure installing sand cushions between pipes during construction.';
                warningCount++;
              } else {
                severity = 'safe';
                safeCount++;
              }
            }

            clashes.push({
              id: `CLASH_${clashes.length + 1}_${lineA.id}_${lineB.id}`,
              intersectionPoint: {
                x: Number(cross.x.toFixed(6)),
                y: Number(cross.y.toFixed(6)),
                z1: zA,
                z2: zB
              },
              line1: {
                id: lineA.id,
                name: String(lineA.id || lineA.layer || 'Line 1'),
                layer: lineA.layer || 'Utility 1',
                type: typeA,
                elevationAtCross: zA,
                diameterMm: diaA
              },
              line2: {
                id: lineB.id,
                name: String(lineB.id || lineB.layer || 'Line 2'),
                layer: lineB.layer || 'Utility 2',
                type: typeB,
                elevationAtCross: zB,
                diameterMm: diaB
              },
              verticalClearanceM: Number(deltaZ.toFixed(2)),
              severity,
              severityLabelAr: sevLabelAr,
              severityLabelEn: sevLabelEn,
              issueDescriptionAr: issueAr,
              issueDescriptionEn: issueEn,
              recommendationAr: recAr,
              recommendationEn: recEn
            });
          }
        }
      }
    }
  }

  return {
    totalCrossingsFound: clashes.length,
    criticalClashesCount: criticalCount,
    collisionCount,
    warningCount,
    safeCount,
    waterSewerCrossingsCount: waterSewerCount,
    clashes,
    scannedLayers: Array.from(layersSet)
  };
}

/**
 * Exports Clash Detection Report to Excel
 */
export function exportClashReportExcel(summary: ClashDetectionSummary, filename: string = 'Clash_Detection_Audit'): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ['تقرير فحص التعارضات الميدانية وتقاطعات الشبكات (Utility Clash Detection Report)'],
    ['المشروع / الملف:', filename],
    ['تاريخ الفحص:', new Date().toLocaleDateString('ar-SA')],
    [''],
    ['--- ملخص إحصائيات التعارضات ---'],
    ['المؤشر', 'القيمة'],
    ['إجمالي نقاط التقاطع المكتشفة:', summary.totalCrossingsFound],
    ['تقاطعات المياه مع الصرف الصحي:', summary.waterSewerCrossingsCount],
    ['اصطدامات فيزيائية مباشرة (Collision):', summary.collisionCount],
    ['تعارضات حرجة (مياه أسفل الصرف / خطر تلوث):', summary.criticalClashesCount],
    ['تحذيرات خلوص رأسي غير كافٍ (< 0.5m):', summary.warningCount],
    ['تقاطعات آمنة ومطابقة للكود:', summary.safeCount],
    ['']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص التعارضات');

  const headers = [
    'معرف التعارض (ID)',
    'خط 1 (ID)',
    'طبقة خط 1',
    'نوع خط 1',
    'منسوب خط 1 (م)',
    'خط 2 (ID)',
    'طبقة خط 2',
    'نوع خط 2',
    'منسوب خط 2 (م)',
    'فارق الارتفاع الرأسي (م)',
    'مستوى الخطورة (Severity)',
    'وصف التعارض',
    'التوصية الهندسية الموصى بها',
    'خط الطول (Longitude)',
    'دائرة العرض (Latitude)'
  ];

  const rows = summary.clashes.map(c => [
    c.id,
    c.line1.id,
    c.line1.layer,
    c.line1.type === 'water' ? 'مياه' : c.line1.type === 'sewer' ? 'صرف صحي' : c.line1.type,
    c.line1.elevationAtCross,
    c.line2.id,
    c.line2.layer,
    c.line2.type === 'water' ? 'مياه' : c.line2.type === 'sewer' ? 'صرف صحي' : c.line2.type,
    c.line2.elevationAtCross,
    c.verticalClearanceM,
    c.severityLabelAr,
    c.issueDescriptionAr,
    c.recommendationAr,
    c.intersectionPoint.x,
    c.intersectionPoint.y
  ]);

  const wsDetails = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, wsDetails, 'سجل التعارضات المفصل');

  XLSX.writeFile(wb, `${filename}_Clashes.xlsx`);
}
