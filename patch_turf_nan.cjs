const fs = require('fs');
let code = fs.readFileSync('services/turfService.ts', 'utf8');

const oldCode = `
      // تحويل النقطة إلى صيغة Turf Point
      // Note: turf.point expects [longitude, latitude]
      // Assuming asset.x is longitude and asset.y is latitude
      const pointToCheck = turf.point([asset.x, asset.y]);
`;

const newCode = `
      let ptX = asset.x;
      let ptY = asset.y;
      
      if (typeof ptX !== 'number' || isNaN(ptX) || typeof ptY !== 'number' || isNaN(ptY)) {
          if (asset.path && asset.path.length > 0) {
              ptX = asset.path[0].x;
              ptY = asset.path[0].y;
          }
      }
      
      if (typeof ptX !== 'number' || isNaN(ptX) || typeof ptY !== 'number' || isNaN(ptY)) {
          return { 
             ...asset, 
             district: assignedZoneName,
             layer: assignedZoneName,
             color: assignedColor
          };
      }
      
      // تحويل النقطة إلى صيغة Turf Point
      const pointToCheck = turf.point([ptX, ptY]);
`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('services/turfService.ts', code);
