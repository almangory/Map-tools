const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    /"الحي", "اسم الشارع"/,
    '"الحي", "حالة الشبكية", "اسم الشارع"'
);

fs.writeFileSync('components/DataFormatter.tsx', code);
