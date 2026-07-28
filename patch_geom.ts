export const splitLinesAtIntersections = (lines: import('../types').GeoPoint[]): import('../types').GeoPoint[] => {
    // Count vertex occurrences to find intersections
    const vertexMap = new Map<string, Set<string>>(); // coordinate -> set of line ids
    
    // Helper to format coordinate
    const coordKey = (x: number, y: number) => `${x.toFixed(7)},${y.toFixed(7)}`;

    lines.forEach(line => {
        if (line.type === 'LineString' && line.path) {
            line.path.forEach(v => {
                const k = coordKey(v.x, v.y);
                if (!vertexMap.has(k)) {
                    vertexMap.set(k, new Set());
                }
                vertexMap.get(k)!.add(line.id);
            });
        }
    });

    const result: import('../types').GeoPoint[] = [];

    lines.forEach(line => {
        if (line.type === 'LineString' && line.path) {
            const currentPath = line.path;
            let segmentStartIdx = 0;
            let partIndex = 1;

            for (let i = 0; i < currentPath.length; i++) {
                const k = coordKey(currentPath[i].x, currentPath[i].y);
                const intersectingWaysCount = vertexMap.get(k)?.size || 0;
                
                // If this is an intersection with ANOTHER way, or it's the last point
                if ((intersectingWaysCount > 1 && i > segmentStartIdx && i < currentPath.length - 1) || i === currentPath.length - 1) {
                    const segmentPath = currentPath.slice(segmentStartIdx, i + 1);
                    if (segmentPath.length >= 2) {
                        result.push({
                            ...line,
                            id: `${line.id} [${partIndex++}]`,
                            path: segmentPath,
                            // Recalculate length if function is available, but for simplicity let's just copy other attributes. Length will be updated later.
                        });
                    }
                    segmentStartIdx = i;
                }
            }
        } else {
            result.push(line);
        }
    });

    return result;
};
