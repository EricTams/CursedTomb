import { defineConfig, type Plugin } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";

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

export default defineConfig({
  // Relative base so the build works at any GitHub Pages path (user.github.io/<repo>/)
  base: "./",
  plugins: [frameDumpPlugin()],
});
