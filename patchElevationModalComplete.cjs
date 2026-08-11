const fs = require('fs');

const content = `import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Mountain, X, Loader2 } from 'lucide-react';
import { GeoPoint } from '../types';

interface ElevationProfileModalProps {
  lang: 'ar' | 'en';
  focusedPoint: GeoPoint | null;
  onClose: () => void;
}

export const ElevationProfileModal: React.FC<ElevationProfileModalProps> = ({ lang, focusedPoint, onClose }) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!focusedPoint || !['LineString', 'Polygon'].includes(focusedPoint.type) || !focusedPoint.path || focusedPoint.path.length === 0) {
      setProfileData(null);
      return;
    }

    const processData = async () => {
      setLoading(true);
      let data: { dist: number; z: number }[] = [];
      const path = focusedPoint.path!;
      let hasRealZ = false;

      // Check if all Zs are exactly 0 (default fallback from parser)
      let allZeroZ = true;
      for (const p of path) {
         if (p.z !== 0 && p.z !== undefined) {
             allZeroZ = false;
             break;
         }
      }

      const attrs = focusedPoint.attributes || {};
      const startGroundElev = attrs['StartPipeGroundElevation'] !== undefined ? attrs['StartPipeGroundElevation'] : attrs['StartPipeElevation'];
      const endGroundElev = attrs['EndPipeGroundElevation'] !== undefined ? attrs['EndPipeGroundElevation'] : attrs['EndPipeElevation'];

      let elevations: number[] = [];

      if (!allZeroZ) {
          // Use Z from geometry
          elevations = path.map(p => p.z || 0);
          hasRealZ = true;
      } else if (startGroundElev !== undefined && endGroundElev !== undefined) {
          // Interpolate from attributes
          const start = parseFloat(String(startGroundElev));
          const end = parseFloat(String(endGroundElev));
          if (!isNaN(start) && !isNaN(end)) {
              // We need distances to interpolate correctly
              const dists: number[] = [0];
              let td = 0;
              for (let i = 1; i < path.length; i++) {
                 const prev = path[i - 1];
                 const curr = path[i];
                 const R = 6371e3;
                 const lat1 = prev.y * Math.PI/180;
                 const lat2 = curr.y * Math.PI/180;
                 const dLat = (curr.y - prev.y) * Math.PI/180;
                 const dLon = (curr.x - prev.x) * Math.PI/180;
                 const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                           Math.cos(lat1) * Math.cos(lat2) *
                           Math.sin(dLon/2) * Math.sin(dLon/2);
                 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                 td += (R * c);
                 dists.push(td);
              }
              const totalDist = td;
              elevations = dists.map(d => start + (end - start) * (totalDist > 0 ? d / totalDist : 0));
              hasRealZ = true;
          }
      } 
      
      if (!hasRealZ) {
          // Fetch from Open-Meteo API
          try {
              // chunk up to 100 points to avoid URL too long
              const samplePath = path.length > 100 ? path.filter((_, i) => i % Math.ceil(path.length / 100) === 0) : path;
              // Make sure to always include the last point in the sample to not lose the end
              if (samplePath[samplePath.length - 1] !== path[path.length - 1]) {
                 samplePath.push(path[path.length - 1]);
              }
              
              const lats = samplePath.map(p => p.y.toFixed(5)).join(',');
              const lons = samplePath.map(p => p.x.toFixed(5)).join(',');
              const res = await fetch(\`https://api.open-meteo.com/v1/elevation?latitude=\${lats}&longitude=\${lons}\`);
              if (res.ok) {
                  const json = await res.json();
                  if (json.elevation && Array.isArray(json.elevation)) {
                      elevations = json.elevation;
                      
                      // Now we need to recalculate distances based on samplePath
                      let td = 0;
                      data.push({ dist: 0, z: elevations[0] });
                      for(let i=1; i<samplePath.length; i++) {
                          const prev = samplePath[i - 1];
                          const curr = samplePath[i];
                          const R = 6371e3;
                          const lat1 = prev.y * Math.PI/180;
                          const lat2 = curr.y * Math.PI/180;
                          const dLat = (curr.y - prev.y) * Math.PI/180;
                          const dLon = (curr.x - prev.x) * Math.PI/180;
                          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                                    Math.cos(lat1) * Math.cos(lat2) *
                                    Math.sin(dLon/2) * Math.sin(dLon/2);
                          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                          td += (R * c);
                          data.push({ dist: td, z: elevations[i] });
                      }
                      hasRealZ = true;
                  }
              }
          } catch(err) {
              console.error('Failed to fetch elevation', err);
          }
      }

      if (hasRealZ && data.length === 0 && elevations.length > 0) {
          // Compute distances for existing path
          let td = 0;
          data.push({ dist: 0, z: elevations[0] });
          for (let i = 1; i < path.length; i++) {
              const prev = path[i - 1];
              const curr = path[i];
              const R = 6371e3;
              const lat1 = prev.y * Math.PI/180;
              const lat2 = curr.y * Math.PI/180;
              const dLat = (curr.y - prev.y) * Math.PI/180;
              const dLon = (curr.x - prev.x) * Math.PI/180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(lat1) * Math.cos(lat2) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              td += (R * c);
              data.push({ dist: td, z: elevations[i] || 0 });
          }
      }

      if (!hasRealZ || data.length === 0) {
          setProfileData(null);
          setLoading(false);
          return;
      }

      let maxZ = -Infinity;
      let minZ = Infinity;
      let maxSlope = 0;

      for (let i = 0; i < data.length; i++) {
          if (data[i].z > maxZ) maxZ = data[i].z;
          if (data[i].z < minZ) minZ = data[i].z;
          
          if (i > 0) {
              const dz = Math.abs(data[i].z - data[i-1].z);
              const dx = data[i].dist - data[i-1].dist;
              if (dx > 0) {
                  const slope = (dz / dx) * 100;
                  if (slope > maxSlope) maxSlope = slope;
              }
          }
      }

      setProfileData({
          data,
          stats: {
              maxZ,
              minZ,
              maxSlope,
              totalDiff: maxZ - minZ,
              totalDist: data[data.length - 1].dist
          }
      });
      setLoading(false);
    };

    processData();
  }, [focusedPoint]);

  if (!profileData && !loading) return null;

  return (
    <div className="absolute bottom-12 right-12 z-[1000] bg-[#0b2d3d]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 w-[600px] max-w-[90vw] dir-rtl" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
      <div className="flex items-center justify-between p-5 border-b border-white/5 bg-black/20">
         <div className="flex items-center gap-3">
            <Mountain className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-black text-white">{lang === 'ar' ? 'ملف الارتفاعات والتفاصيل' : 'Elevation Profile & Details'}</h3>
         </div>
         <button onClick={onClose} className="p-1.5 bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 rounded-xl transition-colors">
            <X className="w-4 h-4" />
         </button>
      </div>
      
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-4">
           <Loader2 className="w-8 h-8 text-accent animate-spin" />
           <p className="text-sm text-white/60 font-bold">{lang === 'ar' ? 'جاري جلب الارتفاعات طبوغرافياً...' : 'Fetching topographic elevations...'}</p>
        </div>
      ) : profileData && (
        <div className="p-6 flex flex-col md:flex-row gap-6">
           {/* Stats */}
           <div className="w-full md:w-1/3 flex flex-col gap-3 justify-center">
              <div className="text-right space-y-2">
                 <div className="text-[11px] text-white/80 font-bold">{lang === 'ar' ? 'أعلى نقطة (M):' : 'Highest Point (M):'} <span className="text-white text-sm">{profileData.stats.maxZ.toFixed(2)} {lang === 'ar' ? 'م' : 'm'}</span></div>
                 <div className="text-[11px] text-white/80 font-bold">{lang === 'ar' ? 'أدنى نقطة (N):' : 'Lowest Point (N):'} <span className="text-white text-sm">{profileData.stats.minZ.toFixed(2)} {lang === 'ar' ? 'م' : 'm'}</span></div>
                 <div className="text-[11px] text-white/80 font-bold">{lang === 'ar' ? 'أقصى ميل:' : 'Max Slope:'} <span className="text-white text-sm">{profileData.stats.maxSlope.toFixed(1)}%</span></div>
                 <div className="text-[11px] text-white/80 font-bold">{lang === 'ar' ? 'إجمالي فرق الارتفاع:' : 'Total Elev. Diff:'} <span className="text-white text-sm">{profileData.stats.totalDiff.toFixed(2)} {lang === 'ar' ? 'م' : 'm'}</span></div>
                 <div className="text-[11px] text-white/80 font-bold">{lang === 'ar' ? 'الطول الكلي:' : 'Total Length:'} <span className="text-white text-sm">{(profileData.stats.totalDist / 1000).toFixed(2)} {lang === 'ar' ? 'كم' : 'km'}</span></div>
              </div>
           </div>

           {/* Chart */}
           <div className="w-full md:w-2/3 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profileData.data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorElevation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dcb13c" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#dcb13c" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis 
                     dataKey="dist" 
                     tickFormatter={(val) => val > 1000 ? \`\${(val/1000).toFixed(1)}km\` : \`\${val.toFixed(0)}m\`} 
                     stroke="rgba(255,255,255,0.4)" 
                     tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)', fontWeight: 'bold' }} 
                     axisLine={false}
                     tickLine={false}
                  />
                  <YAxis 
                     domain={['dataMin - 10', 'dataMax + 10']}
                     tickFormatter={(val) => \`\${val.toFixed(0)}m\`}
                     stroke="rgba(255,255,255,0.4)" 
                     tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)', fontWeight: 'bold' }} 
                     axisLine={false}
                     tickLine={false}
                     orientation={lang === 'ar' ? 'left' : 'left'}
                  />
                  <RechartsTooltip 
                     contentStyle={{ backgroundColor: '#0e3f53', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '1rem', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                     itemStyle={{ color: '#dcb13c' }}
                     labelFormatter={(val: number) => \`Dist: \${val > 1000 ? (val/1000).toFixed(2)+'km' : val.toFixed(0)+'m'}\`}
                     formatter={(val: number) => [\`\${val.toFixed(2)}m\`, 'Elevation']}
                  />
                  <Area type="monotone" dataKey="z" stroke="#dcb13c" strokeWidth={2} fillOpacity={1} fill="url(#colorElevation)" />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>
      )}
    </div>
  );
};
`
fs.writeFileSync('components/ElevationProfileModal.tsx', content);
