const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const oldSig = `  const executeWithStreetFetching = async (
    points: GeoPoint[],
    headers: string[] | undefined
  ): Promise<GeoPoint[]> => {`;

const newSig = `  const executeWithStreetFetching = async (
    points: GeoPoint[],
    headers: string[] | undefined,
    callback?: (pts: GeoPoint[]) => void | Promise<void>
  ): Promise<GeoPoint[]> => {`;

content = content.replace(oldSig, newSig);

const oldReturn = `    }
    return newGlobalPoints;
  };`;

const newReturn = `    }
    if (callback) {
       await callback(newGlobalPoints);
    }
    return newGlobalPoints;
  };`;

content = content.replace(oldReturn, newReturn);

fs.writeFileSync('App.tsx', content, 'utf8');
console.log("Fixed executeWithStreetFetching in App.tsx");
