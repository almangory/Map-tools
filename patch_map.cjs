const fs = require('fs');
let code = fs.readFileSync('components/MapPreview.tsx', 'utf8');

// 1. Add state variables
const stateHookPos = code.indexOf('const [showDataOverlay, setShowDataOverlay] = useState(true);');
if (stateHookPos !== -1) {
  const statesToAdd = `
  const [showPolygons, setShowPolygons] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  `;
  code = code.substring(0, stateHookPos) + statesToAdd + code.substring(stateHookPos);
}

// 2. Add filtering in rendering
code = code.replace("if (pt.type === 'Polygon' && pt.path && Array.isArray(pt.path)) {", "if (pt.type === 'Polygon' && pt.path && Array.isArray(pt.path)) {\n          if (!showPolygons) return;");
code = code.replace("} else if (pt.type === 'LineString' && pt.path && Array.isArray(pt.path)) {", "} else if (pt.type === 'LineString' && pt.path && Array.isArray(pt.path)) {\n          if (!showLines) return;");
code = code.replace("} else {\n          if (pt.iconUrl) {", "} else {\n          if (!showPoints) return;\n          if (pt.iconUrl) {");

// 3. Add to dependencies
code = code.replace("}, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults]);", "}, [points, lang, focusedColor, isDrawing, dataId, zoomToDataExtent, overlapResults, showPolygons, showLines, showPoints]);");

// 4. Add UI Toggles
const uiToggles = `
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100">
                        <h4 className="text-[11px] font-black uppercase text-slate-400 mb-1">{lang === 'ar' ? 'تصفية العناصر' : 'Filter Elements'}</h4>
                        <div className="grid grid-cols-3 gap-2">
                            <button 
                                onClick={() => setShowPolygons(!showPolygons)}
                                className={\`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 \${showPolygons ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}\`}
                            >
                                <Square className="w-4 h-4" />
                                {lang === 'ar' ? 'مضلعات' : 'Polygons'}
                            </button>
                            <button 
                                onClick={() => setShowLines(!showLines)}
                                className={\`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 \${showLines ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}\`}
                            >
                                <Navigation2 className="w-4 h-4" />
                                {lang === 'ar' ? 'خطوط' : 'Lines'}
                            </button>
                            <button 
                                onClick={() => setShowPoints(!showPoints)}
                                className={\`py-2 px-1 rounded-xl transition-all border text-[9px] font-black uppercase flex flex-col items-center gap-1 \${showPoints ? "bg-primary text-white border-primary shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"}\`}
                            >
                                <MapPinIcon className="w-4 h-4" />
                                {lang === 'ar' ? 'نقاط' : 'Points'}
                            </button>
                        </div>
                    </div>
`;

// Insert the toggles right after the Data Overlay button
const target = '</button>';
const targetIdx = code.indexOf('setShowDataOverlay(!showDataOverlay)');
if (targetIdx !== -1) {
  const insertPos = code.indexOf(target, targetIdx) + target.length;
  code = code.substring(0, insertPos) + uiToggles + code.substring(insertPos);
}

fs.writeFileSync('components/MapPreview.tsx', code);
