const fs = require('fs');

// --- Patch ElevationProfileModal.tsx ---
let codeModal = fs.readFileSync('components/ElevationProfileModal.tsx', 'utf8');

codeModal = codeModal.replace(
  "  onClose: () => void;\n}",
  "  onClose: () => void;\n  onHoverPoint?: (pt: {lat: number, lng: number} | null) => void;\n}"
);

codeModal = codeModal.replace(
  "export const ElevationProfileModal: React.FC<ElevationProfileModalProps> = ({ lang, focusedPoint, onClose }) => {",
  "export const ElevationProfileModal: React.FC<ElevationProfileModalProps> = ({ lang, focusedPoint, onClose, onHoverPoint }) => {"
);

codeModal = codeModal.replace(
  "let data: { dist: number; z: number }[] = [];",
  "let data: { dist: number; z: number; lat: number; lng: number }[] = [];"
);

// We need to patch the parts where `data.push` happens
codeModal = codeModal.replace(
  "data.push({ dist: 0, z: elevations[0] });",
  "data.push({ dist: 0, z: elevations[0], lat: samplePath[0].y, lng: samplePath[0].x });"
);
codeModal = codeModal.replace(
  "data.push({ dist: td, z: elevations[i] });",
  "data.push({ dist: td, z: elevations[i], lat: curr.y, lng: curr.x });"
);
codeModal = codeModal.replace(
  "data.push({ dist: 0, z: elevations[0] });",
  "data.push({ dist: 0, z: elevations[0], lat: path[0].y, lng: path[0].x });"
);
codeModal = codeModal.replace(
  "data.push({ dist: td, z: elevations[i] || 0 });",
  "data.push({ dist: td, z: elevations[i] || 0, lat: curr.y, lng: curr.x });"
);

// We also need to patch AreaChart to handle mouse move
codeModal = codeModal.replace(
  "<AreaChart data={profileData.data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>",
  "<AreaChart data={profileData.data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}\n                  onMouseMove={(e) => { if (e && e.activePayload && e.activePayload.length > 0) { const pt = e.activePayload[0].payload; onHoverPoint?.({ lat: pt.lat, lng: pt.lng }); } }}\n                  onMouseLeave={() => onHoverPoint?.(null)}\n                >"
);

fs.writeFileSync('components/ElevationProfileModal.tsx', codeModal);

// --- Patch App.tsx ---
let codeApp = fs.readFileSync('App.tsx', 'utf8');

codeApp = codeApp.replace(
  "  const [focusedPoint, setFocusedPoint] = useState<GeoPoint | null>(null);",
  "  const [focusedPoint, setFocusedPoint] = useState<GeoPoint | null>(null);\n  const [hoveredElevationPoint, setHoveredElevationPoint] = useState<{lat: number, lng: number} | null>(null);"
);

codeApp = codeApp.replace(
  "            focusedPoint={focusedPoint}",
  "            focusedPoint={focusedPoint}\n            hoveredElevationPoint={hoveredElevationPoint}"
);

codeApp = codeApp.replace(
  "<ElevationProfileModal lang={lang} focusedPoint={focusedPoint} onClose={() => setFocusedPoint(null)} />",
  "<ElevationProfileModal lang={lang} focusedPoint={focusedPoint} onClose={() => setFocusedPoint(null)} onHoverPoint={setHoveredElevationPoint} />"
);

fs.writeFileSync('App.tsx', codeApp);

// --- Patch MapPreview.tsx ---
let codeMap = fs.readFileSync('components/MapPreview.tsx', 'utf8');

codeMap = codeMap.replace(
  "  focusedPoint?: GeoPoint | null;",
  "  focusedPoint?: GeoPoint | null;\n  hoveredElevationPoint?: {lat: number, lng: number} | null;"
);

codeMap = codeMap.replace(
  "  focusedPoint,\n  issueItems",
  "  focusedPoint,\n  hoveredElevationPoint,\n  issueItems"
);

codeMap = codeMap.replace(
  "  const currentDrawGroup = useRef<L.LayerGroup | null>(null);",
  "  const currentDrawGroup = useRef<L.LayerGroup | null>(null);\n  const hoverMarkerRef = useRef<L.Marker | null>(null);"
);

// We need a useEffect to handle hoveredElevationPoint change
const useEffectStr = `
  useEffect(() => {
    if (!mapInstance.current) return;
    
    if (hoveredElevationPoint) {
      if (!hoverMarkerRef.current) {
        hoverMarkerRef.current = L.marker([hoveredElevationPoint.lat, hoveredElevationPoint.lng], {
          icon: L.divIcon({
            className: 'bg-transparent border-0',
            html: \`
              <div class="relative flex items-center justify-center w-8 h-8">
                 <div class="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-75"></div>
                 <div class="relative bg-yellow-500 border-2 border-white rounded-full w-4 h-4 shadow-xl"></div>
                 <div class="absolute top-[-24px] bg-black/80 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md whitespace-nowrap">\${lang === 'ar' ? 'نقطة الارتفاع' : 'Elevation Point'}</div>
              </div>\`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          }),
          interactive: false,
          zIndexOffset: 1000
        }).addTo(mapInstance.current);
      } else {
        hoverMarkerRef.current.setLatLng([hoveredElevationPoint.lat, hoveredElevationPoint.lng]);
      }
    } else {
      if (hoverMarkerRef.current) {
        mapInstance.current.removeLayer(hoverMarkerRef.current);
        hoverMarkerRef.current = null;
      }
    }
  }, [hoveredElevationPoint, lang]);
`;

codeMap = codeMap.replace(
  "  const mapContainer = useRef<HTMLDivElement>(null);",
  useEffectStr + "\n  const mapContainer = useRef<HTMLDivElement>(null);"
);

fs.writeFileSync('components/MapPreview.tsx', codeMap);

console.log('Hover point patched successfully');
