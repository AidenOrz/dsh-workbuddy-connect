# DSH WorkBuddy Connect

English | [中文](./README.md)

## Branch merge notice

This repository has merged the upstream fix branch [`fix/channel-identity-opener`](https://github.com/corrinehu/dsh-workbuddy-connect/pull/204) (PR [#204](https://github.com/corrinehu/dsh-workbuddy-connect/pull/204), by [@Elycheng](https://github.com/Elycheng)) from `corrinehu/dsh-workbuddy-connect` into `main` (merge commit `0c9b269`); the plugin version is now **0.7.10**.

**Why**: since October 20, 2026 the CN gateway answers `HTTP 400 / code 11128` ("request blocked, please send again") to any request whose system message opens with `You are an AI agent powered by DeepSeek Harness.` — the fixed line DSH injects into every agent request — so every model in the WorkBuddy group failed at once, while the official app kept working.

**Changes**:

- `src/upstream.ts` gains `neutralizeChannelIdentity()`: it rewrites the rejected opening sentence of every system / developer message to the neutral `You are an AI agent.` String `content` and array-form `text` parts are both covered; long sessions that carry several system messages are all rewritten; user turns, tool results, a second occurrence inside the same string and every other body field stay untouched.
- `prepareChatBody()` (international wire) and `prepareCnChatBody()` (probe / CN wire) run the same step, so both wires agree, and repeat calls are idempotent.
- New `tests/channel-fingerprint.spec.ts` (11 cases); `lib/` is rebuilt from `src/` with `tsdown` in the same commit, per repository convention.

**Follow-up (0.7.11)**: in practice #204 covered only `… powered by DeepSeek Harness.` The line DSH writes right after it — `You are a coding agent powered by <model> model.` — becomes the new opener and is rejected by the same check, so sessions still returned `HTTP 400 / code 11128`. 0.7.11 widens the match to both shapes (dotted model names such as `v4.1` included) and neutralizes every identity line stacked at the top of one system message.

**0.7.12 (Windows channel check)**: a captured request pinned two more causes. First, the check scans the whole system message, not just its opener — DSH appends runtime context every turn (`Current DeepSeek Harness implementation checkout: "…"`, `Current DeepSeek Harness Web GUI URL: …`), so one request carried a dozen `DeepSeek Harness` occurrences and neutralizing the opener was not enough. Every occurrence in system / developer messages is now rewritten to `the agent runtime`; user turns stay untouched. Second, `installedCnApp()` only had a macOS branch, so on Windows the client version always fell back to the compiled `5.5.6` and the UA had no `CLI/…` segment, unlike the installed WorkBuddy `5.8.3` with `CLI 2.161.0`. It now reads `WorkBuddy.exe`'s FileVersion and `resources\app.asar.unpacked\cli\package.json`, restoring the official UA `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0`.

**Caveat**: this is a byte-level compatibility rewrite aimed at a newly added third-party client check, so it is a cat-and-mouse fix — if upstream starts normalizing the opener, the neutral spelling needs to be revisited. Account and access risks remain the user's own, as stated in the "Disclaimer" at the end.

**0.7.13 (DSH 0.2.1-rc.3)**: DSH decides compatibility by comparing the plugin's `engines.dsh` — or, when that is absent, every `@deepseek-ai/dsh*` entry in `peerDependencies` — against the running core, and refuses the install or the startup with `incompatible-version` when any requirement is unmet. The peers were pinned to an exact `0.2.1-rc.2`, so the rc.3 upgrade rejected the whole package. Both are now `^0.2.1-rc.2`, which admits rc.2 and rc.3 without crossing into 0.3.

**0.7.14 (channel check, second round)**: 11128 came back on 2026-10-27 with nothing to do with the product name. Bisecting a captured 49 KB request body put the trigger on a single clause contributed by `@deepseek-ai/dsh-file-reference` — `Relative paths resolve from the workspace root` — which the gateway matches as a whole **sentence**. Changing any word in it (`resolve` to `map`, `workspace` to `dir`) or dropping the clause makes the identical body answer 200; `workspace root` on its own, or the same words padded with filler, does not trigger it, so this is a sentence-level rule rather than a word list. It is now rewritten to `Relative paths resolve against the workspace directory`, with the meaning unchanged.

**Version note**: `latest` on npm is still 0.7.9; these fixes live only on the repository's `main` (0.7.14). To use them now, install from this repository with the `github:` command in the Install section; when GitHub is unreachable, use the local tarball instead (see below).

This repository's `main` is now one merge commit ahead of upstream; when syncing upstream later, avoid a hard reset so the fix is not lost.

---

Brings the models available in your signed-in WorkBuddy / WorkBuddy AI desktop app into [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness); the two versions each show their own model group and reuse their own account sign-in and credit.

## Install

**Prerequisite**: the WorkBuddy (CN) or WorkBuddy AI desktop app is installed and signed in on this machine. The plugin reuses the app's sign-in state and follows account switches automatically; the two never affect each other.

The plugin version must match the DSH core — a mismatch is rejected as `incompatible-version`, at install time or at startup — and the Desktop app picks its plugin version by the bundled core. This repository is verified on **DSH `0.2.1-rc.2` / `0.2.1-rc.3`** (Node 22+, pnpm 11):

| DSH core | Plugin version |
|---|---|
| `0.2.1-rc.3` | `0.7.14` (this repository's `main`) |
| `0.2.1-rc.2` | `0.7.14` / `0.7.12` (this repository's `main`) / `0.7.9` (npm) |
| `0.2.1-rc.1` | `0.7.7` |
| `0.2.0-rc.2` | `0.7.6` |
| `0.2.0-rc.1` | `0.7.0` |
| `0.1.5` – `0.1.7` | `0.6.5` |

### Desktop (Windows / macOS)

Run this with the **`dsh` bundled in the desktop app's runtime**, not a standalone CLI — the official Electron build rejects a standalone CLI's `--profile desktop`.

```sh
dsh plugin --profile desktop add github:AidenOrz/dsh-workbuddy-connect
```

- **`latest` on npm is still `0.7.9`, which contains neither the 2026-10-21 channel-check fix nor the rc.3 adaptation.** The command above installs `0.7.14` from this repository's `main`.
- Package names are unique within a profile: the command **replaces** an already installed copy rather than adding a second one. To return to the npm build: `dsh plugin --profile desktop add dsh-workbuddy-connect@0.7.9`.
- Fully quit and restart the app afterwards — the plugin is loaded at startup.
- The `github:` specifier is resolved by pnpm through `git ls-remote`; when GitHub is unreachable you get `ERR_PNPM_GIT_RESOLVE_FAILED` / `CONNECT tunnel failed`. **Install from a local tarball instead — no network needed:**

  ```sh
  # In this repository (runs the tsdown build), producing dsh-workbuddy-connect-0.7.14.tgz
  pnpm install && pnpm pack

  # Remove the git-sourced entry first, or pnpm still tries to reach GitHub
  dsh plugin --profile desktop remove dsh-workbuddy-connect
  dsh plugin --profile desktop add <absolute path to the tarball>
  ```

  The install record then points at that absolute path, so deleting the tarball breaks the next `pnpm install`; switch back to the `github:` source once GitHub is reachable.
- Verified here on Windows 11 + WorkBuddy `5.8.3` + DSH `0.2.1-rc.3`.

### Web / TUI

```sh
# Web (example: core 0.2.1-rc.2 -> plugin 0.7.9)
dsh plugin --profile web add dsh-workbuddy-connect@0.7.9
dsh web

# TUI (example: 0.1.x core -> plugin 0.6.5; that profile needs pnpm 11, e.g. npx pnpm@11)
dsh plugin --profile dsh-tui add dsh-workbuddy-connect@0.6.5
dsh --profile dsh-tui
```

> Web / TUI can also install `0.7.14` from `github:AidenOrz/dsh-workbuddy-connect`, but this repository is only verified on Desktop.
> TUI version pairing: the terminal shell `@deepseek-harness-tui/dsh-tui` must be `0.10.0-beta.5` or newer — older versions fail at startup with this plugin installed (`events is not iterable`); manual reasoning-level detection exists on Web / Desktop only, not TUI.

### Verify

After restarting the interface, the model picker shows the "WorkBuddy / WorkBuddy AI" group(s) (with only one app installed, check just that group); a model picked from the group completes one short conversation with a normal reply — that is what a successful install means.

### When the install fails

- **`incompatible-version`, or "Plugin … is incompatible with dsh 0.2.1-rc.x"**: the plugin version has not caught up with the upgraded core; install the plugin version listed in the table above. `dsh plugin allow-version` can exempt that exact plugin-version/core-version pair temporarily, but it only skips the check — it does not make the plugin compatible.
- `ERR_PNPM_GIT_RESOLVE_FAILED` / `CONNECT tunnel failed`: GitHub is unreachable; configure a proxy for git and retry, or install from a local tarball (see above).
- `ERR_MODULE_NOT_FOUND: @deepseek-ai/...`: the profile's dependency tree is incomplete (a broken pnpm link); run `pnpm install` again in that profile directory, or use the app's built-in plugin channel.
- On some Desktop distributions (the official Electron app in particular) the `desktop` profile is app-managed and the rules vary by distribution; never blindly edit the app-managed directory or bypass its validation.

## Features

- **Works out of the box**: install and enable the plugin, then use it directly in DSH — no extra configuration.

![WorkBuddy models in the DSH model picker](assets/1.png)

- **CN and international side by side**: the CN app appears as the WorkBuddy group and the international one (WorkBuddy AI) as the WorkBuddy AI group; their models, accounts, and credit never mix. Each group follows only its own app's sign-in — install just the international app and only WorkBuddy AI appears, install both and both groups appear, sign out of one and that group goes away. Settings shows one card per version, each with its own account and balance.

![WorkBuddy AI models in the DSH model picker](assets/5.png)

- **Image input**: most models accept images pasted or dropped straight into the conversation (GLM-5.3-Flash, the DeepSeek-V4 series, and more); the few text-only models (e.g. GLM-5.1 / GLM-5.2 on the China endpoint) clearly say so.

- **Reasoning levels**: levels explicitly declared by WorkBuddy appear directly — for example, GLM-5.3 and GLM-5.3-Flash offer low / high / max. For models without declared levels, Web and Desktop offer a manual check in the model picker (it sends a few requests and may consume credit); models without a check result or selectable levels keep using WorkBuddy's default.

- **Balance at a glance**: with a WorkBuddy / WorkBuddy AI model selected, the composer shows the account's remaining credit next to the model selector (e.g. `WB.3,401 credits`, `WB AI.3,401 credits` on the international app). Credit is not polled automatically (every status read is a real billing query): one read on mount, then refresh on demand with the ↻ before the balance. During session switching, the controls may briefly hide until the model selection is ready, then return automatically. The refresh button remains available even when the model has no reasoning-level detection entry or the balance cannot be read.

- **Status and detection**: Settings → Plugins → the matching card shows the account, token validity, remaining credit, and model offers; it also refreshes the model list manually, shows whether the current list came from the upstream or the built-in fallback, and runs manual reasoning-level detection for eligible models. On DSH 0.1.5 the entry lives under Settings → Plugins; on 0.1.6+ it moved to the left-sidebar Plugins panel (workbuddy-connect → View) — and the Settings → Models page shows no WorkBuddy entries on either generation, by design.

- **Model visibility**: the Context window tab of each card lets you check which models appear in the model picker. Hidden lists are saved per signed-in account: switching accounts switches to that account's own list, switching back restores it; new accounts and newly added models are visible by default. Hiding only affects pickability — existing chats using a hidden model keep working.

![Model visibility in the context-window list (DSH 0.1.6+ plugin configuration page)](assets/6.png)

The same UI works unchanged inside the DSH 0.1.5 settings cards:

![Model visibility in a DSH 0.1.5 settings card](assets/7.png)

- **Enterprise credit**: on the CN product, enterprise accounts (non-empty `enterpriseId`) read their cycle quota from the enterprise billing endpoint, and the card shows the enterprise quota with the cycle reset time.

- **Rate**: every model name carries its credits multiplier (e.g. `GLM-5.2 · x0.79`, `Hy3 · x0.00`) in both the `/model` popup and the composer's model dropdown; the rate is display-only and never affects requests.

- **Promo badges**: promo badges (limited-time free, night discount) ride the model name itself (e.g. `Hy4 preview · x0.00 · 限时免费`), visible wherever you pick a model, and the status card collects currently discounted models — per WorkBuddy service data, synced each time DSH starts. The international version's promotions come from the service's `modelPromotions` (with an effective window); once a promotion lapses its badge is withdrawn, and because the service writes the discounted value into the model's own rate field, the original price cannot be reconstructed — the model then reports "price unavailable — refresh to update" instead of repeating the discounted rate or claiming it is free.

![Settings card showing the plugin](assets/2.png)

The expanded card has three tabs: Status shows the account, token validity, total credit, catalog source, and reasoning-level detection; Context lists each model's context window, and the international version's "use the upstream's largest declared context window" switch lives here (on by default, so DSH sizes context compression to the largest declared window; turn it off to follow the upstream default instead, and the preference persists across restarts); Details combines credit packages with the same name and shows model offers. The CN and international versions each get their own card.

![Settings card showing account and remaining credit](assets/3.png)

## Why reasoning levels work this way

Information about WorkBuddy models' reasoning levels is currently split between upstream API responses and private UI logic in the client, while the model catalog changes quickly. If the plugin filled in one uniform set of levels for every model without an upstream declaration, it would need to keep chasing unpublished product logic with no stable contract.

![Reasoning-level detection in the composer](assets/4.png)

Testing also found that some models accept the `reasoning_effort` parameter while ignoring unknown values and falling back to their default behavior. A successful request alone therefore does not prove that a level is actually usable.

For models without declared levels, Web and Desktop instead use user-authorized, on-demand detection: it first confirms that the upstream validates the parameter, then checks which standard levels it accepts. The check sends a few requests and may consume credit. Its result means only that the upstream currently accepts that level; it does not promise a particular change in reasoning quality, speed, or credit use.

## CLI

Run this against a profile that has the plugin installed:

```sh
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-workbuddy-connect <status|doctor|logout>
```

- `status`: sign-in state and remaining credit; `doctor`: secret-free diagnostics; `logout`: removes only that version's plugin-owned credential copy, leaves the desktop app's own sign-in alone, and does not promise the model group disappears (the app's credential file still supplies one).
- `--json` emits machine-readable output and is supported by `status` / `doctor` **only**; adding it to `logout` reports invalid options.
- `--provider <id>` chooses the version: `workbuddy` (default, CN) or `workbuddy-ai` (international); `--provider=<id>` is accepted too:

```sh
dsh plugin --profile web exec dsh-workbuddy-connect status --provider workbuddy-ai
dsh plugin --profile web exec dsh-workbuddy-connect doctor --provider workbuddy-ai
```

> All three load the plugin through that profile's `node_modules` first. When the profile's dependency tree is incomplete they fail with `ERR_MODULE_NOT_FOUND` before parsing any argument — that is not an argument error (see "When the install fails").

## Configuration

Write the config in **that profile's `cordis.patch.yml`**, not `cordis.yml` — the latter is an empty array whose own comment says "Edit cordis.patch.yml, not this file". A patch file is a YAML array, and the plugin's entry id is `llm-workbuddy`:

```yaml
- id: llm-workbuddy
  config:
    retryPolicy:
      mode: normal
      maxRetries: 15
      backoff:
        initialDelayMs: 2000
        maxDelayMs: 30000
```

- Both versions share this config; the plugin reads it once at load, so restart DSH after editing.
- **Omitting `retryPolicy` keeps the defaults** (`dsh-llm`): `mode: normal`, 5 retries, 500 ms doubling to a 10 s ceiling, 10% jitter — about **15.5 s** of scheduled backoff (≈14–17 s) plus each attempt's own request time, which is not a fixed-window guarantee.
- **The example above** schedules up to about **360 s** (≈396 s at the jitter edge) — enough for a multi-minute upstream outage; a longer one needs a higher `maxRetries` or another route.
- `mode: always` retries every failure until success, cancellation, or disposal with **no attempt cap**; it is not the default and is never enabled by omission.
- `mode` is required (`normal` / `always`). `normal` also accepts `retryableCodes` (default `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT`) and `backoff.jitterRatio` (default `0.1`).

## Channel fingerprint rules

The CN gateway rejects requests that carry a "non-official client" fingerprint (`400 / code 11128`). Before sending, the plugin rewrites those fingerprints to neutral wording. The rule table is **not** edited in code:

- A set of **built-ins** ships with the package, so a fresh install works immediately.
- An optional **external file** overrides them, machine-local and untracked.

```text
%USERPROFILE%\.dsh\.workbuddy-channel-fingerprints.json     # default location
```

Point `WORKBUDDY_FINGERPRINTS` elsewhere if you prefer. Format: [`docs/channel-fingerprints.example.json`](./docs/channel-fingerprints.example.json).

```json
{
  "version": 1,
  "rules": [
    { "find": "the text the gateway rejects", "replace": "what to send instead" }
  ]
}
```

Details worth knowing:

- `find` is **literal** by default — dots and parentheses are ordinary characters. Use `"regex": true` (plus optional `"flags"`, default `gu`) when you need a pattern.
- A rule whose `find` matches a built-in **overrides** it; a new `find` **appends**. Built-ins are never removed, so a broken file degrades to built-in behaviour rather than breaking the plugin.
- **No restart needed**: when the file's size or mtime changes, the next request picks up the new table.
- A document version higher than the build supports is rejected (falling back to built-ins) instead of being half-understood.

Why it lives in a file: this is a cat-and-mouse game, and every new gateway rule used to mean a code change, a rebuild and a reinstall. Now it is one text edit and the next request. The three rounds so far are documented in [`docs/channel-check-fix.md`](./docs/channel-check-fix.md) (Chinese).

## Known limitations

- Verified on macOS with the DSH Web / Desktop / TUI profiles (as of 0.3.2 this requires `0.1.5-rc.1`+ and Node 22+; TUI requires the terminal UI package `0.10.0-beta.5` or newer — see the Install section). Windows probes Local and Roaming AppData in order; WSL first reads credentials from the mounted Windows user profile. If the Windows and Linux user names differ and Windows environment variables are not forwarded into WSL, point `WORKBUDDY_AUTH_FILE` (or `WORKBUDDY_AI_AUTH_FILE` for the international version) at the actual file.
- **Encrypted desktop credential helper discovery**: the helper is auto-detected on macOS and Windows. Windows uses an explicit process setting first, then registry configuration (user environment before system environment), then the default installation, then uninstall-record discovery. An invalid explicit setting is an error, not a fallback to another installation. The CN default is `%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe`; no international default has been verified. Set `WORKBUDDY_ELECTRON_BIN` (CN) or `WORKBUDDY_AI_ELECTRON_BIN` (international) to name an executable. When the process variable is absent, empty, or whitespace-only, Windows queries the registry asynchronously. Misses are not cached, so resolution can retry a newly configured value without restarting; the running-Desktop interaction still needs real Windows verification. Successful values are cached per instance; fully restart DSH to switch between still-valid configured installations. macOS and Linux still require a full restart after environment changes; Linux requires an explicit executable path. For WSL, the plugin normalizes the child `WSLENV` entry for `ELECTRON_RUN_AS_NODE` to one safe flag set with `/w`, without path conversion, preserving other entries. Offline regression tests pass; real WSL2 / Windows verification remains outstanding.
- **The international version's model catalog comes from the app's own interface**: the service splits it by User-Agent, which is a private implementation detail that a server-side change can break. When that happens the plugin degrades to this account's last successful catalog and then to its built-in roster, showing the source (live / saved / built-in), the fetch time, and the failure reason on the card — but long-term compatibility is not guaranteed. The CN version's catalog uses the same interface as the official CLI and is unaffected.
- **International-version environments not yet covered**: on Windows / WSL / Linux no reliable source for the international app's version has been located yet, so the saved value or the built-in default is used. On macOS, real-shim checks covered complete GPT-family replies, tool calls, and continued turns.
- **Behaviour change with no credentials**: a version whose app was never signed in — and that left no plugin-owned copy — no longer shows a model group. The CN version used to display a built-in fallback list, but every model on it failed when selected.
- **The enterprise credit path currently covers the CN product only**: the international enterprise billing interface is unverified, so those accounts still read through the personal endpoint pending measurement. The enterprise branch could not be tested locally (the development machine holds a personal account); it was implemented from the official app's interface contract, and reports from enterprise users are welcome.
- **Settings entries vary with the DSH version**: older services use `installSection`; newer ones use SettingsForms. On DSH 0.2.1-rc.2, 0.7.9 restores the international edition's maximum-context switch, enabled by default. Turning it off uses the upstream default window, and the preference survives restarts. The switch appears only once this plugin's writable settings entry is ready; while waiting, the maximum window remains the default.
- Relies on WorkBuddy client interfaces (not a public API); the plugin may need updates as WorkBuddy changes.

## Compatibility and release history

The plugin version must match the DSH core — a mismatched combination fails to start DSH — and the Desktop app picks its plugin version by the bundled core. The newest npm release is not necessarily right for you: match your actual core first.

| DSH core | Recommended plugin | Notes |
|---|---|---|
| `0.2.1-rc.3` | `0.7.14` | Declares `engines.dsh: ^0.2.1-rc.2`, so the rc.2 and rc.3 lines both pass DSH's compatibility gate. |
| `0.2.1-rc.2` | `0.7.14` (or `0.7.9` from npm) | `0.2.0-rc.2` and `0.2.1-rc.2` differ; check the core bundled in your Desktop app. |
| `0.2.1-rc.1` | `0.7.7` | The core moved to `@earendil-works/pi-ai` 1.3.0, so the plugin bundles 1.3.0 too — a leftover 0.87.1 overrides entry must be removed (see the pi-ai note below). |
| `0.2.0-rc.2` | `0.7.6` | Previous core line; fixes enterprise catalog gaps and international chat requests blocked by the upstream channel check. Avoid 0.7.2 with its registry regression. |
| `0.2.0-rc.1` | `0.7.0` | 0.7.1 drops rc.1 support; stay on this version. |
| `0.1.5` – `0.1.7` | `0.6.5` | Final release for the old cores; 0.7.0 targets 0.2.0 only. |
| `0.1.2-rc.1` | `0.3.1` | Older line, historical maintenance only. |
| `0.1.1-rc.2` | `0.2.6` | Older line, historical maintenance only. |

Release history (full records at [releases](https://github.com/corrinehu/dsh-workbuddy-connect/releases)):

- **0.7.14**: fixes a second channel-check fingerprint. The gateway matches the whole sentence `Relative paths resolve from the workspace root` (contributed by `@deepseek-ai/dsh-file-reference`); it is now rewritten to `Relative paths resolve against the workspace directory`. Found by bisecting a captured 49 KB request body after `HTTP 400 / code 11128` returned with every earlier fingerprint already neutralized.
- **0.7.13**: adapts to DSH 0.2.1-rc.3 — `engines.dsh` / peer ranges widened to `^0.2.1-rc.2` so the rc.3 core no longer rejects the package as `incompatible-version`.
- **0.7.12**: fixes the Windows channel-check failure: the product name is neutralized everywhere in system messages (previously only the opener), and the real client version plus the bundled CLI version are read on Windows, restoring the `CLI/…` UA segment.
- **0.7.11**: widens the channel-fingerprint rewrite to the per-model identity line (`You are a coding agent powered by <model> model.`, dotted model names included) and neutralizes every identity line stacked at the top of one system message; fixes the `HTTP 400 / code 11128` still seen after 0.7.10.
- **0.7.10**: fixes the CN gateway's channel check on the fixed DSH opener (a system message starting with that sentence returned `HTTP 400 / code 11128`) by rewriting the opening sentence to a neutral one, for both string and array content shapes (PR [#204](https://github.com/corrinehu/dsh-workbuddy-connect/pull/204), by @Elycheng).
- **0.7.9**: restores the international edition's maximum-context switch on DSH 0.2.1-rc.2, including delayed initialization and persistent settings (PR [#172](https://github.com/corrinehu/dsh-workbuddy-connect/pull/172), by @1Dreamer666); avoids fetch-blocked local ports that could cause international-edition 502 errors (PR [#164](https://github.com/corrinehu/dsh-workbuddy-connect/pull/164), by @Xiong-Ziyi); combines credit packages with the same name to reduce repeated entries.
- **0.7.8**: adapts to DSH 0.2.1-rc.2; bundles the official atomic-write helper instead of relying on host module exposure; refreshes the China catalog snapshot and distinguishes Hy3 / Hy3-X; improves probe result labels and fixes the credit-refresh placement and tooltip. Thanks to @chenpiyanghappy for PR [#156](https://github.com/corrinehu/dsh-workbuddy-connect/pull/156).
- **0.7.7**: adapts to the DSH 0.2.1-rc.1 core: peers narrow to 0.2.1-rc.1 and the plugin-bundled `@earendil-works/pi-ai` moves to 1.3.0 with it (a profile-level leftover 0.87.1 overrides entry must be removed, or the plugin fails to load).
- **0.7.6**: fixes enterprise accounts missing `glm-5.3-flashx` from the model catalog ([#123](https://github.com/corrinehu/dsh-workbuddy-connect/issues/123)), and fixes international chat requests being blocked by the upstream channel check ([#139](https://github.com/corrinehu/dsh-workbuddy-connect/issues/139) / [#142](https://github.com/corrinehu/dsh-workbuddy-connect/issues/142)).
- **0.7.5**: restores composer controls after session switching ([#125](https://github.com/corrinehu/dsh-workbuddy-connect/issues/125) / [#132](https://github.com/corrinehu/dsh-workbuddy-connect/issues/132)), fixes WSL helper environment forwarding ([#133](https://github.com/corrinehu/dsh-workbuddy-connect/issues/133)), and adds community projects to both READMEs.
- **0.7.4**: Windows diagnostics and stability improvements: accurate classification of oversized registry-subprocess output, cross-platform test-assumption fixes ([#62](https://github.com/corrinehu/dsh-workbuddy-connect/issues/62)), and a reworked install section.
- **0.7.3**: fixes Windows registry auto-discovery failing on non-default install paths ([#105](https://github.com/corrinehu/dsh-workbuddy-connect/issues/105)).
- **0.7.2**: pi-ai becomes a plugin-bundled dependency and rejected inference-field requests are fixed ([#92](https://github.com/corrinehu/dsh-workbuddy-connect/issues/92)); this release carries a Windows registry regression — use 0.7.4 or a newer stable release.
- **0.7.1**: narrows the pi-ai dependency range.
- **0.7.0**: adapts to DSH 0.2.0's settings-service rework and drops 0.1.x support.
- **0.6.5**: final release of the 0.1.x line.

Pinned-version install example: `dsh plugin --profile web add dsh-workbuddy-connect@0.7.9`.

**pi-ai versions are per core line and must not be mixed**: the 0.2.1-rc.1 / rc.2 core lines (plugin 0.7.7 / 0.7.8–0.7.9 respectively) moved to `@earendil-works/pi-ai` 1.3.0 (bundled by the plugin), so a profile-level leftover `overrides: {'@earendil-works/pi-ai': '0.87.1'}` **must be removed** or the plugin fails to load; the 0.2.0-rc.2 core line (plugin 0.7.6) still requires `^0.87.1` — on that line, **do not** upgrade the profile-level pi-ai to 1.x, and do not act on third-party plugin managers' "updatable" prompts, which do not check peer constraints ([#86](https://github.com/corrinehu/dsh-workbuddy-connect/issues/86)).

## Disclaimer

- This project is for **personal learning and research only**, driving your own WorkBuddy / WorkBuddy AI account on your own machine. Do not use it commercially or beyond reasonable personal use.
- This project is not affiliated with, authorized by, or endorsed by Tencent, WorkBuddy, or DeepSeek. Product names are used only to describe compatibility; trademarks belong to their respective owners.
- **Third-party access carries account risks.** The official terms of service restrict unauthorized third-party access. Using this project may result in account or feature restrictions, account bans, or suspension or termination of service. Successful requests and normal credit deductions do not imply official authorization or the absence of account risks.
- Please understand these risks and decide for yourself whether to install and use this project. Account restrictions, credit losses, service interruptions, and other consequences arising from its use are borne by the user. If you cannot accept these risks, use the official client.
- This project does not guarantee continued service availability, freedom from account restrictions, or consistently accurate credit displays. The developer cannot control the platform's restrictions, penalties, or service changes.
- The author is not liable for any direct or indirect loss arising from the use or misuse of this project.

## Related Projects / Community Ecosystem

- **[dsh-workbuddy-switcher](https://github.com/ddGuo/dsh-workbuddy-switcher)**: a community-maintained WorkBuddy account management and switching plugin.
- **[hana-workbuddy-connect](https://github.com/miaoyongxu/hana-workbuddy-connect)**: a community-maintained unofficial adapter project that reuses parts of the `dsh-workbuddy-connect` implementation to bring WorkBuddy / WorkBuddy AI models to HanaAgent.

See each project's documentation for supported versions and installation requirements. These projects are independently maintained by third parties. Listing them here is not an official endorsement or a stability or compatibility commitment for this plugin's internal interfaces.

## Acknowledgements

- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api) (MIT) — reference implementation of the WorkBuddy upstream protocol.
- [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect) (Apache-2.0) — reference for the DSH plugin structure and provider registration.

## License

[MIT](./LICENSE)
