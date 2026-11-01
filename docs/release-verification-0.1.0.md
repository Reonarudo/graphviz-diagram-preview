# Release verification: 0.1.0 (pre-release)

Date: 2026-11-01. Tag `0.1.0` on commit 88e9ac2. GitHub pre-release:
https://github.com/Reonarudo/graphviz-diagram-preview/releases/tag/0.1.0

## Assets

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `main.js` | 1991722 | `f5d6d568f59f2ddf4a88f31161042235476fe06dc56e2619bfe8a4a2bf382c46` |
| `manifest.json` | 360 | `a3eabeb091cc3957598227816a3c44088814e53da85707b88d513e5630d17774` |
| `styles.css` | 5568 | `27d2a434b367fa0cc7229d574b80752372bf9e3de3ad661023befc418a947e84` |

Desktop only: no (desktop and mobile). Minimum Obsidian version: 1.5.0.

## Checks on the tagged tree

- `npm run lint` (tsc): clean.
- Obsidian's review linter (`eslint-plugin-obsidianmd` 0.4.2, recommended config) on `src/`: no errors, no warnings.
- `npm test`: 96 passed, 0 failed.
- `npm run test:live` against Obsidian 1.14.4: 24 live checks passed.

## The published assets

- Downloaded with `gh release download 0.1.0` into an empty directory; `shasum -a 256 -c SHA256SUMS`: all OK; `main.js`
  byte-identical to the build from the tagged tree.
- Installed into a throwaway vault in Obsidian 1.14.4 with a throwaway profile: blocks draw, with captions, in an embedded
  note (Reading view and Live Preview) and in Canvas text and note cards.

## Not yet verified

- On real phones (iOS, Android) through BRAT.
