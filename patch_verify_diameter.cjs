const fs = require('fs');

let code = fs.readFileSync('App.tsx', 'utf8');

const newVerifyLogic = `
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
                
                // 1. Basic regex match (number with unit)
                const diaMatch = descLower.match(/(\\d+(\\.\\d+)?)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  idLower.match(/(\\d+(\\.\\d+)?)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr1Lower.match(/(\\d+(\\.\\d+)?)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr2Lower.match(/(\\d+(\\.\\d+)?)\\s*(mm|inch|مم|انش|بوصة)/i);
                if (diaMatch) hasDiameter = true;
                
                // 2. Check standard diameters without units
                const standardDias = /\\b(1000|900|800|700|600|500|400|300|250|225|200|160|150|110|100|90|75|63|50)\\b/;
                if (!hasDiameter && (
                    descLower.match(standardDias) || 
                    idLower.match(standardDias) || 
                    attr1Lower.match(standardDias) || 
                    attr2Lower.match(standardDias)
                )) {
                    hasDiameter = true;
                }

                // 3. Check for diameter keywords followed by or containing a number
                const diaKeywordRegex = /(diameter|innerdiameter|outerdiameter|dia|size|قطر|قطر الخط|مقاس)[\\s:=_-]*(\\d+(\\.\\d+)?)/i;
                if (!hasDiameter && (
                    descLower.match(diaKeywordRegex) ||
                    idLower.match(diaKeywordRegex) ||
                    attr1Lower.match(diaKeywordRegex) ||
                    attr2Lower.match(diaKeywordRegex)
                )) {
                    hasDiameter = true;
                }

                // 4. Check extended attributes map if it exists
                if (!hasDiameter && pt.attributes) {
                    for (const [key, val] of Object.entries(pt.attributes)) {
                        const keyLower = key.toLowerCase();
                        const valString = String(val).toLowerCase();
                        
                        // If the key is a diameter keyword, the value MUST contain a number
                        if (
                            keyLower.includes('diameter') || 
                            keyLower.includes('قطر') || 
                            keyLower.includes('innerdiameter') || 
                            keyLower.includes('outerdiameter') ||
                            keyLower.includes('dia') ||
                            keyLower.includes('size') ||
                            keyLower.includes('مقاس')
                        ) {
                            if (valString.match(/\\d+(\\.\\d+)?/) && valString.trim() !== '0') {
                                hasDiameter = true;
                                break;
                            }
                        }
                        
                        // Or if the value itself contains keyword + number
                        if (valString.match(diaKeywordRegex)) {
                            hasDiameter = true;
                            break;
                        }
                    }
                }

                // Check zone
                let hasZone = pt.district || descLower.includes('zone') || attr1Lower.includes('zone') || attr2Lower.includes('zone') || descLower.includes('منطقة') || attr1Lower.includes('منطقة') || descLower.includes('حي') || attr1Lower.includes('حي') || attr2Lower.includes('حي');
                
                if (!hasZone && pt.attributes) {
                     for (const [key, val] of Object.entries(pt.attributes)) {
                        const keyLower = key.toLowerCase();
                        if (
                            keyLower.includes('zone') || 
                            keyLower.includes('منطقة') || 
                            keyLower.includes('district') || 
                            keyLower.includes('حي') ||
                            keyLower.includes('sector') ||
                            keyLower.includes('قطاع') ||
                            keyLower.includes('مخطط')
                        ) {
                            if (val && String(val).trim() !== '' && String(val).trim() !== '0') {
                                hasZone = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasDiameter || !hasZone) {
                    missingCount++;
                    const missingParts = [];
                    if (!hasDiameter) missingParts.push(lang === 'ar' ? 'القطر' : 'Diameter');
                    if (!hasZone) missingParts.push(lang === 'ar' ? 'المنطقة' : 'Zone');
                    
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

const startIndex = code.indexOf('const verifyEssentialAttributes = () => {');
const endIndex = code.indexOf('};', code.indexOf('setTimeout(() => setStatusMessage(\'\'), 4000);')) + 2;

if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + newVerifyLogic.trim() + '\n\n' + code.substring(endIndex);
    fs.writeFileSync('App.tsx', code);
    console.log('Successfully updated verify logic');
} else {
    console.log('Could not find verify logic');
}
