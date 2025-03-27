import { build, emptyDir } from "jsr:@deno/dnt";
import packageInfo from "./deno.json" with { type: "json" };

await emptyDir("./npm");

await build({
  entryPoints: [{
    kind: "bin",
    name: "svseeds-cli",
    path: "./mod.ts"
  }],
  outDir: "./npm",
  scriptModule: false,
  typeCheck: false,
  declaration: false,
  test: false,
  shims: {
    deno: true,
  },
  package: {
    name: "svseeds-cli",
    version: packageInfo.version,
    description: "A CLI tool to copy SvSeeds components made with Svelte.",
    author: "scirexs",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/scirexs/svseeds-cli.git"
    },
    keywords: [
      "svelte",
      "headless",
      "components",
      "cli"
    ],
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});