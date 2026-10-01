import { build, loadEnv } from "vite";
import { copyFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function buildExtension(options = {}) {
  const projectRoot = await realpath(options.root ?? root);
  const env = { ...loadEnv("production", projectRoot, ""), ...process.env };
  const outDir = resolve(options.outDir ?? resolve(projectRoot, "dist"));

  const common = {
    root: projectRoot,
    configFile: false,
    publicDir: false,
    envDir: false,
    mode: "production",
    base: "./",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(env.VITE_API_BASE_URL ?? ""),
      "import.meta.env.VITE_API_KEY": JSON.stringify(env.VITE_API_KEY ?? ""),
      "import.meta.env.VITE_INBOXSDK_APP_ID": JSON.stringify(env.VITE_INBOXSDK_APP_ID ?? "")
    }
  };

  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: true,
      target: "chrome116",
      lib: {
        entry: resolve(projectRoot, "src/background/index.ts"),
        formats: ["es"],
        fileName: () => "background.js"
      },
      rollupOptions: {
        output: { inlineDynamicImports: true }
      }
    }
  });

  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      target: "chrome116",
      lib: {
        entry: resolve(projectRoot, "src/content/index.ts"),
        name: "content",
        formats: ["iife"],
        fileName: () => "content.js"
      },
      rollupOptions: {
        output: { inlineDynamicImports: true }
      }
    }
  });

  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      target: "chrome116",
      lib: {
        entry: resolve(projectRoot, "src/gmail/sdk-prelude.ts"),
        name: "sdk_prelude",
        formats: ["iife"],
        fileName: () => "sdk-prelude.js"
      },
      rollupOptions: {
        output: { inlineDynamicImports: true }
      }
    }
  });

  await mkdir(outDir, { recursive: true });
  await copyFile(
    resolve(projectRoot, "node_modules/@inboxsdk/core/pageWorld.js"),
    resolve(outDir, "pageWorld.js")
  );
  await writeFile(
    resolve(outDir, "manifest.json"),
    `${JSON.stringify(createManifest(env), null, 2)}\n`
  );
  console.log(`Loadable MV3 extension built in ${outDir}`);
}

export function createManifest(env) {
  const hostPermissions = ["https://mail.google.com/*"];
  try {
    const url = new URL(String(env.VITE_API_BASE_URL ?? "").trim());
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !/[\\\s]/.test(String(env.VITE_API_BASE_URL ?? ""))
    ) {
      const pattern = `https://${url.hostname}/*`;
      if (!hostPermissions.includes(pattern)) hostPermissions.push(pattern);
    }
  } catch {
    // Missing or invalid API base keeps mock mode enabled.
  }

  const sdkReady = /^sdk_[a-zA-Z0-9_-]{5,15}_[0-9a-f]{10}$/.test(
    String(env.VITE_INBOXSDK_APP_ID ?? "").trim()
  );

  return {
    manifest_version: 3,
    minimum_chrome_version: "116",
    name: "Mercato Gmail",
    version: "0.1.0",
    description: "Mercato Gmail classifier prototype extension shell.",
    permissions: ["storage"],
    host_permissions: hostPermissions,
    background: { service_worker: "background.js", type: "module" },
    action: { default_title: "Mercato Gmail" },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'"
    },
    content_scripts: [
      ...(sdkReady
        ? [
            {
              matches: ["https://mail.google.com/mail/*"],
              js: ["sdk-prelude.js", "pageWorld.js"],
              run_at: "document_end",
              world: "MAIN",
              all_frames: false
            }
          ]
        : []),
      {
        matches: ["https://mail.google.com/mail/*"],
        js: ["content.js"],
        run_at: "document_end",
        all_frames: false
      }
    ],
    ...(env.EXTENSION_PUBLIC_KEY
      ? { key: String(env.EXTENSION_PUBLIC_KEY).trim() }
      : {})
  };
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) {
  await buildExtension();
}
