const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

const regex = /<Icon>[\s\S]*?<href>http:\/\/maps\.google\.com\/mapfiles\/kml\/pushpin\/wht-pushpin\.png<\/href>[\s\S]*?<\/Icon>/;

if (regex.test(code)) {
    code = code.replace(
        regex,
        `<Icon>\n          <href>\${pt.iconUrl || 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'}</href>\n        </Icon>`
    );
    fs.writeFileSync('services/kmlService.ts', code);
    console.log("Fixed kmlService!");
} else {
    console.log("Could not find regex in kmlService");
}
