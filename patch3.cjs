const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "{lang === 'ar' ? 'اختر ملف KML, KMZ, DXF, GDB' : 'Select KML, KMZ, DXF, GDB'}",
  "{lang === 'ar' ? 'ارفع ملف المناطق' : 'Upload Reference Zones'}"
);

code = code.replace(
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin } from 'lucide-react';",
  "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin, FileUp, Square } from 'lucide-react';"
);

code = code.replace(
  "<UploadCloud className=\"w-8 h-8 text-white/40 mb-2\" />",
  "<FileUp className=\"w-6 h-6 text-white/40 mb-2\" />"
);
code = code.replace(
  "<UploadCloud className=\"w-8 h-8 text-white/40 mb-2\" />",
  "<FileUp className=\"w-6 h-6 text-white/40 mb-2\" />"
);

code = code.replace(
  "<MapIcon className=\"w-4 h-4 text-accent order-last\" />",
  "<Square className=\"w-4 h-4 text-accent order-last\" />"
);

code = code.replace(
  "<div className=\"bg-black/10 border border-white/5 p-6 rounded-3xl\">",
  "<div className=\"bg-transparent border border-white/5 p-6 rounded-3xl\">"
);
code = code.replace(
  "<div className=\"bg-black/10 border border-white/5 p-6 rounded-3xl\">",
  "<div className=\"bg-transparent border border-white/5 p-6 rounded-3xl\">"
);

code = code.replace(
  "className=\"w-full bg-accent text-primary font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed\"",
  "className=\"w-full bg-white/5 text-white/40 font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed\""
);

// We need to change the button style based on whether files are uploaded
code = code.replace(
  "className=\"w-full bg-white/5 text-white/40 font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed\"",
  "className={`w-full font-black py-4 rounded-3xl flex items-center justify-center gap-2 transition-all shadow-xl ${(!loading && refZones.length > 0 && (targetAssets.length > 0 || localTargetAssets.length > 0)) ? 'bg-[#0d3446] text-white/70 hover:bg-[#124258]' : 'bg-white/5 text-white/40 disabled:opacity-30 disabled:cursor-not-allowed'}`}"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
