import React, { useState, useMemo } from 'react';
import { Layers, Maximize, FileText, Mountain, Map, Download, BarChart3, Loader2 } from 'lucide-react';
import { GeoPoint, BaseMapType } from '../types';
import { cn } from '../utils';

interface MapViewerProps {
  lang: 'ar' | 'en';
  points: GeoPoint[];
  globalBaseMap: BaseMapType;
  setGlobalBaseMap: (map: BaseMapType) => void;
  focusedPoint: GeoPoint | null;
  setFocusedPoint: (p: GeoPoint | null) => void;
  layerOpacity: number;
  setLayerOpacity: (val: number) => void;
  is3DMode: boolean;
  setIs3DMode: (val: boolean) => void;
  onGenerateReport: () => void;
  isGeneratingReport: boolean;
}

export const MapViewer: React.FC<MapViewerProps> = ({
  lang,
  points,
  globalBaseMap,
  setGlobalBaseMap,
  focusedPoint,
  setFocusedPoint,
  layerOpacity,
  setLayerOpacity,
  is3DMode,
  setIs3DMode,
  onGenerateReport,
  isGeneratingReport
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'table' | 'layers'>('dashboard');

  const stats = useMemo(() => {
    let totalLineLength = 0;
    let totalPolygonArea = 0; // we don't have turf area easily accessible here without import, let's estimate or skip
    let maxZ = -Infinity;
    let minZ = Infinity;

    points.forEach(p => {
      // Calculate length if LineString
      if (p.type === 'LineString' && p.path) {
         let len = 0;
         for (let i = 0; i < p.path.length - 1; i++) {
           const p1 = p.path[i];
           const p2 = p.path[i+1];
           // Simple Haversine approximation or just count path length
           const R = 6371e3; // metres
           const φ1 = p1.y * Math.PI/180;
           const φ2 = p2.y * Math.PI/180;
           const Δφ = (p2.y-p1.y) * Math.PI/180;
           const Δλ = (p2.x-p1.x) * Math.PI/180;
           const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                     Math.cos(φ1) * Math.cos(φ2) *
                     Math.sin(Δλ/2) * Math.sin(Δλ/2);
           const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
           len += R * c;
         }
         totalLineLength += len;
      }

      // Check Z values
      const checkZ = (z?: number) => {
        if (z !== undefined && z !== null && !isNaN(z)) {
          if (z > maxZ) maxZ = z;
          if (z < minZ) minZ = z;
        }
      };
      checkZ(p.z);
      if (p.path) {
        p.path.forEach(v => checkZ(v.z));
      }
    });

    return {
      totalLines: totalLineLength,
      count: points.length,
      maxElevation: maxZ === -Infinity ? null : maxZ,
      minElevation: minZ === Infinity ? null : minZ
    };
  }, [points]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-[#0b2d3d]/40 p-2 rounded-[1.8rem] border border-white/5 flex gap-2">
        <button onClick={() => setActiveSubTab('dashboard')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all", activeSubTab === 'dashboard' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>
          {lang === 'ar' ? 'لوحة الملخص' : 'Dashboard'}
        </button>
        <button onClick={() => setActiveSubTab('table')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all", activeSubTab === 'table' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>
          {lang === 'ar' ? 'جدول البيانات' : 'Attribute Table'}
        </button>
        <button onClick={() => setActiveSubTab('layers')} className={cn("flex-1 py-3 rounded-[1.5rem] text-[11px] font-black transition-all", activeSubTab === 'layers' ? "bg-accent text-primary shadow-xl" : "text-white/40 hover:text-white")}>
          {lang === 'ar' ? 'أدوات الرؤية' : 'View Tools'}
        </button>
      </div>

      {activeSubTab === 'dashboard' && (
        <div className="bg-[#0b2d3d]/40 p-6 rounded-[2rem] border border-white/5 space-y-6">
          <div className="flex items-center gap-2 mb-2">
             <BarChart3 className="w-5 h-5 text-accent" />
             <h3 className="text-white font-black">{lang === 'ar' ? 'إحصائيات الملف المرفوع' : 'Uploaded File Stats'}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
               <div className="text-[10px] text-white/50 mb-1">{lang === 'ar' ? 'عدد العناصر' : 'Total Elements'}</div>
               <div className="text-xl font-black text-accent">{stats.count.toLocaleString()}</div>
            </div>
            <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
               <div className="text-[10px] text-white/50 mb-1">{lang === 'ar' ? 'إجمالي أطوال الخطوط' : 'Total Lines Length'}</div>
               <div className="text-xl font-black text-emerald-400">{(stats.totalLines / 1000).toFixed(2)} <span className="text-[10px]">{lang === 'ar' ? 'كم' : 'km'}</span></div>
            </div>
            <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
               <div className="text-[10px] text-white/50 mb-1">{lang === 'ar' ? 'أقصى ارتفاع' : 'Max Elevation'}</div>
               <div className="text-xl font-black text-rose-400">{stats.maxElevation !== null ? stats.maxElevation.toFixed(2) : '-'} <span className="text-[10px]">{lang === 'ar' ? 'متر' : 'm'}</span></div>
            </div>
            <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
               <div className="text-[10px] text-white/50 mb-1">{lang === 'ar' ? 'أدنى ارتفاع' : 'Min Elevation'}</div>
               <div className="text-xl font-black text-blue-400">{stats.minElevation !== null ? stats.minElevation.toFixed(2) : '-'} <span className="text-[10px]">{lang === 'ar' ? 'متر' : 'm'}</span></div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'table' && (
        <div className="bg-[#0b2d3d]/40 p-4 rounded-[2rem] border border-white/5">
          <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'المعرف' : 'ID'}</th>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'الطبقة' : 'Layer'}</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 100).map((p, i) => (
                  <tr key={i} onClick={() => setFocusedPoint(p)} className={cn("cursor-pointer hover:bg-white/5 transition-colors", focusedPoint?.id === p.id ? "bg-accent/20" : "")}>
                    <td className="border-b border-white/5 p-2 text-white font-bold">{p.id}</td>
                    <td className="border-b border-white/5 p-2 text-white/80">{p.type}</td>
                    <td className="border-b border-white/5 p-2 text-white/80">{p.layer || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {points.length > 100 && (
              <div className="text-center p-3 text-white/40 text-[10px]">
                {lang === 'ar' ? 'يتم عرض أول 100 عنصر فقط للسرعة.' : 'Only first 100 elements shown for performance.'}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'layers' && (
        <div className="bg-[#0b2d3d]/40 p-6 rounded-[2rem] border border-white/5 space-y-6">
          
          <div className="space-y-3">
             <label className="text-[11px] font-black text-white/80 flex items-center justify-between">
                <span>{lang === 'ar' ? 'شفافية الخريطة المرفوعة (Opacity)' : 'Uploaded Layer Opacity'}</span>
                <span className="text-accent">{Math.round(layerOpacity * 100)}%</span>
             </label>
             <input type="range" min="0" max="1" step="0.05" value={layerOpacity} onChange={(e) => setLayerOpacity(parseFloat(e.target.value))} className="w-full h-2 bg-black/40 rounded-full appearance-none cursor-pointer" />
          </div>

          <div className="space-y-3 pt-4 border-t border-white/5">
             <label className="text-[11px] font-black text-white/80">{lang === 'ar' ? 'وضع التجسيد والارتفاعات (3D Terrain)' : '3D Terrain & Pitch'}</label>
             <button onClick={() => setIs3DMode(!is3DMode)} className={cn("w-full py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2", is3DMode ? "bg-accent text-primary shadow-lg" : "bg-white/5 text-white/40 hover:text-white border border-white/10")}>
                <Mountain className="w-4 h-4" />
                {lang === 'ar' ? 'تفعيل وضع التجسيد ثلاثي الأبعاد 3D' : 'Toggle 3D Terrain View'}
             </button>
          </div>
          
          <div className="space-y-3 pt-4 border-t border-white/5">
             <label className="text-[11px] font-black text-white/80">{lang === 'ar' ? 'مُولد الكروكيات والتقارير (Snapshots)' : 'Report & Snapshot Generator'}</label>
             <button onClick={onGenerateReport} disabled={isGeneratingReport} className="w-full bg-[#0e3f53] hover:bg-accent hover:text-primary text-accent border border-accent/20 py-3 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2">
                {isGeneratingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {lang === 'ar' ? 'تصدير تقرير معاينة (PDF)' : 'Export Snapshot Report (PDF)'}
             </button>
          </div>

        </div>
      )}

    </div>
  );
};
