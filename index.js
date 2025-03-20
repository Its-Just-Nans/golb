const commands = require("./functions");
const { buildSearch } = require("./search");
const { existsSync, mkdirSync, promises: fs } = require("fs");
const config = require("./config.json");

const run = async () => {
    await fs.rm(config.buildDir, { recursive: true, force: true });
    if (!existsSync(config.buildDir)) {
        mkdirSync(config.buildDir);
    }
    const completeMenu = await commands.makeMenu();
    await fs.writeFile("menu.json", JSON.stringify(completeMenu, null, 4));
    await commands.build(completeMenu, completeMenu);
    await commands.compileCSS();
    await commands.copyDataFolder();
    await commands.copyPublicFolder();
    await buildSearch();
};

run();
