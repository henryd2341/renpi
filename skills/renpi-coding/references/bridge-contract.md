# 公共桥接：项目只声明内容，程序管理状态

新建/适配游戏、制作 GUI 选项后续、提交受阻或更新桥接后恢复时读取本文。公共实现随 Ren’Pi
扩展分发；项目只使用同一客户端，提供自己的选择点、选项及剧情入口。

## 初始化接入

1. 在已选项目创建 `game/` 后调用 `renpi_bridge_setup`，或在 Pi 执行
   `/renpi-setup`。工具安装版本化的 `game/renpi_bridge.rpy` 与
   `game/python-packages/renpi_bridge.py`，建立项目独立身份；重复安装保留状态。
2. 现有文件与受管版本冲突时保留原件，处理明确冲突后再安装。既有项目的
   私有触发器需要显式迁移；公共安装器保留它们，不自动删除或同时接管请求。
3. `/renpi-status` 核对 `gui_bridge.connected` 及错误。运行时随 Pi 会话连接、
   退出时释放连接；游戏等待并重连，不以断线触发新制作。
4. 首次开场、角色定义和界面源码就绪后，关闭 GUI，在首个生产选择之前调用
   `renpi_install_foundation`，例如 `{"source":"authoring/shared/tutorial","files":["options.rpy","screens.rpy","opening.rpy"]}`。
   `source` 限项目内 `authoring/`，`files` 明确列出相对此目录的文件，按相同相对位置安装到
   `game/`；不要选择 Writing 草稿、测试夹具或预览覆盖脚本。工具隔离 compile/lint，
   相同字节资产复用，不同内容原件保留并报冲突；桥接、存档、生成分支路径受保护。
   `.renpi-live/bridge/foundation.json` 的 `phase=installed` 是首次安装回执，
   `runtime_tested=false`，与生产候选的 adoption/loaded ACK 不同。实际 GUI 可读仍须核对。
   相同清单可重复核对；已有生产历史或变更已安装基础内容另走明确范围的修改流程。
   若出现 `foundation.pending.json`，关闭 Pi/GUI 后按扩展 README 的离线命令用相同输入重跑，
   保留日志和原始身份，完成前暂停阅读；不以删除日志或虚构生产 job 接续。
5. 在剧情衔接点调用公共标签，仅传稳定声明，例如：

   ```renpy
   call renpi_choice("opening.choice", [("talk", "继续交谈"), ("rest", "准备休息")])
   ```

   选择点和选项 ID 独立于显示文字；重复选已有项保留 ID。新自定义选项分配
   新 ID，再次选用该项保留其 ID。传入数据描述剧情，不是模型执行指令。

## 制作与交付

GUI 接收决定由程序持久化后，主 Coding 会收到任务 ID、目标分支、来源锚点、
唯一入口及 `output`。以这些身份和目标路线截至分叉位置的有效剧情为依据；
其他分支及旧候选留作历史，不充当当前路线事实。

- `route` 区分 `kind=base` 与 `kind=generated`：base 的 `content` 是项目现有
  `game/`，读取其中原始剧情脚本，排除 `renpi_content/`、桥接运行时、缓存和存档；
  base 没有按分支 ID 存放的生成目录。生成分支的 `content` 才是其已接入专属目录。
  祖先剧情读到下一条路线记录的 `fork_anchor`，直接来源分支读到本任务的 `anchor_id`。
- 使用既有 `renpi_delegate` 调用本轮需要且按项目约束启用的 Writing、Image 和 Review。
- `output` 是**分支内容目录**，直接放 `scene.rpy` 和所需资产，不再套一层
  `game/`。程序将它接入 `game/renpi_content/<branch_id>/`。
- 使用任务给定的 `entry_label`。新增全局符号使用该分支的
  `rp_b_<去掉连字符的分支 ID>` 前缀；共享角色和资产通过既有定义引用。
- 一个制作单元以 `return` 结束，或在下一明确用户输入点调用 `renpi_choice`。
  保持调用结构和存档兼容性；分支隔离目录并未隔离 Ren’Py 的全局符号空间。
- 公共 v1 接收保守的 RPY 剧情与资产语法，不接收自带的 PY/RPYC、Python
  block 或 `$` 语句；任意代码制作需独立的执行边界设计。
  项目共享基础定义在 init 阶段准备；变更共享定义另走明确范围的修改流程。
