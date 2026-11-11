// nsh-camera: docs contract, core API, four platform bridges, unit tests, status docs.
// Eight areas with disjoint files run in parallel; each area's chain is
// implement -> audit rounds (up to 3, until zero findings) inside its own
// callback. CI gates (cargo fmt/clippy/test) run in GitHub Actions only, never
// here (AGENTS.md); audits use the rustfmt formatter gate plus read-only review.
// The whole API contract (error codes, traits, mock scripting, test names) was
// predetermined by the launcher so parallel areas interlock without waiting.

const MODELS = {
  pro: model("account:zai-individual-coding-plan/GLM-5.3$high"),
};

const KIT = "/Users/hmziq/ZCodeProject/ai/harness/zcode/agents";
const REPO = "/Users/hmziq/fo/nsh-camera";

interface AuditFinding {
  /** File and line when it applies, e.g. "src/error.rs:42". */
  where: string;
  /** One sentence: what is wrong. */
  problem: string;
  /** "high" only when it would fail a CI gate (fmt, clippy -D warnings, tests) or break the locked contract. */
  severity: "low" | "medium" | "high";
}

interface Audit {
  /** Actionable findings only; an empty array means the area passed. No PASS notes. */
  issues: AuditFinding[];
  /** One sentence copied VERBATIM from your instructions that most shaped the review. */
  contractLine?: string;
}

interface ImplResult {
  /** True when every owned file was written as planned. */
  done: boolean;
  /** One or two sentences: what was implemented. */
  summary: string;
  /** Anything planned but not delivered, with the reason. */
  blockers?: string[];
  /** One sentence copied VERBATIM from your instructions that most shaped the work. */
  contractLine?: string;
}

interface FixResult {
  /** True when every finding was addressed. */
  done: boolean;
  /** One or two sentences: what changed. */
  summary: string;
  /** One sentence copied VERBATIM from your instructions that most shaped the fix. */
  contractLine?: string;
}

interface AreaResult {
  name: string;
  status: "done" | "not-converged" | "failed";
  summary: string;
  /** Audit rounds actually run, including the clean round when it converged. */
  rounds: number;
  /** Findings that remained when the cap hit; empty when converged or failed. */
  remainingIssues: string[];
  /** Whether the specialist persona delivery was verified by exact-substring check (null when no specialist). */
  personaVerified: boolean | null;
  blockers: string[];
}

interface ReportedFinding {
  where: string;
  what: string;
  evidence: string;
  status: "verified" | "unconfirmed";
  severity: "low" | "medium" | "high";
}

interface AreaSpec {
  name: string;
  title: string;
  /** Specialist agent file name without .md, or null for a plain persona. */
  specialist: string | null;
  oneLine: string;
  files: string[];
  /** Rust files the script's rustfmt --check gate covers; empty for docs areas. */
  fmtFiles: string[];
  implementAsk: string;
  auditBrief: string;
}

artifact.board("areas", {
  key: "name",
  status: "phase",
  columns: ["implementing", "auditing", "fixing", "done", "failed", "not converged"],
});

// ---------------------------------------------------------------- contract

const ERROR_CONTRACT = [
  "src/error.rs defines exactly this enum and these stable codes (variant -> code()):",
  "  Cancelled                     -> camera/cancelled",
  "  PermissionDenied              -> camera/permission-denied",
  "  PermissionPermanentlyDenied   -> camera/permission-permanently-denied",
  "  DeviceMissing                 -> camera/device-missing",
  "  DeviceBusy                    -> camera/device-busy",
  "  FormatUnsupported             -> camera/format-unsupported",
  "  Interrupted                   -> camera/interrupted",
  "  OrientationUnsupported        -> camera/orientation-unsupported",
  "  PreviewUnavailable            -> camera/preview-unavailable",
  "  PlatformUnavailable           -> camera/platform-unavailable",
  "  AlreadyResolved               -> camera/already-resolved",
  "Derive Debug, Clone, Copy, PartialEq, Eq. Provide code() -> &'static str, a Display impl that includes the stable code and a short human reason, and an empty impl of std::error::Error.",
].join("\n");

const TYPES_CONTRACT = [
  "src/types.rs defines exactly these public items (all pub; derive Debug, Clone, PartialEq, Eq on structs; the three enums also Copy):",
  "  enum Facing { Front, Back, External }",
  "  enum PermissionState { NotDetermined, Granted, Denied }   // Denied means only Settings can change it",
  "  enum Orientation { Portrait, LandscapeLeft, LandscapeRight, PortraitUpsideDown }",
  "  struct CameraId(pub String)",
  "  struct CameraInfo { pub id: CameraId, pub name: String, pub facing: Facing }",
  "  struct Resolution { pub width: u32, pub height: u32 }",
  '  struct PhotoRequest { pub resolution: Resolution, pub mime: &\'static str }   // e.g. "image/jpeg"',
  "  struct Photo { pub data: Vec<u8>, pub mime: &'static str, pub resolution: Resolution, pub orientation: Orientation }",
  '  struct RecordingRequest { pub resolution: Resolution, pub fps: u32, pub mime: &\'static str }   // e.g. "video/mp4"',
  "  struct Recording { pub data: Vec<u8>, pub mime: &'static str, pub resolution: Resolution }",
  "  struct Frame { pub data: Vec<u8>, pub resolution: Resolution, pub orientation: Orientation }",
].join("\n");

const TRAIT_CONTRACT = [
  "src/traits.rs defines exactly these four traits. Every method is non-blocking: it returns immediately and never waits on the OS, a thread, or a channel.",
  "",
  "pub trait PlatformCamera {",
  "    fn permission(&self) -> Result<PermissionState, Error>;",
  "    fn request_permission(&mut self) -> Result<PermissionState, Error>;",
  "    fn devices(&self) -> Result<Vec<CameraInfo>, Error>;",
  "    fn open(&mut self, id: &CameraId) -> Result<Box<dyn CameraDevice + '_>, Error>;",
  "}",
  "",
  "pub trait CameraDevice {",
  "    fn capture_photo(&mut self, request: &PhotoRequest) -> Result<Photo, Error>;",
  "    fn start_preview(&mut self) -> Result<Box<dyn PreviewStream + '_>, Error>;",
  "    fn start_recording(&mut self, request: RecordingRequest) -> Result<Box<dyn ActiveRecording + '_>, Error>;",
  "    fn close(&mut self) -> Result<(), Error>;",
  "}",
  "",
  "pub trait PreviewStream {",
  "    fn next_frame(&mut self) -> Result<Frame, Error>;",
  "    fn close(&mut self) -> Result<(), Error>;",
  "}",
  "",
  "pub trait ActiveRecording {",
  "    fn orientation(&self) -> Orientation;",
  "    fn stop(&mut self) -> Result<Recording, Error>;",
  "    fn cancel(&mut self) -> Result<(), Error>;",
  "}",
].join("\n");

