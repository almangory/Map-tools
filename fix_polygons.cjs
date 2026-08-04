const fs = require('fs');
let content = fs.readFileSync('services/geometryService.ts', 'utf8');

// Fix detectExactDuplicates
content = content.replace(
`      if (pt1.type === 'Point' || !pt1.type) {
        if (getPointDistanceMeters(pt1, pt2) <= maxMeters) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Point' });
        }
      } else if (pt1.type === 'Polygon' && pt1.path && pt2.path) {
        if (isLineOverlay(pt1, pt2, maxMeters)) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Polygon' });
        }
      }`,
`      if (pt1.type === 'Point' || !pt1.type) {
        if (getPointDistanceMeters(pt1, pt2) <= maxMeters) {
          overlaps.push({ id1: pt1.id, id2: pt2.id, type: 'Point' });
        }
      } else if (pt1.type === 'Polygon') {
        // Skip polygon overlap checks completely as requested
      }`
);

// Fix resolveExactDuplicates
content = content.replace(
`      } else if ((pt.type === 'Polygon' || pt.type === 'LineString') && pt.path && existing.path) {`,
`      } else if (pt.type === 'Polygon') {
        // Skip resolving polygons
      } else if (pt.type === 'LineString' && pt.path && existing.path) {`
);

// Fix detectSpatialOverlap
content = content.replace(
`    } else if (pt.type === 'Polygon' && pt.path && pt.path.length > 0) {
      const pathStrs = [...pt.path].map(p => \`\${p.x.toFixed(5)},\${p.y.toFixed(5)}\`).sort().join('|');
      return \`PL:\${pathStrs}\`;
    }`,
`    } else if (pt.type === 'Polygon') {
      // Skip polygon overlap checks completely as requested
      return '';
    }`
);

fs.writeFileSync('services/geometryService.ts', content, 'utf8');
console.log("Fixed Polygons overlap checks");
