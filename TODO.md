# Implementation Plan

## Reliable Embedded Console links

- [x] Use the active Stata session's `c(pwd)` as the only authoritative working directory after execution; never expand globals or infer `cd` targets in JavaScript.
- [x] Ignore inline `//` comments in echoed commands by excluding command output from link parsing and removing the obsolete JavaScript `cd` text parser.
- [x] Create a named SMCL sidecar log for each run under the system temporary directory at `stata-all-in-one/log/yyyyMM/yyyyMMdd-HHmmss-SSS.smcl`.
- [x] Use a unique random Stata log name for every run, open and close only that exact name with `echo=false`, `quietly`, `capture`, and `nomsg`, and silently disable the sidecar when no SMCL slot is available.
- [x] Run internal log control, working-directory, and graph queries through silent temporary `run` scripts and value files so their commands and status text do not enter the Console or the user's logs.
- [x] Parse only file, directory, and HTTP/HTTPS targets from explicit SMCL links and result output; never execute SMCL actions such as `{stata}`.
- [x] Keep extension parsing only as a candidate generator. Resolve candidates against the confirmed Stata working directory and create links only after the exact file or directory exists.
- [x] Validate a deduplicated relative-path candidate when its first directory repeats the confirmed Stata working directory basename; leave links ambiguous when both candidates exist.
- [x] Never link only the trailing line of a wrapped path. Use the complete SMCL target, or reconstruct extension candidates across Stata continuation lines and verify the full path before linking.
- [x] Keep the current Console text, progress, and graph pipelines. SMCL is a semantic sidecar rather than the primary renderer.
- [x] Retain the current month and previous two months of temporary SMCL logs.
- [x] Read only appended SMCL bytes during execution, throttle parsing to 200 ms, keep a bounded UTF-8-safe scan window, and perform one final complete parse after closing.
- [x] Display Console output immediately, validate extension and SMCL link candidates through asynchronous filesystem calls, then patch verified links into the existing run history.
- [x] Cover the reported `sum2docx`, `corr2docx`, `outreg2`, global-based `cd`, inline-comment, repeated-run, wrapped-path, missing-target, and macOS/Windows cases with regression tests.
