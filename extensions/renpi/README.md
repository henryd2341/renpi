# Ren’Pi 扩展

Ren’Pi 的 Pi 入口、专业委派与公共 GUI 桥接。当前入口要求 **Pi >=1.1.0（正式版）**；引擎校验器使用 **Windows x64 Ren’Py SDK** 的目录布局。模型、认证和工具沿用当前父 Pi 会话。

**最低要求不等于已验证范围：** 1.1.0 和 1.2.0 均满足版本门禁，更高正式版也允许尝试，预发布版暂不接受。先用下文的 `load-check.mjs` 和 `sdk-check.mjs` 检查实际安装，再按需验证桥接、GUI 与真实服务。通过版本门禁不等于兼容性验收通过。

## 启动

准备已安装的 Pi 1.1.0 或更高正式版、Ren’Py SDK 和游戏项目目录。在本仓库根目录打开 PowerShell，按本机实际安装位置填写：

```powershell
$repo = (Get-Location).Path
$pi = Read-Host 'Pi 入口文件的完整路径（>=1.1.0 正式版，例如已安装的 pi.cmd）'
$project = (Resolve-Path -LiteralPath (Read-Host '游戏项目目录')).Path
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host 'RenPy SDK 目录')).Path
& $pi --version
```

确认版本输出为 `1.1.0` 或更高正式版（例如 `1.2.0`），再加载扩展：

```powershell
Set-Location -LiteralPath $project
& $pi --extension (Join-Path $repo 'extensions/renpi/index.ts')
```

这里的当前目录是**游戏项目**，扩展路径属于 **Ren’Pi 仓库**。保留仓库内 `extensions/renpi/` 与 `skills/` 的相对布局；扩展自行发现角色技能，无需复制到全局技能目录。

默认复用当前 Pi 配置。需要独立配置时，在启动前设置自己的 `PI_CODING_AGENT_DIR`；新配置需自行配置模型和认证，例如使用 `/login`。`--provider`、`--model` 和 `--session` 仍由 Pi 处理。扩展加载本身不要求立即使用 Ren’Py SDK，但基础安装和候选校验需要有效的 `RENPY_HOME`。

进入 Pi 后先用 `/renpi-status` 核对项目路径、模型、工具、SDK 和桥接状态；它不调用模型。`/renpi-init <本项目的初始化需求>` 用于制作任务，会进入模型工作流程，按需执行。

## 入口与职责

| 文件或目录 | 职责 |
| --- | --- |
| [index.ts](index.ts)、[model-runtime.ts](model-runtime.ts)、[runtime.mjs](runtime.mjs) | Pi 入口、专业委派、父模型接入及输出边界 |
| [bridge-extension.ts](bridge-extension.ts)、[bridge.mjs](bridge.mjs) | Pi 与 GUI 连接、生产任务、候选和接入状态 |
| [project.mjs](project.mjs)、[foundation.mjs](foundation.mjs) | 项目安装、身份校验及首次基础内容接入 |
| [bridge-common.mjs](bridge-common.mjs)、[validation_files.py](validation_files.py) | 路径与文件操作、SDK 校验、验证输入准备 |
| [template/game/](template/game/) | 安装到游戏项目的公共 RPY/Python 客户端 |
| `*.test.mjs`、`*.test.py` | 单元与回归测试；不是产品启动入口 |
| `*-check.mjs`、`*-check.py` | 显式执行的 SDK/引擎集成检查，执行范围见下表 |

## 公共桥接与基础安装

游戏项目已有 `game/` 后，在同一个 Pi 中执行 `/renpi-setup`，或由 Coding 调用 `renpi_bridge_setup`。安装保留已有正文、存档和分支，冲突文件保留原件并报告。连接结果以 `/renpi-status` 的 `gui_bridge.connected` 为准。

