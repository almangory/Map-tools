const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "    setClassifiedResults(results);\n    alert(lang === 'ar' ? 'اكتمل التصنيف بنجاح!' : 'Classification completed successfully!');",
  "    setClassifiedResults(results);\n    setTargetAssets(results);\n    if (setDataId) setDataId(`classifier-colored-${Date.now()}`);\n    alert(lang === 'ar' ? 'اكتمل التصنيف بنجاح!' : 'Classification completed successfully!');"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
