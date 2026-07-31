const fs = require('fs');
const file = 'services/parserService.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `           const extendedData = pm.getElementsByTagName("ExtendedData")[0];
           if (extendedData) {
               const dataElements = extendedData.getElementsByTagName("Data");
               for (let i = 0; i < dataElements.length; i++) {
                   const nameAttr = dataElements[i].getAttribute("name");
                   const val = dataElements[i].getElementsByTagName("value")[0]?.textContent;
                   if (nameAttr && val) attributes[nameAttr] = val;
               }
               const simpleDataElements = extendedData.getElementsByTagName("SimpleData");
               for (let i = 0; i < simpleDataElements.length; i++) {
                   const nameAttr = simpleDataElements[i].getAttribute("name");
                   const val = simpleDataElements[i].textContent;
                   if (nameAttr && val) attributes[nameAttr] = val;
               }
           }`;

const replace1 = `           const extendedDataTags = Array.from(pm.getElementsByTagName("ExtendedData"));
           extendedDataTags.forEach(extendedData => {
               const dataElements = extendedData.getElementsByTagName("Data");
               for (let i = 0; i < dataElements.length; i++) {
                   const nameAttr = dataElements[i].getAttribute("name");
                   const val = dataElements[i].getElementsByTagName("value")[0]?.textContent;
                   if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
               }
               const simpleDataElements = extendedData.getElementsByTagName("SimpleData");
               for (let i = 0; i < simpleDataElements.length; i++) {
                   const nameAttr = simpleDataElements[i].getAttribute("name");
                   const val = simpleDataElements[i].textContent;
                   if (nameAttr && val) attributes[nameAttr.trim()] = val.trim();
               }
           });`;

const target2 = `    // 1. Parse table rows for Key/Value pairs
    const trRegex = /<tr[^>]*>\\s*<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>\\s*<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>\\s*<\\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(cleanDesc)) !== null) {
        const rawKey = stripHtml(trMatch[1]);
        const rawVal = stripHtml(trMatch[2]);
        const lowerK = String(rawKey || '').toLowerCase();
        const lowerV = String(rawVal || '').toLowerCase();
        const isHeader = (lowerK === 'key' && lowerV === 'value') ||
                         (lowerK === 'field' && lowerV === 'value') ||
                         (lowerK === 'attribute' && lowerV === 'value') ||
                         (rawKey === 'الحقل' && rawVal === 'القيمة') ||
                         (rawKey === 'العنصر' && rawVal === 'القيمة');
        if (rawKey && !isHeader) {
            if (!attributes[rawKey]) attributes[rawKey] = rawVal;
        }
    }`;

const replace2 = `    // 1. Parse table rows for Key/Value pairs using regex
    const trRegex = /<tr[^>]*>[\\s\\S]*?<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>[\\s\\S]*?<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>[\\s\\S]*?<\\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(cleanDesc)) !== null) {
        const rawKey = stripHtml(trMatch[1]);
        const rawVal = stripHtml(trMatch[2]);
        const lowerK = String(rawKey || '').toLowerCase();
        const lowerV = String(rawVal || '').toLowerCase();
        const isHeader = (lowerK === 'key' && lowerV === 'value') ||
                         (lowerK === 'field' && lowerV === 'value') ||
                         (lowerK === 'attribute' && lowerV === 'value') ||
                         (rawKey === 'الحقل' && rawVal === 'القيمة') ||
                         (rawKey === 'العنصر' && rawVal === 'القيمة');
        if (rawKey && !isHeader) {
            if (!attributes[rawKey]) attributes[rawKey] = rawVal;
        }
    }
    
    // Also try parsing via DOMParser for robust HTML table extraction
    try {
        const dp = new DOMParser();
        const doc = dp.parseFromString(cleanDesc, 'text/html');
        const rows = doc.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length >= 2) {
                const rawKey = (cells[0].textContent || '').trim();
                const rawVal = (cells[1].textContent || '').trim();
                if (rawKey && rawVal && rawKey.length < 60) {
                    const lowerK = rawKey.toLowerCase();
                    const lowerV = rawVal.toLowerCase();
                    const isHeader = (lowerK === 'key' && lowerV === 'value') ||
                         (lowerK === 'field' && lowerV === 'value') ||
                         (lowerK === 'attribute' && lowerV === 'value') ||
                         (rawKey === 'الحقل' && rawVal === 'القيمة');
                    if (!isHeader && !attributes[rawKey]) {
                        attributes[rawKey] = rawVal;
                    }
                }
            }
        });
        
        // Sometimes KML descriptions are just flat lists of <b>KEY:</b> VALUE
        const bs = doc.querySelectorAll('b, strong');
        bs.forEach(b => {
            let key = (b.textContent || '').trim();
            if (key.endsWith(':')) key = key.substring(0, key.length - 1).trim();
            let next = b.nextSibling;
            let val = '';
            while (next && next.nodeName !== 'B' && next.nodeName !== 'STRONG' && next.nodeName !== 'BR') {
                val += (next.textContent || '');
                next = next.nextSibling;
            }
            val = val.trim();
            if (key && val && key.length < 60 && !attributes[key]) {
                attributes[key] = val;
            }
        });
    } catch(e) {}`;

content = content.replace(target1, replace1).replace(target2, replace2);
fs.writeFileSync(file, content, 'utf8');
console.log('patched parserService.ts');
