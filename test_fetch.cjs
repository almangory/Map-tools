fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent("https://www.google.com/maps/d/u/0/kml?mid=1zTkwREg9nFEdQXmwHbcjqojecluX72U"))
  .then(res => { console.log(res.status, res.headers.get('content-type')); return res.text(); })
  .then(text => console.log(text.substring(0, 100)))
  .catch(console.error);
