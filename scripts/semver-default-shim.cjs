const Module = require("node:module");
const path = require("node:path");

const originalLoad = Module._load;

function createBrowserslistStub() {
  const fallbackList = ["chrome 131", "edge 131", "firefox 131", "safari 17"];

  function browserslistStub() {
    return fallbackList.slice();
  }

  browserslistStub.defaults = ["> 0.5%", "last 2 versions", "Firefox ESR", "not dead"];
  browserslistStub.data = {};
  browserslistStub.usage = { global: {}, custom: null };
  browserslistStub.aliases = {};
  browserslistStub.desktopNames = {};
  browserslistStub.versionAliases = {};
  browserslistStub.nodeVersions = [process.versions.node];
  browserslistStub.cache = {};
  browserslistStub.clearCaches = () => {};
  browserslistStub.parse = () => [];
  browserslistStub.parseConfig = () => undefined;
  browserslistStub.readConfig = () => undefined;
  browserslistStub.findConfigFile = () => undefined;
  browserslistStub.findConfig = () => undefined;
  browserslistStub.loadConfig = () => undefined;
  browserslistStub.coverage = () => 0;
  browserslistStub.default = browserslistStub;

  return browserslistStub;
}

function createNftStub() {
  return {
    async nodeFileTrace(entries) {
      const fileList = new Set(Array.isArray(entries) ? entries.map((entry) => String(entry)) : []);
      return {
        fileList,
        esmFileList: new Set(),
        reasons: new Map(),
        warnings: new Set(),
      };
    },
  };
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith("url.js.text.js")) {
    return 'module.exports = { URLPattern: globalThis.URLPattern };';
  }

  if (
    request === "browserslist" ||
    request.endsWith("/browserslist") ||
    request.endsWith("/browserslist/index.js") ||
    request.includes("compiled/browserslist")
  ) {
    return createBrowserslistStub();
  }

  if (request === "next/dist/compiled/@vercel/nft" || request.includes("compiled/@vercel/nft")) {
    return createNftStub();
  }

  if (request === "semver") {
    return require(path.resolve(__dirname, "../node_modules/next/dist/compiled/semver/index.js"));
  }

  if (request.startsWith("next/dist/compiled/") && !request.endsWith(".js")) {
    const compiledIndex = path.resolve(__dirname, "../node_modules", request, "index.js");
    try {
      return require(compiledIndex);
    } catch {
      // Fall back to the original resolver below if the direct index path is missing.
    }
  }

  const loaded = originalLoad.apply(this, arguments);

  if (
    loaded &&
    typeof loaded === "object" &&
    typeof request === "string" &&
    !request.endsWith(".json") &&
    !Object.prototype.hasOwnProperty.call(loaded, "default")
  ) {
    try {
      loaded.default = loaded;
    } catch {
      // Ignore if the export object is frozen.
    }
  }

  return loaded;
};
