const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
	<Style id="sn_ylw-pushpin">
		<IconStyle>
			<color>ff0000ff</color>
			<scale>1.1</scale>
			<Icon>
				<href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
			</Icon>
			<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
		</IconStyle>
	</Style>
	<Style id="sh_ylw-pushpin">
		<IconStyle>
			<color>ff0000ff</color>
			<scale>1.3</scale>
			<Icon>
				<href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href>
			</Icon>
			<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
		</IconStyle>
	</Style>
	<StyleMap id="msn_ylw-pushpin">
		<Pair>
			<key>normal</key>
			<styleUrl>#sn_ylw-pushpin</styleUrl>
		</Pair>
		<Pair>
			<key>highlight</key>
			<styleUrl>#sh_ylw-pushpin</styleUrl>
		</Pair>
	</StyleMap>
	<Placemark>
		<name>Test Point</name>
		<styleUrl>#msn_ylw-pushpin</styleUrl>
		<Point>
			<coordinates>46.674,24.712,0</coordinates>
		</Point>
	</Placemark>
</Document>
</kml>`;

const dom = new JSDOM(kmlContent);
const xmlDoc = dom.window.document;

const stylesMap = {};
const iconUrlMap = {};

const styles = xmlDoc.getElementsByTagName("Style");
for (let i = 0; i < styles.length; i++) {
    const id = styles[i].getAttribute("id");
    if (id) {
        const lineStyle = styles[i].getElementsByTagName("LineStyle")[0];
        const lineColor = lineStyle?.getElementsByTagName("color")[0]?.textContent;
        const iconStyle = styles[i].getElementsByTagName("IconStyle")[0];
        const iconColor = iconStyle?.getElementsByTagName("color")[0]?.textContent;
        const polyStyle = styles[i].getElementsByTagName("PolyStyle")[0];
        const polyColor = polyStyle?.getElementsByTagName("color")[0]?.textContent;
        const finalColor = lineColor || iconColor || polyColor;
        
        const iconHref = iconStyle?.getElementsByTagName("Icon")[0]?.getElementsByTagName("href")[0]?.textContent;
        if (iconHref) iconUrlMap[`#${id}`] = iconHref;
        if (finalColor) stylesMap[`#${id}`] = finalColor; // using raw for test
    }
}

const styleMaps = xmlDoc.getElementsByTagName("StyleMap");
for (let i = 0; i < styleMaps.length; i++) {
    const mapId = styleMaps[i].getAttribute("id");
    if (mapId) {
        const pairs = styleMaps[i].getElementsByTagName("Pair");
        for (let j = 0; j < pairs.length; j++) {
            const key = pairs[j].getElementsByTagName("key")[0]?.textContent;
            const styleUrl = pairs[j].getElementsByTagName("styleUrl")[0]?.textContent;
            if (key === 'normal' && styleUrl) {
                if (stylesMap[styleUrl]) stylesMap[`#${mapId}`] = stylesMap[styleUrl];
                if (iconUrlMap[styleUrl]) iconUrlMap[`#${mapId}`] = iconUrlMap[styleUrl];
            }
        }
    }
}

const placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));
placemarks.forEach((pm) => {
    let color = undefined;
    let iconUrl = undefined;
    const styleUrl = pm.getElementsByTagName("styleUrl")[0]?.textContent;
    if (styleUrl) {
        if (stylesMap[styleUrl]) color = stylesMap[styleUrl];
        if (iconUrlMap[styleUrl]) iconUrl = iconUrlMap[styleUrl];
    }
    
    console.log("Placemark:", { styleUrl, color, iconUrl });
});
