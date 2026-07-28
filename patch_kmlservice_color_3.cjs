const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

// In generateKMLChunks
code = code.replace(
    /let colorHex = pt\.color \|\| '#3b82f6';/g, 
    'let colorHex = pt.color;'
);

code = code.replace(
    /const \{ r, g, b, cleanHex \} = getKMLColorParts\(colorHex\);/g,
    'const { r, g, b, cleanHex, hasColor } = getKMLColorParts(colorHex);'
);

code = code.replace(
    /const styleId = type === 'Polygon' && options\?\.polygonStyle \? `style_Polygon_Custom_\$\{cleanHex\}` : `style_\$\{type\}_\$\{cleanHex\}_\$\{iconHash\}`; \/\/ Added icon hash to styleId/g,
    "const styleId = type === 'Polygon' && options?.polygonStyle ? `style_Polygon_Custom_${cleanHex}` : `style_${type}_${hasColor ? cleanHex : 'nocolor'}_${iconHash}`; // Added icon hash to styleId"
);

code = code.replace(
    /const kmlColor = `ff\$\{b\}\$\{g\}\$\{r\}`\.toLowerCase\(\);/g,
    "const kmlColorStr = hasColor ? `\\n        <color>ff${b}${g}${r}</color>` : '';\n            const kmlColor = `ff${b}${g}${r}`.toLowerCase();"
);

// We already patched `<LineStyle>${kmlColorStr}` in the previous script but wait... I didn't patch it for `stylesXML +=` because I failed!
// Let's manually replace the `<Style>` blocks in `generateKMLStyles`:

const oldPolygonStyle = `    <Style id="\${styleId}">
      <LineStyle>
        <color>\${kmlColor}</color>
        <width>\${polyWidth}</width>
      </LineStyle>
      <PolyStyle>
        <color>\${polyColor}</color>
        <fill>1</fill>
        <outline>\${polyOutline}</outline>
      </PolyStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

const newPolygonStyle = `    <Style id="\${styleId}">
      <LineStyle>\${kmlColorStr}
        <width>\${polyWidth}</width>
      </LineStyle>
      <PolyStyle>
        <color>\${polyColor}</color>
        <fill>1</fill>
        <outline>\${polyOutline}</outline>
      </PolyStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

code = code.replace(oldPolygonStyle, newPolygonStyle);

const oldLineStyle = `    <Style id="\${styleId}">
      <LineStyle>
        <color>\${kmlColor}</color>
        <width>\${options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3}</width>
      </LineStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

const newLineStyle = `    <Style id="\${styleId}">
      <LineStyle>\${kmlColorStr}
        <width>\${options?.lineStyle?.width !== undefined ? options.lineStyle.width : 3}</width>
      </LineStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

code = code.replace(oldLineStyle, newLineStyle);

const oldIconStyle = `    <Style id="\${styleId}">
      <IconStyle>
        <color>\${kmlColor}</color>
        <scale>0.8</scale>
        <Icon>
          <href>\${pt.iconUrl || 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

const newIconStyle = `    <Style id="\${styleId}">
      <IconStyle>\${kmlColorStr}
        <scale>0.8</scale>
        <Icon>
          <href>\${pt.iconUrl || 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'}</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <scale>0.85</scale>
      </LabelStyle>
      <BalloonStyle>
        <text>$[description]</text>
      </BalloonStyle>
    </Style>`;

code = code.replace(oldIconStyle, newIconStyle);

fs.writeFileSync('services/kmlService.ts', code);
console.log("Patched kmlService colors part 3");
