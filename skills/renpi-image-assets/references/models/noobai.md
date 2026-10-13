# NoobAI

查证日期：2026-10-10。分清 `Laxhar/noobai-XL-1.1`（EPS）与 `Laxhar/noobai-XL-Vpred-1.0`（V-Pred），两者采用的预测/采样配置不同。

## 提示起点

1.1 使用标签字幕，作者有质量与年代标签建议；`newest` 是训练标签，卡内对应 2021–2024，不是随日历更新。V-Pred 卡另外描述标签加自然语言及年份标签，细节按该版本读。[1.1 模型卡](https://huggingface.co/Laxhar/noobai-XL-1.1)、[V-Pred 模型卡](https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0/raw/main/README.md)

```text
masterpiece, best quality, newest, [count], [identity/appearance], [action], [scene]
```

以上质量/年代开头只在适合本次目标时采用，复古目标不机械追求 `newest`。空间关系复杂时补与标签一致的描述，先核对对应版本的语言能力。

## 排除与配置

负面预设含题材排除项时按目标筛选，例如需要兽人或复古画风的任务不照抄排除它们的整包词。`score_*` 链没有在本次两份作者卡中找到推荐依据，默认不加入。

保留 EPS 与 V-Pred 各自已验证的工作流，不在同一采样配置里只换 checkpoint。作者列出的结构控制资源也不等于任意 SDXL ControlNet 通配或身份锁定；参考能力落实到具体节点与资源。
