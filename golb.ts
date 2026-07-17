import { existsSync, mkdirSync } from "node:fs";
import { rm, writeFile, readdir, readFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import markdownit from 'markdown-it'
import hljs from 'highlight.js' // https://highlightjs.org
// @ts-ignore
import lunr from "lunr";

type GolbMatter = {
    sidebar_name?: string;
    keywords?: Array<string>;
    title: string;
    description?: string;
};

type MenuEntry = {
    htmlName: string;
    sidebarName: string;
    slug: string;
    parentSlug: string;
    filePath: string;
    content: string;
    data: GolbMatter;
    files: Array<MenuEntry> | null;
};

interface GolbConfig {
    buildDir: string;
    templateDir: string;
    publicDir: string;
    srcDir: string;
    styles: Array<string>;
    stylesDir: string;
    externalFiles: Map<string, string>;
}

const parseFrontMatter = (inputFile: string, filename: string) => {
    const separator = "---";
    const lines = inputFile.toString().split("\n");
    if (!lines[0] || !lines[0].startsWith(separator)) {
        throw `Frontmatter must be present for ${filename}`;
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
        const cleanValue = ["keywords"].includes(key) ? value.split(", ") : value;
        return {
            [key]: cleanValue,
            ...acc,
        };
    }, {} as GolbMatter);
    if (!data.title) {
        throw `'title: ' must be in head frontmatter for ${filename}`;
    }
    const content = lines.slice(idxMatter + 1).join("\n");
    return { content, data };
};