const SEMANTICS_CONTRACT = [
  "Exactly-once semantics (every implementation honors these):",
  "- Each call resolves exactly once: Ok (success), Err(Error) (coded failure), or Ok(()) from cancel() (cancel). It never hangs.",
  "- Recording: the first of stop() or cancel() resolves it. Later stop()/cancel() on the same recording resolve Err(AlreadyResolved). stop() returning Err (e.g. Interrupted) also resolves the recording; cancel() afterwards is Err(AlreadyResolved).",
  "- Device close() resolves once, Ok on success. Any later call on that device (capture_photo, start_preview, start_recording, close) is Err(AlreadyResolved).",
  "- Preview close() resolves once. next_frame() after close is Err(PreviewUnavailable); next_frame() with no frame available is Err(PreviewUnavailable) too.",
  "- Permission flow (iOS asks once, then only Settings can change it): request_permission() from NotDetermined asks once: grant -> Ok(Granted); decline -> Err(PermissionDenied) and the state becomes Denied permanently. request_permission() while already Denied is Err(PermissionPermanentlyDenied). permission() only reports the state, never asks.",
  "- devices() returns the platform list (Ok with an empty vec when none are present). open() with an id matching no device is Err(DeviceMissing); a device held elsewhere is Err(DeviceBusy).",
  "- capture_photo with a resolution or mime the device cannot deliver is Err(FormatUnsupported).",
  "- Orientation changes while recording are not errors: the session keeps running and orientation() reports the new value. OrientationUnsupported is reserved for platforms that cannot reconfigure mid-recording (no implementation in this release).",
  "- An OS interruption while recording (app backgrounded, phone call) surfaces at stop() as Err(Interrupted).",
].join("\n");

const MOCK_CONTRACT = [
  "src/mock.rs provides MockCamera (pub) plus its pub device/stream/recording types, all implementing the four traits:",
  "- State lives in Rc<RefCell<MockState>> shared with every returned handle; ALL scripting methods take &self so a test can script while device/recording handles are alive (interruption mid-recording). Every borrow_mut() is short-lived inside one method, so it cannot panic; note that constraint in a 1-2 line comment.",
  "- MockCamera::new() and Default: permission NotDetermined, empty device list, nothing queued, no failures scripted.",
  "Scripting methods (all pub, all taking &self):",
  "  grant_permission()             request_permission -> Ok(Granted)",
  "  deny_permission_once()         first request_permission -> Err(PermissionDenied) and state becomes Denied; any later request_permission -> Err(PermissionPermanentlyDenied)",
  "  deny_permission_permanently()  request_permission -> Err(PermissionPermanentlyDenied) immediately and always",
  "  with_devices(Vec<CameraInfo>)  devices() returns exactly these",
  "  fail_open_with(Error)          the next open() resolves Err(that), one-shot",
  "  queue_photo(Photo)             capture_photo returns this photo (FIFO) instead of the synthesized default",
  "  fail_capture_with(Error)       the next capture_photo resolves Err(that), one-shot",
  "  queue_frames(Vec<Frame>)       next_frame pops frames FIFO; empty queue -> Err(PreviewUnavailable)",
  "  set_orientation(Orientation)   the active recording's orientation() reports it (no error: recording keeps running)",
  "  interrupt_recording()          the next stop() resolves Err(Interrupted) and the recording counts as resolved, one-shot",
  "  fail_stop_with(Error)          the next stop() resolves Err(that), one-shot",
  "  queue_recording_data(Vec<u8>)  the next stop()'s Recording.data",
  "Default behaviors: request_permission with no script -> Ok(Granted). devices() with no script -> Ok(empty). open() with an id not in the scripted list -> Err(DeviceMissing). capture_photo with no queued photo -> Ok(Photo synthesized from the request with empty data and orientation Portrait). stop() with no interruption script -> Ok(Recording synthesized from the RecordingRequest, with the queued data if any).",
  "close()/cancel()/preview semantics follow the exactly-once contract exactly.",
].join("\n");

const LIB_WIRING = [
  "src/lib.rs: a 2-4 line crate doc comment stating what the crate is and that native link layers are not wired in this release (every real bridge resolves camera/platform-unavailable until then; see docs/parity.md). Then, in this order:",
  "  mod android; mod apple; mod error; mod linux; mod mock; mod traits; mod types; mod windows;",
  "  pub use android::AndroidCamera;",
  "  pub use apple::AppleCamera;",
  "  pub use error::Error;",
  "  pub use linux::LinuxCamera;",
  "  pub use mock::MockCamera;",
  "  pub use traits::{ActiveRecording, CameraDevice, PlatformCamera, PreviewStream};",
  "  pub use types::{CameraId, CameraInfo, Facing, Frame, Orientation, PermissionState, Photo, PhotoRequest, Recording, RecordingRequest, Resolution};",
  "  pub use windows::WindowsCamera;",
  "Delete the scaffold status() function and its test entirely. The four bridge module FILES are owned by other areas running in parallel: declare the mods, never create or edit those files. cargo test compiles integration tests in tests/ against exactly this public API.",
].join("\n");

const PLANNED_TREE = [
  "- src/lib.rs, src/error.rs, src/types.rs, src/traits.rs, src/mock.rs  (core area)",
  "- src/apple.rs, src/android.rs, src/windows.rs, src/linux.rs  (one bridge area each)",
  "- tests/error_codes.rs, tests/exactly_once.rs, tests/edge_cases.rs, tests/mock_backend.rs, tests/bridges.rs  (tests area)",
  "- docs/goals.md, docs/decisions.md  (goals area)",
  "- docs/parity.md, README.md, site/index.html  (status area)",
].join("\n");

const EDGE_TESTS = [
  "tests/edge_cases.rs must define exactly these test functions (the names are part of the docs contract; docs/goals.md maps each edge case to one of them):",
  "  permission_denied_on_ios_asks_once_then_requires_settings",
  "  simulator_without_camera_reports_device_missing",
  "  device_busy_reports_device_busy",
  "  orientation_change_while_recording_updates_session_without_error",
  "  backgrounded_interruption_resolves_recording_as_interrupted",
  "  caller_cancel_resolves_recording_as_cancelled",
  "  unsupported_format_reports_format_unsupported",
  "  closed_preview_reports_preview_unavailable",
  "tests/bridges.rs must define exactly:",
  "  apple_bridge_resolves_platform_unavailable",
  "  android_bridge_resolves_platform_unavailable",
  "  windows_bridge_resolves_platform_unavailable",
  "  linux_bridge_resolves_platform_unavailable",
].join("\n");

