# Release verification: 0.1.2

Date: 2026-11-01. Tag `0.1.2` on commit 7c2aa02, built and published by the release workflow:
https://github.com/Reonarudo/graphviz-diagram-preview/actions/runs/41310100251

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 1991632 | `5c8a6069416a6440f86d805b084acaf1522996c12c52969fd78f352033577835` | verified with `gh attestation verify` |
| `manifest.json` | 361 | `44aead35aff9feef9bcb32c6859a959117beab8d5fa30030177948fc870a48d2` | verified with `gh attestation verify` |
| `styles.css` | 5568 | `27d2a434b367fa0cc7229d574b80752372bf9e3de3ad661023befc418a947e84` | verified with `gh attestation verify` |

The release carries only these three files.

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test`
  (96 passed, 0 failed); `npm run build`.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note (Reading view and
  Live Preview) and in Canvas text and note cards.
- `main.js` differs from 0.1.1 only in the embedded copy of this repository's `LICENSE`, which lost a trailing
  sentence so GitHub recognises it as MIT.
