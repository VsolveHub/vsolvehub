const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// One copy of each of these, always the app's own. Workspace packages (@vsolve/*) import them
// too, and a second copy of React breaks every hook ("Invalid hook call").
const SINGLETONS = ["react", "react-native", "@tanstack/react-query", "expo-router"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Normalize a RELATIVE monorepo path into node_modules ("../../node_modules/react" -> "react").
  // Absolute paths are left alone: Metro asks for its own files by absolute path (for example
  // metro-runtime's empty-module.js), and rewriting that to a bare name made it unresolvable from
  // the app on Linux, so EAS builds failed at "Bundle JavaScript". Windows paths use backslashes,
  // which is why the same build passed locally.
  let targetName = moduleName;
  const isRelative = moduleName.startsWith("./") || moduleName.startsWith("../");
  if (isRelative && targetName.includes("node_modules/")) {
    targetName = targetName.slice(targetName.lastIndexOf("node_modules/") + "node_modules/".length);
  }

  if (SINGLETONS.some((name) => targetName === name || targetName.startsWith(`${name}/`))) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "package.json") },
      targetName,
      platform,
    );
  }

  if (targetName !== moduleName) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "package.json") },
      targetName,
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

// inlineRem 16 = the web's 1rem, so `p-4`, `text-sm` and `min-h-12` measure the same as on web.
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
