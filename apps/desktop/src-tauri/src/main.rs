#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::{
    fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Default)]
struct GatewayState {
    pid: Option<u32>,
    ready: Option<serde_json::Value>,
    error: Option<String>,
}
#[derive(Default)]
struct DesktopState {
    gateway: Mutex<GatewayState>,
    active_tasks: AtomicUsize,
    quitting: AtomicBool,
    confirming_quit: AtomicBool,
    restarting: AtomicBool,
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn bounce_dock(window: tauri::Window) {
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
}
#[tauri::command]
fn get_gateway_info(state: tauri::State<'_, DesktopState>) -> Option<serde_json::Value> {
    state.gateway.lock().unwrap().ready.clone()
}
#[tauri::command]
fn get_gateway_error(state: tauri::State<'_, DesktopState>) -> Option<String> {
    state.gateway.lock().unwrap().error.clone()
}
#[tauri::command]
fn set_active_tasks(count: usize, state: tauri::State<'_, DesktopState>) {
    state.active_tasks.store(count, Ordering::SeqCst);
}

fn runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // A test/development override is explicit; installed apps own a separate persistent profile.
    if let Some(dir) = std::env::var_os("PIKO_DESKTOP_DATA_DIR")
        .or_else(|| std::env::var_os("CREWLOOM_DESKTOP_DATA_DIR"))
    {
        return Ok(PathBuf::from(dir));
    }
    app.path()
        .app_data_dir()
        .map(|p| p.join("runtime"))
        .map_err(|e| e.to_string())
}

fn record_error(app: &tauri::AppHandle, message: String) {
    app.state::<DesktopState>().gateway.lock().unwrap().error = Some(message.clone());
    let _ = app.emit("gateway-error", &message);
    eprintln!("[desktop] {}", message);
}

