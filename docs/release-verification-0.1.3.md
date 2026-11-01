# Release verification: 0.1.3

Date: 2026-11-01. Tag `0.1.3` on commit af5d36e, built and published by the release workflow:
https://github.com/Reonarudo/graphviz-diagram-preview/actions/runs/41311533784

## Assets

| File | Bytes | SHA-256 | Attestation |
| --- | --- | --- | --- |
| `main.js` | 1990953 | `43cae889d3e594cdf4282e932d04bd5366670e1b0292f05632ceda917bf17b57` | verified with `gh attestation verify` |
| `manifest.json` | 361 | `49ccb8c04d137c18964ed1d6bbc3ae842945a3be2877344a633797d1f9648c5d` | verified with `gh attestation verify` |
| `styles.css` | 5160 | `bd18d8ff7d634d0fa045f1abdbd61ba5356cdfc51694e7367daec364efea88a3` | verified with `gh attestation verify` |

## Checks

- In the workflow: tag matches `manifest.json` and `versions.json`; `npm ci`; `tsc --noEmit`; `npm test` (96 passed,
  0 failed); `npm run build`.
- Obsidian's review linter on `src/`: no findings. No `display()` method and no `!important` remain, the two
  community directory warnings on 0.1.2.
- `npm run test:live` against Obsidian 1.14.4 on the tagged tree: all checks passed.
- Downloaded assets installed in a throwaway vault in Obsidian 1.14.4: blocks draw in an embedded note.
