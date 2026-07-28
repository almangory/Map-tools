const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "const [zonesStatus, setZonesStatus] = useState<string>('');",
  "const [zonesStatus, setZonesStatus] = useState<string>('');\n  const [zonesUrl, setZonesUrl] = useState<string>('');"
);

fs.writeFileSync('components/MapClassifier.tsx', code);
