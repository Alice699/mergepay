fn main() {
    println!("cargo:rerun-if-changed=../src/lib.rs");
    println!("cargo:rerun-if-changed=../Cargo.toml");
    rialo_build_lib::build_script::setup_polkavm_artifact_build()
        .program_path("..")
        .run()
        .expect("failed to build MergePay's Rialo PolkaVM artifact");
}
