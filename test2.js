import JSZip from 'jszip';
import fs from 'fs';

async function test() {
    const data = fs.readFileSync('test.kmz');
    const zip = await JSZip.loadAsync(data);
    const kml = await zip.file('doc.kml').async('string');
    console.log("Extracted:", kml);
}
test();


