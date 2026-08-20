#### Migration Guides

# Grok Model Retirement on May 15, 2026

As we continue advancing Grok, we are retiring several earlier models to focus fully on our newest generation. **Effective May 15, 2026 at 12:00 PM PT**, the following models will be retired from the xAI API:

* `grok-4-1-fast-reasoning`
* `grok-4-1-fast-non-reasoning`
* `grok-4-fast-reasoning`
* `grok-4-fast-non-reasoning`
* `grok-4-0709`
* `grok-code-fast-1`
* `grok-3`
* `grok-imagine-image-pro`

> [!CAUTION]
>
> After **May 15, 2026 at 12:00 PM PT**, requests to the retired model slugs above will automatically redirect to `grok-4.3`. The slugs themselves continue to resolve, so you do not need to change your code to avoid breakage. Grok 4.3 is [priced differently](#pricing-impact) than the various models it replaces.

### How the redirects work

Starting **May 15, 2026 at 12:00 PM PT**:

* Requests to any **reasoning** model in the list above will be served by **`grok-4.3` with `low` reasoning effort**.
* Requests to any **non-reasoning** model in the list above will be served by **`grok-4.3` with `none` reasoning effort**.
* `grok-imagine-image-pro` will be redirected to `grok-imagine-image-quality`.

## Pricing impact

If you continue sending requests to a deprecated slug after May 15, please be aware that you will be billed at `grok-4.3` pricing of **$1.25 per 1M input tokens and $2.50 per 1M output tokens** rather than the rates of the original model.

To avoid unexpected cost increases, we recommend explicitly choosing the right replacement model for each workload before May 15. See the [recommended replacements](#recommended-replacements) below.

## Recommended Replacements

We have newer, more capable models ready for every workload. In most cases, migrating is as simple as changing the `"model"` field in your API request. Doing so explicitly lets you control which reasoning effort you pay for, rather than accepting the default applied by the redirect.

| Model being retired | Redirect target after May 15 |
|---|---|
| `grok-4-1-fast-reasoning` | `grok-4.3` with `low` reasoning effort |
| `grok-4-1-fast-non-reasoning` | `grok-4.3` with `none` reasoning effort |
| `grok-4-fast-reasoning` | `grok-4.3` with `low` reasoning effort |
| `grok-4-fast-non-reasoning` | `grok-4.3` with `none` reasoning effort |
| `grok-4-0709` | `grok-4.3` with `low` reasoning effort |
| `grok-code-fast-1` | `grok-build-0.1` |
| `grok-3` | `grok-4.3` with `none` reasoning effort |
| `grok-imagine-image-pro` | `grok-imagine-image-quality` |

### Reasoning workloads

If you are using `grok-4-1-fast-reasoning`, `grok-4-fast-reasoning`, or `grok-4-0709`, we recommend migrating to `grok-4.3`.

Grok 4.3 is the fastest, most intelligent model we have ever built. It tops the leaderboards in agentic tool calling and instruction following, and includes:

* 1 million token context window
* 4 [reasoning effort](/developers/model-capabilities/text/reasoning#the-reasoning_effort-parameter) levels (none, low, medium, and high)
* Priced at $1.25 / 1M input and $2.50 / 1M output

After May 15, requests to these slugs are routed to `grok-4.3` with `low` [reasoning effort](/developers/model-capabilities/text/reasoning#the-reasoning_effort-parameter). If your workload benefits from deeper reasoning, set `medium` or `high` reasoning effort explicitly on your requests.

### Non-reasoning workloads

If you are using `grok-4-1-fast-non-reasoning` or `grok-4-fast-non-reasoning`, we recommend migrating to `grok-4.3` with `none` reasoning effort, which is also where these slugs are redirected after May 15.

For less latency-sensitive workloads, consider using `grok-4.3` with `low` [reasoning effort](/developers/model-capabilities/text/reasoning#the-reasoning_effort-parameter).

### Code workloads

If you are using `grok-code-fast-1`, we recommend migrating to `grok-build-0.1`, which delivers significantly improved agentic coding and web dev capabilities. After May 15, requests to `grok-code-fast-1` are routed to `grok-build-0.1`.

## Need Help?

We are here to support you through this migration. If you have any questions or need assistance, please reach out to [support@x.ai](mailto:support@x.ai).
