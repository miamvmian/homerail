# Public Assets

This directory contains assets intended to be copied or referenced by operators
and DAG templates.

- `orchestrations/*.yaml.template` are DAG templates. Pass them explicitly to
  the CLI or copy them before editing workflow shape. Provider/model selection
  comes from HomeRail's database LLM settings, configured by CLI or UI.
- `profiles/*.profile.yaml.template` are importable runtime profile examples.
  They bind to a DAG `workflow_id` and reference local DB models by
  `model_alias` or `llm_setting_id`.

Start with `orchestrations/public-two-node.yaml.template` when you only need to
check DAG topology. Use `orchestrations/public-dev-5node.yaml.template` for the
full public smoke that creates and validates shared workspace artifacts.
Use `orchestrations/local-harness-cli-deploy-diagnosis.yaml.template` when an agent
should pull fresh source, attempt CLI deployment, and file a deployment blocker
issue without modifying code.
