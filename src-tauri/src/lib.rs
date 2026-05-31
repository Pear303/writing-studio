mod email;

use email::{SmtpConfig, EmailResult, send_verification_email};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            send_verification_email_command
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