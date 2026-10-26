# Maintenance and continuity

The current human maintainer is [Yash (@yv3000)](https://github.com/yv3000).
[@trulyimmortal](https://github.com/trulyimmortal) is an alternate account owned
by the same person, not an independent maintainer or reviewer. Work submitted
through either account does not remove the project's single-maintainer risk.

## Contributing and review

Report a reproducible CLI problem with the OS, Node/Bun versions, command and
expected result. Link its fix with `Fixes #<issue>`, include a regression test,
and follow [CONTRIBUTING.md](CONTRIBUTING.md). Independent reviews are welcome;
same-owner account reviews are not independent approval. Keep one real behavior
change and its tests per commit rather than splitting changes to increase counts.

## If the maintainer is unavailable

The repository, both lockfiles, offline tests and native install scripts are
sufficient to maintain a fork without project secrets or hosted services.
Clone a tagged revision, follow the fresh-clone checks in CONTRIBUTING.md,
and run the native CI matrix before distributing a modified version. Report
security concerns using [SECURITY.md](SECURITY.md).

No backup maintainer or transfer of repository access is currently promised.
Any future appointment should be recorded here after the person accepts,
with their review and release responsibilities. GitHub administration and
release rights remain with the current owner until then.

## Code ownership

Review requirements and path-based ownership are declared in
[`.github/CODEOWNERS`](.github/CODEOWNERS) covering core runtime, platform
installers, and CI/CD automation.
