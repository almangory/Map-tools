import React, { useState, useMemo } from 'react';
import {
  ShieldAlert, X, AlertOctagon, AlertTriangle, CheckCircle2,
  FileSpreadsheet, Filter, Search, Compass, Zap, ArrowDownUp, Check
} from 'lucide-react';
import { GeoPoint } from '../types';
import {
  detectUtilityClashes, exportClashReportExcel,
  ClashDetectionSummary, UtilityClashItem
} from '../services/clashDetectionService';

interface ClashDetectionModalProps {
  lang: 'ar' | 'en';
  points: GeoPoint[];
  onClose: () => void;
  onFocusClash?: (pt: { lat: number; lng: number }) => void;
}

export const ClashDetectionModal: React.FC<ClashDetectionModalProps> = ({
  lang,
  points,
  onClose,
  onFocusClash
}) => {
  const [minClearanceM, setMinClearanceM] = useState<number>(0.50);
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'collision' | 'critical' | 'warning' | 'safe'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Detect clashes
  const clashSummary: ClashDetectionSummary = useMemo(() => {
    return detectUtilityClashes(points, minClearanceM);
  }, [points, minClearanceM]);

  // Filtered clashes
  const filteredClashes = useMemo(() => {
    return clashSummary.clashes.filter(c => {
      const matchSeverity = selectedSeverity === 'all' || c.severity === selectedSeverity;
      const matchSearch =
        searchQuery === '' ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.line1.layer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.line2.layer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.issueDescriptionAr.includes(searchQuery);
      return matchSeverity && matchSearch;
    });
  }, [clashSummary, selectedSeverity, searchQuery]);

  const handleExport = () => {
    exportClashReportExcel(clashSummary, 'Utility_Clash_Audit');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
      <div className="bg-[#0a2330] border border-rose-500/40 rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(244,63,94,0.25)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#071d29] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-400/30 flex items-center justify-center text-rose-300 shadow-inner">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-black text-base md:text-lg flex items-center gap-2">
                {lang === 'ar' ? 'محرك فحص التعارضات الميدانية (Utility Clash Detection Engine)' : 'Utility Clash Detection Engine'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  {lang === 'ar' ? 'فحص ثلاثي الأبعاد 3D' : '3D Spatial Audit'}
                </span>
              </h2>
              <p className="text-[11px] text-rose-200/70 font-medium">
                {lang === 'ar' ? 'التدقيق التلقائي لتقاطعات المياه مع الصرف الصحي، وحساب الخلوص الرأسي (ألا يقل عن 0.50 م مع اشتراط المياه أعلى الصرف).' : 'Audit Water vs Sewer crossings, vertical clearances (min 0.50m) and physical clashes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
              title={lang === 'ar' ? 'تصدير تقرير التعارضات إلى Excel' : 'Export Clashes to Excel'}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تصدير تقرير التعارضات' : 'Export Excel'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-rose-500 hover:text-white text-white/60 rounded-xl transition-colors border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Severity Metrics Bar */}
        <div className="px-6 py-3 bg-[#061721] border-b border-white/5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs shrink-0">
          <button
            onClick={() => setSelectedSeverity('all')}
            className={`p-2.5 rounded-2xl border transition-all ${
              selectedSeverity === 'all' ? 'bg-white/10 border-white/30 text-white font-black shadow' : 'bg-black/20 border-white/5 text-white/60 hover:bg-white/5'
            }`}
          >
            <span className="text-[10px] block opacity-70">{lang === 'ar' ? 'إجمالي التقاطعات' : 'Total Crossings'}</span>
            <span className="font-mono text-base font-black text-white">{clashSummary.totalCrossingsFound}</span>
          </button>

          <button
            onClick={() => setSelectedSeverity('collision')}
            className={`p-2.5 rounded-2xl border transition-all ${
              selectedSeverity === 'collision' ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-black shadow' : 'bg-black/20 border-white/5 text-white/60 hover:bg-rose-950/30'
            }`}
          >
            <span className="text-[10px] block opacity-70">{lang === 'ar' ? 'اصطدام مباشر 💥' : 'Direct Collisions'}</span>
            <span className="font-mono text-base font-black text-rose-400">{clashSummary.collisionCount}</span>
          </button>

          <button
            onClick={() => setSelectedSeverity('critical')}
            className={`p-2.5 rounded-2xl border transition-all ${
              selectedSeverity === 'critical' ? 'bg-red-600/20 border-red-500 text-red-300 font-black shadow' : 'bg-black/20 border-white/5 text-white/60 hover:bg-red-950/30'
            }`}
          >
            <span className="text-[10px] block opacity-70">{lang === 'ar' ? 'خطر تلوث حرج 🚨' : 'Critical Contamination'}</span>
            <span className="font-mono text-base font-black text-red-400">{clashSummary.criticalClashesCount}</span>
          </button>

          <button
            onClick={() => setSelectedSeverity('warning')}
            className={`p-2.5 rounded-2xl border transition-all ${
              selectedSeverity === 'warning' ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-black shadow' : 'bg-black/20 border-white/5 text-white/60 hover:bg-amber-950/30'
            }`}
          >
            <span className="text-[10px] block opacity-70">{lang === 'ar' ? 'خلوص غير كافٍ ⚠️' : 'Insufficient (<0.5m)'}</span>
            <span className="font-mono text-base font-black text-amber-400">{clashSummary.warningCount}</span>
          </button>

          <button
            onClick={() => setSelectedSeverity('safe')}
            className={`p-2.5 rounded-2xl border transition-all ${
              selectedSeverity === 'safe' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-black shadow' : 'bg-black/20 border-white/5 text-white/60 hover:bg-emerald-950/30'
            }`}
          >
            <span className="text-[10px] block opacity-70">{lang === 'ar' ? 'مطابق للكود ✅' : 'Code Compliant'}</span>
            <span className="font-mono text-base font-black text-emerald-400">{clashSummary.safeCount}</span>
          </button>
        </div>

        {/* Filter & Clearance Threshold Control Bar */}
        <div className="px-6 py-2.5 bg-[#081f2c] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-white/70">
              <span className="font-bold">{lang === 'ar' ? 'الحد الأدنى للخلوص الرأسي المعتمد:' : 'Min Vertical Clearance:'}</span>
              <select
                value={minClearanceM}
                onChange={(e) => setMinClearanceM(parseFloat(e.target.value))}
                className="bg-[#0d2f40] border border-cyan-500/40 text-cyan-200 text-xs font-bold rounded-xl px-3 py-1 outline-none"
              >
                <option value={0.30}>0.30 م (30 cm)</option>
                <option value={0.50}>0.50 م (50 cm - كود البناء)</option>
                <option value={0.80}>0.80 م (80 cm)</option>
                <option value={1.00}>1.00 م (100 cm)</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-white/40" />
              <input
                type="text"
                placeholder={lang === 'ar' ? 'بحث بالاسم أو الطبقة أو الوصف...' : 'Search clash by ID or layer...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#05131b] border border-white/10 text-white text-xs rounded-xl pr-8 pl-3 py-1.5 outline-none focus:border-rose-400 w-56"
              />
            </div>
          </div>

          <span className="text-[11px] text-white/50">
            {lang === 'ar' ? `المعروض: ${filteredClashes.length} من أصل ${clashSummary.totalCrossingsFound} تقاطع` : `Showing: ${filteredClashes.length} of ${clashSummary.totalCrossingsFound}`}
          </span>
        </div>

        {/* Clashes List & Resolution Details */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3">
          {filteredClashes.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'لا توجد تعارضات في هذا النطاق' : 'No Clashes Found in This Filter'}</h4>
              <p className="text-xs text-white/50 max-w-md mx-auto">
                {lang === 'ar' ? 'جميع خطوط الشبكة متوافقة مع الخلوص الرأسي المعتمد وتوجيه المياه أعلى الصرف الصحي.' : 'All pipeline crossings comply with vertical separation rules.'}
              </p>
            </div>
          ) : (
            filteredClashes.map((clash, idx) => (
              <div
                key={clash.id}
                className={`p-4 rounded-3xl border transition-all ${
                  clash.severity === 'collision'
                    ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500'
                    : clash.severity === 'critical'
                    ? 'bg-red-950/20 border-red-500/40 hover:border-red-500'
                    : clash.severity === 'warning'
                    ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500'
                    : 'bg-[#05131b] border-white/5 hover:border-emerald-500/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-black text-white/80 bg-white/5 px-2.5 py-1 rounded-xl border border-white/10">
                      #{idx + 1} | {clash.id}
                    </span>
                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border ${
                        clash.severity === 'collision'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : clash.severity === 'critical'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : clash.severity === 'warning'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      {clash.severityLabelAr}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'الخلوص الرأسي ΔZ' : 'Vertical Clearance'}</span>
                      <span className="font-mono text-sm font-black text-cyan-300">{clash.verticalClearanceM} م</span>
                    </div>

                    {onFocusClash && (
                      <button
                        onClick={() => onFocusClash({ lat: clash.intersectionPoint.y, lng: clash.intersectionPoint.x })}
                        className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black text-cyan-300 rounded-xl text-xs font-black transition-all flex items-center gap-1 border border-cyan-500/30"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تكبير على الخريطة' : 'Zoom to Map'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pipes Comparison Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs my-2.5">
                  <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] text-cyan-300 font-bold block">
                      {lang === 'ar' ? 'الخط الأول (Utility 1):' : 'Utility 1:'} {clash.line1.layer}
                    </span>
                    <div className="flex items-center justify-between text-white font-mono">
                      <span>ID: {clash.line1.id}</span>
                      <span>المنسوب: {clash.line1.elevationAtCross} م</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-black/30 border border-white/5 space-y-1">
                    <span className="text-[10px] text-amber-300 font-bold block">
                      {lang === 'ar' ? 'الخط الثاني (Utility 2):' : 'Utility 2:'} {clash.line2.layer}
                    </span>
                    <div className="flex items-center justify-between text-white font-mono">
                      <span>ID: {clash.line2.id}</span>
                      <span>المنسوب: {clash.line2.elevationAtCross} م</span>
                    </div>
                  </div>
                </div>

                {/* Description & Recommended Solution */}
                <div className="space-y-1.5 pt-1 text-xs">
                  <p className="text-white/90 font-medium">
                    <strong className="text-rose-400">{lang === 'ar' ? 'وصف المشكلة: ' : 'Issue: '}</strong>
                    {clash.issueDescriptionAr}
                  </p>
                  <p className="text-emerald-300/90 font-medium bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/20">
                    <strong className="text-emerald-400">{lang === 'ar' ? '💡 التوصية الهندسية للعلاج: ' : '💡 Recommendation: '}</strong>
                    {clash.recommendationAr}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#071d29] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-white/50">
            {lang === 'ar' ? 'فحص التعارضات متطابق مع كود البناء السعودي (SBC) واشتراطات شركة المياه الوطنية.' : 'Clash detection complies with Saudi Building Code & NWC specifications.'}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
