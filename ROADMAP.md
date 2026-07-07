# HomeRail Roadmap

The design philosophy stays constant: the human side stays narrow (voice in,
generated UI out) while the machine side grows wide (more agents, more nodes,
more environments). Attention is the scarcest resource; everything here aims to
spend less of it.

## What HomeRail is for

An AI agent can produce many kinds of output — a video, a report, a config, a
piece of software. These outputs are not equally easy to judge. A generated
video is easy to evaluate — you watch it, and you know. A piece of software is
not — "done" is ambiguous, quality is contested, and the person who asked for
it often cannot tell whether it actually meets the need.

HomeRail is built around this asymmetry. It targets tasks whose **result is easy
to assess on its own merits** — a video, a report, a generated asset, a
configured system, a designed artifact. The work to get there may involve code,
tools, and software as a means, but the value lives in the result, not in a code
repository. When a DAG node happens to write a script to render a frame, the
script is a tool; the frame is the deliverable.

This is why HomeRail is **not designed for software engineering or development
automation**. It is not optimized for SWE-bench-style coding tasks, it does not
try to replace a developer, and "ship a software feature" is not the kind of
outcome it optimizes for. Software is one of the hardest things for a person to
evaluate — so it is exactly the wrong target for a system whose whole point is
making AI results easy to judge.

## Short term — Stable foundation

Stability before features.

- **Desktop shell on macOS, Windows, Linux.** The desktop shell must start,
  stay up, and control local backend services predictably across all three
  platforms. Signed and notarized installers are an explicit step here, not a
  nice-to-have.
- **Manager Agent you can trust.** The agent that converts a request into a DAG
  plan, assigns work, inspects evidence, and surfaces blockers must be reliable
  enough to hand real tasks to — not just smoke tests.
- **UI internationalization.** The voice surface defaults to Chinese today.
  Both the voice surface and the generated UI need first-class English (and a
  path for more languages), so the product is not locked to one locale.

## Mid term — Scenario-driven iteration

Grow the pillars by building real scenarios, not by abstract platform work.

- **Design the generated UI and DAG assets from real use cases.** The generated
  UI is still a concept — the contract and the widget set will keep changing.
  Instead of expanding the catalog in the abstract, pick concrete recurring
  tasks and let real use shape which views exist and what they say. Expect the
  contract to be redesigned under that pressure, not just extended.
- **Improve the engine and the UI experience through those scenarios.** Each
  scenario is a stress test of both the DAG engine (handoffs, retries,
  evaluation) and the generated UI (how much can the person tell at a glance?).
  The findings flow back into the engine and the widget contract.

The goal of this phase is to learn which widgets actually help, which DAG shapes
recur, and which handoffs feel natural to the person watching.

## Long term — Resident on the home datacenter

A resident service on the hardware.

- **Resident service on NAS and home-datacenter hardware.** HomeRail stays
  running, manages its own DAGs and workspace state, and survives reboots and
  upgrades without operator hand-holding.
- **Terminals that reach it from anywhere.** Phone, tablet, TV (voice-primary),
  and car interfaces. The voice surface and generated UI are the common front
  ends; the DAG engine is the common back end.
- **Multi-node management.** More than one Node, more than one machine, with the
  Manager coordinating work across them — scheduling DAG nodes onto the right
  host for the right capability, and keeping workspace and evidence coherent
  across nodes.

## Non-goals

- HomeRail is not a hosted SaaS. It is designed to run on hardware the operator
  owns.
- The DAG engine is not a general-purpose job runner. It is shaped around agent
  collaboration and evidence handoff, not batch pipelines.
- HomeRail does not build agent harnesses. A harness — Claude Agent SDK, Codex
  app server, Kimi Code, and similar — is the runtime that actually drives a
  model through tool calls, reasoning, and execution. HomeRail orchestrates
  workflows on top of these harnesses; it does not compete with them. The
  project will integrate well-built existing harnesses rather than reimplement
  one, so effort goes into the orchestration and interaction layer instead.
- HomeRail is not a software engineering or development-automation tool. See
  [What HomeRail is for](#what-homerail-is-for) for why — the short version is
  that software is one of the hardest results to evaluate, and HomeRail targets
  outcomes that are easy to judge.
