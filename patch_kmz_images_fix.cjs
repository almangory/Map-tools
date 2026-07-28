const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const regex = /const safeName = imgName\.split\('\/'\)\.pop\(\)\?\.replace\(\/\[\.\*\+\?\^\$\!\(\)\|\[\\\]\\\\\]\/g, '\\\\[\\s\\S]*?\}\);/;
if (regex.test(code)) {
    // This is a bit too messy to regex out easily. Let's just fetch the original file and do a clean replace.
}
