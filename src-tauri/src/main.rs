// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]

fn main() {
  app_lib::run();
}
