# 参与贡献

感谢你帮助 Ren’Pi 变得更好用。**指出一句看不懂的说明，也是一份有效贡献。**

不熟悉代码时，先读[用户入门](README.md)；遇到问题先查[故障排查](docs/TROUBLESHOOTING.md)。参与讨论与提交时请遵守[社区行为准则](CODE_OF_CONDUCT.md)。

## 选一种参与方式

| 你发现了什么 | 建议怎么做 |
| --- | --- |
| 说明跳步、术语难懂、链接失效 | 描述卡住的位置，或提交一个小的文档修改 |
| 启动失败、界面异常、分支行为不对 | 使用[问题模板](docs/TROUBLESHOOTING.md#report)提交可复现步骤 |
| 新功能或较大的结构调整 | 先开 Issue（问题讨论），确认范围后再实现 |
| 凭据泄漏、越界写入或其他安全问题 | 按[安全说明](SECURITY.md#reporting)私密反馈，不把细节发到公开 Issue |

Issue 是仓库的公开问题记录；PR（Pull Request）是请求维护者检查并合并你的修改。

- [项目仓库](https://github.com/henryd2341/renpi)
- [Issues：反馈普通问题、讨论功能](https://github.com/henryd2341/renpi/issues)
- [Pull requests：提交修改](https://github.com/henryd2341/renpi/pulls)

**当前仓库尚未上传。** 在线入口待发布后使用；可以先在本地整理复现步骤与修改。漏洞反馈使用仓库的 Private vulnerability reporting，具体步骤见[安全说明](SECURITY.md#reporting)。

## 开始前：确认你改的是哪一层

| 位置 | 职责 |
| --- | --- |
| `extensions/renpi/` | Pi 入口、专业委派、公共桥接、项目安装、候选校验 |
| `extensions/renpi/template/game/` | 安装进游戏项目的公共客户端模板 |
| `skills/` | 初始化、Coding、Writing、Image、Review 的工作指导 |
| `renpi-tutorial/game/` | 教程当前运行的正文、界面、素材 |
| `renpi-tutorial/authoring/` | 教程创作源、素材来源、构建与检查源码 |
| 根目录文档、`docs/` | 面向使用者与贡献者的说明 |

`prototypes/` 和本机 `evidence/` 可能只存在于开发者电脑，且被忽略；它们不是新克隆仓库的必备输入。

开始前阅读目标目录适用的 `AGENTS.md` 和维护说明。修改教程时尤其先读[教程说明](renpi-tutorial/README.md)：创作源与运行版有已知差异，先比较再修改，避免整目录覆盖。

### 一个改动，解决一个完整问题

1. 找到出问题的入口及所有调用方。
2. 列出受影响的代码、测试、模板、文档和配置。
3. 复用已有实现，在共同入口修复根因。
4. 补上覆盖错误场景的小测试，再检查正常路径。
5. 在 PR 中交代行为变化、验证结果和保留的限制。

修文案不需要顺手改架构；修桥接也不需要重绘教程界面。保留无关文件和其他人的修改。

## 本地准备

先按 [README](README.md#connect-ai)准备工具：当前扩展要求 **Pi >=1.1.0（正式版）**，SDK 校验使用 **Windows x64 Ren’Py SDK**。Node 最低版本见 README；Python 检查驱动另需完整 **Python 3.11+**。报告兼容性结果时注明实际 Pi 版本；满足最低要求不等于所有版本均已通过验证。

- 仓库根目录没有统一的 `package.json` 或 `npm test` 入口；不要在这里盲目执行 `npm install`。
- 文档修改通常不需要模型账号；离线单元检查不需要真实模型。
- 图像后端不是基础开发依赖。涉及生成时，先确认已有后端、费用和隐式模型下载。

在**仓库根目录的 PowerShell**中，先查看当前修改：

```powershell
git status --short
git diff --stat
```

通过平台 Fork（创建自己的仓库副本）和 PR 流程提交。创建工作分支时可用 `codex/简短主题`；不要把未完成修改混进主线。

## 按改动选择验证，不把所有检查当成一道门

### 文档改动

- 检查相对链接、章节跳转、文件名和命令参数。
- 确认代码框写明运行位置，变量在使用前已有设置。
- 对照当前源码核实版本、按钮名称、写入行为和风险。
- 写明命令是“已执行”还是“只做静态核对”；新手说明尽量加上预期结果。

### 公共运行时的单元检查

**运行位置：仓库根目录。** 以下检查使用临时目录，部分测试启动本地 HTTP 服务或创建文件软链接；不启动真实模型或 Ren’Py GUI。

```powershell
$tests = Get-ChildItem -LiteralPath '.\extensions\renpi' -Filter '*.test.mjs'
node --test --test-isolation=none $tests.FullName
```

**预期：** 进程退出码为 `0`，测试汇总没有失败。若你的 Node 不识别该参数，先核对版本，不删掉失败用例。桥接测试还会启动本机进程设置临时凭据目录权限；受限宿主可能拦截这一步，`--test-isolation=none` 并不绕过所有进程限制。

Python 检查另行执行：

```powershell
$python = (Resolve-Path -LiteralPath (Read-Host '完整 Python 3.11+ 的 python.exe 路径，不是 SDK 内置 Python')).Path
& $python -B .\extensions\renpi\client.test.py
& $python -B .\extensions\renpi\validation_files.test.py
```

**预期：** 每条命令都以成功退出并报告 `OK`。如果出现 `skipped`，一并记录原因；跳过不等于该场景通过。

### 按需扩大检查范围

具体参数见[扩展检查入口](extensions/renpi/README.md#检查入口)，不要凭脚本名称猜依赖。

| 修改范围 | 需要考虑的检查 |
| --- | --- |
| Pi 加载、模型接入、委派 | `load-check.mjs`、`sdk-check.mjs`；真实服务另验 |
| 基础安装、候选与桥接 | 相关单元测试、`bridge-lint-sdk-check.mjs`、`bridge-sdk-check.mjs` |
| RPY/Python 客户端、重载或加载确认 | Python 单元检查、`client-sdk-check.py`；涉及点击流程再做 `client-e2e-check.py` |
| 教程布局、字速、对话框或素材 | compile/lint，加真实窗口中的对应阅读、交互和截图检查 |
| 生图或外部服务 | 实际后端结果、资源、费用与取消/恢复情况，单独说明 |

`client-sdk-check.py` 会运行引擎；`client-e2e-check.py` 会启动并操作 GUI。执行前关闭无关测试窗口并确认范围。教程预览和 GUI 构建仍有本地依赖，克隆后不保证直接可重建，详见教程维护说明。

**请区分这些证据：** 测试通过 ≠ 真实模型可用；compile/lint 通过 ≠ 画面正确；候选 `ready` ≠ GUI 已加载确认；有截图 ≠ 存档与恢复已验收。

## 保留项目约定

- 通信、请求去重、分支绑定、候选接入与加载确认由**公共桥接**管理。项目声明内容与稳定 ID，不复制一套状态机。
- Continue 保留原分支，Retry 创建替代分支；回退、读档、直接修改与重试的语义分开处理。
- 公共客户端模板有变化时，核对安装器、两端协议、回归测试，以及已安装教程客户端是否需要同步。避免只改某一个项目副本。
- 兼容性升级说明旧项目、旧存档、在途任务和候选如何处理；不要通过删除状态让测试变绿。
- 技能修改应保持入口与引用有效，长期项目约束与单次任务限制分开记录。

## 提交前：只公开你打算公开的内容

图片、音频、字体先核对 [.gitattributes](.gitattributes) 的 LFS 覆盖范围。当前列有 PNG、MP3、TTF；新增格式不要假定已经覆盖。素材出处同步写入[来源记录](renpi-tutorial/authoring/sources/attribution.txt)，许可证随素材保留。

**请留在本地：** API 密钥、认证配置、`.renpi-live/`、会话记录、存档、日志、未脱敏截图，以及含私密提示词或工作流元数据的图片。

忽略规则和 LFS 都不是脱敏工具。不要用 `git add .` 或强制添加整个创作区来省事；逐个检查并添加本次文件。

在提交前执行：

```powershell
git diff --check
git diff --cached --stat
git diff --cached
git status --short
```

**完成标志：** 差异只包含本次范围，未夹带本机状态；检查结果与最终源码一致。

## PR 描述模板

复制后填空即可：

```text
解决的问题：
改动范围：
用户能观察到的变化：
验证环境（系统 / Pi / Node / RenPy / Python，按涉及项填写）：
执行的命令与结果：
未执行或跳过的检查及原因：
是否涉及已有项目、存档、分支或素材许可：
截图或脱敏证据（如适用）：
相关 Issue：
```

欢迎使用 AI 辅助，但提交者仍需阅读实际差异、核实来源并验证结果。不要把模型口头声明当作测试回执，也不要把私密对话一起公开。
