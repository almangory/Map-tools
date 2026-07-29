const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const buttonCode = `
                            <button onClick={verifyEssentialAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group">
                                <AlertTriangle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
                            </button>
`;

code = code.replace(buttonCode, '');

// Now we insert it into the Analyzer and Attribute Formatter tabs.

// Let's find Analyzer section.
const analyzerMarker = "export Excel with Streets";

let analyzerIndex = code.indexOf(analyzerMarker);
// We want to insert it near the export buttons for analyzer. Actually, let's find the grid of PPTX and PDF exports.
let pptxIndex = code.indexOf('generateAnalysisPPTX(analysisData');
if (pptxIndex !== -1) {
    let gridIndex = code.lastIndexOf('<div className="grid grid-cols-2 gap-3">', pptxIndex);
    if (gridIndex !== -1) {
        code = code.substring(0, gridIndex) + buttonCode + '\n                            ' + code.substring(gridIndex);
    }
}

// Now let's find Attribute Formatter tab.
// activeTab === 'attribute-formatter'
// Let's look for AttributeFormatter component or section.
// grep 'attribute-formatter'

fs.writeFileSync('App.tsx', code);
