const fs = require('fs');
let code = fs.readFileSync('services/turfService.ts', 'utf8');

code = code.replace(
  "return turf.polygon([ring], { name: zone.id, layer: zone.layer || zone.name });",
  "return turf.polygon([ring], { name: zone.id, layer: zone.layer || zone.name, color: zone.color });"
);

code = code.replace(
  "let assignedZoneName = 'غير مصنف'; // القيمة الافتراضية إذا لم تقع داخل أي منطقة",
  "let assignedZoneName = 'غير مصنف'; // القيمة الافتراضية إذا لم تقع داخل أي منطقة\n    let assignedColor = asset.color;"
);

code = code.replace(
  "assignedZoneName = name;",
  "assignedZoneName = name;\n          if (zone.properties?.color) {\n             assignedColor = String(zone.properties.color);\n          }"
);

code = code.replace(
  "district: assignedZoneName",
  "district: assignedZoneName,\n      color: assignedColor"
);

fs.writeFileSync('services/turfService.ts', code);
