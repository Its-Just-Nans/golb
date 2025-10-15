import { existsSync, mkdirSync } from "node:fs";
import { rm, writeFile, readdir, readFile, lstat, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import CleanCSS from "clean-css";
import showdown from "showdown";
import showdownKatex from "showdown-katex";
import showdownHighlight from "showdown-highlight";
import matter from "gray-matter";
import { JSDOM } from "jsdom";
import lunr from "lunr";

const numberOfSpace = 4;
const sidebar_name_key = "sidebar_name";
const fileCache = new Map();

const readFileCache = async (filePath) => {
    if (fileCache.has(filePath)) {
        return fileCache.get(filePath);
    }
    const data = await readFile(filePath);
    fileCache.set(filePath, data);
    return data;
};

const converter = new showdown.Converter({
    openLinksInNewWindow: true,
    extensions: [
        showdownKatex({
            throwOnError: true,
            displayMode: false,
        }),
        showdownHighlight(),
    ],
});
converter.setFlavor("github");

export const buildSearch = async ({ buildDir }) => {
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
                const contentMain = dom.window.document.querySelector("#contenuMain");
                const pageTitle = contentMain.querySelectorAll("h1")[0].textContent;
                const contents = contentMain.querySelectorAll("h2");
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
    await writeFile(searchPath, JSON.stringify(idx));
};

const slugify = (str) => {
    str = str.toLowerCase();
    str = str.replace(/[^a-zA-Z0-9]+/g, "-");
    return str;
};

const makeMenu = async (parentSlug, pathToCheck) => {
    const navigation = [];
    if (existsSync(pathToCheck)) {
        const list = await readdir(pathToCheck);
        for (const oneElement of list) {
            const pathToElement = join(pathToCheck, oneElement);
            const statOfElement = await lstat(pathToElement);
            if (statOfElement.isDirectory()) {
                if (["data", ".git"].includes(oneElement)) {
                    continue;
                }
                const slug = slugify(oneElement);
                const res = await makeMenu(slug, pathToElement);
                navigation.push({
                    name: correctName(oneElement),
                    htmlName: correctHTMLName(oneElement),
                    slug: slug,
                    isDir: true,
                    files: res,
                });
            } else {
                const content = await readFileCache(pathToElement);
                const { data } = matter(content);

                if (
                    pathToElement.endsWith(".git") ||
                    pathToElement.endsWith("LICENSE") ||
                    pathToElement.endsWith("README.md")
                ) {
                    continue;
                }
                const nameNoExt = oneElement.slice(0, oneElement.lastIndexOf("."));
                const name = data[sidebar_name_key] || correctName(oneElement);
                const entry = {
                    name,
                    htmlName: correctHTMLName(nameNoExt),
                    slug: slugify(nameNoExt),
                    parentSlug,
                    isDir: false,
                    files: pathToElement,
                };
                navigation.push(entry);
            }
        }
    }
    return navigation.sort((a, b) => {
        if (a.htmlName === "index.html") {
            return -1;
        } else if (b.htmlName === "index.html") {
            return 1;
        }
        if (a.isDir && b.isDir) {
            return 0;
        } else if (a.isDir && !b.isDir) {
            return 1;
        } else if (!a.isDir && b.isDir) {
            return -1;
        } else if (!a.isDir && !b.isDir) {
            return 0;
        }
    });
};

const correctName = (name) => {
    const badName = name.charAt(0).toUpperCase() + name.slice(1);
    const lastIndex = badName.lastIndexOf(".");
    return lastIndex === -1 ? badName : badName.substring(0, lastIndex);
};

const correctHTMLName = (name) => {
    const fullBadNameWithHtml = `${name}.html`;
    return fullBadNameWithHtml;
};

const makeHTMLMenu = ({ menu, offset = 1, number = 0, compact = null }) => {
    const defaultSpacing = compact ? "" : null;
    const addToHtml = (str, times, lineReturn = true) => {
        const lineReturned = defaultSpacing == null ? lineReturn : false;
        const addedSpacing = defaultSpacing ?? " ".repeat(numberOfSpace * times);
        return `${addedSpacing}${str}${lineReturned ? "\n" : ""}`;
    };
    let html = addToHtml(`<ul>`, offset + 1, true);
    for (const oneEntry of menu) {
        if (oneEntry.isDir === false) {
            html += addToHtml(`<li id="menu-${oneEntry.slug}">`, offset + 2);
            html += addToHtml(`<a href="./${oneEntry.htmlName.replace(".html", "")}">${oneEntry.name}</a>`, offset + 3);
            html += addToHtml(`<span></span>`, offset + 3);
            html += addToHtml(`</li>`, offset + 2);
        } else {
            const menuList = makeHTMLMenu({
                menu: oneEntry.files,
                offset: offset + 1,
                number: number + 1,
                compact,
            });
            html += compact ? "\n" : "";
            html += addToHtml("<div>", offset + 1);
            html += addToHtml(
                `<input type="checkbox" class="hidden toggle input-menu-${oneEntry.slug}" id="menu-control-${number}" />`,
                offset + 2
            );
            html += addToHtml("<div>", offset + 2);
            html += addToHtml(`<label for="menu-control-${number++}">`, offset + 3);
            html += addToHtml(`<span>${oneEntry.name}</span>`, offset + 4);
            html += addToHtml("<button class='menu-button'></button>", offset + 4);
            html += addToHtml("</label>", offset + 3);
            html += addToHtml("</div>", offset + 2);
            html += addToHtml(menuList, offset + 2);
            html += addToHtml(`</div>`, offset + 1);
        }
    }
    html += addToHtml("</ul>", offset + 1, false);
    return html;
};

const makeStyleMenu = (menuHtml, oneEntry) => {
    menuHtml = menuHtml.replace(`id="menu-${oneEntry.slug}"`, `id="menu-${oneEntry.slug}" class="selected-menu"`);
    menuHtml = menuHtml.replace(`input-menu-${oneEntry.parentSlug}"`, `input-menu-${oneEntry.parentSlug}" checked`);
    return menuHtml;
};

const buildSingleFile = async ({ menuHtml, cssLinks, template, buildDir }, oneEntry) => {
    if (oneEntry.isDir) {
        const promises = oneEntry.files.map((subEntry) =>
            buildSingleFile({ menuHtml, cssLinks, template, buildDir }, subEntry)
        );
        await Promise.allSettled(promises);
        return;
    }
    console.log(`Building ${oneEntry.name}`);
    const htmlMenu = `<nav>\n${makeStyleMenu(menuHtml, oneEntry)}\n</nav>`.replace("<ul>", `<ul class="open-nav">`);
    let headData = `${cssLinks}<link rel="canonical" href="https://golb.n4n5.dev/${oneEntry.htmlName.replace(
        ".html",
        ""
    )}" />\n<title>golb | ${oneEntry.name}</title>`;
    let fileContent = (await readFileCache(oneEntry.files)).toString();
    let finalFile = "";
    if (oneEntry.files.endsWith(".md")) {
        const { content, data } = matter(fileContent);
        let finalStr = converter.makeHtml(content);
        if (!finalStr.includes("h1")) {
            const title = data.title || oneEntry.name;
            finalStr = `<h1>${title}</h1>\n${finalStr}`;
        }
        const html = finalStr.endsWith("\n") ? finalStr.slice(0, -1) : finalStr;
        finalFile = template.replace("<!--FILE-->", html);
        if (data.title) {
            headData = `${headData}\n<meta name="title" content="${data.title}" />`;
        }
        if (data.description) {
            headData = `${headData}\n<meta name="description" content="${data.description}" />`;
        }
        if (data.keywords) {
            headData = `${headData}\n<meta name="keywords" content="${data.keywords}" />`;
        }
    } else if (oneEntry.files.endsWith(".html")) {
        finalFile = template.replace("<!--FILE-->", fileContent);
    }
    finalFile = finalFile.replace("<!--HEAD-->", headData.split("\n").join("\n        "));
    finalFile = finalFile.replace("<!--MENU-->", htmlMenu);
    await writeFile(join(buildDir, oneEntry.htmlName), finalFile);
};

const build = async (menu, { buildDir, templateDir, compact }) => {
    const cssLinks = (await readFile(join(templateDir, "head.html"))).toString();
    const template = (await readFile(join(templateDir, "template.html"))).toString();
    const menuHtml = makeHTMLMenu({ menu, compact });
    await Promise.allSettled(
        menu.map((oneEntry) => buildSingleFile({ menuHtml, cssLinks, template, buildDir }, oneEntry))
    );
};

const compileCSS = async ({ cssFile, templateDir, buildDir, styles }, outFile) => {
    let css = "";
    const CSScompiler = new CleanCSS();
    if (cssFile) {
        for (const oneFile of cssFile) {
            const filename = oneFile.split("/").pop();
            if (!existsSync("raws")) {
                mkdirSync("raws");
            }
            const listOfRaws = await readdir("raws");
            let dataCSS = "";
            if (listOfRaws.includes(filename)) {
                dataCSS = await readFile(join("raws", filename));
            } else {
                const req = await fetch(oneFile);
                const txt = await req.text();
                await writeFile(join("raws", filename), txt);
                dataCSS = txt;
            }
            css += CSScompiler.minify(dataCSS).styles;
        }
    }
    const pathToCompiled = join(buildDir, outFile);
    for (const oneFile of styles) {
        const cssFile = (await readFile(join(templateDir, oneFile))).toString();
        css += CSScompiler.minify(cssFile).styles;
    }
    await writeFile(pathToCompiled, css);
};

const copyDataFolder = async ({ srcDir, buildDir }) => {
    const list = await readdir(`./${srcDir}/`);
    for (const oneFolder of list) {
        const pathFile = join(srcDir, oneFolder);
        const statOfElement = await lstat(pathFile);
        if (statOfElement.isDirectory()) {
            const list2 = await readdir(pathFile);
            for (const oneElement of list2) {
                const pathFile2 = join(pathFile, oneElement);
                const statOfElement2 = await lstat(pathFile2);
                if (statOfElement2.isDirectory() && oneElement == "data") {
                    const inputDir = join(srcDir, oneFolder, "data");
                    const outputDir = join(buildDir, "data");
                    // we move
                    await copyDir(inputDir, outputDir);
                }
            }
        }
    }
};

async function copyDir(src, dest) {
    await mkdir(dest, { recursive: true });
    let entries = await readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = join(src, entry.name);
        let destPath = join(dest, entry.name);

        entry.isDirectory() ? await copyDir(srcPath, destPath) : await copyFile(srcPath, destPath);
    }
}

