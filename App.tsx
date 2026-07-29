
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Database, Droplet, AlertTriangle, RotateCcw, Save, Smartphone, PenTool
} from 'lucide-react';
import { GitCompare } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

import { ParsedFile, ColumnMapping, GeoPoint, SplitterMode, KmlSplitMode, AnalysisItem, KmlExportOptions, SplitPolygon } from './types';
import { COMMON_EPSG } from './constants';
import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ, fetchMyMapsKML } from './services/parserService';
import { transformPoints, identifyPotentialCRS, parseCoordinatesFromText } from './services/crs';
import { downloadBlob, downloadKMZ, downloadKMZGroupedZip, generateKML, generateKMLChunks, generateKMLFolderContent, generateKMLStyles } from './services/kmlService';
import { getReverseGeocode, calculatePathLength, splitLineString, fetchStreetsInPolygon, isPointInPolygon, clipLineToPolygon, calculateConvexHull, calculateBoundingBox, bufferPolygon, splitLinesAtIntersections, detectSpatialOverlap, resolveSpatialOverlaps, detectExactDuplicates, detectLineIntersections, resolveExactDuplicates, trimLinesAtIntersections, OverlapResult, isBlackLine } from './services/geometryService';
import { generateAnalysisPPTX, generateAnalysisPDF, generateWMainlinePPTX, generateWWMainlinePPTX } from './services/reportService';
import { downloadDXF } from './services/dxfExportService';
import { downloadDataPDF } from './services/pdfExportService';
import { getCanonicalColorMap, STATUS_CATEGORIES, matchStatusByColor } from './services/colorUtils';
import MapPreview from './components/MapPreview';
import { DataFormatter } from './components/DataFormatter';
import { FileComparator } from './components/FileComparator';
import { MapClassifier } from './components/MapClassifier';
import { InstallPwaModal } from './components/InstallPwaModal';
import { translations, Language } from './translations';
import JSZipModule from 'jszip';

const JSZip = (typeof JSZipModule === 'function') ? JSZipModule : (JSZipModule as any).default || JSZipModule;

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#d946ef'];

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


