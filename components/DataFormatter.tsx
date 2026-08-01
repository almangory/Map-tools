import React, { useState, useMemo, useEffect } from 'react';
import { Database, Download, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw, Layers, CheckCircle2, CloudDownload, PenTool, FileSpreadsheet, FileText, Target, Zap, Check } from 'lucide-react';
import { GeoPoint, OverlapResult } from '../types';
import { downloadKMZ } from '../services/kmlService';
import { downloadDXF } from '../services/dxfExportService';
import { downloadDataPDF } from '../services/pdfExportService';
import { extractAllPointAttributes, parseDescriptionToAttributes, stripHtml, extractNumbersOnly, isNumericTargetField, cleanZoneValue, isZoneField } from '../services/parserService';
import { calculatePathLength } from '../services/geometryService';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); };

const STANDARD_COLORS = [
  { name: 'Water', hex: '#01579B' },
  { name: 'Wastewater', hex: '#097138' },
  { name: 'Work in Progress', hex: '#ffea00' },
  { name: 'Remaining Works', hex: '#a52714' }
];

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function colorDistance(c1: {r: number, g: number, b: number}, c2: {r: number, g: number, b: number}) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

function getClosestStandardColor(hex?: string) {
  if (!hex) return hex;
  const c1 = hexToRgb(hex);
  if (!c1) return hex;
  
  let minDistance = Infinity;
  let closest = hex;
  
  for (const std of STANDARD_COLORS) {
    const c2 = hexToRgb(std.hex);
    if (c2) {
        const dist = colorDistance(c1, c2);
        if (dist < minDistance) {
            minDistance = dist;
            closest = std.hex;
        }
    }
  }
  return closest;
}

const TEMPLATES = {
  pipes: {
    name: 'أنابيب / خطوط (Pipes/Lines)',
    fields: ["OBJECTID", "ANCILLARYROLE", "ENABLED", "SERIALNUMBER", "DISTRICT", "STREETNAME", "ASSETSTATUS", "ASSETCONDITION", "STARTXCOORDINATE", "STARTYCOORDINATE", "ENDXCOORDINATE", "ENDYCOORDINATE", "STARTPIPEGROUNDELEVATION", "STARTPIPEELEVATION", "ENDPIPEGROUNDELEVATION", "ENDPIPEELEVATION", "PROXIMITYTONETWORK", "COMMISSIONDATE", "INSTALLDATE", "SURVEYDATE", "FEATURETYPE", "INNERDIAMETER", "OUTERDIAMETER", "MATERIAL", "CONSULTANT", "ACTUALLENGTH", "MANUFACTURE", "REMARKS", "SHAPE_Length", "MaintRoute", "RouteSequence", "LINENO", "segment id", "Permit No", "ZONE", "Drilling type", "Stage", "CONTRACTOR", "PROJECTNAME", "PROJECTID"]
  },
  points: {
    name: 'غرف / ملحقات (Chambers/Fittings)',
    fields: ["OBJECTID", "ANCILLARYROLE", "ENABLED", "ASSETID", "ASSETNAME", "SERIALNUMBER", "DISTRICT", "STREETNAME", "ASSETSTATUS", "ASSETCONDITION", "XCOORDINATE", "YCOORDINATE", "GROUNDELEVATION", "ELEVATION", "PROXIMITYTONETWORK", "COMMISSIONDATE", "INSTALLDATE", "FEATURETYPE", "CHAMBERSHAPE", "DIAMETER", "LENGTH", "WIDTH", "DEPTH", "REMARKS", "segment id", "Permit No", "ZONE", "Drilling type", "Stage", "CONTRACTOR", "PROJECTNAME", "PROJECTID"]
  },
  stations: {
    name: 'محطات الرفع والخزانات (Lift Stations & Tanks)',
    fields: ["إسم المشروع", "إسم المقاول", "رقم التعميد", "نوع المنشأة", "رقم المحطة", "السعة التصميمية للمحطة/الخزان", "عدد الخزانات", "سعة الخزان الواحد", "عدد المضخات", "طول خط الطرد", "قطر خط الطرد", "فرق المنسوب", "Water Hammer System", "Scada System", "Electric Switchboards", "موقف الاعمال المدنية", "نسبة الإنجاز الاعمال المدنية", "موقف الاعمال الميكانيكية والكهربائية", "نسبة الإنجاز الاعمال الميكانيكية والكهربائية", "التاريخ المتوقع للانتهاء من الاعمال وتسليم المحطة", "حالة اعتماد الامن الصناعي", "حالة اعتماد السلامة", "الدراسة الهيدروليكية", "إيصال التيار الكهربائي"]
  },
  polygons: {
    name: 'تنظيم النطاقات (Polygons)',
    fields: ["اسم المشروع", "اسم المقاول", "اسم مقاول الباطن", "اسم الاستشاري", "المالك", "حالة المشروع", "تصنيف المشروع", "تصنيف اداري", "البرنامج", "تاريخ البداية", "تاريخ النهاية", "تاريخ النهاية المعدل", "الازبلت", "الاستلام الابتدائي", "الاستلام النهائي", "عدد الاستلامات الجزئي", "تاريخ آخر جزء مسلم", "تاريخ الاستلام الجزئي"]
  },
  violations: {
    name: 'تنسيق التعديات (Violations)',
    fields: ["رقم بلاغ التعدي", "وصف التعدي", "أثر التعدي", "تاريخ التعدي", "رقم الرخصة", "تاريخ البلاغ", "الجهة المالكة", "الجهة المتعدية", "المقاول", "خط الطول", "خط العرض", "حالة البلاغ", "المدينة", "الحي", "الشارع", "تعليق المركز", "سجل المحادثات", "الجهه", "أسم المشروع"]
  },
  boundaries: {
    name: 'حدود ومساحة العقار (Property Boundaries)',
    fields: ["الاتجاه", "الحدود حسب الطبيعة", "الطول (حسب الطبيعة)", "الحدود حسب الصك", "الطول (حسب الصك)", "الحدود حسب المخطط", "الطول (حسب المخطط)"]
  },
  grids: {
    name: 'شبكيات (Grids)',
    fields: ["اسم المشروع", "اسم المقاول", "الحي", "حالة الشبكية", "اسم الشارع", "نوع الشبكية", "اسم الشبكية التعاقدي", "وصف الاعمال", "مدة العزل بالساعة", "تاريخ بدأ التنفيذ حسب البرنامج الزمني", "تاريخ البدأ بعد التنسيق مع الجهات", "التاريخ المتوقع للانتهاء", "طول الشبكية", "اعمق نقطة للشبكية", "عرض الشبكية", "الادارة الاشرافية", "الملاحظات"]
  }
};

