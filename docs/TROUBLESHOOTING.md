# 故障排查：先找到你看到的现象

**不用从头读。** 在下表找最接近的一行，点进去，只做那一节。也可以按 `Ctrl + F` 搜索报错里的英文关键词。

> 先记住三件事：**保留报错；一次只改一个条件；不要删除 `.renpi-live/` 或存档来试运气。**

[返回入门说明](../README.md) · [提交问题所需信息](#report) · [隐私与安全](../SECURITY.md)

<a id="symptoms"></a>
## 我遇到了什么？

| 你看到的现象或关键词 | 去这里 |
| --- | --- |
| 不知道命令填哪儿、`not recognized`、`CommandNotFoundException` | [1. 命令和终端](#commands) |
| 找不到文件、`ENOENT`、`Test-Path` 是 `False` | [2. 目录与路径](#paths) |
| `git lfs` 失败、图片/字体打不开、下载 ZIP 后缺素材 | [3. 素材没有下载完整](#lfs) |
| `Set RENPY_HOME`、`Missing SDK Python`、`Missing renpy.py` | [4. SDK 路径](#sdk) |
| 启动窗口一闪而过、Ren’Py 报错退出 | [5. 游戏启动失败](#game-start) |
| `Ren’Pi requires Pi >=1.1.0`、装了新版本却还是旧版 | [6. Pi 版本](#pi-version) |
| 没有 `/renpi-status`、`skills are missing` | [7. 扩展没加载](#extension) |
| `model: null`、`pi-virtual`、401、403、429 | [8. 模型与认证](#model) |
| `connected: false`、`Waiting for the bridge`、缺 `project.json` | [9. 游戏与 Pi 连接](#connection) |
| `writer is already alive`、`another GUI owns this project` | [10. 重复实例或锁](#lock) |
| `Validation requires a file symlink`、`PermissionError`、`EPERM` | [11. 权限与校验](#permissions) |
| `foundation.pending.json`、`Foundation installation is incomplete` | [12. 基础安装中断](#foundation) |
| `returned` / `ready`，但游戏还是旧内容 | [13. 候选还没完成接入](#adoption) |
| 生成中断、卡住，不知道点 Continue 还是 Retry | [14. 继续、重试、取消](#production) |
| Image 没出图、重复作业、突然下载大模型 | [15. 图像后端](#images) |
| 更新后仍像旧代码、`runtime differs`、文件冲突 | [16. 更新与重启](#reload) |
| 读旧档没恢复旧正文、分支指向和预想不同 | [17. 存档与分支](#saves) |
| 文字看着累、布局错位或字体显示异常 | [18. 阅读与界面](#display) |
| `identity mismatch`、`recovery_failed`，或以上都没解决 | [先保留现场](#preserve)，再[反馈问题](#report) |

<a id="commands"></a>
## 1. 命令应该输入在哪里？

**现象：** 输入 `/renpi-status` 后 PowerShell 报错；或者 `git`、`node`、`npm`、`pi` 找不到。

**先做：** 看当前窗口属于哪一种。

| 看到的界面 | 这里输入什么 |
| --- | --- |
| 类似 `PS C:\...>` 的提示符 | `git`、`node`、`npm.cmd`、路径设置、启动命令 |
| Pi 的对话记录和输入框 | `/login`、`/model`、`/renpi-status`、`/renpi-setup` |
| Ren’Py 游戏画面 | 点击故事选项或桥接按钮，不粘贴终端命令 |

工具刚装好时，关闭旧 PowerShell，再打开新窗口，重试 `git --version` 或 `node --version`。

**如果提示脚本执行被禁止：** 使用 README 里的 `npm.cmd`，以及完整路径的 `pi.cmd`。通常不需要更改整个系统的执行策略。

**如果 Pi 提示找不到 Bash：** 核对是否安装了 [Git for Windows](https://git-scm.com/install/windows)。PowerShell 是你输入启动命令的窗口，Git Bash 可以是 Pi 内部工具使用的 shell，两者并不冲突。详见 [Pi 的 Windows 说明](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/windows.md)。

**成功标志：** 工具显示版本号，或 Pi 识别以 `/` 开头的命令。

**仍有问题：** 记录命令全文和第一条错误；不要连续重装所有工具。

<a id="paths"></a>
## 2. 我是不是打开了错误的文件夹？

**现象：** `Test-Path` 输出 `False`；出现 `ENOENT`、`Cannot find path`；Pi 指向错误项目。

先分清三个位置：

- **仓库目录：** 同时包含 `extensions`、`skills` 和 `renpi-tutorial`。
- **游戏目录：** 包含 `game/`；附带教程的游戏目录就是仓库里的 `renpi-tutorial`。
- **SDK 目录：** 包含 `renpy.py`、`lib/` 和 `renpy/`，通常不在游戏目录里。

在一个新的 **PowerShell** 窗口中输入，按提示填自己的完整路径，不加两端引号：

```powershell
$repo = (Resolve-Path -LiteralPath (Read-Host 'RenPi 仓库目录')).Path
$project = Join-Path $repo 'renpi-tutorial'
Test-Path -LiteralPath (Join-Path $repo 'extensions\renpi\index.ts')
Test-Path -LiteralPath (Join-Path $repo 'skills')
Test-Path -LiteralPath (Join-Path $project 'game')
```

**成功标志：** 三个 `True`。自己的故事项目应将 `$project` 换成它的完整目录。

路径含空格或中文可以正常传入。`Read-Host` 提示后输入的是路径文字，不是命令；复制文件地址时注意去掉外层双引号。

**仍有问题：** 检查是不是多进或少进了一层文件夹。不要把路径错误当成“需要重新初始化”。

<a id="lfs"></a>
## 3. 图片、音乐或字体没有下载完整

**现象：** 素材打不开、引擎报图片/字体格式错误，或 PNG/TTF 实际只有很小的文本内容。

Git LFS 有时下载到的只是“素材在哪里”的指针，而不是素材本身。**指针文件的首行常是 `version https://git-lfs.github.com/spec/v1`。**

在**仓库根目录的 PowerShell**执行：

```powershell
git lfs version
git lfs install --local
git lfs pull --include="renpi-tutorial/game/**"
```

这会联网下载素材。下载量与仓库内容有关；不会因查看本说明而自动开始下载。

然后检查：

```powershell
git lfs ls-files
```

**成功标志：** 教程素材行中的文件名之前是 `*`，表示工作区已有完整内容；`-` 表示仍是指针。再启动游戏验证实际素材读取。

**仍有问题，按错误处理：**

- `git lfs` 不是命令：安装 [Git LFS](https://git-lfs.com/)，重新打开 PowerShell。
- `not a git repository`：先确认工作目录。如果下载的是 ZIP，优先在另一个新目录用 Git 克隆，保留旧目录中的个人修改。
- 网络、身份验证、配额、`object does not exist`：保留具体错误，由仓库/LFS 服务维护者核对访问与对象是否已上传。重复克隆通常解决不了服务端缺失。

不要把 LFS 指针重命名、重新编码成图片，或覆盖自己的素材来掩盖下载错误。

<a id="sdk"></a>
## 4. SDK 路径没有设置好

**现象：** `Set RENPY_HOME`、`Missing SDK Python under RENPY_HOME`、`Missing renpy.py under RENPY_HOME`，或候选检查要求 SDK。

在**将要启动 Pi 或游戏的那个 PowerShell 窗口**中执行：

```powershell
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host '解压后的 RenPy SDK 完整目录，不加引号')).Path
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'renpy.py')
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'lib\py3-windows-x86_64\python.exe')
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'renpy\common')
```

**成功标志：** 三个 `True`，之后从这个窗口重新启动程序。

**容易漏掉：**

- 填 SDK 文件夹，不填压缩包、`renpy.exe` 或游戏文件夹。
- 当前路径检查针对 Windows x64 SDK；系统里另装一个 Python，并不会补齐 SDK 缺失的文件。
- 两个终端的临时环境变量不共享。AI 终端和游戏启动终端都要设置。
- 已经运行的 Pi 不会自动读取你后来在别的窗口设置的环境变量。

**仍有问题：** 查看 [Ren’Py SDK 下载页](https://www.renpy.org/latest.html)，确认完整解压。开发者执行 Python 检查驱动时，显式 SDK 参数优先于环境变量；错误的显式参数不会自动换用另一个 SDK。

<a id="game-start"></a>
## 5. 游戏启动失败，窗口一闪而过

**先做：** 不要直接反复双击启动器。在 PowerShell 中按 [README A4–A5](../README.md#read-tutorial)设置 SDK 并启动，保留显示的错误。

| 错误或现象 | 下一步 |
| --- | --- |
| 提到 `RENPY_HOME` 或 SDK 文件 | 做[第 4 节](#sdk) |
| 提到 `Foundation installation is incomplete` | 做[第 12 节](#foundation) |
| `The opening has not been adopted into game/` | 核对下载的正式运行脚本是否完整；新项目按基础安装流程处理，不手工复制一批旧稿 |
| `Ren'Py exited with code ...` 或错误窗口 | 查看游戏目录的 `log.txt`、`traceback.txt`，优先处理第一处脚本/素材错误 |
| 启动的是 `start-preview.cmd` | 教程正式入口是 `start-game.cmd`；预览入口依赖本地检查材料，不是普通用户入口 |

**日志在哪里？** 教程就在 `renpi-tutorial` 文件夹下，不是 `game` 子文件夹。部分日志只有发生对应错误时才存在。

**成功标志：** 主菜单出现，点击“开始体验”后能阅读开场。

**仍有问题：** 按[问题模板](#report)反馈脱敏后的错误上下文。启动器提到的本地 handoff 文件若不存在，直接提供当前错误；其缺失不表示需要重建整个项目。

<a id="pi-version"></a>
## 6. Pi 版本不匹配，或电脑上有多个 Pi

**现象：** `Ren’Pi requires Pi >=1.1.0 (stable release); this process is Pi ...`；刚安装完，`pi --version` 还是旧版本。

当前代码要求 **1.1.0 或更高正式版**；1.1.0 和 1.2.0 都满足要求，带 `alpha`、`beta`、`rc` 的预发布版暂不接受。更高版本通过门禁不等于完整功能已经验证。先找实际入口，而不是连续升级。

若仍看到旧提示 `Ren’Pi targets Pi 1.2.0`，说明加载的还是旧门禁：先核对扩展路径，再完整退出 Pi 后重新启动。

在 **PowerShell** 查看：

```powershell
Get-Command pi -All | Select-Object Name, Source
```

如果按 README 使用 npm 安装，执行：

```powershell
$pi = Join-Path (npm.cmd prefix -g) 'pi.cmd'
& $pi --version
```

其他安装方式，手动选择已确认的入口：

```powershell
$pi = (Resolve-Path -LiteralPath (Read-Host 'Pi 入口文件完整路径（>=1.1.0 正式版）')).Path
& $pi --version
```

**成功标志：** 输出 `1.1.0` 或更高正式版，例如 `1.2.0`；之后用这个 `$pi` 按 [README B2](../README.md#connect-ai)启动，而不是裸写 `pi`。

**仍有问题：** `Get-Command` 可能列出 npm、pnpm 或其他安装路径。保留现有配置和会话，先确定哪个安装属于本项目。没有匹配安装时，再执行 README 中固定版本的安装命令。

<a id="extension"></a>
## 7. Pi 能打开，但没有 Ren’Pi 命令

**现象：** 找不到 `/renpi-status`，或出现 `Ren'Pi skills are missing`、扩展导入失败。

1. 确认启动参数包含 `--extension` 和仓库里的 `extensions/renpi/index.ts`。
2. 确认 `extensions/` 与 `skills/` 仍在同一个完整仓库里；只复制 `index.ts` 不够。
3. 按[第 6 节](#pi-version)确认运行中的 Pi 为 1.1.0 或更高正式版。
4. 完整退出 Pi，再按 [README B2](../README.md#connect-ai)从正确游戏目录启动。

**成功标志：** 在 Pi 输入 `/renpi-status` 能看到 `project`、`model`、`skills`、`renpy_home` 和 `gui_bridge`。

**仍有问题：** 提供扩展加载时的第一条错误，不要把技能散复制到多个全局目录来试错。仓库根目录也没有必须先执行的 `npm install`。

<a id="model"></a>
## 8. 模型未选择、认证失败或请求受限

**先在 Pi 输入 `/renpi-status`，看 `model`。**

| 现象 | 先做什么 |
| --- | --- |
| `model: null` / `Select a model in Pi before delegating` | `/login` 配置自己的服务，再用 `/model` 选择具体模型 |
| `Select a physical model` / `pi-virtual` | 在 `/model` 中选择实际模型，而不是虚拟路由 |
| 401 / 403 | 核对该服务的认证状态、模型访问权限和服务地址；不要公开密钥 |
| 429 | 查看服务返回的限流或额度说明，等待或处理额度问题，不连续重试 |
| 超时、断网、服务端错误 | 记录原任务，先核对服务状态，再按[第 14 节](#production)恢复 |

**成功标志：** 选定的模型能实际处理一次任务。仅显示模型名或登录成功，不证明请求已经成功。

真实请求可能收费。父会话可用，也不保证子任务自动拥有父会话的 MCP 或扩展工具；缺工具与缺认证是两类问题。

**仍有问题：** 记录服务名、模型名、错误码与时间；隐藏密钥和私密请求内容后再反馈。

<a id="connection"></a>
## 9. 游戏与 Pi 没连上

**现象：** `gui_bridge.connected: false`、`Waiting for the bridge…`、连接被拒绝，或找不到 `connection.json`。

**第一次只读开场，推进到选择处报缺少 `project.json`？** 当前教程在进入选择界面时才读取本机桥接身份。新克隆尚未 setup 会在这里报错；关闭游戏，按 [README B](../README.md#connect-ai)配置 Pi 并执行 `/renpi-setup`，再重新启动即可。已有分支的旧项目丢失此文件时，则按[保留现场](#preserve)处理，不当作首次安装。

按顺序做：

1. **确认 Pi 还开着。** 游戏启动器只启动已有内容，不会自动启动 AI。
2. 在 Pi 输入 `/renpi-status`，确认 `project` 与游戏所在文件夹完全一致。
3. 首次使用、尚未安装桥接时，先关闭游戏，在这个 Pi 中执行 `/renpi-setup`，再启动游戏。
4. 已安装项目先阅读 `gui_bridge.error`；有锁、身份或恢复错误时，去对应章节处理，不反复 setup。
5. 游戏显示 **Reconnect / resend same request** 时，点击一次。它重发保留的同一个请求，不是创建一个重试分支。

**成功标志：** Pi 侧 `connected` 为 `true`，游戏里的连接错误消失，状态能更新。

`connected: true` 只说明 Pi 侧服务存在，不证明 GUI 已连通或候选已发布。还要观察游戏里的实际状态。

**仍有问题：** 保留 `gui_bridge.error` 和游戏错误。桥接使用本机回环地址和动态端口；不要开放公网端口、手写连接文件或关闭整个防火墙来碰运气。

<a id="lock"></a>
## 10. 提示另一个 Pi 或游戏正在占用项目

**现象：** `a bridge writer is already alive`、`another GUI owns this project`、`bridge lock has incomplete ownership`。

1. 查看自己是否打开了两个同项目 Pi，或两个同项目游戏窗口。
2. 保留正在使用的那一个，正常退出多余窗口。涉及在途任务时先记录状态。
3. 若之前发生崩溃，确认相关进程确实已退出，再从原项目启动一次。程序会在可确认旧进程已退出时尝试回收桥接锁。

**成功标志：** 项目只由一个 Pi 和一个游戏实例使用，锁错误消失。

**仍有问题：** 不按进程名批量结束所有 `node` 或 `python`；它们可能属于其他工作。不要手工删除 `writer.lock`、改 `owner.json` 或强行修改项目身份。[先保留现场](#preserve)并让维护者核对具体进程与锁记录。

<a id="permissions"></a>
## 11. 文件权限、软链接或校验失败

**现象：** `Validation requires a file symlink`、`WinError 1314`、`PermissionError`、`EPERM`，或 `SDK compile failed` / `SDK lint failed`。

先看错误发生在哪一步，不同错误需要不同处理：

| 错误 | 下一步 |
| --- | --- |
| 明确提到 `file symlink` | 校验阶段需要创建逐文件软链接；在 Windows 设置里搜索“开发者模式”，按设备策略启用相关能力后重试。受管理电脑请联系设备管理员 |
| `managed path contains a reparse link` | 受管理的项目文件路径含链接/重解析点；核对真实目录，保留原件后在普通目录的独立副本验证 |
| 普通文件访问被拒绝 | 核对目录写权限、文件占用和安全软件事件，先记录具体文件，不关闭所有保护 |
| `spawn EPERM` | 可能是进程启动权限限制。若测试运行器自身启动失败，使用贡献指南里的 `--test-isolation=none`；若堆栈已进入桥接、凭据目录权限设置或引擎启动，则需核对宿主的进程权限，该参数解决不了这些限制 |
| `SDK compile failed` / `SDK lint failed` | 查看该错误后的首条实际脚本、素材或引擎诊断，再由 Coding 修复对应输入 |

软链接是验证工作区引用已有大文件的方式，不是让你手工给项目状态创建链接。当前验证实现没有自动复制大文件的降级路径；不要删掉校验来继续接入。Windows 的相关设置与限制见[开发者模式说明](https://learn.microsoft.com/en-us/windows/advanced-settings/developer-mode)和[软链接权限说明](https://learn.microsoft.com/en-us/windows/win32/api/WinBase/nf-winbase-createsymboliclinka)。

**成功标志：** 原先失败的同一个检查通过；若涉及候选，还要完成[接入确认](#adoption)。

**仍有问题：** 记录完整错误、对应文件、系统与 SDK 版本；不要默认让整个 AI 会话长期以管理员身份运行。

<a id="foundation"></a>
## 12. 基础内容安装中断

**现象：** 启动器提示 `Foundation installation is incomplete`，项目里有 `.renpi-live/bridge/foundation.pending.json`。

这是未完成安装的恢复记录，不是多余缓存。**先暂停启动、连接和阅读。**

1. 正常关闭该项目的游戏与 Pi。
2. 私下备份项目及恢复记录，保留原始创作输入。
3. 核对中断前使用的**源目录和完整文件清单**。
4. 用原输入按[扩展的基础安装恢复说明](../extensions/renpi/README.md#公共桥接与基础安装)重跑离线安装入口；不凭空挑几个文件补写。

不清楚原清单时，先让维护者核对记录；不要删除 `foundation.pending.json`、绕过启动器或直接复制脚本进 `game/`。

**成功标志：** 安装流程完成且待恢复标记由程序处理，之后正式启动器正常工作。安装回执仍需与实际 GUI 阅读结果分别确认。

<a id="adoption"></a>
## 13. AI 说完成了，游戏却没变

**现象：** 看到 `returned`、`ready`，或已经有输出文件，但还在阅读旧内容。

先看你处在哪个阶段：

| 状态 | 代表什么 |
| --- | --- |
| `returned` | 专业子任务交回了报告/文件，主任务还可能需要整合 |
| `ready` | 候选已通过校验并冻结，等待接入；还没完成 GUI 加载确认 |
| `awaiting_load` | 接入已进行到等待引擎重载与确认的阶段 |
| `adoption.phase: committed`，对应分支 `published: true` | 加载确认通过；再实际进入分支阅读 |
| `rolled_back` / `recovery_failed` | 本次接入失败，已撤回或恢复仍需处理 |

**在游戏里操作，不去手改状态文件：**

1. 显示 **Adopt candidate** 时，采用候选。
2. 显示 **Reload current candidate** 时，重新加载。
3. 显示 **Confirm reloaded entry** 时，确认已经加载的入口。
4. 显示 **Enter confirmed branch** 或 **Read existing branch** 时，进入阅读。

界面按状态显示按钮，部分过程会自动完成；不要找一个当前没有出现的按钮。出现 **Reload published candidate** 时，按提示重新加载已发布内容。

**成功标志：** 对应候选已完成加载确认，游戏确实读到新分支。开发排查可核对 `published_candidate_id` 是否对应本次候选。

**如果重载失败：** 保留错误；界面提供 **Recover prior runtime (report load failure)** 时，用它报告失败并恢复先前运行内容。随后若显示 **Reload restored original runtime**，按提示重载原内容。`recovery_failed`、身份不一致或反复失败时，[保留现场](#preserve)后反馈。

不要直接把任务输出复制到 `game/`，不要编辑 `committed` 或 `published` 标记来跳过加载确认。

<a id="production"></a>
## 14. 生成卡住了：继续、重试、取消选哪个？

**先不要连点。** 查看 Pi 的当前工具、错误与已有任务输出；外部作业的结果尚未确认时，先查原作业。

| 你想做什么 | 使用哪个操作 | 会发生什么 |
| --- | --- | --- |
| 网络刚恢复，重发上一次请求 | Reconnect / resend same request | 重发同一请求 ID |
| 原分支还没做完，接着做 | Continue original branch | 保留分支身份，继续制作；任务记录可能更新 |
| 我确实想重写成另一条后续 | Retry as a NEW branch | 创建新分支，更新该选项指向，旧分支保留 |
| 先停下当前制作 | Cancel production | 保留已有分支与输出；晚到结果不自动接入 |

**成功标志：** 程序显示符合你意图的任务/分支状态，而不是不断增加新的重试任务。

如果 Pi 显示 `Coding turn ended without a candidate`，说明这一轮结束时没有提交候选。可要求 Coding 检查保留的输出，补齐当前任务，或在界面继续原分支；“模型说写完了”还不够。

**仍有问题：** 反馈当前状态及相关任务 ID，先脱敏。不要凭旧聊天里的任务 ID 强行提交；继续后应以程序记录中的当前任务为准。

<a id="images"></a>
## 15. Image 没出图，或突然下载了很多东西

**现象：** 只有 `image: started` 或一段提示词，没有实际图片；工具缺失；工作流开始下载模型。

1. 先确认 Image 是否有**已经配置好的图像后端**。安装 Ren’Pi 不会自动配齐后端和模型。
2. 检查原任务和后端队列。已有外部作业时记录其 ID，先核对结果，避免重复付费或排队。
3. 节点已安装不代表模型权重已在本机。继续前核对工作流依赖、预计下载量和存储位置。
4. 若不打算下载，暂停该生成流程，改用已有素材推进。不要反复提交同一工作流。

Image 子会话不自动继承父扩展或 MCP 的工具，也不自动获得其他宿主应用的图像能力。

**成功标志：** 有实际可打开的图像文件，并经 Coding 检查后纳入候选；提示词和“已完成”文字不算图片产物。

**仍有问题：** 提供后端类型、失败节点或工具名、脱敏任务状态与错误，不公开账号密钥、完整私人工作流或原始素材。

<a id="reload"></a>
## 16. 更新代码后没生效，或客户端版本冲突

**现象：** `/reload` 后仍像旧代码；提示 `runtime differs from its installation record or bundled version`，或 `Existing project file differs from the bundled runtime`。

### 只更新了扩展源码

此前在 Pi 1.1.0 中观察到 ESM 模块缓存可能跨 `/reload` 保留，尤其是 `.mjs` 文件。测试新版本时使用完整重启，不把 `/reload` 当作代码已刷新的证据。

1. 先记录 `/renpi-status` 中的项目和 `session`，处理在途任务与未完成接入，备份项目。
2. 完整退出原 Pi 进程；不要同时再开一个实例争抢桥接。
3. 按 README B2 重新设置 `$repo`、`$pi`、`RENPY_HOME` 并进入**同一个游戏目录**。
4. 恢复指定会话时，在 PowerShell 执行下面命令，替代普通启动行：

```powershell
$session = Read-Host '输入之前记录的 Pi session ID 或会话文件完整路径'
& $pi --extension (Join-Path $repo 'extensions\renpi\index.ts') --session $session
```

**成功标志：** 新进程加载了更新后的代码；再核对 `/renpi-status` 与实际行为。桥接重新连接本身不证明模块版本已经更新。

### 提示项目客户端有差异

这意味着游戏内客户端、安装记录或仓库模板不一致。Warning 会保留项目文件并继续连接，**不是“已经自动升级成功”**。

先比较差异：是否有本地修改，是否正在做版本升级？关闭相关运行实例并备份，再由维护者决定保留、合并或通过安装器更新。setup 可能保留冲突并报错，不用强制覆盖来处理。

**仍有问题：** 提供仓库提交号、具体差异文件名与 Warning。更新仓库前先看 `git status --short`；不要用丢弃本地修改的命令换取一个“干净目录”。

<a id="saves"></a>
## 17. 读旧存档后，正文没有变回旧版

**这可能符合当前设计，而不是存档坏了。**

- 存档记录阅读位置与剧情状态，不冻结当时的全部脚本和素材。
- 在同一分支直接修改正文后，旧档读到的也是该分支当前生效的内容。
- Retry 更新某个选项当前导向的新分支；读取旧分支存档，不会把该选项的绑定恢复成历史版本。
- 想恢复旧正文，需要明确恢复对应的历史内容，单独核对对共享内容和其他分支的影响。

**先做：** 描述你期待恢复的是“阅读位置”“选项指向”还是“旧版正文”，再核对当前分支。不要为恢复旧正文而删除分支或存档。

更新前备份整个项目，并核对游戏实际存档目录。Windows 存档可能还在 `%APPDATA%\RenPy` 下，具体取决于游戏配置；不要只假定都在 `game/saves/`。详见 [Ren’Py 存档位置说明](https://www.renpy.org/doc/html/config.html#var-config.save_directory)。

**成功标志：** 阅读位置、当前分支与想恢复的内容分别核对清楚；不以“能读档”代替正文版本确认。

<a id="display"></a>
## 18. 阅读吃力、字体异常或布局错位

**只是字速或转场不舒服：** 教程底部打开 **文字设置**，选择 **即时显示 / 舒适速度**、**减少转场**；用 **回看** 重读刚才内容。

**图片或字体报错：** 先查[素材是否完整](#lfs)，不要先重新生成所有素材。

**对话框、名字或文字位置不对：**

1. 记录屏幕缩放比例、窗口/全屏状态及出现问题的具体场景。
2. 截图时保留整个游戏窗口，遮盖私密故事内容。
3. 反馈是“字被裁掉”“名字挡住正文”还是“某个窗口尺寸才出现”。

**成功标志：** 在原先出问题的窗口条件下重新阅读，缺陷消失。compile/lint 没报错，只能说明相应静态检查通过，不保证画面正确。

<a id="preserve"></a>
## 先保留现场：别把恢复材料清掉

遇到身份不一致、重复恢复失败、锁归属不明或数据覆盖风险时，先停在这里。

1. 记录第一条错误、最后一次成功操作和发生时间。
2. 暂停重复生成与接入；能正常退出时，关闭本项目的游戏和 Pi，等写入停止后备份。
3. 在私有位置保留整个游戏项目，包括 `game/`、`authoring/` 和隐藏的 `.renpi-live/`；另行保留实际存档目录。
4. 若复制过程报文件占用，记录占用情况，先核对进程，不强制复制成半套状态。
5. 保留原副本直到恢复验收结束。不要公开上传整个备份。

不要混用不同时间、不同项目的 `project.json`、`state.json`、客户端和存档，也不要手工改项目 ID。需要分享时，先按下一节整理最小信息。

<a id="report"></a>
## 反馈问题：复制这张小表就够了

普通问题提交到 [Ren’Pi Issues](https://github.com/henryd2341/renpi/issues)。**当前仓库尚未上传**，可先在本地填好下表，待入口开放后提交。

软件漏洞使用仓库的 **Private vulnerability reporting**，按[私密报告流程](../SECURITY.md#reporting)操作；不要在普通 Issue 中公开漏洞细节或凭据。

```text
我想做什么：
我停在 README / 排查文档的哪一步：
我输入的命令或点击的按钮：
预期看到什么：
实际看到什么（第一条报错及必要上下文）：
复现步骤（尽量 1、2、3）：
系统与架构（例如 Windows 11 x64）：
Pi / Node / RenPy 版本：
RenPi 提交号或下载来源：
是否使用教程、是否已有本地修改：
已经尝试过什么：
脱敏截图或必要日志片段：
```

不知道某项就写“未确认”，不用为了填表先学完整套工具。

### 可以到哪里找信息？

| 信息 | 位置或操作 |
| --- | --- |
| Pi 项目、模型、桥接与当前状态 | 在 Pi 输入 `/renpi-status`；分享前遮盖私密路径与故事文字 |
| Ren’Py 错误 | 游戏项目根目录的 `log.txt`、`traceback.txt`，按实际存在的文件查看 |
| 专业委派错误/结果 | 游戏项目 `.renpi-live/tasks/` 中对应任务的 `error.txt`、`result.md` 或 `receipt.json`；部分文件只在相应阶段出现 |
| Pi 版本 | PowerShell 中使用实际入口执行 `& $pi --version`，`$pi` 先按[第 6 节](#pi-version)设置 |
| Node 版本 | PowerShell 中执行 `node --version` |
| 仓库提交号 | 在仓库根目录执行 `git rev-parse --short HEAD`；ZIP 没有 Git 记录时填写下载来源 |

**发送前停一下：** 删除密钥、token、Cookie、认证头、用户名、私人路径和无关故事内容。保留错误类别、相对文件路径及必要行号。不要上传 `connection.json`、token 文件、整个 `.renpi-live/`、完整会话或整个存档目录。

如果秘密已经发出，先撤销/轮换相关凭据，再按[泄漏处理步骤](../SECURITY.md)处理；仅编辑消息不是完整处置。
