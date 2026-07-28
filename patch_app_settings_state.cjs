const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
    "const [showOverlapModal, setShowOverlapModal] = useState(false);",
    "const [showOverlapModal, setShowOverlapModal] = useState(false);\n  const [showSettingsModal, setShowSettingsModal] = useState(false);\n  const [globalBaseMap, setGlobalBaseMap] = useState<import('./types').BaseMapType>('satellite');"
);

code = code.replace(
    "<MapPreview \n            points={displayPoints}",
    "<MapPreview \n            globalBaseMap={globalBaseMap}\n            points={displayPoints}"
);

fs.writeFileSync('App.tsx', code);
