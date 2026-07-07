---
name: homerail-shared
description: |
  Shared HomeRail rules for AI agents operating the local-source release candidate: service roles, environment variables, secrets, provider boundaries, Docker callback networking, update expectations, and safe command behavior.
  Use whenever installing, configuring, upgrading, troubleshooting, or running HomeRail through other HomeRail skills.
---

# HomeRail Shared

## Core Rules

Use these rules with all HomeRail skills.

- Treat this release as a local-source install. Do not assume npm packages or public GitHub URLs exist yet.
- Prefer placeholders such as `<local-homerail-repo>` and `/path/to/HomeRail` in user-facing instructions.
- Keep provider and integration secrets in the Manager encrypted secret store through CLI/UI configuration; never write API keys, tokens, or passwords into repo files, skill files, DAG templates, commits, or issue text.
- Use one shared `HOMERAIL_HOME` for Manager and Node. Default is `$HOME/.homerail`.
- Prefer `hr config` for local runtime settings and `hr start` to start Manager and Node together.
- Manager and Node run as local services. Manager is not expected to run inside the Worker Docker image.
- Node provisions Worker containers. Workers for one run should share `${HOMERAIL_HOME}/workspace/<run_id>`.
- Local service ports (use this table and the CLI before falling back to low-level process probes):

  | Port | Role | Default URL | Notes |
  | --- | --- | --- | --- |
  | 19191 | **Manager** (HTTP + WS, what DAGs and the CLI talk to) | `http://localhost:19191` | This is the only port a DAG run / CLI hits. Bind via `HOMERAIL_MANAGER_HOST` / `manager.host` / `hr start --host`; public access via `HOMERAIL_MANAGER_PUBLIC_URL` / `hr start --public-url`. |
  | 19192 | Agent UI (HTTPS, browser) | `https://localhost:19192` | Browser-only. Do NOT send DAG/CLI traffic here. Config via `HOMERAIL_UI_HOST` / `HOMERAIL_UI_PORT` / `ui.host` / `ui.port`. |
  | 19193 | Agent UI HTTP fallback | `http://localhost:19193` | Fallback when HTTPS port is taken. Config via `HOMERAIL_UI_HTTP_PORT` / `ui.httpPort`. |

  The Manager port is **19191, not 19192**. 19192 is the Agent UI. Mixing these up is the most common startup mistake.
- For `hr start --ui --public` without explicit public URLs, Agent UI should bind and advertise the detected machine IP with HTTPS, and the browser should use same-origin Manager API/WS proxying for the HTTPS UI. Use `HOMERAIL_PUBLIC_HOST` only when automatic machine IP detection picks the wrong interface.
- For reverse-proxied public access, prefer explicit HTTPS/WSS public URLs through `HOMERAIL_MANAGER_PUBLIC_URL` / `HOMERAIL_UI_PUBLIC_URL` or `--public-url` / `--ui-public-url`.
- Do not hardcode Docker bridge addresses. Use Docker `host.docker.internal` / host-gateway support or explicit operator-provided callback settings.

## Provider Boundaries

For Coding Plan / Agent Plan accounts:

- Never use `direct-llm` or Chat Completions as the worker runtime path.
- Kimi plans should use the Kimi Code CLI harness (`kimi_code` / `kimi-code`).
- Other provider plans should use the Claude Code compatible harness (`claude-sdk`) with an Anthropic-compatible endpoint.
- If a plan does not expose an Anthropic-compatible endpoint, fail explicitly instead of falling back to the Chat Completions URL.

For MiMo:

- DAG worker LLM access uses the MiMo token-plan Anthropic-compatible endpoint.
- MiMo ASR/API-billing endpoints are a separate voice path and must not be mixed into DAG worker model configuration.
- If a user provides a provider key, configure it with `hr model configure --api-key-stdin` or the interactive CLI/UI flow so Manager stores it encrypted. Plaintext env files are legacy import fallbacks only.

## Local Source Layout

Expected source checkout:

```text
<local-homerail-repo>/
  homerail_manager/
  homerail_node/
  homerail_worker/
  homerail_protocol/
  homerail_cli/
  agent-ui/
  assets/
  skills/
```

Use `homerail_cli` for the TypeScript CLI. Do not refer to the old `homerail_cli_ts` name.

## Anti-Patterns (Don'ts)

These cause wasted investigation rounds during normal operation. The CLI already exposes everything below.

- **Do not start service diagnosis with raw process probes or source spelunking.** Run `hr doctor` (readiness) and `hr runtime status` (live state) first; they report manager/node/worker/model state. Use `ps`, `lsof`, direct `curl`, logs, or source reading only after the CLI output is insufficient or the user explicitly asks for low-level debugging.
- **Do not start a fixed host Worker process.** DAG Workers are provisioned on demand by a Node into Docker containers; there is no standing worker to launch. Starting a bare `homerail_worker` node process manually will not register correctly and bypasses the isolated-workspace contract every DAG depends on.
- **Do not hand-craft WebSocket URLs or reverse-engineer the worker connection protocol.** `hr start` handles Manager↔Node↔Worker wiring. If a Worker cannot reach the Manager, set the Manager worker-WS callback host (see `homerail-install-ops` troubleshooting), do not hardcode Docker bridge IPs.
- **Do not rebuild packages before every DAG run.** `install:all` / `build` / `typecheck` / `test` are only needed after changing source or on first install. A ready runtime runs DAGs directly via `hr run`.
- **Do not read `dag_runs`/`dag_handoffs` tables via `sqlite3` to get run output.** Use `hr dag handoffs <run_id>` (with `--content-limit 0` for untruncated content). The CLI is the supported read path.
- **Do not treat an idle or `running` snapshot as success.** Terminal status (`completed`/`failed`/`cancelled`) plus non-empty handoffs is the only success signal.

## Validation Ladder

When validating a local install or change, prefer this order:

```bash
npm run install:all
npm run build
npm run typecheck
npm test
npm run ci
```

For end-to-end readiness, also run `hr config`, `hr start`,
`hr doctor`, and one public smoke DAG through `homerail-install-ops`.
