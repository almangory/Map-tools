import React, { useState, useMemo } from 'react';
import { GitCompare, FileUp, AlertTriangle, CheckCircle, Info, Trash2, XCircle, PlusCircle, PenTool, FileSpreadsheet } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); };
import { GeoPoint, ParsedFile } from '../types';
import { parseExcel, parseKMZ, extractPointsFromDXF, parseDXF } from '../services/parserService';
import { identifyPotentialCRS, transformPoints } from '../services/crs';

interface Props {
  lang: 'ar' | 'en';
  setGlobalPoints: (points: GeoPoint[]) => void;
  setDataId: (id: string) => void;
  setGlobalLoading?: (loading: boolean) => void;
  setGlobalProgress?: (percent: number | null) => void;
  setGlobalStatus?: (status: string) => void;
}

export const FileComparator = ({ lang, setGlobalPoints, setDataId, setGlobalLoading, setGlobalProgress, setGlobalStatus }: Props) => {
  const [file1Name, setFile1Name] = useState<string>('');
  const [file2Name, setFile2Name] = useState<string>('');
  
  const [points1, setPoints1] = useState<GeoPoint[]>([]);
  const [points2, setPoints2] = useState<GeoPoint[]>([]);

  const [idColumn1, setIdColumn1] = useState<string>('');
  const [idColumn2, setIdColumn2] = useState<string>('');
  
  const [stats, setStats] = useState<{added: number, deleted: number, modified: number, unchanged: number, diameterDiff?: number} | null>(null);
  const [loading, setLoading] = useState(false);
  
  // auto detect attributes for ID selection
  const attributes1 = useMemo(() => {
    const keys = new Set<string>();
    points1.forEach(p => {
        if (p.attributes) Object.keys(p.attributes).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [points1]);
  
  const attributes2 = useMemo(() => {
    const keys = new Set<string>();
    points2.forEach(p => {
        if (p.attributes) Object.keys(p.attributes).forEach(k => keys.add(k));
    });
    return Array.from(keys);
  }, [points2]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isFile1: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? `جاري قراءة الملف ${file.name}...` : `Reading file ${file.name}...`);
    if (setGlobalProgress) setGlobalProgress(10);

    await new Promise(r => setTimeout(r, 120));

    try {
      const fileExtension = String(file.name.split('.').pop() || '').toLowerCase();
      let pts: GeoPoint[] = [];

      const onProg = (p: number) => { if (setGlobalProgress) setGlobalProgress(p); };

      if (['kmz', 'kml', 'zip', 'gdb', 'shp'].includes(fileExtension)) {
        const parsed = await parseKMZ(file, onProg);
        pts = parsed.data as GeoPoint[];
      } else if (fileExtension === 'dxf') {
        const parsed = await parseDXF(file, onProg);
        pts = extractPointsFromDXF(parsed.data);
      } else if (['xlsx', 'csv', 'xls'].includes(fileExtension)) {
        const parsed = await parseExcel(file, onProg);
        const rows = parsed.data as any[][];
        const headers = parsed.headers || [];
        
        let xCol = headers.find(h => /^(x|lon|lng|longitude|easting)$/i.test(h)) || '';
        let yCol = headers.find(h => /^(y|lat|latitude|northing)$/i.test(h)) || '';
        
        if (xCol && yCol) {
            const xIdx = headers.indexOf(xCol);
            const yIdx = headers.indexOf(yCol);
            
            pts = rows.map((r, i) => {
                const attrs: Record<string, string> = {};
                headers.forEach((h, idx) => {
                    attrs[h] = String(r[idx] || '');
                });
                return {
                    id: `Feature_${i}`,
                    x: parseFloat(r[xIdx]),
                    y: parseFloat(r[yIdx]),
                    type: 'Point' as const,
                    attributes: attrs,
                    originalRow: r
                };
            }).filter(p => !isNaN(p.x) && !isNaN(p.y));
        } else {
            alert(lang === 'ar' ? 'لم يتم العثور على أعمدة الإحداثيات (X/Y) في ملف الإكسل.' : 'Could not find coordinate columns (X/Y) in the Excel file.');
        }
      }

      if (pts.length > 0) {
        const crs = identifyPotentialCRS(pts);
        if (crs) {
            pts = transformPoints(pts, crs);
        }
      }

      if (isFile1) {
        setPoints1(pts);
        setFile1Name(file.name);
        setIdColumn1('');
      } else {
        setPoints2(pts);
        setFile2Name(file.name);
        setIdColumn2('');
      }
      setStats(null);
    } catch (err) {
      console.error(err);
      alert(lang === 'ar' ? 'حدث خطأ أثناء قراءة الملف.' : 'Error reading file.');
    } finally {
      setLoading(false);
      if (setGlobalLoading) setGlobalLoading(false);
      if (setGlobalProgress) setGlobalProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  const compareFiles = () => {
    if (!points1.length || !points2.length) return;
    
    setLoading(true);
    if (setGlobalLoading) setGlobalLoading(true);
    if (setGlobalStatus) setGlobalStatus(lang === 'ar' ? 'جاري مقارنة البيانات والمطابقة المكانية...' : 'Comparing files and performing spatial matching...');
    if (setGlobalProgress) setGlobalProgress(20);

    setTimeout(() => {
        const map1 = new Map<string, GeoPoint>();
        const map2 = new Map<string, GeoPoint>();
        
        points1.forEach(p => {
            const key = idColumn1 && p.attributes ? p.attributes[idColumn1] : p.id;
            if (key) map1.set(String(key), p);
        });
        
        points2.forEach(p => {
            const key = idColumn2 && p.attributes ? p.attributes[idColumn2] : p.id;
            if (key) map2.set(String(key), p);
        });

        // Spatial fallback matching for unmapped elements
        const unmatchedIn1 = new Set(map1.keys());
        map2.forEach((p2, k) => {
            if (unmatchedIn1.has(k)) {
                unmatchedIn1.delete(k);
            }
        });

        const unmapped2Keys = [];
        map2.forEach((p2, k) => {
            if (!map1.has(k)) unmapped2Keys.push(k);
        });

        for (const k2 of unmapped2Keys) {
            const p2 = map2.get(k2)!;
            let bestDist = Infinity;
            let bestK1 = '';
            for (const k1 of unmatchedIn1) {
                const p1 = map1.get(k1)!;
                const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
                // If it's a line, just matching by center/first point (which x,y represents) might be enough
                if (dist < 0.0001 && dist < bestDist) {
                    bestDist = dist;
                    bestK1 = k1;
                }
            }
            if (bestK1) {
                map2.delete(k2);
                map2.set(bestK1, p2);
                unmatchedIn1.delete(bestK1);
            }
        }
        
        const resultPoints: GeoPoint[] = [];
        let added = 0, deleted = 0, modified = 0, unchanged = 0, diameterDiff = 0;
        
        map2.forEach((p2, key) => {
            const p1 = map1.get(key);
            if (!p1) {
                added++;
                resultPoints.push({...p2, color: '#10b981', layer: lang === 'ar' ? 'إضافة' : 'Added'}); 
            } else {
                const geomChanged = Math.abs(p1.x - p2.x) > 0.00001 || Math.abs(p1.y - p2.y) > 0.00001;
                let attrsChanged = false;
                let diameterChanged = false;
                if (p1.attributes && p2.attributes) {
                    const keys = new Set([...Object.keys(p1.attributes), ...Object.keys(p2.attributes)]);
                    
                    // Specific diameter comparison logic across potentially different key names
                    const getDiameter = (attrs) => {
                        for (const k of Object.keys(attrs)) {
                            const kLower = k.toLowerCase();
                            if (kLower.includes('dia') || kLower.includes('قطر') || kLower.includes('size') || kLower.includes('width')) {
                                return attrs[k];
                            }
                        }
                        return null;
                    };
                    
                    const dia1 = getDiameter(p1.attributes);
                    const dia2 = getDiameter(p2.attributes);
                    if (dia1 !== null && dia2 !== null && String(dia1).trim() !== String(dia2).trim()) {
                        diameterChanged = true;
                    }
                    
                    for (let k of keys) {
                        if (p1.attributes[k] !== p2.attributes[k]) {
                            attrsChanged = true;
                            // Also fallback check on the specific key if we didn't catch it with the general heuristic
                            const kLower = k.toLowerCase();
                            if (kLower.includes('dia') || kLower.includes('قطر') || kLower.includes('size') || kLower.includes('width')) {
                                diameterChanged = true;
                            }
                        }
                    }
                } else if (p1.attributes !== p2.attributes) {
                    attrsChanged = true;
                }
                
                if (diameterChanged) {
                    diameterDiff++;
                    resultPoints.push({...p2, color: '#9c27b0', layer: lang === 'ar' ? 'اختلاف القطر' : 'Diameter Diff'}); 
                } else if (geomChanged || attrsChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#f59e0b', layer: lang === 'ar' ? 'تعديل' : 'Modified'}); 
                } else {
                    unchanged++;
                    resultPoints.push({...p2, color: '#94a3b8', layer: lang === 'ar' ? 'بدون تغيير' : 'Unchanged'}); 
                }
            }
        });
        
        map1.forEach((p1, key) => {
            if (!map2.has(key)) {
                deleted++;
                resultPoints.push({...p1, color: '#000000', layer: lang === 'ar' ? 'نقص خطوط' : 'Missing Lines'}); 
            }
        });
        
        setStats({ added, deleted, modified, unchanged, diameterDiff });
        if (setGlobalProgress) setGlobalProgress(100);
        setGlobalPoints(resultPoints);
        setDataId(`compare-${Date.now()}`);
        setLoading(false);
        if (setGlobalLoading) setGlobalLoading(false);
        if (setGlobalProgress) setGlobalProgress(null);
    }, 100);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="p-6 bg-[#0b2d3d] border-b border-white/5 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <GitCompare className="w-6 h-6 text-accent" />
                <h2 className="text-xl font-black">{lang === 'ar' ? 'مقارنة الملفات' : 'File Comparator'}</h2>
            </div>
            <p className="text-white/50 text-xs font-bold max-w-sm text-end">
                {lang === 'ar' ? 'ارفع ملفين (KMZ, DXF, Excel) لمقارنة الفروقات بينهما وإظهار العناصر المضافة، المحذوفة، والمعدلة.' : 'Upload two files to compare differences and highlight added, deleted, and modified elements.'}
            </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black/20 p-6 rounded-[2rem] border border-white/5 space-y-4 relative overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                            <span className="font-black text-sm">1</span>
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-wider">{lang === 'ar' ? 'الملف الأساسي (القديم)' : 'Base File (Old)'}</h3>
                    </div>
                    
                    {!file1Name ? (
                        <label className="cursor-pointer flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-2xl hover:border-accent hover:bg-accent/5 transition-all">
                            <FileUp className="w-8 h-8 text-white/30 mb-3" />
                            <span className="text-xs font-bold text-white/50">{lang === 'ar' ? 'انقر لرفع ملف KMZ/DXF/Excel' : 'Click to upload KMZ/DXF/Excel'}</span>
                            <input type="file" className="hidden" accept=".kmz,.kml,.dxf,.xlsx,.xls,.csv" onChange={(e) => handleFileUpload(e, true)} />
                        </label>
                    ) : (
                        <div className="bg-[#0e3f53] p-4 rounded-2xl flex items-center justify-between border border-white/5">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <FileSpreadsheet className="w-6 h-6 text-blue-400 shrink-0" />
                                <div className="truncate">
                                    <p className="text-sm font-black truncate">{file1Name}</p>
                                    <p className="text-[10px] text-white/50">{points1.length} {lang === 'ar' ? 'عنصر' : 'elements'}</p>
                                </div>
                            </div>
                            <button onClick={() => { setFile1Name(''); setPoints1([]); setStats(null); }} className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    
                    {points1.length > 0 && attributes1.length > 0 && (
                        <div className="pt-2">
                            <label className="text-[10px] font-black text-white/40 uppercase mb-2 block">{lang === 'ar' ? 'مفتاح المقارنة (اختياري)' : 'Comparison Key (Optional)'}</label>
                            <select value={idColumn1} onChange={e => setIdColumn1(e.target.value)} className="w-full bg-[#0b2d3d] text-white text-xs p-3 rounded-xl outline-none border border-white/10">
                                <option value="">{lang === 'ar' ? '-- المطابقة التلقائية (حسب المعرف الداخلي) --' : '-- Auto Match (by Internal ID) --'}</option>
                                {attributes1.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                
                <div className="bg-black/20 p-6 rounded-[2rem] border border-white/5 space-y-4 relative overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                            <span className="font-black text-sm">2</span>
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-wider">{lang === 'ar' ? 'الملف الجديد (المحدث)' : 'New File (Updated)'}</h3>
                    </div>
                    
                    {!file2Name ? (
                        <label className="cursor-pointer flex flex-col items-center justify-center h-40 border-2 border-dashed border-white/10 rounded-2xl hover:border-accent hover:bg-accent/5 transition-all">
                            <FileUp className="w-8 h-8 text-white/30 mb-3" />
                            <span className="text-xs font-bold text-white/50">{lang === 'ar' ? 'انقر لرفع ملف KMZ/DXF/Excel' : 'Click to upload KMZ/DXF/Excel'}</span>
                            <input type="file" className="hidden" accept=".kmz,.kml,.dxf,.xlsx,.xls,.csv" onChange={(e) => handleFileUpload(e, false)} />
                        </label>
                    ) : (
                        <div className="bg-[#0e3f53] p-4 rounded-2xl flex items-center justify-between border border-white/5">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <FileSpreadsheet className="w-6 h-6 text-accent shrink-0" />
                                <div className="truncate">
                                    <p className="text-sm font-black truncate">{file2Name}</p>
                                    <p className="text-[10px] text-white/50">{points2.length} {lang === 'ar' ? 'عنصر' : 'elements'}</p>
                                </div>
                            </div>
                            <button onClick={() => { setFile2Name(''); setPoints2([]); setStats(null); }} className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    
                    {points2.length > 0 && attributes2.length > 0 && (
                        <div className="pt-2">
                            <label className="text-[10px] font-black text-white/40 uppercase mb-2 block">{lang === 'ar' ? 'مفتاح المقارنة (اختياري)' : 'Comparison Key (Optional)'}</label>
                            <select value={idColumn2} onChange={e => setIdColumn2(e.target.value)} className="w-full bg-[#0b2d3d] text-white text-xs p-3 rounded-xl outline-none border border-white/10">
                                <option value="">{lang === 'ar' ? '-- المطابقة التلقائية (حسب المعرف الداخلي) --' : '-- Auto Match (by Internal ID) --'}</option>
                                {attributes2.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex justify-center">
                <button 
                    onClick={compareFiles}
                    disabled={!file1Name || !file2Name || loading}
                    className="bg-accent text-primary font-black py-4 px-12 rounded-2xl flex items-center justify-center gap-3 hover:brightness-110 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    {loading ? <span className="animate-pulse">{lang === 'ar' ? 'جاري المقارنة...' : 'Comparing...'}</span> : (
                        <>
                            <GitCompare className="w-5 h-5" />
                            {lang === 'ar' ? 'مقارنة الملفات' : 'Compare Files'}
                        </>
                    )}
                </button>
            </div>
            
            {stats && (
                <div className="bg-[#0e3f53]/50 p-6 rounded-[2rem] border border-white/5 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-sm font-black uppercase tracking-wider mb-6 text-center">{lang === 'ar' ? 'نتائج المقارنة' : 'Comparison Results'}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-black/30 p-4 rounded-2xl border border-green-500/20 flex flex-col items-center justify-center text-center">
                            <PlusCircle className="w-6 h-6 text-green-500 mb-2" />
                            <span className="text-2xl font-black text-green-500">{stats.added}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'إضافة' : 'Added'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-black/50 flex flex-col items-center justify-center text-center shadow-lg">
                            <XCircle className="w-6 h-6 text-white/60 mb-2" />
                            <span className="text-2xl font-black text-white/80">{stats.deleted}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'نقص خطوط' : 'Missing'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-purple-500/20 flex flex-col items-center justify-center text-center">
                            <Info className="w-6 h-6 text-purple-500 mb-2" />
                            <span className="text-2xl font-black text-purple-500">{stats.diameterDiff || 0}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'اختلاف القطر' : 'Dia. Diff'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-orange-500/20 flex flex-col items-center justify-center text-center">
                            <PenTool className="w-6 h-6 text-orange-500 mb-2" />
                            <span className="text-2xl font-black text-orange-500">{stats.modified}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'تعديل آخر' : 'Modified'}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-slate-500/20 flex flex-col items-center justify-center text-center">
                            <CheckCircle className="w-6 h-6 text-slate-400 mb-2" />
                            <span className="text-2xl font-black text-slate-400">{stats.unchanged}</span>
                            <span className="text-[10px] text-white/50 font-bold uppercase">{lang === 'ar' ? 'متطابق' : 'Matched'}</span>
                        </div>
                    </div>
                </div>
            )}
            
        </div>
    </div>
  );
};
