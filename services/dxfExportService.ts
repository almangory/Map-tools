import { GeoPoint } from '../types';

export const generateDXF = (data: GeoPoint[]): string => {
  let dxf = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1015
  0
ENDSEC
  0
SECTION
  2
TABLES
  0
ENDSEC
  0
SECTION
  2
BLOCKS
  0
ENDSEC
  0
SECTION
  2
ENTITIES
`;

  data.forEach((p, index) => {
    // Basic color mapping (AutoCAD Color Index)
    // We'll just use a default color if it's not provided, e.g., 7 (White/Black)
    const colorIndex = 7; 

    if (p.type === 'Point' || !p.path || p.path.length === 0) {
      dxf += `  0
POINT
  8
Layer_${p.layer || '0'}
 62
${colorIndex}
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
Layer_${p.layer || '0'}
 62
${colorIndex}
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
EOF
`;

  return dxf;
};

export const downloadDXF = (data: GeoPoint[], filename: string) => {
  const dxfContent = generateDXF(data);
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
