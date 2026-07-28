const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "{lang === 'ar' ? 'مصنف الخرائط' : 'Map Classifier'}",
  "{lang === 'ar' ? 'مصنف الأصول' : 'Assets Classifier'}"
);
code = code.replace(
  "{lang === 'ar' ? 'صنف النقاط والأصول بناءً على وقوعها داخل مناطق (مضلعات) محددة' : 'Classify points and assets based on their location within specific zones (polygons)'}",
  "{lang === 'ar' ? 'دمج بيانات الأصول مع بيانات المناطق المرجعية' : 'Merge assets data with reference zones data'}"
);

code = code.replace(
  "<UploadCloud className=\"w-6 h-6 text-accent\" />",
  "<UploadCloud className=\"w-8 h-8 text-white/40 mb-2\" />"
);
code = code.replace(
  "<UploadCloud className=\"w-6 h-6 text-accent\" />",
  "<UploadCloud className=\"w-8 h-8 text-white/40 mb-2\" />"
);
code = code.replace(
  "{lang === 'ar' ? 'بدء تصنيف الخرائط' : 'Start Map Classification'}",
  "{lang === 'ar' ? 'بدء التصنيف والمطابقة' : 'Start Classification and Matching'}"
);

// We want to make sure the boxes match the style in the image
// The image shows: 
// [Square] المناطق المرجعية (POLYGONS)
// [Upload Area]
// [Pin] الأصول المستهدفة (POINTS/LINES)
// [Upload Area]

code = code.replace(
  "<h3 className=\"text-white font-black mb-4 text-sm flex items-center gap-2\">",
  "<h3 className=\"text-white/60 font-black mb-4 text-xs flex items-center justify-end gap-2 uppercase\">"
);
code = code.replace(
  "<h3 className=\"text-white font-black mb-4 text-sm flex items-center gap-2\">",
  "<h3 className=\"text-white/60 font-black mb-4 text-xs flex items-center justify-end gap-2 uppercase\">"
);
code = code.replace(
  "<MapIcon className=\"w-4 h-4 text-accent\" />",
  "<MapIcon className=\"w-4 h-4 text-accent order-last\" />"
);
code = code.replace(
  "<MapPin className=\"w-4 h-4 text-accent\" />",
  "<MapPin className=\"w-4 h-4 text-accent order-last\" />"
);

code = code.replace(
  "<div className=\"bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors pointer-events-none flex flex-col items-center justify-center gap-2\">",
  "<div className=\"bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center\">"
);
code = code.replace(
  "<div className=\"bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors pointer-events-none flex flex-col items-center justify-center gap-2\">",
  "<div className=\"bg-transparent border border-dashed border-white/20 rounded-2xl p-10 text-center hover:bg-white/5 transition-colors pointer-events-none flex flex-col items-center justify-center\">"
);

code = code.replace(
  "<Layers className=\"w-16 h-16 text-accent mx-auto\" />",
  "<div className=\"w-20 h-20 mx-auto rounded-full border-[6px] border-accent flex items-center justify-center mb-4\"><CircleDot className=\"w-10 h-10 text-accent\" /></div>"
);

code = `import { CircleDot } from 'lucide-react';\n` + code.replace("import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin } from 'lucide-react';", "import { Layers, Map as MapIcon, CheckCircle2, Download, RefreshCw, UploadCloud, MapPin } from 'lucide-react';");

fs.writeFileSync('components/MapClassifier.tsx', code);
