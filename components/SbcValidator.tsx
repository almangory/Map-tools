import React, { useState, useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Droplets, Waves, Ruler,
  ArrowDownUp, FileSpreadsheet, Eye, Info, Search, Filter, ShieldAlert,
  Building2, ArrowRight, RefreshCw, Check, X, Compass, FileText,
  Download, Palette, ChevronDown, Layers, FileCode, Sparkles
} from 'lucide-react';
import { GeoPoint } from '../types';
import * as XLSX from 'xlsx';

interface SbcValidatorProps {
  points: GeoPoint[];
  lang: 'ar' | 'en';
  onHighlightPoints?: (points: GeoPoint[], color: string) => void;
  onApplySbcColors?: (coloredPoints: GeoPoint[]) => void;
}

export interface ValidationIssue {
  id: string;
  type: 'SEWER_SUB' | 'SEWER_MAIN' | 'WATER_SUB' | 'WATER_MAIN' | 'HORIZ_SEPARATION' | 'VERT_CROSSING';
  severity: 'error' | 'warning' | 'success';
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  actualValue: string;
  expectedValue: string;
  points: GeoPoint[];
  locationStr?: string;
}

// Helper to extract pipe diameter in mm
export const extractDiameterMm = (pt: GeoPoint): number | null => {
  const text = `${pt.layer || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''} ${JSON.stringify(pt.attributes || {})}`;
  const mmMatch = text.match(/(?:DN|Ø|\b)?\s*(\d{2,4})\s*(?:MM|مم)/i);
  if (mmMatch) return parseInt(mmMatch[1], 10);

  const inchMatch = text.match(/(\d{1,2})\s*(?:"|INCH|بوصة|بوصه)/i);
  if (inchMatch) return Math.round(parseInt(inchMatch[1], 10) * 25.4);

  if (pt.attributes) {
    for (const [key, val] of Object.entries(pt.attributes)) {
      if (/dia|diameter|size|dn|قطر/i.test(key)) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          return num < 50 ? Math.round(num * 25.4) : num;
        }
      }
    }
  }

  return null;
};

