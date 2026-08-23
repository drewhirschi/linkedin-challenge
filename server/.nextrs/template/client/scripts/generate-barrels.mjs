import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const surface of ["fetch", "react-query"]) {
  const generatedDir = join(clientDir, "src", "generated", surface);
  const entries = await readdir(generatedDir, { withFileTypes: true });
  const moduleNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "model")
    .sort();
  const modules = [`export * from "./model/index";`];
  const exported = new Set();
  for (const name of moduleNames) {
    const source = await readFile(join(generatedDir, name, `${name}.ts`), "utf8");
    const names = [...source.matchAll(/^\s*export (?:const|type|interface|function|class|enum) ([A-Za-z_$][\w$]*)/gm)]
      .map((match) => match[1])
      .filter((exportName) => {
        if (exported.has(exportName)) return false;
        exported.add(exportName);
        return true;
      });
    if (names.length > 0) {
      modules.push(`export { ${names.join(", ")} } from "./${name}/${name}";`);
    }
  }
  await writeFile(join(generatedDir, "index.ts"), `${modules.join("\n")}\n`);
}
