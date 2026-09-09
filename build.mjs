/* Builds the owner admin into public/admin/. The website itself needs no build
   step at all — public/ is served as-is, exactly as exported from the builder. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import esbuild from "esbuild";

const root = import.meta.dirname;
const out = path.join(root, "public", "admin");

await esbuild.build({
  entryPoints: [path.join(root, "src", "admin", "main.tsx")],
  outfile: path.join(out, "admin.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

execFileSync(
  "npx",
  [
    "@tailwindcss/cli",
    "-i", path.join(root, "src", "admin", "admin.css"),
    "-o", path.join(out, "admin.css"),
    "--minify",
  ],
  { stdio: "inherit", cwd: root },
);
