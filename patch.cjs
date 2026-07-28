const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud } from 'lucide-react';",
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin } from 'lucide-react';"
);

code = code.replace(
  "const [zonesStatus, setZonesStatus] = useState<string>('');",
  "const [zonesStatus, setZonesStatus] = useState<string>('');\n  const [localTargetAssets, setLocalTargetAssets] = useState<GeoPoint[]>([]);\n  const [assetsStatus, setAssetsStatus] = useState<string>('');"
);

const handleAssetsUploadCode = `
  const handleAssetsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setLoading(true);
    setAssetsStatus(lang === 'ar' ? 'جاري قراءة الأصول...' : 'Reading Assets...');
    
    try {
      const fName = selectedFile.name.toLowerCase();
      let result;
      if (fName.endsWith('.xlsx') || fName.endsWith('.csv')) result = await parseExcel(selectedFile);
      else if (fName.endsWith('.dxf')) result = await parseDXF(selectedFile);
      else if (fName.endsWith('.kmz') || fName.endsWith('.kml') || fName.endsWith('.zip') || fName.endsWith('.gdb')) result = await parseKMZ(selectedFile);
      else throw new Error('Unsupported file type');

      let pts = result.data;
      
      if (fName.endsWith('.dxf') || fName.endsWith('.zip') || fName.endsWith('.gdb')) {
        const potentialCRS = identifyPotentialCRS(fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data);
        const sourceData = fName.endsWith('.dxf') ? extractPointsFromDXF(result.data) : result.data;
        if (potentialCRS) {
            pts = transformPoints(sourceData, potentialCRS);
        } else {
            pts = sourceData;
        }
      }

      setLocalTargetAssets(pts);
      setAssetsStatus(\`\${lang === 'ar' ? 'تم جلب' : 'Loaded'} \${pts.length} \${lang === 'ar' ? 'أصل' : 'Assets'}\`);
    } catch (err) {
      console.error(err);
      setAssetsStatus(lang === 'ar' ? 'حدث خطأ أثناء القراءة' : 'Error reading file');
    } finally {
      setLoading(false);
    }
  };
`;

code = code.replace(
  "  const handleStartClassification = () => {",
  handleAssetsUploadCode + "\n  const handleStartClassification = () => {"
);

code = code.replace(
  "if (targetAssets.length === 0) {\n      alert(lang === 'ar' ? 'يرجى رفع ملف الأصول (نقاط/خطوط) في الواجهة الرئيسية أولاً' : 'Please upload target assets (points/lines) in the main interface first');\n      return;\n    }",
  "const assetsToClassify = localTargetAssets.length > 0 ? localTargetAssets : targetAssets;\n    if (assetsToClassify.length === 0) {\n      alert(lang === 'ar' ? 'يرجى رفع ملف الأصول (نقاط/خطوط) أولاً' : 'Please upload target assets (points/lines) first');\n      return;\n    }"
);

code = code.replace(
  "const results = classifyAssetsToZones(targetAssets, refZones);",
  "const results = classifyAssetsToZones(assetsToClassify, refZones);"
);

code = code.replace(
  "disabled={loading || refZones.length === 0 || targetAssets.length === 0}",
  "disabled={loading || refZones.length === 0 || (targetAssets.length === 0 && localTargetAssets.length === 0)}"
);

const uploadAssetJSX = `
        {/* Upload Assets */}
        <div className="bg-black/10 border border-white/5 p-6 rounded-3xl">
          <h3 className="text-white font-black mb-4 text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-accent" />
            {lang === 'ar' ? '2. الأصول المستهدفة (POINTS/LINES)' : '2. Target Assets (Points/Lines)'}
          </h3>
          <div className="relative">
            <input
              type="file"
              accept=".kml,.kmz,.dxf,.gdb,.zip,.xlsx,.csv"
              onChange={handleAssetsUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors pointer-events-none flex flex-col items-center justify-center gap-2">
              <UploadCloud className="w-6 h-6 text-accent" />
              <span className="text-white/70 font-bold text-xs">
                 {loading ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'ارفع ملف الأصول' : 'Upload Assets File')}
              </span>
            </div>
          </div>
          {assetsStatus && (
            <p className="mt-3 text-xs text-accent font-bold text-center">
              {assetsStatus}
            </p>
          )}
        </div>
`;

code = code.replace(
  "        {/* Action Button */}",
  uploadAssetJSX + "\n        {/* Action Button */}"
);

code = code.replace(
  "{lang === 'ar' ? '1. رفع ملف المناطق (المضلعات المرجعية)' : '1. Upload Reference Zones (Polygons)'}",
  "{lang === 'ar' ? 'المناطق المرجعية (POLYGONS)' : 'Reference Zones (POLYGONS)'}"
);
code = code.replace(
  "{lang === 'ar' ? '2. الأصول المستهدفة (POINTS/LINES)' : '2. Target Assets (Points/Lines)'}",
  "{lang === 'ar' ? 'الأصول المستهدفة (POINTS/LINES)' : 'Target Assets (POINTS/LINES)'}"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
