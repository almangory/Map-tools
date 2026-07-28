const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    /"اسم الشبكية"/,
    '"اسم الشبكية العاقدي"'
);

fs.writeFileSync('components/DataFormatter.tsx', code);
