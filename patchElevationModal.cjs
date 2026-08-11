const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  "              setIsDrawingMode(false);\n            }}\n         />",
  "              setIsDrawingMode(false);\n            }}\n         />\n         <ElevationProfileModal lang={lang} focusedPoint={focusedPoint} onClose={() => setFocusedPoint(null)} />"
);

fs.writeFileSync('App.tsx', code);
console.log('App main patched');
