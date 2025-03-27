# svseeds-cli - the SvSeeds CLI
A CLI tool to copy SvSeeds components made with Svelte.

## Quick Start
### Node.js
```
npx svseeds-cli
```

### Deno
```
deno run @svseeds/cli
```

## Basic Usage
Copy specified SvSeeds files to the project. (`COMMAND` means Quick Start command.)
```
COMMAND [component names...]
```

## Options
- Specify directory:
```
COMMAND -d <directory> [component names...]
```

- Specify all components:
```
COMMAND --all
```

- Update copied components:
```
COMMAND -u [component names...]
```
**This option will overwrite the files**

- Run without interactions:
```
COMMAND --no-confirm [component names...]
```

## After Copy
Custom the files as you like. If you do not want it overwritten by this tool, you should rename.
