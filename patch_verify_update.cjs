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
                
                // 1. Basic regex match (value with mm/inch)
                const diaMatch = descLower.match(/(\\d+)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  idLower.match(/(\\d+)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr1Lower.match(/(\\d+)\\s*(mm|inch|مم|انش|بوصة)/i) || 
                                  attr2Lower.match(/(\\d+)\\s*(mm|inch|مم|انش|بوصة)/i);
                if (diaMatch) hasDiameter = true;
                
                // 2. Check standard diameters without units
                if (!hasDiameter && (
                    descLower.includes('600') || idLower.includes('600') || attr1Lower.includes('600') || attr2Lower.includes('600') ||
                    descLower.includes('500') || idLower.includes('500') || attr1Lower.includes('500') || attr2Lower.includes('500') ||
                    descLower.includes('400') || idLower.includes('400') || attr1Lower.includes('400') || attr2Lower.includes('400') ||
                    descLower.includes('300') || idLower.includes('300') || attr1Lower.includes('300') || attr2Lower.includes('300') ||
                    descLower.includes('250') || idLower.includes('250') || attr1Lower.includes('250') || attr2Lower.includes('250') ||
                    descLower.includes('200') || idLower.includes('200') || attr1Lower.includes('200') || attr2Lower.includes('200') ||
                    descLower.includes('150') || idLower.includes('150') || attr1Lower.includes('150') || attr2Lower.includes('150') ||
                    descLower.includes('100') || idLower.includes('100') || attr1Lower.includes('100') || attr2Lower.includes('100')
                )) {
                    hasDiameter = true;
                }

                // 3. Check extended attributes map if it exists
                if (!hasDiameter && pt.attributes) {
                    for (const [key, val] of Object.entries(pt.attributes)) {
                        const keyLower = key.toLowerCase();
                        if (
                            keyLower.includes('diameter') || 
                            keyLower.includes('قطر') || 
                            keyLower.includes('innerdiameter') || 
                            keyLower.includes('outerdiameter') ||
                            keyLower.includes('dia') ||
                            keyLower.includes('size') ||
                            keyLower.includes('مقاس')
                        ) {
                            if (val && String(val).trim() !== '' && String(val) !== '0') {
                                hasDiameter = true;
                                break;
                            }
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
    code = code.substring(0, startIndex) + newVerifyLogic.trim() + code.substring(endIndex);
    fs.writeFileSync('App.tsx', code);
    console.log('Successfully updated verify logic');
} else {
    console.log('Could not find verify logic');
}
