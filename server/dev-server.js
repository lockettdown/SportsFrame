import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const portArgIndex = process.argv.indexOf("--port");
const portArg = portArgIndex === -1 ? null : process.argv[portArgIndex + 1];
const port = Number(portArg || process.env.PORT || 5173);
const host = "127.0.0.1";

function loadEnvFile(fileName) {
  try {
    const contents = readFileSync(resolve(root, fileName), "utf8");
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // Local env files are optional.
  }
}

function collectBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", rejectBody);
  });
}

function createApiResponse(response) {
  return {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(payload) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(payload));
    },
    send(payload) {
      response.end(payload);
    }
  };
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${host}:${port}`);
  const route = url.pathname.replace(/^\/api\//, "");
  const routePath = resolve(root, "api", `${route}.js`);
  const rawBody = await collectBody(request);

  request.rawBody = rawBody;
  if (rawBody.length && request.headers["content-type"]?.includes("application/json")) {
    try {
      request.body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      request.body = {};
    }
  }

  try {
    const moduleUrl = `${pathToFileURL(routePath).href}?t=${Date.now()}`;
    const { default: handler } = await import(moduleUrl);
    await handler(request, createApiResponse(response));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: error.message }));
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const vite = await createViteServer({
  root,
  server: {
    host,
    hmr: {
      port: port + 10000
    },
    middlewareMode: true
  },
  appType: "spa"
});

const server = createHttpServer(async (request, response) => {
  if (request.url?.startsWith("/api/")) {
    await handleApi(request, response);
    return;
  }

  vite.middlewares(request, response);
});

server.listen(port, host, () => {
  console.log(`DiamondFrame dev server running at http://${host}:${port}/`);
});
