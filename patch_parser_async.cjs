const fs = require('fs');
let code = fs.readFileSync('services/parserService.ts', 'utf8');

const parseKMLContentAsyncStr = `
/**
 * Async wrapper for parseKMLContent to handle NetworkLinks
 */
export const parseKMLContentAsync = async (kmlContent: string, onProgress?: (percent: number) => void): Promise<GeoPoint[]> => {
    const points = parseKMLContent(kmlContent);
    
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlContent, "text/xml");
        const networkLinks = xmlDoc.getElementsByTagName("NetworkLink");
        
        for (let i = 0; i < networkLinks.length; i++) {
            // Find Link > href
            let href = "";
            const linkNode = networkLinks[i].getElementsByTagName("Link")[0];
            if (linkNode) {
                href = linkNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
            } else {
                // Sometimes it's direct Url > href
                const urlNode = networkLinks[i].getElementsByTagName("Url")[0];
                if (urlNode) {
                    href = urlNode.getElementsByTagName("href")[0]?.textContent?.trim() || "";
                }
            }

            if (href) {
                try {
                    // Check if it's already an absolute URL. If not, it might be relative, but for web KML it usually is absolute.
                    if (!href.startsWith('http')) {
                        console.warn("Relative NetworkLink not supported for web fetch:", href);
                        continue;
                    }
                    const parsedLink = await fetchNetworkFile(href);
                    if (parsedLink && parsedLink.data) {
                        points.push(...(parsedLink.data as GeoPoint[]));
                    }
                } catch(e) {
                    console.error("Failed to fetch NetworkLink:", href, e);
                }
            }
        }
    } catch(e) {
        console.error("Error parsing for NetworkLinks", e);
    }

    return points;
};
`;

code = code.replace(
  "export const parseKMZ = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {",
  parseKMLContentAsyncStr + "\nexport const parseKMZ = async (file: File, onProgress?: (percent: number) => void): Promise<ParsedFile> => {"
);

code = code.replace(
  "const points = parseKMLContent(kmlContent);",
  "const points = await parseKMLContentAsync(kmlContent, onProgress);"
); // in parseKMZ

code = code.replace(
  "const points = parseKMLContent(kmlContent);",
  "const points = await parseKMLContentAsync(kmlContent);"
); // in fetchMyMapsKML

code = code.replace(
  "const points = parseKMLContent(text);",
  "const points = await parseKMLContentAsync(text, onProgress);"
); // in fetchNetworkFile

fs.writeFileSync('services/parserService.ts', code);
