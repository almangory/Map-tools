const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

code = code.replace(
  "const [kmzGroupOption, setKmzGroupOption] = useState<'none' | 'color' | 'name'>('none');",
  "const [kmzGroupOption, setKmzGroupOption] = useState<'none' | 'color' | 'name' | 'column'>('none');\n  const [selectedGroupColumn, setSelectedGroupColumn] = useState<string>('');"
);

// We need to populate assetsHeaders for GDB/KMZ as well
const oldAssetsElse = `
      } else {
          pts = result.data as GeoPoint[];
      }
`;

const newAssetsElse = `
      } else {
          pts = result.data as GeoPoint[];
          // Extract headers from attributes if available
          const attrKeys = new Set<string>();
          pts.forEach(p => {
              if (p.attributes) Object.keys(p.attributes).forEach(k => attrKeys.add(k));
          });
          if (attrKeys.size > 0) {
              setAssetsHeaders(Array.from(attrKeys));
          } else {
              setAssetsHeaders([]);
          }
      }
`;
code = code.replace(oldAssetsElse, newAssetsElse);

fs.writeFileSync('components/MapClassifier.tsx', code);
