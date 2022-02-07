const commands = require("./functions");
const { existsSync: existsSync, mkdirSync: mkdirSync, promises: fs } = require("fs");
const process = require("process");
const config = require("./config.json")
let dev = false;

const run = async () => {
    const files = [];
    if (process.argv.length > 3) {
        files.push(...process.argv.slice(3));
        dev = process.argv.indexOf("--dev") === -1 ? false : true;
    }
    await fs.rmdir(config.buildDir, { recursive: true, force: true });
    if (!existsSync(config.buildDir)) {
        mkdirSync(config.buildDir);
    }
    const completeMenu = await commands.makeMenu();
    await fs.writeFile("menu.json", JSON.stringify(completeMenu, null, 4))
    await commands.build(completeMenu, completeMenu, { dev, files });
    await commands.copyDataFolder();
}

run();