| 操作 | 用途与完成边界 |
| --- | --- |
| `renpi_delegate` | 委派 Writing、Image、Review；返回报告和文件不等于候选就绪或接入完成 |
| `renpi_install_foundation` | 首次安装明确列出的开场、共享定义和资产；先关闭 GUI，且尚未产生生产分支 |
| `renpi_submit_candidate` | 校验并冻结当前任务的输出；`ready` 之后仍需 GUI 采用、重载及加载确认 |
| `renpi_fail_production` | 记录当前生产任务的明确失败原因，保留已有输出 |

基础安装只处理项目内 `authoring/` 下选定的文件，按相同相对路径写入 `game/`；相同字节的资产复用，不同内容原件报冲突。相同清单重复执行用于核对安装；已有基础内容的修改另行确认范围。安装回执与实际 GUI 阅读验收分别记录。

完成桥接 setup 后，也可关闭 Pi 和 GUI，使用相同安装逻辑的离线入口。以下复用启动节设置的 `$repo`、`$project` 与 `RENPY_HOME`，源目录和清单按项目实际内容填写：

```powershell
$source = Read-Host '项目内的创作源相对目录（位于 authoring/ 下）'
$files = @('options.rpy', 'screens.rpy', 'opening.rpy') # 示例；按实际输入调整，并列出所需资产。
node (Join-Path $repo 'extensions/renpi/foundation-install.mjs') $project $source @files
```

若中断留下 `foundation.pending.json`，保留记录及原始输入，在 Pi/GUI 关闭时用**原源目录和原文件清单**重跑。恢复完成前暂停连接和阅读。

项目只声明稳定选择点、选项与故事入口，例如：

```renpy
call renpi_choice("opening.choice", [("talk", "继续交谈"), ("rest", "准备休息")])
```

通信、幂等、分支绑定、候选接入及加载确认由公共运行时管理。制作与恢复步骤见[公共桥接契约](../../skills/renpi-coding/references/bridge-contract.md)，项目呈现层保留为 screen/style 与内容声明。

## 检查入口

以下入口独立运行，不作为扩展启动的必经步骤。需要时在仓库根目录另开 PowerShell，并明确本次执行级别。Python 检查驱动使用已安装的完整 Python 3.11+；实际引擎由所选 Ren’Py SDK 自带的 Python 启动。

| 检查 | 依赖与执行范围 |
| --- | --- |
| `*.test.mjs` | Node 内建测试，使用临时夹具；不启动 Ren’Py 或真实模型 |
| `client.test.py`、`validation_files.test.py` | Python 标准库测试；部分检查涉及本地 HTTP 或文件软链接，不启动 Ren’Py 或真实模型 |
| `load-check.mjs` | 参数为 Pi SDK 的 `dist/index.js` 绝对路径；验证实际 SDK 加载，不调用真实模型 |
| `sdk-check.mjs` | 同上；使用可控 provider 检查委派，阻断外部网络 |
| `bridge-lint-sdk-check.mjs` | 读取 `RENPY_HOME`，执行真实 Ren’Py compile/lint，不启动 GUI |
| `bridge-sdk-check.mjs` | 同时需要 Pi SDK 入口参数与 `RENPY_HOME`；执行实际委派、公共桥接及 Ren’Py 校验，不启动 GUI 或真实 provider |
| `client-sdk-check.py` | 执行真实 compile/lint，并启动 Ren’Py 检查重载、入口与加载 ACK；**包含引擎运行** |
| `client-e2e-check.py` | 启动本地 Node 桥接及 Ren’Py，自动操作真实选择界面；**属于 GUI E2E**，不调用真实 provider |

### 单元检查示例

```powershell
$python = Read-Host '已安装的完整 Python 3.11+ 解释器路径'
$tests = Get-ChildItem -LiteralPath './extensions/renpi' -Filter '*.test.mjs'
node --test --test-isolation=none $tests.FullName
& $python -B ./extensions/renpi/client.test.py
& $python -B ./extensions/renpi/validation_files.test.py
```

