# Model Deprecation

With the continuous iteration of the MiMo model, the new version has comprehensively outperformed the old version in terms of effectiveness and performance. We will gradually deprecate the legacy models, and the specific plan will be announced in advance via SMS, email, website announcements, etc. Please pay attention to the relevant messages and complete the switch in a timely manner.

**Time Definition**

- System replacement time: The time when the offline model is automatically switched to the new version model. After this time, requests using the old version model name will be automatically replaced with the corresponding new version model and billed according to the new version model. [View Pricing](https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go)
- Deprecation Time: The time when the name of the old model expires. After this time, requests using the name of the old model version will receive an error message. Please ensure that the model replacement is completed before this time.

**Operational Recommendations**

- Access [ Bill Details ](https://platform.xiaomimimo.com/console/usage), check if there are any models pending offline;
- Refer to the system replacement model in the table below to complete your code self-check and replacement. It is recommended to fully test and verify before the official switch.

### Deprecated model on 2026.10.21

| Deprecated Model | Deprecated Time                | System replacement time        | System Replacement Model | Replacement Impact                                                                                                                                              |
| ---------------- | ------------------------------ | ------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mimo-v2.5-pro    | 10:00, October 21,2026 (UTC+8) | 10:00, October 14,2026 (UTC+8) | mimo-v2.6-pro            | API parameters are fully adapted. The mimo-v2.5-pro only supports text input, while switching to mimo-v2.6-pro will enable multimodal understanding capability. |
| mimo-v2.5        | 10:00, October 21,2026 (UTC+8) | 10:00, October 14,2026 (UTC+8) | mimo-v2.6-flash          | The default values of parameters have changed; please refer to the details below.                                                                               |

**Note:**

Starting from 18:00 (UTC+8) on October 14,2026, requests for mimo-v2.5-pro and mimo-v2.5 will be automatically routed to mimo-v2.6-pro and mimo-v2.6-flash. The relevant parameter processing rules are as follows:

- In thinking mode, the mimo-v2.6-flash and mimo-v2.6-pro models do not support custom settings for `temperature `and `top_p`; the actual parameters passed by the models are `temperature: 1.0 `and `top_p: 0.95`.
- If you customized parameters when using mimo-v2.5, the parameters passed to mimo-v2.5 will be inherited when automatically routed to mimo-v2.6-flash; if not specified in the request `max_completion_tokens`, the system will automatically use the default value of `mimo-v2.6-flash`, as shown in the following table:

| Variance Item                         | mimo-v2.5 | mimo-v2.6-flash |
| ------------------------------------- | --------- | --------------- |
| max\_completion\_tokens default value | 32768     | 131072          |

### Deprecated model on 2026.6.30

| Deprecated Model | Deprecated Time         | System replacement time | System Replacement Model | Replacement Impact                                                                            |
| ---------------- | ----------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| mimo-v2-pro      | 2026.6.30 00:00 (UTC+8) | 2026.6.1 00:00 (UTC+8)  | mimo-v2.5-pro            | API parameters are fully adapted                                                              |
| mimo-v2-omni     | 2026.6.30 00:00 (UTC+8) | 2026.6.1 00:00 (UTC+8)  | mimo-v2.5                | API parameters are fully adapted                                                              |
| mimo-v2-flash    | 2026.6.30 00:00 (UTC+8) | 2026.6.18 00:00 (UTC+8) | mimo-v2.5                | The default value of the parameter has changed, see details below                             |
| mimo-v2-tts      | 2026.6.30 00:00 (UTC+8) | 2026.6.27 00:00 (UTC+8) | mimo-v2.5-tts            | Timbre remapping,mimo\_default is mapped to 冰糖 in Chinese clusters and mia in other clusters. |

**Note:**

Starting from 00:00 on June 18, 2026 (UTC+8), requests for mimo-v2-flash will be automatically routed to mimo-v2.5\. The relevant parameter processing rules are as follows:

- mimo-v2.5 does not support customizing `temperature` and `top_p` in thinking mode. The actual parameters passed to the model are `temperature: 1.0` and `top_p: 0.95`
- If parameters are customized when using mimo-v2-flash, the parameters passed to mimo-v2-flash will be inherited when automatically routing to mimo-v2.5
- If `thinking`, `temperature`, or `max_completion_tokens` are not specified in the request, the system will automatically use `mimo-v2.5` default values , as shown in the following table:
