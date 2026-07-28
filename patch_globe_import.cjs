const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
    "Map as MapIcon,",
    "Map as MapIcon, Globe,"
);

fs.writeFileSync('App.tsx', code);
