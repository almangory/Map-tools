const fs = require('fs');

let code = fs.readFileSync('App.tsx', 'utf8');

const verifyFunctionCode = `
  const verifyEssentialAttributes = () => {
    setLoading(true);
    setStatusMessage(lang === 'ar' ? 'جاري فحص البيانات...' : 'Verifying attributes...');
    
    setTimeout(() => {
        let missingCount = 0;
        
        const processPoints = (pts: GeoPoint[]) => {
            return pts.map(pt => {
                if (pt.type !== 'LineString') return pt;
                if (isBlackLine(pt)) return pt;
                
                const descLower = (pt.description || '').toLowerCase();
                const idLower = (String(pt.id) || '').toLowerCase();
                const attr1Lower = (pt.attr1 || '').toLowerCase();
                const attr2Lower = (pt.attr2 || '').toLowerCase();
                
                let hasDiameter = false;
                const diaMatch = descLower.match(/(\\d+)\\s*(mm|inch)/i) || 
                                  idLower.match(/(\\d+)\\s*(mm|inch)/i) || 
                                  attr1Lower.match(/(\\d+)\\s*(mm|inch)/i) || 
                                  attr2Lower.match(/(\\d+)\\s*(mm|inch)/i);
                if (diaMatch) hasDiameter = true;
                else if (
                    descLower.includes('600') || idLower.includes('600') ||
                    descLower.includes('500') || idLower.includes('500') ||
                    descLower.includes('400') || idLower.includes('400') ||
                    descLower.includes('300') || idLower.includes('300') ||
                    descLower.includes('200') || idLower.includes('200')
                ) {
                    hasDiameter = true;
                }

                // Check zone
                const hasZone = pt.district || descLower.includes('zone') || attr1Lower.includes('zone') || attr2Lower.includes('zone') || descLower.includes('منطقة') || attr1Lower.includes('منطقة');

                if (!hasDiameter || !hasZone) {
                    missingCount++;
                    const missingParts = [];
                    if (!hasDiameter) missingParts.push('Diameter');
                    if (!hasZone) missingParts.push('Zone');
                    
                    return {
                        ...pt,
                        color: '#FF0055', // Distinctive alert color
                        description: \`\${pt.description || ''}\\n[MISSING: \${missingParts.join(', ')}]\`.trim(),
                        layer: \`\${pt.layer || 'Unknown'}_MISSING_ATTRS\`
                    };
                }
                
                return pt;
            });
        };

        if (activeFile) {
            const nextGlobal = processPoints(globalPoints);
            setGlobalPoints(nextGlobal);
        } else {
            const nextPlanned = processPoints(plannedStreets);
            setPlannedStreets(nextPlanned);
        }

        setLoading(false);
        setStatusMessage(lang === 'ar' ? \`تم إبراز \${missingCount} عنصراً ينقصه بيانات أساسية.\` : \`Highlighted \${missingCount} segments missing essential attributes.\`);
        setTimeout(() => setStatusMessage(''), 4000);
    }, 500);
  };
`;

const insertIndex = code.indexOf('const getPointsToCheck = (): GeoPoint[] => {');
if (insertIndex !== -1) {
    code = code.substring(0, insertIndex) + verifyFunctionCode + '\n' + code.substring(insertIndex);
}

const verifyButtonCode = `
                            <button onClick={verifyEssentialAttributes} className="w-full bg-[#3d0b1a] border border-[#ff0055]/40 text-[#ff0055] font-black py-5 rounded-full flex items-center justify-center gap-3 shadow-xl hover:bg-[#ff0055] hover:text-white transition-all text-sm group">
                                <AlertTriangle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                {lang === 'ar' ? 'فحص وإبراز العناصر الناقصة (قطر/منطقة)' : 'Highlight Segments Missing Diameter/Zone'}
                            </button>
`;

const buttonInsertIndex = code.indexOf('<div className="grid grid-cols-2 gap-3">', code.indexOf('export Excel with Streets'));
if (buttonInsertIndex !== -1) {
    // We'll insert it right before the grid grid-cols-2 gap-3 div
    code = code.substring(0, buttonInsertIndex) + verifyButtonCode + '\n                            ' + code.substring(buttonInsertIndex);
}

fs.writeFileSync('App.tsx', code);
console.log('App.tsx updated');
