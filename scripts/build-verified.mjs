import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const env = { ...process.env, SITES_PROJECT_ROOT: projectRoot };
const vinextBin = process.platform === "win32" ? "vinext.cmd" : "vinext";
const vinextPath = path.join(projectRoot, "node_modules", ".bin", vinextBin);

if (!existsSync(vinextPath)) {
  console.error("vinext is unavailable. Run npm install and wait for it to finish before building.");
  process.exit(69);
}

console.log("Running vinext build...");
const buildResult = spawnSync(vinextPath, ["build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env,
});
if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const validateScript = path.join(scriptDir, "validate-artifact.mjs");
const validateResult = spawnSync(process.execPath, [validateScript], {
  cwd: projectRoot,
  stdio: "inherit",
  env,
});
if (validateResult.status !== 0) {
  process.exit(validateResult.status ?? 1);
}
