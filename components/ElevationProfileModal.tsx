import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Mountain, X, Loader2, Sparkles, Layers, Zap, Plus, Trash2, ArrowUpRight, ArrowDownRight, Compass, MousePointerClick } from 'lucide-react';
import { GeoPoint } from '../types';
import {
  estimateMissingElevations,
  InterpolationResult,
  findAdjacentConnectedFeatures,
  chainAdjacentFeatures
} from '../services/elevationInterpolationService';

interface ElevationProfileModalProps {
  lang: 'ar' | 'en';
  focusedPoint: GeoPoint | null;
  selectedProfilePoints?: GeoPoint[];
  allDatasetPoints?: GeoPoint[];
  onClose: () => void;
  onHoverPoint?: (pt: { lat: number; lng: number; z?: number; dist?: number } | null) => void;
  onSelectPointsChange?: (pts: GeoPoint[]) => void;
}

/**
 * Dense sampling of path to produce smooth 3D coordinates for elevation chart hovering
 */
const denseSamplePath = (
  path: { x: number; y: number; z: number }[],
  targetSamples = 180
): { dist: number; z: number; lat: number; lng: number; slope: number }[] => {
  if (!path || path.length === 0) return [];

  const segmentLengths: number[] = [];
  let totalDist = 0;

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const R = 6371e3;
    const lat1 = (prev.y * Math.PI) / 180;
    const lat2 = (curr.y * Math.PI) / 180;
    const dLat = ((curr.y - prev.y) * Math.PI) / 180;
    const dLon = ((curr.x - prev.x) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    segmentLengths.push(dist);
    totalDist += dist;
  }

  if (totalDist === 0) {
    return [
      {
        dist: 0,
        z: path[0].z || 0,
        lat: path[0].y,
        lng: path[0].x,
        slope: 0
      }
    ];
  }

  const cumDists: number[] = [0];
  let acc = 0;
  for (const len of segmentLengths) {
    acc += len;
    cumDists.push(acc);
  }

  const result: { dist: number; z: number; lat: number; lng: number; slope: number }[] = [];
  const count = Math.max(targetSamples, path.length * 4);

  for (let step = 0; step < count; step++) {
    const currentTargetDist = (step / (count - 1)) * totalDist;

    let segIdx = 0;
    while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < currentTargetDist) {
      segIdx++;
    }

    const segStartDist = cumDists[segIdx];
    const segEndDist = cumDists[segIdx + 1];
    const segLen = segEndDist - segStartDist;

    const t = segLen > 0 ? (currentTargetDist - segStartDist) / segLen : 0;

    const pStart = path[segIdx];
    const pEnd = path[segIdx + 1] || pStart;

    const lat = pStart.y + t * (pEnd.y - pStart.y);
    const lng = pStart.x + t * (pEnd.x - pStart.x);
    const z = pStart.z + t * (pEnd.z - pStart.z);

    result.push({
      dist: Number(currentTargetDist.toFixed(1)),
      z: Number(z.toFixed(2)),
      lat,
      lng,
      slope: 0
    });
  }

  // Calculate local slope for each point
  for (let i = 0; i < result.length; i++) {
    if (i === 0) {
      result[i].slope = 0;
    } else {
      const dz = Math.abs(result[i].z - result[i - 1].z);
      const dx = result[i].dist - result[i - 1].dist;
      result[i].slope = dx > 0 ? Number(((dz / dx) * 100).toFixed(1)) : 0;
    }
  }

  return result;
};

