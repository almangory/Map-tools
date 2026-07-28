const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

code = code.replace(
  "const [dataId, setDataId] = useState<string>(''); ",
  "const [dataId, setDataId] = useState<string>('');\n  const [classifierRefZones, setClassifierRefZones] = useState<GeoPoint[]>([]);"
);

fs.writeFileSync('App.tsx', code);
