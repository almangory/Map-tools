const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const fetchNetworkFile = `
/**
 * Fetch a generic network KML/KMZ file via CORS proxy
 */
export const fetchNetworkFile = async (url: string, onProgress?: (percent: number) => void): Promise<ParsedFile> => {
  if (onProgress) onProgress(10);
  
  // Use a CORS proxy
  const proxyUrl = \`https://api.allorigins.win/raw?url=\${encodeURIComponent(url)}\`;
  
  let response;
  try {
    response = await fetch(proxyUrl);
    if (!response.ok) throw new Error();
  } catch (e) {
    try {
      response = await fetch(url);
    } catch (e2) {
      throw new Error("تعذر جلب البيانات من الرابط بسبب قيود الحماية (CORS) أو أن الرابط غير صالح.");
    }
  }

  if (!response.ok) {
    throw new Error("فشل جلب البيانات من الرابط. تأكد من أن الملف عام ومتاح للمشاركة.");
  }

  if (onProgress) onProgress(40);
  
  const contentType = response.headers.get('content-type') || '';
  const urlLower = url.toLowerCase();
  
  // Check if it is KMZ (zip) or KML (text)
  if (urlLower.endsWith('.kmz') || urlLower.endsWith('.zip') || contentType.includes('application/vnd.google-earth.kmz') || contentType.includes('application/zip')) {
     const buffer = await response.arrayBuffer();
     // We can create a File object and pass to parseKMZ
     const file = new File([buffer], "network_file.kmz", { type: "application/vnd.google-earth.kmz" });
     return await parseKMZ(file, (p) => onProgress && onProgress(40 + (p * 0.6)));
  } else {
     const text = await response.text();
     if (!text || !text.includes('<kml')) {
         throw new Error("الملف لا يحتوي على بيانات KML صالحة.");
     }
     const points = parseKMLContent(text);
     if (onProgress) onProgress(100);
     return {
        filename: "network_file.kml",
        type: 'kmz',
        data: points,
        preview: []
     };
  }
};
`;

code = code + '\n' + fetchNetworkFile;

fs.writeFileSync('services/parserService.ts', code);
