import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const result = await build({
  entryPoints: [path.join(here, "main.js")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2022",
  legalComments: "inline",
  loader: { ".txt": "text" },
});
const photo = await fs.readFile(
  path.join(root, "public/data/ground/orthophoto-preview.webp"),
);
let html = await fs.readFile(path.join(here, "template.html"), "utf8");
html = html
  .replace("PHOTO_DATA", `data:image/webp;base64,${photo.toString("base64")}`)
  .replace("SCRIPT_DATA", () =>
    result.outputFiles[0].text.replaceAll("</script", "<\\/script"),
  );
html = html.replace(/[ \t]+$/gm, "");
await fs.mkdir(path.join(root, "public/data/presentation"), {
  recursive: true,
});
await fs.writeFile(
  path.join(root, "public/data/presentation/index.html"),
  html,
);
console.log(
  `Presentation generated: ${Buffer.byteLength(html)} bytes, 5 interactive screens.`,
);
