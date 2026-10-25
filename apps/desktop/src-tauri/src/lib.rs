//! Desktop shell: owns the window and the lifetime of the local Noburi runtime.
//!
//! The runtime is a separate Node process bound to 127.0.0.1 with an ephemeral token. The shell starts
//! it, reads its single ready line, and hands port and token to the webview through `runtime_info`.
//! The token is never logged.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{Manager, RunEvent, State};

/// Origins the runtime accepts: the Vite dev server and the packaged webview on each platform.
const ALLOWED_ORIGINS: &str = "http://localhost:1420,tauri://localhost,http://tauri.localhost";
const READY_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Serialize)]
struct RuntimeInfo {
    url: String,
    token: String,
}

type ReadySlot = Arc<(Mutex<Option<Result<RuntimeInfo, String>>>, Condvar)>;

struct Runtime {
    child: Mutex<Option<Child>>,
    ready: ReadySlot,
}

/// Starts the runtime. Development runs it from the workspace with pnpm; packaged builds run the
/// bundled Node binary on the bundled runtime (see scripts/bundle-runtime.mjs).
fn spawn_runtime(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let mut command = if cfg!(debug_assertions) {
        let workspace = concat!(env!("CARGO_MANIFEST_DIR"), "/../../..");
        let mut command = Command::new("pnpm");
        command
            .args(["--filter", "@noburi/runtime", "start"])
            .current_dir(workspace);
        command
    } else {
        let dir = app
            .path()
            .resource_dir()
            .map_err(|error| std::io::Error::other(error.to_string()))?
            .join("runtime");
        let mut command = Command::new(dir.join("node"));
        command
            // node:sqlite still prints an experimental warning on every start.
            .arg("--disable-warning=ExperimentalWarning")
            .arg(dir.join("runtime.mjs"))
            // Use the user's installed Claude Code CLI: the SDK's own binary is not bundled.
            .env("NOBURI_PACKAGED", "1");
        command
    };
    command
        .env("NOBURI_ALLOWED_ORIGINS", ALLOWED_ORIGINS)
        // The runtime exits when this pipe closes, so a crashed shell never leaves it running.
        .env("NOBURI_EXIT_ON_STDIN_CLOSE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Own process group, so stopping it also stops its children.
        command.process_group(0);
    }
    command.spawn()
}

fn parse_ready(line: &str) -> Option<RuntimeInfo> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value.get("event")?.as_str()? != "runtime.ready" {
        return None;
    }
    let port = value.get("port")?.as_u64()?;
    let token = value.get("token")?.as_str()?.to_owned();
    Some(RuntimeInfo {
        url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

fn watch_stdout(child: &mut Child, ready: ReadySlot) {
    let Some(stdout) = child.stdout.take() else {
        return;
    };
    std::thread::spawn(move || {
        let mut announced = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if !announced {
                if let Some(info) = parse_ready(&line) {
                    log::info!("runtime ready on {}", info.url);
                    let (slot, signal) = &*ready;
                    *slot.lock().unwrap() = Some(Ok(info));
                    signal.notify_all();
                    announced = true;
                    continue;
                }
            }
            log::info!("[runtime] {line}");
        }
        let (slot, signal) = &*ready;
        let mut slot = slot.lock().unwrap();
        if slot.is_none() {
            *slot = Some(Err("the runtime exited before it was ready".into()));
            signal.notify_all();
        }
    });
}

fn stop_runtime(runtime: &Runtime) {
    let Some(mut child) = runtime.child.lock().unwrap().take() else {
        return;
    };
    #[cfg(unix)]
    {
        // Signal the whole group (pnpm, vpx, node); the runtime closes its server on SIGTERM.
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", child.id())])
            .status();
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

/// Waits for the runtime to be ready, then returns where to reach it.
#[tauri::command]
fn runtime_info(runtime: State<'_, Runtime>) -> Result<RuntimeInfo, String> {
    let (slot, signal) = &*runtime.ready;
    let guard = slot
        .lock()
        .map_err(|_| "runtime state poisoned".to_string())?;
    let (guard, timeout) = signal
        .wait_timeout_while(guard, READY_TIMEOUT, |value| value.is_none())
        .map_err(|_| "runtime state poisoned".to_string())?;
    if timeout.timed_out() {
        return Err("the runtime did not start in time".into());
    }
    guard
        .clone()
        .unwrap_or_else(|| Err("the runtime is not running".into()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let ready: ReadySlot = Arc::new((Mutex::new(None), Condvar::new()));
            let child = match spawn_runtime(app.handle()) {
                Ok(mut child) => {
                    watch_stdout(&mut child, ready.clone());
                    Some(child)
                }
                Err(error) => {
                    log::error!("could not start the runtime: {error}");
                    *ready.0.lock().unwrap() =
                        Some(Err(format!("could not start the runtime: {error}")));
                    None
                }
            };
            app.manage(Runtime {
                child: Mutex::new(child),
                ready,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![runtime_info])
        .build(tauri::generate_context!())
        .expect("error while building the Noburi desktop shell");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_runtime(&handle.state::<Runtime>());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::parse_ready;

    #[test]
    fn reads_the_ready_line() {
        let info = parse_ready(r#"{"event":"runtime.ready","port":4317,"token":"t"}"#).unwrap();
        assert_eq!(info.url, "http://127.0.0.1:4317");
        assert_eq!(info.token, "t");
    }

    #[test]
    fn ignores_other_output() {
        assert!(parse_ready("starting…").is_none());
        assert!(parse_ready(r#"{"event":"log","port":1}"#).is_none());
    }
}
