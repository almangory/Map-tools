const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const newMemos = `
  const { materialDistribution, diameterDistribution } = useMemo(() => {
    const pointsToAnalyze = (activeTab === 'street-planner' || (activeTab === 'analyzer' && !activeFile)) ? plannedStreets : globalPoints;
    const matGroups: Record<string, number> = {};
    const diaGroups: Record<string, number> = {};
    
    pointsToAnalyze.forEach(pt => {
        let len = pt.originalLength || 0;
        if (len === 0 && pt.type === 'LineString' && pt.path) {
            len = calculatePathLength(pt.path);
        }
        
        let material = 'Unknown';
        let diameter = 'Unknown';
        
        if (pt.attributes) {
            // Check for material keys
            const matKey = Object.keys(pt.attributes).find(k => ['MATERIAL', 'المادة', 'material'].includes(k.toLowerCase()));
            if (matKey && pt.attributes[matKey]) material = String(pt.attributes[matKey]);
            
            // Check for diameter keys
            const diaKey = Object.keys(pt.attributes).find(k => ['INNERDIAMETER', 'DIAMETER', 'القطر', 'diameter'].includes(k.toLowerCase()));
            if (diaKey && pt.attributes[diaKey]) diameter = String(pt.attributes[diaKey]);
        }
        
        if (len > 0) {
            matGroups[material] = (matGroups[material] || 0) + len;
            diaGroups[diameter] = (diaGroups[diameter] || 0) + len;
        }
    });
    
    const matData = Object.entries(matGroups)
      .filter(([k, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Number((value / 1000).toFixed(2)) })) // Convert to km
      .sort((a, b) => b.value - a.value);
      
    const diaData = Object.entries(diaGroups)
      .filter(([k, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Number((value / 1000).toFixed(2)) })) // Convert to km
      .sort((a, b) => b.value - a.value);
      
    return { materialDistribution: matData, diameterDistribution: diaData };
  }, [globalPoints, plannedStreets, activeTab, activeFile]);
`;

code = code.replace(
    "const analysisData = useMemo(() => {",
    newMemos + "\n  const analysisData = useMemo(() => {"
);

fs.writeFileSync('App.tsx', code);
