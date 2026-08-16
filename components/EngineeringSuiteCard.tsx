import React from 'react';
import {
  Mountain, Pickaxe, ShieldAlert, Waves, Sparkles,
  ChevronRight, ArrowRight, Zap, ArrowDownRight, Droplets
} from 'lucide-react';
import { GeoPoint } from '../types';

interface EngineeringSuiteCardProps {
  lang: 'ar' | 'en';
  pointsCount: number;
  onOpenProfile: () => void;
  onOpenEarthwork: () => void;
  onOpenClash: () => void;
  onOpenOverflow: () => void;
}

export const EngineeringSuiteCard: React.FC<EngineeringSuiteCardProps> = ({
  lang,
  pointsCount,
  onOpenProfile,
  onOpenEarthwork,
  onOpenClash,
  onOpenOverflow
}) => {
  return (
    <div className="p-5 bg-gradient-to-br from-[#0b2d3d]/90 via-[#071d29]/95 to-[#06151e]/90 rounded-[2.5rem] border border-cyan-500/30 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-500">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-black text-xs md:text-sm uppercase tracking-wide flex items-center gap-1.5">
              <span>{lang === 'ar' ? 'الأدوات والتحليلات الهندسية المتقدمة' : 'Advanced Engineering & Hydraulic Suite'}</span>
            </h3>
            <p className="text-[10px] text-cyan-200/70 font-medium">
              {lang === 'ar' ? 'محركات التحليل الهيدروليكي، حساب الكميات، كشف التعارضات، والمحاكاة' : 'Hydraulic profile, earthwork BOQ, clash detection & overflow simulation'}
            </p>
          </div>
        </div>

        <span className="text-[9.5px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>{lang === 'ar' ? '4 أدوات تخصصية' : '4 Modules'}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* 1. Longitudinal Profile */}
        <button
          type="button"
          onClick={onOpenProfile}
          className="p-3 rounded-2xl bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-400/40 text-left transition-all group flex items-start justify-between cursor-pointer active:scale-98 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0 group-hover:scale-110 transition-transform">
              <Mountain className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white group-hover:text-cyan-300 transition-colors flex items-center gap-1">
                {lang === 'ar' ? '1. المخطط الطولي (Profile View)' : '1. Longitudinal Profile'}
              </h4>
              <p className="text-[10px] text-white/50 leading-tight mt-0.5">
                {lang === 'ar' ? 'خط الأرض GL، قاع الأنبوب IL، الميول، والهدارات Drop Manholes' : 'Ground GL, invert IL, hydraulic slopes & drop manholes'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>

        {/* 2. Earthwork BOQ */}
        <button
          type="button"
          onClick={onOpenEarthwork}
          className="p-3 rounded-2xl bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-400/40 text-left transition-all group flex items-start justify-between cursor-pointer active:scale-98 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0 group-hover:scale-110 transition-transform">
              <Pickaxe className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white group-hover:text-amber-300 transition-colors flex items-center gap-1">
                {lang === 'ar' ? '2. حساب الكميات والردم (BOQ)' : '2. Earthwork BOQ Engine'}
              </h4>
              <p className="text-[10px] text-white/50 leading-tight mt-0.5">
                {lang === 'ar' ? 'حجم الحفر، الفرشات الرملية، الردم، قطع السفلتة وتصنيف الأعماق' : 'Excavation, bedding sand, net backfill & depth brackets'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-amber-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>

        {/* 3. Clash Detection */}
        <button
          type="button"
          onClick={onOpenClash}
          className="p-3 rounded-2xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-400/40 text-left transition-all group flex items-start justify-between cursor-pointer active:scale-98 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0 group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white group-hover:text-rose-300 transition-colors flex items-center gap-1">
                {lang === 'ar' ? '3. كشف التعارضات (Clash Detection)' : '3. Utility Clash Audit'}
              </h4>
              <p className="text-[10px] text-white/50 leading-tight mt-0.5">
                {lang === 'ar' ? 'فحص خلوص المياه والصرف الصحي (المياه أعلى بـ 0.50م)' : 'Audit water & sewer 3D clearance (Water >= 0.5m above sewer)'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-rose-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>

        {/* 4. Sewer Overflow Simulation */}
        <button
          type="button"
          onClick={onOpenOverflow}
          className="p-3 rounded-2xl bg-white/5 hover:bg-orange-500/10 border border-white/10 hover:border-orange-400/40 text-left transition-all group flex items-start justify-between cursor-pointer active:scale-98 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-400/30 flex items-center justify-center text-orange-300 shrink-0 group-hover:scale-110 transition-transform">
              <Waves className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white group-hover:text-orange-300 transition-colors flex items-center gap-1">
                {lang === 'ar' ? '4. محاكاة طفح الصرف (Overflow TTO)' : '4. Sewer Overflow & TTO'}
              </h4>
              <p className="text-[10px] text-white/50 leading-tight mt-0.5">
                {lang === 'ar' ? 'زمن الطفح TTO عند تعطل محطة الرفع، أول منهول يفيض، والصهاريج' : 'Time-to-overflow upon pump trip, critical spill manhole & tankers'}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-orange-300 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </button>
      </div>
    </div>
  );
};