// Helper to extract pipe depth in meters
export const extractDepthMeters = (pt: GeoPoint): number | null => {
  if (pt.attributes) {
    for (const [key, val] of Object.entries(pt.attributes)) {
      if (/depth|عمق|h_cover|cover/i.test(key)) {
        const num = parseFloat(val);
        if (!isNaN(num)) return num;
      }
    }
  }
  const text = `${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''}`;
  const depthMatch = text.match(/(?:depth|عمق)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (depthMatch) return parseFloat(depthMatch[1]);

  if (pt.z !== undefined && pt.z < 0) {
    return Math.abs(pt.z);
  }

  return null;
};

// Helper for Euclidean 2D distance
export const getDistanceMeters = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const distSq = dx * dx + dy * dy;

  if (Math.abs(p1.x) <= 180 && Math.abs(p1.y) <= 90) {
    const R = 6371000;
    const lat1 = (p1.y * Math.PI) / 180;
    const lat2 = (p2.y * Math.PI) / 180;
    const dLat = ((p2.y - p1.y) * Math.PI) / 180;
    const dLon = ((p2.x - p1.x) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  return Math.sqrt(distSq);
};

export function performSbcAuditEngine(points: GeoPoint[]): ValidationIssue[] {
  const sewerPoints: GeoPoint[] = [];
  const waterPoints: GeoPoint[] = [];

  points.forEach(pt => {
    const layerUpper = (pt.layer || '').toUpperCase();
    const descUpper = (pt.description || '').toUpperCase();
    const attrStr = JSON.stringify(pt.attributes || {}).toUpperCase();
    const fullText = `${layerUpper} ${descUpper} ${attrStr} ${pt.attr1 || ''} ${pt.attr2 || ''}`;

    if (
      fullText.includes('SEWER') ||
      fullText.includes('SAN') ||
      fullText.includes('WW') ||
      fullText.includes('DRAIN') ||
      fullText.includes('صرف') ||
      fullText.includes('مجاري')
    ) {
      sewerPoints.push(pt);
    } else if (
      fullText.includes('WATER') ||
      fullText.includes('WTR') ||
      fullText.includes('POTABLE') ||
      fullText.includes('MOW') ||
      fullText.includes('ماء') ||
      fullText.includes('مياه') ||
      fullText.includes('شرب')
    ) {
      waterPoints.push(pt);
    }
  });

  const issues: ValidationIssue[] = [];

  sewerPoints.forEach((pt, idx) => {
    const dia = extractDiameterMm(pt);
    const depth = extractDepthMeters(pt);
    const isMainTrunk = (pt.layer || '').toUpperCase().includes('TRUNK') ||
                        (pt.layer || '').toUpperCase().includes('MAIN') ||
                        (dia && dia >= 400);

    if (isMainTrunk) {
      if (dia !== null && dia < 400) {
        issues.push({
          id: `sewer-main-dia-${idx}`,
          type: 'SEWER_MAIN',
          severity: 'warning',
          titleAr: 'قطر خط الصرف الرئيسي الناقل أقل من الكود السعودي',
          titleEn: 'Main Trunk Sewer Diameter Below SBC Standard',
          descriptionAr: `القطر المحدد (${dia} مم) أقل من النطاق الدارج للخطوط الناقلة في الكود السعودي.`,
          descriptionEn: `Diameter (${dia} mm) is below standard SBC trunk line range.`,
          actualValue: `${dia} mm`,
          expectedValue: '400 - 1000+ mm',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
      if (depth !== null && depth < 3.0) {
        issues.push({
          id: `sewer-main-depth-${idx}`,
          type: 'SEWER_MAIN',
          severity: 'error',
          titleAr: 'عمق خط الصرف الرئيسي الناقل ضحيل وفق الكود السعودي',
          titleEn: 'Main Sewer Line Depth Too Shallow per SBC',
          descriptionAr: `العمق الحالي (${depth.toFixed(2)} م) أقل من الحد الأدنى للخطوط الرئيسية.`,
          descriptionEn: `Current depth (${depth.toFixed(2)} m) is shallower than standard SBC main line depth.`,
          actualValue: `${depth.toFixed(2)} m`,
          expectedValue: '3.0m - 7.0m+',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
    } else {
      if (dia !== null && (dia < 200 || dia > 300)) {
        issues.push({
          id: `sewer-sub-dia-${idx}`,
          type: 'SEWER_SUB',
          severity: 'warning',
          titleAr: 'قطر خط الصرف الفرعي خارج نطاق الكود السعودي النموذجي',
          titleEn: 'Sub-main Sewer Line Diameter Out of Typical SBC Range',
          descriptionAr: `القطر الحالي (${dia} مم) خارج النطاق النموذجي للخطوط الفرعية.`,
          descriptionEn: `Diameter (${dia} mm) is outside typical sub-main range.`,
          actualValue: `${dia} mm`,
          expectedValue: '200 - 300 mm',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
      if (depth !== null && (depth < 1.5 || depth > 3.0)) {
        issues.push({
          id: `sewer-sub-depth-${idx}`,
          type: 'SEWER_SUB',
          severity: 'warning',
          titleAr: 'عمق حفر خط الصرف الفرعي خارج حدود الكود النموذجية',
          titleEn: 'Sub-main Sewer Depth Outside Standard SBC Range',
          descriptionAr: `عمق الحفر (${depth.toFixed(2)} م) خارج النطاق النموذجي.`,
          descriptionEn: `Depth (${depth.toFixed(2)} m) is outside typical SBC range.`,
          actualValue: `${depth.toFixed(2)} m`,
          expectedValue: '1.5m - 3.0m',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
    }
  });

  waterPoints.forEach((pt, idx) => {
    const dia = extractDiameterMm(pt);
    const depth = extractDepthMeters(pt);
    const isMainTrans = (pt.layer || '').toUpperCase().includes('MAIN') ||
                        (pt.layer || '').toUpperCase().includes('TRANS') ||
                        (dia && dia >= 300);

    if (isMainTrans) {
      if (dia !== null && dia < 300) {
        issues.push({
          id: `water-main-dia-${idx}`,
          type: 'WATER_MAIN',
          severity: 'warning',
          titleAr: 'قطر خط مياه الشرب الرئيسي الناقل أقل من المواصفات',
          titleEn: 'Main Water Transmission Diameter Below Specs',
          descriptionAr: `القطر المحدد (${dia} مم) أقل من الأقطار الكودية لخطوط النقل.`,
          descriptionEn: `Diameter (${dia} mm) is less than standard main transmission diameter.`,
          actualValue: `${dia} mm`,
          expectedValue: '300 - 1000+ mm',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
    } else {
      if (dia !== null && (dia < 110 || dia > 160)) {
        issues.push({
          id: `water-sub-dia-${idx}`,
          type: 'WATER_SUB',
          severity: 'warning',
          titleAr: 'قطر خط التوزيع الفرعي للمياه خارج نطاق الكود',
          titleEn: 'Water Distribution Pipe Diameter Out of SBC Range',
          descriptionAr: `القطر الحالي (${dia} مم) خارج النطاق الدارج لخطوط التوزيع الفرعية.`,
          descriptionEn: `Diameter (${dia} mm) is outside typical distribution range.`,
          actualValue: `${dia} mm`,
          expectedValue: '110 - 160 mm',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
      if (depth !== null && (depth < 0.8 || depth > 1.2)) {
        issues.push({
          id: `water-sub-depth-${idx}`,
          type: 'WATER_SUB',
          severity: 'warning',
          titleAr: 'عمق خط توزيع المياه الفرعي لا يطابق اشتراط الكود',
          titleEn: 'Water Distribution Pipe Depth Outside SBC Range',
          descriptionAr: `عمق الحفر (${depth.toFixed(2)} م) يختلف عن العمق القريب المعتمد تحت الأرصفة.`,
          descriptionEn: `Depth (${depth.toFixed(2)} m) differs from SBC standard depth under sidewalk.`,
          actualValue: `${depth.toFixed(2)} m`,
          expectedValue: '0.8m - 1.2m',
          points: [pt],
          locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
        });
      }
    }
  });

  if (waterPoints.length > 0 && sewerPoints.length > 0) {
    const sampleWater = waterPoints.slice(0, 150);
    const sampleSewer = sewerPoints.slice(0, 150);
    sampleWater.forEach(wPt => {
      sampleSewer.forEach(sPt => {
        const dist = getDistanceMeters(wPt, sPt);
        if (dist > 0.05 && dist < 3.0) {
          issues.push({
            id: `horiz-sep-${wPt.id || sPt.id}`,
            type: 'HORIZ_SEPARATION',
            severity: 'error',
            titleAr: 'مخالفة مسافة الفصل الأفقية الإلزامية بين المياه والصرف (< 3 أمتار)',
            titleEn: 'Mandatory Horizontal Separation Violation (< 3.0 m)',
            descriptionAr: `مسافة الفصل الأفقية بين خط مياه الشرب وخط الصرف الصحي أقل من 3 أمتار. المسافة الحالية: ${dist.toFixed(2)} م.`,
            descriptionEn: `Horizontal separation between water and sewer mains is less than 3.0 m. Current: ${dist.toFixed(2)} m.`,
            actualValue: `${dist.toFixed(2)} m`,
            expectedValue: '≥ 3.0 m',
            points: [wPt, sPt],
            locationStr: `Water: (${wPt.x.toFixed(2)}, ${wPt.y.toFixed(2)}) | Sewer: (${sPt.x.toFixed(2)}, ${sPt.y.toFixed(2)})`,
          });
        }
      });
    });
  }

  return issues;
}

export const SbcValidator: React.FC<SbcValidatorProps> = ({
  points,
  lang,
  onHighlightPoints,
  onApplySbcColors,
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'reference'>('audit');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'success'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mapColorMode, setMapColorMode] = useState<'none' | 'full' | 'errors' | 'warnings'>('none');

  // Network specification mode by user ('auto' = keyword matching, 'sewer' = force all as sewer, 'water' = force all as water, 'custom' = assign layers)
  const [networkTypeMode, setNetworkTypeMode] = useState<'auto' | 'sewer' | 'water' | 'custom'>('auto');
  const [selectedSewerLayers, setSelectedSewerLayers] = useState<string[]>([]);
  const [selectedWaterLayers, setSelectedWaterLayers] = useState<string[]>([]);

  // Unique layers in the uploaded file
  const availableLayers = useMemo(() => {
    const layers = new Set<string>();
    points.forEach(pt => {
      if (pt.layer) layers.add(pt.layer);
    });
    return Array.from(layers);
  }, [points]);

  // 1. Identify Sewer & Water Points / Polyline Segments
  const parsedNetworks = useMemo(() => {
    const sewerPoints: GeoPoint[] = [];
    const waterPoints: GeoPoint[] = [];
    const otherPoints: GeoPoint[] = [];

    if (networkTypeMode === 'sewer') {
      return { sewerPoints: [...points], waterPoints: [], otherPoints: [] };
    }

    if (networkTypeMode === 'water') {
      return { sewerPoints: [], waterPoints: [...points], otherPoints: [] };
    }

    if (networkTypeMode === 'custom') {
      points.forEach(pt => {
        const l = pt.layer || '';
        if (selectedSewerLayers.includes(l)) {
          sewerPoints.push(pt);
        } else if (selectedWaterLayers.includes(l)) {
          waterPoints.push(pt);
        } else {
          otherPoints.push(pt);
        }
      });
      return { sewerPoints, waterPoints, otherPoints };
    }

    // Default 'auto' mode
    points.forEach(pt => {
      const layerUpper = (pt.layer || '').toUpperCase();
      const descUpper = (pt.description || '').toUpperCase();
      const attrStr = JSON.stringify(pt.attributes || {}).toUpperCase();
      const fullText = `${layerUpper} ${descUpper} ${attrStr} ${pt.attr1 || ''} ${pt.attr2 || ''}`;

      if (
        fullText.includes('SEWER') ||
        fullText.includes('SAN') ||
        fullText.includes('WW') ||
        fullText.includes('DRAIN') ||
        fullText.includes('صرف') ||
        fullText.includes('مجاري')
      ) {
        sewerPoints.push(pt);
      } else if (
        fullText.includes('WATER') ||
        fullText.includes('WTR') ||
        fullText.includes('POTABLE') ||
        fullText.includes('MOW') ||
        fullText.includes('ماء') ||
        fullText.includes('مياه') ||
        fullText.includes('شرب')
      ) {
        waterPoints.push(pt);
      } else {
        otherPoints.push(pt);
      }
    });

    return { sewerPoints, waterPoints, otherPoints };
  }, [points, networkTypeMode, selectedSewerLayers, selectedWaterLayers]);

  // Helper to extract pipe diameter in mm
  const extractDiameterMm = (pt: GeoPoint): number | null => {
    const text = `${pt.layer || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''} ${JSON.stringify(pt.attributes || {})}`;
    
    // Look for patterns like 200mm, 300 mm, 8", 12 inch, DN300, Ø200
    const mmMatch = text.match(/(?:DN|Ø|\b)?\s*(\d{2,4})\s*(?:MM|مم)/i);
    if (mmMatch) return parseInt(mmMatch[1], 10);

    const inchMatch = text.match(/(\d{1,2})\s*(?:"|INCH|بوصة|بوصه)/i);
    if (inchMatch) return Math.round(parseInt(inchMatch[1], 10) * 25.4);

    if (pt.attributes) {
      for (const [key, val] of Object.entries(pt.attributes)) {
        if (/dia|diameter|size|dn|قطر/i.test(key)) {
          const num = parseFloat(val);
          if (!isNaN(num)) {
            // If < 50, likely in inches
            return num < 50 ? Math.round(num * 25.4) : num;
          }
        }
      }
    }

    return null;
  };

  // Helper to extract pipe depth in meters
  const extractDepthMeters = (pt: GeoPoint): number | null => {
    if (pt.attributes) {
      for (const [key, val] of Object.entries(pt.attributes)) {
        if (/depth|عمق|h_cover|cover/i.test(key)) {
          const num = parseFloat(val);
          if (!isNaN(num)) return num;
        }
      }
    }
    const text = `${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''}`;
    const depthMatch = text.match(/(?:depth|عمق)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (depthMatch) return parseFloat(depthMatch[1]);

    if (pt.z !== undefined && pt.z < 0) {
      return Math.abs(pt.z);
    }

    return null;
  };

  // Helper for Euclidean 2D distance
  const getDistanceMeters = (p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;

    // Check if coordinates look like Lat/Lon (WGS84 degrees)
    if (Math.abs(p1.x) <= 180 && Math.abs(p1.y) <= 90) {
      const R = 6371000; // earth radius in meters
      const lat1 = (p1.y * Math.PI) / 180;
      const lat2 = (p2.y * Math.PI) / 180;
      const dLat = ((p2.y - p1.y) * Math.PI) / 180;
      const dLon = ((p2.x - p1.x) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    return Math.sqrt(distSq); // UTM meters
  };

  // 2. Perform Saudi Building Code Auditing
  const auditResults = useMemo(() => {
    const issues: ValidationIssue[] = [];
    const { sewerPoints, waterPoints } = parsedNetworks;

    // --- A. SEWER NETWORK AUDIT ---
    sewerPoints.forEach((pt, idx) => {
      const dia = extractDiameterMm(pt);
      const depth = extractDepthMeters(pt);
      const isMainTrunk = (pt.layer || '').toUpperCase().includes('TRUNK') ||
                          (pt.layer || '').toUpperCase().includes('MAIN') ||
                          (dia && dia >= 400);

      if (isMainTrunk) {
        // Sewer Trunk Lines SBC Specs: 400mm-1000mm+ (16"-40"+), Depth 3.0m - 7.0m+
        if (dia !== null) {
          if (dia < 400) {
            issues.push({
              id: `sewer-main-dia-${idx}`,
              type: 'SEWER_MAIN',
              severity: 'warning',
              titleAr: 'قطر خط الصرف الرئيسي الناقل أقل من الكود السعودي',
              titleEn: 'Main Trunk Sewer Diameter Below SBC Standard',
              descriptionAr: `القطر المحدد (${dia} مم) أقل من النطاق الدارج للخطوط الناقلة في الكود السعودي (400 مم إلى 1000+ مم / 16 إلى 40+ بوصة).`,
              descriptionEn: `Diameter (${dia} mm) is below standard SBC trunk line range (400 mm - 1000+ mm / 16" - 40"+).`,
              actualValue: `${dia} mm (${(dia / 25.4).toFixed(1)}")`,
              expectedValue: '400 - 1000+ mm (16" - 40"+)',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }

        if (depth !== null) {
          if (depth < 3.0) {
            issues.push({
              id: `sewer-main-depth-${idx}`,
              type: 'SEWER_MAIN',
              severity: 'error',
              titleAr: 'عمق خط الصرف الرئيسي الناقل ضحيل وفق الكود السعودي',
              titleEn: 'Main Sewer Line Depth Too Shallow per SBC',
              descriptionAr: `العمق الحالي (${depth.toFixed(2)} م) أقل من الحد الأدنى النموذج للخطوط الرئيسية الناقلة (3.0 م إلى 7.0+ م) لمنع تركيز الإجهادات.`,
              descriptionEn: `Current depth (${depth.toFixed(2)} m) is shallower than standard SBC main line depth (3.0m - 7.0m+).`,
              actualValue: `${depth.toFixed(2)} m`,
              expectedValue: '3.0m - 7.0m+',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }
      } else {
        // Sub-main / Lateral Lines SBC Specs: 200mm-300mm (8"-12"), Depth 1.5m - 3.0m
        if (dia !== null) {
          if (dia < 200 || dia > 300) {
            issues.push({
              id: `sewer-sub-dia-${idx}`,
              type: 'SEWER_SUB',
              severity: 'warning',
              titleAr: 'قطر خط الصرف الفرعي خارج نطاق الكود السعودي النموذجي',
              titleEn: 'Sub-main Sewer Line Diameter Out of Typical SBC Range',
              descriptionAr: `القطر الحالي (${dia} مم) خارج النطاق النموذجي للخطوط الفرعية للحي (200 مم إلى 300 مم / 8 إلى 12 بوصة).`,
              descriptionEn: `Diameter (${dia} mm) is outside typical sub-main range (200 mm - 300 mm / 8" - 12").`,
              actualValue: `${dia} mm (${(dia / 25.4).toFixed(1)}")`,
              expectedValue: '200 - 300 mm (8" - 12")',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }

        if (depth !== null) {
          if (depth < 1.5 || depth > 3.0) {
            issues.push({
              id: `sewer-sub-depth-${idx}`,
              type: 'SEWER_SUB',
              severity: 'warning',
              titleAr: 'عمق حفر خط الصرف الفرعي خارج حدود الكود النموذجية',
              titleEn: 'Sub-main Sewer Depth Outside Standard SBC Range',
              descriptionAr: `عمق الحفر (${depth.toFixed(2)} م) خارج النطاق النموذجي (1.5 م إلى 3.0 م عن مستوى الأسفلت).`,
              descriptionEn: `Depth (${depth.toFixed(2)} m) is outside typical SBC range (1.5 m - 3.0 m).`,
              actualValue: `${depth.toFixed(2)} m`,
              expectedValue: '1.5m - 3.0m',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }
      }
    });

    // --- B. WATER NETWORK AUDIT ---
    waterPoints.forEach((pt, idx) => {
      const dia = extractDiameterMm(pt);
      const depth = extractDepthMeters(pt);
      const isMainTrans = (pt.layer || '').toUpperCase().includes('MAIN') ||
                          (pt.layer || '').toUpperCase().includes('TRANS') ||
                          (dia && dia >= 300);

      if (isMainTrans) {
        // Main Water Transmission Lines: 300mm-1000mm+ (12"-40"+)
        if (dia !== null && dia < 300) {
          issues.push({
            id: `water-main-dia-${idx}`,
            type: 'WATER_MAIN',
            severity: 'warning',
            titleAr: 'قطر خط مياه الشرب الرئيسي الناقل أقل من المواصفات',
            titleEn: 'Main Water Transmission Diameter Below Specs',
            descriptionAr: `القطر المحدد (${dia} مم) أقل من الأقطار الضخمة لخطوط النقل الرئيسية الكودية (تبدأ من 300 مم / 12 بوصة إلى +1000 مم).`,
            descriptionEn: `Diameter (${dia} mm) is less than standard main transmission diameter (300 mm+ / 12"+).`,
            actualValue: `${dia} mm`,
            expectedValue: '300 - 1000+ mm (12" - 40"+)',
            points: [pt],
            locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
          });
        }
      } else {
        // Water Distribution Sub-lines: 110mm-160mm (4"-6"), Depth 0.8m - 1.2m
        if (dia !== null) {
          if (dia < 110 || dia > 160) {
            issues.push({
              id: `water-sub-dia-${idx}`,
              type: 'WATER_SUB',
              severity: 'warning',
              titleAr: 'قطر خط التوزيع الفرعي للمياه خارج نطاق الكود',
              titleEn: 'Water Distribution Pipe Diameter Out of SBC Range',
              descriptionAr: `القطر الحالي (${dia} مم) خارج النطاق الدارج لخطوط التوزيع الفرعية تحت الأرصفة (110 مم إلى 160 مم / 4 إلى 6 بوصات).`,
              descriptionEn: `Diameter (${dia} mm) is outside typical distribution range (110 mm - 160 mm / 4" - 6").`,
              actualValue: `${dia} mm`,
              expectedValue: '110 - 160 mm (4" - 6")',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }

        if (depth !== null) {
          if (depth < 0.8 || depth > 1.2) {
            issues.push({
              id: `water-sub-depth-${idx}`,
              type: 'WATER_SUB',
              severity: 'warning',
              titleAr: 'عمق خط توزيع المياه الفرعي لا يطابق اشتراط الكود',
              titleEn: 'Water Distribution Pipe Depth Outside SBC Range',
              descriptionAr: `عمق الحفر (${depth.toFixed(2)} م) يختلف عن العمق القريب المعتمد تحت الأرصفة (0.8 م إلى 1.2 م).`,
              descriptionEn: `Depth (${depth.toFixed(2)} m) differs from SBC standard depth under sidewalk (0.8 m - 1.2 m).`,
              actualValue: `${depth.toFixed(2)} m`,
              expectedValue: '0.8m - 1.2m',
              points: [pt],
              locationStr: `X: ${pt.x.toFixed(2)}, Y: ${pt.y.toFixed(2)}`,
            });
          }
        }
      }
    });

    // --- C. MANDATORY SEPARATION DISTANCE AUDIT (الكود السعودي) ---
    // 1. Horizontal Separation Distance Check (< 3.0 meters)
    if (waterPoints.length > 0 && sewerPoints.length > 0) {
      const closePairs: { waterPt: GeoPoint; sewerPt: GeoPoint; dist: number }[] = [];

      // Sample or pair-wise check
      const sampleWater = waterPoints.slice(0, 150);
      const sampleSewer = sewerPoints.slice(0, 150);

      sampleWater.forEach(wPt => {
        sampleSewer.forEach(sPt => {
          const dist = getDistanceMeters(wPt, sPt);
          if (dist > 0.05 && dist < 3.0) {
            closePairs.push({ waterPt: wPt, sewerPt: sPt, dist });
          }
        });
      });

      // Group or report top critical horizontal separation issues (< 3m)
      if (closePairs.length > 0) {
        closePairs.slice(0, 10).forEach((pair, cIdx) => {
          issues.push({
            id: `horiz-sep-${cIdx}`,
            type: 'HORIZ_SEPARATION',
            severity: 'error',
            titleAr: 'مخالفة مسافة الفصل الأفقية الإلزامية بين المياه والصرف (< 3 أمتار)',
            titleEn: 'Mandatory Horizontal Separation Violation (< 3.0 m)',
            descriptionAr: `وفقاً لكود البناء السعودي، يجب ألا تقل المسافة الأفقية بين خط مياه الشرب الرئيسي وخط الصرف الصحي عن 3 أمتار للحد من خطر التلوث. المسافة الحالية: ${pair.dist.toFixed(2)} متر.`,
            descriptionEn: `SBC mandates at least 3.0 meters horizontal separation between water and sewer mains to prevent cross-contamination. Current: ${pair.dist.toFixed(2)} m.`,
            actualValue: `${pair.dist.toFixed(2)} m`,
            expectedValue: '≥ 3.0 m',
            points: [pair.waterPt, pair.sewerPt],
            locationStr: `Water: (${pair.waterPt.x.toFixed(2)}, ${pair.waterPt.y.toFixed(2)}) | Sewer: (${pair.sewerPt.x.toFixed(2)}, ${pair.sewerPt.y.toFixed(2)})`,
          });
        });
      }

      // 2. Vertical Separation & Crossing Clearance Check
      sampleWater.forEach((wPt, wIdx) => {
        if (wPt.z !== undefined) {
          sampleSewer.forEach((sPt, sIdx) => {
            if (sPt.z !== undefined) {
              const horizDist = getDistanceMeters(wPt, sPt);
              if (horizDist < 1.5) {
                // Potential crossing / overlapping point
                const vertDiff = wPt.z - sPt.z; // water Z minus sewer Z
                
                if (vertDiff < 0.3) {
                  issues.push({
                    id: `vert-cross-${wIdx}-${sIdx}`,
                    type: 'VERT_CROSSING',
                    severity: 'error',
                    titleAr: 'مخالفة التقاطع / الفصل الرأسي بين أنبوب المياه والصرف الصحي',
                    titleEn: 'Vertical Separation / Crossing Clearance Violation',
                    descriptionAr: `يشترط الكود السعودي مرور خط المياه أعلى خط الصرف بفرق رأسي نظيف لا يقل عن 0.3 متر (30 سم). وفي حال التمرير أسفل الصرف يُلزم بتغليف أنبوب الصرف بغلاف خرساني أو عازل صلاد بمسافة 3م من كل جانب.`,
                    descriptionEn: `SBC requires water pipe to pass ABOVE sewer pipe with at least 0.3m (30cm) clean clearance. Otherwise concrete encasement (3m length) is mandatory.`,
                    actualValue: `فرق الارتفاع: ${vertDiff.toFixed(2)} m`,
                    expectedValue: 'المياه أعلى الصرف بـ ≥ 0.3m أو تغليف خرساني 3m',
                    points: [wPt, sPt],
                    locationStr: `Water Elevation: ${wPt.z.toFixed(2)}m, Sewer Elevation: ${sPt.z.toFixed(2)}m`,
                  });
                }
              }
            }
          });
        }
      });
    }

    // If no issues, add a success indicator
    if (issues.length === 0 && points.length > 0) {
      issues.push({
        id: 'all-passed',
        type: 'SEWER_SUB',
        severity: 'success',
        titleAr: 'جميع الخطوط المفحوصة مطابقة لاشتراطات كود البناء السعودي الأساسية',
        titleEn: 'All Analyzed Utilities Comply with Saudi Building Code Guidelines',
        descriptionAr: 'لم يتم العثور على أي مخالفات صريحة لأقطار وأعماق الحفر أو مسافات الفصل الأفقية في البيانات المرفوعة.',
        descriptionEn: 'No explicit violations of pipe diameters, depths, or minimum 3m horizontal separation were found in uploaded data.',
        actualValue: '100% Compliant',
        expectedValue: 'SBC Standard',
        points: [],
      });
    }

    return issues;
  }, [parsedNetworks, points]);

  // Statistics
  const stats = useMemo(() => {
    const total = auditResults.length;
    const errors = auditResults.filter(i => i.severity === 'error').length;
    const warnings = auditResults.filter(i => i.severity === 'warning').length;
    const success = auditResults.filter(i => i.severity === 'success').length;

    const complianceScore = points.length === 0 ? 100 : Math.max(0, Math.round(100 - (errors * 15 + warnings * 5)));

    return { total, errors, warnings, success, complianceScore };
  }, [auditResults, points]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    return auditResults.filter(item => {
      if (filterSeverity !== 'all' && item.severity !== filterSeverity) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.titleAr.toLowerCase().includes(q) ||
          item.titleEn.toLowerCase().includes(q) ||
          item.descriptionAr.toLowerCase().includes(q) ||
          item.descriptionEn.toLowerCase().includes(q) ||
          (item.locationStr && item.locationStr.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [auditResults, filterSeverity, searchQuery]);

  // --- MAP COLOR CODING HANDLER ---
  const handleApplySbcColorCodingToMap = (mode: 'full' | 'errors' | 'warnings' | 'reset') => {
    setMapColorMode(mode);

    if (mode === 'reset') {
      const resetPoints = points.map(pt => ({ ...pt, color: undefined }));
      if (onApplySbcColors) onApplySbcColors(resetPoints);
      return;
    }

    // Build a severity lookup map for point IDs
    const pointSeverityMap = new Map<string, 'error' | 'warning' | 'success'>();

    auditResults.forEach(issue => {
      issue.points.forEach(pt => {
        const existing = pointSeverityMap.get(pt.id);
        if (issue.severity === 'error') {
          pointSeverityMap.set(pt.id, 'error');
        } else if (issue.severity === 'warning' && existing !== 'error') {
          pointSeverityMap.set(pt.id, 'warning');
        }
      });
    });

    const updatedPoints = points.map(pt => {
      const sev = pointSeverityMap.get(pt.id);

      if (sev === 'error') {
        return { ...pt, color: '#FF0055' }; // Neon Red for Critical Violations
      } else if (sev === 'warning') {
        return { ...pt, color: '#FFD700' }; // Amber/Gold for Warnings
      } else {
        if (mode === 'errors' || mode === 'warnings') {
          return pt; // keep current
        }
        return { ...pt, color: '#00E676' }; // Emerald Green for Pass/Compliant
      }
    });

    if (onApplySbcColors) {
      onApplySbcColors(updatedPoints);
    } else if (onHighlightPoints) {
      const targetPts = updatedPoints.filter(p =>
        mode === 'errors' ? p.color === '#FF0055' : p.color === '#FF0055' || p.color === '#FFD700'
      );
      onHighlightPoints(targetPts, mode === 'errors' ? '#FF0055' : '#FFD700');
    }
  };

  // --- EXPORT FUNCTIONS ---
  // 1. Export Excel (.xlsx) with Summary & Findings
  const exportSbcAuditExcel = () => {
    if (auditResults.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryRows = [
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'نسبة المطابقة لكود البناء السعودي' : 'SBC Compliance Index', [lang === 'ar' ? 'القيمة' : 'Value']: `${stats.complianceScore}%` },
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'إجمالي عناصر الصرف الصحي' : 'Sewer Lines Evaluated', [lang === 'ar' ? 'القيمة' : 'Value']: parsedNetworks.sewerPoints.length },
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'إجمالي عناصر مياه الشرب' : 'Water Lines Evaluated', [lang === 'ar' ? 'القيمة' : 'Value']: parsedNetworks.waterPoints.length },
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'المخالفات الصريحة (Errors)' : 'Critical Violations', [lang === 'ar' ? 'القيمة' : 'Value']: stats.errors },
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'التحذيرات والملاحظات (Warnings)' : 'Warnings', [lang === 'ar' ? 'القيمة' : 'Value']: stats.warnings },
      { [lang === 'ar' ? 'المؤشر / المعيار' : 'Metric']: lang === 'ar' ? 'تاريخ التدقيق' : 'Audit Timestamp', [lang === 'ar' ? 'القيمة' : 'Value']: new Date().toLocaleString() },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'SBC_Summary');

    // Detailed Findings Sheet
    const rows = auditResults.map((item, index) => ({
      '#': index + 1,
      [lang === 'ar' ? 'نوع الفحص' : 'Check Type']: item.type,
      [lang === 'ar' ? 'درجة المخالفة' : 'Severity']: item.severity.toUpperCase(),
      [lang === 'ar' ? 'العنوان' : 'Title']: lang === 'ar' ? item.titleAr : item.titleEn,
      [lang === 'ar' ? 'التفاصيل والوصف' : 'Description']: lang === 'ar' ? item.descriptionAr : item.descriptionEn,
      [lang === 'ar' ? 'القيمة الحالية' : 'Actual Value']: item.actualValue,
      [lang === 'ar' ? 'اشتراط الكود السعودي' : 'SBC Requirement']: item.expectedValue,
      [lang === 'ar' ? 'الموقع والاحداثيات' : 'Location']: item.locationStr || '-',
    }));

    const wsDetails = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Audit_Findings');

    XLSX.writeFile(wb, `Saudi_Building_Code_Audit_Report_${Date.now()}.xlsx`);
    setShowExportMenu(false);
  };

  // 2. Export CSV (.csv)
  const exportSbcAuditCsv = () => {
    if (auditResults.length === 0) return;
    const rows = auditResults.map((item, index) => ({
      'ID': index + 1,
      'CheckType': item.type,
      'Severity': item.severity.toUpperCase(),
      'Title': lang === 'ar' ? item.titleAr : item.titleEn,
      'Description': lang === 'ar' ? item.descriptionAr : item.descriptionEn,
      'ActualValue': item.actualValue,
      'ExpectedValue': item.expectedValue,
      'Location': item.locationStr || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const csvStr = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["\uFEFF" + csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SBC_Audit_Findings_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // 3. Export Executive Text Report (.txt)
  const exportSbcExecutiveTxtReport = () => {
    const isAr = lang === 'ar';
    let report = `========================================================================\n`;
    report += `     ${isAr ? 'تقرير المطابقة والتدقيق الهندسي لكود البناء السعودي (SBC)' : 'SAUDI BUILDING CODE (SBC) ENGINEERING COMPLIANCE AUDIT REPORT'}\n`;
    report += `========================================================================\n`;
    report += `${isAr ? 'تاريخ التقرير' : 'Date'}: ${new Date().toLocaleString()}\n`;
    report += `${isAr ? 'نسبة المطابقة العامة' : 'Compliance Index Score'}: ${stats.complianceScore}%\n`;
    report += `${isAr ? 'عدد خطوط الصرف الصحي' : 'Sewer Lines Evaluated'}: ${parsedNetworks.sewerPoints.length}\n`;
    report += `${isAr ? 'عدد خطوط مياه الشرب' : 'Water Lines Evaluated'}: ${parsedNetworks.waterPoints.length}\n`;
    report += `${isAr ? 'عدد المخالفات الصريحة (Errors)' : 'Critical Violations'}: ${stats.errors}\n`;
    report += `${isAr ? 'عدد التحذيرات (Warnings)' : 'Warnings'}: ${stats.warnings}\n\n`;

    report += `------------------------------------------------------------------------\n`;
    report += `                    ${isAr ? 'نتائج الفحص والتفاصيل' : 'AUDIT FINDINGS DETAILS'}\n`;
    report += `------------------------------------------------------------------------\n\n`;

    auditResults.forEach((issue, idx) => {
      report += `[${idx + 1}] [${issue.severity.toUpperCase()}] ${isAr ? issue.titleAr : issue.titleEn}\n`;
      report += `    ${isAr ? 'الوصف' : 'Description'}: ${isAr ? issue.descriptionAr : issue.descriptionEn}\n`;
      report += `    ${isAr ? 'القيمة الحالية' : 'Actual Value'}: ${issue.actualValue}\n`;
      report += `    ${isAr ? 'اشتراط الكود' : 'SBC Standard'}: ${issue.expectedValue}\n`;
      if (issue.locationStr) {
        report += `    ${isAr ? 'الموقع' : 'Location'}: ${issue.locationStr}\n`;
      }
      report += `\n`;
    });

    report += `========================================================================\n`;
    report += `     ${isAr ? 'ملخص الاشتراطات المرجعية لكود البناء السعودي (SBC)' : 'SBC REFERENCE CODE STANDARDS SUMMARY'}\n`;
    report += `========================================================================\n`;
    report += `1. Sewer Network Lines:\n`;
    report += `   - Sub-mains: 200mm-300mm (8"-12"), Depth: 1.5m-3.0m, Min Dist from Footings: 1.5m-2.0m.\n`;
    report += `   - Main Trunks: 400mm-1000mm+ (16"-40"+), Depth: 3.0m-7.0m+, Min Dist from Footings: 3.0m-5.0m.\n\n`;
    report += `2. Drinking Water Lines:\n`;
    report += `   - Sub-distribution: 110mm-160mm (4"-6"), Depth: 0.8m-1.2m under sidewalks.\n`;
    report += `   - Main Transmission: 300mm-1000mm+ (12"-40"+), Ductile Iron / GRP.\n\n`;
    report += `3. Mandatory Separation Distances:\n`;
    report += `   - Horizontal Separation: Minimum 3.0 meters between Water and Sewer mains.\n`;
    report += `   - Vertical Separation: Water MUST be ABOVE Sewer by >= 0.3m clean clearance.\n`;
    report += `     Otherwise 3.0m concrete encasement on each side of crossing is required.\n`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SBC_Executive_Audit_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // 4. Export JSON (.json)
  const exportSbcAuditJson = () => {
    const dataStr = JSON.stringify({
      auditDate: new Date().toISOString(),
      complianceScore: stats.complianceScore,
      summary: stats,
      findings: auditResults,
      standards: 'Saudi Building Code (SBC)'
    }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SBC_Audit_Data_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  return (
    <div className="bg-[#0b1726]/95 p-6 rounded-[2.5rem] border border-emerald-500/40 shadow-2xl space-y-6 text-white my-4">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white font-black text-base uppercase tracking-wider">
                {lang === 'ar' ? 'مُدقق السلامة والمطابقة لكود البناء السعودي (SBC)' : 'Saudi Building Code (SBC) Compliance Validator'}
              </h2>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                SBC Standards
              </span>
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{lang === 'ar' ? 'تحت التطوير' : 'Under Development'}</span>
              </span>
            </div>
            <p className="text-white/60 text-xs font-semibold mt-1">
              {lang === 'ar'
                ? 'فحص شبكات الصرف الصحي، مياه الشرب، ومسافات الفصل الإلزامية بين الخطوط'
                : 'Audits Sewer lines, Drinking Water networks & Mandatory separation distances per SBC'}
            </p>
          </div>
        </div>

        {/* Development Notice Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl flex items-center gap-3 text-amber-200 text-xs shadow-inner">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="font-black block text-amber-300 text-[11px] uppercase tracking-wide">
              {lang === 'ar' ? '⚠️ موديول تحت التطوير والاختبار (Under Development)' : '⚠️ Module Under Active Development'}
            </span>
            <p className="text-white/80 text-[11px] leading-relaxed mt-0.5">
              {lang === 'ar'
                ? 'تنويه: قسم فحص كود البناء السعودي قيد التحديث والتطوير المستمر لاختبار الاشتراطات وإضافة الخوارزميات التفصيلية لشبكات الخدمات.'
                : 'Notice: The Saudi Building Code (SBC) compliance audit module is currently under active development and testing.'}
            </p>
          </div>
        </div>

        {/* Action Controls & Export Dropdown */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-black/50 p-1 rounded-xl border border-white/10 flex items-center">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تقرير التدقيق للفحص' : 'File Audit Report'}</span>
            </button>
            <button
              onClick={() => setActiveTab('reference')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'reference'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'دليل ومواصفات الكود' : 'Code Reference Guide'}</span>
            </button>
          </div>

          {/* Export Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(prev => !prev)}
              className="bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'ar' ? 'تصدير التقرير' : 'Export Report'}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {showExportMenu && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-56 bg-[#0f1d2e] border border-emerald-500/40 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                <button
                  onClick={exportSbcAuditExcel}
                  className="w-full text-right sm:text-left px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-500/20 text-white flex items-center gap-2.5 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{lang === 'ar' ? 'تصدير تقرير Excel (.xlsx)' : 'Export Excel (.xlsx)'}</span>
                </button>
                <button
                  onClick={exportSbcAuditCsv}
                  className="w-full text-right sm:text-left px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-500/20 text-white flex items-center gap-2.5 transition-all"
                >
                  <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{lang === 'ar' ? 'تصدير ملف CSV (.csv)' : 'Export CSV (.csv)'}</span>
                </button>
                <button
                  onClick={exportSbcExecutiveTxtReport}
                  className="w-full text-right sm:text-left px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-500/20 text-white flex items-center gap-2.5 transition-all"
                >
                  <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{lang === 'ar' ? 'تقرير قيادي شامل (.txt)' : 'Executive Summary (.txt)'}</span>
                </button>
                <button
                  onClick={exportSbcAuditJson}
                  className="w-full text-right sm:text-left px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-500/20 text-white flex items-center gap-2.5 transition-all"
                >
                  <FileCode className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{lang === 'ar' ? 'تصدير بيانات JSON (.json)' : 'Export Data (.json)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Network Type Specification Bar */}
      <div className="bg-gradient-to-r from-[#0d221a] via-[#091522] to-[#0a1829] p-4 rounded-2xl border border-emerald-500/30 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-black text-white uppercase tracking-wider block">
                {lang === 'ar' ? 'تحديد وتصنيف نوع شبكة الملف المرفوع:' : 'Specify Uploaded File Network Type:'}
              </span>
              <span className="text-[10px] text-white/50 font-medium">
                {lang === 'ar'
                  ? 'اختر هل عناصر الملف المرفوع عبارة عن شبكة صرف صحي، مياه شرب، أم اكتشاف تلقائي'
                  : 'Specify whether uploaded elements represent Sewer, Water, or Auto-Detected networks'}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-white/5 px-2.5 py-1 rounded-full border border-white/10 text-emerald-300 font-bold shrink-0">
            {lang === 'ar' ? `إجمالي العناصر: ${points.length}` : `Total Elements: ${points.length}`}
          </span>
        </div>

        {/* Quick Selection Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => setNetworkTypeMode('auto')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              networkTypeMode === 'auto'
                ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg'
                : 'bg-white/5 text-white/60 hover:text-white border-white/10 hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'ar' ? 'اكتشاف تلقائي (ذكي)' : 'Auto Detect'}</span>
          </button>

          <button
            onClick={() => setNetworkTypeMode('sewer')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              networkTypeMode === 'sewer'
                ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                : 'bg-white/5 text-amber-300/80 hover:text-amber-300 border-amber-500/20 hover:bg-amber-500/10'
            }`}
          >
            <Waves className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'ar' ? 'شبكة صرف صحي' : 'Sewer Network'}</span>
          </button>

          <button
            onClick={() => setNetworkTypeMode('water')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              networkTypeMode === 'water'
                ? 'bg-cyan-500 text-black border-cyan-400 shadow-lg'
                : 'bg-white/5 text-cyan-300/80 hover:text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/10'
            }`}
          >
            <Droplets className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'ar' ? 'شبكة مياه شرب' : 'Water Network'}</span>
          </button>

          {availableLayers.length > 0 && (
            <button
              onClick={() => setNetworkTypeMode('custom')}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                networkTypeMode === 'custom'
                  ? 'bg-purple-500 text-white border-purple-400 shadow-lg'
                  : 'bg-white/5 text-purple-300/80 hover:text-purple-300 border-purple-500/20 hover:bg-purple-500/10'
              }`}
            >
              <Filter className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'ar' ? 'تخصيص الطبقات' : 'Custom Layers'}</span>
            </button>
          )}
        </div>

        {/* Custom Layer Selection Panel if 'custom' selected */}
        {networkTypeMode === 'custom' && availableLayers.length > 0 && (
          <div className="bg-black/60 p-3.5 rounded-xl border border-purple-500/30 space-y-3 mt-2 text-xs animate-in fade-in">
            <div className="flex items-center justify-between">
              <p className="text-purple-300 font-bold text-[11px]">
                {lang === 'ar'
                  ? 'اختر الطبقات (Layers) لتقسيم العناصر بين شبكتي الصرف والمياه:'
                  : 'Select layers for Sewer vs Water network assignment:'}
              </p>
              <span className="text-[10px] text-white/50">
                {lang === 'ar' ? `عدد الطبقات المتاحة: ${availableLayers.length}` : `Available layers: ${availableLayers.length}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Sewer Layers Box */}
              <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-500/30 space-y-2">
                <span className="font-black text-amber-300 block text-[11px] flex items-center gap-1.5 border-b border-amber-500/20 pb-1">
                  <Waves className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'طبقات الصرف الصحي (Sewer):' : 'Sewer Layers:'}
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                  {availableLayers.map(layer => (
                    <label key={`sewer-layer-${layer}`} className="flex items-center gap-2 text-white/80 hover:text-white cursor-pointer text-[11px] p-1 rounded hover:bg-white/5 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedSewerLayers.includes(layer)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSewerLayers(prev => [...prev, layer]);
                            setSelectedWaterLayers(prev => prev.filter(l => l !== layer));
                          } else {
                            setSelectedSewerLayers(prev => prev.filter(l => l !== layer));
                          }
                        }}
                        className="rounded border-amber-500 text-amber-500 focus:ring-amber-500 bg-black/50"
                      />
                      <span className="truncate font-mono">{layer || '(Default Layer)'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Water Layers Box */}
              <div className="bg-cyan-950/20 p-3 rounded-xl border border-cyan-500/30 space-y-2">
                <span className="font-black text-cyan-300 block text-[11px] flex items-center gap-1.5 border-b border-cyan-500/20 pb-1">
                  <Droplets className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'طبقات مياه الشرب (Water):' : 'Water Layers:'}
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                  {availableLayers.map(layer => (
                    <label key={`water-layer-${layer}`} className="flex items-center gap-2 text-white/80 hover:text-white cursor-pointer text-[11px] p-1 rounded hover:bg-white/5 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedWaterLayers.includes(layer)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWaterLayers(prev => [...prev, layer]);
                            setSelectedSewerLayers(prev => prev.filter(l => l !== layer));
                          } else {
                            setSelectedWaterLayers(prev => prev.filter(l => l !== layer));
                          }
                        }}
                        className="rounded border-cyan-500 text-cyan-500 focus:ring-cyan-500 bg-black/50"
                      />
                      <span className="truncate font-mono">{layer || '(Default Layer)'}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Line */}
        <div className="flex items-center justify-between text-[11px] pt-1 text-white/70 font-semibold border-t border-white/10">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {networkTypeMode === 'sewer' && (lang === 'ar' ? 'تم اعتماد جميع عناصر الملف كشبكة صرف صحي' : 'All elements classified as Sewer Network')}
            {networkTypeMode === 'water' && (lang === 'ar' ? 'تم اعتماد جميع عناصر الملف كشبكة مياه شرب' : 'All elements classified as Water Network')}
            {networkTypeMode === 'auto' && (lang === 'ar' ? 'التصنيف التلقائي بناءً على الكلمات المفتاحية مفعّل' : 'Auto keyword classification active')}
            {networkTypeMode === 'custom' && (lang === 'ar' ? 'التصنيف المخصص للطبقات مفعّل' : 'Custom layer classification active')}
          </span>
          <span className="font-mono text-emerald-300 text-[10px] bg-black/40 px-2 py-0.5 rounded border border-white/10">
            {lang === 'ar'
              ? `صرف: ${parsedNetworks.sewerPoints.length} | مياه: ${parsedNetworks.waterPoints.length}`
              : `Sewer: ${parsedNetworks.sewerPoints.length} | Water: ${parsedNetworks.waterPoints.length}`}
          </span>
        </div>
      </div>

      {/* Overview Statistics & Score */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Compliance Score */}
        <div className="bg-gradient-to-br from-emerald-950/60 to-black p-4 rounded-2xl border border-emerald-500/30 text-center flex flex-col items-center justify-center col-span-2 md:col-span-1">
          <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
            {lang === 'ar' ? 'مؤشر المطابقة للكود' : 'SBC Compliance Score'}
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-black ${
              stats.complianceScore >= 80 ? 'text-emerald-400' : stats.complianceScore >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {stats.complianceScore}%
            </span>
          </div>
          <span className="text-[9px] font-bold text-emerald-400/80 mt-1">
            {stats.complianceScore >= 80 ? (lang === 'ar' ? 'مطابق بدرجة عالية' : 'High Compliance') : (lang === 'ar' ? 'توجد ملاحظات حرجة' : 'Critical Notes')}
          </span>
        </div>

        {/* Detected Sewer Points */}
        <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
          <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
            {lang === 'ar' ? 'خطوط الصرف الصحى' : 'Sewer Network'}
          </span>
          <span className="text-xl font-black text-amber-400">
            {parsedNetworks.sewerPoints.length}
          </span>
          <span className="text-[9px] text-white/40 font-bold mt-0.5">{lang === 'ar' ? 'عنصر/نقطة' : 'elements'}</span>
        </div>

        {/* Detected Water Points */}
        <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
          <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
            {lang === 'ar' ? 'خطوط مياه الشرب' : 'Drinking Water'}
          </span>
          <span className="text-xl font-black text-cyan-400">
            {parsedNetworks.waterPoints.length}
          </span>
          <span className="text-[9px] text-white/40 font-bold mt-0.5">{lang === 'ar' ? 'عنصر/نقطة' : 'elements'}</span>
        </div>

        {/* Total Critical Errors */}
        <div className="bg-black/40 p-3.5 rounded-2xl border border-red-500/20 text-center flex flex-col justify-center">
          <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
            {lang === 'ar' ? 'مخالفات صريحة' : 'Critical Violations'}
          </span>
          <span className="text-xl font-black text-red-400">
            {stats.errors}
          </span>
          <span className="text-[9px] text-red-400/70 font-bold mt-0.5">{lang === 'ar' ? 'تستدعي التصحيح' : 'Requires fix'}</span>
        </div>

        {/* Total Warnings */}
        <div className="bg-black/40 p-3.5 rounded-2xl border border-amber-500/20 text-center flex flex-col justify-center">
          <span className="text-[10px] font-bold text-white/50 uppercase block mb-1">
            {lang === 'ar' ? 'تحذيرات وملاحظات' : 'SBC Warnings'}
          </span>
          <span className="text-xl font-black text-amber-300">
            {stats.warnings}
          </span>
          <span className="text-[9px] text-amber-300/70 font-bold mt-0.5">{lang === 'ar' ? 'تعديل أو مراجعة' : 'Review needed'}</span>
        </div>
      </div>

      {/* MAP HIGHLIGHT & COLOR CODING TOOLBAR */}
      <div className="bg-gradient-to-r from-[#0d2238] via-black to-[#0d2238] p-4 rounded-2xl border border-emerald-500/30 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-emerald-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              {lang === 'ar' ? 'تمييز وتلوين العناصر على الخريطة حسب الكود' : 'Map Compliance Color Coding & Highlighting'}
            </h3>
          </div>

          {/* Map Color Legend */}
          <div className="flex items-center gap-3 text-[10px] font-bold flex-wrap">
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF0055] inline-block shadow-sm"></span>
              {lang === 'ar' ? 'مخالفات صريحة' : 'Violations'}
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] inline-block shadow-sm"></span>
              {lang === 'ar' ? 'تحذيرات وملاحظات' : 'Warnings'}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] inline-block shadow-sm"></span>
              {lang === 'ar' ? 'مطابق للكود' : 'Compliant'}
            </span>
          </div>
        </div>

        {/* Action Buttons for Color Classification */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            onClick={() => handleApplySbcColorCodingToMap('full')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              mapColorMode === 'full'
                ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg'
                : 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border-emerald-500/30'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تلوين كامل الخريطة' : 'Colorize All Elements'}</span>
          </button>

          <button
            onClick={() => handleApplySbcColorCodingToMap('errors')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              mapColorMode === 'errors'
                ? 'bg-red-500 text-white border-red-400 shadow-lg'
                : 'bg-red-500/20 hover:bg-red-500/40 text-red-300 border-red-500/30'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span>{lang === 'ar' ? 'إبراز المخالفات (أحمر)' : 'Highlight Errors Only'}</span>
          </button>

          <button
            onClick={() => handleApplySbcColorCodingToMap('warnings')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
              mapColorMode === 'warnings'
                ? 'bg-amber-500 text-black border-amber-400 shadow-lg'
                : 'bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border-amber-500/30'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-amber-300" />
            <span>{lang === 'ar' ? 'إبراز التحذيرات (أصفر)' : 'Highlight Warnings Only'}</span>
          </button>

          <button
            onClick={() => handleApplySbcColorCodingToMap('reset')}
            className="py-2 px-3 rounded-xl text-xs font-black bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 flex items-center justify-center gap-2 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'إعادة ضبط الألوان' : 'Reset Map Colors'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area based on Active Tab */}
      {activeTab === 'audit' ? (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/30 p-3 rounded-2xl border border-white/10">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'البحث في نتائج الفحص والمخالفات...' : 'Search audit results...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => setFilterSeverity('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  filterSeverity === 'all' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'
                }`}
              >
                {lang === 'ar' ? 'الكل' : 'All'} ({auditResults.length})
              </button>
              <button
                onClick={() => setFilterSeverity('error')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 ${
                  filterSeverity === 'error' ? 'bg-red-500/30 text-red-300 border border-red-500/40' : 'text-white/50 hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span>{lang === 'ar' ? 'مخالفات' : 'Errors'} ({stats.errors})</span>
              </button>
              <button
                onClick={() => setFilterSeverity('warning')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 ${
                  filterSeverity === 'warning' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'text-white/50 hover:text-white'
                }`}
              >
                <Info className="w-3 h-3 text-amber-300" />
                <span>{lang === 'ar' ? 'تحذيرات' : 'Warnings'} ({stats.warnings})</span>
              </button>
            </div>
          </div>

          {/* Issue Cards List */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className={`p-4 rounded-2xl border transition-all ${
                  issue.severity === 'error'
                    ? 'bg-red-950/20 border-red-500/40 hover:border-red-500/70'
                    : issue.severity === 'warning'
                    ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/70'
                    : 'bg-emerald-950/20 border-emerald-500/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      issue.severity === 'error'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : issue.severity === 'warning'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {issue.severity === 'error' ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : issue.severity === 'warning' ? (
                        <Info className="w-5 h-5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-xs text-white">
                          {lang === 'ar' ? issue.titleAr : issue.titleEn}
                        </h4>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${
                          issue.severity === 'error'
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : issue.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        }`}>
                          {issue.severity === 'error'
                            ? (lang === 'ar' ? 'مخالفة كود' : 'Violation')
                            : issue.severity === 'warning'
                            ? (lang === 'ar' ? 'ملاحظة مواصفة' : 'Notice')
                            : (lang === 'ar' ? 'مطابق' : 'Pass')}
                        </span>
                      </div>

                      <p className="text-[11px] text-white/70 leading-relaxed">
                        {lang === 'ar' ? issue.descriptionAr : issue.descriptionEn}
                      </p>

                      {/* Location details */}
                      {issue.locationStr && (
                        <div className="text-[10px] font-mono text-white/40 pt-1 flex items-center gap-1">
                          <Compass className="w-3 h-3 text-emerald-400/70" />
                          <span>{issue.locationStr}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: Values & Map Highlight Button */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 gap-2 border-t sm:border-t-0 border-white/10 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right text-[10px] space-y-0.5">
                      <div className="text-white/50">
                        {lang === 'ar' ? 'الفعلي: ' : 'Actual: '}
                        <span className="font-bold text-amber-300">{issue.actualValue}</span>
                      </div>
                      <div className="text-white/50">
                        {lang === 'ar' ? 'اشتراط الكود: ' : 'SBC Requirement: '}
                        <span className="font-bold text-emerald-400">{issue.expectedValue}</span>
                      </div>
                    </div>

                    {issue.points.length > 0 && (onHighlightPoints || onApplySbcColors) && (
                      <button
                        onClick={() => {
                          const targetColor = issue.severity === 'error' ? '#FF0055' : '#FFD700';
                          if (onHighlightPoints) {
                            onHighlightPoints(issue.points, targetColor);
                          } else if (onApplySbcColors) {
                            const updated = points.map(pt =>
                              issue.points.some(ip => ip.id === pt.id) ? { ...pt, color: targetColor } : pt
                            );
                            onApplySbcColors(updated);
                          }
                        }}
                        className="bg-emerald-500/30 hover:bg-emerald-500 text-white hover:text-black font-black px-3 py-1.5 rounded-xl text-[10px] flex items-center gap-1.5 transition-all shadow-md shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إبراز على الخريطة' : 'Highlight on Map'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredIssues.length === 0 && (
              <div className="py-12 text-center text-white/40 text-xs font-bold bg-black/20 rounded-2xl border border-white/5">
                {lang === 'ar' ? 'لا توجد نتائج مطابقة لخيارات البحث أو الفلترة' : 'No issues found matching selected filter'}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Reference Guide Tab */
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-xs text-white/80 leading-relaxed bg-black/30 p-4 rounded-2xl border border-white/10">
            <h3 className="text-emerald-400 font-black text-sm uppercase mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span>{lang === 'ar' ? 'اشتراطات كود البناء السعودي لشبكات المياه والصرف الصحي' : 'Saudi Building Code (SBC) Standards for Water & Sewer Utilities'}</span>
            </h3>
            <p>
              {lang === 'ar'
                ? 'يوضح هذا الدليل المعايير الفنية والاشتراطات الهندسية الملزمة المعتمدة في كود البناء السعودي لتخطيط وتنفيذ خطوط ومسارات الخدمات بالشارع العام:'
                : 'This guide outlines the mandatory engineering specs certified by Saudi Building Code (SBC) for utility design:'}
            </p>
          </div>

          {/* Section 1: Sewer Lines */}
          <div className="bg-black/40 p-5 rounded-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center gap-2 border-b border-amber-500/20 pb-2">
              <Waves className="w-5 h-5 text-amber-400" />
              <h3 className="text-amber-300 font-black text-xs uppercase tracking-wider">
                {lang === 'ar' ? 'أولاً: خطوط شبكة الصرف الصحي في الشارع العام' : '1. Sewer Network Lines in Public Streets'}
              </h3>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs text-right text-white/90 dir-rtl border-collapse">
                <thead>
                  <tr className="bg-white/10 text-amber-300 font-black text-[11px] border-b border-white/10">
                    <th className="p-3 text-right">{lang === 'ar' ? 'وجه المقارنة' : 'Criteria'}</th>
                    <th className="p-3 text-right">{lang === 'ar' ? 'الخطوط الفرعية للحي (Lateral / Sub-main)' : 'Sub-main Lines'}</th>
                    <th className="p-3 text-right">{lang === 'ar' ? 'الخطوط الرئيسية الناقلة (Trunk / Main)' : 'Main Trunk Lines'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px]">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-bold text-white/60">{lang === 'ar' ? 'الموقع في الشارع' : 'Street Location'}</td>
                    <td className="p-3">{lang === 'ar' ? 'تُمدد بجانب الطريق (تحت الأرصفة أو حارة الخدمة).' : 'Roadside (under sidewalks or service lane)'}</td>
                    <td className="p-3">{lang === 'ar' ? 'تُمدد في منتصف الشارع أو المحاور الشريانية الكبرى.' : 'Middle of street or major arterial corridors'}</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-bold text-white/60">{lang === 'ar' ? 'الأقطار الدارجة' : 'Typical Diameters'}</td>
                    <td className="p-3 font-bold text-amber-300">8 - 12 بوصة (200 مم - 300 مم)</td>
                    <td className="p-3 font-bold text-amber-300">16 - 40+ بوصة (400 مم - +1000 مم)</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-bold text-white/60">{lang === 'ar' ? 'الأعماق النموذجية' : 'Typical Depths'}</td>
                    <td className="p-3">1.5 إلى 3 أمتار عن مستوى الأسفلت</td>
                    <td className="p-3">أعماق سحيقة تبدأ من 3 أمتار وتصل إلى 7 أمتار أو أكثر (تتطلب تدعيم الجوانب)</td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-bold text-white/60">{lang === 'ar' ? 'المسافة عن القواعد' : 'Foundation Distance'}</td>
                    <td className="p-3 text-emerald-400 font-bold">لا تقل عن 1.5 إلى 2 متر</td>
                    <td className="p-3 text-emerald-400 font-bold">لا تقل عن 3 إلى 5 أمتار تفادياً للهبوط</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Water Lines */}
          <div className="bg-black/40 p-5 rounded-2xl border border-cyan-500/30 space-y-4">
            <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-2">
              <Droplets className="w-5 h-5 text-cyan-400" />
              <h3 className="text-cyan-300 font-black text-xs uppercase tracking-wider">
                {lang === 'ar' ? 'ثانياً: خطوط شبكة مياه الشرب في الشارع العام' : '2. Drinking Water Network Lines'}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2">
                <h4 className="font-black text-cyan-300 text-xs flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-cyan-400" />
                  <span>{lang === 'ar' ? 'خطوط التوزيع الفرعية (ضمن الأحياء)' : 'Distribution Sub-lines'}</span>
                </h4>
                <ul className="space-y-1.5 text-white/80 list-disc list-inside text-[11px]">
                  <li>{lang === 'ar' ? 'الأقطار: تتراوح بين 4 إلى 6 بوصات (110 مم إلى 160 مم).' : 'Diameters: 4" to 6" (110mm to 160mm)'}</li>
                  <li>{lang === 'ar' ? 'الأعماق: أعماق قريبة تتراوح بين 0.8 إلى 1.2 متر تحت الرصيف.' : 'Depths: Shallow 0.8m to 1.2m under sidewalk'}</li>
                  <li>{lang === 'ar' ? 'الموقع: في الجهة المقابلة لخطوط الصرف إن أمكن.' : 'Location: Opposite side of sewer line if possible'}</li>
                </ul>
              </div>

              <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2">
                <h4 className="font-black text-cyan-300 text-xs flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-cyan-400" />
                  <span>{lang === 'ar' ? 'خطوط النقل الرئيسية' : 'Main Transmission Lines'}</span>
                </h4>
                <ul className="space-y-1.5 text-white/80 list-disc list-inside text-[11px]">
                  <li>{lang === 'ar' ? 'الأقطار: ضخمة تبدأ من 12 بوصة وتصل إلى أكثر من 40 بوصة.' : 'Diameters: Large 12" to 40"+'}</li>
                  <li>{lang === 'ar' ? 'المواد: تُصنع من الحديد الدكتيل أو الألياف الزجاجية (GRP) للضغوط العالية.' : 'Materials: Ductile Iron or GRP for high pressure'}</li>
                  <li>{lang === 'ar' ? 'المسار: تُمدد في مسارات الخدمات الرئيسية بالمدينة.' : 'Location: Main service corridors of the city'}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 3: Mandatory Separation Distances */}
          <div className="bg-gradient-to-r from-red-950/40 via-black to-emerald-950/40 p-5 rounded-2xl border border-emerald-500/40 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <Ruler className="w-5 h-5 text-emerald-400" />
              <h3 className="text-white font-black text-xs uppercase tracking-wider">
                {lang === 'ar' ? 'ثالثاً: مسافات الفصل الإلزامية في الشارع (الكود السعودي)' : '3. Mandatory Separation Distances (Saudi Code)'}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-black/50 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-black text-xs">
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  <span>{lang === 'ar' ? 'الفصل الأفقي (نفس الشارع):' : 'Horizontal Separation:'}</span>
                </div>
                <p className="text-white/80 leading-relaxed text-[11px]">
                  {lang === 'ar'
                    ? 'يجب ألا تقل المسافة الأفقية بين خط مياه الشرب الرئيسي وخط الصرف الصحي عن 3 أمتار لمنع حدوث التلوث التبادلي عند التسريب.'
                    : 'Minimum horizontal distance between Drinking Water main and Sewer line MUST NOT be less than 3.0 meters.'}
                </p>
              </div>

              <div className="bg-black/50 p-4 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-black text-xs">
                  <ArrowDownUp className="w-4 h-4 text-amber-400" />
                  <span>{lang === 'ar' ? 'الفصل الرأسي (عند التقاطعات):' : 'Vertical Separation at Intersections:'}</span>
                </div>
                <ul className="text-white/80 space-y-1.5 text-[11px] list-disc list-inside">
                  <li>
                    {lang === 'ar'
                      ? 'يجب دائماً أن يمر خط مياه الشرب أعلى خط الصرف الصحي.'
                      : 'Drinking Water line MUST ALWAYS pass ABOVE Sewer line.'}
                  </li>
                  <li>
                    {lang === 'ar'
                      ? 'الفرق الرأسي النظيف بين قاع أنبوب المياه وأعلى أنبوب الصرف لا يقل عن 0.3 متر (30 سم).'
                      : 'Min clean vertical clearance: 0.3 meters (30 cm).'}
                  </li>
                  <li className="text-amber-300/90 font-bold">
                    {lang === 'ar'
                      ? 'إذا اضطر لتمرير خط المياه أسفل الصرف: يُلزم الكود بتغليف أنبوب الصرف بغلاف خرساني أو عازل صلاد يمتد 3 أمتار من كل جانب.'
                      : 'If water passes below sewer: sewer pipe MUST have concrete encasement extending 3.0m on each side.'}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
