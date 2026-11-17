import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = resolve(projectDirectory, "dist");
const port = Number(process.env.PORT ?? 5173);

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  resolve(projectDirectory, "index.html"),
  resolve(outputDirectory, "index.html"),
);

const buildContext = await context({
  absWorkingDir: projectDirectory,
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outdir: "dist/assets",
  sourcemap: true,
});
await buildContext.watch();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  let filePath = resolve(outputDirectory, `.${pathname}`);
  if (filePath !== outputDirectory && !filePath.startsWith(`${outputDirectory}${sep}`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    if (fileInfo.isDirectory()) {
      filePath = resolve(filePath, "index.html");
    } else if (!fileInfo.isFile()) {
      throw new Error("Requested path is not a file");
    }
  } catch (error) {
    const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (!missing) {
      console.error(error);
      response.writeHead(500).end();
      return;
    }
    if (extname(pathname)) {
      response.writeHead(404).end();
      return;
    }
    filePath = resolve(outputDirectory, "index.html");
  }

  try {
    const content = await readFile(filePath);
    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    };
    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(content);
    }
  } catch (error) {
    console.error(error);
    response.writeHead(500).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Frontend dev server listening at http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await buildContext.dispose();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
