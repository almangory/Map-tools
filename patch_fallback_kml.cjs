const fs = require('fs');
const file = 'services/parserService.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `        const attributes: Record<string, string> = {};
        parseDescriptionToAttributes(desc, attributes);`;

const replace = `        const attributes: Record<string, string> = {};
        parseDescriptionToAttributes(desc, attributes);

        // Also extract ExtendedData if present
        const extDataMatch = content.match(/<ExtendedData[^>]*>([\\s\\S]*?)<\\/ExtendedData>/i);
        if (extDataMatch) {
            const extData = extDataMatch[1];
            // Match <Data name="Key"><value>Value</value></Data>
            const dataRegex = /<Data[^>]*name=['"]([^'"]+)['"][^>]*>\\s*<value[^>]*>([\\s\\S]*?)<\\/value>\\s*<\\/Data>/gi;
            let dMatch;
            while ((dMatch = dataRegex.exec(extData)) !== null) {
                const k = dMatch[1].trim();
                let v = dMatch[2].trim();
                if (v.startsWith('<![CDATA[')) v = v.substring(9, v.length - 3).trim();
                if (k && v && !attributes[k]) attributes[k] = stripHtml(v);
            }
            
            // Match <SimpleData name="Key">Value</SimpleData>
            const simpleDataRegex = /<SimpleData[^>]*name=['"]([^'"]+)['"][^>]*>([\\s\\S]*?)<\\/SimpleData>/gi;
            let sdMatch;
            while ((sdMatch = simpleDataRegex.exec(extData)) !== null) {
                const k = sdMatch[1].trim();
                let v = sdMatch[2].trim();
                if (v.startsWith('<![CDATA[')) v = v.substring(9, v.length - 3).trim();
                if (k && v && !attributes[k]) attributes[k] = stripHtml(v);
            }
        }`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched fallbackRegexParseKML');
