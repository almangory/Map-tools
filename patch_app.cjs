const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// Add state for classifierRefZones
code = code.replace(
  "const [dataId, setDataId] = useState<string>('initial');",
  "const [dataId, setDataId] = useState<string>('initial');\n  const [classifierRefZones, setClassifierRefZones] = useState<GeoPoint[]>([]);"
);

// Include it in displayPoints
code = code.replace(
  "    if (activeTab === 'polygon-converter' || (activeTab === 'splitter' && splitMode === 'spatial')) {",
  "    if (activeTab === 'classifier') {\n      return [...globalPoints, ...classifierRefZones];\n    }\n    if (activeTab === 'polygon-converter' || (activeTab === 'splitter' && splitMode === 'spatial')) {"
);

code = code.replace(
  "  }, [activeTab, splitMode, plannedStreets, boundaryPolygon, globalPoints, splitPolygons]);",
  "  }, [activeTab, splitMode, plannedStreets, boundaryPolygon, globalPoints, splitPolygons, classifierRefZones]);"
);

// Pass the setter to MapClassifier
code = code.replace(
  "<MapClassifier lang={lang} targetAssets={globalPoints} setTargetAssets={setGlobalPoints} />",
  "<MapClassifier lang={lang} targetAssets={globalPoints} setTargetAssets={setGlobalPoints} setRefPolygons={setClassifierRefZones} />"
);

fs.writeFileSync('App.tsx', code);
