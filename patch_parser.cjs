const fs = require('fs');
const file = 'services/parserService.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `        if (sepIdx > 0 && sepIdx < line.length - 1) {
            const k = line.substring(0, sepIdx).trim();
            const v = line.substring(sepIdx + 1).trim();
            if (k && k.length < 60 && !attributes[k]) {
                attributes[k] = v;
            }
        }
    }`;

const replace = `        if (sepIdx > 0 && sepIdx < line.length - 1) {
            const k = line.substring(0, sepIdx).trim();
            const v = line.substring(sepIdx + 1).trim();
            if (k && k.length < 60 && !attributes[k]) {
                attributes[k] = v;
            }
        } else if (sepIdx === -1) {
            const knownKeys = ['segment id', 'Permit No', 'ZONE', 'DIAMETER', 'SHAPE_Length', 'SHAPE', 'نوع الحفر', 'CONTRACTOR', 'PROJECTNAME', 'PROJECTID', 'Drilling type', 'Stage', 'LINENO', 'MATERIAL', 'ACTUALLENGTH', 'ASSETSTATUS', 'STREETNAME', 'DISTRICT', 'الشارع', 'الحي'];
            for (const key of knownKeys) {
                if (line.toLowerCase().startsWith(key.toLowerCase() + ' ')) {
                    const k = key;
                    const v = line.substring(key.length).trim();
                    if (!attributes[k]) {
                        attributes[k] = v;
                    }
                    break;
                }
            }
        }
    }`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched parserService.ts');
