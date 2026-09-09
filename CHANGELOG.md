# Changelog

## Unreleased

- Return actual original-manager versions instead of fabricated version strings.
- Run package test scripts through `bun run test`, preserving script arguments.
- Fall back for unknown options, Yarn shorthand, `ci`, `init`, `exec`, version
  mutation, and other commands without a safe common Bun equivalent. Yarn shorthand
  no longer accidentally installs a package. Original managers must be installed
  for fallback operations.
- Find executables without invoking a shell; skip wrapper copies, directories,
  relative PATH entries and broken symlinks.
- Preserve child failures and signal exit codes. Retry only pre-execution missing
  executable/permission failures, never buffer overflows or failed commands.
- On Windows, invoke known Node package-manager entrypoints directly. Generic
  batch shims reject shell-sensitive arguments; use a Node CLI entrypoint for
  those arguments. Interactive commands retain the terminal.
- Remove invented audit results from formatted output.
- Require an immutable commit SHA for remote bootstrap. Restrict HTTPS URLs and
  redirects to this repository/revision, cap time/size/redirects, propagate stream
  errors, and never invoke an installer after a failed download.
- Require Bun to be installed separately instead of executing a remote install
  script automatically. Installers also work directly from the checked-out source.
- Add explicit no-PATH installation/uninstallation modes for isolated testing and
  manual PATH management. Uninstall preserves unrelated shell-profile lines.
