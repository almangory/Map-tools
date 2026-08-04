const fs = require('fs');
let content = fs.readFileSync('services/geometryService.ts', 'utf8');

// In detectExactDuplicates, only push if it's NOT an intersection (length > 5.0)
content = content.replace(
`        overlaps.push({
          id1: l1.id,
          id2: l2.id,
          type: overlayType
        });`,
`        if (overlayType !== 'تقاطع') {
            overlaps.push({
              id1: l1.id,
              id2: l2.id,
              type: overlayType
            });
        }`
);

// In detectLineIntersections, if it's a short overlay (<= 5.0), push it to overlaps
// First find the skip logic:
const skipLogic = `      // Skip duplicate line overlays (handled in detectExactDuplicates)
      if (isLineOverlay(l1, l2, 5.0)) continue;`;

const newSkipLogic = `      // Check for line overlays
      if (isLineOverlay(l1, l2, 5.0)) {
          const len1 = calculatePathLength(l1.path!);
          const len2 = calculatePathLength(l2.path!);
          const minLen = Math.min(len1, len2);
          
          if (minLen <= 5.0) {
              // It's a short overlay, considered an intersection!
              // Use the midpoint of the shorter line as the intersection point
              const shorterLine = len1 < len2 ? l1 : l2;
              const midIndex = Math.floor(shorterLine.path!.length / 2);
              const ixPt = shorterLine.path![midIndex];
              
              overlaps.push({
                  id1: l1.id,
                  id2: l2.id,
                  type: 'تقاطع (تطابق قصير)',
                  isIntersection: true,
                  intersectionPoint: { x: ixPt.x, y: ixPt.y }
              });
          }
          continue; // Skip further mathematical intersection checks for overlays
      }`;

content = content.replace(skipLogic, newSkipLogic);

fs.writeFileSync('services/geometryService.ts', content, 'utf8');
console.log("Updated both");
