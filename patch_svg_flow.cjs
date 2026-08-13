const fs = require('fs');

const fileContent = fs.readFileSync('components/MapPreview.tsx', 'utf8');

const oldExport = `  const exportMapToSVG = useCallback(() => {
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
  }, [lang]);`;

const newExport = `  const exportMapToSVG = useCallback(() => {
    if (!mapInstance.current) return;
    const svgElement = document.querySelector('.leaflet-overlay-pane svg');
    if (!svgElement) {
      alert(lang === 'ar' ? 'لا توجد بيانات متجهية (Vector) لتصديرها بصيغة SVG.' : 'No vector data found to export as SVG.');
      return;
    }
    
    const clonedSvg = svgElement.cloneNode(true) as Element;
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const container = mapInstance.current.getContainer();
    const mapWidth = container?.clientWidth || 1200;
    const mapHeight = container?.clientHeight || 800;

    clonedSvg.setAttribute('width', String(mapWidth));
    clonedSvg.setAttribute('height', String(mapHeight));
    if (!clonedSvg.getAttribute('viewBox')) {
      clonedSvg.setAttribute('viewBox', \`0 0 \${mapWidth} \${mapHeight}\`);
    }

    // Export Flow Direction Arrows & Outfall Nodes if Flow Analysis is Active
    if (showFlowDirection && mapInstance.current) {
      const arrowsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      arrowsGroup.setAttribute('id', 'flow-direction-arrows-layer');

      if (showLines !== false && points && points.length > 0) {
        points.forEach(pt => {
          if (pt.type === 'LineString' && pt.path && Array.isArray(pt.path)) {
            const segResult = flowAnalysis?.segments.get(pt.id) || 
                              flowAnalysis?.segments.get(String(pt.id)) || 
                              (typeof pt.id === 'number' ? flowAnalysis?.segments.get(Number(pt.id)) : undefined);
            
            let activePath = pt.path;
            if (segResult?.directedPath) {
              activePath = segResult.directedPath;
            }

            const latLngs = activePath
              .filter(p => isValidLatLng(p.y, p.x))
              .map(p => [p.y, p.x] as [number, number]);

            if (latLngs.length >= 2) {
              const layerPts = latLngs.map(l => mapInstance.current!.latLngToLayerPoint(l));

              // End vertex arrow (p2)
              const p1 = layerPts[layerPts.length - 2];
              const p2 = layerPts[layerPts.length - 1];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
              const rot = angleDeg + 90;

              const arrowG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              arrowG.setAttribute('transform', \`translate(\${p2.x.toFixed(2)}, \${p2.y.toFixed(2)}) rotate(\${rot.toFixed(2)})\`);
              arrowG.innerHTML = \`
                <g transform="translate(-11, -11)">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
                </g>
              \`;
              arrowsGroup.appendChild(arrowG);

              // Segment midpoint arrows for longer segments (> 25px)
              for (let i = 0; i < layerPts.length - 1; i++) {
                const s1 = layerPts[i];
                const s2 = layerPts[i + 1];
                const sdx = s2.x - s1.x;
                const sdy = s2.y - s1.y;
                const segDist = Math.hypot(sdx, sdy);

                if (segDist > 25) {
                  const midX = (s1.x + s2.x) / 2;
                  const midY = (s1.y + s2.y) / 2;
                  const segAngleDeg = Math.atan2(sdy, sdx) * (180 / Math.PI);
                  const segRot = segAngleDeg + 90;

                  const midArrowG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                  midArrowG.setAttribute('transform', \`translate(\${midX.toFixed(2)}, \${midY.toFixed(2)}) rotate(\${segRot.toFixed(2)})\`);
                  midArrowG.innerHTML = \`
                    <g transform="translate(-10, -10)">
                      <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#ef4444" stroke="#ffffff" stroke-width="1.5" transform="scale(0.85)"/>
                    </g>
                  \`;
                  arrowsGroup.appendChild(midArrowG);
                }
              }
            }
          }
        });
      }
      clonedSvg.appendChild(arrowsGroup);

      // Add Outfall Nodes
      if (flowAnalysis?.outfallNodes && flowAnalysis.outfallNodes.length > 0) {
        const outfallsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        outfallsGroup.setAttribute('id', 'outfall-nodes-layer');

        flowAnalysis.outfallNodes.forEach(outfallNode => {
          if (isValidLatLng(outfallNode.y, outfallNode.x)) {
            const pt = mapInstance.current!.latLngToLayerPoint([outfallNode.y, outfallNode.x]);
            const outfallG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            outfallG.setAttribute('transform', \`translate(\${pt.x.toFixed(2)}, \${pt.y.toFixed(2)})\`);
            outfallG.innerHTML = \`
              <circle r="18" fill="#06b6d4" fill-opacity="0.3" stroke="#0284c7" stroke-width="1.5" />
              <circle r="12" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
              <path d="M-6 2 C-4 0, -2 0, 0 2 C2 4, 4 4, 6 2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
              <path d="M-6 -2 C-4 -4, -2 -4, 0 -2 C2 0, 4 0, 6 -2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
            \`;
            outfallsGroup.appendChild(outfallG);
          }
        });
        clonedSvg.appendChild(outfallsGroup);
      }
    }
    
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);
    if (!source.match(/^<\\?xml/)) {
      source = '<?xml version="1.0" standalone="no"?>\\r\\n' + source;
    }
    
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = \`geogis-map-flow-export-\${new Date().getTime()}.svg\`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [lang, points, showFlowDirection, flowAnalysis, showLines]);`;

if (fileContent.includes(oldExport)) {
  const updated = fileContent.replace(oldExport, newExport);
  fs.writeFileSync('components/MapPreview.tsx', updated, 'utf8');
  console.log('Successfully updated MapPreview.tsx for SVG flow export!');
} else {
  console.error('Target oldExport not found in components/MapPreview.tsx');
}
