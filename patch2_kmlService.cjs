const fs = require('fs');
let content = fs.readFileSync('services/kmlService.ts', 'utf8');

const searchStr1 = `    // 1. الوصف الأساسي
    // Only show original description if we don't have structured attributes, to avoid duplication
    const hasAttributes = (pt.attributes && Object.keys(pt.attributes).length > 0) || (pt.originalRow && headers && headers.length > 0);
    if (pt.description && !hasAttributes) {
        descriptionHTML += \`<div style="font-weight:bold; color:#0e3f53; margin-bottom:10px;">\${pt.description}</div>\`;
    }`;

const replaceStr1 = `    // 1. الوصف الأساسي
    const hasAttributes = (pt.attributes && Object.keys(pt.attributes).length > 0) || (pt.originalRow && headers && headers.length > 0);
    if (pt.description) {
        if (!hasAttributes) {
            descriptionHTML += \`<div style="font-weight:bold; color:#0e3f53; margin-bottom:10px;">\${pt.description}</div>\`;
        } else {
            const images = pt.description.match(/<img[^>]+>/gi);
            if (images) {
                descriptionHTML += \`<div style="margin-bottom:10px; text-align:center;">\${images.join('<br>')}</div>\`;
            }
        }
    }`;

const searchStr2 = `    // 3. جدول البيانات
    if (pt.attributes && Object.keys(pt.attributes).length > 0) {
        descriptionHTML += '<br><div dir="ltr"><table width="100%" border="0" cellpadding="3" cellspacing="1" style="background-color:#99CCFF; font-size:12px; font-family:sans-serif; text-align:left;">';
        Object.entries(pt.attributes).forEach(([key, val]) => {
            descriptionHTML += \`
                <tr bgcolor="#FFFFFF">
                    <td bgcolor="#C0D9F9" style="font-weight:normal; color:#000;">\${escapeXML(key)}</td>
                    <td bgcolor="#E6F2FF" style="color:#000;">\${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                </tr>\`;
        });
        descriptionHTML += '</table></div>';`;

const replaceStr2 = `    // 3. جدول البيانات
    if (pt.attributes && Object.keys(pt.attributes).length > 0) {
        descriptionHTML += '<br><div dir="ltr"><table width="100%" border="0" cellpadding="3" cellspacing="1" style="background-color:#99CCFF; font-size:12px; font-family:sans-serif; text-align:left;">';
        Object.entries(pt.attributes).forEach(([key, val]) => {
            if (selectedHeaders && !selectedHeaders.includes(key)) return;
            descriptionHTML += \`
                <tr bgcolor="#FFFFFF">
                    <td bgcolor="#C0D9F9" style="font-weight:normal; color:#000;">\${escapeXML(key)}</td>
                    <td bgcolor="#E6F2FF" style="color:#000;">\${escapeXML(val !== undefined && val !== null && val !== '' ? String(val) : "-")}</td>
                </tr>\`;
        });
        descriptionHTML += '</table></div>';`;

if (content.includes(searchStr1)) {
    content = content.replace(searchStr1, replaceStr1);
    console.log("Patch 1 applied successfully.");
} else {
    console.log("Could not find searchStr1");
}

if (content.includes(searchStr2)) {
    content = content.replace(searchStr2, replaceStr2);
    console.log("Patch 2 applied successfully.");
} else {
    console.log("Could not find searchStr2");
}

fs.writeFileSync('services/kmlService.ts', content, 'utf8');
