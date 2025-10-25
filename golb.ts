import { existsSync, mkdirSync } from "node:fs";
import { rm, writeFile, readdir, readFile, lstat, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import showdown from "showdown";
import showdownHighlight from "showdown-highlight";
import lunr from "lunr";

const numberOfSpace = 4;

type GolbMatter = {
    sidebar_name?: string;
    keywords?: string[];
    title: string;
    description?: string;
};

type Entry = {
    htmlName: string;
    slug: string;
    parentSlug: string;
    isDir: boolean;
    path: string;
    content?: string;
    data: GolbMatter;
    files?: Entry[];
};

const parseFrontMatter = (inputFile: string, filename: string) => {
    const separator = "---";
    const matterKeySplit = ["keywords"];
    const lines = inputFile.toString().split("\n");
    if (!lines[0].startsWith(separator)) {
        throw `Head (matter) must be present for ${filename}`;
    }
    let idxMatter = 0;
    for (const oneLine of lines) {
        if (oneLine.startsWith(separator) && idxMatter !== 0) {
            break;
        }
        idxMatter++;
    }
    const data = lines.slice(1, idxMatter).reduce((acc, oneLineTag) => {
        const [key, value] = oneLineTag.split(": ");
        const cleanValue = matterKeySplit.includes(key) ? value.split(", ") : value;
        return {
            [key]: cleanValue,
            ...acc,
        };
    }, {} as GolbMatter);
    if (!data.title) {
        throw `Title must be in head (matter) for ${filename}`;
    }
    const content = lines.slice(idxMatter + 1).join("\n");
    return { content, data };
};

const indexFile = async (entry: Entry) => {
    const cleanupText = (t: string) => {
        return t.trim().replaceAll("\n\n", "");
    };
    if (!entry.content) {
        return [];
    }
    console.log(`Indexing ${entry.data.title}`);
    const out = [];
    const lines = entry.content.split("\n");
    let sec: null | { title: string; content: Array<string> } = null;
    let code = false;

    for (const l of lines) {
        const t = l.trim();
        if (t.startsWith("```")) code = !code;

        let h = null;
        if (!code && l.startsWith("#")) {
            h = l.slice(l.indexOf("# ") + 2);
        }

        if (h) {
            if (sec)
                out.push({
                    title: sec.title,
                    content: sec.content.join("\n"),
                });
            sec = { title: h, content: [] };
        } else {
            if (!sec) sec = { title: "", content: [] };
            sec.content.push(l);
        }
    }
    if (sec) {
        out.push({
            title: sec.title,
            content: sec.content.join("\n"),
        });
    }
    return out.map(({ title, content }) => ({
        content,
        data: `${entry.htmlName}#${slugify(title)}|${entry.data.title} > ${title} >`,
    }));
};

const writeIndex = async (indexed: Array<{ content: string; data: string }>, buildDir: string) => {
    const idx = lunr(function () {
        this.ref("data");
        this.field("content");

        indexed.forEach(function (post) {
            this.add(post);
        }, this);
    });

    const searchPath = join(buildDir, "search.json");
    await writeFile(searchPath, JSON.stringify(idx));
};

const slugify = (str: string) => {
    str = str.toLowerCase();
    str = str.replace(/[^a-zA-Z0-9]+/g, "-");
    return str;
};

const makeMenu = async (parentSlug: string, pathToCheck: string): Promise<Entry[]> => {
    const navigation: Entry[] = [];
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
                const title = oneElement.charAt(0).toUpperCase() + oneElement.slice(1);
                navigation.push({
                    htmlName: correctHTMLName(oneElement),
                    slug: slug,
                    parentSlug,
                    path: pathToElement,
                    isDir: true,
                    data: {
                        title,
                    },
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
                const fileContent = (await readFile(pathToElement)).toString();
                const { data, content } = parseFrontMatter(fileContent, pathToElement);
                const nameNoExt = oneElement.slice(0, oneElement.lastIndexOf("."));
                const entry = {
                    htmlName: correctHTMLName(nameNoExt),
                    slug: slugify(nameNoExt),
                    content,
                    data,
                    parentSlug,
                    path: pathToElement,
                    isDir: false,
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
        return 0;
    });
};

const correctHTMLName = (name: string) => {
    const fullBadNameWithHtml = `${name}.html`;
    return fullBadNameWithHtml;
};

const makeHTMLMenu = (menu: Entry[], { offset = 1, number = 0, compact = false }) => {
    const defaultSpacing = compact ? "" : null;
    const addToHtml = (str: string, times: number, lineReturn = true) => {
        const lineReturned = defaultSpacing == null ? lineReturn : false;
        const addedSpacing = defaultSpacing ?? " ".repeat(numberOfSpace * times);
        return `${addedSpacing}${str}${lineReturned ? "\n" : ""}`;
    };
    let html = addToHtml(`<ul>`, offset + 1, true);
    for (const oneEntry of menu) {
        if (oneEntry.isDir === false) {
            html += addToHtml(`<li id="menu-${oneEntry.slug}">`, offset + 2);
            html += addToHtml(
                `<a href="./${oneEntry.htmlName.replace(".html", "")}">${oneEntry.data.title}</a>`,
                offset + 3
            );
            html += addToHtml(`<span></span>`, offset + 3);
            html += addToHtml(`</li>`, offset + 2);
        } else if (oneEntry.files) {
            const menuList = makeHTMLMenu(oneEntry.files, {
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
            html += addToHtml(`<span>${oneEntry.data.title}</span>`, offset + 4);
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

const makeStyleMenu = (menuHtml: string, oneEntry: Entry) => {
    menuHtml = menuHtml.replace(`id="menu-${oneEntry.slug}"`, `id="menu-${oneEntry.slug}" class="selected-menu"`);
    menuHtml = menuHtml.replace(`input-menu-${oneEntry.parentSlug}"`, `input-menu-${oneEntry.parentSlug}" checked`);
    return menuHtml;
};

const buildSingleFile = async (
    {
        menuHtml,
        template,
        buildDir,
        converter,
    }: { menuHtml: string; template: string; buildDir: string; converter: any },
    oneEntry: Entry
): Promise<Array<{ fileWritten: string; dataIndexed: Array<{ content: string; data: string }> }>> => {
    console.log(`Building ${oneEntry.data.title}`);
    if (oneEntry.isDir && oneEntry.files) {
        const promises = oneEntry.files.map((subEntry) =>
            buildSingleFile({ menuHtml, template, buildDir, converter }, subEntry)
        );
        return (await Promise.all(promises)).flat();
    }
    if (!oneEntry.content) {
        throw "Missing content";
    }
    const htmlMenu = `<nav>\n${makeStyleMenu(menuHtml, oneEntry)}\n</nav>`.replace("<ul>", `<ul class="open-nav">`);
    let headData = `<link rel="canonical" href="https://golb.n4n5.dev/${oneEntry.htmlName.replace(
        ".html",
        ""
    )}" />\n<title>golb | ${oneEntry.data.title}</title>`;
    let fileContent = oneEntry.content;
    let finalFile = "";
    if (oneEntry.path.endsWith(".md")) {
        const data = oneEntry.data;
        let finalStr = converter.makeHtml(fileContent);
        if (!finalStr.includes("h1")) {
            const title = data.title || oneEntry.data.title;
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
    } else if (oneEntry.path.endsWith(".html")) {
        finalFile = template.replace("<!--FILE-->", fileContent);
    }
    finalFile = finalFile.replace("<!--HEAD-->", headData.split("\n").join("\n        "));
    finalFile = finalFile.replace("<!--MENU-->", htmlMenu);
    const outFile = join(buildDir, oneEntry.htmlName);
    const res = await Promise.all([
        writeFile(outFile, finalFile).then(() => ({ fileWritten: outFile })),
        indexFile(oneEntry).then((dataIndexed) => ({ dataIndexed })),
    ]);
    return [Object.assign({}, ...res)];
};

const build = async (
    menu: Entry[],
    { buildDir, templateDir, compact }: { buildDir: string; templateDir: string; compact: boolean }
) => {
    const template = (await readFile(join(templateDir, "template.html"))).toString();
    const menuHtml = makeHTMLMenu(menu, { compact });
    const converter = new showdown.Converter({
        openLinksInNewWindow: true,
        extensions: [showdownHighlight({})],
    });
    converter.setFlavor("github");
    const results = (
        await Promise.all(
            menu.map((oneEntry) => buildSingleFile({ menuHtml, template, buildDir, converter }, oneEntry))
        )
    ).flat();
    return results.map((r) => r.dataIndexed).flat();
};

function minifyCSS(css: string) {
    return css
        .replace(/\s+/g, " ") // collapse whitespace
        .replace(/\s*([{}:;,])\s*/g, "$1") // remove space around symbols
        .replace(/;}/g, "}") // remove unnecessary ;
        .replaceAll("*/", "*/\n")
        .replaceAll("/*", "\n/*")
        .trim();
}

const compileCSS = async (
    { stylesDir, buildDir, styles }: { stylesDir: string; buildDir: string; styles: string },
    outFile: string
) => {
    let css = "";
    const pathToCompiled = join(buildDir, outFile);
    for (const oneFile of styles) {
        const cssFile = (await readFile(join(stylesDir, oneFile))).toString();
        css += minifyCSS(cssFile);
    }
    await writeFile(pathToCompiled, css);
};

const copyDataFolder = async (srcDir: string, buildDir: string) => {
    const list = await readdir(srcDir);
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

async function copyDir(src: string, dest: string) {
    await mkdir(dest, { recursive: true });
    let entries = await readdir(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = join(src, entry.name);
        let destPath = join(dest, entry.name);

        entry.isDirectory() ? await copyDir(srcPath, destPath) : await copyFile(srcPath, destPath);
    }
}

const downloadExternalFiles = async (buildDir: string, externalFiles: Map<string, string>) => {
    const downloadSingleFile = async ([oneUrl, outputPath]: [string, string]) => {
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
    const config = JSON.parse(configFile) as {
        buildDir: string;
        templateDir: string;
        publicDir: string;
        srcDir: string;
        styles: string;
        stylesDir: string;
        externalFiles: Map<string, string>;
    };
    const { buildDir, templateDir, publicDir, srcDir, styles, stylesDir, externalFiles } = config;
    await rm(buildDir, { recursive: true, force: true });
    if (!existsSync(buildDir)) {
        mkdirSync(buildDir);
    }
    copyDir(publicDir, join(buildDir));
    copyDataFolder(srcDir, buildDir);
    downloadExternalFiles(buildDir, externalFiles);
    compileCSS({ stylesDir, styles, buildDir }, "style.css");
    const completeMenu = await makeMenu("", srcDir);
    writeFile("menu.json", JSON.stringify(completeMenu, null, 4));
    const indexed = await build(completeMenu, { buildDir, templateDir, compact });
    writeIndex(indexed, buildDir);
    // await buildSearch(buildDir);
};

main();
