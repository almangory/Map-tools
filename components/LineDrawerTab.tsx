import React, { useState } from 'react';
import { PenTool, FileSpreadsheet, PlusCircle, CheckCircle, Upload, Save, XCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { GeoPoint, ParsedFile } from '../types';
import { parseExcel } from '../services/parserService';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface Props {
  lang: 'ar' | 'en';
  globalPoints: GeoPoint[];
  setGlobalPoints: (points: GeoPoint[]) => void;
  setDataId: (id: string) => void;
  setGlobalLoading?: (loading: boolean) => void;
  setGlobalProgress?: (percent: number | null) => void;
  setGlobalStatus?: (status: string) => void;
}

export const LineDrawerTab = ({ lang, globalPoints, setGlobalPoints, setDataId, setGlobalLoading, setGlobalProgress, setGlobalStatus }: Props) => {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري تحويل الإحداثيات ورسم الخطوط/القطاعات...' : 'Converting coordinates and generating line segments...');
    if (setGlobalProgress) setGlobalProgress(25);

    setError(null);
    setSuccess(null);

    try {
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

        const id = idIdx >= 0 && row[idIdx] ? String(row[idIdx]) : `LINE_${Date.now()}_${i}`;
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

        newPoints.push({
          id,
          x: sx,
          y: sy,
          type: 'LineString',
          path,
          layer,
          color,
          originalRow: row
        });
      });

      if (newPoints.length === 0) {
        throw new Error(lang === 'ar' ? 'لم يتم العثور على أي خطوط صالحة في الملف' : 'No valid lines found in the file');
      }

      if (setGlobalProgress) setGlobalProgress(100);
      setGlobalPoints([...globalPoints, ...newPoints]);
      setDataId(`lines-${Date.now()}`);
      setSuccess(lang === 'ar' ? `تم رسم ${newPoints.length} خط بنجاح!` : `Successfully drew ${newPoints.length} lines!`);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
      <div className="bg-[#0f3b4c] rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-accent/20 rounded-2xl">
            <PenTool className="w-8 h-8 text-accent" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-1">
              {lang === 'ar' ? 'رسم الخطوط من ملف' : 'Draw Lines from File'}
            </h2>
            <p className="text-sm text-white/50">
              {lang === 'ar' 
                ? 'ارفع ملف اكسل يحتوي على إحداثيات البداية والنهاية لرسمها كخطوط (قطاعات) على الخريطة.' 
                : 'Upload an Excel file containing start and end coordinates to draw them as lines (segments) on the map.'}
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
                  className="w-full py-4 rounded-xl bg-accent text-primary font-black flex items-center justify-center gap-2 hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PenTool className="w-5 h-5" />
                  {loading ? (lang === 'ar' ? 'جاري الرسم...' : 'Drawing...') : (lang === 'ar' ? 'رسم الخطوط' : 'Draw Lines')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
