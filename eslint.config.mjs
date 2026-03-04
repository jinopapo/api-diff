import fs from "node:fs";
import path from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const projectRoot = process.cwd();

const appDir = path.join(projectRoot, "app");
const clientDir = path.join(projectRoot, "client");
const serverDir = path.join(projectRoot, "server");
const clientActionsDir = path.join(clientDir, "actions");
const clientServicesDir = path.join(clientDir, "services");
const clientRepositorysDir = path.join(clientDir, "repositorys");
const clientStoreDir = path.join(clientDir, "store");
const clientStoreAppDir = path.join(clientStoreDir, "app");
const clientStorePagesDir = path.join(clientStoreDir, "pages");

const serverServiceDir = path.join(serverDir, "service");
const serverRepositoryDir = path.join(serverDir, "repository");
const clientComponentsDir = path.join(clientDir, "components");

const isInside = (targetDir, filePath) => {
  const normalizedTarget = path.normalize(targetDir);
  const normalizedFile = path.normalize(filePath);

  return (
    normalizedFile === normalizedTarget ||
    normalizedFile.startsWith(`${normalizedTarget}${path.sep}`)
  );
};

const resolveImportPath = (importSource, currentFilePath) => {
  if (importSource.startsWith(".")) {
    return path.resolve(path.dirname(currentFilePath), importSource);
  }

  if (importSource.startsWith("@/")) {
    return path.resolve(projectRoot, importSource.slice(2));
  }

  if (importSource.startsWith("/")) {
    return path.resolve(projectRoot, importSource.slice(1));
  }

  return null;
};

let topLevelDirectoryViolations = null;
let hasReportedTopLevelDirectoryViolations = false;

const getUnexpectedDirectories = (baseDir, allowedDirectories) => {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((directoryName) => !allowedDirectories.includes(directoryName));
};

const createImportVisitors = (checkImport) => ({
  ImportDeclaration(node) {
    checkImport(node.source, node.source.value);
  },
  ExportNamedDeclaration(node) {
    if (!node.source) {
      return;
    }

    checkImport(node.source, node.source.value);
  },
  ExportAllDeclaration(node) {
    checkImport(node.source, node.source.value);
  },
  CallExpression(node) {
    if (
      node.callee.type === "Identifier" &&
      node.callee.name === "require" &&
      node.arguments.length > 0 &&
      node.arguments[0].type === "Literal"
    ) {
      checkImport(node.arguments[0], node.arguments[0].value);
    }
  },
});

const getFileNameWithoutExt = (filePath) => {
  const ext = path.extname(filePath);
  return path.basename(filePath, ext);
};

const getRelativePathSegments = (baseDir, targetPath) => {
  const relativePath = path.relative(baseDir, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return [];
  }

  return relativePath.split(path.sep).filter(Boolean);
};

