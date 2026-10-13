# Z-Image

查证日期：2026-10-10。至少分 `Tongyi-MAI/Z-Image` Base 与 `Tongyi-MAI/Z-Image-Turbo`。

## 提示与条件差异

用中文或英文具体说明主体动作、空间关系、环境、光照；需要可见文字时逐字给出。不把“只有标签有效”或“标签全部无效”设成模型规则。

```text
[主体及外观]在[环境]中[动作]；[双方或物体的位置关系]；[景别、光照与画面焦点]。
```

Base 官方管线支持 CFG 与负面提示；Turbo 蒸馏示例使用 guidance 0，不按普通 CFG 管线配通用负面词包。Turbo 的步骤数说明还区分推理 steps 与实际 forward 次数，因此不把示例数字直接抄到任何 ComfyUI 采样节点。[Base 模型卡](https://huggingface.co/Tongyi-MAI/Z-Image)、[Turbo 模型卡](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)

## 保留实际配置

Base、Turbo 的工作流、采样和条件结构分别核对。当前模板有负面输入框也要检查实际是否参与采样；支持负面时仅写与画面相关的排除项。

官方家族页面提到的 Edit/Omni 变体不意味着本次 Base/Turbo 已具备编辑、参考图或身份保持能力；所查发布表部分变体仍待发布。局部编辑、控制图、透明输出依所选实际 pipeline 确认，不提前声称可用。
