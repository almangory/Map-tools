const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

code = code.replace(
    /const kmlColor = `ff\$\{b\}\$\{g\}\$\{r\}`;/,
    "const kmlColor = `ff${b}${g}${r}`.toLowerCase();"
);

code = code.replace(
    /const polyColor = `\$\{polyOpacity\}\$\{b\}\$\{g\}\$\{r\}`;/,
    "const polyColor = `${polyOpacity}${b}${g}${r}`.toLowerCase();"
);

fs.writeFileSync('services/kmlService.ts', code);
