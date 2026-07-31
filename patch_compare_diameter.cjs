const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `                if (p1.attributes && p2.attributes) {
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
                }`;

const replace = `                if (p1.attributes && p2.attributes) {
                    const keys = new Set([...Object.keys(p1.attributes), ...Object.keys(p2.attributes)]);
                    
                    // Specific diameter comparison logic across potentially different key names
                    const getDiameter = (attrs) => {
                        for (const k of Object.keys(attrs)) {
                            const kLower = k.toLowerCase();
                            if (kLower.includes('dia') || kLower.includes('قطر') || kLower.includes('size') || kLower.includes('width')) {
                                return attrs[k];
                            }
                        }
                        return null;
                    };
                    
                    const dia1 = getDiameter(p1.attributes);
                    const dia2 = getDiameter(p2.attributes);
                    if (dia1 !== null && dia2 !== null && String(dia1).trim() !== String(dia2).trim()) {
                        diameterChanged = true;
                    }
                    
                    for (let k of keys) {
                        if (p1.attributes[k] !== p2.attributes[k]) {
                            attrsChanged = true;
                            // Also fallback check on the specific key if we didn't catch it with the general heuristic
                            const kLower = k.toLowerCase();
                            if (kLower.includes('dia') || kLower.includes('قطر') || kLower.includes('size') || kLower.includes('width')) {
                                diameterChanged = true;
                            }
                        }
                    }
                } else if (p1.attributes !== p2.attributes) {
                    attrsChanged = true;
                }`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched advanced diameter compare logic');
