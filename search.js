const { readdir, readFile } = require("fs/promises");
const { writeFileSync } = require("fs");
const { JSDOM } = require("jsdom");
const lunr = require("lunr");

const main = async () => {
    const buildDir = await readdir("build");
    const files = buildDir.filter((file) => file.endsWith(".html"));

    const promises = files.map((filename) => {
        return readFile(`build/${filename}`, "utf-8").then((file) => {
            const dom = new JSDOM(file);
            const title = dom.window.document.querySelector("title");
            const content = dom.window.document
                .querySelector("#contenuMain")
                .textContent.trim()
                .replaceAll("\n\n", "\n")
                .replaceAll("\n", " ");
            return { title: title.textContent, content, url: filename };
        });
    });

    const results = await Promise.all(promises);

    const flatResults = results.flat();
    const idx = lunr(function () {
        this.ref("url");
        this.field("title");
        this.field("content");

        flatResults.forEach(function (post) {
            this.add(post);
        }, this);
    });

    writeFileSync("build/search.json", JSON.stringify(idx));
};

main();
