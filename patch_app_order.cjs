const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  "if (activeTab === 'classifier') {\n      return [...globalPoints, ...classifierRefZones];\n    }",
  "if (activeTab === 'classifier') {\n      // Render polygons (zones) first, then points (assets) on top\n      return [...classifierRefZones, ...globalPoints];\n    }"
);

fs.writeFileSync('App.tsx', code);
