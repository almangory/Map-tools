const fs = require('fs');
let code = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

code = code.replace(
    "boundaries: []",
    "boundaries: [],\n    grids: []"
);

// also just in case we need to make sure it's defensive
code = code.replace(
    "const isSelected = selectedFields[targetTemplate].includes(field);",
    "const isSelected = selectedFields[targetTemplate]?.includes(field) ?? false;"
);

code = code.replace(
    "const templateFields = TEMPLATES[targetTemplate].fields.filter(f => selectedFields[targetTemplate].includes(f));",
    "const templateFields = TEMPLATES[targetTemplate].fields.filter(f => selectedFields[targetTemplate]?.includes(f) ?? false);"
);

code = code.replace(
    "prev[targetTemplate].filter(f => f !== field)",
    "(prev[targetTemplate] || []).filter(f => f !== field)"
);

code = code.replace(
    "[...prev[targetTemplate], field]",
    "[...(prev[targetTemplate] || []), field]"
);

fs.writeFileSync('components/DataFormatter.tsx', code);
