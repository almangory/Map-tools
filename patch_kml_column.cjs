const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

const oldCheck = `
          if (options.groupByColumn && pt.originalRow && headers) {
              const colIdx = headers.indexOf(options.groupByColumn);
              if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                  key = String(pt.originalRow[colIdx]).trim() || 'Default';
              } else {
                  key = 'غير مصنف (Unclassified)';
              }
          }
`;

const newCheck = `
          if (options.groupByColumn) {
              if (pt.originalRow && headers) {
                  const colIdx = headers.indexOf(options.groupByColumn);
                  if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                      key = String(pt.originalRow[colIdx]).trim() || 'Default';
                  } else {
                      key = 'غير مصنف (Unclassified)';
                  }
              } else if (pt.attributes && pt.attributes[options.groupByColumn]) {
                  key = String(pt.attributes[options.groupByColumn]).trim() || 'Default';
              } else {
                  key = 'غير مصنف (Unclassified)';
              }
          }
`;

code = code.replace(oldCheck, newCheck);

const oldCheck2 = `
            if (options.groupByColumn && pt.originalRow && headers) {
                const colIdx = headers.indexOf(options.groupByColumn);
                if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                    key = String(pt.originalRow[colIdx]).trim() || 'Default';
                } else {
                    key = 'غير مصنف (Unclassified)';
                }
            }
`;
const newCheck2 = `
            if (options.groupByColumn) {
                if (pt.originalRow && headers) {
                    const colIdx = headers.indexOf(options.groupByColumn);
                    if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                        key = String(pt.originalRow[colIdx]).trim() || 'Default';
                    } else {
                        key = 'غير مصنف (Unclassified)';
                    }
                } else if (pt.attributes && pt.attributes[options.groupByColumn]) {
                    key = String(pt.attributes[options.groupByColumn]).trim() || 'Default';
                } else {
                    key = 'غير مصنف (Unclassified)';
                }
            }
`;

code = code.replace(oldCheck2, newCheck2);

fs.writeFileSync('services/kmlService.ts', code);
