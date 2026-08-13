const fs = require('fs');
const content = fs.readFileSync('components/MapPreview.tsx', 'utf8');

const exportFunc = `
  const exportMapToSVG = useCallback(() => {
    if (!mapInstance.current) return;
    const svgElement = document.querySelector('.leaflet-overlay-pane svg');
    if (!svgElement) {
      alert(lang === 'ar' ? 'لا توجد بيانات متجهية (Vector) لتصديرها بصيغة SVG.' : 'No vector data found to export as SVG.');
      return;
    }
    
    const clonedSvg = svgElement.cloneNode(true);
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    
    // Optional: get styles to apply inline, or just export raw SVG
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    if (!source.match(/^<\\?xml/)) {
      source = '<?xml version="1.0" standalone="no"?>\\r\\n' + source;
    }
    
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = \`geogis-map-export-\${new Date().getTime()}.svg\`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [lang]);

`;

const replaced = content.replace('  const zoomToDataExtent = useCallback(() => {', exportFunc + '  const zoomToDataExtent = useCallback(() => {');

fs.writeFileSync('components/MapPreview.tsx', replaced, 'utf8');
console.log('Patched MapPreview SVG export function');
