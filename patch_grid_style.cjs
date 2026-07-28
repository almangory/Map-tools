const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// 1. Add state
code = code.replace(
    /const \[standardizePolygonColors, setStandardizePolygonColors\] = useState\(false\);/,
    "const [standardizePolygonColors, setStandardizePolygonColors] = useState(false);\n  const [keepOriginalGridStyle, setKeepOriginalGridStyle] = useState(false);"
);

// 2. Update type
code = code.replace(
    /type: \(targetTemplate === 'polygons' \|\| targetTemplate === 'boundaries'\) \? 'Polygon' : \(targetTemplate === 'grids' \? 'Point' : p\.type\)/,
    "type: (targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? 'Polygon' : (targetTemplate === 'grids' && !keepOriginalGridStyle ? 'Point' : p.type)"
);

// 3. Add UI
const gridUI = `          {(targetTemplate === 'grids') && (
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-white font-black text-sm">{lang === 'ar' ? 'الاحتفاظ بشكل والوان الملف المرفوع' : 'Keep Original Shape and Colors'}</h4>
                <p className="text-white/50 text-[10px] mt-1">{lang === 'ar' ? 'عند تفعيل هذا الخيار، سيتم الحفاظ على نوع وشكل العنصر ولونه الأصلي كما هو في الملف المرفوع.' : 'When enabled, the original shape, type, and color of the element will be kept as in the uploaded file.'}</p>
              </div>
              <button 
                onClick={() => setKeepOriginalGridStyle(!keepOriginalGridStyle)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  keepOriginalGridStyle ? "bg-accent" : "bg-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-1 transition-all transform",
                  keepOriginalGridStyle ? (lang === 'ar' ? "-translate-x-7" : "translate-x-7") : (lang === 'ar' ? "-translate-x-1" : "translate-x-1")
                )} />
              </button>
            </div>
          )}

          {(targetTemplate === 'polygons' || targetTemplate === 'boundaries') && (`;

code = code.replace(
    /\{\(targetTemplate === 'polygons' \|\| targetTemplate === 'boundaries'\) && \(/,
    gridUI
);

fs.writeFileSync('components/DataFormatter.tsx', code);
