---
name: resolve-image-pipeline
description: 在 Ren’Pi 生图前分开核对后端接口、模型身份/版本和工作流能力，按 ComfyUI、NovelAI 或其他工具选择适用指南，避免把同名模型、提示语法和采样参数混为一谈。
---

# 确认后端、模型和执行配置

输入为 [画面说明](../read-image-brief/SKILL.md)、当前已启用工具与任务指定来源。优先遵循明确选择及已验证的项目配置，不按“质量更强”自行换模型。

## 分开核对三个层次

| 层次 | 从哪里确认 | 要记录什么 |
| --- | --- | --- |
| 后端/工具 | 实际工具描述、已配置接口或工作流入口 | ComfyUI、NovelAI、具体供应商 API 或宿主内建工具，支持的动作和参数 |
| 模型 | checkpoint/模型卡、实际 API model ID 或工具公开信息 | 确切模型、版本/变体、基座/微调、必要的编码器或已绑定 LoRA；别名与解析结果分开 |
| 工作流/请求配置 | 已跑通模板、参数映射和接口文档 | 提示输入位置、负面字段、权重解释、尺寸、参考图/编辑/透明/seed 能力，以及由谁控制采样参数 |

同样在 ComfyUI 里运行并不代表提示规则相同；同一个模型经不同工具调用也未必暴露同样能力。模型卡支持负面条件不等于当前接口就有负面槽，工具没有公开 model 时仅记录实际工具与公开身份。用户明确指定某个模型/版本而工具未证实该身份时，保留准备成果并交 Coding 协调匹配入口，不把身份隐藏的工具静默当成指定模型。

## 按需读取两份适用资料

先读一种后端指南：

- [ComfyUI](../references/backends/comfyui.md)：已有 API 工作流、节点和参数映射。
- [NovelAI](../references/backends/novelai.md)：实际模型版本、正面/排除内容、角色与参考能力。
- [其他 API 或内建工具](../references/backends/other.md)：实际接口 schema，不套 ComfyUI 参数。

再按已核实身份读取一种模型资料：

| 模型 | 指南 |
| --- | --- |
| SDXL base / 对应微调 | [SDXL](../references/models/sdxl.md) |
| Illustrious | [Illustrious](../references/models/illustrious.md) |
| NoobAI | [NoobAI](../references/models/noobai.md) |
| Anima | [Anima](../references/models/anima.md) |
| Krea 2 | [Krea 2](../references/models/krea-2.md) |
| Z-Image | [Z-Image](../references/models/z-image.md) |
| Nano Banana 家族 | [Nano Banana](../references/models/nano-banana.md) |
| GPT Image 2.5 | [GPT Image 2.5](../references/models/gpt-image-2-5.md) |
| NovelAI 自有图像模型 | [NovelAI 模型](../references/models/novelai.md) |

这些资料是有来源的起点，不是全版本参数表。实际 checkpoint/版本与资料不一致时先查其官方说明及现有样例，补充本次区别；旧本地约定、模型训练事实和当前接口限制分别记录。未知模型保留准确身份并查其来源，不因为“也是 SDXL”就套另一微调的质量词。

## 收口

核对任务必需能力：新图还是编辑、参考图用途、人物一致性手段、尺寸/画幅、透明输出、差分、图中文字。明确支持、未公开和缺失三类；能力缺口交 Coding 调整具体方案，不以通用 prompt 假装补齐接口能力。

完成标准：后端、模型和字段映射有依据，依赖可用或缺口明确；普通可执行任务进入 [提示编写](../compose-image-prompt/SKILL.md)。只有模型别名且尚未解析时可继续整理画面说明，但不伪造参数或声称已可提交。
