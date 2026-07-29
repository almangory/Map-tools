export const generateDXF = (points: { x: number, y: number, type?: string, path?: { x: number, y: number }[] }[]) => {
  let dxf = `  0
SECTION
  2
ENTITIES
`;
  
  points.forEach(p => {
    if (p.type === 'Point' || (!p.path)) {
      dxf += `  0
POINT
  8
0
 10
${p.x}
 20
${p.y}
 30
0.0
`;
    } else if (p.type === 'LineString' || p.type === 'Polygon') {
      dxf += `  0
LWPOLYLINE
  8
0
 90
${p.path.length}
 70
${p.type === 'Polygon' ? 1 : 0}
`;
      p.path.forEach(pt => {
        dxf += ` 10
${pt.x}
 20
${pt.y}
`;
      });
    }
  });

  dxf += `  0
ENDSEC
  0