const BRIDGE_MAPPING = [
  "Link-result mapping for every bridge (link trait results -> PlatformCamera results):",
  "  permission(): Granted -> Ok(Granted); DeclinedOnce or DeclinedPermanently -> Ok(PermissionState::Denied); Unavailable -> Err(Error::PlatformUnavailable)",
  "  request_permission(): Granted -> Ok(Granted); DeclinedOnce -> Err(Error::PermissionDenied); DeclinedPermanently -> Err(Error::PermissionPermanentlyDenied); Unavailable -> Err(Error::PlatformUnavailable)",
  "  devices(): Ok(list) -> Ok(list); Err(Busy) -> Err(Error::DeviceBusy); Err(Missing) -> Ok(empty vec); Err(Unavailable) -> Err(Error::PlatformUnavailable)",
  "  open(id): Err(Busy) -> Err(Error::DeviceBusy); Err(Missing) -> Err(Error::DeviceMissing); Err(Unavailable) -> Err(Error::PlatformUnavailable); Ok(()) -> Err(Error::PlatformUnavailable) (no CameraDevice layer is wired this release; 1-2 line comment)",
].join("\n");

function bridgeSpec(linkTrait: string, structName: string): string {
  return [
    "The file declares, all pub, in this order:",
    "1. The link trait: the exact native calls this bridge will make once the native layer is wired. Trait name for this area: " + linkTrait + ". Same method shape for all bridges:",
    "     fn permission_probe(&self) -> LinkPermission;",
    "     fn request_permission(&mut self) -> LinkPermission;",
    "     fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure>;",
    "     fn open_device(&mut self, id: &CameraId) -> Result<(), LinkFailure>;",
    "   with pub enums (derive Debug, Clone, Copy, PartialEq, Eq):",
    "     enum LinkPermission { Granted, DeclinedOnce, DeclinedPermanently, Unavailable }",
    "     enum LinkFailure { Busy, Missing, Unavailable }",
    "2. struct NullLink implementing " + linkTrait + ": every method resolves Unavailable / Err(LinkFailure::Unavailable).",
    "3. struct ScriptedLink implementing " + linkTrait + " with pub setters (set_permission_probe, set_request_permission, set_device_list, set_open_device); unset values resolve Unavailable. No native calls.",
    "4. struct " + structName + "<L: " + linkTrait + "> { link: L } (field private) with pub fn new() -> " + structName + "<NullLink>, pub fn with_link(link: L) -> Self, and a Default impl for " + structName + "<NullLink> (clippy new_without_default).",
    "5. impl PlatformCamera for " + structName + "<L: " + linkTrait + "> with EXACTLY the mapping table below. Every method returns immediately; no method panics, blocks, or waits.",
    "6. #[cfg(test)] mod tests covering at least: NullLink resolves Err(PlatformUnavailable) on all four PlatformCamera methods; scripted probes Granted / DeclinedOnce / DeclinedPermanently map per the table; device_list Busy / Missing / Unavailable map per the table; a scripted successful open_device still resolves Err(PlatformUnavailable). Tests may use expect/assert.",
  ].join("\n");
}

const STATUS_CONTRACT = [
  "docs/parity.md: keep the table shape; update the intro so the discipline stays honest: a row may read 'code written - unverified' until CI runs a test for it. Rows:",
  "  - Crate builds and CI passes -> 'scaffold' (the last CI-verified state; this work is uncommitted).",
  "  - Camera API -> 'code written - unverified': core trait, error codes, mock backend; CI has not run.",
  "  - Platform implementations -> 'bridge seams written - unverified; native link layers not wired (every bridge resolves camera/platform-unavailable)'.",
  "  - Device tests -> 'not started'.",
  "  - Status page -> 'updated - unverified'.",
  "  Evidence column: file paths (src/traits.rs, src/error.rs, src/mock.rs, src/apple.rs, src/android.rs, src/windows.rs, src/linux.rs, tests/, docs/goals.md).",
  "README.md: replace the Status section: camera API implemented behind one PlatformCamera trait with a mock backend and per-platform bridge seams; native device wiring not started; nothing verified until GitHub Actions runs; no commit or push was made. Update the Layout section: replace the 'src/lib.rs: placeholder crate' line with the real planned file list. Keep 'Planned approach'. In Checks, keep 'every compile and test runs in GitHub Actions' and add one line: the gates (cargo fmt --all -- --check, cargo clippy --all-targets -- -D warnings, cargo test --all-targets) have not run for this work yet; they run on the next CI trigger.",
  "site/index.html: update only the status paragraph to match parity.md, e.g. 'Status: camera API written, unverified by CI. Native device wiring not started.'",
  "Honesty rules: never claim a passing CI run, a test result, or device support. This work is uncommitted and unverified until GitHub Actions runs on the next push. Keep each file's existing structure and voice.",
].join("\n");

// ---------------------------------------------------------------- personas

const HARD_RULES = [
  "Hard rules for this repo (AGENTS.md):",
  "- GitHub Actions compiles and tests everything. NEVER run cargo, rustc, cargo-clippy, or any build/test command; you have no compiler feedback, so be exact: every name, import, signature and brace must be right by construction.",
  "- You MAY run 'rustfmt --edition 2024 <files>' (write or check mode) — formatter only, not a build.",
  "- No git operations at all: no commit, no push, no branch, no worktree, no stash, no reset. Work directly in the current checkout.",
  "- Never touch files outside your owned list, and never touch any other repository.",
  "- Comments are 1-2 lines and state a non-obvious constraint. No attribution lines, no filler.",
  "- Dead code is deleted; no speculative abstractions; docs read like a competent human wrote them.",
  "- In non-test Rust code there must be no unwrap/expect/panic!/todo!/unimplemented!/unreachable! and no blocking waits: every operation resolves exactly once (success, a coded error, or a cancel) and never hangs. Tests may use expect/assert freely.",
].join("\n");

const CONTRACTLINE_NOTE =
  "Your result must also carry contractLine: one sentence copied VERBATIM from your instructions (the specialist contract) that most shaped the work.";

function plainPersona(role: string): string {
  return (
    `You are the ${role} for one area of a parallel workflow in ${REPO}. Work only inside that project.\n\n` +
    HARD_RULES +
    "\n\nIf your instructions contradict each other or a requirement is impossible, say so plainly in your result rather than working around it."
  );
}

async function specialist(name: string, fallback: string): Promise<{ persona: string; source: string }> {
  const adapter =
    `You are the ${name} specialist for one area of a parallel workflow in ${REPO}. ` +
    `Your full specialist contract follows verbatim — apply it to this area's work; ` +
    `where it conflicts with your ask, the ask wins.` +
    "\n\n";
  for (const p of [`.zcode/agents/${name}.md`, `${KIT}/${name}.md`]) {
    try {
      const raw = await files.read(p);
      return { persona: adapter + raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim(), source: p };
    } catch {
      /* try the next source */
    }
  }
  return { persona: fallback, source: "fallback" };
}

function lineVerified(persona: string, line: string | undefined): boolean {
  return typeof line === "string" && line.trim().length > 0 && persona.includes(line.trim());
}

const CONTRACTLINE_RETRY =
  "Your previous reply was received, but its contractLine did not match your instructions. " +
  "Re-send the same result unchanged and add contractLine: one sentence copied VERBATIM from your instructions that most shaped the work.";

