const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

// Update styleId definition
code = code.replace(
    "const styleId = type === 'Polygon' && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${type}_${cleanHex}`;",
    "const iconHash = pt.iconUrl ? Math.abs(pt.iconUrl.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16) : 'default';\n        const styleId = type === 'Polygon' && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${type}_${cleanHex}_${iconHash}`; // Added icon hash to styleId"
);

// Update Point style generation
const pointStyleGeneration = `            } else {
                const iconHref = pt.iconUrl || 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png';
                stylesXML += \`    <Style id="\${styleId}">
      <IconStyle>
        <color>\${kmlColor}</color>
        <scale>0.8</scale>
        <Icon>
          <href>\${escapeXML(iconHref)}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>\`;`;

code = code.replace(
    /\} else \{\s*stylesXML \+= `    <Style id="\$\{styleId\}">\s*<IconStyle>\s*<color>\$\{kmlColor\}<\/color>\s*<scale>0\.8<\/scale>\s*<Icon>\s*<href>http:\/\/maps\.google\.com\/mapfiles\/kml\/pushpin\/wht-pushpin\.png<\/href>\s*<\/Icon>\s*<\/IconStyle>\s*<LabelStyle>`\;/,
    pointStyleGeneration
);

fs.writeFileSync('services/kmlService.ts', code);