const architecturePlugin = {
  rules: {
    "no-app-imports": {
      meta: {
        type: "problem",
        docs: {
          description: "app 配下のファイルへの import を禁止する",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath) {
            return;
          }

          if (isInside(appDir, resolvedPath)) {
            context.report({
              node,
              message:
                "app ディレクトリ配下のファイルを他所から参照してはいけません。",
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "no-same-layer-dependency": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/actions|services|repositorys|store/app|store/pages, server/service|repository で同レイヤー依存を禁止する",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        const layers = [
          { dir: clientActionsDir, label: "client/actions" },
          { dir: clientServicesDir, label: "client/services" },
          { dir: clientRepositorysDir, label: "client/repositorys" },
          { dir: clientStoreAppDir, label: "client/store/app" },
          { dir: clientStorePagesDir, label: "client/store/pages" },
          { dir: serverServiceDir, label: "server/service" },
          { dir: serverRepositoryDir, label: "server/repository" },
        ];

        const currentLayer = layers.find((layer) => isInside(layer.dir, filename));
        if (!currentLayer) {
          return {};
        }

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath) {
            return;
          }

          if (isInside(currentLayer.dir, resolvedPath)) {
            context.report({
              node,
              message: `${currentLayer.label} 内の同階層依存は禁止です。`,
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "no-client-server-cross-dependency": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client 配下と server 配下は互いに依存関係を持たず独立させる",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;
        const inClient = isInside(clientDir, filename);
        const inServer = isInside(serverDir, filename);

        if (!inClient && !inServer) {
          return {};
        }

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath) {
            return;
          }

          if (inClient && isInside(serverDir, resolvedPath)) {
            context.report({
              node,
              message: "client 配下から server 配下への依存は禁止です。",
            });
          }

          if (inServer && isInside(clientDir, resolvedPath)) {
            context.report({
              node,
              message: "server 配下から client 配下への依存は禁止です。",
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "restricted-client-layer-callers": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/components/actions/services/repositorys/store と server/service|repository の呼び出し元レイヤーを制限する",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        const restrictions = [
          {
            targetDir: clientComponentsDir,
            allowedImporterDirs: [appDir],
            message:
              "client/components は app 配下からのみ参照できます。",
          },
          {
            targetDir: clientActionsDir,
            allowedImporterDirs: [clientComponentsDir],
            message:
              "client/actions は client/components からのみ参照できます。",
          },
          {
            targetDir: clientServicesDir,
            allowedImporterDirs: [clientActionsDir],
            message:
              "client/services は client/actions からのみ参照できます。",
          },
          {
            targetDir: clientRepositorysDir,
            allowedImporterDirs: [clientServicesDir],
            message:
              "client/repositorys は client/services からのみ参照できます。",
          },
          {
            targetDir: clientStoreDir,
            allowedImporterDirs: [clientActionsDir],
            message: "client/store 配下は client/actions からのみ参照できます。",
          },
          {
            targetDir: serverServiceDir,
            allowedImporterDirs: [appDir],
            message:
              "server/service は app 配下からのみ参照できます。",
          },
          {
            targetDir: serverRepositoryDir,
            allowedImporterDirs: [serverServiceDir],
            message:
              "server/repository は server/service からのみ参照できます。",
          },
        ];

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath) {
            return;
          }

          for (const restriction of restrictions) {
            if (!isInside(restriction.targetDir, resolvedPath)) {
              continue;
            }

            const isAllowedImporter = restriction.allowedImporterDirs.some(
              (allowedDir) => isInside(allowedDir, filename),
            );

            if (!isAllowedImporter) {
              context.report({
                node,
                message: restriction.message,
              });
            }
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "no-client-store-app-pages-cross-dependency": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/store/app と client/store/pages の相互依存を禁止する",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;
        const inStoreApp = isInside(clientStoreAppDir, filename);
        const inStorePages = isInside(clientStorePagesDir, filename);

        if (!inStoreApp && !inStorePages) {
          return {};
        }

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath) {
            return;
          }

          if (inStoreApp && isInside(clientStorePagesDir, resolvedPath)) {
            context.report({
              node,
              message:
                "client/store/app から client/store/pages への依存は禁止です。",
            });
          }

          if (inStorePages && isInside(clientStoreAppDir, resolvedPath)) {
            context.report({
              node,
              message:
                "client/store/pages から client/store/app への依存は禁止です。",
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "allowed-top-level-directories": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/server 直下の許可ディレクトリ以外の存在を禁止する",
        },
        schema: [],
      },
      create(context) {
        return {
          Program(node) {
            if (hasReportedTopLevelDirectoryViolations) {
              return;
            }

            if (!topLevelDirectoryViolations) {
              const clientUnexpectedDirectories = getUnexpectedDirectories(
                clientDir,
                ["components", "actions", "services", "repositorys", "store"],
              );
              const serverUnexpectedDirectories = getUnexpectedDirectories(
                serverDir,
                ["service", "repository"],
              );

              topLevelDirectoryViolations = [
                ...clientUnexpectedDirectories.map((directoryName) => ({
                  message: `client 直下に許可されていないディレクトリがあります: ${directoryName}`,
                })),
                ...serverUnexpectedDirectories.map((directoryName) => ({
                  message: `server 直下に許可されていないディレクトリがあります: ${directoryName}`,
                })),
              ];
            }

            if (topLevelDirectoryViolations.length === 0) {
              return;
            }

            hasReportedTopLevelDirectoryViolations = true;

            for (const violation of topLevelDirectoryViolations) {
              context.report({
                node,
                message: violation.message,
              });
            }
          },
        };
      },
    },

    "layer-file-naming": {
      meta: {
        type: "problem",
        docs: {
          description:
            "components 以外の各レイヤー配下ファイル名はレイヤー名サフィックスを必須にする",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        const namingRules = [
          { dir: clientActionsDir, suffix: "Action", label: "client/actions" },
          { dir: clientServicesDir, suffix: "Service", label: "client/services" },
          {
            dir: clientRepositorysDir,
            suffix: "Repository",
            label: "client/repositorys",
          },
          { dir: serverServiceDir, suffix: "Service", label: "server/service" },
          {
            dir: serverRepositoryDir,
            suffix: "Repository",
            label: "server/repository",
          },
        ];

        const targetRule = namingRules.find((rule) => isInside(rule.dir, filename));
        if (!targetRule) {
          return {};
        }

        return {
          Program(node) {
            const name = getFileNameWithoutExt(filename);

            if (name === "index") {
              return;
            }

            if (!name.endsWith(targetRule.suffix)) {
              context.report({
                node,
                message: `${targetRule.label} 配下のファイル名は ${targetRule.suffix} で終わる必要があります。`,
              });
            }
          },
        };
      },
    },

    "store-pages-action-page-boundary": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/store/pages のファイルは同一ページの client/actions からのみ参照可能にする",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        if (!isInside(clientActionsDir, filename)) {
          return {};
        }

        const importerSegments = getRelativePathSegments(clientActionsDir, filename);
        const importerPage = importerSegments[0];

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath || !isInside(clientStorePagesDir, resolvedPath)) {
            return;
          }

          const targetSegments = getRelativePathSegments(
            clientStorePagesDir,
            resolvedPath,
          );
          const targetPage = targetSegments[0];

          if (!importerPage || !targetPage) {
            return;
          }

          if (importerPage !== targetPage) {
            context.report({
              node,
              message:
                "client/store/pages は同一ページの client/actions からのみ参照できます。",
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },

    "actions-components-component-boundary": {
      meta: {
        type: "problem",
        docs: {
          description:
            "client/actions の参照は同一ページ・同一コンポーネントの client/components からのみに制限する",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename;

        if (!isInside(clientComponentsDir, filename)) {
          return {};
        }

        const importerSegments = getRelativePathSegments(clientComponentsDir, filename);
        const importerPage = importerSegments[0];
        const importerComponent = importerSegments[1];

        const checkImport = (node, importSource) => {
          if (typeof importSource !== "string") {
            return;
          }

          const resolvedPath = resolveImportPath(importSource, filename);
          if (!resolvedPath || !isInside(clientActionsDir, resolvedPath)) {
            return;
          }

          const targetSegments = getRelativePathSegments(clientActionsDir, resolvedPath);
          const targetPage = targetSegments[0];
          const targetComponent = targetSegments[1];

          if (
            !importerPage ||
            !importerComponent ||
            !targetPage ||
            !targetComponent
          ) {
            return;
          }

          if (
            importerPage !== targetPage ||
            importerComponent !== targetComponent
          ) {
            context.report({
              node,
              message:
                "client/actions は同一ページ・同一コンポーネントの client/components からのみ参照できます。",
            });
          }
        };

        return createImportVisitors(checkImport);
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}"],
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      "max-lines": ["error", { max: 500 }],
      "architecture/no-app-imports": "error",
      "architecture/no-same-layer-dependency": "error",
      "architecture/no-client-server-cross-dependency": "error",
      "architecture/restricted-client-layer-callers": "error",
      "architecture/no-client-store-app-pages-cross-dependency": "error",
      "architecture/allowed-top-level-directories": "error",
      "architecture/layer-file-naming": "error",
      "architecture/store-pages-action-page-boundary": "error",
      "architecture/actions-components-component-boundary": "error",
    },
  },
  {
    files: ["eslint.config.mjs"],
    rules: {
      "max-lines": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
