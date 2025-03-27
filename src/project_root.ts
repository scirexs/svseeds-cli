import * as p from "jsr:@std/path@^1.0.8";
import { existsSync } from "jsr:@std/fs@^1.0.14";

export class ProjectRoot {
  static CONFIGS = ["deno.json", "package.json"];
  #files: string[];
  #dirs: string[];
  #current: string;
  #root: string;

  constructor(files?: string[], dirs?: string[], current?: string) {
    this.#files = files?.length ? [...files] : [];
    this.#dirs = dirs?.length ? [...dirs] : [];
    this.#current = current ? p.resolve(current) : p.resolve(".");
    this.#root = p.parse(this.#current).root;
  }

  getProjectRoot(): string {
    let dir = this.#getConfigFileDir();
    while (dir) {
      if (this.#confirmExistence()) return this.#current;
      this.#current = p.dirname(this.#current);
      dir = this.#getConfigFileDir();
    }
    let msg = `project root not found with config file ${ProjectRoot.CONFIGS.join(" or ")}`;
    if (this.#files.length || this.#dirs.length) msg = msg + `, and file/dir ${[...this.#files, ...this.#dirs]}`;
    throw new Error(msg);
  }

  #getConfigFileDir(): string {
    for (const file of ProjectRoot.CONFIGS) {
      const dir = this.#seekFileToUpward(this.#current, file);
      if (dir) return dir;
    }
    return "";
  }
  #seekFileToUpward(current: string, file: string): string {
    while (current !== this.#root) {
      if (ProjectRoot.exists(p.join(current, file))) return current;
      current = p.dirname(current);
    }
    return "";
  }
  #confirmExistence(): boolean {
    return this.#confirm(this.#files, false) && this.#confirm(this.#dirs, true);
  }
  #confirm(list: string[], dir: boolean): boolean {
    for (const x of list) {
      if (!ProjectRoot.exists(p.join(this.#current, x), dir)) return false;
    }
    return true;
  }

  static exists(path: string | URL, dir: boolean = false): boolean {
    const options = dir ? { isDirectory: true } : { isFile: true };
    return existsSync(path, options);
  }
}
