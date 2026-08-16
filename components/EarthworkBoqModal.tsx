import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet, X, Calculator, Download, Sliders, Layers,
  CheckCircle2, DollarSign, Pickaxe, HardHat, TrendingUp, Info
} from 'lucide-react';
import { GeoPoint, PipeHydraulicData } from '../types';
import {
  TrenchParameters, DEFAULT_TRENCH_PARAMS, calculateEarthworkBOQ,
  exportEarthworkBOQExcel, EarthworkBOQSummary
} from '../services/earthworkService';

interface EarthworkBoqModalProps {
  lang: 'ar' | 'en';
  points: GeoPoint[];
  hydraulicMap?: Map<string | number, PipeHydraulicData> | null;
  onClose: () => void;
}

export const EarthworkBoqModal: React.FC<EarthworkBoqModalProps> = ({
  lang,
  points,
  hydraulicMap,
  onClose
}) => {
  const [params, setParams] = useState<TrenchParameters>({ ...DEFAULT_TRENCH_PARAMS });
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'depths' | 'settings'>('summary');

  // Compute BOQ
  const boq: EarthworkBOQSummary = useMemo(() => {
    return calculateEarthworkBOQ(points, hydraulicMap, params);
  }, [points, hydraulicMap, params]);

  const handleExport = () => {
    exportEarthworkBOQExcel(boq, 'Network_Earthwork_BOQ');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
      <div className="bg-[#0a2330] border border-amber-500/40 rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(245,158,11,0.25)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#071d29] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-inner">
              <Pickaxe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-black text-base md:text-lg flex items-center gap-2">
                {lang === 'ar' ? 'حساب كميات الحفر والردم وجدول الكميات (Earthwork BOQ Engine)' : 'Earthwork Quantities & BOQ Calculation Engine'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {lang === 'ar' ? 'حسابات هندسية آلية' : 'Automated BOQ'}
                </span>
              </h2>
              <p className="text-[11px] text-amber-200/70 font-medium">
                {lang === 'ar' ? 'حساب حجم الحفر، فرشة الرمل، الردم، قطع السفلتة، وتصنيف بنود الحفر حسب فئات الأعماق.' : 'Calculate excavation volume, bedding sand, backfilling, asphalt cutting & depth-classified BOQ.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
              title={lang === 'ar' ? 'تصدير جدول الكميات إلى ملف Excel كامل' : 'Export Full BOQ to Excel'}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تصدير Excel فوري' : 'Export Excel'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-rose-500 hover:text-white text-white/60 rounded-xl transition-colors border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="px-6 py-2.5 bg-[#061721] border-b border-white/5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'summary' ? 'bg-amber-500 text-black shadow' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'ملخص جدول الكميات (BOQ)' : 'BOQ Summary'}</span>
            </button>
            <button
              onClick={() => setActiveTab('depths')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'depths' ? 'bg-amber-500 text-black shadow' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تصنيف فئات الأعماق' : 'Depth Ranges'}</span>
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'details' ? 'bg-amber-500 text-black shadow' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تفاصيل كل ماسورة' : 'Pipe Details'}</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeTab === 'settings' ? 'bg-amber-500 text-black shadow' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'معايير وأسعار الخندق' : 'Unit Rates & Specs'}</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-amber-300/80 hidden sm:block">
            {lang === 'ar' ? `إجمالي الأنابيب: ${boq.totalPipesCount} خط (${boq.totalLengthM} م)` : `Total: ${boq.totalPipesCount} pipes (${boq.totalLengthM}m)`}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'إجمالي حجم الحفر' : 'Excavation Vol.'}</span>
              <span className="font-mono text-lg font-black text-amber-400">{boq.totalExcavationM3.toLocaleString()} <span className="text-xs font-normal">م³</span></span>
            </div>
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'طبقة الرمل (Bedding)' : 'Bedding Sand'}</span>
              <span className="font-mono text-lg font-black text-yellow-300">{boq.totalBeddingM3.toLocaleString()} <span className="text-xs font-normal">م³</span></span>
            </div>
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'إجمالي حجم الردم' : 'Total Backfill'}</span>
              <span className="font-mono text-lg font-black text-emerald-400">{boq.totalBackfillM3.toLocaleString()} <span className="text-xs font-normal">م³</span></span>
            </div>
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'قطع وإعادة سفلتة' : 'Asphalt Area'}</span>
              <span className="font-mono text-lg font-black text-cyan-400">{boq.totalAsphaltAreaM2.toLocaleString()} <span className="text-xs font-normal">م²</span></span>
            </div>
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'متوسط عمق الحفر' : 'Avg Depth'}</span>
              <span className="font-mono text-lg font-black text-white">{boq.avgDepthM} <span className="text-xs font-normal">م</span></span>
            </div>
            <div className="bg-[#05131b] p-3.5 rounded-2xl border border-amber-500/20 flex flex-col justify-between bg-amber-950/20">
              <span className="text-[10px] text-amber-300 block font-bold">{lang === 'ar' ? 'التكلفة الإجمالية التقديرية' : 'Grand Total Cost'}</span>
              <span className="font-mono text-lg font-black text-amber-300">{boq.grandTotalCost.toLocaleString()} <span className="text-xs font-normal">ر.س</span></span>
            </div>
          </div>

          {/* TAB 1: SUMMARY BOQ TABLE */}
          {activeTab === 'summary' && (
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  {lang === 'ar' ? 'جدول حصر الكميات والمقايسة التقديرية (Bill of Quantities - BOQ)' : 'Bill of Quantities (BOQ)'}
                </h3>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-[#092230] text-white/70 font-black text-[10px] uppercase">
                    <tr>
                      <th className="p-3 text-start">{lang === 'ar' ? 'رقم البند' : 'Item'}</th>
                      <th className="p-3 text-start">{lang === 'ar' ? 'بيان الأعمال والوصف الهندسي للمواصفة' : 'Description'}</th>
                      <th className="p-3 text-center">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'الكمية المحصورة' : 'Quantity'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'سعر الوحدة (ر.س)' : 'Unit Rate (SAR)'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'الإجمالي التقديري (ر.س)' : 'Total (SAR)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-400">1.0</td>
                      <td className="p-3 font-medium">
                        {lang === 'ar' ? 'أعمال الحفر في جميع أنواع التربة لمسارات الأنابيب وتجهيز قاع الخندق بالميول المطلوبة والتخلص من نواتج الحفر الزائدة.' : 'Excavation in all types of soil for pipeline trenches to required depths and slopes.'}
                      </td>
                      <td className="p-3 text-center font-bold text-cyan-300">م³ (m³)</td>
                      <td className="p-3 text-end font-mono font-black text-white">{boq.totalExcavationM3.toLocaleString()}</td>
                      <td className="p-3 text-end font-mono text-white/70">{params.unitCosts?.excavationPerM3}</td>
                      <td className="p-3 text-end font-mono font-bold text-amber-300">{boq.totalExcavationCost.toLocaleString()}</td>
                    </tr>

                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-400">2.0</td>
                      <td className="p-3 font-medium">
                        {lang === 'ar' ? 'توريد وفرش ودك طبقة رمل نظيف متدرج (Bedding Sand) أسفل وحول الأنبوب بسماكة لا تقل عن 15 سم مع الردم حول الأكتاف.' : 'Supply, lay and compact graded bedding sand under and around pipes (15cm thickness).'}
                      </td>
                      <td className="p-3 text-center font-bold text-cyan-300">م³ (m³)</td>
                      <td className="p-3 text-end font-mono font-black text-white">{boq.totalBeddingM3.toLocaleString()}</td>
                      <td className="p-3 text-end font-mono text-white/70">{params.unitCosts?.beddingSandPerM3}</td>
                      <td className="p-3 text-end font-mono font-bold text-amber-300">{boq.totalBeddingCost.toLocaleString()}</td>
                    </tr>

                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-400">3.0</td>
                      <td className="p-3 font-medium">
                        {lang === 'ar' ? 'أعمال الردم العام بمواد صالحة مدموكة على طبقات لا تتجاوز 25 سم بنسبة دك لا تقل عن 95% حتى منسوب طبقات الرصف.' : 'General backfilling with selected approved soil compacted in 25cm layers (>= 95% compaction).'}
                      </td>
                      <td className="p-3 text-center font-bold text-cyan-300">م³ (m³)</td>
                      <td className="p-3 text-end font-mono font-black text-white">{boq.totalBackfillM3.toLocaleString()}</td>
                      <td className="p-3 text-end font-mono text-white/70">{params.unitCosts?.backfillPerM3}</td>
                      <td className="p-3 text-end font-mono font-bold text-amber-300">{boq.totalBackfillCost.toLocaleString()}</td>
                    </tr>

                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-amber-400">4.0</td>
                      <td className="p-3 font-medium">
                        {lang === 'ar' ? 'أعمال قص وإعادة طبقات الأسفلت السطحية والأساسية (Surface & Base Course) وإعادة الوضع إلى ما كان عليه.' : 'Asphalt road surface cutting, base-course restoration and final reinstatement.'}
                      </td>
                      <td className="p-3 text-center font-bold text-cyan-300">م² (m²)</td>
                      <td className="p-3 text-end font-mono font-black text-white">{boq.totalAsphaltAreaM2.toLocaleString()}</td>
                      <td className="p-3 text-end font-mono text-white/70">{params.unitCosts?.asphaltPerM2}</td>
                      <td className="p-3 text-end font-mono font-bold text-amber-300">{boq.totalAsphaltCost.toLocaleString()}</td>
                    </tr>

                    {/* Total Row */}
                    <tr className="bg-amber-500/15 font-black text-amber-300">
                      <td colSpan={5} className="p-3 text-start text-xs uppercase">
                        {lang === 'ar' ? 'إجمالي القيمة التقديرية للمشروع (Grand Total):' : 'Grand Total Estimated Cost:'}
                      </td>
                      <td className="p-3 text-end font-mono text-sm font-black text-amber-300">
                        {boq.grandTotalCost.toLocaleString()} ر.س
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: DEPTH-CLASSIFIED BOQ */}
          {activeTab === 'depths' && (
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    {lang === 'ar' ? 'حصر كميات الحفر حسب فئات الأعماق القياسية (Depth Ranges Breakdown)' : 'Excavation Breakdown by Depth Ranges'}
                  </h3>
                  <p className="text-[11px] text-white/50">
                    {lang === 'ar' ? 'توزع الأطوال والكميات طبقاً لمواصفات وزارة الشؤون البلدية والقروية وكود المقايسات.' : 'Distribution of pipe lengths and excavation volumes by standard depth categories.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[#092230] border border-cyan-500/20 space-y-2">
                  <span className="text-xs font-bold text-cyan-300 block">{lang === 'ar' ? 'عمق 0.0 - 1.5 م (حفر سطحي)' : 'Depth 0.0 - 1.5m'}</span>
                  <div className="text-sm font-mono font-black text-white">{boq.depthClassifiedBOQ.depth0to1_5.volumeM3.toLocaleString()} م³</div>
                  <div className="text-[11px] text-white/60 flex justify-between">
                    <span>{boq.depthClassifiedBOQ.depth0to1_5.lengthM} م</span>
                    <span>{boq.depthClassifiedBOQ.depth0to1_5.count} ماسورة</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#092230] border border-emerald-500/20 space-y-2">
                  <span className="text-xs font-bold text-emerald-300 block">{lang === 'ar' ? 'عمق 1.5 - 3.0 م (حفر عادي)' : 'Depth 1.5 - 3.0m'}</span>
                  <div className="text-sm font-mono font-black text-white">{boq.depthClassifiedBOQ.depth1_5to3_0.volumeM3.toLocaleString()} م³</div>
                  <div className="text-[11px] text-white/60 flex justify-between">
                    <span>{boq.depthClassifiedBOQ.depth1_5to3_0.lengthM} م</span>
                    <span>{boq.depthClassifiedBOQ.depth1_5to3_0.count} ماسورة</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#092230] border border-amber-500/20 space-y-2">
                  <span className="text-xs font-bold text-amber-300 block">{lang === 'ar' ? 'عمق 3.0 - 5.0 م (حفر عميق)' : 'Depth 3.0 - 5.0m'}</span>
                  <div className="text-sm font-mono font-black text-white">{boq.depthClassifiedBOQ.depth3_0to5_0.volumeM3.toLocaleString()} م³</div>
                  <div className="text-[11px] text-white/60 flex justify-between">
                    <span>{boq.depthClassifiedBOQ.depth3_0to5_0.lengthM} م</span>
                    <span>{boq.depthClassifiedBOQ.depth3_0to5_0.count} ماسورة</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#092230] border border-rose-500/20 space-y-2">
                  <span className="text-xs font-bold text-rose-300 block">{lang === 'ar' ? 'عمق > 5.0 م (حفر حرج / سند)' : 'Depth > 5.0m (Critical)'}</span>
                  <div className="text-sm font-mono font-black text-white">{boq.depthClassifiedBOQ.depthAbove5_0.volumeM3.toLocaleString()} م³</div>
                  <div className="text-[11px] text-white/60 flex justify-between">
                    <span>{boq.depthClassifiedBOQ.depthAbove5_0.lengthM} م</span>
                    <span>{boq.depthClassifiedBOQ.depthAbove5_0.count} ماسورة</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PER-PIPE DETAILS */}
          {activeTab === 'details' && (
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  {lang === 'ar' ? 'جدول الحصر التفصيلي لكل ماسورة (Individual Pipe Breakdown)' : 'Pipe Level Quantities'}
                </h3>
              </div>

              <div className="max-h-72 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-[#092230] text-white/70 sticky top-0 font-black text-[10px] uppercase">
                    <tr>
                      <th className="p-3 text-start">ID</th>
                      <th className="p-3 text-start">{lang === 'ar' ? 'الطبقة' : 'Layer'}</th>
                      <th className="p-3 text-center">{lang === 'ar' ? 'القطر' : 'Dia (mm)'}</th>
                      <th className="p-3 text-center">{lang === 'ar' ? 'الطول (م)' : 'Length (m)'}</th>
                      <th className="p-3 text-center">{lang === 'ar' ? 'متوسط العمق' : 'Avg Depth'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'حجم الحفر (م³)' : 'Excavation (m³)'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'رمل (م³)' : 'Bedding (m³)'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'ردم (م³)' : 'Backfill (m³)'}</th>
                      <th className="p-3 text-end">{lang === 'ar' ? 'سفلتة (م²)' : 'Asphalt (m²)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    {boq.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3 font-mono font-bold text-amber-400">{it.id}</td>
                        <td className="p-3 text-white/60">{it.layer}</td>
                        <td className="p-3 text-center font-bold text-accent">{it.diameterMm}</td>
                        <td className="p-3 text-center font-mono">{it.lengthM}</td>
                        <td className="p-3 text-center font-mono">{it.avgDepth} م</td>
                        <td className="p-3 text-end font-mono font-bold text-white">{it.excavationVolumeM3}</td>
                        <td className="p-3 text-end font-mono text-yellow-300">{it.beddingVolumeM3}</td>
                        <td className="p-3 text-end font-mono text-emerald-300">{it.ordinaryBackfillVolumeM3}</td>
                        <td className="p-3 text-end font-mono text-cyan-300">{it.asphaltCuttingAreaM2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS & UNIT RATES */}
          {activeTab === 'settings' && (
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-4">
              <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                {lang === 'ar' ? 'تخصيص معايير الخندق وأسعار البنود التقديرية' : 'Trench Parameters & Unit Costs'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="text-white/70 font-bold block">{lang === 'ar' ? 'سماكة فرشة الرمل (متر)' : 'Bedding Thickness (m)'}</label>
                  <input
                    type="number"
                    step="0.05"
                    value={params.beddingThicknessM}
                    onChange={(e) => setParams({ ...params, beddingThicknessM: parseFloat(e.target.value) || 0.15 })}
                    className="w-full bg-[#0d2f40] border border-white/10 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/70 font-bold block">{lang === 'ar' ? 'سعر م³ الحفر (ر.س)' : 'Excavation Rate (SAR/m³)'}</label>
                  <input
                    type="number"
                    value={params.unitCosts?.excavationPerM3}
                    onChange={(e) => setParams({
                      ...params,
                      unitCosts: { ...params.unitCosts!, excavationPerM3: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full bg-[#0d2f40] border border-white/10 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/70 font-bold block">{lang === 'ar' ? 'سعر م³ الرمل (ر.س)' : 'Bedding Rate (SAR/m³)'}</label>
                  <input
                    type="number"
                    value={params.unitCosts?.beddingSandPerM3}
                    onChange={(e) => setParams({
                      ...params,
                      unitCosts: { ...params.unitCosts!, beddingSandPerM3: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full bg-[#0d2f40] border border-white/10 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/70 font-bold block">{lang === 'ar' ? 'سعر م³ الردم (ر.س)' : 'Backfill Rate (SAR/m³)'}</label>
                  <input
                    type="number"
                    value={params.unitCosts?.backfillPerM3}
                    onChange={(e) => setParams({
                      ...params,
                      unitCosts: { ...params.unitCosts!, backfillPerM3: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full bg-[#0d2f40] border border-white/10 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-white/70 font-bold block">{lang === 'ar' ? 'سعر م² إعادة السفلتة (ر.س)' : 'Asphalt Rate (SAR/m²)'}</label>
                  <input
                    type="number"
                    value={params.unitCosts?.asphaltPerM2}
                    onChange={(e) => setParams({
                      ...params,
                      unitCosts: { ...params.unitCosts!, asphaltPerM2: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full bg-[#0d2f40] border border-white/10 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#071d29] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-white/50">
            {lang === 'ar' ? 'حسابات الكميات مطابقة للمواصفات القياسية لأعمال البنية التحتية.' : 'Quantities computed according to civil infrastructure standard codes.'}
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
