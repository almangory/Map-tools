const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    /if \(standardizeColors && p\.color\) \{/,
    "if (standardizeColors && p.color && !(targetTemplate === 'grids' && keepOriginalGridStyle)) {"
);

fs.writeFileSync('components/DataFormatter.tsx', code);
