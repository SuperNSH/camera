//! The platform backends. Every module compiles on every target: a bridge without a wired
//! native link resolves not-available, and a target with no bridge at all takes the
//! `UnsupportedBackend`.

pub mod android;
pub mod apple;
pub mod linux;
pub mod unsupported;
pub mod windows;

pub use android::AndroidBackend;
pub use apple::AppleBackend;
pub use linux::LinuxBackend;
pub use unsupported::UnsupportedBackend;
pub use windows::WindowsBackend;
