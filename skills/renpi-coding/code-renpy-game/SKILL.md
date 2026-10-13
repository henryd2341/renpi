---
name: code-renpy-game
description: Ren’Pi Coding 主 Agent 入口，统筹按项目启用的专业角色，将基础剧情整合为完整 Ren’Py 候选。用于开场、续写、既有单元修订、演出或局部 GUI 调整，以及提交受阻后的任务恢复，负责验证、请求接入与交接。
---

# 制作完整 Ren’Py 单元

目标是交付本轮可接入、可阅读的完整单元，而非一堆子任务或只有语法正确的正文。Coding 是统一入口与专业任务委派者；用户看到的是成果、必要决定与剩余缺口。

先读 [Coding 边界](../references/coding-contract.md)，完成其中的工作区定位、项目规则和交接读取，再按实际缺口进入下列步骤。已有有效成果直接复用；修改一处演出无需重做大纲、生图或整轮 init。

新建/适配 GUI 创作入口、收到选项制作任务、提交受阻或更新桥接后恢复工作时，读取 [公共桥接契约](../references/bridge-contract.md)。桥接由 Ren’Pi 统一安装和维护，游戏项目只声明选择点与调用公共接口。

| 顺序 | 技能 | 本步结束条件 |
| --- | --- | --- |
| 1 | [确定本轮工作](../plan-coding-unit/SKILL.md) | 目标、依据、入口/出口、正文与素材缺口、写入范围及检查项明确 |
| 2 | [委派专业制作](../delegate-production/SKILL.md) | 需要的正文/图片已交回且身份、产物与写入交接有效；独立任务按需并行 |
| 按需 | [查询 SDK](../consult-renpy-sdk/SKILL.md) | 具体技术问题获得当前 SDK 的文档语义与教程用法依据 |
| 3 | [整合完整 RPY](../implement-renpy-scene/SKILL.md) | 正文、定义、流程、素材、适用演出基线与退出清理构成完整候选，引用均落到真实产物，并留下可复用的启动脚本 |
| 4 | [验证与接入](../verify-renpy-candidate/SKILL.md) | 当前版本的必要检查及可选 Review 通过，启动脚本与实际接入/恢复结果明确，交接包含启动方法 |

## 路线选择

- **init 开场**：承接 [可阅读起点](../../renpi-initialization/build-opening/SKILL.md) 的已确认方案、GUI、音乐和立绘映射。先完成本轮必需缺口；正式开始仍走 [init 交接](../../renpi-initialization/handoff-creation/SKILL.md) 的用户确认。
- **续写/改编**：Writing 按 [write-plots](../../renpi-writing-plots/write-plots/SKILL.md) 决定原文、自由创作或混合路线。Coding 给调用约定，不替原文强加选择、文风或剧情。
- **既有单元修订**：先判断正文变化还是结构变化，读取 [兼容边界](../references/coding-contract.md#正文修订与兼容)。已有分支与任务语义保持不变。
- **只补图片、音频、动画或 UI**：以已采用正文为依据，按 [演出基线](../references/presentation-recipes.md#演出基线与适用范围) 确定受影响项、共用实现与验收；需要且启用生图时才委派 Image，需要创作性改文才回 Writing。局部界面修改进入 [GUI 制作](../../renpi-initialization/design-game-gui/SKILL.md)，只处理用户指定页面，复用已确认方向。

## 收口

每轮只推进约定的制作单元，通常到下一用户输入点或源文自然边界。提交实际文件、入口、已验证效果与待处理项；技能源码齐全、子代理退出、编译通过、真实接入分别报告。把“下轮可能有用”的工作留在待办，不提前自动制作其他路线。
