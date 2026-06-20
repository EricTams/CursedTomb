import { defineConfig, type Plugin } from "vite";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Dev-only: POST /__frame with a PNG body writes tmp/frame.png. Lets tooling
// (and AI sessions) dump the native-res frame buffer to disk and inspect the
// exact pixels instead of squinting at scaled screenshots.
function frameDumpPlugin(): Plugin {
  return {
    name: "frame-dump",
    configureServer(server) {
      server.middlewares.use("/__frame", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          mkdirSync("tmp", { recursive: true });
          writeFileSync("tmp/frame.png", Buffer.concat(chunks));
          res.end("saved");
        });
      });
    },
  };
}

// Dev-only: POST /__tape with JSON { tape: number[] } writes src/intro-tape.ts
// — the recorded intro playthrough (Act 1). Each entry is a per-tick bitmask of
// held inputs (L=1 R=2 U=4 D=8 A=16 B=32). The tape is tied to the intro level
// layout + player physics, so re-record after changing either.
function tapeDumpPlugin(): Plugin {
  return {
    name: "tape-dump",
    configureServer(server) {
      server.middlewares.use("/__tape", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => {
          try {
            const { tape } = JSON.parse(body) as { tape: number[] };
            const header =
              "// Recorded intro playthrough (Act 1). Regenerate in-game (dev keys:\n" +
              "// ` to record, P to preview, O to write this file). Each entry is a\n" +
              "// per-tick bitmask of held inputs (L=1 R=2 U=4 D=8 A=16 B=32); tied to\n" +
              "// the intro level layout + player physics — re-record after changing either.\n";
            const out = `${header}export const INTRO_TAPE: readonly number[] = [${tape.join(",")}];\n`;
            writeFileSync("src/intro-tape.ts", out);
            res.end(`saved ${tape.length} frames to src/intro-tape.ts`);
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// Dev-only: POST /__save-level with JSON { name, source } writes
// src/levels/<name>.ts and idempotently registers it in src/main.ts (import +
// LEVELS array entry, keyed off the <editor-imports> / <editor-levels> markers).
// This is how the standalone level editor (editor.html) persists levels.
function saveLevelPlugin(): Plugin {
  return {
    name: "save-level",
    configureServer(server) {
      server.middlewares.use("/__save-level", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => {
          try {
            const { name, source } = JSON.parse(body) as { name: string; source: string };
            // Must be a valid JS identifier (it becomes the file slug + const).
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
              res.statusCode = 400;
              res.end("invalid level name");
              return;
            }
            const file = `src/levels/${name}.ts`;
            const overwrote = existsSync(file);
            writeFileSync(file, source);
            const registered = registerLevelInManifest(name);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ written: true, overwrote, registered }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// Register a level in the manifest (src/levels/index.ts): add its import and an
// ordered `{ name, level }` entry, each only if not already present. Returns
// true if the manifest changed. The display `name` starts as the slug — rename
// it by hand in the manifest.
function registerLevelInManifest(name: string): boolean {
  // Mirror src/editor/serialize.ts constName(): levelN -> LEVEL_N (matches the
  // hand-authored built-ins so overwriting them needs no re-registration),
  // else LEVEL_<UPPERCASE>.
  const m = /^level(\d+)$/i.exec(name);
  const constName = m ? `LEVEL_${m[1]}` : `LEVEL_${name.toUpperCase()}`;
  const importMarker = "// <editor-imports></editor-imports>";
  const levelsMarker = "/* <editor-levels> */";
  const manifest = "src/levels/index.ts";
  const lines = readFileSync(manifest, "utf8").split("\n");
  let changed = false;

  const importLine = `import { ${constName} } from "./${name}";`;
  if (!lines.some((l) => l.includes(importLine))) {
    const i = lines.findIndex((l) => l.includes(importMarker));
    if (i >= 0) {
      lines.splice(i, 0, importLine);
      changed = true;
    }
  }

  // Append an entry just before the marker line, unless this const is listed.
  const entryRe = new RegExp(`level:\\s*${constName}\\b`);
  if (!lines.some((l) => entryRe.test(l))) {
    const i = lines.findIndex((l) => l.includes(levelsMarker));
    if (i >= 0) {
      const indent = lines[i].match(/^\s*/)?.[0] ?? "  ";
      lines.splice(i, 0, `${indent}{ name: ${JSON.stringify(name)}, level: ${constName} },`);
      changed = true;
    }
  }

  if (changed) writeFileSync(manifest, lines.join("\n"));
  return changed;
}

export default defineConfig({
  // Relative base so the build works at any GitHub Pages path (user.github.io/<repo>/)
  base: "./",
  plugins: [frameDumpPlugin(), saveLevelPlugin(), tapeDumpPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        editor: resolve(root, "editor.html"),
      },
    },
  },
});
