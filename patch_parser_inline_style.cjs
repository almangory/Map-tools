const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const oldLogic = `           if (styleUrl && stylesMap[styleUrl]) {
               color = stylesMap[styleUrl];
           } else {
               const inlineLineStyle = pm.getElementsByTagName("LineStyle")[0];
               const inlineColor = inlineLineStyle?.getElementsByTagName("color")[0]?.textContent;
               if (inlineColor) color = kmlColorToHex(inlineColor);
           }`;

const newLogic = `           if (!styleUrl || !stylesMap[styleUrl]) {
               const inlineLineStyle = pm.getElementsByTagName("LineStyle")[0];
               const inlineIconStyle = pm.getElementsByTagName("IconStyle")[0];
               const inlinePolyStyle = pm.getElementsByTagName("PolyStyle")[0];
               const inlineColor = inlineLineStyle?.getElementsByTagName("color")[0]?.textContent || 
                                   inlineIconStyle?.getElementsByTagName("color")[0]?.textContent || 
                                   inlinePolyStyle?.getElementsByTagName("color")[0]?.textContent;
               if (inlineColor) color = kmlColorToHex(inlineColor);
               
               const inlineIconHref = inlineIconStyle?.getElementsByTagName("Icon")[0]?.getElementsByTagName("href")[0]?.textContent;
               if (inlineIconHref) iconUrl = inlineIconHref;
           }`;

if (code.includes(oldLogic)) {
    code = code.replace(oldLogic, newLogic);
    fs.writeFileSync('services/parserService.ts', code);
    console.log("Fixed inline style parsing!");
} else {
    console.log("Could not find oldLogic in parserService");
}
