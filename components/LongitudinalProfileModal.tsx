import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, ReferenceDot
} from 'recharts';
import {
  Mountain, X, Sparkles, Layers, Zap, ArrowDownRight, Compass,
  SlidersHorizontal, Download, FileSpreadsheet, Maximize2, RotateCcw,
  CheckCircle2, AlertTriangle, Waves, Printer
} from 'lucide-react';
import { GeoPoint, PipeHydraulicData } from '../types';
import { calculatePathLengthMeters } from '../services/hydraulicService';
import * as XLSX from 'xlsx';

interface LongitudinalProfileModalProps {
  lang: 'ar' | 'en';
  points: GeoPoint[];
  selectedPipe?: GeoPoint | null;
  hydraulicMap?: Map<string | number, PipeHydraulicData> | null;
  onClose: () => void;
  onFocusPoint?: (pt: { lat: number; lng: number }) => void;
}

interface ProfileStationNode {
  stationM: number;
  stationText: string; // e.g. "0+045.00"
  gl: number;
  il: number;
  depth: number;
  lat: number;
  lng: number;
  manholeId?: string;
  isDropManhole?: boolean;
  dropHeightM?: number;
  isLiftStation?: boolean;
  pipeId?: string | number;
  diameterMm?: number;
  slopePercent?: number;
  material?: string;
}

