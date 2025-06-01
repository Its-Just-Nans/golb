const { readdir, readFile } = require("fs/promises");
const { writeFileSync } = require("fs");
const { JSDOM } = require("jsdom");
const lunr = require("lunr");
const { join } = require("path");

const buildSearch = async ({ buildDir }) => {
    const buildFolder = await readdir(buildDir);
    const files = buildFolder.filter((file) => file.endsWith(".html"));

    const cleanupText = (t) => {
        return t.trim().replaceAll("\n\n", "");
    };

    const promises = files.map((filename) => {
        const filepath = join(buildDir, filename);
        return readFile(filepath, "utf-8")
            .then((file) => {
                const dom = new JSDOM(file);
                console.log(`Indexing ${filename}`);
                const pageTitle = dom.window.document
                    .querySelector("#contenuMain")
                    .querySelectorAll("h1")[0].textContent;
                const contents = dom.window.document.querySelector("#contenuMain").querySelectorAll("h2");
                const sections = [...contents].map((h2, index) => {
                    let text = cleanupText(h2.textContent);
                    let next = h2.nextElementSibling;
                    while (next && next.tagName !== "H2") {
                        text += " " + cleanupText(next.textContent);
                        next = next.nextElementSibling;
                    }
                    return {
                        title: h2.textContent.trim(),
                        content: text,
                        url: `${filename}#${h2.id}|${pageTitle} > ${h2.textContent} >`,
                    };
                });
                return sections;
            })
            .catch((err) => {
                console.error(`Error indexing ${filename}: ${err}`);
                // throw err;
                return [];
            });
    });

    const results = await Promise.all(promises);

    const flatResults = results.flat(2);
    const idx = lunr(function () {
        this.ref("url");
        this.field("title");
        this.field("content");

        flatResults.forEach(function (post) {
            this.add(post);
        }, this);
    });

    const searchPath = join(buildDir, "search.json");
    writeFileSync(searchPath, JSON.stringify(idx));
};

module.exports = {
    buildSearch,
};
