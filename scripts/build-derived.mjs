/** Build the public, derived-data-only app without modifying provided originals. */
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const packageJson = JSON.parse(
  await readFile(path.join(appRoot, "package.json"), "utf8"),
);
if (packageJson.name !== "autogeo-hackathon") {
  throw new Error(
    "This script only builds the AutoGeo app containing this script.",
  );
}
const distRoot = path.join(appRoot, "dist");
const omitted = ["documents", "data/ground/logs", "data/field/quality"];
const preserved = [
  "index.html",
  "data/ground/site-assets.json",
  "data/ground/orthophoto.webp",
  "data/ground/orthophoto-preview.webp",
  "data/ground/tiles",
  "data/ground/dsm.json",
  "data/ground/pointcloud.bin",
  "data/ground/cad-linework.json",
  "data/design/section-b-left.png",
  "data/design/section-c.png",
  "data/design/section-d.png",
];

async function statOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureNoSymlinkAncestors(relative) {
  const parts = relative.split("/");
  let current = appRoot;
  for (const part of parts) {
    current = path.join(current, part);
    const entry = await statOrNull(current);
    if (entry?.isSymbolicLink()) {
      throw new Error(
        `Refusing a symbolic link in the build path: ${relative}`,
      );
    }
  }
}

// Vite clears dist before writing; reject a redirected dist before starting it.
await ensureNoSymlinkAncestors("dist");
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    cwd: appRoot,
    env: { ...process.env, VITE_SOURCE_ACCESS: "derived" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `AutoGeo build failed (${result.status ?? result.signal ?? "unknown"}); do not deploy this dist.`,
  );
}
await ensureNoSymlinkAncestors("dist");
if ((await realpath(distRoot)) !== distRoot)
  throw new Error("Unexpected build output path.");

for (const relative of omitted) {
  await ensureNoSymlinkAncestors(`dist/${relative}`);
  // Only exact descendants of this app's generated dist are ever removed.
  const target = path.resolve(distRoot, relative);
  if (!target.startsWith(`${distRoot}${path.sep}`))
    throw new Error("Unsafe output path.");
  await rm(target, { recursive: true, force: true });
  if (await statOrNull(target))
    throw new Error(`Original source remains in dist: ${relative}`);
}
for (const relative of preserved) {
  if (!(await statOrNull(path.join(distRoot, relative)))) {
    throw new Error(`Required derived asset is missing: ${relative}`);
  }
}
await writeFile(
  path.join(distRoot, "source-access.json"),
  JSON.stringify(
    {
      mode: "derived",
      providedOriginalsIncluded: false,
      omittedPaths: omitted,
      realDerivedDataIncluded: true,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Derived-data build ready: original PDFs, drill-log images and quality source images are excluded from dist. Local public originals are unchanged.",
);
