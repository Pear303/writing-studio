mod email;

use email::{SmtpConfig, EmailResult, send_verification_email};
use tauri_plugin_fs::FsExt;

#[tauri::command]
fn get_project_root() -> Result<String, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no parent")?
        .to_path_buf();

    // dev 模式: exe 在 src-tauri/target/debug/，往上3级到项目根
    // release 模式: exe 在安装目录，往上到包含 agent-by-langchain 的目录
    let mut root = exe_dir.clone();
    for _ in 0..5 {
        if root.join("agent-by-langchain").exists() {
            return Ok(root.to_string_lossy().to_string());
        }
        if !root.pop() {
            break;
        }
    }
    Ok(exe_dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let scope = app.fs_scope();
            if let Ok(root) = get_project_root() {
                let studio_data = std::path::Path::new(&root).join("agent-by-langchain").join("studio-data");
                let _ = scope.allow_directory(&studio_data, true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_verification_email_command,
            get_project_root
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn send_verification_email_command(
    smtp_config: SmtpConfig,
    to_email: String,
    code: String,
    purpose: String,
) -> Result<EmailResult, String> {
    send_verification_email(&smtp_config, &to_email, &code, &purpose)
}