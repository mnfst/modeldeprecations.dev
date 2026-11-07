> ## Documentation Index
> Fetch the complete documentation index at: https://inference-docs.cerebras.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Deprecations

> A list of all deprecations, with the most recent announcements appearing first.

**2026-09-03**

**Gemma 4 31B availability changes with Shared Inference**

Starting September 3, 2026, `gemma-4-31b` is no longer available with Cerebras Shared Inference. This change doesn't affect [Dedicated Inference](https://inference-docs.cerebras.ai/dedicated/overview.md), where Gemma 4 31B remains available.

Use [`qwen-3.8-27b`](https://inference-docs.cerebras.ai/models/qwen-3.8-27b) for Shared Inference workloads. To continue using Gemma 4 31B, [contact us](https://www.cerebras.ai/contact) to set up Dedicated Inference.

**2026-08-17**

**Deprecated `zai-glm-4.7`**

**2026-05-27**

**Deprecated `llama3.1-8b` and `qwen-3-235b-a22b-instruct-2507`**

We recommend migrating to [GPT OSS 120B](https://inference-docs.cerebras.ai/models/openai-oss.md).

**2026-03-24**

**Deprecating `disable_reasoning` parameter for `zai-glm-4.7`**

The `disable_reasoning` parameter will no longer be supported after **July 21, 2026**. Migrate to `reasoning_effort="none"` to disable reasoning on `zai-glm-4.7`.

See the [Reasoning guide](https://inference-docs.cerebras.ai/capabilities/reasoning.md) and [Chat Completions API reference](https://inference-docs.cerebras.ai/api-reference/chat-completions.md) for details.

**2026-02-16**

**Deprecated `qwen-3-32b` and `llama-3.3-70b`**

We recommend migrating to [GPT OSS 120B](https://inference-docs.cerebras.ai/models/openai-oss.md).

> [!NOTE]
>
> **Migration Notes**:
>
> * Qwen 3 32B had reasoning enabled by default. GPT OSS supports configurable reasoning via the `reasoning_effort` parameter. Review the [Reasoning](https://inference-docs.cerebras.ai/capabilities/reasoning.md) documentation before migrating.
> * Legacy strict mode (constrained decoding) behavior on `llama-3.3-70b` differs slightly from current models. Review the [Structured Outputs](https://inference-docs.cerebras.ai/capabilities/structured-outputs.md) and [Tool Use](https://inference-docs.cerebras.ai/capabilities/tool-use.md) documentation before migrating requests using `tools` and/or `response_format` in strict mode.

**2026-01-20**

**Deprecated `zai-glm-4.6`**

We recommend migrating to [Z.ai GLM 4.7](https://inference-docs.cerebras.ai/models/zai-glm-47).

**2025-11-14**

**Deprecated `qwen-3-235b-a22b-thinking-2507`**

We recommend migrating to [GPT OSS 120B](https://inference-docs.cerebras.ai/models/openai-oss.md).

**2025-11-05**

**Deprecated `qwen-3-coder-480b`**

We recommend migrating to [Z.ai GLM 4.7](https://inference-docs.cerebras.ai/models/zai-glm-47).

**2025-11-03**

**Deprecated `llama-4-scout-17b-16e-instruct`**

We recommend migrating to [GPT OSS 120B](https://inference-docs.cerebras.ai/models/openai-oss.md) or [Llama 3.3 70B](https://inference-docs.cerebras.ai/models/llama-33-70b).

**2025-10-15**

**Deprecated `llama-4-maverick-17b-128e-instruct`**

We recommend migrating to [GPT OSS 120B](https://inference-docs.cerebras.ai/models/openai-oss.md) or [Llama 3.3 70B](https://inference-docs.cerebras.ai/models/llama-33-70b).

**2025-08-12**

**Deprecated `deepseek-r1-distill-llama-70b`**

We recommend migrating to [Qwen 3 32B](https://inference-docs.cerebras.ai/models/qwen-3-32b).

**2025-07-29**

**Deprecated `qwen-3-235b-a22b`**

We recommend migrating to either [Qwen 3 235B Instruct](https://inference-docs.cerebras.ai/models/qwen-3-235b-2507) or [Qwen 3 235B Thinking](https://inference-docs.cerebras.ai/models/qwen-3-235b-thinking).

**2025-01-17**

The `llama3.1-70b` model has been deprecated. We recommend transitioning to `llama-3.3-70b`, a more powerful model released by Meta.
