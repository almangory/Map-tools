const fs = require('fs');
const file = 'components/FileComparator.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `        points2.forEach(p => {
            const key = idColumn2 && p.attributes ? p.attributes[idColumn2] : p.id;
            if (key) map2.set(String(key), p);
        });
        
        const resultPoints: GeoPoint[] = [];
        let added = 0, deleted = 0, modified = 0, unchanged = 0;
        
        map2.forEach((p2, key) => {
            const p1 = map1.get(key);`;

const replace = `        points2.forEach(p => {
            const key = idColumn2 && p.attributes ? p.attributes[idColumn2] : p.id;
            if (key) map2.set(String(key), p);
        });

        // Spatial fallback matching for unmapped elements
        const unmatchedIn1 = new Set(map1.keys());
        map2.forEach((p2, k) => {
            if (unmatchedIn1.has(k)) {
                unmatchedIn1.delete(k);
            }
        });

        const unmapped2Keys = [];
        map2.forEach((p2, k) => {
            if (!map1.has(k)) unmapped2Keys.push(k);
        });

        for (const k2 of unmapped2Keys) {
            const p2 = map2.get(k2)!;
            let bestDist = Infinity;
            let bestK1 = '';
            for (const k1 of unmatchedIn1) {
                const p1 = map1.get(k1)!;
                const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
                // If it's a line, just matching by center/first point (which x,y represents) might be enough
                if (dist < 0.0001 && dist < bestDist) {
                    bestDist = dist;
                    bestK1 = k1;
                }
            }
            if (bestK1) {
                map2.delete(k2);
                map2.set(bestK1, p2);
                unmatchedIn1.delete(bestK1);
            }
        }
        
        const resultPoints: GeoPoint[] = [];
        let added = 0, deleted = 0, modified = 0, unchanged = 0;
        
        map2.forEach((p2, key) => {
            const p1 = map1.get(key);`;

content = content.replace(target, replace);
fs.writeFileSync(file, content, 'utf8');
console.log('patched spatial fallback logic');
