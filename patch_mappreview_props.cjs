const fs = require('fs');
let code = fs.readFileSync('components/MapPreview.tsx', 'utf8');

code = code.replace(
    "export interface MapPreviewProps {",
    "export interface MapPreviewProps {\n  globalBaseMap?: BaseMapType;"
);

code = code.replace(
    "const MapPreview: React.FC<MapPreviewProps> = ({ points, lang, dataId, isSelectionMode, onPolygonComplete, focusedColor, overlapResults }) => {",
    "const MapPreview: React.FC<MapPreviewProps> = ({ points, lang, dataId, isSelectionMode, onPolygonComplete, focusedColor, overlapResults, globalBaseMap }) => {"
);

const useEffectCode = `
  useEffect(() => {
    if (globalBaseMap) {
      setBaseMap(globalBaseMap);
    }
  }, [globalBaseMap]);
`;

code = code.replace(
    "const t = translations[lang];",
    "const t = translations[lang];\n" + useEffectCode
);

fs.writeFileSync('components/MapPreview.tsx', code);
