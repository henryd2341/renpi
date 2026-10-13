# GPT Image 2.5

查证日期：2026-10-10。公开 Images API 列出 `gpt-image-2.5-sunburst`、`gpt-image-2.5-flare` 及两者的 `-2026-09-08` 快照；不要把笼统的 `gpt-image-2.5` 当成已证实 ID。实际任务选哪一项由明确配置决定。[生成 API](https://developers.openai.com/api/reference/resources/images/methods/generate)

## 提示起点

自然语言优先描述用途、场景与主体、可见细节、构图和保留约束，参考图逐张指定角色。官方同样允许短提示、结构化说明或标签；重点是意图清楚，不把 SD 权重语法当作控制协议。[官方提示指南](https://developers.openai.com/api/docs/guides/image-prompting)

```text
Create [asset purpose and scene]. [Visible subjects, action, composition and light].
Reference 1 defines [identity/style/etc.]. Preserve [invariants].
Render the exact text "[text]" at [placement], if requested.
```

编辑每轮重申重要保留项，局部修正后检查人物与构图是否漂移。无需堆动漫质量标签链；复杂画面仍需明确关系和可执行的改动目标。

## API 能力不等于宿主工具能力

- 2.5 上述变体与快照支持透明背景；API 使用 `background=transparent` 和 PNG/WebP，实际结果仍检查 alpha。[生成 API](https://developers.openai.com/api/reference/resources/images/methods/generate)
- 编辑 API 有图片输入及可选 mask；输入数量与格式遵循对应端点，不能据此给宿主工具发未暴露的 mask 参数。[编辑 API](https://developers.openai.com/api/reference/resources/images/methods/edit)
- 本次生成 schema 未列 seed 或独立 negative 字段；尺寸、quality 等只按实际端点支持值填，旧版本的 fidelity 规则不直接套用。
- 宿主内建图像工具可能不公开模型选择；这种情况下记录真实工具与公开能力，而不是宣称它运行了 2.5。旧本地 CLI 指南也不视为最新 API 能力保证。
