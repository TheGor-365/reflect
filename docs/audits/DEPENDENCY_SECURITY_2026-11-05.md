# Reflect 2.0 — runtime dependency audit, 2026-11-05

## Evidence and boundaries
- Owner ran `npm audit --omit=dev --json` locally on the `work/reflect-typescript-foundation-2026-11-04` branch with locked `typescript@5.9.3`.
- Npm reported **14 items in the dependency tree npm classifies as runtime**: 10 moderate, 2 high, 2 critical. The 4 high/critical transitive packages are `@grpc/grpc-js`, `protobufjs`, `undici` and `websocket-driver`. Each reported `isDirect: false, fixAvailable: true`.
- Distinguish audit dependency classification from exploitability: whether vulnerable functionality is reachable through the browser bundle or from a server is NOT yet established. Code path and production exposure need separate verification.
- The root `firebase` dependency in `package.json` is `^10.12.2`; locked installed version is **10.14.1**, with `@firebase/firestore@4.7.3` and `@firebase/database@1.0.8`.

## Exact transitive paths (from pinned package-lock.json)
| Package | Installed | Immediate parent | Ancestor |
|---|---|---|---|
| `@grpc/grpc-js` | `1.9.15` | `@firebase/firestore@4.7.3` (`~1.9.0`) | `firebase@10.14.1` |
| `protobufjs` | `7.5.3` | `@grpc/proto-loader@0.7.15` (`^7.2.5`) | `@firebase/firestore` / `@grpc/grpc-js` |
| `undici` | `6.19.7` | `@firebase/firestore`, `@firebase/auth-compat`, `@firebase/functions`, `@firebase/storage` and internal `@firebase/auth` packages (some exact pins) | `firebase@10.14.1` |
| `websocket-driver` | `0.7.4` | `faye-websocket@0.11.4` (`>=0.5.1`) | `@firebase/database@1.0.8` |

## Publicly documented fixes (verify against *specific advisory list* from this audit)
- `protobufjs`: the 2026 security advisories require at least `7.5.6` within major 7; exact advisory requirements vary. https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-75px-5xx7-5xc7
- `websocket-driver`: published security-patched upstream `0.7.5`; compare npm audit advisories before applying. https://www.npmjs.com/package/websocket-driver?activeTab=versions
- `@grpc/grpc-js`: recent advisory requires `1.13.6` or `1.14.5` depending on branch. Locked parent `~1.9.0` will NOT permit `1.13.6` without a parent upgrade or explicit tested override. https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j
- `undici`: known 2026 WebSocket issues have patched versions in 6.x; inspect local `via[].range` advisories before choosing a single safe 6.x resolution. https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5

## Next safety gate
1. Inspect each high/critical package's actual advisory titles, affected ranges, and `fixAvailable` from `npm audit --omit=dev --json`. Do NOT paste credentials, Firebase config, Auth data or private journal contents.
2. Prepare any lock-only/override fix in a **separate child branch**, never force-upgrade or silently change Firestore/Auth. Run `npm ci`, strict `npm run typecheck`, 14+ tests, `npm run build`, audit again and isolated Chromium E2E.
3. Audit remaining moderate advisories and reachable code before considering production readiness. Recheck current npm/GitHub sources by date.
4. Production restrictions remain: Vercel Preview not isolated; secure AI backend missing; no PR merge, deploy or private account migration.

**Status:** AUDIT REPORTED, FIX NOT YET IMPLEMENTED; production main unchanged.
