---
name: consult-renpy-sdk
description: 为 Ren’Pi Coding 按问题检索当前 Ren’Py SDK 的 HTML 文档与 tutorial RPY，提取带锚点的正文和保留缩进的代码，核对语义、版本及教程框架依赖。
---

# 按需读 HTML 文档与 RPY 教程

教程回答“怎样组合”，文档回答“这句到底做什么”。以当前任务使用的 SDK 为准，网页最新版和模型记忆只作补充，不覆盖本地版本语义。

## 先定位，后提取

1. 按显式 SDK 路径、现有机器配置、`RENPY_HOME` 的顺序确定安装。核对版本、`tutorial/game/` 和实际 `docs/` 或 `doc/`。本机初版核查为 8.5.3、`doc/`；共享技能保持可迁移，不保存机器绝对路径。
2. 将需求收敛成具体问题，如“表情替换是否保留 transform”“环境音怎样循环且可停”“call screen 在何时返回”。先查 [主题索引](../references/sdk-topic-map.md)，命中后只读对应章节及必要相邻定义。
3. 使用附带 [HTML 检索器](scripts/read_sdk_docs.py) 先搜再读。它以标准库解析 HTML，剔除导航/脚本，保留正文、实体与代码缩进；只读本地文件，不执行页面或改写 SDK。

```powershell
# 从项目根目录执行；其他位置使用检索器的绝对路径。
# $sdkRoot 是前一步核定的 SDK，显式选择优先于环境变量。
$reader = Join-Path (Get-Location) 'skills/renpi-coding/consult-renpy-sdk/scripts/read_sdk_docs.py'
python -X utf8 $reader --sdk $sdkRoot search 'if_changed' --limit 5
python -X utf8 $reader --sdk $sdkRoot read 'audio.html#play-statement' --max-chars 9000
python -X utf8 $reader --sdk $sdkRoot read 'audio.html#renpy.music.register_channel' --max-chars 9000
python -X utf8 $reader --sdk $sdkRoot read 'transforms.html#transform-statement' --max-chars 9000
```

`--sdk` 可省略并读取 `RENPY_HOME`；显式路径优先。搜索结果只是定位，不作完整语义依据；输出截断时读更窄锚点或增加本次上限。搜索遇非正文页会输出 `Skipped` 及路径再继续，该页不计入已搜索正文；直接阅读缺失页面/锚点/正文则报错，返回实际索引重新定位，不拿整页文本冒充目标章节。阅读目录选择以工具输出为准。

4. 用 `rg -n` 搜对应教程文件的真实语句，再用有限行数读取周边。确认例子需要的角色、图像、通道、screen、label 和 Python 定义。
5. 将方案写成项目自己的 RPY。调用前核对必需参数、默认值、生命周期、保存/回退与预测副作用；在整合说明中记 SDK 版本、`页面#锚点`、教程文件/行范围、采用结论。

## 避免把教学外壳当语法

本版 `tutorial/game/script.rpy` 开头提醒教程外围采用特殊展示技巧。`example`、`show example`、`hide example`、`Section`/`Tutorial` 导航属于教程自定义设施；只抽取其展示的 RPY 模式，连同真正所需的定义一起适配，保留项目自己的 GUI 和调用链。必要时对照 SDK 的 `the_question/game/` 看普通工程组织。

`atl.html` 在已核查版本只是迁移提示；ATL 正文位于 `transforms.html`。遇到迁移页按实际链接继续，别把短提示视为整章。

## 能力边界

检索器是本地 Sphinx 文档阅读辅助，不是完整 HTML/Markdown 转换器。复杂表格、图示、CSS、可折叠示例的视觉关系回到原 HTML/图片核对；相邻说明与交叉引用仍按需追读。页面样式改变导致正文识别失败时检查原 HTML，不静默抽取导航作为正文。

仅当前问题需要的结论进入工作上下文，不整站转 Markdown、不新增搜索服务或向量库。脚本的 [小型回归检查](scripts/test_read_sdk_docs.py) 只验证提取行为，不代表 Ren’Py 游戏运行正确。
