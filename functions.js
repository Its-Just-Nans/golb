const { promises: fs, existsSync: eS, createReadStream, createWriteStream, mkdirSync } = require("fs");
const config = require("./config.json");
const path = require("path");
const numberOfSpace = 4;
const pathToProject = __dirname;
const pathToSrc = path.join(pathToProject, config.srcDir);
const pathToBuild = path.join(pathToProject, config.buildDir);
const pathToTemplate = path.join(pathToProject, config.templateDir);

const CleanCSS = require("clean-css");
const showdown = require("showdown");
const showdownKatex = require("showdown-katex");
const showdownHighlight = require("showdown-highlight");
const { default: axios } = require("axios");
const matter = require("gray-matter");
const { readFile } = require("fs/promises");

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

const slugify = (str) => {
    str = str.toLowerCase();
    str = str.replace(/[^a-zA-Z0-9]+/g, "-");
    return str;
};

const makeMenu = async (parentSlug, pathToCheck = pathToSrc) => {
    const navigation = [];
    if (eS(pathToCheck)) {
        const list = await fs.readdir(pathToCheck);
        for (const oneElement of list) {
            const pathToElement = path.join(pathToCheck, oneElement);
            const statOfElement = await fs.lstat(pathToElement);
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

const makeHTMLMenu = (menu, offset = 1, number = 0) => {
    let actualPath = "";
    if (offset == 1) {
        console.log(`making ${actualPath}`);
    }
    const addToHtml = (str, time = offset, lineReturn = true) => {
        return `${" ".repeat(numberOfSpace * time)}${str}${lineReturn ? "\n" : ""}`;
    };
    let html = addToHtml(`<ul>`);
    for (const oneEntry of menu) {
        if (oneEntry.isDir === false) {
            html += addToHtml(
                `<li id="menu-${oneEntry.slug}">
<a href="./${oneEntry.htmlName.replace(".html", "")}">${oneEntry[sidebar_name_key]}</a>
<span></span>
</li>`,
                offset + 1
            );
        } else {
            const menuList = makeHTMLMenu(oneEntry.files, offset + 1, number + 1);
            html += addToHtml(
                `
<div>
    <input type="checkbox" class="hidden toggle input-menu-${oneEntry.slug}" id="menu-control-${number}" />
<div>
<label for="menu-control-${number++}">
    <span>${oneEntry[sidebar_name_key]}</span>
    <span></span>
</label>
</div>
    ${menuList}
</div>`,
                offset + 1
            );
        }
    }
    html += addToHtml("</ul>", offset, false);
    return html;
};

const makeStyleMenu = (menuHtml, oneEntry) => {
    menuHtml = menuHtml.replace(`id="menu-${oneEntry.slug}"`, `id="menu-${oneEntry.slug}" class="selected-menu"`);
    menuHtml = menuHtml.replace(`input-menu-${oneEntry.parentSlug}"`, `input-menu-${oneEntry.parentSlug}" checked`);
    return menuHtml;
};

const buildSingleFile =
    ({ menuHtml, cssLinks, template }) =>
    async (oneEntry) => {
        if (oneEntry.isDir) {
            const builderFunc = buildSingleFile({
                menuHtml,
                cssLinks,
                template,
            });
            await Promise.allSettled(oneEntry.files.map(builderFunc));
            return;
        }
        console.log(`Building ${oneEntry[sidebar_name_key]}`);
        const htmlMenu = `<nav>\n${makeStyleMenu(menuHtml, oneEntry)}\n</nav>`.replace("<ul>", `<ul class="open-nav">`);
        let headData = `${cssLinks}<link rel="canonical" href="https://golb.n4n5.dev/${oneEntry.htmlName.replace(
            ".html",
            ""
        )}" />\n<title>golb | ${oneEntry[sidebar_name_key]}</title>`;
        let fileContent = (await readFileCache(oneEntry.files)).toString();
        let finalFile = "";
        if (oneEntry.files.endsWith(".md")) {
            const { content, data } = matter(fileContent);
            let finalStr = converter.makeHtml(content);
            if (!finalStr.includes("h1")) {
                const title = data.title || oneEntry[sidebar_name_key];
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
        await fs.writeFile(path.join(pathToBuild, oneEntry.htmlName), finalFile);
    };

const build = async (menu) => {
    const cssLinks = (await fs.readFile(path.join(pathToTemplate, "head.html"))).toString();
    const template = (await fs.readFile(path.join(pathToTemplate, "template.html"))).toString();
    const menuHtml = makeHTMLMenu(menu);
    const builderFunc = buildSingleFile({ menuHtml, cssLinks, template });
    await Promise.allSettled(menu.map(builderFunc));
};

const compileCSS = async () => {
    let css = "";
    const CSScompiler = new CleanCSS();
    if (config.cssFile) {
        for (const oneFile of config.cssFile) {
            const filename = oneFile.split("/").pop();
            if (!eS("raws")) {
                mkdirSync("raws");
            }
            const listOfRaws = await fs.readdir("raws");
            let dataCSS = "";
            if (listOfRaws.includes(filename)) {
                dataCSS = await fs.readFile(path.join("raws", filename));
            } else {
                const req = await axios.get(oneFile);
                await fs.writeFile(path.join("raws", filename), req.data);
                dataCSS = req.data;
            }
            css += CSScompiler.minify(dataCSS).styles;
        }
        return;
    }
    const pathToCompiled = path.join(config.buildDir, "style.css");
    for (const oneFile of config.styles) {
        const cssFile = (await fs.readFile(path.join(pathToTemplate, oneFile))).toString();
        css += CSScompiler.minify(cssFile).styles;
    }
    await fs.writeFile(pathToCompiled, css);
};

const moveFile = async () => {
    const array = ["style.css"];
    for (const oneElement of array) {
        const oldPath = path.join(__dirname, config.templateDir, oneElement);
        const goodPath = path.join(__dirname, config.buildDir, oneElement);
        const writeStream = createWriteStream(goodPath);
        createReadStream(oldPath).pipe(writeStream);
    }
};

const copyDataFolder = async () => {
    const list = await fs.readdir(`./${config.srcDir}/`);
    for (const oneFolder of list) {
        const pathFile = path.join(__dirname, config.srcDir, oneFolder);
        const statOfElement = await fs.lstat(pathFile);
        if (statOfElement.isDirectory()) {
            const list2 = await fs.readdir(pathFile);
            for (const oneElement of list2) {
                const pathFile2 = path.join(pathFile, oneElement);
                const statOfElement2 = await fs.lstat(pathFile2);
                if (statOfElement2.isDirectory() && oneElement == "data") {
                    // we move
                    await copyDir(`./${config.srcDir}/${oneFolder}/data`, path.join(config.buildDir, "data"));
                }
            }
        }
    }
};

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    let entries = await fs.readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry[sidebar_name_key]);
        let destPath = path.join(dest, entry[sidebar_name_key]);

        entry.isDirectory() ? await copyDir(srcPath, destPath) : await fs.copyFile(srcPath, destPath);
    }
}

async function copyPublicFolder() {
    await copyDir("./public", path.join(config.buildDir));
}

module.exports = {
    makeMenu,
    makeHTMLMenu,
    build,
    copyDataFolder,
    compileCSS,
    copyPublicFolder,
};
