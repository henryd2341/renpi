# Anima

查证日期：2026-10-10。这里指 `circlestone-labs/Anima`；先确认 Base、Aesthetic、Turbo 或历史 preview 的实际文件。它不是 SDXL checkpoint。

## 按变体组织提示

官方支持标签、自然语言及混合表达。Base 对质量/评分标签有建议，Aesthetic 建议从正负两侧省略 `score_*`；Turbo 的低 CFG 配置另核对。当前官方示例编码器为 Qwen3 0.6B，旧本地 T5 说法不作通用事实。[官方模型卡](https://huggingface.co/circlestone-labs/Anima)

```text
[subject/appearance/action tags]. [Precise action, relative position, framing and lighting].
```

标签固定已知概念，句子补足关系；这是推荐组织方式，不要求所有版本固定“标签在前”。Base 的可用质量词不因此自动进入 Aesthetic 或用户明确排除质量词的交付。

## 旧约定与实际能力分开

- 官方有负面提示；模型支持、当前工作流是否使用负面、用户是否要求交付负面是三件事。正面专用模板只填正面，但记录这是该模板限制。
- 本地“先标签后英文描述”“不交付质量词/负面”等既定要求可以继续作为项目偏好；不得解释为所有 Anima 都不识别这些词。
- 旧项目的 512-token 校验预算只适用于该明确工具/版本，实际限制查当前 tokenizer、编码节点与工作流；本次没有证据将它固定为全系列上限。
- 人物一致性、参考适配器、透明输出按实际图核对，不由 Anima 名称推导；历史 preview 的采样参数不覆盖当前变体。
