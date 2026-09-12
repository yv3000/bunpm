# Changelog

## Unreleased

- Report every bunpm failure on stderr as `bunpm: <component>: <message>`,
  replacing the previous mix of `bunpm error:`, `Bootstrap error:` and unprefixed
  installer messages. Missing installer prerequisites are now reported by bunpm
  instead of by the shell, and the missing-manager and prerequisite texts were
  reworded to name the tool to install. Exit codes, signal handling and child
  output are unchanged. Scripts matching the old prefixes or texts need updating.
- Avoid missing-profile diagnostics on fresh Unix installs while retaining PATH
  idempotence. Preserve raw Windows User PATH references and registry value type.
- Permit quoted batch executable paths containing parentheses and literal wildcard
  arguments, while retaining rejection of shell-sensitive argument syntax.

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
- Close redirect/error responses promptly and validate download resource limits.
