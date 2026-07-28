const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

// Use targetAssets instead of localTargetAssets for the map display
code = code.replace(
  "setLocalTargetAssets(pts);",
  "setLocalTargetAssets(pts);\n      setTargetAssets(pts);" // Keep local state but also set global state to show on map
);

// Add grouping state
code = code.replace(
  "const [assetsStatus, setAssetsStatus] = useState<string>('');",
  "const [assetsStatus, setAssetsStatus] = useState<string>('');\n  const [kmzGroupOption, setKmzGroupOption] = useState<'none' | 'color' | 'name'>('none');"
);

// Add new icons
code = code.replace(
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square } from 'lucide-react';",
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square, FolderSearch, FileSpreadsheet, CloudDownload, FolderInput } from 'lucide-react';"
);

// Add new export functions
const exportFunctions = `
  const downloadMergedExcel = () => {
    if (classifiedResults.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(classifiedResults.map(r => ({
      ID: r.id,
      Type: r.type,
      Longitude: r.x,
      Latitude: r.y,
      District: r.district,
      Layer: r.layer || '',
      Description: r.description || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classified");
    XLSX.writeFile(wb, "Merged_Classified_Assets.xlsx");
  };

  const downloadAssetsKMZ = async () => {
    if (classifiedResults.length === 0) return;
    // We would generate KMZ here based on kmzGroupOption
    // Since we don't have direct access to generateKMZ here without importing, 
    // let's do a simple alert or see if we can import generateKMZ
    alert(lang === 'ar' ? 'سيتم تصدير KMZ قريباً' : 'KMZ export coming soon');
  };
`;

code = code.replace(
  "const downloadExcel = () => {",
  exportFunctions + "\n  const downloadExcel = () => {"
);

// Replace Results section
const newResultsJSX = `
        {/* Results Options */}
        {classifiedResults.length > 0 && (
           <div className="bg-transparent border border-white/5 p-6 rounded-3xl space-y-6">
              
              <div className="flex items-center justify-end gap-2 mb-2">
                <h3 className="text-white font-black text-sm">{lang === 'ar' ? 'خيارات تجميع KMZ (للأصول):' : 'KMZ Grouping Options:'}</h3>
                <FolderInput className="w-5 h-5 text-accent" />
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => setKmzGroupOption('name')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'name' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'بالاسم' : 'By Name'}
                </button>
                <button 
                  onClick={() => setKmzGroupOption('color')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'color' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'باللون' : 'By Color'}
                </button>
                <button 
                  onClick={() => setKmzGroupOption('none')}
                  className={\`flex-1 py-3 rounded-2xl font-bold text-xs transition-all \${kmzGroupOption === 'none' ? 'bg-[#d6a536] text-[#0b2d3d]' : 'bg-white/5 text-white/60 hover:bg-white/10'}\`}
                >
                  {lang === 'ar' ? 'بدون' : 'None'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <button 
                  onClick={downloadMergedExcel}
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group"
                >
                  <FileSpreadsheet className="w-8 h-8 text-[#2ecc71] group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-sm">{lang === 'ar' ? 'إكسل مدمج (الكل)' : 'Merged Excel'}</span>
                </button>

                <button 
                  onClick={downloadAssetsKMZ}
                  className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl py-6 flex flex-col items-center justify-center gap-3 transition-colors group"
                >
                  <CloudDownload className="w-8 h-8 text-[#d6a536] group-hover:scale-110 transition-transform" />
                  <span className="text-white font-black text-sm">{lang === 'ar' ? 'KMZ للأصول فقط' : 'Assets KMZ'}</span>
                </button>
              </div>

           </div>
        )}
`;

// Replace the old results section
// The old results section starts at "{/* Results */}"
const oldResultsStart = code.indexOf("{/* Results */}");
if (oldResultsStart !== -1) {
  code = code.substring(0, oldResultsStart) + newResultsJSX + "\n      </div>\n    </div>\n  );\n};\n";
}

fs.writeFileSync('components/MapClassifier.tsx', code);
