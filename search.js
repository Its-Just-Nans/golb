const { readdir, readFile } = require("fs/promises");
const { writeFileSync } = require("fs");
const { JSDOM } = require("jsdom");
const lunr = require("lunr");

const main = async () => {
    const buildDir = await readdir("build");
    const files = buildDir.filter((file) => file.endsWith(".html"));

    const cleanupText = (t) => {
        return t.trim().replaceAll("\n", "");
    };

    const promises = files.map((filename) => {
        return readFile(`build/${filename}`, "utf-8").then((file) => {
            const dom = new JSDOM(file);
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
                    url: `${filename}#${h2.id}`,
                };
            });
            return sections;
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

    writeFileSync("build/search.json", JSON.stringify(idx));
};

main();
