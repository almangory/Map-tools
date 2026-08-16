import React, { useState, useMemo } from 'react';
import {
  AlertTriangle, X, Waves, ShieldAlert, Timer, Droplets,
  Truck, Zap, Compass, CheckCircle2, Play, RefreshCw, Layers
} from 'lucide-react';
import { GeoPoint, PipeHydraulicData } from '../types';
import {
  simulateLiftStationOverflow,
  OverflowSimulationResult,
  LiftStationSimulationConfig
} from '../services/overflowSimulationService';

interface OverflowSimulationModalProps {
  lang: 'ar' | 'en';
  points: GeoPoint[];
  hydraulicMap?: Map<string | number, PipeHydraulicData> | null;
  onClose: () => void;
  onFocusManhole?: (pt: { lat: number; lng: number }) => void;
}

export const OverflowSimulationModal: React.FC<OverflowSimulationModalProps> = ({
  lang,
  points,
  hydraulicMap,
  onClose,
  onFocusManhole
}) => {
  const [wetWellCapacity, setWetWellCapacity] = useState<number>(25); // m³
  const [averageInflow, setAverageInflow] = useState<number>(35); // L/s
  const [tankerCapacity, setTankerCapacity] = useState<number>(32); // m³

  // Run simulation
  const simResult: OverflowSimulationResult | null = useMemo(() => {
    return simulateLiftStationOverflow(points, hydraulicMap, {
      wetWellCapacityM3: wetWellCapacity,
      averageInflowLs: averageInflow,
      emergencyTankerCapacityM3: tankerCapacity
    });
  }, [points, hydraulicMap, wetWellCapacity, averageInflow, tankerCapacity]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300">
      <div className="bg-[#0a2330] border border-orange-500/40 rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(249,115,22,0.25)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#071d29] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-400/30 flex items-center justify-center text-orange-300 shadow-inner">
              <Waves className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-white font-black text-base md:text-lg flex items-center gap-2">
                {lang === 'ar' ? 'محاكاة تعطل محطات الرفع والفيضان السطحي (Sewer Overflow Simulation)' : 'Lift Station Failure & Sewer Overflow Simulation'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  {lang === 'ar' ? 'زمن الطفح TTO ونطاقات الخطر' : 'Time-to-Overflow (TTO)'}
                </span>
              </h2>
              <p className="text-[11px] text-orange-200/70 font-medium">
                {lang === 'ar' ? 'محاكاة انقطاع الكهرباء أو توقف مضخات الرفع، حساب السعة التخزينية للشبكة، تحديد أول منهول يفيض، ونطاقات الخطر.' : 'Simulate pump trips, network storage buffer, identify critical first spill manholes and emergency action plans.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-rose-500 hover:text-white text-white/60 rounded-xl transition-colors border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive Simulation Parameters Bar */}
        <div className="px-6 py-3 bg-[#061721] border-b border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs shrink-0">
          <div className="space-y-1">
            <label className="text-white/70 font-bold flex items-center justify-between">
              <span>{lang === 'ar' ? 'سعة بيارة التجميع (Wet Well):' : 'Wet Well Capacity:'}</span>
              <span className="font-mono text-cyan-300 font-black">{wetWellCapacity} م³</span>
            </label>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={wetWellCapacity}
              onChange={(e) => setWetWellCapacity(parseInt(e.target.value, 10))}
              className="w-full accent-orange-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-white/70 font-bold flex items-center justify-between">
              <span>{lang === 'ar' ? 'معدل التصرف الوارد (Inflow Rate):' : 'Inflow Rate (L/s):'}</span>
              <span className="font-mono text-orange-300 font-black">{averageInflow} لتر/ث</span>
            </label>
            <input
              type="range"
              min={5}
              max={250}
              step={5}
              value={averageInflow}
              onChange={(e) => setAverageInflow(parseInt(e.target.value, 10))}
              className="w-full accent-orange-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-white/70 font-bold flex items-center justify-between">
              <span>{lang === 'ar' ? 'سعة صهريج السحب (Tanker Capacity):' : 'Tanker Capacity (m³):'}</span>
              <span className="font-mono text-emerald-300 font-black">{tankerCapacity} م³</span>
            </label>
            <input
              type="range"
              min={16}
              max={45}
              step={4}
              value={tankerCapacity}
              onChange={(e) => setTankerCapacity(parseInt(e.target.value, 10))}
              className="w-full accent-orange-500"
            />
          </div>
        </div>

        {/* Modal Body */}
        {simResult ? (
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            
            {/* Top Highlight: Critical Time to Overflow Card */}
            <div className="p-5 rounded-3xl bg-gradient-to-r from-red-950/40 via-orange-950/30 to-amber-950/20 border border-red-500/40 shadow-2xl flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400 font-black text-xs flex items-center gap-1 border border-red-500/30 animate-pulse">
                    <Timer className="w-4 h-4" />
                    {lang === 'ar' ? 'زمن حرج لحدوث الطفح السطحي (TTO)' : 'Time-To-Overflow (TTO)'}
                  </span>
                  <span className="text-xs text-white/60 font-mono">
                    {lang === 'ar' ? 'في حال توقف المضخات كلياً' : 'At zero pump discharge'}
                  </span>
                </div>
                <h3 className="text-2xl font-black text-white">
                  {lang === 'ar' ? 'سيبدأ الطفح بعد: ' : 'First Spill Occurs In: '}
                  <span className="text-red-400 underline decoration-red-500 font-mono">{simResult.timeToFirstOverflowFormatted}</span>
                </h3>
                {simResult.criticalFirstSpillManhole && (
                  <p className="text-xs text-white/80 font-medium">
                    {lang === 'ar'
                      ? `⚠️ أول نقطة طفح متوقعة ستكون عند المنهل (${simResult.criticalFirstSpillManhole.id}) نظراً لكونه أوطأ منسوب غطاء (${simResult.criticalFirstSpillManhole.glRim} م).`
                      : `⚠️ First overflow node will be manhole (${simResult.criticalFirstSpillManhole.id}) having the lowest ground rim elevation (${simResult.criticalFirstSpillManhole.glRim}m).`}
                  </p>
                )}
              </div>

              {/* Quick Storage KPIs */}
              <div className="flex items-center gap-3">
                <div className="p-3 bg-black/40 rounded-2xl border border-white/10 text-center min-w-[110px]">
                  <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'سعة تخزين الأنابيب' : 'Pipe Storage'}</span>
                  <span className="font-mono text-base font-black text-cyan-300">{simResult.totalPipeStorageCapacityM3} م³</span>
                </div>
                <div className="p-3 bg-black/40 rounded-2xl border border-white/10 text-center min-w-[110px]">
                  <span className="text-[10px] text-white/50 block font-bold">{lang === 'ar' ? 'امتلاء البيارة' : 'Wet Well Full'}</span>
                  <span className="font-mono text-base font-black text-orange-300">{simResult.timeToWetWellFullMinutes} دقيقة</span>
                </div>
              </div>
            </div>

            {/* Hazard Buffer Zones for Map Visualization */}
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-400" />
                  {lang === 'ar' ? 'نطاقات ودوائر الخطر التقديرية (Spatial Risk Buffer Zones)' : 'Spatial Risk Buffer Zones'}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {simResult.hazardZones.map(zone => (
                  <div
                    key={zone.id}
                    className="p-4 rounded-2xl border transition-all space-y-2 bg-[#092230]"
                    style={{ borderColor: `${zone.color}60` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black" style={{ color: zone.color }}>
                        {zone.id === 'ZONE_EXTREME' ? '🔴 نطاق الخطر الحرج' : zone.id === 'ZONE_STATION' ? '🟠 نطاق محطة الرفع' : '🟡 نطاق خطر متوسط'}
                      </span>
                      <span className="text-[10px] font-mono text-white/60 bg-white/5 px-2 py-0.5 rounded-lg">
                        نصف القطر: {zone.radiusMeters}م
                      </span>
                    </div>
                    <p className="text-xs text-white/80 font-medium">
                      {zone.descriptionAr}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Spill Vulnerability Sequence Table */}
            <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-400" />
                  {lang === 'ar' ? 'تسلسل طفح المناهل الأكثر عرضة للخطر (Vulnerable Manholes Sequence)' : 'Vulnerable Manholes Sequence'}
                </h3>
              </div>

              <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-[#092230] text-white/70 sticky top-0 font-black text-[10px] uppercase">
                    <tr>
                      <th className="p-3 text-start">الترتيب</th>
                      <th className="p-3 text-start">معرف المنهل</th>
                      <th className="p-3 text-start">منسوب الغطاء GL</th>
                      <th className="p-3 text-start">قاع المنهل IL</th>
                      <th className="p-3 text-start">العمق (م)</th>
                      <th className="p-3 text-start">زمن الطفح المتوقع (TTO)</th>
                      <th className="p-3 text-start">مستوى الخطر</th>
                      <th className="p-3 text-center">تركيز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    {simResult.vulnerableManholes.map((mh, idx) => (
                      <tr key={idx} className={`hover:bg-white/5 transition-colors ${idx === 0 ? 'bg-red-950/30' : ''}`}>
                        <td className="p-3 font-mono font-bold text-orange-400">#{mh.spillSequenceOrder}</td>
                        <td className="p-3 font-bold text-white">{mh.id}</td>
                        <td className="p-3 font-mono text-amber-300">{mh.glRim} م</td>
                        <td className="p-3 font-mono text-cyan-300">{mh.ilInvert} م</td>
                        <td className="p-3 font-mono">{mh.depthM} م</td>
                        <td className="p-3 font-mono font-black text-red-400">{mh.timeToOverflowMinutes} دقيقة</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              mh.overflowRiskLevel === 'extreme'
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : mh.overflowRiskLevel === 'high'
                                ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                            }`}
                          >
                            {mh.riskLabelAr}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {onFocusManhole && (
                            <button
                              onClick={() => onFocusManhole({ lat: mh.coords.y, lng: mh.coords.x })}
                              className="px-2 py-1 bg-white/5 hover:bg-orange-500 hover:text-black text-orange-300 rounded-lg text-[10px] font-black transition-all"
                            >
                              📍
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Emergency Action Plan & Mitigation */}
            <div className="bg-[#05131b] p-5 rounded-3xl border border-emerald-500/30 space-y-3 bg-emerald-950/15">
              <h3 className="text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {lang === 'ar' ? 'خطة الطوارئ الهندسية والإجراءات العلاجية الفورية (Emergency Mitigation Action Plan)' : 'Emergency Mitigation Action Plan'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-black/30 rounded-2xl border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-white/60 block font-bold">{lang === 'ar' ? 'صهاريج الكسح المطلوبة' : 'Required Tankers'}</span>
                  <span className="font-mono text-base font-black text-emerald-400">
                    {simResult.mitigation.requiredTankersPerHour} صهريج / ساعة
                  </span>
                </div>

                <div className="p-3 bg-black/30 rounded-2xl border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-white/60 block font-bold">{lang === 'ar' ? 'سعة مضخة التحويل (Bypass)' : 'Bypass Pump'}</span>
                  <span className="font-mono text-base font-black text-emerald-400">
                    {simResult.mitigation.recommendedBypassPumpCapacityLs} لتر/ث
                  </span>
                </div>

                <div className="p-3 bg-black/30 rounded-2xl border border-emerald-500/20 text-center">
                  <span className="text-[10px] text-white/60 block font-bold">{lang === 'ar' ? 'قدرة المولد الكهربائي' : 'Emergency Generator'}</span>
                  <span className="font-mono text-base font-black text-emerald-400">
                    {simResult.mitigation.recommendedGeneratorKW} kVA
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                {simResult.mitigation.actionPlanAr.map((act, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/80 font-medium">
                    <span className="text-emerald-400 font-black">✔</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-20 text-white/50 text-xs">
            {lang === 'ar' ? 'يرجى تحميل شبكة أنابيب صالحة لتشغيل المحاكاة.' : 'Please load a valid network dataset.'}
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 bg-[#071d29] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-white/50">
            {lang === 'ar' ? 'محاكاة الفيضان والطفح مبنية على معادلات سعة التخزين الحجمية والهيدرولوجيا الحضرية.' : 'Sewer surcharge and overflow calculations comply with urban hydrology models.'}
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
