import * as p from "jsr:@std/path@^1.0.8";
import { UntarStream } from "jsr:@std/tar@^0.1.6";

type PackageMeta = {
  scope: string;
  name: string;
  latest: string;
  tgz: string;
  versions: string[];
};
export class Package {
  #JSR = "jsr.io";
  #NPM = "npm.jsr.io";
  #scope;
  #name;
  #meta: PackageMeta | undefined;

  constructor(scope: string, name: string) {
    this.#scope = scope;
    this.#name = name;
  }

  async downloadPackage(path: string) {
    if (!this.#meta?.tgz) this.#meta = await this.#getNpmMeta();
    const data = new Uint8Array(await (await this.#fetch(this.#meta.tgz)).arrayBuffer());
    Deno.writeFileSync(path, data);
  }
  async downloadFile(path: string, urlPath: string) {
    if (!this.#meta) this.#meta = await this.#getJsrMeta();
    if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
    const data = new Uint8Array(await (await this.#fetch(this.#getJsrBaseUrl() + urlPath)).arrayBuffer());
    Deno.writeFileSync(path, data);
  }
  async getMetaInfo(): Promise<Package> {
    if (!this.#meta) this.#meta = await this.#getJsrMeta();
    return this;
  }

  get scope(): string {
    return this.#scope;
  }
  get name(): string {
    return this.#name;
  }
  get latest(): string {
    return this.#meta?.latest ?? "";
  }
  get versions(): string[] {
    return this.#meta?.versions ?? [];
  }

  #getJsrBaseUrl(): string {
    return `https://${this.#JSR}/@${this.#scope}/${this.#name}`;
  }
  #getNpmBaseUrl(): string {
    return `https://${this.#NPM}/@jsr/${this.#scope}__${this.#name}`;
  }
  async #getJsrMeta(): Promise<PackageMeta> {
    const url = `${this.#getJsrBaseUrl()}/meta.json`;
    const meta = await (await this.#fetch(url)).json();
    const versions = Object.keys(meta["versions"]);
    return {
      scope: this.#scope,
      name: this.#name,
      latest: meta["latest"] ?? versions.reduce((p, c) => c > p ? c : p),
      tgz: "",
      versions,
    };
  }
  async #getNpmMeta(): Promise<PackageMeta> {
    const meta = await (await this.#fetch(this.#getNpmBaseUrl())).json();
    return {
      scope: this.#scope,
      name: this.#name,
      latest: meta["dist-tags"]["latest"],
      tgz: meta["versions"][meta["dist-tags"]["latest"]]["dist"]["tarball"],
      versions: Object.keys(meta["versions"]),
    };
  }
  async #fetch(url: string): Promise<Response> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`error: fetch failed [${res.status}] ${res.statusText}`);
    return res;
  }
}

export class TempPackage {
  static DIR = "package";
  #jsr: Package;
  #tmp = "";

  constructor(scope: string, name: string) {
    this.#jsr = new Package(scope, name);
  }
  async remove() {
    if (this.#tmp) await Deno.remove(this.#tmp, { recursive: true });
  }
  async download(): Promise<string> {
    await this.#makeTempDir();
    return await this.#downloadPackage();
  }
  async #makeTempDir() {
    this.#tmp = await Deno.makeTempDir({ prefix: `${this.#jsr.scope}_${this.#jsr.name}_` });
    if (!this.#tmp) throw new Error(`error: failed to create temporary directory`);
  }
  async #downloadPackage(): Promise<string> {
    const file = `${this.#jsr.scope}-${this.#jsr.name}.tgz`;
    const tgz = p.join(this.#tmp, file);
    await this.#jsr.downloadPackage(tgz);
    await decompress(tgz);
    return p.join(this.#tmp, TempPackage.DIR);
  }
}

export async function decompress(tgzPath: string) {
  const dir = p.dirname(tgzPath);
  for await (
    const entry of (await Deno.open(tgzPath)).readable
      .pipeThrough(new DecompressionStream("gzip"))
      .pipeThrough(new UntarStream())
  ) {
    const target = p.normalize(p.join(dir, entry.path));
    Deno.mkdirSync(p.dirname(target), { recursive: true });
    await entry.readable?.pipeTo((await Deno.create(target)).writable);
  }
}
