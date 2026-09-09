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
