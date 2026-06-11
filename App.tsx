
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Download, Check, Split, Trash2, Activity, 
  Presentation, FolderInput, Menu, X, PanelTop, 
  SlidersHorizontal, Loader2, Map as MapIcon,
  BarChart3, Ruler, MapPin, Layers, RefreshCw,
  FileSpreadsheet, ToggleLeft, ToggleRight, CheckSquare, Square,
  Shapes, Map, PieChart, FileText, DownloadCloud, Settings2, Info,
  MapPinned, MousePointer2, Eraser, FileUp, Archive, CircleDot,
  BoxSelect, PlusSquare, Scissors, Languages, Palette, Mail,
  ChevronRight, ListOrdered, Locate, Zap, Navigation, FolderOpen, Package,
  CloudDownload, GitBranch, UnfoldVertical, MapPin as MapPinIcon,
  Target, Sparkles, Hash, Maximize, Crop, Layers2, Edit3, Filter,
  Database, Droplet
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { ParsedFile, ColumnMapping, GeoPoint, SplitterMode, KmlSplitMode, AnalysisItem, KmlExportOptions, SplitPolygon } from './types';
import { COMMON_EPSG } from './constants';
import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ } from './services/parserService';
import { transformPoints, identifyPotentialCRS, parseCoordinatesFromText } from './services/crs'; 
import { downloadBlob, downloadKMZ, downloadKMZGroupedZip, generateKML, generateKMLChunks, generateKMLFolderContent } from './services/kmlService';
import { getReverseGeocode, calculatePathLength, splitLineString, fetchStreetsInPolygon, isPointInPolygon, clipLineToPolygon, calculateConvexHull, calculateBoundingBox, bufferPolygon } from './services/geometryService';
import { generateAnalysisPPTX, generateWMainlinePPTX, generateWWMainlinePPTX } from './services/reportService';
import { getCanonicalColorMap } from './services/colorUtils';
import MapPreview from './components/MapPreview';
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

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('ar');
  const [theme, setTheme] = useState<'default' | 'nwc'>('default');
  const t = translations[lang];
  
  const [activeTab, setActiveTab] = useState<'converter' | 'splitter' | 'analyzer' | 'street-planner' | 'polygon-converter'>('converter');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<string | null>(null);

  const [activeFile, setActiveFile] = useState<ParsedFile | null>(null);
  const [globalPoints, setGlobalPoints] = useState<GeoPoint[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataId, setDataId] = useState<string>(''); 
  
  const [mergeThreshold, setMergeThreshold] = useState<number>(45);

  const [splitMode, setSplitMode] = useState<'count' | 'spatial'>('count');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [exportStyle, setExportStyle] = useState<'single' | 'zip'>('single');
  const [splitLines, setSplitLines] = useState(false);
  const [separateMulti, setSeparateMulti] = useState(false);
  const [maxLen, setMaxLen] = useState(1000);

  // Multi-Polygon Split State
  const [splitPolygons, setSplitPolygons] = useState<SplitPolygon[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{x: number, y: number}[] | null>(null);
  const [plannedStreets, setPlannedStreets] = useState<GeoPoint[]>([]);
  const [boundaryPolygon, setBoundaryPolygon] = useState<GeoPoint | null>(null);
  
  const [plannerSeparate, setPlannerSeparate] = useState(false);
  const [plannerSplitLines, setPlannerSplitLines] = useState(false);
  const [plannerMaxLen, setPlannerMaxLen] = useState(500);
  const [plannerClip, setPlannerClip] = useState(true);
  const [plannerBuffer, setPlannerBuffer] = useState(0);
  
  // Street Classification Filters
  const [streetTypeFilters, setStreetTypeFilters] = useState<string[]>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service']);

  const [sourceEPSG, setSourceEPSG] = useState<string>('EPSG:32638');
  const [swapXY, setSwapXY] = useState<boolean>(false);
  const [mapping, setMapping] = useState<ColumnMapping>({ 
    xColumn: '', yColumn: '', idColumn: '', linkColumn: '', attr1Column: '', attr2Column: '' 
  });
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([]);
  const [groupingMode, setGroupingMode] = useState<'none' | 'layer' | 'column'>('layer');
  const [groupByColumnSelect, setGroupByColumnSelect] = useState<string>('');
  const [converterExportAsZip, setConverterExportAsZip] = useState<boolean>(false);

  const boundaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeFile && activeFile.headers) {
      setSelectedHeaders(activeFile.headers);
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

    if (activeTab === 'polygon-converter' || (activeTab === 'splitter' && splitMode === 'spatial')) {
      return [...globalPoints, ...(boundaryPolygon ? [boundaryPolygon] : [])];
    }
    
    return globalPoints;
  }, [activeTab, splitMode, plannedStreets, boundaryPolygon, globalPoints, splitPolygons]);

  const layerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    globalPoints.forEach(p => {
      const layer = p.layer || 'Default';
      stats[layer] = (stats[layer] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [globalPoints]);

  const canonicalColorMap = useMemo(() => {
    const pointsToProcess = activeTab === 'street-planner' ? [...globalPoints, ...plannedStreets] : globalPoints;
    if (pointsToProcess.length === 0) return {};
    const colors = Array.from(new Set<string>(pointsToProcess.map(p => (p.color || '#dcb13c').toUpperCase())));
    return getCanonicalColorMap(colors, mergeThreshold);
  }, [globalPoints, plannedStreets, activeTab, mergeThreshold]);

  const analysisData = useMemo(() => {
    const pointsToAnalyze = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile)) ? plannedStreets : globalPoints;
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

    return Object.entries(groups).map(([color, stats]) => ({
      color,
      totalLength: stats.totalLength,
      count: stats.count,
      percentage: totalAllLength > 0 ? (stats.totalLength / totalAllLength) * 100 : 0
    })).sort((a, b) => b.totalLength - a.totalLength);
  }, [globalPoints, plannedStreets, activeTab, canonicalColorMap, activeFile]);

  const placemarksSummary = useMemo(() => {
    const pointsToAnalyze = !activeFile ? plannedStreets : globalPoints;
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
    const segments = pointsToProcess.filter(p => p.layer && p.layer.toUpperCase().includes('W_MAINLINE'));
    
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
    const segments = pointsToProcess.filter(p => p.layer && (
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
                    rowObj[h] = row[i];
                }
            });
            
            rowObj[lang === 'ar' ? 'خط العرض المحول (Y)' : 'Converted Latitude (Y)'] = lat;
            rowObj[lang === 'ar' ? 'خط الطول المحول (X)' : 'Converted Longitude (X)'] = lon;
            rowObj[lang === 'ar' ? 'الشارع' : 'Street'] = street;
            rowObj[lang === 'ar' ? 'الحي' : 'District'] = district;
            rowObj[lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link'] = link;
            
            return rowObj;
        });

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.sheet_to_json(combinedData), lang === 'ar' ? "البيانات المحولة كاملة" : "Full Converted Data");
    } else {
        const pointsToExport = (activeTab === 'street-planner') 
            ? [...globalPoints, ...plannedStreets] 
            : (activeTab === 'analyzer' && !activeFile ? plannedStreets : globalPoints);
            
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

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.sheet_to_json(detailedData), lang === 'ar' ? "بيانات العناصر" : "Elements Data");
        
        if (activeTab === 'analyzer') {
            const summaryData = analysisData.map(d => ({
                [lang === 'ar' ? 'اللون (كود)' : 'Color (Hex)']: d.color,
                [lang === 'ar' ? 'إجمالي الطول (م)' : 'Total Length (m)']: d.totalLength.toFixed(2),
                [lang === 'ar' ? 'إجمالي الطول (كم)' : 'Total Length (km)']: (d.totalLength / 1000).toFixed(3),
                [lang === 'ar' ? 'عدد العناصر' : 'Elements Count']: d.count,
                [lang === 'ar' ? 'النسبة المئوية (%)' : 'Percentage (%)']: d.percentage.toFixed(2)
            }));
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.sheet_to_json(summaryData), lang === 'ar' ? "ملخص التحليل" : "Summary Analysis");
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
            const streets = await fetchStreetsInPolygon(buffered, plannerClip, streetTypeFilters);
            setPlannedStreets(streets);
        }

        const total = globalPoints.length;
        const updated = [...globalPoints];
        let successCount = 0;
        
        for (let i = 0; i < total; i++) {
            setStatusMessage(lang === 'ar' 
              ? `جاري عنونة البيانات: (${i + 1} من ${total})` 
              : `Geocoding data: (${i + 1} of ${total})`
            );
            const pt = updated[i];
            
            if (!pt.street || pt.street === "شارع غير معروف") {
                const geoData = await getReverseGeocode(pt.y, pt.x);
                updated[i] = { ...pt, street: geoData.street, district: geoData.district };
                successCount++;
                if (total > 5) await new Promise(r => setTimeout(r, 850));
            }
            if (i % 5 === 0 || i === total - 1) setGlobalPoints([...updated]);
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
    const results = [];
    const total = pointsToExport.length;

    for (let i = 0; i < total; i++) {
        const pt = pointsToExport[i];
        
        let street = pt.street;
        let district = pt.district;

        if (!street || !district) {
          setStatusMessage(lang === 'ar' 
            ? `جاري جلب أسماء الشوارع: (${i + 1} من ${total})` 
            : `Fetching Street Names: (${i + 1} of ${total})`
          );
          const geoData = await getReverseGeocode(pt.y, pt.x);
          street = geoData.street;
          district = geoData.district;
        }
        
        const lat = pt.y;
        const lon = pt.x;
        const googleMapsLink = `https://www.google.com/maps?q=${lat},${lon}`;
        let elementLength = pt.originalLength || 0;
        if (elementLength === 0 && pt.path) elementLength = calculatePathLength(pt.path);

        results.push({
            [lang === 'ar' ? 'اسم الملف' : 'File Name']: activeFile?.filename || '',
            [lang === 'ar' ? 'المعرف' : 'ID']: pt.id,
            [lang === 'ar' ? 'الشارع' : 'Street']: street,
            [lang === 'ar' ? 'الحي' : 'District']: district,
            [lang === 'ar' ? 'النوع' : 'Type']: pt.type || 'Point',
            [lang === 'ar' ? 'الطبقة' : 'Layer']: pt.layer || 'Default',
            [lang === 'ar' ? 'اللون' : 'Color']: pt.color || '#dcb13c',
            [lang === 'ar' ? 'خط العرض (Y)' : 'Latitude (Y)']: lat,
            [lang === 'ar' ? 'خط الطول (X)' : 'Longitude (X)']: lon,
            [lang === 'ar' ? 'الطول (متر)' : 'Length (m)']: elementLength > 0 ? elementLength.toFixed(2) : '-',
            [lang === 'ar' ? 'رابط خرائط جوجل' : 'Google Maps Link']: googleMapsLink
        });

        if (!pt.street && total > 5) await new Promise(r => setTimeout(r, 800));
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
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb')) result = await parseKMZ(selectedFile);
      else throw new Error(t.errors.unsupported);
      
      setActiveFile(result);
      setDataId(`${result.filename}-${Date.now()}`);

      let detected: string | null = null;
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
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

      const docName = activeFile?.filename.split('.')[0] || "Split_Export";
      if (exportStyle === 'single') {
        const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${docName}</name>\n`;
        const kmlFooter = `</Document></kml>`;
        const chunks: string[] = [kmlHeader];
        groups.forEach(g => {
            chunks.push(`<Folder><name>${g.name}</name><open>0</open>\n`);
            const placemarks = generateKMLFolderContent(g.points, activeFile?.headers, selectedHeaders);
            for (const p of placemarks) {
                chunks.push(p);
            }
            chunks.push(`</Folder>\n`);
        });
        chunks.push(kmlFooter);
        const zip = new JSZip(); 
        const blobKML = new Blob(chunks, { type: "application/vnd.google-earth.kml+xml" });
        zip.file("doc.kml", await blobKML.arrayBuffer()); 
        const blob = await zip.generateAsync({ type: "blob", compression: globalPoints.length < 100000 ? "DEFLATE" : "STORE" }); 
        downloadBlob(blob, `${docName}_Split.kmz`);
      } else {
        const zip = new JSZip();
        for (const g of groups) { 
          const kmlChunks = generateKMLChunks(g.points, g.name, { mode: 'none' }, activeFile?.headers, selectedHeaders); 
          const blobKML = new Blob(kmlChunks, { type: "application/vnd.google-earth.kml+xml" });
          zip.file(`${g.name}.kml`, await blobKML.arrayBuffer()); 
        }
        const blob = await zip.generateAsync({ type: "blob", compression: globalPoints.length < 100000 ? "DEFLATE" : "STORE" }); 
        downloadBlob(blob, `${docName}_Split_Files.zip`);
      }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
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
        if (fName.endsWith('.kmz') || fName.endsWith('.kml')) result = await parseKMZ(selectedFile);
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

  const FileUploadZone = ({ id, label }: { id: string, label?: string }) => (
    <div className="space-y-4">
      {label && (<div className="flex items-center gap-2 mb-2"><GitBranch className="w-5 h-5 text-accent transform rotate-90" /><h3 className="text-white font-black text-sm">{label}</h3></div>)}
      <label className="block border-2 border-dashed border-accent/40 rounded-[2.5rem] p-10 text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group relative overflow-hidden">
        <input type="file" className="hidden" onChange={handleFileUpload} />
        <Upload className="w-10 h-10 mx-auto mb-4 text-accent group-hover:scale-110 transition-all" />
        <span className="text-[11px] font-black text-white block leading-tight px-4">{activeFile ? activeFile.filename : (lang === 'ar' ? 'ارفق الملف هنا' : 'Upload Data Source')}</span>
        <span className="text-[9px] text-accent mt-3 block font-bold uppercase tracking-widest">{activeFile ? (lang === 'ar' ? 'انقر لتغيير الملف' : 'Change File') : (lang === 'ar' ? 'انقر لاختيار الملف' : 'Select File')}</span>
      </label>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[#0a2633] font-sans overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <nav className="bg-primary border-e border-slate-800 flex flex-col items-center py-8 w-24 shrink-0 z-50 shadow-2xl transition-colors duration-500">
          <div className="flex-1 flex flex-col gap-6 w-full px-2">
             {[
               { id: 'converter', icon: <RefreshCw />, label: lang === 'ar' ? 'محول' : 'Converter' },
               { id: 'street-planner', icon: <MapPinned />, label: lang === 'ar' ? 'مخطط' : 'Planner' },
               { id: 'analyzer', icon: <BarChart3 />, label: lang === 'ar' ? 'محلل' : 'Analyzer' },
               { id: 'splitter', icon: <Split />, label: lang === 'ar' ? 'مقسم' : 'Splitter' },
               { id: 'polygon-converter', icon: <Shapes />, label: lang === 'ar' ? 'مضلعات' : 'Polygons' }
             ].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex flex-col items-center gap-2 p-3 rounded-2xl transition-all", activeTab === tab.id ? "bg-accent text-primary shadow-lg" : "text-white/30 hover:text-white")}>
                  {React.cloneElement(tab.icon as any, { className: "w-6 h-6" })}
                  <span className="text-[8px] font-black uppercase text-center leading-tight">{tab.label}</span>
                </button>
             ))}
          </div>
          <div className="flex flex-col gap-4 mt-auto">
             <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Languages className="w-5 h-5" /><span className="text-[8px] font-bold">{lang.toUpperCase()}</span></button>
             <button onClick={() => setTheme(theme === 'default' ? 'nwc' : 'default')} className="p-3 text-white/40 hover:text-accent transition-all flex flex-col items-center gap-1"><Palette className="w-5 h-5" /><span className="text-[8px] font-bold">THEME</span></button>
          </div>
      </nav>

      <aside className="bg-primary border-e border-slate-800 w-[420px] flex flex-col shadow-2xl relative z-40 transition-colors duration-500 overflow-hidden">
           <div className="p-10 pb-4 shrink-0">
                <div className="flex items-center justify-between">
                   <div><h1 className="text-2xl font-black text-white tracking-tight leading-tight">{t.appTitle}</h1><p className="text-[10px] text-accent font-black uppercase mt-1 tracking-widest">{theme === 'nwc' ? t.themeNWC : t.subTitle}</p></div>
                   {theme === 'nwc' && (
                     <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg animate-pulse">
                       <span className="text-primary font-black text-[11px] tracking-tight">NWC</span>
                     </div>
                   )}
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
                                                onClick={() => setSelectedHeaders(activeFile.headers || [])} 
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
                                            {activeFile.headers.map((header) => {
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
                                                        <Map className="w-3.5 h-3.5 text-accent/80" />
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
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-4">
                                    <button 
                                        onClick={() => {
                                            if (converterExportAsZip && groupingMode !== 'none') {
                                                downloadKMZGroupedZip(globalPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined }, activeFile.headers, selectedHeaders);
                                            } else {
                                                downloadKMZ(globalPoints, activeFile.filename, { mode: 'none', groupByAttribute: groupingMode === 'layer' ? 'layer' : undefined, groupByColumn: groupingMode === 'column' ? groupByColumnSelect : undefined }, activeFile.headers, selectedHeaders);
                                            }
                                        }} 
                                        className="bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:brightness-110 active:scale-95 transition-all w-full"
                                    >
                                      {converterExportAsZip && groupingMode !== 'none' ? <Archive className="w-5 h-5" /> : <Download className="w-5 h-5" />} 
                                      {converterExportAsZip && groupingMode !== 'none'
                                        ? (lang === 'ar' ? 'تصدير كمجلد مضغوط (ZIP)' : 'Export as Zipped Folders (ZIP)')
                                        : (lang === 'ar' ? 'تصدير Google Earth (KMZ)' : 'Export Google Earth (KMZ)')
                                      }
                                    </button>
                                    <button onClick={downloadExcelAnalysis} className="bg-white/5 border border-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:bg-white/10 active:scale-95 transition-all w-full">
                                      <FileSpreadsheet className="w-5 h-5 text-green-500" /> 
                                      {lang === 'ar' ? 'تصدير إكسل شامل' : 'Full Excel Export'}
                                    </button>
                                </div>
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
                                  <span className="text-[11px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط حسب الطول' : 'Split Lines by Length'}</span>
                                  <span className="text-[9px] text-white/40">{lang === 'ar' ? 'تقسيم المسارات المستخرجة لقطع متساوية' : 'Split fetched paths equally'}</span>
                              </div>
                              <button onClick={() => setPlannerSplitLines(!plannerSplitLines)} className={cn("w-10 h-5 rounded-full transition-all relative", plannerSplitLines ? "bg-accent" : "bg-white/10")}>
                                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (plannerSplitLines ? "left-0.5" : "left-5.5") : (plannerSplitLines ? "right-0.5" : "right-5.5"))} />
                              </button>
                          </label>

                          {plannerSplitLines && (
                              <div className="px-4 pb-2 animate-in slide-in-from-top">
                                  <div className="flex items-center justify-between mb-2">
                                      <span className="text-[9px] font-bold text-white/60">{lang === 'ar' ? 'الحد الأقصى (م):' : 'Max Length (m):'}</span>
                                      <span className="text-xs font-black text-accent">{plannerMaxLen}m</span>
                                  </div>
                                  <input 
                                      type="range" 
                                      min="50" max="2000" step="50" 
                                      value={plannerMaxLen} 
                                      onChange={(e) => setPlannerMaxLen(parseInt(e.target.value))} 
                                      className="w-full accent-accent h-1 bg-white/10 rounded-full" 
                                  />
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
                                <button onClick={() => downloadKMZ([...globalPoints, ...plannedStreets], "Full_Street_Project", { mode: 'none', groupByAttribute: 'layer' })} className="w-full bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:brightness-110 shadow-xl transition-all"><Download className="w-5 h-5" />{lang === 'ar' ? 'تنزيل المشروع كاملاً (KMZ)' : 'Download Full KMZ'}</button>
                                <button onClick={downloadExcelWithStreets} className="w-full bg-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"><FileSpreadsheet className="w-5 h-5 text-green-500" />{lang === 'ar' ? 'تنزيل المشروع كاملاً (Excel)' : 'Download Full Excel'}</button>
                                <button onClick={() => { setSelectedArea(null); setPlannedStreets([]); setBoundaryPolygon(null); setIsDrawingMode(false); setActiveFile(null); setGlobalPoints([]); }} className="w-full mt-2 bg-white/5 text-white/40 font-black py-3 rounded-xl flex items-center justify-center gap-2 hover:text-red-400 transition-all text-[10px] uppercase"><Trash2 className="w-3 h-3" />{lang === 'ar' ? 'إفراغ مساحة العمل' : 'Clear Workspace'}</button>
                            </div>
                        </div>
                      )}
                  </div>
                )}

                {activeTab === 'analyzer' && (activeFile || plannedStreets.length > 0) && (
                  <div className="space-y-6 animate-in fade-in duration-500 pb-10">
                      <div className="p-10 bg-[#0b2d3d]/60 rounded-[3rem] border border-accent/20 shadow-2xl text-center space-y-4 relative overflow-hidden">
                          <label className="absolute top-4 right-4 p-2 bg-accent/10 hover:bg-accent hover:text-primary text-accent rounded-full transition-all cursor-pointer group border border-accent/20">
                              <input type="file" className="hidden" onChange={handleFileUpload} />
                              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                              <span className="sr-only">{lang === 'ar' ? 'تحديث الملف' : 'Update File'}</span>
                          </label>
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
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <Shapes className="w-4 h-4 text-accent" />
                                    <h3 className="text-white font-black text-[11px] uppercase tracking-wider">
                                        {lang === 'ar' ? 'أقسام عناصر الخريطة' : 'KML Placemarks'}
                                    </h3>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div id="points-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <CircleDot className="w-4 h-4 text-accent/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'نقاط' : 'Points'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.points}</span>
                                    </div>
                                    <div id="lines-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <Activity className="w-4 h-4 text-accent/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'مسارات' : 'Lines'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.lines}</span>
                                    </div>
                                    <div id="polygons-stat" className="bg-white/5 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <Map className="w-4 h-4 text-accent/60 mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-white/40 block uppercase">{lang === 'ar' ? 'مساحات' : 'Polygons'}</span>
                                        <span className="text-lg font-black text-white mt-1">{placemarksSummary.polygons}</span>
                                    </div>
                                    <div id="total-stat" className="bg-accent/15 border border-accent/20 rounded-2xl p-2.5 flex flex-col justify-center">
                                        <Hash className="w-4 h-4 text-accent mx-auto mb-1" />
                                        <span className="text-[8px] font-bold text-accent/60 block uppercase">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
                                        <span className="text-lg font-black text-accent mt-1">{placemarksSummary.total}</span>
                                    </div>
                                </div>
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
                                              const percentage = ((length / wMainlineStats.totalLength) * 100).toFixed(1);
                                              return (
                                                  <div key={material} className="space-y-1">
                                                      <div className="flex justify-between text-[10px] font-bold text-white/80">
                                                          <span>{material}</span>
                                                          <span>{(length / 1000).toFixed(3)} km ({percentage}%)</span>
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
                                                  <span className="text-[10px] font-bold text-[#00c8b3]">{(length / 1000).toFixed(3)} km</span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>

                                  {/* Dedicated EXPORT buttons specifically for W_MAINLINE */}
                                  <div className="space-y-3">
                                      <button
                                          onClick={() => downloadKMZ(wMainlineStats.segments, "W_MAINLINE_network_map", { mode: 'none' })}
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
                                             const percentage = ((length / wwMainlineStats.totalLength) * 100).toFixed(1);
                                             return (
                                                 <div key={material} className="space-y-1 text-left">
                                                     <div className="flex justify-between text-[10px] font-bold text-white/80">
                                                         <span>{material}</span>
                                                         <span>{(length / 1000).toFixed(3)} km ({percentage}%)</span>
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
                                                 <span className="text-[10px] font-bold text-[#d946ef]">{(length / 1000).toFixed(3)} km</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Dedicated EXPORT buttons specifically for WW_MAINLINE */}
                                 <div className="space-y-3">
                                     <button
                                         onClick={() => downloadKMZ(wwMainlineStats.segments, "WW_MAINLINE_sewer_map", { mode: 'none' })}
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
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => downloadKMZ(!activeFile ? plannedStreets : globalPoints, `Analyzed_${activeFile?.filename || 'File'}`, { mode: 'none', groupByAttribute: 'color', canonicalColorMap: canonicalColorMap }, activeFile?.headers, selectedHeaders)} className="border border-[#ffffff]/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/5 transition-all text-[11px] shadow-lg"><DownloadCloud className="w-4 h-4 text-accent" />KMZ (Merged)</button>
                                <button onClick={downloadExcelAnalysis} className="border border-white/10 text-white/80 font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/5 transition-all text-[11px] shadow-lg"><FileSpreadsheet className="w-4 h-4 text-green-500" />Excel (Standard)</button>
                            </div>
                            <button onClick={downloadExcelWithStreets} className="w-full bg-[#0b2d3d] border border-accent/40 text-accent font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-accent hover:text-primary transition-all text-sm group">
                                <MapPinIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'تصدير إكسل مع أسماء الشوارع' : 'Export Excel with Streets'}
                            </button>
                            <button onClick={() => generateAnalysisPPTX(analysisData, activeFile?.filename || "Analysis", lang)} className="w-full bg-accent text-primary font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-2xl hover:brightness-110 active:scale-95 transition-all text-sm group"><Presentation className="w-6 h-6 group-hover:rotate-12 transition-transform" />{lang === 'ar' ? 'تصدير عرض تقديمي PPTX' : 'Export PPTX Presentation'}</button>
                            <div className="bg-[#0b2d3d]/40 p-8 rounded-[3rem] border border-white/5 space-y-6">
                                <h3 className="text-white/40 font-black text-[11px] text-center uppercase tracking-[0.2em]">{lang === 'ar' ? 'تفاصيل المجموعات المدمجة' : 'Merged Color Details'}</h3>
                                <div className="space-y-8">{analysisData.map((item, idx) => (
                                        <div key={idx} className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                              <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" style={{ backgroundColor: item.color }} />
                                              <span className="text-[11px] font-black text-white/80 tracking-widest">{item.color}</span>
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
                    <label className="block p-8 border-2 border-dashed border-accent/40 rounded-[3rem] text-center cursor-pointer hover:border-accent bg-[#0b2d3d]/40 transition-all group shadow-2xl">
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                      <Upload className="w-10 h-10 mx-auto mb-3 text-accent group-hover:scale-110 transition-all" />
                      <span className="text-[12px] font-black text-white block leading-tight px-6 uppercase tracking-wider">
                        {lang === 'ar' ? 'ارفع ملف (.GDB, .ZIP, .KMZ, .DXF) لتحليله' : 'Drop file to analyze'}
                      </span>
                      <span className="text-[9px] text-accent mt-2 block font-bold uppercase tracking-[0.2em]">
                        {lang === 'ar' ? 'انقر للاختيار' : 'Click to select'}
                      </span>
                    </label>
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
                      <div className="bg-[#0b2d3d]/40 p-2 rounded-[1.8rem] border border-white/5 flex gap-2"><button onClick={() => setSplitMode('count')} className={cn("flex-1 py-4 rounded-[1.5rem] text-[12px] font-black transition-all", splitMode === 'count' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>{lang === 'ar' ? 'تقسيم رقمي (أجزاء)' : 'Digital Split (Parts)'}</button><button onClick={() => setSplitMode('spatial')} className={cn("flex-1 py-4 rounded-[1.5rem] text-[12px] font-black transition-all", splitMode === 'spatial' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>{lang === 'ar' ? 'تقسيم حسب رسم منطقة' : 'Split by Drawing Area'}</button></div>
                      <div className="bg-[#0b2d3d]/40 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-8">
                        {splitMode === 'count' ? (
                          <div className="space-y-8">
                            <div className="flex items-center justify-between"><h3 className="text-white font-black text-sm">{lang === 'ar' ? 'عدد الأجزاء:' : 'Number of Parts:'}</h3><span className="text-2xl font-black text-accent">{splitCount}</span></div>
                            <div className="relative h-2 w-full bg-[#0e3f53] rounded-full"><input type="range" min="2" max="50" value={splitCount} onChange={(e) => setSplitCount(parseInt(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><div className="h-full bg-accent/20 rounded-full" style={{ width: `${((splitCount - 2) / 48) * 100}%` }} /><div className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-accent rounded-full border-4 border-[#0e3f53] shadow-lg pointer-events-none" style={{ left: `calc(${((splitCount - 2) / 48) * 100}% - 12px)` }} /></div>
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
                      <div className="bg-[#0b2d3d]/40 p-6 rounded-[2.5rem] border border-white/5 space-y-4"><div className="flex items-center gap-2 mb-2"><Settings2 className="w-4 h-4 text-accent" /><h3 className="text-white font-black text-[11px] uppercase tracking-wider">{lang === 'ar' ? 'خيارات تقسيم متقدمة' : 'Advanced Split Options'}</h3></div><label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5"><div className="flex flex-col gap-1"><span className="text-[12px] font-black text-white">{lang === 'ar' ? 'فصل العناصر المدمجة (Explode)' : 'Separate Combined Elements'}</span><span className="text-[9px] text-white/40">{lang === 'ar' ? 'تحويل MultiGeometry إلى عناصر منفصلة قبل التقسيم' : 'Convert MultiGeometry to individual parts'}</span></div><button onClick={() => setSeparateMulti(!separateMulti)} className={cn("w-12 h-6 rounded-full transition-all relative", separateMulti ? "bg-accent" : "bg-white/10")}><div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (separateMulti ? "left-1" : "left-7") : (separateMulti ? "right-1" : "right-7"))} /></button></label><label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-transparent hover:border-white/5"><div className="flex flex-col gap-1"><span className="text-[12px] font-black text-white">{lang === 'ar' ? 'تقسيم الخطوط حسب الطول' : 'Split Lines by Length'}</span><span className="text-[9px] text-white/40">{lang === 'ar' ? 'تقسيم المسارات الطويلة لقطع متساوية' : 'Split long paths into equal segments'}</span></div><button onClick={() => setSplitLines(!splitLines)} className={cn("w-12 h-6 rounded-full transition-all relative", splitLines ? "bg-accent" : "bg-white/10")}><div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md", lang === 'ar' ? (splitLines ? "left-1" : "left-7") : (splitLines ? "right-1" : "right-7"))} /></button></label>{splitLines && (<div className="px-4 pb-2 animate-in slide-in-from-top"><div className="flex items-center justify-between mb-2"><span className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'الحد الأقصى للطول (م):' : 'Max Length (m):'}</span><span className="text-xs font-black text-accent">{maxLen}m</span></div><input type="range" min="100" max="5000" step="100" value={maxLen} onChange={(e) => setMaxLen(parseInt(e.target.value))} className="w-full accent-accent h-1 bg-white/10 rounded-full" /></div>)}</div>
                      <div className="space-y-4"><h3 className="text-white/40 font-black text-[10px] uppercase tracking-widest px-4">{lang === 'ar' ? 'نمط التصدير:' : 'Export Style:'}</h3><div className="grid grid-cols-2 gap-4"><button onClick={() => setExportStyle('single')} className={cn("flex flex-col items-center gap-4 p-8 rounded-[2rem] border-2 transition-all group", exportStyle === 'single' ? "bg-[#0b2d3d] border-accent" : "bg-white/5 border-transparent opacity-60 hover:opacity-100")}><div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-1", exportStyle === 'single' ? "bg-accent/10 text-accent" : "bg-white/5 text-white/30")}><FolderOpen className="w-7 h-7" /></div><span className={cn("text-[10px] font-black leading-tight text-center", exportStyle === 'single' ? "text-accent" : "text-white/40")}>{lang === 'ar' ? 'ملف KML واحد (مجلدات)' : 'Single KML file (Folders)'}</span></button><button onClick={() => setExportStyle('zip')} className={cn("flex flex-col items-center gap-4 p-8 rounded-[2rem] border-2 transition-all group", exportStyle === 'zip' ? "bg-[#0b2d3d] border-accent" : "bg-white/5 border-transparent opacity-60 hover:opacity-100")}><div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-1", exportStyle === 'zip' ? "bg-accent/10 text-accent" : "bg-white/5 text-white/30")}><Package className="w-7 h-7" /></div><span className={cn("text-[10px] font-black leading-tight text-center", exportStyle === 'zip' ? "text-accent" : "text-white/40")}>{lang === 'ar' ? 'ملفات KML منفصلة (ZIP)' : 'Separate KML files (ZIP)'}</span></button></div></div>
                      <button onClick={handleSplitExport} disabled={!activeFile} className={cn("w-full py-6 rounded-full font-black text-lg flex items-center justify-center gap-3 shadow-2xl transition-all transform hover:scale-[1.02] active:scale-95", activeFile ? "bg-accent text-primary" : "bg-[#0e3f53]/50 text-white/10 cursor-not-allowed")}><CloudDownload className="w-7 h-7" /><span>{lang === 'ar' ? 'تنزيل الملفات' : 'Download Files'}</span></button>
                  </div>
                )}

                {activeTab === 'polygon-converter' && (
                  <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="p-8 bg-[#0b2d3d]/40 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-4"><Shapes className="w-16 h-16 text-accent mx-auto" /><h2 className="text-white font-black text-xl">{lang === 'ar' ? 'محول المضلعات' : 'Polygon Converter'}</h2><p className="text-[10px] text-white/50 leading-relaxed font-bold uppercase">{lang === 'ar' ? 'تحويل الخطوط إلى مساحات' : 'Convert lines to areas'}</p></div>
                      <FileUploadZone id="poly-up" />
                      {activeFile && (<div className="space-y-4 animate-in slide-in-from-bottom"><button onClick={() => { setLoading(true); setStatusMessage("جاري المعالجة..."); setTimeout(() => { const poly = globalPoints.map(p => p.path && p.path.length >= 3 ? {...p, type: 'Polygon' as const, path: [...p.path, p.path[0]]} : p); setGlobalPoints(poly); setLoading(false); setStatusMessage("تم التحويل!"); setTimeout(() => setStatusMessage(''), 2000); }, 1000); }} className="w-full bg-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all"><Scissors className="w-5 h-5 text-accent" />{lang === 'ar' ? 'تحويل الخطوط لمضلعات' : 'Lines to Polygons'}</button><button onClick={() => { const all: {x:number, y:number}[] = []; globalPoints.forEach(p => p.path ? p.path.forEach(pt => all.push({x:pt.x, y:pt.y})) : all.push({x:p.x, y:p.y})); const hull = calculateConvexHull(all); const bound: GeoPoint = { id: 'Boundary', x: hull[0].x, y: hull[0].y, type: 'Polygon', path: hull, color: '#ffffff', layer: 'Boundary' }; setGlobalPoints([bound]); setDataId(`boundary-gen-${Date.now()}`); }} className="w-full bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl"><BoxSelect className="w-5 h-5" />{lang === 'ar' ? 'إنشاء مضلع شامل (Boundary)' : 'Create Convex Boundary'}</button></div>)}
                  </div>
                )}
           </div>

           <div className="p-8 border-t border-white/5 bg-black/10 shrink-0"><div className="space-y-2"><div className="flex items-center gap-2 text-white/40 group"><Mail className="w-3 h-3 group-hover:text-accent transition-colors" /><span className="text-[10px] font-bold">{t.contactDev}:</span><a href="mailto:oosman@nwc.com.sa" className="text-[10px] font-black text-accent hover:underline">oosman@nwc.com.sa</a></div><p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{t.developedBy}</p></div></div>
      </aside>

      <main className="flex-1 relative bg-[#0d1b24]">
         <MapPreview 
            points={displayPoints} 
            lang={lang} 
            dataId={dataId}
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
      </main>
    </div>
  );
};

export default App;
