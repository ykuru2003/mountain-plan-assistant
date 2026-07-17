import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const worker = path.join(projectRoot, "dist", "server", "index.js");
const hosting = path.join(projectRoot, "dist", ".openai", "hosting.json");

try {
  await readFile(worker);
} catch {
  console.error("Missing Sites Worker entry: dist/server/index.js");
  process.exit(66);
}

try {
  await readFile(hosting);
} catch {
  console.error("Missing packaged Sites manifest: dist/.openai/hosting.json");
  process.exit(66);
}

const workerUrl = pathToFileURL(worker);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const workerModule = await import(workerUrl.href);
if (!workerModule.default || typeof workerModule.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}

console.log("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.");