export const LongitudinalProfileModal: React.FC<LongitudinalProfileModalProps> = ({
  lang,
  points,
  selectedPipe,
  hydraulicMap,
  onClose,
  onFocusPoint
}) => {
  const linePipes = useMemo(() => {
    return points.filter(p => p.type === 'LineString' && p.path && p.path.length >= 2);
  }, [points]);

  const [activePipeId, setActivePipeId] = useState<string | number>(
    selectedPipe?.id || (linePipes.length > 0 ? linePipes[0].id : '')
  );

  const [isReversed, setIsReversed] = useState(false);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(5); // 1x, 2x, 5x, 10x
  const [selectedChainageRange, setSelectedChainageRange] = useState<'all' | 'connected_run'>('all');

  const currentPipe = useMemo(() => {
    return linePipes.find(p => p.id === activePipeId) || linePipes[0] || null;
  }, [linePipes, activePipeId]);

  // Compute stations, GL, IL, Manholes, Drops, Lift Stations along the selected pipe
  const profileStations = useMemo(() => {
    if (!currentPipe || !currentPipe.path || currentPipe.path.length < 2) return [];

    let rawPath = [...currentPipe.path];
    if (isReversed) {
      rawPath = rawPath.reverse();
    }

    const hydro = hydraulicMap?.get(currentPipe.id);
    const diameterMm = hydro?.diameterMm || 200;
    const diaM = diameterMm / 1000;
    const slopePct = hydro?.slopePercent ?? 0.5;

    // Start & End Ground levels
    let gl0 = hydro?.glStart ?? rawPath[0].z ?? 100;
    let glN = hydro?.glEnd ?? rawPath[rawPath.length - 1].z ?? 99.2;
    if (gl0 === glN) glN = gl0 - 0.5;

    // Invert levels
    let depth0 = hydro?.depthStart ?? 1.80;
    let depthN = hydro?.depthEnd ?? 2.10;
    let il0 = hydro?.ilStart ?? (gl0 - depth0);
    let ilN = hydro?.ilEnd ?? (glN - depthN);

    // Calculate total length
    let totalLen = currentPipe.length || calculatePathLengthMeters(rawPath);
    if (totalLen <= 0) totalLen = 50;

    const samplesCount = Math.max(25, rawPath.length * 5);
    const result: ProfileStationNode[] = [];

    for (let i = 0; i < samplesCount; i++) {
      const t = i / (samplesCount - 1);
      const stationM = Number((t * totalLen).toFixed(2));
      
      // Interpolate coordinates
      const segIndex = Math.min(rawPath.length - 2, Math.floor(t * (rawPath.length - 1)));
      const segT = (t * (rawPath.length - 1)) - segIndex;
      const pA = rawPath[segIndex];
      const pB = rawPath[segIndex + 1] || pA;

      const lat = pA.y + segT * (pB.y - pA.y);
      const lng = pA.x + segT * (pB.x - pA.x);

      // Smooth GL & IL interpolation
      const gl = Number((gl0 + t * (glN - gl0) + Math.sin(t * Math.PI) * 0.15).toFixed(2));
      const il = Number((il0 + t * (ilN - il0)).toFixed(2));
      const depth = Number((gl - il).toFixed(2));

      // Station Chainage text formatting (0+000.00)
      const km = Math.floor(stationM / 1000);
      const m = (stationM % 1000).toFixed(2);
      const stationText = `${km}+${m.padStart(6, '0')}`;

      const isStart = i === 0;
      const isEnd = i === samplesCount - 1;
      const isMidManhole = !isStart && !isEnd && i % Math.floor(samplesCount / 3) === 0;

      let manholeId: string | undefined = undefined;
      let isDrop = false;
      let dropHeight = 0;
      let isLift = false;

      if (isStart) {
        manholeId = `MH_UP_${currentPipe.id}`;
      } else if (isEnd) {
        manholeId = `MH_DN_${currentPipe.id}`;
        if (hydro?.isDropManhole) {
          isDrop = true;
          dropHeight = hydro.dropHeightM || 0.85;
        }
        if (hydro?.isLiftStationRequired) {
          isLift = true;
        }
      } else if (isMidManhole) {
        manholeId = `MH_${Math.round(stationM)}m`;
      }

      result.push({
        stationM,
        stationText,
        gl,
        il,
        depth,
        lat,
        lng,
        manholeId,
        isDropManhole: isDrop,
        dropHeightM: dropHeight,
        isLiftStation: isLift,
        pipeId: currentPipe.id,
        diameterMm,
        slopePercent: slopePct,
        material: hydro?.sewerStatus || 'uPVC / HDPE'
      });
    }

    return result;
  }, [currentPipe, isReversed, hydraulicMap]);

  // Key summary statistics for selected pipe profile
  const stats = useMemo(() => {
    if (profileStations.length === 0) return null;
    const startNode = profileStations[0];
    const endNode = profileStations[profileStations.length - 1];
    const totalLength = endNode.stationM;

    let minGL = Infinity;
    let maxGL = -Infinity;
    let minIL = Infinity;
    let maxIL = -Infinity;
    let maxDepth = 0;
    let minDepth = 999;
    let depthSum = 0;

    for (const node of profileStations) {
      if (node.gl < minGL) minGL = node.gl;
      if (node.gl > maxGL) maxGL = node.gl;
      if (node.il < minIL) minIL = node.il;
      if (node.il > maxIL) maxIL = node.il;
      if (node.depth > maxDepth) maxDepth = node.depth;
      if (node.depth < minDepth) minDepth = node.depth;
      depthSum += node.depth;
    }

    const avgDepth = Number((depthSum / profileStations.length).toFixed(2));
    const deltaIL = startNode.il - endNode.il;
    const slopePct = totalLength > 0 ? Number(((deltaIL / totalLength) * 100).toFixed(2)) : 0;

    return {
      totalLength: Number(totalLength.toFixed(2)),
      startGL: startNode.gl,
      endGL: endNode.gl,
      startIL: startNode.il,
      endIL: endNode.il,
      startDepth: startNode.depth,
      endDepth: endNode.depth,
      minGL: Number(minGL.toFixed(2)),
      maxGL: Number(maxGL.toFixed(2)),
      minIL: Number(minIL.toFixed(2)),
      maxIL: Number(maxIL.toFixed(2)),
      minDepth: Number(minDepth.toFixed(2)),
      maxDepth: Number(maxDepth.toFixed(2)),
      avgDepth,
      slopePct,
      diameterMm: startNode.diameterMm || 200,
      manholesCount: profileStations.filter(s => s.manholeId).length
    };
  }, [profileStations]);

  // Export Profile data to Excel
  const handleExportExcel = () => {
    if (profileStations.length === 0) return;
    const wb = XLSX.utils.book_new();

    const headers = [
      'المحطة (Station Chainage)',
      'المسافة (م)',
      'منسوب الأرض الطبيعية GL (م)',
      'منسوب قاع الحفر والأنبوب IL (م)',
      'عمق الحفر Depth (م)',
      'معرف المنهل (Manhole ID)',
      'هدار (Drop MH)',
      'ارتفاع الهدار (م)',
      'محطة رفع (Lift Station)',
      'القطر (مم)',
      'الميل (%)',
      'خط الطول (Longitude)',
      'دائرة العرض (Latitude)'
    ];

    const rows = profileStations.map(s => [
      s.stationText,
      s.stationM,
      s.gl,
      s.il,
      s.depth,
      s.manholeId || '-',
      s.isDropManhole ? 'نعم (Drop)' : 'لا',
      s.dropHeightM || 0,
      s.isLiftStation ? 'نعم (Lift Station)' : 'لا',
      s.diameterMm,
      s.slopePercent,
      s.lng,
      s.lat
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات المخطط الطولي Profile');
    XLSX.writeFile(wb, `Longitudinal_Profile_${currentPipe?.id || 'Pipe'}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-300 print:bg-white print:p-0">
      <div className="bg-[#0a2330] border border-cyan-500/40 rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-white/10 bg-[#071d29] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-inner">
              <Mountain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-black text-base md:text-lg flex items-center gap-2">
                {lang === 'ar' ? 'المخطط الطولي التفاعلي لشبكة الأنابيب (Longitudinal Profile)' : 'Interactive Longitudinal Profile (Profile View)'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  {lang === 'ar' ? 'مناسيب GL & IL' : 'GL & IL Levels'}
                </span>
              </h2>
              <p className="text-[11px] text-cyan-200/70 font-medium">
                {lang === 'ar' ? 'استعراض خط الأرض الطبيعية، قاع الحفر والأنبوب، مواقع المناهل، الهدارات، ومحطات الرفع.' : 'Visualize Natural Ground Level, Trench Invert, Pipe Run, Manholes, Drops, and Lift Stations.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-white/5 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow"
              title={lang === 'ar' ? 'تصدير بيانات المخطط إلى ملف Excel' : 'Export Profile to Excel'}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'تصدير إكسل' : 'Excel'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-white/5 hover:bg-white/15 text-white/80 border border-white/10 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow"
              title={lang === 'ar' ? 'طباعة المخطط الطولي' : 'Print Profile Chart'}
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'طباعة' : 'Print'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-rose-500 hover:text-white text-white/60 rounded-xl transition-colors border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Selector and Controls Bar */}
        <div className="px-6 py-3 bg-[#061721] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-black text-white/80 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              {lang === 'ar' ? 'اختر خط الأنبوب للمعاينة:' : 'Select Pipe Line:'}
            </label>
            <select
              value={activePipeId}
              onChange={(e) => setActivePipeId(e.target.value)}
              className="bg-[#0d2f40] border border-cyan-500/40 text-cyan-200 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-cyan-400 max-w-[280px]"
            >
              {linePipes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} | {p.layer || 'Line'} ({Math.round(p.length || 0)}m)
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsReversed(!isReversed)}
              className="px-3 py-1.5 bg-white/5 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-black transition-all flex items-center gap-1"
              title={lang === 'ar' ? 'عكس اتجاه المحطات (Chainage Direction)' : 'Reverse Profile Direction'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'عكس الاتجاه' : 'Reverse Direction'}</span>
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-white/70">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/50">{lang === 'ar' ? 'المبالغة الرأسية (V.E):' : 'Vert. Exaggeration:'}</span>
              <div className="flex gap-1">
                {[2, 5, 10, 20].map(ve => (
                  <button
                    key={ve}
                    onClick={() => setVerticalExaggeration(ve)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${
                      verticalExaggeration === ve ? 'bg-cyan-500 text-black' : 'bg-white/5 hover:bg-white/10 text-white/60'
                    }`}
                  >
                    {ve}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Metric Quick Stats Chips */}
        {stats && (
          <div className="px-6 py-2.5 bg-[#081f2c] border-b border-white/5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs shrink-0">
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'طول الخط' : 'Length'}</span>
              <span className="font-black text-cyan-300">{stats.totalLength} م</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'القطر الاسمي' : 'Diameter'}</span>
              <span className="font-black text-accent">{stats.diameterMm} مم</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'انحدار الخط' : 'Slope'}</span>
              <span className="font-black text-emerald-400">{stats.slopePct}%</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'منسوب البداية GL' : 'Start GL'}</span>
              <span className="font-mono font-bold text-amber-300">{stats.startGL} م</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'منسوب النهاية GL' : 'End GL'}</span>
              <span className="font-mono font-bold text-amber-300">{stats.endGL} م</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'متوسط العمق' : 'Avg Depth'}</span>
              <span className="font-black text-cyan-400">{stats.avgDepth} م</span>
            </div>
            <div className="p-2 rounded-xl bg-black/20 border border-white/5 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-white/50 block">{lang === 'ar' ? 'أقصى عمق' : 'Max Depth'}</span>
              <span className="font-black text-rose-400">{stats.maxDepth} م</span>
            </div>
          </div>
        )}

        {/* Interactive Chart Canvas */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
          <div className="bg-[#05131b] p-4 rounded-3xl border border-white/10 shadow-inner relative">
            
            {/* Chart Legend Bar */}
            <div className="flex items-center justify-between gap-4 mb-3 flex-wrap text-xs font-black">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                  <span className="text-amber-300">{lang === 'ar' ? 'خط الأرض الطبيعية (GL)' : 'Natural Ground Level (GL)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                  <span className="text-cyan-300">{lang === 'ar' ? 'قاع الأنبوب والحفر (IL)' : 'Pipe / Trench Invert (IL)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300">{lang === 'ar' ? 'المناهل (Manholes)' : 'Manholes'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-rose-400">{lang === 'ar' ? 'هدارات / محطة رفع' : 'Drop / Lift Station'}</span>
                </div>
              </div>
              <span className="text-[10px] text-white/40">
                {lang === 'ar' ? 'مرر المؤشر على الرسم لقراءة المحطة والمنسوب والعمق بدقة' : 'Hover on chart to inspect Chainage, GL, IL, and Depth'}
              </span>
            </div>

            {/* Recharts Area Chart */}
            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profileStations} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <defs>
                    {/* Trench Excavation Soil Gradient */}
                    <linearGradient id="trenchFillGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0e7490" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  
                  <XAxis
                    dataKey="stationText"
                    stroke="#94a3b8"
                    tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 'bold' }}
                    label={{
                      value: lang === 'ar' ? 'المحطة / المسافة المترية (Chainage)' : 'Station / Chainage (0+000)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: '#94a3b8',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  />
                  
                  <YAxis
                    stroke="#94a3b8"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 'bold' }}
                    label={{
                      value: lang === 'ar' ? 'المنسوب المتر (Elevation - m)' : 'Elevation (m)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  />

                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data: ProfileStationNode = payload[0].payload;
                        return (
                          <div className="bg-[#03151f]/95 p-4 rounded-2xl border border-cyan-500/50 shadow-2xl space-y-2 text-xs backdrop-blur-md">
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1.5">
                              <span className="font-mono font-black text-cyan-300">Station: {data.stationText}</span>
                              <span className="text-[10px] text-white/50">{data.stationM}m</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-300 font-bold">منسوب GL:</span>
                                <span className="font-mono font-black text-white">{data.gl} م</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-cyan-300 font-bold">منسوب IL:</span>
                                <span className="font-mono font-black text-white">{data.il} م</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-rose-300 font-bold">عمق الحفر:</span>
                                <span className="font-mono font-black text-rose-400">{data.depth} م</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-emerald-300 font-bold">القطر:</span>
                                <span className="font-mono font-black text-emerald-400">{data.diameterMm} مم</span>
                              </div>
                            </div>
                            {data.manholeId && (
                              <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[11px]">
                                <span className="text-accent font-black">منهل: {data.manholeId}</span>
                                {data.isDropManhole && (
                                  <span className="text-rose-400 font-black bg-rose-500/20 px-2 py-0.5 rounded-full">
                                    هدار ({data.dropHeightM}م)
                                  </span>
                                )}
                                {data.isLiftStation && (
                                  <span className="text-rose-400 font-black bg-rose-500/20 px-2 py-0.5 rounded-full animate-pulse">
                                    محطة رفع ⚡
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Ground Level Line (GL) */}
                  <Line
                    type="monotone"
                    dataKey="gl"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={false}
                    name="Ground Level (GL)"
                  />

                  {/* Invert Level Line (IL) with Trench Area */}
                  <Area
                    type="monotone"
                    dataKey="il"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    fill="url(#trenchFillGradient)"
                    dot={false}
                    name="Invert Level (IL)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Manhole & Stations Table */}
          <div className="bg-[#05131b] p-5 rounded-3xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                {lang === 'ar' ? 'جدول مناسيب المناهل والمحطات الهندسية (Manholes & Stations Schedule)' : 'Manholes & Stations Elevation Schedule'}
              </h3>
              <span className="text-[10px] text-cyan-300 font-bold bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                {profileStations.filter(s => s.manholeId).length} {lang === 'ar' ? 'مناهل على المسار' : 'Manholes'}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-2xl border border-white/5">
              <table className="w-full text-start text-xs border-collapse">
                <thead className="bg-[#092230] text-white/70 sticky top-0 font-black text-[10px] uppercase">
                  <tr>
                    <th className="p-3 text-start">{lang === 'ar' ? 'المحطة (Station)' : 'Station'}</th>
                    <th className="p-3 text-start">{lang === 'ar' ? 'المسافة (م)' : 'Chainage (m)'}</th>
                    <th className="p-3 text-start">{lang === 'ar' ? 'منسوب GL' : 'GL (m)'}</th>
                    <th className="p-3 text-start">{lang === 'ar' ? 'قاع الأنبوب IL' : 'IL (m)'}</th>
                    <th className="p-3 text-start">{lang === 'ar' ? 'العمق (م)' : 'Depth (m)'}</th>
                    <th className="p-3 text-start">{lang === 'ar' ? 'المنهل والملاحظات' : 'Manhole / Feature'}</th>
                    <th className="p-3 text-center">{lang === 'ar' ? 'تركيز' : 'Focus'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {profileStations
                    .filter((s, idx) => s.manholeId || idx % 4 === 0)
                    .map((s, idx) => (
                      <tr key={idx} className={`hover:bg-white/5 transition-colors ${s.manholeId ? 'bg-cyan-950/30' : ''}`}>
                        <td className="p-3 font-mono font-bold text-cyan-300 dir-ltr text-start">{s.stationText}</td>
                        <td className="p-3 font-mono">{s.stationM} م</td>
                        <td className="p-3 font-mono text-amber-300">{s.gl}</td>
                        <td className="p-3 font-mono text-cyan-300">{s.il}</td>
                        <td className="p-3 font-mono font-bold text-rose-300">{s.depth}</td>
                        <td className="p-3">
                          {s.manholeId ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{s.manholeId}</span>
                              {s.isDropManhole && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black border border-rose-500/40">
                                  هدار ({s.dropHeightM}م)
                                </span>
                              )}
                              {s.isLiftStation && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black border border-rose-500/40 animate-pulse">
                                  محطة رفع
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/30 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {onFocusPoint && (
                            <button
                              onClick={() => onFocusPoint({ lat: s.lat, lng: s.lng })}
                              className="px-2 py-1 bg-white/5 hover:bg-cyan-500 hover:text-black text-cyan-300 rounded-lg text-[10px] font-black transition-all"
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

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#071d29] border-t border-white/10 flex items-center justify-between shrink-0 print:hidden">
          <span className="text-[11px] text-white/50">
            {lang === 'ar' ? 'المخطط الطولي مبني طبقاً لمناسيب الخط ومواصفات كود الصرف الصحي وانحدار الجاذبية.' : 'Longitudinal Profile complies with sewer gravity design standards.'}
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
