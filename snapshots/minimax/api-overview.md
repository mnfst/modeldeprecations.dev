> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimax.io/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# API Overview

> Overview of MiniMax API capabilities including language, speech, video, image, music, and file management.

## Get API Key

* **Pay-as-you-go**：Visit [API Keys > Create new secret key](https://platform.minimax.io/user-center/basic-information/interface-key) to get your **API Key**

* **M Plan**：Visit [Billing > M Plan](https://platform.minimax.io/user-center/payment/token-plan) to view your **Subscription Key**
  \[!NOTE] The Subscription Key is used for M Plan subscriptions and purchased Credits. It is separate from pay-as-you-go API Keys. See [M Plan Overview](https://platform.minimax.io/docs/m-plan/intro.md) for details.

***

## Large Language Model

The Large Language Model API uses **MiniMax M3.1-Flash** and **MiniMax M3** to generate conversational content and trigger tool calls based on the provided context.

It can be accessed via **HTTP requests**, the **Anthropic SDK** (Recommended), or the **OpenAI SDK**.

**Supported Models**

| Model Name | Context Window | Description |
| :- | :- | :- |
| MiniMax-M3.1-Flash | 1,000,000 | **Frontier multimodal coding model with 1M context window and tunable thinking depth** |
| MiniMax-M3 | 1,000,000 | **Frontier multimodal coding model with 1M context window** |

Please note: The maximum token count refers to the total number of input and output tokens.

> [card] [Anthropic API Compatible (Recommended)](https://platform.minimax.io/docs/api-reference/text-anthropic-api.md)
>
> Use Anthropic SDK with MiniMax models

> [card] [OpenAI API Compatible](https://platform.minimax.io/docs/api-reference/text-openai-api.md)
>
> Use OpenAI SDK with MiniMax models

***

## Video Model

This API supports video generation from multimodal input (text, images, video, audio), covering text-to-video, image-to-video, first-and-last-frame, and reference-to-video scenarios.

**Supported Models**

| Model | Description |
| :- | :- |
| MiniMax-H3 | Multimodal video generation model supporting text / image / first-and-last-frame / reference input, 768P / 2K resolution, 4–15s duration. |
| MiniMax-H3-Highspeed | Balances generation quality and speed, supporting text / image / first-and-last-frame / reference input. 480P / 768P resolution (no 2K), 4–15s duration. |
| MiniMax-H3-Lite | Lightweight model supporting text-to-video, image-to-video (first / last frame), and reference input. 480P / 768P resolution (no 2K), 4–15s duration. |
| MiniMax-H3-Max | Fast generation model supporting text-to-video, image-to-video (first / last frame), and reference input. 480P / 768P resolution (no 2K), 5–15s duration. |

**API Usage Guide**

All four models share the same `content[]` request protocol and query endpoints — switching models only requires changing the `model` field. MiniMax-H3 tasks are asynchronous. There are three creation endpoints—**Create Video Generation Task**, **Create H3-Context-IR Task**, and **Create Video Regeneration Task**—and shared endpoints for querying, listing, and cancelling or deleting tasks; MiniMax-H3-Highspeed, MiniMax-H3-Lite, and MiniMax-H3-Max support the **Create Video Generation Task** endpoint only. The workflow is as follows:

1. Create a video generation task, create an H3-Context-IR task with the same multimodal input, or create a video regeneration task for a source video that meets the MiniMax-H3 768P output specifications. A regeneration request must contain exactly one source-video item with `role=base_video`. All three endpoints return a `task_id` on success.
2. Use **Query Task** with the `task_id` to retrieve its status and result. When a video task succeeds, get its output URL from `content.url`; when an H3-Context-IR task succeeds, get the enhanced prompt from `content.prompt`. You can also use **List Tasks** and distinguish `generation`, `h3_context_ir`, and `regeneration` with `task_type`.
3. Use **Cancel or Delete Task** to cancel a queued task or delete a succeeded or failed task record.

> [card] [Create Video Generation Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md)
>
> Create a video generation task from multimodal content input

> [card] [Create H3-Context-IR Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-h3-context-ir.md)
>
> Deeply interpret multimodal video-generation context and produce a structured, enhanced prompt

> [card] [Create Video Regeneration Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-regeneration.md)
>
> Regenerate a video that meets the MiniMax-H3 768P output specifications as a 2K video

> [card] [Query Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md)
>
> Query task status by task\_id and get the video download URL

> [card] [List Tasks](https://platform.minimax.io/docs/api-reference/video-generation-v2-list.md)
>
> List tasks from the last 7 days and filter by task type

> [card] [Cancel or Delete Task](https://platform.minimax.io/docs/api-reference/video-generation-v2-delete.md)
>
> Cancel a queued task or delete a succeeded or failed task record

***

## Speech Model

The speech models provide **speech synthesis**, **voice cloning**, and **voice design**, supporting 40 languages and 300+ system voices, with synchronous or asynchronous generation.

All interfaces are stateless: each call only processes the provided input, does not store user data, and involves no business-logic state.

**Supported Models**

| Model | Description |
| :- | :- |
| speech-2.8-hd | Latest HD model. Ultra-realistic quality featuring sound tags. |
| speech-2.8-turbo | Latest Turbo model. Seamless speed meets natural flow. |
| speech-2.6-hd | HD model with outstanding prosody and excellent cloning similarity. |
| speech-2.6-turbo | Turbo model with support for 40 languages. |
| speech-02-hd | Superior rhythm and stability, with outstanding performance in replication similarity and sound quality. |
| speech-02-turbo | Superior rhythm and stability, with enhanced multilingual capabilities and excellent performance. |

**API Overview**

Four capabilities share the models above:

1. **Synchronous speech synthesis (T2A)**: real-time text-to-speech, up to **10,000 characters** per request; 300+ system and cloned voices, adjustable volume / pitch / speed, proportional mixing, streaming output, and `mp3` / `pcm` / `flac` / `wav` formats. Available over **HTTP** and **WebSocket**.
2. **Asynchronous long-text synthesis**: up to **1 million characters** per request, ideal for entire books; supports sentence-level timestamps (subtitles). Create a task to get a `task_id`, then use the returned `file_id` with the File API to download (the download URL is valid for **9 hours**).
3. **Voice cloning**: upload the audio to clone to get a `file_id` (optionally upload sample audio to improve quality), then call the cloning API to produce a custom `voice_id`. Individual or enterprise verification is required.
4. **Voice design**: generate a personalized voice from a description prompt; the resulting `voice_id` can be used directly with the synthesis APIs above.

> [!NOTE]
>
> Voices produced by cloning and voice design are **temporary**: the fee is charged only on first use in speech synthesis (previews within those APIs do not count). If the voice is not used by any speech synthesis API within **168 hours (7 days)**, it is deleted.

> [accordion] 40 supported languages
>
> | Support Languages | | |
> | - | - | - |
> | 1. Chinese | 15. Turkish | 28. Malay |
> | 2. Cantonese | 16. Dutch | 29. Persian |
> | 3. English | 17. Ukrainian | 30. Slovak |
> | 4. Spanish | 18. Thai | 31. Swedish |
> | 5. French | 19. Polish | 32. Croatian |
> | 6. Russian | 20. Romanian | 33. Filipino |
> | 7. German | 21. Greek | 34. Hungarian |
> | 8. Portuguese | 22. Czech | 35. Norwegian |
> | 9. Arabic | 23. Finnish | 36. Slovenian |
> | 10. Italian | 24. Hindi | 37. Catalan |
> | 11. Japanese | 25. Bulgarian | 38. Nynorsk |
> | 12. Korean | 26. Danish | 39. Tamil |
> | 13. Indonesian | 27. Hebrew | 40. Afrikaans |
> | 14. Vietnamese | | |

> [card] [HTTP T2A API](https://platform.minimax.io/docs/api-reference/speech-t2a-http.md)
>
> Synchronous speech synthesis via HTTP

> [card] [WebSocket T2A API](https://platform.minimax.io/docs/api-reference/speech-t2a-websocket.md)
>
> Streaming speech synthesis via WebSocket

> [card] [Create Async Task](https://platform.minimax.io/docs/api-reference/speech-t2a-async-create.md)
>
> Create a long-text speech generation task

> [card] [Query Async Task Status](https://platform.minimax.io/docs/api-reference/speech-t2a-async-query.md)
>
> Query speech generation task status

> [card] [Upload Clone Audio](https://platform.minimax.io/docs/api-reference/voice-cloning-uploadcloneaudio.md)
>
> Upload audio file to clone

> [card] [Clone Voice](https://platform.minimax.io/docs/api-reference/voice-cloning-clone.md)
>
> Execute voice cloning

> [card] [Voice Design](https://platform.minimax.io/docs/api-reference/voice-design-design.md)
>
> Generate personalized voices from descriptions

***

## Image Generation

This API supports images generations from text or references, allowing custom aspect ratios and resolutions for diverse needs.

**API Description**

You can generate images by creating an image generation task using text prompts and/or reference images.

**Model List**

| Model | Description |
| :- | :- |
| image-01 | A high-quality image generation model that produces fine-grained details. Supports both text-to-image and image-to-image generation (with subject reference for people). |

> [card] [Text to Image](https://platform.minimax.io/docs/api-reference/image-generation-t2i.md)
>
> Generate image from text description

> [card] [Image to Image](https://platform.minimax.io/docs/api-reference/image-generation-i2i.md)
>
> Generate image from reference image

***

## Music Generation

> [!NOTE]
>
> Starting August 20, 2026, the paid APIs (Music Generation and Lyrics Generation) will no longer be available to new users; existing paying users can continue to use the current API services. The free music generation APIs (Music-3.0-free, Music-2.6-free, music-cover-free) will be discontinued.
>
> To experience or use music generation capabilities, please visit [MiniMax Audio](https://www.minimax.io/audio), or use the open-source [MiniMax Music 3 model on Hugging Face](https://huggingface.co/MiniMaxAI/MiniMax-Music3).

This API generates a vocal song based on a music description (prompt) and lyrics.

**Models**

| Model | Usage |
| :- | :- |
| music-3.0 | The latest music generation model. Supports user-provided musical inspiration and lyrics to create AI-generated music. |

> [card] [Music Generation API](https://platform.minimax.io/docs/api-reference/music-generation.md)
>
> Generate music from description and lyrics

***

## File Management

This API is for file management and is used with other MiniMax APIs.

**API Description**

This API includes 5 endpoints: **Upload**, **List**, **Retrieve**, **Retrieve Content**, **Delete**.

Supported file formats, capacity, and size limits are defined by the **Upload File** API documentation — see [Upload File](https://platform.minimax.io/docs/api-reference/file-management-upload.md).

> [card] [Upload File](https://platform.minimax.io/docs/api-reference/file-management-upload.md)
>
> Upload files to the platform

> [card] [List Files](https://platform.minimax.io/docs/api-reference/file-management-list.md)
>
> Get list of uploaded files

***

## Tools

**Web Search**

`web_search` is a server-side web search tool hosted and executed by MiniMax. The model can retrieve up-to-date information while generating a response and answer based on the search results. It is available through both the Anthropic Messages API and the OpenAI Responses API. See [Web Search](https://platform.minimax.io/docs/guides/server-tools.md#web_search) for interface details and examples.

**Official MCP**

MiniMax provides official Model Context Protocol (MCP) server implementations:

* [Python version](https://github.com/MiniMax-AI/MiniMax-MCP)
* [JavaScript version](https://github.com/MiniMax-AI/MiniMax-MCP-JS)

Both support speech synthesis, voice cloning, video generation, and music generation. For details, refer to the [MiniMax MCP User Guide](https://platform.minimax.io/docs/guides/mcp-guide.md).
