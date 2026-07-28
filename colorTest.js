function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function colorDistance(color1, color2) {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    if(!c1 || !c2) return Infinity;
    return Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2)
    );
}

const STANDARD_COLORS = [
    { name: 'Water', hex: '#01579B' },
    { name: 'Wastewater', hex: '#097138' },
    { name: 'Work in Progress', hex: '#ffea00' },
    { name: 'Remaining Works', hex: '#a52714' }
];

function getClosestStandardColor(hex) {
    if (!hex) return null;
    let minDistance = Infinity;
    let closest = null;
    
    for (const std of STANDARD_COLORS) {
        const dist = colorDistance(hex, std.hex);
        if (dist < minDistance) {
            minDistance = dist;
            closest = std.hex;
        }
    }
    return closest;
}

console.log(getClosestStandardColor('#0000ff'));
console.log(getClosestStandardColor('#ff0000'));
console.log(getClosestStandardColor('#00ff00'));
console.log(getClosestStandardColor('#ffff00'));
