fetch("http://localhost:3000/api/proxy?url=" + encodeURIComponent("https://www.google.com/maps/d/u/0/kml?mid=INVALID_MID_12345"))
  .then(r => { console.log(r.status); return r.text(); })
  .then(t => console.log(t))
  .catch(console.error);
