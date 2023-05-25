const { promises: fs, existsSync: eS, createReadStream, createWriteStream, mkdirSync } = require("fs");
const config = require("./config.json");
const path = require("path");
const numberOfSpace = 4;
const pathToProject = __dirname;
const pathToSrc = path.join(pathToProject, config.srcDir);
const pathToBuild = path.join(pathToProject, config.buildDir);
const pathToTemplate = path.join(pathToProject, config.templateDir);
const keyword = require("./datas.json");

const CleanCSS = require("clean-css");
const showdown = require("showdown");
const showdownKatex = require("showdown-katex");
const showdownHighlight = require("showdown-highlight");
const { default: axios } = require("axios");
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

const renderMarkdown = (string) => {
    const finalStr = converter.makeHtml(string);
    return finalStr.endsWith("\n") ? finalStr.slice(0, -1) : finalStr;
};

const makeMenu = async (pathToCheck = pathToSrc) => {
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
                const res = await makeMenu(pathToElement);
                navigation.push({
                    name: correctName(oneElement),
                    htmlName: correctHTMLName(oneElement),
                    isDir: true,
                    files: res,
                });
            } else {
                if (
                    pathToElement.endsWith(".git") ||
                    pathToElement.endsWith("LICENSE") ||
                    pathToElement.endsWith("README.md")
                ) {
                    continue;
                }
                navigation.push({
                    name: correctName(oneElement),
                    htmlName: correctHTMLName(oneElement),
                    isDir: false,
                    files: pathToElement,
                });
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

const correctName = (badName) => {
    if (keyword[badName]) {
        badName = keyword[badName];
    } else {
        badName = badName.charAt(0).toUpperCase() + badName.slice(1);
        const lastIndex = badName.lastIndexOf(".");
        badName = lastIndex === -1 ? badName : badName.substring(0, lastIndex);
    }
    return badName;
};

const correctHTMLName = (badName) => {
    badName = badName.toLowerCase();
    const lastIndex = badName.lastIndexOf(".");
    badName = badName.substring(0, lastIndex);
    badName = `${badName}.html`;
    return badName;
};
let number = 0;

const makeHTMLMenu = (menu, actualPath, offset = 1) => {
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
                `<li${
                    oneEntry.files === actualPath ? ` class="coloredMenu"` : ""
                }><a href="./${oneEntry.htmlName.replace(".html", "")}">${oneEntry.name}</a><span></span></li>`,
                offset + 1
            );
        } else {
            const isCorrect = oneEntry.files.findIndex((el) => {
                return el.files === actualPath;
            });
            const menuList = makeHTMLMenu(oneEntry.files, actualPath, offset + 1, isCorrect + 1);
            html += addToHtml(
                `<div><input type="checkbox" class="hidden toggle" ${
                    isCorrect === -1 ? "" : ` checked`
                } id="menu-control-${number}"><div><label for="menu-control-${number++}"><span>${
                    oneEntry.name
                }</span><span></span></label></div>${menuList}</div>`,
                offset + 1
            );
        }
    }
    html += addToHtml("</ul>", offset, false);
    return html;
};

const build = async (menu, completeMenu = menu, variable = {}) => {
    const { dev, files } = variable;
    const prod = !dev;
    const cssLinks = (await fs.readFile(path.join(pathToTemplate, "head.html"))).toString();
    const template = (await fs.readFile(path.join(pathToTemplate, "template.html"))).toString();
    // let indexJS = (await fs.readFile(path.join(pathToTemplate, "index.js"))).toString();
    // if (prod) {
    //     indexJS = UglifyJS.minify(indexJS).code;
    // }
    for (const oneEntry of menu) {
        if (oneEntry.isDir === false) {
            number = 0;
            const htmlMenu = `<nav>\n${makeHTMLMenu(completeMenu, oneEntry.files).slice(4)}\n</nav>`.replace(
                "<ul>",
                `<ul class="open-nav">`
            );
            let data = (await fs.readFile(oneEntry.files)).toString();
            let finalFile = "";
            if (oneEntry.files.endsWith(".md")) {
                const markdown = renderMarkdown(data);
                finalFile = template.replace("<!--FILE-->", markdown);
            } else if (oneEntry.files.endsWith(".html")) {
                finalFile = template.replace("<!--FILE-->", data);
            }
            finalFile = finalFile.replace("<!--TITLE-->", `<title>golb | ${oneEntry.name}</title>`);
            finalFile = finalFile.replace("<head>", `<head>\n${cssLinks}`);
            finalFile = finalFile.replace("<!--MENU-->", htmlMenu);
            //finalFile = finalFile.replace("<!--STYLE-->", `<style> ${styles4} ${styles} ${styles3}</style>`)
            //finalFile = finalFile.replace("<!--SPECIAL_SCRIPT-->", `<script>${indexJS}</script>`)
            await fs.writeFile(path.join(pathToBuild, oneEntry.htmlName), finalFile);
        } else {
            await build(oneEntry.files, completeMenu, { dev });
        }
    }
};

const compileCSS = async () => {
    let css = "";
    const CSScompiler = new CleanCSS();
    for (const oneFile of config.cssFile) {
        var filename = oneFile.split("/").pop();
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
    const pathToCompiled = path.join(config.buildDir, "style.css");
    const cssFile = (await fs.readFile(path.join(pathToTemplate, "style.css"))).toString();
    const cssFile2 = (await fs.readFile(path.join(pathToTemplate, "dark_theme.css"))).toString();
    const cssFile3 = (await fs.readFile(path.join(pathToTemplate, "github_theme.css"))).toString();
    const cssFile4 = (await fs.readFile(path.join(pathToTemplate, "nav.css"))).toString();
    css += CSScompiler.minify(cssFile4).styles;
    css += CSScompiler.minify(cssFile).styles;
    css += CSScompiler.minify(cssFile3).styles;
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
    const list = await fs.readdir("./articles/");
    for (const oneFolder of list) {
        const pathFile = path.join(__dirname, "articles", oneFolder);
        const statOfElement = await fs.lstat(pathFile);
        if (statOfElement.isDirectory()) {
            const list2 = await fs.readdir(pathFile);
            for (const oneElement of list2) {
                const pathFile2 = path.join(pathFile, oneElement);
                const statOfElement2 = await fs.lstat(pathFile2);
                if (statOfElement2.isDirectory() && oneElement == "data") {
                    // we move
                    await copyDir(`./articles/${oneFolder}/data`, path.join(config.buildDir, "data"));
                }
            }
        }
    }
};

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    let entries = await fs.readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        entry.isDirectory() ? await copyDir(srcPath, destPath) : await fs.copyFile(srcPath, destPath);
    }
}

module.exports = {
    makeMenu,
    makeHTMLMenu,
    build,
    copyDataFolder,
    compileCSS,
};
