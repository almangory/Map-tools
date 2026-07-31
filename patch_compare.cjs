const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `                let attrsChanged = false;
                if (p1.attributes && p2.attributes) {
                    const keys = new Set([...Object.keys(p1.attributes), ...Object.keys(p2.attributes)]);
                    for (let k of keys) {
                        if (p1.attributes[k] !== p2.attributes[k]) {
                            attrsChanged = true;
                            break;
                        }
                    }
                } else if (p1.attributes !== p2.attributes) {
                    attrsChanged = true;
                }
                
                if (geomChanged || attrsChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#f59e0b', layer: lang === 'ar' ? 'تعديل' : 'Modified'}); 
                } else {
                    unchanged++;
                    resultPoints.push({...p2, color: '#94a3b8', layer: lang === 'ar' ? 'بدون تغيير' : 'Unchanged'}); 
                }
            }
        });
        
        map1.forEach((p1, key) => {
            if (!map2.has(key)) {
                deleted++;
                resultPoints.push({...p1, color: '#ef4444', layer: lang === 'ar' ? 'حذف' : 'Deleted'}); 
            }
        });`;

const replace = `                let attrsChanged = false;
                let diameterChanged = false;
                if (p1.attributes && p2.attributes) {
                    const keys = new Set([...Object.keys(p1.attributes), ...Object.keys(p2.attributes)]);
                    for (let k of keys) {
                        if (p1.attributes[k] !== p2.attributes[k]) {
                            attrsChanged = true;
                            const kLower = k.toLowerCase();
                            if (kLower.includes('dia') || kLower.includes('قطر') || kLower.includes('size')) {
                                diameterChanged = true;
                            }
                        }
                    }
                } else if (p1.attributes !== p2.attributes) {
                    attrsChanged = true;
                }
                
                if (diameterChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#9c27b0', layer: lang === 'ar' ? 'اختلاف القطر' : 'Diameter Diff'}); 
                } else if (geomChanged || attrsChanged) {
                    modified++;
                    resultPoints.push({...p2, color: '#f59e0b', layer: lang === 'ar' ? 'تعديل' : 'Modified'}); 
                } else {
                    unchanged++;
                    resultPoints.push({...p2, color: '#94a3b8', layer: lang === 'ar' ? 'بدون تغيير' : 'Unchanged'}); 
                }
            }
        });
        
        map1.forEach((p1, key) => {
            if (!map2.has(key)) {
                deleted++;
                resultPoints.push({...p1, color: '#000000', layer: lang === 'ar' ? 'نقص خطوط' : 'Missing Lines'}); 
            }
        });`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched compare logic');
