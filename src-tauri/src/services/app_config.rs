use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppConfigService {
    config_path: PathBuf,
    cache: Mutex<serde_json::Map<String, serde_json::Value>>,
}

impl AppConfigService {
    pub fn new(app_data_dir: &PathBuf) -> Self {
        let config_dir = app_data_dir.join("config");
        fs::create_dir_all(&config_dir).ok();
        let config_path = config_dir.join("app_config.json");

        let cache = fs::read_to_string(&config_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();

        AppConfigService {
            config_path,
            cache: Mutex::new(cache),
        }
    }

    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        let cache = self.cache.lock().unwrap();
        cache.get(key).cloned()
    }

    pub fn set(&self, key: &str, value: serde_json::Value) {
        let mut cache = self.cache.lock().unwrap();
        cache.insert(key.to_string(), value);
        if let Ok(content) = serde_json::to_string_pretty(&*cache) {
            fs::write(&self.config_path, content).ok();
        }
    }
}
