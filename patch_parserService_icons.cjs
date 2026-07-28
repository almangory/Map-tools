const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

// 1. Add iconUrlMap
code = code.replace(
    "const stylesMap: Record<string, string> = {};",
    "const stylesMap: Record<string, string> = {};\n        const iconUrlMap: Record<string, string> = {};"
);

// 2. Extract icon href
code = code.replace(
    "const finalColor = lineColor || iconColor || polyColor;",
    `const finalColor = lineColor || iconColor || polyColor;
                const iconHref = iconStyle?.getElementsByTagName("Icon")[0]?.getElementsByTagName("href")[0]?.textContent;
                if (iconHref) iconUrlMap[\`#\${id}\`] = iconHref;`
);

// 3. Handle StyleMap for icons
code = code.replace(
    "if (stylesMap[styleUrl]) stylesMap[`#${mapId}`] = stylesMap[styleUrl];",
    "if (stylesMap[styleUrl]) stylesMap[`#${mapId}`] = stylesMap[styleUrl];\n                        if (iconUrlMap[styleUrl]) iconUrlMap[`#${mapId}`] = iconUrlMap[styleUrl];"
);

// 4. Set iconUrl on point
const pointAssignment = `           let color = "#3b82f6"; 
           let iconUrl = undefined;
           const styleUrl = pm.getElementsByTagName("styleUrl")[0]?.textContent;
           if (styleUrl) {
               if (stylesMap[styleUrl]) color = stylesMap[styleUrl];
               if (iconUrlMap[styleUrl]) iconUrl = iconUrlMap[styleUrl];
           }`;

code = code.replace(
    /let color = "#3b82f6";\s*const styleUrl = pm.getElementsByTagName\("styleUrl"\)\[0\]\?\.textContent;\s*if \(styleUrl && stylesMap\[styleUrl\]\) \{/m,
    pointAssignment + "\n           if (styleUrl && stylesMap[styleUrl]) {" // keep original block for safety, wait, let's just replace the block.
);

fs.writeFileSync('services/parserService.ts', code);
