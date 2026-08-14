import React, { useState, useMemo } from 'react';
import { 
  PenTool, FileSpreadsheet, PlusCircle, CheckCircle, Upload, Save, 
  XCircle, Download, DownloadCloud, FolderArchive, FileText, Globe, 
  Layers, MapPin, Sparkles, RefreshCw, Trash2, ArrowRight
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

interface Props {
  lang: 'ar' | 'en';
  globalPoints: GeoPoint[];
  setGlobalPoints: (points: GeoPoint[]) => void;
  setDataId: (id: string) => void;
  runWithLoading?: (msg: string, task: () => void | Promise<void>) => Promise<void>;
  setGlobalLoading?: (loading: boolean) => void;
  setGlobalProgress?: (percent: number | null) => void;
  setGlobalStatus?: (status: string) => void;
}

export const LineDrawerTab = ({ 
  lang, 
  globalPoints, 
  setGlobalPoints, 
  setDataId, 
  runWithLoading, 
  setGlobalLoading, 
  setGlobalProgress, 
  setGlobalStatus 
}: Props) => {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drawnLines, setDrawnLines] = useState<GeoPoint[]>([]);

  // Column mapping states
  const [startXCol, setStartXCol] = useState<string>('');
  const [startYCol, setStartYCol] = useState<string>('');
  const [endXCol, setEndXCol] = useState<string>('');
  const [endYCol, setEndYCol] = useState<string>('');
  const [idCol, setIdCol] = useState<string>('');
  const [layerCol, setLayerCol] = useState<string>('');
  const [colorCol, setColorCol] = useState<string>('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? `جاري قراءة ومعالجة الملف ${selectedFile.name}...` : `Reading and parsing file ${selectedFile.name}...`);
    if (setGlobalProgress) setGlobalProgress(15);

    await new Promise(r => setTimeout(r, 120));

    setError(null);
    setSuccess(null);
    setFile(null);

    try {
      const result = await parseExcel(selectedFile, (pct) => {
        if (setGlobalProgress) setGlobalProgress(pct);
      });
      setFile(result);
      
      // Auto-detect columns
      const headers = result.headers || [];
      const lowerHeaders = headers.map(h => String(h).toLowerCase());
      
      const findCol = (keywords: string[]) => {
        return headers.find((h, i) => keywords.some(kw => lowerHeaders[i].includes(kw))) || '';
      };

      setStartXCol(findCol(['startx', 'x1', 'lon1', 'شـرق1', 'شرق البداية', 'east1']));
      setStartYCol(findCol(['starty', 'y1', 'lat1', 'شمـال1', 'شمال البداية', 'north1']));
      setEndXCol(findCol(['endx', 'x2', 'lon2', 'شـرق2', 'شرق النهاية', 'east2']));
      setEndYCol(findCol(['endy', 'y2', 'lat2', 'شمـال2', 'شمال النهاية', 'north2']));
      setIdCol(findCol(['id', 'معرف', 'رقم']));
      setLayerCol(findCol(['layer', 'طبقة', 'type', 'نوع']));
      setColorCol(findCol(['color', 'colour', 'لون', 'اللون', 'كود_اللون', 'كود اللون', 'hex', 'الرقم_الهكس', 'color_code', 'colorcode', 'كود']));

    } catch (err: any) {
      setError(err.message);
    } finally {
      e.target.value = '';
      setLoading(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
    }
  };

  const generateLines = () => {
    if (!file) return;
    if (!startXCol || !startYCol || !endXCol || !endYCol) {
      setError(lang === 'ar' ? 'يجب تحديد أعمدة إحداثيات البداية والنهاية' : 'Start and end coordinate columns must be selected');
      return;
    }

    const task = async () => {
      setError(null);
      setSuccess(null);

      const headers = file.headers || [];
      const startXIdx = headers.indexOf(startXCol);
      const startYIdx = headers.indexOf(startYCol);
      const endXIdx = headers.indexOf(endXCol);
      const endYIdx = headers.indexOf(endYCol);
      const idIdx = idCol ? headers.indexOf(idCol) : -1;
      const layerIdx = layerCol ? headers.indexOf(layerCol) : -1;
      const colorIdx = colorCol ? headers.indexOf(colorCol) : -1;

      const newPoints: GeoPoint[] = [];

      file.data.forEach((row, i) => {
        const sx = parseFloat(row[startXIdx]);
        const sy = parseFloat(row[startYIdx]);
        const ex = parseFloat(row[endXIdx]);
        const ey = parseFloat(row[endYIdx]);

        if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) return;

        const path = [
          { x: sx, y: sy },
          { x: ex, y: ey }
        ];

        const id = idIdx >= 0 && row[idIdx] ? String(row[idIdx]) : `LINE_${i + 1}`;
        const layer = layerIdx >= 0 && row[layerIdx] ? String(row[layerIdx]) : 'Generated Lines';

        let color = '#3b82f6'; // Default blue color
        if (colorIdx >= 0 && row[colorIdx] !== undefined && row[colorIdx] !== null) {
          const rawColor = String(row[colorIdx]).trim();
          if (rawColor) {
            if (/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(rawColor)) {
              color = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
            } else {
              color = rawColor;
            }
          }
        }

        // Retain all original columns from the Excel file in the attributes object
        const attributes: Record<string, any> = {};
        headers.forEach((h, colIndex) => {
          if (h && row[colIndex] !== undefined && row[colIndex] !== null) {
            attributes[h] = row[colIndex];
          }
        });

        // Add explicit calculated & geometry properties
        const lengthMeters = calculatePathLength(path);
        attributes['StartX'] = sx;
        attributes['StartY'] = sy;
        attributes['EndX'] = ex;
        attributes['EndY'] = ey;
        attributes['Length_m'] = Number(lengthMeters.toFixed(2));
        attributes['ID'] = id;
        attributes['Layer'] = layer;
        attributes['Color'] = color;

        newPoints.push({
          id,
          x: sx,
          y: sy,
          type: 'LineString',
          path,
          layer,
          color,
          attributes,
          originalRow: row
        });
      });

      if (newPoints.length === 0) {
        throw new Error(lang === 'ar' ? 'لم يتم العثور على أي خطوط صالحة في الملف' : 'No valid lines found in the file');
      }

      setDrawnLines(newPoints);
      setGlobalPoints([...globalPoints, ...newPoints]);
      setDataId(`lines-${Date.now()}`);
      setSuccess(lang === 'ar' ? `تم رسم ${newPoints.length} خط بنجاح وإضافتها إلى الخريطة!` : `Successfully drew ${newPoints.length} lines and added to map!`);
    };

    if (runWithLoading) {
      runWithLoading(
        lang === 'ar' ? 'جاري تحويل الإحداثيات ورسم الخطوط/القطاعات على الخريطة...' : 'Converting coordinates and generating lines on map...',
        task
      );
    } else {
      setLoading(true);
      if (setGlobalLoading) setGlobalLoading(true);
      if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري تحويل الإحداثيات ورسم الخطوط/القطاعات...' : 'Converting coordinates and generating line segments...');
      if (setGlobalProgress) setGlobalProgress(30);
      setTimeout(async () => {
        try {
          await task();
          if (setGlobalProgress) setGlobalProgress(100);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
          if (setGlobalLoading) setGlobalLoading(false);
          if (setGlobalProgress) setGlobalProgress(null);
        }
      }, 100);
    }
  };

  // Determine points available for export
  const activeExportLines = useMemo(() => {
    if (drawnLines.length > 0) return drawnLines;
    return globalPoints.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  }, [drawnLines, globalPoints]);

  const totalLengthM = useMemo(() => {
    return activeExportLines.reduce((acc, p) => acc + (p.path ? calculatePathLength(p.path) : 0), 0);
  }, [activeExportLines]);

  const totalLayersCount = useMemo(() => {
    return new Set(activeExportLines.map(p => p.layer || 'Default')).size;
  }, [activeExportLines]);

  // Export handlers
  const handleExportExcel = () => {
    if (activeExportLines.length === 0) return;

    const workbook = XLSX.utils.book_new();
    const rows: any[] = [];

    activeExportLines.forEach((pt, index) => {
      const rowObj: Record<string, any> = {};

      // 1. Basic properties
      rowObj[lang === 'ar' ? 'المعرف (ID)' : 'ID'] = pt.id;
      rowObj[lang === 'ar' ? 'الطبقة (Layer)' : 'Layer'] = pt.layer || 'Lines';
      rowObj[lang === 'ar' ? 'كود اللون (Color)' : 'Color'] = pt.color || '#3b82f6';

      // 2. Start & End Coordinates
      const sx = pt.path && pt.path[0] ? pt.path[0].x : pt.x;
      const sy = pt.path && pt.path[0] ? pt.path[0].y : pt.y;
      const ex = pt.path && pt.path[1] ? pt.path[1].x : pt.x;
      const ey = pt.path && pt.path[1] ? pt.path[1].y : pt.y;

      rowObj[lang === 'ar' ? 'إحداثي X البداية (Start X / Lon)' : 'Start X (Lon)'] = sx;
      rowObj[lang === 'ar' ? 'إحداثي Y البداية (Start Y / Lat)' : 'Start Y (Lat)'] = sy;
      rowObj[lang === 'ar' ? 'إحداثي X النهاية (End X / Lon)' : 'End X (Lon)'] = ex;
      rowObj[lang === 'ar' ? 'إحداثي Y النهاية (End Y / Lat)' : 'End Y (Lat)'] = ey;

      // 3. Length in meters
      const lenMeters = pt.path ? calculatePathLength(pt.path) : 0;
      rowObj[lang === 'ar' ? 'الطول (متر)' : 'Length (m)'] = Number(lenMeters.toFixed(2));

      // 4. Retain all original Excel attributes from the file
      if (pt.attributes) {
        Object.entries(pt.attributes).forEach(([k, v]) => {
          if (!rowObj.hasOwnProperty(k) && k !== 'StartX' && k !== 'StartY' && k !== 'EndX' && k !== 'EndY' && k !== 'Length_m') {
            rowObj[k] = v;
          }
        });
      } else if (pt.originalRow && file?.headers) {
        file.headers.forEach((h, colIdx) => {
          if (!rowObj.hasOwnProperty(h)) {
            rowObj[h] = pt.originalRow[colIdx] ?? '';
          }
        });
      }

      // 5. Google Maps Link
      rowObj[lang === 'ar' ? 'رابط خريطة البداية' : 'Start Google Maps Link'] = `https://www.google.com/maps?q=${sy},${sx}`;

      rows.push(rowObj);
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, lang === 'ar' ? 'الخطوط المرسومة' : 'Drawn Lines');

    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    XLSX.writeFile(workbook, `${baseName}_Export.xlsx`);
  };

  const handleExportKMZ = async () => {
    if (activeExportLines.length === 0) return;
    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    const task = () => downloadKMZ(activeExportLines, baseName, { mode: 'none' });
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تحضير وتصدير ملف KMZ...' : 'Generating KMZ file...', task);
    } else {
      await task();
    }
  };

  const handleExportShapefile = async () => {
    if (activeExportLines.length === 0) return;
    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    const task = () => downloadShapefile(activeExportLines, baseName);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تحضير وتصدير ملف Shapefile (SHP)...' : 'Creating Shapefile (SHP)...', task);
    } else {
      await task();
    }
  };

  const handleExportDXF = async () => {
    if (activeExportLines.length === 0) return;
    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    const task = () => downloadDXF(activeExportLines, baseName);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري تحضير وتصدير ملف DXF...' : 'Creating DXF file...', task);
    } else {
      await task();
    }
  };

  const handleExportPDF = async () => {
    if (activeExportLines.length === 0) return;
    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    const task = () => downloadDataPDF(activeExportLines, baseName, lang);
    if (runWithLoading) {
      await runWithLoading(lang === 'ar' ? 'جاري توليد وتصدير ملف PDF...' : 'Generating PDF file...', task);
    } else {
      await task();
    }
  };

  const handleExportGeoJSON = () => {
    if (activeExportLines.length === 0) return;
    const features = activeExportLines.map(pt => ({
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

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = file?.filename ? file.filename.replace(/\.[^/.]+$/, '') : 'Drawn_Map_Lines';
    a.href = url;
    a.download = `${baseName}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLines = () => {
    setDrawnLines([]);
    setGlobalPoints(globalPoints.filter(p => !drawnLines.some(dl => dl.id === p.id)));
    setDataId(`cleared-${Date.now()}`);
    setSuccess(lang === 'ar' ? 'تم تفريغ الخطوط المرسومة بنجاح.' : 'Drawn lines cleared successfully.');
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
      <div className="bg-[#0f3b4c] rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-accent/20 rounded-2xl">
            <PenTool className="w-8 h-8 text-accent" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-1">
              {lang === 'ar' ? 'رسم وتصدير الخطوط من ملف' : 'Draw & Export Lines from File'}
            </h2>
            <p className="text-sm text-white/50">
              {lang === 'ar' 
                ? 'ارفع ملف اكسل يحتوي على إحداثيات البداية والنهاية لرسمها كخطوط على الخريطة وتصديرها بجميع الصيغ بنفس بيانات الملف.' 
                : 'Upload an Excel file containing start and end coordinates to draw lines on map and export with full attribute data.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border-l-4 border-red-500 p-4 mb-6 rounded-xl flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 mb-6 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-200">{success}</p>
          </div>
        )}

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
              "w-full rounded-2xl sm:rounded-[2rem] border-2 border-dashed transition-all p-6 sm:p-10 flex flex-col items-center justify-center gap-4",
              loading ? "border-accent/20 bg-accent/5" : "border-white/10 bg-white/[0.02] group-hover:border-accent/50 group-hover:bg-accent/5"
            )}>
              <div className={cn(
                "w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all",
                loading ? "bg-accent/20" : "bg-white/5 group-hover:bg-accent/20"
              )}>
                <FileSpreadsheet className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10",
                  loading ? "text-accent animate-pulse" : "text-white/40 group-hover:text-accent"
                )} />
              </div>
              <div className="text-center">
                <p className="text-sm sm:text-base font-bold text-white mb-2">
                  {loading ? (lang === 'ar' ? 'جاري القراءة...' : 'Reading...') : (lang === 'ar' ? 'اضغط أو اسحب الملف هنا' : 'Click or drag file here')}
                </p>
                <p className="text-xs text-white/40 font-medium">
                  {lang === 'ar' ? 'يدعم صيغ Excel و CSV' : 'Supports Excel and CSV formats'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-[#0b2d3d] p-4 sm:p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-white text-sm">{file.filename}</h3>
                    <p className="text-xs text-white/50">
                      {file.data.length} {lang === 'ar' ? 'صف' : 'rows'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setFile(null); setSuccess(null); setError(null); }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-xs font-bold"
                >
                  {lang === 'ar' ? 'تغيير الملف' : 'Change File'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Coordinates */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'إحداثي X للبداية (Start X)' : 'Start X Coordinate'} <span className="text-red-400">*</span>
                  </label>
                  <select 
                    value={startXCol}
                    onChange={(e) => setStartXCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'إحداثي Y للبداية (Start Y)' : 'Start Y Coordinate'} <span className="text-red-400">*</span>
                  </label>
                  <select 
                    value={startYCol}
                    onChange={(e) => setStartYCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* End Coordinates */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'إحداثي X للنهاية (End X)' : 'End X Coordinate'} <span className="text-red-400">*</span>
                  </label>
                  <select 
                    value={endXCol}
                    onChange={(e) => setEndXCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'إحداثي Y للنهاية (End Y)' : 'End Y Coordinate'} <span className="text-red-400">*</span>
                  </label>
                  <select 
                    value={endYCol}
                    onChange={(e) => setEndYCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'اختر عمود...' : 'Select column...'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* Optional metadata */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'المعرف (ID) - اختياري' : 'ID Column - Optional'}
                  </label>
                  <select 
                    value={idCol}
                    onChange={(e) => setIdCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'توليد تلقائي' : 'Auto generate'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">
                    {lang === 'ar' ? 'الطبقة (Layer) - اختياري' : 'Layer Column - Optional'}
                  </label>
                  <select 
                    value={layerCol}
                    onChange={(e) => setLayerCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'توليد تلقائي' : 'Auto generate'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* Color Column */}
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/60">
                      {lang === 'ar' ? 'عمود كود اللون (Color Code) - اختياري' : 'Color Code Column - Optional'}
                    </label>
                    {colorCol && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        🎨 {lang === 'ar' ? `تلوين مفعّل من [${colorCol}]` : `Colored using [${colorCol}]`}
                      </span>
                    )}
                  </div>
                  <select 
                    value={colorCol}
                    onChange={(e) => setColorCol(e.target.value)}
                    className="w-full bg-[#071c27] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accent outline-none"
                  >
                    <option value="">{lang === 'ar' ? 'افتراضي (أزرق #3b82f6)' : 'Default (Blue #3b82f6)'}</option>
                    {file.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="mt-6">
                <button
                  onClick={generateLines}
                  disabled={loading || !startXCol || !startYCol || !endXCol || !endYCol}
                  className="w-full py-4 rounded-xl bg-accent text-primary font-black flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
                >
                  <PenTool className="w-5 h-5" />
                  {loading ? (lang === 'ar' ? 'جاري الرسم والتوليد...' : 'Drawing...') : (lang === 'ar' ? 'رسم الخطوط على الخريطة' : 'Draw Lines on Map')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drawn Lines Statistics & Multi-Format Export Bar */}
        {activeExportLines.length > 0 && (
          <div className="mt-8 pt-6 border-t border-white/10 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Stats Dashboard */}
            <div className="bg-[#0b2d3d]/90 p-4 sm:p-5 rounded-2xl border border-accent/20 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-sm">
                      {lang === 'ar' ? 'بيانات الخريطة والخطوط المرسومة' : 'Drawn Map & Lines Summary'}
                    </h3>
                    <p className="text-[11px] text-white/50">
                      {lang === 'ar' ? 'تصدير كامل الخطوط بكافة بيانات الأعمدة الأصلية في الإكسل' : 'Export all lines with original Excel columns & attributes'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleClearLines}
                  className="self-start sm:self-auto px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  title={lang === 'ar' ? 'مسح الخطوط المرسومة' : 'Clear Drawn Lines'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'مسح الخطوط' : 'Clear Lines'}</span>
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-white/50 block mb-1">
                    {lang === 'ar' ? 'عدد الخطوط' : 'Total Lines'}
                  </span>
                  <span className="text-lg font-black text-accent font-mono">
                    {activeExportLines.length}
                  </span>
                </div>
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-white/50 block mb-1">
                    {lang === 'ar' ? 'إجمالي الأطوال' : 'Total Length'}
                  </span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {totalLengthM >= 1000 ? `${(totalLengthM / 1000).toFixed(2)} km` : `${totalLengthM.toFixed(1)} m`}
                  </span>
                </div>
                <div className="p-3 bg-black/20 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-white/50 block mb-1">
                    {lang === 'ar' ? 'الطبقات' : 'Layers'}
                  </span>
                  <span className="text-lg font-black text-cyan-300 font-mono">
                    {totalLayersCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Export Actions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-accent" />
                  <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    {lang === 'ar' ? 'أزرار تصدير الخريطة والبيانات' : 'Export Map & Data Options'}
                  </h4>
                </div>
                <span className="text-[10px] text-accent/80 font-bold bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                  {lang === 'ar' ? 'محتفظاً بنفس بيانات الإكسل' : 'Preserving Excel Attributes'}
                </span>
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {/* 1. Excel Export (With All Original & Computed Attributes) */}
                <button
                  onClick={handleExportExcel}
                  className="bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
                  title={lang === 'ar' ? 'تصدير جدول اكسل يحتوي على جميع الأعمدة والبيانات الأصلية' : 'Export Excel with all original and computed columns'}
                >
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-black">{lang === 'ar' ? 'تصدير إكسل (Excel)' : 'Export Excel'}</span>
                  <span className="text-[9px] text-emerald-400/70 font-medium">.xlsx</span>
                </button>

                {/* 2. KMZ Export (Google Earth) */}
                <button
                  onClick={handleExportKMZ}
                  className="bg-[#0b2d3d] hover:bg-[#114056] border border-accent/40 text-accent font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
                  title={lang === 'ar' ? 'تصدير ملف KMZ لجوجل إيرث مع الألوان والجداول' : 'Export KMZ for Google Earth with styling & attributes'}
                >
                  <DownloadCloud className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-black">{lang === 'ar' ? 'تصدير KMZ' : 'Export KMZ'}</span>
                  <span className="text-[9px] text-accent/70 font-medium">Google Earth</span>
                </button>

                {/* 3. Shapefile Export (SHP ZIP) */}
                <button
                  onClick={handleExportShapefile}
                  className="bg-[#0b2d3d] hover:bg-[#114056] border border-cyan-500/40 text-cyan-300 font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
                  title={lang === 'ar' ? 'تصدير ملف Shapefile لنظم المعلومات الجغرافية GIS' : 'Export ESRI Shapefile ZIP'}
                >
                  <FolderArchive className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-black">{lang === 'ar' ? 'شيب فايل (SHP)' : 'Shapefile (SHP)'}</span>
                  <span className="text-[9px] text-cyan-400/70 font-medium">ESRI GIS</span>
                </button>

                {/* 4. AutoCAD DXF Export */}
                <button
                  onClick={handleExportDXF}
                  className="bg-[#0b2d3d] hover:bg-[#114056] border border-amber-500/40 text-amber-300 font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
                  title={lang === 'ar' ? 'تصدير ملف أوتوكاد DXF' : 'Export AutoCAD DXF'}
                >
                  <PenTool className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-black">{lang === 'ar' ? 'أوتوكاد (DXF)' : 'AutoCAD (DXF)'}</span>
                  <span className="text-[9px] text-amber-400/70 font-medium">CAD Vector</span>
                </button>

                {/* 5. PDF Export */}
                <button
                  onClick={handleExportPDF}
                  className="bg-[#0b2d3d] hover:bg-[#114056] border border-rose-500/40 text-rose-300 font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
                  title={lang === 'ar' ? 'تصدير تقرير PDF مفصل' : 'Export PDF Report'}
                >
                  <FileText className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-black">{lang === 'ar' ? 'تقرير PDF' : 'PDF Report'}</span>
                  <span className="text-[9px] text-rose-400/70 font-medium">Document</span>
                </button>

                {/* 6. GeoJSON Export */}
                <button
                  onClick={handleExportGeoJSON}
                  className="bg-[#0b2d3d] hover:bg-[#114056] border border-indigo-500/40 text-indigo-300 font-black p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all group"
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
    </div>
  );
};
