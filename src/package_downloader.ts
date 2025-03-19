type PackageMeta = {
  scope: string;
  name: string;
  latest: string;
  tgz: string;
  versions: string[];
};
export class JSRPackage {
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
  async getMetaInfo(): Promise<JSRPackage> {
    if (!this.#meta) this.#meta = await this.#getJsrMeta();
    return this;
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
    if (!res.ok) throw new Error(`fetch failed [${res.status}] ${res.statusText}`);
    return res;
  }
}