interface Props {
  points: GeoPoint[];
  headers?: string[];
  lang: 'ar' | 'en';
  fetchStreets?: (points: GeoPoint[], headers: string[], action: () => void) => void;
  overlapResults?: import('../services/geometryService').OverlapResult[] | null;
  geocodingMode?: 'accurate' | 'fast';
  onVerifyMissingAttributes?: () => void;
  onVerifyPermitSegment?: () => void;
  setGeocodingMode?: (mode: 'accurate' | 'fast') => void;
}

export const DataFormatter = ({ points, headers, lang, fetchStreets, overlapResults, geocodingMode, setGeocodingMode, onVerifyMissingAttributes, onVerifyPermitSegment }: Props) => {
  const [localGeocodingMode, setLocalGeocodingMode] = useState<'accurate' | 'fast'>('accurate');
  const currentGeocodingMode = geocodingMode || localGeocodingMode;
  const [targetTemplate, setTargetTemplate] = useState<'pipes' | 'points' | 'stations' | 'polygons' | 'boundaries' | 'violations' | 'grids'>('pipes');
  const [networkType, setNetworkType] = useState<'water' | 'wastewater'>('water');
  const [keepFolders, setKeepFolders] = useState(true);
  const [retainUnmapped, setRetainUnmapped] = useState(true);
  const [optimizeForMyMaps, setOptimizeForMyMaps] = useState(false);
  const [keepOriginalDescription, setKeepOriginalDescription] = useState(false);
  const [removeImagesOnly, setRemoveImagesOnly] = useState(false);
  const [autoFetchStreets, setAutoFetchStreets] = useState(false);
  const [standardizeColors, setStandardizeColors] = useState(false);
  const [standardizePolygonColors, setStandardizePolygonColors] = useState(false);
  const [keepOriginalGridStyle, setKeepOriginalGridStyle] = useState(false);
  const [nameSourceField, setNameSourceField] = useState<string>('');
  
  // Collect all unique attributes from current points
  const sourceAttributes = useMemo(() => {
    const attrMap = new Map<string, string>();

    // 1. Add all active file headers if provided
    if (headers && Array.isArray(headers)) {
      headers.forEach(h => {
        if (h && typeof h === 'string' && h.trim()) {
          attrMap.set(h.trim(), '');
        }
      });
    }

    // 2. Collect attributes & sample values from points
    points.forEach(p => {
      if (p.attributes && Object.keys(p.attributes).length > 0) {
        Object.entries(p.attributes).forEach(([k, v]) => {
          const cleanK = String(k || '').trim();
          if (!cleanK) return;
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.description) {
        const descAttrs = parseDescriptionToAttributes(p.description, {});
        Object.entries(descAttrs).forEach(([k, v]) => {
          const cleanK = String(k || '').trim();
          if (!cleanK) return;
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const cleanK = String(h || '').trim();
          if (!cleanK) return;
          const v = p.originalRow![i];
          const valStr = String(v ?? '').trim();
          if (!attrMap.has(cleanK) || attrMap.get(cleanK) === '') {
            attrMap.set(cleanK, valStr.substring(0, 30));
          }
        });
      }

      if (p.street && !attrMap.has('الشارع (مسترجع)')) attrMap.set('الشارع (مسترجع)', p.street.substring(0, 30));
      if (p.district && !attrMap.has('الحي (مسترجع)')) attrMap.set('الحي (مسترجع)', p.district.substring(0, 30));
    });

    return Array.from(attrMap.entries()).map(([name, sample]) => ({ name, sample }));
  }, [points, headers]);

  const [mapping, setMapping] = useState<Record<string, { sourceField?: string; defaultValue?: string }>>({});

  // Auto-map matching source attributes to target template fields
  useEffect(() => {
    if (sourceAttributes.length === 0) return;

    setMapping(prev => {
      const newMap = { ...prev };
      let changed = false;

      const findMatchingSource = (aliases: string[]) => {
        return sourceAttributes.find(sa => {
          const lower = sa.name.toLowerCase().replace(/[\s_#-]/g, '');
          return aliases.some(a => {
            const cleanA = a.toLowerCase().replace(/[\s_#-]/g, '');
            return lower === cleanA || lower.includes(cleanA) || cleanA.includes(lower);
          });
        })?.name;
      };

      TEMPLATES[targetTemplate].fields.forEach(field => {
        if (!newMap[field]?.sourceField) {
          let matched: string | undefined;

          if (field === 'INNERDIAMETER') {
            matched = findMatchingSource([
              'innerdiameter', 'inner_diameter', 'inner diameter', 'القطر الداخلي', 'القطر_الداخلي', 'قطر_داخلي', 'قطر داخلي', 'قطر_الخط', 'قطر الخط', 'قطر_الانبوب', 'قطر الانبوب', 'القطر', 'قطر', 'diameter', 'size'
            ]);
          } else if (field === 'OUTERDIAMETER') {
            matched = findMatchingSource([
              'outerdiameter', 'outer_diameter', 'outer diameter', 'القطر الخارجي', 'القطر_الخارجي', 'قطر_خارجي', 'قطر خارجي'
            ]);
          } else if (field === 'SHAPE_Length' || field === 'ACTUALLENGTH') {
            matched = findMatchingSource([
              'shape_length', 'shapelength', 'shape length', 'actuallength', 'actual_length', 'actual length', 'طول_الخط', 'طول الخط', 'طول_العنصر', 'الاطوال', 'length'
            ]);
            if (!matched) {
              matched = '__MAP_LENGTH__';
            }
          } else if (field === 'DIAMETER') {
            matched = findMatchingSource([
              'diameter', 'قطر_الخط', 'قطر الخط', 'قطر_الانبوب', 'قطر الانبوب', 'القطر', 'قطر', 'قطر_الشبكة', 'size', 'innerdiameter'
            ]);
          } else if (field === 'MATERIAL') {
            matched = findMatchingSource(['material', 'مادة', 'مادة_الخط', 'مادة الخط', 'نوع_الانبوب', 'نوع الانبوب']);
          } else if (field === 'PROJECTNAME' || field === 'PROJECTID' || field === 'اسم المشروع') {
            if (field.includes('ID') || field.includes('رقم')) {
              matched = findMatchingSource(['projectid', 'project_id', 'رقم_المشروع', 'رقم المشروع', 'fid']);
            } else {
              matched = findMatchingSource(['projectname', 'project_name', 'اسم_المشروع', 'اسم المشروع']);
            }
          } else if (field === 'Drilling type') {
            matched = findMatchingSource(['drilling type', 'drilling_type', 'نوع_الحفر', 'نوع الحفر']);
          } else if (field === 'ZONE') {
            matched = findMatchingSource(['zone_nu', 'zone', 'منطقة', 'النطاق', 'رقم_المنطقة']);
          } else if (field === 'Permit No') {
            matched = findMatchingSource(['permit no', 'permit_no', 'permit', 'رقم_الترخيص', 'رقم_الرخصة', 'رقم الرخصة']);
          } else if (field === 'STREETNAME' || field === 'Street' || field === 'STREET_NAME') {
            matched = findMatchingSource(['streetname', 'street', 'الشارع', 'اسم_الشارع', 'الشارع (مسترجع)']);
            if (!matched) {
              matched = 'الشارع (مسترجع)';
            }
          } else if (field === 'DISTRICT' || field === 'District') {
            matched = findMatchingSource(['district', 'الحي', 'اسم_الحي', 'الحي (مسترجع)']);
            if (!matched) {
              matched = 'الحي (مسترجع)';
            }
          } else if (field === 'CONTRACTOR') {
            matched = findMatchingSource(['contractor', 'المقاول', 'اسم_المقاول']);
          } else if (field === 'CONSULTANT') {
            matched = findMatchingSource(['consultant', 'الاستشاري', 'اسم_الاستشاري']);
          }

          if (matched) {
            newMap[field] = { ...newMap[field], sourceField: matched };
            changed = true;
          }
        }
      });

      return changed ? newMap : prev;
    });
  }, [sourceAttributes, targetTemplate]);

  const [selectedFields, setSelectedFields] = useState<Record<string, string[]>>({
    pipes: [...TEMPLATES.pipes.fields],
    points: [...TEMPLATES.points.fields],
    stations: [...TEMPLATES.stations.fields],
    polygons: [...TEMPLATES.polygons.fields],
    violations: [...TEMPLATES.violations.fields],
    boundaries: [...TEMPLATES.boundaries.fields],
    grids: [...TEMPLATES.grids.fields]
  });

  
  const getProcessedPoints = () => {
    const currentSelected = selectedFields[targetTemplate] ?? TEMPLATES[targetTemplate].fields;
    let templateFields = TEMPLATES[targetTemplate].fields.filter(f => currentSelected.includes(f));
    
    const unselectedTemplateFields = new Set(
      TEMPLATES[targetTemplate].fields.filter(f => !templateFields.includes(f))
    );

    const processedPoints = points.map(p => {
      const newAttrs: Record<string, string> = {};
      const mappedSourceFields = new Set<string>();

      templateFields.forEach(field => {
        const mapRules = mapping[field];
        let val = '';

        const isLengthTarget = (fName: string) => {
          const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
          return lower === 'shapelength' || lower === 'actuallength' || lower === 'length' || lower === 'طولالخط' || lower === 'طولالعنصر';
        };

        const isStreetTarget = (fName: string) => {
          const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
          return lower === 'streetname' || lower === 'street' || lower === 'street_name' || lower === 'اسمالشارع' || lower === 'الشارع';
        };

        const isDistrictTarget = (fName: string) => {
          const lower = fName.toLowerCase().replace(/[\s_#-]/g, '');
          return lower === 'district' || lower === 'اسمالحي' || lower === 'الحي';
        };

        if (mapRules?.sourceField === '__MAP_LENGTH__') {
            const calcLen = (p.path && p.path.length >= 2) ? calculatePathLength(p.path) : (p.originalLength || 0);
            if (calcLen > 0) {
                val = calcLen.toFixed(2);
            }
        } else if (mapRules?.sourceField) {
           if (mapRules.sourceField === 'الشارع (مسترجع)') {
               val = p.street || '';
           } else if (mapRules.sourceField === 'الحي (مسترجع)') {
               val = p.district || '';
           } else {
               const sourceFieldLower = String(mapRules.sourceField || '').toLowerCase();
               if (p.attributes) {
                   const matchedKey = Object.keys(p.attributes).find(k => String(k || '').toLowerCase() === sourceFieldLower);
                   if (matchedKey && p.attributes[matchedKey] !== undefined && p.attributes[matchedKey] !== null) val = String(p.attributes[matchedKey]);
               }
               if (!val && p.description) {
                   const descAttrs = parseDescriptionToAttributes(p.description, {});
                   const matchedKey = Object.keys(descAttrs).find(k => String(k || '').toLowerCase() === sourceFieldLower);
                   if (matchedKey && descAttrs[matchedKey] !== undefined && descAttrs[matchedKey] !== null) {
                       val = String(descAttrs[matchedKey]);
                   }
               }
               if (!val && p.originalRow && headers) {
                   const matchedIndex = headers.findIndex(h => String(h || '').toLowerCase() === sourceFieldLower);
                   if (matchedIndex !== -1 && p.originalRow[matchedIndex] !== undefined && p.originalRow[matchedIndex] !== null) {
                       val = String(p.originalRow[matchedIndex]);
                   }
               }
           }
           if (val) mappedSourceFields.add(mapRules.sourceField);
        }

        // Fallback: If val is still empty and this is a length field (e.g. SHAPE_Length), auto-fill from map geometry length
        if (!val && isLengthTarget(field)) {
            const calcLen = (p.path && p.path.length >= 2) ? calculatePathLength(p.path) : (p.originalLength || 0);
            if (calcLen > 0) {
                val = calcLen.toFixed(2);
            }
        }

        // Fallback: If val is empty and this is a street or district field, auto-fill from reverse geocoded map data
        if (!val && isStreetTarget(field)) {
            val = p.street || '';
        }
        if (!val && isDistrictTarget(field)) {
            val = p.district || '';
        }

        if (!val && mapRules?.defaultValue) val = mapRules.defaultValue;

        // Clean numeric and ZONE target fields (ZONE leading zeros are removed)
        if (val && (isNumericTargetField(field) || isZoneField(field))) {
          val = isZoneField(field) ? cleanZoneValue(val) : extractNumbersOnly(val);
        }

        newAttrs[field] = val;
      });

      if (retainUnmapped) {
        if (p.attributes) {
            Object.keys(p.attributes).forEach(k => {
                if (!mappedSourceFields.has(k) && !unselectedTemplateFields.has(k)) {
                    let rawV = String(p.attributes[k] || '');
                    if (rawV && (isNumericTargetField(k) || isZoneField(k))) {
                        rawV = isZoneField(k) ? cleanZoneValue(rawV) : extractNumbersOnly(rawV);
                    }
                    newAttrs[k] = rawV;
                }
            });
        }
        if (p.originalRow && headers) {
            headers.forEach((h, i) => {
                if (!mappedSourceFields.has(h) && !unselectedTemplateFields.has(h) && p.originalRow![i] !== undefined && p.originalRow![i] !== null) {
                    let rawV = String(p.originalRow![i]);
                    if (rawV && (isNumericTargetField(h) || isZoneField(h))) {
                        rawV = isZoneField(h) ? cleanZoneValue(rawV) : extractNumbersOnly(rawV);
                    }
                    newAttrs[h] = rawV;
                }
            });
        }
      }

            let newId = p.id;
      if (nameSourceField) {
         if (nameSourceField === 'الشارع (مسترجع)') {
             if (p.street) newId = String(p.street);
         } else if (nameSourceField === 'الحي (مسترجع)') {
             if (p.district) newId = String(p.district);
         } else if (newAttrs[nameSourceField] !== undefined && newAttrs[nameSourceField] !== '') {
             newId = String(newAttrs[nameSourceField]);
         } else if (p.attributes) {
             const matchedKey = Object.keys(p.attributes).find(k => String(k || '').toLowerCase() === String(nameSourceField || '').toLowerCase());
             if (matchedKey && p.attributes[matchedKey]) {
                 newId = String(p.attributes[matchedKey]);
             }
         }
         
         if (newId === p.id && !newAttrs[nameSourceField] && p.originalRow && headers && nameSourceField) {
             const matchedIndex = headers.findIndex(h => String(h || '').toLowerCase() === String(nameSourceField || '').toLowerCase());
             if (matchedIndex !== -1 && p.originalRow[matchedIndex]) {
                 newId = String(p.originalRow[matchedIndex]);
             }
         }
      }

      return { ...p, id: newId, attributes: newAttrs, description: undefined, layer: keepFolders ? p.layer : undefined };
    });

    if (overlapResults) {
        overlapResults.forEach((o, i) => {
            if (o.isIntersection && o.intersectionPoint) {
                processedPoints.push({
                    id: `Intersection_${i}`,
                    x: o.intersectionPoint.x,
                    y: o.intersectionPoint.y,
                    type: 'Point',
                    color: '#9c27b0',
                    layer: 'Intersections',
                    attributes: {
                        'Description': `Intersection between ${o.id1} and ${o.id2}`,
                        'Type': 'Intersection'
                    }
                });
            }
        });
    }
    
    return { processedPoints, templateFields };
  };

  const getBaseFilename = () => {
    const prefix = networkType === 'water' ? 'Water' : 'Wastewater';
    const suffix = targetTemplate === 'pipes' ? 'Lines' : targetTemplate === 'points' ? 'Points' : targetTemplate === 'stations' ? 'Stations' : targetTemplate === 'boundaries' ? 'Boundaries' : targetTemplate === 'grids' ? 'Grids' : targetTemplate === 'violations' ? 'Violations' : 'Polygons';
    return `${prefix}_${suffix}_Formatted`;
  };

  const handleApplyExportKMZ = () => {
    const { processedPoints, templateFields } = getProcessedPoints();
    downloadKMZ(processedPoints, getBaseFilename(), { 
        mode: keepFolders ? 'layer' : 'none', 
        groupByAttribute: keepFolders ? 'layer' : undefined,
        optimizeForMyMaps: optimizeForMyMaps,
        keepOriginalDescription: keepOriginalDescription,
        removeImagesOnly: removeImagesOnly,
        ...(targetTemplate === 'pipes' ? { lineStyle: { width: 3 } } : {}),
        ...((targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? {
            polygonStyle: {
                ...(standardizePolygonColors ? { colorHex: '#0288d1', opacityHex: '4d' } : {}),
                ...(optimizeForMyMaps || standardizePolygonColors ? { outline: 0, width: 0 } : {})
            }
        } : {})
    }, templateFields, templateFields);
  };

  const handleApplyExportDXF = () => {
    const { processedPoints } = getProcessedPoints();
    downloadDXF(processedPoints, getBaseFilename());
  };

  const handleApplyExportPDF = () => {
    const { processedPoints } = getProcessedPoints();
    downloadDataPDF(processedPoints, getBaseFilename(), lang);
  };

  const handleApplyExportExcel = () => {
    const { processedPoints, templateFields } = getProcessedPoints();
    const data = processedPoints.map(p => {
        const row: any = { ID: p.id, Type: p.type, Layer: p.layer || '', X: p.x, Y: p.y };
        
        const extracted = extractAllPointAttributes(p);
        templateFields.forEach(f => {
            row[f] = extracted[f] || (p.attributes ? p.attributes[f] : '') || '';
        });

        // Also add any extra extracted attributes not in templateFields
        Object.entries(extracted).forEach(([k, v]) => {
            if (row[k] === undefined) {
                row[k] = v;
            }
        });

        if (p.description) {
            const parsed = parseDescriptionToAttributes(p.description);
            if (Object.keys(parsed).length === 0) {
                row['Description'] = stripHtml(p.description);
            }
        }

        return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Formatted_Data");
    XLSX.writeFile(wb, `${getBaseFilename()}.xlsx`);
  };


  const executeAction = (action: () => void) => {
    if (autoFetchStreets && fetchStreets) {
      fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي'], () => {
        action();
      });
    } else {
      action();
    }
  };
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="p-8 bg-[#0b2d3d]/40 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-4">
        <Database className="w-16 h-16 text-accent mx-auto" />
        <h2 className="text-white font-black text-xl">{lang === 'ar' ? 'تنسيق البيانات للمشاريع' : 'Project Data Formatter'}</h2>
        <p className="text-[10px] text-white/50 leading-relaxed font-bold uppercase">{lang === 'ar' ? 'ترتيب وتنسيق الحقول لشبكات المياه والصرف' : 'Organize and format fields for Water/Wastewater'}</p>
      </div>

      {points.length === 0 ? (
        <div className="text-center p-8 bg-white/5 rounded-3xl border border-white/5">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-white/60">{lang === 'ar' ? 'يرجى تحميل ملف به بيانات لتنسيقه.' : 'Please upload a file with data to format.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-white/40 uppercase font-black mb-2 block">{lang === 'ar' ? 'نوع الشبكة' : 'Network Type'}</label>
              <div className="flex gap-2">
                <button onClick={() => setNetworkType('water')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", networkType === 'water' ? "bg-blue-500 text-white" : "bg-white/10 text-white/50 hover:bg-white/20")}>{lang === 'ar' ? 'مياه (Water)' : 'Water'}</button>
                <button onClick={() => setNetworkType('wastewater')} className={cn("flex-1 py-3 rounded-xl font-black text-xs transition-all", networkType === 'wastewater' ? "bg-orange-600 text-white" : "bg-white/10 text-white/50 hover:bg-white/20")}>{lang === 'ar' ? 'صرف صحي (Wastewater)' : 'Wastewater'}</button>
              </div>
            </div>
            
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-white/40 uppercase font-black mb-2 block">{lang === 'ar' ? 'نوع العناصر (القالب)' : 'Element Type (Template)'}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'pipes', label: TEMPLATES.pipes.name },
                  { id: 'points', label: TEMPLATES.points.name },
                  { id: 'stations', label: TEMPLATES.stations.name },
                  { id: 'polygons', label: TEMPLATES.polygons.name },
                  { id: 'boundaries', label: TEMPLATES.boundaries.name },
                  { id: 'violations', label: TEMPLATES.violations.name },
                  { id: 'grids', label: TEMPLATES.grids.name },
                ].map((tItem) => (
                  <button
                    key={tItem.id}
                    type="button"
                    onClick={() => setTargetTemplate(tItem.id as any)}
                    className={cn(
                      "py-2.5 px-2 rounded-xl font-black text-[11px] leading-tight transition-all text-center flex items-center justify-center min-h-[44px] break-words",
                      targetTemplate === tItem.id ? "bg-accent text-primary shadow-lg" : "bg-white/10 text-white/70 hover:bg-white/20",
                      tItem.id === 'grids' && "col-span-2"
                    )}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بمجلدات الملف الأصلي' : 'Keep Original Folders'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم الحفاظ على بنية المجلدات الأصلية (الطبقات) عند التصدير.' : 'When enabled, the original folder structure (layers) will be preserved on export.'}</p>
            </div>
            <button 
              type="button"
              onClick={() => setKeepFolders(!keepFolders)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                keepFolders ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                keepFolders 
                  ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                  : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بالحقول غير المطابقة' : 'Keep Unmapped Fields'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم إضافة الحقول الأصلية التي لم يتم تعيينها إلى البيانات المصدرة.' : 'When enabled, original fields that were not mapped will be added to the exported data.'}</p>
            </div>
            <button 
              type="button"
              onClick={() => setRetainUnmapped(!retainUnmapped)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                retainUnmapped ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                retainUnmapped 
                  ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                  : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-white font-black text-sm flex items-center gap-2">
                  <span>{lang === 'ar' ? 'جلب أسماء الشوارع والأحياء' : 'Fetch Streets & Districts'}</span>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold border transition-all",
                    currentGeocodingMode === 'accurate' 
                      ? "text-accent bg-accent/10 border-accent/20" 
                      : "text-blue-300 bg-blue-500/10 border-blue-500/20"
                  )}>
                    {currentGeocodingMode === 'accurate'
                      ? (lang === 'ar' ? '🎯 دقيق جداً (هندسي)' : '🎯 Accurate (Geometric)')
                      : (lang === 'ar' ? '⚡ بحث عام (سريع)' : '⚡ Fast General Search')}
                  </span>
                </h4>
                <p className="text-white/50 text-[10px] mt-1">
                  {lang === 'ar' 
                    ? 'جلب أسماء الشوارع والأحياء تلقائياً وإضافتها لحقلي STREETNAME و DISTRICT.' 
                    : 'Automatically fetch street and district names for STREETNAME & DISTRICT fields.'}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setAutoFetchStreets(!autoFetchStreets)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative shrink-0 flex items-center px-1",
                  autoFetchStreets ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full transition-all shadow-md",
                  autoFetchStreets 
                    ? (lang === 'ar' ? "translate-x-0" : "translate-x-6") 
                    : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
                )} />
              </button>
            </div>

            <div className="pt-2 border-t border-white/5 space-y-2">
              <label className="text-[10px] font-bold text-white/70 block">
                {lang === 'ar' ? 'اختر نمط دقة الجلب:' : 'Select Geocoding Mode:'}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-black/30 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setGeocodingMode ? setGeocodingMode('accurate') : setLocalGeocodingMode('accurate')}
                  className={cn(
                    "py-2 px-2.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
                    currentGeocodingMode === 'accurate'
                      ? "bg-accent text-primary shadow-lg"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '🎯 دقيق جداً (هندسي)' : '🎯 Accurate'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGeocodingMode ? setGeocodingMode('fast') : setLocalGeocodingMode('fast')}
                  className={cn(
                    "py-2 px-2.5 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
                    currentGeocodingMode === 'fast'
                      ? "bg-blue-500 text-white shadow-lg"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '⚡ بحث عام (سريع)' : '⚡ Fast Search'}</span>
                </button>
              </div>
              <p className="text-[9px] text-white/50 leading-relaxed px-1">
                {currentGeocodingMode === 'accurate'
                  ? (lang === 'ar' ? '🎯 حساب هندسي متقدم لأقرب مسار طريق لإعطاء نتائج دقيقة جداً.' : '🎯 Advanced geometry-based calculation for exact nearest road.')
                  : (lang === 'ar' ? '⚡ بحث عام سريع ومباشر لتوفير الوقت مع كميات البيانات الكبيرة.' : '⚡ Fast general search lookup to save time on large datasets.')}
              </p>
            </div>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'تحسين لخرائط Google My Maps' : 'Optimize for Google My Maps'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'إزالة جدول الوصف لمنع تكرار البيانات في لوحة My Maps.' : 'Remove description table to prevent duplication in My Maps panel.'}</p>
            </div>
            <button 
              onClick={() => setOptimizeForMyMaps(!optimizeForMyMaps)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                optimizeForMyMaps ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                optimizeForMyMaps ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بالبيانات الأصلية والصور' : 'Retain Original Data & Images'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'استخدام الوصف والمظهر الأصليين والوسائط من الملف المصدر مباشرة.' : 'Use original description, styling, and media directly from the source file.'}</p>
            </div>
            <button 
              onClick={() => setKeepOriginalDescription(!keepOriginalDescription)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                keepOriginalDescription ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                keepOriginalDescription ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'إزالة الصور فقط' : 'Remove Images Only'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'حذف جميع الصور والوسائط من داخل منطاد الوصف في ملف KML مع بقاء سائر التفاصيل.' : 'Delete all images and media from inside the description balloon in the KML file while keeping other details.'}</p>
            </div>
            <button 
              onClick={() => setRemoveImagesOnly(!removeImagesOnly)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                removeImagesOnly ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                removeImagesOnly ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'توحيد ألوان المشروع' : 'Standardize Project Colors'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'تحويل جميع الألوان إلى الدرجات القياسية (أزرق، أخضر، أصفر، أحمر) بناءً على أقرب لون.' : 'Convert all colors to standard shades (blue, green, yellow, red) based on the closest match.'}</p>
            </div>
            <button 
              onClick={() => setStandardizeColors(!standardizeColors)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                standardizeColors ? "bg-accent" : "bg-white/20"
              )}
            >
              <div className={cn(
                "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                standardizeColors ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

                    {(targetTemplate === 'grids') && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بشكل والوان الملف المرفوع' : 'Keep Original Shape and Colors'}</h4>
                <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم الحفاظ على نوع وشكل العنصر ولونه الأصلي كما هو في الملف المرفوع.' : 'When enabled, the original shape, type, and color of the element will be kept as in the uploaded file.'}</p>
              </div>
              <button 
                onClick={() => setKeepOriginalGridStyle(!keepOriginalGridStyle)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  keepOriginalGridStyle ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                  keepOriginalGridStyle ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                )} />
              </button>
            </div>
          )}

          {(targetTemplate === 'polygons' || targetTemplate === 'boundaries') && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'توحيد ألوان النطاقات' : 'Standardize Polygon Colors'}</h4>
                <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'توحيد لون العناصر إلى اللون الأزرق (#0288d1) بدرجة شفافية 30% وإلغاء عرض الحدود.' : 'Standardize the color of elements to Blue (#0288d1) with 30% opacity and no border.'}</p>
              </div>
              <button 
                onClick={() => setStandardizePolygonColors(!standardizePolygonColors)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  standardizePolygonColors ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                  standardizePolygonColors ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                )} />
              </button>
            </div>
          )}

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'مصدر اسم العنصر (اختياري)' : 'Element Name Source (Optional)'}</h4>
              <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'اختر حقلاً ليكون هو اسم العنصر الذي يظهر على الخريطة.' : 'Choose a field to be used as the element name shown on the map.'}</p>
            </div>
            <select
              value={nameSourceField}
              onChange={(e) => setNameSourceField(e.target.value)}
              className="w-full md:w-1/3 bg-[#0e3f53] text-white text-xs p-3 rounded-xl outline-none border border-white/10"
            >
              <option value="">{lang === 'ar' ? 'الاسم الافتراضي' : 'Default Name'}</option>
              <optgroup label={lang === 'ar' ? 'الحقول المصدرية' : 'Source Fields'}>
                {sourceAttributes.map(attr => (
                  <option key={attr.name} value={attr.name}>{attr.name}</option>
                ))}
              </optgroup>
              <optgroup label={lang === 'ar' ? 'حقول القالب' : 'Template Fields'}>
                {TEMPLATES[targetTemplate].fields.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'مطابقة الحقول (Field Mapping)' : 'Field Mapping'}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedFields(prev => ({
                      ...prev,
                      [targetTemplate]: [...TEMPLATES[targetTemplate].fields]
                    }));
                  }}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-white font-black px-3 py-1.5 rounded-lg transition-colors"
                >
                  {lang === 'ar' ? 'تحديد الكل' : 'Select All'}
                </button>
                <button
                  onClick={() => {
                    setSelectedFields(prev => ({
                      ...prev,
                      [targetTemplate]: []
                    }));
                  }}
                  className="text-[10px] bg-white/10 hover:bg-white/20 text-white font-black px-3 py-1.5 rounded-lg transition-colors"
                >
                  {lang === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
                </button>
              </div>
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {TEMPLATES[targetTemplate].fields.map(field => {
                const isSelected = selectedFields[targetTemplate]?.includes(field) ?? false;
                return (
                <div key={field} className={cn("flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all", isSelected ? "bg-black/20" : "bg-black/10 opacity-50")}>
                  <div className="w-full md:w-1/3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFields(prev => ({
                          ...prev,
                          [targetTemplate]: isSelected 
                            ? (prev[targetTemplate] || []).filter(f => f !== field)
                            : [...(prev[targetTemplate] || []), field]
                        }));
                      }}
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center transition-all flex-shrink-0",
                        isSelected ? "bg-accent text-primary" : "border border-white/20 text-transparent"
                      )}
                    >
                      <Check className="w-3 h-3 stroke-[3px]" />
                    </button>
                    <span className="text-xs font-black text-accent flex items-center gap-1.5 flex-wrap">
                      <span>{field}</span>
                      {isNumericTargetField(field) && (
                        <span className="text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                          {lang === 'ar' ? '🔢 أرقام فقط' : '🔢 Numbers Only'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="w-full md:w-1/3">
                    <select 
                      value={mapping[field]?.sourceField || ''} 
                      onChange={e => setMapping(prev => ({ ...prev, [field]: { ...prev[field], sourceField: e.target.value } }))}
                      className="w-full bg-[#0e3f53] border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none focus:border-accent"
                    >
                      <option value="">{lang === 'ar' ? '-- بدون ربط --' : '-- Unmapped --'}</option>
                      <option value="الشارع (مسترجع)">
                        {lang === 'ar' ? '🗺️ ربط اسم الشارع تلقائياً من الخريطة' : '🗺️ Auto Street Name from Map'}
                      </option>
                      <option value="الحي (مسترجع)">
                        {lang === 'ar' ? '🏘️ ربط اسم الحي تلقائياً من الخريطة' : '🏘️ Auto District Name from Map'}
                      </option>
                      <option value="__MAP_LENGTH__">
                        {lang === 'ar' ? '📏 حساب طول العنصر تلقائياً من الخريطة (متر)' : '📏 Auto Map Length from Map (m)'}
                      </option>
                      {sourceAttributes.map(attr => (
                        <option key={attr.name} value={attr.name}>
                          {attr.name} {attr.sample ? (lang === 'ar' ? `(مثال: ${attr.sample})` : `(e.g. ${attr.sample})`) : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-1/3">
                    <input 
                      type="text" 
                      placeholder={lang === 'ar' ? 'القيمة الافتراضية (أو النقاط)..' : 'Default value (or dots)..'}
                      value={mapping[field]?.defaultValue || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: { ...prev[field], defaultValue: e.target.value } }))}
                      className="w-full bg-[#0e3f53] border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold text-white focus:outline-none focus:border-accent placeholder-white/20"
                    />
                  </div>
                </div>
              )})}
            </div>
          </div>

          
          
          {onVerifyMissingAttributes && (
            <button onClick={onVerifyMissingAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group mt-6">
                <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
            </button>
          )}
          {onVerifyPermitSegment && (
            <button onClick={onVerifyPermitSegment} className="w-full bg-[#2a0b3d] border border-[#9000FF]/50 text-[#d8b4fe] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#9000FF] hover:text-white transition-all text-sm group mt-3">
                <Layers className="w-5 h-5 group-hover:scale-110 transition-transform text-[#9000FF] group-hover:text-white" />
                {lang === 'ar' ? 'فحص وتلوين عناصر (segment id) بنفسجي' : 'Highlight segment id (Vivid Purple)'}
            </button>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <button onClick={() => executeAction(handleApplyExportKMZ)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner">
              <CloudDownload className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'KMZ' : 'KMZ'}</span>
            </button>
            <button onClick={() => executeAction(handleApplyExportDXF)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner">
              <PenTool className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'DXF' : 'DXF'}</span>
            </button>
            <button onClick={() => executeAction(handleApplyExportExcel)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-[#2ecc71] group-hover:scale-110 transition-transform" />
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'إكسل' : 'Excel'}</span>
            </button>
            <button onClick={() => executeAction(handleApplyExportPDF)} className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner">
              <FileText className="w-5 h-5 text-[#D32F2F] group-hover:scale-110 transition-transform" />
              <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'PDF' : 'PDF'}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