fn tool_path(sidecar: &std::path::Path) -> String {
    let mut base = std::env::var("PATH").unwrap_or_default();
    // Finder supplies a minimal PATH. Bound shell discovery so a user's shell setup cannot hang boot.
    if let Ok(mut shell) = Command::new("/bin/zsh")
        .args(["-l", "-c", "printenv PATH"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        for _ in 0..30 {
            if shell.try_wait().ok().flatten().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if shell.try_wait().ok().flatten().is_none() {
            let _ = shell.kill();
        }
        if let Ok(output) = shell.wait_with_output() {
            if output.status.success() {
                if let Some(path) = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .rev()
                    .find(|s| s.starts_with('/'))
                {
                    base = path.to_string();
                }
            }
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let mut paths = vec![
        sidecar.to_string_lossy().to_string(),
        format!("{home}/.local/bin"),
        format!("{home}/Library/pnpm"),
        format!("{home}/.local/share/pnpm"),
        format!("{home}/.cargo/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
    ];
    if let Ok(entries) = fs::read_dir(format!("{home}/.nvm/versions/node")) {
        let mut versions: Vec<_> = entries
            .flatten()
            .map(|e| e.path().join("bin"))
            .filter(|p| p.is_dir())
            .collect();
        versions.sort();
        paths.extend(
            versions
                .iter()
                .rev()
                .map(|p| p.to_string_lossy().to_string()),
        );
    }
    paths.push(base);
    paths.join(":")
}

fn start_gateway(app: &tauri::AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let state = app.state::<DesktopState>();
    let mut guard = state.gateway.lock().unwrap();
    if guard.pid.is_some() {
        return Ok(());
    }
    guard.ready = None;
    guard.error = None;
    let sidecar = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("sidecar");
    let profile = runtime_dir(app)?;
    let projects = profile.join("projects");
    fs::create_dir_all(&projects).map_err(|e| e.to_string())?;
    let stderr = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .mode(0o600)
        .open(profile.join("desktop-stderr.log"))
        .map_err(|e| e.to_string())?;
    let path = tool_path(&sidecar);
    let mut child = Command::new(sidecar.join("node"))
        .arg(sidecar.join("gateway.js"))
        .current_dir(&projects)
        .env("PATH", path)
        .env("WEB_DIR", sidecar.join("web"))
        .env("PIKO_CONFIG_DIR", &profile)
        .env("PIKO_DESKTOP", "1")
        .env("PIKO_DISABLE_PROCESS_SCAN", "1")
        .env("WORKSPACE", &projects)
        .env("WS_PORT", "0")
        .env("GATEWAY_ID", "desktop")
        .env("NODE_ENV", "production")
        .env("NO_OPEN", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(stderr))
        // Own process group: force cleanup can never signal unrelated agents or other apps.
        .process_group(0)
        .spawn()
        .map_err(|e| format!("本地服务无法启动：{e}"))?;
    let pid = child.id();
    guard.pid = Some(pid);
    drop(guard);
    let stdout = child.stdout.take().ok_or("无法读取本地服务状态")?;
    let reader_app = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(payload) = line.strip_prefix("GATEWAY_READY ") {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                    if value
                        .get("port")
                        .and_then(|v| v.as_u64())
                        .is_some_and(|p| p > 0 && p <= 65535)
                    {
                        let state = reader_app.state::<DesktopState>();
                        let mut guard = state.gateway.lock().unwrap();
                        if guard.pid == Some(pid) {
                            guard.ready = Some(value.clone());
                            guard.error = None;
                            let _ = reader_app.emit("gateway-ready", value);
                        }
                    }
                }
            }
        }
    });
    let monitor_app = app.clone();
    std::thread::spawn(move || {
        let exit = child.wait();
        let state = monitor_app.state::<DesktopState>();
        let mut guard = state.gateway.lock().unwrap();
        if guard.pid == Some(pid) {
            guard.pid = None;
            guard.ready = None;
            drop(guard);
            eprintln!("[desktop] gateway exited: {exit:?}");
            record_error(
                &monitor_app,
                "本地服务已停止。点击“重新启动”恢复，项目文件和聊天记录仍保存在本机。".into(),
            );
        }
    });
    Ok(())
}

fn stop_gateway(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    let mut guard = state.gateway.lock().unwrap();
    let pid = guard.pid.take();
    guard.ready = None;
    drop(guard);
    if let Some(pid) = pid {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        for _ in 0..50 {
            std::thread::sleep(Duration::from_millis(100));
            if unsafe { libc::kill(pid as i32, 0) } != 0 {
                return;
            }
        }
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
}

#[tauri::command]
async fn restart_gateway(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    if state.active_tasks.load(Ordering::SeqCst) > 0 && state.gateway.lock().unwrap().pid.is_some()
    {
        return Err("还有任务正在运行，请先在群聊中停止任务。".into());
    }
    if state.restarting.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let result = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            stop_gateway(&app);
            start_gateway(&app)
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    app.state::<DesktopState>()
        .restarting
        .store(false, Ordering::SeqCst);
    if let Err(ref error) = result {
        record_error(&app, error.clone());
    }
    result
}

fn request_quit(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    if state.active_tasks.load(Ordering::SeqCst) == 0 {
        state.quitting.store(true, Ordering::SeqCst);
        app.exit(0);
    } else if !state.confirming_quit.swap(true, Ordering::SeqCst) {
        let handle = app.clone();
        app.dialog()
            .message("退出会中断正在运行的任务。只关闭窗口，可以让团队继续在后台工作。")
            .title("退出 Piko？")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "退出应用".into(),
                "继续运行".into(),
            ))
            .show(move |confirmed| {
                let state = handle.state::<DesktopState>();
                state.confirming_quit.store(false, Ordering::SeqCst);
                if confirmed {
                    state.quitting.store(true, Ordering::SeqCst);
                    handle.exit(0);
                }
            });
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(DesktopState::default())
        .setup(|app| {
            let settings = MenuItem::with_id(app, "settings", "设置…", true, Some("CmdOrCtrl+,"))?;
            let quit = MenuItem::with_id(app, "quit", "退出 Piko", true, Some("CmdOrCtrl+Q"))?;
            let show = MenuItem::with_id(app, "show", "显示 Piko", true, None::<&str>)?;
            let logs = MenuItem::with_id(app, "data", "打开本地数据文件夹", true, None::<&str>)?;
            let app_menu = Submenu::with_items(
                app,
                "Piko",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("关于 Piko"), None)?,
                    &settings,
                    &logs,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("隐藏 Piko"))?,
                    &PredefinedMenuItem::hide_others(app, Some("隐藏其他应用"))?,
                    &PredefinedMenuItem::show_all(app, Some("显示全部"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?;
            let edit = Submenu::with_items(
                app,
                "编辑",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("撤销"))?,
                    &PredefinedMenuItem::redo(app, Some("重做"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("剪切"))?,
                    &PredefinedMenuItem::copy(app, Some("复制"))?,
                    &PredefinedMenuItem::paste(app, Some("粘贴"))?,
                    &PredefinedMenuItem::select_all(app, Some("全选"))?,
                ],
            )?;
            let window = Submenu::with_items(
                app,
                "窗口",
                true,
                &[
                    &show,
                    &PredefinedMenuItem::minimize(app, Some("最小化"))?,
                    &PredefinedMenuItem::maximize(app, Some("缩放"))?,
                    &PredefinedMenuItem::close_window(app, Some("关闭窗口（后台运行）"))?,
                ],
            )?;
            app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &window])?)?;
            app.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => show_main(app),
                "quit" => request_quit(app),
                "settings" => {
                    show_main(app);
                    let _ = app.emit("desktop-settings", ());
                }
                "data" => {
                    if let Ok(path) = runtime_dir(app) {
                        let _ = Command::new("/usr/bin/open").arg(path).spawn();
                    }
                }
                _ => (),
            });
            let tray_menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Piko · AI 团队")
                .menu(&tray_menu)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            let handle = app.handle().clone();
            // Show the loading window immediately while PATH discovery and service boot run in the background.
            std::thread::spawn(move || {
                if let Err(error) = start_gateway(&handle) {
                    record_error(&handle, error);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.set_fullscreen(false);
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            bounce_dock,
            get_gateway_info,
            get_gateway_error,
            set_active_tasks,
            restart_gateway
        ])
        .build(tauri::generate_context!())
        .expect("无法启动 Piko")
        .run(|app, event| match event {
            tauri::RunEvent::Reopen { .. } => show_main(app),
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !app.state::<DesktopState>().quitting.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_quit(app);
                }
            }
            tauri::RunEvent::Exit => stop_gateway(app),
            _ => (),
        });
}
