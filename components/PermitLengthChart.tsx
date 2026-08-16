import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { FileText, Layers, Ruler, BarChart3, Hash, ArrowUpDown, Eye, MapPin, Filter } from 'lucide-react';
import { GeoPoint } from '../types';
import { Language } from '../translations';
import { STATUS_CATEGORIES, matchStatusByColor } from '../services/colorUtils';

export interface PermitDetailItem {
  idValue: string;
  count: number;
  totalLength: number;
  points: GeoPoint[];
  projectName?: string;
  projectId?: string;
  contractor?: string;
  primaryColor?: string;
  primaryStatusKey?: 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining' | 'cancelled' | string;
  primaryStatusNameAr?: string;
  primaryStatusNameEn?: string;
  statusBreakdown?: Record<string, { count: number; totalLength: number }>;
}

interface PermitLengthChartProps {
  permitDetails: PermitDetailItem[];
  lang: Language;
  onHighlightPermit?: (points: GeoPoint[]) => void;
}

export const PermitLengthChart: React.FC<PermitLengthChartProps> = ({
  permitDetails,
  lang,
  onHighlightPermit
}) => {
  const [sortBy, setSortBy] = useState<'length-desc' | 'length-asc' | 'count-desc' | 'color-status' | 'name'>('length-desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'executed_water' | 'executed_sewer' | 'in_progress' | 'remaining' | 'cancelled'>('all');
  const [unit, setUnit] = useState<'km' | 'm'>('km');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Status Category Summaries
  const statusSummaries = useMemo(() => {
    const summary: Record<string, { count: number; totalLength: number }> = {
      executed_water: { count: 0, totalLength: 0 },
      executed_sewer: { count: 0, totalLength: 0 },
      in_progress: { count: 0, totalLength: 0 },
      remaining: { count: 0, totalLength: 0 },
      cancelled: { count: 0, totalLength: 0 },
    };

    if (!permitDetails) return summary;

    permitDetails.forEach(item => {
      const key = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '').key;
      if (summary[key]) {
        summary[key].count++;
        summary[key].totalLength += item.totalLength || 0;
      }
    });

    return summary;
  }, [permitDetails]);

  // Overall Statistics
  const stats = useMemo(() => {
    if (!permitDetails || permitDetails.length === 0) {
      return { totalCount: 0, totalLengthKm: '0.00', longestId: '-', maxLengthKm: '0.00', avgLengthKm: '0.00', sumLenMeters: 0 };
    }

    const totalCount = permitDetails.length;
    let maxLen = 0;
    let longestId = '-';
    let sumLen = 0;

    permitDetails.forEach(item => {
      sumLen += item.totalLength || 0;
      if ((item.totalLength || 0) > maxLen) {
        maxLen = item.totalLength || 0;
        longestId = item.idValue;
      }
    });

    const totalLengthKm = (sumLen / 1000).toFixed(2);
    const maxLengthKm = (maxLen / 1000).toFixed(2);
    const avgLengthKm = totalCount > 0 ? ((sumLen / totalCount) / 1000).toFixed(2) : '0.00';

    return { totalCount, totalLengthKm, longestId, maxLengthKm, avgLengthKm, sumLenMeters: sumLen };
  }, [permitDetails]);

  // Processed Data for Chart
  const processedData = useMemo(() => {
    if (!permitDetails || permitDetails.length === 0) return [];

    let list = [...permitDetails];

    // Filter by Status Color
    if (statusFilter !== 'all') {
      list = list.filter(item => {
        const itemKey = item.primaryStatusKey || matchStatusByColor(item.primaryColor || '').key;
        if (itemKey === statusFilter) return true;
        if (item.statusBreakdown && item.statusBreakdown[statusFilter] && item.statusBreakdown[statusFilter].count > 0) return true;
        return false;
      });
    }

    // Filter by Search Text
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item =>
        item.idValue.toLowerCase().includes(q) ||
        (item.projectName && item.projectName.toLowerCase().includes(q)) ||
        (item.projectId && item.projectId.toLowerCase().includes(q)) ||
        (item.contractor && item.contractor.toLowerCase().includes(q))
      );
    }

    // Sort Order
    const statusPriorityMap: Record<string, number> = {
      executed_water: 1,
      executed_sewer: 2,
      in_progress: 3,
      remaining: 4,
      cancelled: 5
    };

    list.sort((a, b) => {
      if (sortBy === 'color-status') {
        const keyA = a.primaryStatusKey || matchStatusByColor(a.primaryColor || '').key;
        const keyB = b.primaryStatusKey || matchStatusByColor(b.primaryColor || '').key;
        const prioA = statusPriorityMap[keyA] || 99;
        const prioB = statusPriorityMap[keyB] || 99;
        if (prioA !== prioB) return prioA - prioB;
        return b.totalLength - a.totalLength;
      }
      if (sortBy === 'length-desc') return b.totalLength - a.totalLength;
      if (sortBy === 'length-asc') return a.totalLength - b.totalLength;
      if (sortBy === 'count-desc') return b.count - a.count;
      if (sortBy === 'name') return a.idValue.localeCompare(b.idValue);
      return 0;
    });

    return list.map(item => {
      const len = unit === 'km' ? Number((item.totalLength / 1000).toFixed(3)) : Math.round(item.totalLength);
      const displayName = item.idValue.length > 18 ? item.idValue.substring(0, 16) + '...' : item.idValue;
      
      const matchedCat = matchStatusByColor(item.primaryColor || item.points?.[0]?.color || '');
      const color = item.primaryColor || matchedCat.color;
      const statusName = lang === 'ar' ? (item.primaryStatusNameAr || matchedCat.nameAr) : (item.primaryStatusNameEn || matchedCat.nameEn);

      return {
        name: displayName,
        fullName: item.idValue,
        length: len,
        lengthMeters: item.totalLength,
        count: item.count,
        projectName: item.projectName,
        projectId: item.projectId,
        contractor: item.contractor,
        points: item.points,
        color: color,
        statusName: statusName,
        statusKey: item.primaryStatusKey || matchedCat.key
      };
    });
  }, [permitDetails, sortBy, statusFilter, unit, searchQuery, lang]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const totalM = stats.sumLenMeters || 1;
      const pct = ((data.lengthMeters / totalM) * 100).toFixed(1);
      const isNearLeft = coordinate && coordinate.x < 90;

      return (
        <div className={`bg-[#1f0f05]/95 border-2 border-[#FF6D00] p-3.5 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] text-xs text-white space-y-2 backdrop-blur-xl w-[250px] z-[99999999] pointer-events-none transition-transform duration-75 ${isNearLeft ? 'ml-3' : '-translate-x-full -ml-3'}`}>
          <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: data.color }} />
              <span className="font-mono font-black text-[#ffc499] text-xs truncate dir-ltr">{data.fullName}</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm shrink-0" style={{ backgroundColor: data.color }}>
              {data.statusName}
            </span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-4">
              <span className="text-white/60">{lang === 'ar' ? 'حالة العنصر / اللون:' : 'Element Status / Color:'}</span>
              <span className="font-black text-amber-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
                {data.statusName}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/60">{lang === 'ar' ? 'إجمالي الطول:' : 'Total Length:'}</span>
              <span className="font-black text-amber-300">
                {(data.lengthMeters / 1000).toFixed(3)} km ({Math.round(data.lengthMeters)} m)
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/60">{lang === 'ar' ? 'عدد العناصر:' : 'Element Count:'}</span>
              <span className="font-black text-cyan-300">{data.count} {lang === 'ar' ? 'عنصر' : 'elements'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/60">{lang === 'ar' ? 'النسبة من الشبكة:' : 'Network Ratio:'}</span>
              <span className="font-black text-amber-400">{pct}%</span>
            </div>
            {data.contractor && (
              <div className="flex justify-between gap-4 border-t border-white/10 pt-1">
                <span className="text-white/60">{lang === 'ar' ? 'المقاول:' : 'Contractor:'}</span>
                <span className="font-bold text-amber-200 truncate">{data.contractor}</span>
              </div>
            )}
            {data.projectName && (
              <div className="flex justify-between gap-4">
                <span className="text-white/60">{lang === 'ar' ? 'المشروع:' : 'Project:'}</span>
                <span className="font-bold text-white/90 truncate">{data.projectName}</span>
              </div>
            )}
          </div>
          <div className="text-[9px] text-[#ffc499] pt-1 font-bold italic text-center border-t border-white/10">
            {lang === 'ar' ? '💡 انقر على العمود لتحديد الخطوط على الخريطة' : '💡 Click bar to highlight on map'}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#180a03]/80 p-5 rounded-2xl border border-[#FF6D00]/30 space-y-4 text-white">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-[#FF6D00]/20 text-[#FF6D00] border border-[#FF6D00]/30">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-xs text-white uppercase tracking-wider">
              {lang === 'ar' ? 'الرسم البياني لأطوال التراخيص (Permit No)' : 'Permit No Length Breakdown Chart'}
            </h3>
            <p className="text-[10px] text-white/50">
              {lang === 'ar' ? 'تحليل أطوال وأعداد عناصر كل رقم ترخيص صادر مفروزة حسب حالة العنصر' : 'Visual length comparison per official permit number sorted by element color'}
            </p>
          </div>
        </div>

        {/* Toolbar: Sort & Units */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Switcher */}
          <div className="bg-black/40 p-1 rounded-xl border border-white/10 flex items-center">
            <button
              onClick={() => setUnit('km')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                unit === 'km' ? 'bg-[#FF6D00] text-black shadow-md' : 'text-white/60 hover:text-white'
              }`}
            >
              KM
            </button>
            <button
              onClick={() => setUnit('m')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                unit === 'm' ? 'bg-[#FF6D00] text-black shadow-md' : 'text-white/60 hover:text-white'
              }`}
            >
              Meters
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/10 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#ffc499]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-white text-[11px] font-bold focus:outline-none cursor-pointer"
            >
              <option value="color-status" className="bg-[#1f0f05] text-white">
                {lang === 'ar' ? '🎨 فرز بحسب ألوان العنصر' : '🎨 Sort by Element Color'}
              </option>
              <option value="length-desc" className="bg-[#1f0f05] text-white">
                {lang === 'ar' ? 'الأطول أولاً' : 'Longest First'}
              </option>
              <option value="length-asc" className="bg-[#1f0f05] text-white">
                {lang === 'ar' ? 'الأقصر أولاً' : 'Shortest First'}
              </option>
              <option value="count-desc" className="bg-[#1f0f05] text-white">
                {lang === 'ar' ? 'الأكثر عناصر' : 'Highest Count'}
              </option>
              <option value="name" className="bg-[#1f0f05] text-white">
                {lang === 'ar' ? 'أبجدي' : 'By Name'}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter by Element Color/Status Pills */}
      <div className="space-y-2 bg-black/30 p-3 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#ffc499]">
          <Filter className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'تصفية التراخيص حسب لون العنصر (الحالة):' : 'Filter Permits by Element Status Color:'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === 'all'
                ? 'bg-white text-black shadow-lg scale-105 font-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <span>{lang === 'ar' ? 'الكل' : 'All'}</span>
            <span className="text-[10px] bg-black/30 px-1.5 py-0.2 rounded-full">{permitDetails.length}</span>
          </button>

          {STATUS_CATEGORIES.map(cat => {
            const isSelected = statusFilter === cat.key;
            const sumData = statusSummaries[cat.key] || { count: 0, totalLength: 0 };
            return (
              <button
                key={cat.key}
                onClick={() => setStatusFilter(cat.key as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                  isSelected
                    ? 'ring-2 ring-white scale-105 font-black shadow-lg text-white'
                    : 'bg-black/40 text-white/80 hover:bg-black/60 border-white/10'
                }`}
                style={{
                  backgroundColor: isSelected ? cat.color : `${cat.color}25`,
                  borderColor: cat.color
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0" style={{ backgroundColor: cat.color }} />
                <span>{lang === 'ar' ? cat.nameAr : cat.nameEn}</span>
                <span className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded-md text-white/90">
                  {sumData.count} ({ (sumData.totalLength / 1000).toFixed(1) }km)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <FileText className="w-3.5 h-3.5 text-[#ffc499]" />
            <span>{lang === 'ar' ? 'إجمالي التراخيص المعروضة' : 'Total Filtered Permits'}</span>
          </div>
          <span className="text-xl font-black text-[#ffc499]">{processedData.length}</span>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-emerald-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lang === 'ar' ? 'إجمالي الأطوال المرخصة' : 'Total Permitted Length'}</span>
          </div>
          <span className="text-xl font-black text-emerald-400">
            {(processedData.reduce((acc, i) => acc + i.lengthMeters, 0) / 1000).toFixed(2)} km
          </span>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-amber-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            <span>{lang === 'ar' ? 'أطول ترخيص' : 'Longest Permit'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black text-amber-300">
              {processedData.length > 0 ? (Math.max(...processedData.map(i => i.lengthMeters)) / 1000).toFixed(2) : '0.00'} km
            </span>
            <span className="text-[9px] font-mono text-white/50 truncate max-w-[120px] mx-auto">
              {processedData.length > 0 ? processedData[0].fullName : '-'}
            </span>
          </div>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-cyan-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <Hash className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lang === 'ar' ? 'متوسط طول الترخيص' : 'Average Permit Length'}</span>
          </div>
          <span className="text-xl font-black text-cyan-400">
            {processedData.length > 0
              ? ((processedData.reduce((acc, i) => acc + i.lengthMeters, 0) / processedData.length) / 1000).toFixed(2)
              : '0.00'} km
          </span>
        </div>
      </div>

      {/* Filter search bar inside chart */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={lang === 'ar' ? 'فلترة أو البحث داخل الرسم البياني بالـ Permit No...' : 'Filter chart by Permit No...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#FF6D00]"
        />
      </div>

      {/* Active Item Details Banner */}
      {processedData.length > 0 && (() => {
        const activeItem = hoveredBarIndex !== null && processedData[hoveredBarIndex]
          ? processedData[hoveredBarIndex]
          : processedData[0];
        if (!activeItem) return null;
        const totalM = stats.sumLenMeters || 1;
        const pct = ((activeItem.lengthMeters / totalM) * 100).toFixed(1);

        return (
          <div className="bg-[#1f0f05]/95 border-2 rounded-2xl p-3.5 shadow-xl text-xs space-y-2 text-white animate-in fade-in duration-300" style={{ borderColor: activeItem.color || '#FF6D00' }}>
            <div className="flex items-center justify-between border-b pb-2 gap-2" style={{ borderColor: `${activeItem.color}50` }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0 border border-white/40 shadow-sm" style={{ backgroundColor: activeItem.color }} />
                <span className="font-mono font-black text-xs sm:text-sm truncate dir-ltr text-[#ffc499]" title={activeItem.fullName}>
                  {activeItem.fullName}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm shrink-0" style={{ backgroundColor: activeItem.color }}>
                  {activeItem.statusName}
                </span>
              </div>
              {activeItem.points && onHighlightPermit && (
                <button
                  onClick={() => onHighlightPermit(activeItem.points)}
                  className="shrink-0 bg-[#FF6D00] hover:bg-[#ff8800] text-black px-2.5 py-1 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-all shadow-md active:scale-95"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'تحديد الخريطة' : 'Highlight'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'لون وحالة العنصر' : 'Status Color'}
                </span>
                <span className="text-xs font-black flex items-center gap-1" style={{ color: activeItem.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeItem.color }} />
                  {activeItem.statusName}
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'إجمالي الطول' : 'Total Length'}
                </span>
                <span className="text-xs font-black text-amber-300">
                  {(activeItem.lengthMeters / 1000).toFixed(3)} km ({Math.round(activeItem.lengthMeters)} m)
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'عدد العناصر' : 'Element Count'}
                </span>
                <span className="text-xs font-black text-cyan-300">
                  {activeItem.count} {lang === 'ar' ? 'عنصر' : 'elements'}
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10 truncate">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'المقاول / المشروع' : 'Contractor / Project'}
                </span>
                <span className="text-xs font-bold text-amber-200 truncate block">
                  {activeItem.contractor || activeItem.projectName || '-'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recharts Bar Chart Container */}
      {processedData.length > 0 ? (
        <div className="w-full h-80 pt-4 bg-black/20 rounded-2xl border border-white/5 p-2 relative overflow-visible z-30">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={processedData}
              margin={{ top: 20, right: 20, left: 10, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" vertical={false} />
              <XAxis
                dataKey="name"
                interval={0}
                height={50}
                stroke="#FF6D0050"
                tick={({ x, y, payload }: any) => {
                  const val = String(payload.value || '');
                  const shortVal = val.length > 10 ? `${val.slice(0, 8)}…` : val;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text
                        x={0}
                        y={0}
                        dy={12}
                        textAnchor="end"
                        fill="#ffc499"
                        fontSize={9}
                        fontWeight="bold"
                        transform="rotate(-30)"
                      >
                        {shortVal}
                      </text>
                    </g>
                  );
                }}
              />
              <YAxis
                tick={{ fill: '#ff9800', fontSize: 10 }}
                stroke="#FF6D0050"
                unit={unit === 'km' ? ' km' : ' m'}
              />
              <RechartsTooltip
                content={<CustomTooltip />}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 99999999, outline: 'none', pointerEvents: 'none' }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.08)' }}
              />
              <Bar
                dataKey="length"
                radius={[8, 8, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  if (data && data.points && onHighlightPermit) {
                    onHighlightPermit(data.points);
                  }
                }}
                onMouseEnter={(_, index) => setHoveredBarIndex(index)}
                onMouseLeave={() => setHoveredBarIndex(null)}
              >
                {processedData.map((item, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={item.color || '#FF6D00'}
                    stroke={hoveredBarIndex === index ? '#FFFFFF' : `${item.color}B0`}
                    strokeWidth={hoveredBarIndex === index ? 2 : 1}
                    style={{
                      filter: hoveredBarIndex === index ? `drop-shadow(0px 0px 8px ${item.color})` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="py-12 text-center text-white/40 text-xs font-bold">
          {lang === 'ar' ? 'لا توجد بيانات مطابقة للفلتر المحدد' : 'No permit data matching filter'}
        </div>
      )}

      {/* Top Highlights Cards */}
      {processedData.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-2">
          <h4 className="text-[11px] font-black text-white/70 uppercase tracking-wider flex items-center justify-between">
            <span>{lang === 'ar' ? 'أبرز التراخيص المعروضة في الرسم البياني:' : 'Featured Permits in Chart:'}</span>
            <span className="text-[10px] text-[#ffc499] font-normal">
              {lang === 'ar' ? 'انقر على الكرت للتكبير على الخريطة' : 'Click card to highlight on map'}
            </span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {processedData.slice(0, 3).map((item, idx) => (
              <div
                key={`permit-hl-${item.fullName || item.permitId || idx}-${idx}`}
                onClick={() => onHighlightPermit && onHighlightPermit(item.points)}
                className="bg-black/40 hover:bg-[#FF6D00]/20 p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-[#FF6D00]/50 group"
                style={{ borderColor: `${item.color}40` }}
              >
                <div className="overflow-hidden space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: item.color }} />
                    <span className="font-mono font-bold text-xs text-[#ffc499] truncate dir-ltr">
                      {item.fullName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded text-white" style={{ backgroundColor: item.color }}>
                      {item.statusName}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/50 flex items-center gap-2">
                    <span>#{item.count} {lang === 'ar' ? 'عناصر' : 'items'}</span>
                    {item.contractor && <span className="text-amber-300/80 truncate">| {item.contractor}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-black text-emerald-400 block">
                    {(item.lengthMeters / 1000).toFixed(3)} km
                  </span>
                  <span className="text-[9px] text-[#ffc499] group-hover:underline flex items-center justify-end gap-0.5">
                    <Eye className="w-2.5 h-2.5" />
                    <span>{lang === 'ar' ? 'عرض' : 'View'}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
