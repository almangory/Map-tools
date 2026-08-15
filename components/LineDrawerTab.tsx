import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  PenTool, FileSpreadsheet, PlusCircle, CheckCircle, Upload, Save, 
  XCircle, Download, DownloadCloud, FolderArchive, FileText, Globe, 
  Layers, MapPin, Sparkles, RefreshCw, Trash2, ArrowRight, MousePointer,
  Undo2, Check, X, Search, Navigation, Eye, Maximize2, Map as MapIcon,
  Square, Sliders, Palette, Info, ListOrdered, Hash, Ruler, Tag,
  FileCheck, ShieldAlert, CheckCircle2, ChevronRight, CornerDownLeft
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { GeoPoint, ParsedFile } from '../types';
import { parseExcel } from '../services/parserService';
import { calculatePathLength, downloadKMZ } from '../services/kmlService';
import { downloadShapefile } from '../services/shapefileExportService';
import { downloadDXF } from '../services/dxfExportService';
import { downloadDataPDF } from '../services/pdfExportService';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export interface LineConfig {
  name: string;
  layer: string;
  color: string;
  width: number;
  diameter: string;
  material: string;
  permitNo: string;
  segmentId: string;
  notes: string;
}

interface Props {
  lang: 'ar' | 'en';
  globalPoints?: GeoPoint[];
  setGlobalPoints?: (points: GeoPoint[] | ((prev: GeoPoint[]) => GeoPoint[])) => void;
  setDataId?: (id: string) => void;
  runWithLoading?: (msg: string, task: () => void | Promise<void>) => Promise<void>;
  setGlobalLoading?: (loading: boolean) => void;
  setGlobalProgress?: (percent: number | null) => void;
  setGlobalStatus?: (status: string) => void;

  // Main Map Drawing synchronization (optional with safe local fallback)
  drawnLines?: GeoPoint[];
  setDrawnLines?: React.Dispatch<React.SetStateAction<GeoPoint[]>>;
  isDrawingOnMainMap?: boolean;
  setIsDrawingOnMainMap?: (val: boolean) => void;
  currentVertices?: { x: number; y: number }[];
  setCurrentVertices?: React.Dispatch<React.SetStateAction<{ x: number; y: number }[]>>;
  lineConfig?: LineConfig;
  setLineConfig?: React.Dispatch<React.SetStateAction<LineConfig>>;
  manualPickingTarget?: 'start' | 'end' | null;
  setManualPickingTarget?: (target: 'start' | 'end' | null) => void;
  onFinishCurrentLine?: () => void;
  onFocusPoint?: (pt: GeoPoint) => void;
}

type DrawMode = 'file-import' | 'map-interactive' | 'manual-coords' | 'lines-inventory';

const PRESET_COLORS = [
  { name: 'أزرق (Blue)', hex: '#3b82f6' },
  { name: 'أخضر (Emerald)', hex: '#10b981' },
  { name: 'أحمر (Red)', hex: '#ef4444' },
  { name: 'برتقالي (Amber)', hex: '#f59e0b' },
  { name: 'بنفسجي (Purple)', hex: '#8b5cf6' },
  { name: 'سماوي (Cyan)', hex: '#06b6d4' },
  { name: 'وردي (Pink)', hex: '#ec4899' },
  { name: 'أصفر (Yellow)', hex: '#eab308' },
  { name: 'أبيض (White)', hex: '#ffffff' }
];

const LAYER_SUGGESTIONS = [
  'شبكة المياه (Water Network)',
  'خطوط التوزيع (Distribution Lines)',
  'مواسير HDPE (HDPE Pipes)',
  'خطوط ناقلة (Transmission Mains)',
  'صرف صحي (Sewer Lines)',
  'خطوط الري (Irrigation Lines)',
  'كابلات الكهرباء (Power Cables)',
  'ألياف بصرية (Telecom Fiber)',
  'مسارات عامة (General Lines)'
];

const DIAMETER_CHIPS = ['110', '160', '200', '250', '315', '400', '500', '6"', '8"', '10"', '12"'];
const MATERIAL_CHIPS = ['HDPE', 'uPVC', 'Ductile Iron (DI)', 'GRP', 'Carbon Steel', 'Concrete'];

