const fs = require('fs');
let content = fs.readFileSync('services/kmlService.ts', 'utf8');

const searchStr = `    if (pt.attr1) {
        // دعم لبيانات DXF الإضافية
        descriptionHTML += \`<div style="font-size:11px; margin-top:5px;"><b>خصائص إضافية:</b> \${escapeXML(pt.attr1)}</div>\`;
    }

    descriptionHTML += '</div>';`;

const replaceStr = `    if (pt.attr1) {
        // دعم لبيانات DXF الإضافية
        descriptionHTML += \`<div style="font-size:11px; margin-top:5px;"><b>خصائص إضافية:</b> \${escapeXML(pt.attr1)}</div>\`;
    }

    // 3. جدول البيانات
    if (pt.attributes && Object.keys(pt.attributes).length > 0) {
        descriptionHTML += '<br><div dir="ltr"><table width="100%" border="0" cellpadding="3" cellspacing="1" style="background-color:#99CCFF; font-size:12px; font-family:sans-serif; text-align:left;">';
        Object.entries(pt.attributes).forEach(([key, val]) => {
            descriptionHTML += \`
                <tr bgcolor="#FFFFFF">
                    <td bgcolor="#C0D9F9" style="font-weight:normal; color:#000;">\${escapeXML(key)}</td>
                    <td bgcolor="#E6F2FF" style="color:#000;">\${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                </tr>\`;
        });
        descriptionHTML += '</table></div>';
    } else if (pt.originalRow && headers && headers.length > 0) {
        descriptionHTML += '<br><div dir="ltr"><table width="100%" border="0" cellpadding="3" cellspacing="1" style="background-color:#99CCFF; font-size:12px; font-family:sans-serif; text-align:left;">';
        headers.forEach((header, index) => {
            if (selectedHeaders && !selectedHeaders.includes(header)) {
                return;
            }
            const val = pt.originalRow![index];
            descriptionHTML += \`
                <tr bgcolor="#FFFFFF">
                    <td bgcolor="#C0D9F9" style="font-weight:normal; color:#000;">\${escapeXML(header)}</td>
                    <td bgcolor="#E6F2FF" style="color:#000;">\${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                </tr>\`;
        });
        descriptionHTML += '</table></div>';
    }

    descriptionHTML += '</div>';`;

if (content.includes(searchStr)) {
    content = content.replace(searchStr, replaceStr);
    fs.writeFileSync('services/kmlService.ts', content, 'utf8');
    console.log("Patch applied successfully.");
} else {
    console.log("Could not find the target string in kmlService.ts.");
}
