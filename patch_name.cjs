const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

const target = "return { ...p, attributes: newAttrs, description: undefined, layer: keepFolders ? p.layer : undefined };";
const replacement = `      let newId = p.id;
      if (nameSourceField) {
         if (nameSourceField === 'الشارع (مسترجع)') {
             if (p.street) newId = String(p.street);
         } else if (nameSourceField === 'الحي (مسترجع)') {
             if (p.district) newId = String(p.district);
         } else if (newAttrs[nameSourceField] !== undefined && newAttrs[nameSourceField] !== '') {
             newId = String(newAttrs[nameSourceField]);
         } else if (p.attributes) {
             const matchedKey = Object.keys(p.attributes).find(k => k.toLowerCase() === nameSourceField.toLowerCase());
             if (matchedKey && p.attributes[matchedKey]) {
                 newId = String(p.attributes[matchedKey]);
             }
         }
      }

      return { ...p, id: newId, attributes: newAttrs, description: undefined, layer: keepFolders ? p.layer : undefined };`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('components/DataFormatter.tsx', code);
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
