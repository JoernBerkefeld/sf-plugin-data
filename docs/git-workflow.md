# Git workflow status

The repository contains tooling and explicit unsupported command entry points
only. Offline CI builds, lints, tests and inspects the package allowlist. It does
not authenticate to Salesforce. No workflow deploys or provisions org resources.

The future review flow is retrieve to a branch, inspect portable configuration,
review the exact commit, optionally preview against an authorized target, then
deploy that approved commit with fresh whole-selection preflight. Preview is
advisory, not an executable saved plan or a promise of identical future actions.
Never expose org credentials to untrusted pull-request code.

Deployment jobs, Git-change selectors, report files and approval-bound execution
are deferred. No repository, branch protection, remote or npm publisher is
configured automatically. Release publication requires separate explicit approval
and verified hosted trusted-publisher configuration.
