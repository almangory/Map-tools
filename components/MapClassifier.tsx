import React, { useMemo, useState } from 'react';
import {
  CircleDot,
  CloudDownload,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderKanban,
  FolderSearch,
  FolderTree,
  Layers,
  MapPin,
  Palette,
  PenTool,
  RotateCcw,
  Settings2,
  Sliders,
  Square,
  Table2,
  Zap,
  Archive,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { GeoPoint, KmlExportOptions, ParsedFile } from '../types';
import { classifyAssetsToZones, ClassifiedAsset } from '../services/turfService';
import {
  parseExcel,
  parseDXF,
  parseKMZ,
  fetchNetworkFile,
  extractAllPointAttributes,
  parseDescriptionToAttributes,
  stripHtml
} from '../services/parserService';
import { identifyPotentialCRS, transformPoints } from '../services/crs';
import { downloadKMZ, downloadKMZGroupedZip } from '../services/kmlService';
import { downloadDXF } from '../services/dxfExportService';
import { downloadDataPDF } from '../services/pdfExportService';
import { downloadShapefile } from '../services/shapefileExportService';
import { COMMON_EPSG } from '../constants';
import * as XLSX from 'xlsx';

interface Props {
  lang: 'ar' | 'en';
  refZones?: GeoPoint[];
  setRefPolygons?: (zones: GeoPoint[]) => void;
  targetAssets: GeoPoint[];
  setTargetAssets: (assets: GeoPoint[]) => void;
  classifiedResults?: ClassifiedAsset[];
  setClassifiedResults?: (results: ClassifiedAsset[]) => void;
  showZonesOnMap?: boolean;
  setShowZonesOnMap?: (show: boolean) => void;
  onClearSection?: () => void;
  setDataId?: (id: string) => void;
  runWithLoading?: (msg: string, task: () => void | Promise<void>) => Promise<void>;
  setGlobalLoading?: (loading: boolean) => void;
  setGlobalProgress?: (percent: number | null) => void;
  setGlobalStatus?: (status: string) => void;
}

type KmzGroupOption = 'source_folders' | 'color' | 'name' | 'column' | 'none';

export const MapClassifier = ({
  lang,
  refZones: propRefZones,
  setRefPolygons,
  targetAssets,
  setTargetAssets,
  classifiedResults: propClassifiedResults,
  setClassifiedResults: setPropClassifiedResults,
  showZonesOnMap: propShowZonesOnMap,
  setShowZonesOnMap: setPropShowZonesOnMap,
  onClearSection,
  setDataId,
  runWithLoading,
  setGlobalLoading,
  setGlobalProgress,
  setGlobalStatus
}: Props) => {
  // Controlled-or-local state so the section works completely independently from other tabs
  const [localRefZones, setLocalRefZones] = useState<GeoPoint[]>([]);
  const [localTargetAssets, setLocalTargetAssets] = useState<GeoPoint[]>([]);
  const [localClassifiedResults, setLocalClassifiedResults] = useState<ClassifiedAsset[]>([]);
  const [localShowZonesOnMap, setLocalShowZonesOnMap] = useState<boolean>(true);

  const refZones = propRefZones !== undefined ? propRefZones : localRefZones;
  const setRefZones = (zones: GeoPoint[]) => {
    setLocalRefZones(zones);
    if (setRefPolygons) setRefPolygons(zones);
  };

  const activeTargetAssets = targetAssets.length > 0 ? targetAssets : localTargetAssets;
  const updateTargetAssets = (assets: GeoPoint[]) => {
    setLocalTargetAssets(assets);
    setTargetAssets(assets);
  };

  const classifiedResults =
    propClassifiedResults !== undefined ? propClassifiedResults : localClassifiedResults;
  const setClassifiedResults = (results: ClassifiedAsset[]) => {
    setLocalClassifiedResults(results);
    if (setPropClassifiedResults) setPropClassifiedResults(results);
  };

  const showZonesOnMap =
    propShowZonesOnMap !== undefined ? propShowZonesOnMap : localShowZonesOnMap;
  const setShowZonesOnMap = (show: boolean) => {
    setLocalShowZonesOnMap(show);
    if (setPropShowZonesOnMap) setPropShowZonesOnMap(show);
  };

  const [loading, setLoading] = useState(false);
  const [zonesStatus, setZonesStatus] = useState<string>('');
  const [zonesUrl, setZonesUrl] = useState<string>('');
  const [assetsStatus, setAssetsStatus] = useState<string>('');
  const [layer1Headers, setLayer1Headers] = useState<string[]>([]);
  const [assetsHeaders, setAssetsHeaders] = useState<string[]>([]);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // خصائص مستقلة تماماً لقسم مصنف الخرائط عن باقي الأقسام
  const [copyColors, setCopyColors] = useState<boolean>(true);
  const [copyAttributes, setCopyAttributes] = useState<boolean>(true);
  const [copyFolders, setCopyFolders] = useState<boolean>(true);
  const [unclassifiedFolder, setUnclassifiedFolder] = useState<string>('غير مصنف');

  // خصائص تصدير KMZ المستقلة لهذا القسم
  const [kmzGroupOption, setKmzGroupOption] = useState<KmzGroupOption>('source_folders');
  const [selectedGroupColumn, setSelectedGroupColumn] = useState<string>('');
  const [localOptimizeMyMaps, setLocalOptimizeMyMaps] = useState<boolean>(false);
  const [localLineWidth, setLocalLineWidth] = useState<number>(3);

  const notify = (type: 'success' | 'error' | 'info', text: string) => {
    setBannerNotice({ type, text });
    if (setGlobalStatus) setGlobalStatus(text);
  };

  // رؤوس الأعمدة المدمجة من الطبقة الأولى والطبقة الثانية بعد التصنيف
  const mergedExportHeaders = useMemo(() => {
    const keySet = new Set<string>();
    assetsHeaders.forEach((h) => h && keySet.add(h));
    layer1Headers.forEach((h) => h && keySet.add(h));
    classifiedResults.forEach((r) => {
      if (r.attributes) {
        Object.keys(r.attributes).forEach((k) => k && keySet.add(k));
      }
    });
    return Array.from(keySet);
  }, [assetsHeaders, layer1Headers, classifiedResults]);

  // نقاط التصدير النهائية بالمحافظة على مجلدات وألوان وبيانات الطبقة الأولى كما هي
  const exportPoints: GeoPoint[] = useMemo(() => {
    return classifiedResults.map((r) => ({
      ...r,
      layer: copyFolders ? (r.layer || r.district) : r.layer,
      folderPath: copyFolders ? r.folderPath : r.folderPath,
      name: r.name && String(r.name).trim() !== '' ? String(r.name) : String(r.id)
    }));
  }, [classifiedResults, copyFolders]);

  // ملخص إحصائي للطبقة الأولى المرفوعة
  const layer1Summary = useMemo(() => {
    const folders = new Set<string>();
    const colors = new Set<string>();
    refZones.forEach((z) => {
      const f = z.folderPath && z.folderPath.length > 0 ? z.folderPath.join(' / ') : z.layer || '';
      if (f) folders.add(f);
      const c = z.color || (z as any).originalColor;
      if (c) colors.add(String(c).toUpperCase());
    });
    return {
      polygonCount: refZones.length,
      folderCount: folders.size,
      colorList: Array.from(colors).slice(0, 12)
    };
  }, [refZones]);

  // ملخص نتائج التصنيف لكل مجلد/منطقة من الطبقة الأولى
  const classificationSummary = useMemo(() => {
    let matchedCount = 0;
    let unclassifiedCount = 0;
    const byFolder = new Map<
      string,
      { folderLabel: string; color?: string; count: number; attrCount: number; isMatched: boolean }
    >();

    classifiedResults.forEach((r) => {
      if (r.isClassified) matchedCount++;
      else unclassifiedCount++;

      const folderLabel =
        r.folderPath && r.folderPath.length > 0
          ? r.folderPath.join(' / ')
          : r.district || unclassifiedFolder;

      const existing = byFolder.get(folderLabel);
      if (existing) {
        existing.count += 1;
        if (!existing.color && (r.matchedZoneColor || r.color)) {
          existing.color = r.matchedZoneColor || r.color;
        }
        if ((r.matchedZoneAttributesCount || 0) > existing.attrCount) {
          existing.attrCount = r.matchedZoneAttributesCount || 0;
        }
      } else {
        byFolder.set(folderLabel, {
          folderLabel,
          color: r.matchedZoneColor || r.color,
          count: 1,
          attrCount: r.matchedZoneAttributesCount || Object.keys(r.attributes || {}).length,
          isMatched: Boolean(r.isClassified)
        });
      }
    });

    return {
      total: classifiedResults.length,
      matchedCount,
      unclassifiedCount,
      groups: Array.from(byFolder.values()).sort((a, b) => b.count - a.count)
    };
  }, [classifiedResults, unclassifiedFolder]);

  const processZonesResult = (result: ParsedFile, fName: string) => {
    let pts: GeoPoint[] = (result.data || []) as GeoPoint[];

    if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) {
      const potentialCRS = identifyPotentialCRS(pts);
      if (potentialCRS) {
        const def = COMMON_EPSG.find((e) => e.code === potentialCRS)?.def || potentialCRS;
        pts = transformPoints(pts, def);
      }
    } else if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
      setZonesStatus(lang === 'ar' ? 'صيغة غير مدعومة للمناطق المرجعية (الطبقة الأولى).' : 'Unsupported format for reference zones.');
      setLoading(false);
      return;
    }

    const polygons = pts.filter((p) => p.type === 'Polygon' || p.type === 'LineString');
    const finalZones: GeoPoint[] = polygons.map((p) => {
      if (p.type === 'LineString') {
        return { ...p, type: 'Polygon' as const };
      }
      return p;
    });

    // استخراج جميع رؤوس بيانات الطبقة الأولى
    const l1KeySet = new Set<string>();
    if (result.headers) {
      result.headers.forEach((h) => h && l1KeySet.add(h));
    }
    finalZones.forEach((z) => {
      const extracted = extractAllPointAttributes(z);
      Object.keys(extracted).forEach((k) => k && l1KeySet.add(k));
    });
    setLayer1Headers(Array.from(l1KeySet));

    setRefZones(finalZones);
    setClassifiedResults([]);
    if (setDataId) setDataId(`classifier-ref-${Date.now()}`);

    const msg =
      lang === 'ar'
        ? `تم تحميل الطبقة الأولى: ${finalZones.length} مضلع`
        : `Loaded Layer 1: ${finalZones.length} polygons`;
    setZonesStatus(msg);
    notify('info', msg);
  };

  const handleFetchZonesUrl = async () => {
    if (!zonesUrl) return;
    setLoading(true);
    setZonesStatus(lang === 'ar' ? 'جاري جلب الطبقة الأولى من الرابط...' : 'Fetching Layer 1 from URL...');

    try {
      const result = await fetchNetworkFile(zonesUrl);
      processZonesResult(result, String(result.filename || '').toLowerCase());
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || (lang === 'ar' ? 'حدث خطأ أثناء الجلب' : 'Error fetching file');
      setZonesStatus(errMsg);
      notify('error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleZonesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    e.target.value = '';
    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) {
      setGlobalStatus(
        lang === 'ar'
          ? `جاري قراءة الطبقة الأولى (المصدر) ${selectedFile.name}...`
          : `Reading Layer 1 (Source) ${selectedFile.name}...`
      );
    }
    if (setGlobalProgress) setGlobalProgress(10);
    setZonesStatus(lang === 'ar' ? 'جاري قراءة الطبقة الأولى...' : 'Reading Layer 1...');

    await new Promise((r) => setTimeout(r, 100));

    try {
      const fName = String(selectedFile.name || '').toLowerCase();
      const onProg = (p: number) => {
        if (setGlobalProgress) setGlobalProgress(p);
      };
      let result: ParsedFile;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile, onProg);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile, onProg);
      else if (
        fName.endsWith('.kmz') ||
        fName.endsWith('.kml') ||
        fName.endsWith('.zip') ||
        fName.endsWith('.gdb') ||
        fName.endsWith('.shp')
      ) {
        result = await parseKMZ(selectedFile, onProg);
      } else {
        throw new Error(lang === 'ar' ? 'صيغة الملف غير مدعومة' : 'Unsupported file type');
      }

      processZonesResult(result, fName);
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || (lang === 'ar' ? 'حدث خطأ أثناء قراءة الطبقة الأولى' : 'Error reading Layer 1');
      setZonesStatus(errMsg);
      notify('error', errMsg);
    } finally {
      setLoading(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
    }
  };

  const handleAssetsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    e.target.value = '';
    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) {
      setGlobalStatus(
        lang === 'ar'
          ? `جاري قراءة الطبقة الثانية (المستهدفة) ${selectedFile.name}...`
          : `Reading Layer 2 (Target) ${selectedFile.name}...`
      );
    }
    if (setGlobalProgress) setGlobalProgress(10);
    setAssetsStatus(lang === 'ar' ? 'جاري قراءة الطبقة الثانية...' : 'Reading Layer 2...');

    await new Promise((r) => setTimeout(r, 100));

    try {
      const fName = String(selectedFile.name || '').toLowerCase();
      const onProg = (p: number) => {
        if (setGlobalProgress) setGlobalProgress(p);
      };
      let result: ParsedFile;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile, onProg);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile, onProg);
      else if (
        fName.endsWith('.kmz') ||
        fName.endsWith('.kml') ||
        fName.endsWith('.zip') ||
        fName.endsWith('.gdb') ||
        fName.endsWith('.shp')
      ) {
        result = await parseKMZ(selectedFile, onProg);
      } else {
        throw new Error(lang === 'ar' ? 'صيغة الملف غير مدعومة' : 'Unsupported file type');
      }

      let pts: GeoPoint[] = [];
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
        const rows = (result.data || []) as any[][];
        const headers = (result.headers || []) as string[];
        const mapping = (result.suggestedMapping || {}) as any;

        if (!mapping.xColumn || !mapping.yColumn) {
          const msg =
            lang === 'ar'
              ? 'تعذر العثور على أعمدة الإحداثيات تلقائياً'
              : 'Could not automatically find coordinate columns';
          setAssetsStatus(msg);
          notify('error', msg);
          setLoading(false);
          if (setGlobalLoading) setGlobalLoading(false);
          return;
        }

        const xIdx = headers.indexOf(mapping.xColumn);
        const yIdx = headers.indexOf(mapping.yColumn);
        const idIdx = mapping.idColumn ? headers.indexOf(mapping.idColumn) : -1;

        setAssetsHeaders(headers);
        pts = rows
          .map((r, i) => {
            const attrs: Record<string, string> = {};
            headers.forEach((h, hIdx) => {
              if (h && r[hIdx] !== undefined && r[hIdx] !== null && String(r[hIdx]).trim() !== '') {
                attrs[h] = String(r[hIdx]).trim();
              }
            });
            return {
              id: idIdx !== -1 && r[idIdx] ? String(r[idIdx]) : `Asset_${i + 1}`,
              x: parseFloat(r[xIdx]),
              y: parseFloat(r[yIdx]),
              type: 'Point' as const,
              layer: 'Excel Import',
              attributes: attrs,
              originalRow: r
            } as GeoPoint;
          })
          .filter((p) => !isNaN(p.x) && !isNaN(p.y));

        const potentialCRS = identifyPotentialCRS(pts);
        if (potentialCRS) {
          const def = COMMON_EPSG.find((c) => c.code === potentialCRS)?.def || potentialCRS;
          pts = transformPoints(pts, def);
        }
      } else {
        pts = (result.data || []) as GeoPoint[];
        if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb') || fName.endsWith('.shp')) {
          const potentialCRS = identifyPotentialCRS(pts);
          if (potentialCRS) {
            const def = COMMON_EPSG.find((c) => c.code === potentialCRS)?.def || potentialCRS;
            pts = transformPoints(pts, def);
          }
        }
        const attrKeys = new Set<string>();
        pts.forEach((p) => {
          const extracted = extractAllPointAttributes(p);
          Object.keys(extracted).forEach((k) => k && attrKeys.add(k));
        });
        setAssetsHeaders(Array.from(attrKeys));
      }

      updateTargetAssets(pts);
      setClassifiedResults([]);
      if (setDataId) setDataId(`classifier-target-${Date.now()}`);

      const msg =
        lang === 'ar'
          ? `تم تحميل الطبقة الثانية: ${pts.length} عنصر`
          : `Loaded Layer 2: ${pts.length} features`;
      setAssetsStatus(msg);
      notify('info', msg);
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || (lang === 'ar' ? 'حدث خطأ أثناء قراءة الطبقة الثانية' : 'Error reading Layer 2');
      setAssetsStatus(errMsg);
      notify('error', errMsg);
    } finally {
      setLoading(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
    }
  };

  const handleWrapper = (msg: string, task: () => void | Promise<void>) => {
    if (runWithLoading) {
      runWithLoading(msg, task);
    } else {
      if (setGlobalLoading) setGlobalLoading(true);
      if (setGlobalStatus) setGlobalStatus(msg);
      if (setGlobalProgress) setGlobalProgress(25);
      setTimeout(async () => {
        try {
          await task();
          if (setGlobalProgress) setGlobalProgress(100);
        } catch (e: any) {
          console.error(e);
          notify('error', e?.message || (lang === 'ar' ? 'حدث خطأ غير متوقع' : 'Unexpected error'));
        } finally {
          if (setGlobalLoading) setGlobalLoading(false);
          if (setGlobalProgress) setGlobalProgress(null);
        }
      }, 100);
    }
  };

  const handleStartClassification = () => {
    if (refZones.length === 0) {
      notify('error', lang === 'ar' ? 'يرجى رفع ملف الطبقة الأولى (المصدر) أولاً' : 'Please upload Layer 1 (Reference Zones) first');
      return;
    }
    if (activeTargetAssets.length === 0) {
      notify('error', lang === 'ar' ? 'يرجى رفع ملف الطبقة الثانية (نقاط/خطوط/مضلعات) أولاً' : 'Please upload Layer 2 (Target Assets) first');
      return;
    }

    const task = async () => {
      const results = classifyAssetsToZones(activeTargetAssets, refZones, {
        copyColors,
        copyAttributes,
        copyFolders,
        layer1Headers,
        layer2Headers: assetsHeaders,
        unclassifiedFolder: unclassifiedFolder.trim() || 'غير مصنف'
      });

      setClassifiedResults(results);
      updateTargetAssets(results);
      if (setDataId) setDataId(`classifier-colored-${Date.now()}`);

      const matched = results.filter((r) => r.isClassified).length;
      notify(
        'success',
        lang === 'ar'
          ? `اكتمل التصنيف: ${matched} من أصل ${results.length} عنصر طُبقت عليها ألوان وبيانات ومجلدات الطبقة الأولى.`
          : `Classification completed: ${matched} of ${results.length} features updated from Layer 1.`
      );
    };

    handleWrapper(
      lang === 'ar'
        ? 'جاري تصنيف الطبقة الثانية وتطبيق ألوان وبيانات ومجلدات الطبقة الأولى...'
        : 'Classifying Layer 2 and copying Layer 1 colors, attributes, and folders...',
      task
    );
  };

  const handleResetSection = () => {
    setLocalRefZones([]);
    setLocalTargetAssets([]);
    setLocalClassifiedResults([]);
    setZonesStatus('');
    setZonesUrl('');
    setAssetsStatus('');
    setLayer1Headers([]);
    setAssetsHeaders([]);
    setBannerNotice(null);
    if (onClearSection) {
      onClearSection();
    } else {
      if (setRefPolygons) setRefPolygons([]);
      setTargetAssets([]);
      if (setPropClassifiedResults) setPropClassifiedResults([]);
      if (setDataId) setDataId(`classifier-reset-${Date.now()}`);
    }
  };

  const buildKmzPayload = (): { points: GeoPoint[]; options: KmlExportOptions } => {
    let kmzPoints = exportPoints;
    const baseOptions: KmlExportOptions = {
      mode: 'none',
      optimizeForMyMaps: localOptimizeMyMaps,
      lineStyle: { width: localLineWidth },
      includeFolderLengths: true
    };

    if (kmzGroupOption === 'source_folders') {
      return {
        points: kmzPoints,
        options: { ...baseOptions, mode: 'attribute', groupByAttribute: 'layer' }
      };
    }
    if (kmzGroupOption === 'name') {
      kmzPoints = exportPoints.map((p, i) => ({
        ...p,
        folderPath: undefined,
        layer: classifiedResults[i]?.district || p.layer || unclassifiedFolder
      }));
      return {
        points: kmzPoints,
        options: { ...baseOptions, mode: 'attribute', groupByAttribute: 'layer' }
      };
    }
    if (kmzGroupOption === 'color') {
      return {
        points: kmzPoints,
        options: { ...baseOptions, mode: 'attribute', groupByAttribute: 'color' }
      };
    }
    if (kmzGroupOption === 'column' && selectedGroupColumn) {
      return {
        points: kmzPoints,
        options: { ...baseOptions, mode: 'attribute', groupByColumn: selectedGroupColumn }
      };
    }

    // 'none': إزالة هيكل المجلدات حتى يكون التصدير مسطحاً بدون مجلدات
    kmzPoints = exportPoints.map((p) => ({
      ...p,
      folderPath: undefined,
      layer: 'Default'
    }));
    return { points: kmzPoints, options: baseOptions };
  };

  const downloadAssetsKMZ = async () => {
    if (classifiedResults.length === 0) return;
    const { points, options } = buildKmzPayload();
    try {
      await downloadKMZ(
        points,
        'Classified_Layer2_From_Layer1',
        options,
        mergedExportHeaders.length > 0 ? mergedExportHeaders : undefined
      );
    } catch (e: any) {
      console.error(e);
      notify('error', e?.message || (lang === 'ar' ? 'حدث خطأ أثناء توليد ملف KMZ' : 'Error generating KMZ'));
    }
  };

  const downloadAssetsGroupedZip = async () => {
    if (classifiedResults.length === 0) return;
    const { points, options } = buildKmzPayload();
    const zipOptions: KmlExportOptions =
      kmzGroupOption === 'none'
        ? { ...options, mode: 'attribute', groupByAttribute: 'layer' }
        : options;
    try {
      await downloadKMZGroupedZip(
        kmzGroupOption === 'none' ? exportPoints : points,
        'Classified_Layer2_Folders',
        zipOptions,
        mergedExportHeaders.length > 0 ? mergedExportHeaders : undefined
      );
    } catch (e: any) {
      console.error(e);
      notify('error', e?.message || (lang === 'ar' ? 'حدث خطأ أثناء تصدير المجلدات المضغوطة' : 'Error generating KMZ ZIP'));
    }
  };

  const downloadMergedExcel = () => {
    if (classifiedResults.length === 0) return;
    const exportData = classifiedResults.map((r) => {
      const baseRow: Record<string, any> = {
        ID: r.id,
        Name: r.name || r.id,
        Folder_Hierarchy: r.folderPath && r.folderPath.length > 0 ? r.folderPath.join(' / ') : r.layer || '',
        District_Zone: r.district,
        Layer1_Color: r.color || '',
        Type: r.type,
        Longitude: r.x,
        Latitude: r.y
      };

      const extracted = extractAllPointAttributes(r);
      Object.entries(extracted).forEach(([k, v]) => {
        if (baseRow[k] === undefined) {
          baseRow[k] = v;
        }
      });

      if (r.description) {
        const parsed = parseDescriptionToAttributes(r.description);
        if (Object.keys(parsed).length === 0) {
          baseRow['Description'] = stripHtml(r.description);
        }
      }

      const startX = r.path && r.path.length > 0 ? r.path[0].x : r.x;
      const startY = r.path && r.path.length > 0 ? r.path[0].y : r.y;
      const endX = r.path && r.path.length > 0 ? r.path[r.path.length - 1].x : r.x;
      const endY = r.path && r.path.length > 0 ? r.path[r.path.length - 1].y : r.y;

      baseRow[lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X'] = startX;
      baseRow[lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y'] = startY;
      baseRow[lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X'] = endX;
      baseRow[lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y'] = endY;
      return baseRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Classified');
    XLSX.writeFile(wb, 'Merged_Classified_Layer2.xlsx');
  };

  const downloadRawSourceExcel = () => {
    if (activeTargetAssets.length === 0) {
      notify('error', lang === 'ar' ? 'لا توجد بيانات لتصديرها' : 'No data to export');
      return;
    }

    const exportData = activeTargetAssets.map((pt, idx) => {
      const baseRow: Record<string, any> = {};

      if (assetsHeaders.length > 0 && pt.originalRow) {
        assetsHeaders.forEach((h, hIdx) => {
          baseRow[h] = pt.originalRow![hIdx] ?? '';
        });
      } else {
        baseRow['#'] = idx + 1;
        baseRow['ID'] = pt.id || `Asset_${idx + 1}`;
        if (pt.name) baseRow['Name'] = pt.name;
        baseRow['Type'] = pt.type || 'Point';
        baseRow['Longitude_X'] = pt.x !== undefined ? pt.x : '';
        baseRow['Latitude_Y'] = pt.y !== undefined ? pt.y : '';
        if (pt.layer) baseRow['Layer'] = pt.layer;
      }

      const extracted = extractAllPointAttributes(pt);
      Object.entries(extracted).forEach(([k, v]) => {
        if (baseRow[k] === undefined) {
          baseRow[k] = v;
        }
      });

      if (pt.description) {
        const parsed = parseDescriptionToAttributes(pt.description);
        if (Object.keys(parsed).length === 0) {
          baseRow['Description'] = stripHtml(pt.description);
        }
      }

      if (pt.type === 'LineString' && pt.path && pt.path.length >= 2) {
        baseRow[lang === 'ar' ? 'إحداثي البداية (Y)' : 'Start Y'] = pt.path[0].y;
        baseRow[lang === 'ar' ? 'إحداثي البداية (X)' : 'Start X'] = pt.path[0].x;
        baseRow[lang === 'ar' ? 'إحداثي النهاية (Y)' : 'End Y'] = pt.path[pt.path.length - 1].y;
        baseRow[lang === 'ar' ? 'إحداثي النهاية (X)' : 'End X'] = pt.path[pt.path.length - 1].x;
      }
      return baseRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Layer2_Data');
    XLSX.writeFile(wb, 'Classifier_Layer2_Data.xlsx');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="p-6 bg-[#0b2d3d]/40 rounded-[2.5rem] border border-white/10 shadow-2xl text-center space-y-3 relative">
        <div className="w-16 h-16 mx-auto rounded-full border-[5px] border-accent flex items-center justify-center">
          <CircleDot className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-white font-black text-xl">
          {lang === 'ar' ? 'مصنف الخرائط (قسم مستقل)' : 'Map Classifier (Independent)'}
        </h2>
        <p className="text-[11px] text-white/60 leading-relaxed font-bold">
          {lang === 'ar'
            ? 'تصنيف الطبقة الثانية على الطبقة الأولى (المصدر): نقل الألوان + كتابة جميع البيانات + التصنيف بنفس المجلدات'
            : 'Classify Layer 2 onto Layer 1 (Source): inherit colors, write all Layer 1 attributes, and keep Layer 1 folders'}
        </p>
        {(refZones.length > 0 || activeTargetAssets.length > 0 || classifiedResults.length > 0) && (
          <button
            type="button"
            onClick={handleResetSection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-300 border border-white/10 text-[11px] font-bold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تصفير قسم المصنف فقط' : 'Reset Classifier Only'}</span>
          </button>
        )}
      </div>

      {/* Notice Banner */}
      {bannerNotice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            bannerNotice.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              : bannerNotice.type === 'error'
              ? 'bg-red-500/15 border-red-500/40 text-red-200'
              : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{bannerNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            className="text-white/50 hover:text-white text-[10px] px-2 py-0.5 rounded bg-white/5"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {/* Layer 1: Source Reference Polygons */}
        <div className="bg-[#0b2d3d]/30 border border-white/10 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-accent/15 text-accent text-[10px] font-black">
              {lang === 'ar' ? 'الخطوة 1' : 'Step 1'}
            </span>
            <h3 className="text-white/80 font-black text-xs flex items-center gap-2">
              {lang === 'ar' ? 'الطبقة الأولى (المصدر / المضلعات المرجعية)' : 'Layer 1 (Source Reference Polygons)'}
              <Square className="w-4 h-4 text-accent" />
            </h3>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleFetchZonesUrl}
              disabled={loading || !zonesUrl}
              className="bg-accent text-[#0b2d3d] px-4 py-2.5 rounded-2xl font-black text-xs hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {lang === 'ar' ? 'جلب' : 'Fetch'}
            </button>
            <input
              type="text"
              placeholder={lang === 'ar' ? 'أو ضع رابط ملف KML / KMZ للطبقة الأولى...' : 'Or paste Layer 1 KML / KMZ URL...'}
              value={zonesUrl}
              onChange={(e) => setZonesUrl(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-2.5 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
            />
          </div>

          <div className="relative">
            <input
              type="file"
              accept=".kml,.kmz,.dxf,.gdb,.zip,.shp"
              onChange={handleZonesUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-6 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
              <FileUp className="w-6 h-6 text-white/40 mb-2" />
              <span className="text-white/80 font-bold text-xs">
                {loading
                  ? lang === 'ar'
                    ? 'جاري المعالجة...'
                    : 'Processing...'
                  : lang === 'ar'
                  ? 'اختر ملف الطبقة الأولى (KMZ, KML, SHP, DXF, GDB)'
                  : 'Select Layer 1 File (KMZ, KML, SHP, DXF, GDB)'}
              </span>
            </div>
          </div>

          {zonesStatus && <p className="text-xs text-accent font-bold text-center">{zonesStatus}</p>}

          {refZones.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-white/80">
                <span>
                  {lang === 'ar'
                    ? `المضلعات: ${layer1Summary.polygonCount} | المجلدات: ${layer1Summary.folderCount} | الأعمدة: ${layer1Headers.length}`
                    : `Polygons: ${layer1Summary.polygonCount} | Folders: ${layer1Summary.folderCount} | Fields: ${layer1Headers.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowZonesOnMap(!showZonesOnMap)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black border transition-colors ${
                    showZonesOnMap
                      ? 'bg-accent/20 border-accent/40 text-accent'
                      : 'bg-white/5 border-white/10 text-white/60'
                  }`}
                >
                  {showZonesOnMap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>
                    {showZonesOnMap
                      ? lang === 'ar'
                        ? 'ظاهرة على الخريطة'
                        : 'Visible on Map'
                      : lang === 'ar'
                      ? 'مخفية من الخريطة'
                      : 'Hidden on Map'}
                  </span>
                </button>
              </div>
              {layer1Summary.colorList.length > 0 && (
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <span className="text-[10px] text-white/50 font-bold">
                    {lang === 'ar' ? 'ألوان الطبقة الأولى:' : 'Layer 1 Colors:'}
                  </span>
                  {layer1Summary.colorList.map((c) => (
                    <span
                      key={c}
                      title={c}
                      className="w-4 h-4 rounded-md border border-white/30 inline-block"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Layer 2: Target Assets */}
        <div className="bg-[#0b2d3d]/30 border border-white/10 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-accent/15 text-accent text-[10px] font-black">
              {lang === 'ar' ? 'الخطوة 2' : 'Step 2'}
            </span>
            <h3 className="text-white/80 font-black text-xs flex items-center gap-2">
              {lang === 'ar' ? 'الطبقة الثانية (الأصول المستهدفة للتصنيف)' : 'Layer 2 (Target Features to Classify)'}
              <MapPin className="w-4 h-4 text-accent" />
            </h3>
          </div>

          <div className="relative">
            <input
              type="file"
              accept=".kml,.kmz,.dxf,.gdb,.zip,.shp,.xlsx,.csv"
              onChange={handleAssetsUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-6 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
              <FileUp className="w-6 h-6 text-white/40 mb-2" />
              <span className="text-white/80 font-bold text-xs">
                {loading
                  ? lang === 'ar'
                    ? 'جاري المعالجة...'
                    : 'Processing...'
                  : lang === 'ar'
                  ? 'ارفع ملف الطبقة الثانية (KMZ, KML, SHP, DXF, Excel)'
                  : 'Upload Layer 2 File (KMZ, KML, SHP, DXF, Excel)'}
              </span>
            </div>
          </div>

          {assetsStatus && <p className="text-xs text-accent font-bold text-center">{assetsStatus}</p>}

          {activeTargetAssets.length > 0 && (
            <button
              type="button"
              onClick={downloadRawSourceExcel}
              className="w-full bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 font-bold py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 text-xs transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>
                {lang === 'ar' ? 'تصدير بيانات الطبقة الثانية الحالية (Excel)' : 'Export Layer 2 Data (Excel)'}
              </span>
            </button>
          )}
        </div>

        {/* Section-Specific Classification Properties (Isolated from all other sections) */}
        <div className="bg-[#0b2d3d]/50 border border-accent/25 p-5 rounded-3xl space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-accent/15 text-accent">
              {lang === 'ar' ? 'معزول عن باقي الأقسام' : 'Section-Isolated'}
            </span>
            <h3 className="text-white font-black text-xs flex items-center gap-2">
              {lang === 'ar' ? 'خصائص التصنيف ونقل البيانات للطبقة الثانية' : 'Layer 1 → Layer 2 Transfer Properties'}
              <Sliders className="w-4 h-4 text-accent" />
            </h3>
          </div>

          <div className="space-y-2 text-right">
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={copyColors}
                onChange={(e) => setCopyColors(e.target.checked)}
                className="w-4 h-4 accent-[#d6a536] cursor-pointer"
              />
              <span className="flex-1 text-xs font-bold text-white/90 flex items-center justify-end gap-2">
                {lang === 'ar' ? 'تلوين الطبقة الثانية بألوان الطبقة الأولى' : 'Color Layer 2 with Layer 1 colors'}
                <Palette className="w-4 h-4 text-amber-400" />
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={copyAttributes}
                onChange={(e) => setCopyAttributes(e.target.checked)}
                className="w-4 h-4 accent-[#d6a536] cursor-pointer"
              />
              <span className="flex-1 text-xs font-bold text-white/90 flex items-center justify-end gap-2">
                {lang === 'ar' ? 'كتابة جميع بيانات الطبقة الأولى على الطبقة الثانية' : 'Write all Layer 1 attributes onto Layer 2'}
                <Table2 className="w-4 h-4 text-emerald-400" />
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={copyFolders}
                onChange={(e) => setCopyFolders(e.target.checked)}
                className="w-4 h-4 accent-[#d6a536] cursor-pointer"
              />
              <span className="flex-1 text-xs font-bold text-white/90 flex items-center justify-end gap-2">
                {lang === 'ar' ? 'تصنيف الطبقة الثانية بنفس مجلدات الطبقة الأولى' : 'Classify Layer 2 in Layer 1 folders'}
                <FolderTree className="w-4 h-4 text-sky-400" />
              </span>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={unclassifiedFolder}
                onChange={(e) => setUnclassifiedFolder(e.target.value)}
                className="w-40 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs font-bold text-right focus:outline-none focus:border-accent"
              />
              <span className="flex-1 text-[11px] font-bold text-white/60">
                {lang === 'ar' ? 'اسم مجلد العناصر خارج نطاق الطبقة الأولى:' : 'Unclassified fallback folder:'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleStartClassification}
          disabled={loading || refZones.length === 0 || activeTargetAssets.length === 0}
          className={`w-full font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all shadow-xl ${
            !loading && refZones.length > 0 && activeTargetAssets.length > 0
              ? 'bg-[#d6a536] text-[#0b2d3d] hover:bg-[#e5b545]'
              : 'bg-white/5 text-white/40 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          <Zap className="w-5 h-5" />
          <span>{lang === 'ar' ? 'بدء التصنيف وتطبيق خصائص الطبقة الأولى' : 'Run Classification & Apply Layer 1 Properties'}</span>
        </button>

        {/* Classification Summary & Independent Export Options */}
        {classifiedResults.length > 0 && (
          <div className="bg-[#0b2d3d]/80 border border-white/10 p-6 rounded-[2rem] space-y-5">
            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <div className="text-lg font-black text-white">{classificationSummary.total}</div>
                <div className="text-[10px] font-bold text-white/60">{lang === 'ar' ? 'الإجمالي' : 'Total'}</div>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3">
                <div className="text-lg font-black text-emerald-300">{classificationSummary.matchedCount}</div>
                <div className="text-[10px] font-bold text-emerald-200/80">{lang === 'ar' ? 'مصنف بالطبقة 1' : 'Matched'}</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3">
                <div className="text-lg font-black text-amber-300">{classificationSummary.unclassifiedCount}</div>
                <div className="text-[10px] font-bold text-amber-200/80">{lang === 'ar' ? 'خارج النطاق' : 'Unmatched'}</div>
              </div>
            </div>

            {/* Folder & Color Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-white/80">
                <button
                  type="button"
                  onClick={() => setShowZonesOnMap(!showZonesOnMap)}
                  className="text-[10px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-accent font-bold flex items-center gap-1"
                >
                  {showZonesOnMap ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>
                    {showZonesOnMap
                      ? lang === 'ar'
                        ? 'إخفاء الطبقة الأولى للمعاينة'
                        : 'Hide Layer 1'
                      : lang === 'ar'
                      ? 'إظهار الطبقة الأولى'
                      : 'Show Layer 1'}
                  </span>
                </button>
                <span className="flex items-center gap-1.5">
                  {lang === 'ar' ? 'توزيع المجلدات والألوان المنسوخة' : 'Inherited Folders & Colors'}
                  <FolderKanban className="w-4 h-4 text-accent" />
                </span>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {classificationSummary.groups.map((grp) => (
                  <div
                    key={grp.folderLabel}
                    className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-lg bg-accent/15 text-accent font-black">
                        {grp.count}
                      </span>
                      {grp.isMatched && (
                        <span className="text-[10px] text-emerald-300/80 font-bold">
                          +{grp.attrCount} {lang === 'ar' ? 'بيان' : 'attrs'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-white/90 font-bold truncate" title={grp.folderLabel}>
                        {grp.folderLabel}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0"
                        style={{ backgroundColor: grp.color || '#64748b' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Independent Export Options */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-end gap-2">
                <h3 className="text-white font-black text-sm">
                  {lang === 'ar' ? 'خيارات التصدير والمجلدات (خاصة بالمصنف فقط):' : 'Classifier Export Settings (Independent):'}
                </h3>
                <Settings2 className="w-4 h-4 text-accent" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={() => setKmzGroupOption('source_folders')}
                  className={`py-2.5 px-2 rounded-2xl font-bold text-[11px] transition-all ${
                    kmzGroupOption === 'source_folders'
                      ? 'bg-[#d6a536] text-[#0b2d3d]'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'ar' ? 'مجلدات الطبقة 1' : 'Layer 1 Folders'}
                </button>
                <button
                  type="button"
                  onClick={() => setKmzGroupOption('color')}
                  className={`py-2.5 px-2 rounded-2xl font-bold text-[11px] transition-all ${
                    kmzGroupOption === 'color' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'ar' ? 'باللون' : 'By Color'}
                </button>
                <button
                  type="button"
                  onClick={() => setKmzGroupOption('name')}
                  className={`py-2.5 px-2 rounded-2xl font-bold text-[11px] transition-all ${
                    kmzGroupOption === 'name' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'ar' ? 'باسم المنطقة' : 'By Zone'}
                </button>
                <button
                  type="button"
                  onClick={() => setKmzGroupOption('column')}
                  className={`py-2.5 px-2 rounded-2xl font-bold text-[11px] transition-all ${
                    kmzGroupOption === 'column' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'ar' ? 'بعمود بيانات' : 'By Column'}
                </button>
                <button
                  type="button"
                  onClick={() => setKmzGroupOption('none')}
                  className={`py-2.5 px-2 rounded-2xl font-bold text-[11px] transition-all ${
                    kmzGroupOption === 'none' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang === 'ar' ? 'بدون مجلدات' : 'No Folders'}
                </button>
              </div>

              {kmzGroupOption === 'column' && (
                <select
                  value={selectedGroupColumn}
                  onChange={(e) => setSelectedGroupColumn(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
                >
                  <option value="" className="text-black">
                    {lang === 'ar' ? 'اختر العمود للتجميع...' : 'Select column for grouping...'}
                  </option>
                  {mergedExportHeaders.map((h) => (
                    <option key={h} value={h} className="text-black">
                      {h}
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localOptimizeMyMaps}
                    onChange={(e) => setLocalOptimizeMyMaps(e.target.checked)}
                    className="w-4 h-4 accent-[#d6a536]"
                  />
                  <span className="text-[11px] font-bold text-white/80">
                    {lang === 'ar' ? 'تحسين التصدير لـ Google My Maps' : 'Optimize for Google My Maps'}
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/5 border border-white/10">
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={localLineWidth}
                    onChange={(e) => setLocalLineWidth(Number(e.target.value))}
                    className="w-24 accent-[#d6a536]"
                  />
                  <span className="text-[11px] font-bold text-white/80">
                    {lang === 'ar' ? `سمك الخطوط (${localLineWidth})` : `Line Width (${localLineWidth})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري تصدير ملف KMZ بالمجلدات والألوان والبيانات...' : 'Generating KMZ file...',
                    downloadAssetsKMZ
                  )
                }
                className="bg-blue-500/15 border border-blue-400/30 hover:bg-blue-500/25 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <CloudDownload className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[11px]">KMZ</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري تقسيم وتصدير المجلدات كملفات KMZ (ZIP)...' : 'Generating grouped KMZ ZIP...',
                    downloadAssetsGroupedZip
                  )
                }
                className="bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <Archive className="w-5 h-5 text-indigo-300 group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[10px]">
                  {lang === 'ar' ? 'KMZ مقسم (ZIP)' : 'Grouped KMZ (ZIP)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري تصدير Shapefile بالبيانات والألوان...' : 'Generating Shapefile...',
                    () => downloadShapefile(exportPoints, 'Classified_Layer2_From_Layer1')
                  )
                }
                className="bg-purple-500/15 border border-purple-400/30 hover:bg-purple-500/25 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <Layers className="w-5 h-5 text-purple-300 group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[11px]">Shapefile (.zip)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري تصدير ملف إكسل المدمج...' : 'Exporting merged Excel...',
                    downloadMergedExcel
                  )
                }
                className="bg-emerald-500/15 border border-emerald-400/30 hover:bg-emerald-500/25 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <FileSpreadsheet className="w-5 h-5 text-[#2ecc71] group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[11px]">
                  {lang === 'ar' ? 'إكسل مدمج' : 'Merged Excel'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري تصدير ملف DXF...' : 'Generating DXF file...',
                    () => downloadDXF(exportPoints, 'Classified_Layer2_From_Layer1')
                  )
                }
                className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <PenTool className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[11px]">DXF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleWrapper(
                    lang === 'ar' ? 'جاري توليد ملف PDF...' : 'Generating PDF file...',
                    () => downloadDataPDF(exportPoints, 'Classified_Layer2_From_Layer1', lang)
                  )
                }
                className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors group"
              >
                <FileText className="w-5 h-5 text-[#D32F2F] group-hover:scale-110 transition-transform" />
                <span className="text-white font-black text-[11px]">PDF</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
