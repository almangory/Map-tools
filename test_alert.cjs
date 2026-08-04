const fs = require('fs');

let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// Add error state
content = content.replace('const [localGeocodingMode', 'const [actionError, setActionError] = useState<string | null>(null);\n  const [localGeocodingMode');

// Update executeAction
const startExecute = content.indexOf('const executeAction = async (action');
const endExecute = content.indexOf('return (', startExecute);

const newExecuteAction = `const executeAction = async (action: (overridePoints?: GeoPoint[]) => void | Promise<void>) => {
    setActionError(null);
    try {
        if (autoFetchStreets && fetchStreets) {
          const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
          await action(updatedPoints);
        } else {
          await action();
        }
    } catch (err: any) {
        console.error("Export Action Error:", err);
        setActionError("حدث خطأ أثناء التصدير: " + (err).message);
    }
  };

  `;

content = content.substring(0, startExecute) + newExecuteAction + content.substring(endExecute);

// Display error in UI
const returnIndex = content.indexOf('return (');
const spaceY8 = content.indexOf('<div className="space-y-8', returnIndex);
const injectPoint = content.indexOf('>', spaceY8) + 1;

content = content.substring(0, injectPoint) + `\n      {actionError && <div className="p-4 bg-red-500/20 border border-red-500 rounded-2xl text-red-100 font-bold mb-4">{actionError}</div>}` + content.substring(injectPoint);

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log('Added UI error handling');
