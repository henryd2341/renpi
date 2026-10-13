# Illustrious

查证日期：2026-10-10。先确认版本及是否第三方微调，至少区分下列两个作者版本。

| 版本 | 提示起点 |
| --- | --- |
| `OnomaAIResearch/Illustrious-xl-early-release-v0`，卡内版本 v0.1 | 官方示例偏标签，按人数、外观、服装、动作、景别、环境组织；质量标签按模型卡使用 |
| `OnomaAIResearch/Illustrious-XL-v1.1` | 作者描述更偏自然语言；用句子明确动作、空间关系与光照，不强制纯标签 |

来源：[v0.1 模型卡](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0)、[v1.1 模型卡](https://huggingface.co/OnomaAIResearch/Illustrious-XL-v1.1)。

## 提示与负面

```text
v0.1: [count], [appearance], [outfit], [action], [framing], [setting]
v1.1: [Subject and appearance]. [Action and spatial relationship]. [Setting and light].
```

选择连贯的视点与景别，避免同图并列互斥构图。正负槽按当前工作流映射；v0.1 示例预设和采样建议不直接覆盖 v1.1。未核实的 `score_*` 或年份链保持省略。

角色参考、一致性和控制图需当前工作流支持；同一系列名称不保证所用适配器兼容。第三方 merge 若改训练与标签约定，记录具体差异后使用，不按名称相似跳过确认。
