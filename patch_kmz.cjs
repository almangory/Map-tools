const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "await downloadKMZ(exportPoints, \"Classified_Assets\", exportOptions);",
  "await downloadKMZ(exportPoints, \"Classified_Assets\", exportOptions, assetsHeaders.length > 0 ? assetsHeaders : undefined);"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