const UniversalExportBar = ({
  data,
  filename,
  lang,
  onExcelExport,
  isExecuting,
  onKmzExport
}: {
  data: GeoPoint[];
  filename: string;
  lang: Language;
  onExcelExport: () => void;
  isExecuting: boolean;
  onKmzExport: () => void;
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 w-full">
      <button 
        disabled={isExecuting}
        onClick={onKmzExport} 
        className="bg-[#0b2d3d] border border-accent/30 text-accent font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-accent hover:text-primary active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <DownloadCloud className="w-4 h-4" />
        {lang === 'ar' ? 'KMZ' : 'KMZ'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDXF(data, filename || 'Export')} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <PenTool className="w-4 h-4 text-orange-400" />
        {lang === 'ar' ? 'DXF' : 'DXF'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={onExcelExport} 
        className="bg-white/5 border border-white/10 text-white/80 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all text-[11px] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <FileSpreadsheet className="w-4 h-4 text-green-500" />
        {lang === 'ar' ? 'إكسل' : 'Excel'}
      </button>
      <button 
        disabled={isExecuting}
        onClick={() => downloadDataPDF(data, filename || 'Export', lang)} 
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
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'converter' | 'splitter' | 'analyzer' | 'street-planner' | 'polygon-converter' | 'attribute-formatter' | 'comparator'>('converter');
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const [mergeThreshold, setMergeThreshold] = useState<number>(() => loadSavedPreference('mergeThreshold', 45));
  const [duplicateTolerance, setDuplicateTolerance] = useState<number>(() => loadSavedPreference('duplicateTolerance', 0.5));
  const [overlapResults, setOverlapResults] = useState<OverlapResult[] | null>(null);
  const [geocodingMode, setGeocodingMode] = useState<'accurate' | 'fast'>(() => loadSavedPreference('geocodingMode', 'accurate'));
  const [showOverlapModal, setShowOverlapModal] = useState(false);
  const [overlapModalType, setOverlapModalType] = useState<'duplicates' | 'intersections'>('duplicates');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [globalBaseMap, setGlobalBaseMap] = useState<import('./types').BaseMapType>(() => loadSavedPreference('globalBaseMap', 'satellite'));

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

  
  const verifyEssentialAttributes = () => {
    setLoading(true);
    setStatusMessage(lang === 'ar' ? 'جاري فحص البيانات...' : 'Verifying attributes...');
    
    setTimeout(() => {
        let missingCount = 0;
        
        const processPoints = (pts: GeoPoint[]) => {
            return pts.map(pt => {
                if (pt.type !== 'LineString') return pt;
                if (isBlackLine(pt)) return pt;
                
                const descLower = (pt.description || '').toLowerCase();
                const idLower = (String(pt.id) || '').toLowerCase();
                const attr1Lower = (pt.attr1 || '').toLowerCase();
                const attr2Lower = (pt.attr2 || '').toLowerCase();
                
                let hasDiameter = false;
                
                // 1. Basic regex match (number with unit)
                const diaMatch = descLower.match(/(\d+(\.\d+)?)\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  idLower.match(/(\d+(\.\d+)?)\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr1Lower.match(/(\d+(\.\d+)?)\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr2Lower.match(/(\d+(\.\d+)?)\s*(mm|inch|مم|انش|بوصة)/i);
                if (diaMatch) hasDiameter = true;
                
                // 2. Check standard diameters without units
                const standardDias = /\b(1000|900|800|700|600|500|400|300|250|225|200|160|150|110|100|90|75|63|50)\b/;
                if (!hasDiameter && (
                    descLower.match(standardDias) || 
                    idLower.match(standardDias) || 
                    attr1Lower.match(standardDias) || 
                    attr2Lower.match(standardDias)
                )) {
                    hasDiameter = true;
                }

                // 3. Check for diameter keywords followed by or containing a number
                const diaKeywordRegex = /(diameter|innerdiameter|outerdiameter|dia|size|قطر|قطر الخط|مقاس)[\s:=_-]*(\d+(\.\d+)?)/i;
                if (!hasDiameter && (
                    descLower.match(diaKeywordRegex) ||
                    idLower.match(diaKeywordRegex) ||
                    attr1Lower.match(diaKeywordRegex) ||
                    attr2Lower.match(diaKeywordRegex)
                )) {
                    hasDiameter = true;
                }

                // 4. Check extended attributes map if it exists
                if (!hasDiameter && pt.attributes) {
                    for (const [key, val] of Object.entries(pt.attributes)) {
                        const keyLower = key.toLowerCase();
                        const valString = String(val).toLowerCase();
                        
                        // If the key is a diameter keyword, the value MUST contain a number
                        if (
                            keyLower.includes('diameter') || 
                            keyLower.includes('قطر') || 
                            keyLower.includes('innerdiameter') || 
                            keyLower.includes('outerdiameter') ||
                            keyLower.includes('dia') ||
                            keyLower.includes('size') ||
                            keyLower.includes('مقاس')
                        ) {
                            if (valString.match(/\d+(\.\d+)?/) && valString.trim() !== '0') {
                                hasDiameter = true;
                                break;
                            }
                        }
                        
                        // Or if the value itself contains keyword + number
                        if (valString.match(diaKeywordRegex)) {
                            hasDiameter = true;
                            break;
                        }
                    }
                }

                // Check zone
                let hasZone = pt.district || descLower.includes('zone') || attr1Lower.includes('zone') || attr2Lower.includes('zone') || descLower.includes('منطقة') || attr1Lower.includes('منطقة') || descLower.includes('حي') || attr1Lower.includes('حي') || attr2Lower.includes('حي');
                
                if (!hasZone && pt.attributes) {
                     for (const [key, val] of Object.entries(pt.attributes)) {
                        const keyLower = key.toLowerCase();
                        if (
                            keyLower.includes('zone') || 
                            keyLower.includes('منطقة') || 
                            keyLower.includes('district') || 
                            keyLower.includes('حي') ||
                            keyLower.includes('sector') ||
                            keyLower.includes('قطاع') ||
                            keyLower.includes('مخطط')
                        ) {
                            if (val && String(val).trim() !== '' && String(val).trim() !== '0') {
                                hasZone = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasDiameter || !hasZone) {
                    missingCount++;
                    const missingParts = [];
                    if (!hasDiameter) missingParts.push(lang === 'ar' ? 'القطر' : 'Diameter');
                    if (!hasZone) missingParts.push(lang === 'ar' ? 'المنطقة' : 'Zone');
                    
                    return {
                        ...pt,
                        color: '#000000', // Distinctive alert color
                        description: `${pt.description || ''}\n[MISSING: ${missingParts.join(', ')}]`.trim(),
                        layer: `${pt.layer || 'Unknown'}_MISSING_ATTRS`
                    };
                }
                
                return pt;
            });
        };

        if (activeFile) {
            const nextGlobal = processPoints(globalPoints);
            setGlobalPoints(nextGlobal);
        } else {
            const nextPlanned = processPoints(plannedStreets);
            setPlannedStreets(nextPlanned);
        }

        setLoading(false);
        setStatusMessage(lang === 'ar' ? `تم إبراز ${missingCount} عنصراً ينقصه بيانات أساسية.` : `Highlighted ${missingCount} segments missing essential attributes.`);
        setTimeout(() => setStatusMessage(''), 4000);
    }, 500);
  };



const getPointsToCheck = (): GeoPoint[] => {
    if (activeTab === 'street-planner' && plannedStreets.length > 0) {
      const combined = [...globalPoints];
      for (const p of plannedStreets) {
        if (!combined.some(item => String(item.id) === String(p.id))) {
          combined.push(p);
        }
      }
      return combined;
    }
    return globalPoints.length > 0 ? globalPoints : plannedStreets;
  };

  // ==========================================
  // 1. التطابق (Duplicate Lines - خط فوق خط)
  // ==========================================
  const handleCheckDuplicates = () => {
    const pointsToCheck = getPointsToCheck();
    const dups = detectExactDuplicates(pointsToCheck, duplicateTolerance);
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
    }
  };

  const handleColorDuplicatesBlack = () => {
    const pointsToCheck = getPointsToCheck();
    const dups = detectExactDuplicates(pointsToCheck, duplicateTolerance);

    if (dups.length === 0) {
      setStatusMessage(
        lang === 'ar'
          ? `لم يتم العثور على خطوط متطابقة لتلوينها بالأسود ضمن مسافة ${duplicateTolerance}m.`
          : `No duplicate lines found to color black within ${duplicateTolerance}m.`
      );
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    const dupIds = new Set<string>();
    dups.forEach(d => {
      dupIds.add(String(d.id1));
      dupIds.add(String(d.id2));
    });

    let coloredCount = 0;
    const updateList = (list: GeoPoint[]) => list.map(pt => {
      if (dupIds.has(String(pt.id))) {
        coloredCount++;
        return { ...pt, color: '#000000' };
      }
      return pt;
    });

    setGlobalPoints(prev => updateList(prev));
    setPlannedStreets(prev => updateList(prev));

    setOverlapResults(dups);
    setOverlapModalType('duplicates');
    setShowOverlapModal(true);
    setDataId(`colored-black-${Date.now()}`);

    setStatusMessage(
      lang === 'ar'
        ? `تم تلوين ${coloredCount} خط متطابق (خط فوق خط) باللون الأسود ⬛ بنجاح!`
        : `Successfully colored ${coloredCount} duplicate lines in black ⬛!`
    );
    setTimeout(() => setStatusMessage(''), 5000);
  };

  const handleResolveDuplicates = () => {
    let totalRemoved = 0;
    let nextGlobal = [...globalPoints];
    let nextPlanned = [...plannedStreets];

    if (nextGlobal.length > 0) {
      const { cleanedPoints, removedCount } = resolveExactDuplicates(nextGlobal, duplicateTolerance);
      totalRemoved += removedCount;
      nextGlobal = cleanedPoints;
    }

    if (nextPlanned.length > 0) {
      const { cleanedPoints: cleanedStreets, removedCount: count2 } = resolveExactDuplicates(nextPlanned, duplicateTolerance);
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
    const remainingDups = detectExactDuplicates(checkTarget, duplicateTolerance);
    setOverlapResults(remainingDups);
    setOverlapModalType('duplicates');

    setStatusMessage(
      lang === 'ar'
        ? `تم حذف ${totalRemoved} عنصر مكرر ومتطابق تماماً بنجاح!`
        : `Successfully deleted ${totalRemoved} exact duplicate elements!`
    );
    setTimeout(() => setStatusMessage(''), 5000);
  };

  // ==========================================
  // 2. التقاطعات (Line Intersections - نقاط التلاقي والعبور)
  // ==========================================
  const handleCheckIntersections = () => {
    const pointsToCheck = getPointsToCheck();
    const intersections = detectLineIntersections(pointsToCheck);
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
    }
  };

  const handleTrimIntersections = () => {
    let totalTrimmed = 0;
    let nextGlobal = [...globalPoints];
    let nextPlanned = [...plannedStreets];

    if (nextGlobal.length > 0) {
      const { cleanedPoints, trimmedCount } = trimLinesAtIntersections(nextGlobal);
      totalTrimmed += trimmedCount;
      nextGlobal = cleanedPoints;
    }

    if (nextPlanned.length > 0) {
      const { cleanedPoints: cleanedStreets, trimmedCount: count2 } = trimLinesAtIntersections(nextPlanned);
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
    const remainingIntersections = detectLineIntersections(checkTarget);
    setOverlapResults(remainingIntersections);
    setOverlapModalType('intersections');

    setStatusMessage(
      lang === 'ar'
        ? `تم تقليم ${totalTrimmed} خط عند نقاط التقاطع بنجاح!`
        : `Successfully trimmed ${totalTrimmed} lines at intersections!`
    );
    setTimeout(() => setStatusMessage(''), 5000);
  };

  const handleDeleteDuplicateItem = (targetId: string | number) => {
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
    if (overlapModalType === 'duplicates') {
      setOverlapResults(detectExactDuplicates(checkTarget, duplicateTolerance));
    } else {
      setOverlapResults(detectLineIntersections(checkTarget));
    }
  };

  const [splitMode, setSplitMode] = useState<'count' | 'spatial' | 'street'>('count');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [exportStyle, setExportStyle] = useState<'single' | 'zip'>(() => loadSavedPreference('exportStyle', 'single'));
  const [splitLines, setSplitLines] = useState(false);
  const [splitIntersections, setSplitIntersections] = useState(false);
  const [separateMulti, setSeparateMulti] = useState(false);
  const [maxLen, setMaxLen] = useState(() => loadSavedPreference('maxLen', 1000));

  // Multi-Polygon Split State
  const [splitPolygons, setSplitPolygons] = useState<SplitPolygon[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{x: number, y: number}[] | null>(null);
  const [plannedStreets, setPlannedStreets] = useState<GeoPoint[]>([]);
  const [boundaryPolygon, setBoundaryPolygon] = useState<GeoPoint | null>(null);

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
  const [groupingMode, setGroupingMode] = useState<'none' | 'layer' | 'column'>(() => loadSavedPreference('groupingMode', 'layer'));
  const [groupByColumnSelect, setGroupByColumnSelect] = useState<string>('');
  const [converterExportAsZip, setConverterExportAsZip] = useState<boolean>(() => loadSavedPreference('converterExportAsZip', false));
  const [optimizeForMyMaps, setOptimizeForMyMaps] = useState<boolean>(() => loadSavedPreference('optimizeForMyMaps', false));
  const [keepOriginalDescription, setKeepOriginalDescription] = useState<boolean>(() => loadSavedPreference('keepOriginalDescription', false));
  const [removeImagesOnly, setRemoveImagesOnly] = useState<boolean>(() => loadSavedPreference('removeImagesOnly', false));

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
  useEffect(() => { savePreference('maxLen', maxLen); }, [maxLen]);
  useEffect(() => { savePreference('plannerMaxLen', plannerMaxLen); }, [plannerMaxLen]);
  useEffect(() => { savePreference('mergeThreshold', mergeThreshold); }, [mergeThreshold]);
  useEffect(() => { savePreference('groupingMode', groupingMode); }, [groupingMode]);

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
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
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
      setSelectedHeaders(initialSelection.length > 0 ? allSelected : Array.from(new Set([...activeFile.headers, ...defaultFields])));

      if (activeFile.headers.length > 0) {
        setGroupByColumnSelect(activeFile.headers[0]);
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
    const colors = Array.from(new Set<string>(pointsToProcess.map(p => (p.color || '#dcb13c').toUpperCase())));
    return getCanonicalColorMap(colors, mergeThreshold);
  }, [globalPoints, plannedStreets, activeTab, mergeThreshold]);


  const { executionStatusDistribution, diameterDistribution } = useMemo(() => {
    const rawPoints = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile)) ? plannedStreets : globalPoints;
    const pointsToAnalyze = rawPoints.filter(pt => pt.type === 'LineString' && !isBlackLine(pt));
    const statusTotals: Record<string, number> = {
      'executed_water': 0,
      'executed_sewer': 0,
      'in_progress': 0,
      'remaining': 0,
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
                const lower = k.toLowerCase();
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

    const statusData = STATUS_CATEGORIES.map(cat => {
      const meters = statusTotals[cat.key] || 0;
      return {
        name: lang === 'ar' ? cat.nameAr : cat.nameEn,
        value: Number((meters / 1000).toFixed(2)),
        color: cat.color,
        key: cat.key,
      };
    }).filter(item => item.value > 0);

    const diaData = Object.entries(diaGroups)
      .filter(([k, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Number((value / 1000).toFixed(2)) })) // Convert to km
      .sort((a, b) => b.value - a.value);

    return { executionStatusDistribution: statusData, diameterDistribution: diaData };
  }, [globalPoints, plannedStreets, activeTab, activeFile, lang]);

  const analysisData = useMemo(() => {
    const rawPoints = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile)) ? plannedStreets : globalPoints;
    // Exclude Points, Polygons, and duplicate black-colored lines!
    const pointsToAnalyze = rawPoints.filter(pt => pt.type === 'LineString' && !isBlackLine(pt));
    if (pointsToAnalyze.length === 0) return [];

    const groups: Record<string, { totalLength: number, count: number }> = {};
    let totalAllLength = 0;

    pointsToAnalyze.forEach(pt => {
      const originalColor = (pt.color || '#dcb13c').toUpperCase();
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
  }, [globalPoints, plannedStreets, activeTab, canonicalColorMap, activeFile, lang]);

  const placemarksSummary = useMemo(() => {
    const pointsToAnalyze = (!activeFile ? plannedStreets : globalPoints).filter(pt => !isBlackLine(pt));
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

  const wMainlineStats = useMemo(() => {
    const pointsToProcess = !activeFile ? plannedStreets : globalPoints;
    const segments = pointsToProcess.filter(p => p.type === 'LineString' && !isBlackLine(p) && p.layer && p.layer.toUpperCase().includes('W_MAINLINE'));

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
        const descLower = (pt.description || '').toLowerCase();
        const idLower = (String(pt.id) || '').toLowerCase();
        const attr1Lower = (pt.attr1 || '').toLowerCase();

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
    const pointsToProcess = !activeFile ? plannedStreets : globalPoints;
    const segments = pointsToProcess.filter(p => p.type === 'LineString' && !isBlackLine(p) && p.layer && (
        p.layer.toUpperCase().includes('WW_MAINLINE') ||
        p.layer.toUpperCase().includes('S_GRAVITY_MAIN') ||
        p.layer.toUpperCase().includes('SEWER') ||
        p.layer.toUpperCase().includes('WASTEWATER')
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
        const descLower = (pt.description || '').toLowerCase();
        const idLower = (String(pt.id) || '').toLowerCase();
        const attr1Lower = (pt.attr1 || '').toLowerCase();

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

  const downloadExcelAnalysis = () => {
    if (globalPoints.length === 0 && plannedStreets.length === 0) return;

    const workbook = XLSX.utils.book_new();

    if (activeTab === 'converter' && activeFile && (activeFile.type === 'excel' || activeFile.type === 'csv')) {
        const originalHeaders = activeFile.headers || [];
        const filteredHeaders = originalHeaders.filter(h => selectedHeaders.includes(h));
        const newHeaders = [
            ...filteredHeaders,
            lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)',
            lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)',
            lang === 'ar' ? 'الشارع' : 'Street',
            lang === 'ar' ? 'الحي' : 'District',
            lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link'
        ];

        const combinedData = activeFile.data.map((row, idx) => {
            const pt = globalPoints[idx];
            const lat = pt ? pt.y : 0;
            const lon = pt ? pt.x : 0;
            const street = pt ? (pt.street || '') : '';
            const district = pt ? (pt.district || '') : '';
            const link = pt ? `https://www.google.com/maps?q=${lat},${lon}` : '';

            const rowObj: any = {};
            originalHeaders.forEach((h, i) => {
                if (selectedHeaders.includes(h)) {
                    const hLower = h.toLowerCase();
                    if (['streetname', 'street', 'الشارع'].includes(hLower) && pt && pt.street) {
                        rowObj[h] = pt.street;
                    } else {
                        rowObj[h] = row[i];
                    }
                }
            });

            rowObj[lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)'] = lat;
            rowObj[lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)'] = lon;
            rowObj[lang === 'ar' ? 'الشارع' : 'Street'] = street;
            rowObj[lang === 'ar' ? 'الحي' : 'District'] = district;
            rowObj[lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link'] = link;

            return rowObj;
        });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(combinedData), lang === 'ar' ? "البيانات المحولة كاملة" : "Full Converted Data");
    } else {
        const rawExport = (activeTab === 'street-planner')
            ? [...globalPoints, ...plannedStreets]
            : (activeTab === 'analyzer' && !activeFile ? plannedStreets : globalPoints);
        const pointsToExport = rawExport.filter(pt => !isBlackLine(pt));

        const detailedData = pointsToExport.map(pt => {
            const lat = pt.y;
            const lon = pt.x;
            const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
            let elementLength = pt.originalLength || 0;
            if (elementLength === 0 && pt.path) elementLength = calculatePathLength(pt.path);

            return {
                [lang === 'ar' ? 'اسم الملف' : 'File Name']: activeFile?.filename || '',
                [lang === 'ar' ? 'المعرف' : 'ID']: pt.id,
                [lang === 'ar' ? 'الشارع' : 'Street']: pt.street || '',
                [lang === 'ar' ? 'الحي' : 'District']: pt.district || '',
                [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'Point',
                [lang === 'ar' ? 'الطبقة' : 'Layer']: pt.layer || 'Default',
                [lang === 'ar' ? 'اللون' : 'Color']: pt.color || '#dcb13c',
                [lang === 'ar' ? 'خط العرض (Y)' : 'Latitude (Y)']: lat,
                [lang === 'ar' ? 'خط الطول (X)' : 'Longitude (X)']: lon,
                [lang === 'ar' ? 'الوصف' : 'Description']: pt.description || '',
                [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: elementLength > 0 ? elementLength.toFixed(2) : '-',
                [lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link']: googleMapsLink
            };
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
        }
    }

    XLSX.writeFile(workbook, `${activeTab === 'converter' ? 'Full_Converted' : 'Analysis'}_${activeFile?.filename.split('.')[0] || 'Report'}.xlsx`);
  };

  const handleReverseGeocodeGlobal = async () => {
    if (globalPoints.length === 0) return;
    setLoading(true);
    setError(null);

    try {
        setStatusMessage(lang === 'ar' ? 'جاري جلب الشوارع وتحليل البيانات...' : 'Fetching streets and analyzing data...');

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

        if (queryArea.length > 0) {
            const buffered = bufferPolygon(queryArea, plannerBuffer);
            try {
                const streets = await fetchStreetsInPolygon(buffered, plannerClip, streetTypeFilters);
                setPlannedStreets(streets);
            } catch (err: any) {
                console.error("Failed to fetch overpass streets:", err);
                // We won't throw here to allow standard point-by-point geocoding to proceed
            }
        }

        const total = globalPoints.length;
        const updated = [...globalPoints];
        let successCount = 0;
        const batchSize = geocodingMode === 'accurate' ? 4 : 10;

        for (let i = 0; i < total; i += batchSize) {
            setStatusMessage(lang === 'ar'
              ? `جاري عنونة البيانات (${geocodingMode === 'accurate' ? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'}): (${Math.min(i + batchSize, total)} من ${total})`
              : `Geocoding data (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'}): (${Math.min(i + batchSize, total)} of ${total})`
            );
            const chunk = updated.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (pt, chunkIdx) => {
                const idx = i + chunkIdx;
                if (!pt.street || pt.street === "شارع غير معروف" || pt.street === "غير متوفر") {
                    try {
                        const geoData = await getReverseGeocode(pt.y, pt.x, geocodingMode);
                        updated[idx] = { ...pt, street: geoData.street, district: geoData.district };
                        if (geoData.street && geoData.street !== "غير متوفر") successCount++;
                    } catch (err) {}
                }
            }));
            setGlobalPoints([...updated]);
            if (geocodingMode === 'accurate' && i + batchSize < total) {
                await new Promise(r => setTimeout(r, 60));
            }
        }

        setStatusMessage(lang === 'ar'
          ? `تم جلب ${plannedStreets.length} شارع وتحديث ${successCount} عنوان!`
          : `Fetched ${plannedStreets.length} streets and updated ${successCount} addresses!`
        );
    } catch (e: any) {
        setError(e.message);
    } finally {
        setLoading(false);
        setTimeout(() => setStatusMessage(''), 4000);
    }
  };

  const downloadExcelWithStreets = async () => {
    const pointsToExport = activeTab === 'street-planner' ? [...globalPoints, ...plannedStreets] : globalPoints;
    if (pointsToExport.length === 0) return;

    setLoading(true);
    const results: any[] = [];
    const total = pointsToExport.length;
    const batchSize = geocodingMode === 'accurate' ? 4 : 10;

    for (let i = 0; i < total; i += batchSize) {
        setStatusMessage(lang === 'ar'
            ? `جاري جلب أسماء الشوارع (${geocodingMode === 'accurate' ? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'}): (${Math.min(i + batchSize, total)} من ${total})`
            : `Fetching Street Names (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'}): (${Math.min(i + batchSize, total)} of ${total})`
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

            return {
                [lang === 'ar' ? 'اسم الملف' : 'File Name']: activeFile?.filename || '',
                [lang === 'ar' ? 'المعرف' : 'ID']: pt.id,
                [lang === 'ar' ? 'الشارع' : 'Street']: street || 'غير متوفر',
                [lang === 'ar' ? 'الحي' : 'District']: district || 'غير متوفر',
                [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'Point',
                [lang === 'ar' ? 'الطبقة' : 'Layer']: pt.layer || 'Default',
                [lang === 'ar' ? 'اللون' : 'Color']: pt.color || '#dcb13c',
                [lang === 'ar' ? 'خط العرض (Y)' : 'Latitude (Y)']: lat,
                [lang === 'ar' ? 'خط الطول (X)' : 'Longitude (X)']: lon,
                [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: elementLength > 0 ? elementLength.toFixed(2) : '-',
                [lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link']: googleMapsLink
            };
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
      setGlobalPoints(transformPoints(points, sourceDef));
      setDataId(Date.now().toString());
    };
    processData();
  }, [activeFile, mapping, sourceEPSG, swapXY, refreshKey]);

  const handleRefreshPreview = () => {
    setLoading(true);
    setStatusMessage(lang === 'ar' ? 'جاري تحديث المعاينة...' : 'Refreshing preview...');
    setTimeout(() => {
        setRefreshKey(prev => prev + 1);
        setLoading(false);
        setStatusMessage('');
    }, 400);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true);
    setStatusMessage(t.parsing);
    setAutoDetected(null);
    setError(null);
    try {
      const fName = selectedFile.name.toLowerCase();
      let result: ParsedFile;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile);
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) result = await parseKMZ(selectedFile);
      else throw new Error(t.errors.unsupported);

      setActiveFile(result);
      setDataId(`${result.filename}-${Date.now()}`);

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
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleLoadMyMapsLink = async () => {
    const trimmed = mapsLink.trim();
    if (!trimmed) return;
    setLoading(true);
    setStatusMessage(lang === 'ar' ? "جاري جلب خريطة Google My Maps..." : "Fetching Google My Maps...");
    setAutoDetected(null);
    setError(null);
    try {
      const result = await fetchMyMapsKML(trimmed);
      setActiveFile(result);

      let parsedPoints: GeoPoint[] = result.data;
      setGlobalPoints(parsedPoints);
      setDataId(`mymaps-${Date.now()}`);

      setLoading(false);
      setStatusMessage(lang === 'ar' ? 'تم جلب وتحميل الخريطة بنجاح!' : 'Map fetched and loaded successfully!');
      setTimeout(() => setStatusMessage(''), 2500);
    } catch (err: any) {
      setLoading(false);
      setStatusMessage('');
      setError(err?.message || "حدث خطأ أثناء تحميل الخريطة.");
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
        const size = Math.ceil(processedPoints.length / splitCount);
        for (let i = 0; i < splitCount; i++) groups.push({ name: `Part ${i + 1}`, points: processedPoints.slice(i * size, (i + 1) * size) });
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

        // Group points by each polygon
        const remaining: GeoPoint[] = [];
        const polygonGroups = splitPolygons.map(poly => ({ name: poly.name, poly: poly.path, points: [] as GeoPoint[] }));

        processedPoints.forEach(pt => {
          let found = false;
          for (const g of polygonGroups) {
            const isInside = pt.path ? pt.path.some(v => isPointInPolygon(v, g.poly)) : isPointInPolygon({ x: pt.x, y: pt.y }, g.poly);
            if (isInside) {
              g.points.push(pt);
              found = true;
              break;
            }
          }
          if (!found) remaining.push(pt);
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
    await downloadKMZ(polyGeoPoints, "Split_Boundaries", { mode: 'none' });
  };

  const executeWithStreetFetching = async (
    points: GeoPoint[],
    headers: string[] | undefined,
    action: () => Promise<void> | void
  ) => {
    const hasStreetHeader = headers && headers.some(h => ['street', 'الشارع', 'streetname', 'district', 'الحي'].includes(h.toLowerCase()));
    if (hasStreetHeader) {
      setLoading(true);
      const total = points.length;
      const batchSize = geocodingMode === 'accurate' ? 4 : 10;

      for (let i = 0; i < total; i += batchSize) {
          setStatusMessage(lang === 'ar'
              ? `جاري جلب أسماء الشوارع (${geocodingMode === 'accurate' ? 'نمط دقيق جداً 🎯' : 'نمط سريع ⚡'}): (${Math.min(i + batchSize, total)} من ${total})`
              : `Fetching Street Names (${geocodingMode === 'accurate' ? 'Accurate Mode 🎯' : 'Fast Mode ⚡'}): (${Math.min(i + batchSize, total)} of ${total})`
          );
          const chunk = points.slice(i, i + batchSize);
          await Promise.all(chunk.map(async (pt) => {
              let street = pt.street;
              if (!street || street === "غير متوفر") {
                  try {
                      const geoData = await getReverseGeocode(pt.y, pt.x, geocodingMode);
                      street = geoData.street;
                      pt.street = street;
                      pt.district = geoData.district;
                  } catch (err) {
                      street = "";
                  }
              }
              if (!pt.attributes) pt.attributes = {};
              const matchStreet = headers.find(h => h.toLowerCase() === 'street');
              const matchArabic = headers.find(h => h === 'الشارع');
              const matchStreetName = headers.find(h => h.toLowerCase() === 'streetname');

              if (matchStreet) pt.attributes[matchStreet] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchArabic) pt.attributes[matchArabic] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchStreetName) pt.attributes[matchStreetName] = street || (lang === 'ar' ? 'غير معروف' : 'Unknown');

              const matchDistrict = headers.find(h => h.toLowerCase() === 'district');
              const matchArabicDistrict = headers.find(h => h === 'الحي');
              if (matchDistrict) pt.attributes[matchDistrict] = pt.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
              if (matchArabicDistrict) pt.attributes[matchArabicDistrict] = pt.district || (lang === 'ar' ? 'غير معروف' : 'Unknown');
          }));
      }
      setLoading(false);
      setStatusMessage(null);
    }
    await action();
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
      setError(lang === 'ar' ? "يرجى رسم منطقة أو رفع ملف هندسي أولاً." : "Please draw an area or upload engineering data first.");
      return;
    }

    setLoading(true);
    setStatusMessage(lang === 'ar' ? "جاري جلب بيانات الشوارع..." : "Fetching streets...");

    try {
      const buffered = bufferPolygon(areaToQuery, plannerBuffer);
      let streets = await fetchStreetsInPolygon(buffered, plannerClip, streetTypeFilters);

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
      setStatusMessage(`تم جلب ${streets.length} شارع بنجاح.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBoundaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true); setStatusMessage("جاري تحليل مضلع الحدود...");
    try {
        const fName = selectedFile.name.toLowerCase();
        let result: ParsedFile;
        if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) result = await parseKMZ(selectedFile);
        else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile);
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
          setStatusMessage("تم تحميل الحدود بنجاح.");
        } else throw new Error(t.errors.noBoundaryInKml);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); setTimeout(() => setStatusMessage(''), 3000); }
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
          <label className="block border-2 border-dashed border-accent/40 rounded-[2.5rem] p-10 text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group relative overflow-hidden">
            <input type="file" className="hidden" onChange={handleFileUpload} />
            <Upload className="w-10 h-10 mx-auto mb-4 text-accent group-hover:scale-110 transition-all" />
            <span className="text-[11px] font-black text-white block leading-tight px-4">{activeFile ? activeFile.filename : (lang === 'ar' ? 'ارفق الملف هنا (Excel, DXF, KMZ, KML)' : 'Upload Data Source (Excel, DXF, KMZ, KML)')}</span>
            <span className="text-[9px] text-accent mt-3 block font-bold uppercase tracking-widest">{activeFile ? (lang === 'ar' ? 'انقر لتغيير الملف' : 'Change File') : (lang === 'ar' ? 'انقر لاختيار الملف' : 'Select File')}</span>
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
    <div className="flex flex-col h-screen w-screen bg-[#0a2633] font-sans overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
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

      <div className="flex flex-1 h-full w-full overflow-hidden">
        <nav className="bg-primary border-e border-slate-800 flex flex-col items-center py-8 w-24 shrink-0 z-50 shadow-2xl transition-colors duration-500">
          <div className="flex-1 flex flex-col gap-6 w-full px-2">
             {[
               { id: 'converter', icon: <RefreshCw />, label: lang === 'ar' ? 'محول' : 'Converter' },
               { id: 'street-planner', icon: <MapPinned />, label: lang === 'ar' ? 'مخطط' : 'Planner' },
               { id: 'analyzer', icon: <BarChart3 />, label: lang === 'ar' ? 'محلل' : 'Analyzer' },
               { id: 'classifier', icon: <Layers />, label: lang === 'ar' ? 'مصنف الخرائط' : 'Map Classifier' },
               { id: 'splitter', icon: <Split />, label: lang === 'ar' ? 'مقسم' : 'Splitter' },
               { id: 'polygon-converter', icon: <Shapes />, label: lang === 'ar' ? 'مضلعات' : 'Polygons' },
               { id: 'attribute-formatter', icon: <Database />, label: lang === 'ar' ? 'تنسيق البيانات' : 'Format Data' },
               { id: 'comparator', icon: <GitCompare />, label: lang === 'ar' ? 'مقارنة' : 'Compare' }
             ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex flex-col items-center gap-2 p-3 rounded-2xl transition-all", activeTab === tab.id ? "bg-accent text-primary shadow-lg" : "text-white/30 hover:text-white")}>
                  {React.cloneElement(tab.icon as any, { className: "w-6 h-6" })}
                  <span className="text-[8px] font-black uppercase text-center leading-tight">{tab.label}</span>
                </button>
             ))}
          </div>
          <div className="flex flex-col gap-4 mt-auto">
             <button onClick={() => setShowInstallModal(true)} className="p-3 text-accent hover:brightness-125 transition-all flex flex-col items-center gap-1 group relative" title={lang === 'ar' ? 'تثبيت التطبيق على الجوال' : 'Install Mobile App'}>
                <div className="relative">
                  <Smartphone className="w-5 h-5 text-accent animate-pulse" />
                  {!isStandalone && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent animate-ping" />}
                </div>
                <span className="text-[8px] font-black text-accent">{lang === 'ar' ? 'تثبيت' : 'APP'}</span>
             </button>
             <button onClick={() => setShowManual(true)} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1" title={lang === 'ar' ? 'دليل المستخدم' : 'User Guide'}><FileText className="w-5 h-5 text-accent" /><span className="text-[8px] font-bold">{lang === 'ar' ? 'الدليل' : 'GUIDE'}</span></button>
             <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Languages className="w-5 h-5" /><span className="text-[8px] font-bold">{lang.toUpperCase()}</span></button>
             <button onClick={() => setTheme(theme === 'default' ? 'nwc' : 'default')} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Palette className="w-5 h-5" /><span className="text-[8px] font-bold">THEME</span></button>
             <button onClick={() => setShowSettingsModal(true)} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Settings2 className="w-5 h-5" /><span className="text-[8px] font-bold">{lang === 'ar' ? 'إعدادات' : 'SETTINGS'}</span></button>

          </div>
      </nav>

      <aside className="bg-primary border-e border-slate-800 w-[420px] flex flex-col shadow-2xl relative z-40 transition-colors duration-500 overflow-hidden">
           <div className="p-10 pb-4 shrink-0">
                <div className="flex items-center justify-between">
                   <div>
                     <h1 className="text-2xl font-black text-white tracking-tight leading-tight">{t.appTitle}</h1>
                     <p className="text-[10px] text-accent font-black uppercase mt-1 tracking-widest">{theme === 'nwc' ? t.themeNWC : t.subTitle}</p>
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
                       <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg animate-pulse">
                         <span className="text-primary font-black text-[11px] tracking-tight">NWC</span>
                       </div>
                     )}
                   </div>
                </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar px-10 pb-8 pt-4">
                {error && (<div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-6 flex items-start gap-3 animate-in slide-in-from-top"><X className="w-4 h-4 text-red-400 shrink-0 mt-1 cursor-pointer" onClick={() => setError(null)} /><p className="text-[10px] text-red-400 font-bold leading-relaxed">{error}</p></div>)}

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
                                                {lang === 'ar' ? 'حسب الطبقة' : 'By Layer'}
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

                                <UniversalExportBar 
                                  data={globalPoints} 
                                  filename={activeFile.filename} 
                                  lang={lang} 
                                  isExecuting={loading}
                                  onExcelExport={() => executeWithStreetFetching(globalPoints, selectedHeaders, downloadExcelAnalysis)}
                                  onKmzExport={() => {
                                      executeWithStreetFetching(globalPoints, selectedHeaders, () => {
                                          if (converterExportAsZip && groupingMode !== 'none') {
                                              downloadKMZGroupedZip(globalPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile.headers, selectedHeaders);
                                          } else {
                                              downloadKMZ(globalPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile.headers, selectedHeaders);
                                          }
                                      });
                                  }}
                                />
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
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <BarChart3 className="w-4 h-4 text-accent" />
                                    <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                        {lang === 'ar' ? 'توزيع الأطوال (كم) حسب حالة التنفيذ والقطر' : 'Length Distribution (km) by Execution Status & Diameter'}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <h4 className="text-white/60 text-[10px] font-bold uppercase text-center">{lang === 'ar' ? 'حسب حالة التنفيذ' : 'By Execution Status'}</h4>
                                        <div className="h-[200px] w-full">
                                            {executionStatusDistribution.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RechartsPieChart>
                                                        <Pie data={executionStatusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, percent}) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                                                            {executionStatusDistribution.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                        <RechartsTooltip formatter={(value) => [value, lang === 'ar' ? 'الطول (كم)' : 'Length (km)']} contentStyle={{ backgroundColor: '#0b2d3d', borderColor: '#ffffff20', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#06b6d4' }} />
                                                    </RechartsPieChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                    <PieChart className="w-8 h-8 mb-2 opacity-20" />
                                                    {lang === 'ar' ? 'لا يوجد بيانات تنفيذ' : 'No execution status data'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h4 className="text-white/60 text-[10px] font-bold uppercase text-center">{lang === 'ar' ? 'حسب القطر' : 'By Diameter'}</h4>
                                        <div className="h-[200px] w-full">
                                            {diameterDistribution.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={diameterDistribution}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                        <XAxis dataKey="name" tick={{ fill: '#ffffff60', fontSize: 9 }} axisLine={{ stroke: '#ffffff20' }} />
                                                        <YAxis tick={{ fill: '#ffffff60', fontSize: 9 }} axisLine={{ stroke: '#ffffff20' }} />
                                                        <RechartsTooltip formatter={(value) => [value, lang === 'ar' ? 'الطول (كم)' : 'Length (km)']} contentStyle={{ backgroundColor: '#0b2d3d', borderColor: '#ffffff20', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#06b6d4' }} cursor={{ fill: '#ffffff05' }} />
                                                        <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs font-black">
                                                    <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
                                                    {lang === 'ar' ? 'لا يوجد بيانات قطر' : 'No diameter data'}
                                                </div>
                                            )}
                                        </div>
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
                                          onClick={() => generateWMainlinePPTX(wMainlineStats, activeFile?.filename || "Water_Mainline_Project", lang)}
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
                                         onClick={() => generateWWMainlinePPTX(wwMainlineStats, activeFile?.filename || "Sewer_Mainline_Project", lang)}
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
                                data={!activeFile ? plannedStreets : globalPoints}
                                filename={activeFile?.filename || 'Analyzed'}
                                lang={lang}
                                isExecuting={loading}
                                onExcelExport={() => executeWithStreetFetching(!activeFile ? plannedStreets : globalPoints, selectedHeaders, downloadExcelAnalysis)}
                                onKmzExport={() => executeWithStreetFetching(!activeFile ? plannedStreets : globalPoints, selectedHeaders, () => { downloadKMZ(!activeFile ? plannedStreets : globalPoints, `Analyzed_${activeFile?.filename || 'File'}`, { mode: 'none', groupByAttribute: 'color', canonicalColorMap: canonicalColorMap, optimizeForMyMaps: optimizeForMyMaps, keepOriginalDescription: keepOriginalDescription, removeImagesOnly: removeImagesOnly }, activeFile?.headers, selectedHeaders) })}
                            />
                            <button onClick={downloadExcelWithStreets} className="w-full bg-[#0b2d3d] border border-accent/40 text-accent font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-accent hover:text-primary transition-all text-sm group">
                                <MapPinIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'تصدير إكسل مع أسماء الشوارع' : 'Export Excel with Streets'}
                            </button>
                            
                            <button onClick={verifyEssentialAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group">
                                <AlertTriangle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => generateAnalysisPPTX(analysisData, activeFile?.filename || "Analysis", lang)} className="w-full bg-accent text-primary font-black py-5 rounded-[2rem] flex items-center justify-center gap-2 shadow-2xl hover:brightness-110 active:scale-95 transition-all text-[11px] group"><Presentation className="w-5 h-5 group-hover:rotate-12 transition-transform" />{lang === 'ar' ? 'تصدير PPTX' : 'Export PPTX'}</button>
                                <button onClick={() => generateAnalysisPDF(analysisData, activeFile?.filename || "Analysis", lang)} className="w-full bg-[#D32F2F] text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-2 shadow-2xl hover:brightness-110 active:scale-95 transition-all text-[11px] group"><FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />{lang === 'ar' ? 'تصدير PDF' : 'Export PDF'}</button>
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
                      <label className="block p-8 border-2 border-dashed border-accent/40 rounded-[3rem] text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group shadow-2xl">
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                        <Upload className="w-10 h-10 mx-auto mb-3 text-accent group-hover:scale-110 transition-all" />
                        <span className="text-[12px] font-black text-white block leading-tight px-6 uppercase tracking-wider">
                          {lang === 'ar' ? 'ارفع ملف (.GDB, .ZIP, .KMZ, .KML, .DXF) لتحليله' : 'Drop file to analyze'}
                        </span>
                        <span className="text-[9px] text-accent mt-2 block font-bold uppercase tracking-[0.2em]">
                          {lang === 'ar' ? 'انقر للاختيار' : 'Click to select'}
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
                            <button onClick={() => { setLoading(true); setStatusMessage("جاري المعالجة..."); setTimeout(() => { const poly = globalPoints.map(p => p.path && p.path.length >= 3 ? {...p, type: 'Polygon' as const, path: [...p.path, p.path[0]]} : p); setGlobalPoints(poly); setLoading(false); setStatusMessage("تم التحويل!"); setTimeout(() => setStatusMessage(''), 2000); }, 1000); }} className="w-full bg-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"><Scissors className="w-5 h-5 text-accent" />{lang === 'ar' ? 'تحويل الخطوط لمضلعات' : 'Lines to Polygons'}</button>
                            <button onClick={() => { const all: {x:number, y:number}[] = []; globalPoints.forEach(p => p.path ? p.path.forEach(pt => all.push({x:pt.x, y:pt.y})) : all.push({x:p.x, y:p.y})); const hull = calculateConvexHull(all); const bound: GeoPoint = { id: 'Boundary', x: hull[0].x, y: hull[0].y, type: 'Polygon', path: hull, color: '#ffffff', layer: 'Boundary' }; setGlobalPoints([bound]); setDataId(`boundary-gen-${Date.now()}`); }} className="w-full bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl"><BoxSelect className="w-5 h-5" />{lang === 'ar' ? 'إنشاء مضلع شامل (Boundary)' : 'Create Convex Boundary'}</button>
                            <UniversalExportBar
                                data={globalPoints}
                                filename={activeFile?.filename || 'Polygon_Data'}
                                lang={lang}
                                isExecuting={loading}
                                onExcelExport={() => downloadExcelAnalysis()}
                                onKmzExport={() => downloadKMZ(globalPoints, activeFile?.filename || 'Polygon_Data', { mode: 'none' }, activeFile?.headers)}
                            />
                        </div>
                      )}
                  </div>
                )}

                {activeTab === 'classifier' && (
                  <MapClassifier lang={lang} targetAssets={globalPoints} setTargetAssets={setGlobalPoints} setRefPolygons={setClassifierRefZones} setDataId={setDataId} />
                )}

                {activeTab === 'attribute-formatter' && (
                  <DataFormatter onVerifyMissingAttributes={verifyEssentialAttributes}
                    points={globalPoints}
                    headers={activeFile?.headers}
                    lang={lang}
                    fetchStreets={executeWithStreetFetching}
                    geocodingMode={geocodingMode}
                    setGeocodingMode={setGeocodingMode}
                  />
                )}
                {activeTab === 'comparator' && (
                  <FileComparator lang={lang} setGlobalPoints={setGlobalPoints} setDataId={setDataId} />
                )}
           </div>

           <div className="p-8 border-t border-white/5 bg-black/10 shrink-0"><div className="space-y-2"><div className="flex items-center gap-2 text-white/40 group"><Mail className="w-3 h-3 group-hover:text-accent transition-colors" /><span className="text-[10px] font-bold">{t.contactDev}:</span><a href="mailto:oosman@nwc.com.sa" className="text-[10px] font-black text-accent hover:underline">oosman@nwc.com.sa</a></div><p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{t.developedBy}</p></div></div>
      </aside>

      <main className="flex-1 relative bg-[#0d1b24]">
          <MapPreview
            globalBaseMap={globalBaseMap}
            points={displayPoints}
            lang={lang}
            dataId={dataId}
            overlapResults={overlapResults}
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
         {loading && (<div className="absolute inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center"><div className="text-center p-12 bg-primary rounded-[3rem] border border-white/10 shadow-3xl"><Loader2 className="w-16 h-16 text-accent animate-spin mx-auto mb-6" /><p className="text-white font-black text-lg">{statusMessage}</p></div></div>)}


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
                         {overlapResults.length > 0 ? (
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
                                     {overlapResults.length > 50 && (
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
                             {/* Section 1: المحول الشامل */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><RefreshCw className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === 'ar' ? '1. المحول الشامل (Converter)' : '1. Coordinate Converter'}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === 'ar' ? 'يهدف هذا القسم لتحويل الإحداثيات والبيانات لملفات Excel, CSV, DXF إلى KML/KMZ مباشرة.' : 'Convert points/lines from Excel, CSV, DXF to standard map presentation formats (KML/KMZ).'}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === 'ar' ? (
                                         <>
                                             <li>ارفع الملف بالنقر أو السحب لمنطقة الرفع.</li>
                                             <li>اختر نظام الإحداثيات المصدر (مثل UTM Zone 37N-40N أو عين العبد).</li>
                                             <li>عّين أسماء الأعمدة في ملفك (الاسم، السيني X، الصادي Y).</li>
                                             <li>حمل ملف KML بجودة عرض ممتازة على Google Earth.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Upload Excel/CSV/DXF coordinates easily.</li>
                                             <li>Select Source CRS (UTM Zones 37N-40N, Ain El Abd, etc.).</li>
                                             <li>Map attributes (Identifier Name, Easting X, Northing Y).</li>
                                             <li>Download perfect full-fidelity KML/KMZ file.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 2: مخطط الشوارع */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><MapPinned className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === 'ar' ? '2. مخطط الشوارع (Street Planner)' : '2. Street Planner'}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === 'ar' ? 'استخراج تلقائي دقيق لكافة خطوط ومسارات الشوارع الحقيقية من الخرائط بضغطة زر.' : 'Instantly extract real geographic street layouts and names from a selected region on the map.'}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === 'ar' ? (
                                         <>
                                             <li>انقر على زر "رسم الحدود" وارسم نطاق منطقتك على الخريطة.</li>
                                             <li>رتب وحدد تصنيفات الشوارع المطلوبة (رئيسية، ثانوية، سكنية).</li>
                                             <li>فعّل خيار استدلال الأسماء للحصول على أسماء الشوارع تلقائياً.</li>
                                             <li>تصفح مسارات الشبكة وحملها كملف KML/KMZ.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Draw boundary polygon or load one dynamically.</li>
                                             <li>Choose requested street hierarchies to filter.</li>
                                             <li>Enable name-inferring to fetch true street names.</li>
                                             <li>Download structured street mains as KML layers.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 3: محلل الأطوال */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><BarChart3 className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === 'ar' ? '3. محلل الأطوال (Length Analyzer)' : '3. Pipe Length Analyzer'}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === 'ar' ? 'لوحة تحليلات ذكية لخطوط المياه والصرف الصحي، مجهزة بإحصائيات وأدوات تصدير.' : 'Fully automated intelligence panel for analysing water (W_MAINLINE) and sewer (WW_MAINLINE) networks.'}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === 'ar' ? (
                                         <>
                                             <li>مخصص لقراءة أشكال الكابلات والأنابيب في ملفات KMZ/KML.</li>
                                             <li>يعرض الأطوال الإجمالية، التقسيم بالمواد (Ductile, HDPE) وبالأقطار.</li>
                                             <li>تصفح مخططات وعدد القطاعات الإنشائية للخطوط.</li>
                                             <li>أزرار تصدير مخصصة لكل طبقة وتصدير تقرير PPTX لعقد الاجتماعات.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Analyze files featuring water or wastewater pipeline networks.</li>
                                             <li>Extract breakdown metrics based on materials & pipe diameters.</li>
                                             <li>Obtain exact section counts and average lengths per pipeline segment.</li>
                                             <li>Generate and export tailored PPTX executive slide reports natively.</li>
                                         </>
                                     )}
                                 </ul>
                             </div>

                             {/* Section 4: مقسم KML ومحول المضلعات */}
                             <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-3 print:bg-white print:border-slate-300 print:border">
                                 <div className="flex items-center gap-2.5 pb-2 border-b border-white/5 print:border-slate-200">
                                     <div className="p-2 bg-accent/10 rounded-xl text-accent"><Split className="w-4 h-4" /></div>
                                     <h3 className="font-black text-sm text-white print:text-black">{lang === 'ar' ? '4. الأدوات المساعدة وحل المشكلات' : '4. Geospatial Tools & Resiliency'}</h3>
                                 </div>
                                 <p className="text-[11px] text-white/70 leading-relaxed print:text-slate-800">
                                     {lang === 'ar' ? 'المقسم مخصص لتجزئة الملفات الضخمة، والمحول لمضلعات لتربيط خطوط المشاريع.' : 'Advanced splitter for processing large datasets and polygon converter for project tracing.'}
                                 </p>
                                 <ul className="text-[10px] text-white/60 space-y-1.5 list-disc list-inside print:text-slate-700">
                                     {lang === 'ar' ? (
                                         <>
                                             <li>تقسيم ملفات KML إما رقمياً أو برسم مضلع جغرافي لقص المنطقة المطلوبة.</li>
                                             <li>محول المضلعات يجمع الخطوط المبعثرة لمضلع واحد أو ينشئ Boundary فوراً.</li>
                                             <li>نظام معالجة قوي لتنظيف أخطاء XML في الكيلومترات (KMZ/KML) المتضررة.</li>
                                             <li>تنبيهات فورية وإرشادات ذكية لتصحيح المدخلات.</li>
                                         </>
                                     ) : (
                                         <>
                                             <li>Split heavy geographical datasets numerically or via drawing polygon constraints.</li>
                                             <li>Convert dynamic trace paths to closed polygons or create bounding hulls.</li>
                                             <li>Includes intelligent XML parsing recovery to fix error-prone KML codes.</li>
                                             <li>Quickly resolve issues and check network geometries interactively.</li>
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
      </main>
      </div>
    </div>
  );
};

export default App;
