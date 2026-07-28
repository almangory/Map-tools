const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const oldAttr = `      } else if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const v = p.originalRow![i];
          if (!attrMap.has(h)) {
             attrMap.set(h, String(v || '').substring(0, 30));
          } else if (attrMap.get(h) === '' && v) {
             attrMap.set(h, String(v).substring(0, 30));
          }
        });
      }`;

const newAttr = `      } else if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const v = p.originalRow![i];
          if (!attrMap.has(h)) {
             attrMap.set(h, String(v || '').substring(0, 30));
          } else if (attrMap.get(h) === '' && v) {
             attrMap.set(h, String(v).substring(0, 30));
          }
        });
      }
      if (p.street && !attrMap.has('الشارع (مسترجع)')) attrMap.set('الشارع (مسترجع)', p.street.substring(0, 30));
      if (p.district && !attrMap.has('الحي (مسترجع)')) attrMap.set('الحي (مسترجع)', p.district.substring(0, 30));
`;

if (code.includes(oldAttr)) {
    code = code.replace(oldAttr, newAttr);
} else {
    console.log("Could not find oldAttr");
}

const oldMap = `        if (mapRules?.sourceField) {
           if (p.attributes && p.attributes[mapRules.sourceField] !== undefined) {
               val = p.attributes[mapRules.sourceField];
           } else if (p.originalRow && headers) {`;

const newMap = `        if (mapRules?.sourceField) {
           if (mapRules.sourceField === 'الشارع (مسترجع)') {
               val = p.street || '';
           } else if (mapRules.sourceField === 'الحي (مسترجع)') {
               val = p.district || '';
           } else if (p.attributes && p.attributes[mapRules.sourceField] !== undefined) {
               val = p.attributes[mapRules.sourceField];
           } else if (p.originalRow && headers) {`;

if (code.includes(oldMap)) {
    code = code.replace(oldMap, newMap);
} else {
    console.log("Could not find oldMap");
}

fs.writeFileSync('components/DataFormatter.tsx', code);
console.log("Patched DataFormatter to include fetched attributes");
