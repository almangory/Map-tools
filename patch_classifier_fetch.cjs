const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ } from '../services/parserService';",
  "import { parseExcel, parseDXF, extractPointsFromDXF, parseKMZ, fetchNetworkFile } from '../services/parserService';"
);

// Add input field in UI
const oldUI = `
          <div className="relative">
            <input
              type="file"
              accept=".kml,.kmz,.dxf,.gdb,.zip"
              onChange={handleZonesUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
              <FileUp className="w-6 h-6 text-white/40 mb-2" />
              <span className="text-white/70 font-bold text-xs">
                 {loading ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'اختر ملف KML, KMZ, DXF, GDB' : 'Select KML, KMZ, DXF, GDB')}
              </span>
            </div>
          </div>
          {zonesStatus && (
            <p className="mt-3 text-xs text-accent font-bold text-center">
              {zonesStatus}
            </p>
          )}
        </div>
`;

const newUI = `
          <div className="space-y-4">
            <div className="flex flex-col gap-2 relative z-10">
              <div className="flex gap-2">
                <button
                  onClick={handleFetchZonesUrl}
                  disabled={loading || !zonesUrl}
                  className="bg-accent text-[#0b2d3d] px-4 py-3 rounded-2xl font-black text-xs hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {lang === 'ar' ? 'جلب' : 'Fetch'}
                </button>
                <input 
                  type="text" 
                  placeholder={lang === 'ar' ? "أو ضع رابط ملف KML / KMZ هنا..." : "Or paste KML / KMZ URL here..."}
                  value={zonesUrl}
                  onChange={(e) => setZonesUrl(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-xs font-bold focus:outline-none focus:border-accent text-right"
                />
              </div>
            </div>

            <div className="relative">
              <input
                type="file"
                accept=".kml,.kmz,.dxf,.gdb,.zip"
                onChange={handleZonesUpload}
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center">
                <FileUp className="w-6 h-6 text-white/40 mb-2" />
                <span className="text-white/70 font-bold text-xs">
                   {loading ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'اختر ملف KML, KMZ, DXF, GDB' : 'Select KML, KMZ, DXF, GDB')}
                </span>
              </div>
            </div>
          </div>
          {zonesStatus && (
            <p className="mt-3 text-xs text-accent font-bold text-center">
              {zonesStatus}
            </p>
          )}
        </div>
`;

code = code.replace(oldUI, newUI);

// Add handleFetchZonesUrl
const oldHandleZonesUpload = `
  const handleZonesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
`;

const newHandleFetchZonesUrl = `
  const processZonesResult = (result: ParsedFile, fName: string) => {
      let pts: GeoPoint[] = result.data as any;
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
        const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);
        const sourceData = result.data as GeoPoint[];
        if (potentialCRS) {
            pts = transformPoints(sourceData, potentialCRS);
        } else {
            pts = sourceData;
        }
      } else {
         if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
             setZonesStatus(lang === 'ar' ? 'صيغة غير مدعومة للمناطق.' : 'Unsupported format for zones.');
             setLoading(false);
             return;
         }
      }

      const polygons = pts.filter(p => p.type === 'Polygon' || p.type === 'LineString');
      const finalZones = polygons.map(p => {
          if (p.type === 'LineString') {
              return { ...p, type: 'Polygon' as const };
          }
          return p as GeoPoint;
      });

      setRefZones(finalZones);
      if (setRefPolygons) setRefPolygons(finalZones);
      if (setDataId) setDataId(\`classifier-ref-\${Date.now()}\`);
      setZonesStatus(\`\${lang === 'ar' ? 'تم جلب' : 'Loaded'} \${finalZones.length} \${lang === 'ar' ? 'مضلع' : 'Polygons'}\`);
  };

  const handleFetchZonesUrl = async () => {
    if (!zonesUrl) return;
    setLoading(true);
    setZonesStatus(lang === 'ar' ? 'جاري جلب الملف من الرابط...' : 'Fetching file from URL...');
    
    try {
      const result = await fetchNetworkFile(zonesUrl, (p) => {
         // optional progress
      });
      processZonesResult(result, result.filename);
    } catch (err: any) {
      console.error(err);
      setZonesStatus(err.message || (lang === 'ar' ? 'حدث خطأ أثناء الجلب' : 'Error fetching file'));
    } finally {
      setLoading(false);
    }
  };

  const handleZonesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
`;

code = code.replace(oldHandleZonesUpload, newHandleFetchZonesUrl);

// Now update the body of handleZonesUpload to use processZonesResult
const oldUploadBody = `
      let pts: GeoPoint[] = result.data as any; // Temporary cast, logic varies by file type
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
        const potentialCRS = identifyPotentialCRS(result.data as GeoPoint[]);
        const sourceData = result.data as GeoPoint[];
        if (potentialCRS) {
            pts = transformPoints(sourceData, potentialCRS);
        } else {
            pts = sourceData;
        }
      } else {
         // Assuming it's Excel, we need mapping or we just take the first poly
         // Actually, if it's kmz/kml/gdb, parseKMZ returns GeoPoint[] in data usually in this app
         // Let's just trust that result.data is GeoPoint[] for KMZ/GDB. For Excel, it might not be.
         // Let's filter for polygons:
         if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) {
            // Excel doesn't typically hold polygons easily unless formatted specially
             setZonesStatus(lang === 'ar' ? 'صيغة غير مدعومة للمناطق.' : 'Unsupported format for zones.');
             setLoading(false);
             return;
         }
      }

      const polygons = pts.filter(p => p.type === 'Polygon' || p.type === 'LineString');
      // Convert linestrings to polygons for classification if they are closed or pretend they are
      const finalZones = polygons.map(p => {
          if (p.type === 'LineString') {
              return { ...p, type: 'Polygon' as const };
          }
          return p as GeoPoint;
      });

      setRefZones(finalZones);
      if (setRefPolygons) setRefPolygons(finalZones);
      if (setDataId) setDataId(\`classifier-ref-\${Date.now()}\`);
      setZonesStatus(\`\${lang === 'ar' ? 'تم جلب' : 'Loaded'} \${finalZones.length} \${lang === 'ar' ? 'مضلع' : 'Polygons'}\`);
    } catch (err) {
`;

const newUploadBody = `
      processZonesResult(result, fName);
    } catch (err) {
`;

code = code.replace(oldUploadBody, newUploadBody);

fs.writeFileSync('components/MapClassifier.tsx', code);
