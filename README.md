# Ren’Pi

**一边读故事，一边和 AI 把它做成视觉小说。**

Ren’Pi 把 [Pi](https://pi.dev/) 的 AI 创作能力与 [Ren’Py](https://www.renpy.org/) 的游戏画面连接起来：你在游戏里选择方向，AI 制作下一段内容，经过检查和接入确认后，再继续阅读。

你可以从仓库附带的教程开始，也可以创建自己的故事项目。**第一次用，先打开教程开场就够了。**

**项目仓库：** [henryd2341/renpi](https://github.com/henryd2341/renpi)。当前尚未上传；下文的在线下载、Issue 和 PR 入口待发布后使用。已经拿到本地源码时，先完成 A1，再跳过 A2，继续 A3。

> 当前使用路径：**Windows x64 + Pi >=1.1.0（正式版）+ Ren’Py SDK**。这是一套创作工具，不是双击即玩的独立游戏安装包。其他系统、真实模型、生图和游戏打包都需要分别验证。

**版本要求与测试范围：** 最低版本是 1.1.0，1.2.0 也满足要求。更高正式版允许尝试，但不代表已经验证兼容；带 `alpha`、`beta`、`rc` 的预发布版暂不接受。真实模型、GUI 和完整创作流程仍需分别验证。

## 先选一条路

| 我现在想做什么 | 从这里开始 |
| --- | --- |
| 先看看画面，不配置 AI | [A：打开教程开场](#read-tutorial) |
| 让 AI 接着写故事 | 完成 A，再做 [B：连接 AI](#connect-ai) |
| 昨天已经配好了，今天继续 | [再次启动](#restart) |
| 卡住了，只想解决眼前的问题 | [按现象找办法](docs/TROUBLESHOOTING.md#symptoms) |
| 修改代码、文档或教程 | [贡献指南](CONTRIBUTING.md) |

### 这份说明怎么读

- **一次只做一个小标题。** 看到“完成标志”后，再往下走。
- **代码框只复制里面的内容。** 不复制外面的三个反引号。
- 标着 **PowerShell** 的命令，粘贴到 Windows 终端；以 `/` 开头的命令，输入到 **Pi 界面**。两者是不同地方。
- 遇到红色报错，先停在这一小节。[故障排查](docs/TROUBLESHOOTING.md)可以按报错关键词查找。
- 中途休息没关系。重新打开终端后，需要重新设置路径变量；文件还在原来的文件夹里。

<a id="read-tutorial"></a>
## A：打开教程开场

**本阶段只读已有内容，不需要模型账号、Node.js、Pi 或单独安装 Python。**

### A1. 准备三个工具

1. 安装 [Git for Windows](https://git-scm.com/install/windows)：用来下载项目，默认安装也会带上 Git Bash。
2. 检查 Git LFS；缺少时安装 [Git LFS](https://git-lfs.com/)：用来下载真正的图片、音乐和字体，而不只是小小的占位文件。
3. 下载并解压 [Ren’Py SDK](https://www.renpy.org/latest.html)。本文以 **8.5.3 的 Windows x64 SDK** 为例；选择 Windows 的 SDK 下载项，解压后再使用。其他版本需另行核对。

安装后重新打开 **PowerShell**：按 Windows 键，输入 `PowerShell`，打开它。普通用户窗口即可。

**在 PowerShell 输入：**

```powershell
git --version
git lfs version
```

**完成标志：** 两条命令都显示版本号；SDK 文件夹里能看到 `renpy.py` 和 `lib` 文件夹。

> 下载和解压的位置由你选择。SDK 文件夹是解压后的目录，不是下载的压缩包，也不是 `renpy.exe` 文件。

### A2. 下载 Ren’Pi

已经有通过 Git 下载的完整仓库？跳到 A3。

先打开你想存放项目的文件夹，例如自己创建的 `D:\Projects`。在资源管理器的地址栏输入 `powershell`，按回车。

仓库发布后，在这个 PowerShell 窗口执行下面的命令。当前尚未上传时，请先保留已有本地源码，不必反复尝试下载。

```powershell
git clone https://github.com/henryd2341/renpi.git renpi
```

这一步会联网，下载源码，并可能同时下载大文件。等命令结束后检查结果。

**完成标志：** 当前文件夹下多出 `renpi` 文件夹，里面有 `extensions`、`skills`、`renpi-tutorial` 和本文件。

**若提示文件夹已存在：** 先确认里面是不是已有项目，保留它；不要为了重新下载删除旧文件夹。

### A3. 进入仓库，补齐素材

在资源管理器打开刚下载的 `renpi` 文件夹，在地址栏输入 `powershell`，按回车。后面称这个窗口为**游戏窗口的启动终端**。

```powershell
$repo = (Get-Location).Path
Test-Path -LiteralPath '.\extensions\renpi\index.ts'
```

**应看到 `True`。** 如果是 `False`，你打开的不是仓库根目录；[先修正路径](docs/TROUBLESHOOTING.md#paths)。

然后执行：

```powershell
git lfs install --local
git lfs pull --include="renpi-tutorial/game/**"
```

这两条命令为当前仓库配置 LFS，并下载教程素材，需要网络及仓库 LFS 服务可用。

**完成标志：** 命令结束且没有下载错误。下载失败、图片损坏或字体报错，查看 [LFS 素材排查](docs/TROUBLESHOOTING.md#lfs)。

> 普通源码 ZIP 是否包含完整 LFS 素材，取决于发布方式。第一次使用优先走上面的 Git 下载流程；ZIP 解压后缺素材时，不要把占位文件当作损坏图片反复转换。

### A4. 告诉启动器：SDK 放在哪里

在**同一个 PowerShell 窗口**输入：

```powershell
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host '粘贴解压后的 RenPy SDK 文件夹完整路径，不加引号')).Path
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'renpy.py')
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'lib\py3-windows-x86_64\python.exe')
Test-Path -LiteralPath (Join-Path $env:RENPY_HOME 'renpy\common')
```

输入示例：`D:\Tools\renpy-8.5.3-sdk`。请换成自己的路径；如果“复制文件地址”带了两端引号，粘贴时去掉引号。

**完成标志：** 连续看到三个 `True`。否则查看 [SDK 路径排查](docs/TROUBLESHOOTING.md#sdk)。

`RENPY_HOME` 只是“SDK 在哪里”的临时设置，只影响这个终端及它启动的程序，不会永久修改系统设置。

### A5. 打开游戏

还是在同一个 PowerShell 窗口：

```powershell
.\renpi-tutorial\start-game.cmd
```

**完成标志：** 出现教程窗口，点击 **开始体验**，能读到 Salome 的开场。

- 点击推进文字；底部有 **回看** 和 **文字设置**。
- 想减轻阅读负担，可在文字设置里选择 **即时显示** 或 **减少转场**。
- 看到 **“开场先停在这里。接下来由你决定……”** 这句台词时，先暂停或关闭游戏；继续前完成 B。

> **首次克隆的已知边界：** 尚未执行 `/renpi-setup` 时，继续推进到选择界面会因缺少本机 `project.json` 报错。A 只覆盖选择前的开场阅读，不覆盖完整教程交互；无需为此重装或重建项目，按 B 建立桥接即可。

**到这里，A 已完成。现在就可以休息。** 想继续生成故事，再做 B。

<a id="connect-ai"></a>
## B：连接 AI，让故事继续

**这阶段会读写游戏项目；真实模型和图像服务可能收费。** 先备份重要项目，确认服务用量规则，避免把私密资料放进模型可读取的文件中。具体边界见[安全说明](SECURITY.md)。

### B1. 安装匹配版本的 Pi

安装 [Node.js 的 Windows LTS 版本](https://nodejs.org/en/download)，版本至少 **22.19.0**，然后重新打开 PowerShell。这是 [Pi 1.2.0 的版本要求](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/package.json)。

```powershell
node --version
npm.cmd --version
```

**完成标志：** 都显示版本号，Node 满足上述要求。

已经有 Pi 1.1.0 或更高正式版？跳过安装，直接使用它的入口路径。下面以 **1.2.0** 为安装示例，不要求已有用户更换版本。尚未安装时执行下面命令；它会联网，并安装到 npm 的全局工具目录。已有 npm 全局 Pi 时，这一步会更换那个安装的版本。

```powershell
npm.cmd install -g --ignore-scripts @earendil-works/pi-coding-agent@1.2.0
```

安装成功后，在同一窗口执行：

```powershell
$pi = Join-Path (npm.cmd prefix -g) 'pi.cmd'
& $pi --version
```

**完成标志：** 输出为 `1.1.0` 或更高正式版；按上面的示例安装应显示 `1.2.0`。这里使用 npm 安装的完整入口路径，避免误开电脑上另一个旧版本。其他安装方式见 [Pi 版本排查](docs/TROUBLESHOOTING.md#pi-version)。

安装方式参照 [Pi 1.2.0 官方入门文档](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/quickstart.md)；本项目只设置最低版本要求。示例命令固定入口包为 1.2.0，便于复现，传递依赖仍按上游版本范围解析。选择其他 Pi 版本时，也核对该版本的 Node 要求。

### B2. 从教程目录启动 Pi

先关闭 A 中的游戏窗口，便于首次安装连接文件。打开一个 PowerShell 窗口，称为 **AI 终端**。

下面三个问题分别填写：**仓库文件夹、Pi 入口文件、SDK 文件夹**。都使用完整路径，不加两端引号。

```powershell
$repo = (Resolve-Path -LiteralPath (Read-Host 'RenPi 仓库文件夹完整路径')).Path
$pi = (Resolve-Path -LiteralPath (Read-Host 'Pi 入口文件完整路径（>=1.1.0 正式版），例如上一步的 pi.cmd')).Path
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host 'RenPy SDK 文件夹完整路径')).Path
$project = Join-Path $repo 'renpi-tutorial'
Set-Location -LiteralPath $project
& $pi --extension (Join-Path $repo 'extensions\renpi\index.ts')
```

想知道上一步的 `$pi` 是什么？在原来的 PowerShell 输入 `$pi`，就会显示完整路径。

**完成标志：** 出现 Pi 的对话界面，没有扩展加载错误。

> **游戏项目目录 ≠ 仓库目录。** 本例中，Pi 在 `renpi-tutorial` 里工作，扩展从仓库的 `extensions/renpi/index.ts` 加载。保留 `extensions` 与 `skills` 的相对位置，无需把技能复制到全局目录。

### B3. 登录并选择模型

以下内容输入到 **Pi 的输入框**，每次一条：

```text
/login
```

按 Pi 的提示选择你自己的模型服务并完成登录或密钥配置。密钥只填在相应认证流程里，不粘贴到故事对话或公开 Issue。

```text
/model
```

选择一个已配置、可用的**具体模型**。Ren’Pi 的专业委派暂不支持 `pi-virtual` 虚拟路由。自定义服务和本地模型按 [Pi 模型说明](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/models.md)配置。

**完成标志：** Pi 界面显示你选定的模型。登录完成不代表额度充足；首次请求仍可能收到服务端错误。

### B4. 检查并建立游戏连接

在 **Pi 输入框**执行：

```text
/renpi-status
```

只需要先看三项：

| 字段 | 你要确认什么 |
| --- | --- |
| `project` | 是本次要玩的 `renpi-tutorial`，不是仓库根目录 |
| `model` | 是刚选定的模型，而不是 `null` |
| `renpy_home` | 是正确的 SDK 文件夹 |

首次连接时，再输入：

```text
/renpi-setup
```

它会在**当前游戏项目**安装或核对公共桥接文件，并创建本机状态；已有正文、存档和分支会保留，文件冲突会报告。已有连接正常的项目无需反复 setup。

再运行 `/renpi-status`。**完成标志：** `gui_bridge.connected` 是 `true`，且没有待处理的连接错误。它表示 Pi 侧桥接已启动，**不代表游戏已经加载了新故事**。

### B5. 保留 AI 终端，再打开游戏

保持 Pi 开着。另开一个 **PowerShell** 窗口，填写路径后启动教程：

```powershell
$repo = (Resolve-Path -LiteralPath (Read-Host 'RenPi 仓库文件夹完整路径')).Path
$env:RENPY_HOME = (Resolve-Path -LiteralPath (Read-Host 'RenPy SDK 文件夹完整路径')).Path
& (Join-Path $repo 'renpi-tutorial\start-game.cmd')
```

阅读开场，在选择点选择一次方向，观察 Pi 的制作进度。生成期间不要反复点击重试；同一项目只开一个负责桥接的 Pi。

候选校验需要创建文件软链接；若系统提示权限不足，先按[权限排查](docs/TROUBLESHOOTING.md#permissions)处理，保留已有生成结果。

**接入时按界面提示操作：**

1. 等待候选就绪，出现 **Adopt candidate**（采用候选）时点击它。
2. 如果出现 **Reload current candidate**（重新加载当前候选），点击并等待重载。
3. 如果出现 **Confirm reloaded entry**（确认已加载入口），点击确认。
4. 出现 **Enter confirmed branch** 或 **Read existing branch** 时，进入分支阅读。

按钮会按状态出现，部分步骤可能自动完成；只操作当前实际显示的按钮。

**完成标志：** 游戏里确实读到了新故事，程序完成加载确认。仅有 `returned` 报告或 `ready` 候选，都不算完成这一阶段。卡住时看[候选接入排查](docs/TROUBLESHOOTING.md#adoption)。

> Image 生图还需要单独配置的图像后端。现有教程素材可以用于起步；“已生成提示词”不等于“已生成图片”。新工作流可能下载大模型，运行前先确认依赖和下载量。

<a id="restart"></a>
## 下次怎么继续

1. 打开 AI 终端，按 **B2** 重新设置三个路径并进入原游戏目录。
2. 如果要续接该目录最近一次 Pi 对话，把 B2 最后一行替换为：

```powershell
& $pi --extension (Join-Path $repo 'extensions\renpi\index.ts') --continue
```

3. 用 `/renpi-status` 核对项目和桥接；再按 **B5** 在另一个终端启动游戏。

Pi 的 `--continue` 是**恢复 AI 对话**；游戏里的 **Continue original branch** 是**恢复原故事分支的制作**。两者不是同一件事。

如果有多个旧会话，使用 Pi 的 `/resume` 选择；升级后要精确恢复会话，见[重启与更新排查](docs/TROUBLESHOOTING.md#reload)。

<details>
<summary>进阶：不使用教程，创建自己的故事项目</summary>

先完成 B1，并按 B2 设置 `$repo`、`$pi` 和 `RENPY_HOME`。保持 Ren’Pi 工具仓库不变，另建一个存放自己故事的文件夹。

在 PowerShell 中：

```powershell
$project = Read-Host '输入一个尚未存在的新故事文件夹完整路径'
New-Item -ItemType Directory -Path $project -ErrorAction Stop
```

创建成功后：

```powershell
Set-Location -LiteralPath $project
& $pi --extension (Join-Path $repo 'extensions\renpi\index.ts')
```

在 Pi 中配置模型，再输入自己的需求，例如：

```text
/renpi-init 我想做一个中文短篇视觉小说。先和我确认设定与素材；先用已有资源，下载模型或素材前告诉我用途和大小。完成后留下启动脚本、运行方法和实际验证结果。
```

这是**真实制作请求**，会调用模型并修改这个新项目。初始化会按需创建 `game/`、安装桥接和基础内容；已有游戏的适配应先核对结构和备份，不把初始化当作修复按钮。

</details>

## 只需记住的几个区别

| 名称 | 简单理解 |
| --- | --- |
| Ren’Pi 仓库 | 工具箱：扩展、技能、教程源码 |
| 游戏项目 | 你的故事文件夹，里面有 `game/` |
| `authoring/` | 制作中的内容；不一定已在游戏里生效 |
| `game/` | 当前供 Ren’Py 读取的运行内容 |
| `.renpi-live/` | 本机任务、分支、候选和恢复记录；不是随手清理的缓存 |
| Continue / Retry | 前者继续原分支；后者创建新分支并更新选项指向，旧分支仍保留 |

读取旧存档会回到对应分支和位置，**不会把已修改的正文自动变回旧版本**。更新前保留整个项目和实际存档目录，别只备份单个存档文件。

## 想了解更多

- [故障排查](docs/TROUBLESHOOTING.md)：从错误现象找下一步。
- [扩展维护说明](extensions/renpi/README.md)：工具、检查入口和技术边界。
- [教程维护说明](renpi-tutorial/README.md)：正文、界面与素材位置。
- [贡献指南](CONTRIBUTING.md) · [社区行为准则](CODE_OF_CONDUCT.md) · [安全说明](SECURITY.md)。

本仓库代码使用 [MIT License](LICENSE)。教程中的第三方音乐、图片和字体另见[素材来源记录](renpi-tutorial/authoring/sources/attribution.txt)及[字体许可证](renpi-tutorial/game/fonts/OFL-NotoSerifSC.txt)，请分别核对用途；代码许可不替代第三方素材条款。

**验收边界：** 这份指南描述当前源码提供的流程，不宣称所有机器、模型服务、图像后端或完整创作闭环已通过测试。静态检查、引擎检查、真实 GUI、真实模型与打包分发，应分别记录结果。
