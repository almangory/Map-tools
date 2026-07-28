const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const oldAttrLogic = `      if (p.attributes && Object.keys(p.attributes).length > 0) {
        Object.entries(p.attributes).forEach(([k, v]) => {
          if (!attrMap.has(k)) {
            attrMap.set(k, String(v || '').substring(0, 30));
          } else if (attrMap.get(k) === '' && v) {
            attrMap.set(k, String(v).substring(0, 30));
          }
        });
      } else if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const v = p.originalRow![i];
          if (!attrMap.has(h)) {
             attrMap.set(h, String(v || '').substring(0, 30));
          } else if (attrMap.get(h) === '' && v) {
             attrMap.set(h, String(v).substring(0, 30));
          }
        });
      }`;

const newAttrLogic = `      if (p.attributes && Object.keys(p.attributes).length > 0) {
        Object.entries(p.attributes).forEach(([k, v]) => {
          if (!attrMap.has(k)) {
            attrMap.set(k, String(v || '').substring(0, 30));
          } else if (attrMap.get(k) === '' && v) {
            attrMap.set(k, String(v).substring(0, 30));
          }
        });
      }
      
      if (p.originalRow && headers) {
        headers.forEach((h, i) => {
          const v = p.originalRow![i];
          if (!attrMap.has(h)) {
             attrMap.set(h, String(v || '').substring(0, 30));
          } else if (attrMap.get(h) === '' && v) {
             attrMap.set(h, String(v).substring(0, 30));
          }
        });
      }`;

if (code.includes(oldAttrLogic)) {
    code = code.replace(oldAttrLogic, newAttrLogic);
    fs.writeFileSync('components/DataFormatter.tsx', code);
    console.log("Patched DataFormatter to combine attributes and originalRow");
} else {
    console.log("Could not find oldAttrLogic");
}
