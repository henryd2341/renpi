# Ren’Pi 真模型入口

针对 **Pi 1.1.0**。直接加载，不依赖旧 bridge、固定 Provider 或 fixture 环境变量，不新增 npm 依赖。入口会检查准确版本；0.75.4 使用回滚副本，不共用新版入口。

## 启动

本机 npm 版位于 `D:\AppData\Roaming\npm\pi.cmd`；默认 `pi` 当前仍解析到 pnpm 的 0.75.4。使用绝对路径选择新版，先以独立配置和试验项目启动：

```powershell
New-Item -ItemType Directory -Force 'E:\RenpiValidation\kong-yiji-001' | Out-Null
$env:PI_CODING_AGENT_DIR = 'E:\RenpiValidation\pi-1.1.0-agent'
Set-Location 'E:\RenpiValidation\kong-yiji-001'
& 'D:\AppData\Roaming\npm\pi.cmd' --version
& 'D:\AppData\Roaming\npm\pi.cmd' --extension 'E:\PersonalAI\renpi\extensions\renpi\index.ts'
```

预期版本为 `1.1.0`。独立配置初次启动需要配置模型与认证，例如在 Pi 内使用 `/login`；它不会自动复制旧配置。环境变量只影响当前 PowerShell 及其子进程，关闭这个终端后恢复原启动环境。正式复用个人配置前，单独备份配置和会话，避免新旧 Pi 交替更新同一份数据。

扩展沿用当前父 Pi 会话的模型和认证设置，`--provider` / `--model` 参数照常使用。SDK 沿用 `RENPY_HOME`，缺失时在环境扫描阶段查明，不阻止扩展加载。扩展通过 `resources_discover` 加载仓库内五组技能，无需复制到全局技能目录。搬迁入口时保持 `extensions/renpi` 与 `skills` 的相对位置。

进入 Pi 后：

1. `/renpi-status`：核对项目路径、模型、工具和 SDK 路径。此命令不调用模型。
2. `/renpi-init 原文是当前目录的孔乙己.txt，暂无图片音乐资产；先扫描项目和环境，展示已知清单，再按初始化技能确认最小范围。`
3. Coding 可调用 `renpi_delegate`，分别委派 `writing`、`image`、`review`。

## 已接通的范围

### 公共 GUI 桥接

创建游戏项目的 `game/` 后，在同一个 Pi 中执行 `/renpi-setup`（Coding 可调用
`renpi_bridge_setup`）。它安装仓库随附的 Python/RPY 运行时，保留正文、存档和
既有分支；文件冲突会保留原件并报告。以 `/renpi-status` 的
`gui_bridge.connected` 检查当前连接。

```renpy
call renpi_choice("opening.choice", [("talk", "继续交谈"), ("rest", "准备休息")])
```

这两个参数是项目声明，不是另一套桥接实现。公共运行时负责 loopback HTTP
身份检查、耐久请求/选项绑定/HEAD、制作排队、候选验证、加载确认与失败撤销。
Coding 仍通过现有 `renpi_delegate` 制作实际产物，用 `renpi_submit_candidate`
提交分配目录，GUI 在衔接点接入。普通重选复用绑定；明确 Retry 创建新分支。

公共候选校验跳过非 ASCII 文件名检查，报告明确记录 `ignored_checks`；编译、
其余 lint、来源一致性和加载 ACK 继续生效。策略仅注入隔离 SDK common 副本，
原 SDK、项目文件名和受管客户端保持原样。修改 `.mjs` 后，完整退出 Pi 进程再以
`--session <原会话路径或 ID>` 启动；当前加载器的原生 ESM 缓存会跨 `/reload` 保留，
仅桥接重新连接不代表新版模块已加载。恢复原项目与会话，保留已有任务和产物。
当前任务即使失败或中断，也可显式提交保留的输出，无需重新生成正文或再建任务。
Continue 后以当前 `job_id` 为准；旧 ID 的错误会直接提示替代任务 ID。

详细调用及限制见 [公共桥接契约](../../skills/renpi-coding/references/bridge-contract.md)。
`prototypes/bridge` 保留实验范围；新项目使用这里的公共运行时，不复制实验工程。
既有私有触发器需单独迁移，安装器不会自动删除它们或推断旧请求的业务分支。

