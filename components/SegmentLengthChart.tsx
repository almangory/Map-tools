import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, Filter, ArrowUpDown, MapPin, Layers, Hash, Ruler, Eye } from 'lucide-react';
import { GeoPoint } from '../types';

export interface SegmentDetailItem {
  idValue: string;
  count: number;
  totalLength: number; // in meters
  projectName?: string;
  projectId?: string;
  contractor?: string;
  points: GeoPoint[];
}

interface SegmentLengthChartProps {
  segmentDetails: SegmentDetailItem[];
  lang: 'ar' | 'en';
  onHighlightSegment?: (points: GeoPoint[]) => void;
}

export const SegmentLengthChart: React.FC<SegmentLengthChartProps> = ({
  segmentDetails,
  lang,
  onHighlightSegment,
}) => {
  const [topLimit, setTopLimit] = useState<number>(10);
  const [sortBy, setSortBy] = useState<'length-desc' | 'length-asc' | 'count-desc' | 'name'>('length-desc');
  const [unit, setUnit] = useState<'km' | 'm'>('km');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Filter & Sort Data
  const processedData = useMemo(() => {
    if (!segmentDetails || segmentDetails.length === 0) return [];

    let filtered = segmentDetails.filter(item => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.idValue.toLowerCase().includes(q) ||
        (item.projectName && item.projectName.toLowerCase().includes(q)) ||
        (item.projectId && item.projectId.toLowerCase().includes(q)) ||
        (item.contractor && item.contractor.toLowerCase().includes(q))
      );
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'length-desc') return b.totalLength - a.totalLength;
      if (sortBy === 'length-asc') return a.totalLength - b.totalLength;
      if (sortBy === 'count-desc') return b.count - a.count;
      if (sortBy === 'name') return a.idValue.localeCompare(b.idValue, undefined, { numeric: true });
      return 0;
    });

    // Limit
    if (topLimit > 0) {
      filtered = filtered.slice(0, topLimit);
    }

    return filtered.map((item, index) => {
      const lengthInUnit = unit === 'km' ? item.totalLength / 1000 : item.totalLength;
      return {
        idValue: item.idValue,
        name: item.idValue.length > 15 ? `${item.idValue.slice(0, 12)}...` : item.idValue,
        fullName: item.idValue,
        length: Number(lengthInUnit.toFixed(unit === 'km' ? 3 : 1)),
        lengthMeters: item.totalLength,
        count: item.count,
        projectName: item.projectName,
        projectId: item.projectId,
        contractor: item.contractor,
        points: item.points,
        rank: index + 1,
      };
    });
  }, [segmentDetails, searchQuery, sortBy, topLimit, unit]);

  // General Statistics
  const stats = useMemo(() => {
    if (!segmentDetails || segmentDetails.length === 0) {
      return { totalLengthKm: 0, maxLengthKm: 0, avgLengthKm: 0, longestId: '-' };
    }

    let totalMeters = 0;
    let maxMeters = 0;
    let longestId = '-';

    segmentDetails.forEach(item => {
      totalMeters += item.totalLength;
      if (item.totalLength > maxMeters) {
        maxMeters = item.totalLength;
        longestId = item.idValue;
      }
    });

    const avgMeters = totalMeters / (segmentDetails.length || 1);

    return {
      totalLengthKm: (totalMeters / 1000).toFixed(2),
      maxLengthKm: (maxMeters / 1000).toFixed(2),
      avgLengthKm: (avgMeters / 1000).toFixed(2),
      longestId,
      totalCount: segmentDetails.length,
    };
  }, [segmentDetails]);

  // Color palette for bars
  const getBarColor = (index: number, total: number) => {
    if (index === 0) return '#C084FC'; // Top 1: Glowing light purple
    if (index === 1) return '#A855F7'; // Top 2: Vivid purple
    if (index === 2) return '#9333EA'; // Top 3: Deep violet
    if (index < 5) return '#7E22CE';
    return '#6B21A8';
  };

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#180a2c]/95 border-2 border-[#9000FF] rounded-2xl p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.95)] backdrop-blur-xl w-[240px] text-xs space-y-2 text-white z-[99999999] pointer-events-none">
          <div className="flex items-center justify-between border-b border-[#9000FF]/40 pb-2 gap-2">
            <span className="font-mono font-black text-[#d8b4fe] text-xs truncate dir-ltr" title={data.fullName}>
              {data.fullName}
            </span>
            <span className="text-[10px] font-bold bg-[#9000FF]/40 text-[#d8b4fe] px-2 py-0.5 rounded-full border border-[#9000FF]/50 shrink-0">
              #{data.rank}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 py-1">
            <div className="bg-black/60 p-2 rounded-xl border border-white/10">
              <span className="text-[9px] text-white/60 block font-bold">
                {lang === 'ar' ? 'إجمالي الطول' : 'Total Length'}
              </span>
              <span className="text-xs font-black text-emerald-400">
                {unit === 'km' ? `${data.length} km` : `${data.length} m`}
              </span>
            </div>
            <div className="bg-black/60 p-2 rounded-xl border border-white/10">
              <span className="text-[9px] text-white/60 block font-bold">
                {lang === 'ar' ? 'عدد العناصر' : 'Items Count'}
              </span>
              <span className="text-xs font-black text-amber-400">
                {data.count} {lang === 'ar' ? 'عنصر' : 'items'}
              </span>
            </div>
          </div>

          {(data.projectName || data.projectId || data.contractor) && (
            <div className="space-y-1 text-[10px] text-white/80 border-t border-white/10 pt-2">
              {data.projectName && (
                <div className="truncate">
                  <span className="text-white/40">{lang === 'ar' ? 'المشروع: ' : 'Project: '}</span>
                  <span className="text-accent font-bold">{data.projectName}</span>
                </div>
              )}
              {data.projectId && (
                <div>
                  <span className="text-white/40">{lang === 'ar' ? 'رقم المشروع: ' : 'Project ID: '}</span>
                  <span className="text-white/90 font-mono">{data.projectId}</span>
                </div>
              )}
              {data.contractor && (
                <div className="truncate">
                  <span className="text-white/40">{lang === 'ar' ? 'المقاول: ' : 'Contractor: '}</span>
                  <span className="text-amber-300 font-bold">{data.contractor}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-[9px] text-center text-[#d8b4fe] pt-1 font-bold italic border-t border-white/10">
            {lang === 'ar' ? '🔍 اضغط على العمود للتحديد والتكبير على الخريطة' : '🔍 Click bar to highlight on map'}
          </div>
        </div>
      );
    }
    return null;
  };

  if (!segmentDetails || segmentDetails.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#120a21]/95 p-6 rounded-[2.5rem] border border-[#9000FF]/50 shadow-2xl space-y-6 animate-in fade-in duration-500 my-4 text-white">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#9000FF]/30 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#9000FF]/25 border border-[#9000FF]/50 text-[#d8b4fe]">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-wider flex items-center gap-2">
              <span>{lang === 'ar' ? 'رسم بياني لأطوال شرائح العمل (Total Length per Segment ID)' : 'Total Length per Segment ID Chart'}</span>
            </h3>
            <p className="text-white/50 text-[11px] font-bold">
              {lang === 'ar' ? 'تحليل وإبراز أطول الشرائح ومجموعات العمل ذات الكثافة العالية' : 'Identify high-density or long-running segments within the dataset'}
            </p>
          </div>
        </div>

        {/* Quick Unit & Display Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unit Switcher */}
          <div className="bg-black/50 p-1 rounded-xl border border-white/10 flex items-center">
            <button
              onClick={() => setUnit('km')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                unit === 'km' ? 'bg-[#9000FF] text-white shadow-md' : 'text-white/50 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'كيلومتر (km)' : 'KM'}
            </button>
            <button
              onClick={() => setUnit('m')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                unit === 'm' ? 'bg-[#9000FF] text-white shadow-md' : 'text-white/50 hover:text-white'
              }`}
            >
              {lang === 'ar' ? 'متر (m)' : 'Meters'}
            </button>
          </div>

          {/* Top N Limit */}
          <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10 text-[10px]">
            <Filter className="w-3.5 h-3.5 text-[#d8b4fe]" />
            <span className="text-white/50 font-bold">{lang === 'ar' ? 'عرض:' : 'Show:'}</span>
            <select
              value={topLimit}
              onChange={(e) => setTopLimit(Number(e.target.value))}
              className="bg-transparent text-[#d8b4fe] font-black focus:outline-none cursor-pointer"
            >
              <option value={5} className="bg-[#120a21] text-white">Top 5</option>
              <option value={10} className="bg-[#120a21] text-white">Top 10</option>
              <option value={20} className="bg-[#120a21] text-white">Top 20</option>
              <option value={50} className="bg-[#120a21] text-white">Top 50</option>
              <option value={0} className="bg-[#120a21] text-white">{lang === 'ar' ? 'الكل' : 'All'}</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10 text-[10px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#d8b4fe]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-[#d8b4fe] font-black focus:outline-none cursor-pointer"
            >
              <option value="length-desc" className="bg-[#120a21] text-white">{lang === 'ar' ? 'الأطول أولاً' : 'Longest First'}</option>
              <option value="length-asc" className="bg-[#120a21] text-white">{lang === 'ar' ? 'الأقصر أولاً' : 'Shortest First'}</option>
              <option value="count-desc" className="bg-[#120a21] text-white">{lang === 'ar' ? 'الأكثر عناصر' : 'Highest Count'}</option>
              <option value="name" className="bg-[#120a21] text-white">{lang === 'ar' ? 'أبجدي' : 'By Name'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-black/40 p-3.5 rounded-2xl border border-white/5 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <Layers className="w-3.5 h-3.5 text-[#d8b4fe]" />
            <span>{lang === 'ar' ? 'إجمالي الشرائح المعرفة' : 'Total Distinct Segments'}</span>
          </div>
          <span className="text-xl font-black text-[#d8b4fe]">{stats.totalCount}</span>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-emerald-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lang === 'ar' ? 'إجمالي الأطوال' : 'Total Segmented Length'}</span>
          </div>
          <span className="text-xl font-black text-emerald-400">{stats.totalLengthKm} km</span>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-purple-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            <span>{lang === 'ar' ? 'أطول شريحة' : 'Longest Segment'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black text-purple-300">{stats.maxLengthKm} km</span>
            <span className="text-[9px] font-mono text-white/50 truncate max-w-[120px] mx-auto">{stats.longestId}</span>
          </div>
        </div>

        <div className="bg-black/40 p-3.5 rounded-2xl border border-amber-500/20 text-center">
          <div className="flex items-center justify-center gap-1.5 text-white/50 text-[10px] font-bold mb-1">
            <Hash className="w-3.5 h-3.5 text-amber-400" />
            <span>{lang === 'ar' ? 'متوسط طول الشريحة' : 'Average Segment Length'}</span>
          </div>
          <span className="text-xl font-black text-amber-400">{stats.avgLengthKm} km</span>
        </div>
      </div>

      {/* Filter search bar inside chart */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={lang === 'ar' ? 'فلترة أو البحث داخل الرسم البياني بالـ Segment ID...' : 'Filter chart by Segment ID...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#9000FF]"
        />
      </div>

      {/* Active Item Details Banner (Pinned & High Visibility) */}
      {processedData.length > 0 && (() => {
        const activeItem = hoveredBarIndex !== null && processedData[hoveredBarIndex]
          ? processedData[hoveredBarIndex]
          : processedData[0];
        if (!activeItem) return null;
        return (
          <div className="bg-[#1a0a2e]/95 border-2 border-[#9000FF] rounded-2xl p-3.5 shadow-xl text-xs space-y-2 text-white animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-[#9000FF]/40 pb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold bg-[#9000FF]/40 text-[#d8b4fe] px-2 py-0.5 rounded-full border border-[#9000FF]/50 shrink-0">
                  #{activeItem.rank}
                </span>
                <span className="font-mono font-black text-[#d8b4fe] text-xs sm:text-sm truncate dir-ltr" title={activeItem.fullName}>
                  {activeItem.fullName}
                </span>
              </div>
              {activeItem.points && onHighlightSegment && (
                <button
                  onClick={() => onHighlightSegment(activeItem.points)}
                  className="shrink-0 bg-[#9000FF] hover:bg-[#a855f7] text-white px-2.5 py-1 rounded-xl font-bold text-[10px] flex items-center gap-1 transition-all shadow-md active:scale-95"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'تحديد الخريطة' : 'Highlight'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'إجمالي الطول' : 'Total Length'}
                </span>
                <span className="text-xs font-black text-emerald-400">
                  {unit === 'km' ? `${activeItem.length} km` : `${activeItem.length} m`} ({Math.round(activeItem.lengthMeters)} m)
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'عدد العناصر' : 'Items Count'}
                </span>
                <span className="text-xs font-black text-amber-400">
                  {activeItem.count} {lang === 'ar' ? 'عنصر' : 'items'}
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10 truncate">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'المشروع' : 'Project'}
                </span>
                <span className="text-xs font-bold text-cyan-300 truncate block">
                  {activeItem.projectName || '-'}
                </span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/10 truncate">
                <span className="text-[9px] text-white/60 block font-bold">
                  {lang === 'ar' ? 'المقاول' : 'Contractor'}
                </span>
                <span className="text-xs font-bold text-purple-300 truncate block">
                  {activeItem.contractor || '-'}
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
                stroke="#9000FF50"
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
                        fill="#d8b4fe"
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
                tick={{ fill: '#a78bfa', fontSize: 10 }}
                stroke="#9000FF50"
                unit={unit === 'km' ? ' km' : ' m'}
              />
              <RechartsTooltip
                content={<CustomTooltip />}
                position={{ x: 8, y: 8 }}
                wrapperStyle={{ zIndex: 99999999, outline: 'none', pointerEvents: 'none' }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.08)' }}
              />
              <Bar
                dataKey="length"
                radius={[8, 8, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  if (data && data.points && onHighlightSegment) {
                    onHighlightSegment(data.points);
                  }
                }}
                onMouseEnter={(_, index) => setHoveredBarIndex(index)}
                onMouseLeave={() => setHoveredBarIndex(null)}
              >
                {processedData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getBarColor(index, processedData.length)}
                    stroke={hoveredBarIndex === index ? '#FFFFFF' : '#9000FF80'}
                    strokeWidth={hoveredBarIndex === index ? 2 : 1}
                    style={{
                      filter: hoveredBarIndex === index ? 'drop-shadow(0px 0px 8px #C084FC)' : 'none',
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
          {lang === 'ar' ? 'لا توجد بيانات مطابقة للفلتر المحدد' : 'No segment data matching filter'}
        </div>
      )}

      {/* Top 3 Longest Highlights Cards */}
      {processedData.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-2">
          <h4 className="text-[11px] font-black text-white/70 uppercase tracking-wider flex items-center justify-between">
            <span>{lang === 'ar' ? 'أبرز الشرائح الموضحة في الرسم البياني:' : 'Featured Segments in Chart:'}</span>
            <span className="text-[10px] text-[#d8b4fe] font-normal">
              {lang === 'ar' ? 'انقر على الكرت للتكبير على الخريطة' : 'Click card to highlight on map'}
            </span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {processedData.slice(0, 3).map((item) => (
              <div
                key={item.fullName}
                onClick={() => onHighlightSegment && onHighlightSegment(item.points)}
                className="bg-black/40 hover:bg-[#9000FF]/20 p-3 rounded-xl border border-white/10 flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-[#9000FF]/50 group"
              >
                <div className="overflow-hidden space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#C084FC] shrink-0" />
                    <span className="font-mono font-bold text-xs text-[#d8b4fe] truncate dir-ltr">
                      {item.fullName}
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
                  <span className="text-[9px] text-[#d8b4fe] group-hover:underline flex items-center justify-end gap-0.5">
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
