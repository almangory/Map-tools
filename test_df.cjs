const fs = require('fs');

let df = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// replace handleApplyExport body to return processedPoints instead of downloading directly
// Wait, I can just create a `getProcessedPoints()` function based on handleApplyExport's body
const getProcessedPointsCode = `
  const getProcessedPoints = () => {
    const currentSelected = selectedFields[targetTemplate] ?? TEMPLATES[targetTemplate].fields;
    let templateFields = TEMPLATES[targetTemplate].fields.filter(f => currentSelected.includes(f));
    
    const unselectedTemplateFields = new Set(
      TEMPLATES[targetTemplate].fields.filter(f => !templateFields.includes(f))
    );

    const processedPoints = points.map(p => {
      const newAttrs: Record<string, string> = {};
      const mappedSourceFields = new Set<string>();

      templateFields.forEach(field => {
        const mapRules = mapping[field];
        let val = '';
        if (mapRules?.sourceField) {
           if (mapRules.sourceField === 'الشارع (مسترجع)') {
               val = p.street || '';
           } else if (mapRules.sourceField === 'الحي (مسترجع)') {
               val = p.district || '';
           } else {
               const sourceFieldLower = mapRules.sourceField.toLowerCase();
               if (p.attributes) {
                   const matchedKey = Object.keys(p.attributes).find(k => k.toLowerCase() === sourceFieldLower);
                   if (matchedKey) val = String(p.attributes[matchedKey]);
               }
           }
           if (val) mappedSourceFields.add(mapRules.sourceField);
        }
        if (!val && mapRules?.defaultValue) val = mapRules.defaultValue;
        newAttrs[field] = val;
      });

      if (includeUnmapped) {
        if (p.attributes) {
            Object.keys(p.attributes).forEach(k => {
                if (!mappedSourceFields.has(k) && !unselectedTemplateFields.has(k)) {
                    newAttrs[k] = String(p.attributes[k]);
                }
            });
        }
      }

      return { ...p, attributes: newAttrs, description: undefined, layer: keepFolders ? p.layer : undefined };
    });

    if (overlapResults) {
        overlapResults.forEach((o, i) => {
            if (o.isIntersection && o.intersectionPoint) {
                processedPoints.push({
                    id: \`Intersection_\${i}\`,
                    x: o.intersectionPoint.x,
                    y: o.intersectionPoint.y,
                    type: 'Point',
                    color: '#9c27b0',
                    layer: 'Intersections',
                    attributes: {
                        'Description': \`Intersection between \${o.id1} and \${o.id2}\`,
                        'Type': 'Intersection'
                    }
                });
            }
        });
    }
    return { processedPoints, templateFields };
  };

  const handleApplyExportKMZ = () => {
    const { processedPoints, templateFields } = getProcessedPoints();
    const prefix = networkType === 'water' ? 'Water' : 'Wastewater';
    const suffix = targetTemplate === 'pipes' ? 'Lines' : targetTemplate === 'points' ? 'Points' : targetTemplate === 'stations' ? 'Stations' : targetTemplate === 'boundaries' ? 'Boundaries' : targetTemplate === 'grids' ? 'Grids' : targetTemplate === 'violations' ? 'Violations' : 'Polygons';
    
    downloadKMZ(processedPoints, \`\${prefix}_\${suffix}_Formatted\`, { 
        mode: keepFolders ? 'layer' : 'none', 
        groupByAttribute: keepFolders ? 'layer' : undefined,
        optimizeForMyMaps: optimizeForMyMaps,
        keepOriginalDescription: keepOriginalDescription,
        removeImagesOnly: removeImagesOnly,
        ...(targetTemplate === 'pipes' ? { lineStyle: { width: 3 } } : {}),
        ...((targetTemplate === 'polygons' || targetTemplate === 'boundaries') ? {
            polygonStyle: {
                ...(standardizePolygonColors ? { colorHex: '#0288d1', opacityHex: '4d' } : {}),
                ...(optimizeForMyMaps || standardizePolygonColors ? { outline: 0, width: 0 } : {})
            }
        } : {})
    }, templateFields, templateFields);
  };
`;
// I will just use the default edit file instead of regex patching
