const desc = "المصدر: بيانات البلدية\nالنوع: حديد\nالقطر - 200";
const cleanDesc = desc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const lines = cleanDesc.split('\n');
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        let separatorIdx = line.indexOf(':');
        if(separatorIdx === -1) separatorIdx = line.indexOf('：');
        if(separatorIdx === -1) separatorIdx = line.indexOf('-');
        if(separatorIdx === -1) separatorIdx = line.indexOf('=');

        if (separatorIdx !== -1) {
            const key = line.substring(0, separatorIdx).trim();
            const val = line.substring(separatorIdx + 1).trim();
            console.log("key:", key, "val:", val);
        }
    });
