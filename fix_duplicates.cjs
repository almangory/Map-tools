const fs = require('fs');
let content = fs.readFileSync('services/geometryService.ts', 'utf8');

const target = `  // B. Detect LineString direct overlays (خط فوق خط)
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i];
      const l2 = lines[j];

      if (isLineOverlay(l1, l2, maxMeters)) {
        overlaps.push({
          id1: l1.id,
          id2: l2.id,
          type: 'LineString'
        });
      }
    }
  }`;

const replacement = `  // B. Detect LineString direct overlays (خط فوق خط)
  const lines = points.filter(p => p.type === 'LineString' && p.path && p.path.length > 1);

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i];
      const l2 = lines[j];

      if (isLineOverlay(l1, l2, maxMeters)) {
        const len1 = calculatePathLength(l1.path!);
        const len2 = calculatePathLength(l2.path!);
        
        const minLen = Math.min(len1, len2);
        const maxLen = Math.max(len1, len2);
        const lengthDiff = maxLen - minLen;
        
        const isFullDuplicate = lengthDiff < 1.0 || (lengthDiff / maxLen) < 0.05;
        
        let overlayType = 'LineString';
        if (isFullDuplicate) {
            overlayType = 'تطابق كامل';
        } else if (minLen > 5.0) {
            overlayType = 'تطابق جزئي';
        } else {
            overlayType = 'تقاطع';
        }

        overlaps.push({
          id1: l1.id,
          id2: l2.id,
          type: overlayType
        });
      }
    }
  }`;

content = content.replace(target, replacement);

fs.writeFileSync('services/geometryService.ts', content, 'utf8');
console.log("Updated detectExactDuplicates");