export const ElevationProfileModal: React.FC<ElevationProfileModalProps> = ({
  lang,
  focusedPoint,
  selectedProfilePoints = [],
  allDatasetPoints = [],
  onClose,
  onHoverPoint,
  onSelectPointsChange
}) => {
  const [activeFeatures, setActiveFeatures] = useState<GeoPoint[]>([]);
  const [profileData, setProfileData] = useState<any>(null);
  const [interpolationMeta, setInterpolationMeta] = useState<InterpolationResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Synchronize activeFeatures when focusedPoint or selectedProfilePoints change
  useEffect(() => {
    if (selectedProfilePoints && selectedProfilePoints.length > 0) {
      setActiveFeatures(selectedProfilePoints);
    } else if (focusedPoint) {
      setActiveFeatures([focusedPoint]);
    } else {
      setActiveFeatures([]);
    }
  }, [focusedPoint, selectedProfilePoints]);

  // Main calculations when activeFeatures change
  useEffect(() => {
    const validLines = activeFeatures.filter(
      (f) => ['LineString', 'Polygon'].includes(f.type || '') && f.path && f.path.length >= 2
    );

    if (validLines.length === 0) {
      setProfileData(null);
      setInterpolationMeta(null);
      return;
    }

    const processData = async () => {
      setLoading(true);

      try {
        // Step 1: Interpolate missing elevations for each selected feature
        const interpolatedFeatures: GeoPoint[] = [];
        let firstMeta: InterpolationResult | null = null;

        for (const feat of validLines) {
          const res = await estimateMissingElevations(feat, allDatasetPoints);
          if (!firstMeta) firstMeta = res;
          interpolatedFeatures.push(res.updatedFeature);
        }

        setInterpolationMeta(firstMeta);

        // Step 2: Stitch adjacent/selected features into a single ordered continuous 3D path
        const chainedPath = chainAdjacentFeatures(interpolatedFeatures);

        // Step 3: Dense sample the continuous path
        const data = denseSamplePath(chainedPath, 180);

        // Step 4: Calculate topography and slope statistics
        let maxZ = -Infinity;
        let minZ = Infinity;
        let maxSlope = 0;
        let totalSlopeSum = 0;
        let slopeCount = 0;
        let totalGain = 0;
        let totalLoss = 0;

        for (let i = 0; i < data.length; i++) {
          if (data[i].z > maxZ) maxZ = data[i].z;
          if (data[i].z < minZ) minZ = data[i].z;

          if (i > 0) {
            const dz = data[i].z - data[i - 1].z;
            const dx = data[i].dist - data[i - 1].dist;

            if (dz > 0) totalGain += dz;
            if (dz < 0) totalLoss += Math.abs(dz);

            if (dx > 0) {
              const slope = (Math.abs(dz) / dx) * 100;
              if (slope > maxSlope) maxSlope = slope;
              totalSlopeSum += slope;
              slopeCount++;
            }
          }
        }

        const totalDist = data[data.length - 1]?.dist || 0;
        const totalDiff = Math.abs(maxZ - minZ);
        const avgSlope = slopeCount > 0 ? totalSlopeSum / slopeCount : 0;

        // Topographic Elevation Ratio / Overall Grade % = (Total Height Diff / Total Length) * 100
        const elevationRatio = totalDist > 0 ? (totalDiff / totalDist) * 100 : 0;

        setProfileData({
          data,
          stats: {
            maxZ,
            minZ,
            maxSlope,
            avgSlope,
            elevationRatio,
            totalGain,
            totalLoss,
            totalDiff,
            totalDist,
            segmentCount: validLines.length
          }
        });
      } catch (err) {
        console.error('Error processing combined elevation profile:', err);
      } finally {
        setLoading(false);
      }
    };

    processData();
  }, [activeFeatures, allDatasetPoints]);

  // Handler to auto-select connected adjacent elements on the map
  const handleAutoSelectAdjacent = () => {
    if (activeFeatures.length === 0) return;
    const connected = findAdjacentConnectedFeatures(activeFeatures, allDatasetPoints, 40);
    setActiveFeatures(connected);
    onSelectPointsChange?.(connected);
  };

  // Handler to remove a feature from active multi-selection
  const handleRemoveFeature = (id: string) => {
    const updated = activeFeatures.filter((f) => f.id !== id);
    setActiveFeatures(updated);
    onSelectPointsChange?.(updated);
    if (updated.length === 0) {
      onClose();
    }
  };

  if (!profileData && !loading && activeFeatures.length === 0) return null;

  return (
    <div
      className="absolute bottom-6 right-6 z-[1000] bg-[#0b2d3d]/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 w-[940px] max-w-[94vw] dir-rtl"
      style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between p-5 border-b border-white/10 bg-black/30 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
            <Mountain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>
                {lang === 'ar'
                  ? 'ملف الارتفاعات ونسبة الانحدار للطبوغرافية'
                  : 'Elevation Profile & Topographic Slope Ratio'}
              </span>
              {activeFeatures.length > 1 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-400 text-black shadow-md">
                  {lang === 'ar'
                    ? `${activeFeatures.length} عناصر مجمعة`
                    : `${activeFeatures.length} Segments`}
                </span>
              )}
            </h3>
            <p className="text-xs text-white/50 font-bold mt-0.5">
              {lang === 'ar'
                ? 'تحليل الارتفاعات، نسبة الميل، والربط التلقائي للعناصر المتجاورة'
                : 'Topographic elevation ratio, slopes, and connected segment analysis'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoSelectAdjacent}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 transition-all shadow-lg active:scale-95"
            title={lang === 'ar' ? 'دمج العناصر المتصلة تلقائياً' : 'Auto-select connected adjacent lines'}
          >
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400/30" />
            <span>{lang === 'ar' ? 'تحديد المتجاورة تلقائياً' : 'Auto-Select Connected'}</span>
          </button>

          <button
            onClick={() => {
              onHoverPoint?.(null);
              onClose();
            }}
            className="p-2 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Selected Segments Tags Bar */}
      {activeFeatures.length > 0 && (
        <div className="px-5 py-2.5 bg-black/10 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-black text-amber-400 whitespace-nowrap flex items-center gap-1.5 ml-2">
            <Layers className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'العناصر المحددة:' : 'Selected Segments:'}</span>
          </span>

          <div className="flex items-center gap-2 flex-nowrap">
            {activeFeatures.map((feat, idx) => (
              <div
                key={`active-feat-${feat.id || 'feat'}-${idx}`}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/10 shrink-0"
              >
                <span className="w-4 h-4 rounded-full bg-amber-400 text-black font-black text-[10px] flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="max-w-[140px] truncate">{feat.id}</span>
                {activeFeatures.length > 1 && (
                  <button
                    onClick={() => handleRemoveFeature(feat.id)}
                    className="hover:text-rose-400 transition-colors p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mr-auto text-[11px] font-bold text-white/40 flex items-center gap-1">
            <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {lang === 'ar'
                ? 'انقر على أي خط في الخريطة لإضافته أو حذفه'
                : 'Click any line on map to toggle in profile'}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-base text-white/70 font-bold">
            {lang === 'ar'
              ? 'جاري الربط الطبوغرافي وحساب نسب الانحدار والارتفاعات...'
              : 'Calculating topographic slope ratios & continuous profile...'}
          </p>
        </div>
      ) : (
        profileData && (
          <div className="p-6 flex flex-col lg:flex-row gap-6">
            {/* Left Metrics Panel */}
            <div className="w-full lg:w-5/12 flex flex-col gap-3 justify-between">
              {/* Highlight Grade / Slope Ratio Card */}
              <div className="bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-transparent p-4 rounded-2xl border border-amber-400/30 flex items-center justify-between shadow-xl">
                <div>
                  <span className="text-xs font-extrabold text-amber-300 block mb-1">
                    {lang === 'ar' ? 'نسبة الانحدار العامة (Topographic Grade)' : 'Topographic Grade Ratio'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-amber-400 dir-ltr">
                      {profileData.stats.elevationRatio.toFixed(2)}%
                    </span>
                    <span className="text-xs text-white/60 font-bold dir-ltr">
                      ({((profileData.stats.totalDiff / Math.max(profileData.stats.totalDist, 1)) * 1000).toFixed(1)} m/km)
                    </span>
                  </div>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                  <Compass className="w-6 h-6 animate-pulse" />
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2.5">
                <div className="text-xs font-bold text-white/90 flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-white/60">{lang === 'ar' ? 'الطول الكلي المجمع:' : 'Total Length:'}</span>
                  <span className="text-white font-black text-sm dir-ltr">
                    {profileData.stats.totalDist >= 1000
                      ? `${(profileData.stats.totalDist / 1000).toFixed(2)} km`
                      : `${profileData.stats.totalDist.toFixed(0)} m`}
                  </span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center">
                  <span className="text-white/60">{lang === 'ar' ? 'أقصى نسبة ميل (Max Slope):' : 'Max Slope:'}</span>
                  <span className="text-amber-400 font-black dir-ltr">{profileData.stats.maxSlope.toFixed(1)}%</span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center">
                  <span className="text-white/60">{lang === 'ar' ? 'متوسط الانحدار (Avg Slope):' : 'Average Slope:'}</span>
                  <span className="text-white font-black dir-ltr">{profileData.stats.avgSlope.toFixed(1)}%</span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center">
                  <span className="text-white/60">{lang === 'ar' ? 'إجمالي الصعود (Elevation Gain):' : 'Total Gain:'}</span>
                  <span className="text-emerald-400 font-black flex items-center gap-1 dir-ltr">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{profileData.stats.totalGain.toFixed(1)} m
                  </span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center">
                  <span className="text-white/60">{lang === 'ar' ? 'إجمالي النزول (Elevation Loss):' : 'Total Loss:'}</span>
                  <span className="text-rose-400 font-black flex items-center gap-1 dir-ltr">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    -{profileData.stats.totalLoss.toFixed(1)} m
                  </span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-white/60">{lang === 'ar' ? 'أعلى نقطة (Highest Point):' : 'Max Elevation:'}</span>
                  <span className="text-white font-black dir-ltr">{profileData.stats.maxZ.toFixed(2)} m</span>
                </div>

                <div className="text-xs text-white/90 flex justify-between items-center">
                  <span className="text-white/60">{lang === 'ar' ? 'أدنى نقطة (Lowest Point):' : 'Min Elevation:'}</span>
                  <span className="text-white font-black dir-ltr">{profileData.stats.minZ.toFixed(2)} m</span>
                </div>
              </div>
            </div>

            {/* Right Interactive Chart Panel */}
            <div className="w-full lg:w-7/12 h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={profileData.data}
                  margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
                  onMouseLeave={() => onHoverPoint?.(null)}
                >
                  <defs>
                    <linearGradient id="colorElevation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dcb13c" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#dcb13c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis
                    dataKey="dist"
                    tickFormatter={(val) =>
                      val >= 1000 ? `${(val / 1000).toFixed(1)}km` : `${val.toFixed(0)}m`
                    }
                    stroke="rgba(255,255,255,0.4)"
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)', fontWeight: 'bold' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tickFormatter={(val) => `${val.toFixed(0)}m`}
                    stroke="rgba(255,255,255,0.4)"
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)', fontWeight: 'bold' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length > 0) {
                        const pt = payload[0].payload;
                        // Fire hover point callback to update map position
                        setTimeout(() => {
                          onHoverPoint?.({ lat: pt.lat, lng: pt.lng, z: pt.z, dist: pt.dist, slope: pt.slope });
                        }, 0);
                        const distStr = pt.dist >= 1000 ? `${(pt.dist / 1000).toFixed(2)} km` : `${pt.dist.toFixed(0)} m`;
                        return (
                          <div className="bg-[#0b2d3d]/95 backdrop-blur-md border border-amber-400/60 p-3 rounded-2xl shadow-2xl text-white text-xs font-bold dir-rtl">
                            <div className="text-amber-400 font-black mb-1">
                              {lang === 'ar' ? 'منسوب النقطة الطبوغرافية' : 'Point Elevation'}
                            </div>
                            <div className="flex items-center gap-2.5 text-white">
                              <span>
                                {lang === 'ar' ? 'المنسوب:' : 'Elev:'}{' '}
                                <strong className="text-amber-300 font-black text-sm">{pt.z.toFixed(2)} m</strong>
                              </span>
                              <span className="text-white/30">|</span>
                              <span>{lang === 'ar' ? 'المسافة:' : 'Dist:'} {distStr}</span>
                              {pt.slope !== undefined && (
                                <span className="text-rose-300 font-extrabold bg-rose-900/80 px-1.5 py-0.5 rounded border border-rose-500/50">
                                  {pt.slope.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="z"
                    stroke="#dcb13c"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorElevation)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      )}
    </div>
  );
};
