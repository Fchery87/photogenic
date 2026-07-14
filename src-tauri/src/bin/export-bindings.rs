use specta_typescript::{BigIntExportBehavior, Typescript};

fn main() {
    let builder = app_lib::specta_builder();
    builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            "app/bindings.ts",
        )
        .expect("failed to export tauri-specta bindings");
    println!("bindings exported to app/bindings.ts");
}
