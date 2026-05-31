use lettre::{Message, SmtpTransport, Transport};
use lettre::transport::smtp::authentication::Credentials;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub secure: bool,
    pub username: String,
    pub password: String,
    pub from_email: String,
}

#[derive(Debug, serde::Serialize)]
pub struct EmailResult {
    pub success: bool,
    pub message: String,
}

pub fn send_verification_email(
    config: &SmtpConfig,
    to_email: &str,
    code: &str,
    purpose: &str,
) -> Result<EmailResult, String> {
    let subject = match purpose {
        "password_reset" => "【Writing Studio】验证码 - 密码重置",
        "register" => "【Writing Studio】验证码 - 邮箱验证",
        _ => "【Writing Studio】验证码",
    };

    let body = format!(
        "您好，\n\n您的验证码是：{}（{}分钟内有效）\n\n请在页面输入此验证码完成验证。\n\n如非本人操作，请忽略此邮件。\n\n-- Writing Studio",
        code,
        10
    );

    let email = Message::builder()
        .from(config.from_email.parse().map_err(|e| format!("Invalid from email: {}", e))?)
        .to(to_email.parse().map_err(|e| format!("Invalid to email: {}", e))?)
        .subject(subject)
        .body(body.to_string())
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let mailer = SmtpTransport::relay(&config.host)
        .map_err(|e| format!("SMTP connection error: {}", e))?
        .port(config.port)
        .credentials(Credentials::new(config.username.clone(), config.password.clone()))
        .build();

    mailer.send(&email).map_err(|e| format!("Send error: {}", e))?;

    Ok(EmailResult {
        success: true,
        message: "Email sent successfully".to_string(),
    })
}