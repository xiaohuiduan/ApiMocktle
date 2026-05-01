mod commands;
mod db;
mod errors;
mod http;
mod models;
mod services;
mod ws;

use std::sync::Arc;

use db::client::init_database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let db = Arc::new(init_database(&app_data_dir));
            let db_http = db.clone();
            app.manage(db);

            // Start WebSocket server
            let ws_port = 19876u16;
            tauri::async_runtime::spawn(async move {
                match ws::collab_server::start(ws_port).await {
                    Ok(server) => {
                        log::info!("Collab WebSocket server started on port {}", server.port);
                    }
                    Err(e) => {
                        log::error!("Failed to start WebSocket server: {}", e);
                    }
                }
            });

            // Start YApi HTTP server for EasyAPI plugin
            let yapi_handle = Arc::new(http::yapi_server::YApiServerHandle::new());
            let yapi_handle_clone = yapi_handle.clone();
            tauri::async_runtime::spawn(async move {
                http::yapi_server::start_yapi_server(db_http, yapi_handle_clone, 14202).await;
            });
            app.manage(yapi_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::auth::login,
            commands::auth::register,
            commands::auth::logout,
            commands::auth::get_current_user,
            // Projects
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::projects::get_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::projects::get_project_state,
            commands::projects::list_project_members,
            commands::projects::add_project_member,
            commands::projects::update_member_role,
            commands::projects::remove_project_member,
            commands::projects::list_project_invitations,
            commands::projects::create_project_invitation,
            commands::projects::revoke_project_invitation,
            commands::projects::get_project_invitation,
            commands::projects::accept_project_invitation,
            // Menu items
            commands::menu_items::list_menu_items,
            commands::menu_items::create_menu_item,
            commands::menu_items::update_menu_item,
            commands::menu_items::delete_menu_item,
            commands::menu_items::move_menu_items,
            commands::menu_items::batch_delete_menu_items,
            // Recycle
            commands::recycle::list_recycle_items,
            commands::recycle::restore_recycle_item,
            commands::recycle::delete_recycle_items,
            // Environments
            commands::environments::get_project_environments,
            commands::environments::save_project_environments,
            // Imports/Exports
            commands::imports::import_api_document,
            commands::exports::export_openapi,
            commands::exports::write_export_file,
            // Request runner
            commands::request_runner::run_api_request,
            // Shared docs
            commands::shared_docs::list_shared_docs,
            commands::shared_docs::create_shared_doc,
            commands::shared_docs::get_shared_doc,
            commands::shared_docs::save_shared_doc,
            commands::shared_docs::delete_shared_doc,
            commands::shared_docs::export_shared_doc,
            // Shared files
            commands::shared_files::list_shared_files,
            commands::shared_files::upload_shared_file,
            commands::shared_files::delete_shared_file,
            commands::shared_files::download_shared_file,
            // Collab
            commands::collab::get_collab_state,
            commands::collab::apply_collab_update,
            commands::collab::update_presence,
            commands::collab::get_doc_presence,
            // Tokens
            commands::tokens::list_project_tokens,
            commands::tokens::create_project_token,
            commands::tokens::delete_project_token,
            commands::tokens::get_yapi_server_info,
            commands::tokens::restart_yapi_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
