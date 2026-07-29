import { CircleDot } from 'lucide-react';
import React, { useState } from 'react';
import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square, FolderSearch, FileSpreadsheet, CloudDownload, FolderInput, Zap, PenTool, FileText } from 'lucide-react';
import { GeoPoint } from '../types';
import { classifyAssetsToZones, ClassifiedAsset } from '../services/turfService';
import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ, fetchNetworkFile } from '../services/parserService';
import { ParsedFile } from '../types';
import { identifyPotentialCRS, transformPoints } from '../services/crs';
import { downloadKMZ } from '../services/kmlService';
import { downloadDXF } from '../services/dxfExportService';
import { downloadDataPDF } from '../services/pdfExportService';
import * as XLSX from 'xlsx';

interface Props {
  lang: 'ar' | 'en';
  targetAssets: GeoPoint[];
  setTargetAssets: (assets: GeoPoint[]) => void;
  setRefPolygons?: (zones: GeoPoint[]) => void;
  setDataId?: (id: string) => void;
}

export const MapClassifier = ({ lang, targetAssets, setTargetAssets, setRefPolygons, setDataId }: Props) => {
  const [refZones, setRefZones] = useState<GeoPoint[]>([]);
  const [classifiedResults, setClassifiedResults] = useState<ClassifiedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [zonesStatus, setZonesStatus] = useState<string>('');
  const [zonesUrl, setZonesUrl] = useState<string>('');
  const [localTargetAssets, setLocalTargetAssets] = useState<GeoPoint[]>([]);
  const [assetsStatus, setAssetsStatus] = useState<string>('');
  const [assetsHeaders, setAssetsHeaders] = useState<string[]>([]);
  const [kmzGroupOption, setKmzGroupOption] = useState<'none' | 'color' | 'name' | 'column'>('none');
  const [selectedGroupColumn, setSelectedGroupColumn] = useState<string>('');

  const processZonesResult = (result: ParsedFile, fName: string) => {
      let pts: GeoPoint[] = result.data as any;
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
        const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);
        const sourceData = result.data as GeoPoint[];
        if (potentialCRS) {
            pts = transformPoints(sourceData, potentialCRS);
        } else {
            pts = sourceData;
        }
      } else {
         if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
             setZonesStatus(lang === 'ar' ? 'صيغة غير مدعومة للمناطق.' : 'Unsupported format for zones.');
             setLoading(false);
             return;
         }
      }

      const polygons = pts.filter(p => p.type === 'Polygon' || p.type === 'LineString');
      const finalZones = polygons.map(p => {
          if (p.type === 'LineString') {
              return { ...p, type: 'Polygon' as const };
          }
          return p as GeoPoint;
      });

      setRefZones(finalZones);
      if (setRefPolygons) setRefPolygons(finalZones);
      if (setDataId) setDataId(`classifier-ref-${Date.now()}`);
      setZonesStatus(`${lang === 'ar' ? 'تم جلب' : 'Loaded'} ${finalZones.length} ${lang === 'ar' ? 'مضلع' : 'Polygons'}`);
  };

  const handleFetchZonesUrl = async () => {
    if (!zonesUrl) return;
    setLoading(true);
    setZonesStatus(lang === 'ar' ? 'جاري جلب الملف من الرابط...' : 'Fetching file from URL...');
    
    try {
      const result = await fetchNetworkFile(zonesUrl, (p) => {
         // optional progress
      });
      processZonesResult(result, result.filename);
    } catch (err: any) {
      console.error(err);
      setZonesStatus(err.message || (lang === 'ar' ? 'حدث خطأ أثناء الجلب' : 'Error fetching file'));
    } finally {
      setLoading(false);
    }
  };

  const handleZonesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true);
    setZonesStatus(lang === 'ar' ? 'جاري قراءة المضلعات...' : 'Reading Polygons...');
    
    try {
      const fName = selectedFile.name.toLowerCase();
      let result: ParsedFile;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile);
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb')) result = await parseKMZ(selectedFile);
      else throw new Error('Unsupported file type');

      processZonesResult(result, fName);
    } catch (err) {
      console.error(err);
      setZonesStatus(lang === 'ar' ? 'حدث خطأ أثناء القراءة' : 'Error reading file');
    } finally {
      setLoading(false);
    }
  };


  const handleAssetsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true);
    setAssetsStatus(lang === 'ar' ? 'جاري قراءة الأصول...' : 'Reading Assets...');
    
    try {
      const fName = selectedFile.name.toLowerCase();
      let result;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile);
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb')) result = await parseKMZ(selectedFile);
      else throw new Error('Unsupported file type');

      let pts: GeoPoint[] = [];
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
          const rows = result.data as any[][];
          const headers = result.headers as string[];
          const mapping = result.suggestedMapping as any;
          
          if (!mapping.xColumn || !mapping.yColumn) {
              setAssetsStatus(lang === 'ar' ? 'تعذر العثور على أعمدة الإحداثيات تلقائياً' : 'Could not automatically find coordinate columns');
              setLoading(false);
              return;
          }
          
          const xIdx = headers.indexOf(mapping.xColumn);
          const yIdx = headers.indexOf(mapping.yColumn);
          const idIdx = mapping.idColumn ? headers.indexOf(mapping.idColumn) : -1;
          
          setAssetsHeaders(headers);
          pts = rows.map((r, i) => {
              return {
                  id: idIdx !== -1 && r[idIdx] ? String(r[idIdx]) : `Asset_${i}`,
                  x: parseFloat(r[xIdx]),
                  y: parseFloat(r[yIdx]),
                  type: 'Point',
                  layer: 'Excel Import',
                  originalRow: r
              };
          }).filter(p => !isNaN(p.x) && !isNaN(p.y));
      } else {
          pts = result.data as GeoPoint[];
          // Extract headers from attributes if available
          const attrKeys = new Set<string>();
          pts.forEach(p => {
              if (p.attributes) Object.keys(p.attributes).forEach(k => attrKeys.add(k));
          });
          if (attrKeys.size > 0) {
              setAssetsHeaders(Array.from(attrKeys));
          } else {
              setAssetsHeaders([]);
          }
      }
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
        const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);
        const sourceData = result.data as GeoPoint[];
        if (potentialCRS) {
            pts = transformPoints(sourceData, potentialCRS);
        } else {
            pts = sourceData;
        }
      }

      setLocalTargetAssets(pts);
      setTargetAssets(pts);
      if (setDataId) setDataId(`classifier-target-${Date.now()}`);
      setAssetsStatus(`${lang === 'ar' ? 'تم جلب' : 'Loaded'} ${pts.length} ${lang === 'ar' ? 'أصل' : 'Assets'}`);
    } catch (err) {
      console.error(err);
      setAssetsStatus(lang === 'ar' ? 'حدث خطأ أثناء القراءة' : 'Error reading file');
    } finally {
      setLoading(false);
    }
  };

  const handleStartClassification = () => {
    if (refZones.length === 0) {
      alert(lang === 'ar' ? 'يرجى رفع ملف المناطق أولاً' : 'Please upload reference zones first');
      return;
    }
    const assetsToClassify = localTargetAssets.length > 0 ? localTargetAssets : targetAssets;
    if (assetsToClassify.length === 0) {
      alert(lang === 'ar' ? 'يرجى رفع ملف الأصول (نقاط/خطوط) أولاً' : 'Please upload target assets (points/lines) first');
      return;
    }
    
    // استدعاء الدالة السابقة
    const results = classifyAssetsToZones(assetsToClassify, refZones);
    
    // حفظ النتيجة في State لطباعتها للمستخدم
    setClassifiedResults(results);
    setTargetAssets(results);
    if (setDataId) setDataId(`classifier-colored-${Date.now()}`);
    alert(lang === 'ar' ? 'اكتمل التصنيف بنجاح!' : 'Classification completed successfully!');
  };

  
  const downloadMergedExcel = () => {
    if (classifiedResults.length === 0) return;
    const exportData = classifiedResults.map(r => {
      const baseRow: any = {
        ID: r.id,
        District: r.district,
        Longitude: r.x,
        Latitude: r.y,
        Type: r.type,
        Layer: r.layer || '',
        Description: r.description || ''
      };
      
      // If we have original headers and rows (from Excel)
      if (assetsHeaders.length > 0 && r.originalRow) {
          assetsHeaders.forEach((h, idx) => {
              if (baseRow[h] === undefined) {
                  baseRow[h] = r.originalRow![idx];
              }
          });
      }
      
      // If we have KML/GDB attributes
      if (r.attributes) {
          Object.keys(r.attributes).forEach(k => {
             if (baseRow[k] === undefined) {
                 baseRow[k] = r.attributes![k];
             }
          });
      }
      
      return baseRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classified");
    XLSX.writeFile(wb, "Merged_Classified_Assets.xlsx");
  };


  const downloadAssetsKMZ = async () => {
    if (classifiedResults.length === 0) return;
    
    // Map ClassifiedAsset back to GeoPoint format required for export
    const exportPoints: GeoPoint[] = classifiedResults.map(r => ({
      ...r,
      layer: r.district, // The classification becomes the layer for grouping by "name"
      name: r.id
    }));

    let exportOptions: any = { mode: 'none' };
    
    if (kmzGroupOption === 'name') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'layer' };
    } else if (kmzGroupOption === 'color') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'color' };
    } else if (kmzGroupOption === 'column' && selectedGroupColumn) {
      exportOptions = { mode: 'attribute', groupByColumn: selectedGroupColumn };
    }

    try {
      await downloadKMZ(exportPoints, "Classified_Assets", exportOptions, assetsHeaders.length > 0 ? assetsHeaders : undefined);
    } catch (e) {
      console.error(e);
      alert('Error generating KMZ');
    }
  };


  const downloadExcel = () => {
    if (classifiedResults.length === 0) return;
    
    const ws = XLSX.utils.json_to_sheet(classifiedResults.map(r => ({
      ID: r.id,
      Type: r.type,
      Longitude: r.x,
      Latitude: r.y,
      District: r.district
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classified");
    XLSX.writeFile(wb, "Classified_Assets.xlsx");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="p-8 bg-[#0b2d3d]/40 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full border-[6px] border-accent flex items-center justify-center mb-4"><CircleDot className="w-10 h-10 text-accent" /></div>
        <h2 className="text-white font-black text-xl">{lang === 'ar' ? 'مصنف الأصول' : 'Assets Classifier'}</h2>
        <p className="text-[10px] text-white/50 leading-relaxed font-bold uppercase">
            {lang === 'ar' ? 'دمج بيانات الأصول مع بيانات المناطق المرجعية' : 'Merge assets data with reference zones data'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Upload Zones */}
        <div className="bg-transparent border border-white/5 p-6 rounded-3xl">
          <h3 className="text-white/60 font-black mb-4 text-xs flex items-center justify-end gap-2 uppercase">
            <Square className="w-4 h-4 text-accent order-last" />
            {lang === 'ar' ? 'المناطق المرجعية (POLYGONS)' : 'Reference Zones (POLYGONS)'}
          </h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 relative z-10">
              <div className="flex gap-2">
                <button
                  onClick={handleFetchZonesUrl}
                  disabled={loading || !zonesUrl}
                  className="bg-accent text-[#0b2d3d] px-4 py-3 rounded-2xl font-black text-xs hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {lang === 'ar' ? 'جلب' : 'Fetch'}
                </button>
                <input 
                  type="text" 
                  placeholder={lang === 'ar' ? "أو ضع رابط ملف KML / KMZ هنا..." : "Or paste KML / KMZ URL here..."}
                  value={zonesUrl}
                  onChange={(e) => setZonesUrl(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
                />
              </div>
            </div>

            <div className="relative">
              <input
                type="file"
                accept=".kml,.kmz,.dxf,.gdb,.zip"
                onChange={handleZonesUpload}
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
                <FileUp className="w-6 h-6 text-white/40 mb-2" />
                <span className="text-white/70 font-bold text-xs">
                   {loading ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'اختر ملف KML, KMZ, DXF, GDB' : 'Select KML, KMZ, DXF, GDB')}
                </span>
              </div>
            </div>
          </div>
          {zonesStatus && (
            <p className="mt-3 text-xs text-accent font-bold text-center">
              {zonesStatus}
            </p>
          )}
        </div>


        {/* Upload Assets */}
        <div className="bg-transparent border border-white/5 p-6 rounded-3xl">
          <h3 className="text-white/60 font-black mb-4 text-xs flex items-center justify-end gap-2 uppercase">
            <MapPin className="w-4 h-4 text-accent order-last" />
            {lang === 'ar' ? 'الأصول المستهدفة (POINTS/LINES)' : 'Target Assets (POINTS/LINES)'}
          </h3>
          <div className="relative">
            <input
              type="file"
              accept=".kml,.kmz,.dxf,.gdb,.zip,.xlsx,.csv"
              onChange={handleAssetsUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
              <FileUp className="w-6 h-6 text-white/40 mb-2" />
              <span className="text-white/70 font-bold text-xs">
                 {loading ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'ارفع ملف الأصول' : 'Upload Assets File')}
              </span>
            </div>
          </div>
          {assetsStatus && (
            <p className="mt-3 text-xs text-accent font-bold text-center">
              {assetsStatus}
            </p>
          )}
        </div>

        {/* Action Button */}
        <button
           onClick={handleStartClassification}
           disabled={loading || refZones.length === 0 || (targetAssets.length === 0 && localTargetAssets.length === 0)}
           className={`w-full font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all shadow-xl ${(!loading && refZones.length > 0 && (targetAssets.length > 0 || localTargetAssets.length > 0)) ? 'bg-[#0d3446] text-white/70 hover:bg-[#124258]' : 'bg-white/5 text-white/40 disabled:opacity-30 disabled:cursor-not-allowed'}`}
        >
           <Zap className="w-5 h-5" />
           {lang === 'ar' ? 'بدء التصنيف والمطابقة' : 'Start Classification and Matching'}
        </button>

        
        {/* Results Options */}
        {classifiedResults.length > 0 && (
           <div className="bg-[#0b2d3d]/80 border border-white/10 p-6 rounded-[2rem] space-y-6">
              
              <div className="flex items-center justify-end gap-2 mb-2">
                <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'خيارات تجميع KMZ (للأصول):' : 'KMZ Grouping Options:'}</h3>
                <FolderSearch className="w-5 h-5 text-accent" />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2 flex-row-reverse">
                  <button 
                    onClick={() => setKmzGroupOption('name')}
                    className={`flex-1 py-3 rounded-2xl font-bold text-xs transition-all ${kmzGroupOption === 'name' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  >
                    {lang === 'ar' ? 'بالاسم' : 'By Name'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('color')}
                    className={`flex-1 py-3 rounded-2xl font-bold text-xs transition-all ${kmzGroupOption === 'color' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  >
                    {lang === 'ar' ? 'باللون' : 'By Color'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('column')}
                    className={`flex-1 py-3 rounded-2xl font-bold text-xs transition-all ${kmzGroupOption === 'column' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  >
                    {lang === 'ar' ? 'بالبيانات' : 'By Data'}
                  </button>
                  <button 
                    onClick={() => setKmzGroupOption('none')}
                    className={`flex-1 py-3 rounded-2xl font-bold text-xs transition-all ${kmzGroupOption === 'none' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                  >
                    {lang === 'ar' ? 'بدون' : 'None'}
                  </button>
                </div>
                {kmzGroupOption === 'column' && (
                   <select 
                     value={selectedGroupColumn}
                     onChange={(e) => setSelectedGroupColumn(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
                   >
                      <option value="" className="text-black">{lang === 'ar' ? 'اختر العمود للتجميع...' : 'Select column for grouping...'}</option>
                      {assetsHeaders.map(h => (
                         <option key={h} value={h} className="text-black">{h}</option>
                      ))}
                   </select>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                <button 
                  onClick={downloadAssetsKMZ}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner"
                >
                  <CloudDownload className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'KMZ' : 'KMZ'}</span>
                </button>

                <button 
                  onClick={() => downloadDXF(exportPoints, "Classified_Assets")}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner"
                >
                  <PenTool className="w-5 h-5 text-orange-400 group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'DXF' : 'DXF'}</span>
                </button>

                <button 
                  onClick={downloadMergedExcel}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner"
                >
                  <FileSpreadsheet className="w-5 h-5 text-[#2ecc71] group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'إكسل' : 'Excel'}</span>
                </button>

                <button 
                  onClick={() => downloadDataPDF(exportPoints, "Classified_Assets", lang)}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl py-4 flex flex-col items-center justify-center gap-2 transition-colors group shadow-inner"
                >
                  <FileText className="w-5 h-5 text-[#D32F2F] group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-[11px]">{lang === 'ar' ? 'PDF' : 'PDF'}</span>
                </button>
              </div>

           </div>
        )}

      </div>
    </div>
  );
};
