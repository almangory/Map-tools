const fs = require('fs');
let code = fs.readFileSync('components/MapPreview.tsx', 'utf8');
code = code.replace("type BaseMapType = 'satellite' | 'streets' | 'terrain' | 'osm';", "");
code = code.replace("import { GeoPoint, OverlapResult } from '../types';", "import { GeoPoint, OverlapResult, BaseMapType } from '../types';");
fs.writeFileSync('components/MapPreview.tsx', code);
