fetch("http://localhost:3000/api/proxy?url=" + encodeURIComponent("https://www.google.com/maps/d/u/0/kml?mid=1zTkwREg9nFEdQXmwHbcjqojecluX72U"))
  .then(r => { console.log(r.status); return r.text(); })
  .then(t => console.log(t.substring(0, 100)))
  .catch(console.error);
