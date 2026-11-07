import { argv, parallel, series, task, tscTask } from "just-scripts";
import {
  BundleTaskParameters,
  CopyTaskParameters,
  bundleTask,
  cleanTask,
  cleanCollateralTask,
  copyTask,
  mcaddonTask,
  setupEnvironment,
  ZipTaskParameters,
  STANDARD_CLEAN_PATHS,
  DEFAULT_CLEAN_DIRECTORIES,
  getOrThrowFromProcess,
  watchTask,
} from "@minecraft/core-build-tasks";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { unitFiles } from "./tools/units/generate";

// Variables de entorno (.env)
setupEnvironment(path.resolve(__dirname, ".env"));
const projectName = getOrThrowFromProcess("PROJECT_NAME");

// `npm run build:production` elimina las sentencias etiquetadas con `dev:`.
const isProduction = argv()["production"];

const bundleTaskOptions: BundleTaskParameters = {
  entryPoint: path.join(__dirname, "./scripts/main.ts"),
  external: ["@minecraft/server", "@minecraft/server-ui"],
  outfile: path.resolve(__dirname, "./dist/scripts/main.js"),
  minifyWhitespace: false,
  sourcemap: true,
  outputSourcemapPath: path.resolve(__dirname, "./dist/debug"),
  dropLabels: isProduction ? ["dev"] : undefined,
};

const copyTaskOptions: CopyTaskParameters = {
  copyToBehaviorPacks: [`./behavior_packs/${projectName}`],
  copyToScripts: ["./dist/scripts"],
  copyToResourcePacks: [`./resource_packs/${projectName}`],
};

const mcaddonTaskOptions: ZipTaskParameters = {
  ...copyTaskOptions,
  outputFile: `./dist/packages/${projectName}.mcaddon`,
};

// Unidades: genera sus archivos de los packs a partir de las fichas (scripts/units/catalog.ts)
task("units", () => {
  const files = unitFiles((p) => readFileSync(path.resolve(__dirname, p), "utf-8"));
  let changed = 0;
  for (const [file, text] of files) {
    const full = path.resolve(__dirname, file);
    let old = "";
    try {
      old = readFileSync(full, "utf-8");
    } catch {}
    if (old.replace(/\r\n/g, "\n") === text) continue;
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
    changed++;
    console.log(`  ${file}`);
  }
  console.log(`Unidades: ${changed} archivo(s) actualizado(s) de ${files.size}.`);
});

// Build
task("typescript", tscTask());
task("bundle", bundleTask(bundleTaskOptions));
task("build", series("units", "typescript", "bundle"));

// Clean
task("clean-local", cleanTask(DEFAULT_CLEAN_DIRECTORIES));
task("clean-collateral", cleanCollateralTask(STANDARD_CLEAN_PATHS));
task("clean", parallel("clean-local", "clean-collateral"));

// Package
task("copyArtifacts", copyTask(copyTaskOptions));
task("package", series("clean-collateral", "copyArtifacts"));

// Despliegue local al juego (observa cambios y recompila)
task(
  "local-deploy",
  watchTask(
    ["scripts/**/*.ts", "behavior_packs/**/*.{json,lang,png}", "resource_packs/**/*.{json,lang,png}"],
    series("clean-local", "build", "package")
  )
);

// .mcaddon
task("createMcaddonFile", mcaddonTask(mcaddonTaskOptions));
task("mcaddon", series("clean-local", "build", "createMcaddonFile"));