function auditAsk(spec: AreaSpec, gateOut: string): string {
  const rustChecks =
    spec.fmtFiles.length > 0
      ? [
          "Standard checks for Rust files:",
          "- Compile-correctness by reading: every referenced item exists with matching types; imports resolve; match arms are exhaustive; no missing returns; generic bounds hold.",
          "- Clippy under -D warnings: flag anything default rustc or clippy could warn on — unused imports or variables (including #[cfg(test)] code, which --all-targets compiles), dead code on non-pub items, needless borrows or clones, redundant struct field names, new() without Default, uninlined format args (prefer inline), ptr_arg, len_zero, single-char patterns, derivable impls.",
          "- Never panic, never hang in non-test code: no unwrap/expect/panic!/todo!/unimplemented!/unreachable!, no sleeps, no unbounded loops, no borrow held across another borrow_mut(). Tests may use expect/assert.",
          gateOut
            ? "- The script's rustfmt --edition 2024 --check gate (formatter only, not a build) reported non-zero for this area's files; every affected file must appear in findings:\n" + gateOut
            : "- The script's rustfmt gate output is not attached; still flag obvious rustfmt deviations.",
          "",
        ]
      : [];
  const parallelNote =
    spec.name === "goals docs" || spec.name === "unit tests" || spec.name === "status docs"
      ? [
          "Parallel note: the other areas are writing their files at the same time. Judge this area against the locked contract blocks in your instructions, NOT against whether the other areas' files exist yet on disk.",
          "",
        ]
      : [];
  return [
    `Audit the files ${spec.files.join(", ")} in ${REPO}. Read each file fully. You are read-only: never edit, create or delete any file; never run cargo, rustc, or any build/test command; no git operations.`,
    "",
    spec.auditBrief,
    "",
    ...parallelNote,
    ...rustChecks,
    "Return ONLY actionable findings with file:line pointers. An empty issues array means the area genuinely passed. No PASS notes, no praise, no summaries of what is fine. If you cannot check something, say so inside a finding rather than staying silent.",
    spec.specialist ? CONTRACTLINE_NOTE : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- areas

const AREAS: AreaSpec[] = [
  {
    name: "goals docs",
    title: "goals docs",
    specialist: null,
    oneLine: "docs/goals.md + docs/decisions.md: goals, acceptance criteria, error codes, edge cases",
    files: ["docs/goals.md", "docs/decisions.md"],
    fmtFiles: [],
    implementAsk: [
      "Implement the goals-docs area.",
      "",
      HARD_RULES,
      "",
      "Owned files (create or rewrite; touch nothing else):",
      "- docs/goals.md (new)",
      "- docs/decisions.md (update: move the three open decisions to Decided with one-line reasons)",
      "",
      "Read AGENTS.md, docs/brief.md and docs/decisions.md first. Write direct, concrete prose; no marketing filler. docs/goals.md must contain, in this order:",
      "1. Goal: photo capture, video recording and live preview for Native Shell apps behind one PlatformCamera trait; every call resolves exactly once (success, a coded failure, or a cancel) and never hangs; nothing panics.",
      "2. Platform scope: Apple via AVFoundation (objc2 or a Swift bridge), Android via CameraX (JNI), Windows and Linux via nokhwa. Web is out of scope for the first release: docs/brief.md offers no web camera option. Versions stay unpinned until checked on the registry.",
      "3. The exactly-once contract, stated with the rules below.",
      "4. The error-code table: exactly the 11 variants and codes below, as a markdown table (variant, code, meaning).",
      "5. Acceptance criteria, each mapped to where it is proven: one stable code per failure mode -> tests/error_codes.rs; exactly-once rules -> tests/exactly_once.rs; each brief edge case -> its named test in tests/edge_cases.rs (and tests/bridges.rs for platform-unavailable); mock scripting -> tests/mock_backend.rs; the fmt/clippy/test gates -> GitHub Actions (.github/workflows/ci.yml), which never run on a developer machine.",
      "6. An edge-case table mapping every case from docs/brief.md (permission denied, device busy or missing, orientation changes while recording, interruptions when backgrounded) plus device-busy and platform-unavailable to the locked test names below.",
      "7. Non-goals: web platform, native device wiring (tracked in docs/parity.md), Settings deep-link, torch, zoom, multi-camera sync.",
      "",
      SEMANTICS_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      EDGE_TESTS,
      "",
      "docs/decisions.md: move all three Open decisions to Decided with one-line reasons consistent with the above (NSH 0.4.0 as pinned by the brief — the crate has no NSH dependency yet, so nothing couples to it; library choice follows the brief's recommended path; platforms Apple/Android/Windows/Linux, web out of scope). Leave the document's structure and voice intact.",
      "",
      "When done, return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "docs/goals.md and docs/decisions.md. Check: (1) the error-code table lists exactly the 11 locked variants and codes, spelled exactly; (2) every edge-case row names a test function matching the locked names exactly (spelling, underscores); (3) the exactly-once rules match the locked semantics; (4) scope statements match: web out of scope, four platforms, native links not wired this release; (5) acceptance criteria map every criterion to a named test file or the CI workflow; (6) prose is direct and concrete, no filler, no claim of verification or of work not done; (7) docs/decisions.md has no open decision left that goals.md contradicts.",
  },
  {
    name: "core API",
    title: "core API",
    specialist: "z-rust-engineer",
    oneLine: "src/ core API: error codes, types, platform trait, scripted mock backend, module wiring",
    files: ["src/lib.rs", "src/error.rs", "src/types.rs", "src/traits.rs", "src/mock.rs"],
    fmtFiles: ["src/lib.rs", "src/error.rs", "src/types.rs", "src/traits.rs", "src/mock.rs"],
    implementAsk: [
      "Implement the core area.",
      "",
      HARD_RULES,
      "",
      "Owned files (create or rewrite; touch nothing else — the four bridge module files belong to other areas running in parallel):",
      "- src/lib.rs (rewrite; delete the scaffold status() function and its test)",
      "- src/error.rs (new)",
      "- src/types.rs (new)",
      "- src/traits.rs (new)",
      "- src/mock.rs (new)",
      "",
      "Read AGENTS.md first. The crate stays std-only: no Cargo.toml changes, no dependencies, no unsafe, no async runtime. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      TRAIT_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      MOCK_CONTRACT,
      "",
      LIB_WIRING,
      "",
      "Doc comments: 1-2 lines each, stating the non-obvious constraint (why scripting takes &self; why methods never block). Format every file with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "src/lib.rs, src/error.rs, src/types.rs, src/traits.rs, src/mock.rs. Check: (1) enum variants and code() strings match the locked table exactly; (2) the four trait signatures match the locked block exactly (names, order, types, lifetimes); (3) MockCamera implements the locked scripting surface with &self methods over Rc<RefCell<MockState>> and honors every exactly-once rule (stop/cancel resolution, close resolution, preview close, permission flow); (4) lib.rs declares exactly the eight mods and re-exports exactly the locked names; status() is gone; (5) compile-correctness by reading: every referenced item exists, imports resolve, match arms exhaustive, no missing returns; (6) never panic or block in non-test code; (7) std-only, no unsafe, no new dependencies.",
  },
  {
    name: "apple bridge",
    title: "Apple bridge",
    specialist: "z-rust-engineer",
    oneLine: "src/apple.rs: AVFoundation link seam behind PlatformCamera, scripted-link tests",
    files: ["src/apple.rs"],
    fmtFiles: ["src/apple.rs"],
    implementAsk: [
      "Implement the Apple bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs and the other bridge files belong to other areas running in parallel):",
      "- src/apple.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module — the file compiles on every target so GitHub's ubuntu CI checks it. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      bridgeSpec("AvFoundationLink", "AppleCamera"),
      "",
      BRIDGE_MAPPING,
      "",
      "Platform notes to encode in the module doc comment (1-2 lines each): AVFoundation via a future objc2 or Swift bridge (docs/brief.md). On the iOS simulator AVFoundation lists no cameras, which is why Missing maps to DeviceMissing at open. iOS asks for camera permission exactly once; DeclinedPermanently means only Settings can change it.",
      "",
      ERROR_CONTRACT,
      "",
      "Module doc comment: 1-2 lines on what the bridge is and that the native link layer is not wired this release. Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "src/apple.rs. Check: (1) AvFoundationLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, AppleCamera with new/with_link/Default present with the locked shapes; (2) every PlatformCamera method maps exactly per the locked mapping table — no variant mapped to the wrong Error, match arms exhaustive; (3) no method blocks, sleeps, panics, or unwraps in non-test code; (4) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (5) compile-correctness by reading: imports resolve via crate::{...}, generic bounds correct; (6) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "android bridge",
    title: "Android bridge",
    specialist: "z-rust-engineer",
    oneLine: "src/android.rs: CameraX link seam behind PlatformCamera, scripted-link tests",
    files: ["src/android.rs"],
    fmtFiles: ["src/android.rs"],
    implementAsk: [
      "Implement the Android bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs and the other bridge files belong to other areas running in parallel):",
      "- src/android.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module — the file compiles on every target so GitHub's ubuntu CI checks it. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      bridgeSpec("CameraXLink", "AndroidCamera"),
      "",
      BRIDGE_MAPPING,
      "",
      "Platform notes to encode in the module doc comment (1-2 lines each): CameraX through a future JNI link (docs/brief.md). A camera held by another app or process maps to Busy (DeviceBusy). Lifecycle interruptions when the app is backgrounded are the device layer's concern in a later release (docs/parity.md).",
      "",
      ERROR_CONTRACT,
      "",
      "Module doc comment: 1-2 lines on what the bridge is and that the native link layer is not wired this release. Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "src/android.rs. Check: (1) CameraXLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, AndroidCamera with new/with_link/Default present with the locked shapes; (2) every PlatformCamera method maps exactly per the locked mapping table — no variant mapped to the wrong Error, match arms exhaustive; (3) no method blocks, sleeps, panics, or unwraps in non-test code; (4) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (5) compile-correctness by reading: imports resolve via crate::{...}, generic bounds correct; (6) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "windows bridge",
    title: "Windows bridge",
    specialist: "z-rust-engineer",
    oneLine: "src/windows.rs: nokhwa link seam behind PlatformCamera, scripted-link tests",
    files: ["src/windows.rs"],
    fmtFiles: ["src/windows.rs"],
    implementAsk: [
      "Implement the Windows bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs and the other bridge files belong to other areas running in parallel):",
      "- src/windows.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module — the file compiles on every target so GitHub's ubuntu CI checks it. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      bridgeSpec("NokhwaLink", "WindowsCamera"),
      "",
      BRIDGE_MAPPING,
      "",
      "Platform notes to encode in the module doc comment (1-2 lines each): nokhwa on desktop (docs/brief.md), Media Foundation backend. Windows has a per-app camera privacy gate (Settings, Privacy, Camera), which is why the link carries permission probes even on desktop.",
      "",
      ERROR_CONTRACT,
      "",
      "Module doc comment: 1-2 lines on what the bridge is and that the native link layer is not wired this release. Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "src/windows.rs. Check: (1) NokhwaLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, WindowsCamera with new/with_link/Default present with the locked shapes; (2) every PlatformCamera method maps exactly per the locked mapping table — no variant mapped to the wrong Error, match arms exhaustive; (3) no method blocks, sleeps, panics, or unwraps in non-test code; (4) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (5) compile-correctness by reading: imports resolve via crate::{...}, generic bounds correct; (6) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "linux bridge",
    title: "Linux bridge",
    specialist: "z-rust-engineer",
    oneLine: "src/linux.rs: nokhwa link seam behind PlatformCamera, scripted-link tests",
    files: ["src/linux.rs"],
    fmtFiles: ["src/linux.rs"],
    implementAsk: [
      "Implement the Linux bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs and the other bridge files belong to other areas running in parallel):",
      "- src/linux.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module — the file compiles on every target so GitHub's ubuntu CI checks it. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      bridgeSpec("NokhwaLink", "LinuxCamera"),
      "",
      BRIDGE_MAPPING,
      "",
      "Platform notes to encode in the module doc comment (1-2 lines each): nokhwa on desktop (docs/brief.md), V4L2 backend. Linux has no OS camera permission gate: a real link reports Granted always, but the bridge keeps the same probe mapping as the other desktop bridge.",
      "",
      ERROR_CONTRACT,
      "",
      "Module doc comment: 1-2 lines on what the bridge is and that the native link layer is not wired this release. Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "src/linux.rs. Check: (1) NokhwaLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, LinuxCamera with new/with_link/Default present with the locked shapes; (2) every PlatformCamera method maps exactly per the locked mapping table — no variant mapped to the wrong Error, match arms exhaustive; (3) no method blocks, sleeps, panics, or unwraps in non-test code; (4) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (5) compile-correctness by reading: imports resolve via crate::{...}, generic bounds correct; (6) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "unit tests",
    title: "unit tests",
    specialist: "z-rust-engineer",
    oneLine: "tests/ error codes, exactly-once, edge cases, mock scripting, bridge resolution",
    files: ["tests/error_codes.rs", "tests/exactly_once.rs", "tests/edge_cases.rs", "tests/mock_backend.rs", "tests/bridges.rs"],
    fmtFiles: ["tests/error_codes.rs", "tests/exactly_once.rs", "tests/edge_cases.rs", "tests/mock_backend.rs", "tests/bridges.rs"],
    implementAsk: [
      "Implement the tests area.",
      "",
      HARD_RULES,
      "",
      "Owned files (create; touch nothing else — src/ belongs to other areas running in parallel; write tests only against the public API):",
      "- tests/error_codes.rs (new)",
      "- tests/exactly_once.rs (new)",
      "- tests/edge_cases.rs (new)",
      "- tests/mock_backend.rs (new)",
      "- tests/bridges.rs (new)",
      "",
      "Read AGENTS.md and docs/brief.md first (docs/goals.md may still be landing from a parallel area; its locked content is reproduced below, so do not wait for it). Load the rust-testing skill with the Skill tool before writing.",
      "",
      "Tests import from the crate root: use nsh_camera::{...}. Trait methods need the trait in scope: PlatformCamera, CameraDevice, PreviewStream, ActiveRecording. Public items: Error (+ code()), every type in the types contract, the four traits, MockCamera (+ its scripting methods), and AppleCamera/AndroidCamera/WindowsCamera/LinuxCamera (each has ::new()).",
      "",
      ERROR_CONTRACT,
      "",
      TRAIT_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      MOCK_CONTRACT,
      "",
      "tests/error_codes.rs: one test per variant asserting code() equals the locked string (11 tests), plus one test that Display output contains the stable code.",
      "tests/exactly_once.rs: cancel then stop -> Err(AlreadyResolved); double cancel -> Err(AlreadyResolved); stop then cancel -> Err(AlreadyResolved); interrupted stop then cancel -> Err(AlreadyResolved); capture after device close -> Err(AlreadyResolved); device close twice -> Err(AlreadyResolved); next_frame after preview close -> Err(PreviewUnavailable).",
      "tests/edge_cases.rs: exactly these function names, one per brief edge case, each asserting the stable code where an error is expected:",
      "",
      EDGE_TESTS,
      "",
      "Mapping for the edge tests: permission_denied_on_ios_asks_once_then_requires_settings -> deny_permission_once(): first request_permission Err(PermissionDenied), permission() Denied, next request_permission Err(PermissionPermanentlyDenied). simulator_without_camera_reports_device_missing -> open() an id absent from the scripted device list. device_busy_reports_device_busy -> fail_open_with(Error::DeviceBusy). orientation_change_while_recording_updates_session_without_error -> start recording, set_orientation(Orientation::LandscapeLeft), orientation() == LandscapeLeft, stop() Ok. backgrounded_interruption_resolves_recording_as_interrupted -> interrupt_recording(), stop() Err(Interrupted), then cancel() Err(AlreadyResolved). caller_cancel_resolves_recording_as_cancelled -> cancel() Ok(()), then stop() Err(AlreadyResolved). unsupported_format_reports_format_unsupported -> fail_capture_with(Error::FormatUnsupported). closed_preview_reports_preview_unavailable -> start_preview, close(), next_frame Err(PreviewUnavailable).",
      "tests/bridges.rs: for each bridge (AppleCamera::new(), AndroidCamera::new(), WindowsCamera::new(), LinuxCamera::new()): permission(), request_permission(), devices(), open(&CameraId(\"x\".into())) all resolve Err(PlatformUnavailable); assert err.code() == \"camera/platform-unavailable\"; use exactly the four locked function names listed above.",
      "tests/mock_backend.rs: the scripted happy path (grant -> with_devices -> open -> capture Ok with the queued photo; stop Ok with the queued data) plus every default behavior in the mock contract (new() state, request_permission default Granted, empty device list -> open DeviceMissing, synthesized photo, empty preview queue -> PreviewUnavailable).",
      "",
      "Every expected-error assertion also asserts the stable code string. Tests may use expect/assert. Format every file with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "tests/error_codes.rs, tests/exactly_once.rs, tests/edge_cases.rs, tests/mock_backend.rs, tests/bridges.rs. Check: (1) the locked edge-case and bridge test function names exist with EXACT spelling; (2) every expected-error assertion checks the stable code string; (3) tests use only the public API — cross-check every item and scripting-method name against the locked contract blocks in your instructions, not against the src/ files that may still be landing; (4) the exactly-once file covers every locked rule; (5) no panic paths, no sleeps, no threads; (6) compile-correctness by reading: method names, enum variant spellings, borrow plausibility (scripting while handles alive works because scripting takes &self), trait imports in scope in every file that calls trait methods.",
  },
  {
    name: "status docs",
    title: "status docs",
    specialist: null,
    oneLine: "docs/parity.md, README.md, site/index.html updated to match exactly what is done",
    files: ["docs/parity.md", "README.md", "site/index.html"],
    fmtFiles: [],
    implementAsk: [
      "Implement the status-docs area.",
      "",
      HARD_RULES,
      "",
      "Owned files (update; touch nothing else):",
      "- docs/parity.md",
      "- README.md",
      "- site/index.html",
      "",
      "Read AGENTS.md, docs/brief.md, docs/parity.md, README.md and site/index.html first. Docs read like a competent human wrote them: direct, concrete, no marketing filler. Eight areas are writing the tree in parallel right now; the planned tree is:",
      "",
      PLANNED_TREE,
      "",
      "Write claims about that planned tree against the list above; the final whole-tree audit reconciles any drift. Required content:",
      "",
      STATUS_CONTRACT,
      "",
      "These are markdown/HTML files; do not run rustfmt on them. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "docs/parity.md, README.md, site/index.html. The other areas are still writing their files; judge every claim against the planned tree list in your instructions, NOT against whether the files exist on disk yet. Check: (1) no claim contradicts the planned tree or the honesty rules — no 'CI passes', no 'tested', no 'works on device'; (2) parity rows cover: crate/CI (last verified state: scaffold), camera API (code written, unverified), platform bridges (seams written, native links not wired), device tests (not started), status page (updated, unverified); (3) README status and layout sections match the planned tree exactly and say the three CI gates have not run for this work; (4) site/index.html status line matches parity.md; (5) prose is direct and concrete, keeping each file's voice.",
  },
];

// ---------------------------------------------------------------- per-area chain

async function runArea(spec: AreaSpec): Promise<AreaResult> {
  try {
    report({ name: spec.name, phase: "implementing", summary: spec.oneLine }, "areas");
    log(`${spec.name}: implementing (${spec.files.length} file(s))`);

    const fallbackPersona = plainPersona(`careful, strict engineer for the ${spec.title} area`);
    let persona = fallbackPersona;
    if (spec.specialist) {
      persona = (await specialist(spec.specialist, fallbackPersona)).persona;
    }

    const impl = agent(`Implementer · ${spec.title}`, { system: persona, model: MODELS.pro });
    const auditor = agent(`Auditor · ${spec.title}`, { system: persona, model: MODELS.pro });

    let implRetriedLine = false;
    let auditRetriedLine = false;
    let implLineOk: boolean | null = null;
    let auditLineOk: boolean | null = null;

    const firstAsk = spec.specialist ? `${spec.implementAsk}\n\n${CONTRACTLINE_NOTE}` : spec.implementAsk;
    let made = await impl.ask<ImplResult>(firstAsk);
    if (spec.specialist !== null) {
      implLineOk = lineVerified(persona, made.contractLine);
      if (!implLineOk && !implRetriedLine) {
        implRetriedLine = true;
        const firstMade = made;
        made = await impl.ask<ImplResult>(CONTRACTLINE_RETRY);
        // an empty re-answer must not erase the substantive first one
        if (!made.summary) made = firstMade;
        implLineOk = lineVerified(persona, made.contractLine) || lineVerified(persona, firstMade.contractLine);
      }
    }

    let boardPhase: AreaResult["status"] = "done";
    let rounds = 0;
    let remaining: string[] = [];
    let converged = false;

    for (const r of [1, 2, 3]) {
      rounds = r;
      report({ name: spec.name, phase: "auditing", summary: `audit round ${r}` }, "areas");

      let gateOut = "";
      if (spec.fmtFiles.length > 0) {
        try {
          const gate = await world.run("rustfmt", ["--edition", "2024", "--check", ...spec.fmtFiles], {
            timeoutMs: 60000,
          });
          if (gate.exitCode !== 0) gateOut = `${gate.stdout}\n${gate.stderr}`.trim();
        } catch (err) {
          gateOut = `rustfmt gate could not run: ${String(err)}`;
        }
      }

      let audit = await auditor.ask<Audit>(auditAsk(spec, gateOut));
      if (spec.specialist !== null) {
        auditLineOk = lineVerified(persona, audit.contractLine);
        if (!auditLineOk && !auditRetriedLine) {
          auditRetriedLine = true;
          const firstIssues = audit.issues;
          audit = await auditor.ask<Audit>(CONTRACTLINE_RETRY);
          // an empty re-answer must not erase the substantive first one
          if (audit.issues.length === 0 && firstIssues.length > 0) {
            audit = { ...audit, issues: firstIssues };
          }
          auditLineOk = lineVerified(persona, audit.contractLine);
        }
      }

      if (audit.issues.length === 0 && gateOut === "") {
        converged = true;
        break;
      }
      remaining = audit.issues.map((f) => `[${f.severity}] ${f.where}: ${f.problem}`);
      if (gateOut !== "" && remaining.length === 0) {
        remaining = ["rustfmt --edition 2024 --check still reports formatting diffs; see the gate output in the audit"];
      }
      report({ name: spec.name, phase: "fixing", summary: `${audit.issues.length} finding(s)` }, "areas");
      const feedback = [
        gateOut ? `Formatter gate output (rustfmt --edition 2024 --check):\n${gateOut}` : "",
        ...audit.issues.map((f) => `- [${f.severity}] ${f.where}: ${f.problem}`),
      ]
        .filter(Boolean)
        .join("\n");
      await impl.ask<FixResult>(
        [
          `The auditor reviewed your area's files (${spec.files.join(", ")}). Fix every finding below inside the files you own — nothing else. Re-run rustfmt --edition 2024 (write mode) on each file you change. Do not run cargo or rustc; no git operations.`,
          "",
          feedback,
        ].join("\n"),
      );
    }

    if (!converged) boardPhase = "not-converged";
    const summary =
      made.summary +
      (converged
        ? ` — audit converged in ${rounds} round(s).`
        : ` — audit did NOT converge: ${rounds} round(s) used; the fixes after the final audit are applied but unverified.`);
    report({ name: spec.name, phase: boardPhase === "failed" ? "failed" : boardPhase === "done" ? "done" : "not converged", summary }, "areas");
    return {
      name: spec.name,
      status: boardPhase,
      summary,
      rounds,
      remainingIssues: converged ? [] : remaining,
      personaVerified: spec.specialist === null ? null : implLineOk === true && auditLineOk === true,
      blockers: made.blockers ?? [],
    };
  } catch (err) {
    const summary = `${spec.title} failed: ${String(err)}`;
    report({ name: spec.name, phase: "failed", summary }, "areas");
    return {
      name: spec.name,
      status: "failed",
      summary,
      rounds: 0,
      remainingIssues: [],
      personaVerified: null,
      blockers: [String(err)],
    };
  }
}

phase("Implement and audit each area in parallel — up to 3 audit rounds per area");
log(`${AREAS.length} areas, disjoint files, one locked contract`);
const areaResults = await Promise.all(AREAS.map((spec) => runArea(spec)));
log(
  `${areaResults.filter((r) => r.status === "done").length}/${AREAS.length} areas converged; ` +
    `${areaResults.filter((r) => r.status === "not-converged").length} not converged; ` +
    `${areaResults.filter((r) => r.status === "failed").length} failed`,
);

// ---------------------------------------------------------------- whole-tree consistency

const ALL_RS_FILES = [
  "src/lib.rs",
  "src/error.rs",
  "src/types.rs",
  "src/traits.rs",
  "src/mock.rs",
  "src/apple.rs",
  "src/android.rs",
  "src/windows.rs",
  "src/linux.rs",
  "tests/error_codes.rs",
  "tests/exactly_once.rs",
  "tests/edge_cases.rs",
  "tests/mock_backend.rs",
  "tests/bridges.rs",
];

function treeAuditAsk(gateOut: string): string {
  return [
    `Cross-check the whole tree in ${REPO} after eight areas wrote files in parallel. Read-only: do not edit, create or delete any file; do not run cargo or rustc; no git operations. You may read every file in the project.`,
    "",
    "Check exactly these cross-file seams:",
    "1. src/lib.rs: every declared mod has a matching file; every re-exported name exists as a pub item with that exact name; the scaffold status() is gone.",
    "2. src/error.rs codes match the locked table below; docs/goals.md's error table matches src/error.rs exactly (same 11 variants, same code strings).",
    "3. docs/goals.md's edge-case table vs tests/edge_cases.rs and tests/bridges.rs: every named test function exists with exactly that name.",
    "4. tests/*.rs call only the public API that actually exists: items, signatures, MockCamera scripting methods, bridge constructors; trait imports in scope wherever trait methods are called.",
    "5. docs/parity.md, README.md, site/index.html: every status claim matches the real tree; verification claims stay honest (nothing is verified until GitHub Actions runs; no commit was made).",
    "6. Bridge drift: all four bridge files (src/apple.rs, src/android.rs, src/windows.rs, src/linux.rs) map link results per the locked mapping table below.",
    "7. AGENTS.md sweep across all changed files: comments 1-2 lines stating non-obvious constraints; no dead code; no speculative abstractions; docs tone direct.",
    gateOut
      ? `The script's rustfmt --edition 2024 --check gate (formatter only, not a build) reported non-zero; every affected file must appear in findings:\n${gateOut}`
      : "The rustfmt gate output is not attached; flag nothing about formatting unless you see an obvious deviation while reading.",
    "",
    "Locked error-code table:",
    ERROR_CONTRACT,
    "",
    BRIDGE_MAPPING,
    "",
    "Return ONLY actionable findings with file:line pointers; an empty issues array means the tree is consistent. No PASS notes.",
    CONTRACTLINE_NOTE,
  ].join("\n");
}

const treePersona = (
  await specialist("z-rust-engineer", plainPersona("whole-tree consistency auditor and fixer for a Rust camera crate"))
).persona;
const treeAuditor = agent("Whole-tree auditor", { system: treePersona, model: MODELS.pro });
const treeFixer = agent("Whole-tree fixer", { system: treePersona, model: MODELS.pro });

let treeIssues: AuditFinding[] = [];
let treeRounds = 0;
let treeConverged = false;
let treeFmtClean = true;

phase("Audit the whole tree once and reconcile what drifted");
for (const r of [1, 2, 3]) {
  treeRounds = r;
  let gateOut = "";
  try {
    const gate = await world.run("rustfmt", ["--edition", "2024", "--check", ...ALL_RS_FILES], {
      timeoutMs: 120000,
    });
    if (gate.exitCode !== 0) gateOut = `${gate.stdout}\n${gate.stderr}`.trim();
  } catch (err) {
    gateOut = `rustfmt gate could not run: ${String(err)}`;
  }

  treeFmtClean = gateOut === "";
  let audit = await treeAuditor.ask<Audit>(treeAuditAsk(gateOut));
  if (!lineVerified(treePersona, audit.contractLine)) {
    const firstIssues = audit.issues;
    audit = await treeAuditor.ask<Audit>(CONTRACTLINE_RETRY);
    // an empty re-answer must not erase the substantive first one
    if (audit.issues.length === 0 && firstIssues.length > 0) {
      audit = { ...audit, issues: firstIssues };
    }
  }
  treeIssues = audit.issues;
  if (gateOut === "" && audit.issues.length === 0) {
    treeConverged = true;
    treeFmtClean = true;
    break;
  }

  const feedback = [
    gateOut ? `Formatter gate output (rustfmt --edition 2024 --check):\n${gateOut}` : "",
    ...audit.issues.map((f) => `- [${f.severity}] ${f.where}: ${f.problem}`),
  ]
    .filter(Boolean)
    .join("\n");
  await treeFixer.ask<FixResult>(
    [
      `The whole-tree audit found inconsistencies in ${REPO}. Fix every finding below, editing only what a finding names (plus the directly dependent lines). Re-run rustfmt --edition 2024 (write mode) on each Rust file you change. Do not run cargo or rustc; no git operations; keep every status claim in docs honest.`,
      "",
      feedback,
      "",
      CONTRACTLINE_NOTE,
    ].join("\n"),
  );
}
log(
  treeConverged
    ? `whole-tree audit converged in ${treeRounds} round(s)`
    : `whole-tree audit did NOT converge in ${treeRounds} round(s); ${treeIssues.length} finding(s) remain`,
);
if (!treeConverged && treeFmtClean === false) {
  log("the final formatter gate still reported diffs");
}

// ---------------------------------------------------------------- report

const openFindings: ReportedFinding[] = [
  ...areaResults
    .filter((a) => a.status !== "done")
    .flatMap((a) =>
      a.remainingIssues.map((issue) => ({
        where: `area "${a.name}"`,
        what: issue,
        evidence: `last audit of ${a.name}: the round cap was reached; fixes applied after the final audit are unverified`,
        status: "unconfirmed" as const,
        severity: /\[high\]/.test(issue) ? ("high" as const) : ("medium" as const),
      })),
    ),
  ...treeIssues.map((f) => ({
    where: f.where,
    what: f.problem,
    evidence: "whole-tree consistency audit ended with the cap reached without a clean pass",
    status: "unconfirmed" as const,
    severity: f.severity,
  })),
];

const verifiedLines: string[] = [
  "Every Rust file passed the script's 'rustfmt --edition 2024 --check' formatter gate when its area converged (formatter only, not a build; no compile).",
  `Each of the ${AREAS.length} areas was audited by a dedicated read-only auditor against the locked contract, up to 3 rounds, until zero actionable findings.`,
  "A whole-tree consistency audit checked lib.rs wiring vs files, goals.md codes/test names vs code, tests vs the public API, bridge mapping drift, and README/parity/site claims vs the tree.",
  `Specialist personas (z-rust-engineer) were runtime-loaded for the Rust areas; delivery verified per area: ${areaResults
    .map((a) => `${a.name}: ${a.personaVerified === null ? "plain persona" : a.personaVerified ? "verified" : "unverified"}`)
    .join(", ")}.`,
];

const notCoveredLines: string[] = [
  "The CI gates (cargo fmt --all -- --check, cargo clippy --all-targets -- -D warnings, cargo test --all-targets) were NOT run: AGENTS.md forbids building or testing on this machine; they run in GitHub Actions on the next commit/push. Nothing was committed or pushed, so compile and test verification is pending CI.",
  "Real device behavior: no native link layer is wired; AVFoundation/CameraX/nokhwa paths are design seams only (docs/parity.md).",
  "Web platform: out of scope per docs/brief.md.",
  "AGENTS.md's 'a test is seen to fail once before it counts' cannot be observed without running tests; it applies when CI first runs.",
];

const doneCount = areaResults.filter((a) => a.status === "done").length;
const notConvergedAreas = areaResults.filter((a) => a.status === "not-converged");
const failedAreas = areaResults.filter((a) => a.status === "failed");
const conclusion = [
  `${doneCount} of ${AREAS.length} areas converged (implement, then audit until zero findings, cap 3 rounds).`,
  notConvergedAreas.length > 0
    ? `${notConvergedAreas.map((a) => a.name).join(", ")} did NOT converge within the cap; their last findings are reported as unconfirmed.`
    : "No area hit the audit cap.",
  failedAreas.length > 0 ? `Failed areas: ${failedAreas.map((a) => a.name).join(", ")}.` : "",
  treeConverged
    ? `The whole-tree consistency audit converged in ${treeRounds} round(s).`
    : `The whole-tree consistency audit did NOT converge within ${treeRounds} round(s); its open findings are reported as unconfirmed.`,
  "The three CI gates (fmt, clippy, test) remain unverified by design: AGENTS.md runs them in GitHub Actions only, and this run made no commit or push.",
]
  .filter(Boolean)
  .join(" ");

const reportLines = [
  "# nsh-camera workflow report",
  "",
  "Eight areas with disjoint files ran in parallel against one locked contract (error codes, trait signatures, mock scripting, test names). CI gates run in GitHub Actions only; this run made no git operation.",
  "",
  "## Areas",
  ...areaResults.map(
    (a) =>
      `- **${a.name}** — ${a.status} (${a.rounds} audit round(s)): ${a.summary}` +
      (a.remainingIssues.length ? ` Open: ${a.remainingIssues.join("; ")}.` : "") +
      (a.blockers.length ? ` Blockers: ${a.blockers.join("; ")}.` : ""),
  ),
  "",
  "## Whole-tree consistency audit",
  treeConverged
    ? `- converged after ${treeRounds} round(s); no open findings.`
    : `- did NOT converge after ${treeRounds} round(s); open findings: ${
        treeIssues.map((f) => `${f.where}: ${f.problem}`).join("; ") || "none recorded"
      }.`,
  "",
  "## What was verified",
  ...verifiedLines.map((v) => `- ${v}`),
  "",
  "## What was not covered",
  ...notCoveredLines.map((v) => `- ${v}`),
];

await artifact.markdown("report", reportLines.join("\n"), {
  title: "nsh-camera implementation report",
  description: "Per-area outcomes, audit convergence, and what remains unverified until CI runs",
  primary: true,
});

return {
  conclusion,
  areas: areaResults,
  findings: openFindings,
  verified: verifiedLines,
  notCovered: notCoveredLines,
};
