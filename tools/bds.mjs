// Prueba el addon en un servidor dedicado de Bedrock (BDS) sin abrir el juego.
//
//   node tools/bds.mjs setup <carpeta-del-mundo> [nombre]   prepara el servidor (copia mundo y packs)
//   node tools/bds.mjs sync                                  recopia los packs desde dist/packages
//   node tools/bds.mjs run "wait 20" "scriptevent bastion:start" "wait 30"   arranca, ejecuta pasos y apaga
//
// El servidor se busca en la variable BDS_DIR (por defecto ../BedrockServer/server, junto al repo).
// Pasos de `run`: "wait N" espera N segundos; cualquier otra cosa es un comando de consola.
// Muestra y guarda todo el registro en <BDS_DIR>/../last-run.log (incluye errores de scripts y de packs).

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bds = resolve(process.env.BDS_DIR ?? join(repo, "..", "..", "BedrockServer", "server"));
const levelName = "bastion_test";

const bpManifest = JSON.parse(readFileSync(join(repo, "behavior_packs/bastion/manifest.json"), "utf8"));
const rpManifest = JSON.parse(readFileSync(join(repo, "resource_packs/bastion/manifest.json"), "utf8"));

function unzip(zip, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync("python", ["-I", "-c", "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zip, dest]);
}

function syncPacks() {
  unzip(join(repo, "dist/packages/bastion_bp.mcpack"), join(bds, "behavior_packs/bastion_bp"));
  unzip(join(repo, "dist/packages/bastion_rp.mcpack"), join(bds, "resource_packs/bastion_rp"));
  const world = join(bds, "worlds", levelName);
  if (existsSync(world)) {
    writeFileSync(join(world, "world_behavior_packs.json"), JSON.stringify([{ pack_id: bpManifest.header.uuid, version: bpManifest.header.version }]));
    writeFileSync(join(world, "world_resource_packs.json"), JSON.stringify([{ pack_id: rpManifest.header.uuid, version: rpManifest.header.version }]));
  }
  console.log("Packs sincronizados (BP", bpManifest.header.version.join("."), ").");
}

function setProp(key, value) {
  const file = join(bds, "server.properties");
  let text = readFileSync(file, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
  writeFileSync(file, text);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "setup") {
  const src = resolve(args[0] ?? "");
  if (!existsSync(join(src, "level.dat"))) throw new Error("Indica la carpeta de un mundo (con level.dat).");
  const dest = join(bds, "worlds", levelName);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  setProp("level-name", levelName);
  setProp("allow-cheats", "true");
  setProp("gamemode", "creative");
  setProp("online-mode", "false");
  setProp("allow-list", "false");
  setProp("enable-lan-visibility", "true");
  setProp("default-player-permission-level", "operator");
  setProp("content-log-file-enabled", "true");
  setProp("content-log-console-output-enabled", "true");
  syncPacks();
  console.log("Servidor listo en", bds);
} else if (cmd === "sync") {
  syncPacks();
} else if (cmd === "run") {
  const logPath = join(bds, "..", "last-run.log");
  const log = createWriteStream(logPath);
  const child = spawn(join(bds, "bedrock_server.exe"), [], { cwd: bds });
  let buffer = "";
  let ready;
  const readyPromise = new Promise((r) => (ready = r));
  const onData = (d) => {
    const text = d.toString();
    process.stdout.write(text);
    log.write(text);
    buffer += text;
    if (buffer.includes("Server started.")) ready();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const exited = new Promise((r) => child.on("exit", r));
  const send = (line) => {
    console.log(`\n>>> ${line}`);
    log.write(`\n>>> ${line}\n`);
    child.stdin.write(`${line}\n`);
  };
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

  await Promise.race([readyPromise, sleep(120)]);
  if (!buffer.includes("Server started.")) console.log("\n!!! El servidor no llegó a arrancar en 120 s");
  await sleep(3);
  for (const step of args) {
    const m = /^wait\s+(\d+(?:\.\d+)?)$/.exec(step);
    if (m) await sleep(Number(m[1]));
    else send(step);
    await sleep(1);
  }
  send("stop");
  await Promise.race([exited, sleep(30)]);
  child.kill();
  log.end();
  console.log(`\nRegistro guardado en ${logPath}`);
} else if (cmd === "serve") {
  // Deja el servidor encendido para entrar con el juego (Servidores > Añadir servidor > IP del PC, puerto 19132).
  // Para mandarle órdenes sin consola, escribe líneas en <BDS_DIR>/../cmd.txt (una orden por línea); `stop` lo apaga.
  const logPath = join(bds, "..", "serve.log");
  const cmdPath = join(bds, "..", "cmd.txt");
  writeFileSync(cmdPath, "");
  const log = createWriteStream(logPath);
  const child = spawn(join(bds, "bedrock_server.exe"), [], { cwd: bds });
  const onData = (d) => { process.stdout.write(d); log.write(d); };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const timer = setInterval(() => {
    const lines = readFileSync(cmdPath, "utf8").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return;
    writeFileSync(cmdPath, "");
    for (const line of lines) {
      log.write(`\n>>> ${line}\n`);
      child.stdin.write(`${line}\n`);
    }
  }, 1000);
  await new Promise((r) => child.on("exit", r));
  clearInterval(timer);
  log.end();
} else {
  console.error("Uso: node tools/bds.mjs setup <mundo> | sync | run <pasos...> | serve");
  process.exit(1);
}
