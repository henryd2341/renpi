# SDXL

查证日期：2026-10-10。基准为 `stabilityai/stable-diffusion-xl-base-1.0`；第三方微调另读自身模型卡，不以 SDXL 血缘统一提示规则。

## 本模型的起点

SDXL Base 官方示例使用自然语言，适合先写主体、动作、环境、构图、光照与媒介。Base 可单独使用，Refiner 是工作流选择。没有依据要求默认加入 `score_*`、年份或动漫质量词链。[官方模型卡](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)

```text
A [subject] [action] in [setting], [framing and composition], [lighting], [medium].
```

这是结构示例，不是词数或句序限制。先保持核心画面明确，再按实际结果增减描述。

## 条件和工作流

正面/负面进入实际管线槽。Diffusers 的双编码器 `prompt_2` 等参数是接口能力，不表示所有任务必须写两份提示；ComfyUI 是否暴露对应输入看节点。图像参考/身份一致性依赖具体 img2img 或适配器，IP-Adapter 也需实际配置。[SDXL 管线文档](https://huggingface.co/docs/diffusers/api/pipelines/stable_diffusion/stable_diffusion_xl)

保持已验证的分辨率、scheduler、CFG 和 Base/Refiner 配置；这些不由 prompt 自动决定。用户选用 Illustrious/NoobAI 等衍生模型时，转到其专属资料，不照此宣称相同训练标签。
