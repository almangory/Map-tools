const fs = require('fs');
let code = fs.readFileSync('services/kmlService.ts', 'utf8');

const regex1 = /if \(options\.groupByColumn && pt\.originalRow && headers\) \{\s+const colIdx = headers\.indexOf\(options\.groupByColumn\);\s+if \(colIdx !== -1 && pt\.originalRow\[colIdx\] !== undefined && pt\.originalRow\[colIdx\] !== null && pt\.originalRow\[colIdx\] !== ''\) \{\s+key = String\(pt\.originalRow\[colIdx\]\)\.trim\(\) \|\| 'Default';\s+\} else \{\s+key = 'غير مصنف \\(Unclassified\\)';\s+\}\s+\}/g;

const replacement = `if (options.groupByColumn) {
              if (pt.originalRow && headers) {
                  const colIdx = headers.indexOf(options.groupByColumn);
                  if (colIdx !== -1 && pt.originalRow[colIdx] !== undefined && pt.originalRow[colIdx] !== null && pt.originalRow[colIdx] !== '') {
                      key = String(pt.originalRow[colIdx]).trim() || 'Default';
                  } else {
                      key = 'غير مصنف (Unclassified)';
                  }
              } else if (pt.attributes && pt.attributes[options.groupByColumn] !== undefined && pt.attributes[options.groupByColumn] !== null && pt.attributes[options.groupByColumn] !== '') {
                  key = String(pt.attributes[options.groupByColumn]).trim() || 'Default';
              } else {
                  key = 'غير مصنف (Unclassified)';
              }
          }`;

code = code.replace(regex1, replacement);

fs.writeFileSync('services/kmlService.ts', code);
