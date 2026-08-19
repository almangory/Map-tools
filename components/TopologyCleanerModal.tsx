import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Sliders, RefreshCw, X, ShieldAlert, ArrowRight, Activity } from 'lucide-react';
import { GeoPoint } from '../types';
import { calculatePathLength } from '../services/kmlService';

interface Props {
  lang: 'ar' | 'en';
  isOpen: boolean;
  onClose: () => void;
  points: GeoPoint[];
  onApplyCleanedPoints: (cleaned: GeoPoint[]) => void;
}

export const TopologyCleanerModal: React.FC<Props> = ({ lang, isOpen, onClose, points, onApplyCleanedPoints }) => {
  const [snapToleranceMeters, setSnapToleranceMeters] = useState(0.25); // 25 cm default
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [autoOrientGravity, setAutoOrientGravity] = useState(true);
  const [removeDangles, setRemoveDangles] = useState(true);
  const [cleanedStats, setCleanedStats] = useState<{
    duplicatesRemoved: number;
    gapsSnapped: number;
    slopesOriented: number;
    danglesRemoved: number;
  } | null>(null);

  if (!isOpen) return null;

  const runTopologyCleaning = () => {
    let dupCount = 0;
    let gapCount = 0;
    let slopeCount = 0;
    let dangleCount = 0;

    const cleanedPoints: GeoPoint[] = [];

    // 1. Process vertices and remove duplicates
    for (const pt of points) {
      if (pt.type === 'LineString' && pt.path && pt.path.length >= 2) {
        let path = [...pt.path];
        
        if (removeDuplicates) {
          const newPath = [path[0]];
          for (let i = 1; i < path.length; i++) {
            const prev = newPath[newPath.length - 1];
            const curr = path[i];
            const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)) * 111000;
            if (dist > 0.05) { // More than 5cm
              newPath.push(curr);
            } else {
              dupCount++;
            }
          }
          path = newPath;
        }

        // Check if length is zero or dangling
        const len = calculatePathLength(path);
        if (removeDangles && (path.length < 2 || len < 0.20)) {
          dangleCount++;
          continue;
        }

        // 2. Auto-orient gravity pipes (downstream should have lower invert level)
        if (autoOrientGravity && path.length >= 2) {
          const startZ = path[0].z || pt.groundLevel || 0;
          const endZ = path[path.length - 1].z || pt.invertLevel || 0;
          if (startZ < endZ && startZ > 0 && endZ > 0) {
            path.reverse();
            slopeCount++;
          }
        }

        cleanedPoints.push({
          ...pt,
          path,
          originalLength: calculatePathLength(path)
        });
      } else {
        cleanedPoints.push(pt);
      }
    }

    // 3. Gap snapping across endpoints
    const toleranceDeg = snapToleranceMeters / 111000;
    const endpoints: { ptIndex: number; isStart: boolean; x: number; y: number }[] = [];

    cleanedPoints.forEach((pt, idx) => {
      if (pt.type === 'LineString' && pt.path && pt.path.length >= 2) {
        endpoints.push({ ptIndex: idx, isStart: true, x: pt.path[0].x, y: pt.path[0].y });
        endpoints.push({ ptIndex: idx, isStart: false, x: pt.path[pt.path.length - 1].x, y: pt.path[pt.path.length - 1].y });
      }
    });

    for (let i = 0; i < endpoints.length; i++) {
      for (let j = i + 1; j < endpoints.length; j++) {
        const p1 = endpoints[i];
        const p2 = endpoints[j];
        if (p1.ptIndex === p2.ptIndex) continue;

        const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        if (dist > 0 && dist <= toleranceDeg) {
          // Snap p2 to p1
          const targetPt = cleanedPoints[p2.ptIndex];
          if (targetPt.path) {
            if (p2.isStart) {
              targetPt.path[0] = { ...targetPt.path[0], x: p1.x, y: p1.y };
            } else {
              targetPt.path[targetPt.path.length - 1] = { ...targetPt.path[targetPt.path.length - 1], x: p1.x, y: p1.y };
            }
            gapCount++;
          }
        }
      }
    }

    setCleanedStats({
      duplicatesRemoved: dupCount,
      gapsSnapped: gapCount,
      slopesOriented: slopeCount,
      danglesRemoved: dangleCount
    });

    onApplyCleanedPoints(cleanedPoints);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {lang === 'ar' ? 'المعالج الطوبولوجي الذكي وتصحيح الشبكات' : 'Smart Topology Auto-Cleaner'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'إصلاح عيوب مخططات الـ CAD والمساحة (إغلاق الفجوات، حذف النقاط المكررة، وضبط الميول)' : 'Clean duplicate vertices, close network gaps & heal topology'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
          
          {/* Options */}
          <div className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-200">إغلاق الفجوات الدقيقة بين الأنابيب (Snap Tolerance):</div>
                <div className="text-slate-400 text-[11px]">التقاط نهايات الأنابيب القريبة وربطها بنفس نقطة المنهول المشترك.</div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  step="0.05"
                  min="0.05"
                  max="2.00"
                  value={snapToleranceMeters} 
                  onChange={e => setSnapToleranceMeters(Number(e.target.value))}
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-center font-mono text-cyan-300"
                />
                <span className="text-slate-400">متر</span>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-700/40">
              <input 
                type="checkbox" 
                checked={removeDuplicates} 
                onChange={e => setRemoveDuplicates(e.target.checked)} 
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-slate-900 border-slate-700" 
              />
              <div>
                <div className="font-bold text-slate-200">حذف النقاط والرؤوس المكررة (Duplicate Vertices):</div>
                <div className="text-slate-400 text-[11px]">إزالة الرؤوس المتراكبة على بعد أقل من 5 سم لتقليل حجم الملف.</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-700/40">
              <input 
                type="checkbox" 
                checked={autoOrientGravity} 
                onChange={e => setAutoOrientGravity(e.target.checked)} 
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-slate-900 border-slate-700" 
              />
              <div>
                <div className="font-bold text-slate-200">ضبط اتجاه الجاذبية تلقائياً (Downstream Orientation):</div>
                <div className="text-slate-400 text-[11px]">عكس مسار الخط إذا كان اتجاه الرسم عكس انحدار المنسوب الطبيعي.</div>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-700/40">
              <input 
                type="checkbox" 
                checked={removeDangles} 
                onChange={e => setRemoveDangles(e.target.checked)} 
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-slate-900 border-slate-700" 
              />
              <div>
                <div className="font-bold text-slate-200">حذف الخطوط الصفرية والشاذة (Zero-Length Dangles):</div>
                <div className="text-slate-400 text-[11px]">تنظيف الشناكل والزوائد الناتجة عن أخطاء التصدير من الأوتوكاد.</div>
              </div>
            </label>
          </div>

          {/* Results Badge */}
          {cleanedStats && (
            <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 space-y-2 animate-in fade-in">
              <div className="font-bold flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-teal-400" />
                تمت معالجة وتصحيح طوبولوجيا الشبكة بنجاح!
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="font-bold text-white text-base">{cleanedStats.gapsSnapped}</div>
                  <div className="text-slate-400 text-[10px]">فجوة تم إغلاقها</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="font-bold text-white text-base">{cleanedStats.duplicatesRemoved}</div>
                  <div className="text-slate-400 text-[10px]">نقطة مكررة حُذفت</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="font-bold text-white text-base">{cleanedStats.slopesOriented}</div>
                  <div className="text-slate-400 text-[10px]">خط عُكس اتجاهه</div>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-lg">
                  <div className="font-bold text-white text-base">{cleanedStats.danglesRemoved}</div>
                  <div className="text-slate-400 text-[10px]">خط شاذ حُذف</div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition">
            إغلاق
          </button>
          <button 
            onClick={runTopologyCleaning}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold shadow-lg shadow-teal-600/30 flex items-center gap-2 transition"
          >
            <Sparkles className="w-4 h-4" />
            بدء المعالجة والتنظيف الفوري ✨
          </button>
        </div>

      </div>
    </div>
  );
};
