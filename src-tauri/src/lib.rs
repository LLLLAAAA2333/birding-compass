#[tauri::command]
fn open_apple_maps(url: String) -> Result<(), String> {
    if !url.starts_with("https://maps.apple.com/?") {
        return Err("无效的苹果地图链接".into());
    }

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .args(["-b", "com.apple.Maps", &url])
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("无法打开 macOS 地图".into())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("仅 macOS 支持打开地图 App".into())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.personal.birdwatch.ebird", "api-key")
        .map_err(|_| "无法访问系统凭据管理器".into())
}

#[tauri::command]
async fn load_api_key() -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(|| match api_key_entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取系统凭据管理器中的 API Key".into()),
        })
        .await
        .map_err(|_| "读取 API Key 时发生内部错误".to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("当前平台尚不支持保存 API Key".into())
    }
}

#[tauri::command]
async fn save_api_key(key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API Key 不能为空".into());
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            api_key_entry()?
                .set_password(key.trim())
                .map_err(|_| "无法将 API Key 保存到系统凭据管理器".into())
        })
        .await
        .map_err(|_| "保存 API Key 时发生内部错误".to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("当前平台尚不支持保存 API Key".into())
    }
}

#[tauri::command]
async fn clear_api_key() -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(|| match api_key_entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法从系统凭据管理器清除 API Key".into()),
        })
        .await
        .map_err(|_| "清除 API Key 时发生内部错误".to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("当前平台尚不支持保存 API Key".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            open_apple_maps,
            load_api_key,
            save_api_key,
            clear_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
