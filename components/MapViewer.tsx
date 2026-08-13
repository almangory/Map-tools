import React, { useState, useMemo } from 'react';
import { 
  Layers, Maximize, FileText, Mountain, Map, Download, BarChart3, 
  Loader2, Waves, Compass, Activity, FileSpreadsheet, ShieldAlert, 
  CheckCircle2, AlertTriangle, ArrowDownRight, Settings2, Sparkles, 
  Ruler, Gauge, Droplet, Eye
} from 'lucide-react';
import { 
  GeoPoint, BaseMapType, HydraulicNetworkSummary, 
  AsphaltCalculationParams, AsphaltRestorationScope, HydraulicColorMode, PipeHydraulicData 
} from '../types';
import { cn } from '../utils';
import { NetworkFlowAnalysis } from '../services/flowDirectionService';
import { 
  analyzeNetworkHydraulics, exportHydraulicFlowExcel, 
  DEFAULT_ASPHALT_PARAMS, DEFAULT_MANNING_N 
} from '../services/hydraulicService';

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
  showFlowDirection?: boolean;
  onToggleFlowDirection?: (val: boolean) => void;
  flowAnalysis?: NetworkFlowAnalysis | null;
  
  // Hydraulic & Asphalt props
  hydraulicSummary?: HydraulicNetworkSummary | null;
  asphaltParams?: AsphaltCalculationParams;
  onUpdateAsphaltParams?: (params: AsphaltCalculationParams) => void;
  manningN?: number;
  onUpdateManningN?: (n: number) => void;
  hydraulicColorMode?: HydraulicColorMode;
  onSetHydraulicColorMode?: (mode: HydraulicColorMode) => void;
  filename?: string;
  hoveredElevationPoint?: any;
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
  isGeneratingReport,
  showFlowDirection = false,
  onToggleFlowDirection,
  flowAnalysis,
  hydraulicSummary: propHydraulicSummary,
  asphaltParams: propAsphaltParams,
  onUpdateAsphaltParams,
  manningN: propManningN = DEFAULT_MANNING_N,
  onUpdateManningN,
  hydraulicColorMode = 'velocity',
  onSetHydraulicColorMode,
  filename = 'Map_Network'
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'hydraulic' | 'dashboard' | 'table' | 'layers'>('hydraulic');

  // Internal state fallback if not passed from parent
  const [localAsphaltParams, setLocalAsphaltParams] = useState<AsphaltCalculationParams>(
    propAsphaltParams || DEFAULT_ASPHALT_PARAMS
  );
  const [localManningN, setLocalManningN] = useState<number>(propManningN);
  const [localColorMode, setLocalColorMode] = useState<HydraulicColorMode>(hydraulicColorMode);

  const currentAsphaltParams = propAsphaltParams || localAsphaltParams;
  const currentManningN = propManningN || localManningN;
  const currentColorMode = hydraulicColorMode || localColorMode;

  const handleAsphaltParamChange = (updates: Partial<AsphaltCalculationParams>) => {
    const updated = { ...currentAsphaltParams, ...updates };
    setLocalAsphaltParams(updated);
    onUpdateAsphaltParams?.(updated);
  };

  const handleManningChange = (val: number) => {
    setLocalManningN(val);
    onUpdateManningN?.(val);
  };

  const handleColorModeChange = (mode: HydraulicColorMode) => {
    setLocalColorMode(mode);
    onSetHydraulicColorMode?.(mode);
  };

  // Compute hydraulic summary
  const hydraulicSummary = useMemo(() => {
    if (propHydraulicSummary) return propHydraulicSummary;
    return analyzeNetworkHydraulics(points, flowAnalysis, currentManningN, currentAsphaltParams);
  }, [points, flowAnalysis, currentManningN, currentAsphaltParams, propHydraulicSummary]);

  // Focused pipe hydraulic details
  const focusedPipeHydraulic: PipeHydraulicData | undefined = useMemo(() => {
    if (!focusedPoint) return undefined;
    return hydraulicSummary.pipesMap.get(focusedPoint.id) || 
           hydraulicSummary.pipesMap.get(String(focusedPoint.id));
  }, [focusedPoint, hydraulicSummary]);

  const stats = useMemo(() => {
    let totalLineLength = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;

    points.forEach(p => {
      if (p.type === 'LineString' && p.path) {
         let len = 0;
         for (let i = 0; i < p.path.length - 1; i++) {
           const p1 = p.path[i];
           const p2 = p.path[i+1];
           const R = 6371e3;
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

  const handleExportExcel = () => {
    exportHydraulicFlowExcel(hydraulicSummary, filename, lang);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Sub-tab Navigation */}
      <div className="bg-[#0b2d3d]/50 p-1.5 rounded-[1.8rem] border border-white/5 flex gap-1 shadow-lg backdrop-blur-md">
        <button 
          onClick={() => setActiveSubTab('hydraulic')} 
          className={cn(
            "flex-1 py-2.5 px-2 rounded-[1.4rem] text-[11px] font-black transition-all flex items-center justify-center gap-1.5", 
            activeSubTab === 'hydraulic' ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30" : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <Waves className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'الهيدروليكا والأسفلت' : 'Hydraulics & Asphalt'}</span>
        </button>
        <button 
          onClick={() => setActiveSubTab('dashboard')} 
          className={cn(
            "flex-1 py-2.5 px-2 rounded-[1.4rem] text-[11px] font-black transition-all flex items-center justify-center gap-1.5", 
            activeSubTab === 'dashboard' ? "bg-accent text-primary shadow-xl" : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'الملخص العام' : 'Dashboard'}</span>
        </button>
        <button 
          onClick={() => setActiveSubTab('table')} 
          className={cn(
            "flex-1 py-2.5 px-2 rounded-[1.4rem] text-[11px] font-black transition-all flex items-center justify-center gap-1.5", 
            activeSubTab === 'table' ? "bg-accent text-primary shadow-xl" : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'جدول العناصر' : 'Attributes'}</span>
        </button>
        <button 
          onClick={() => setActiveSubTab('layers')} 
          className={cn(
            "flex-1 py-2.5 px-2 rounded-[1.4rem] text-[11px] font-black transition-all flex items-center justify-center gap-1.5", 
            activeSubTab === 'layers' ? "bg-accent text-primary shadow-xl" : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'الطبقات' : 'Layers'}</span>
        </button>
      </div>

      {/* 1. Comprehensive Hydraulic Flow & Asphalt Panel */}
      {activeSubTab === 'hydraulic' && (
        <div className="space-y-5">
          {/* Quick Action: Toggle Flow Animation & Export Excel */}
          <div className="bg-[#0b2d3d]/60 p-4 rounded-[2rem] border border-cyan-500/20 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Waves className="w-5 h-5 text-cyan-400 animate-pulse" />
                <div>
                  <h4 className="text-white text-xs font-black">
                    {lang === 'ar' ? 'محاكاة الجريان وحساب التدفق' : 'Hydraulic Flow & Velocity Engine'}
                  </h4>
                  <span className="text-[10px] text-cyan-300/70">
                    {lang === 'ar' ? 'معادلة مانينغ + معايير أمانة الرياض' : "Manning's Equation & Riyadh Standards"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => onToggleFlowDirection?.(!showFlowDirection)}
                className={cn(
                  "py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md active:scale-95",
                  showFlowDirection 
                    ? "bg-cyan-400 text-slate-950 font-black shadow-cyan-400/30" 
                    : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                )}
              >
                <Waves className="w-3.5 h-3.5" />
                <span>{showFlowDirection ? (lang === 'ar' ? 'إيقاف الحركة ⏸' : 'Pause Flow ⏸') : (lang === 'ar' ? 'تشغيل التدفق ⚡' : 'Start Flow ⚡')}</span>
              </button>
            </div>

            {/* Excel Export Button */}
            <button
              onClick={handleExportExcel}
              className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-600 text-white py-3 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 border border-emerald-400/30 active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تصدير تقرير التدفق الهيدروليكي والأسفلت (Excel Export)' : 'Export Hydraulic & Asphalt Report (Excel)'}</span>
            </button>
          </div>

          {/* Key Hydraulic Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-black/40 p-3 rounded-2xl border border-cyan-500/20 text-center">
              <div className="text-[9.5px] text-cyan-300/70 font-semibold mb-1 flex items-center justify-center gap-1">
                <Gauge className="w-3 h-3 text-cyan-400" />
                <span>{lang === 'ar' ? 'متوسط السرعة (V)' : 'Avg Velocity'}</span>
              </div>
              <div className="text-lg font-black text-cyan-300 font-mono">
                {hydraulicSummary.avgVelocity.toFixed(2)} <span className="text-[10px] text-white/50">{lang === 'ar' ? 'م/ث' : 'm/s'}</span>
              </div>
            </div>

            <div className="bg-black/40 p-3 rounded-2xl border border-blue-500/20 text-center">
              <div className="text-[9.5px] text-blue-300/70 font-semibold mb-1 flex items-center justify-center gap-1">
                <Droplet className="w-3 h-3 text-blue-400" />
                <span>{lang === 'ar' ? 'إجمالي التصريف (Q)' : 'Total Capacity'}</span>
              </div>
              <div className="text-lg font-black text-blue-300 font-mono">
                {hydraulicSummary.totalCapacityLs.toFixed(0)} <span className="text-[10px] text-white/50">{lang === 'ar' ? 'لتر/ث' : 'L/s'}</span>
              </div>
            </div>

            <div className="bg-black/40 p-3 rounded-2xl border border-amber-500/20 text-center">
              <div className="text-[9.5px] text-amber-300/70 font-semibold mb-1 flex items-center justify-center gap-1">
                <Ruler className="w-3 h-3 text-amber-400" />
                <span>{lang === 'ar' ? 'مساحة الأسفلت' : 'Asphalt Area'}</span>
              </div>
              <div className="text-lg font-black text-amber-300 font-mono">
                {hydraulicSummary.totalAsphaltAreaM2.toFixed(0)} <span className="text-[10px] text-white/50">{lang === 'ar' ? 'م²' : 'm²'}</span>
              </div>
            </div>

            <div className="bg-black/40 p-3 rounded-2xl border border-emerald-500/20 text-center">
              <div className="text-[9.5px] text-emerald-300/70 font-semibold mb-1 flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>{lang === 'ar' ? 'حجم الأسفلت' : 'Asphalt Vol'}</span>
              </div>
              <div className="text-lg font-black text-emerald-300 font-mono">
                {hydraulicSummary.totalAsphaltVolumeM3.toFixed(1)} <span className="text-[10px] text-white/50">{lang === 'ar' ? 'م³' : 'm³'}</span>
              </div>
            </div>
          </div>

          {/* Velocity Tiers Breakdown (Color-Coded) */}
          <div className="bg-[#0b2d3d]/50 p-4 rounded-[2rem] border border-white/5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-white text-xs font-black flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-accent" />
                <span>{lang === 'ar' ? 'تصنيف سرعات التدفق (Velocity Tiers)' : 'Velocity Status Classification'}</span>
              </span>
              <span className="text-[10px] text-white/50 font-mono">{hydraulicSummary.totalPipes} {lang === 'ar' ? 'أنبوب' : 'pipes'}</span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Optimal: 0.6 <= V <= 3.0 m/s */}
              <div className="bg-emerald-950/40 p-3 rounded-2xl border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#00E676] shadow-md shadow-emerald-500/50"></div>
                  <div>
                    <div className="font-bold text-emerald-300">{lang === 'ar' ? 'سلس ومطابق للاشتراطات (0.6 - 3.0 م/ث)' : 'Optimal Self-Cleansing (0.6 - 3.0 m/s)'}</div>
                    <div className="text-[9.5px] text-emerald-200/60">{lang === 'ar' ? 'سرعة قياسية تمنع الترسيب وتحمي الأنبوب' : 'Standard self-cleansing velocity'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-emerald-400 font-mono text-sm">{hydraulicSummary.optimalVelocityCount}</span>
                  <span className="text-[10px] text-emerald-200/70 block">
                    {((hydraulicSummary.optimalVelocityCount / Math.max(1, hydraulicSummary.totalPipes)) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Low Velocity: V < 0.6 m/s */}
              <div className="bg-amber-950/40 p-3 rounded-2xl border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#FF9800] shadow-md shadow-amber-500/50"></div>
                  <div>
                    <div className="font-bold text-amber-300">{lang === 'ar' ? 'سرعة منخفضة / خطر رسوبيات (< 0.6 م/ث)' : 'Low Velocity / Sedimentation (< 0.6 m/s)'}</div>
                    <div className="text-[9.5px] text-amber-200/60">{lang === 'ar' ? 'تتطلب زيادة الميل أو غسيل دوري' : 'Requires slope check or flushing'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-amber-400 font-mono text-sm">{hydraulicSummary.lowVelocityCount}</span>
                  <span className="text-[10px] text-amber-200/70 block">
                    {((hydraulicSummary.lowVelocityCount / Math.max(1, hydraulicSummary.totalPipes)) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* High Velocity: V > 3.0 m/s */}
              <div className="bg-rose-950/40 p-3 rounded-2xl border border-rose-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#FF1744] shadow-md shadow-rose-500/50"></div>
                  <div>
                    <div className="font-bold text-rose-300">{lang === 'ar' ? 'سرعة عالية / خطر نحر وتآكل (> 3.0 م/ث)' : 'High Velocity / Scour Risk (> 3.0 m/s)'}</div>
                    <div className="text-[9.5px] text-rose-200/60">{lang === 'ar' ? 'تتطلب مطابقة نوع الأنبوب أو كواسر سرعة' : 'Requires velocity breakers or pipe check'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-black text-rose-400 font-mono text-sm">{hydraulicSummary.highVelocityCount}</span>
                  <span className="text-[10px] text-rose-200/70 block">
                    {((hydraulicSummary.highVelocityCount / Math.max(1, hydraulicSummary.totalPipes)) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Asphalt Quantity Calculator Settings (Riyadh Standards) */}
          <div className="bg-[#0b2d3d]/50 p-4 rounded-[2rem] border border-white/5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-white text-xs font-black flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-accent" />
                <span>{lang === 'ar' ? 'إعدادات كميات الأسفلت (معايير أمانة الرياض)' : 'Asphalt Quantity Calculator (Riyadh)'}</span>
              </span>
            </div>

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] text-white/70 font-semibold">{lang === 'ar' ? 'نطاق إعادة السفلتة:' : 'Restoration Scope:'}</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => handleAsphaltParamChange({ scope: 'trench' })}
                  className={cn(
                    "py-2 px-1.5 rounded-xl text-[10px] font-black transition-all border text-center",
                    currentAsphaltParams.scope === 'trench' 
                      ? "bg-accent text-primary border-accent shadow-md" 
                      : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                  )}
                >
                  {lang === 'ar' ? 'حفرية فقط (1م)' : 'Trench Only'}
                </button>

                <button
                  onClick={() => handleAsphaltParamChange({ scope: 'lane' })}
                  className={cn(
                    "py-2 px-1.5 rounded-xl text-[10px] font-black transition-all border text-center",
                    currentAsphaltParams.scope === 'lane' 
                      ? "bg-accent text-primary border-accent shadow-md" 
                      : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                  )}
                >
                  {lang === 'ar' ? 'حارة كاملة (3.5م)' : 'Lane Width'}
                </button>

                <button
                  onClick={() => handleAsphaltParamChange({ scope: 'full_street' })}
                  className={cn(
                    "py-2 px-1.5 rounded-xl text-[10px] font-black transition-all border text-center",
                    currentAsphaltParams.scope === 'full_street' 
                      ? "bg-accent text-primary border-accent shadow-md" 
                      : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                  )}
                >
                  {lang === 'ar' ? 'عرض الشارع' : 'Full Street'}
                </button>
              </div>
            </div>

            {/* Width and Thickness Inputs */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] text-white/60 font-medium">
                  {currentAsphaltParams.scope === 'trench' ? (lang === 'ar' ? 'عرض الحفرية (م)' : 'Trench Width (m)') :
                   currentAsphaltParams.scope === 'lane' ? (lang === 'ar' ? 'عرض الحارة (م)' : 'Lane Width (m)') :
                   (lang === 'ar' ? 'عرض الشارع الافتراضي (م)' : 'Street Width (m)')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={currentAsphaltParams.scope === 'trench' ? currentAsphaltParams.trenchWidth :
                         currentAsphaltParams.scope === 'lane' ? currentAsphaltParams.laneWidth :
                         currentAsphaltParams.fullStreetWidth}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 1.0;
                    if (currentAsphaltParams.scope === 'trench') handleAsphaltParamChange({ trenchWidth: v });
                    else if (currentAsphaltParams.scope === 'lane') handleAsphaltParamChange({ laneWidth: v });
                    else handleAsphaltParamChange({ fullStreetWidth: v });
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-white/60 font-medium">{lang === 'ar' ? 'سماكة الأسفلت (م)' : 'Thickness (m)'}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.04"
                  max="0.30"
                  value={currentAsphaltParams.asphaltThickness}
                  onChange={(e) => handleAsphaltParamChange({ asphaltThickness: parseFloat(e.target.value) || 0.10 })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Manning n parameter */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-3">
              <label className="text-[10px] text-white/70 font-medium">{lang === 'ar' ? 'معامل مانينغ للخشونة (n):' : "Manning's Roughness (n):"}</label>
              <input
                type="number"
                step="0.001"
                min="0.008"
                max="0.025"
                value={currentManningN}
                onChange={(e) => handleManningChange(parseFloat(e.target.value) || 0.013)}
                className="w-24 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-cyan-300 font-mono text-center focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Color Mode Switcher */}
          <div className="bg-[#0b2d3d]/50 p-4 rounded-[2rem] border border-white/5 space-y-2.5">
            <span className="text-white text-xs font-black flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-accent" />
              <span>{lang === 'ar' ? 'نمط تلوين خطوط الشبكة على الخريطة' : 'Map Pipe Color Mode'}</span>
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleColorModeChange('velocity')}
                className={cn(
                  "py-2 px-3 rounded-xl text-[10.5px] font-black transition-all border text-center flex items-center justify-center gap-1.5",
                  currentColorMode === 'velocity'
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-md shadow-emerald-500/20"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                )}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[#00E676]"></div>
                <span>{lang === 'ar' ? 'سرعة التدفق (Velocity)' : 'Velocity Tiers'}</span>
              </button>

              <button
                onClick={() => handleColorModeChange('priority')}
                className={cn(
                  "py-2 px-3 rounded-xl text-[10.5px] font-black transition-all border text-center flex items-center justify-center gap-1.5",
                  currentColorMode === 'priority'
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-500/20"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                )}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                <span>{lang === 'ar' ? 'أولوية التحديد (Priority)' : 'Flow Priority'}</span>
              </button>

              <button
                onClick={() => handleColorModeChange('diameter')}
                className={cn(
                  "py-2 px-3 rounded-xl text-[10.5px] font-black transition-all border text-center flex items-center justify-center gap-1.5",
                  currentColorMode === 'diameter'
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-md shadow-purple-500/20"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                )}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-purple-400"></div>
                <span>{lang === 'ar' ? 'أقطار الأنابيب (Diameter)' : 'Pipe Diameter'}</span>
              </button>

              <button
                onClick={() => handleColorModeChange('default')}
                className={cn(
                  "py-2 px-3 rounded-xl text-[10.5px] font-black transition-all border text-center flex items-center justify-center gap-1.5",
                  currentColorMode === 'default'
                    ? "bg-white/20 text-white border-white/40 shadow-md"
                    : "bg-white/5 text-white/60 border-white/10 hover:text-white"
                )}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                <span>{lang === 'ar' ? 'الطبقات الأصلية' : 'Original Layer'}</span>
              </button>
            </div>
          </div>

          {/* Focused Pipe Inspector Box if any line is selected */}
          {focusedPipeHydraulic && (
            <div className="bg-gradient-to-br from-cyan-950/70 via-slate-900/90 to-blue-950/70 p-4 rounded-[2rem] border border-cyan-500/40 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <span className="text-cyan-400">🔍</span>
                  <span>{lang === 'ar' ? 'فاحص الأنبوب المحدد:' : 'Selected Pipe Inspector:'}</span>
                  <span className="text-accent font-mono text-[11px] truncate max-w-[120px]">{focusedPipeHydraulic.id}</span>
                </span>
                <span className={cn("text-[9px] px-2 py-0.5 rounded-full border font-bold", 
                  focusedPipeHydraulic.velocityStatus === 'optimal' ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" :
                  focusedPipeHydraulic.velocityStatus === 'low' ? "bg-amber-500/20 text-amber-300 border-amber-400/40" :
                  "bg-rose-500/20 text-rose-300 border-rose-400/40"
                )}>
                  {lang === 'ar' ? focusedPipeHydraulic.statusBadgeAr : focusedPipeHydraulic.statusBadgeEn}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'القطر (D):' : 'Diameter:'}</span>
                  <span className="font-black text-white font-mono">{focusedPipeHydraulic.diameterMm} mm</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'الميل (Slope):' : 'Slope:'}</span>
                  <span className="font-black text-white font-mono">{focusedPipeHydraulic.slopePercent.toFixed(2)} %</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'السرعة (V):' : 'Velocity:'}</span>
                  <span className="font-black text-cyan-300 font-mono">{focusedPipeHydraulic.velocity.toFixed(2)} m/s</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'التصريف الأقصى (Q):' : 'Max Q:'}</span>
                  <span className="font-black text-blue-300 font-mono">{focusedPipeHydraulic.maxCapacityLs.toFixed(1)} L/s</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'التصريف 75% (Q_75%):' : 'Design Q_75%:'}</span>
                  <span className="font-black text-emerald-300 font-mono">{focusedPipeHydraulic.designCapacity75Ls.toFixed(1)} L/s</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'اتجاه الجريان:' : 'Flow Direction:'}</span>
                  <span className="font-bold text-white font-mono text-[10px] truncate block">{focusedPipeHydraulic.flowDirectionTextAr}</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'مساحة الأسفلت:' : 'Asphalt Area:'}</span>
                  <span className="font-black text-amber-300 font-mono">{focusedPipeHydraulic.asphaltAreaM2.toFixed(1)} m²</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-white/60 block text-[9.5px]">{lang === 'ar' ? 'حجم الأسفلت:' : 'Asphalt Volume:'}</span>
                  <span className="font-black text-emerald-400 font-mono">{focusedPipeHydraulic.asphaltVolumeM3.toFixed(2)} m³</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Uploaded File Stats Sub-Tab */}
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

      {/* 3. Attribute Table Sub-Tab */}
      {activeSubTab === 'table' && (
        <div className="bg-[#0b2d3d]/40 p-4 rounded-[2rem] border border-white/5">
          <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'المعرف' : 'ID'}</th>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'السرعة' : 'Velocity'}</th>
                  <th className="border-b border-white/10 p-2 text-white/60 font-bold">{lang === 'ar' ? 'الطبقة' : 'Layer'}</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(0, 100).map((p, i) => {
                  const pipeHyd = hydraulicSummary.pipesMap.get(p.id);
                  return (
                    <tr 
                      key={i} 
                      onClick={() => setFocusedPoint(p)} 
                      className={cn(
                        "cursor-pointer hover:bg-white/5 transition-colors", 
                        focusedPoint?.id === p.id ? "bg-accent/20" : ""
                      )}
                    >
                      <td className="border-b border-white/5 p-2 text-white font-bold">{p.id}</td>
                      <td className="border-b border-white/5 p-2 text-white/80">{p.type}</td>
                      <td className="border-b border-white/5 p-2 font-mono font-bold">
                        {pipeHyd ? (
                          <span style={{ color: pipeHyd.velocityColor }}>
                            {pipeHyd.velocity.toFixed(2)} m/s
                          </span>
                        ) : '-'}
                      </td>
                      <td className="border-b border-white/5 p-2 text-white/80">{p.layer || '-'}</td>
                    </tr>
                  );
                })}
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

      {/* 4. Layer Opacity & 3D Tools Sub-Tab */}
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
