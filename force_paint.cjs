const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const target = `    if (hasStreetHeader) {
      setLoading(true);
      try {`;

const replacement = `    if (hasStreetHeader) {
      setLoading(true);
      await new Promise(r => setTimeout(r, 100)); // Force UI to paint loading state
      try {`;

content = content.replace(target, replacement);

fs.writeFileSync('App.tsx', content, 'utf8');
console.log("Added force paint");
