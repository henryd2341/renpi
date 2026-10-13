# Nano Banana

查证日期：2026-10-10。名称有家族与具体版本之分；用户选定版本不静默升级。

| 名称 | 本次官方文档列出的 API ID |
| --- | --- |
| Nano Banana 初代 | `gemini-2.5-flash-image` |
| Nano Banana Pro | `gemini-3-pro-image` |
| Nano Banana 2 | `gemini-3.1-flash-image` |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| Nano Banana 2.1 | `gemini-nano-banana-2.1` |

名称映射及版本能力来源：[Google 图像生成指南](https://ai.google.dev/gemini-api/docs/image-generation)、[2.1 模型页](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1)。账号或封装工具可用项仍需实际确认。

## 提示起点

用场景、主体关系、镜头/构图和所需风格表达；编辑明确“只改什么、保留什么”，按参考图编号说明身份、风格或目标。精确文字单独给出，复杂变化分步骤，避免一轮要求互相冲突的编辑。

```text
Create [scene and purpose]. [Subject/action/spatial relationship].
Use image 1 for [explicit role]. Keep [invariants]. Change only [edit target, if applicable].
```

图文输入、参考图数量与连续编辑能力逐版本核对；初代不继承后续版本更多图的上限。自然语言指定编辑区域不等于有独立像素 mask 字段；本次指南未建立 seed、透明 alpha 或独立 negative 字段的通用支持证据。排除需求优先明确期望的画面状态。[Google 指南](https://ai.google.dev/gemini-api/docs/image-generation)

强自然语言理解不代替检查人物身份、左右关系、图中文字及连续编辑漂移；透明需求最后查实际 alpha，而非只看 PNG 格式。