只核对这两个 Python 驱动的 SDK 选择与提前报错，可执行更小的检查；使用空的 SDK 文件夹具并在创建运行工作区前截断，不启动引擎：

```powershell
& $python -B ./extensions/renpi/validation_files.test.py SdkPathTests
```

### SDK 与引擎检查示例

这些命令不是一组必须连续执行的步骤，按上表选择。Pi SDK 入口与 Ren’Py SDK 目录是两个不同输入：

```powershell
$piSdk = (Resolve-Path -LiteralPath (Read-Host '待测 Pi 安装中的 dist/index.js 路径（>=1.1.0 正式版）')).Path
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host 'RenPy SDK 目录')).Path
node ./extensions/renpi/load-check.mjs $piSdk
node ./extensions/renpi/sdk-check.mjs $piSdk
node ./extensions/renpi/bridge-lint-sdk-check.mjs
node ./extensions/renpi/bridge-sdk-check.mjs $piSdk
```

仅在需要引擎运行或 GUI E2E 时选择以下入口；使用上一节设置的 `$python`：

```powershell
& $python -B ./extensions/renpi/client-sdk-check.py
& $python -B ./extensions/renpi/client-e2e-check.py
```

两个 Python 驱动均按 **第一个位置参数 → `RENPY_HOME`** 选择 SDK；相对参数以当前工作目录解析，中文和空格路径作为一个参数传入。也可显式传入 `$env:RENPY_HOME`。显式参数无效时直接报错，不悄悄换用其他安装。创建临时工作区或服务前，先检查 `renpy.py`、`lib/py3-windows-x86_64/python.exe` 和 `renpy/common/`。

## 维护与边界

- 当前 SDK 校验路径针对 Windows x64；其他平台需单独适配与验证。当前入口要求 Pi >=1.1.0 正式版，无版本上限；升级前按实际调用点核对 SDK 兼容性，尤其是主版本升级。
- 已安装客户端与模板/安装记录不一致时，扩展连接阶段合并提示一次 Warning，继续使用项目脚本。后续安装仍保留冲突保护；提示不等于已完成更新。
- 更新运行时 `.mjs` 后，保存成果并处理在途写入，再完整退出 Pi，以原项目和 `--session` 恢复会话。原生 ESM 模块缓存曾在 Pi 1.1.0 的 `/reload` 中保留；测试新版本时也使用完整重启，桥接重新连接不等于新模块已加载。
- 候选校验在隔离 SDK common 中跳过非 ASCII 文件名检查，并记录 `ignored_checks`；编译、其余 lint、来源一致性及加载确认仍生效。分发兼容性单独验收。
- 验证输入使用[资产引用与回收规则](../../skills/renpi-initialization/references/project-contract.md#验证工作区与资产引用)：大文件与媒体/字体使用逐文件软链接，需具备相应系统权限，链接失败明确报错；正式安装和冻结候选保持独立产物。
- 子会话沿用父模型运行时与认证，不复制密钥。只加载本角色技能及内建工具，不自动继承 MCP、父扩展工具或 Codex 图像工具。Image 需要已配置的后端；`pi-virtual` 模型路由不在当前支持范围内。
- Writing 的写入限制与 Review 的只读工具是应用层边界；主 Pi 和 Image 的 shell 仍具有宿主用户权限。运行时路径保护不等于任意代码的系统级隔离。
- 当前串行委派；中断后的已有输出按程序当前任务核对，再选择提交、Continue 或 Retry。共享代码修改、旧档迁移及外部作业恢复分别处理，不通过清空项目状态解决。
- 检查脚本、历史报告和静态通过结果各有范围。真实 provider、生图、GUI 阅读、加载确认及分发分别验收；本说明不将历史结果视作当前版本已通过。

公开文档只保存可复用操作与边界。本机验证回执、迁移快照和旧配置备份留在本地；版本回退使用自己保留的匹配源码、Pi 版本与配置，保留当前项目、存档和恢复材料。
