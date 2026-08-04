const fs = require('fs');

let content = fs.readFileSync('components/DataFormatter.tsx', 'utf8');

// Replace executeAction completely
const startExecute = content.indexOf('const executeAction = async (action');
const endExecute = content.indexOf('return (', startExecute);

const newExecuteAction = `const executeAction = async (action: (overridePoints?: GeoPoint[]) => void | Promise<void>) => {
    try {
        if (autoFetchStreets && fetchStreets) {
          const updatedPoints = await fetchStreets(points, ['STREETNAME', 'اسم الشارع', 'DISTRICT', 'الحي']);
          await action(updatedPoints);
        } else {
          await action();
        }
    } catch (err: any) {
        console.error("Export Action Error:", err);
        alert("حدث خطأ أثناء التصدير: " + (err).message);
    }
  };

  `;

content = content.substring(0, startExecute) + newExecuteAction + content.substring(endExecute);

fs.writeFileSync('components/DataFormatter.tsx', content, 'utf8');
console.log('Fixed executeAction');
