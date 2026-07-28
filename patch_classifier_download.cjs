const fs = require('fs');
let code = fs.readFileSync('components/MapClassifier.tsx', 'utf8');

const oldDownloadKMZ = `
    if (kmzGroupOption === 'name') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'layer' };
    } else if (kmzGroupOption === 'color') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'color' };
    }
`;

const newDownloadKMZ = `
    if (kmzGroupOption === 'name') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'layer' };
    } else if (kmzGroupOption === 'color') {
      exportOptions = { mode: 'attribute', groupByAttribute: 'color' };
    } else if (kmzGroupOption === 'column' && selectedGroupColumn) {
      exportOptions = { mode: 'attribute', groupByColumn: selectedGroupColumn };
    }
`;

code = code.replace(oldDownloadKMZ, newDownloadKMZ);

fs.writeFileSync('components/MapClassifier.tsx', code);
