import * as p from "jsr:@std/path@^1.0.8";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  type MultiSelectOptions,
  type Option,
  outro,
} from "npm:@clack/prompts@^0.10.1";
import { ProjectRoot } from "./project_root.ts";
import { TempPackage } from "./package_jsr.ts";
import packageInfo from "../deno.json" with { type: "json" };

type StringMap = Map<string, string>;
type StringSet = Set<string>;
type EachDescription = {
  dependencies: string[];
};
type DependencyObject = {
  components: { [key: string]: EachDescription };
};

/** Entrypoint of svseeds-cli. */
export default async function main() {
  const flow = new Flow();
  const pkg = new TempPackage("svseeds", "ui");

  try {
    const cli = await parseCommand();
    Cli.showTitle();

    await cli.confirm();
    const avails = new Components(await pkg.download());
    await cli.run(avails);
  } catch (e) {
    flow.showError(e);
  } finally {
    await pkg.remove();
    flow.exitError();
  }
}

async function parseCommand(): Promise<Cli> {
  const { options, args } = await new Command()
    .name("svseeds-cli")
    .version(packageInfo.version)
    .description("A CLI tool to copy SvSeeds components made with Svelte.")
    .option("-d, --dir <directory>", "Directory path of components.", { default: Destination.DEFAULT_PATH })
    .option("-u --update", "Update exist components.")
    .option("--all", "For all components.")
    .option("--no-confirm", "Skip interactions.")
    .arguments("[...component_names]")
    .parse(Deno.args);

  const opts = new Options(options.confirm, options.all, options.update);
  const dest = new Destination(options.dir);
  return new Cli(opts, dest, args);
}

class Cli {
  #opts: Options;
  #dest: Destination;
  #spec: StringSet;

