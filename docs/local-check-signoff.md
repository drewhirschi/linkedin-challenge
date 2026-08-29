# Local checks as the GitHub merge gate

The full build and test suite runs on the developer machine. GitHub branch protection requires the
`local-checks` commit status, so a pull request cannot merge until that exact pushed commit passes
locally. GitHub Actions does not rerun the suite.

## Sign off a commit

Commit and push the exact revision you want reviewed, then run:

```bash
just signoff
```

The command refuses a dirty tree or an unpushed commit, runs `just check`, and posts
`local-checks=success` to the current commit through `gh`. Any new commit has a different SHA and
must be signed off again.

## One-time GitHub setup

In the repository settings, add a branch ruleset for `main` that:

1. Requires a pull request before merging.
2. Requires status checks to pass.
3. Selects the `local-checks` status context.
4. Requires branches to be up to date before merging, if that matches the team's merge policy.

Post at least one status with `just signoff` before selecting it in the GitHub settings UI.

This is an attestation by the developer and their authenticated GitHub CLI; it proves that the
repository's local check command reported success for the exact commit. It does not provide the
isolated execution guarantees of hosted CI, so branch protection and write access should remain
limited to trusted contributors.
