const fs = require('fs');
let content = fs.readFileSync('services/geometryService.ts', 'utf8');

const target = `      } else if ((pt.type === 'Polygon' || pt.type === 'LineString') && pt.path && existing.path) {
        if (isLineOverlay(pt, existing, maxMeters)) {
          isDup = true;
          break;
        }
      }`;

const replacement = `      } else if ((pt.type === 'Polygon' || pt.type === 'LineString') && pt.path && existing.path) {
        if (isLineOverlay(pt, existing, maxMeters)) {
          if (pt.type === 'LineString') {
            const len1 = calculatePathLength(pt.path);
            const len2 = calculatePathLength(existing.path);
            const minLen = Math.min(len1, len2);
            if (minLen <= 5.0) {
              // User specified: If the element length is <= 5m, it's an intersection, not a duplicate.
              // So we do not remove it as a duplicate.
              continue;
            }
          }
          isDup = true;
          break;
        }
      }`;

content = content.replace(target, replacement);

fs.writeFileSync('services/geometryService.ts', content, 'utf8');
console.log("Updated resolveExactDuplicates");
