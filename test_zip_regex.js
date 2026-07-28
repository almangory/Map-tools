const kml = `<Icon><href>images/icon.png</href></Icon><Icon><href>icon.png</href></Icon>`;
const imgName = 'images/icon.png';
const safeName = imgName.split('/').pop();
console.log(kml.replace(new RegExp(`<href>[^<]*?${safeName}</href>`, 'gi'), `<href>DATA_URI</href>`));
