const descWithImg = `<img src="https://lh3.googleusercontent.com/um/12345" height="200" width="auto" /><br><br>SHAPE_Length: 99.380255<br>ZONE: 1`;

const attributes = {};

const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let match;
let tableFound = false;
while ((match = trRegex.exec(descWithImg)) !== null) {
    tableFound = true;
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    const keyMatch = cellRegex.exec(match[1]);
    const valMatch = cellRegex.exec(match[1]);
    if (keyMatch && valMatch) {
        const key = keyMatch[1].replace(/<[^>]+>/g, '').trim();
        const val = valMatch[1].replace(/<[^>]+>/g, '').trim();
        if (key) attributes[key] = val;
    }
}
if (!tableFound) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    let listFound = false;
    while ((liMatch = liRegex.exec(descWithImg)) !== null) {
        listFound = true;
        const text = liMatch[1].replace(/<[^>]+>/g, '').trim();
        const parts = text.split(':');
        if (parts.length >= 2) {
            const key = parts.shift()?.trim();
            const val = parts.join(':').trim();
            if (key) attributes[key] = val;
        }
    }
    if (!listFound) {
        const cleanDesc = descWithImg.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        const lines = cleanDesc.split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            
            let separatorIdx = line.indexOf(':');
            if (separatorIdx !== -1) {
                const key = line.substring(0, separatorIdx).trim();
                const val = line.substring(separatorIdx + 1).trim();
                if (key) attributes[key] = val;
            } else {
                separatorIdx = line.indexOf(' ');
                if (separatorIdx !== -1) {
                    const key = line.substring(0, separatorIdx).trim();
                    const val = line.substring(separatorIdx + 1).trim();
                    if (key && /^[A-Z0-9_]+$/i.test(key)) {
                        attributes[key] = val;
                    }
                }
            }
        });
    }
}

console.log(attributes);