- 当前 cwd 就是游戏项目；不替换主 Pi 的模型、认证或工具配置。
- 子任务通过 Pi SDK 使用独立上下文/会话，显式继承当前模型、认证和 thinking；不是多个角色共用同一段聊天，也不是固定文本替身。
- 子会话使用公开 `ModelRuntime` 接口，通过父会话的公开模型注册表发送请求。认证在父运行时按请求解析，不复制密钥；保留临时凭据、动态 provider、端点和认证 header。子会话归属 header 作为默认值，父 header（含删除标记）优先。
- 首版串行委派，每次任务有独立输出目录，避免共享文件并发写入。Writing 交付、Image 交付由 Coding 读取后整合。Review 只有只读工具，报告由协调器保存。
- 子会话、任务、产物和报告在项目的 `.renpi-live/tasks/<任务 ID>/`。`receipt.json` 的 `returned` 只代表回合返回，不代表作品通过审查或已接入。
- 取消向子会话传递；退出会中止准备中或运行中的委派并等待清理。委派期间阻止切换/分叉会话及重叠委派。中断记录保留供核对，首版不自动续派或恢复子任务。

## 明确边界

- 公共桥接只管理已安装项目；未安装时 `gui_bridge.connected` 为 false。候选限目标分支专属目录，任意共享代码改写、任意旧档结构迁移和未知外部作业自动重提不属于 v1 的承诺。运行中的 Pi 提供连接，关闭 Pi 后 GUI 保留任务等待重连。
- Image 可通过 shell 调用已配置的后端；不会自动获得 Codex 图像工具，也不会继承主 Pi 的自定义 extension 工具。后端缺失时按技能报告缺项，不把提示词当图片。
- 子会话只加载本角色技能和内建工具，不自动接入 MCP/codemode；通过父运行时发起模型请求，但不继承父会话的消息改写 hooks、其他扩展、retry 或 compaction 个性设置。子会话关闭 cache warming，避免新增后台预热请求；子会话自身压缩请求沿用父认证路径。
- 委派要求选择具体模型。Pi 的 `pi-virtual` 虚拟模型路由本轮不接入，会在创建任务前明确报错；不静默选择替代模型。
- Writing 的 write/edit 限制到分配的输出目录；Review 无写入/shell 工具。主 Pi 和 Image 的 shell 仍具有当前 OS 用户权限：换 cwd 不构成文件系统沙箱。需要强隔离时在有写入边界的宿主或临时虚拟机运行。
- 默认沿用个人 Pi 配置目录。需要隔离设置和会话时，先指定 `PI_CODING_AGENT_DIR` 与 `--session-dir`，再在该配置下准备所需模型认证。

## 验证

`runtime.test.mjs` 使用 Node 内建测试；`load-check.mjs` 验证真实 SDK 加载；`sdk-check.mjs` 使用真实 SDK 和可控 provider 验证委派，同时禁用网络访问、使用临时配置与测试凭据。后两者传入已安装 1.1.0 SDK 的绝对路径，不新增项目依赖。

```powershell
Set-Location 'E:\PersonalAI\renpi'
$sdk = 'D:\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\dist\index.js'
node --test --test-isolation=none 'E:\PersonalAI\renpi\extensions\renpi\runtime.test.mjs'
node 'E:\PersonalAI\renpi\extensions\renpi\load-check.mjs' $sdk
node 'E:\PersonalAI\renpi\extensions\renpi\sdk-check.mjs' $sdk
```

真实模型委派、生图和 GUI 运行分别验收，不由加载检查代替。

### 公共桥接验证（2026-10-13）

以下为此前版本的验证记录。后续 base/生成分支路线区分、文件名 lint 策略和失败任务重交修复已补回归，
按用户要求尚未执行任何测试、编译或 lint；下列结果不作为该修复的验证证据。

文件名 lint 策略的待执行检查为 `extensions/renpi/bridge-lint-sdk-check.mjs`
（需要 `RENPY_HOME`）。覆盖中文文件名通过、缺失跳转目标仍失败、语法错误仍失败；
仅使用临时项目并保留证据，不启动游戏 GUI 或调用模型。

- 公共运行时、安装器和委派边界 Node 测试 29/29；Python 客户端测试 11/11，
  包括正常/重定向/鉴权失败/服务端失败响应的资源关闭。
- 真实 Pi SDK 桥接检查：21 个断言、11 次可控 provider 请求。GUI 事件实际触发
  主 Coding、Writing 子会话、文件交付与隔离 Ren’Py compile/lint；覆盖主回合越界
  写入、shell 拦截、提交后冻结和取消传播。外部网络/真实模型请求均为 0。
