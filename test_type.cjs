fetch("https://www.google.com/maps/d/u/0/kml?mid=1zTkwREg9nFEdQXmwHbcjqojecluX72U")
  .then(r => console.log(r.headers.get('content-type')))
  .catch(console.error);
