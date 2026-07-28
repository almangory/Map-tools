const fs = require('fs');
let code = fs.readFileSync('services/turfService.ts', 'utf8');

code = code.replace(
  "district: assignedZoneName,",
  "district: assignedZoneName,\n      layer: assignedZoneName,"
);

fs.writeFileSync('services/turfService.ts', code);
