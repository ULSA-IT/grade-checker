const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const tests = fs.readdirSync(path.join(root, "tests")).filter(file => file.endsWith(".test.js")).sort().map(file => path.join(root, "tests", file));
if (!tests.length) throw new Error("No tests found");
const result = spawnSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