export const LineDrawerTab: React.FC<Props> = ({ 
  lang, 
  globalPoints = [], 
  setGlobalPoints, 
  setDataId, 
  runWithLoading, 
  setGlobalLoading, 
  setGlobalProgress, 
  setGlobalStatus,
  drawnLines: propDrawnLines,
  setDrawnLines: propSetDrawnLines,
  isDrawingOnMainMap: propIsDrawingOnMainMap,
  setIsDrawingOnMainMap: propSetIsDrawingOnMainMap,
  currentVertices: propCurrentVertices,
  setCurrentVertices: propSetCurrentVertices,
  lineConfig: propLineConfig,
  setLineConfig: propSetLineConfig,
  manualPickingTarget: propManualPickingTarget,
  setManualPickingTarget: propSetManualPickingTarget,
  onFinishCurrentLine,
  onFocusPoint
}) => {
  // Local fallback states if not provided as props
  const [localDrawnLines, setLocalDrawnLines] = useState<GeoPoint[]>([]);
  const [localIsDrawing, setLocalIsDrawing] = useState(false);
  const [localVertices, setLocalVertices] = useState<{ x: number; y: number }[]>([]);
  const [localLineConfig, setLocalLineConfig] = useState<LineConfig>({
    name: 'LINE_1',
    layer: 'شبكة المياه',
    color: '#3b82f6',
    width: 4,
    diameter: '160',
    material: 'HDPE',
    permitNo: '',
    segmentId: '',
    notes: ''
  });
  const [localPickingTarget, setLocalPickingTarget] = useState<'start' | 'end' | null>(null);

  // Effective state bindings
  const drawnLines = propDrawnLines !== undefined ? propDrawnLines : localDrawnLines;
  const setDrawnLines = propSetDrawnLines || setLocalDrawnLines;
  const isDrawingOnMainMap = propIsDrawingOnMainMap !== undefined ? propIsDrawingOnMainMap : localIsDrawing;
  const setIsDrawingOnMainMap = propSetIsDrawingOnMainMap || setLocalIsDrawing;
  const currentVertices = propCurrentVertices !== undefined ? propCurrentVertices : localVertices;
  const setCurrentVertices = propSetCurrentVertices || setLocalVertices;
  const lineConfig = propLineConfig !== undefined ? propLineConfig : localLineConfig;
  const setLineConfig = propSetLineConfig || setLocalLineConfig;
  const manualPickingTarget = propManualPickingTarget !== undefined ? propManualPickingTarget : localPickingTarget;
  const setManualPickingTarget = propSetManualPickingTarget || setLocalPickingTarget;

  // Active sub-tab
  const [activeMode, setActiveMode] = useState<DrawMode>('map-interactive');

  // Status messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // --- File Import State ---
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [startXCol, setStartXCol] = useState<string>('');
  const [startYCol, setStartYCol] = useState<string>('');
  const [endXCol, setEndXCol] = useState<string>('');
  const [endYCol, setEndYCol] = useState<string>('');
  const [idCol, setIdCol] = useState<string>('');
  const [layerCol, setLayerCol] = useState<string>('');
  const [colorCol, setColorCol] = useState<string>('');
  const [diameterCol, setDiameterCol] = useState<string>('');
  const [materialCol, setMaterialCol] = useState<string>('');
  const [permitCol, setPermitCol] = useState<string>('');
  const [segmentCol, setSegmentCol] = useState<string>('');
  const [notesCol, setNotesCol] = useState<string>('');

  // --- Manual Coordinate Input State ---
  const [manualStartX, setManualStartX] = useState<string>('');
  const [manualStartY, setManualStartY] = useState<string>('');
  const [manualEndX, setManualEndX] = useState<string>('');
  const [manualEndY, setManualEndY] = useState<string>('');

  // Listen to coordinate pick events from main map
  useEffect(() => {
    const handleCoordPicked = (e: any) => {
      const { target, coord } = e.detail || {};
      if (target === 'start' && coord) {
        setManualStartX(coord.x.toFixed(6));
        setManualStartY(coord.y.toFixed(6));
        setSuccess(lang === 'ar' ? `تم التقاط إحداثيات البداية (${coord.y.toFixed(5)}, ${coord.x.toFixed(5)}) من الخريطة!` : `Start coordinates picked!`);
      } else if (target === 'end' && coord) {
        setManualEndX(coord.x.toFixed(6));
        setManualEndY(coord.y.toFixed(6));
        setSuccess(lang === 'ar' ? `تم التقاط إحداثيات النهاية (${coord.y.toFixed(5)}, ${coord.x.toFixed(5)}) من الخريطة!` : `End coordinates picked!`);
      }
    };

    window.addEventListener('map-coord-picked', handleCoordPicked);
    return () => window.removeEventListener('map-coord-picked', handleCoordPicked);
  }, [lang]);

  // Metrics
  const totalLengthM = useMemo(() => {
    return (drawnLines || []).reduce((acc, p) => acc + (p.path ? calculatePathLength(p.path) : 0), 0);
  }, [drawnLines]);

  const totalLayersCount = useMemo(() => {
    return new Set((drawnLines || []).map(p => p.layer || 'Default')).size;
  }, [drawnLines]);

  const activeLineLengthMeters = useMemo(() => {
    if (!currentVertices || currentVertices.length < 2) return 0;
    return calculatePathLength(currentVertices);
  }, [currentVertices]);

  // --- Excel File Upload & Auto-Mapping Handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const parsed = await parseExcel(uploadedFile);
      setFile(parsed);

      // Auto-detect columns intelligently
      const headers = parsed.headers || [];
      
      const findCol = (regexes: RegExp[]) => {
        return headers.find(h => regexes.some(r => r.test(h.trim()))) || '';
      };

      // 1. Start X
      const sx = findCol([/^start.*x/i, /^from.*x/i, /^x.*1/i, /^sx$/i, /^x.*start/i, /^بداية.*x/i, /^س.*بداية/i, /^x_start/i, /^start_lon/i, /^lon.*1/i]);
      // 2. Start Y
      const sy = findCol([/^start.*y/i, /^from.*y/i, /^y.*1/i, /^sy$/i, /^y.*start/i, /^بداية.*y/i, /^ص.*بداية/i, /^y_start/i, /^start_lat/i, /^lat.*1/i]);
      // 3. End X
      const ex = findCol([/^end.*x/i, /^to.*x/i, /^x.*2/i, /^ex$/i, /^x.*end/i, /^نهاية.*x/i, /^س.*نهاية/i, /^x_end/i, /^end_lon/i, /^lon.*2/i]);
      // 4. End Y
      const ey = findCol([/^end.*y/i, /^to.*y/i, /^y.*2/i, /^ey$/i, /^y.*end/i, /^نهاية.*y/i, /^ص.*نهاية/i, /^y_end/i, /^end_lat/i, /^lat.*2/i]);

      // 5. ID & Layer
      const id = findCol([/^id$/i, /^line.*id/i, /^name$/i, /^معرف/i, /^رقم/i, /^اسم/i]);
      const layer = findCol([/^layer/i, /^طبقة/i, /^نوع/i, /^type/i, /^network/i]);
      const color = findCol([/^color/i, /^لون/i, /^hex/i]);
      
      // 6. Diameter, Material, Permit, Segment
      const diam = findCol([/^dia/i, /^size/i, /^قطر/i, /^القطر/i, /^dn/i]);
      const mat = findCol([/^mat/i, /^مادة/i, /^المادة/i, /^pipe.*type/i]);
      const permit = findCol([/^permit/i, /^تصريح/i, /^ترخيص/i, /^رقم.*تصريح/i, /^permit.*no/i]);
      const seg = findCol([/^segment/i, /^شريحة/i, /^segment.*id/i, /^قطاع/i]);
      const nots = findCol([/^note/i, /^ملاحظ/i, /^وصف/i, /^desc/i]);

      if (sx) setStartXCol(sx);
      if (sy) setStartYCol(sy);
      if (ex) setEndXCol(ex);
      if (ey) setEndYCol(ey);
      if (id) setIdCol(id);
      if (layer) setLayerCol(layer);
      if (color) setColorCol(color);
      if (diam) setDiameterCol(diam);
      if (mat) setMaterialCol(mat);
      if (permit) setPermitCol(permit);
      if (seg) setSegmentCol(seg);
      if (nots) setNotesCol(nots);

      setSuccess(
        lang === 'ar' 
          ? `تم تحميل الملف (${uploadedFile.name}) بنجاح بواقع ${parsed.data.length} صف! يرجى تأكيد مطابقة الأعمدة أدناه.` 
          : `File loaded successfully with ${parsed.data.length} rows!`
      );
    } catch (err: any) {
      setError(err.message || (lang === 'ar' ? 'فشل قراءة الملف. يرجى التأكد من الصيغة.' : 'Failed to parse file.'));
    } finally {
      setLoading(false);
    }
  };

  // --- Generate Lines From Excel File ---
  const generateLinesFromFile = () => {
    if (!file || !startXCol || !startYCol || !endXCol || !endYCol) {
      setError(lang === 'ar' ? 'يرجى تحديد أعمدة إحداثيات البداية والنهاية (X, Y).' : 'Please map start and end coordinates.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const generated: GeoPoint[] = [];

      file.data.forEach((row, index) => {
        const sx = parseFloat(row[startXCol]);
        const sy = parseFloat(row[startYCol]);
        const ex = parseFloat(row[endXCol]);
        const ey = parseFloat(row[endYCol]);

        if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

        const lineId = idCol && row[idCol] ? String(row[idCol]) : `LINE_${index + 1}`;
        const layer = layerCol && row[layerCol] ? String(row[layerCol]) : (lineConfig.layer || 'شبكة المياه');
        const color = colorCol && row[colorCol] ? String(row[colorCol]) : (lineConfig.color || '#3b82f6');
        const diameter = diameterCol && row[diameterCol] ? String(row[diameterCol]) : lineConfig.diameter;
        const material = materialCol && row[materialCol] ? String(row[materialCol]) : lineConfig.material;
        const permitNo = permitCol && row[permitCol] ? String(row[permitCol]) : lineConfig.permitNo;
        const segmentId = segmentCol && row[segmentCol] ? String(row[segmentCol]) : lineConfig.segmentId;
        const notes = notesCol && row[notesCol] ? String(row[notesCol]) : lineConfig.notes;

        const path = [{ x: sx, y: sy }, { x: ex, y: ey }];

        const customAttributes: Record<string, any> = { ...row };
        if (diameter) { customAttributes['Diameter'] = diameter; customAttributes['القطر'] = diameter; }
        if (material) { customAttributes['Material'] = material; customAttributes['المادة'] = material; }
        if (permitNo) { customAttributes['Permit No'] = permitNo; customAttributes['رقم التصريح'] = permitNo; }
        if (segmentId) { customAttributes['segment id'] = segmentId; customAttributes['معرف الشريحة'] = segmentId; }
        if (notes) { customAttributes['Notes'] = notes; customAttributes['ملاحظات'] = notes; }

        generated.push({
          id: lineId,
          x: sx,
          y: sy,
          type: 'LineString',
          path,
          color,
          layer,
          attributes: customAttributes
        });
      });

      if (generated.length === 0) {
        setError(lang === 'ar' ? 'لم يتم العثور على إحداثيات صالحة في الأعمدة المحددة.' : 'No valid coordinates found in selected columns.');
        setLoading(false);
        return;
      }

      setDrawnLines(prev => [...generated, ...prev]);
      setGlobalPoints(prev => [...generated, ...prev]);
      setDataId(`excel-lines-${Date.now()}`);

      setSuccess(
        lang === 'ar'
          ? `تم استيراد ورسم ${generated.length} خطاً بنجاح على الخريطة الرئيسية!`
          : `Successfully imported and drew ${generated.length} lines on the map!`
      );
      setActiveMode('lines-inventory');
    } catch (err: any) {
      setError(err.message || 'Error generating lines.');
    } finally {
      setLoading(false);
    }
  };

  // --- Manual Coordinate Line Addition ---
  const handleAddManualLine = () => {
    const sx = parseFloat(manualStartX);
    const sy = parseFloat(manualStartY);
    const ex = parseFloat(manualEndX);
    const ey = parseFloat(manualEndY);

    if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) {
      setError(lang === 'ar' ? 'يرجى إدخال إحداثيات صالحة لجميع الحقول (أرقام عشرية).' : 'Please enter valid coordinate numbers.');
      return;
    }

    const newLine: GeoPoint = {
      id: lineConfig.name || `LINE_${drawnLines.length + 1}`,
      x: sx,
      y: sy,
      type: 'LineString',
      path: [{ x: sx, y: sy }, { x: ex, y: ey }],
      color: lineConfig.color || '#3b82f6',
      layer: lineConfig.layer || 'شبكة المياه',
      attributes: {
        StartX: sx,
        StartY: sy,
        EndX: ex,
        EndY: ey,
        ...(lineConfig.diameter ? { Diameter: lineConfig.diameter, 'القطر': lineConfig.diameter } : {}),
        ...(lineConfig.material ? { Material: lineConfig.material, 'المادة': lineConfig.material } : {}),
        ...(lineConfig.permitNo ? { 'Permit No': lineConfig.permitNo, 'رقم التصريح': lineConfig.permitNo } : {}),
        ...(lineConfig.segmentId ? { 'segment id': lineConfig.segmentId, 'معرف الشريحة': lineConfig.segmentId } : {}),
        ...(lineConfig.notes ? { Notes: lineConfig.notes, 'ملاحظات': lineConfig.notes } : {})
      }
    };

    setDrawnLines(prev => [newLine, ...prev]);
    setGlobalPoints(prev => [newLine, ...prev]);
    setDataId(`manual-line-${Date.now()}`);

    // Increment name
    const match = lineConfig.name.match(/\d+$/);
    if (match) {
      const nextNum = parseInt(match[0], 10) + 1;
      setLineConfig(prev => ({ ...prev, name: prev.name.replace(/\d+$/, nextNum.toString()) }));
    } else {
      setLineConfig(prev => ({ ...prev, name: `LINE_${drawnLines.length + 2}` }));
    }

    // Reset manual coords
    setManualStartX('');
    setManualStartY('');
    setManualEndX('');
    setManualEndY('');

    setSuccess(lang === 'ar' ? `تمت إضافة الخط (${newLine.id}) بنجاح إلى الخريطة!` : `Line ${newLine.id} added successfully!`);
    setError(null);
  };

  // --- Clear & Delete Handlers ---
  const handleDeleteLine = (id: string | number) => {
    setDrawnLines(prev => prev.filter(p => p.id !== id));
    setGlobalPoints(prev => prev.filter(p => p.id !== id));
    setDataId(`del-line-${Date.now()}`);
    setSuccess(lang === 'ar' ? `تم حذف الخط بنجاح.` : `Line deleted.`);
  };

  const handleClearAllLines = () => {
    if (window.confirm(lang === 'ar' ? 'هل أنت متأكد من مسح جميع الخطوط المرسومة؟' : 'Are you sure you want to clear all drawn lines?')) {
      const lineIds = new Set(drawnLines.map(l => l.id));
      setDrawnLines([]);
      setGlobalPoints(prev => prev.filter(p => !lineIds.has(p.id)));
      setDataId(`clear-lines-${Date.now()}`);
      setSuccess(lang === 'ar' ? 'تم مسح جميع الخطوط المرسومة.' : 'All drawn lines cleared.');
    }
  };

  // --- Export Handlers ---
  const handleExportExcel = () => {
    if (drawnLines.length === 0) return;

    const workbook = XLSX.utils.book_new();
    const rows: any[] = [];

    drawnLines.forEach(pt => {
      const rowObj: Record<string, any> = {};

      rowObj[lang === 'ar' ? 'المعرف (ID)' : 'ID'] = pt.id;
      rowObj[lang === 'ar' ? 'الطبقة (Layer)' : 'Layer'] = pt.layer || 'Lines';
      rowObj[lang === 'ar' ? 'كود اللون (Color)' : 'Color'] = pt.color || '#3b82f6';

      const sx = pt.path && pt.path[0] ? pt.path[0].x : pt.x;
      const sy = pt.path && pt.path[0] ? pt.path[0].y : pt.y;
      const ex = pt.path && pt.path.length > 1 ? pt.path[pt.path.length - 1].x : pt.x;
      const ey = pt.path && pt.path.length > 1 ? pt.path[pt.path.length - 1].y : pt.y;

      rowObj[lang === 'ar' ? 'إحداثي X البداية (Start X / Lon)' : 'Start X (Lon)'] = sx;
      rowObj[lang === 'ar' ? 'إحداثي Y البداية (Start Y / Lat)' : 'Start Y (Lat)'] = sy;
      rowObj[lang === 'ar' ? 'إحداثي X النهاية (End X / Lon)' : 'End X (Lon)'] = ex;
      rowObj[lang === 'ar' ? 'إحداثي Y النهاية (End Y / Lat)' : 'End Y (Lat)'] = ey;

      const lenMeters = pt.path ? calculatePathLength(pt.path) : 0;
      rowObj[lang === 'ar' ? 'الطول (متر)' : 'Length (m)'] = Number(lenMeters.toFixed(2));
      rowObj[lang === 'ar' ? 'الطول (كم)' : 'Length (km)'] = Number((lenMeters / 1000).toFixed(3));
      rowObj[lang === 'ar' ? 'عدد النقاط' : 'Vertices Count'] = pt.path ? pt.path.length : 2;

      if (pt.attributes) {
        Object.entries(pt.attributes).forEach(([k, v]) => {
          if (!rowObj.hasOwnProperty(k) && !['StartX', 'StartY', 'EndX', 'EndY', 'Length_m', 'ID', 'Layer', 'Color'].includes(k)) {
            rowObj[k] = v;
          }
        });
      }

      rowObj[lang === 'ar' ? 'رابط خريطة البداية' : 'Start Google Maps Link'] = `https://www.google.com/maps?q=${sy},${sx}`;

      rows.push(rowObj);
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, lang === 'ar' ? 'الخطوط المرسومة' : 'Drawn Lines');
    XLSX.writeFile(workbook, `Drawn_Map_Lines_Export.xlsx`);
  };

  const handleExportKMZ = async () => {
    if (drawnLines.length === 0) return;
    const baseName = 'Drawn_Map_Lines';
    const headers = drawnLines[0]?.attributes ? Object.keys(drawnLines[0].attributes) : undefined;
    const task = () => downloadKMZ(drawnLines, baseName, { mode: 'none' }, headers, headers);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تحضير وتصدير ملف KMZ لجوجل إيرث...' : 'Generating KMZ file...', task);
    } else {
      await task();
    }
  };

  const handleExportShapefile = async () => {
    if (drawnLines.length === 0) return;
    const baseName = 'Drawn_Map_Lines';
    const task = () => downloadShapefile(drawnLines, baseName);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تصدير حزمة Shapefile (SHP)...' : 'Creating Shapefile (SHP)...', task);
    } else {
      await task();
    }
  };

  const handleExportDXF = async () => {
    if (drawnLines.length === 0) return;
    const baseName = 'Drawn_Map_Lines';
    const task = () => downloadDXF(drawnLines, baseName);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تصدير ملف AutoCAD DXF...' : 'Creating DXF file...', task);
    } else {
      await task();
    }
  };

  const handleExportPDF = async () => {
    if (drawnLines.length === 0) return;
    const baseName = 'Drawn_Map_Lines';
    const task = () => downloadDataPDF(drawnLines, baseName, lang);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري توليد تقرير PDF الهندسي...' : 'Generating PDF file...', task);
    } else {
      await task();
    }
  };

  const handleExportGeoJSON = () => {
    if (drawnLines.length === 0) return;
    const features = drawnLines.map(pt => ({
      type: 'Feature' as const,
      properties: {
        id: pt.id,
        layer: pt.layer,
        color: pt.color,
        length_m: pt.path ? Number(calculatePathLength(pt.path).toFixed(2)) : 0,
        ...(pt.attributes || {})
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: (pt.path || []).map(p => [p.x, p.y])
      }
    }));

    const geojson = { type: 'FeatureCollection', features };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Drawn_Map_Lines.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFinishLineAction = () => {
    if (onFinishCurrentLine) {
      onFinishCurrentLine();
      return;
    }
    if (!currentVertices || currentVertices.length < 2) return;
    const newLine: GeoPoint = {
      id: lineConfig.name || `LINE_${(drawnLines?.length || 0) + 1}`,
      x: currentVertices[0].x,
      y: currentVertices[0].y,
      type: 'LineString',
      path: [...currentVertices],
      color: lineConfig.color || '#3b82f6',
      layer: lineConfig.layer || 'شبكة المياه',
      attributes: {
        StartX: currentVertices[0].x,
        StartY: currentVertices[0].y,
        EndX: currentVertices[currentVertices.length - 1].x,
        EndY: currentVertices[currentVertices.length - 1].y,
        Length_m: calculatePathLength(currentVertices),
        ...(lineConfig.diameter ? { Diameter: lineConfig.diameter, 'القطر': lineConfig.diameter } : {}),
        ...(lineConfig.material ? { Material: lineConfig.material, 'المادة': lineConfig.material } : {}),
        ...(lineConfig.permitNo ? { 'Permit No': lineConfig.permitNo, 'رقم التصريح': lineConfig.permitNo } : {}),
        ...(lineConfig.segmentId ? { 'segment id': lineConfig.segmentId, 'معرف الشريحة': lineConfig.segmentId } : {}),
        ...(lineConfig.notes ? { Notes: lineConfig.notes, 'ملاحظات': lineConfig.notes } : {})
      }
    };
    setDrawnLines(prev => [newLine, ...(prev || [])]);
    if (setGlobalPoints) {
      setGlobalPoints(prev => [newLine, ...(prev || [])]);
    }
    if (setDataId) {
      setDataId(`draw-line-${Date.now()}`);
    }
    setCurrentVertices([]);
    setIsDrawingOnMainMap(false);
    const match = lineConfig.name.match(/\d+$/);
    if (match) {
      const nextNum = parseInt(match[0], 10) + 1;
      setLineConfig(prev => ({ ...prev, name: prev.name.replace(/\d+$/, nextNum.toString()) }));
    } else {
      setLineConfig(prev => ({ ...prev, name: `LINE_${(drawnLines?.length || 0) + 2}` }));
    }
    setSuccess(lang === 'ar' ? `تم حفظ الخط (${newLine.id}) بنجاح!` : `Line ${newLine.id} saved!`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Main Container */}
      <div className="bg-[#0f3b4c] rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-6 lg:p-7 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-accent/20 border border-accent/40 rounded-2xl text-accent shadow-lg shrink-0">
              <PenTool className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-black text-white">
                  {lang === 'ar' ? 'تصميم ورسم الخطوط الهندسية' : 'Engineering Line Design & Drawing'}
                </h2>
                <span className="text-[10px] uppercase font-black bg-accent/20 text-accent px-2.5 py-0.5 rounded-full border border-accent/30 tracking-wider">
                  {lang === 'ar' ? 'مباشر على الخريطة' : 'Direct on Map'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-2xl leading-relaxed">
                {lang === 'ar' 
                  ? 'ارسم الخطوط مباشرة بالنقر على الخريطة الرئيسية المجاورة، أو استوردها من ملف إكسل بكامل الخصائص والبيانات.' 
                  : 'Draw lines directly by clicking on the main map, or import from Excel with complete attributes and properties.'}
              </p>
            </div>
          </div>

          {/* Mode Switcher Navigation Tabs */}
          <div className="flex items-center bg-[#071c27] p-1.5 rounded-2xl border border-white/10 shrink-0 self-start lg:self-auto gap-1 overflow-x-auto max-w-full">
            <button
              onClick={() => { setActiveMode('map-interactive'); setError(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeMode === 'map-interactive' 
                  ? "bg-accent text-primary shadow-md" 
                  : "text-white/70 hover:text-white hover:bg-white/5"
              )}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'الرسم المباشر' : 'Direct Map Draw'}</span>
            </button>

            <button
              onClick={() => { setActiveMode('file-import'); setError(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeMode === 'file-import' 
                  ? "bg-accent text-primary shadow-md" 
                  : "text-white/70 hover:text-white hover:bg-white/5"
              )}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'استيراد إكسل' : 'Excel Import'}</span>
            </button>

            <button
              onClick={() => { setActiveMode('manual-coords'); setError(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeMode === 'manual-coords' 
                  ? "bg-accent text-primary shadow-md" 
                  : "text-white/70 hover:text-white hover:bg-white/5"
              )}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إحداثيات يدوية' : 'Manual Coords'}</span>
            </button>

            <button
              onClick={() => { setActiveMode('lines-inventory'); setError(null); }}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap",
                activeMode === 'lines-inventory' 
                  ? "bg-accent text-primary shadow-md" 
                  : "text-white/70 hover:text-white hover:bg-white/5"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'السجل والتصدير' : 'Inventory & Export'}</span>
              {drawnLines.length > 0 && (
                <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                  {drawnLines.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="bg-red-500/10 border-s-4 border-red-500 p-3.5 mb-5 rounded-xl flex items-start gap-3 animate-in fade-in">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border-s-4 border-emerald-500 p-3.5 mb-5 rounded-xl flex items-start gap-3 animate-in fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-emerald-200">{success}</p>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 1: INTERACTIVE DIRECT MAP DRAWING */}
        {/* ======================================================== */}
        {activeMode === 'map-interactive' && (
          <div className="space-y-5">
            {/* Primary Action Button & Status Hero */}
            <div className="bg-gradient-to-r from-[#0b2d3d] to-[#071c27] p-5 sm:p-6 rounded-3xl border border-accent/30 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn("w-3 h-3 rounded-full", isDrawingOnMainMap ? "bg-emerald-400 animate-ping" : "bg-white/30")} />
                    <span className="text-xs font-black uppercase tracking-wider text-accent">
                      {isDrawingOnMainMap 
                        ? (lang === 'ar' ? 'وضع الرسم مفعّل على الخريطة الرئيسية' : 'Direct Drawing Active on Main Map')
                        : (lang === 'ar' ? 'جاهز للرسم على الخريطة' : 'Ready to Draw on Map')}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {isDrawingOnMainMap 
                      ? (lang === 'ar' ? 'انقر على الخريطة الرئيسية المجاورة لإضافة نقاط المسار' : 'Click on the main map to add line points')
                      : (lang === 'ar' ? 'اضغط الزر لبدء الرسم مباشرة على الخريطة' : 'Activate drawing to add lines directly')}
                  </h3>
                  <p className="text-xs text-white/70 mt-1">
                    {lang === 'ar'
                      ? 'يمكنك النقر المزدوج (Double Click) على الخريطة لإنهاء وحفظ الخط تلقائياً، أو استخدام زر الإنهاء من الشريط العائم على الخريطة.'
                      : 'You can double-click on the map to finish and save the line automatically, or use the finish button in the map floating bar.'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {!isDrawingOnMainMap ? (
                    <button
                      onClick={() => {
                        setIsDrawingOnMainMap(true);
                        setCurrentVertices([]);
                        setSuccess(lang === 'ar' ? 'تم تفعيل وضع الرسم! انقر على الخريطة المجاورة للبدء.' : 'Drawing mode activated! Click on the map.');
                      }}
                      className="px-6 py-3 bg-accent hover:bg-accent/90 text-primary font-black text-xs sm:text-sm rounded-2xl shadow-xl flex items-center gap-2.5 active:scale-95 transition-all shadow-accent/20"
                    >
                      <PenTool className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'بدء الرسم على الخريطة' : 'Start Drawing on Map'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setCurrentVertices(prev => prev.slice(0, -1))}
                        disabled={currentVertices.length === 0}
                        className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-40 transition-all active:scale-95"
                        title={lang === 'ar' ? 'تراجع عن آخر نقطة' : 'Undo Point'}
                      >
                        <Undo2 className="w-4 h-4 text-amber-400" />
                        <span>{lang === 'ar' ? 'تراجع' : 'Undo'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsDrawingOnMainMap(false);
                          setCurrentVertices([]);
                        }}
                        className="px-3.5 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <X className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
                      </button>

                      <button
                        onClick={handleFinishLineAction}
                        disabled={currentVertices.length < 2}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg flex items-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                      >
                        <Check className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'إنهاء وحفظ الخط' : 'Finish & Save'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Live drawing metrics bar */}
              {isDrawingOnMainMap && (
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-white/70">{lang === 'ar' ? 'النقاط المسجلة:' : 'Points:'}</span>
                    <span className="bg-accent/20 text-accent font-black font-mono px-2.5 py-0.5 rounded-lg border border-accent/30">
                      {currentVertices.length} {lang === 'ar' ? 'نقاط' : 'pts'}
                    </span>
                    {activeLineLengthMeters > 0 && (
                      <>
                        <span className="text-white/40">|</span>
                        <span className="text-white/70">{lang === 'ar' ? 'الطول الحالي:' : 'Current Length:'}</span>
                        <span className="bg-emerald-500/20 text-emerald-300 font-black font-mono px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                          {activeLineLengthMeters >= 1000 
                            ? `${(activeLineLengthMeters / 1000).toFixed(2)} ${lang === 'ar' ? 'كم' : 'km'}` 
                            : `${activeLineLengthMeters.toFixed(1)} ${lang === 'ar' ? 'م' : 'm'}`}
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-[11px] text-accent font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    {lang === 'ar' ? 'الرسم يظهر مباشرة على الخريطة مع شريط تحكم عائم في الأعلى' : 'Live preview on the main map with floating controls on top'}
                  </span>
                </div>
              )}
            </div>

            {/* Line Attributes & Engineering Properties Box */}
            <div className="bg-[#0b2d3d] p-5 sm:p-6 rounded-3xl border border-white/10 space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Sliders className="w-5 h-5 text-accent" />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    {lang === 'ar' ? 'خصائص وسمات الخط الهندسي' : 'Line Attributes & Engineering Properties'}
                  </h3>
                  <p className="text-[11px] text-white/50">
                    {lang === 'ar' ? 'حدد اسم الخط، الطبقة، القطر، المادة، ورقم التصريح لحفظها في الجداول وملفات التصدير' : 'Set layer, diameter, material, permit number and other GIS metadata'}
                  </p>
                </div>
              </div>

              {/* Grid 1: Basic Identifiers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Line ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-accent" />
                    <span>{lang === 'ar' ? 'اسم / معرف الخط (ID)' : 'Line ID / Name'}</span>
                  </label>
                  <input
                    type="text"
                    value={lineConfig.name}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="LINE_1"
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                  />
                </div>

                {/* 2. Layer Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-accent" />
                    <span>{lang === 'ar' ? 'اسم الطبقة (Layer)' : 'Layer Name'}</span>
                  </label>
                  <input
                    type="text"
                    list="layer-options-list"
                    value={lineConfig.layer}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, layer: e.target.value }))}
                    placeholder="شبكة المياه"
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                  />
                  <datalist id="layer-options-list">
                    {LAYER_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>

                {/* 3. Permit No */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 flex items-center gap-1">
                    <FileCheck className="w-3 h-3 text-emerald-400" />
                    <span>{lang === 'ar' ? 'رقم الترخيص (Permit No)' : 'Permit Number'}</span>
                  </label>
                  <input
                    type="text"
                    value={lineConfig.permitNo}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, permitNo: e.target.value }))}
                    placeholder="PERMIT-2026-X"
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                  />
                </div>

                {/* 4. Segment ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 flex items-center gap-1">
                    <Hash className="w-3 h-3 text-cyan-400" />
                    <span>{lang === 'ar' ? 'معرف الشريحة (Segment ID)' : 'Segment ID'}</span>
                  </label>
                  <input
                    type="text"
                    value={lineConfig.segmentId}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, segmentId: e.target.value }))}
                    placeholder="SEG_01"
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                  />
                </div>
              </div>

              {/* Grid 2: Engineering Specs (Diameter & Material) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Diameter */}
                <div className="space-y-2 p-3.5 bg-[#071c27] rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-accent" />
                      <span>{lang === 'ar' ? 'القطر (Diameter)' : 'Pipe Diameter'}</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={lineConfig.diameter}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, diameter: e.target.value }))}
                    placeholder="110, 160, 200..."
                    className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none"
                  />
                  {/* Quick Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {DIAMETER_CHIPS.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setLineConfig(prev => ({ ...prev, diameter: chip }))}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                          lineConfig.diameter === chip
                            ? "bg-accent text-primary border-accent"
                            : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Material */}
                <div className="space-y-2 p-3.5 bg-[#071c27] rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{lang === 'ar' ? 'المادة (Material)' : 'Pipe Material'}</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={lineConfig.material}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, material: e.target.value }))}
                    placeholder="HDPE, UPVC, DI..."
                    className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none"
                  />
                  {/* Quick Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {MATERIAL_CHIPS.map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setLineConfig(prev => ({ ...prev, material: chip }))}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                          lineConfig.material === chip
                            ? "bg-cyan-400 text-primary border-cyan-400"
                            : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color & Width Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                {/* Color Swatches */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white/70 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-accent" />
                    {lang === 'ar' ? 'لون الخط:' : 'Color:'}
                  </span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setLineConfig(prev => ({ ...prev, color: c.hex }))}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all shrink-0 shadow-sm",
                        lineConfig.color === c.hex ? "border-white scale-125 ring-2 ring-accent" : "border-transparent opacity-80 hover:opacity-100"
                      )}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={lineConfig.color}
                    onChange={(e) => setLineConfig(prev => ({ ...prev, color: e.target.value }))}
                    className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                    title={lang === 'ar' ? 'لون مخصص' : 'Custom Color'}
                  />
                </div>

                {/* Width selector */}
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-white/70">
                    {lang === 'ar' ? 'سمك الخط:' : 'Thickness:'}
                  </span>
                  {[2, 4, 6, 8].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setLineConfig(prev => ({ ...prev, width: w }))}
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-black transition-all border",
                        lineConfig.width === w ? "bg-accent/20 border-accent text-accent" : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                      )}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 2: EXCEL FILE IMPORT & COLUMN MAPPING */}
        {/* ======================================================== */}
        {activeMode === 'file-import' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {!file ? (
              <div className="w-full relative group">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={loading}
                />
                <div className={cn(
                  "w-full rounded-3xl border-2 border-dashed transition-all p-8 sm:p-12 flex flex-col items-center justify-center gap-4 text-center",
                  loading ? "border-accent/20 bg-accent/5" : "border-white/15 bg-white/[0.02] group-hover:border-accent/50 group-hover:bg-accent/5"
                )}>
                  <div className={cn(
                    "w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all shadow-xl",
                    loading ? "bg-accent/20" : "bg-white/5 group-hover:bg-accent/20"
                  )}>
                    <FileSpreadsheet className={cn(
                      "w-8 h-8 sm:w-10 sm:h-10",
                      loading ? "text-accent animate-pulse" : "text-white/40 group-hover:text-accent"
                    )} />
                  </div>
                  <div>
                    <p className="text-base sm:text-lg font-black text-white mb-1.5">
                      {loading ? (lang === 'ar' ? 'جاري قراءة ملف الإكسل...' : 'Reading Excel file...') : (lang === 'ar' ? 'اضغط أو اسحب ملف إكسل هنا' : 'Click or drag Excel / CSV file here')}
                    </p>
                    <p className="text-xs text-white/50 font-medium">
                      {lang === 'ar' 
                        ? 'يدعم ملفات إكسل (.xlsx, .xls) و .csv التي تحتوي على إحداثيات البداية والنهاية (Start X, Start Y, End X, End Y)' 
                        : 'Supports .xlsx, .xls, and .csv with start & end coordinates columns'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0b2d3d] p-5 sm:p-7 rounded-3xl border border-white/10 space-y-6">
                {/* File Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-white text-sm sm:text-base">{file.filename}</h3>
                      <p className="text-xs text-white/50">{file.data.length} {lang === 'ar' ? 'صف بيانات' : 'data rows'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setFile(null); setSuccess(null); setError(null); }}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all text-xs font-bold border border-white/10"
                  >
                    {lang === 'ar' ? 'تغيير الملف' : 'Change File'}
                  </button>
                </div>

                {/* Mandatory Coordinate Mappings */}
                <div className="space-y-3">
                  <span className="text-xs font-black text-accent uppercase tracking-wider block">
                    {lang === 'ar' ? '1. مطابقة أعمدة الإحداثيات الإلزامية' : '1. Mandatory Coordinate Columns'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* Start X */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80">
                        {lang === 'ar' ? 'X البداية (Start X / Lon)' : 'Start X (Lon)'} <span className="text-red-400">*</span>
                      </label>
                      <select 
                        value={startXCol}
                        onChange={(e) => setStartXCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Start Y */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80">
                        {lang === 'ar' ? 'Y البداية (Start Y / Lat)' : 'Start Y (Lat)'} <span className="text-red-400">*</span>
                      </label>
                      <select 
                        value={startYCol}
                        onChange={(e) => setStartYCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* End X */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80">
                        {lang === 'ar' ? 'X النهاية (End X / Lon)' : 'End X (Lon)'} <span className="text-red-400">*</span>
                      </label>
                      <select 
                        value={endXCol}
                        onChange={(e) => setEndXCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* End Y */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/80">
                        {lang === 'ar' ? 'Y النهاية (End Y / Lat)' : 'End Y (Lat)'} <span className="text-red-400">*</span>
                      </label>
                      <select 
                        value={endYCol}
                        onChange={(e) => setEndYCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Optional Attribute Mappings */}
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <span className="text-xs font-black text-cyan-300 uppercase tracking-wider block">
                    {lang === 'ar' ? '2. مطابقة أعمدة الخصائص الهندسية والترخيص (اختياري)' : '2. Optional Attributes & Engineering Fields'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* ID */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود المعرف (ID)' : 'ID Column'}
                      </label>
                      <select 
                        value={idCol}
                        onChange={(e) => setIdCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'توليد تلقائي' : 'Auto generate'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Layer */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود الطبقة (Layer)' : 'Layer Column'}
                      </label>
                      <select 
                        value={layerCol}
                        onChange={(e) => setLayerCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'استخدام الطبقة المحددة' : 'Use default layer'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Diameter */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود القطر (Diameter)' : 'Diameter Column'}
                      </label>
                      <select 
                        value={diameterCol}
                        onChange={(e) => setDiameterCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'غير محدد' : 'None'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Material */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود المادة (Material)' : 'Material Column'}
                      </label>
                      <select 
                        value={materialCol}
                        onChange={(e) => setMaterialCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'غير محدد' : 'None'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Permit No */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود رقم التصريح (Permit No)' : 'Permit No Column'}
                      </label>
                      <select 
                        value={permitCol}
                        onChange={(e) => setPermitCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'غير محدد' : 'None'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    {/* Segment ID */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/70">
                        {lang === 'ar' ? 'عمود الشريحة (Segment ID)' : 'Segment ID Column'}
                      </label>
                      <select 
                        value={segmentCol}
                        onChange={(e) => setSegmentCol(e.target.value)}
                        className="w-full bg-[#071c27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-accent outline-none"
                      >
                        <option value="">{lang === 'ar' ? 'غير محدد' : 'None'}</option>
                        {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Import Action Button */}
                <button
                  onClick={generateLinesFromFile}
                  disabled={loading || !startXCol || !startYCol || !endXCol || !endYCol}
                  className="w-full py-4 rounded-2xl bg-accent text-primary font-black flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-accent/20 text-sm"
                >
                  <PenTool className="w-5 h-5" />
                  {loading ? (lang === 'ar' ? 'جاري التحويل ورسم الخطوط...' : 'Generating...') : (lang === 'ar' ? 'رسم وتحويل الخطوط إلى الخريطة' : 'Import & Draw Lines on Map')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 3: MANUAL COORDINATES INPUT */}
        {/* ======================================================== */}
        {activeMode === 'manual-coords' && (
          <div className="bg-[#0b2d3d] p-5 sm:p-7 rounded-3xl border border-white/10 space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
              <Navigation className="w-5 h-5 text-accent" />
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">
                  {lang === 'ar' ? 'إدخال إحداثيات البداية والنهاية يدوياً أو التقاطها من الخريطة' : 'Manual Coordinates Input & Map Picking'}
                </h3>
                <p className="text-[11px] text-white/50">
                  {lang === 'ar' ? 'أدخل إحداثيات X (شرق) و Y (شمال) للبداية والنهاية أو انقر على "التقاط من الخريطة" لتحديدها فورياً' : 'Enter coordinates or pick points directly from the main map'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Start Coords Card */}
              <div className="p-4 sm:p-5 bg-[#071c27] rounded-2xl border border-emerald-500/30 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black text-emerald-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {lang === 'ar' ? 'نقطة البداية (Start Point)' : 'Start Point'}
                  </span>
                  <button
                    onClick={() => {
                      setManualPickingTarget('start');
                      setSuccess(lang === 'ar' ? '🎯 انقر على الخريطة الرئيسية لاختيار نقطة البداية.' : 'Click on main map to pick start point.');
                    }}
                    className={cn(
                      "text-xs font-black px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1",
                      manualPickingTarget === 'start'
                        ? "bg-accent text-primary border-accent animate-pulse"
                        : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                    )}
                  >
                    <MousePointer className="w-3 h-3" />
                    {lang === 'ar' ? 'التقاط من الخريطة' : 'Pick on Map'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-white/60">X (Longitude / Easting)</span>
                    <input
                      type="number"
                      step="any"
                      value={manualStartX}
                      onChange={(e) => setManualStartX(e.target.value)}
                      placeholder="46.6753"
                      className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-white/60">Y (Latitude / Northing)</span>
                    <input
                      type="number"
                      step="any"
                      value={manualStartY}
                      onChange={(e) => setManualStartY(e.target.value)}
                      placeholder="24.7136"
                      className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* End Coords Card */}
              <div className="p-4 sm:p-5 bg-[#071c27] rounded-2xl border border-red-500/30 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black text-red-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {lang === 'ar' ? 'نقطة النهاية (End Point)' : 'End Point'}
                  </span>
                  <button
                    onClick={() => {
                      setManualPickingTarget('end');
                      setSuccess(lang === 'ar' ? '🎯 انقر على الخريطة الرئيسية لاختيار نقطة النهاية.' : 'Click on main map to pick end point.');
                    }}
                    className={cn(
                      "text-xs font-black px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1",
                      manualPickingTarget === 'end'
                        ? "bg-accent text-primary border-accent animate-pulse"
                        : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                    )}
                  >
                    <MousePointer className="w-3 h-3" />
                    {lang === 'ar' ? 'التقاط من الخريطة' : 'Pick on Map'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-white/60">X (Longitude / Easting)</span>
                    <input
                      type="number"
                      step="any"
                      value={manualEndX}
                      onChange={(e) => setManualEndX(e.target.value)}
                      placeholder="46.6800"
                      className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-white/60">Y (Latitude / Northing)</span>
                    <input
                      type="number"
                      step="any"
                      value={manualEndY}
                      onChange={(e) => setManualEndY(e.target.value)}
                      placeholder="24.7200"
                      className="w-full bg-[#0b2d3d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-accent outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddManualLine}
              disabled={!manualStartX || !manualStartY || !manualEndX || !manualEndY}
              className="w-full py-4 rounded-2xl bg-accent text-primary font-black flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-[0.99] transition-all disabled:opacity-50 text-sm shadow-xl shadow-accent/20"
            >
              <PlusCircle className="w-5 h-5" />
              <span>{lang === 'ar' ? 'إضافة الخط إلى الخريطة' : 'Add Line to Map'}</span>
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 4: LINES INVENTORY & UNIVERSAL EXPORT SUITE */}
        {/* ======================================================== */}
        {activeMode === 'lines-inventory' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {drawnLines.length === 0 ? (
              <div className="p-8 sm:p-12 text-center bg-[#0b2d3d] rounded-3xl border border-white/10 space-y-3">
                <PenTool className="w-12 h-12 text-white/30 mx-auto" />
                <h3 className="text-base font-bold text-white">
                  {lang === 'ar' ? 'لا توجد خطوط مرسومة حالياً' : 'No drawn lines currently'}
                </h3>
                <p className="text-xs text-white/50 max-w-md mx-auto">
                  {lang === 'ar' 
                    ? 'يمكنك البدء برسم الخطوط مباشرة بالنقر على الخريطة أو استيرادها من ملف إكسل لتظهر هنا في جدول السجل مع جميع خيارات التصدير.'
                    : 'Start drawing lines on the map or import from Excel to see them listed here with export tools.'}
                </p>
                <button
                  onClick={() => setActiveMode('map-interactive')}
                  className="px-5 py-2.5 bg-accent text-primary font-black text-xs rounded-xl shadow-lg hover:bg-accent/90 transition-all inline-flex items-center gap-2"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'انتقل إلى الرسم المباشر' : 'Go to Direct Drawing'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stats Dashboard */}
                <div className="bg-[#0b2d3d] p-5 sm:p-6 rounded-3xl border border-accent/30 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-white font-black text-sm sm:text-base">
                          {lang === 'ar' ? 'إحصائيات وسجل الخطوط المصممة' : 'Drawn Lines Inventory'}
                        </h3>
                        <p className="text-xs text-white/50">
                          {lang === 'ar' ? 'جاهزة للتصدير والدمج بكامل الخصائص والبيانات الهندسية' : 'Ready for GIS/CAD export'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClearAllLines}
                        className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'مسح الكل' : 'Clear All'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-center">
                    <div className="p-3.5 bg-[#071c27] rounded-2xl border border-white/5">
                      <span className="text-[11px] font-bold text-white/50 block mb-1">
                        {lang === 'ar' ? 'إجمالي عدد الخطوط' : 'Total Lines'}
                      </span>
                      <span className="text-xl font-black text-accent font-mono">
                        {drawnLines.length}
                      </span>
                    </div>
                    <div className="p-3.5 bg-[#071c27] rounded-2xl border border-white/5">
                      <span className="text-[11px] font-bold text-white/50 block mb-1">
                        {lang === 'ar' ? 'إجمالي الأطوال' : 'Total Length'}
                      </span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {totalLengthM >= 1000 ? `${(totalLengthM / 1000).toFixed(2)} km` : `${totalLengthM.toFixed(1)} m`}
                      </span>
                    </div>
                    <div className="p-3.5 bg-[#071c27] rounded-2xl border border-white/5 col-span-2 sm:col-span-1">
                      <span className="text-[11px] font-bold text-white/50 block mb-1">
                        {lang === 'ar' ? 'عدد الطبقات' : 'Layers Count'}
                      </span>
                      <span className="text-xl font-black text-cyan-300 font-mono">
                        {totalLayersCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Drawn Lines Data Table */}
                <div className="bg-[#0b2d3d] rounded-3xl border border-white/10 overflow-hidden shadow-xl">
                  <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-black text-white">
                      {lang === 'ar' ? 'قائمة الخطوط المسجلة' : 'Registered Lines List'}
                    </span>
                    <span className="text-[11px] text-accent font-mono font-bold">
                      {drawnLines.length} {lang === 'ar' ? 'خط' : 'lines'}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[360px] scrollbar-thin">
                    <table className="w-full text-start text-xs text-white/90">
                      <thead className="bg-[#071c27] text-white/60 uppercase text-[10px] font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-3 text-start">{lang === 'ar' ? 'المعرف' : 'ID'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'الطبقة' : 'Layer'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'اللون' : 'Color'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'الطول' : 'Length'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'القطر' : 'Diameter'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'المادة' : 'Material'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'رقم الترخيص' : 'Permit No'}</th>
                          <th className="p-3 text-start">{lang === 'ar' ? 'الشريحة' : 'Segment ID'}</th>
                          <th className="p-3 text-center">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {drawnLines.map((line, idx) => {
                          const len = line.path ? calculatePathLength(line.path) : 0;
                          return (
                            <tr key={line.id || idx} className="hover:bg-white/[0.03] transition-colors">
                              <td className="p-3 font-mono font-bold text-accent">{line.id}</td>
                              <td className="p-3">{line.layer || 'Lines'}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ backgroundColor: line.color || '#3b82f6' }} />
                                  <span className="font-mono text-[10px] text-white/60">{line.color}</span>
                                </div>
                              </td>
                              <td className="p-3 font-mono text-emerald-400 font-bold">
                                {len >= 1000 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(1)} m`}
                              </td>
                              <td className="p-3 font-mono">{line.attributes?.Diameter || line.attributes?.['القطر'] || '-'}</td>
                              <td className="p-3">{line.attributes?.Material || line.attributes?.['المادة'] || '-'}</td>
                              <td className="p-3 font-mono text-cyan-300">{line.attributes?.['Permit No'] || line.attributes?.['رقم التصريح'] || '-'}</td>
                              <td className="p-3 font-mono text-amber-300">{line.attributes?.['segment id'] || line.attributes?.['معرف الشريحة'] || '-'}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {onFocusPoint && (
                                    <button
                                      onClick={() => onFocusPoint(line)}
                                      className="p-1.5 hover:bg-white/10 text-accent rounded-lg transition-colors"
                                      title={lang === 'ar' ? 'توسيط وتكبير على الخريطة' : 'Zoom to Line on Map'}
                                    >
                                      <Maximize2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteLine(line.id)}
                                    className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                    title={lang === 'ar' ? 'حذف الخط' : 'Delete Line'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Universal Export Suite */}
                <div className="bg-[#0b2d3d] p-5 sm:p-6 rounded-3xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Download className="w-5 h-5 text-accent" />
                      <h4 className="text-sm font-black text-white uppercase tracking-wider">
                        {lang === 'ar' ? 'تصدير الخطوط بجميع الصيغ الهندسية' : 'Universal Export Formats'}
                      </h4>
                    </div>
                    <span className="text-[10px] text-accent font-bold bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
                      {lang === 'ar' ? 'تصدير شامل بكامل الإحداثيات والخصائص' : 'Full GIS & CAD Suite'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* 1. Excel */}
                    <button
                      onClick={handleExportExcel}
                      className="bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير جدول اكسل يحتوي على جميع الأعمدة والبيانات' : 'Export Excel with all attributes'}
                    >
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'إكسل (Excel)' : 'Excel'}</span>
                      <span className="text-[9px] text-emerald-400/70 font-medium">.xlsx</span>
                    </button>

                    {/* 2. KMZ */}
                    <button
                      onClick={handleExportKMZ}
                      className="bg-[#071c27] hover:bg-[#114056] border border-accent/40 text-accent font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير ملف KMZ لجوجل إيرث' : 'Export KMZ for Google Earth'}
                    >
                      <DownloadCloud className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'KMZ (إيرث)' : 'KMZ Earth'}</span>
                      <span className="text-[9px] text-accent/70 font-medium">Google Earth</span>
                    </button>

                    {/* 3. Shapefile */}
                    <button
                      onClick={handleExportShapefile}
                      className="bg-[#071c27] hover:bg-[#114056] border border-cyan-500/40 text-cyan-300 font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير ملف Shapefile لنظم المعلومات الجغرافية' : 'Export ESRI Shapefile ZIP'}
                    >
                      <FolderArchive className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'شيب فايل' : 'Shapefile'}</span>
                      <span className="text-[9px] text-cyan-400/70 font-medium">ESRI GIS</span>
                    </button>

                    {/* 4. AutoCAD */}
                    <button
                      onClick={handleExportDXF}
                      className="bg-[#071c27] hover:bg-[#114056] border border-amber-500/40 text-amber-300 font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير ملف أوتوكاد DXF' : 'Export AutoCAD DXF'}
                    >
                      <PenTool className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'أوتوكاد (DXF)' : 'AutoCAD'}</span>
                      <span className="text-[9px] text-amber-400/70 font-medium">CAD Vector</span>
                    </button>

                    {/* 5. PDF */}
                    <button
                      onClick={handleExportPDF}
                      className="bg-[#071c27] hover:bg-[#114056] border border-rose-500/40 text-rose-300 font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير تقرير PDF مفصل' : 'Export PDF Report'}
                    >
                      <FileText className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'تقرير PDF' : 'PDF Report'}</span>
                      <span className="text-[9px] text-rose-400/70 font-medium">Document</span>
                    </button>

                    {/* 6. GeoJSON */}
                    <button
                      onClick={handleExportGeoJSON}
                      className="bg-[#071c27] hover:bg-[#114056] border border-indigo-500/40 text-indigo-300 font-black p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-lg active:scale-95 transition-all group"
                      title={lang === 'ar' ? 'تصدير ملف GeoJSON القياسي' : 'Export GeoJSON'}
                    >
                      <Globe className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'GeoJSON' : 'GeoJSON'}</span>
                      <span className="text-[9px] text-indigo-400/70 font-medium">Standard JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
