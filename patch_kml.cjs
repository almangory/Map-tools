const fs = require('fs');
let kml = fs.readFileSync('services/kmlService.ts', 'utf8');

const replacement = "const lineWidth = options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3;\n                stylesXML += `    <Style id=\"${styleId}\">\n      <LineStyle>\n        <color>${kmlColor}</color>\n        <width>${lineWidth}</width>\n      </LineStyle>";

kml = kml.replace(
    /stylesXML \+= `    <Style id="\$\{styleId\}">\\n      <LineStyle>\\n        <color>\$\{kmlColor\}<\/color>\\n        <width>3<\/width>\\n      <\/LineStyle>/,
    replacement
);

fs.writeFileSync('services/kmlService.ts', kml);
