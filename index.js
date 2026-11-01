// Job Finder — terminal version (also used by the daily scheduled task)
// Usage:
//   node index.js                          -> uses searchKeywords from profile.json
//   node index.js "angular" "react"        -> uses these keywords instead
// Then open the app with: node server.js --open

const { runSearch } = require("./finder");

runSearch(process.argv.slice(2))
  .then(() => console.log("Done. Open the app with: node server.js --open"))
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
