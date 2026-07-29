const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const btn = `
          {onVerifyMissingAttributes && (
            <button onClick={onVerifyMissingAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-4 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group mt-6">
                <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
            </button>
          )}
`;

code = code.replace('<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">', btn + '\n          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">');

fs.writeFileSync('components/DataFormatter.tsx', code);
