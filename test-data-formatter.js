const p = {
  id: "1",
  attributes: {
    "العنوان": "شارع الملك فهد"
  }
};
const mapRules = { sourceField: "العنوان", defaultValue: "" };
let val = '';
if (p.attributes && p.attributes[mapRules.sourceField] !== undefined) {
   val = p.attributes[mapRules.sourceField];
}
let newAttrs = {};
if (val) {
   newAttrs["INNERDIAMETER"] = val;
} else if (mapRules.defaultValue !== undefined && mapRules.defaultValue !== '') {
   newAttrs["INNERDIAMETER"] = mapRules.defaultValue;
} else {
   newAttrs["INNERDIAMETER"] = '.................................';
}
console.log(newAttrs);
