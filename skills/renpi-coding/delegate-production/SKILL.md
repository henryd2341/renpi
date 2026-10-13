---
name: delegate-production
description: Ren’Pi Coding 按明确输入输出委派 Writing、Image 和可选 Review，管理分轮上下文、依赖并行、文件交接、结构化交付与有界返修。
---

# 委派并收回产物

进入条件：[本轮工作](../plan-coding-unit/SKILL.md) 已明确。先按 [用户约束与执行范围](../../renpi-initialization/references/project-contract.md#用户约束与执行范围) 核对角色是否启用，只委派本轮需要且允许的工作。使用当前宿主实际提供的委派入口，不为技能新增常驻进程、角色池或第二套任务管理。

## 选择最少的必要调用

- **Writing**：[write-plots](../../renpi-writing-plots/write-plots/SKILL.md)。已有原文直接走正文；自由创作按粗纲、风格、细纲、正文推进。长单元按 [分轮委派](../../renpi-writing-plots/references/staged-delegation.md) 交接文件与短摘要，不以全部聊天历史为输入。已采用正文只有技术调整时 Coding 自行处理。
- **Image**：[create-image-assets](../../renpi-image-assets/create-image-assets/SKILL.md)。按用途、画面时刻、视觉基准和布局限制派单，复用提前交付素材。文字依赖尚未定时只制作明确标注的基准候选；剧情 CG 等人物、服装和时刻明确后再做。
- **Review**：[review-renpy-candidate](../../renpi-review/review-renpy-candidate/SKILL.md)。在候选及必要证据齐全后发起，独立核对正文、整合和证据，只读产品并交回报告。局部意见不替代完整候选门槛。

Writing 与不依赖新剧情的基础素材可并行。细纲→正文、正文事实→剧情 CG、完整候选→Review 等依赖按顺序执行。并行的必要条件是输出互斥及没有共享写入；共享定义、资产绑定、工程接入留给 Coding。

## 发任务与交接

按 [任务/交付模板](../references/delegation-templates.md) 提供目标、依据、明确读写路径、上下文边界、完成条件和停止点，并传递适用的项目约束及本轮执行限制。使用独立精简上下文，保留真实来源位置；专业角色需要其他角色时向 Coding 说明需求。

收回时读取**实际文件**，核对程序身份、状态、分配路径、入口及交付清单。成功退出但缺产物、只有提示词却声称图片完成、取消/过期结果、写入越界或“已验证”却没有证据，分别记清问题，保留真实状态。子代理自述不代替工具核对。

产物交付/写入释放确认后 Coding 才接手整合。返修说明具体问题、目标版本及可改文件；先将这些文件重新交给原角色，再读取新结果。未结束的调用先核对状态，重派不作为恢复手段。

## Review 与返修

Review 输入包含候选版本、实际 RPY 与素材清单、用户契约、来源范围、变更摘要、验证证据及已知限制。检查正文忠实/玩家边界、符号/入口/素材、演出与清理、兼容影响、证据是否对应当前版本；报告“通过 / 需修改 / 受阻”，每个问题给路径/位置、依据、影响和期望结果。

Review 只读产品，报告写到其分配位置。启用后缺报告、执行失败或版本不匹配均保留门槛；Coding 修复后取得有效复审，优化建议与阻止接入的问题分开。沿用 [自动修复额度](../references/coding-contract.md#生命周期与停止)，不循环审查到审美完全一致。
