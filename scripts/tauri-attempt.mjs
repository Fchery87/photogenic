import { spawnSync } from "node:child_process";
const check = (command, args) => { const result = spawnSync(command, args, { encoding: "utf8" }); if (result.error) return { ok: false, detail: result.error.message }; return { ok: result.status === 0, detail: (result.stdout || result.stderr || "").trim() }; };
const cargo = check("cargo", ["--version"]); const rustc = check("rustc", ["--version"]); const tauri = check("npx", ["-y", "@tauri-apps/cli@latest", "-V"]);
console.log("=== Tauri Attempt Preflight ===");
console.log(`cargo: ${cargo.ok ? cargo.detail : `MISSING (${cargo.detail})`}`);
console.log(`rustc: ${rustc.ok ? rustc.detail : `MISSING (${rustc.detail})`}`);
console.log(`tauri: ${tauri.ok ? tauri.detail : `MISSING (${tauri.detail})`}`);
if (!cargo.ok || !rustc.ok) { console.error("BLOCKED: cannot scaffold or run a real Tauri shell in this environment because Cargo/Rust is unavailable. Per ADR-0004 honesty constraints, the browser harness remains the only runnable shell here."); process.exit(2); }
console.log("READY: Cargo/Rust is available. A real Tauri shell scaffold can be attempted on this machine.");