const indexFile = async (entry: MenuEntry) => {
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

const makeMenu = async (parentSlug: string, pathToCheck: string, buildDir: string): Promise<Array<MenuEntry>> => {
    const navigation: Array<MenuEntry> = [];
    if (existsSync(pathToCheck)) {
        const list = await readdir(pathToCheck, { withFileTypes: true });
        for (const dirEntry of list) {
            const oneElement = dirEntry.name;
            const pathToElement = join(pathToCheck, oneElement);
            if (dirEntry.isDirectory()) {
                if (["data", ".git"].includes(oneElement)) {
                    if (oneElement == "data") {
                        copyDir(pathToElement, join(buildDir, "data"));
                    }
                    continue;
                }
                const slug = slugify(oneElement);
                const res = await makeMenu(slug, pathToElement, buildDir);
                const title = oneElement.charAt(0).toUpperCase() + oneElement.slice(1);
                navigation.push({
                    htmlName: `${oneElement}.html`, // add extension
                    slug: slug,
                    parentSlug,
                    sidebarName: title,
                    filePath: pathToElement,
                    content: "",
                    data: {
                        title,
                    },
                    files: res,
                });
            } else {
                if (["README.md"].includes(oneElement)) {
                    continue;
                }
                const fileContent = (await readFile(pathToElement)).toString();
                const { data, content } = parseFrontMatter(fileContent, pathToElement);
                const nameNoExt = oneElement.slice(0, oneElement.lastIndexOf("."));
                const sidebarName = data.sidebar_name || data.title;
                const entry = {
                    htmlName: `${nameNoExt}.html`, // add extension
                    slug: slugify(nameNoExt),
                    content,
                    data,
                    sidebarName,
                    parentSlug,
                    filePath: pathToElement,
                    files: null,
                };
                navigation.push(entry);
            }
        }
    }
    return navigation.sort((a, b) => {
        const aIsDir = a.files !== null;
        const bIsDir = b.files !== null;
        if (a.htmlName === "index.html") {
            return -1;
        } else if (b.htmlName === "index.html") {
            return 1;
        }
        if (aIsDir && bIsDir) {
            return 0;
        } else if (aIsDir && !bIsDir) {
            return 1;
        } else if (!aIsDir && bIsDir) {
            return -1;
        } else if (!aIsDir && !bIsDir) {
            return 0;
        }
        return 0;
    });
};

const makeHTMLMenu = (menu: Array<MenuEntry>, { offset = 1, number = 0, compact = false, linkHtml = false }) => {
    const defaultSpacing = compact ? "" : null;
    const addToHtml = (str: string, times: number, lineReturn = true) => {
        const numberOfSpace = 4;
        const lineReturned = defaultSpacing == null ? lineReturn : false;
        const addedSpacing = defaultSpacing ?? " ".repeat(numberOfSpace * times);
        return `${addedSpacing}${str}${lineReturned ? "\n" : ""}`;
    };
    let html = [addToHtml(`<ul>`, offset + 1, true)];
    for (const oneEntry of menu) {
        if (oneEntry.files === null) {
            html.push(addToHtml(`<li id="menu-${oneEntry.slug}">`, offset + 2));
            const htmlLink = linkHtml ? oneEntry.htmlName : oneEntry.htmlName.replace(".html", "");
            html.push(addToHtml(
                `<a href="./${htmlLink}">${oneEntry.sidebarName}</a>`,
                offset + 3
            ));
            html.push(addToHtml(`<span></span>`, offset + 3));
            html.push(addToHtml(`</li>`, offset + 2));
        } else if (oneEntry.files) {
            const menuList = makeHTMLMenu(oneEntry.files, {
                offset: offset + 1,
                number: number + 1,
                compact,
                linkHtml,
            });
            html.push(compact ? "\n" : "");
            html.push(addToHtml("<div>", offset + 1));
            html.push(addToHtml(
                `<input type="checkbox" class="hidden toggle input-menu-${oneEntry.slug}" id="menu-control-${number}" />`,
                offset + 2
            ));
            html.push(addToHtml("<div>", offset + 2));
            html.push(addToHtml(`<label for="menu-control-${number++}">`, offset + 3));
            html.push(addToHtml(`<span>${oneEntry.sidebarName}</span>`, offset + 4));
            html.push(addToHtml("<button class='menu-button'></button>", offset + 4));
            html.push(addToHtml("</label>", offset + 3));
            html.push(addToHtml("</div>", offset + 2));
            html.push(addToHtml(menuList, offset + 2));
            html.push(addToHtml(`</div>`, offset + 1));
        }
    }
    html.push(addToHtml("</ul>", offset + 1, false));
    return html.join("");
};

const buildSingleFile = async (
    {
        menuHtml,
        template,
        buildDir,
        converter,
    }: { menuHtml: string; template: string; buildDir: string; converter: any },
    oneEntry: MenuEntry
): Promise<Array<{ fileWritten: string; dataIndexed: Array<{ content: string; data: string }> }>> => {
    console.log(`Building and indexing '${oneEntry.data.title}'`);
    if (oneEntry.files !== null) {
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
    if (oneEntry.filePath.endsWith(".md")) {
        const data = oneEntry.data;
        let finalStr = converter.render(oneEntry.content);
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
    } else if (oneEntry.filePath.endsWith(".html")) {
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
    menu: Array<MenuEntry>,
    { buildDir, templateDir, compact, linkHtml }: { buildDir: string; templateDir: string; compact: boolean, linkHtml: boolean }
) => {
    const template = (await readFile(join(templateDir, "template.html"))).toString();
    const menuHtml = makeHTMLMenu(menu, { compact, linkHtml });
    const md = markdownit({
        html: true,
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return `<pre><code class="hljs language-${lang}">${
hljs.highlight(str, { language: lang }).value
}</code></pre>`;
                } catch (__) {}
            }
            return ''; // use external default escaping
        }
    });
    const defaultRenderLink =
        md.renderer.rules.link_open ||
            ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const href = token.attrGet("href");

        if (href && /^https?:\/\//.test(href)) {
            token.attrSet("rel", "noopener noreferrer");
            token.attrSet("target", "_blank");
        }

        return defaultRenderLink(tokens, idx, options, env, self);
    };
    const defaultRenderHeading =
        md.renderer.rules.heading_open ||
            ((tokens, idx, options, env, self) =>
                self.renderToken(tokens, idx, options));
    md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
        const title = tokens[idx + 1].content;

        tokens[idx].attrSet("id", slugify(title));

        return defaultRenderHeading(tokens, idx, options, env, self);
    };
    const results = (
        await Promise.all(
            menu.map((oneEntry) => buildSingleFile({ menuHtml, template, buildDir, converter: md }, oneEntry))
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
        console.log(`Downloaded ${oneUrl} to ${output}`);
    };
    const promises = Object.entries(externalFiles).map(downloadSingleFile);
    await Promise.all(promises);
    console.log("All external files downloaded");
};

const main = async () => {
    const compact = process.argv.includes("--prod");
    const linkHtml = process.argv.includes("--link-html");
    const configFile = (await readFile("./config.json")).toString();
    const { buildDir, templateDir, publicDir, srcDir, styles, stylesDir, externalFiles } = JSON.parse(configFile) as GolbConfig;
    await rm(buildDir, { recursive: true, force: true });
    if (!existsSync(buildDir)) {
        mkdirSync(buildDir);
    }
    copyDir(publicDir, buildDir);
    downloadExternalFiles(buildDir, externalFiles);
    compileCSS({ compact, stylesDir, styles, buildDir }, "style.css");
    const completeMenu = await makeMenu("", srcDir, buildDir);
    writeFile("menu.json", JSON.stringify(completeMenu, null, 4));
    const indexed = await build(completeMenu, { buildDir, templateDir, compact, linkHtml });
    writeIndex(indexed, buildDir);
};

main();
// vim: ts=4 sts=4 sw=4 et
