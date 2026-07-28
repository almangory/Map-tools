const fs = require('fs');
let kml = fs.readFileSync('services/kmlService.ts', 'utf8');

kml = kml.replace(
    "<width>3</width>",
    "<width>${options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3}</width>"
);

fs.writeFileSync('services/kmlService.ts', kml);
