# NovelAI 自有图像模型

查证日期：2026-10-10。官方文档包含 V5 Full/Curated 与 V4.5 等版本；核对工具实际 model ID，而非从显示名猜 API 字符串。Full/Curated、版本与提示预算分开，旧版 512 预算不推广到全家族。[模型说明](https://docs.novelai.net/en/image/models/)

## 基础与角色提示

V5 加强自然语言和多语言表达，标签仍可用于准确概念；按所选版本组织。多人图将共用场景/构图置于基础提示，各角色特征与独立动作写进真实角色槽，实际位置约束按工具能力使用。[模型说明](https://docs.novelai.net/en/image/models/)、[多角色提示](https://docs.novelai.net/en/image/multiplecharacters/)

```text
Base: [count and scene], [composition], [shared relationship/action]
Character 1: [identity, appearance, outfit, own action]
Character 2: [identity, appearance, outfit, own action]
UC: [only applicable exclusions]
```

结构示例不是请求 schema；由 [NovelAI 后端](../backends/novelai.md) 映射。避免全塞入一串标签导致属性互串，质量开关与 UC preset 按版本核对而非重复补词。

## 参考能力与未知项

Precise Reference 区分身份与风格，Vibe Transfer 传递视觉特征；多张人物参考可能混合身份，而非自动逐人绑定。[Precise Reference](https://docs.novelai.net/en/image/precisereference/)、[Vibe Transfer](https://docs.novelai.net/en/image/vibetransfer/)

V5 发布公告提到发布时尚未包含上述两类参考功能。通用页面中“V4 及更高”的表述不覆盖这一具体例外；当前 V5 能力需按实际账号/工具重新核对，未证实前不按 V4.5 操作承诺角色参考。[V5 发布说明](https://journal.novelai.net/image-generation-novelai-diffusion-v5-is-here-c2df7c6b8d2d/)

准确括号强调、质量补词、负面与参考字段由对应版本/后端决定，不把 NovelAI 模型称为“托管的 NoobAI”或假定其他模型标签权重通用。
