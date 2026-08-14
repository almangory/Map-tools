
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Download, Check, Split, Trash2, Activity,
  Presentation, FolderInput, Menu, X, PanelTop,
  SlidersHorizontal, Loader2, Map as MapIcon, Globe,
  BarChart3, Ruler, MapPin, Layers, RefreshCw,
  FileSpreadsheet, ToggleLeft, ToggleRight, CheckSquare, Square,
  Shapes, PieChart, FileText, DownloadCloud, Settings2, Info,
  MapPinned, MousePointer2, Eraser, FileUp, Archive, CircleDot,
  BoxSelect, PlusSquare, Scissors, Languages, Palette, Mail,
  ChevronRight, ListOrdered, Locate, Zap, Navigation, FolderOpen, Package,
  CloudDownload, GitBranch, UnfoldVertical, MapPin as MapPinIcon,
  Target, Sparkles, Hash, Maximize, Crop, Layers2, Edit3, Filter, Search,
  Database, Droplet, AlertTriangle, AlertOctagon, RotateCcw, Save, Smartphone, PenTool,
  Fingerprint, HardDrive, Moon, Sun, ShieldCheck, CheckCircle2, FolderArchive, Waves
} from 'lucide-react';
import { GitCompare } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

import { ParsedFile, ColumnMapping, GeoPoint, SplitterMode, KmlSplitMode, AnalysisItem, KmlExportOptions, SplitPolygon } from './types';
import { COMMON_EPSG } from './constants';
import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ, fetchMyMapsKML, extractAllPointAttributes, extractHeadersFromPoints, parseDescriptionToAttributes, stripHtml, cleanZoneValue, isWaterPoint, isSewerPoint } from './services/parserService';
import { transformPoints, identifyPotentialCRS, parseCoordinatesFromText } from './services/crs';
import { downloadBlob, downloadKMZ, downloadKMZGroupedZip, generateKML, generateKMLChunks, generateKMLFolderContent, generateKMLStyles } from './services/kmlService';
import { getReverseGeocode, matchNearestStreetName, calculatePathLength, splitLineString, splitLineIntoParts, fetchStreetsInPolygon, isPointInPolygon, clipLineToPolygon, calculateConvexHull, calculateBoundingBox, bufferPolygon, splitLinesAtIntersections, detectSpatialOverlap, resolveSpatialOverlaps, detectExactDuplicates, detectLineIntersections, resolveExactDuplicates, trimLinesAtIntersections, detectNetworkGaps, NetworkGap, OverlapResult, isBlackLine } from './services/geometryService';
import { generateAnalysisPPTX, generateAnalysisPDF, generateWMainlinePPTX, generateWWMainlinePPTX } from './services/reportService';
import { formatProjectIdForExcel, cleanSegmentId, getCanonicalSegmentKey } from './services/storageService';
import { downloadDXF } from './services/dxfExportService';
import { downloadDataPDF, downloadNetworkGapsPDF } from './services/pdfExportService';
import { downloadShapefile } from './services/shapefileExportService';
import { getCanonicalColorMap, STATUS_CATEGORIES, matchStatusByColor, colorDistance } from './services/colorUtils';
import MapPreview from './components/MapPreview';
import { ElevationProfileModal } from './components/ElevationProfileModal';
import { DataFormatter } from './components/DataFormatter';
import { SegmentLengthChart } from './components/SegmentLengthChart';
import { PermitLengthChart } from './components/PermitLengthChart';
import { FileComparator } from './components/FileComparator';
import { LineDrawerTab } from './components/LineDrawerTab';
import { MapClassifier } from './components/MapClassifier';
import { MapViewer } from './components/MapViewer';
import { SegmentVaultManager } from './components/SegmentVaultManager';
import { SbcValidator, performSbcAuditEngine } from './components/SbcValidator';
import { InstallPwaModal } from './components/InstallPwaModal';
import { ToolHoverTooltip } from './components/ToolHoverTooltip';
import { translations, Language } from './translations';
import JSZipModule from 'jszip';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule && (JSZipModule as any).default) ? (JSZipModule as any).default : JSZipModule;

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const PALETTE = ['#3b82f6', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#d946ef'];

const SAMPLE_GDB_POINTS: GeoPoint[] = [
  {
    id: 'W_MAINLINE_300_DI_01',
    x: 46.6753,
    y: 24.7136,
    type: 'LineString',
    layer: 'W_MAINLINE',
    description: 'Geodatabase Water Mainline | Material: Ductile Iron (DI) | Diameter: 300mm | Status: Active',
    color: '#00a8e8',
    attr1: 'Material: Ductile Iron (DI)',
    attr2: 'Diameter: 300mm',
    path: [
      { x: 46.6753, y: 24.7136, z: 0 },
      { x: 46.6775, y: 24.7158, z: 0 },
      { x: 46.6812, y: 24.7180, z: 0 },
      { x: 46.6850, y: 24.7195, z: 0 }
    ]
  },
  {
    id: 'W_MAINLINE_400_DI_02',
    x: 46.6850,
    y: 24.7195,
    type: 'LineString',
    layer: 'W_MAINLINE',
    description: 'Geodatabase Water Mainline | Material: Ductile Iron (DI) | Diameter: 400mm | Status: Active',
    color: '#00a8e8',
    attr1: 'Material: Ductile Iron (DI)',
    attr2: 'Diameter: 400mm',
    path: [
      { x: 46.6850, y: 24.7195, z: 0 },
      { x: 46.6910, y: 24.7215, z: 0 },
      { x: 46.6950, y: 24.7230, z: 0 }
    ]
  },
  {
    id: 'W_MAINLINE_200_HDPE_03',
    x: 46.6775,
    y: 24.7158,
    type: 'LineString',
    layer: 'W_MAINLINE',
    description: 'Geodatabase Water Mainline | Material: HDPE | Diameter: 200mm | Status: Proposed',
    color: '#00c8b3',
    attr1: 'Material: HDPE',
    attr2: 'Diameter: 200mm',
    path: [
      { x: 46.6775, y: 24.7158, z: 0 },
      { x: 46.6790, y: 24.7120, z: 0 },
      { x: 46.6815, y: 24.7095, z: 0 }
    ]
  },
  {
    id: 'W_MAINLINE_600_CS_04',
    x: 46.6700,
    y: 24.7100,
    type: 'LineString',
    layer: 'W_MAINLINE',
    description: 'Geodatabase Primary Transmission Mainline | Material: Carbon Steel (CS) | Diameter: 600mm | Status: Active',
    color: '#005fad',
    attr1: 'Material: Carbon Steel (CS)',
    attr2: 'Diameter: 600mm',
    path: [
      { x: 46.6700, y: 24.7100, z: 0 },
      { x: 46.6730, y: 24.7125, z: 0 },
      { x: 46.6753, y: 24.7136, z: 0 }
    ]
  },
  {
    id: 'WW_MAINLINE_400_UPVC_01',
    x: 46.6650,
    y: 24.7080,
    type: 'LineString',
    layer: 'WW_MAINLINE',
    description: 'Geodatabase Wastewater Mainline | Material: uPVC | Diameter: 400mm | Status: Active',
    color: '#8b5cf6',
    attr1: 'Material: uPVC',
    attr2: 'Diameter: 400mm',
    path: [
      { x: 46.6650, y: 24.7080, z: 0 },
      { x: 46.6680, y: 24.7100, z: 0 },
      { x: 46.6710, y: 24.7110, z: 0 }
    ]
  },
  {
    id: 'WW_MAINLINE_500_Concrete_02',
    x: 46.6710,
    y: 24.7110,
    type: 'LineString',
    layer: 'WW_MAINLINE',
    description: 'Geodatabase Wastewater Mainline | Material: Concrete (CO) | Diameter: 500mm | Status: Active',
    color: '#a78bfa',
    attr1: 'Material: Concrete (CO)',
    attr2: 'Diameter: 500mm',
    path: [
      { x: 46.6710, y: 24.7110, z: 0 },
      { x: 46.6750, y: 24.7120, z: 0 },
      { x: 46.6790, y: 24.7130, z: 0 }
    ]
  },
  {
    id: 'WW_MAINLINE_300_UPVC_03',
    x: 46.6800,
    y: 24.7150,
    type: 'LineString',
    layer: 'WW_MAINLINE',
    description: 'Geodatabase Wastewater Mainline | Material: uPVC | Diameter: 300mm | Status: Proposed',
    color: '#8b5cf6',
    attr1: 'Material: uPVC',
    attr2: 'Diameter: 300mm',
    path: [
      { x: 46.6800, y: 24.7150, z: 0 },
      { x: 46.6820, y: 24.7130, z: 0 },
      { x: 46.6850, y: 24.7100, z: 0 }
    ]
  }
];

export const defaultFields = [
  'INNERDIAMETER',
  'SHAPE_Length',
  'Permit No',
  'segment id',
  'ZONE',
  'Drilling type',
  'Stage',
  'SHAPE',
  'Street',
  'STREETNAME'
];

const GeocodingModeSelector: React.FC<{
  mode: 'accurate' | 'fast';
  setMode: (m: 'accurate' | 'fast') => void;
  lang: 'ar' | 'en';
}> = ({ mode, setMode, lang }) => (
  <div className="bg-[#0e3f53]/60 p-4 rounded-2xl border border-white/10 space-y-3 my-3">
    <div className="flex items-center justify-between text-xs font-black text-white/90">
      <span className="flex items-center gap-2">
        <Target className="w-4 h-4 text-accent" />
        {lang === 'ar' ? 'نمط دقة جلب أسماء الشوارع' : 'Geocoding Accuracy Mode'}
      </span>
      <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm", mode === 'accurate' ? "bg-accent/20 text-accent border border-accent/40" : "bg-blue-500/20 text-blue-300 border border-blue-500/30")}>
        {mode === 'accurate' ? (lang === 'ar' ? '🎯 دقيق جداً' : '🎯 High Accuracy') : (lang === 'ar' ? '⚡ سريع' : '⚡ Fast')}
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 p-1 bg-black/30 rounded-xl border border-white/5">
      <button
        type="button"
        onClick={() => setMode('accurate')}
        className={cn(
          "py-2.5 px-3 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
          mode === 'accurate'
            ? "bg-accent text-primary shadow-lg"
            : "text-white/60 hover:text-white hover:bg-white/5"
        )}
      >
        <Target className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'بحث دقيق جداً' : 'Accurate Search'}</span>
      </button>
      <button
        type="button"
        onClick={() => setMode('fast')}
        className={cn(
          "py-2.5 px-3 rounded-lg text-[11px] font-black transition-all flex items-center justify-center gap-1.5",
          mode === 'fast'
            ? "bg-blue-500 text-white shadow-lg"
            : "text-white/60 hover:text-white hover:bg-white/5"
        )}
      >
        <Zap className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'جلب سريع' : 'Fast Fetch'}</span>
      </button>
    </div>
    <p className="text-[10px] text-white/60 leading-relaxed">
      {mode === 'accurate'
        ? (lang === 'ar' ? '🎯 يفحص الإحداثيات بدقة عالية متناهية لكل عنصر بشكل مستقل مع حساب الشارع الأقرب هندسياً.' : '🎯 Independently calculates exact nearest road geometry for every coordinate.')
        : (lang === 'ar' ? '⚡ يعتمد على تجميع النقاط القريبة لسرعة المعالجة مع الملفات الكبيرة.' : '⚡ Groups nearby points to accelerate geocoding for large datasets.')}
    </p>
  </div>
);

const SETTINGS_KEY = 'geo_app_user_preferences_v1';

const loadSavedPreference = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(`${SETTINGS_KEY}_${key}`);
    if (item !== null) {
      return JSON.parse(item) as T;
    }
  } catch (e) {
    console.error('Failed to load preference:', key, e);
  }
  return defaultValue;
};

const savePreference = <T,>(key: string, value: T) => {
  try {
    localStorage.setItem(`${SETTINGS_KEY}_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save preference:', key, e);
  }
};

export const isLineElement = (pt: GeoPoint): boolean => {
  if (!pt || pt.isDuplicateOverlay) return false;

  // 1. Check explicit geometry type
  const gType = String(pt.type || '').trim().toLowerCase();
  if (
    gType === 'polygon' || 
    gType === 'multipolygon' || 
    gType === 'point' || 
    gType === 'multipoint'
  ) {
    return false;
  }

  // 2. Check explicit flags
  if (
    (pt as any).isPolygon === true || 
    (pt as any).geometryType === 'Polygon' || 
    (pt as any).geometryType === 'MultiPolygon' ||
    (pt as any).isPoint === true
  ) {
    return false;
  }

  // 3. Path coordinates check (Points have no path or length < 2)
  const path = pt.path || (pt as any).coordinates;
  if (!path || !Array.isArray(path) || path.length < 2) {
    return false;
  }

  const layerLower = String(pt.layer || '').toLowerCase();
  const descLower = String(pt.description || '').toLowerCase();
  const nameLower = String(pt.name || pt.id || '').toLowerCase();

  // 4. Description HTML/XML tags indicating Polygon or Point
  if (
    descLower.includes('<polygon') ||
    descLower.includes('<outerboundaryis>') ||
    descLower.includes('<innerboundaryis>') ||
    descLower.includes('<linearring>') ||
    descLower.includes('<point')
  ) {
    return false;
  }

  // 5. Check if layer or name indicates a polygon/boundary/zone/area shape
  const polygonKeywords = [
    'polygon', 'polygons', 'مضلع', 'مضلعات', 'بولجون', 'بولغون', 'boundar', 'boundary', 'boundaries',
    'حدود', 'حد', 'نطاق', 'نطاقات', 'حي', 'الحي', 'منطقة', 'منطقه', 'قطاع', 'مخطط', 'عقد',
    'مبنى', 'ارض', 'أرض', 'حرم', 'خزان', 'محطة', 'محيط', 'مساحة', 'zone', 'zones',
    'area', 'areas', 'district', 'districts', 'sector', 'block', 'parcel'
  ];
  const isPolygonNameOrLayer = polygonKeywords.some(kw => layerLower.includes(kw) || nameLower.includes(kw));

  if (isPolygonNameOrLayer && gType !== 'linestring' && gType !== 'polyline' && gType !== 'multilinestring') {
    return false;
  }

  // 6. Check if path forms a closed polygon ring (first coordinate equals last coordinate)
  if (path.length >= 3) {
    const first = path[0];
    const last = path[path.length - 1];
    if (first && last) {
      const firstX = typeof first.x === 'number' ? first.x : (Array.isArray(first) ? first[0] : 0);
      const firstY = typeof first.y === 'number' ? first.y : (Array.isArray(first) ? first[1] : 0);
      const lastX = typeof last.x === 'number' ? last.x : (Array.isArray(last) ? last[0] : 0);
      const lastY = typeof last.y === 'number' ? last.y : (Array.isArray(last) ? last[1] : 0);

      if (Math.abs(firstX - lastX) < 1e-6 && Math.abs(firstY - lastY) < 1e-6) {
        if (gType !== 'linestring' && gType !== 'polyline') {
          return false;
        }
      }
    }
  }

  // 7. Explicit line types
  if (
    gType === 'linestring' || 
    gType === 'polyline' || 
    gType === 'multilinestring'
  ) {
    return true;
  }

  // 8. Open path with 2+ coordinates
  return true;
};

export const isYellowLineElement = (pt: GeoPoint): boolean => {
  if (!pt || !isLineElement(pt)) return false;

  const ptColor = String(pt.color || '').trim().toUpperCase();
  const layerName = String(pt.layer || '').toLowerCase();
  const desc = String(pt.description || '').toLowerCase();

  // 1. Text cues in color, layer, or description
  if (
    layerName.includes('yellow') || layerName.includes('أصفر') || layerName.includes('اصفر') ||
    layerName.includes('جاري العمل') || layerName.includes('جارى العمل') || layerName.includes('قيد التنفيذ') ||
    layerName.includes('قيد العمل') || layerName.includes('in_progress') || layerName.includes('in progress') ||
    desc.includes('yellow') || desc.includes('أصفر') || desc.includes('اصفر') ||
    desc.includes('جاري العمل') || desc.includes('جارى العمل') || desc.includes('قيد التنفيذ') ||
    ptColor.includes('YELLOW')
  ) {
    return true;
  }

  // 2. Check Hex Code & RGB
  let cleanHex = ptColor;
  if (cleanHex.startsWith('#')) cleanHex = cleanHex.substring(1);
  if (cleanHex.length === 8) cleanHex = cleanHex.substring(2); // strip alpha
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      // Yellow RGB characteristics: High red & green, low blue
      if (r >= 140 && g >= 120 && b <= 140 && (r + g) > (b * 2.2)) {
        return true;
      }
    }
  }

  // 3. Color distance to standard yellow reference palette
  const yellowShades = [
    '#FFEA00', '#FFFF00', '#FFD700', '#DCB13C', '#FFEB3B',
    '#FDD835', '#FBC02D', '#F59E0B', '#EAB308', '#E6C619',
    '#FFE87C', '#FFE57F', '#FFDF00', '#D4AF37', '#FFC107', '#E5C158'
  ];

  for (const yShade of yellowShades) {
    if (colorDistance(ptColor || '#DCB13C', yShade) <= 80) {
      return true;
    }
  }

  // 4. Status Category check
  const statusCat = matchStatusByColor(ptColor);
  if (statusCat && statusCat.key === 'in_progress') {
    return true;
  }

  return false;
};


const UniversalExportBar = ({
  data,
  filename,
  lang,
  onExcelExport,
  isExecuting,
  onKmzExport,
  runWithLoading
}: {
  data: GeoPoint[];
  filename: string;
  lang: Language;
  onExcelExport: () => void;
  isExecuting: boolean;
  onKmzExport: () => void;
  runWithLoading?: (msg: string, task: () => void | Promise<void>) => Promise<void>;
}) => {
  const handleWrapper = (msg: string, task: () => void | Promise<void>) => {
    if (runWithLoading) {
      runWithLoading(msg, task);
    } else {
      task();
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 w-full">
      <button 
        disabled={isExecuting}
        onClick={() => handleWrapper(
          lang === 'ar' ? 'جاري تحضير وتصدير ملف KMZ...' : 'Generating KMZ file...',
          onKmzExport
        )} 
        className="bg-[#0b2d3d] border border-accent/30 text-accent font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-accent hover:text-primary active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <DownloadCloud className="w-4 h-4" />
        {lang === 'ar' ? 'KMZ' : 'KMZ'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => handleWrapper(
          lang === 'ar' ? 'جاري تحضير وتصدير ملف Shapefile (SHP)...' : 'Creating Shapefile (SHP)...',
          () => downloadShapefile(data, filename || 'Export')
        )} 
        className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-500 hover:text-white active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FolderArchive className="w-4 h-4 text-emerald-400" />
        {lang === 'ar' ? 'شيب فايل (SHP)' : 'Shapefile (SHP)'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => handleWrapper(
          lang === 'ar' ? 'جاري تحضير وتصدير ملف DXF...' : 'Creating DXF file...',
          () => downloadDXF(data, filename || 'Export')
        )} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <PenTool className="w-4 h-4 text-orange-400" />
        {lang === 'ar' ? 'DXF' : 'DXF'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => handleWrapper(
          lang === 'ar' ? 'جاري تحضير وتصدير ملف Excel...' : 'Creating Excel file...',
          onExcelExport
        )} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileSpreadsheet className="w-4 h-4 text-green-500" />
        {lang === 'ar' ? 'إكسل' : 'Excel'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => handleWrapper(
          lang === 'ar' ? 'جاري توليد وتصدير ملف PDF...' : 'Generating PDF file...',
          () => downloadDataPDF(data, filename || 'Export', lang)
        )} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileText className="w-4 h-4 text-[#D32F2F]" />
        {lang === 'ar' ? 'PDF' : 'PDF'}
      </button>
    </div>
  );
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => loadSavedPreference('lang', 'ar'));
  const [theme, setTheme] = useState<'default' | 'nwc'>(() => loadSavedPreference('theme', 'default'));
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => loadSavedPreference('isDarkMode', true));
  const t = translations[lang];

  useEffect(() => {
    savePreference('lang', lang);
  }, [lang]);

  useEffect(() => {
    savePreference('theme', theme);
    if (theme === 'nwc') {
      document.body.classList.add('theme-nwc');
    } else {
      document.body.classList.remove('theme-nwc');
    }
  }, [theme]);

  useEffect(() => {
    savePreference('isDarkMode', isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.body.classList.remove('light-mode');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.body.classList.add('light-mode');
    }
  }, [isDarkMode]);

  const [hoveredTabTooltip, setHoveredTabTooltip] = useState<{ id: string; top: number; left: number; side: 'left' | 'right' | 'bottom' } | null>(null);
  const [activeTab, setActiveTab] = useState<'map-viewer' | 'converter' | 'splitter' | 'analyzer' | 'street-planner' | 'polygon-converter' | 'attribute-formatter' | 'comparator' | 'classifier' | 'segment-vault' | 'sbc-checker' | 'line-drawer'>('map-viewer');
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<string | null>(null);

  const [activeFile, setActiveFile] = useState<ParsedFile | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [globalPoints, setGlobalPoints] = useState<GeoPoint[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataId, setDataId] = useState<string>('');
  const [classifierRefZones, setClassifierRefZones] = useState<GeoPoint[]>([]);
  const [uploadSourceMode, setUploadSourceMode] = useState<'file' | 'link'>('file');
  const [segmentFilterQuery, setSegmentFilterQuery] = useState('');
  const [permitFilterQuery, setPermitFilterQuery] = useState('');
  const [permitStatusFilter, setPermitStatusFilter] = useState<'all' | 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining' | 'cancelled'>('all');
  const [permitSortBy, setPermitSortBy] = useState<'count-desc' | 'length-desc' | 'color-status' | 'name'>('count-desc');
  const [analyzerNetworkType, setAnalyzerNetworkType] = useState<'all' | 'water' | 'sewer'>('all');

  const [mergeThreshold, setMergeThreshold] = useState<number>(() => loadSavedPreference('mergeThreshold', 45));
  const [duplicateTolerance, setDuplicateTolerance] = useState<number>(() => loadSavedPreference('duplicateTolerance', 0.5));
  const [overlapResults, setOverlapResults] = useState<OverlapResult[] | null>(null);
  const [geocodingMode, setGeocodingMode] = useState<'accurate' | 'fast'>(() => loadSavedPreference('geocodingMode', 'accurate'));
  const [mobileView, setMobileView] = useState<'panel' | 'map'>('panel');
  const [showOverlapModal, setShowOverlapModal] = useState(false);
  const [overlapModalType, setOverlapModalType] = useState<'duplicates' | 'intersections'>('duplicates');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Auto-Alert states for Spatial Overlaps upon import
  const [autoAlertInfo, setAutoAlertInfo] = useState<{
    fileId: string;
    filename: string;
    duplicatesCount: number;
    intersectionsCount: number;
    totalCount: number;
    dups: OverlapResult[];
    intersections: OverlapResult[];
  } | null>(null);
  const [showAutoAlertModal, setShowAutoAlertModal] = useState(false);
  const lastAlertedFileRef = useRef<string>('');
  const [globalBaseMap, setGlobalBaseMap] = useState<import('./types').BaseMapType>(() => loadSavedPreference('globalBaseMap', 'satellite'));
  const [layerOpacity, setLayerOpacity] = useState(1);
  const [is3DMode, setIs3DMode] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Validation Check Popup Modal state & Map Issue Focus state
  const [focusedPoint, setFocusedPoint] = useState<GeoPoint | null>(null);
  const [selectedProfilePoints, setSelectedProfilePoints] = useState<GeoPoint[]>([]);
  const [hoveredElevationPoint, setHoveredElevationPoint] = useState<{lat: number, lng: number, z?: number, dist?: number} | null>(null);
  const [activeIssueItems, setActiveIssueItems] = useState<GeoPoint[]>([]);
  const [showIssuesOnly, setShowIssuesOnly] = useState<boolean>(false);

  // Flow Direction & Hydraulic Animation state
  const [showFlowDirection, setShowFlowDirection] = useState<boolean>(false);
  const [flowAnalysis, setFlowAnalysis] = useState<import('./services/flowDirectionService').NetworkFlowAnalysis | null>(null);

  // Multi-Polygon & Street Planner States needed for displayPoints
  const [splitMode, setSplitMode] = useState<'count' | 'spatial' | 'street'>('count');
  const [splitPolygons, setSplitPolygons] = useState<SplitPolygon[]>([]);
  const [plannedStreets, setPlannedStreets] = useState<GeoPoint[]>([]);
  const [boundaryPolygon, setBoundaryPolygon] = useState<GeoPoint | null>(null);

  const displayPoints = useMemo(() => {
    if (activeTab === 'street-planner') {
      const pts = [...globalPoints, ...plannedStreets];
      if (boundaryPolygon) pts.push(boundaryPolygon);
      return pts;
    }

    if (activeTab === 'splitter' && splitMode === 'spatial') {
      const polyPts: GeoPoint[] = splitPolygons.map(p => ({
        id: p.name,
        x: p.path[0].x,
        y: p.path[0].y,
        type: 'Polygon',
        path: p.path,
        color: p.color,
        layer: 'Split Polygons'
      }));
      return [...globalPoints, ...polyPts];
    }

    if (activeTab === 'classifier') {
      // Render polygons (zones) first, then points (assets) on top
      return [...classifierRefZones, ...globalPoints];
    }
    if (activeTab === 'polygon-converter' || (activeTab === 'splitter' && splitMode === 'spatial')) {
      return [...globalPoints, ...(boundaryPolygon ? [boundaryPolygon] : [])];
    }

    return globalPoints;
  }, [activeTab, splitMode, plannedStreets, boundaryPolygon, globalPoints, splitPolygons, classifierRefZones]);

  useEffect(() => {
    if (!showFlowDirection || !displayPoints || displayPoints.length === 0) {
      return;
    }
    let isMounted = true;
    import('./services/flowDirectionService').then(({ analyzeNetworkFlowDirections }) => {
      analyzeNetworkFlowDirections(displayPoints).then(result => {
        if (isMounted) {
          setFlowAnalysis(result);
        }
      });
    });
    return () => { isMounted = false; };
  }, [showFlowDirection, displayPoints, dataId]);

  const [checkResultModal, setCheckResultModal] = useState<CheckResultModalState | null>(null);

  // PWA Mobile App Installation state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Auto-simulate progress percentage during loading operations if progressPercent is null or small
  useEffect(() => {
    let timer: any;
    if (loading) {
      if (progressPercent === null || progressPercent === undefined || progressPercent === 0) {
        setProgressPercent(15);
      }
      timer = setInterval(() => {
        setProgressPercent(prev => {
          if (prev === null || prev === undefined) return 15;
          if (prev >= 95) return prev;
          const delta = Math.max(1, Math.floor((96 - prev) / 6));
          return Math.min(95, prev + delta);
        });
      }, 200);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

  const runWithLoading = async (
    statusMsg: string,
    task: () => void | Promise<void>
  ) => {
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(statusMsg);
    // Yield to browser event loop so React mounts and renders the high-priority modal overlay
    await new Promise(r => setTimeout(r, 120));
    try {
      await task();
      setProgressPercent(100);
      await new Promise(r => setTimeout(r, 350));
    } catch (err: any) {
      console.error("Task execution error:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
      setProgressPercent(null);
      setStatusMessage('');
    }
  };

  const verifyEssentialAttributes = async () => {
    setActiveIssueItems([]);
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? 'جاري فحص العناصر الناقصة (قطر/منطقة)...' : 'Verifying missing diameter/zone attributes...');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
    
    try {
        setProgressPercent(50);
        let totalChecked = 0;
        let missingCount = 0;
        let missingDiameterCount = 0;
        let missingZoneCount = 0;
        
        const isInvalidVal = (val: any): boolean => {
            if (val === undefined || val === null) return true;
            const str = String(val).trim().toLowerCase();
            if (
                str === '' || str === '0' || str === '0.0' || str === '0.00' ||
                str === 'null' || str === 'undefined' || str === 'none' ||
                str === 'n/a' || str === 'na' || str === 'غير متوفر' ||
                str === 'غير معروف' || str === 'لا يوجد' || str === 'بدون' ||
                str === 'unknown'
            ) return true;
            if (/^[\s_\-–—\/\\.:;]+$/.test(str)) return true;
            return false;
        };

        const isDiameterKey = (key: string): boolean => {
            const k = key.toLowerCase().trim().replace(/[\s_#-]/g, '');
            return (
                k === 'dn' ||
                k === 'd' ||
                k === 'dia' ||
                k === 'diameter' ||
                k === 'innerdiameter' ||
                k === 'outerdiameter' ||
                k === 'pipesize' ||
                k === 'size' ||
                k === 'width' ||
                k === 'قطر' ||
                k === 'القطر' ||
                k === 'قطرالخط' ||
                k === 'قطرالانبوب' ||
                k === 'قطرالشبكة' ||
                k === 'القطرالداخلي' ||
                k === 'القطرالخارجي' ||
                k === 'مقاس' ||
                k === 'سمك' ||
                k.includes('diameter') ||
                k.includes('innerdiameter') ||
                k.includes('outerdiameter') ||
                k.includes('قطر')
            );
        };

        const isZoneKey = (key: string): boolean => {
            const k = key.toLowerCase().trim().replace(/[\s_#-]/g, '');
            return (
                k === 'zone' ||
                k === 'zonenu' ||
                k === 'zonenumber' ||
                k === 'zoneid' ||
                k === 'district' ||
                k === 'districtname' ||
                k === 'منطقة' ||
                k === 'المنطقة' ||
                k === 'رقمالمنطقة' ||
                k === 'منطقه' ||
                k === 'النطاق' ||
                k === 'حي' ||
                k === 'الحي' ||
                k === 'اسمالحي' ||
                k === 'قطاع' ||
                k === 'مخطط' ||
                k === 'عقد' ||
                k === 'مجاور' ||
                k === 'مجاورة' ||
                k.includes('zone') ||
                k.includes('district') ||
                k.includes('منطقة') ||
                k.includes('منطقه') ||
                k.includes('النطاق') ||
                k.includes('حي')
            );
        };

        const processPoints = (pts: GeoPoint[]) => {
            return pts.map(pt => {
                if (!pt || pt.isDuplicateOverlay) return pt;

                if (!isLineElement(pt)) return pt;

                totalChecked++;

                const mergedAttrs: Record<string, string> = {
                    ...(pt.attributes || {})
                };
                if (pt.description) {
                    parseDescriptionToAttributes(pt.description, mergedAttrs);
                }

                let hasDiameter = false;

                for (const [key, val] of Object.entries(mergedAttrs)) {
                    if (isDiameterKey(key)) {
                        if (!isInvalidVal(val)) {
                            const numMatch = String(val).trim().match(/(\d+(\.\d+)?)/);
                            if (numMatch && parseFloat(numMatch[1]) > 0) {
                                hasDiameter = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasDiameter) {
                    const diaUnitRegex = /\b(\d+(\.\d+)?)\s*(mm|inch|مم|انش|بوصة|بوصه)\b/i;
                    const diaPrefixRegex = /(?:dn|ø|dia|diameter|innerdiameter|outerdiameter|size|pipe_size|قطر|القطر|مقاس|سمك)[ \t:=_#-]*(\d+(\.\d+)?)\b/i;
                    const diaPostfixRegex = /(\d+(\.\d+)?)\s*(?:dn|ø|dia|diameter|innerdiameter|outerdiameter|size|pipe_size|قطر|القطر|مقاس|سمك)\b/i;

                    const fullText = `${pt.layer || ''} ${pt.name || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''}`;
                    let m = fullText.match(diaUnitRegex) || fullText.match(diaPrefixRegex) || fullText.match(diaPostfixRegex);
                    if (m && parseFloat(m[1]) > 0) {
                        hasDiameter = true;
                    }
                }

                let hasZone = false;

                if (!isInvalidVal(pt.district)) {
                    hasZone = true;
                } else if (!isInvalidVal((pt as any).zone)) {
                    hasZone = true;
                }

                if (!hasZone) {
                    for (const [key, val] of Object.entries(mergedAttrs)) {
                        if (isZoneKey(key)) {
                            if (!isInvalidVal(val)) {
                                hasZone = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasZone) {
                    const zonePrefixRegex = /(?:zone|district|neighborhood|suburb|sector|area|block|منطقة|منطقه|المنطقة|حي|الحي|قطاع|مخطط|عقد|مجاور|مجاورة|النطاق)[ \t:=_#-]*([a-zA-Z0-9\u0600-\u06FF]+)/i;
                    const zonePostfixRegex = /([a-zA-Z0-9\u0600-\u06FF]+)\s*(?:zone|district|neighborhood|suburb|sector|area|block|منطقة|منطقه|المنطقة|حي|الحي|قطاع|مخطط|عقد|مجاور|مجاورة|النطاق)/i;
                    const fullText = `${pt.layer || ''} ${pt.name || ''} ${pt.description || ''} ${pt.attr1 || ''} ${pt.attr2 || ''}`;
                    let m = fullText.match(zonePrefixRegex) || fullText.match(zonePostfixRegex);
                    if (m && !isInvalidVal(m[1])) {
                        hasZone = true;
                    }
                }

                if (!hasDiameter || !hasZone) {
                    missingCount++;
                    if (!hasDiameter) missingDiameterCount++;
                    if (!hasZone) missingZoneCount++;
                    const missingParts = [];
                    if (!hasDiameter) missingParts.push(lang === 'ar' ? 'القطر' : 'Diameter');
                    if (!hasZone) missingParts.push(lang === 'ar' ? 'المنطقة' : 'Zone');
                    
                    const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
                    const origLayer = (pt as any).originalLayer || pt.layer;
                    const issuePt: GeoPoint = {
                        ...pt,
                        originalColor: origColor,
                        originalLayer: origLayer,
                        color: '#ef4444',
                        isIssue: true,
                        issueReason: lang === 'ar' ? `عنصر ينقصه (${missingParts.join('، ')})` : `Missing (${missingParts.join(', ')})`,
                        description: `${pt.description || ''}\n[MISSING: ${missingParts.join(', ')}]`.trim(),
                        layer: `${pt.layer || 'Unknown'}_MISSING_ATTRS`
                    };
                    missingItemsList.push(issuePt);
                    return issuePt;
                }
                
                const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
                const origLayer = (pt as any).originalLayer || pt.layer;
                return {
                    ...pt,
                    originalColor: origColor,
                    originalLayer: origLayer,
                    isIssue: false,
                    issueReason: undefined
                };
            });
        };

        const missingItemsList: GeoPoint[] = [];

        if (globalPoints && globalPoints.length > 0) {
            const nextGlobal = processPoints(globalPoints);
            setGlobalPoints(nextGlobal);
        }
        if (plannedStreets && plannedStreets.length > 0) {
            const nextPlanned = processPoints(plannedStreets);
            setPlannedStreets(nextPlanned);
        }

        setDataId(`essential-check-${Date.now()}`);
        setProgressPercent(100);

        const completeCount = Math.max(0, totalChecked - missingCount);

        setCheckResultModal({
          type: 'essential',
          titleAr: 'نتائج فحص العناصر الناقصة (قطر / منطقة)',
          titleEn: 'Missing Attributes Audit (Diameter / Zone)',
          icon: 'essential',
          totalChecked,
          issuesCount: missingCount,
          successCount: completeCount,
          badgeTextAr: missingCount > 0 ? `وُجدت ${missingCount} مشكلة` : 'جميع العناصر مكتملة البيانات (لا توجد مشاكل)',
          badgeTextEn: missingCount > 0 ? `${missingCount} Issues Found` : 'All Elements Complete (No Issues)',
          detailsAr: missingCount > 0
            ? `تم فحص ${totalChecked} عنصر، وتبين وجود ${missingCount} عنصر ينقصه بيانات أساسية (قطر أو منطقة). تم تمييز هذه العناصر وتحديد أماكنها بدقة مع تنبيهات نابضة على الخريطة.`
            : `تم فحص جميع العناصر الخطية (${totalChecked} عنصر)، وتبين أنها جميعاً تحتوي على بيانات القطر والمنطقة مكتملة بدون أي مشاكل.`,
          detailsEn: missingCount > 0
            ? `Audited ${totalChecked} elements. Found ${missingCount} elements missing essential attributes (diameter or zone). Highlighted with map markers.`
            : `Audited ${totalChecked} elements. All elements contain complete diameter and zone data with zero issues.`,
          issueItems: missingItemsList,
          stats: [
            { labelAr: 'إجمالي العناصر المفحوصة', labelEn: 'Total Audited Elements', value: totalChecked, colorClass: 'text-white' },
            { labelAr: 'عدد المشاكل (عناصر ناقصة)', labelEn: 'Issues Count (Missing)', value: missingCount, colorClass: missingCount > 0 ? 'text-rose-400 font-black' : 'text-emerald-400 font-black' },
            { labelAr: 'عناصر ينقصها القطر', labelEn: 'Missing Diameter', value: missingDiameterCount, colorClass: missingDiameterCount > 0 ? 'text-amber-400' : 'text-emerald-400' },
            { labelAr: 'عناصر ينقصها المنطقة', labelEn: 'Missing Zone', value: missingZoneCount, colorClass: missingZoneCount > 0 ? 'text-amber-400' : 'text-emerald-400' }
          ]
        });

        setStatusMessage(lang === 'ar' ? `تم إبراز ${missingCount} عنصراً ينقصه بيانات أساسية (قطر/منطقة) باللون الأسود.` : `Highlighted ${missingCount} segments missing essential attributes in black.`);
        setTimeout(() => setStatusMessage(''), 4000);
    } catch (e: any) {
        console.error("Error in verifyEssentialAttributes:", e);
    } finally {
        setLoading(false);
        setProgressPercent(null);
    }
  };

  const verifyPermitAndSegmentId = async () => {
    setActiveIssueItems([]);
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? 'جاري فحص محتوى (segment id)...' : 'Verifying content of segment id...');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

    try {
      setProgressPercent(50);
      let totalChecked = 0;
      let matchedCount = 0;
      const uniqueSegmentIdsSet = new Set<string>();

      const stripHtml = (html: any): string => {
        if (!html) return '';
        return String(html)
          .replace(/&nbsp;/gi, ' ')
          .replace(/&#160;/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[\s\u00A0]+/g, ' ')
          .trim();
      };

      const isValidValue = (val: any, keyName?: string): boolean => {
        if (val === undefined || val === null) return false;
        const cleanStr = stripHtml(val);
        if (!cleanStr) return false;
        if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanStr)) return false;

        const lower = String(cleanStr || '').toLowerCase();
        const emptyValues = new Set([
          '0', '0.0', '00', '000', 'null', 'undefined', 'none', '-', '--', '---', '_', '=',
          'n/a', 'na', 'no', 'false', 'unknown', 'nil', 'empty', '[empty]', '<null>', '<empty>',
          'no data', 'nodata', 'no_data', 'not available', 'not applicable',
          'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان',
          'لاشيء', 'لا شيء', 'صفر', 'معدوم', 'غير معروف'
        ]);
        if (emptyValues.has(lower)) return false;

        const labelValues = new Set([
          'segment id', 'segment_id', 'segmentid', 'segment no', 'segment_no', 'segmentno',
          'segment number', 'segment', 'seg id', 'seg_id', 'segid', 'seg no', 'seg_no', 'segno',
          'layer', 'شريحة', 'رقم الشريحة', 'كود الشريحة', 'معرف الشريحة', 'رقم شريحة', 'كود شريحة',
          'معرف شريحة', 'شريحة خريطة'
        ]);
        if (labelValues.has(lower)) return false;
        if (keyName && lower === String(stripHtml(keyName) || '').toLowerCase()) return false;
        if (/^(segment|feature|line|polyline|point|layer|element|shape|object)[\s_#-]*\d+$/i.test(cleanStr)) return false;

        return true;
      };

      const normalizeKey = (key: string): string => String(key || '').toLowerCase().replace(/[\s_#-]/g, '');

      const isSegmentKey = (key: string): boolean => {
        if (!key) return false;
        const norm = normalizeKey(key);
        if (!norm) return false;
        const segmentKeys = new Set([
          'segment', 'segmentid', 'segmentno', 'segmentnumber', 'segid', 'segno', 'seg',
          'شريحة', 'شريحه', 'رقمالشريحة', 'كودالشريحة', 'معرفالشريحة', 'رقمشريحة', 'كودشريحة', 'معرفشريحة',
          'رقمالقطع', 'كودالقطع', 'معرفالقطع', 'قطاع', 'رقمالقطاع', 'كودالقطاع', 'معرفالقطاع'
        ]);
        return (
          segmentKeys.has(norm) ||
          norm.startsWith('segment') ||
          norm.startsWith('segid') ||
          norm.includes('segmentid') ||
          norm.includes('segment_id') ||
          norm.includes('رقمالشريحة') ||
          norm.includes('كودالشريحة')
        );
      };

      const extractSegmentIdFromDescription = (description?: string): string | null => {
        if (!description) return null;
        const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
        const tableMatch = description.match(tableCellRegex);
        if (tableMatch && tableMatch[1]) {
          const val = stripHtml(tableMatch[1]);
          if (isValidValue(val, 'segment id')) return val;
        }
        const textRegex = /(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
        const textMatch = description.match(textRegex);
        if (textMatch && textMatch[1]) {
          const val = stripHtml(textMatch[1]);
          if (isValidValue(val, 'segment id')) return val;
        }
        return null;
      };

      const missingSegmentList: GeoPoint[] = [];

      const processPoints = (pts: GeoPoint[]) => {
        return pts.map(pt => {
          if (!pt || pt.isDuplicateOverlay) return pt;
          if (!isLineElement(pt)) return pt;

          totalChecked++;
          let foundVal: string | null = null;
          if (pt.attributes) {
            for (const [key, val] of Object.entries(pt.attributes)) {
              if (isSegmentKey(key) && isValidValue(val, key)) {
                foundVal = stripHtml(val);
                break;
              }
            }
          }
          if (!foundVal && pt.description) {
            foundVal = extractSegmentIdFromDescription(pt.description);
          }

          const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
          const origLayer = (pt as any).originalLayer || pt.layer;

          if (foundVal) {
            matchedCount++;
            const canon = getCanonicalSegmentKey(foundVal);
            if (canon) uniqueSegmentIdsSet.add(canon);
            return {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#9000FF',
              isIssue: false,
              issueReason: undefined
            };
          }

          // Ignore parts that do not contain a segment id
          return {
            ...pt,
            originalColor: origColor,
            originalLayer: origLayer,
            color: origColor,
            isIssue: false,
            issueReason: undefined
          };
        });
      };

      if (globalPoints.length > 0) {
        setGlobalPoints(processPoints(globalPoints));
      }
      if (plannedStreets.length > 0) {
        setPlannedStreets(processPoints(plannedStreets));
      }

      setDataId(`segment-check-${Date.now()}`);
      setProgressPercent(100);

      const missingCount = Math.max(0, totalChecked - matchedCount);

      setCheckResultModal({
        type: 'segment',
        titleAr: 'نتائج فحص عناصر (Segment ID)',
        titleEn: 'Segment ID Content Audit',
        icon: 'segment',
        totalChecked,
        issuesCount: 0,
        successCount: matchedCount,
        uniqueCount: uniqueSegmentIdsSet.size,
        badgeTextAr: `تم تلوين ${matchedCount} عنصر يحوي Segment ID`,
        badgeTextEn: `Highlighted ${matchedCount} Elements with Segment ID`,
        detailsAr: `تم فحص ${totalChecked} عنصر، وتم بنجاح إبراز ${matchedCount} عنصر يحتوي على (Segment ID) باللون البنفسجي، وتم تجاهل بقية العناصر التي لا تحتوي على Segment ID (عددها ${missingCount}).`,
        detailsEn: `Audited ${totalChecked} elements. Successfully highlighted ${matchedCount} elements containing Segment ID in vivid purple, ignoring the ${missingCount} remaining elements.`,
        issueItems: missingSegmentList,
        stats: [
          { labelAr: 'إجمالي العناصر المفحوصة', labelEn: 'Total Audited Elements', value: totalChecked, colorClass: 'text-white' },
          { labelAr: 'عناصر بـ Segment ID', labelEn: 'Valid Segment ID', value: matchedCount, colorClass: 'text-[#d8b4fe] font-black' },
          { labelAr: 'عناصر تم تجاهلها', labelEn: 'Ignored Elements', value: missingCount, colorClass: 'text-slate-400' },
          { labelAr: 'قيم فريدة غير مكررة', labelEn: 'Unique Segment IDs', value: uniqueSegmentIdsSet.size, colorClass: 'text-cyan-300 font-black' }
        ]
      });

      if (matchedCount > 0) {
        setStatusMessage(
          lang === 'ar'
            ? `تم فحص وتلوين ${matchedCount} عنصراً باللون البنفسجي لوجود محتوى في (segment id). وتم العثور على ${uniqueSegmentIdsSet.size} قيمة فريدة بدون تكرار.`
            : `Colored ${matchedCount} elements in vivid purple for having valid segment id content. Found ${uniqueSegmentIdsSet.size} unique segment id values.`
        );
      } else {
        setStatusMessage(
          lang === 'ar'
            ? 'لم يتم العثور على أي عناصر تحتوي على محتوى فعلي في (segment id).'
            : 'No elements found containing actual content in segment id.'
        );
      }
      setTimeout(() => setStatusMessage(''), 5000);
    } catch (e: any) {
      console.error("Error in verifyPermitAndSegmentId:", e);
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const verifyPermitNo = async () => {
    setActiveIssueItems([]);
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? 'جاري فحص محتوى أرقام التراخيص (Permit No)...' : 'Verifying content of Permit No...');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

    try {
      setProgressPercent(50);
      let totalChecked = 0;
      let matchedCount = 0;
      const uniquePermitSet = new Set<string>();

      const stripHtml = (html: any): string => {
        if (!html) return '';
        return String(html)
          .replace(/&nbsp;/gi, ' ')
          .replace(/&#160;/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[\s\u00A0]+/g, ' ')
          .trim();
      };

      const isValidValue = (val: any, keyName?: string): boolean => {
        if (val === undefined || val === null) return false;
        const cleanStr = stripHtml(val);
        if (!cleanStr) return false;
        if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanStr)) return false;
        const lower = String(cleanStr || '').toLowerCase();
        const emptyValues = new Set([
          '0', '0.0', '00', '000', 'null', 'undefined', 'none', '-', '--', '---', '_', '=',
          'n/a', 'na', 'no', 'false', 'unknown', 'nil', 'empty', '[empty]', '<null>', '<empty>',
          'no data', 'nodata', 'no_data', 'not available', 'not applicable',
          'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان',
          'لاشيء', 'لا شيء', 'صفر', 'معدوم', 'غير معروف'
        ]);
        if (emptyValues.has(lower)) return false;

        const labelValues = new Set([
          'permit no', 'permit_no', 'permitno', 'permit', 'permit id', 'permit_id', 'permitid',
          'رقم الترخيص', 'رقم ترخيص', 'الترخيص', 'رقم الرخصة', 'رقم رخصة', 'الرخصة', 'ترخيص',
          'رقم التصريح', 'رقم تصريح', 'التصريح', 'تصريح'
        ]);
        if (labelValues.has(lower)) return false;
        if (keyName && lower === String(stripHtml(keyName) || '').toLowerCase()) return false;
        if (/^(feature|line|polyline|point|layer|element|shape|object)[\s_#-]*\d+$/i.test(cleanStr)) return false;
        return true;
      };

      const normalizeKey = (key: string): string => String(key || '').toLowerCase().replace(/[\s_#-]/g, '');

      const isPermitKey = (key: string): boolean => {
        if (!key) return false;
        const norm = normalizeKey(key);
        if (!norm) return false;
        const permitKeys = new Set([
          'permitno', 'permitid', 'permit_no', 'permit_id', 'permit', 'permitnumber', 'permitnum', 'permitcode', 'permitref',
          'licenseno', 'licenceno', 'license', 'licence', 'licenseid', 'licenceid',
          'رقمالترخيص', 'رقمترخيص', 'الترخيص', 'رقمالرخصة', 'رقمرخصة', 'كودالترخيص', 'معرفالترخيص',
          'رقمالتصريح', 'رقمتصريح', 'التصريح', 'تصريح', 'ترخيص', 'رخصة'
        ]);
        if (permitKeys.has(norm)) return true;
        return (
          norm.includes('permit') ||
          norm.includes('license') ||
          norm.includes('licence') ||
          norm.includes('ترخيص') ||
          norm.includes('رخصة') ||
          norm.includes('تصريح')
        );
      };

      const extractPermitNoFromDescription = (description?: string): string | null => {
        if (!description) return null;
        const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
        const tableMatch = description.match(tableCellRegex);
        if (tableMatch && tableMatch[1]) {
          const val = stripHtml(tableMatch[1]);
          if (isValidValue(val, 'permit no')) return val;
        }
        const textRegex = /(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
        const textMatch = description.match(textRegex);
        if (textMatch && textMatch[1]) {
          const val = stripHtml(textMatch[1]);
          if (isValidValue(val, 'permit no')) return val;
        }
        return null;
      };

      const missingPermitList: GeoPoint[] = [];

      const processPoints = (pts: GeoPoint[]) => {
        return pts.map(pt => {
          if (!pt || pt.isDuplicateOverlay) return pt;
          if (!isLineElement(pt)) return pt;

          totalChecked++;
          let foundVal: string | null = null;
          if (pt.attributes) {
            for (const [key, val] of Object.entries(pt.attributes)) {
              if (isPermitKey(key) && isValidValue(val, key)) {
                foundVal = stripHtml(val);
                break;
              }
            }
          }
          if (!foundVal && pt.description) {
            foundVal = extractPermitNoFromDescription(pt.description);
          }

          const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
          const origLayer = (pt as any).originalLayer || pt.layer;

          if (foundVal) {
            matchedCount++;
            uniquePermitSet.add(foundVal.trim());
            return {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#FF6D00',
              isIssue: false,
              issueReason: undefined
            };
          }

          // Ignore parts that do not contain a Permit No
          missingPermitList.push({
            ...pt,
            issueReason: lang === 'ar' ? 'عنصر لا يحتوي على رقم ترخيص (Permit No)' : 'Missing Permit No'
          });
          return {
            ...pt,
            originalColor: origColor,
            originalLayer: origLayer,
            color: origColor,
            isIssue: false,
            issueReason: undefined
          };
        });
      };

      if (globalPoints.length > 0) {
        setGlobalPoints(processPoints(globalPoints));
      }
      if (plannedStreets.length > 0) {
        setPlannedStreets(processPoints(plannedStreets));
      }

      setDataId(`permit-check-${Date.now()}`);
      setProgressPercent(100);

      const missingCount = Math.max(0, totalChecked - matchedCount);

      setCheckResultModal({
        type: 'permit',
        titleAr: 'نتائج فحص أرقام التراخيص (Permit No)',
        titleEn: 'Permit No Content Audit',
        icon: 'permit',
        totalChecked,
        issuesCount: 0,
        successCount: matchedCount,
        uniqueCount: uniquePermitSet.size,
        badgeTextAr: `تم تلوين ${matchedCount} عنصر يحوي رقم ترخيص`,
        badgeTextEn: `Highlighted ${matchedCount} Elements with Permit No`,
        detailsAr: `تم فحص ${totalChecked} عنصر، وتم بنجاح إبراز ${matchedCount} عنصر يحتوي على رقم ترخيص (Permit No) باللون البرتقالي البرّاق، مع وجود ${uniquePermitSet.size} رقم ترخيص فريد غير مكرر، وتم تجاهل بقية العناصر التي لا تحتوي على ترخيص (عددها ${missingCount}).`,
        detailsEn: `Audited ${totalChecked} elements. Successfully highlighted ${matchedCount} elements containing Permit No in neon orange (${uniquePermitSet.size} unique values), ignoring the ${missingCount} remaining elements.`,
        issueItems: missingPermitList,
        stats: [
          { labelAr: 'إجمالي العناصر المفحوصة', labelEn: 'Total Audited Elements', value: totalChecked, colorClass: 'text-white' },
          { labelAr: 'عناصر برقم ترخيص', labelEn: 'Valid Permit No', value: matchedCount, colorClass: 'text-[#ffc499] font-black' },
          { labelAr: 'عناصر تم تجاهلها', labelEn: 'Ignored Elements', value: missingCount, colorClass: 'text-slate-400' },
          { labelAr: 'تراخيص فريدة (بدون تكرار)', labelEn: 'Unique Permit Numbers', value: uniquePermitSet.size, colorClass: 'text-amber-300 font-black' }
        ]
      });

      if (matchedCount > 0) {
        setStatusMessage(
          lang === 'ar'
            ? `تم فحص وتلوين ${matchedCount} عنصراً باللون البرتقالي لوجود رقم ترخيص (Permit No). وتم العثور على ${uniquePermitSet.size} رقم ترخيص فريد.`
            : `Colored ${matchedCount} elements in neon orange for having valid Permit No. Found ${uniquePermitSet.size} unique permit numbers.`
        );
      } else {
        setStatusMessage(
          lang === 'ar'
            ? 'لم يتم العثور على أي عناصر تحتوي على محتوى فعلي في (Permit No).'
            : 'No elements found containing actual content in Permit No.'
        );
      }
      setTimeout(() => setStatusMessage(''), 5000);
    } catch (e: any) {
      console.error("Error in verifyPermitNo:", e);
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const verifyYellowLinesMissingPermitAndSegmentId = async () => {
    setActiveIssueItems([]);
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري فحص الخطوط الصفراء فقط بدون Permit No أو segment id...'
        : 'Auditing yellow lines only (missing Permit No / Segment ID)...'
    );
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

    try {
      setProgressPercent(45);
      let totalLinesChecked = 0;
      let totalYellowLines = 0;
      let missingBothCount = 0;
      let missingPermitOnlyCount = 0;
      let missingSegmentOnlyCount = 0;
      let fullyCompliantCount = 0;
      const flaggedIssuesList: GeoPoint[] = [];

      const stripHtmlStr = (html: any): string => {
        if (!html) return '';
        return String(html)
          .replace(/&nbsp;/gi, ' ')
          .replace(/&#160;/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[\s\u00A0]+/g, ' ')
          .trim();
      };

      const isValidAttrValue = (val: any, keyName?: string): boolean => {
        if (val === undefined || val === null) return false;
        const cleanStr = stripHtmlStr(val);
        if (!cleanStr) return false;
        if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanStr)) return false;
        const lower = String(cleanStr || '').toLowerCase();
        const emptyValues = new Set([
          '0', '0.0', '00', '000', 'null', 'undefined', 'none', '-', '--', '---', '_', '=',
          'n/a', 'na', 'no', 'false', 'unknown', 'nil', 'empty', '[empty]', '<null>', '<empty>',
          'no data', 'nodata', 'no_data', 'not available', 'not applicable',
          'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان',
          'لاشيء', 'لا شيء', 'صفر', 'معدوم', 'غير معروف'
        ]);
        if (emptyValues.has(lower)) return false;

        const labelValues = new Set([
          'permit no', 'permit_no', 'permitno', 'permit', 'permit id', 'permit_id', 'permitid',
          'segment id', 'segment_id', 'segmentid', 'segment no', 'segment_no', 'segmentno',
          'segment number', 'segment', 'seg id', 'seg_id', 'segid', 'seg no', 'seg_no', 'segno',
          'رقم الترخيص', 'رقم ترخيص', 'الترخيص', 'رقم الرخصة', 'رقم رخصة', 'الرخصة', 'ترخيص',
          'رقم التصريح', 'رقم تصريح', 'التصريح', 'تصريح', 'شريحة', 'رقم الشريحة', 'كود الشريحة',
          'معرف الشريحة', 'رقم شريحة', 'كود شريحة', 'معرف شريحة'
        ]);
        if (labelValues.has(lower)) return false;
        if (keyName && lower === String(stripHtmlStr(keyName) || '').toLowerCase()) return false;
        if (/^(segment|feature|line|polyline|point|layer|element|shape|object)[\s_#-]*\d+$/i.test(cleanStr)) return false;
        return true;
      };

      const normalizeKeyStr = (key: string): string => String(key || '').toLowerCase().replace(/[\s_#-]/g, '');

      const isPermitAttributeKey = (key: string): boolean => {
        if (!key) return false;
        const norm = normalizeKeyStr(key);
        if (!norm) return false;
        const permitKeys = new Set([
          'permitno', 'permitid', 'permit_no', 'permit_id', 'permit', 'permitnumber', 'permitnum', 'permitcode', 'permitref',
          'licenseno', 'licenceno', 'license', 'licence', 'licenseid', 'licenceid',
          'رقمالترخيص', 'رقمترخيص', 'الترخيص', 'رقمالرخصة', 'رقمرخصة', 'كودالترخيص', 'معرفالترخيص',
          'رقمالتصريح', 'رقمتصريح', 'التصريح', 'تصريح', 'ترخيص', 'رخصة'
        ]);
        if (permitKeys.has(norm)) return true;
        return (
          norm.includes('permit') ||
          norm.includes('license') ||
          norm.includes('licence') ||
          norm.includes('ترخيص') ||
          norm.includes('رخصة') ||
          norm.includes('تصريح')
        );
      };

      const isSegmentAttributeKey = (key: string): boolean => {
        if (!key) return false;
        const norm = normalizeKeyStr(key);
        if (!norm) return false;
        const segmentKeys = new Set([
          'segment', 'segmentid', 'segmentno', 'segmentnumber', 'segid', 'segno', 'seg',
          'شريحة', 'شريحه', 'رقمالشريحة', 'كودالشريحة', 'معرفالشريحة', 'رقمشريحة', 'كودشريحة', 'معرفشريحة',
          'رقمالقطع', 'كودالقطع', 'معرفالقطع', 'قطاع', 'رقمالقطاع', 'كودالقطاع', 'معرفالقطاع'
        ]);
        return (
          segmentKeys.has(norm) ||
          norm.startsWith('segment') ||
          norm.startsWith('segid') ||
          norm.includes('segmentid') ||
          norm.includes('segment_id') ||
          norm.includes('رقمالشريحة') ||
          norm.includes('كودالشريحة')
        );
      };

      const extractPermitVal = (pt: GeoPoint): string | null => {
        if (pt.attributes) {
          for (const [key, val] of Object.entries(pt.attributes)) {
            if (isPermitAttributeKey(key) && isValidAttrValue(val, key)) {
              return stripHtmlStr(val);
            }
          }
        }
        if (pt.attr1 && isPermitAttributeKey('attr1') && isValidAttrValue(pt.attr1)) return stripHtmlStr(pt.attr1);
        if (pt.attr2 && isPermitAttributeKey('attr2') && isValidAttrValue(pt.attr2)) return stripHtmlStr(pt.attr2);
        if (pt.description) {
          const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
          const match = pt.description.match(tableCellRegex);
          if (match && match[1] && isValidAttrValue(stripHtmlStr(match[1]), 'permit no')) {
            return stripHtmlStr(match[1]);
          }
          const textRegex = /(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
          const match2 = pt.description.match(textRegex);
          if (match2 && match2[1] && isValidAttrValue(stripHtmlStr(match2[1]), 'permit no')) {
            return stripHtmlStr(match2[1]);
          }
        }
        return null;
      };

      const extractSegmentVal = (pt: GeoPoint): string | null => {
        if (pt.attributes) {
          for (const [key, val] of Object.entries(pt.attributes)) {
            if (isSegmentAttributeKey(key) && isValidAttrValue(val, key)) {
              return stripHtmlStr(val);
            }
          }
        }
        if (pt.attr1 && isSegmentAttributeKey('attr1') && isValidAttrValue(pt.attr1)) return stripHtmlStr(pt.attr1);
        if (pt.attr2 && isSegmentAttributeKey('attr2') && isValidAttrValue(pt.attr2)) return stripHtmlStr(pt.attr2);
        if (pt.description) {
          const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
          const match = pt.description.match(tableCellRegex);
          if (match && match[1] && isValidAttrValue(stripHtmlStr(match[1]), 'segment id')) {
            return stripHtmlStr(match[1]);
          }
          const textRegex = /(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
          const match2 = pt.description.match(textRegex);
          if (match2 && match2[1] && isValidAttrValue(stripHtmlStr(match2[1]), 'segment id')) {
            return stripHtmlStr(match2[1]);
          }
        }
        return null;
      };

      const processPoints = (pts: GeoPoint[]) => {
        return pts.map(pt => {
          if (!pt || pt.isDuplicateOverlay) return pt;
          if (!isLineElement(pt)) return pt;

          totalLinesChecked++;
          const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
          const origLayer = (pt as any).originalLayer || pt.layer;

          // Check if it's a yellow line
          const isYellow = isYellowLineElement(pt);
          if (!isYellow) {
            return {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              isIssue: false,
              issueReason: undefined
            };
          }

          totalYellowLines++;
          const permitVal = extractPermitVal(pt);
          const segmentVal = extractSegmentVal(pt);

          const hasPermit = Boolean(permitVal);
          const hasSegment = Boolean(segmentVal);

          if (!hasPermit && !hasSegment) {
            missingBothCount++;
            const issueReason = lang === 'ar'
              ? '⚠️ خط أصفر (جاري العمل): لا يوجد محتوى بيان لـ (Permit No) ولا لـ (segment id)'
              : '⚠️ Yellow Line (WIP): Missing Permit No and Missing Segment ID';
            const flaggedPt: GeoPoint = {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#FF0055',
              isIssue: true,
              issueReason
            };
            flaggedIssuesList.push(flaggedPt);
            return flaggedPt;
          } else if (!hasPermit) {
            missingPermitOnlyCount++;
            const issueReason = lang === 'ar'
              ? `⚠️ خط أصفر (جاري العمل): لا يوجد محتوى بيان لـ (Permit No) [معرف الشريحة: ${segmentVal}]`
              : `⚠️ Yellow Line (WIP): Missing Permit No [Segment ID: ${segmentVal}]`;
            const flaggedPt: GeoPoint = {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#FF6D00',
              isIssue: true,
              issueReason
            };
            flaggedIssuesList.push(flaggedPt);
            return flaggedPt;
          } else if (!hasSegment) {
            missingSegmentOnlyCount++;
            const issueReason = lang === 'ar'
              ? `⚠️ خط أصفر (جاري العمل): لا يوجد محتوى بيان لـ (segment id) [الترخيص: ${permitVal}]`
              : `⚠️ Yellow Line (WIP): Missing Segment ID [Permit: ${permitVal}]`;
            const flaggedPt: GeoPoint = {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#9000FF',
              isIssue: true,
              issueReason
            };
            flaggedIssuesList.push(flaggedPt);
            return flaggedPt;
          } else {
            fullyCompliantCount++;
            return {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: origColor,
              isIssue: false,
              issueReason: undefined
            };
          }
        });
      };

      if (globalPoints.length > 0) {
        setGlobalPoints(processPoints(globalPoints));
      }
      if (plannedStreets.length > 0) {
        setPlannedStreets(processPoints(plannedStreets));
      }

      setDataId(`yellow-missing-check-${Date.now()}`);
      setProgressPercent(100);

      const totalIssues = missingBothCount + missingPermitOnlyCount + missingSegmentOnlyCount;

      setCheckResultModal({
        type: 'essential',
        titleAr: 'نتائج فحص الخطوط الصفراء بدون Permit No و segment id',
        titleEn: 'Yellow Lines Only Audit: Missing Permit No & Segment ID',
        icon: 'essential',
        totalChecked: totalYellowLines,
        issuesCount: totalIssues,
        successCount: fullyCompliantCount,
        badgeTextAr: totalIssues > 0
          ? `⚠️ وُجدت ${totalIssues} خطوط صفراء بدون بيانات مطلوبة`
          : (totalYellowLines > 0 ? '✅ جميع الخطوط الصفراء مكتملة البيانات' : 'لا توجد خطوط صفراء في الخريطة'),
        badgeTextEn: totalIssues > 0
          ? `⚠️ Found ${totalIssues} Yellow Lines Missing Attributes`
          : (totalYellowLines > 0 ? '✅ All Yellow Lines Fully Complete' : 'No Yellow Lines Found'),
        detailsAr: totalYellowLines > 0
          ? (totalIssues > 0
              ? `تم فحص (${totalYellowLines} خطاً أصفر) في المشروع، وتبين وجود (${totalIssues} خط) باللون الأصفر ينقصها محتوى بيان رقم الترخيص (Permit No) أو معرف الشريحة (segment id)، منها (${missingBothCount} خط) ينقصها الاثنان معاً. تم تمييزها وتثبيت تنبيهات على الخريطة.`
              : `تم فحص جميع الخطوط الصفراء (${totalYellowLines} خط)، وتبين أنها جميعاً تحتوي على بيانات أرقام التراخيص (Permit No) ومعرفات الشرائح (segment id) مكتملة ومطابقة.`)
          : `تم فحص العناصر الخطية (${totalLinesChecked} خط)، ولم يتم العثور على أي خطوط باللون الأصفر (جاري العمل).`,
        detailsEn: totalYellowLines > 0
          ? (totalIssues > 0
              ? `Audited ${totalYellowLines} yellow lines. Found ${totalIssues} yellow lines lacking Permit No or segment id (${missingBothCount} missing both). Highlighted with alert markers on the map.`
              : `Audited ${totalYellowLines} yellow lines. All lines have complete Permit No and segment id attributes with zero issues.`)
          : `Audited ${totalLinesChecked} lines. No yellow (WIP) lines found in this dataset.`,
        issueItems: flaggedIssuesList,
        stats: [
          { labelAr: 'إجمالي الخطوط الصفراء المفحوصة', labelEn: 'Total Yellow Lines Audited', value: totalYellowLines, colorClass: 'text-yellow-300 font-black' },
          { labelAr: 'خطوط صفراء بها تنبيه ونواقص', labelEn: 'Yellow Lines with Alerts', value: totalIssues, colorClass: totalIssues > 0 ? 'text-rose-400 font-black' : 'text-emerald-400 font-black' },
          { labelAr: 'ينقصها كلاهما (ترخيص + شريحة)', labelEn: 'Missing Both (Permit & Segment)', value: missingBothCount, colorClass: missingBothCount > 0 ? 'text-rose-500 font-black' : 'text-emerald-400' },
          { labelAr: 'ينقصها رقم الترخيص فقط', labelEn: 'Missing Permit No Only', value: missingPermitOnlyCount, colorClass: missingPermitOnlyCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400' },
          { labelAr: 'ينقصها معرف الشريحة فقط', labelEn: 'Missing Segment ID Only', value: missingSegmentOnlyCount, colorClass: missingSegmentOnlyCount > 0 ? 'text-purple-400 font-bold' : 'text-slate-400' },
          { labelAr: 'خطوط صفراء مكتملة وسليمة', labelEn: 'Fully Compliant Yellow Lines', value: fullyCompliantCount, colorClass: 'text-emerald-300 font-black' }
        ]
      });

      if (totalIssues > 0) {
        setStatusMessage(
          lang === 'ar'
            ? `⚠️ تم رصد وتمييز ${totalIssues} خطاً أصفر ينقصها Permit No أو segment id بتنبيهات على الخريطة.`
            : `⚠️ Highlighted ${totalIssues} yellow lines missing Permit No or segment id with map alerts.`
        );
      } else if (totalYellowLines > 0) {
        setStatusMessage(
          lang === 'ar'
            ? '✅ جميع الخطوط الصفراء تحتوي على أرقام تراخيص ومعرفات شرائح مكتملة.'
            : '✅ All yellow lines have complete Permit No and segment id data.'
        );
      } else {
        setStatusMessage(
          lang === 'ar'
            ? 'لم يتم العثور على خطوط باللون الأصفر في المشروع الحالي.'
            : 'No yellow lines found in the current project.'
        );
      }
      setTimeout(() => setStatusMessage(''), 5000);
    } catch (e: any) {
      console.error("Error in verifyYellowLinesMissingPermitAndSegmentId:", e);
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const verifySaudiBuildingCodeSbc = async () => {
    const pts = getPointsToCheck();

    if (!pts || pts.length === 0) {
      setCheckResultModal({
        type: 'sbc',
        titleAr: 'فحص مطابقة كود البناء السعودي (SBC)',
        titleEn: 'Saudi Building Code (SBC) Compliance Audit',
        icon: 'sbc',
        totalChecked: 0,
        issuesCount: 0,
        successCount: 0,
        badgeTextAr: 'لا توجد بيانات خريطة',
        badgeTextEn: 'No Map Data',
        detailsAr: 'لا توجد عناصر مكانية أو شبكات خريطة محملة حالياً لفحص مطابقة كود البناء السعودي. يرجى استيراد ملف (KMZ / DXF / GeoJSON / Excel) أولاً.',
        detailsEn: 'No spatial elements loaded for SBC audit. Please import a map file first.',
        stats: [
          { labelAr: 'إجمالي العناصر المفحوصة', labelEn: 'Total Audited Elements', value: 0, colorClass: 'text-white' }
        ]
      });
      return;
    }

    setLoading(true);
    setProgressPercent(20);
    setStatusMessage(lang === 'ar' ? 'جاري تطبيق قواعد كود البناء السعودي (SBC)...' : 'Auditing against Saudi Building Code (SBC)...');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

    try {
      setProgressPercent(60);
      const issues = performSbcAuditEngine(pts);
      const errorsCount = issues.filter(i => i.severity === 'error').length;
      const warningsCount = issues.filter(i => i.severity === 'warning').length;
      const totalIssues = errorsCount + warningsCount;
      const compliantCount = Math.max(0, pts.length - totalIssues);

      const sbcIssueMap = new Map<string, string>();
      issues.forEach(iss => {
        const targetId = iss.elementId || iss.element1Id;
        if (targetId) {
          sbcIssueMap.set(String(targetId), lang === 'ar' ? (iss.messageAr || iss.titleAr) : (iss.messageEn || iss.titleEn));
        }
      });

      const sbcIssueItems: GeoPoint[] = [];
      pts.forEach(p => {
        if (sbcIssueMap.has(String(p.id))) {
          sbcIssueItems.push({
            ...p,
            isIssue: true,
            color: '#ef4444',
            issueReason: sbcIssueMap.get(String(p.id)) || (lang === 'ar' ? 'مخالفة اشتراطات كود البناء السعودي' : 'SBC Violation')
          });
        }
      });

      if (sbcIssueItems.length > 0) {
        setDataId(`sbc-check-${Date.now()}`);
      }

      setProgressPercent(100);

      setCheckResultModal({
        type: 'sbc',
        titleAr: 'نتائج فحص مطابقة كود البناء السعودي (SBC)',
        titleEn: 'Saudi Building Code (SBC) Audit Results',
        icon: 'sbc',
        totalChecked: pts.length,
        issuesCount: totalIssues,
        successCount: compliantCount,
        badgeTextAr: totalIssues > 0 ? `وُجدت ${totalIssues} مخالفة / ملاحظة كود` : 'ممتاز! لا توجد مشاكل - مطبق للكود السعودي',
        badgeTextEn: totalIssues > 0 ? `${totalIssues} SBC Issues Found` : 'No Issues - Fully SBC Compliant',
        detailsAr: totalIssues > 0
          ? `تم إجراء تدقيق كود البناء السعودي (SBC) على ${pts.length} عنصر شبكة. كشف التدقيق عن ${totalIssues} ملاحظة (تتضمن ${errorsCount} مخالفة صريحة في الأعماق أو مسافات الفصل الأفقية، و ${warningsCount} تحذير أقطار). تم إبراز ومواقع كافة المشاكل على الخريطة.`
          : `تم فحص جميع عناصر الخريطة (${pts.length} عنصر) وفقاً لاشتراطات كود البناء السعودي (SBC)، وتبين أنها مطابقة كلياً بجميع الأعماق والأقطار والمجاورات ولا توجد أي مخالفات.`,
        detailsEn: totalIssues > 0
          ? `Audited ${pts.length} network elements against SBC specs. Discovered ${totalIssues} issues (${errorsCount} critical errors in depth/separation, ${warningsCount} diameter warnings). Highlighted on map.`
          : `Audited ${pts.length} elements against SBC standard specifications. Zero violations found; networks fully comply.`,
        issueItems: sbcIssueItems,
        stats: [
          { labelAr: 'إجمالي العناصر المفحوصة', labelEn: 'Total Elements Audited', value: pts.length, colorClass: 'text-white' },
          { labelAr: 'إجمالي المشاكل والملاحظات', labelEn: 'Total SBC Issues', value: totalIssues, colorClass: totalIssues > 0 ? 'text-rose-400 font-black' : 'text-emerald-400 font-black' },
          { labelAr: 'مخالفات صريحة (Errors)', labelEn: 'Critical Errors', value: errorsCount, colorClass: errorsCount > 0 ? 'text-red-400 font-black' : 'text-emerald-400' },
          { labelAr: 'تحذيرات (Warnings)', labelEn: 'Warnings', value: warningsCount, colorClass: warningsCount > 0 ? 'text-amber-400 font-black' : 'text-emerald-400' }
        ]
      });
    } catch (e: any) {
      console.error("Error in verifySaudiBuildingCodeSbc:", e);
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const verifyApprovedColors = async () => {
    setActiveIssueItems([]);
    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? 'جاري فحص الألوان المخالفة للألوان المعتمدة...' : 'Auditing non-compliant standard colors...');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));

    try {
      setProgressPercent(50);
      let totalChecked = 0;
      let nonCompliantCount = 0;
      let compliantCount = 0;
      const nonCompliantList: GeoPoint[] = [];

      const processPoints = (pts: GeoPoint[]) => {
        return pts.map(pt => {
          if (!pt || pt.isDuplicateOverlay) return pt;
          if (!isLineElement(pt)) return pt;

          totalChecked++;
          const ptColor = pt.color || '#DCB13C';

          let minDistance = Infinity;
          let nearestCat = STATUS_CATEGORIES[0];

          for (const cat of STATUS_CATEGORIES) {
            const dist = colorDistance(ptColor, cat.color);
            if (dist < minDistance) {
              minDistance = dist;
              nearestCat = cat;
            }
          }

          const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
          const origLayer = (pt as any).originalLayer || pt.layer;

          if (minDistance > 60) {
            nonCompliantCount++;
            const issuePt: GeoPoint = {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer,
              color: '#ef4444',
              isIssue: true,
              issueReason: lang === 'ar'
                ? `لون مخالف للمواصفات (${ptColor}) - الأقرب: ${nearestCat.nameAr}`
                : `Non-compliant color (${ptColor}) - Nearest: ${nearestCat.nameEn}`
            };
            nonCompliantList.push(issuePt);
            return issuePt;
          } else {
            compliantCount++;
            return {
              ...pt,
              originalColor: origColor,
              originalLayer: origLayer
            };
          }
        });
      };

      if (globalPoints.length > 0) {
        setGlobalPoints(processPoints(globalPoints));
      }
      if (plannedStreets.length > 0) {
        setPlannedStreets(processPoints(plannedStreets));
      }

      setDataId(`color-check-${Date.now()}`);
      setProgressPercent(100);

      setCheckResultModal({
        type: 'essential',
        titleAr: 'نتائج فحص الألوان المخالفة للألوان المعتمدة',
        titleEn: 'Non-Compliant Colors Audit',
        icon: 'essential',
        totalChecked,
        issuesCount: nonCompliantCount,
        successCount: compliantCount,
        badgeTextAr: nonCompliantCount > 0 ? `وُجدت ${nonCompliantCount} مشكلة (ألوان مخالفة)` : 'جميع العناصر ذات ألوان معتمدة بالكامل',
        badgeTextEn: nonCompliantCount > 0 ? `${nonCompliantCount} Non-compliant colors found` : 'All elements match approved colors',
        detailsAr: nonCompliantCount > 0
          ? `تم فحص ${totalChecked} عنصر خطي، وتبين وجود ${nonCompliantCount} عنصر بألوان غير معتمدة (مخالفة للمواصفات الخمس المعتمدة: منفذ مياه، منفذ صرف، جاري العمل، متبقي، ملغى). تم إبرازها وتحديد مواقعها على الخريطة.`
          : `تم فحص جميع العناصر الخطية (${totalChecked} عنصر)، وجميع ألوانها مطابقة للألوان المعتمدة بمشروع المياه والصرف الصحي.`,
        detailsEn: nonCompliantCount > 0
          ? `Audited ${totalChecked} line elements. Found ${nonCompliantCount} elements with non-compliant colors outside the standard approved categories. Highlighted on map.`
          : `Audited ${totalChecked} line elements. All elements 100% match approved project colors.`,
        issueItems: nonCompliantList,
        stats: [
          { labelAr: 'إجمالي العناصر الخطية المفحوصة', labelEn: 'Total Audited Line Elements', value: totalChecked, colorClass: 'text-white' },
          { labelAr: 'عناصر بألوان معتمدة', labelEn: 'Approved Compliant Colors', value: compliantCount, colorClass: 'text-emerald-400 font-black' },
          { labelAr: 'عناصر بألوان مخالفة', labelEn: 'Non-compliant Colors', value: nonCompliantCount, colorClass: nonCompliantCount > 0 ? 'text-rose-400 font-black' : 'text-emerald-400 font-black' }
        ]
      });

      if (nonCompliantCount > 0) {
        setStatusMessage(
          lang === 'ar'
            ? `تم فحص وإبراز ${nonCompliantCount} عنصراً بألوان مخالفة للألوان المعتمدة باللون الأحمر على الخريطة.`
            : `Highlighted ${nonCompliantCount} line elements with non-compliant colors in red on map.`
        );
      } else {
        setStatusMessage(
          lang === 'ar'
            ? 'جميع الألوان في الخريطة مطابقة للألوان المعتمدة كلياً.'
            : 'All colors on the map are fully compliant with approved standards.'
        );
      }
      setTimeout(() => setStatusMessage(''), 5000);
    } catch (e: any) {
      console.error("Error in verifyApprovedColors:", e);
    } finally {
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const clearAuditResults = () => {
    let clearedCount = 0;

    const resetPoints = (pts: GeoPoint[]) => {
      return pts.map(pt => {
        if (!pt) return pt;
        let originalColor = (pt as any).originalColor;
        if (!originalColor || ['#000000', '#ef4444', '#9000FF', '#FF6D00'].includes(String(originalColor).toUpperCase())) {
          originalColor = pt.color && !['#000000', '#ef4444', '#9000FF', '#FF6D00'].includes(String(pt.color).toUpperCase()) ? pt.color : '#DCB13C';
        }
        const originalLayer = (pt as any).originalLayer || (pt.layer ? pt.layer.replace('_MISSING_ATTRS', '') : pt.layer);

        if (pt.isIssue || pt.issueReason || (pt.color && pt.color !== originalColor) || (pt.layer && pt.layer.includes('_MISSING_ATTRS'))) {
          clearedCount++;
        }

        const cleanPt: GeoPoint = {
          ...pt,
          originalColor,
          originalLayer,
          isIssue: false,
          issueReason: undefined,
          color: originalColor,
          layer: originalLayer
        };

        if (cleanPt.description && cleanPt.description.includes('[MISSING:')) {
          cleanPt.description = cleanPt.description.replace(/\n?\[MISSING:[^\]]+\]/g, '').trim();
        }

        return cleanPt;
      });
    };

    if (globalPoints && globalPoints.length > 0) {
      setGlobalPoints(resetPoints(globalPoints));
    }
    if (plannedStreets && plannedStreets.length > 0) {
      setPlannedStreets(resetPoints(plannedStreets));
    }

    setCheckResultModal(null);
    setShowIssuesOnly(false);
    setActiveIssueItems([]);
    setFocusedPoint(null);
    setOverlapResults(null);
    setAutoAlertInfo(null);
    setShowOverlapModal(false);
    setShowAutoAlertModal(false);
    lastAlertedFileRef.current = '';
    setDataId(`clear-audit-${Date.now()}`);

    setStatusMessage(
      lang === 'ar'
        ? 'تمت إزالة جميع نتائج الفحص والتظليل والتنبيهات التلقائية وإعادة الخريطة إلى حالتها الأصلية بنجاح 🧹'
        : 'All audit highlights and automatic alerts cleared successfully, restoring map to original state 🧹'
    );
    setTimeout(() => setStatusMessage(''), 4000);
  };

  const getPointsToCheck = (): GeoPoint[] => {
    const safeGlobal = Array.isArray(globalPoints) ? globalPoints : [];
    const safePlanned = Array.isArray(plannedStreets) ? plannedStreets : [];

    let basePoints: GeoPoint[] = [];

    if (activeTab === 'street-planner' && safePlanned.length > 0) {
      const combined = [...safeGlobal];
      for (const p of safePlanned) {
        if (p && !combined.some(item => item && String(item.id) === String(p.id))) {
          combined.push(p);
        }
      }
      basePoints = combined;
    } else {
      basePoints = safeGlobal.length > 0 ? safeGlobal : safePlanned;
    }

    if (activeTab === 'analyzer' && analyzerNetworkType !== 'all') {
      const waterPts = basePoints.filter(p => isWaterPoint(p));
      const sewerPts = basePoints.filter(p => isSewerPoint(p));
      if (analyzerNetworkType === 'water') {
        return waterPts.length > 0 ? waterPts : basePoints.filter(p => !isSewerPoint(p));
      } else if (analyzerNetworkType === 'sewer') {
        return sewerPts.length > 0 ? sewerPts : basePoints.filter(p => !isWaterPoint(p));
      }
    }

    return basePoints;
  };

  // ==========================================
  // فحص وتصدير تقرير الفجوات الشبكية (Network Gaps)
  // ==========================================
  const [detectedNetworkGaps, setDetectedNetworkGaps] = useState<NetworkGap[]>([]);

  const verifyNetworkGaps = async () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري تحليل الشبكة وفحص الفجوات والخطوط المقطوعة (Network Gaps)...'
        : 'Analyzing network and detecting gaps & disconnected endpoints...'
    );

    setTimeout(async () => {
      try {
        const pointsToCheck = getPointsToCheck();
        const gaps = await detectNetworkGaps(pointsToCheck, 35.0, (p) => setProgressPercent(10 + Math.round(p * 0.85)));
        setDetectedNetworkGaps(gaps);

        let totalCheckedLines = pointsToCheck.filter(p => p.type === 'LineString').length;
        let gapCount = gaps.length;

        // Highlight gap line endpoints on map in vibrant orange/red (#FF3300)
        if (gapCount > 0) {
          const gapLineIds = new Set(gaps.map(g => String(g.lineId)));
          const gapMarkers: GeoPoint[] = gaps.map((g, idx) => ({
            id: `GAP_MARKER_${g.lineId}_${g.endpointType}_${idx}`,
            name: lang === 'ar' ? `فجوة شبكية - خط ${g.lineId}` : `Network Gap - Line ${g.lineId}`,
            x: g.startCoord.x,
            y: g.startCoord.y,
            type: 'Point',
            color: '#FF3300',
            layer: g.layer || 'Network Gaps',
            street: g.street,
            district: g.district,
            isIssue: true,
            issueReason: lang === 'ar' 
              ? `طرف خط مقطوع (فجوة) - المسافة لأقرب خط: ${g.gapDistanceMeters ? g.gapDistanceMeters.toFixed(1) + 'متر' : 'أكثر من 35m'}` 
              : `Disconnected Endpoint (Gap) - Distance to nearest line: ${g.gapDistanceMeters ? g.gapDistanceMeters.toFixed(1) + 'm' : '>35m'}`
          }));

          const processGapsOnMap = (pts: GeoPoint[]) => {
            const updated = pts.map(pt => {
              if (gapLineIds.has(String(pt.id))) {
                const origColor = (pt as any).originalColor || pt.color || '#DCB13C';
                const origLayer = (pt as any).originalLayer || pt.layer;
                return {
                  ...pt,
                  originalColor: origColor,
                  originalLayer: origLayer,
                  color: '#FF3300', // Vibrant Neon Orange-Red for Gaps
                  isIssue: true,
                  issueReason: lang === 'ar' ? 'طرف خط مقطوع (فجوة شبكية)' : 'Disconnected line endpoint (Network Gap)'
                };
              }
              return pt;
            });
            return [...updated, ...gapMarkers];
          };

          if (globalPoints.length > 0) setGlobalPoints(processGapsOnMap(globalPoints));
          if (plannedStreets.length > 0) setPlannedStreets(processGapsOnMap(plannedStreets));
          setDataId(`gaps-check-${Date.now()}`);

          // Automatically select and focus the first gap marker on the map
          if (gapMarkers.length > 0) {
            setSelectedPoint(gapMarkers[0]);
          }
        }

        const issueItems: GeoPoint[] = gaps.map(g => ({
          id: `${g.lineId} (${g.endpointType === 'start' ? 'البداية' : 'النهاية'})`,
          name: `${g.lineId} [${g.endpointType}]`,
          x: g.startCoord.x,
          y: g.startCoord.y,
          type: 'Point',
          color: '#FF3300',
          street: g.street,
          district: g.district,
          layer: g.layer,
          issueReason: lang === 'ar'
            ? `طرف مقطوع - أقرب خط يبعد ${g.gapDistanceMeters ? g.gapDistanceMeters.toFixed(1) + 'm' : 'أكثر من 35m'}`
            : `Disconnected - Nearest line at ${g.gapDistanceMeters ? g.gapDistanceMeters.toFixed(1) + 'm' : '>35m'}`
        }));

        setCheckResultModal({
          type: 'essential',
          titleAr: 'نتائج فحص الفجوات الشبكية (Network Gaps)',
          titleEn: 'Network Gaps Audit Report',
          icon: 'essential',
          totalChecked: totalCheckedLines,
          issuesCount: gapCount,
          successCount: totalCheckedLines - gapCount,
          badgeTextAr: gapCount > 0 ? `وُجدت ${gapCount} فجوة شبكية (أطراف مقطوعة)` : 'الشبكة متصلة بالكامل بدون أي فجوات',
          badgeTextEn: gapCount > 0 ? `${gapCount} Network Gaps Found` : 'Network is fully connected without gaps',
          detailsAr: gapCount > 0
            ? `تم فحص ${totalCheckedLines} خط شبكة، وتبين وجود ${gapCount} طرف مقطوع (فجوة غير متصلة مع بقية الخطوط). يمكنك تصدير تقرير إكسل تفصيلي بإحداثيات بداية ونهاية كل خط مقطوع.`
            : `تم فحص جميع الخطوط (${totalCheckedLines} خط)، وتبين أنها متصلة بالكامل بدون أي فجوات شبكية.`,
          detailsEn: gapCount > 0
            ? `Audited ${totalCheckedLines} network lines. Identified ${gapCount} disconnected endpoints (network gaps). You can export a detailed Excel report with start and end coordinates.`
            : `Audited ${totalCheckedLines} network lines. 100% connected with no network gaps.`,
          issueItems: issueItems,
          stats: [
            { labelAr: 'إجمالي خطوط الشبكة', labelEn: 'Total Network Lines', value: totalCheckedLines, colorClass: 'text-white' },
            { labelAr: 'عدد الفجوات/الأطراف المقطوعة', labelEn: 'Network Gaps Count', value: gapCount, colorClass: gapCount > 0 ? 'text-amber-400 font-black' : 'text-emerald-400 font-black' },
            { labelAr: 'نسبة اتصال الشبكة', labelEn: 'Connectivity Ratio', value: totalCheckedLines > 0 ? `${Math.max(0, Math.round(((totalCheckedLines - gapCount) / totalCheckedLines) * 100))}%` : '100%', colorClass: 'text-accent font-black' }
          ]
        });

        setProgressPercent(100);
        setStatusMessage(
          lang === 'ar'
            ? `تم الكشف عن ${gapCount} فجوة شبكية وتحديد أطرافها المقطوعة باللون البرتقالي المحمر.`
            : `Detected ${gapCount} network gaps and highlighted disconnected endpoints in orange-red.`
        );
        setTimeout(() => setStatusMessage(''), 5000);
      } catch (e) {
        console.error('Error in verifyNetworkGaps:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const exportNetworkGapsExcel = async () => {
    let gaps = detectedNetworkGaps;
    
    // If not detected yet, run detection quickly
    if (gaps.length === 0) {
      const pointsToCheck = getPointsToCheck();
      gaps = await detectNetworkGaps(pointsToCheck, 35.0);
      setDetectedNetworkGaps(gaps);
    }

    if (gaps.length === 0) {
      alert(lang === 'ar' ? 'لم يتم العثور على أي فجوات شبكية لتصديرها!' : 'No network gaps found to export!');
      return;
    }

    const rows = gaps.map((gap, index) => {
      const startLat = gap.startCoord.y;
      const startLon = gap.startCoord.x;
      const endLat = gap.endCoord ? gap.endCoord.y : '-';
      const endLon = gap.endCoord ? gap.endCoord.x : '-';

      const startMapLink = `https://www.google.com/maps?q=${startLat},${startLon}`;
      const endMapLink = gap.endCoord ? `https://www.google.com/maps?q=${gap.endCoord.y},${gap.endCoord.x}` : '-';

      return {
        '#': index + 1,
        [lang === 'ar' ? 'معرف الخط المقطوع' : 'Line ID']: gap.lineId,
        [lang === 'ar' ? 'الطبقة' : 'Layer']: gap.layer || 'Default',
        [lang === 'ar' ? 'موقع الطرف المقطوع' : 'Endpoint Type']: gap.endpointType === 'start' ? (lang === 'ar' ? 'بداية الخط' : 'Line Start') : (lang === 'ar' ? 'نهاية الخط' : 'Line End'),
        [lang === 'ar' ? 'إحداثي بداية الفجوة (Y - Latitude)' : 'Gap Start Lat (Y)']: startLat,
        [lang === 'ar' ? 'إحداثي بداية الفجوة (X - Longitude)' : 'Gap Start Lon (X)']: startLon,
        [lang === 'ar' ? 'إحداثي نهاية الفجوة/أقرب نقطة (Y - Latitude)' : 'Gap End/Nearest Lat (Y)']: endLat,
        [lang === 'ar' ? 'إحداثي نهاية الفجوة/أقرب نقطة (X - Longitude)' : 'Gap End/Nearest Lon (X)']: endLon,
        [lang === 'ar' ? 'مسافة الفجوة التقريبية (متر)' : 'Gap Distance (m)']: gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(2) : (lang === 'ar' ? 'أكثر من 35m' : '>35m'),
        [lang === 'ar' ? 'معرف أقرب خط مجاور' : 'Nearest Line ID']: gap.nearestLineId || '-',
        [lang === 'ar' ? 'الشارع' : 'Street']: gap.street || '-',
        [lang === 'ar' ? 'الحي' : 'District']: gap.district || '-',
        [lang === 'ar' ? 'رابط موقع الفجوة على الخريطة' : 'Gap Location Map Link']: startMapLink,
        [lang === 'ar' ? 'رابط النقطة المجاورة' : 'Nearest Candidate Map Link']: endMapLink
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, lang === 'ar' ? "الفجوات الشبكية" : "Network Gaps");

    XLSX.writeFile(workbook, `Network_Gaps_Report_${activeFile?.filename?.split('.')[0] || 'Network'}_${Date.now()}.xlsx`);
  };

  const exportNetworkGapsPDFHandler = async () => {
    let gaps = detectedNetworkGaps;
    
    if (gaps.length === 0) {
      const pointsToCheck = getPointsToCheck();
      gaps = await detectNetworkGaps(pointsToCheck, 35.0);
      setDetectedNetworkGaps(gaps);
    }

    if (gaps.length === 0) {
      alert(lang === 'ar' ? 'لم يتم العثور على أي فجوات شبكية لتصديرها!' : 'No network gaps found to export!');
      return;
    }

    downloadNetworkGapsPDF(gaps, activeFile?.filename || 'Network', lang);
  };

  const exportNetworkGapsKMLHandler = async () => {
    let gaps = detectedNetworkGaps;
    
    if (gaps.length === 0) {
      const pointsToCheck = getPointsToCheck();
      gaps = await detectNetworkGaps(pointsToCheck, 35.0);
      setDetectedNetworkGaps(gaps);
    }

    if (gaps.length === 0) {
      alert(lang === 'ar' ? 'لم يتم العثور على أي فجوات شبكية لتصديرها!' : 'No network gaps found to export!');
      return;
    }

    const gapKmlPoints: GeoPoint[] = [];

    gaps.forEach((gap, idx) => {
      // 1. Point Placemark for the gap endpoint
      const ptName = lang === 'ar' 
        ? `فجوة - خط ${gap.lineId} [${gap.endpointType === 'start' ? 'البداية' : 'النهاية'}]` 
        : `Gap - Line ${gap.lineId} [${gap.endpointType}]`;
      
      const ptDesc = lang === 'ar'
        ? `معرف الخط: ${gap.lineId}\nالطرف: ${gap.endpointType === 'start' ? 'بداية الخط' : 'نهاية الخط'}\nالمسافة لأقرب خط: ${gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(2) + ' متر' : 'أكثر من 35m'}\nالطبقة: ${gap.layer || 'Default'}\nالشارع: ${gap.street || '-'}\nالحي: ${gap.district || '-'}`
        : `Line ID: ${gap.lineId}\nEndpoint: ${gap.endpointType}\nDistance: ${gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(2) + 'm' : '>35m'}\nLayer: ${gap.layer || 'Default'}\nStreet: ${gap.street || '-'}\nDistrict: ${gap.district || '-'}`;

      gapKmlPoints.push({
        id: `GAP_KML_PT_${gap.lineId}_${gap.endpointType}_${idx}`,
        name: ptName,
        x: gap.startCoord.x,
        y: gap.startCoord.y,
        type: 'Point',
        color: '#FF3300',
        layer: 'Network_Gaps',
        street: gap.street,
        district: gap.district,
        description: ptDesc,
        attributes: {
          Line_ID: String(gap.lineId),
          Endpoint: gap.endpointType,
          Gap_Distance: gap.gapDistanceMeters ? `${gap.gapDistanceMeters.toFixed(2)}m` : '>35m',
          Nearest_Line: String(gap.nearestLineId || '-')
        }
      });

      // 2. Vector line connecting startCoord to endCoord if candidate exists
      if (gap.endCoord) {
        gapKmlPoints.push({
          id: `GAP_KML_VECTOR_${gap.lineId}_${gap.endpointType}_${idx}`,
          name: lang === 'ar' ? `متجه الفجوة (${gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(1) + 'م' : ''})` : `Gap Vector (${gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(1) + 'm' : ''})`,
          x: gap.startCoord.x,
          y: gap.startCoord.y,
          type: 'LineString',
          path: [gap.startCoord, gap.endCoord],
          color: '#FF3300',
          length: gap.gapDistanceMeters,
          layer: 'Network_Gaps_Vectors',
          description: ptDesc,
          attributes: {
            Line_ID: String(gap.lineId),
            Gap_Distance: gap.gapDistanceMeters ? `${gap.gapDistanceMeters.toFixed(2)}m` : ''
          }
        });
      }
    });

    await downloadKMZ(gapKmlPoints, `Network_Gaps_${activeFile?.filename?.split('.')[0] || 'KML'}`, {
      mode: 'none',
      lineStyle: { width: 4 }
    });
  };

  // ==========================================
  // 1. التطابق (Duplicate Lines - خط فوق خط)
  // ==========================================
  const handleCheckDuplicates = () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري فحص التداخل الجغرافي والتطابق المكاني...'
        : 'Checking spatial duplicates...'
    );

    setTimeout(async () => {
      try {
        const pointsToCheck = getPointsToCheck();
        const dups = await detectExactDuplicates(pointsToCheck, duplicateTolerance, p => setProgressPercent(10 + Math.round(p * 0.85)));
        setProgressPercent(95);
        setOverlapResults(dups);
        setOverlapModalType('duplicates');
        setShowOverlapModal(true);
        if (dups.length === 0) {
          setStatusMessage(
            lang === 'ar'
              ? `لم يتم العثور على أي عناصر متطابقة (خط فوق خط) ضمن مسافة ${duplicateTolerance}m.`
              : `No exact duplicate lines found within ${duplicateTolerance}m.`
          );
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          setStatusMessage('');
        }
      } catch (e) {
        console.error('Error in handleCheckDuplicates:', e);
      } finally {
        setProgressPercent(100);
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const handleColorDuplicatesBlack = () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري تلوين الخطوط المتطابقة باللون الأسود ⬛...'
        : 'Coloring duplicate lines in black ⬛...'
    );

    setTimeout(async () => {
      try {
        const pointsToCheck = getPointsToCheck();
        const dups = await detectExactDuplicates(pointsToCheck, duplicateTolerance, p => setProgressPercent(10 + Math.round(p * 0.75)));

        if (dups.length === 0) {
          setStatusMessage(
            lang === 'ar'
              ? `لم يتم العثور على خطوط متطابقة لتلوينها بالأسود ضمن مسافة ${duplicateTolerance}m.`
              : `No duplicate lines found to color black within ${duplicateTolerance}m.`
          );
          setTimeout(() => setStatusMessage(''), 3000);
          return;
        }

        setProgressPercent(85);
        const dupIds = new Set<string>();
        dups.forEach(d => {
          dupIds.add(String(d.id1));
          dupIds.add(String(d.id2));
        });

        let coloredCount = 0;
        const updateList = (list: GeoPoint[]) => list.map(pt => {
          if (dupIds.has(String(pt.id))) {
            coloredCount++;
            return {
              ...pt,
              originalColor: (pt as any).originalColor || pt.color || '#DCB13C',
              originalLayer: (pt as any).originalLayer || pt.layer || '0',
              color: '#000000'
            };
          }
          return pt;
        });

        setGlobalPoints(prev => updateList(prev));
        setPlannedStreets(prev => updateList(prev));

        setOverlapResults(dups);
        setOverlapModalType('duplicates');
        setShowOverlapModal(true);
        setDataId(`colored-black-${Date.now()}`);

        setProgressPercent(100);
        setStatusMessage(
          lang === 'ar'
            ? `تم تلوين ${coloredCount} خط متطابق (خط فوق خط) باللون الأسود ⬛ بنجاح!`
            : `Successfully colored ${coloredCount} duplicate lines in black ⬛!`
        );
        setTimeout(() => setStatusMessage(''), 5000);
      } catch (e) {
        console.error('Error in handleColorDuplicatesBlack:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const handleResolveDuplicates = () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري حذف وتصفية العناصر المكررة والمتطابقة 🗑️...'
        : 'Deleting duplicate elements 🗑️...'
    );

    setTimeout(async () => {
      try {
        let totalRemoved = 0;
        let nextGlobal = [...globalPoints];
        let nextPlanned = [...plannedStreets];

        if (nextGlobal.length > 0) {
          const { cleanedPoints, removedCount } = await resolveExactDuplicates(nextGlobal, duplicateTolerance, p => setProgressPercent(10 + Math.round(p * 0.4)));
          totalRemoved += removedCount;
          nextGlobal = cleanedPoints;
        }

        setProgressPercent(50);
        if (nextPlanned.length > 0) {
          const { cleanedPoints: cleanedStreets, removedCount: count2 } = await resolveExactDuplicates(nextPlanned, duplicateTolerance, p => setProgressPercent(50 + Math.round(p * 0.4)));
          totalRemoved += count2;
          nextPlanned = cleanedStreets;
        }

        setGlobalPoints(nextGlobal);
        setPlannedStreets(nextPlanned);

        if (activeFile) {
          setActiveFile(prev => prev ? { ...prev, data: nextGlobal } : null);
        }

        setDataId(`resolved-dups-${Date.now()}`);

        const checkTarget = nextGlobal.length > 0 ? nextGlobal : nextPlanned;
        const remainingDups = await detectExactDuplicates(checkTarget, duplicateTolerance);
        const remainingIntersections = await detectLineIntersections(checkTarget);
        const remainingTotal = remainingDups.length + remainingIntersections.length;

        setOverlapResults(remainingDups);
        setOverlapModalType('duplicates');

        if (remainingTotal === 0) {
          setAutoAlertInfo(null);
          setShowAutoAlertModal(false);
        } else {
          setAutoAlertInfo(prev => prev ? {
            ...prev,
            duplicatesCount: remainingDups.length,
            intersectionsCount: remainingIntersections.length,
            totalCount: remainingTotal,
            dups: remainingDups,
            intersections: remainingIntersections
          } : null);
        }

        setProgressPercent(100);
        setStatusMessage(
          lang === 'ar'
            ? `تم حذف ${totalRemoved} عنصر مكرر ومتطابق تماماً بنجاح!`
            : `Successfully deleted ${totalRemoved} exact duplicate elements!`
        );
        setTimeout(() => setStatusMessage(''), 5000);
      } catch (e) {
        console.error('Error in handleResolveDuplicates:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  // ==========================================
  // 2. التقاطعات (Line Intersections - نقاط التلاقي والعبور)
  // ==========================================
  const handleCheckIntersections = () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري فحص التداخل الجغرافي وتقاطعات الخطوط...'
        : 'Checking spatial overlaps and line intersections...'
    );

    setTimeout(async () => {
      try {
        const pointsToCheck = getPointsToCheck();
        const intersections = await detectLineIntersections(pointsToCheck, p => setProgressPercent(10 + Math.round(p * 0.85)));
        setProgressPercent(95);
        setOverlapResults(intersections);
        setOverlapModalType('intersections');
        setShowOverlapModal(true);
        if (intersections.length === 0) {
          setStatusMessage(
            lang === 'ar'
              ? 'لم يتم العثور على أي تقاطعات أو نقاط عبور بين الخطوط.'
              : 'No intersecting lines found.'
          );
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          setStatusMessage('');
        }
      } catch (e) {
        console.error('Error in handleCheckIntersections:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const handleTrimIntersections = () => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري تقليم الخطوط والمسارات عند نقاط التقاطع ✂️...'
        : 'Trimming lines at intersections ✂️...'
    );

    setTimeout(async () => {
      try {
        let totalTrimmed = 0;
        let nextGlobal = [...globalPoints];
        let nextPlanned = [...plannedStreets];

        if (nextGlobal.length > 0) {
          const { cleanedPoints, trimmedCount } = await trimLinesAtIntersections(nextGlobal, p => setProgressPercent(10 + Math.round(p * 0.4)));
          totalTrimmed += trimmedCount;
          nextGlobal = cleanedPoints;
        }

        setProgressPercent(50);
        if (nextPlanned.length > 0) {
          const { cleanedPoints: cleanedStreets, trimmedCount: count2 } = await trimLinesAtIntersections(nextPlanned, p => setProgressPercent(50 + Math.round(p * 0.4)));
          totalTrimmed += count2;
          nextPlanned = cleanedStreets;
        }

        setGlobalPoints(nextGlobal);
        setPlannedStreets(nextPlanned);

        if (activeFile) {
          setActiveFile(prev => prev ? { ...prev, data: nextGlobal } : null);
        }

        setDataId(`trimmed-inters-${Date.now()}`);

        const checkTarget = nextGlobal.length > 0 ? nextGlobal : nextPlanned;
        const remainingDups = await detectExactDuplicates(checkTarget, duplicateTolerance);
        const remainingIntersections = await detectLineIntersections(checkTarget);
        const remainingTotal = remainingDups.length + remainingIntersections.length;

        setOverlapResults(remainingIntersections);
        setOverlapModalType('intersections');

        if (remainingTotal === 0) {
          setAutoAlertInfo(null);
          setShowAutoAlertModal(false);
        } else {
          setAutoAlertInfo(prev => prev ? {
            ...prev,
            duplicatesCount: remainingDups.length,
            intersectionsCount: remainingIntersections.length,
            totalCount: remainingTotal,
            dups: remainingDups,
            intersections: remainingIntersections
          } : null);
        }

        setProgressPercent(100);
        setStatusMessage(
          lang === 'ar'
            ? `تم تقليم ${totalTrimmed} خط عند نقاط التقاطع بنجاح!`
            : `Successfully trimmed ${totalTrimmed} lines at intersections!`
        );
        setTimeout(() => setStatusMessage(''), 5000);
      } catch (e) {
        console.error('Error in handleTrimIntersections:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const handleDeleteDuplicateItem = (targetId: string | number) => {
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(
      lang === 'ar'
        ? 'جاري حذف العنصر وإعادة حساب التداخل الجغرافي...'
        : 'Deleting element and re-evaluating spatial overlaps...'
    );

    setTimeout(async () => {
      try {
        const filterFn = (p: GeoPoint) => String(p.id) !== String(targetId);

        const nextGlobal = globalPoints.filter(filterFn);
        const nextPlanned = plannedStreets.filter(filterFn);

        setGlobalPoints(nextGlobal);
        setPlannedStreets(nextPlanned);

        if (activeFile) {
          setActiveFile(fPrev => fPrev ? { ...fPrev, data: nextGlobal } : null);
        }

        setDataId(`deleted-${Date.now()}`);
        const checkTarget = nextGlobal.length > 0 ? nextGlobal : nextPlanned;
        const remainingDups = await detectExactDuplicates(checkTarget, duplicateTolerance);
        const remainingIntersections = await detectLineIntersections(checkTarget);
        const remainingTotal = remainingDups.length + remainingIntersections.length;

        if (overlapModalType === 'duplicates') {
          setOverlapResults(remainingDups);
        } else {
          setOverlapResults(remainingIntersections);
        }

        if (remainingTotal === 0) {
          setAutoAlertInfo(null);
          setShowAutoAlertModal(false);
        } else {
          setAutoAlertInfo(prev => prev ? {
            ...prev,
            duplicatesCount: remainingDups.length,
            intersectionsCount: remainingIntersections.length,
            totalCount: remainingTotal,
            dups: remainingDups,
            intersections: remainingIntersections
          } : null);
        }
        setProgressPercent(100);
        setStatusMessage('');
      } catch (e) {
        console.error('Error in handleDeleteDuplicateItem:', e);
      } finally {
        setLoading(false);
        setProgressPercent(null);
      }
    }, 50);
  };

  const handleLoadSavedProjectToMap = (points: GeoPoint[], name: string) => {
    setGlobalPoints(points);
    setActiveFile({
      name: name,
      filename: name,
      type: 'kml',
      data: points,
      headers: extractHeadersFromPoints(points)
    });
    setDataId(`loaded-project-${Date.now()}`);
    setMobileView('map');
    setStatusMessage(
      lang === 'ar'
        ? `تم تحميل مشروع "${name}" بنجاح على الخريطة والجلسة النشطة!`
        : `Successfully loaded project "${name}" to the map and active session!`
    );
    setTimeout(() => setStatusMessage(''), 4000);
  };

  const [splitCount, setSplitCount] = useState<number>(2);
  const [exportStyle, setExportStyle] = useState<'single' | 'zip'>(() => loadSavedPreference('exportStyle', 'single'));
  const [splitLines, setSplitLines] = useState(false);
  const [splitIntersections, setSplitIntersections] = useState(false);
  const [separateMulti, setSeparateMulti] = useState(false);
  const [maxLen, setMaxLen] = useState(() => loadSavedPreference('maxLen', 1000));

  // Multi-Polygon Split State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{x: number, y: number}[] | null>(null);

  const [plannerSeparate, setPlannerSeparate] = useState(false);
  const [plannerSplitLines, setPlannerSplitLines] = useState(false);
  const [plannerSplitIntersections, setPlannerSplitIntersections] = useState(false);
  const [plannerMaxLen, setPlannerMaxLen] = useState(() => loadSavedPreference('plannerMaxLen', 500));
  const [plannerClip, setPlannerClip] = useState(true);
  const [plannerBuffer, setPlannerBuffer] = useState(0);

  // Street Classification Filters
  const [streetTypeFilters, setStreetTypeFilters] = useState<string[]>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']);

  const [sourceEPSG, setSourceEPSG] = useState<string>(() => loadSavedPreference('sourceEPSG', 'EPSG:32638'));
  const [swapXY, setSwapXY] = useState<boolean>(false);
  const [mapping, setMapping] = useState<ColumnMapping>({
    xColumn: '', yColumn: '', idColumn: '', linkColumn: '', attr1Column: '', attr2Column: ''
  });
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([]);
  const [streetMappingCol, setStreetMappingCol] = useState<string>('');
  const [districtMappingCol, setDistrictMappingCol] = useState<string>('');
  const [groupingMode, setGroupingMode] = useState<'none' | 'layer' | 'column'>(() => loadSavedPreference('groupingMode', 'layer'));
  const [groupByColumnSelect, setGroupByColumnSelect] = useState<string>('');
  const [converterExportAsZip, setConverterExportAsZip] = useState<boolean>(() => loadSavedPreference('converterExportAsZip', false));
  const [optimizeForMyMaps, setOptimizeForMyMaps] = useState<boolean>(() => loadSavedPreference('optimizeForMyMaps', false));
  const [keepOriginalDescription, setKeepOriginalDescription] = useState<boolean>(() => loadSavedPreference('keepOriginalDescription', false));
  const [removeImagesOnly, setRemoveImagesOnly] = useState<boolean>(() => loadSavedPreference('removeImagesOnly', false));
  const [skipStreetFetching, setSkipStreetFetching] = useState<boolean>(() => loadSavedPreference('skipStreetFetching', false));
  const [converterGeometryFilter, setConverterGeometryFilter] = useState<'all' | 'Point' | 'LineString' | 'Polygon'>(() => loadSavedPreference('converterGeometryFilter', 'all') as any);

  // Auto-persist user preferences to localStorage
  useEffect(() => { savePreference('lang', lang); }, [lang]);
  useEffect(() => { savePreference('theme', theme); }, [theme]);
  useEffect(() => { savePreference('geocodingMode', geocodingMode); }, [geocodingMode]);
  useEffect(() => { savePreference('globalBaseMap', globalBaseMap); }, [globalBaseMap]);
  useEffect(() => { savePreference('sourceEPSG', sourceEPSG); }, [sourceEPSG]);
  useEffect(() => { savePreference('exportStyle', exportStyle); }, [exportStyle]);
  useEffect(() => { savePreference('converterExportAsZip', converterExportAsZip); }, [converterExportAsZip]);
  useEffect(() => { savePreference('optimizeForMyMaps', optimizeForMyMaps); }, [optimizeForMyMaps]);
  useEffect(() => { savePreference('keepOriginalDescription', keepOriginalDescription); }, [keepOriginalDescription]);
  useEffect(() => { savePreference('removeImagesOnly', removeImagesOnly); }, [removeImagesOnly]);
  useEffect(() => { savePreference('skipStreetFetching', skipStreetFetching); }, [skipStreetFetching]);
  useEffect(() => { savePreference('converterGeometryFilter', converterGeometryFilter); }, [converterGeometryFilter]);
  useEffect(() => { savePreference('maxLen', maxLen); }, [maxLen]);
  useEffect(() => { savePreference('plannerMaxLen', plannerMaxLen); }, [plannerMaxLen]);
  useEffect(() => { savePreference('mergeThreshold', mergeThreshold); }, [mergeThreshold]);
  useEffect(() => { savePreference('groupingMode', groupingMode); }, [groupingMode]);

  useEffect(() => {
    setStreetMappingCol('');
    setDistrictMappingCol('');
  }, [activeFile?.filename]);

  const handleResetPreferences = () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(SETTINGS_KEY)) {
          localStorage.removeItem(key);
        }
      });
      setLang('ar');
      setTheme('default');
      setGeocodingMode('accurate');
      setGlobalBaseMap('satellite');
      setSourceEPSG('EPSG:32638');
      setExportStyle('single');
      setConverterExportAsZip(false);
      setOptimizeForMyMaps(false);
      setKeepOriginalDescription(false);
      setRemoveImagesOnly(false);
      setMaxLen(1000);
      setPlannerMaxLen(500);
      setMergeThreshold(45);
      setGroupingMode('layer');
    } catch (e) {
      console.error('Failed to reset settings:', e);
    }
  };

  const boundaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeFile && activeFile.headers) {
      const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
      const initialSelection = activeFile.headers.filter(h => {
        const normH = normalize(h);
        return defaultFields.some(df => {
          const normDf = normalize(df);
          return normH.includes(normDf) || normDf.includes(normH);
        });
      });

      // Also add the default fields themselves so they are always in selectedHeaders
      // even if they don't exist in the file's headers
      const allSelected = Array.from(new Set([...initialSelection, ...defaultFields]));
      setSelectedHeaders(initialSelection.length > 0 ? allSelected : Array.from(new Set([...(activeFile.headers || []), ...defaultFields])));

      if ((activeFile.headers || []).length > 0) {
        setGroupByColumnSelect(activeFile.headers![0]);
      }
    } else {
      setSelectedHeaders([]);
      setGroupByColumnSelect('');
    }
  }, [activeFile]);

  useEffect(() => {
    if (theme === 'nwc') {
      document.body.classList.add('theme-nwc');
    } else {
      document.body.classList.remove('theme-nwc');
    }
  }, [theme]);

  const toggleStreetType = (type: string) => {
    setStreetTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const layerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    globalPoints.forEach(p => {
      const layer = p.layer || 'Default';
      stats[layer] = (stats[layer] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [globalPoints]);

  const canonicalColorMap = useMemo(() => {
    const rawPoints = activeTab === 'street-planner' ? [...globalPoints, ...plannedStreets] : globalPoints;
    const pointsToProcess = rawPoints.filter(p => !isBlackLine(p));
    if (pointsToProcess.length === 0) return {};
    const colors = Array.from(new Set<string>(pointsToProcess.map(p => String(p.color || '#dcb13c').toUpperCase())));
    return getCanonicalColorMap(colors, mergeThreshold);
  }, [globalPoints, plannedStreets, activeTab, mergeThreshold]);


  const analyzerExportPoints = useMemo(() => {
    let rawPoints = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile))
      ? (Array.isArray(plannedStreets) ? plannedStreets : [])
      : (Array.isArray(globalPoints) ? globalPoints : []);

    if (activeTab === 'analyzer' && analyzerNetworkType !== 'all') {
      const waterPts = rawPoints.filter(p => isWaterPoint(p));
      const sewerPts = rawPoints.filter(p => isSewerPoint(p));
      if (analyzerNetworkType === 'water') {
        rawPoints = waterPts.length > 0 ? waterPts : rawPoints.filter(p => !isSewerPoint(p));
      } else if (analyzerNetworkType === 'sewer') {
        rawPoints = sewerPts.length > 0 ? sewerPts : rawPoints.filter(p => !isWaterPoint(p));
      }
    }
    return rawPoints;
  }, [globalPoints, plannedStreets, activeTab, activeFile, analyzerNetworkType]);

  const { executionStatusDistribution, diameterDistribution } = useMemo(() => {
    const rawPoints = analyzerExportPoints;

    const pointsToAnalyze = rawPoints.filter(pt => pt && pt.type === 'LineString' && !isBlackLine(pt));
    const statusTotals: Record<string, number> = {
      'executed_water': 0,
      'executed_sewer': 0,
      'in_progress': 0,
      'remaining': 0,
      'cancelled': 0,
    };
    const diaGroups: Record<string, number> = {};

    pointsToAnalyze.forEach(pt => {
        let len = pt.originalLength || 0;
        if (len === 0 && pt.type === 'LineString' && pt.path) {
            len = calculatePathLength(pt.path);
        }

        let diameter = lang === 'ar' ? 'غير محدد' : 'Unknown';

        if (pt.attributes) {
            // Check for diameter keys
            const diaKey = Object.keys(pt.attributes).find(k => {
                const lower = String(k || '').toLowerCase();
                return lower.includes('diameter') || lower.includes('قطر');
            });
            if (diaKey && pt.attributes[diaKey]) diameter = String(pt.attributes[diaKey]);
        }

        if (len > 0) {
            const statusCat = matchStatusByColor(pt.color || '#dcb13c');
            statusTotals[statusCat.key] = (statusTotals[statusCat.key] || 0) + len;
            diaGroups[diameter] = (diaGroups[diameter] || 0) + len;
        }
    });

    const totalMeters = Object.values(statusTotals).reduce((a, b) => a + b, 0);
    const statusData = STATUS_CATEGORIES.map(cat => {
      const meters = statusTotals[cat.key] || 0;
      const km = Number((meters / 1000).toFixed(2));
      const pct = totalMeters > 0 ? (meters / totalMeters) * 100 : 0;
      return {
        name: lang === 'ar' ? cat.nameAr : cat.nameEn,
        value: km,
        meters,
        percent: pct,
        color: cat.color,
        key: cat.key,
      };
    }).filter(item => item.value > 0);

    const diaData = Object.entries(diaGroups)
      .filter(([k, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Number((value / 1000).toFixed(2)) })) // Convert to km
      .sort((a, b) => b.value - a.value);

    return { executionStatusDistribution: statusData, diameterDistribution: diaData };
  }, [globalPoints, plannedStreets, activeTab, activeFile, lang, analyzerNetworkType]);

  const analysisData = useMemo(() => {
    let rawPoints = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile))
      ? (Array.isArray(plannedStreets) ? plannedStreets : [])
      : (Array.isArray(globalPoints) ? globalPoints : []);

    if (activeTab === 'analyzer' && analyzerNetworkType !== 'all') {
      const waterPts = rawPoints.filter(p => isWaterPoint(p));
      const sewerPts = rawPoints.filter(p => isSewerPoint(p));
      if (analyzerNetworkType === 'water') {
        rawPoints = waterPts.length > 0 ? waterPts : rawPoints.filter(p => !isSewerPoint(p));
      } else if (analyzerNetworkType === 'sewer') {
        rawPoints = sewerPts.length > 0 ? sewerPts : rawPoints.filter(p => !isWaterPoint(p));
      }
    }

    // Exclude Points, Polygons, and duplicate black-colored lines!
    const pointsToAnalyze = rawPoints.filter(pt => pt && pt.type === 'LineString' && !isBlackLine(pt));
    if (pointsToAnalyze.length === 0) return [];

    const groups: Record<string, { totalLength: number, count: number }> = {};
    let totalAllLength = 0;

    pointsToAnalyze.forEach(pt => {
      const originalColor = String(pt.color || '#dcb13c').toUpperCase();
      const canonicalColor = canonicalColorMap[originalColor] || originalColor;

      if (!groups[canonicalColor]) groups[canonicalColor] = { totalLength: 0, count: 0 };

      let len = pt.originalLength || 0;
      if (len === 0 && pt.type === 'LineString' && pt.path) {
          len = calculatePathLength(pt.path);
      }

      groups[canonicalColor].totalLength += len;
      groups[canonicalColor].count += 1;
      totalAllLength += len;
    });

    return Object.entries(groups).map(([color, stats]) => {
      const statusCat = matchStatusByColor(color);
      return {
        color,
        statusName: lang === 'ar' ? statusCat.nameAr : statusCat.nameEn,
        statusColor: statusCat.color,
        totalLength: stats.totalLength,
        count: stats.count,
        percentage: totalAllLength > 0 ? (stats.totalLength / totalAllLength) * 100 : 0
      };
    }).sort((a, b) => b.totalLength - a.totalLength);
  }, [globalPoints, plannedStreets, activeTab, canonicalColorMap, activeFile, lang, analyzerNetworkType]);

  const placemarksSummary = useMemo(() => {
    const rawPoints = (!activeFile ? plannedStreets : globalPoints) || [];
    const pointsToAnalyze = (Array.isArray(rawPoints) ? rawPoints : []).filter(pt => pt && !isBlackLine(pt));
    let pointsCount = 0;
    let linesCount = 0;
    let polygonsCount = 0;

    pointsToAnalyze.forEach(pt => {
      if (pt.type === 'LineString') {
        linesCount++;
      } else if (pt.type === 'Polygon') {
        polygonsCount++;
      } else {
        pointsCount++;
      }
    });

    return {
      points: pointsCount,
      lines: linesCount,
      polygons: polygonsCount,
      total: pointsToAnalyze.length
    };
  }, [activeFile, plannedStreets, globalPoints]);

  const segmentIdAnalysis = useMemo(() => {
    const rawPoints = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile))
      ? (Array.isArray(plannedStreets) ? plannedStreets : [])
      : (Array.isArray(globalPoints) ? globalPoints : []);
    const pointsToAnalyze = rawPoints.filter(pt => pt && !isBlackLine(pt));
    if (pointsToAnalyze.length === 0) return null;

    let validCount = 0;
    let totalLengthWithSegmentId = 0;
    const uniqueMap: Record<string, { idValue: string; count: number; totalLength: number; points: GeoPoint[] }> = {};

    const stripHtmlLocal = (html: any): string => {
      if (!html) return '';
      return String(html)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
    };

    const isValidValueLocal = (val: any, keyName?: string): boolean => {
      if (val === undefined || val === null) return false;
      const cleanStr = stripHtmlLocal(val);
      if (!cleanStr) return false;
      if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanStr)) return false;
      const lower = String(cleanStr || '').toLowerCase();
      const emptyValues = new Set([
        '0', '0.0', '00', '000', 'null', 'undefined', 'none', '-', '--', '---', '_', '=',
        'n/a', 'na', 'no', 'false', 'unknown', 'nil', 'empty', '[empty]', '<null>', '<empty>',
        'no data', 'nodata', 'no_data', 'not available', 'not applicable',
        'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان',
        'لاشيء', 'لا شيء', 'صفر', 'معدوم', 'غير معروف'
      ]);
      if (emptyValues.has(lower)) return false;
      const labelValues = new Set([
        'segment id', 'segment_id', 'segmentid', 'segment no', 'segment_no', 'segmentno',
        'segment number', 'segment', 'seg id', 'seg_id', 'segid', 'seg no', 'seg_no', 'segno',
        'layer', 'شريحة', 'رقم الشريحة', 'كود الشريحة', 'معرف الشريحة', 'رقم شريحة', 'كود شريحة',
        'معرف شريحة', 'شريحة خريطة'
      ]);
      if (labelValues.has(lower)) return false;
      if (keyName && lower === String(stripHtmlLocal(keyName) || '').toLowerCase()) return false;
      if (/^(segment|feature|line|polyline|point|layer|element|shape|object)[\s_#-]*\d+$/i.test(cleanStr)) return false;
      return true;
    };

    const normalizeKey = (key: string): string => String(key || '').toLowerCase().replace(/[\s_#-]/g, '');

    const isSegmentKey = (key: string): boolean => {
      if (!key) return false;
      const norm = normalizeKey(key);
      if (!norm) return false;
      const segmentKeys = new Set([
        'segment', 'segmentid', 'segmentno', 'segmentnumber', 'segid', 'segno', 'seg',
        'شريحة', 'شريحه', 'رقمالشريحة', 'كودالشريحة', 'معرفالشريحة', 'رقمشريحة', 'كودشريحة', 'معرفشريحة',
        'رقمالقطع', 'كودالقطع', 'معرفالقطع', 'قطاع', 'رقمالقطاع', 'كودالقطاع', 'معرفالقطاع'
      ]);
      return (
        segmentKeys.has(norm) ||
        norm.startsWith('segment') ||
        norm.startsWith('segid') ||
        norm.includes('segmentid') ||
        norm.includes('segment_id') ||
        norm.includes('رقمالشريحة') ||
        norm.includes('كودالشريحة')
      );
    };

    const extractSegmentIdFromDesc = (description?: string): string | null => {
      if (!description) return null;
      const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
      const tableMatch = description.match(tableCellRegex);
      if (tableMatch && tableMatch[1]) {
        const val = stripHtmlLocal(tableMatch[1]);
        if (isValidValueLocal(val, 'segment id')) return val;
      }
      const textRegex = /(?:segment\s*id|segment_id|segmentid|segment\s*no|segment_no|segmentno|segment\s*number|seg\s*id|seg_id|segid|seg\s*no|seg_no|segno|segment|seg|رقم\s*الشريحة|كود\s*الشريحة|معرف\s*الشريحة|مُعرّف\s*الشريحة|شريحة|شريحه|رقم\s*القطاع|كود\s*القطاع|معرف\s*القطاع|قطاع)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
      const textMatch = description.match(textRegex);
      if (textMatch && textMatch[1]) {
        const val = stripHtmlLocal(textMatch[1]);
        if (isValidValueLocal(val, 'segment id')) return val;
      }
      return null;
    };

    pointsToAnalyze.forEach(pt => {
      let foundVal: string | null = null;
      if (pt.attributes) {
        for (const [key, val] of Object.entries(pt.attributes)) {
          if (isSegmentKey(key) && isValidValueLocal(val, key)) {
            foundVal = stripHtmlLocal(val);
            break;
          }
        }
      }
      if (!foundVal && pt.description) {
        foundVal = extractSegmentIdFromDesc(pt.description);
      }

      if (foundVal) {
        const cleanVal = cleanSegmentId(foundVal);
        const canonKey = getCanonicalSegmentKey(foundVal);

        if (cleanVal && canonKey) {
          validCount++;
          let len = pt.originalLength || 0;
          if (len === 0 && pt.type === 'LineString' && pt.path) {
            len = calculatePathLength(pt.path);
          }
          totalLengthWithSegmentId += len;

          if (!uniqueMap[canonKey]) {
            uniqueMap[canonKey] = { idValue: cleanVal, count: 0, totalLength: 0, points: [] };
          }
          uniqueMap[canonKey].count += 1;
          uniqueMap[canonKey].totalLength += len;
          uniqueMap[canonKey].points.push(pt);
        }
      }
    });

    const extractAttrValue = (points: GeoPoint[], keyCandidates: string[], regexCandidates: RegExp[]): string => {
      const foundSet = new Set<string>();
      for (const pt of points) {
        let valFound = '';
        if (pt.attributes) {
          for (const [k, v] of Object.entries(pt.attributes)) {
            if (v === undefined || v === null) continue;
            const cleanV = String(v).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
            if (!cleanV || cleanV === 'null' || cleanV === 'undefined' || cleanV === '-' || cleanV === '0') continue;
            const kNorm = k.toLowerCase().replace(/[\s_#-]/g, '');
            for (const candidate of keyCandidates) {
              if (kNorm === candidate.toLowerCase().replace(/[\s_#-]/g, '')) {
                valFound = cleanV;
                break;
              }
            }
            if (valFound) break;
          }
        }
        if (!valFound && pt.description) {
          for (const rgx of regexCandidates) {
            const match = pt.description.match(rgx);
            if (match && match[1]) {
              const cleanV = String(match[1]).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
              if (cleanV && cleanV !== 'null' && cleanV !== 'undefined' && cleanV !== '-' && cleanV !== '0') {
                valFound = cleanV;
                break;
              }
            }
          }
        }
        if (valFound) {
          foundSet.add(valFound);
        }
      }
      return Array.from(foundSet).join(' / ');
    };

    const uniqueDetails = Object.values(uniqueMap).map(item => {
      const projectName = extractAttrValue(
        item.points,
        ['PROJECTNAME', 'PROJECT_NAME', 'PROJECT NAME', 'ProjectName', 'اسم المشروع', 'المشروع'],
        [
          /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
          /(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
        ]
      );

      const projectId = extractAttrValue(
        item.points,
        ['PROJECTID', 'PROJECT_ID', 'PROJECT ID', 'ProjectId', 'رقم المشروع', 'رمز المشروع', 'كود المشروع'],
        [
          /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
          /(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
        ]
      );

      const contractor = extractAttrValue(
        item.points,
        ['CONTRACTOR', 'Contractor', 'المقاول', 'اسم المقاول', 'المقاول المنفذ', 'CONTRACTOR_NAME', 'CONTRACTORNAME'],
        [
          /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
          /(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)\s*[:=]\s*([^\r\n,;<>&|]+)/i
        ]
      );

      return {
        ...item,
        projectName,
        projectId,
        contractor
      };
    }).sort((a, b) => b.count - a.count);

    return {
      totalElements: pointsToAnalyze.length,
      validElementsCount: validCount,
      uniqueSegmentIdsCount: uniqueDetails.length,
      totalLengthWithSegmentId,
      uniqueDetails
    };
  }, [globalPoints, plannedStreets, activeTab, activeFile, analyzerNetworkType]);

  const highlightSpecificSegmentId = (pts: GeoPoint[]) => {
    if (!pts || pts.length === 0) return;
    const ptIds = new Set(pts.map(p => p.id));
    setGlobalPoints(prev => prev.map(pt => ptIds.has(pt.id) ? { ...pt, color: '#00FFFF' } : pt));
    setPlannedStreets(prev => prev.map(pt => ptIds.has(pt.id) ? { ...pt, color: '#00FFFF' } : pt));
    setStatusMessage(lang === 'ar' ? `تم إبراز ${pts.length} عناصر للـ Segment ID المحدد على الخريطة باللون السماوي` : `Highlighted ${pts.length} elements for selected Segment ID in cyan`);
  };

  const exportSegmentIdReportExcel = () => {
    if (!segmentIdAnalysis || segmentIdAnalysis.uniqueDetails.length === 0) return;

    const getMapLink = (pts: GeoPoint[]): string => {
      if (!pts || pts.length === 0) return '';
      const firstPt = pts[0];
      let lat = firstPt.y;
      let lon = firstPt.x;
      if ((!lat || !lon) && firstPt.path && firstPt.path.length > 0) {
        lat = firstPt.path[0].y;
        lon = firstPt.path[0].x;
      }
      if (!lat || !lon) return '';
      return `https://www.google.com/maps?q=${lat},${lon}`;
    };

    const extractAttrValueLocal = (points: GeoPoint[], keyCandidates: string[], regexCandidates: RegExp[]): string => {
      const foundSet = new Set<string>();
      for (const pt of points) {
        let valFound = '';
        if (pt.attributes) {
          for (const [k, v] of Object.entries(pt.attributes)) {
            if (v === undefined || v === null) continue;
            const cleanV = String(v).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
            if (!cleanV || cleanV === 'null' || cleanV === 'undefined' || cleanV === '-' || cleanV === '0') continue;
            const kNorm = k.toLowerCase().replace(/[\s_#-]/g, '');
            for (const candidate of keyCandidates) {
              if (kNorm === candidate.toLowerCase().replace(/[\s_#-]/g, '')) {
                valFound = cleanV;
                break;
              }
            }
            if (valFound) break;
          }
        }
        if (!valFound && pt.description) {
          for (const rgx of regexCandidates) {
            const match = pt.description.match(rgx);
            if (match && match[1]) {
              const cleanV = String(match[1]).replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
              if (cleanV && cleanV !== 'null' && cleanV !== 'undefined' && cleanV !== '-' && cleanV !== '0') {
                valFound = cleanV;
                break;
              }
            }
          }
        }
        if (valFound) {
          foundSet.add(valFound);
        }
      }
      return Array.from(foundSet).join(' / ');
    };

    // Sheet 1: Detailed / Statistical Report (Unique Segment IDs Summary)
    const rowsSheet1: any[] = [];
    const seenKeysSheet1 = new Set<string>();

    segmentIdAnalysis.uniqueDetails.forEach((item) => {
      const canon = getCanonicalSegmentKey(item.idValue);
      if (!canon || seenKeysSheet1.has(canon)) return;
      seenKeysSheet1.add(canon);

      const firstPt = item.points[0];
      const lastPt = item.points[item.points.length - 1];
      const startX = (firstPt && firstPt.path && firstPt.path.length > 0) ? firstPt.path[0].x : (firstPt?.x || 0);
      const startY = (firstPt && firstPt.path && firstPt.path.length > 0) ? firstPt.path[0].y : (firstPt?.y || 0);
      const endX = (lastPt && lastPt.path && lastPt.path.length > 0) ? lastPt.path[lastPt.path.length - 1].x : (lastPt?.x || 0);
      const endY = (lastPt && lastPt.path && lastPt.path.length > 0) ? lastPt.path[lastPt.path.length - 1].y : (lastPt?.y || 0);

      rowsSheet1.push({
        'PROJECTNAME': item.projectName || '',
        'PROJECTID': formatProjectIdForExcel(item.projectId),
        'CONTRACTOR': item.contractor || '',
        'م': rowsSheet1.length + 1,
        'Segment ID': item.idValue,
        [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
        [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
        [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
        [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
        'عدد العناصر (Items Count)': item.count,
        'إجمالي الطول (متر)': (item.totalLength).toFixed(2),
        'إجمالي الطول (كيلومتر)': (item.totalLength / 1000).toFixed(3),
        'نسبة الأطوال (%)': ((item.totalLength / (segmentIdAnalysis.totalLengthWithSegmentId || 1)) * 100).toFixed(1) + '%',
        'رابط موقع الخريطة (Google Maps Link)': getMapLink(item.points)
      });
    });

    // Sheet 2: ALL Segment ID elements list (item by item, including all duplicates)
    let itemCounter = 0;
    const rowsSheet2: any[] = [];
    segmentIdAnalysis.uniqueDetails.forEach((item) => {
      item.points.forEach((pt) => {
        itemCounter++;

        const ptProjectName = extractAttrValueLocal(
          [pt],
          ['PROJECTNAME', 'PROJECT_NAME', 'PROJECT NAME', 'ProjectName', 'اسم المشروع', 'المشروع'],
          [
            /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
            /(?:PROJECTNAME|PROJECT_NAME|PROJECT\s*NAME|اسم\s*المشروع|المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
          ]
        ) || item.projectName || '';

        const ptProjectId = extractAttrValueLocal(
          [pt],
          ['PROJECTID', 'PROJECT_ID', 'PROJECT ID', 'ProjectId', 'رقم المشروع', 'رمز المشروع', 'كود المشروع'],
          [
            /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
            /(?:PROJECTID|PROJECT_ID|PROJECT\s*ID|رقم\s*المشروع|رمز\s*المشروع|كود\s*المشروع)\s*[:=]\s*([^\r\n,;<>&|]+)/i
          ]
        ) || item.projectId || '';

        const ptContractor = extractAttrValueLocal(
          [pt],
          ['CONTRACTOR', 'Contractor', 'المقاول', 'اسم المقاول', 'المقاول المنفذ', 'CONTRACTOR_NAME', 'CONTRACTORNAME'],
          [
            /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i,
            /(?:CONTRACTOR|Contractor|المقاول|اسم\s*المقاول)\s*[:=]\s*([^\r\n,;<>&|]+)/i
          ]
        ) || item.contractor || '';

        let len = pt.originalLength || 0;
        if (len === 0 && pt.type === 'LineString' && pt.path) {
          len = calculatePathLength(pt.path);
        }

        const startX = (pt.path && pt.path.length > 0) ? pt.path[0].x : pt.x;
        const startY = (pt.path && pt.path.length > 0) ? pt.path[0].y : pt.y;
        const endX = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].x : pt.x;
        const endY = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].y : pt.y;

        const rowData: Record<string, any> = {
          'PROJECTNAME': ptProjectName,
          'PROJECTID': formatProjectIdForExcel(ptProjectId),
          'CONTRACTOR': ptContractor,
          'م': itemCounter,
          'Segment ID': item.idValue,
          [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
          [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
          [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
          [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
          'الطول (متر)': len ? len.toFixed(2) : '0.00',
          'رابط موقع الخريطة (Google Maps Link)': getMapLink([pt])
        };
        rowsSheet2.push(rowData);
      });
    });

    const workbook = XLSX.utils.book_new();

    const worksheet1 = XLSX.utils.json_to_sheet(rowsSheet1);
    XLSX.utils.book_append_sheet(workbook, worksheet1, lang === 'ar' ? 'ملخص_Segment_ID' : 'Segment_ID_Summary');

    const worksheet2 = XLSX.utils.json_to_sheet(rowsSheet2);
    XLSX.utils.book_append_sheet(workbook, worksheet2, lang === 'ar' ? 'جميع_قيم_Segment_ID' : 'All_Segment_IDs');

    XLSX.writeFile(workbook, `Segment_ID_Analysis_Report_${Date.now()}.xlsx`);
  };

  const permitNoAnalysis = useMemo(() => {
    const pointsToAnalyze = getPointsToCheck();
    if (!pointsToAnalyze || pointsToAnalyze.length === 0) return null;

    const stripHtml = (html: any): string => {
      if (!html) return '';
      return String(html)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
    };

    const isValidValue = (val: any, keyName?: string): boolean => {
      if (val === undefined || val === null) return false;
      const cleanStr = stripHtml(val);
      if (!cleanStr) return false;
      if (!/[a-zA-Z0-9\u0600-\u06FF]/.test(cleanStr)) return false;
      const lower = String(cleanStr || '').toLowerCase();
      const emptyValues = new Set([
        '0', '0.0', '00', '000', 'null', 'undefined', 'none', '-', '--', '---', '_', '=',
        'n/a', 'na', 'no', 'false', 'unknown', 'nil', 'empty', '[empty]', '<null>', '<empty>',
        'no data', 'nodata', 'no_data', 'not available', 'not applicable',
        'غير محدد', 'لا يوجد', 'لايوجد', 'بدون', 'غير متاح', 'غير متوفر', 'لا يوجد بيان',
        'لاشيء', 'لا شيء', 'صفر', 'معدوم', 'غير معروف'
      ]);
      if (emptyValues.has(lower)) return false;

      const labelValues = new Set([
        'permit no', 'permit_no', 'permitno', 'permit', 'permit id', 'permit_id', 'permitid',
        'رقم الترخيص', 'رقم ترخيص', 'الترخيص', 'رقم الرخصة', 'رقم رخصة', 'الرخصة', 'ترخيص',
        'رقم التصريح', 'رقم تصريح', 'التصريح', 'تصريح'
      ]);
      if (labelValues.has(lower)) return false;

      if (keyName && lower === String(stripHtml(keyName) || '').toLowerCase()) return false;
      if (/^(feature|line|polyline|point|layer|element|shape|object)[\s_#-]*\d+$/i.test(cleanStr)) return false;
      return true;
    };

    const normalizeKey = (key: string): string => String(key || '').toLowerCase().replace(/[\s_#-]/g, '');

    const isPermitKey = (key: string): boolean => {
      const norm = normalizeKey(key);
      if (!norm) return false;
      const permitKeys = new Set([
        'permitno', 'permitid', 'permit_no', 'permit_id', 'permit', 'permitnumber', 'permitnum', 'permitcode', 'permitref',
        'licenseno', 'licenceno', 'license', 'licence', 'licenseid', 'licenceid',
        'رقمالترخيص', 'رقمترخيص', 'الترخيص', 'رقمالرخصة', 'رقمرخصة', 'كودالترخيص', 'معرفالترخيص',
        'رقمالتصريح', 'رقمتصريح', 'التصريح', 'تصريح', 'ترخيص', 'رخصة'
      ]);
      if (permitKeys.has(norm)) return true;
      return (
        norm.includes('permit') ||
        norm.includes('license') ||
        norm.includes('licence') ||
        norm.includes('ترخيص') ||
        norm.includes('رخصة') ||
        norm.includes('تصريح')
      );
    };

    const extractPermitNoFromDescription = (description?: string): string | null => {
      if (!description) return null;
      const tableCellRegex = /<tr[^>]*>\s*<t[dh][^>]*>(?:\s*|&nbsp;)*(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)(?:\s*|&nbsp;)*<\/t[dh]>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>\s*<\/tr>/i;
      const tableMatch = description.match(tableCellRegex);
      if (tableMatch && tableMatch[1]) {
        const val = stripHtml(tableMatch[1]);
        if (isValidValue(val, 'permit no')) return val;
      }
      const textRegex = /(?:permit\s*no|permit_no|permit\s*id|permit\s*num|permit\s*number|permit\s*code|permit\s*ref|permit|license\s*no|licence\s*no|license|licence|رقم\s*الترخيص|كود\s*الترخيص|رقم\s*الرخصة|رقم\s*التصريح|الترخيص|التصريح|تصريح)\s*[:=]\s*([^\r\n,;<>&|/]+)/i;
      const textMatch = description.match(textRegex);
      if (textMatch && textMatch[1]) {
        const val = stripHtml(textMatch[1]);
        if (isValidValue(val, 'permit no')) return val;
      }
      return null;
    };

    const mapByPermitId = new Map<string, {
      count: number;
      totalLength: number;
      points: GeoPoint[];
      projectNames: Set<string>;
      projectIds: Set<string>;
      contractors: Set<string>;
    }>();

    let validCount = 0;
    let totalLengthWithPermitNo = 0;

    for (const pt of pointsToAnalyze) {
      let foundVal: string | null = null;
      if (pt.attributes) {
        for (const [key, val] of Object.entries(pt.attributes)) {
          if (isPermitKey(key) && isValidValue(val, key)) {
            foundVal = stripHtml(val);
            break;
          }
        }
      }
      if (!foundVal && pt.description) {
        foundVal = extractPermitNoFromDescription(pt.description);
      }

      if (foundVal) {
        const cleanedId = foundVal.trim();
        validCount++;
        const len = calculatePathLength(pt.path, pt.attributes) || 0;
        totalLengthWithPermitNo += len;

        let entry = mapByPermitId.get(cleanedId);
        if (!entry) {
          entry = {
            count: 0,
            totalLength: 0,
            points: [],
            projectNames: new Set(),
            projectIds: new Set(),
            contractors: new Set()
          };
          mapByPermitId.set(cleanedId, entry);
        }
        entry.count++;
        entry.totalLength += len;
        entry.points.push(pt);

        if (pt.attributes) {
          for (const [k, v] of Object.entries(pt.attributes)) {
            const kn = String(k).toLowerCase();
            const strV = String(v).trim();
            if (!strV) continue;
            if (kn.includes('project_name') || kn.includes('projectname') || kn.includes('اسم_المشروع') || kn.includes('المشروع')) {
              entry.projectNames.add(strV);
            }
            if (kn.includes('project_id') || kn.includes('projectid') || kn.includes('رقم_المشروع')) {
              entry.projectIds.add(strV);
            }
            if (kn.includes('contractor') || kn.includes('مقاول') || kn.includes('المقاول')) {
              entry.contractors.add(strV);
            }
          }
        }
      }
    }

    const uniqueDetails = Array.from(mapByPermitId.entries()).map(([idValue, data]) => {
      const statusBreakdown: Record<string, { count: number; totalLength: number }> = {
        executed_water: { count: 0, totalLength: 0 },
        executed_sewer: { count: 0, totalLength: 0 },
        in_progress: { count: 0, totalLength: 0 },
        remaining: { count: 0, totalLength: 0 },
        cancelled: { count: 0, totalLength: 0 },
      };

      data.points.forEach(pt => {
        const len = calculatePathLength(pt.path, pt.attributes) || 0;
        const statusCat = matchStatusByColor(pt.color || '#a52714');
        if (statusBreakdown[statusCat.key]) {
          statusBreakdown[statusCat.key].count++;
          statusBreakdown[statusCat.key].totalLength += len;
        }
      });

      let primaryCat = STATUS_CATEGORIES[3];
      let maxLen = -1;
      for (const cat of STATUS_CATEGORIES) {
        if (statusBreakdown[cat.key].totalLength > maxLen) {
          maxLen = statusBreakdown[cat.key].totalLength;
          primaryCat = cat;
        }
      }
      if (maxLen <= 0 && data.points.length > 0) {
        primaryCat = matchStatusByColor(data.points[0].color || '#a52714');
      }

      return {
        idValue,
        count: data.count,
        totalLength: data.totalLength,
        points: data.points,
        projectName: Array.from(data.projectNames).join(', '),
        projectId: Array.from(data.projectIds).join(', '),
        contractor: Array.from(data.contractors).join(', '),
        primaryColor: primaryCat.color,
        primaryStatusKey: primaryCat.key,
        primaryStatusNameAr: primaryCat.nameAr,
        primaryStatusNameEn: primaryCat.nameEn,
        statusBreakdown
      };
    }).sort((a, b) => b.count - a.count);

    return {
      totalElements: pointsToAnalyze.length,
      validElementsCount: validCount,
      uniquePermitNosCount: uniqueDetails.length,
      totalLengthWithPermitNo,
      uniqueDetails
    };
  }, [globalPoints, plannedStreets, activeTab, activeFile, analyzerNetworkType]);

  const highlightSpecificPermitNo = (pts: GeoPoint[]) => {
    if (!pts || pts.length === 0) return;
    const ptIds = new Set(pts.map(p => p.id));
    setGlobalPoints(prev => prev.map(pt => ptIds.has(pt.id) ? { ...pt, color: '#FFD700' } : pt));
    setPlannedStreets(prev => prev.map(pt => ptIds.has(pt.id) ? { ...pt, color: '#FFD700' } : pt));
    setStatusMessage(lang === 'ar' ? `تم إبراز ${pts.length} عناصر لرقم الترخيص (Permit No) المحدد على الخريطة باللون الذهبي` : `Highlighted ${pts.length} elements for selected Permit No in gold`);
  };

  const exportPermitNoReportExcel = () => {
    if (!permitNoAnalysis || permitNoAnalysis.uniqueDetails.length === 0) return;

    const getMapLink = (pts: GeoPoint[]): string => {
      if (!pts || pts.length === 0) return '';
      const firstPt = pts[0];
      let lat = firstPt.y;
      let lon = firstPt.x;
      if ((!lat || !lon) && firstPt.path && firstPt.path.length > 0) {
        lat = firstPt.path[0].y;
        lon = firstPt.path[0].x;
      }
      if (!lat || !lon) return '';
      return `https://www.google.com/maps?q=${lat},${lon}`;
    };

    const extractAttrValueLocal = (points: GeoPoint[], keyCandidates: string[], regexCandidates: RegExp[]): string => {
      const foundSet = new Set<string>();
      for (const pt of points) {
        if (pt.attributes) {
          for (const [k, v] of Object.entries(pt.attributes)) {
            const kn = String(k).toLowerCase();
            if (keyCandidates.some(c => kn.includes(c))) {
              const strV = String(v).trim();
              if (strV) foundSet.add(strV);
            }
          }
        }
        if (pt.description) {
          for (const rx of regexCandidates) {
            const m = pt.description.match(rx);
            if (m && m[1]) {
              const val = String(m[1]).replace(/<[^>]+>/g, '').trim();
              if (val) foundSet.add(val);
            }
          }
        }
      }
      return Array.from(foundSet).join(' | ');
    };

    const rowsSheet1 = permitNoAnalysis.uniqueDetails.map((item, index) => {
      const pName = item.projectName || extractAttrValueLocal(item.points, ['project_name', 'projectname', 'اسم_المشروع', 'المشروع'], [/اسم\s*المشروع\s*[:=]\s*([^<\r\n]+)/i]);
      const pId = item.projectId || extractAttrValueLocal(item.points, ['project_id', 'projectid', 'رقم_المشروع'], [/رقم\s*المشروع\s*[:=]\s*([^<\r\n]+)/i]);
      const contractor = item.contractor || extractAttrValueLocal(item.points, ['contractor', 'مقاول', 'المقاول'], [/المقاول\s*[:=]\s*([^<\r\n]+)/i]);
      const zone = cleanZoneValue(extractAttrValueLocal(item.points, ['zone', 'المنطقة', 'منطقة'], [/المنطقة\s*[:=]\s*([^<\r\n]+)/i]));
      const street = extractAttrValueLocal(item.points, ['street', 'الشارع', 'اسم الشارع', 'streetname'], [/الشارع\s*[:=]\s*([^<\r\n]+)/i]);
      const mapUrl = getMapLink(item.points);

      const firstPt = item.points[0];
      const lastPt = item.points[item.points.length - 1];
      const startX = (firstPt && firstPt.path && firstPt.path.length > 0) ? firstPt.path[0].x : (firstPt?.x || 0);
      const startY = (firstPt && firstPt.path && firstPt.path.length > 0) ? firstPt.path[0].y : (firstPt?.y || 0);
      const endX = (lastPt && lastPt.path && lastPt.path.length > 0) ? lastPt.path[lastPt.path.length - 1].x : (lastPt?.x || 0);
      const endY = (lastPt && lastPt.path && lastPt.path.length > 0) ? lastPt.path[lastPt.path.length - 1].y : (lastPt?.y || 0);

      return {
        '#': index + 1,
        'Permit No': item.idValue,
        [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
        [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
        [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
        [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
        [lang === 'ar' ? 'عدد العناصر' : 'Items Count']: item.count,
        [lang === 'ar' ? 'إجمالي الطول (متر)' : 'Total Length (m)']: Math.round(item.totalLength),
        [lang === 'ar' ? 'إجمالي الطول (كم)' : 'Total Length (km)']: Number((item.totalLength / 1000).toFixed(3)),
        [lang === 'ar' ? 'اسم المشروع' : 'Project Name']: pName || '-',
        [lang === 'ar' ? 'رقم المشروع' : 'Project ID']: formatProjectIdForExcel(pId) || '-',
        [lang === 'ar' ? 'المقاول' : 'Contractor']: contractor || '-',
        [lang === 'ar' ? 'المنطقة' : 'Zone']: zone || '-',
        [lang === 'ar' ? 'الشارع' : 'Street']: street || '-',
        [lang === 'ar' ? 'رابط الموقع على الخريطة' : 'Map Link']: mapUrl
      };
    });

    const allPointsWithPermit = getPointsToCheck().filter(pt => {
      if (pt.attributes) {
        for (const [k, v] of Object.entries(pt.attributes)) {
          if (String(k).toLowerCase().replace(/[\s_#-]/g, '').includes('permit') && String(v).trim()) return true;
        }
      }
      return pt.description && /permit/i.test(pt.description);
    });

    const rowsSheet2 = allPointsWithPermit.map((pt, index) => {
      let permitVal = '';
      if (pt.attributes) {
        for (const [k, v] of Object.entries(pt.attributes)) {
          if (String(k).toLowerCase().replace(/[\s_#-]/g, '').includes('permit') && String(v).trim()) {
            permitVal = String(v).trim();
            break;
          }
        }
      }
      const len = calculatePathLength(pt.path, pt.attributes) || 0;

      const startX = (pt.path && pt.path.length > 0) ? pt.path[0].x : pt.x;
      const startY = (pt.path && pt.path.length > 0) ? pt.path[0].y : pt.y;
      const endX = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].x : pt.x;
      const endY = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].y : pt.y;

      const rowData: Record<string, any> = {
        '#': index + 1,
        [lang === 'ar' ? 'اسم العنصر' : 'Name']: pt.name || `Point ${index + 1}`,
        'Permit No': permitVal,
        [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'LineString',
        [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
        [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
        [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
        [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
        [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: Math.round(len),
        [lang === 'ar' ? 'الشارع' : 'Street']: pt.street || pt.attributes?.STREETNAME || pt.attributes?.street || '-',
        [lang === 'ar' ? 'الحي' : 'District']: pt.district || pt.attributes?.DISTRICT || pt.attributes?.district || '-',
        [lang === 'ar' ? 'الرابط' : 'Link']: `https://www.google.com/maps?q=${pt.y},${pt.x}`
      };
      return rowData;
    });

    const workbook = XLSX.utils.book_new();

    const worksheet1 = XLSX.utils.json_to_sheet(rowsSheet1);
    XLSX.utils.book_append_sheet(workbook, worksheet1, lang === 'ar' ? 'ملخص_Permit_No' : 'Permit_No_Summary');

    const worksheet2 = XLSX.utils.json_to_sheet(rowsSheet2);
    XLSX.utils.book_append_sheet(workbook, worksheet2, lang === 'ar' ? 'جميع_قيم_Permit_No' : 'All_Permit_Nos');

    XLSX.writeFile(workbook, `Permit_No_Analysis_Report_${Date.now()}.xlsx`);
  };

  const wMainlineStats = useMemo(() => {
    const pointsToProcess = (!activeFile ? (plannedStreets || []) : (globalPoints || []));
    const segments = pointsToProcess.filter(p => p && p.type === 'LineString' && !isBlackLine(p) && p.layer && String(p.layer || '').toUpperCase().includes('W_MAINLINE'));

    let totalLength = 0;
    const materialCounts: Record<string, number> = {};
    const materialLengths: Record<string, number> = {};
    const diameterLengths: Record<string, number> = {};

    segments.forEach(pt => {
        let len = pt.originalLength || 0;
        if (len === 0 && pt.type === 'LineString' && pt.path) {
            len = calculatePathLength(pt.path);
        }
        totalLength += len;

        let material = 'Ductile Iron (DI)';
        const descLower = String(pt.description || '').toLowerCase();
        const idLower = String(pt.id || '').toLowerCase();
        const attr1Lower = String(pt.attr1 || '').toLowerCase();

        if (descLower.includes('hdpe') || idLower.includes('hdpe') || attr1Lower.includes('hdpe')) {
            material = 'HDPE';
        } else if (descLower.includes('carbon steel') || descLower.includes('cs') || idLower.includes('cs') || attr1Lower.includes('cs') || descLower.includes('حديد')) {
            material = 'Carbon Steel (CS)';
        } else if (descLower.includes('pvc') || idLower.includes('pvc') || attr1Lower.includes('pvc') || descLower.includes('بلاستيك')) {
            material = 'uPVC';
        }

        materialCounts[material] = (materialCounts[material] || 0) + 1;
        materialLengths[material] = (materialLengths[material] || 0) + len;

        let diameter = '300mm';
        const diaMatch = descLower.match(/(\d+)\s*(mm|inch)/i) || idLower.match(/(\d+)\s*(mm|inch)/i) || attr1Lower.match(/(\d+)\s*(mm|inch)/i) || (pt.attr2 || '').match(/(\d+)\s*(mm|inch)/i);
        if (diaMatch) {
            diameter = `${diaMatch[1]}mm`;
        } else if (descLower.includes('600') || idLower.includes('600')) {
            diameter = '600mm';
        } else if (descLower.includes('400') || idLower.includes('400')) {
            diameter = '400mm';
        } else if (descLower.includes('200') || idLower.includes('200')) {
            diameter = '200mm';
        }

        diameterLengths[diameter] = (diameterLengths[diameter] || 0) + len;
    });

    return {
        segments,
        totalLength,
        count: segments.length,
        materialCounts,
        materialLengths,
        diameterLengths
    };
  }, [activeFile, plannedStreets, globalPoints]);

  const wwMainlineStats = useMemo(() => {
    const pointsToProcess = (!activeFile ? (plannedStreets || []) : (globalPoints || []));
    const segments = pointsToProcess.filter(p => p && p.type === 'LineString' && !isBlackLine(p) && p.layer && (
        String(p.layer || '').toUpperCase().includes('WW_MAINLINE') ||
        String(p.layer || '').toUpperCase().includes('S_GRAVITY_MAIN') ||
        String(p.layer || '').toUpperCase().includes('SEWER') ||
        String(p.layer || '').toUpperCase().includes('WASTEWATER')
    ));

    let totalLength = 0;
    const materialCounts: Record<string, number> = {};
    const materialLengths: Record<string, number> = {};
    const diameterLengths: Record<string, number> = {};

    segments.forEach(pt => {
        let len = pt.originalLength || 0;
        if (len === 0 && pt.type === 'LineString' && pt.path) {
            len = calculatePathLength(pt.path);
        }
        totalLength += len;

        let material = 'uPVC';
        const descLower = String(pt.description || '').toLowerCase();
        const idLower = String(pt.id || '').toLowerCase();
        const attr1Lower = String(pt.attr1 || '').toLowerCase();

        if (descLower.includes('clay') || descLower.includes('vc') || idLower.includes('vc') || attr1Lower.includes('clay') || descLower.includes('فخار')) {
            material = 'Vitrified Clay (VC)';
        } else if (descLower.includes('concrete') || descLower.includes('co') || descLower.includes('rc') || idLower.includes('co') || descLower.includes('خرسانة')) {
            material = 'Concrete (CO)';
        } else if (descLower.includes('grp') || idLower.includes('grp') || descLower.includes('ألياف')) {
            material = 'GRP';
        } else if (descLower.includes('hdpe') || idLower.includes('hdpe') || descLower.includes('بولي')) {
            material = 'HDPE';
        } else if (descLower.includes('pvc') || idLower.includes('pvc') || attr1Lower.includes('pvc') || descLower.includes('بلاستيك')) {
            material = 'uPVC';
        }

        materialCounts[material] = (materialCounts[material] || 0) + 1;
        materialLengths[material] = (materialLengths[material] || 0) + len;

        let diameter = '300mm';
        const diaMatch = descLower.match(/(\d+)\s*(mm|inch)/i) || idLower.match(/(\d+)\s*(mm|inch)/i) || attr1Lower.match(/(\d+)\s*(mm|inch)/i) || (pt.attr2 || '').match(/(\d+)\s*(mm|inch)/i);
        if (diaMatch) {
            diameter = `${diaMatch[1]}mm`;
        } else if (descLower.includes('500') || idLower.includes('500')) {
            diameter = '500mm';
        } else if (descLower.includes('400') || idLower.includes('400')) {
            diameter = '400mm';
        } else if (descLower.includes('300') || idLower.includes('300')) {
            diameter = '300mm';
        } else if (descLower.includes('200') || idLower.includes('200')) {
            diameter = '200mm';
        }

        diameterLengths[diameter] = (diameterLengths[diameter] || 0) + len;
    });

    return {
        segments,
        totalLength,
        count: segments.length,
        materialCounts,
        materialLengths,
        diameterLengths
    };
  }, [activeFile, plannedStreets, globalPoints]);

  const downloadExcelAnalysis = (ptsToExportParam?: GeoPoint[]) => {
    if (globalPoints.length === 0 && plannedStreets.length === 0 && (!ptsToExportParam || ptsToExportParam.length === 0)) return;

    const workbook = XLSX.utils.book_new();

    if (activeTab === 'converter' && activeFile && (activeFile.type === 'excel' || activeFile.type === 'csv')) {
        const originalHeaders = activeFile.headers || [];
        const pts = ptsToExportParam || globalPoints;

        const combinedData = pts.map((pt, idx) => {
            const lat = pt ? pt.y : 0;
            const lon = pt ? pt.x : 0;
            const street = pt ? (pt.street || '') : '';
            const district = pt ? (pt.district || '') : '';
            const link = pt ? `https://www.google.com/maps?q=${lat},${lon}` : '';

            const rowObj: any = {};
            const row = (pt as any).originalRow || activeFile.data[idx] || [];

            originalHeaders.forEach((h, i) => {
                if (selectedHeaders.includes(h)) {
                    const hLower = String(h || '').toLowerCase();
                    if (streetMappingCol === h && pt && pt.street) {
                        rowObj[h] = pt.street;
                    } else if (districtMappingCol === h && pt && pt.district) {
                        rowObj[h] = pt.district;
                    } else if (!streetMappingCol && ['streetname', 'street', 'الشارع', 'اسم الشارع'].includes(hLower) && pt && pt.street) {
                        rowObj[h] = pt.street;
                    } else if (!districtMappingCol && ['district', 'الحي'].includes(hLower) && pt && pt.district) {
                        rowObj[h] = pt.district;
                    } else {
                        rowObj[h] = row[i];
                    }
                }
            });

            rowObj[lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)'] = lat;
            rowObj[lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)'] = lon;
            
            if (!streetMappingCol) {
                rowObj[lang === 'ar' ? 'الشارع' : 'Street'] = street;
            }
            if (!districtMappingCol) {
                rowObj[lang === 'ar' ? 'الحي' : 'District'] = district;
            }
            
            rowObj[lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link'] = link;

            return rowObj;
        });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(combinedData), lang === 'ar' ? "البيانات المحولة كاملة" : "Full Converted Data");
    } else {
        const rawExport = ptsToExportParam || ((activeTab === 'street-planner')
            ? [...globalPoints, ...plannedStreets]
            : (activeTab === 'analyzer' && !activeFile ? plannedStreets : globalPoints));
        const pointsToExport = rawExport.filter(pt => !isBlackLine(pt));

        const detailedData = pointsToExport.map(pt => {
            const lat = pt.y;
            const lon = pt.x;
            const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
            let elementLength = pt.originalLength || 0;
            if (elementLength === 0 && pt.path) elementLength = calculatePathLength(pt.path);

            const startX = (pt.path && pt.path.length > 0) ? pt.path[0].x : lon;
            const startY = (pt.path && pt.path.length > 0) ? pt.path[0].y : lat;
            const endX = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].x : lon;
            const endY = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].y : lat;

            const rowObj: Record<string, any> = {
                [lang === 'ar' ? 'اسم الملف' : 'File Name']: activeFile?.filename || '',
                [lang === 'ar' ? 'المعرف' : 'ID']: pt.id,
                [lang === 'ar' ? 'الشارع' : 'Street']: pt.street || '',
                [lang === 'ar' ? 'الحي' : 'District']: pt.district || '',
                [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'Point',
                [lang === 'ar' ? 'الطبقة' : 'Layer']: pt.layer || 'Default',
                [lang === 'ar' ? 'اللون' : 'Color']: pt.color || '#dcb13c',
                [lang === 'ar' ? 'خط العرض (Y)' : 'Latitude (Y)']: lat,
                [lang === 'ar' ? 'خط الطول (X)' : 'Longitude (X)']: lon,
                [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
                [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
                [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
                [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
                [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: elementLength > 0 ? elementLength.toFixed(2) : '-',
                [lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link']: googleMapsLink
            };

            // Unpack pt.attributes and pt.description key-value pairs as individual columns
            const extracted = extractAllPointAttributes(pt);
            Object.entries(extracted).forEach(([k, v]) => {
                if (rowObj[k] === undefined) {
                    rowObj[k] = v;
                }
            });

            // Clean residual description text if not purely key-value pairs
            if (pt.description) {
                const parsed = parseDescriptionToAttributes(pt.description);
                if (Object.keys(parsed).length === 0) {
                    rowObj[lang === 'ar' ? 'الوصف' : 'Description'] = stripHtml(pt.description);
                }
            }

            return rowObj;
        });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailedData), lang === 'ar' ? "بيانات العناصر" : "Elements Data");

        if (activeTab === 'analyzer') {
            const summaryData = analysisData.map(d => ({
                [lang === 'ar' ? 'اللون (كود)' : 'Color (Hex)']: d.color,
                [lang === 'ar' ? 'إجمالي الطول (م)' : 'Total Length (m)']: d.totalLength.toFixed(2),
                [lang === 'ar' ? 'إجمالي الطول (كم)' : 'Total Length (km)']: (d.totalLength / 1000).toFixed(3),
                [lang === 'ar' ? 'عدد العناصر' : 'Elements Count']: d.count,
                [lang === 'ar' ? 'النسبة المئوية (%)' : 'Percentage (%)']: d.percentage.toFixed(2)
            }));
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), lang === 'ar' ? "ملخص التحليل" : "Summary Analysis");

            if (detectedNetworkGaps && detectedNetworkGaps.length > 0) {
              const gapRows = detectedNetworkGaps.map((gap, index) => ({
                '#': index + 1,
                [lang === 'ar' ? 'معرف الخط المقطوع' : 'Line ID']: gap.lineId,
                [lang === 'ar' ? 'الطبقة' : 'Layer']: gap.layer || 'Default',
                [lang === 'ar' ? 'موقع الطرف المقطوع' : 'Endpoint Type']: gap.endpointType === 'start' ? (lang === 'ar' ? 'بداية الخط' : 'Line Start') : (lang === 'ar' ? 'نهاية الخط' : 'Line End'),
                [lang === 'ar' ? 'إحداثي بداية الفجوة (Y)' : 'Gap Start Lat (Y)']: gap.startCoord.y,
                [lang === 'ar' ? 'إحداثي بداية الفجوة (X)' : 'Gap Start Lon (X)']: gap.startCoord.x,
                [lang === 'ar' ? 'إحداثي نهاية الفجوة (Y)' : 'Gap End Lat (Y)']: gap.endCoord ? gap.endCoord.y : '-',
                [lang === 'ar' ? 'إحداثي نهاية الفجوة (X)' : 'Gap End Lon (X)']: gap.endCoord ? gap.endCoord.x : '-',
                [lang === 'ar' ? 'مسافة الفجوة (متر)' : 'Gap Distance (m)']: gap.gapDistanceMeters ? gap.gapDistanceMeters.toFixed(2) : '>35m',
                [lang === 'ar' ? 'معرف أقرب خط' : 'Nearest Line ID']: gap.nearestLineId || '-',
                [lang === 'ar' ? 'رابط خريطة بداية الفجوة' : 'Gap Start Map Link']: `https://www.google.com/maps?q=${gap.startCoord.y},${gap.startCoord.x}`
              }));
              XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(gapRows), lang === 'ar' ? "الفجوات الشبكية" : "Network Gaps");
            }
        }
    }

    XLSX.writeFile(workbook, `${activeTab === 'converter' ? 'Full_Converted' : 'Analysis'}_${activeFile?.filename.split('.')[0] || 'Report'}.xlsx`);
  };

  const handleReverseGeocodeGlobal = async () => {
    if (globalPoints.length === 0) {
      setError(lang === 'ar' ? 'لا توجد بيانات مرفوعة بعد! يرجى رفع ملف أو استيراد خريطة أولاً لجلب الشوارع والعناوين لها.' : 'No data points available to fetch streets. Please upload a file first.');
      return;
    }
    setLoading(true);
    setError(null);
    setProgressPercent(10);
    setStatusMessage(lang === 'ar' ? 'جاري بدء جلب الشوارع وتحليل العناوين الجغرافية...' : 'Starting street fetching & reverse geocoding...');
    await new Promise<void>(r => setTimeout(r, 120));

    try {
        const sitePolygon = globalPoints.find(p => p.type === 'Polygon' && p.path && p.path.length > 2);
        let queryArea: {x: number, y: number}[] = [];

        if (sitePolygon && sitePolygon.path) {
            queryArea = sitePolygon.path;
        } else {
            const allPoints: {x: number, y: number}[] = [];
            globalPoints.forEach(p => {
              if (p.path) p.path.forEach(v => allPoints.push({x: v.x, y: v.y}));
              else allPoints.push({x: p.x, y: p.y});
            });
            queryArea = calculateBoundingBox(allPoints);
        }

        if (queryArea.length > 0 && (!plannedStreets || plannedStreets.length === 0)) {
            setProgressPercent(18);
            setStatusMessage(lang === 'ar' ? 'جاري جلب شبكة الشوارع للمنطقة المحيطة من الخرائط...' : 'Fetching surrounding street network...');
            const buffered = bufferPolygon(queryArea, plannerBuffer);
            try {
                const streets = await fetchStreetsInPolygon(
                  buffered, 
                  plannerClip, 
                  streetTypeFilters,
                  (msg, pct) => {
                    setStatusMessage(msg);
                    setProgressPercent(Math.min(25, Math.max(15, Math.round(pct / 4))));
                  }
                );
                if (streets && streets.length > 0) {
                  setPlannedStreets(streets);
                }
            } catch (err: any) {
                console.error("Failed to fetch overpass streets:", err);
            }
        }

        const total = globalPoints.length;
        const updated = [...globalPoints];
        let successCount = 0;
        let lastResolvedDetail = "";
        const batchSize = geocodingMode === 'accurate' ? 2 : 5;

        for (let i = 0; i < total; i += batchSize) {
            const processed = Math.min(i + batchSize, total);
            const pct = Math.round(25 + ((processed / total) * 70));
            setProgressPercent(pct);

            const chunk = updated.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (pt, chunkIdx) => {
                const idx = i + chunkIdx;

                if (!pt.street || pt.street === "شارع غير معروف" || pt.street === "غير متوفر") {
                    try {
                        let targetY = pt.y;
                        let targetX = pt.x;
                        if ((!targetY || !targetX) && pt.path && pt.path.length > 0) {
                          targetY = pt.path[0].y;
                          targetX = pt.path[0].x;
                        }
                        if (targetY && targetX) {
                          const geoData = await getReverseGeocode(targetY, targetX, geocodingMode);
                          updated[idx] = { ...pt, street: geoData.street, district: geoData.district };
                          if (geoData.street && geoData.street !== "غير متوفر") {
                            successCount++;
                            lastResolvedDetail = `${geoData.street}${geoData.district && geoData.district !== 'غير متوفر' ? ` (${geoData.district})` : ''}`;
                          }
                        }
                    } catch (err) {}
                } else {
                    lastResolvedDetail = `${pt.street}${pt.district ? ` (${pt.district})` : ''}`;
                }
            }));

            const detailMsg = lastResolvedDetail 
              ? (lang === 'ar' ? `\n📍 الشارع المكتشف: ${lastResolvedDetail}` : `\n📍 Resolved: ${lastResolvedDetail}`) 
              : '';

            setStatusMessage(lang === 'ar'
              ? `جاري عنونة البيانات ومطابقة الشوارع (${processed} من ${total}) [${pct}%]${detailMsg}`
              : `Geocoding data & matching streets (${processed} of ${total}) [${pct}%]${detailMsg}`
            );

            setGlobalPoints([...updated]);
            if (i + batchSize < total) {
                await new Promise(r => setTimeout(r, 40));
            }
        }

        setProgressPercent(100);
        setStatusMessage(lang === 'ar'
          ? `تم جلب وتحديث الشوارع بنجاح! (${successCount} عنوان تم تحديده 🗺️)`
          : `Fetched & updated streets successfully! (${successCount} addresses resolved 🗺️)`
        );
        await new Promise(r => setTimeout(r, 800));
    } catch (e: any) {
        setError(e.message);
    } finally {
        setLoading(false);
        setProgressPercent(null);
        setTimeout(() => setStatusMessage(''), 4000);
    }
  };

  const downloadExcelWithStreets = async () => {
    const pointsToExport = activeTab === 'street-planner' ? [...globalPoints, ...plannedStreets] : globalPoints;
    if (pointsToExport.length === 0) return;

    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(lang === 'ar' ? 'جاري تحضير وتنسيق البيانات للتصدير...' : 'Preparing and formatting data for export...');
    await new Promise<void>(r => setTimeout(r, 120));

    const results: any[] = [];
    const total = pointsToExport.length;
    const batchSize = geocodingMode === 'accurate' ? 4 : 10;

    for (let i = 0; i < total; i += batchSize) {
        const processed = Math.min(i + batchSize, total);
        const pct = Math.round((processed / total) * 100);
        setProgressPercent(pct);
        setStatusMessage(lang === 'ar'
            ? `جاري جلب أسماء الشوارع والتنسيق (${geocodingMode === 'accurate' ? 'نمط دقيق 🎯' : 'نمط سريع ⚡'}): (${processed} من ${total})`
            : `Fetching Street Names (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'}): (${processed} of ${total})`
        );
        const chunk = pointsToExport.slice(i, i + batchSize);
        const chunkResults = await Promise.all(chunk.map(async (pt) => {
            let street = pt.street;
            let district = pt.district;

            if (!street || !district || street === "غير متوفر") {
              try {
                const geoData = await getReverseGeocode(pt.y, pt.x, geocodingMode);
                street = geoData.street;
                district = geoData.district;
              } catch (err) {}
            }

            const lat = pt.y;
            const lon = pt.x;
            const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
            let elementLength = pt.originalLength || 0;
            if (elementLength === 0 && pt.path) elementLength = calculatePathLength(pt.path);

            const startX = (pt.path && pt.path.length > 0) ? pt.path[0].x : lon;
            const startY = (pt.path && pt.path.length > 0) ? pt.path[0].y : lat;
            const endX = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].x : lon;
            const endY = (pt.path && pt.path.length > 0) ? pt.path[pt.path.length - 1].y : lat;

            const rowObj: Record<string, any> = {
                [lang === 'ar' ? 'اسم الملف' : 'File Name']: activeFile?.filename || '',
                [lang === 'ar' ? 'المعرف' : 'ID']: pt.id,
                [lang === 'ar' ? 'الشارع' : 'Street']: street || 'غير متوفر',
                [lang === 'ar' ? 'الحي' : 'District']: district || 'غير متوفر',
                [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'Point',
                [lang === 'ar' ? 'الطبقة' : 'Layer']: pt.layer || 'Default',
                [lang === 'ar' ? 'اللون' : 'Color']: pt.color || '#dcb13c',
                [lang === 'ar' ? 'خط العرض (Y)' : 'Latitude (Y)']: lat,
                [lang === 'ar' ? 'خط الطول (X)' : 'Longitude (X)']: lon,
                [lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X']: startX,
                [lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y']: startY,
                [lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X']: endX,
                [lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y']: endY,
                [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: elementLength > 0 ? elementLength.toFixed(2) : '-',
                [lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link']: googleMapsLink
            };

            const extracted = extractAllPointAttributes(pt);
            Object.entries(extracted).forEach(([k, v]) => {
                if (rowObj[k] === undefined) {
                    rowObj[k] = v;
                }
            });

            if (pt.description) {
                const parsed = parseDescriptionToAttributes(pt.description);
                if (Object.keys(parsed).length === 0) {
                    rowObj[lang === 'ar' ? 'الوصف' : 'Description'] = stripHtml(pt.description);
                }
            }

            return rowObj;
        }));
        results.push(...chunkResults);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(results), lang === 'ar' ? "بيانات الشوارع" : "Street Data");
    XLSX.writeFile(workbook, `Streets_Analysis_${activeFile?.filename.split('.')[0] || 'Report'}.xlsx`);

    setLoading(false);
    setStatusMessage('');
  };

  useEffect(() => {
    if (!activeFile) return;
    const processData = async () => {
      let points: GeoPoint[] = [];

      // 1. استخراج النقاط الخام بناءً على نوع الملف
      if (activeFile.type === 'excel' || activeFile.type === 'csv') {
        const xIdx = activeFile.headers?.indexOf(mapping.xColumn) ?? -1;
        const yIdx = activeFile.headers?.indexOf(mapping.yColumn) ?? -1;
        const idIdx = mapping.idColumn ? (activeFile.headers?.indexOf(mapping.idColumn) ?? -1) : -1;
        const linkIdx = mapping.linkColumn ? (activeFile.headers?.indexOf(mapping.linkColumn) ?? -1) : -1;
        const attr1Idx = mapping.attr1Column ? (activeFile.headers?.indexOf(mapping.attr1Column) ?? -1) : -1;

        points = activeFile.data.map((row, idx) => {
          let rawX = parseFloat(row[xIdx]);
          let rawY = parseFloat(row[yIdx]);

          if ((isNaN(rawX) || isNaN(rawY) || (rawX === 0 && rawY === 0)) && linkIdx !== -1) {
             const extracted = parseCoordinatesFromText(String(row[linkIdx]));
             if (extracted) {
                rawX = extracted.lon;
                rawY = extracted.lat;
             }
          }

          return {
            id: idIdx !== -1 ? String(row[idIdx]) : `PT_${idx + 1}`,
            x: isNaN(rawX) ? 0 : rawX,
            y: isNaN(rawY) ? 0 : rawY,
            type: 'Point',
            layer: attr1Idx !== -1 ? String(row[attr1Idx]) : 'Imported',
            description: linkIdx !== -1 ? String(row[linkIdx]) : '',
            color: '#dcb13c',
            originalRow: row
          };
        });
      } else if (activeFile.type === 'dxf') {
        points = extractPointsFromDXF(activeFile.data);
      } else if (activeFile.type === 'kmz') {
        points = activeFile.data;
      }

      // 2. تطبيق خيار تبديل الإحداثيات (Swap X/Y) إذا كان مفعلاً
      if (swapXY) {
        points = points.map(pt => ({
          ...pt,
          x: pt.y,
          y: pt.x,
          path: pt.path ? pt.path.map(v => ({ ...v, x: v.y, y: v.x })) : undefined
        }));
      }

      // 3. التحويل النهائي باستخدام نظام الإحداثيات المختار
      const sourceDef = COMMON_EPSG.find(e => e.code === sourceEPSG)?.def || sourceEPSG;
      const transformed = transformPoints(points, sourceDef);
      setGlobalPoints(transformed);
      const newFileId = `${activeFile.filename}-${Date.now()}`;
      setDataId(newFileId);
    };
    processData();
  }, [activeFile, mapping, sourceEPSG, swapXY, refreshKey]);

  const handleRefreshPreview = () => {
    setLoading(true);
    setProgressPercent(20);
    setStatusMessage(lang === 'ar' ? 'جاري تحديث المعاينة...' : 'Refreshing preview...');
    setTimeout(() => {
        setRefreshKey(prev => prev + 1);
        setProgressPercent(100);
        setTimeout(() => {
          setLoading(false);
          setProgressPercent(null);
          setStatusMessage('');
        }, 300);
    }, 400);
  };

  const handleFileUpload = async (input: React.ChangeEvent<HTMLInputElement> | File | React.DragEvent) => {
    let selectedFile: File | undefined;
    if (input instanceof File) {
      selectedFile = input;
    } else if ('dataTransfer' in input && (input as React.DragEvent).dataTransfer?.files?.[0]) {
      (input as React.DragEvent).preventDefault();
      selectedFile = (input as React.DragEvent).dataTransfer.files[0];
    } else if ('target' in input && (input as React.ChangeEvent<HTMLInputElement>).target?.files?.[0]) {
      selectedFile = (input as React.ChangeEvent<HTMLInputElement>).target.files![0];
    }
    if (!selectedFile) return;

    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? `جاري قراءة ومعالجة الملف (${selectedFile.name})...` : `Reading and parsing file (${selectedFile.name})...`);
    setAutoDetected(null);
    setError(null);
    
    // Allow UI to render the loading overlay popup before parsing blocks thread
    await new Promise<void>(r => setTimeout(r, 120));

    try {
      const fName = String(selectedFile.name || '').toLowerCase();
      let result: ParsedFile;
      const onProg = (pct: number) => setProgressPercent(Math.max(15, Math.min(80, pct)));
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile, onProg);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile, onProg);
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) result = await parseKMZ(selectedFile, onProg);
      else throw new Error(t.errors.unsupported);

      setProgressPercent(85);
      setStatusMessage(lang === 'ar' ? 'جاري تجهيز البيانات وعرضها على الخريطة...' : 'Preparing data and rendering on map...');
      await new Promise<void>(r => setTimeout(r, 80));

      setActiveFile(result);
      const newFileId = `${result.filename}-${Date.now()}`;
      setDataId(newFileId);

      let detected: string | null = null;
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) {
        detected = identifyPotentialCRS(fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data);
      } else if (result.suggestedMapping?.xColumn && result.data.length > 0) {
          const xIdx = result.headers?.indexOf(result.suggestedMapping.xColumn) ?? -1;
          const yIdx = result.headers?.indexOf(result.suggestedMapping.yColumn) ?? -1;
          if (xIdx !== -1 && yIdx !== -1) {
            const samplePoint: GeoPoint = { id: 'test', x: parseFloat(result.data[0][xIdx]), y: parseFloat(result.data[0][yIdx]) };
            detected = identifyPotentialCRS([samplePoint]);
          }
      }
      if (detected) { setSourceEPSG(detected); setAutoDetected(COMMON_EPSG.find(c => c.code === detected)?.name || detected); }
      if (result.suggestedMapping) setMapping(prev => ({ ...prev, ...result.suggestedMapping }));

      try {
        let displayPts: GeoPoint[] = [];
        if (fName.endsWith('.dxf')) {
            displayPts = extractPointsFromDXF(result.data);
        } else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) {
            displayPts = result.data;
        } else if ((fName.endsWith('.xlsx') || fName.endsWith('.csv')) && result.suggestedMapping?.xColumn && result.suggestedMapping?.yColumn) {
            const xIdx = result.headers?.indexOf(result.suggestedMapping.xColumn) ?? -1;
            const yIdx = result.headers?.indexOf(result.suggestedMapping.yColumn) ?? -1;
            const idIdx = result.suggestedMapping.idColumn ? (result.headers?.indexOf(result.suggestedMapping.idColumn) ?? -1) : -1;
            if (xIdx !== -1 && yIdx !== -1) {
                displayPts = result.data.map((row: any, idx: number) => ({
                    id: idIdx !== -1 ? String(row[idIdx]) : `PT_${idx + 1}`,
                    x: parseFloat(row[xIdx]) || 0,
                    y: parseFloat(row[yIdx]) || 0,
                    type: 'Point',
                    layer: 'Imported',
                    color: '#dcb13c',
                    originalRow: row
                }));
            }
        }
        
        if (displayPts.length > 0) {
            let transformedPts = displayPts;
            if (detected) {
                const def = COMMON_EPSG.find(e => e.code === detected)?.def || detected;
                transformedPts = transformPoints(displayPts, def);
            }
            setGlobalPoints(transformedPts);
        }
      } catch (e) {
         console.warn("Failed to auto-display points on map", e);
      }
      setProgressPercent(100);
      setStatusMessage(lang === 'ar' ? `تمت معالجة وتحميل الملف (${result.filename}) بنجاح! 🗺️` : `File processed and loaded (${result.filename}) successfully! 🗺️`);
      await new Promise<void>(r => setTimeout(r, 600));
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      if ('target' in input && (input as React.ChangeEvent<HTMLInputElement>).target) {
        try { (input as React.ChangeEvent<HTMLInputElement>).target.value = ''; } catch(e){}
      }
      setLoading(false);
      setProgressPercent(null);
    }
  };

  const handleLoadMyMapsLink = async () => {
    const trimmed = mapsLink.trim();
    if (!trimmed) return;
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(lang === 'ar' ? "جاري الاتصال بجوجل مابس وجلب البيانات..." : "Connecting to Google Maps & fetching data...");
    setAutoDetected(null);
    setError(null);
    
    // Yield to allow browser to render the global progress modal overlay
    await new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))); });

    try {
      const result = await fetchMyMapsKML(trimmed, (pct) => {
        setProgressPercent(pct);
        if (pct < 50) {
          setStatusMessage(lang === 'ar' ? `جاري تنزيل ملف الخريطة من جوجل [${pct}%]...` : `Downloading map file from Google [${pct}%]...`);
        } else if (pct < 90) {
          setStatusMessage(lang === 'ar' ? `جاري تحليل الطبقات والروابط الشبكية [${pct}%]...` : `Parsing layers & network links [${pct}%]...`);
        } else {
          setStatusMessage(lang === 'ar' ? `جاري إنشاء العناصر على الخريطة [${pct}%]...` : `Building map geometries [${pct}%]...`);
        }
      });

      setActiveFile(result);
      let parsedPoints: GeoPoint[] = result.data;
      setGlobalPoints(parsedPoints);
      setDataId(`mymaps-${Date.now()}`);

      setProgressPercent(100);
      setStatusMessage(lang === 'ar' ? 'تم جلب وتحميل الخريطة بنجاح!' : 'Map fetched and loaded successfully!');
      await new Promise<void>(r => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400))); });
      setLoading(false);
      setProgressPercent(null);
      setTimeout(() => setStatusMessage(''), 2500);
    } catch (err: any) {
      setLoading(false);
      setProgressPercent(null);
      setStatusMessage('');
      setError(err?.message || (lang === 'ar' ? "حدث خطأ أثناء تحميل الخريطة." : "Error loading map."));
    }
  };

  const handleSplitExport = async () => {
    if (globalPoints.length === 0) return;
    setLoading(true); setStatusMessage("جاري معالجة وتقسيم البيانات...");
    try {
      let processedPoints = [...globalPoints];
      if (separateMulti) {
        let exploded: GeoPoint[] = [];
        processedPoints.forEach(p => exploded.push(p));
        processedPoints = exploded;
      }
      if (splitIntersections) {
        processedPoints = splitLinesAtIntersections(processedPoints);
      }
      if (splitLines) {
        let temp: GeoPoint[] = [];
        processedPoints.forEach(p => {
          if (p.type === 'LineString' && p.path) {
            const segments = splitLineString(p.path, maxLen);
            segments.forEach((seg, i) => temp.push({ ...p, id: segments.length > 1 ? `${p.id} [${i+1}]` : p.id, path: seg }));
          } else { temp.push(p); }
        });
        processedPoints = temp;
      }

      let groups: { name: string, points: GeoPoint[] }[] = [];
      if (splitMode === 'count') {
        // User expects lines to be physically cut into N parts
        let allSegmented: GeoPoint[] = [];
        processedPoints.forEach(pt => {
           if (pt.type === 'LineString' && pt.path) {
              const parts = splitLineIntoParts(pt.path, splitCount);
              parts.forEach((seg, i) => allSegmented.push({ ...pt, id: parts.length > 1 ? `${pt.id} [${i+1}]` : pt.id, path: seg }));
           } else {
              allSegmented.push(pt);
           }
        });
        
        // After physical splitting, we also distribute them into folders so it satisfies the folder logic
        const size = Math.ceil(allSegmented.length / splitCount);
        for (let i = 0; i < splitCount; i++) {
           const chunk = allSegmented.slice(i * size, (i + 1) * size);
           if (chunk.length > 0) {
              groups.push({ name: `Part ${i + 1}`, points: chunk });
           }
        }
      } else if (splitMode === 'street') {
        const streetMap = new Map<string, GeoPoint[]>();
        processedPoints.forEach(pt => {
          let s = pt.street || (lang === 'ar' ? 'شوارع غير معروفة' : 'Unknown Streets');
          // Sanitize street name to prevent ZIP file creation errors or XML errors
          s = s.replace(/[/\\?%*:|"<>]/g, '-').trim() || "Street";
          if (!streetMap.has(s)) streetMap.set(s, []);
          streetMap.get(s)!.push(pt);
        });
        streetMap.forEach((pts, s) => {
          groups.push({ name: s, points: pts });
        });
      } else if (splitMode === 'spatial') {
        if (splitPolygons.length === 0) throw new Error(t.errors.noPolygon);

        const remaining: GeoPoint[] = [];
        const polygonGroups = splitPolygons.map(poly => ({ name: poly.name, poly: poly.path, points: [] as GeoPoint[] }));

        processedPoints.forEach(pt => {
          if (pt.type === 'LineString' && pt.path) {
            let placed = false;
            for (const g of polygonGroups) {
              const clippedSegments = clipLineToPolygon(pt.path, g.poly);
              if (clippedSegments.length > 0) {
                clippedSegments.forEach((seg, i) => {
                  g.points.push({ ...pt, id: clippedSegments.length > 1 ? `${pt.id} [${i+1}]` : pt.id, path: seg });
                });
                placed = true;
              }
            }
            if (!placed) remaining.push(pt);
          } else {
             let found = false;
             for (const g of polygonGroups) {
               if (isPointInPolygon({ x: pt.x, y: pt.y }, g.poly)) {
                 g.points.push(pt);
                 found = true;
                 break;
               }
             }
             if (!found) remaining.push(pt);
          }
        });

        polygonGroups.forEach(g => { if (g.points.length > 0) groups.push({ name: g.name, points: g.points }); });
        if (remaining.length > 0) groups.push({ name: lang === 'ar' ? 'خارج المضلعات' : 'Outside Polygons', points: remaining });
      }

      const docName = activeFile?.filename ? activeFile.filename.split('.')[0] : "Split_Export";
      if (exportStyle === 'single') {
        const safeDocName = docName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const allPoints = groups.flatMap(g => g.points);
        const stylesXML = generateKMLStyles(allPoints);
        const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${safeDocName}</name>\n${stylesXML}`;
        const kmlFooter = `</Document></kml>`;
        const chunks: string[] = [kmlHeader];
        groups.forEach(g => {
            const safeGroupName = g.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            chunks.push(`<Folder><name>${safeGroupName}</name><open>0</open>\n`);
            const placemarks = generateKMLFolderContent(g.points, activeFile?.headers, selectedHeaders, { mode: 'none', optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly });
            for (const p of placemarks) {
                chunks.push(p);
            }
            chunks.push(`</Folder>\n`);
        });
        chunks.push(kmlFooter);
        const zip = new JSZip();
        const blobKML = new Blob(chunks, { type: "application/vnd.google-earth.kml+xml" });
        zip.file("doc.kml", blobKML);
        const blob = await zip.generateAsync({ type: "blob", compression: globalPoints.length < 100000 ? "DEFLATE" : "STORE" });
        downloadBlob(blob, `${docName}_Split.kmz`);
      } else {
        const zip = new JSZip();
        for (const g of groups) {
          const kmlChunks = generateKMLChunks(g.points, g.name, { mode: 'none', keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly, optimizeForMyMaps: optimizeForMyMaps }, activeFile?.headers, selectedHeaders);
          const blobKML = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
          zip.file(`${g.name}.kml`, blobKML);
        }
        const blob = await zip.generateAsync({ type: "blob", compression: globalPoints.length < 100000 ? "DEFLATE" : "STORE" });
        downloadBlob(blob, `${docName}_Split_Files.zip`);
      }
    } catch (e: any) {
        console.error("Split Export Error:", e);
        setError(e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleExportPolygonsOnly = async () => {
    if (splitPolygons.length === 0) return;
    const polyGeoPoints: GeoPoint[] = splitPolygons.map(p => ({
      id: p.name,
      x: p.path[0].x,
      y: p.path[0].y,
      type: 'Polygon',
      path: p.path,
      color: p.color,
      layer: 'Split Boundaries'
    }));
    await runWithLoading(
      lang === 'ar' ? 'جاري تصدير المضلعات...' : 'Exporting polygons...',
      () => downloadKMZ(polyGeoPoints, "Split_Boundaries", { mode: 'none' })
    );
  };

  const executeWithStreetFetching = async (
    points: GeoPoint[],
    headers: string[] | undefined,
    callback?: (pts: GeoPoint[]) => void | Promise<void>
  ): Promise<GeoPoint[]> => {
    if (!points || points.length === 0) {
      setError(lang === 'ar' ? 'لا توجد عناصر مجهزة لجلب الشوارع. يرجى رفع ملف أو اختيار طبقة بيانات أولاً.' : 'No elements available to fetch streets.');
      return [];
    }

    let newGlobalPoints = points.map(p => ({ ...p, attributes: { ...(p.attributes || {}) } }));

    if (skipStreetFetching) {
      if (callback) {
        setLoading(true);
        setStatusMessage(lang === 'ar' ? 'جاري تجهيز البيانات للتصدير...' : 'Preparing data for export...');
        await new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))); });
        try {
          await callback(newGlobalPoints);
        } catch (e: any) {
          setError(e.message || String(e));
        } finally {
          setLoading(false);
          setStatusMessage('');
        }
      }
      return newGlobalPoints;
    }

    setLoading(true);
    setProgressPercent(5);
    setStatusMessage(lang === 'ar'
        ? `جاري بدء جلب أسماء الشوارع (${geocodingMode === 'accurate' ? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'})...`
        : `Starting Street Name Fetching (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'})...`
    );
    await new Promise<void>(r => setTimeout(r, 120)); // Force UI to paint modal overlay

    try {
      const total = newGlobalPoints.length;
      if (total > 0) {
        const batchSize = geocodingMode === 'accurate' ? 2 : 5;
        let lastResolvedDetail = "";

        for (let i = 0; i < total; i += batchSize) {
            const processed = Math.min(i + batchSize, total);
            const pct = Math.round((processed / total) * 100);
            setProgressPercent(pct);

            const chunk = newGlobalPoints.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (pt) => {
                let street = pt.street;
                let district = pt.district;

                if (!street || street === "غير متوفر" || street === "Unknown" || street === "غير معروف" || street === "شارع غير معروف") {
                    try {
                        let targetY = pt.y;
                        let targetX = pt.x;
                        if ((!targetY || !targetX) && pt.path && pt.path.length > 0) {
                          targetY = pt.path[0].y;
                          targetX = pt.path[0].x;
                        }

                        if (targetY && targetX) {
                          const timeoutPromise = new Promise<{street: string, district: string}>((resolve) => {
                            setTimeout(() => resolve({ street: "غير متوفر", district: "غير متوفر" }), 2500);
                          });
                          const geoData = await Promise.race([
                            getReverseGeocode(targetY, targetX, geocodingMode),
                            timeoutPromise
                          ]);
                          if (geoData.street && geoData.street !== "غير متوفر") {
                            street = geoData.street;
                            pt.street = street;
                            lastResolvedDetail = `${street}${geoData.district && geoData.district !== 'غير متوفر' ? ` (${geoData.district})` : ''}`;
                          }
                          if (geoData.district && geoData.district !== "غير متوفر") {
                            district = geoData.district;
                            pt.district = district;
                          }
                        }
                    } catch (err) {
                        street = street || "";
                    }
                } else {
                    lastResolvedDetail = `${street}${district ? ` (${district})` : ''}`;
                }

                pt.attributes = { ...(pt.attributes || {}) };
                const safeHeaders = Array.isArray(headers) ? headers : [];

                const finalStreet = street && street !== "غير متوفر" ? street : (lang === 'ar' ? 'غير معروف' : 'Unknown');
                const finalDistrict = district && district !== "غير متوفر" ? district : (lang === 'ar' ? 'غير معروف' : 'Unknown');

                if (streetMappingCol) {
                    pt.attributes[streetMappingCol] = finalStreet;
                } else {
                    pt.attributes['STREETNAME'] = finalStreet;
                    pt.attributes['الشارع'] = finalStreet;
                    pt.attributes['اسم الشارع'] = finalStreet;
                    safeHeaders.forEach(h => {
                      const lowerH = String(h || '').toLowerCase();
                      if (['street', 'streetname', 'اسم الشارع', 'الشارع'].includes(lowerH) || h === 'اسم الشارع' || h === 'الشارع') {
                        pt.attributes[h] = finalStreet;
                      }
                    });
                }

                if (districtMappingCol) {
                    pt.attributes[districtMappingCol] = finalDistrict;
                } else {
                    pt.attributes['DISTRICT'] = finalDistrict;
                    pt.attributes['الحي'] = finalDistrict;
                    safeHeaders.forEach(h => {
                      const lowerH = String(h || '').toLowerCase();
                      if (['district', 'الحي'].includes(lowerH) || h === 'الحي') {
                        pt.attributes[h] = finalDistrict;
                      }
                    });
                }
            }));

            const detailMsg = lastResolvedDetail 
              ? (lang === 'ar' ? `\n📍 الشارع الحالي: ${lastResolvedDetail}` : `\n📍 Current street: ${lastResolvedDetail}`) 
              : '';

            setStatusMessage(lang === 'ar'
                ? `جاري جلب وتحديث الشوارع (${processed} من ${total}) [${pct}%]${detailMsg}`
                : `Fetching Street & District Names (${processed} of ${total}) [${pct}%]${detailMsg}`
            );

            // Small delay between batches to respect network rate limits & yield to UI thread
            await new Promise(res => setTimeout(res, 25));
        }
        setGlobalPoints(prev => {
           const next = [...prev];
           newGlobalPoints.forEach(np => {
               const idx = next.findIndex(p => p.id === np.id);
               if (idx !== -1) {
                   next[idx] = np;
               }
           });
           return next;
        });
        setPlannedStreets(prev => {
           const next = [...prev];
           let changed = false;
           newGlobalPoints.forEach(np => {
               const idx = next.findIndex(p => p.id === np.id);
               if (idx !== -1) {
                   next[idx] = np;
                   changed = true;
               }
           });
           return changed ? next : prev;
        });
      }

      if (callback) {
        setProgressPercent(100);
        setStatusMessage(lang === 'ar' ? 'جاري تحضير وتنسيق الملف للتنزيل...' : 'Preparing and formatting file for download...');
        await new Promise<void>(r => setTimeout(r, 100));
        await callback(newGlobalPoints);
      } else {
        setProgressPercent(100);
        setStatusMessage(lang === 'ar' ? 'تم جلب وتحديث أسماء الشوارع بنجاح! 🗺️' : 'Street names fetched and updated successfully! 🗺️');
        await new Promise<void>(r => setTimeout(r, 600));
      }
    } catch (err: any) {
      console.error("Error in executeWithStreetFetching:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
      setProgressPercent(null);
      setStatusMessage('');
    }

    return newGlobalPoints;
  };

  const handleFetchStreets = async () => {
    let areaToQuery = selectedArea;

    if (!areaToQuery && globalPoints.length > 0) {
      const allPathPoints: {x: number, y: number}[] = [];
      globalPoints.forEach(p => {
        if (p.path) p.path.forEach(v => allPathPoints.push({x: v.x, y: v.y}));
        else allPathPoints.push({x: p.x, y: p.y});
      });
      areaToQuery = calculateBoundingBox(allPathPoints);
    }

    if (!areaToQuery) {
      setError(lang === 'ar' ? "يرجى رسم مضلع أو رفع حدود منطقة أو رفع ملف هندسي أولاً لتحديد نطاق جلب الشوارع." : "Please draw a polygon, upload boundary, or upload engineering data first.");
      return;
    }

    setLoading(true);
    setProgressPercent(15);
    setStatusMessage(lang === 'ar' ? "جاري الاتصال بخدمات الخرائط وتحديد النطاق الجغرافي..." : "Connecting to map services & calculating bounds...");
    await new Promise<void>(r => setTimeout(r, 120));

    try {
      const buffered = bufferPolygon(areaToQuery, plannerBuffer);
      setProgressPercent(30);
      setStatusMessage(lang === 'ar' ? "جاري استرجاع شبكة الشوارع والطرق من خوادم الخرائط..." : "Fetching street network for area from map servers...");
      
      let streets = await fetchStreetsInPolygon(
        buffered, 
        plannerClip, 
        streetTypeFilters,
        (msg, pct) => {
          setStatusMessage(msg);
          setProgressPercent(pct);
        }
      );

      setProgressPercent(85);
      setStatusMessage(lang === 'ar' ? "جاري تقطيع ومعالجة تقاطعات وهندسة الشوارع..." : "Processing & splitting fetched street geometries...");
      await new Promise(r => setTimeout(r, 60));

      if (plannerSplitIntersections) {
        streets = splitLinesAtIntersections(streets);
      }

      if (plannerSplitLines) {
        let splitResults: GeoPoint[] = [];
        streets.forEach(s => {
          if (s.path) {
            const segments = splitLineString(s.path, plannerMaxLen);
            segments.forEach((seg, idx) => {
              splitResults.push({
                ...s,
                id: segments.length > 1 ? `${s.id} [${idx + 1}]` : s.id,
                path: seg,
                originalLength: calculatePathLength(seg)
              });
            });
          } else {
            splitResults.push(s);
          }
        });
        streets = splitResults;
      }

      setPlannedStreets(streets);
      setDataId(`streets-${Date.now()}`);
      setProgressPercent(100);
      if (streets.length > 0) {
        setStatusMessage(lang === 'ar' ? `تم جلب ${streets.length} شارع بنجاح! 🗺️` : `Successfully fetched ${streets.length} streets! 🗺️`);
      } else {
        setStatusMessage(lang === 'ar' ? 'اكتمل البحث (لم يتم العثور على شوارع رسمية في هذا النطاق، يمكنك توسيع نطاق البحث Buffer).' : 'Search complete (no roads detected in this exact zone, you can increase buffer).');
      }
      await new Promise(r => setTimeout(r, 800));
    } catch (e: any) {
      console.warn("Street planning fetch notice:", e);
      setError(lang === 'ar' ? 'تعذر جلب الشوارع من خوادم الخرائط حالياً. يرجى المحاولة مرة أخرى أو توسيع النطاق.' : 'Unable to fetch streets from map servers at this moment. Please retry or expand buffer.');
    } finally {
      setLoading(false);
      setProgressPercent(null);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleBoundaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true);
    setProgressPercent(10);
    setStatusMessage(lang === 'ar' ? `جاري تحليل مضلع الحدود من الملف (${selectedFile.name})...` : `Analyzing boundary polygon from file (${selectedFile.name})...`);
    await new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))); });
    try {
        const fName = String(selectedFile.name || '').toLowerCase();
        let result: ParsedFile;
        const onProg = (p: number) => setProgressPercent(p);
        if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) result = await parseKMZ(selectedFile, onProg);
        else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile, onProg);
        else throw new Error(t.errors.unsupported);
        let pts: GeoPoint[] = [];
        if (result.type === 'kmz') pts = result.data;
        else if (result.type === 'dxf') pts = extractPointsFromDXF(result.data);
        const poly = pts.find(p => p.type === 'Polygon' || p.type === 'LineString');
        if (poly && poly.path) {
          if (activeTab === 'splitter' && splitMode === 'spatial') {
            const newPoly: SplitPolygon = {
              id: `poly-${Date.now()}`,
              name: `${lang === 'ar' ? 'مضلع مستورد' : 'Imported Polygon'} ${splitPolygons.length + 1}`,
              path: poly.path,
              color: PALETTE[splitPolygons.length % PALETTE.length]
            };
            setSplitPolygons([...splitPolygons, newPoly]);
          } else {
            setSelectedArea(poly.path);
            setBoundaryPolygon(poly);
          }
          setDataId(`boundary-${Date.now()}`);
          setStatusMessage(lang === 'ar' ? 'تم تحميل الحدود بنجاح.' : 'Boundary loaded successfully.');
        } else throw new Error(t.errors.noBoundaryInKml);
    } catch (err: any) { setError(err.message); } finally { if (e && e.target) { try { e.target.value = ''; } catch(err){} } setLoading(false); setProgressPercent(null); setTimeout(() => setStatusMessage(''), 3000); }
  };

  const handleLoadSampleGDB = () => {
    setLoading(true);
    setStatusMessage(lang === 'ar' ? 'جاري تحميل عينة قاعدة بيانات مياه جغرافية...' : 'Loading sample water database...');
    setTimeout(() => {
      const sampleFile: ParsedFile = {
        filename: "nwc_riyadh_network_data.gdb.zip",
        type: "kmz",
        data: SAMPLE_GDB_POINTS,
        preview: []
      };
      setActiveFile(sampleFile);
      setGlobalPoints(SAMPLE_GDB_POINTS);
      setDataId(`sample-gdb-${Date.now()}`);
      setLoading(false);
      setStatusMessage(lang === 'ar' ? 'تم جلب عينة الأنابيب بنجاح!' : 'Loaded sample water network!');
      setTimeout(() => setStatusMessage(''), 2000);
    }, 600);
  };

  const FileUploadZone = ({ id, label }: { id: string, label?: string }) => {
    const finalLabel = label || (lang === 'ar' ? 'مصدر البيانات الطبوغرافية' : 'Topographic Data Source');
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-accent transform rotate-90" />
            <h3 className="text-white font-black text-sm">{finalLabel}</h3>
          </div>

          <div className="bg-black/20 p-1 rounded-xl flex gap-1 border border-white/5">
            <button
              type="button"
              onClick={() => setUploadSourceMode('file')}
              className={cn(
                "px-3 py-1 text-[9px] font-black transition-all rounded-lg",
                uploadSourceMode === 'file' ? "bg-accent text-primary shadow-md" : "text-white/40 hover:text-white"
              )}
            >
              {lang === 'ar' ? 'ملف محلي' : 'Local File'}
            </button>
            <button
              type="button"
              onClick={() => setUploadSourceMode('link')}
              className={cn(
                "px-3 py-1 text-[9px] font-black transition-all rounded-lg",
                uploadSourceMode === 'link' ? "bg-accent text-primary shadow-md" : "text-white/40 hover:text-white"
              )}
            >
              {lang === 'ar' ? 'رابط جوجل مابس' : 'Google Maps'}
            </button>
          </div>
        </div>

        {uploadSourceMode === 'file' ? (
          <label 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileUpload}
            className="block border-2 border-dashed border-accent/40 rounded-[2.5rem] p-10 text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group relative overflow-hidden"
          >
            <input type="file" className="hidden" onChange={handleFileUpload} />
            <Upload className="w-10 h-10 mx-auto mb-4 text-accent group-hover:scale-110 transition-all" />
            <span className="text-[11px] font-black text-white block leading-tight px-4">{activeFile ? activeFile.filename : (lang === 'ar' ? 'ارفق أو اسحب الملف هنا (Excel, DXF, KMZ, KML)' : 'Upload or Drop Data Source (Excel, DXF, KMZ, KML)')}</span>
            <span className="text-[9px] text-accent mt-3 block font-bold uppercase tracking-widest">{activeFile ? (lang === 'ar' ? 'انقر أو اسحب لتغيير الملف' : 'Click or drop to change file') : (lang === 'ar' ? 'انقر أو اسحب لاختيار الملف' : 'Select or drop file')}</span>
          </label>
        ) : (
          <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 shadow-xl space-y-4 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <p className="text-[10px] text-white/50 leading-relaxed font-bold">
              {lang === 'ar'
                ? 'ضع رابط خريطة Google My Maps العام (مفتوح للمشاركة) والضغط على "استيراد" لتحميل وتعديل البيانات مباشرة.'
                : 'Paste a public Google My Maps share/edit link and click "Import" to fetch and transform the data instantly.'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://www.google.com/maps/d/edit?mid=..."
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                className="flex-1 bg-[#0e3f53] border border-white/10 rounded-2xl px-4 py-3 text-[11px] font-bold text-white outline-none placeholder:text-white/20 select-text"
              />
              <button
                type="button"
                onClick={handleLoadMyMapsLink}
                disabled={!mapsLink.trim()}
                className={cn(
                  "px-6 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg",
                  mapsLink.trim() ? "bg-accent text-primary hover:brightness-110 active:scale-95" : "bg-white/5 text-white/25 cursor-not-allowed"
                )}
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                <span>{lang === 'ar' ? 'استيراد' : 'Import'}</span>
              </button>
            </div>
            {activeFile && (
              <div className="mt-2 flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <span className="text-[10px] font-black text-white/80">{lang === 'ar' ? 'الخريطة النشطة:' : 'Active Map:'} {activeFile.filename}</span>
                <button type="button" onClick={() => { setActiveFile(null); setGlobalPoints([]); }} className="text-[9px] font-bold text-red-400 hover:underline">{lang === 'ar' ? 'إلغاء التحميل' : 'Unload'}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-screen w-screen font-sans overflow-hidden transition-colors duration-300", isDarkMode ? "bg-[#0a2633] text-white" : "bg-slate-100 text-slate-900")} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Floating PWA Install Banner */}
      {showInstallBanner && !isStandalone && (
        <div className="bg-gradient-to-r from-accent via-amber-400 to-accent text-primary px-4 py-2 flex items-center justify-between text-xs font-black shadow-xl z-[1000] border-b border-white/20 shrink-0 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
              <Smartphone className="w-4 h-4 animate-bounce" />
            </div>
            <span className="truncate max-w-md sm:max-w-none">
              {lang === 'ar'
                ? '📱 ثبّت تطبيق GeoGIS Pro الآن على جوالك للعمل بسرعة شاشة كاملة بدون متصفح!'
                : '📱 Install GeoGIS Pro app on your phone for ultra-fast full-screen performance!'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInstallModal(true)}
              className="px-3.5 py-1.5 bg-primary text-accent hover:bg-black rounded-lg text-[11px] font-black transition-all shadow flex items-center gap-1 active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تثبيت الآن' : 'Install Now'}</span>
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="p-1 text-primary/70 hover:text-primary transition-all rounded-md"
              title={lang === 'ar' ? 'إغلاق الإشعار' : 'Dismiss'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Top Header & View Toggle */}
      <div className="lg:hidden bg-primary border-b border-slate-800 p-2.5 px-3 flex items-center justify-between z-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-black text-xs shadow-sm shrink-0">
            GIS
          </div>
          <div className="truncate">
            <h1 className="text-xs font-black text-white leading-tight truncate">{t.appTitle}</h1>
            <p className="text-[8px] text-accent font-bold uppercase truncate">{theme === 'nwc' ? t.themeNWC : t.subTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setMobileView(mobileView === 'panel' ? 'map' : 'panel')}
            className={cn(
              "px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md border active:scale-95",
              mobileView === 'map'
                ? "bg-accent text-primary border-accent"
                : "bg-white/10 text-white border-white/20 hover:bg-white/20"
            )}
          >
            {mobileView === 'panel' ? (
              <>
                <MapPin className="w-3.5 h-3.5 text-accent" />
                <span>{lang === 'ar' ? 'الخريطة' : 'Map'}</span>
                {displayPoints.length > 0 && (
                  <span className="bg-accent text-primary px-1.5 py-0.2 rounded-full text-[9px] font-black">
                    {displayPoints.length}
                  </span>
                )}
              </>
            ) : (
              <>
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                <span>{lang === 'ar' ? 'الأدوات' : 'Tools'}</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/15 transition-all active:scale-95 flex items-center justify-center"
            title={isDarkMode ? (lang === 'ar' ? 'التحويل للوضع النهاري ☀️' : 'Light Mode ☀️') : (lang === 'ar' ? 'التحويل للوضع الليلي 🌙' : 'Dark Mode 🌙')}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-cyan-300" />}
          </button>
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="px-2 py-1 bg-white/5 text-white/80 rounded-lg text-xs font-bold border border-white/10"
          >
            {String(lang || '').toUpperCase()}
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 bg-white/5 text-white/70 rounded-lg border border-white/10"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Tool Tabs Bar (Scrollable Horizontally) */}
      <div className="lg:hidden bg-[#0a2330] border-b border-slate-800 px-2 py-2 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 z-40">
        {[
          { id: 'map-viewer', icon: <Globe />, label: lang === 'ar' ? 'عرض الخريطة' : 'Map View' },
          { id: 'converter', icon: <RefreshCw />, label: lang === 'ar' ? 'محول' : 'Converter' },
          { id: 'street-planner', icon: <MapPinned />, label: lang === 'ar' ? 'مخطط' : 'Planner' },
          { id: 'analyzer', icon: <BarChart3 />, label: lang === 'ar' ? 'محلل' : 'Analyzer' },
          { id: 'sbc-checker', icon: <ShieldCheck />, label: lang === 'ar' ? 'الكود السعودي (تحت التطوير)' : 'SBC Code (In Dev)' },
          { id: 'segment-vault', icon: <HardDrive />, label: lang === 'ar' ? 'حافظة Segment' : 'Vault' },
          { id: 'classifier', icon: <Layers />, label: lang === 'ar' ? 'مصنف' : 'Classifier' },
          { id: 'splitter', icon: <Split />, label: lang === 'ar' ? 'مقسم' : 'Splitter' },
          { id: 'polygon-converter', icon: <Shapes />, label: lang === 'ar' ? 'مضلعات' : 'Polygons' },
          { id: 'attribute-formatter', icon: <Database />, label: lang === 'ar' ? 'تنسيق' : 'Format' },
          { id: 'comparator', icon: <GitCompare />, label: lang === 'ar' ? 'مقارنة' : 'Compare' },
          { id: 'line-drawer', icon: <PenTool />, label: lang === 'ar' ? 'رسم الخطوط' : 'Line Drawer' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setMobileView('panel');
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl font-black text-[11px] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all border",
              activeTab === tab.id
                ? "bg-accent text-primary border-accent shadow-md"
                : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
            )}
          >
            {React.cloneElement(tab.icon as any, { className: "w-3.5 h-3.5" })}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 h-full w-full overflow-hidden relative">
        <nav className="hidden lg:flex bg-primary border-e border-slate-800 flex-col items-center py-8 w-20 lg:w-24 shrink-0 z-20 shadow-2xl transition-colors duration-500 overflow-y-auto custom-scrollbar">
          <div className="flex-1 flex flex-col gap-4 md:gap-6 w-full px-1.5 sm:px-2">
             {[
               { id: 'map-viewer', icon: <Globe />, label: lang === 'ar' ? 'عرض الخريطة' : 'Map View' },
               { id: 'converter', icon: <RefreshCw />, label: lang === 'ar' ? 'محول' : 'Converter' },
               { id: 'street-planner', icon: <MapPinned />, label: lang === 'ar' ? 'مخطط' : 'Planner' },
               { id: 'analyzer', icon: <BarChart3 />, label: lang === 'ar' ? 'محلل' : 'Analyzer' },
               { id: 'sbc-checker', icon: <ShieldCheck />, label: lang === 'ar' ? 'الكود السعودي (تحت التطوير)' : 'SBC Code (In Dev)' },
               { id: 'segment-vault', icon: <HardDrive />, label: lang === 'ar' ? 'حافظة Segment' : 'Segment Vault' },
               { id: 'classifier', icon: <Layers />, label: lang === 'ar' ? 'مصنف الخرائط' : 'Map Classifier' },
               { id: 'splitter', icon: <Split />, label: lang === 'ar' ? 'مقسم' : 'Splitter' },
               { id: 'polygon-converter', icon: <Shapes />, label: lang === 'ar' ? 'مضلعات' : 'Polygons' },
               { id: 'attribute-formatter', icon: <Database />, label: lang === 'ar' ? 'تنسيق البيانات' : 'Format Data' },
               { id: 'comparator', icon: <GitCompare />, label: lang === 'ar' ? 'مقارنة' : 'Compare' },
               { id: 'line-drawer', icon: <PenTool />, label: lang === 'ar' ? 'رسم الخطوط' : 'Line Drawer' }
             ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const isRtl = lang === "ar";
                  const tooltipWidth = 360;
                  let leftPos = isRtl ? rect.left - tooltipWidth - 12 : rect.right + 12;
                  if (leftPos < 10) leftPos = rect.right + 12;
                  if (leftPos + tooltipWidth > window.innerWidth - 10) leftPos = Math.max(10, rect.left - tooltipWidth - 12);
                  const topPos = Math.min(Math.max(16, rect.top - 10), window.innerHeight - 320);
                  setHoveredTabTooltip({ id: tab.id, top: topPos, left: leftPos, side: isRtl ? "left" : "right" });
                }} onMouseLeave={() => setHoveredTabTooltip(null)} className={cn("flex flex-col items-center gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-2xl transition-all group relative", activeTab === tab.id ? "bg-accent text-primary shadow-lg" : "text-white/30 hover:text-white")}>
                  {React.cloneElement(tab.icon as any, { className: "w-5 h-5 md:w-6 md:h-6" })}
                  <span className="text-[7px] sm:text-[8px] font-black uppercase text-center leading-tight">{tab.label}</span>
                </button>
             ))}
          </div>
          <div className="flex flex-col gap-3 md:gap-4 mt-auto pt-4">
             <button onClick={() => setShowInstallModal(true)} className="p-2 sm:p-3 text-accent hover:brightness-125 transition-all flex flex-col items-center gap-1 group relative" title={lang === 'ar' ? 'تثبيت التطبيق على الجوال' : 'Install Mobile App'}>
                <div className="relative">
                  <Smartphone className="w-5 h-5 text-accent animate-pulse" />
                  {!isStandalone && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent animate-ping" />}
                </div>
                <span className="text-[8px] font-black text-accent">{lang === 'ar' ? 'تثبيت' : 'APP'}</span>
             </button>
             <button onClick={() => setShowManual(true)} className="p-2 sm:p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1" title={lang === 'ar' ? 'دليل المستخدم' : 'User Guide'}><FileText className="w-5 h-5 text-accent" /><span className="text-[8px] font-bold">{lang === 'ar' ? 'الدليل' : 'GUIDE'}</span></button>
             <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="p-2 sm:p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Languages className="w-5 h-5" /><span className="text-[8px] font-bold">{String(lang || '').toUpperCase()}</span></button>
             <button onClick={() => setTheme(theme === 'default' ? 'nwc' : 'default')} className="p-2 sm:p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Palette className="w-5 h-5" /><span className="text-[8px] font-bold">THEME</span></button>
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 sm:p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1 group" title={isDarkMode ? (lang === 'ar' ? 'التحويل للوضع النهاري ☀️' : 'Switch to Light Mode ☀️') : (lang === 'ar' ? 'التحويل للوضع الليلي 🌙' : 'Switch to Dark Mode 🌙')}>
                {isDarkMode ? <Sun className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" /> : <Moon className="w-5 h-5 text-cyan-300 group-hover:scale-110 transition-transform" />}
                <span className="text-[8px] font-bold">{isDarkMode ? (lang === 'ar' ? 'نهاري' : 'LIGHT') : (lang === 'ar' ? 'ليلي' : 'DARK')}</span>
             </button>
             <button onClick={() => setShowSettingsModal(true)} className="p-2 sm:p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Settings2 className="w-5 h-5" /><span className="text-[8px] font-bold">{lang === 'ar' ? 'إعدادات' : 'SETTINGS'}</span></button>

          </div>
      </nav>

      <aside className={cn("bg-primary border-e border-slate-800 flex-col shadow-2xl relative z-30 transition-colors duration-500 overflow-visible shrink-0", mobileView === 'panel' ? "flex w-full flex-1 lg:w-[550px] lg:min-w-[500px] lg:max-w-[580px]" : "hidden lg:flex lg:w-[550px] lg:min-w-[500px] lg:max-w-[580px]")}>
           <div className="p-4 sm:p-6 md:p-10 pb-4 shrink-0">
                <div className="flex items-center justify-between">
                   <div>
                     <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">{t.appTitle}</h1>
                     <p className="text-[9px] sm:text-[10px] text-accent font-black uppercase mt-1 tracking-widest">{theme === 'nwc' ? t.themeNWC : t.subTitle}</p>
                   </div>
                   <div className="flex items-center gap-2">
                     <button
                       onClick={() => setShowInstallModal(true)}
                       className="px-2.5 py-1.5 bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent rounded-xl text-[10px] font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                       title={lang === 'ar' ? 'تثبيت التطبيق على الجوال' : 'Install Mobile App'}
                     >
                       <Smartphone className="w-3.5 h-3.5" />
                       <span>{lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
                     </button>
                     {theme === 'nwc' && (
                       <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-full flex items-center justify-center shadow-lg animate-pulse shrink-0">
                         <span className="text-primary font-black text-[9px] sm:text-[11px] tracking-tight">NWC</span>
                       </div>
                     )}
                   </div>
                </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 md:px-10 pb-8 pt-4">
                {error && (<div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 flex items-start gap-3 animate-in slide-in-from-top"><X className="w-4 h-4 text-red-400 shrink-0 mt-1 cursor-pointer" onClick={() => setError(null)} /><p className="text-[10px] text-red-400 font-bold leading-relaxed">{error}</p></div>)}

                {/* Persistent Auto-Alert Banner for Unresolved Spatial Overlaps */}
                {autoAlertInfo && autoAlertInfo.totalCount > 0 && (
                  <div className="bg-gradient-to-r from-amber-500/20 via-red-500/20 to-amber-500/20 border-2 border-amber-500/60 p-4 rounded-2xl mb-6 shadow-xl animate-pulse flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
                        <div>
                          <h4 className="text-amber-300 font-black text-xs leading-snug">
                            {lang === 'ar' ? 'تنبيه تلقائي: تم كشف تداخلات مكانية غير محلولة!' : 'Auto-Alert: Unresolved Spatial Overlaps Detected!'}
                          </h4>
                          <p className="text-[10px] text-white/80 font-bold mt-0.5 leading-relaxed">
                            {lang === 'ar'
                              ? `الملف المستورد يحتوي على ${autoAlertInfo.totalCount} تداخلات مكانية (${autoAlertInfo.duplicatesCount} متطابقة | ${autoAlertInfo.intersectionsCount} تقاطعات)`
                              : `Imported file contains ${autoAlertInfo.totalCount} spatial overlaps (${autoAlertInfo.duplicatesCount} duplicates | ${autoAlertInfo.intersectionsCount} intersections)`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoAlertInfo(null)}
                        className="p-1 text-white/50 hover:text-white rounded-lg transition-colors shrink-0"
                        title={lang === 'ar' ? 'تجاهل الإشعار' : 'Dismiss Alert'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-amber-500/20">
                      {autoAlertInfo.duplicatesCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResolveDuplicates}
                          className="px-3 py-1.5 bg-red-500/30 hover:bg-red-500/40 text-red-200 border border-red-500/40 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 active:scale-95 shadow"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-300" />
                          <span>{lang === 'ar' ? 'حذف المتطابقة تلقائياً 🗑️' : 'Auto-Delete Duplicates'}</span>
                        </button>
                      )}
                      {autoAlertInfo.intersectionsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleTrimIntersections}
                          className="px-3 py-1.5 bg-cyan-500/30 hover:bg-cyan-500/40 text-cyan-200 border border-cyan-500/40 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 active:scale-95 shadow"
                        >
                          <Scissors className="w-3.5 h-3.5 text-cyan-300" />
                          <span>{lang === 'ar' ? 'تقليم التقاطعات ✂️' : 'Trim Intersections'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOverlapResults(autoAlertInfo?.duplicatesCount > 0 ? (autoAlertInfo?.dups || []) : (autoAlertInfo?.intersections || []));
                          setOverlapModalType(autoAlertInfo?.duplicatesCount > 0 ? 'duplicates' : 'intersections');
                          setShowOverlapModal(true);
                        }}
                        className="px-3 py-1.5 bg-accent text-primary font-black rounded-xl text-[10px] hover:brightness-110 transition-all flex items-center gap-1 active:scale-95 shadow"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'معاينة المعالجة ⚡' : 'Review & Resolve ⚡'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={clearAuditResults}
                        className="px-3 py-1.5 bg-rose-500/30 hover:bg-rose-500/50 text-rose-200 border border-rose-500/40 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 active:scale-95 shadow"
                        title={lang === 'ar' ? 'إزالة كافة نتائج التظليل والفحص والتنبيهات' : 'Clear all audit results and alerts'}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                        <span>{lang === 'ar' ? 'إزالة نتائج الفحص والتنبيهات 🧹' : 'Clear Audit & Alerts 🧹'}</span>
                      </button>
                    </div>
                  </div>
                )}

                
                {activeTab === 'map-viewer' && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <FileUploadZone id="map-up" label={lang === 'ar' ? '1. مصدر البيانات الطبوغرافية' : '1. Topographic Data Source'} />

                    {/* Sidebar Flow Direction Toggle Button */}
                    {globalPoints.length > 0 && (
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-500/40 shadow-xl space-y-3 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Waves className="w-5 h-5 text-cyan-400 animate-pulse" />
                            <div>
                              <h3 className="text-white font-black text-xs">
                                {lang === 'ar' ? 'إظهار اتجاه التدفق (Flow Direction)' : 'Flow Direction Animation'}
                              </h3>
                              <p className="text-[10px] text-cyan-200/70 font-bold">
                                {lang === 'ar' ? 'تحريك واتجاهات التدفق للشبكة (Pipe Z -> Manholes -> DEM)' : 'Network hydraulic flow (Pipe Z -> Manholes -> DEM)'}
                              </p>
                            </div>
                          </div>
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[9.5px] font-black border tracking-wider",
                            showFlowDirection 
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 animate-pulse shadow-[0_0_10px_rgba(56,189,248,0.3)]" 
                              : "bg-white/5 text-white/40 border-white/10"
                          )}>
                            {showFlowDirection ? (lang === 'ar' ? 'مفعل ⚡' : 'ACTIVE ⚡') : (lang === 'ar' ? 'متقطع' : 'PAUSED')}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowFlowDirection(!showFlowDirection)}
                          className={cn(
                            "w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-between border shadow-lg active:scale-95",
                            showFlowDirection
                              ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-300 shadow-cyan-500/30"
                              : "bg-white/5 text-white/80 hover:text-white hover:bg-white/10 border-white/10"
                          )}
                          title={lang === 'ar' ? 'تشغيل أو إيقاف حركة اتجاه التدفق الهيدروليكي' : 'Play or pause hydraulic flow direction animation'}
                        >
                          <div className="flex items-center gap-2">
                            <Waves className={cn("w-4 h-4", showFlowDirection ? "animate-bounce text-white" : "text-white/40")} />
                            <span>{showFlowDirection ? (lang === 'ar' ? 'إيقاف حركة التدفق' : 'Pause Flow Animation') : (lang === 'ar' ? 'إظهار اتجاه التدفق (Flow Direction)' : 'Show Flow Direction')}</span>
                          </div>
                          <div className={cn("w-9 h-5 rounded-full p-0.5 transition-colors flex items-center", showFlowDirection ? "bg-cyan-300 justify-end" : "bg-white/20 justify-start")}>
                            <div className={cn("w-4 h-4 rounded-full shadow-md transition-transform", showFlowDirection ? "bg-blue-950" : "bg-white")} />
                          </div>
                        </button>
                      </div>
                    )}

                    <MapViewer
                      lang={lang}
                      points={globalPoints}
                      globalBaseMap={globalBaseMap}
                      setGlobalBaseMap={setGlobalBaseMap}
                      focusedPoint={focusedPoint}
                      hoveredElevationPoint={hoveredElevationPoint}
                      setFocusedPoint={setFocusedPoint}
                      layerOpacity={layerOpacity}
                      setLayerOpacity={setLayerOpacity}
                      is3DMode={is3DMode}
                      setIs3DMode={setIs3DMode}
                      onGenerateReport={() => handleWrapper(lang === 'ar' ? 'جاري تصدير التقرير...' : 'Generating report...', () => downloadDataPDF(globalPoints, activeFile?.filename || 'Map_Report', lang))}
                      isGeneratingReport={loading}
                      showFlowDirection={showFlowDirection}
                      onToggleFlowDirection={setShowFlowDirection}
                      flowAnalysis={flowAnalysis}
                    />
                  </div>
                )}

                {activeTab === 'converter' && (

                    <div className="space-y-8 animate-in fade-in duration-500">
                        <FileUploadZone id="conv" label={lang === 'ar' ? '1. مصدر البيانات' : '1. Data Source'} />
                        {activeFile && (
                            <div className="space-y-6">
                                <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 shadow-xl space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3"><Info className="w-4 h-4 text-accent" /><h3 className="text-white font-black text-sm">{t.sourceCrs}</h3></div>
                                        <button onClick={handleRefreshPreview} className="p-2 bg-accent/10 rounded-lg hover:bg-accent/20 transition-all group" title={lang === 'ar' ? 'تحديث المعاينة' : 'Refresh Preview'}>
                                            <RefreshCw className="w-4 h-4 text-accent group-hover:rotate-180 transition-transform duration-500" />
                                        </button>
                                    </div>
                                    <select value={sourceEPSG} onChange={(e) => setSourceEPSG(e.target.value)} className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none">{COMMON_EPSG.map(e => <option key={e.code} value={e.code}>{e.name}</option>)}</select>
                                    <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer"><span className="text-xs font-black text-white/80">{t.swapXY}</span><input type="checkbox" checked={swapXY} onChange={(e) => setSwapXY(e.target.checked)} className="accent-accent w-4 h-4" /></label>
                                </div>
                                {(activeFile.type === 'excel' || activeFile.type === 'csv') && (
                                    <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4">
                                        <h3 className="text-white font-black text-sm mb-4">{t.colMapping}</h3>
                                        {['xColumn', 'yColumn', 'idColumn', 'linkColumn'].map(key => (
                                            <div key={key} className="space-y-1">
                                                <label className="text-[9px] font-black text-white/30 uppercase px-2">{(t as any)[key === 'xColumn' ? 'easting' : key === 'yColumn' ? 'northing' : key === 'idColumn' ? 'nameCol' : 'linkCol']}</label>
                                                <select value={(mapping as any)[key]} onChange={(e) => setMapping(prev => ({...prev, [key]: e.target.value}))} className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black text-white"><option value="">{t.select}</option>{activeFile.headers?.map(h => <option key={h} value={h}>{h}</option>)}</select>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Column Selector checklist */}
                                {activeFile.headers && activeFile.headers.length > 0 && (
                                    <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4 animate-in slide-in-from-bottom">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <CheckSquare className="w-4 h-4 text-accent" />
                                                <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'الأعمدة لدمجها وتصديرها' : 'Columns to Export'}</h3>
                                            </div>
                                            <span className="text-[10px] font-black text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
                                                {selectedHeaders.length} / {activeFile.headers.length}
                                            </span>
                                        </div>

                                        <p className="text-[9px] text-white/40 leading-relaxed font-bold">
                                            {lang === 'ar' ? 'اختر الأعمدة التي ترغب بدمجها وظهورها في العناصر المصدرة.' : 'Select the columns you want to merge and include in your exported files.'}
                                        </p>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedHeaders(Array.from(new Set([...(activeFile.headers || []), ...defaultFields])))}
                                                className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 text-[9px] font-black transition-all"
                                            >
                                                {lang === 'ar' ? 'تحديد الكل' : 'Select All'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedHeaders([])}
                                                className="px-3 py-1.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 text-[9px] font-black transition-all"
                                            >
                                                {lang === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
                                            </button>
                                        </div>

                                        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 border border-white/5 rounded-xl p-3 bg-black/10">
                                            {Array.from(new Set([...activeFile.headers, ...defaultFields])).map((header) => {
                                                const isChecked = selectedHeaders.includes(header);
                                                return (
                                                    <button
                                                        key={header}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isChecked) {
                                                                setSelectedHeaders(selectedHeaders.filter(h => h !== header));
                                                            } else {
                                                                setSelectedHeaders([...selectedHeaders, header]);
                                                            }
                                                        }}
                                                        className="flex items-center gap-3 w-full text-start p-1.5 rounded-lg hover:bg-white/5 transition-all group"
                                                    >
                                                        <div className={cn(
                                                            "w-4 h-4 rounded flex items-center justify-center transition-all",
                                                            isChecked ? "bg-accent text-primary" : "border border-white/20 text-transparent"
                                                        )}>
                                                            <Check className="w-3 h-3 stroke-[3px]" />
                                                        </div>
                                                        <span className={cn(
                                                            "text-[10px] font-bold truncate transition-colors",
                                                            isChecked ? "text-white/95" : "text-white/40 group-hover:text-white/60"
                                                        )}>
                                                            {header}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Street/District Mapping Options */}
                                {activeFile.headers && activeFile.headers.length > 0 && (
                                    <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4 animate-in slide-in-from-bottom">
                                        <div className="flex items-center gap-2 mb-2">
                                            <MapPin className="w-4 h-4 text-accent" />
                                            <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'ربط بيانات العنوان (اختياري)' : 'Address Data Mapping (Optional)'}</h3>
                                        </div>
                                        <p className="text-[9px] text-white/40 leading-relaxed font-bold">
                                            {lang === 'ar' ? 'يمكنك ربط الشارع والحي المستخرجين من الإحداثيات بأعمدة موجودة مسبقاً لاستبدال محتواها، أو اتركها فارغة لإنشاء أعمدة جديدة.' : 'You can map the extracted Street and District to existing columns to replace their content, or leave empty to create new columns.'}
                                        </p>
                                        
                                        <div className="flex gap-4">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-bold text-white/60">
                                                    {lang === 'ar' ? 'الشارع' : 'Street'}
                                                </label>
                                                <select
                                                    value={streetMappingCol}
                                                    onChange={(e) => setStreetMappingCol(e.target.value)}
                                                    className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white outline-none"
                                                >
                                                    <option value="">{lang === 'ar' ? '-- بدون ربط (عمود جديد) --' : '-- No mapping (New Column) --'}</option>
                                                    {activeFile.headers.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-bold text-white/60">
                                                    {lang === 'ar' ? 'الحي' : 'District'}
                                                </label>
                                                <select
                                                    value={districtMappingCol}
                                                    onChange={(e) => setDistrictMappingCol(e.target.value)}
                                                    className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white outline-none"
                                                >
                                                    <option value="">{lang === 'ar' ? '-- بدون ربط (عمود جديد) --' : '-- No mapping (New Column) --'}</option>
                                                    {activeFile.headers.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                 {/* Custom Folder Grouping Options */}
                                {activeFile.headers && activeFile.headers.length > 0 && (
                                    <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4 animate-in slide-in-from-bottom">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Layers2 className="w-4 h-4 text-accent" />
                                                <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'خيارات مجلدات الملف (التقسيم داخل الملف)' : 'File Folder Grouping Options'}</h3>
                                            </div>
                                        </div>

                                        <p className="text-[9px] text-white/40 leading-relaxed font-bold">
                                            {lang === 'ar' ? 'اختر طريقة لتجميع العناصر وتقسيمها داخل ملف الـ KMZ كـ مجلدات منفصلة.' : 'Choose how to group and catalog elements into separate folders within the KMZ file.'}
                                        </p>

                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setGroupingMode('none')}
                                                className={cn(
                                                    "px-2.5 py-3 rounded-xl text-[10px] font-black transition-all border",
                                                    groupingMode === 'none'
                                                        ? "bg-accent text-primary border-accent"
                                                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                                                )}
                                            >
                                                {lang === 'ar' ? 'بدون مجلدات' : 'No Folders'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGroupingMode('layer')}
                                                className={cn(
                                                    "px-2.5 py-3 rounded-xl text-[10px] font-black transition-all border",
                                                    groupingMode === 'layer'
                                                        ? "bg-accent text-primary border-accent"
                                                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                                                )}
                                            >
                                                {lang === 'ar' ? 'تصدير المجلدات كما في الملف المصدر' : 'Folders As Source'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGroupingMode('column')}
                                                className={cn(
                                                    "px-2.5 py-3 rounded-xl text-[10px] font-black transition-all border",
                                                    groupingMode === 'column'
                                                        ? "bg-accent text-primary border-accent"
                                                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                                                )}
                                            >
                                                {lang === 'ar' ? 'حسب العمود' : 'By Column'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGroupingMode('geometry')}
                                                className={cn(
                                                    "px-2.5 py-3 rounded-xl text-[10px] font-black transition-all border",
                                                    groupingMode === 'geometry'
                                                        ? "bg-accent text-primary border-accent"
                                                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                                                )}
                                            >
                                                {lang === 'ar' ? 'حسب نوع الشكل' : 'By Geometry Type'}
                                            </button>
                                        </div>

                                        {groupingMode === 'column' && (
                                            <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                                <label className="text-[9px] font-black text-white/30 uppercase px-2">
                                                    {lang === 'ar' ? 'اختر العمود للتقسيم بناءً عليه' : 'Select Column to Group By'}
                                                </label>
                                                <select
                                                    value={groupByColumnSelect}
                                                    onChange={(e) => setGroupByColumnSelect(e.target.value)}
                                                    className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black text-white outline-none"
                                                >
                                                    {activeFile.headers.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {groupingMode !== 'none' && (
                                            <div className="space-y-2 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-250">
                                                <label className="text-[9px] font-black text-white/30 uppercase px-2">
                                                    {lang === 'ar' ? 'نمط التصدير والتجميع' : 'Export and Grouping Format'}
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setConverterExportAsZip(false)}
                                                        className={cn(
                                                            "px-2 py-2.5 rounded-lg text-[9px] font-black transition-all border flex items-center justify-center gap-1.5",
                                                            !converterExportAsZip
                                                                ? "bg-accent/15 text-accent border-accent/20"
                                                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                                                        )}
                                                    >
                                                        <MapIcon className="w-3.5 h-3.5 text-accent/80" />
                                                        {lang === 'ar' ? 'ملف KMZ موحد' : 'Single KMZ File'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConverterExportAsZip(true)}
                                                        className={cn(
                                                            "px-2 py-2.5 rounded-lg text-[9px] font-black transition-all border flex items-center justify-center gap-1.5",
                                                            converterExportAsZip
                                                                ? "bg-accent/15 text-accent border-accent/20"
                                                                : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10"
                                                        )}
                                                    >
                                                        <Archive className="w-3.5 h-3.5 text-accent/80" />
                                                        {lang === 'ar' ? 'ملفات منفصلة (ZIP)' : 'Separate KMZs (ZIP)'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* خيار تحسين خرائط جوجل My Maps لمنع التكرار */}
                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between mt-3 animate-in fade-in duration-200">
                                            <div>
                                                <h4 className="text-white font-black text-xs">{lang === 'ar' ? 'تحسين لخرائط Google My Maps' : 'Optimize for Google My Maps'}</h4>
                                                <p className="text-white/50 text-[9px] mt-1">{lang === 'ar' ? 'إزالة جدول الوصف لمنع تكرار البيانات في لوحة My Maps.' : 'Remove description table to prevent duplication in My Maps panel.'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setOptimizeForMyMaps(!optimizeForMyMaps)}
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-colors relative flex-shrink-0",
                                                    optimizeForMyMaps ? "bg-accent" : "bg-white/20"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                                                    optimizeForMyMaps ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                                                )} />
                                            </button>
                                        </div>

                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between mt-3 animate-in fade-in duration-200">
                                            <div>
                                                <h4 className="text-white font-black text-xs">{lang === 'ar' ? 'الاحتفاظ بالبيانات الأصلية والصور' : 'Retain Original Data & Images'}</h4>
                                                <p className="text-white/50 text-[9px] mt-1">{lang === 'ar' ? 'استخدام الوصف والمظهر الأصليين والوسائط من الملف المصدر مباشرة.' : 'Use original description, styling, and media directly from the source file.'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setKeepOriginalDescription(!keepOriginalDescription)}
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-colors relative flex-shrink-0",
                                                    keepOriginalDescription ? "bg-accent" : "bg-white/20"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                                                    keepOriginalDescription ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                                                )} />
                                            </button>
                                        </div>

                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between mt-3 animate-in fade-in duration-200">
                                            <div>
                                                <h4 className="text-white font-black text-xs">{lang === 'ar' ? 'إزالة الصور فقط' : 'Remove Images Only'}</h4>
                                                <p className="text-white/50 text-[9px] mt-1">{lang === 'ar' ? 'حذف جميع الصور والوسائط من داخل منطاد الوصف في ملف KML.' : 'Delete all images and media from inside the description balloon in the KML file.'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setRemoveImagesOnly(!removeImagesOnly)}
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-colors relative flex-shrink-0",
                                                    removeImagesOnly ? "bg-accent" : "bg-white/20"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                                                    removeImagesOnly ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                                                )} />
                                            </button>
                                        </div>

                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                                  <div className="bg-[#08202b] p-4 rounded-2xl border border-accent/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                      <div className="p-2 bg-accent/20 rounded-full shrink-0">
                                        <Zap className="w-5 h-5 text-accent" />
                                      </div>
                                      <div className="text-right sm:text-left flex-1">
                                        <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'وضع التصدير السريع' : 'Fast Export Mode'}</h4>
                                        <p className="text-white/50 text-[9px] mt-0.5">
                                          {lang === 'ar' 
                                            ? 'تصدير الملفات أسرع بكثير (تخطي عملية جلب وتحديث أسماء الشوارع والأحياء)' 
                                            : 'Significantly faster exports (Skips fetching and updating street & district names)'}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); setSkipStreetFetching(!skipStreetFetching); }}
                                      className={cn(
                                        "relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75",
                                        skipStreetFetching ? "bg-accent" : "bg-white/20"
                                      )}
                                    >
                                      <span className="sr-only">Toggle fast export</span>
                                      <span
                                        aria-hidden="true"
                                        className={cn(
                                          "pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                                          skipStreetFetching 
                                            ? (lang === 'ar' ? "-translate-x-1" : "translate-x-6")
                                            : (lang === 'ar' ? "translate-x-6" : "translate-x-0")
                                        )}
                                      />
                                    </button>
                                  </div>

                                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-center gap-2">
                                    <label className="text-white font-black text-sm">
                                      {lang === 'ar' ? 'تصدير طبقة محددة (فلتر):' : 'Export Specific Geometry Layer:'}
                                    </label>
                                    <select
                                      value={converterGeometryFilter}
                                      onChange={(e: any) => setConverterGeometryFilter(e.target.value)}
                                      className="w-full bg-[#0e3f53] border border-white/10 rounded-xl px-4 py-2 text-[11px] font-bold text-white outline-none"
                                    >
                                      <option value="all">{lang === 'ar' ? 'الكل (جميع الأنواع)' : 'All (No Filter)'}</option>
                                      <option value="LineString">{lang === 'ar' ? 'مسارات وخطوط (Lines)' : 'Lines'}</option>
                                      <option value="Polygon">{lang === 'ar' ? 'مضلعات (Polygons)' : 'Polygons'}</option>
                                      <option value="Point">{lang === 'ar' ? 'نقاط وعلامات (Points)' : 'Points'}</option>
                                    </select>
                                  </div>
                                </div>

                                {(() => {
                                  const filteredPoints = converterGeometryFilter === 'all' ? globalPoints : globalPoints.filter(p => p.type === converterGeometryFilter || (!p.type && converterGeometryFilter === 'Point'));
                                  return (
                                    <UniversalExportBar 
                                      data={filteredPoints} 
                                      filename={activeFile.filename} 
                                      lang={lang} 
                                      isExecuting={loading}
                                      runWithLoading={runWithLoading}
                                      onExcelExport={() => executeWithStreetFetching(filteredPoints, selectedHeaders, downloadExcelAnalysis)}
                                      onKmzExport={() => {
                                          executeWithStreetFetching(filteredPoints, selectedHeaders, () => {
                                              if (converterExportAsZip && groupingMode !== 'none') {
                                                  downloadKMZGroupedZip(filteredPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : groupingMode === 'geometry' ? 'geometry' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly, canonicalColorMap: canonicalColorMap, lineStyle: { width: 3 } }, activeFile.headers, selectedHeaders);
                                              } else {
                                                  downloadKMZ(filteredPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : groupingMode === 'geometry' ? 'geometry' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly, canonicalColorMap: canonicalColorMap, lineStyle: { width: 3 } }, activeFile.headers, selectedHeaders);
                                              }
                                          });
                                      }}
                                    />
                                  );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'street-planner' && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                      {!activeFile ? (
                        <FileUploadZone id="planner-up" label={lang === 'ar' ? '1. رفع ملف التصميم / الرفع المساحي' : '1. Upload Design / Survey File'} />
                      ) : (
                        <div className="space-y-4 animate-in slide-in-from-top">
                           <div className="p-6 bg-[#0b2d3d]/60 rounded-[2rem] border border-accent/20 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                 <FileText className="w-5 h-5 text-accent" />
                                 <div className="flex flex-col">
                                    <span className="text-[11px] font-black text-white truncate max-w-[180px]">{activeFile.filename}</span>
                                    <span className="text-[9px] text-white/40 font-bold">{globalPoints.length} {lang === 'ar' ? 'عنصر تم اكتشافه' : 'elements detected'}</span>
                                 </div>
                              </div>
                              <button onClick={() => { setActiveFile(null); setGlobalPoints([]); }} className="p-2 text-white/20 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                           </div>

                           <GeocodingModeSelector mode={geocodingMode} setMode={setGeocodingMode} lang={lang} />

                           <button
                             onClick={handleReverseGeocodeGlobal}
                             className="w-full bg-[#0b2d3d] border-2 border-accent/40 text-accent font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:bg-accent hover:text-primary transition-all text-xs group"
                           >
                              <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                              {lang === 'ar' ? 'جلب الشوارع والعناوين للبيانات المرفوعة' : 'Fetch Streets & Names for Design Data'}
                           </button>
                        </div>
                      )}

                      <div className="h-px bg-white/5 mx-4" />

                      <div className="p-8 bg-[#0b2d3d]/40 rounded-[2.5rem] border border-white/5 shadow-2xl text-center space-y-4">
                          <h2 className="text-white font-black text-sm tracking-tight leading-tight uppercase tracking-widest">{lang === 'ar' ? 'استخراج بيانات من الخريطة' : 'Extract Map Data'}</h2>

                          
                            <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => setIsDrawingMode(!isDrawingMode)} className={cn("p-4 rounded-2xl font-black text-[10px] flex flex-col items-center gap-2 transition-all border shadow-lg group", isDrawingMode ? "bg-accent text-primary border-accent" : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10")}><Navigation className={cn("w-5 h-5 transition-transform group-hover:scale-110", isDrawingMode ? "text-primary" : "text-white/40")} /><span className="leading-tight">{lang === 'ar' ? "ارسم مضلع" : "Draw Polygon"}</span></button>
                              <label className="p-4 bg-white/5 text-white/80 border border-white/10 rounded-2xl font-black text-[10px] flex flex-col items-center gap-2 hover:bg-white/10 transition-all shadow-lg cursor-pointer group"><input type="file" className="hidden" onChange={handleBoundaryUpload} /><FileUp className="w-5 h-5 text-accent/60 group-hover:text-accent transition-colors" /><span className="leading-tight text-center">{lang === 'ar' ? 'رفع حدود' : 'Upload Boundary'}</span></label>
                          </div>

                          <button onClick={handleFetchStreets} disabled={!selectedArea && globalPoints.length === 0} className={cn("w-full py-5 rounded-2xl flex items-center justify-center gap-4 shadow-2xl transition-all font-black text-sm group", (selectedArea || globalPoints.length > 0) ? "bg-accent/10 border-2 border-accent/20 text-accent hover:bg-accent hover:text-primary" : "bg-[#0e3f53]/50 border border-white/5 text-white/20 cursor-not-allowed")}><RefreshCw className={cn("w-6 h-6", (selectedArea || globalPoints.length > 0) ? "animate-spin-slow" : "")} /><span>{lang === 'ar' ? 'جلب شوارع المنطقة المحيطة' : 'Fetch Surrounding Streets'}</span></button>
                      </div>

                      <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4">
                          <div className="flex items-center gap-2 mb-2">
                              <Settings2 className="w-4 h-4 text-accent" />
                              <h3 className="text-white font-black text-[11px] uppercase tracking-wider">{lang === 'ar' ? 'خيارات التخطيط' : 'Planner Options'}</h3>
                          </div>

                          {/* Street Classification Filters */}
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                             <div className="flex items-center gap-2 mb-1">
                                <Filter className="w-3 h-3 text-accent" />
                                <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{t.streetTypes}</span>
                             </div>
                             <div className="flex flex-wrap gap-2">
                                {[
                                  { id: 'motorway', label: t.typeMotorway, color: '#ef4444' },
                                  { id: 'trunk', label: t.typeMain, color: '#ef4444' },
                                  { id: 'secondary', label: t.typeSecondary, color: '#3b82f6' },
                                  { id: 'residential', label: t.typeResidential, color: '#10b981' },
                                  { id: 'service', label: t.typeService, color: '#10b981' }
                                ].map(type => (
                                  <button
                                    key={type.id}
                                    onClick={() => toggleStreetType(type.id)}
                                    className={cn(
                                      "px-3 py-1.5 rounded-full text-[9px] font-black border transition-all flex items-center gap-1.5",
                                      streetTypeFilters.includes(type.id)
                                        ? "bg-accent/20 border-accent text-accent"
                                        : "bg-white/5 border-white/10 text-white/30 hover:text-white/60"
                                    )}
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: type.color }} />
                                    {type.label}
                                  </button>
                                ))}
                             </div>
                          </div>

                          <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                              <div className="flex flex-col gap-1">
                                  <span className="text-[11px] font-black text-white">{lang === 'ar' ? 'قص الشوارع عند الحدود' : 'Clip to Boundary'}</span>
                                  <span className="text-[9px] text-white/40">{lang === 'ar' ? 'إبقاء الشوارع داخل المضلع فقط' : 'Restrict streets to polygon interior'}</span>
                              </div>
                              <button onClick={() => setPlannerClip(!plannerClip)} className={cn("w-10 h-5 rounded-full transition-all relative", plannerClip ? "bg-accent" : "bg-white/10")}>
                                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (plannerClip ? "left-0.5" : "left-5.5") : (plannerClip ? "right-0.5" : "right-5.5"))} />
                              </button>
                          </label>

                          <div className="px-4 py-2 bg-white/5 rounded-2xl space-y-2">
                              <div className="flex items-center justify-between">
                                  <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] font-black text-white">{lang === 'ar' ? 'نطاق البحث الإضافي (Buffer)' : 'Search Buffer (Context)'}</span>
                                      <span className="text-[8px] text-white/40">{lang === 'ar' ? 'جلب الشوارع المحيطة بالمنطقة بمسافة محددة' : 'Fetch streets around the area'}</span>
                                  </div>
                                  <span className="text-xs font-black text-accent">{plannerBuffer}m</span>
                              </div>
                              <input
                                  type="range"
                                  min="0" max="500" step="50"
                                  value={plannerBuffer}
                                  onChange={(e) => setPlannerBuffer(parseInt(e.target.value))}
                                  className="w-full accent-accent h-1 bg-white/10 rounded-full cursor-pointer"
                              />
                          </div>

                          <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                              <div className="flex flex-col gap-1">
                                  <span className="text-[11px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط عند التقاطعات' : 'Split Lines at Intersections'}</span>
                                  <span className="text-[9px] text-white/40">{lang === 'ar' ? 'فصل الشوارع عند التقاطعات لقطع مستقلة' : 'Split streets at every intersection'}</span>
                              </div>
                              <button onClick={() => setPlannerSplitIntersections(!plannerSplitIntersections)} className={cn("w-10 h-5 rounded-full transition-all relative", plannerSplitIntersections ? "bg-accent" : "bg-white/10")}>
                                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (plannerSplitIntersections ? "left-0.5" : "left-5.5") : (plannerSplitIntersections ? "right-0.5" : "right-5.5"))} />
                              </button>
                          </label>

                          <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                              <div className="flex flex-col gap-1">
                                  <span className="text-[11px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط حسب الطول' : 'Split Lines by Length'}</span>
                                  <span className="text-[9px] text-white/40">{lang === 'ar' ? 'تقسيم المسارات المستخرجة لقطع متساوية' : 'Split fetched paths equally'}</span>
                              </div>
                              <button onClick={() => setPlannerSplitLines(!plannerSplitLines)} className={cn("w-10 h-5 rounded-full transition-all relative", plannerSplitLines ? "bg-accent" : "bg-white/10")}>
                                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (plannerSplitLines ? "left-0.5" : "left-5.5") : (plannerSplitLines ? "right-0.5" : "right-5.5"))} />
                              </button>
                          </label>

                          {plannerSplitLines && (
                              <div className="px-4 pb-2 space-y-3 animate-in slide-in-from-top">
                                  <div className="flex items-center justify-between mb-1">
                                      <span className="text-[9px] font-bold text-white/60">{lang === 'ar' ? 'الحد الأقصى (10 - 1000 متر):' : 'Max Length (10 - 1000 m):'}</span>
                                      <div className="flex items-center gap-1 bg-[#0e3f53] px-2.5 py-0.5 rounded-lg border border-white/10 shadow-inner">
                                        <input
                                          type="number"
                                          min="10"
                                          max="10000"
                                          step="10"
                                          value={plannerMaxLen}
                                          onChange={(e) => setPlannerMaxLen(Math.max(10, parseInt(e.target.value) || 10))}
                                          className="w-14 bg-transparent text-xs font-black text-accent outline-none text-center select-text"
                                        />
                                        <span className="text-[10px] font-bold text-accent">{lang === 'ar' ? 'م' : 'm'}</span>
                                      </div>
                                  </div>
                                  <input
                                      type="range"
                                      min="10" max="1000" step="10"
                                      value={Math.min(plannerMaxLen, 1000)}
                                      onChange={(e) => setPlannerMaxLen(parseInt(e.target.value))}
                                      className="w-full accent-accent h-1.5 bg-white/10 rounded-full cursor-pointer"
                                  />
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {[10, 20, 50, 100, 200, 500, 1000].map((val) => (
                                      <button
                                        key={val}
                                        type="button"
                                        onClick={() => setPlannerMaxLen(val)}
                                        className={cn(
                                          "px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all border",
                                          plannerMaxLen === val
                                            ? "bg-accent text-primary border-accent shadow-md font-black scale-105"
                                            : "bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white"
                                        )}
                                      >
                                        {val} {lang === 'ar' ? 'م' : 'm'}
                                      </button>
                                    ))}
                                  </div>
                              </div>
                          )}
                      </div>

                      {(plannedStreets.length > 0 || globalPoints.length > 0) && (
                        <div className="space-y-4 animate-in slide-in-from-bottom pb-10">
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5 space-y-3">
                                <div className="flex items-center justify-between mb-4">
                                   <span className="text-[10px] font-black text-white/40 uppercase">{lang === 'ar' ? 'ملخص المشروع' : 'Project Summary'}</span>
                                   <div className="flex gap-2">
                                      <span className="px-3 py-1 bg-accent/10 text-accent rounded-full text-[9px] font-black">{globalPoints.length} {lang === 'ar' ? 'تصميم' : 'Design'}</span>
                                      <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[9px] font-black">{plannedStreets.length} {lang === 'ar' ? 'شوارع' : 'Streets'}</span>
                                   </div>
                                </div>
                                <UniversalExportBar
                                    data={[...globalPoints, ...plannedStreets]}
                                    filename={activeFile?.filename || 'Full_Street_Project'}
                                    lang={lang}
                                    isExecuting={loading}
                                    runWithLoading={runWithLoading}
                                    onExcelExport={downloadExcelWithStreets}
                                    onKmzExport={() => executeWithStreetFetching([...globalPoints, ...plannedStreets], selectedHeaders, () => { downloadKMZ([...globalPoints, ...plannedStreets], "Full_Street_Project", { mode: 'none', groupByAttribute: 'layer', optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile?.headers, selectedHeaders) })}
                                />
                                <button onClick={() => { setSelectedArea(null); setPlannedStreets([]); setBoundaryPolygon(null); setIsDrawingMode(false); setActiveFile(null); setGlobalPoints([]); }} className="w-full mt-2 bg-white/5 text-white/40 font-black py-3 rounded-xl flex items-center justify-center gap-2 hover:text-red-400 transition-all text-[10px] uppercase"><Trash2 className="w-3 h-3" />{lang === 'ar' ? 'إفراغ مساحة العمل' : 'Clear Workspace'}</button>
                            </div>
                        </div>
                      )}
                  </div>
                )}

                {activeTab === 'analyzer' && (activeFile || plannedStreets.length > 0) && (
                  <div className="space-y-6 animate-in fade-in duration-500 pb-10">
                      <div className="p-10 bg-[#0b2d3d]/60 rounded-[3rem] border border-accent/20 shadow-2xl text-center space-y-4 relative overflow-hidden">
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setActiveFile(null); setGlobalPoints([]); setPlannedStreets([]); setUploadSourceMode('link'); }}
                                title={lang === 'ar' ? 'استيراد رابط Google My Maps جديد' : 'Import new Google My Maps link'}
                                className="p-2 bg-accent/10 hover:bg-accent hover:text-primary text-accent rounded-full transition-all border border-accent/20 flex items-center justify-center"
                              >
                                  <Globe className="w-4 h-4" />
                              </button>
                              <label title={lang === 'ar' ? 'تحديث/تغيير الملف المحلي' : 'Update/Change local file'} className="p-2 bg-accent/10 hover:bg-accent hover:text-primary text-accent rounded-full transition-all cursor-pointer group border border-accent/20">
                                  <input type="file" className="hidden" onChange={handleFileUpload} />
                                  <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                                  <span className="sr-only">{lang === 'ar' ? 'تحديث الملف' : 'Update File'}</span>
                              </label>
                          </div>
                          <div className="w-20 h-20 bg-accent/5 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-accent/30 p-2"><div className="w-full h-full bg-accent/10 rounded-full flex items-center justify-center"><PieChart className="w-10 h-10 text-accent" /></div></div>
                          <div className="space-y-1"><h2 className="text-white font-black text-2xl tracking-tight leading-tight">{lang === 'ar' ? 'نتائج تحليل الملف' : 'File Analysis Results'}</h2><p className="text-[10px] text-white/40 font-bold uppercase tracking-widest leading-relaxed max-w-[250px] mx-auto">{activeFile?.filename || (lang === 'ar' ? 'تحليل المخطط الحالي' : 'Analyzing Planned Streets')}</p></div>
                      </div>

                      {/* Network Type Filter Selector for Water vs Sewer separation */}
                      <div className="bg-[#0b2d3d]/90 p-5 rounded-[2.5rem] border border-accent/30 space-y-3 shadow-xl animate-in slide-in-from-top">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-accent" />
                            <h3 className="text-white font-black text-xs uppercase tracking-wider">
                              {lang === 'ar' ? 'نوع الشبكة في التقرير' : 'Network Type Filter'}
                            </h3>
                          </div>
                          <span className="text-[10px] font-black text-accent bg-accent/20 px-2.5 py-1 rounded-full border border-accent/30">
                            {analyzerNetworkType === 'water'
                              ? (lang === 'ar' ? '💧 مياه الشرب' : '💧 Water')
                              : analyzerNetworkType === 'sewer'
                              ? (lang === 'ar' ? '🟣 الصرف الصحي' : '🟣 Sewer')
                              : (lang === 'ar' ? '🌐 جميع الشبكات' : '🌐 All Networks')}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setAnalyzerNetworkType('all')}
                            className={cn(
                              "py-3 px-2 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border",
                              analyzerNetworkType === 'all'
                                ? "bg-accent text-primary border-accent shadow-lg scale-[1.02]"
                                : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            <Layers className="w-4 h-4" />
                            <span>{lang === 'ar' ? 'الكل' : 'All'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAnalyzerNetworkType('water')}
                            className={cn(
                              "py-3 px-2 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border",
                              analyzerNetworkType === 'water'
                                ? "bg-[#00c8b3] text-[#032330] border-[#00c8b3] shadow-lg scale-[1.02]"
                                : "bg-[#00c8b3]/10 text-[#00c8b3] border-[#00c8b3]/30 hover:bg-[#00c8b3]/20"
                            )}
                          >
                            <Droplet className="w-4 h-4" />
                            <span>{lang === 'ar' ? 'مياه' : 'Water'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAnalyzerNetworkType('sewer')}
                            className={cn(
                              "py-3 px-2 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border",
                              analyzerNetworkType === 'sewer'
                                ? "bg-[#d946ef] text-[#160b2d] border-[#d946ef] shadow-lg scale-[1.02]"
                                : "bg-[#d946ef]/10 text-[#d946ef] border-[#d946ef]/30 hover:bg-[#d946ef]/20"
                            )}
                          >
                            <Droplet className="w-4 h-4 rotate-180" />
                            <span>{lang === 'ar' ? 'صرف صحي' : 'Sewer'}</span>
                          </button>
                        </div>
                      </div>
                      {analysisData.length > 0 && (
                        <div className="bg-accent/10 p-6 rounded-[2.5rem] border border-accent/20 space-y-4 animate-in slide-in-from-top">
                           <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-accent" />
                                <h3 className="text-accent font-black text-[11px] uppercase tracking-wider">{lang === 'ar' ? 'حساسية دمج الألوان' : 'Color Merging Sensitivity'}</h3>
                              </div>
                              <span className="text-[10px] font-black text-accent bg-accent/20 px-2 py-0.5 rounded-full">{mergeThreshold}</span>
                           </div>
                           <input
                              type="range"
                              min="0"
                              max="150"
                              step="5"
                              value={mergeThreshold}
                              onChange={(e) => setMergeThreshold(parseInt(e.target.value))}
                              className="w-full accent-accent h-1.5 bg-accent/10 rounded-full cursor-pointer"
                           />
                           <div className="flex justify-between text-[8px] font-black text-white/40 uppercase tracking-widest">
                              <span>{lang === 'ar' ? 'دقيق جداً' : 'Very Strict'}</span>
                              <span>{lang === 'ar' ? 'دمج واسع' : 'Wide Merge'}</span>
                           </div>
                        </div>
                      )}

                      {analysisData.length > 0 && (
                        <div className="space-y-6 animate-in slide-in-from-bottom duration-700">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl text-center space-y-2 relative overflow-hidden">
                                  <Layers className="w-6 h-6 text-accent mx-auto mb-1 opacity-60" />
                                  <span className="text-[10px] font-black text-white/40 block uppercase">{lang === 'ar' ? 'أصناف الألوان' : 'Color Groups'}</span>
                                  <span className="text-3xl font-black text-white">{analysisData.length}</span>
                                </div>
                                <div className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl text-center space-y-2 relative overflow-hidden">
                                  <Ruler className="w-6 h-6 text-accent mx-auto mb-1 opacity-60" />
                                  <span className="text-[10px] font-black text-white/40 block uppercase">{lang === 'ar' ? 'إجمالي الأطوال' : 'Total Length'}</span>
                                  <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-3xl font-black text-white">{(analysisData.reduce((a,b)=>a+b.totalLength,0)/1000).toFixed(2)}</span>
                                    <span className="text-[10px] font-black text-accent">{lang === 'ar' ? 'كم' : 'km'}</span>
                                  </div>
                                </div>
                            </div>
                        </div>
                      )}

                            {/* Summary of KML placemarks categorized by feature type */}
                            <div id="placemarks-summary" className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl space-y-4 animate-in slide-in-from-bottom duration-700">
                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Shapes className="w-4 h-4 text-accent" />
                                        <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                            {lang === 'ar' ? 'أقسام عناصر الخريطة' : 'KML Placemarks'}
                                        </h3>
                                    </div>
                                    <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                                        {lang === 'ar' ? '🎯 تحليل الخطوط فقط (Lines)' : '🎯 Lines Only Analyzed'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div id="points-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <CircleDot className="w-4 h-4 text-accent/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'نقاط' : 'Points'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.points}</span>
                                    </div>
                                    <div id="lines-stat" className="bg-accent/20 border border-accent/40 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <Activity className="w-4 h-4 text-accent mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-accent block uppercase">{lang === 'ar' ? 'مسارات (محللة)' : 'Lines (Analyzed)'}</span>
                                        <span className="text-lg font-black text-accent mt-1">{placemarksSummary.lines}</span>
                                    </div>
                                    <div id="polygons-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <MapIcon className="w-4 h-4 text-accent/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'مساحات' : 'Polygons'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.polygons}</span>
                                    </div>
                                    <div id="total-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <Hash className="w-4 h-4 text-white/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.total}</span>
                                    </div>
                                </div>
                                <p className="text-[9.5px] font-bold text-white/50 text-center leading-relaxed pt-1">
                                    {lang === 'ar'
                                        ? '💡 يتم حساب الأطوال والإحصائيات وتصنيف الألوان للمسارات والشبكات فقط (Lines/LineString). تم استبعاد النقاط والمضلعات تلقائياً من تحليلات الأطوال.'
                                        : '💡 Lengths and color analytics are calculated strictly for line features (LineString). Points and Polygons are excluded from length metrics.'}
                                </p>
                            </div>

                                                        {/* Interactive Charts */}
                            <div className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl space-y-6 animate-in slide-in-from-bottom duration-700">
                                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-accent" />
                                        <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                            {lang === 'ar' ? 'توزيع الأطوال (كم) حسب حالة التنفيذ والقطر' : 'Length Distribution (km) by Execution Status & Diameter'}
                                        </h3>
                                    </div>
                                    <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                                        {lang === 'ar' ? 'رسوم بيانية تفاعلية' : 'Interactive Charts'}
                                    </span>
                                </div>

                                <div className="space-y-6">
                                    {/* 1. By Execution Status Section */}
                                    <div className="p-5 bg-black/20 rounded-2xl border border-white/5 space-y-4">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <h4 className="text-accent text-xs font-black uppercase flex items-center gap-1.5">
                                                <PieChart className="w-4 h-4 text-accent" />
                                                {lang === 'ar' ? '1. حسب حالة التنفيذ' : '1. By Execution Status'}
                                            </h4>
                                            {executionStatusDistribution.length > 0 && (
                                                <span className="text-[10.5px] text-white/70 font-black bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 shadow-sm">
                                                    {lang === 'ar' 
                                                        ? `الإجمالي: ${executionStatusDistribution.reduce((a, b) => a + b.value, 0).toFixed(2)} كم`
                                                        : `Total: ${executionStatusDistribution.reduce((a, b) => a + b.value, 0).toFixed(2)} km`}
                                                </span>
                                            )}
                                        </div>

                                        {executionStatusDistribution.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                                                {/* Donut Chart */}
                                                <div className="sm:col-span-5 h-[200px] w-full relative flex items-center justify-center bg-white/[0.02] rounded-2xl border border-white/5 p-1">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <RechartsPieChart>
                                                            <Pie 
                                                                data={executionStatusDistribution} 
                                                                dataKey="value" 
                                                                nameKey="name" 
                                                                cx="50%" 
                                                                cy="50%" 
                                                                innerRadius={42} 
                                                                outerRadius={72}
                                                                paddingAngle={3}
                                                                label={false}
                                                            >
                                                                {executionStatusDistribution.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0b2d3d" strokeWidth={2} />
                                                                ))}
                                                            </Pie>
                                                            <RechartsTooltip 
                                                                formatter={(value: any) => [`${value} ${lang === 'ar' ? 'كم' : 'km'}`, lang === 'ar' ? 'الطول' : 'Length']} 
                                                                contentStyle={{ backgroundColor: '#031822', borderColor: '#ffffff20', color: '#fff', fontSize: '11px', borderRadius: '12px', padding: '8px 12px', zIndex: 99999 }} 
                                                                itemStyle={{ color: '#00c8b3' }} 
                                                            />
                                                        </RechartsPieChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* Clean Structured Legend */}
                                                <div className="sm:col-span-7 space-y-2">
                                                    {executionStatusDistribution.map((item, idx) => {
                                                        const totalVal = executionStatusDistribution.reduce((a, b) => a + b.value, 0);
                                                        const pct = item.percent !== undefined ? item.percent : (totalVal > 0 ? (item.value / totalVal) * 100 : 0);
                                                        return (
                                                            <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-xs">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-md border border-white/20" style={{ backgroundColor: item.color }} />
                                                                    <span className="font-extrabold text-white text-[11px] leading-snug truncate" title={item.name}>{item.name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className="font-black text-white text-[11px]">{item.value} {lang === 'ar' ? 'كم' : 'km'}</span>
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-[9.5px] font-black text-accent">{pct.toFixed(0)}%</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-28 flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                <PieChart className="w-7 h-7 mb-1 opacity-20" />
                                                {lang === 'ar' ? 'لا يوجد بيانات حالة تنفيذ' : 'No execution status data'}
                                            </div>
                                        )}
                                    </div>

                                    {/* 2. By Diameter Section */}
                                    <div className="p-5 bg-black/20 rounded-2xl border border-white/5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-accent text-[11px] font-black uppercase flex items-center gap-1.5">
                                                <BarChart3 className="w-3.5 h-3.5 text-accent" />
                                                {lang === 'ar' ? '2. حسب القطر' : '2. By Diameter'}
                                            </h4>
                                            {diameterDistribution.length > 0 && (
                                                <span className="text-[10px] text-white/50 font-bold bg-white/5 px-2 py-0.5 rounded-lg border border-white/10">
                                                    {lang === 'ar' ? `${diameterDistribution.length} أقطار` : `${diameterDistribution.length} Diameters`}
                                                </span>
                                            )}
                                        </div>

                                        {diameterDistribution.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="h-[210px] w-full relative">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={diameterDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                                            <XAxis 
                                                                dataKey="name" 
                                                                tick={{ fill: '#ffffff80', fontSize: 10, fontWeight: 700 }} 
                                                                axisLine={{ stroke: '#ffffff20' }}
                                                                tickLine={{ stroke: '#ffffff20' }}
                                                                interval={0}
                                                                angle={-20}
                                                                textAnchor="end"
                                                            />
                                                            <YAxis 
                                                                tick={{ fill: '#ffffff60', fontSize: 10 }} 
                                                                axisLine={{ stroke: '#ffffff20' }}
                                                                tickLine={{ stroke: '#ffffff20' }}
                                                            />
                                                            <RechartsTooltip 
                                                                formatter={(value: any) => [`${value} ${lang === 'ar' ? 'كم' : 'km'}`, lang === 'ar' ? 'الطول' : 'Length']} 
                                                                contentStyle={{ backgroundColor: '#031822', borderColor: '#ffffff20', color: '#fff', fontSize: '11px', borderRadius: '12px', padding: '8px 12px', zIndex: 99999 }} 
                                                                itemStyle={{ color: '#00c8b3' }} 
                                                                cursor={{ fill: '#ffffff08' }} 
                                                            />
                                                            <Bar dataKey="value" fill="#00c8b3" radius={[6, 6, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* Mini Diameter Badges List */}
                                                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                                                    {diameterDistribution.map((d, i) => (
                                                        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px]">
                                                            <span className="text-white/60 font-bold">{d.name}:</span>
                                                            <span className="text-accent font-black">{d.value} {lang === 'ar' ? 'كم' : 'km'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-28 flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                <BarChart3 className="w-7 h-7 mb-1 opacity-20" />
                                                {lang === 'ar' ? 'لا يوجد بيانات قطر' : 'No diameter data'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Spatial Overlap & Duplicate Matching Detection */}
                            <div className="p-6 bg-[#0b2d3d]/80 rounded-[2.5rem] border border-white/5 shadow-xl space-y-5 animate-in slide-in-from-bottom duration-700">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <AlertTriangle className="w-4 h-4 text-accent" />
                                    <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                        {lang === 'ar' ? 'فحص ومعالجة التطابق والتداخل' : 'Spatial Matching & Intersection Control'}
                                    </h3>
                                </div>

                                {/* Section 1: التطابق (خط فوق خط) */}
                                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black text-amber-400 flex items-center gap-1.5">
                                            <span>⬛</span>
                                            {lang === 'ar' ? '1. التطابق (وجود عنصر خط فوق خط):' : '1. Matching Duplicates (Line on Line):'}
                                        </span>
                                    </div>

                                    {/* Duplicate Tolerance Distance Input */}
                                    <div className="flex items-center justify-between gap-2 bg-black/30 p-2.5 rounded-xl border border-white/10 text-[11px]">
                                        <span className="text-white/80 font-bold">
                                            {lang === 'ar' ? 'مقياس تحمل التطابق (متر):' : 'Matching Scale / Tolerance (Meters):'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="0.1"
                                                max="500"
                                                step="0.5"
                                                value={duplicateTolerance}
                                                onChange={(e) => {
                                                    const val = Math.max(0.1, parseFloat(e.target.value) || 5);
                                                    setDuplicateTolerance(val);
                                                    localStorage.setItem('duplicateTolerance', JSON.stringify(val));
                                                }}
                                                className="w-20 px-2 py-1 bg-white/10 text-amber-300 font-black rounded-lg text-center border border-white/15 focus:outline-none focus:border-amber-400"
                                            />
                                            <span className="text-white/50 font-bold">m</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <button
                                            onClick={handleCheckDuplicates}
                                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-black py-2.5 px-3 rounded-xl transition-all border border-amber-500/20 text-[11px] flex items-center justify-center gap-1.5"
                                        >
                                            <Search className="w-3.5 h-3.5" />
                                            {lang === 'ar' ? 'فحص التطابق' : 'Check Duplicates'}
                                        </button>
                                        <button
                                            onClick={handleColorDuplicatesBlack}
                                            className="bg-slate-900 hover:bg-black text-white font-black py-2.5 px-3 rounded-xl transition-all border border-white/20 text-[11px] flex items-center justify-center gap-1.5 shadow-md"
                                            title={lang === 'ar' ? 'تلوين الخطوط المتطابقة باللون الأسود' : 'Color matching duplicate lines black'}
                                        >
                                            <Palette className="w-3.5 h-3.5 text-white" />
                                            {lang === 'ar' ? 'تلوين بالأسود ⬛' : 'Color Black ⬛'}
                                        </button>
                                        <button
                                            onClick={handleResolveDuplicates}
                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black py-2.5 px-3 rounded-xl transition-all border border-red-500/20 text-[11px] flex items-center justify-center gap-1.5"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            {lang === 'ar' ? 'حذف المتطابقة 🗑️' : 'Delete Duplicates'}
                                        </button>
                                    </div>
                                </div>

                                 {/* Section 2: تقاطعات الخطوط (نقاط العبور والتلاقي) */}
                                <div className="p-4 bg-black/20 rounded-2xl border border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black text-cyan-400 flex items-center gap-1.5">
                                            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                                            {lang === 'ar' ? '2. تقاطعات الخطوط (نقاط العبور والتلاقي):' : '2. Line Intersections (Crossing Junctions):'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-white/60 leading-relaxed">
                                        {lang === 'ar' ? 'فحص الخطوط التي تتقاطع وتتلاقى عند نقطة عبور (مستقل تماماً عن التطابق).' : 'Check lines that intersect at crossing points (completely independent from duplicates).'}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button
                                            onClick={handleCheckIntersections}
                                            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-black py-2.5 px-3 rounded-xl transition-all border border-cyan-500/20 text-[11px] flex items-center justify-center gap-1.5"
                                        >
                                            <Search className="w-3.5 h-3.5" />
                                            {lang === 'ar' ? 'فحص التقاطعات' : 'Check Intersections'}
                                        </button>
                                        <button
                                            onClick={handleTrimIntersections}
                                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-black py-2.5 px-3 rounded-xl transition-all border border-blue-500/20 text-[11px] flex items-center justify-center gap-1.5"
                                        >
                                            <Scissors className="w-3.5 h-3.5" />
                                            {lang === 'ar' ? 'تقليم عند التقاطعات ✂️' : 'Trim Intersections ✂️'}
                                        </button>
                                    </div>
                                </div>

                                {overlapResults && (
                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <button
                                            onClick={handleResolveDuplicates}
                                            className="flex-1 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 font-black py-2.5 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2 shadow-lg"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            {lang === 'ar' ? 'حذف العناصر المتطابقة 🗑️' : 'Delete Duplicates 🗑️'}
                                        </button>
                                        <button
                                            onClick={() => setOverlapResults(null)}
                                            className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black rounded-xl transition-all border border-red-500/20 flex items-center justify-center py-2.5"
                                            title={lang === 'ar' ? 'مسح النتائج' : 'Clear Results'}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* W_MAINLINE Geodatabase Layer Metrics Card */}
                            {wMainlineStats.count > 0 && (
                              <div id="w-mainline-geodatabase-analysis" className="p-6 bg-[#032330] border border-[#00c8b3]/30 rounded-[2.5rem] shadow-[0_4px_30px_rgba(0,180,180,0.15)] space-y-6 animate-in slide-in-from-bottom duration-700">
                                 <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                     <div className="flex items-center gap-2">
                                         <Droplet className="w-5 h-5 text-[#00c8b3] animate-pulse" />
                                         <h3 className="text-white font-black text-xs uppercase tracking-wider">
                                             {lang === 'ar' ? 'أطوال وتصنيف طبقة W_MAINLINE' : 'W_MAINLINE Layer Analytics'}
                                         </h3>
                                     </div>
                                     <span className="text-[9px] text-[#00c8b3] bg-[#00c8b3]/10 px-2.5 py-1 rounded-full font-black uppercase tracking-widest">
                                        NWC Standards
                                     </span>
                                 </div>

                                 {/* Summary Grid */}
                                 <div className="grid grid-cols-3 gap-2">
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'إجمالي الأطوال' : 'Total Length'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {(wMainlineStats.totalLength / 1000).toFixed(3)}
                                             <span className="text-[9px] text-[#00c8b3] font-bold ml-0.5">km</span>
                                         </div>
                                     </div>
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'عدد القطاعات' : 'Segments Count'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {wMainlineStats.count}
                                             <span className="text-[9px] text-[#00c8b3] font-bold ml-0.5">{lang === 'ar' ? 'قطاع' : 'pcs'}</span>
                                         </div>
                                     </div>
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'متوسط قطاع' : 'Avg Segment'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {(wMainlineStats.totalLength / wMainlineStats.count).toFixed(1)}
                                             <span className="text-[9px] text-[#00c8b3] font-bold ml-0.5">m</span>
                                         </div>
                                     </div>
                                 </div>

                                 {/* Material Breakdown */}
                                 <div className="space-y-3">
                                     <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">
                                         {lang === 'ar' ? 'الأطوال حسب نوع المواد' : 'Material Length Apportionment'}
                                     </span>
                                     <div className="space-y-2 bg-black/10 rounded-2xl p-3 border border-white/5">
                                         {Object.entries(wMainlineStats.materialLengths).map(([material, length]) => {
                                              const percentage = ((Number(length) / wMainlineStats.totalLength) * 100).toFixed(1);
                                              return (
                                                  <div key={material} className="space-y-1">
                                                      <div className="flex justify-between text-[10px] font-bold text-white/80">
                                                          <span>{material}</span>
                                                          <span>{(Number(length) / 1000).toFixed(3)} km ({percentage}%)</span>
                                                      </div>
                                                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                          <div className="h-full rounded-full bg-[#00c8b3]" style={{ width: `${percentage}%` }} />
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  </div>

                                  {/* Diameter Apportionment */}
                                  <div className="space-y-3">
                                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">
                                          {lang === 'ar' ? 'الأطوال حسب الأقطار القياسية' : 'Standard Diameters Apportionment'}
                                      </span>
                                      <div className="grid grid-cols-2 gap-2">
                                          {Object.entries(wMainlineStats.diameterLengths).map(([diameter, length]) => (
                                              <div key={diameter} className="bg-black/10 rounded-xl p-2.5 border border-[#00c8b3]/20 flex items-center justify-between">
                                                  <div className="flex items-center gap-1.5">
                                                     <div className="w-2 h-2 rounded-full bg-[#00a8e8]" />
                                                     <span className="text-[10px] font-black text-white">{diameter}</span>
                                                  </div>
                                                  <span className="text-[10px] font-bold text-[#00c8b3]">{(Number(length) / 1000).toFixed(3)} km</span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Dedicated EXPORT buttons specifically for W_MAINLINE */}
                                  <div className="space-y-3">
                                      <button
                                          onClick={() => executeWithStreetFetching(wMainlineStats.segments, selectedHeaders, () => { downloadKMZ(wMainlineStats.segments, "W_MAINLINE_network_map", { mode: 'none', optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile?.headers, selectedHeaders) })}
                                          className="w-full bg-[#00c8b3] hover:brightness-110 active:scale-95 text-[#032330] font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all text-xs group"
                                      >
                                          <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                                          <span>{lang === 'ar' ? 'تصدير طبقة W_MAINLINE كـ KMZ منفصل' : 'Export W_MAINLINE Only to KMZ'}</span>
                                      </button>
                                      <button
                                          onClick={() => runWithLoading(lang === 'ar' ? 'جاري تجهيز وتصدير العرض التقديمي (PPTX)...' : 'Preparing PPTX presentation...', () => generateWMainlinePPTX(wMainlineStats, activeFile?.filename || "Water_Mainline_Project", lang))}
                                          className="w-full bg-[#0b2d3d] hover:bg-[#113f54] border-2 border-[#00c8b3]/30 text-accent font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:border-[#00c8b3] transition-all text-xs group"
                                      >
                                          <Presentation className="w-5 h-5 text-accent group-hover:rotate-6 transition-transform" />
                                          <span>{lang === 'ar' ? 'تصدير عرض تقديمي احترافي (PPTX)' : 'Export Professional PPTX Presentation'}</span>
                                      </button>
                                  </div>
                              </div>
                            )}

                            {/* WW_MAINLINE Geodatabase Layer Metrics Card */}
                            {wwMainlineStats.count > 0 && (
                              <div id="ww-mainline-geodatabase-analysis" className="p-6 bg-[#160b2d]/90 border border-[#d946ef]/40 rounded-[2.5rem] shadow-[0_4px_30px_rgba(217,70,239,0.15)] space-y-6 animate-in slide-in-from-bottom duration-700 text-left">
                                 <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                     <div className="flex items-center gap-2">
                                         <Droplet className="w-5 h-5 text-[#d946ef] animate-pulse rotate-180" />
                                         <h3 className="text-white font-black text-xs uppercase tracking-wider">
                                             {lang === 'ar' ? 'أطوال وتصنيف طبقة الصرف الصحي WW_MAINLINE' : 'WW_MAINLINE Sewer Layer Analytics'}
                                         </h3>
                                     </div>
                                     <span className="text-[9px] text-[#d946ef] bg-[#d946ef]/10 px-2.5 py-1 rounded-full font-black uppercase tracking-widest">
                                        Sewer Standards
                                     </span>
                                 </div>

                                 {/* Summary Grid */}
                                 <div className="grid grid-cols-3 gap-2">
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'إجمالي الأطوال' : 'Total Length'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {(wwMainlineStats.totalLength / 1000).toFixed(3)}
                                             <span className="text-[9px] text-[#d946ef] font-bold ml-0.5">km</span>
                                         </div>
                                     </div>
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'عدد القطاعات' : 'Segments Count'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {wwMainlineStats.count}
                                             <span className="text-[9px] text-[#d946ef] font-bold ml-0.5">{lang === 'ar' ? 'قطاع' : 'pcs'}</span>
                                         </div>
                                     </div>
                                     <div className="bg-white/5 rounded-2xl p-3 text-center">
                                         <span className="text-[8px] font-bold text-white/40 block pb-1">
                                             {lang === 'ar' ? 'متوسط قطاع' : 'Avg Run'}
                                         </span>
                                         <div className="text-white font-black text-[13px]">
                                             {(wwMainlineStats.totalLength / wwMainlineStats.count).toFixed(1)}
                                             <span className="text-[9px] text-[#d946ef] font-bold ml-0.5">m</span>
                                         </div>
                                     </div>
                                 </div>

                                 {/* Material Breakdown */}
                                 <div className="space-y-3">
                                     <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">
                                         {lang === 'ar' ? 'الأطوال حسب نوع المواد' : 'Material Length Apportionment'}
                                     </span>
                                     <div className="space-y-2 bg-black/10 rounded-2xl p-3 border border-white/5">
                                         {Object.entries(wwMainlineStats.materialLengths).map(([material, length]) => {
                                             const percentage = ((Number(length) / wwMainlineStats.totalLength) * 100).toFixed(1);
                                             return (
                                                 <div key={material} className="space-y-1 text-left">
                                                     <div className="flex justify-between text-[10px] font-bold text-white/80">
                                                         <span>{material}</span>
                                                         <span>{(Number(length) / 1000).toFixed(3)} km ({percentage}%)</span>
                                                     </div>
                                                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                         <div className="h-full rounded-full bg-[#d946ef]" style={{ width: `${percentage}%` }} />
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 </div>

                                 {/* Diameter Apportionment */}
                                 <div className="space-y-3">
                                     <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">
                                         {lang === 'ar' ? 'الأطوال حسب الأقطار القياسية' : 'Standard Diameters Apportionment'}
                                     </span>
                                     <div className="grid grid-cols-2 gap-2">
                                         {Object.entries(wwMainlineStats.diameterLengths).map(([diameter, length]) => (
                                             <div key={diameter} className="bg-black/10 rounded-xl p-2.5 border border-[#d946ef]/20 flex items-center justify-between">
                                                 <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                                                    <span className="text-[10px] font-black text-white">{diameter}</span>
                                                 </div>
                                                 <span className="text-[10px] font-bold text-[#d946ef]">{(Number(length) / 1000).toFixed(3)} km</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Dedicated EXPORT buttons specifically for WW_MAINLINE */}
                                 <div className="space-y-3">
                                     <button
                                         onClick={() => executeWithStreetFetching(wwMainlineStats.segments, selectedHeaders, () => { downloadKMZ(wwMainlineStats.segments, "WW_MAINLINE_sewer_map", { mode: 'none', optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile?.headers, selectedHeaders) })}
                                         className="w-full bg-[#d946ef] hover:brightness-110 active:scale-95 text-[#160b2d] font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all text-xs group"
                                     >
                                         <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                                         <span>{lang === 'ar' ? 'تصدير طبقة WW_MAINLINE كـ KMZ منفصل' : 'Export WW_MAINLINE Only to KMZ'}</span>
                                     </button>
                                     <button
                                         onClick={() => runWithLoading(lang === 'ar' ? 'جاري تجهيز وتصدير العرض التقديمي (PPTX)...' : 'Preparing PPTX presentation...', () => generateWWMainlinePPTX(wwMainlineStats, activeFile?.filename || "Sewer_Mainline_Project", lang))}
                                         className="w-full bg-[#1e053f] hover:bg-[#2e0b5f] border-2 border-[#d946ef]/30 text-[#d946ef] font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:border-[#d946ef] transition-all text-xs group"
                                     >
                                         <Presentation className="w-5 h-5 text-[#d946ef] group-hover:rotate-6 transition-transform" />
                                         <span>{lang === 'ar' ? 'تصدير عرض تقديمي احترافي (PPTX)' : 'Export Professional PPTX Presentation'}</span>
                                     </button>
                                 </div>
                              </div>
                            )}

                            <div className="h-6" />
                            <UniversalExportBar
                                data={analyzerExportPoints}
                                filename={activeFile?.filename || 'Analyzed'}
                                lang={lang}
                                isExecuting={loading}
                                runWithLoading={runWithLoading}
                                onExcelExport={() => executeWithStreetFetching(analyzerExportPoints, selectedHeaders, downloadExcelAnalysis)}
                                onKmzExport={() => executeWithStreetFetching(analyzerExportPoints, selectedHeaders, () => { downloadKMZ(analyzerExportPoints, `Analyzed_${activeFile?.filename || 'File'}`, { mode: 'none', groupByAttribute: 'color', canonicalColorMap: canonicalColorMap, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile?.headers, selectedHeaders) })}
                            />
                            
                            <button 
                                onClick={() => executeWithStreetFetching(analyzerExportPoints, selectedHeaders, () => { downloadKMZGroupedZip(analyzerExportPoints, activeFile?.filename || 'Analyzed', { mode: 'none', groupByAttribute: 'color', optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly, canonicalColorMap: canonicalColorMap, lineStyle: { width: 3 } }, activeFile?.headers, selectedHeaders) })}
                                className="w-full bg-[#0b2d3d] border border-blue-400/40 text-blue-400 font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-blue-500 hover:text-white transition-all text-sm group mt-3"
                            >
                                <FolderArchive className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'تصدير KMZ مقسم حسب الألوان (ملف ZIP منفصل)' : 'Export KMZ Grouped by Colors (ZIP)'}
                            </button>

                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري تجهيز وتصدير ملف الإكسل...' : 'Preparing Excel export...', downloadExcelWithStreets)} className="w-full bg-[#0b2d3d] border border-accent/40 text-accent font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-accent hover:text-primary transition-all text-sm group mt-3">
                                <MapPinIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'تصدير إكسل مع أسماء الشوارع' : 'Export Excel with Streets'}
                            </button>
                            
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري تحليل وفحص الفجوات والخطوط المقطوعة (Network Gaps)...' : 'Auditing network gaps...', verifyNetworkGaps)} className="w-full bg-[#3d180b] border border-[#FF3300]/60 text-[#ff8c66] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF3300] hover:text-white transition-all text-sm group">
                                <GitBranch className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FF3300] group-hover:text-white" />
                                {lang === 'ar' ? 'فحص وإبراز الفجوات الشبكية (Network Gaps)' : 'Highlight Network Gaps & Disconnected Lines'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري تصدير تقرير الفجوات الشبكية Excel...' : 'Exporting gaps report (Excel)...', exportNetworkGapsExcel)} className="w-full bg-[#2a120b] border border-[#FF3300]/40 text-[#ffaa80] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF3300]/80 hover:text-white transition-all text-sm group">
                                <FileSpreadsheet className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FF3300] group-hover:text-white" />
                                {lang === 'ar' ? 'تصدير تقرير الفجوات الشبكية Excel' : 'Export Network Gaps Report (Excel)'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري توليد وتصدير تقرير الفجوات PDF...' : 'Exporting gaps report (PDF)...', exportNetworkGapsPDFHandler)} className="w-full bg-[#2a120b] border border-[#FF3300]/50 text-[#ffaa80] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF3300] hover:text-white transition-all text-sm group">
                                <FileText className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FF3300] group-hover:text-white" />
                                {lang === 'ar' ? 'تصدير تقرير الفجوات الشبكية PDF (مع صور الخريطة)' : 'Export Network Gaps PDF Report (with Map Thumbnails)'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري تصدير الفجوات كملف KML / KMZ...' : 'Exporting gaps as KML...', exportNetworkGapsKMLHandler)} className="w-full bg-[#2a120b] border border-[#FF3300]/60 text-[#ffaa80] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF3300] hover:text-white transition-all text-sm group">
                                <DownloadCloud className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FF3300] group-hover:text-white" />
                                {lang === 'ar' ? 'تصدير الفجوات الشبكية كملف KML / KMZ' : 'Export Network Gaps as KML / KMZ File'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص الخطوط الصفراء فقط بدون Permit No أو segment id...' : 'Auditing yellow lines missing Permit / Segment ID...', verifyYellowLinesMissingPermitAndSegmentId)} className="w-full bg-[#3d330b] border-2 border-[#FFE600]/80 text-[#FFF275] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:bg-[#FFE600] hover:text-black transition-all text-sm group scale-[1.01] hover:scale-[1.02]">
                                <AlertOctagon className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FFE600] group-hover:text-black animate-pulse" />
                                {lang === 'ar' ? 'فحص الخطوط الصفراء فقط بدون (Permit No / segment id)' : 'Audit Yellow Lines Only (Missing Permit / Segment ID)'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص العناصر الناقصة (قطر/منطقة)...' : 'Auditing missing attributes...', verifyEssentialAttributes)} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group">
                                <AlertTriangle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص عناصر Segment ID...' : 'Auditing Segment ID...', verifyPermitAndSegmentId)} className="w-full bg-[#2a0b3d] border border-[#9000FF]/50 text-[#d8b4fe] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#9000FF] hover:text-white transition-all text-sm group">
                                <Layers2 className="w-6 h-6 group-hover:scale-110 transition-transform text-[#9000FF] group-hover:text-white" />
                                {lang === 'ar' ? 'فحص عناصر (segment id) بنفسجي' : 'Highlight segment id (Vivid Purple)'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص رقم الترخيص (Permit No)...' : 'Auditing Permit No...', verifyPermitNo)} className="w-full bg-[#3d1e0b] border border-[#FF6D00]/50 text-[#ffc499] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FF6D00] hover:text-white transition-all text-sm group">
                                <FileText className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FF6D00] group-hover:text-white" />
                                {lang === 'ar' ? 'فحص رقم الترخيص (Permit No) برتقالي' : 'Highlight Permit No (Neon Orange)'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص مطابقة كود البناء السعودي (SBC)...' : 'Auditing Saudi Building Code (SBC)...', verifySaudiBuildingCodeSbc)} className="w-full bg-[#0b281d] border border-emerald-500/50 text-emerald-300 font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:bg-emerald-500 hover:text-black transition-all text-sm group">
                                <ShieldCheck className="w-6 h-6 group-hover:scale-110 transition-transform text-emerald-400 group-hover:text-black" />
                                {lang === 'ar' ? 'فحص مطابقة كود البناء السعودي (SBC)' : 'Saudi Building Code (SBC) Compliance Audit'}
                            </button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري فحص الألوان المخالفة للألوان المعتمدة...' : 'Auditing non-compliant colors...', verifyApprovedColors)} className="w-full bg-[#3d2a0b] border border-[#FFD700]/50 text-[#FFE87C] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#FFD700] hover:text-black transition-all text-sm group">
                                <Palette className="w-6 h-6 group-hover:scale-110 transition-transform text-[#FFD700] group-hover:text-black" />
                                {lang === 'ar' ? 'فحص وإبراز الألوان المخالفة للألوان المعتمدة' : 'Highlight Non-Compliant Colors'}
                            </button>
                            <button onClick={clearAuditResults} className="w-full bg-[#3d0b16] border border-rose-500/50 text-rose-200 font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-rose-600 hover:text-white transition-all text-sm group">
                                <RotateCcw className="w-6 h-6 group-hover:-rotate-90 transition-transform text-rose-400 group-hover:text-white" />
                                {lang === 'ar' ? 'إزالة نتائج الفحص وإلغاء التظليل (إعادة الخريطة)' : 'Clear Audit Results & Reset Map Highlights'}
                            </button>

                            {segmentIdAnalysis && segmentIdAnalysis.totalElements > 0 && (
                              <div className="bg-[#120a21]/90 p-6 rounded-[2.5rem] border border-[#9000FF]/40 shadow-2xl space-y-5 animate-in fade-in duration-500 my-4 relative z-20 overflow-visible">
                                <div className="flex items-center justify-between border-b border-[#9000FF]/20 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Fingerprint className="w-5 h-5 text-[#d8b4fe]" />
                                    <h3 className="text-white font-black text-xs uppercase tracking-wider">
                                      {lang === 'ar' ? 'تحليل محتوى وتكرار (Segment ID)' : 'Segment ID Content & Unique Analysis'}
                                    </h3>
                                  </div>
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#9000FF]/20 text-[#d8b4fe] border border-[#9000FF]/40">
                                    {lang === 'ar' ? 'نتائج الفحص' : 'Segment Results'}
                                  </span>
                                </div>

                                {/* Metric Cards Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {/* 1. Count of elements with segment id */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'عناصر بها Segment ID' : 'Elements with Segment ID'}
                                    </span>
                                    <div className="flex items-baseline justify-center gap-1">
                                      <span className="text-2xl font-black text-[#d8b4fe]">
                                        {segmentIdAnalysis.validElementsCount}
                                      </span>
                                      <span className="text-[10px] font-bold text-white/40">
                                        / {segmentIdAnalysis.totalElements}
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-black text-accent mt-1">
                                      {((segmentIdAnalysis.validElementsCount / (segmentIdAnalysis.totalElements || 1)) * 100).toFixed(1)}% {lang === 'ar' ? 'من الإجمالي' : 'of total'}
                                    </span>
                                  </div>

                                  {/* 2. Count of unique segment ids without duplicates */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-accent/20 text-center flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'قيم فريدة (بدون تكرار)' : 'Unique Segment IDs'}
                                    </span>
                                    <span className="text-2xl font-black text-accent">
                                      {segmentIdAnalysis.uniqueSegmentIdsCount}
                                    </span>
                                    <span className="text-[9px] font-bold text-white/40 mt-1">
                                      {lang === 'ar' ? 'معرّفات غير مكررة' : 'Distinct ID values'}
                                    </span>
                                  </div>

                                  {/* 3. Total length of segment id elements */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-emerald-500/20 text-center flex flex-col justify-center col-span-2 md:col-span-1">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'إجمالي الأطوال المعرفة' : 'Total Segmented Length'}
                                    </span>
                                    <div className="flex items-baseline justify-center gap-1">
                                      <span className="text-2xl font-black text-emerald-400">
                                        {(segmentIdAnalysis.totalLengthWithSegmentId / 1000).toFixed(2)}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-400/70">
                                        {lang === 'ar' ? 'كم' : 'km'}
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-white/40 mt-1">
                                      {lang === 'ar' ? 'للعناصر ذات المحتوى' : 'for valid segments'}
                                    </span>
                                  </div>
                                </div>

                                {/* Search & Breakdown list of unique segment IDs */}
                                {segmentIdAnalysis.uniqueSegmentIdsCount > 0 && (
                                  <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-[11px] font-black text-white/80 uppercase">
                                        {lang === 'ar' ? 'تفاصيل قيم (Segment ID) الفريدة:' : 'Distinct Segment ID Breakdown:'}
                                      </h4>
                                      <span className="text-[9px] font-bold text-white/40">
                                        {lang === 'ar' ? `عرض ${segmentIdAnalysis.uniqueDetails.length} قيم` : `Showing ${segmentIdAnalysis.uniqueDetails.length} values`}
                                      </span>
                                    </div>

                                    {/* Filter input */}
                                    <input
                                      type="text"
                                      placeholder={lang === 'ar' ? 'ابحث في قيم Segment ID...' : 'Filter Segment ID values...'}
                                      value={segmentFilterQuery}
                                      onChange={(e) => setSegmentFilterQuery(e.target.value)}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#9000FF]"
                                    />

                                    {/* List of distinct values */}
                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                      {segmentIdAnalysis.uniqueDetails
                                        .filter(item => {
                                          if (!segmentFilterQuery) return true;
                                          const q = segmentFilterQuery.toLowerCase();
                                          return (
                                            item.idValue.toLowerCase().includes(q) ||
                                            (item.projectName && item.projectName.toLowerCase().includes(q)) ||
                                            (item.projectId && item.projectId.toLowerCase().includes(q)) ||
                                            (item.contractor && item.contractor.toLowerCase().includes(q))
                                          );
                                        })
                                        .map((item, idx) => (
                                          <div key={idx} className="bg-black/30 hover:bg-black/50 p-3 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors">
                                            <div className="flex flex-col gap-1 overflow-hidden">
                                              <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#9000FF] shrink-0" />
                                                <span className="font-mono font-bold text-[#d8b4fe] truncate dir-ltr">
                                                  {item.idValue}
                                                </span>
                                              </div>
                                              {(item.projectName || item.projectId || item.contractor) && (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/60 pr-4">
                                                  {item.projectName && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-accent">
                                                      {item.projectName}
                                                    </span>
                                                  )}
                                                  {item.projectId && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-white/80">
                                                      ID: {item.projectId}
                                                    </span>
                                                  )}
                                                  {item.contractor && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-amber-300">
                                                      {item.contractor}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                              <span className="text-[10px] font-black bg-white/10 text-white px-2 py-0.5 rounded-md">
                                                #{item.count} {lang === 'ar' ? 'عنصر' : 'items'}
                                              </span>
                                              <span className="text-[10px] font-bold text-emerald-400">
                                                {(item.totalLength / 1000).toFixed(3)} {lang === 'ar' ? 'كم' : 'km'}
                                              </span>
                                              <button
                                                onClick={() => highlightSpecificSegmentId(item.points)}
                                                className="text-[9px] bg-[#9000FF]/30 hover:bg-[#9000FF] text-white px-2 py-1 rounded-lg font-black transition-all"
                                                title={lang === 'ar' ? 'تحديد وتكبير على الخريطة' : 'Highlight on map'}
                                              >
                                                {lang === 'ar' ? 'عرض' : 'View'}
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                    </div>

                                    {/* Export Excel for Segment ID report */}
                                    <button
                                      onClick={() => runWithLoading(lang === 'ar' ? 'جاري تصدير تقرير Segment ID (Excel)...' : 'Exporting Segment ID report (Excel)...', exportSegmentIdReportExcel)}
                                      className="w-full bg-[#9000FF]/20 border border-[#9000FF]/40 hover:bg-[#9000FF]/40 text-[#d8b4fe] font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all mt-2"
                                    >
                                      <FileSpreadsheet className="w-4 h-4 text-[#d8b4fe]" />
                                      <span>
                                        {lang === 'ar' ? 'تصدير تقرير Segment ID إلى Excel' : 'Export Segment ID Report to Excel'}
                                      </span>
                                    </button>

                                    {/* Recharts Bar Chart for Total Length per Segment ID */}
                                    <SegmentLengthChart
                                      segmentDetails={segmentIdAnalysis.uniqueDetails}
                                      lang={lang}
                                      onHighlightSegment={highlightSpecificSegmentId}
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {permitNoAnalysis && permitNoAnalysis.totalElements > 0 && (
                              <div className="bg-[#1f0f05]/90 p-6 rounded-[2.5rem] border border-[#FF6D00]/40 shadow-2xl space-y-5 animate-in fade-in duration-500 my-4 relative z-20 overflow-visible">
                                <div className="flex items-center justify-between border-b border-[#FF6D00]/20 pb-3">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-[#ffc499]" />
                                    <h3 className="text-white font-black text-xs uppercase tracking-wider">
                                      {lang === 'ar' ? 'تحليل محتوى وتكرار رقم الترخيص (Permit No)' : 'Permit No Content & Unique Analysis'}
                                    </h3>
                                  </div>
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#FF6D00]/20 text-[#ffc499] border border-[#FF6D00]/40">
                                    {lang === 'ar' ? 'نتائج التراخيص' : 'Permit Results'}
                                  </span>
                                </div>

                                {/* Metric Cards Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {/* 1. Count of elements with permit no */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'عناصر بها رقم ترخيص' : 'Elements with Permit No'}
                                    </span>
                                    <div className="flex items-baseline justify-center gap-1">
                                      <span className="text-2xl font-black text-[#ffc499]">
                                        {permitNoAnalysis.validElementsCount}
                                      </span>
                                      <span className="text-[10px] font-bold text-white/40">
                                        / {permitNoAnalysis.totalElements}
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-black text-amber-400 mt-1">
                                      {((permitNoAnalysis.validElementsCount / (permitNoAnalysis.totalElements || 1)) * 100).toFixed(1)}% {lang === 'ar' ? 'من الإجمالي' : 'of total'}
                                    </span>
                                  </div>

                                  {/* 2. Count of unique permit nos without duplicates */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-amber-500/20 text-center flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'تراخيص فريدة (بدون تكرار)' : 'Unique Permit Numbers'}
                                    </span>
                                    <span className="text-2xl font-black text-amber-400">
                                      {permitNoAnalysis.uniquePermitNosCount}
                                    </span>
                                    <span className="text-[9px] font-bold text-white/40 mt-1">
                                      {lang === 'ar' ? 'أرقام تراخيص غير مكررة' : 'Distinct Permit values'}
                                    </span>
                                  </div>

                                  {/* 3. Total length of permit no elements */}
                                  <div className="bg-black/40 p-4 rounded-2xl border border-emerald-500/20 text-center flex flex-col justify-center col-span-2 md:col-span-1">
                                    <span className="text-[9px] font-bold text-white/50 uppercase block mb-1">
                                      {lang === 'ar' ? 'إجمالي أطوال التراخيص' : 'Total Permitted Length'}
                                    </span>
                                    <div className="flex items-baseline justify-center gap-1">
                                      <span className="text-2xl font-black text-emerald-400">
                                        {(permitNoAnalysis.totalLengthWithPermitNo / 1000).toFixed(2)}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-400/70">
                                        {lang === 'ar' ? 'كم' : 'km'}
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-white/40 mt-1">
                                      {lang === 'ar' ? 'للعناصر ذات التراخيص' : 'for valid permits'}
                                    </span>
                                  </div>
                                </div>

                                {/* Search & Breakdown list of unique permit Nos */}
                                {permitNoAnalysis.uniquePermitNosCount > 0 && (
                                  <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-[11px] font-black text-white/80 uppercase">
                                        {lang === 'ar' ? 'تفاصيل أرقام الترخيص (Permit No) الفريدة:' : 'Distinct Permit No Breakdown:'}
                                      </h4>
                                      <span className="text-[9px] font-bold text-white/40">
                                        {lang === 'ar' ? `عرض ${permitNoAnalysis.uniqueDetails.length} قيم` : `Showing ${permitNoAnalysis.uniqueDetails.length} values`}
                                      </span>
                                    </div>

                                    {/* Filter input */}
                                    <input
                                      type="text"
                                      placeholder={lang === 'ar' ? 'ابحث في أرقام التراخيص...' : 'Filter Permit No values...'}
                                      value={permitFilterQuery}
                                      onChange={(e) => setPermitFilterQuery(e.target.value)}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#FF6D00]"
                                    />

                                    {/* List of distinct values */}
                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                      {permitNoAnalysis.uniqueDetails
                                        .filter(item => {
                                          if (!permitFilterQuery) return true;
                                          const q = permitFilterQuery.toLowerCase();
                                          return (
                                            item.idValue.toLowerCase().includes(q) ||
                                            (item.projectName && item.projectName.toLowerCase().includes(q)) ||
                                            (item.projectId && item.projectId.toLowerCase().includes(q)) ||
                                            (item.contractor && item.contractor.toLowerCase().includes(q))
                                          );
                                        })
                                        .map((item, idx) => (
                                          <div key={idx} className="bg-black/30 hover:bg-black/50 p-3 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors">
                                            <div className="flex flex-col gap-1 overflow-hidden">
                                              <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#FF6D00] shrink-0" />
                                                <span className="font-mono font-bold text-[#ffc499] truncate dir-ltr">
                                                  {item.idValue}
                                                </span>
                                              </div>
                                              {(item.projectName || item.projectId || item.contractor) && (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/60 pr-4">
                                                  {item.projectName && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-accent">
                                                      {item.projectName}
                                                    </span>
                                                  )}
                                                  {item.projectId && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-white/80">
                                                      ID: {item.projectId}
                                                    </span>
                                                  )}
                                                  {item.contractor && (
                                                    <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-amber-300">
                                                      {item.contractor}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                              <span className="text-[10px] font-black bg-white/10 text-white px-2 py-0.5 rounded-md">
                                                #{item.count} {lang === 'ar' ? 'عنصر' : 'items'}
                                              </span>
                                              <span className="text-[10px] font-bold text-emerald-400">
                                                {(item.totalLength / 1000).toFixed(3)} {lang === 'ar' ? 'كم' : 'km'}
                                              </span>
                                              <button
                                                onClick={() => highlightSpecificPermitNo(item.points)}
                                                className="text-[9px] bg-[#FF6D00]/30 hover:bg-[#FF6D00] text-white px-2 py-1 rounded-lg font-black transition-all"
                                                title={lang === 'ar' ? 'تحديد وتكبير على الخريطة' : 'Highlight on map'}
                                              >
                                                {lang === 'ar' ? 'عرض' : 'View'}
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                    </div>

                                    {/* Export Excel for Permit No report */}
                                    <button
                                      onClick={() => runWithLoading(lang === 'ar' ? 'جاري تصدير تقرير أرقام التراخيص (Excel)...' : 'Exporting Permit No report (Excel)...', exportPermitNoReportExcel)}
                                      className="w-full bg-[#FF6D00]/20 border border-[#FF6D00]/40 hover:bg-[#FF6D00]/40 text-[#ffc499] font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all mt-2"
                                    >
                                      <FileSpreadsheet className="w-4 h-4 text-[#ffc499]" />
                                      <span>
                                        {lang === 'ar' ? 'تصدير تقرير Permit No إلى Excel' : 'Export Permit No Report to Excel'}
                                      </span>
                                    </button>

                                    {/* Recharts Bar Chart for Total Length per Permit No */}
                                    <PermitLengthChart
                                      permitDetails={permitNoAnalysis.uniqueDetails}
                                      lang={lang}
                                      onHighlightPermit={highlightSpecificPermitNo}
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => generateAnalysisPPTX(analysisData, activeFile?.filename || "Analysis", lang, { segmentIdAnalysis: segmentIdAnalysis || undefined, permitNoAnalysis: permitNoAnalysis || undefined, wwMainlineStats: wwMainlineStats || undefined, wMainlineStats: wMainlineStats || undefined, networkType: analyzerNetworkType })} className="w-full bg-accent text-primary font-black py-5 rounded-[2rem] flex items-center justify-center gap-2 shadow-2xl hover:brightness-110 active:scale-95 transition-all text-[11px] group"><Presentation className="w-5 h-5 group-hover:rotate-12 transition-transform" />{analyzerNetworkType === 'water' ? (lang === 'ar' ? 'تصدير PPTX (مياه)' : 'Export PPTX (Water)') : analyzerNetworkType === 'sewer' ? (lang === 'ar' ? 'تصدير PPTX (صرف)' : 'Export PPTX (Sewer)') : (lang === 'ar' ? 'تصدير PPTX (الكل)' : 'Export PPTX (All)')}</button>
                                <button onClick={() => generateAnalysisPDF(analysisData, activeFile?.filename || "Analysis", lang, { segmentIdAnalysis: segmentIdAnalysis || undefined, permitNoAnalysis: permitNoAnalysis || undefined, wwMainlineStats: wwMainlineStats || undefined, wMainlineStats: wMainlineStats || undefined, networkType: analyzerNetworkType })} className="w-full bg-[#D32F2F] text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-2 shadow-2xl hover:brightness-110 active:scale-95 transition-all text-[11px] group"><FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />{analyzerNetworkType === 'water' ? (lang === 'ar' ? 'تصدير PDF (مياه)' : 'Export PDF (Water)') : analyzerNetworkType === 'sewer' ? (lang === 'ar' ? 'تصدير PDF (صرف)' : 'Export PDF (Sewer)') : (lang === 'ar' ? 'تصدير PDF (الكل)' : 'Export PDF (All)')}</button>
                            </div>
                            <div className="bg-[#0b2d3d]/40 p-8 rounded-[3rem] border border-white/5 space-y-6">
                                <h3 className="text-white/40 font-black text-[11px] text-center uppercase tracking-[0.2em]">{lang === 'ar' ? 'تفاصيل المجموعات المدمجة' : 'Merged Color Details'}</h3>
                                <div className="space-y-8">{analysisData.map((item, idx) => (
                                        <div key={idx} className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                              <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: item.color }} />
                                              <span className="text-[11px] font-black text-white/80 tracking-widest">{item.color}</span>
                                              {item.statusName && (
                                                <span
                                                  className="text-[9px] font-black px-2.5 py-0.5 rounded-md border"
                                                  style={{
                                                    backgroundColor: `${item.statusColor}20`,
                                                    borderColor: `${item.statusColor}60`,
                                                    color: item.statusColor === '#FFEA00' ? '#FFEA00' : item.statusColor
                                                  }}
                                                >
                                                  {item.statusName}
                                                </span>
                                              )}
                                              <span className="text-[9px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-md">#{item.count} {lang === 'ar' ? 'عناصر' : 'items'}</span>
                                            </div>
                                            <div className="flex items-baseline gap-1">
                                              <span className="text-sm font-black text-white">{(item.totalLength / 1000).toFixed(3)}</span>
                                              <span className="text-[9px] font-black text-white/40 uppercase">{lang === 'ar' ? 'كم' : 'km'}</span>
                                            </div>
                                          </div>
                                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${item.percentage}%`, backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}40` }} />
                                          </div>
                                        </div>
                                    ))}</div>
                            </div>
                        </div>
                      )}

                {activeTab === 'analyzer' && !activeFile && plannedStreets.length === 0 && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="flex bg-[#0b2d3d]/80 p-1.5 rounded-2xl border border-white/10 shadow-xl">
                      <button
                        type="button"
                        onClick={() => setUploadSourceMode('file')}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
                          uploadSourceMode === 'file' ? "bg-accent text-primary shadow-md" : "text-white/40 hover:text-white"
                        )}
                      >
                        <Upload className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'رفع ملف بيانات' : 'Upload Data File'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadSourceMode('link')}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2",
                          uploadSourceMode === 'link' ? "bg-accent text-primary shadow-md" : "text-white/40 hover:text-white"
                        )}
                      >
                        <Globe className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'رابط Google My Maps' : 'Google My Maps Link'}</span>
                      </button>
                    </div>

                    {uploadSourceMode === 'file' ? (
                      <label 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleFileUpload}
                        className="block p-8 border-2 border-dashed border-accent/40 rounded-[3rem] text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group shadow-2xl"
                      >
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                        <Upload className="w-10 h-10 mx-auto mb-3 text-accent group-hover:scale-110 transition-all" />
                        <span className="text-[12px] font-black text-white block leading-tight px-6 uppercase tracking-wider">
                          {lang === 'ar' ? 'ارفع أو اسحب ملف (.GDB, .ZIP, .KMZ, .KML, .DXF) لتحليله' : 'Drop or select file to analyze'}
                        </span>
                        <span className="text-[9px] text-accent mt-2 block font-bold uppercase tracking-[0.2em]">
                          {lang === 'ar' ? 'انقر أو اسحب للاختيار' : 'Click or drop to select'}
                        </span>
                      </label>
                    ) : (
                      <div className="bg-[#0b2d3d]/60 p-6 rounded-[2.5rem] border border-accent/20 shadow-2xl space-y-4 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                          <span className="text-xs font-black text-white flex items-center gap-2">
                            <Globe className="w-4 h-4 text-accent" />
                            {lang === 'ar' ? 'تحليل الأطوال عبر رابط Google My Maps' : 'Analyze Lengths via Google My Maps Link'}
                          </span>
                          <span className="text-[10px] text-accent font-bold bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                            My Maps
                          </span>
                        </div>
                        <p className="text-[10px] text-white/60 leading-relaxed font-bold">
                          {lang === 'ar'
                            ? 'ضع رابط خريطة Google My Maps العام (مفتوح للمشاركة) وسيقوم محلل الأطوال بقراءة وتصنيف كافة الأطوال والمسارات والشبكات تلقائياً.'
                            : 'Paste a public Google My Maps share/edit link to automatically parse and calculate path lengths, color groups, and network metrics.'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://www.google.com/maps/d/edit?mid=1yR93XqrI2xr7_dJKERGz0FfxHQxlwt4..."
                            value={mapsLink}
                            onChange={(e) => setMapsLink(e.target.value)}
                            className="flex-1 bg-[#0e3f53] border border-white/10 rounded-2xl px-4 py-3.5 text-[11px] font-bold text-white outline-none placeholder:text-white/30 focus:border-accent transition-all select-text"
                          />
                          <button
                            type="button"
                            onClick={handleLoadMyMapsLink}
                            disabled={!mapsLink.trim() || loading}
                            className={cn(
                              "px-6 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg",
                              mapsLink.trim() && !loading ? "bg-accent text-primary hover:brightness-110 active:scale-95" : "bg-white/5 text-white/25 cursor-not-allowed"
                            )}
                          >
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                            <span>{lang === 'ar' ? 'استيراد وتحليل' : 'Import & Analyze'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="text-center p-10 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10 mt-6 space-y-4">
                      <Database className="w-10 h-10 text-accent/40 mx-auto animate-pulse" />
                      <div className="space-y-1">
                        <p className="text-white font-heavy text-xs uppercase tracking-wider">
                          {lang === 'ar' ? 'حساب أطوال خطوط W_MAINLINE من قاعدة الجيوداتابيس' : 'Calculate W_MAINLINE segment lengths from .gdb'}
                        </p>
                        <p className="text-[10px] text-white/40 leading-relaxed font-bold">
                          {lang === 'ar' ? 'قم برفع قاعدة البيانات الجغرافية .gdb كملف مضغوط .zip، أو قم ببدء التجربة الفورية لنموذج مجهز.' : 'Upload your .gdb folder inside a .zip file, or test with our preconfigured Riyadh dataset.'}
                        </p>
                      </div>
                      <button
                        onClick={handleLoadSampleGDB}
                        className="w-full bg-[#0b2d3d] hover:bg-accent hover:text-primary text-accent border border-accent/20 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all text-xs group"
                      >
                        <Droplet className="w-4 h-4 text-accent group-hover:animate-bounce" />
                        <span>{lang === 'ar' ? 'تجربة عينة قاعدة بيانات مياه (.gdb.zip)' : 'Test with Sample GDB Water Database'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'splitter' && (
                  <div className="space-y-8 animate-in fade-in duration-500 pb-10">
                      <FileUploadZone id="splitter-up" label={lang === 'ar' ? '1. مصدر البيانات' : '1. Data Source'} />
                      <div className="bg-[#0b2d3d]/40 p-2 rounded-[1.8rem] border border-white/5 flex gap-2">
                        <button onClick={() => setSplitMode('count')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all leading-tight", splitMode === 'count' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>{lang === 'ar' ? 'تقسيم رقمي (أجزاء)' : 'Digital Split'}</button>
                        <button onClick={() => setSplitMode('spatial')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all leading-tight", splitMode === 'spatial' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>{lang === 'ar' ? 'حسب المنطقة' : 'Spatial Split'}</button>
                        <button onClick={() => setSplitMode('street')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all leading-tight", splitMode === 'street' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>{lang === 'ar' ? 'حسب الشارع' : 'By Street'}</button>
                      </div>
                      <div className="bg-[#0b2d3d]/40 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-8">
                        {splitMode === 'count' ? (
                          <div className="space-y-8">
                            <div className="flex items-center justify-between"><h3 className="text-white font-black text-sm">{lang === 'ar' ? 'عدد الأجزاء:' : 'Number of Parts:'}</h3><span className="text-2xl font-black text-accent">{splitCount}</span></div>
                            <div className="relative h-2 w-full bg-[#0e3f53] rounded-full"><input type="range" min="2" max="50" value={splitCount} onChange={(e) => setSplitCount(parseInt(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><div className="h-full bg-accent/20 rounded-full" style={{ width: `${((splitCount - 2) / 48) * 100}%` }} /><div className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-accent rounded-full border-4 border-[#0e3f53] shadow-lg pointer-events-none" style={{ left: `calc(${((splitCount - 2) / 48) * 100}% - 12px)` }} /></div>
                          </div>
                        ) : splitMode === 'street' ? (
                          <div className="space-y-6">
                            <p className="text-[12px] text-accent font-black leading-relaxed text-center">
                              {lang === 'ar' ? 'سيتم تقسيم العناصر وتصنيفها في مجلدات منفصلة بناءً على اسم الشارع الجغرافي الخاص بها.' : 'Elements will be grouped into separate folders based on their geographic street name.'}
                            </p>

                            <GeocodingModeSelector mode={geocodingMode} setMode={setGeocodingMode} lang={lang} />

                            <button
                              onClick={handleReverseGeocodeGlobal}
                              className="w-full bg-[#0e3f53] border-2 border-accent/20 text-accent font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:bg-accent hover:text-primary transition-all text-xs group"
                            >
                               <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                               {lang === 'ar' ? 'تحديث/جلب أسماء الشوارع للبيانات' : 'Fetch/Update Street Names'}
                            </button>

                            <p className="text-[10px] text-white/40 font-bold text-center">
                              {lang === 'ar' ? 'ملاحظة: إذا لم تكن البيانات تحتوي على أسماء شوارع مسبقاً، يرجى النقر على الزر أعلاه لجلبها.' : 'Note: If the data does not already have street names, please click the button above to fetch them.'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <p className="text-[12px] text-accent font-black leading-relaxed text-center">{lang === 'ar' ? 'ارسم مضلعات على الخريطة. سيتم توزيع العناصر داخل كل مضلع في مجلد منفصل عند التصدير.' : 'Draw polygons on the map. Each polygon will group items into a separate folder on export.'}</p>

                            <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => setIsDrawingMode(!isDrawingMode)} className={cn("w-full py-5 rounded-2xl font-black text-[10px] border transition-all flex flex-col items-center gap-2", isDrawingMode ? "bg-accent text-primary border-accent shadow-xl" : "bg-white/5 text-white/40 border-white/10")}><MousePointer2 className="w-5 h-5" />{isDrawingMode ? (lang === 'ar' ? 'جاري الرسم...' : 'Drawing...') : (lang === 'ar' ? 'رسم مضلع جديد' : 'Draw Polygon')}</button>
                              <label className="p-4 bg-white/5 text-white/40 border border-white/10 rounded-2xl font-black text-[10px] flex flex-col items-center gap-2 hover:bg-white/10 transition-all shadow-lg cursor-pointer group"><input type="file" className="hidden" onChange={handleBoundaryUpload} /><FileUp className="w-5 h-5 text-accent/60 group-hover:text-accent transition-colors" /><span>{lang === 'ar' ? 'استيراد حدود' : 'Import Boundaries'}</span></label>
                            </div>

                            {splitPolygons.length > 0 && (
                              <div className="space-y-3 animate-in fade-in">
                                <div className="flex items-center gap-2 px-2"><Layers2 className="w-4 h-4 text-accent" /><h4 className="text-[11px] font-black text-white/60 uppercase">{lang === 'ar' ? 'المضلعات المرسومة' : 'Drawn Polygons'}</h4></div>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar px-1">
                                  {splitPolygons.map((poly, idx) => (
                                    <div key={poly.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl group hover:bg-white/10 transition-all">
                                      <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: poly.color }} />
                                        <div className="flex flex-col">
                                          <span className="text-[11px] font-black text-white leading-tight">{poly.name}</span>
                                          <span className="text-[9px] text-white/30 font-bold">#{idx + 1} - {poly.path.length} vertices</span>
                                        </div>
                                      </div>
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => {
                                          const newName = prompt(lang === 'ar' ? 'اسم المجلد الجديد:' : 'New Folder Name:', poly.name);
                                          if (newName) setSplitPolygons(splitPolygons.map(p => p.id === poly.id ? { ...p, name: newName } : p));
                                        }} className="p-1.5 text-white/40 hover:text-accent transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setSplitPolygons(splitPolygons.filter(p => p.id !== poly.id))} className="p-1.5 text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => setSplitPolygons([])} className="flex-1 py-3 text-[10px] font-black text-red-400 bg-red-500/10 rounded-xl hover:bg-red-500/20 transition-all uppercase">{lang === 'ar' ? 'حذف الكل' : 'Clear All'}</button>
                                  <button onClick={handleExportPolygonsOnly} className="flex-1 py-3 text-[10px] font-black text-accent bg-accent/10 rounded-xl hover:bg-accent/20 transition-all uppercase">{lang === 'ar' ? 'تصدير الحدود فقط' : 'Export Bounds'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Settings2 className="w-4 h-4 text-accent" />
                          <h3 className="text-white font-black text-[11px] uppercase tracking-wider">{lang === 'ar' ? 'خيارات تقسيم متقدمة' : 'Advanced Split Options'}</h3>
                        </div>
                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-black text-white">{lang === 'ar' ? 'فصل العناصر المدمجة (Explode)' : 'Separate Combined Elements'}</span>
                            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'تحويل MultiGeometry إلى عناصر منفصلة قبل التقسيم' : 'Convert MultiGeometry to individual parts'}</span>
                          </div>
                          <button onClick={() => setSeparateMulti(!separateMulti)} className={cn("w-12 h-6 rounded-full transition-all relative", separateMulti ? "bg-accent" : "bg-white/10")}>
                            <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (separateMulti ? "left-1" : "left-7") : (separateMulti ? "right-1" : "right-7"))} />
                          </button>
                        </label>
                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط عند التقاطعات' : 'Split Lines at Intersections'}</span>
                            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'فصل الخطوط عند تقاطعها مع خطوط أخرى' : 'Split lines where they intersect'}</span>
                          </div>
                          <button onClick={() => setSplitIntersections(!splitIntersections)} className={cn("w-12 h-6 rounded-full transition-all relative", splitIntersections ? "bg-accent" : "bg-white/10")}>
                            <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (splitIntersections ? "left-1" : "left-7") : (splitIntersections ? "right-1" : "right-7"))} />
                          </button>
                        </label>
                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-black text-white">{lang === 'ar' ? 'الاحتفاظ بالبيانات الأصلية والصور' : 'Retain Original Data & Images'}</span>
                            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'استخدام الوصف والمظهر الأصليين من الملف المصدر' : 'Use original description and styling from source'}</span>
                          </div>
                          <button onClick={() => setKeepOriginalDescription(!keepOriginalDescription)} className={cn("w-12 h-6 rounded-full transition-all relative", keepOriginalDescription ? "bg-accent" : "bg-white/10")}>
                            <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (keepOriginalDescription ? "left-1" : "left-7") : (keepOriginalDescription ? "right-1" : "right-7"))} />
                          </button>
                        </label>
                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-black text-white">{lang === 'ar' ? 'إزالة الصور فقط' : 'Remove Images Only'}</span>
                            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'حذف جميع الصور والوسائط من منطاد الوصف مع الاحتفاظ بالباقي' : 'Delete all images and media from the description balloon'}</span>
                          </div>
                          <button onClick={() => setRemoveImagesOnly(!removeImagesOnly)} className={cn("w-12 h-6 rounded-full transition-all relative", removeImagesOnly ? "bg-accent" : "bg-white/10")}>
                            <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (removeImagesOnly ? "left-1" : "left-7") : (removeImagesOnly ? "right-1" : "right-7"))} />
                          </button>
                        </label>
                        <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط حسب الطول' : 'Split Lines by Length'}</span>
                            <span className="text-[9px] text-white/40">{lang === 'ar' ? 'تقسيم المسارات الطويلة لقطع متساوية' : 'Split long paths into equal segments'}</span>
                          </div>
                          <button onClick={() => setSplitLines(!splitLines)} className={cn("w-12 h-6 rounded-full transition-all relative", splitLines ? "bg-accent" : "bg-white/10")}>
                            <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (splitLines ? "left-1" : "left-7") : (splitLines ? "right-1" : "right-7"))} />
                          </button>
                        </label>
                        {splitLines && (
                          <div className="px-4 pb-2 space-y-3 animate-in slide-in-from-top">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'الحد الأقصى للطول (10 - 1000 متر):' : 'Max Length (10 - 1000 m):'}</span>
                              <div className="flex items-center gap-1.5 bg-[#0e3f53] px-3 py-1 rounded-xl border border-white/10 shadow-inner">
                                <input
                                  type="number"
                                  min="10"
                                  max="10000"
                                  step="10"
                                  value={maxLen}
                                  onChange={(e) => setMaxLen(Math.max(10, parseInt(e.target.value) || 10))}
                                  className="w-16 bg-transparent text-xs font-black text-accent outline-none text-center select-text"
                                />
                                <span className="text-[10px] font-bold text-accent">{lang === 'ar' ? 'متر' : 'm'}</span>
                              </div>
                            </div>
                            <input
                              type="range"
                              min="10"
                              max="1000"
                              step="10"
                              value={Math.min(maxLen, 1000)}
                              onChange={(e) => setMaxLen(parseInt(e.target.value))}
                              className="w-full accent-accent h-1.5 bg-white/10 rounded-full cursor-pointer"
                            />
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {[10, 20, 50, 100, 200, 500, 1000].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => setMaxLen(val)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border",
                                    maxLen === val
                                      ? "bg-accent text-primary border-accent shadow-md font-black scale-105"
                                      : "bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:text-white"
                                  )}
                                >
                                  {val} {lang === 'ar' ? 'متر' : 'm'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-4"><h3 className="text-white/40 font-black text-[10px] uppercase tracking-widest px-4">{lang === 'ar' ? 'نمط التصدير:' : 'Export Style:'}</h3><div className="grid grid-cols-2 gap-4"><button onClick={() => setExportStyle('single')} className={cn("flex flex-col items-center gap-4 p-8 rounded-[2rem] border-2 transition-all group", exportStyle === 'single' ? "bg-[#0b2d3d] border-accent" : "bg-white/5 border-transparent opacity-60 hover:opacity-100")}><div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-1", exportStyle === 'single' ? "bg-accent/10 text-accent" : "bg-white/5 text-white/30")}><FolderOpen className="w-7 h-7" /></div><span className={cn("text-[10px] font-black leading-tight text-center", exportStyle === 'single' ? "text-accent" : "text-white/40")}>{lang === 'ar' ? 'ملف KML واحد (مجلدات)' : 'Single KML file (Folders)'}</span></button><button onClick={() => setExportStyle('zip')} className={cn("flex flex-col items-center gap-4 p-8 rounded-[2rem] border-2 transition-all group", exportStyle === 'zip' ? "bg-[#0b2d3d] border-accent" : "bg-white/5 border-transparent opacity-60 hover:opacity-100")}><div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-1", exportStyle === 'zip' ? "bg-accent/10 text-accent" : "bg-white/5 text-white/30")}><Package className="w-7 h-7" /></div><span className={cn("text-[10px] font-black leading-tight text-center", exportStyle === 'zip' ? "text-accent" : "text-white/40")}>{lang === 'ar' ? 'ملفات KML منفصلة (ZIP)' : 'Separate KML files (ZIP)'}</span></button></div></div>
                      <button onClick={handleSplitExport} disabled={!activeFile} className={cn("w-full py-6 rounded-full font-black text-lg flex items-center justify-center gap-3 shadow-2xl transition-all transform hover:scale-[1.02] active:scale-95", activeFile ? "bg-accent text-primary" : "bg-[#0e3f53]/50 text-white/10 cursor-not-allowed")}><CloudDownload className="w-7 h-7" /><span>{lang === 'ar' ? 'تنزيل الملفات' : 'Download Files'}</span></button>
                      {window.self !== window.top && (
                        <p className="text-[10px] text-center text-white/40 font-bold">
                          {lang === 'ar' ? 'ملاحظة: إذا لم يعمل التنزيل، يرجى فتح التطبيق في علامة تبويب جديدة.' : 'Note: If download fails, please open the app in a new tab.'}
                        </p>
                      )}
                  </div>
                )}

                {activeTab === 'polygon-converter' && (
                  <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="p-8 bg-[#0b2d3d]/40 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-4"><Shapes className="w-16 h-16 text-accent mx-auto" /><h2 className="text-white font-black text-xl">{lang === 'ar' ? 'محول المضلعات' : 'Polygon Converter'}</h2><p className="text-[10px] text-white/50 leading-relaxed font-bold uppercase">{lang === 'ar' ? 'تحويل الخطوط إلى مساحات' : 'Convert lines to areas'}</p></div>
                      <FileUploadZone id="poly-up" />
                      {activeFile && (
                        <div className="space-y-4 animate-in slide-in-from-bottom">
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري تحويل الخطوط لمضلعات...' : 'Converting lines to polygons...', () => { const poly = globalPoints.map(p => p.path && p.path.length >= 3 ? {...p, type: 'Polygon' as const, path: [...p.path, p.path[0]]} : p); setGlobalPoints(poly); })} className="w-full bg-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"><Scissors className="w-5 h-5 text-accent" />{lang === 'ar' ? 'تحويل الخطوط لمضلعات' : 'Lines to Polygons'}</button>
                            <button onClick={() => runWithLoading(lang === 'ar' ? 'جاري إنشاء المضلع الشامل (Boundary)...' : 'Generating Convex Boundary...', () => { const all: {x:number, y:number}[] = []; globalPoints.forEach(p => p.path ? p.path.forEach(pt => all.push({x:pt.x, y:pt.y})) : all.push({x:p.x, y:p.y})); const hull = calculateConvexHull(all); const bound: GeoPoint = { id: 'Boundary', x: hull[0].x, y: hull[0].y, type: 'Polygon', path: hull, color: '#ffffff', layer: 'Boundary' }; setGlobalPoints([bound]); setDataId(`boundary-gen-${Date.now()}`); })} className="w-full bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl"><BoxSelect className="w-5 h-5" />{lang === 'ar' ? 'إنشاء مضلع شامل (Boundary)' : 'Create Convex Boundary'}</button>
                            <UniversalExportBar
                                data={globalPoints}
                                filename={activeFile?.filename || 'Polygon_Data'}
                                lang={lang}
                                isExecuting={loading}
                                runWithLoading={runWithLoading}
                                onExcelExport={() => downloadExcelAnalysis()}
                                onKmzExport={() => downloadKMZ(globalPoints, activeFile?.filename || 'Polygon_Data', { mode: 'none' }, activeFile?.headers)}
                            />
                        </div>
                      )}
                  </div>
                )}

                {activeTab === 'classifier' && (
                  <MapClassifier
                    lang={lang}
                    targetAssets={globalPoints}
                    setTargetAssets={setGlobalPoints}
                    setRefPolygons={setClassifierRefZones}
                    setDataId={setDataId}
                    runWithLoading={runWithLoading}
                    setGlobalLoading={setLoading}
                    setGlobalProgress={setProgressPercent}
                    setGlobalStatus={setStatusMessage}
                  />
                )}

                {activeTab === 'attribute-formatter' && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <FileUploadZone id="attr-fmt-up" label={lang === 'ar' ? '1. رفع الملف لتنسيق البيانات والشفرات' : '1. Upload File for Data Formatting'} />
                    <DataFormatter
                      onVerifyMissingAttributes={verifyEssentialAttributes}
                      onVerifyPermitSegment={verifyPermitAndSegmentId}
                      onVerifyPermitNo={verifyPermitNo}
                      onVerifyYellowMissing={verifyYellowLinesMissingPermitAndSegmentId}
                      onVerifySbc={verifySaudiBuildingCodeSbc}
                      points={globalPoints}
                      headers={activeFile?.headers}
                      lang={lang}
                      fetchStreets={executeWithStreetFetching}
                      geocodingMode={geocodingMode}
                      setGeocodingMode={setGeocodingMode}
                      runWithLoading={runWithLoading}
                      setGlobalLoading={setLoading}
                      setGlobalStatus={setStatusMessage}
                      setGlobalProgress={setProgressPercent}
                    />
                  </div>
                )}
                {activeTab === 'comparator' && (
                  <FileComparator
                    lang={lang}
                    setGlobalPoints={setGlobalPoints}
                    setDataId={setDataId}
                    runWithLoading={runWithLoading}
                    setGlobalLoading={setLoading}
                    setGlobalProgress={setProgressPercent}
                    setGlobalStatus={setStatusMessage}
                  />
                )}
                {activeTab === 'line-drawer' && (
                  <LineDrawerTab
                    lang={lang}
                    globalPoints={globalPoints}
                    setGlobalPoints={setGlobalPoints}
                    setDataId={setDataId}
                    runWithLoading={runWithLoading}
                    setGlobalLoading={setLoading}
                    setGlobalProgress={setProgressPercent}
                    setGlobalStatus={setStatusMessage}
                  />
                )}
                {activeTab === 'segment-vault' && (
                  <SegmentVaultManager
                    lang={lang}
                    activePoints={globalPoints.length > 0 ? globalPoints : plannedStreets}
                    activeFileName={activeFile?.filename}
                    onLoadProjectToMap={handleLoadSavedProjectToMap}
                    runWithLoading={runWithLoading}
                  />
                )}
                {activeTab === 'sbc-checker' && (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <FileUploadZone id="sbc-up" label={lang === 'ar' ? '1. رفع الملف لفحص كود البناء' : '1. Upload File for SBC Check'} />
                    <SbcValidator
                      points={getPointsToCheck()}
                      lang={lang}
                      onHighlightPoints={highlightSpecificSegmentId}
                      onApplySbcColors={(coloredPoints) => {
                        setGlobalPoints(coloredPoints);
                        setStatusMessage(
                          lang === 'ar'
                            ? 'تم تطبيق تمييز ألوان كود البناء السعودي على الخريطة (أحمر للمخالفات، أصفر للتحذيرات، أخضر للمطابق)'
                            : 'Applied Saudi Building Code map color coding (Red=Errors, Yellow=Warnings, Green=Compliant)'
                        );
                      }}
                      runWithLoading={runWithLoading}
                      setGlobalLoading={setLoading}
                      setGlobalStatus={setStatusMessage}
                      setGlobalProgress={setProgressPercent}
                    />
                  </div>
                )}
           </div>

           <div className="p-8 border-t border-white/5 bg-black/10 shrink-0"><div className="space-y-2"><div className="flex items-center gap-2 text-white/40 group"><Mail className="w-3 h-3 group-hover:text-accent transition-colors" /><span className="text-[10px] font-bold">{t.contactDev}:</span><a href="mailto:almangoryo@gmail.com" className="text-[10px] font-black text-accent hover:underline">almangoryo@gmail.com</a></div><p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{t.developedBy}</p></div></div>
      </aside>

      <main className={cn("flex-1 relative bg-[#0d1b24]", mobileView === 'map' ? "flex w-full flex-1 h-full" : "hidden lg:flex")}>
          <MapPreview
            globalBaseMap={globalBaseMap}
            points={displayPoints}
            lang={lang}
            dataId={dataId}
            overlapResults={overlapResults}
            onPointClick={(pt) => {
              if (['LineString', 'Polygon'].includes(pt.type || '')) {
                if (selectedProfilePoints.length > 0) {
                  const exists = selectedProfilePoints.some((s) => s.id === pt.id);
                  let updated: GeoPoint[];
                  if (exists) {
                    updated = selectedProfilePoints.filter((s) => s.id !== pt.id);
                  } else {
                    updated = [...selectedProfilePoints, pt];
                  }
                  setSelectedProfilePoints(updated);
                  if (updated.length === 0) {
                    setFocusedPoint(null);
                  } else {
                    setFocusedPoint(updated[0]);
                  }
                } else {
                  setFocusedPoint(pt);
                  setSelectedProfilePoints([pt]);
                }
              } else {
                setFocusedPoint(pt);
              }
            }}
            focusedPoint={focusedPoint}
            selectedProfilePoints={selectedProfilePoints}
            hoveredElevationPoint={hoveredElevationPoint}
            issueItems={activeIssueItems}
            showIssuesOnly={showIssuesOnly}
            onToggleShowIssuesOnly={setShowIssuesOnly}
            onClearAudit={clearAuditResults}
            showFlowDirection={showFlowDirection}
            onToggleFlowDirection={setShowFlowDirection}
            flowAnalysis={flowAnalysis}
            isSelectionMode={isDrawingMode || activeTab === 'street-planner' || activeTab === 'polygon-converter' || (activeTab === 'splitter' && splitMode === 'spatial')}
            onPolygonComplete={(poly) => {
              if (activeTab === 'splitter' && splitMode === 'spatial') {
                const newPoly: SplitPolygon = {
                  id: `poly-${Date.now()}`,
                  name: `${lang === 'ar' ? 'مضلع' : 'Polygon'} ${splitPolygons.length + 1}`,
                  path: poly,
                  color: PALETTE[splitPolygons.length % PALETTE.length]
                };
                setSplitPolygons([...splitPolygons, newPoly]);
              } else {
                setSelectedArea(poly);
                setBoundaryPolygon({ id: 'Selected_Area', x: poly[0].x, y: poly[0].y, type: 'Polygon', path: poly, color: '#ffffff' });
              }
              setIsDrawingMode(false);
            }}
         />
         <ElevationProfileModal
           lang={lang}
           focusedPoint={focusedPoint}
           selectedProfilePoints={selectedProfilePoints}
           allDatasetPoints={displayPoints}
           onClose={() => {
             setFocusedPoint(null);
             setSelectedProfilePoints([]);
           }}
           onHoverPoint={setHoveredElevationPoint}
           onSelectPointsChange={(pts) => {
             setSelectedProfilePoints(pts);
             if (pts.length === 0) setFocusedPoint(null);
           }}
         />

         {/* Mobile Floating Button to Return to Tools Panel */}
         <div className="lg:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
           <button
             onClick={() => setMobileView('panel')}
             className="px-5 py-3 bg-[#0b2d3d] text-accent border-2 border-accent rounded-full font-black text-xs shadow-2xl flex items-center gap-2 active:scale-95 transition-all"
           >
             <SlidersHorizontal className="w-4 h-4" />
             <span>{lang === 'ar' ? 'العودة بلوحة الأدوات والخيارات' : 'Back to Tools Panel'}</span>
           </button>
         </div>


         {showSettingsModal && (
             <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                 <div className="bg-[#0b2d3d] border border-accent/40 rounded-[3rem] w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(220,177,60,0.15)] overflow-hidden">
                     <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/20">
                         <div className="flex items-center gap-3">
                             <Settings2 className="w-6 h-6 text-accent" />
                             <div>
                                <h2 className="text-xl font-black text-white">{lang === 'ar' ? 'إعدادات التطبيق والتفضيلات' : 'App Settings & Preferences'}</h2>
                                <p className="text-[10px] text-accent/80 font-bold flex items-center gap-1.5 mt-0.5">
                                  <Check className="w-3.5 h-3.5 text-accent" />
                                  <span>{lang === 'ar' ? 'تُحفظ التفضيلات تلقائياً في المتصفح (localStorage)' : 'Preferences automatically saved in browser (localStorage)'}</span>
                                </p>
                              </div>
                         </div>
                         <button onClick={() => setShowSettingsModal(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-all"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="p-8 overflow-y-auto space-y-8 flex-1">
                         <div className="space-y-4">
                          {/* 0. PWA Mobile App Section */}
                          <div className="space-y-3 bg-gradient-to-r from-accent/15 via-amber-500/10 to-accent/15 p-5 rounded-2xl border border-accent/30 shadow-lg">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-accent">
                                   <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
                                      <Smartphone className="w-5 h-5 text-accent animate-bounce" />
                                   </div>
                                   <div>
                                      <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'تثبيت تطبيق الجوال (Mobile App)' : 'Install Mobile Application'}</h3>
                                      <p className="text-[10px] text-white/70 font-bold mt-0.5">{lang === 'ar' ? 'تشغيل GeoGIS Pro كتطبيق جوال كامل الشاشة بدون متصفح' : 'Run GeoGIS Pro as a native full-screen app'}</p>
                                   </div>
                                </div>
                                <button
                                   type="button"
                                   onClick={() => {
                                      setShowSettingsModal(false);
                                      setShowInstallModal(true);
                                   }}
                                   className="px-4 py-2 bg-accent hover:brightness-110 text-primary font-black text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 active:scale-95 shrink-0"
                                >
                                   <Smartphone className="w-4 h-4" />
                                   <span>{isStandalone ? (lang === 'ar' ? 'حالة التثبيت' : 'App Status') : (lang === 'ar' ? 'تثبيت الآن' : 'Install App')}</span>
                                </button>
                             </div>
                          </div>

                          {/* 1. Language & Theme */}
                          <div className="space-y-3 bg-white/5 p-5 rounded-2xl border border-white/5">
                             <div className="flex items-center gap-2 text-accent">
                                <Languages className="w-4 h-4" />
                                <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'اللغة والمظهر (Language & Theme)' : 'Language & Interface Theme'}</h3>
                             </div>
                             <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'لغة الواجهة:' : 'Interface Language:'}</label>
                                   <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setLang('ar')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", lang === 'ar' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        العربية
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLang('en')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", lang === 'en' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        English
                                      </button>
                                   </div>
                                </div>

                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'المظهر:' : 'Theme:'}</label>
                                   <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setTheme('default')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", theme === 'default' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'الافتراضي' : 'Default'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setTheme('nwc')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", theme === 'nwc' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'شركة المياه NWC' : 'NWC Theme'}
                                      </button>
                                   </div>
                                </div>
                             </div>
                          </div>

                          {/* Dark Mode / Display Theme Mode */}
                           <div className="space-y-3 bg-white/5 p-5 rounded-2xl border border-white/5">
                              <div className="flex items-center gap-2 text-accent">
                                 <Palette className="w-4 h-4" />
                                 <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'نمط الرؤية (Dark / Light Mode)' : 'Display Theme Mode'}</h3>
                              </div>
                              <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                 <button
                                   type="button"
                                   onClick={() => setIsDarkMode(true)}
                                   className={cn("flex-1 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2", isDarkMode ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                 >
                                   <Moon className="w-4 h-4" />
                                   <span>{t.darkMode} 🌙</span>
                                 </button>
                                 <button
                                   type="button"
                                   onClick={() => setIsDarkMode(false)}
                                   className={cn("flex-1 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2", !isDarkMode ? "bg-amber-400 text-slate-900 shadow font-extrabold" : "text-white/60 hover:text-white")}
                                 >
                                   <Sun className="w-4 h-4" />
                                   <span>{t.lightMode} ☀️</span>
                                 </button>
                              </div>
                           </div>

                           {/* 2. Geocoding & Coordinate System */}
                          <div className="space-y-3 bg-white/5 p-5 rounded-2xl border border-white/5">
                             <div className="flex items-center gap-2 text-accent">
                                <Target className="w-4 h-4" />
                                <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'نظام الإحداثيات ودقة الجيودكودينغ' : 'CRS & Geocoding Precision'}</h3>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'نظام الإحداثيات الافتراضي (Default CRS):' : 'Default Coordinate System (CRS):'}</label>
                                   <select
                                      value={sourceEPSG}
                                      onChange={(e) => setSourceEPSG(e.target.value)}
                                      className="w-full bg-black/40 border border-white/10 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-accent"
                                   >
                                      {COMMON_EPSG.map(epsg => (
                                         <option key={epsg.code} value={epsg.code} className="bg-[#0b2d3d] text-white">
                                            {epsg.code} - {epsg.name}
                                         </option>
                                      ))}
                                   </select>
                                </div>

                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'نمط الجيودكودينغ واستدلال الشوارع:' : 'Geocoding Accuracy Mode:'}</label>
                                   <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setGeocodingMode('accurate')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", geocodingMode === 'accurate' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? '🎯 دقيق جداً' : '🎯 Accurate'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGeocodingMode('fast')}
                                        className={cn("flex-1 py-2 rounded-lg text-xs font-black transition-all", geocodingMode === 'fast' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? '⚡ سريع جداً' : '⚡ Fast'}
                                      </button>
                                   </div>
                                </div>
                             </div>
                          </div>

                          {/* 3. Default Export Options */}
                          <div className="space-y-3 bg-white/5 p-5 rounded-2xl border border-white/5">
                             <div className="flex items-center gap-2 text-accent">
                                <Archive className="w-4 h-4" />
                                <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'تفضيلات وصيغ التصدير' : 'Export & Packaging Preferences'}</h3>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'طريقة التجميع الافتراضية:' : 'Default Grouping Mode:'}</label>
                                   <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setGroupingMode('layer')}
                                        className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all", groupingMode === 'layer' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'حسب الطبقة' : 'By Layer'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGroupingMode('column')}
                                        className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all", groupingMode === 'column' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'حسب العمود' : 'By Column'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGroupingMode('none')}
                                        className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all", groupingMode === 'none' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'بدون تجميع' : 'None'}
                                      </button>
                                   </div>
                                </div>

                                <div className="space-y-1.5">
                                   <label className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'صيغة التصدير الافتراضية (المقسم):' : 'Splitter Default Export Style:'}</label>
                                   <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setExportStyle('single')}
                                        className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all", exportStyle === 'single' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'ملف KML موحد' : 'Single KML'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setExportStyle('zip')}
                                        className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all", exportStyle === 'zip' ? "bg-accent text-primary shadow" : "text-white/60 hover:text-white")}
                                      >
                                        {lang === 'ar' ? 'أرشيف ZIP مضغوط' : 'ZIP Archive'}
                                      </button>
                                   </div>
                                </div>
                             </div>

                             <div className="space-y-2 pt-2 border-t border-white/5">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white/80 hover:text-white transition-colors">
                                   <input
                                     type="checkbox"
                                     checked={optimizeForMyMaps}
                                     onChange={(e) => setOptimizeForMyMaps(e.target.checked)}
                                     className="rounded bg-black/40 border-white/20 text-accent focus:ring-accent"
                                   />
                                   <span>{lang === 'ar' ? 'تفعيل التوافق الكامل مع خرائط جوجل (Google My Maps)' : 'Optimize for Google My Maps compatibility'}</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white/80 hover:text-white transition-colors">
                                   <input
                                     type="checkbox"
                                     checked={keepOriginalDescription}
                                     onChange={(e) => setKeepOriginalDescription(e.target.checked)}
                                     className="rounded bg-black/40 border-white/20 text-accent focus:ring-accent"
                                   />
                                   <span>{lang === 'ar' ? 'الاحتفاظ بنص الوصف (Description) الأصلي في ملفات KML' : 'Keep original description content in output KML'}</span>
                                </label>
                             </div>
                          </div>

                          {/* 4. Default Line Split Lengths */}
                          <div className="space-y-3 bg-white/5 p-5 rounded-2xl border border-white/5">
                             <div className="flex items-center gap-2 text-accent">
                                <Ruler className="w-4 h-4" />
                                <h3 className="text-xs font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'أطوال تقسيم الخطوط الافتراضية' : 'Default Line Split Distances'}</h3>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                <div className="space-y-1.5">
                                   <div className="flex justify-between items-center text-[10px] font-bold text-white/60">
                                      <span>{lang === 'ar' ? 'مقسم KML (الحد الأقصى للطول):' : 'KML Splitter Max Length:'}</span>
                                      <span className="text-accent font-black">{maxLen}m</span>
                                   </div>
                                   <input
                                     type="range"
                                     min="10"
                                     max="1000"
                                     step="10"
                                     value={Math.min(maxLen, 1000)}
                                     onChange={(e) => setMaxLen(parseInt(e.target.value))}
                                     className="w-full accent-accent h-1.5 bg-white/10 rounded-full cursor-pointer"
                                   />
                                </div>

                                <div className="space-y-1.5">
                                   <div className="flex justify-between items-center text-[10px] font-bold text-white/60">
                                      <span>{lang === 'ar' ? 'مخطط الشوارع (الحد الأقصى للطول):' : 'Street Planner Max Length:'}</span>
                                      <span className="text-accent font-black">{plannerMaxLen}m</span>
                                   </div>
                                   <input
                                     type="range"
                                     min="10"
                                     max="1000"
                                     step="10"
                                     value={Math.min(plannerMaxLen, 1000)}
                                     onChange={(e) => setPlannerMaxLen(parseInt(e.target.value))}
                                     className="w-full accent-accent h-1.5 bg-white/10 rounded-full cursor-pointer"
                                   />
                                </div>
                             </div>
                          </div>

                            <h3 className="text-sm font-black text-white uppercase tracking-wider">{lang === 'ar' ? 'نوع خريطة الأساس' : 'Base Map Type'}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                  { id: 'satellite', name: lang === 'ar' ? 'القمر الصناعي' : 'Satellite', icon: <Globe className="w-5 h-5" /> },
                                  { id: 'streets', name: lang === 'ar' ? 'شوارع' : 'Streets', icon: <MapIcon className="w-5 h-5" /> },
                                  { id: 'terrain', name: lang === 'ar' ? 'تضاريس' : 'Terrain', icon: <Square className="w-5 h-5" /> },
                                  { id: 'osm', name: lang === 'ar' ? 'المفتوحة (OSM)' : 'OpenStreetMap', icon: <Globe className="w-5 h-5 opacity-50" /> }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setGlobalBaseMap(type.id as import('./types').BaseMapType)}
                                        className={"flex flex-col items-center gap-3 p-4 rounded-2xl transition-all border group " + (globalBaseMap === type.id ? "bg-accent/10 border-accent text-accent" : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:border-white/10 hover:text-white")}
                                    >
                                        <div className={"p-2 rounded-xl transition-all " + (globalBaseMap === type.id ? "bg-accent text-[#0b2d3d]" : "bg-white/10 text-white/40 group-hover:text-white")}>
                                            {type.icon}
                                        </div>
                                        <span className="text-[11px] font-black uppercase text-center leading-tight">{type.name}</span>
                                    </button>
                                ))}
                            </div>
                         </div>
                      </div>

                      <div className="p-6 border-t border-white/5 bg-black/20 flex items-center justify-between shrink-0">
                          <button
                             type="button"
                             onClick={handleResetPreferences}
                             className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5"
                          >
                             <RotateCcw className="w-3.5 h-3.5" />
                             <span>{lang === 'ar' ? 'إعادة ضبط التفضيلات' : 'Reset Preferences'}</span>
                          </button>

                          <button
                             type="button"
                             onClick={() => setShowSettingsModal(false)}
                             className="px-6 py-2.5 bg-accent hover:brightness-110 text-primary font-black text-xs rounded-xl transition-all shadow-lg"
                          >
                             {lang === 'ar' ? 'حفظ وإغلاق' : 'Save & Close'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* Auto-Alert Modal for Unresolved Spatial Overlaps upon File Import */}
          {showAutoAlertModal && autoAlertInfo && (
              <div className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                  <div className="bg-gradient-to-br from-[#0e3547] via-[#08222e] to-[#041620] border-2 border-amber-400/80 rounded-[2.5rem] w-full max-w-xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.25)] space-y-6 relative overflow-hidden">
                      {/* Glow Effect */}
                      <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center shadow-lg shadow-amber-500/30 text-primary shrink-0 animate-pulse">
                                  <AlertTriangle className="w-7 h-7 stroke-[2.5px]" />
                              </div>
                              <div>
                                  <span className="inline-block px-2.5 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full text-[9px] font-black uppercase tracking-wider mb-1">
                                      {lang === 'ar' ? 'تنبيه النظام التلقائي (Auto-Alert)' : 'System Auto-Alert'}
                                  </span>
                                  <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                                      {lang === 'ar' ? 'كشف تداخلات مكانية غير محلولة قبل بدء المعالجة!' : 'Unresolved Spatial Overlaps Detected!'}
                                  </h2>
                              </div>
                          </div>
                          <button
                              onClick={() => setShowAutoAlertModal(false)}
                              className="p-2 bg-white/5 hover:bg-white/15 text-white/50 hover:text-white rounded-full transition-all"
                          >
                              <X className="w-5 h-5" />
                          </button>
                      </div>

                      {/* File Info & Stats */}
                      <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-white/80 pb-2 border-b border-white/10">
                              <span>{lang === 'ar' ? 'الملف المستورد:' : 'Imported File:'}</span>
                              <span className="text-accent font-black truncate max-w-[200px]">{autoAlertInfo.filename}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 pt-1">
                              <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex items-center justify-between">
                                  <div>
                                      <span className="text-[10px] text-red-300 font-bold block">{lang === 'ar' ? 'عناصر متطابقة' : 'Duplicates'}</span>
                                      <span className="text-lg font-black text-red-400">{autoAlertInfo.duplicatesCount}</span>
                                  </div>
                                  <Trash2 className="w-5 h-5 text-red-400/60" />
                              </div>
                              <div className="bg-cyan-500/10 border border-cyan-500/30 p-3 rounded-xl flex items-center justify-between">
                                  <div>
                                      <span className="text-[10px] text-cyan-300 font-bold block">{lang === 'ar' ? 'تقاطعات الخطوط' : 'Intersections'}</span>
                                      <span className="text-lg font-black text-cyan-400">{autoAlertInfo.intersectionsCount}</span>
                                  </div>
                                  <GitBranch className="w-5 h-5 text-cyan-400/60" />
                              </div>
                          </div>
                      </div>

                      {/* Description message */}
                      <p className="text-xs text-white/80 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                          {lang === 'ar'
                              ? 'تنبيه: يحتوي الملف المستورد على عناصر مكانية مكررة أو متقاطعة فوق بعضها. يرجى اختيار الإجراء المناسب لحلها فوراً أو معاينتها لضمان دقة المعالجة والتصدير.'
                              : 'Notice: The imported dataset contains duplicate or intersecting spatial elements. Please select a quick action to resolve them now or inspect details to ensure processing accuracy.'}
                      </p>

                      {/* Action Buttons */}
                      <div className="space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {autoAlertInfo.duplicatesCount > 0 && (
                                  <button
                                      onClick={() => {
                                          setShowAutoAlertModal(false);
                                          handleResolveDuplicates();
                                      }}
                                      className="w-full py-3 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                                  >
                                      <Trash2 className="w-4 h-4 text-red-400" />
                                      <span>{lang === 'ar' ? 'حذف المتطابقة تلقائياً 🗑️' : 'Auto-Delete Duplicates'}</span>
                                  </button>
                              )}
                              {autoAlertInfo.intersectionsCount > 0 && (
                                  <button
                                      onClick={() => {
                                          setShowAutoAlertModal(false);
                                          handleTrimIntersections();
                                      }}
                                      className="w-full py-3 px-4 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                                  >
                                      <Scissors className="w-4 h-4 text-cyan-400" />
                                      <span>{lang === 'ar' ? 'تقليم عند التقاطعات ✂️' : 'Trim Intersections'}</span>
                                  </button>
                              )}
                          </div>

                          <button
                              onClick={() => {
                                  setShowAutoAlertModal(false);
                                  setOverlapResults(autoAlertInfo?.duplicatesCount > 0 ? (autoAlertInfo?.dups || []) : (autoAlertInfo?.intersections || []));
                                  setOverlapModalType(autoAlertInfo?.duplicatesCount > 0 ? 'duplicates' : 'intersections');
                                  setShowOverlapModal(true);
                              }}
                              className="w-full py-3 px-4 bg-accent text-primary hover:brightness-110 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
                          >
                              <GitBranch className="w-4 h-4" />
                              <span>{lang === 'ar' ? 'معاينة وإدارة التداخلات التفصيلية 🔍' : 'Detailed Overlap Inspector 🔍'}</span>
                          </button>

                          <button
                              onClick={() => setShowAutoAlertModal(false)}
                              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl font-bold text-xs transition-all"
                          >
                              {lang === 'ar' ? 'متابعة بدون معالجة (تجاهل التنبيه)' : 'Dismiss & Continue'}
                          </button>

                          <button
                              onClick={clearAuditResults}
                              className="w-full py-2.5 px-4 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                          >
                              <RotateCcw className="w-4 h-4 text-rose-400" />
                              <span>{lang === 'ar' ? 'إزالة نتائج الفحص وإلغاء التظليل والتنبيهات 🧹' : 'Clear Audit & Auto-Alert Results 🧹'}</span>
                          </button>
                      </div>
                  </div>
              </div>
          )}

         {showOverlapModal && overlapResults && (
             <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                 <div className="bg-[#0b2d3d] border border-accent/40 rounded-[3rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(220,177,60,0.15)] overflow-hidden">
                     <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-black/20">
                         <div className="flex items-center gap-3">
                             {overlapModalType === 'duplicates' ? (
                                 <AlertTriangle className="w-6 h-6 text-amber-400" />
                             ) : (
                                 <GitBranch className="w-6 h-6 text-cyan-400" />
                             )}
                             <div>
                               <h2 className="text-lg font-black text-white">
                                   {overlapModalType === 'duplicates'
                                       ? (lang === 'ar' ? 'نتائج ومعالجة التطابق (عنصر فوق عنصر)' : 'Duplicate Matching Results')
                                       : (lang === 'ar' ? 'نتائج ومعالجة تقاطعات الخطوط (نقاط التلاقي)' : 'Line Intersection Results')}
                               </h2>
                               <p className="text-[10px] text-accent font-bold mt-0.5">
                                   {overlapModalType === 'duplicates'
                                       ? (lang === 'ar' ? 'فحص وحذف العناصر المتطابقة والموجودة فوق بعضها تماماً' : 'Check & resolve exact duplicate elements')
                                       : (lang === 'ar' ? 'عرض وتقليم الخطوط المتقاطعة والمتلاقية عند نقاط العبور' : 'Check & trim intersecting lines at crossing points')}
                               </p>
                             </div>
                         </div>
                         <div className="flex items-center gap-2">
                             {overlapResults && overlapResults.length > 0 && (
                                 <div className="flex items-center gap-2 flex-wrap">
                                     {overlapModalType === 'duplicates' ? (
                                         <>
                                             <button
                                                 onClick={handleColorDuplicatesBlack}
                                                 className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white border border-white/20 font-black rounded-xl transition-all text-xs shadow-md flex items-center gap-1.5 active:scale-95"
                                                 title={lang === 'ar' ? 'تلوين الخطوط المتطابقة (خط فوق خط) باللون الأسود' : 'Color duplicate lines black'}
                                             >
                                                 <Palette className="w-4 h-4 text-white" />
                                                 <span>{lang === 'ar' ? 'تلوين المتطابقة ⬛' : 'Color Duplicates ⬛'}</span>
                                             </button>
                                             <button
                                                 onClick={clearAuditResults}
                                                 className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-black rounded-xl transition-all text-xs shadow-md flex items-center gap-1.5 active:scale-95"
                                                 title={lang === 'ar' ? 'إزالة كافة نتائج الفحص والتظليل والتنبيهات' : 'Clear all audit results'}
                                             >
                                                 <RotateCcw className="w-4 h-4 text-rose-400" />
                                                 <span>{lang === 'ar' ? 'إزالة نتائج الفحص 🧹' : 'Clear Audit 🧹'}</span>
                                             </button>
                                             <button
                                                 onClick={handleResolveDuplicates}
                                                 className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-black rounded-xl transition-all text-xs shadow-md flex items-center gap-1.5 active:scale-95"
                                                 title={lang === 'ar' ? 'حذف العناصر المتطابقة المكررة تماماً' : 'Delete duplicate elements'}
                                             >
                                                 <Trash2 className="w-4 h-4 text-red-400" />
                                                 <span>{lang === 'ar' ? 'حذف المتطابقة 🗑️' : 'Delete Duplicates'}</span>
                                             </button>
                                         </>
                                     ) : (
                                         <button
                                             onClick={handleTrimIntersections}
                                             className="px-3.5 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 font-black rounded-xl transition-all text-xs shadow-md flex items-center gap-1.5 active:scale-95"
                                             title={lang === 'ar' ? 'تقليم أطوال الخطوط عند نقاط التقاطع' : 'Trim line lengths at intersection points'}
                                         >
                                             <Scissors className="w-4 h-4 text-blue-400" />
                                             <span>{lang === 'ar' ? 'تقليم عند التقاطعات ✂️' : 'Trim Intersections ✂️'}</span>
                                         </button>
                                     )}

                                 </div>
                             )}
                             <button
                                 onClick={() => setShowOverlapModal(false)}
                                 className="p-2 bg-white/5 hover:bg-white/15 text-white/50 hover:text-white rounded-full transition-all"
                             >
                                 <X className="w-5 h-5" />
                             </button>
                         </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                         {overlapResults && overlapResults.length > 0 ? (
                             <>
                                 {overlapModalType === 'duplicates' ? (
                                     <div className="p-5 bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border border-red-500/40 rounded-2xl flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                                         <div className="flex items-start gap-3">
                                             <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                                             <div>
                                                 <h3 className="text-red-400 font-bold text-sm mb-1">
                                                     {lang === 'ar' ? `تم كشف ${overlapResults.length} عنصر متطابق (خط فوق خط)!` : `Detected ${overlapResults.length} duplicate elements!`}
                                                 </h3>
                                                 <p className="text-red-300/80 text-xs leading-relaxed">
                                                     {lang === 'ar'
                                                         ? `• العناصر المتطابقة عبارة عن خطوط أو نقاط مرسومة فوق بعضها بالكامل ضمن مسافة ${duplicateTolerance}m.\n• يمكنك تلوينها باللون الأسود ⬛ لتمييزها أو حذف العناصر المكررة 🗑️.`
                                                         : '• Duplicate elements are geometries drawn directly on top of each other.\n• You can color them black ⬛ or delete duplicate items 🗑️.'}
                                                 </p>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2 flex-wrap shrink-0">
                                             <button
                                                 onClick={handleResolveDuplicates}
                                                 className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-black text-xs rounded-xl border border-red-500/30 transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                                             >
                                                 <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                 <span>{lang === 'ar' ? 'حذف المتطابقة' : 'Delete Duplicates'}</span>
                                             </button>
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="p-5 bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent border border-cyan-500/40 rounded-2xl flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                                         <div className="flex items-start gap-3">
                                             <GitBranch className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                                             <div>
                                                 <h3 className="text-cyan-400 font-bold text-sm mb-1">
                                                     {lang === 'ar' ? `تم كشف ${overlapResults.length} نقطة تقاطع بين الخطوط!` : `Detected ${overlapResults.length} line intersections!`}
                                                 </h3>
                                                 <p className="text-cyan-300/80 text-xs leading-relaxed">
                                                     {lang === 'ar'
                                                         ? '• التقاطعات عبارة عن خطوط تتلاقى وتتداخل عند نقطة عبور دون أن تكون متطابقة فوق بعضها.\n• يمكنك تقليم طول الخطوط عند نقاط التقاطع بدون حذف العناصر ✂️.'
                                                         : '• Intersections are line elements crossing at junction points.\n• You can trim line lengths at crossing points without deleting elements ✂️.'}
                                                 </p>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2 flex-wrap shrink-0">
                                             <button
                                                 onClick={handleTrimIntersections}
                                                 className="px-3.5 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-black text-xs rounded-xl border border-blue-500/30 transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                                             >
                                                 <Scissors className="w-3.5 h-3.5 text-blue-400" />
                                                 <span>{lang === 'ar' ? 'تقليم عند التقاطعات ✂️' : 'Trim Intersections ✂️'}</span>
                                             </button>
                                         </div>
                                     </div>
                                 )}
                                 <div className="space-y-3">
                                     {overlapResults.slice(0, 50).map((overlap, idx) => (
                                         <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                                             <div className="flex flex-col gap-1">
                                                 <div className="flex items-center gap-2">
                                                     <span className="text-[10px] font-black text-white/40 bg-white/5 px-2 py-1 rounded-md">{overlap.type}</span>
                                                     <span className="text-xs font-bold text-white">ID: {overlap.id1}</span>
                                                     <span className="text-white/40 mx-1">{overlapModalType === 'duplicates' ? '↔' : '✕'}</span>
                                                     <span className="text-xs font-bold text-white">ID: {overlap.id2}</span>
                                                 </div>
                                                 {overlap.intersectionPoint && (
                                                     <span className="text-[10px] text-cyan-300/80 font-mono">
                                                         📍 Lat: {overlap.intersectionPoint.y.toFixed(6)}, Lon: {overlap.intersectionPoint.x.toFixed(6)}
                                                     </span>
                                                 )}
                                             </div>
                                             <div className="flex items-center gap-2 shrink-0">
                                                 {overlapModalType === 'duplicates' ? (
                                                     <>
                                                         <span className="text-[10px] text-amber-400 font-bold bg-amber-400/10 px-2 py-1 rounded-md">
                                                             {lang === 'ar' ? 'عنصر متطابق' : 'Duplicate'}
                                                         </span>
                                                         <button
                                                             onClick={() => handleDeleteDuplicateItem(overlap.id2)}
                                                             className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 active:scale-95"
                                                             title={lang === 'ar' ? 'حذف العنصر المكرر' : 'Delete Duplicate'}
                                                         >
                                                             <Trash2 className="w-3 h-3" />
                                                             <span>{lang === 'ar' ? `حذف ${overlap.id2}` : `Del ${overlap.id2}`}</span>
                                                         </button>
                                                     </>
                                                 ) : (
                                                     <>
                                                         <span className="text-[10px] text-cyan-400 font-bold bg-cyan-400/10 px-2 py-1 rounded-md">
                                                             {lang === 'ar' ? 'تقاطع خطوط' : 'Intersection'}
                                                         </span>
                                                     </>
                                                 )}
                                             </div>
                                         </div>
                                     ))}
                                     {overlapResults && overlapResults.length > 50 && (
                                         <div className="text-center p-4 text-white/40 text-xs font-bold">
                                             {lang === 'ar' ? `و ${overlapResults.length - 50} عنصر آخر...` : `And ${overlapResults.length - 50} more items...`}
                                         </div>
                                     )}
                                 </div>
                             </>
                         ) : (
                             <div className="text-center p-12 space-y-4">
                                 <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                                     <Check className="w-8 h-8 text-green-400" />
                                 </div>
                                 <h3 className="text-green-400 font-black text-xl">
                                     {overlapModalType === 'duplicates'
                                         ? (lang === 'ar' ? 'تمت المعالجة - الخريطة خالية تماماً من العناصر المتطابقة!' : 'Processed - No Duplicate Elements Remaining!')
                                         : (lang === 'ar' ? 'تمت المعالجة - الخريطة خالية من تقاطعات الخطوط!' : 'Processed - No Line Intersections Remaining!')}
                                 </h3>
                                 <p className="text-white/70 text-xs max-w-md mx-auto leading-relaxed">
                                     {lang === 'ar'
                                         ? 'جميع العناصر المكانية الآن فريدة وخالية من المشاكل الهندسية. يمكنك إغلاق النافذة وتصدير البيانات مباشرة وبدقة عالية.'
                                         : 'All spatial elements are now clean and unique. You can close this modal and safely export your file.'}
                                 </p>
                                 <button
                                     onClick={() => setShowOverlapModal(false)}
                                     className="px-6 py-2.5 bg-accent text-primary font-black text-xs rounded-xl hover:brightness-110 transition-all shadow-lg active:scale-95"
                                 >
                                     {lang === 'ar' ? 'حفظ وتأكيد البيانات' : 'Confirm & Close'}
                                 </button>
                             </div>
                         )}
                     </div>
                 </div>
             </div>
         )}

         {showManual && (
             <div className="absolute inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-12 overflow-y-auto print:absolute print:inset-0 print:z-[2000] print:bg-white print:p-0" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                 {/* Print-friendly container */}
                 <div className="bg-gradient-to-br from-[#0c2b3a] to-[#041620] border border-accent/40 rounded-[3rem] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_20px_50px_rgba(220,177,60,0.15)] overflow-hidden print:w-full print:max-w-none print:h-full print:max-h-none print:bg-white print:border-none print:shadow-none print:text-black">

                     {/* Modal Header */}
                     <div className="p-8 border-b border-white/5 flex items-center justify-between shrink-0 print:hidden bg-black/20">
                         <div className="flex items-center gap-3">
                             <FileText className="w-6 h-6 text-accent" />
                             <h2 className="text-lg font-black text-white">{lang === 'ar' ? 'دليل المستخدم الشامل للبرنامج' : 'Universal Map Converter User Guide'}</h2>
                         </div>
                         <div className="flex items-center gap-2">
                             <button
                                 onClick={() => window.print()}
                                 className="px-4 py-2.5 bg-accent hover:brightness-110 active:scale-95 text-primary rounded-xl font-black text-[11px] transition-all flex items-center gap-1.5 shadow-lg"
                             >
                                 <Download className="w-4 h-4" />
                                 <span>{lang === 'ar' ? 'طباعة / حفظ كـ PDF' : 'Print / Save as PDF'}</span>
                             </button>
                             <button
                                 onClick={() => setShowManual(false)}
                                 className="p-2 bg-white/5 hover:bg-white/15 text-white/50 hover:text-white rounded-full transition-all"
                             >
                                 <X className="w-5 h-5" />
                             </button>
                         </div>
                     </div>

                     {/* Modal Body / Content */}
                     <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar print:p-0 print:overflow-visible">
                         <div className="text-center pb-6 border-b border-white/10">
                             <h1 className="text-2xl font-black text-accent mb-2 print:text-black print:text-xl">{lang === 'ar' ? 'دليل تشغيل المحول الشامل للخرائط والمساحة' : 'Universal Map & GIS Converter User Manual'}</h1>
                             <p className="text-[11px] text-white/50 font-bold uppercase tracking-widest print:text-black/50">
                                 {lang === 'ar' ? 'دليل خطوة بخطوة للتحويل والتقسيم وتخطيط الشوارع وتحليل أطوال الشبكات' : 'Step-by-Step Guide for Converting, Splitting, Planning, and Network Length Analysis'}
                             </p>
                         </div>

                         {/* Sections list */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-1 print:gap-4">
                             {/* Section 1: عرض الخريطة والمنسوب الطبوغرافي */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><MapPin className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "1. عرض الخريطة والمنسوب الطبوغرافي (Map & Profile)" : "1. Map Viewer & Elevation Profile"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "استعراض البيانات المكانية على خرائط تفاعلية متعددة الطبقات وإجراء تحليلات المناسيب والقطاعات الطولية." : "View spatial data on interactive multi-layer maps and perform level and longitudinal elevation profile analysis."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li><b>التحكم بالخرائط:</b> التبديل بين خرائط القمريات (Satellite)، الشوارع، التضاريس، و OpenStreetMap مع نمط الرؤية ثلاثية الأبعاد (3D).</li>
                                             <li><b>أداة قياس المنسوب (Profile Tool):</b> انقر على أي خط أو أنبوب لعرض قطاع المنسوب الطبوغرافي التفاعلي بالارتفاعات (Z) والميول (Slope %) والمسافات التراكمية.</li>
                                             <li><b>مؤشر الخريطة المباشر:</b> تحريك الماوس على المخطط البياني يحدد موقعك فورياً بسهم أحمر ثلاثي الأبعاد حركي على الخريطة.</li>
                                             <li><b>تقارير الخريطة:</b> استخراج تقارير هندسية بصيغة PDF وتصدير بيانات الموقع فورياً.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li><b>Map Controls:</b> Switch between Satellite, Street, Terrain, and OpenStreetMap basemaps with 3D view mode.</li>
                                             <li><b>Elevation Profile Tool:</b> Click any pipeline to generate an interactive profile chart showing Z-elevations, slope %, and cumulative distances.</li>
                                             <li><b>Interactive Pointer:</b> Hovering on the profile chart dynamically moves a 3D animated red arrow pointer directly on the Leaflet map.</li>
                                             <li><b>Map Reports:</b> Generate professional PDF engineering map reports instantly.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 2: محول الإحداثيات والبيانات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><RefreshCw className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "2. محول الإحداثيات والبيانات (Converter)" : "2. Coordinate Converter"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "تحويل الإحداثيات والبيانات من ملفات Excel, CSV, DXF, KMZ, GDB إلى KML/KMZ مباشرة." : "Convert points and lines from Excel, CSV, DXF, KMZ, GDB directly into clean KML/KMZ files."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>ارفع الملف بالنقر أو السحب لمنطقة الرفع التفاعلية.</li>
                                             <li>اختر نظام الإحداثيات المصدر (مثل UTM Zone 37N-40N أو عين العبد أو WGS84).</li>
                                             <li>عيّن أسماء الأعمدة في ملفك (الاسم، السيني X، الصادي Y، المنسوب Z).</li>
                                             <li>حمل ملف KML أو KMZ المنسق لمشاهدة البيانات بدقة على الخريطة.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Upload files via drag and drop or browsing.</li>
                                             <li>Select source CRS (UTM Zone 37N-40N, Ain El Abd, WGS84).</li>
                                             <li>Map coordinate columns (Name, Easting X, Northing Y, Elevation Z).</li>
                                             <li>Download styled, full-fidelity KML/KMZ output files.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 3: مخطط الشوارع */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><MapPinned className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "3. مخطط الشوارع (Street Planner)" : "3. Street Planner"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "استخراج مسارات الشوارع الفعلية من خرائط OpenStreetMap لتخطيط شبكات المياه والصرف الصحي." : "Extract real geographic street layouts from OpenStreetMap for water & wastewater network planning."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>استخدم أداة "رسم النطاق" لتحديد المنطقة المستهدفة على الخريطة.</li>
                                             <li>اختر نوع الشبكة المطلوبة (مياه أو صرف صحي).</li>
                                             <li>حدد أنواع الشوارع (رئيسية، فرعية، سكنية) لاستخراجها.</li>
                                             <li>انقر على استخراج لإنشاء شبكة خطوط جاهزة مع بيانات الشوارع وتصديرها بصيغة KML.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Use "Draw Polygon" to select your target area on the map.</li>
                                             <li>Select network type (Water or Wastewater).</li>
                                             <li>Choose street hierarchies (primary, secondary, residential).</li>
                                             <li>Extract to generate network lines with street names and export as KML.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 4: محلل الأطوال */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><BarChart3 className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "4. محلل أطوال الشبكات (Network Analyzer)" : "4. Network Length Analyzer"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "تحليل أطوال شبكات المياه والصرف الصحي المرفوعة وتصنيفها حسب الأقطار والمواد." : "Analyze lengths and attributes of uploaded water and wastewater networks categorized by diameter and material."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>ارفق ملف KML/KMZ يحتوي على مسارات الشبكة المطلوبة.</li>
                                             <li>يتعرف النظام تلقائياً على الأعمدة (DIAMETER, MATERIAL).</li>
                                             <li>استعرض إجمالي الأطوال مقسمة حسب القطر ونوع المادة بالأمتار والكيلومترات.</li>
                                             <li>قم بتصدير البيانات كتقرير عروض تقديمية احترافية (PowerPoint - PPTX) وإكسل.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Upload KML/KMZ files containing network pipelines.</li>
                                             <li>System automatically identifies attributes (DIAMETER, MATERIAL).</li>
                                             <li>View total lengths categorized by diameter and material type in meters & kilometers.</li>
                                             <li>Export the analysis as a Presentation Report (PPTX) and Excel.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 5: كود البناء السعودي */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-amber-400/10 rounded-xl text-amber-400"><ShieldCheck className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "5. كود البناء السعودي (SBC Code Check)" : "5. Saudi Building Code (SBC Validator)"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "فحص ومطابقة الشبكات والخطوط مع متطلبات كود البناء السعودي (SBC 701/702/1001)." : "Validate pipelines against Saudi Building Code (SBC 701/702/1001) engineering standards."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>التحقق آلياً من الأعماق، درجات الانحدار، أغطية الأنابيب (Pipe Cover)، والميول المسموحة.</li>
                                             <li>تمييز ألوان التوافق على الخريطة مباشرة: (أخضر=مطابق، أصفر=تحذير، أحمر=مخالفة كود).</li>
                                             <li>التحقق من وجود واستيفاء رقم تصريح الحفر (Permit No) و Segment ID.</li>
                                             <li>تصدير تقارير المطابقة والمخالفات بالتفصيل لتسليم الهيئات.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Automatically verify pipe depths, slopes, pipe cover, and engineering thresholds.</li>
                                             <li>Highlight compliance on map: Green (Compliant), Yellow (Warning), Red (SBC Violation).</li>
                                             <li>Validate existence and format of Permit Numbers and Segment IDs.</li>
                                             <li>Export detailed SBC audit reports for authority submissions.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 6: تنسيق البيانات والشفرات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><Database className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "6. تنسيق البيانات والشفرات (Attribute Formatter)" : "6. Attribute Formatter"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "توحيد وهيكلة حقول البيانات الوصفية لتطابق المعايير المعتمدة لشركة المياه الوطنية." : "Standardize metadata fields and structure them according to NWC and GIS data templates."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>اختيار القالب الهندسي المستهدف (Mainline, Manhole, Valve, Hydrant).</li>
                                             <li>الجلب الآلي لأسماء الشوارع والأحياء بواسطة تقنية العنونة العكسية (Reverse Geocoding).</li>
                                             <li>الربط والاستنتاج الذكي لمعرفات القطاعات (Segment ID) وأرقام تصاريح الحفر (Permit No).</li>
                                             <li>تصدير الملف المنسق مع كامل البيانات الوصفية والشفرات المعيارية.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Select target element schema template (Mainline, Manhole, Valve, Hydrant).</li>
                                             <li>Auto-fetch street & district names via reverse geocoding from coordinates.</li>
                                             <li>Smartly infer and extract Segment IDs and Excavation Permit Numbers.</li>
                                             <li>Export formatted files with mapped attributes and standard GIS codings.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 7: مصنف الخرائط */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><Layers className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "7. مصنف الخرائط والطبقات (Map Classifier)" : "7. Map Classifier"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "تصنيف البيانات المكانية المعقدة إلى طبقات ومجلدات منظمة بجدول ألوان معتمد." : "Classify spatial data into multiple layers and colorize them based on attributes (like diameters)."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>ارفع ملف البيانات المكانية (KML/KMZ/DXF/GDB).</li>
                                             <li>اختر الحقل المراد التصنيف بناءً عليه (مثلاً القطر أو نوع المادة).</li>
                                             <li>تطبيق لوحة الألوان المعتمدة لشركة المياه والصرف الصحي تلقائياً.</li>
                                             <li>تصدير ملف مقسم إلى مجلدات أو طبقات منظمة بصرياً.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Upload spatial data files (KML/KMZ/DXF/GDB).</li>
                                             <li>Select field for classification (e.g., DIAMETER or MATERIAL).</li>
                                             <li>Apply official NWC color schemes automatically.</li>
                                             <li>Export cleanly structured files grouped into folders/layers.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 8: مقسم الملفات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><Split className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "8. مقسم وصالون الملفات (File Splitter)" : "8. Spatial File Splitter"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "تجزئة الملفات المكانية الكبيرة إلى أجزاء أصغر إما بالعدد أو جغرافياً." : "Split large spatial datasets into smaller parts numerically or geographically."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>التقسيم الرقمي: تقسيم الملف الضخم إلى عدد محدد من الأجزاء المتساوية.</li>
                                             <li>التقسيم الجغرافي: استخدام أداة رسم المضلع لقص جزء محدد فقط ضمن نطاق معين.</li>
                                             <li>أداة تفكيك وتجميع العناصر (Explode/Group) وفصلها.</li>
                                             <li>تصدير الملفات المقسمة كحزمة ملفات ZIP مجمعة.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Numerical Split: Divide heavy files into equal parts.</li>
                                             <li>Geospatial Split: Use polygon drawing tool to clip out data within a specific region.</li>
                                             <li>Explode & Group tools for separating complex polylines.</li>
                                             <li>Export split items instantly as a combined ZIP file.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 9: محول المضلعات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><Shapes className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "9. محول المضلعات (Polygon Converter)" : "9. Polygon Converter & Boundary"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "تحويل الخطوط المتقطعة والمنفصلة إلى مضلعات هندسية مغلقة وإنشاء حدود النطاق." : "Automatically convert disconnected lines into closed geometric polygons and create convex boundaries."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>تتبع الخطوط وربطها لإنشاء مضلعات مغلقة (Polygons) ملونة.</li>
                                             <li>إنشاء مضلع إحاطة شامل (Convex Boundary) لكافة عناصر مشروعك على الخريطة.</li>
                                             <li>تحويل المخططات الكروكية إلى نطاقات عمل رسمية وتصديرها كملفات KML/KMZ.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Trace and connect broken lines to form closed, styled Polygons.</li>
                                             <li>Generate Convex Hull Boundaries surrounding all project features automatically.</li>
                                             <li>Convert blueprint sketches into official GIS Boundaries and export as KML/KMZ.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 10: مقارنة الشبكات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><GitCompare className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "10. مقارنة الشبكات والملفات (Comparator)" : "10. Data & Geometry Comparator"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "مقارنة ملفين مكانيين واكتشاف الفروقات والتداخلات والتطابقات بينهما." : "Compare two spatial datasets to detect duplicate lines, intersections, and geometric variances."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>رفع الملف الأساسي (Base) والملف المقارن (Compare).</li>
                                             <li>فحص واكتشاف عناصر المطابقة التامة (Duplicates) والتداخلات (Intersections).</li>
                                             <li>استعراض نتائج الفروقات تفاعلياً على الخريطة وتصدير التقارير منفصلة.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Upload Base dataset and Comparison dataset.</li>
                                             <li>Scan and isolate geometric Duplicates and line Intersections.</li>
                                             <li>Review differences interactively on the map and export comparison reports.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 11: حافظة القطاعات Segment Vault */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><FolderArchive className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "11. حافظة القطاعات (Segment Vault)" : "11. Segment Vault Manager"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "الأرشيف الذكي لإدارة قطاعات الأنابيب وربط رخص الحفر والتحكم بنطاقات التسامح." : "Smart archive for managing pipe segments, linking excavation permits, and setting tolerance limits."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>حفظ وتنظيم القطاعات مع إمكانية التجميع الآلي حسب مسافة التسامح الهندسي (Tolerance).</li>
                                             <li>ربط أرقام التصاريح (Permits) بالـ Segment ID المقابل بشكل منظم.</li>
                                             <li>استرجاع المشاريع والقطاعات المحفوظة وإعادة تحميلها بضغطة زر إلى الخريطة التفاعلية.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Store and group pipe segments automatically based on geometric tolerance limits.</li>
                                             <li>Link permit numbers with corresponding Segment IDs seamlessly.</li>
                                             <li>Reload saved projects and segments directly onto the interactive map with one click.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 12: رسم الخطوط */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><PenTool className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === "ar" ? "12. أداة رسم الخطوط (Line Drawer)" : "12. Manual Line Drawer"}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === "ar" ? "رسم وتخطيط مسارات الأنابيب والأنشطة يدوياً على الخريطة أو بإدخال الإحداثيات." : "Draw and plan pipeline routes manually on the map or by entering GPS/UTM coordinates."}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === "ar" ? (
                                         <>
                                             <li>إدخال إحداثيات النقاط يدوياً أو النقر المباشر على الخريطة لتتبع المسار.</li>
                                             <li>توليد المنسوب الطبوغرافي والقطاع العرضي للمسار المرسوم فورياً.</li>
                                             <li>حساب الأطوال والميول وتصدير الخطوط المخططة كملفات KML/DXF.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Enter GPS/UTM coordinates manually or click directly on map to draft routes.</li>
                                             <li>Generate elevation profiles and cross-sections for drafted lines instantly.</li>
                                             <li>Calculate lengths & slope angles and export drawn polylines as KML/DXF.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>
                         </div>
                         {/* Instruction Note with Print Help */}
                         <div className="p-6 bg-[#0e3f53]/50 rounded-2xl border border-accent/25 space-y-2 print:bg-slate-50 print:border-slate-400 print:border print:text-slate-900 leading-relaxed">
                             <h4 className="font-black text-xs text-accent print:text-black">{lang === 'ar' ? '💡 لحفظ هذا الدليل بنجاح كملف PDF عالي الجودة وبطريقة رسمية:' : '💡 To save this manual as a high-fidelity vector PDF file:'}</h4>
                             <p className="text-[10px] leading-relaxed text-white/80 print:text-slate-800">
                                 {lang === 'ar' ? (
                                     <>
                                         1. أولاً، تأكد من فتح هذا التطبيق في نافذة مستقلة وجديدة (عن طريق النقر على زر السهم أو الفتح في متصفح جديد).<br />
                                         2. انقر على زر <b>تحميل بصيغة PDF</b> في الأعلى.<br />
                                         3. في نافذة الطباعة المنبثقة، اختر الوجهة كـ <b>"حفظ بتنسيق PDF" (Save as PDF)</b>.<br />
                                         4. تأكد من تفعيل "خلفية الرسوم" (Background graphics) في خيارات الطباعة الإضافية ليظهر التصميم الملائم والدقيق.
                                     </>
                                 ) : (
                                     <>
                                         1. Maximize the application page or open in a direct tab (using the pop-out browser option).<br />
                                         2. Click the <b>Print / Save as PDF</b> button at the top corner.<br />
                                         3. In the printing dialog window, set the destination layout to <b>Save as PDF</b>.<br />
                                         4. Ensure you enable <b>Background graphics</b> in the print settings for maximum layout fidelity.
                                     </>
                                 )}
                             </p>
                         </div>
                     </div>

                     {/* Modal Footer */}
                     <div className="p-6 border-t border-white/5 bg-black/30 flex justify-end gap-3 shrink-0 print:hidden bg-black/40">
                         <button
                             onClick={() => setShowManual(false)}
                             className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black transition-all"
                         >
                             {lang === 'ar' ? 'إغلاق الدليل' : 'Close Manual'}
                         </button>
                     </div>
                 </div>
             </div>
         )}
         <InstallPwaModal
            isOpen={showInstallModal}
            onClose={() => setShowInstallModal(false)}
            lang={lang}
            deferredPrompt={deferredPrompt}
            setDeferredPrompt={setDeferredPrompt}
            isStandalone={isStandalone}
         />
         <CheckResultModalPopup
            checkResultModal={checkResultModal}
            setCheckResultModal={setCheckResultModal}
            lang={lang}
            setActiveTab={setActiveTab}
            onFocusIssuePoint={(pt) => {
              setFocusedPoint(pt);
              setDataId(`focus-point-${Date.now()}`);
            }}
            onShowAllIssuesOnMap={(items) => {
              if (items && items.length > 0) {
                setActiveIssueItems(items);
              }
              setShowIssuesOnly(true);
              setDataId(`show-issues-${Date.now()}`);
            }}
            onClearAudit={clearAuditResults}
         />
      </main>

      {/* Global High-Priority Progress & Loading Modal Overlay */}
      {loading && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-auto select-none" 
          style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 99999999 }}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <div className="text-center p-8 sm:p-10 bg-[#0b2d3d] border-2 border-amber-400/60 rounded-[3rem] shadow-[0_0_80px_rgba(245,158,11,0.45)] max-w-md w-full animate-in zoom-in-95 duration-200">
            
            {/* Spinning Indicator */}
            <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-amber-400/20 border-t-amber-400 animate-spin" />
              <MapPin className="w-8 h-8 text-amber-400 animate-pulse stroke-[2.5]" />
            </div>

            {/* Title Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[11px] font-black mb-3">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>
                {lang === 'ar' ? 'جاري معالجة البيانات المكانية' : 'Processing Spatial Data'}
              </span>
            </div>

            {/* Message Body */}
            <div className="space-y-2 mb-4 px-2">
              {(statusMessage || (lang === 'ar' ? 'جاري معالجة وجلب البيانات...' : 'Processing data...')).split('\n').map((line, idx) => (
                <p key={idx} className="text-white font-black text-base sm:text-lg leading-relaxed">
                  {line}
                </p>
              ))}
            </div>

            {/* Progress Bar & Percentage */}
            {progressPercent !== null && progressPercent !== undefined ? (
              <div className="w-full mt-4 space-y-2.5">
                <div className="w-full bg-black/60 rounded-full h-4 overflow-hidden p-0.5 border border-white/10 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 h-full rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.8)]"
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-black pt-1 px-1">
                  <span className="text-amber-400 text-sm font-black">{Math.round(progressPercent)}%</span>
                  <span className="text-white/60 font-bold">{lang === 'ar' ? 'نسبة الإنجاز' : 'Progress'}</span>
                </div>
              </div>
            ) : (
              <div className="w-full mt-4 bg-black/60 rounded-full h-3 overflow-hidden p-0.5 border border-white/10 shadow-inner">
                <div className="bg-amber-400/80 h-full rounded-full animate-pulse w-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              </div>
            )}

            <p className="text-[10px] text-white/40 font-bold mt-5 pt-3 border-t border-white/5">
              {lang === 'ar' ? '⚡ يرجى الانتظار، لا تغلق التطبيق أو المتصفح أثناء المعالجة...' : '⚡ Please wait, do not close the browser during processing...'}
            </p>
          </div>
        </div>,
        document.body
      )}
      {hoveredTabTooltip && (
        <ToolHoverTooltip
          toolId={hoveredTabTooltip.id}
          lang={lang}
          position={{ top: hoveredTabTooltip.top, left: hoveredTabTooltip.left, side: hoveredTabTooltip.side }}
        />
      )}
      </div>
    </div>
  );
};

export const CheckResultModalPopup: React.FC<{
  checkResultModal: CheckResultModalState | null;
  setCheckResultModal: (val: CheckResultModalState | null) => void;
  lang: 'ar' | 'en';
  setActiveTab: (tab: any) => void;
  onFocusIssuePoint?: (pt: GeoPoint) => void;
  onShowAllIssuesOnMap?: (issueItems?: GeoPoint[]) => void;
  onClearAudit?: () => void;
}> = ({ checkResultModal, setCheckResultModal, lang, setActiveTab, onFocusIssuePoint, onShowAllIssuesOnMap, onClearAudit }) => {
  if (!checkResultModal) return null;

  const handleLocateAll = () => {
    if (onShowAllIssuesOnMap) {
      onShowAllIssuesOnMap(checkResultModal.issueItems);
    }
    setCheckResultModal(null);
    setActiveTab('preview');
  };

  const handleFocusItem = (item: GeoPoint) => {
    if (onFocusIssuePoint) {
      onFocusIssuePoint(item);
    }
    setCheckResultModal(null);
    setActiveTab('preview');
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="bg-[#0b2d3d] border border-accent/40 rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] max-w-xl w-full overflow-hidden flex flex-col text-right animate-in zoom-in-95 duration-200"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className={cn(
          "p-6 flex items-center justify-between border-b shrink-0",
          checkResultModal.issuesCount > 0
            ? "bg-gradient-to-r from-rose-950/80 via-rose-900/40 to-[#0b2d3d] border-rose-500/30"
            : "bg-gradient-to-r from-emerald-950/80 via-teal-900/40 to-[#0b2d3d] border-emerald-500/30"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-3 rounded-2xl border shadow-inner flex items-center justify-center",
              checkResultModal.issuesCount > 0
                ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
            )}>
              {checkResultModal.issuesCount > 0 ? (
                <AlertTriangle className="w-7 h-7 animate-bounce" />
              ) : (
                <CheckCircle2 className="w-7 h-7" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-snug">
                {lang === 'ar' ? checkResultModal.titleAr : checkResultModal.titleEn}
              </h3>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black mt-1 border shadow-sm",
                checkResultModal.issuesCount > 0
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              )}>
                <span className={cn("w-2 h-2 rounded-full", checkResultModal.issuesCount > 0 ? "bg-rose-400 animate-pulse" : "bg-emerald-400")} />
                {lang === 'ar' ? checkResultModal.badgeTextAr : checkResultModal.badgeTextEn}
              </span>
            </div>
          </div>

          <button
            onClick={() => setCheckResultModal(null)}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[65vh] custom-scrollbar">
          {/* Detailed summary paragraph */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/80 leading-relaxed font-semibold">
            {lang === 'ar' ? checkResultModal.detailsAr : checkResultModal.detailsEn}
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {(checkResultModal.stats || []).map((st, i) => (
              <div key={i} className="p-4 rounded-2xl bg-[#071f2b] border border-white/5 shadow-inner flex flex-col justify-between space-y-1">
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-wide">
                  {lang === 'ar' ? st.labelAr : st.labelEn}
                </span>
                <span className={cn("text-2xl font-black tracking-tight", st.colorClass)}>
                  {st.value}
                </span>
              </div>
            ))}
          </div>

          {/* Interactive Issues List */}
          {checkResultModal.issuesCount > 0 && checkResultModal.issueItems && checkResultModal.issueItems.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs font-black text-rose-300">
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span>{lang === 'ar' ? `قائمة العناصر المفحوصة ذات الملاحظات (${checkResultModal.issueItems.length})` : `Issues List (${checkResultModal.issueItems.length})`}</span>
                </span>
                <button
                  onClick={handleLocateAll}
                  className="text-[11px] text-accent hover:underline font-black flex items-center gap-1"
                >
                  <Maximize className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'عرض الكل على الخريطة' : 'View All on Map'}</span>
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {checkResultModal.issueItems.slice(0, 50).map((item, idx) => (
                  <div 
                    key={idx}
                    className="p-3 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 flex items-center justify-between gap-3 text-xs transition-all group"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center font-black text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <div className="overflow-hidden">
                        <div className="font-black text-white truncate text-[11px]">
                          {item.id}
                        </div>
                        <div className="text-[10px] text-rose-300/80 truncate font-semibold">
                          {item.issueReason || (lang === 'ar' ? 'ملاحظة تدقيق في بيانات العنصر' : 'Audit validation issue')}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleFocusItem(item)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-[10px] font-black shrink-0 flex items-center gap-1 transition-all shadow-md active:scale-95"
                    >
                      <span>🔍</span>
                      <span>{lang === 'ar' ? 'ذهاب للموقع' : 'Locate'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Informational Guidance */}
          {checkResultModal.issuesCount > 0 ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-200 font-bold space-y-1">
              <p className="flex items-center gap-2">
                <span>💡</span>
                <span>
                  {lang === 'ar' 
                    ? `انقر على "تحديد موقع المشاكل" للذهاب فوراً للخريطة وتحديد أماكن الـ (${checkResultModal.issuesCount}) عنصر المعنية مع التكبير المباشر.` 
                    : `Click "Locate Issues" to jump directly to the map and view all ${checkResultModal.issuesCount} issue elements in high focus.`}
                </span>
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-200 font-bold space-y-1">
              <p className="flex items-center gap-2">
                <span>✨</span>
                <span>
                  {lang === 'ar' 
                    ? 'ممتاز! تفي شبكة العناصر الحالية بجميع معايير هذا الفحص دون أي استثناءات.' 
                    : 'Excellent! Current network elements meet all check parameters without exceptions.'}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-black/30 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {checkResultModal.issuesCount > 0 ? (
            <button
              onClick={handleLocateAll}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-400 text-xs font-black transition-all flex items-center gap-2 shadow-xl animate-pulse active:scale-95"
            >
              <MapPin className="w-4 h-4" />
              <span>{lang === 'ar' ? `🎯 تحديد وتقريب أماكن الـ (${checkResultModal.issuesCount}) مشكلة على الخريطة` : `Locate ${checkResultModal.issuesCount} Issues on Map`}</span>
            </button>
          ) : <div />}

          <div className="flex flex-wrap items-center gap-2">
            {onClearAudit && (
              <button
                onClick={() => {
                  onClearAudit();
                }}
                className="px-5 py-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 border border-rose-500/40 text-xs font-black transition-all flex items-center gap-2 active:scale-95"
                title={lang === 'ar' ? 'إزالة نتائج الفحص والتظليل' : 'Clear Audit Highlights'}
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>{lang === 'ar' ? 'إزالة نتائج الفحص' : 'Clear Audit Highlights'}</span>
              </button>
            )}
            {checkResultModal.type === 'sbc' && checkResultModal.issuesCount > 0 && (
              <button
                onClick={() => {
                  setCheckResultModal(null);
                  setActiveTab('sbc-checker');
                }}
                className="px-5 py-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-black transition-all flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {lang === 'ar' ? 'عرض تقرير SBC التفصيلي' : 'View Full SBC Report'}
              </button>
            )}
            <button
              onClick={() => setCheckResultModal(null)}
              className="px-6 py-3 rounded-2xl bg-accent hover:bg-accent/90 text-primary text-xs font-black shadow-lg transition-all"
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
