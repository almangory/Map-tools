const fs = require('fs');
const content = fs.readFileSync('components/MapPreview.tsx', 'utf8');

const svgButton = `
            <button 
                onClick={exportMapToSVG}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl flex items-center justify-center text-primary hover:bg-white transition-all border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={lang === 'ar' ? 'تصدير كـ SVG (متجهات)' : 'Export as SVG (Vector)'}
            >
                <Download className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
`;

const replaced = content.replace(
  '<Maximize className="w-5 h-5 sm:w-6 sm:h-6" />\n            </button>',
  '<Maximize className="w-5 h-5 sm:w-6 sm:h-6" />\n            </button>' + svgButton
);

fs.writeFileSync('components/MapPreview.tsx', replaced, 'utf8');
console.log('Patched MapPreview SVG export button');
