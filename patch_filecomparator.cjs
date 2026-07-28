const fs = require('fs');
let code = fs.readFileSync('components/FileComparator.tsx', 'utf8');

code = code.replace(
    "id: \\`Feature_\\${i}\\`,",
    "id: `Feature_${i}`,"
);

code = code.replace(
    "setDataId(\\`compare-\\${Date.now()}\\`);",
    "setDataId(`compare-${Date.now()}`);"
);

fs.writeFileSync('components/FileComparator.tsx', code);
