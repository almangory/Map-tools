const descWithImgTable = `<table><tr><td><img src="..."/></td></tr></table><br>SHAPE_Length: 99.380255<br>ZONE: 1`;
const attributes = {};

const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let match;
let tableFound = false;
while ((match = trRegex.exec(descWithImgTable)) !== null) {
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
if (tableFound) {
    console.log("Table found, returning early:", attributes);
}