  constructor(opts: Options, dest: Destination, spec: string[]) {
    this.#opts = opts;
    this.#dest = dest;
    this.#spec = new Set(spec);
  }
  async confirm() {
    if (this.#opts.confirm) await this.#dest.confirm(this.#opts.confirm);
  }
  async run(avails: Components) {
    const selects = await this.#select(avails);
    if (!selects.length) Flow.error("no components specified");
    const reqs = avails.getRequiredFiles(selects);
    Cli.#showResult(this.#handleFiles(reqs, avails.dir, this.#dest.dir));
  }
  async #select(avails: Components): Promise<string[]> {
    if (this.#opts.all) return avails.files;
    if (this.#spec.size) return this.#getExistFiles(avails.getSpecFiles(this.#spec));
    if (!this.#opts.confirm) return [];
    return await Cli.showCheckboxPrompt(avails.getMultiSelectOptions(this.#dest.files, this.#opts.update));
  }
  #getExistFiles(map: StringMap): string[] {
    const ignore = [...map.entries().filter(([_, v]) => !v).map(([k, _]) => k)];
    if (ignore.length) Flow.warn(`components does not exist: ${ignore.join(", ")}`);
    ignore.forEach((x) => map.delete(x));
    return [...map.values()];
  }
  #handleFiles(reqs: string[], from: string, to: string): boolean {
    const exists = this.#dest.getExists(reqs);
    if (this.#opts.update) return Cli.copyFiles(exists, from, to);

    if (exists.length) Flow.warn(`skip exist files: ${exists.join(", ")}`);
    return Cli.copyFiles(reqs.filter((x) => !exists.includes(x)), from, to);
  }

  static copyFiles(files: string[], from: string, to: string): boolean {
    if (!files.length) return false;
    Deno.mkdirSync(to, { recursive: true });
    files.forEach((x) => Deno.copyFileSync(p.join(from, x), p.join(to, x)));
    return true;
  }
  static showTitle() {
    intro("SvSeeds CLI");
  }
  static #showResult(done: boolean) {
    if (done) {
      outro("Files copied successfully!!");
    } else {
      outro("Files not copied.");
    }
  }
  static async showCheckboxPrompt(options: Option<string>[]): Promise<string[]> {
    const args: MultiSelectOptions<string> = {
      message: "Select components.",
      options,
      required: true,
    };
    const selected = await multiselect(args);
    if (isCancel(selected)) Flow.cancel();
    return selected as string[];
  }
}

class Components {
  static LABEL_IGNORE_PATTERN = new RegExp("(-|_|.svelte|.ts)", "g");
  static DIR = "_svseeds";
  static CORE = "core.ts";
  static DEP = "dep.json";
  #dir;
  #files: StringSet;
  #resolver: DepResolver;
  get dir(): string {
    return this.#dir;
  }
  get files(): string[] {
    return [...this.#files.keys()];
  }

  constructor(pkgPath: string) {
    this.#dir = p.join(pkgPath, Components.DIR);
    this.#files = new Set(
      Deno.readDirSync(this.#dir)
        .filter((x) => x.isFile)
        .map((x) => x.name),
    );
    this.#resolver = new DepResolver(p.join(this.#dir, Components.DEP));
  }
  getSpecFiles(spec: StringSet): StringMap {
    const keys = new Map(this.#files.keys().map((x) => [Components.#getKeyText(x), x]));
    return new Map(spec.keys().map((x) => [x, keys.get(Components.#getKeyText(x)) ?? ""]));
  }
  getRequiredFiles(files: string[]): string[] {
    return [...this.#resolver.getRequiredFiles(Components.#adjustCoreFiles(files, true)).keys()];
  }
  getMultiSelectOptions(exists: string[], update: boolean): Option<string>[] {
    const files = update ? exists.filter((x) => this.#files.has(x)) : [...this.#files.keys().filter((x) => !exists.includes(x))];
    const lists = Components.#adjustCoreFiles(files, false);
    Components.#validateAvailables(lists, update);
    if (!lists.length) Flow.error("no files available");
    return lists.map((x) => ({ label: Components.#getLabelText(x), value: x })).toSorted((x, y) => x.label.localeCompare(y.label));
  }

  static #adjustCoreFiles(files: string[], core: boolean): string[] {
    const removed = files.filter((x) => x !== Components.CORE && x !== Components.DEP);
    return core ? [...removed, Components.CORE] : removed;
  }
  static #validateAvailables(lists: string[], update: boolean) {
    if (lists.length) return;
    if (update) {
      Flow.error("svseeds files are not exist");
    } else {
      Flow.error("all svseeds files are already exist");
    }
  }
  static #getKeyText(file: string): string {
    return Components.#getLabelText(file).toUpperCase();
  }
  static #getLabelText(file: string): string {
    return file.replaceAll(Components.LABEL_IGNORE_PATTERN, "");
  }
}
class DepResolver {
  #dep: DependencyObject;
  constructor(path: string) {
    this.#dep = JSON.parse(new TextDecoder("utf-8").decode(Deno.readFileSync(path)));
  }
  getRequiredFiles(files: string[]): StringSet {
    const ret = new Set(files);
    const deps = files.filter((x) => !x.startsWith("_"));
    if (!deps.length) return ret;
    deps.forEach((x) => this.#setNestedDependencies(ret, x));
    return ret;
  }
  #setNestedDependencies(set: StringSet, file: string) {
    const deps = this.#dep.components[file]?.dependencies;
    if (!deps?.length) return;
    for (const dep of deps) {
      set.add(dep);
      if (!dep.startsWith("_")) this.#setNestedDependencies(set, dep);
    }
  }
}

class Options {
  #all: boolean;
  #confirm: boolean;
  #update: boolean;

  get all(): boolean {
    return this.#all;
  }
  get confirm(): boolean {
    return this.#confirm;
  }
  get update(): boolean {
    return this.#update;
  }
  constructor(confirm: boolean, all?: boolean, update?: boolean) {
    this.#all = Boolean(all);
    this.#update = Boolean(update);
    this.#confirm = confirm;
  }
}
class Destination {
  static DEFAULT_PATH = p.join("src", "lib", Components.DIR);
  static #PJROOT_FILE = [];
  static #PJROOT_DIR = ["src"];
  #dir;
  #abs;
  #exists;
  #files: string[];
  get dir(): string {
    return this.#abs;
  }
  get files(): string[] {
    return this.#files;
  }

  constructor(dir: string = Destination.DEFAULT_PATH) {
    this.#dir = dir;
    this.#abs = this.#getAbsolutePath();
    const files = this.#getFiles();
    this.#exists = Boolean(files);
    this.#files = files ?? [];
  }
  #getFiles(): string[] | undefined {
    try {
      return [...Deno.readDirSync(this.#abs).filter((x) => x.isFile).map((x) => x.name)];
    } catch (e) {
      return;
    }
  }
  async confirm(update: boolean) {
    if (this.#exists && !this.#files.length) return;
    if (this.#exists && !update) return;
    const info = this.#exists ? "File already exists in the directory." : `Directory not found: ${this.#getRelativePath()}`;
    const message = this.#exists ? "Do you want to proceed?" : "Create directory and proceed?";
    log.info(info);
    const result = await confirm({ message });
    if (isCancel(result) || !result) Flow.cancel();
  }
  getExists(files: string[]): string[] {
    return this.#files.filter((x) => files.includes(x));
  }
  #getAbsolutePath(): string {
    if (this.#startsWithPathSign()) {
      return p.resolve(this.#dir);
    } else {
      const root = new ProjectRoot(Destination.#PJROOT_FILE, Destination.#PJROOT_DIR).getProjectRoot();
      return p.resolve(p.join(root, this.#dir));
    }
  }
  #startsWithPathSign(): boolean {
    return this.#dir.startsWith("/") || this.#dir.startsWith("./") || this.#dir.startsWith("../");
  }
  #getRelativePath(): string {
    return this.#abs.replace(p.resolve("."), ".");
  }
}

class Flow {
  static #CANCEL_CODE = -1;
  #code = 0;

  showError(e: unknown) {
    if (!(e instanceof Error && e.cause === Flow.#CANCEL_CODE)) this.#code = 1;
    Flow.showError(e);
  }
  exitError() {
    if (this.#code) Deno.exit(this.#code);
  }

  static warn(msg: string) {
    log.warn(`warn: ${msg}`);
  }
  static error(msg: string) {
    throw new Error(`error: ${msg}`);
  }
  static cancel() {
    throw new Error("cancelled", { cause: Flow.#CANCEL_CODE });
  }
  static showError(e: unknown) {
    if (e instanceof Error) {
      if (e.cause === Flow.#CANCEL_CODE) {
        cancel(e.message);
      } else {
        log.error(e.message);
      }
    } else {
      throw e;
    }
  }
}
