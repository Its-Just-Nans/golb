import { existsSync, mkdirSync } from "node:fs";
import { rm, writeFile, readdir, readFile, lstat, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import showdown from "showdown";
import showdownHighlight from "showdown-highlight";
// @ts-ignore
import lunr from "lunr";

type GolbMatter = {
    sidebar_name?: string;
    keywords?: string[];
    title: string;
    description?: string;
};

type Entry = {
    htmlName: string;
    sidebarName: string;
    slug: string;
    parentSlug: string;
    isDir: boolean;
    path: string;
    content: string;
    data: GolbMatter;
    files?: Entry[];
};

const parseFrontMatter = (inputFile: string, filename: string) => {
    const separator = "---";
    const matterKeySplit = ["keywords"];
    const lines = inputFile.toString().split("\n");
    if (!lines[0] || !lines[0].startsWith(separator)) {
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
    console.log(`Indexing ${entry.data.title}`);
    const out = [];
    const lines = entry.content.split("\n");
    let currSection: null | { title: string; content: Array<string> } = null;
    let code = false;
    for (const oneLine of lines.concat(["#"])) {
        const t = oneLine.trim();
        if (t.startsWith("```")) code = !code;
        let currTitle = null;
        if (!code && oneLine.startsWith("#")) {
            currTitle = oneLine.slice(oneLine.indexOf("# ") + 2);
        }
        if (currTitle !== null) {
            if (currSection)
                out.push({
                    title: currSection.title,
                    content: currSection.content.join("\n"),
                });
            currSection = { title: currTitle, content: [] };
        } else {
            if (!currSection) currSection = { title: "", content: [] };
            currSection.content.push(oneLine);
        }
    }
    return out.map(({ title, content }) => ({
        content,
        data: `${entry.htmlName}#${slugify(title)}|${entry.data.title} > ${title} >`,
    }));
};

const writeIndex = async (indexed: Array<{ content: string; data: string }>, buildDir: string) => {
    const idx = lunr(function () {
        // @ts-ignore
        this.ref("data");
        // @ts-ignore
        this.field("content");

        indexed.forEach(function (post) {
            // @ts-ignore
            this.add(post);
            // @ts-ignore
        }, this);
    });
    const searchPath = join(buildDir, "search.json");
    await writeFile(searchPath, JSON.stringify(idx));
};

const slugify = (str: string) =>
    str
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/gi, "") // remove anything that's not a letter, number, or space
        .trim()
        .replace(/\s+/g, "-"); // convert spaces to hyphens

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
                    htmlName: `${oneElement}.html`, // add extension
                    slug: slug,
                    parentSlug,
                    sidebarName: title,
                    path: pathToElement,
                    content: "",
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
                    htmlName: `${nameNoExt}.html`, // add extension
                    slug: slugify(nameNoExt),
                    content,
                    data,
                    sidebarName: data.sidebar_name || data.title,
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

const makeHTMLMenu = (menu: Entry[], { offset = 1, number = 0, compact = false }) => {
    const defaultSpacing = compact ? "" : null;
    const addToHtml = (str: string, times: number, lineReturn = true) => {
        const numberOfSpace = 4;
        const lineReturned = defaultSpacing == null ? lineReturn : false;
        const addedSpacing = defaultSpacing ?? " ".repeat(numberOfSpace * times);
        return `${addedSpacing}${str}${lineReturned ? "\n" : ""}`;
    };
    let html = addToHtml(`<ul>`, offset + 1, true);
    for (const oneEntry of menu) {
        if (oneEntry.isDir === false) {
            html += addToHtml(`<li id="menu-${oneEntry.slug}">`, offset + 2);
            html += addToHtml(
                `<a href="./${oneEntry.htmlName.replace(".html", "")}">${oneEntry.sidebarName}</a>`,
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
            html += addToHtml(`<span>${oneEntry.sidebarName}</span>`, offset + 4);
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
    const correctMenu = menuHtml
        .replace(`id="menu-${oneEntry.slug}"`, `id="menu-${oneEntry.slug}" class="selected-menu"`)
        .replace(`input-menu-${oneEntry.parentSlug}"`, `input-menu-${oneEntry.parentSlug}" checked`);
    const htmlMenu = `<nav>\n${correctMenu}\n</nav>`.replace("<ul>", `<ul class="open-nav">`);
    const htmlNoExt = oneEntry.htmlName.replace(".html", "");
    let headData = `<link rel="canonical" href="https://golb.n4n5.dev/${htmlNoExt}" />\n<title>golb | ${oneEntry.data.title}</title>`;
    let finalFile = "";
    if (oneEntry.path.endsWith(".md")) {
        const data = oneEntry.data;
        let finalStr = converter.makeHtml(oneEntry.content);
        if (!finalStr.includes("h1")) {
            finalStr = `<h1>${data.title}</h1>\n${finalStr}`;
        }
        const html = finalStr.endsWith("\n") ? finalStr.slice(0, -1) : finalStr;
        finalFile = template.replace("<!--FILE-->", html);
        headData = `${headData}\n<meta name="title" content="${data.title}" />`;
        if (data.description) {
            headData = `${headData}\n<meta name="description" content="${data.description}" />`;
        }
        if (data.keywords) {
            headData = `${headData}\n<meta name="keywords" content="${data.keywords}" />`;
        }
    } else if (oneEntry.path.endsWith(".html")) {
        finalFile = template.replace("<!--FILE-->", oneEntry.content);
    }
    finalFile = finalFile.replace("<!--HEAD-->", headData.split("\n").join(`\n${" ".repeat(4 * 2)}`));
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

const compileCSS = async (
    {
        stylesDir,
        buildDir,
        styles,
        compact,
    }: { stylesDir: string; buildDir: string; styles: Array<string>; compact: boolean },
    outFile: string
) => {
    const css = await Promise.all(
        styles.map((oneFile) =>
            readFile(join(stylesDir, oneFile)).then(
                (fileContent) =>
                    (compact ? "" : `/* ${oneFile} */\n`) +
                    fileContent
                        .toString()
                        .replace(/\s+/g, " ") // collapse whitespace
                        .replace(/\s*([{}:;,])\s*/g, "$1") // remove space around symbols
                        .replace(/;}/g, "}") // remove unnecessary ;
                        .replaceAll("*/", "*/\n")
                        .replaceAll("/*", "\n/*")
                        .trim()
            )
        )
    );
    await writeFile(join(buildDir, outFile), css.join("\n"));
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
        styles: Array<string>;
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
    compileCSS({ compact, stylesDir, styles, buildDir }, "style.css");
    const completeMenu = await makeMenu("", srcDir);
    writeFile("menu.json", JSON.stringify(completeMenu, null, 4));
    const indexed = await build(completeMenu, { buildDir, templateDir, compact });
    writeIndex(indexed, buildDir);
};

main();