const downloadExternalFiles = async ({ buildDir, externalFiles }) => {
    const downloadSingleFile = async ([oneUrl, outputPath]) => {
        const file = await fetch(oneUrl);
        const content = await file.arrayBuffer();
        const output = join(buildDir, outputPath);
        if (!existsSync(dirname(output))) {
            mkdirSync(dirname(output), { recursive: true });
        }
        await writeFile(output, Buffer.from(content));
        console.log(`Downloaded ${oneUrl} to ${outputPath}`);
    };
    const promises = Object.entries(externalFiles).map(downloadSingleFile);
    await Promise.all(promises);
    console.log("All external files downloaded");
};

const main = async () => {
    const compact = process.argv.some((arg) => ["--prod"].includes(arg));
    const configFile = (await readFile("./config.json")).toString();
    const config = JSON.parse(configFile);
    const { buildDir, templateDir, publicDir, srcDir, cssFile, styles, externalFiles } = config;
    await rm(config.buildDir, { recursive: true, force: true });
    if (!existsSync(config.buildDir)) {
        mkdirSync(config.buildDir);
    }
    copyDir(publicDir, join(buildDir));
    copyDataFolder({ srcDir, buildDir });
    downloadExternalFiles({ buildDir, externalFiles });
    compileCSS({ templateDir, cssFile, styles, buildDir }, "style.css");
    const completeMenu = await makeMenu("", srcDir);
    writeFile("menu.json", JSON.stringify(completeMenu, null, 4));
    await build(completeMenu, { buildDir, templateDir, compact });
    await buildSearch({ buildDir: config.buildDir });
};

main();