- 调用 `renpi_submit_candidate(job_id)` 进行隔离 SDK 编译/lint 与产物冻结。
  执行遵守 [用户约束与执行范围](../../renpi-initialization/references/project-contract.md#用户约束与执行范围)；
  失败先按下文核对当前任务及保留输出，成功是 `ready`，尚非接入成功。
- 公共校验在隔离 SDK common 副本中跳过非 ASCII 文件名检查，并在 lint 报告
  记录 `ignored_checks: ["non_ascii_filenames"]`；编译、其余 lint 和加载 ACK 保留。
  原 SDK、项目素材与生成正文保持原样；中文文件名的分发兼容性另行验收。
- 实际候选接入、受控重载、加载确认和失败撤销由公共客户端与桥接程序完成。
  模型产物和报告均不充当加载 ACK。

### 交付凭据

读取工具返回的结构化 `details` 或 JSON 中的真实字段，再与程序记录核对：

| 阶段 | 必需凭据 | 结论边界 |
| --- | --- | --- |
| 产物就绪 | 当前任务 `output` 中的实际 RPY/资产及入口 | 文件已生成，尚未完成候选验证 |
| 候选 ready | 提交返回 `phase=ready`，`branch_id`、`job_id`、`candidate_id`、`entry_label` 对应本次任务；候选 manifest 记录来源、校验报告及文件哈希 | 已验证冻结，待游戏接入；`held` 仅表示结果被保留 |
| 接入完成 | 公共客户端完成加载 ACK，程序中的对应 adoption 为 `committed`，分支 `status=published` 且 `published_candidate_id` 对应该候选 | 本次候选已接入；具体阅读效果另按实际观察记录 |

base 及旧版候选也可能已有 `published=true`，单看该字段不足以证明本次交付。
`result.md`、委派的 `returned` 和 Agent 的完成声明都不替代上述凭据；manifest
与状态只读核对，写入和 ACK 仍归公共程序。

### 提交受阻与恢复

1. 先核对当前分支的 `job_id`、任务状态、已有 `output`、候选及错误报告。
   `job is no longer running` 或旧 ID 错误先按程序状态定位；工具提示替代 ID 时，
   读取该任务的真实输出后再操作，历史报告中的任务 ID 不自动沿用。
2. 当前任务为 `running`、`failed` 或 `interrupted` 且产物完整、来源仍有效时，
   可显式提交保留输出并重新校验。已 ready 的候选走接入；正在验证或写入时先等其
   现有操作结束。仅验证/接入失败不重新委派 Writing/Image。
3. 需要恢复制作或取消后继续时，使用现有 Continue 操作：它保留原分支，可能创建
   新 job；已有来源有效的保留候选时可能直接恢复 ready。操作后重新读取当前任务
   和候选。明确 Retry 是重新生成并建立替代分支，与技术返修分开。
4. 来源一致性失败时核对共享脚本、GUI、资产等是否在任务期间变化，保留已有 RPY，
   通过当前状态允许的 Continue/修订操作承接新来源并只补受影响部分。状态或 lint
   错误不视作锁故障；保持写入归属、来源检查和接入事务，保留锁及状态原件供诊断。
5. 制作确实受阻且尚待登记时，向当前任务调用 `renpi_fail_production(job_id, reason)`，
   附上实际原因与产物位置；已有校验失败记录直接作为恢复依据，避免反复改写状态。

### 插件更新后的生效确认

修复后仍出现旧错误时，先核对实际启动的扩展路径、Pi 版本、进程及源码修改时间，
不要先归因于项目输出。当前 Pi 1.1.0 加载器对原生 `.mjs` 的 ESM 缓存可能跨
`/reload` 保留，桥接重新连接不等于新版模块已加载。涉及这类更新时，先保存成果、
处理在途写入，再正常退出 Pi 进程，以原项目和已核实的入口通过 `--session` 恢复
已有会话；保持任务、分支和候选，不靠删除状态或反复重交验证更新。其他版本按实际
加载机制判断；仅规则文档更新与运行时模块更新分开处理。

## 验收与边界

分别记录运行时安装、真实模型产物、SDK 验证、GUI 加载和读档/回退证据。
第二个项目应安装完全相同的客户端，仅更换声明与内容即可工作。
出现公共功能缺口时向 Ren’Pi 主项目报告，保留任务和产物；桥接/幂等/分支/
接入算法由公共运行时维护，项目中只留声明与调用。

运行时保护受管路径和接入事务，不是任意 RPY/Python 的 OS 沙箱。
共享脚本改写、旧档任意结构迁移和未知外部作业重提各需独立验证。