- 真实 Ren’Py 屏幕 action 端到端：选择 → 制作 → 接入 → reload → 实际恢复的
  事务身份确认 → 进入剧情 → 嵌套选择返回 → 重选复用；1 次制作、2 次阅读，
  ACK committed，HEAD 回到 base。界面动作由测试驱动，未作人工视觉验收。
- 原委派 SDK 回归 241 个断言/15 场景、原型桥接回归 286/286；strict TypeScript
  检查 0 诊断。第二个独立项目安装相同客户端、保留不同项目身份的检查通过。
- 独立定点审查已核对并发安装锁、取消后委派阻断、旧存档 ACK 身份、候选继续
  路径、项目外私有凭据及 SDK common/存档隔离。

可重跑命令（完整 Python 用于驱动测试；实际游戏由指定 SDK 自带 Python 运行）：

```powershell
$env:RENPY_HOME = 'E:\Renpy\renpy-8.5.3-sdk'
$python = 'C:\Users\18248\AppData\Local\Programs\Python\Python312\python.exe'
node --test --test-isolation=none extensions/renpi/runtime.test.mjs extensions/renpi/project.test.mjs extensions/renpi/bridge.test.mjs
node extensions/renpi/bridge-sdk-check.mjs $sdk
& $python -B extensions/renpi/client.test.py
& $python -B extensions/renpi/client-sdk-check.py $env:RENPY_HOME
& $python -B extensions/renpi/client-e2e-check.py $env:RENPY_HOME
```

证据：`E:\PersonalAI\renpi\.omx\evidence\shared-bridge-20261013\RESULT.md`。
真实 provider 自主创作、生图及已有私有触发器迁移独立验收；本轮保留
`E:\RenPiValidation\noctuary-002` 原样。引擎在 GUI 出现前就发生语法错误的
外部恢复路径、任意旧档结构迁移和 Windows 断电故障尚未完成端到端验收。

### Pi 1.1.0 本次验证（2026-10-11）

- Node 内建检查 2/2：路径/链接边界、角色工具范围、错误与截断输出判定。
- 实际 SDK 加载：发现 36 个技能，主模型与原有工具保持不变，注册 `renpi_delegate`；加载与预取消不创建项目任务状态。
- SDK 集成检查：241 个断言、15 个场景通过，18 次可控 provider 请求、0 次外部模型请求、0 次网络尝试。覆盖 Review 真正读取随机标记、Writing 写入/编辑及越界保护、Image 工具集合、父子上下文/会话隔离、thinking、临时/测试磁盘认证、动态 provider 重注册、header 大小写/删除语义、手动压缩、取消、准备期/运行期退出清理、并发和切换保护、错误与空报告。
- 真实 CLI RPC：`get_state`、`get_commands` 和 `/renpi-status` 成功，退出码 0。真实终端 PTY：1.1.0 TUI 列出技能/扩展，执行 `/renpi-status`，Ctrl+D 退出码 0。均使用隔离配置、离线模式和网络阻断；不代表有认证的完整创作流程。离线新配置提示未下载 fd/rg，相关搜索工具执行留待完整环境验收。
- TypeScript 5.9.3 对两个 TS 源文件执行 strict 检查，0 诊断；跳过第三方声明内部检查。独立代码审查已通过。
- 尚未对 1.1.0 发起真实 provider/OAuth 请求，未验证主模型自主委派、完整 TUI 初始化/创作、生图或 GUI 桥接。0.75.4 的既有真实调用证据仅作历史记录，不计入新版通过项。

证据和可重跑的类型/CLI 检查：`E:\PersonalAI\renpi\.omx\evidence\pi110-20261011-223252`。本次未升级任何全局包、调整 PATH 或迁移个人配置/会话。

## 回滚

原扩展与技能布局保存在 `E:\PersonalAI\renpi\.omx\evidence\pi110-20261011-223252\baseline`，旧 SDK 已重新验证可加载此副本。退出新版后，使用旧 Pi 和原配置启动备份入口，无需覆盖当前源码或迁移后会话：

```powershell
& 'C:\Users\18248\AppData\Local\pnpm\pi.CMD' --extension 'E:\PersonalAI\renpi\.omx\evidence\pi110-20261011-223252\baseline\extensions\renpi\index.ts'
```

在原终端运行此回滚命令，或先恢复原 `PI_CODING_AGENT_DIR`；不要让旧 Pi 指向新版独立配置目录。
