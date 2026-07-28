const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const oldRetain = `      if (retainUnmapped) {
        if (p.attributes) {
          Object.entries(p.attributes).forEach(([k, v]) => {
            if (!mappedSourceFields.has(k) && !newAttrs[k]) {
              newAttrs[k] = v;
            }
          });
        } else if (p.originalRow && headers) {
          headers.forEach((h, i) => {
            if (!mappedSourceFields.has(h) && !newAttrs[h]) {
              newAttrs[h] = String(p.originalRow![i] || '');
            }
          });
        }
      }`;

const newRetain = `      if (retainUnmapped) {
        if (p.attributes) {
          Object.entries(p.attributes).forEach(([k, v]) => {
            if (!mappedSourceFields.has(k) && !newAttrs[k]) {
              newAttrs[k] = v;
            }
          });
        }
        if (p.originalRow && headers) {
          headers.forEach((h, i) => {
            if (!mappedSourceFields.has(h) && !newAttrs[h]) {
              newAttrs[h] = String(p.originalRow![i] || '');
            }
          });
        }
      }`;

if (code.includes(oldRetain)) {
    code = code.replace(oldRetain, newRetain);
    fs.writeFileSync('components/DataFormatter.tsx', code);
    console.log("Patched retainUnmapped logic!");
} else {
    console.log("Could not find oldRetain");
}
