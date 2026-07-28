const fs = require('fs');
let code = fs.readFileSync('components/MapPreview.tsx', 'utf8');

const oldBlock = `        } else {
          if (pt.iconUrl) {
            const customIcon = L.icon({
              iconUrl: pt.iconUrl,
              iconSize: [28, 28],
              iconAnchor: [14, 28],
              popupAnchor: [0, -28]
            });
            marker = L.marker([pt.y, pt.x], { icon: customIcon });
          } else {
            marker = L.circleMarker([pt.y, pt.x], { radius: isOverlap ? 10 : 7, fillColor: isOverlap ? '#9c27b0' : featColor, color: isOverlap ? '#000000' : '#fff', weight: isOverlap ? 4 : 2, fillOpacity: 1 });
          }
        }`;

const newBlock = `        } else {
          if (pt.iconUrl) {
            let safeUrl = pt.iconUrl;
            if (safeUrl.startsWith('http://')) safeUrl = safeUrl.replace('http://', 'https://');
            const customIcon = L.divIcon({
              className: 'bg-transparent border-0',
              html: \`<div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                       <img src="\${safeUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                       <div style="display:none; width:14px; height:14px; background-color:\${featColor}; border:2px solid \${isOverlap ? '#000000' : '#fff'}; border-radius:50%;"></div>
                     </div>\`,
              iconSize: [28, 28],
              iconAnchor: [14, 28],
              popupAnchor: [0, -28]
            });
            marker = L.marker([pt.y, pt.x], { icon: customIcon });
          } else {
            marker = L.circleMarker([pt.y, pt.x], { radius: isOverlap ? 10 : 7, fillColor: isOverlap ? '#9c27b0' : featColor, color: isOverlap ? '#000000' : '#fff', weight: isOverlap ? 4 : 2, fillOpacity: 1 });
          }
        }`;

if (code.includes(oldBlock)) {
    code = code.replace(oldBlock, newBlock);
    fs.writeFileSync('components/MapPreview.tsx', code);
    console.log('Successfully patched MapPreview');
} else {
    console.log('Failed to find old block in MapPreview');
}
