const fs = require('fs');
let code = fs.readFileSync('components/MapPreview.tsx', 'utf8');

const oldHtml = `html: \`<div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                       <div style="width:100%; height:100%; background-color:\${featColor}; -webkit-mask-image: url('\${safeUrl}'); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-image: url('\${safeUrl}'); mask-size: contain; mask-repeat: no-repeat; mask-position: center;"></div>
                     </div>\`,`;

const newHtml = `html: \`<div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                       <img src="\${safeUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                       <div style="display:none; width:14px; height:14px; background-color:\${featColor || '#3b82f6'}; border:2px solid \${isOverlap ? '#000000' : '#fff'}; border-radius:50%;"></div>
                     </div>\`,`;

if (code.includes(oldHtml)) {
    code = code.replace(oldHtml, newHtml);
    fs.writeFileSync('components/MapPreview.tsx', code);
    console.log("Reverted CSS mask in MapPreview");
} else {
    console.log("Could not find oldHtml in MapPreview");
}
