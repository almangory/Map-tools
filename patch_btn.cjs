const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square, FolderSearch, FileSpreadsheet, CloudDownload, FolderInput } from 'lucide-react';",
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square, FolderSearch, FileSpreadsheet, CloudDownload, FolderInput, Zap } from 'lucide-react';"
);

code = code.replace(
  "className={`w-full font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all shadow-xl ${(!loading && refZones.length > 0 && (targetAssets.length > 0 || localTargetAssets.length > 0)) ? 'bg-[#0d3446] text-white/70 hover:bg-[#124258]' : 'bg-white/5 text-white/40 disabled:opacity-30 disabled:cursor-not-allowed'`}",
  "className={`w-full font-black py-4 rounded-[2rem] flex items-center justify-center gap-2 transition-all shadow-xl ${(!loading && refZones.length > 0 && (targetAssets.length > 0 || localTargetAssets.length > 0)) ? 'bg-[#d6a536] text-[#0b2d3d] hover:bg-[#b58a2d]' : 'bg-white/5 text-white/40 disabled:opacity-30 disabled:cursor-not-allowed'`}"
);

code = code.replace(
  "<RefreshCw className=\"w-5 h-5\" />",
  "<Zap className=\"w-5 h-5\" />"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
