const regex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
const str = `<td><img src="..."></td>`;
console.log(regex.exec(str));
console.log(regex.exec(str));
