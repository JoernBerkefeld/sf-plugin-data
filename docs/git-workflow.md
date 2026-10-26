# Git workflow status

Current local npm identity is `sf-plugin-data`; repository/path remain
`sf-plugin-data360`. The existing `v0.1.0` tag still contains the previous npm
identity. This local rename does not authorize tag reuse, publication or history
changes. The previous name's manual npm publication was rejected with `E403`;
resolve npm restrictions separately rather than assuming the new name is
publishable. No new-name registry query or publication has been performed.

The repository implements bounded DMO retrieval, read-only deployment preview,
guarded creation and qualified object/existing non-primary field label updates.
Broader DMO deployment and other resource families remain unsupported. Offline CI
builds, lints, tests and inspects the package allowlist. It does not authenticate
to Salesforce. No workflow deploys or provisions org resources.

The future review flow is retrieve to a branch, inspect portable configuration,
review the exact commit, optionally preview against an authorized target, then
deploy that approved commit with fresh whole-selection preflight. Preview is
advisory, not an executable saved plan or a promise of identical future actions.
Never expose org credentials to untrusted pull-request code.

Deployment jobs, Git-change selectors, report files and approval-bound execution
are deferred. No repository, branch protection, remote or npm publisher is
configured automatically. Release publication requires separate explicit approval
and verified hosted trusted-publisher configuration. Hosted publication uses npm
11.5.1 and an exact `name@version` registry check: an existing matching version
is skipped; only structured JSON `E404` proves absence. If the entire package is
absent, the user must perform its first public npm publication manually after all
release checks pass. Later unpublished versions of an existing package may use
the approved hosted workflow. Package existence does not verify the trusted
publisher: its actual repository/workflow/environment binding must be configured
and verified separately. Authentication, network and malformed registry responses
fail closed; publication is never retried automatically. After publish acceptance,
registry availability (first check at five minutes, then once per minute through
15 minutes), fresh isolated installation and applicable provenance/integrity
verification remain separate gates. No bootstrap commands or release-ready
artifact are handed off by this local preparation.
