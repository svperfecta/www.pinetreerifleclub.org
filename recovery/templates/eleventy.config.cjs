const path = require("node:path");
const fs = require("node:fs");

module.exports = function (eleventyConfig) {
  // Source assets are grouped by type; published paths preserve original URLs.
  const assetMap = JSON.parse(fs.readFileSync("src/_data/assetMap.json", "utf8"));
  for (const [publishedPath, sourcePath] of Object.entries(assetMap)) {
    eleventyConfig.addPassthroughCopy({ [sourcePath]: publishedPath });
  }
  eleventyConfig.addPassthroughCopy({ "src/public": "." });
  eleventyConfig.addPassthroughCopy({ "src/assets/styles/restoration.css": "assets/restoration.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets/styles/legacy.css": "assets/legacy.css" });
  eleventyConfig.addPassthroughCopy({ "src/assets/images/external": "assets/images/external" });
  eleventyConfig.addFilter("relativeTo", (target, pageUrl) => {
    const directory = path.posix.dirname(decodeURIComponent(pageUrl).replace(/^\//, ""));
    return encodeURI(path.posix.relative(directory, target) || "index.html");
  });
  eleventyConfig.addFilter("absoluteUrl", (url, base) => new URL(url.replace(/^\//, ""), base).href);
  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["njk"],
  };
};
