const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "setRefPolygons?: (zones: GeoPoint[]) => void;",
  "setRefPolygons?: (zones: GeoPoint[]) => void;\n  setDataId?: (id: string) => void;"
);

code = code.replace(
  "export const MapClassifier = ({ lang, targetAssets, setTargetAssets, setRefPolygons }: Props) => {",
  "export const MapClassifier = ({ lang, targetAssets, setTargetAssets, setRefPolygons, setDataId }: Props) => {"
);

code = code.replace(
  "if (setRefPolygons) setRefPolygons(finalZones);",
  "if (setRefPolygons) setRefPolygons(finalZones);\n      if (setDataId) setDataId(`classifier-ref-${Date.now()}`);"
);

code = code.replace(
  "setTargetAssets(pts);",
  "setTargetAssets(pts);\n      if (setDataId) setDataId(`classifier-target-${Date.now()}`);"
);

fs.writeFileSync('components/MapClassifier.tsx', code);

let appCode = fs.readFileSync('App.tsx', 'utf8');
appCode = appCode.replace(
  "<MapClassifier lang={lang} targetAssets={globalPoints} setTargetAssets={setGlobalPoints} setRefPolygons={setClassifierRefZones} />",
  "<MapClassifier lang={lang} targetAssets={globalPoints} setTargetAssets={setGlobalPoints} setRefPolygons={setClassifierRefZones} setDataId={setDataId} />"
);
fs.writeFileSync('App.tsx', appCode);

