# SDK 主题索引

初版核对本机 Ren’Py 8.5.3 的 `doc/` 与 `tutorial/game/`。下列路径相对**当前选定 SDK**，HTML 使用已核对的真实锚点；行号只是本版教程定位提示，换 SDK 后重新定位。使用 [检索器](../consult-renpy-sdk/SKILL.md) 读章节，不整页灌入上下文。

| 问题 | HTML 页面与锚点 | 教程定位 | 采用前核对 |
| --- | --- | --- | --- |
| 正文、角色、文字转义 | `dialogue.html`；`text.html#escape-characters`、`#interpolating-data` | `tutorial/game/tutorial_quickstart.rpy` 的 `tutorial_dialogue`；`indepth_character.rpy`、`indepth_text.rpy` | 字面文本与插值/标签分开；映射后显示语义不变 |
| 说话者映射与回调 | `dialogue.html#Character`；`displaying_images.html#renpy.get_say_image_tag`；`character_callbacks.html` | 在实际项目定位 Character/image/callback，按当前文档事件表对照 | tag 非姓名；无映射返回 None；分段、slow_done 与整句结束分开，保留既有回调 |
| 立绘明暗渐变 | `matrixcolor.html#BrightnessMatrix`、`#structural-similarity`；`transform_properties.html#transform-property-matrixcolor` | `matrixcolor.html` 本版原生示例；项目已有 transform | 正常亮度值 0.0；渐变初值与矩阵结构一致；叠加既有场景色调 |
| 文字渐显与偏好 | `preferences.html`；`style_properties.html#style-property-slow_cps`；`screen_special.html#say`；`screen_actions.html#Preference` | 当前工程 say screen 与设置页，`tutorial/game/indepth_text.rpy` | text_cps 为 0 时即时显示；默认值变更可能更新已有偏好；what id、局部样式/标签与快进 |
| label 与调用返回 | `label.html#call-statement`、`#return-statement` | `tutorial/game/tutorial_screens.rpy:176–191` | 稳定 call from；空栈 return 的行为 |
| 图像名字与目录 | `displaying_images.html#images-directory` | `tutorial/game/tutorial_quickstart.rpy:204–220` | 文件路径/image 名/tag 是不同概念 |
| show、属性与清层 | `displaying_images.html#show-statement`、`#attributes-management`、`#scene-statement`、`#hide-statement` | `tutorial/game/tutorial_quickstart.rpy:226–273` | 同 tag 替换、保留 transform 与明确重置 |
| 定位与 ATL | `transforms.html#transform-statement`、`#repeat-statement`、`#parallel-statement` | `tutorial/game/tutorial_quickstart.rpy:275–358`；`tutorial_atl.rpy:120–175` | repeat 在块末尾；parallel 同属性竞争 |
| 入退场与表情替换 | `transforms.html#external-atl-events`；`displaying_images.html#hide-statement`；`transitions.html` | 当前工程的 show/hide/scene 和既有 ATL | on show/replace 与文本回调分开；scene 清层不触发 on hide；move 与首次入场区分 |
| 尺寸与裁切 | `transform_properties.html` | `tutorial/game/tutorial_atl.rpy` | 目标画幅、fit、锚点与源图可见边界 |
| 转场 | `displaying_images.html#with-statement`；`transitions.html#Dissolve`、`#Fade`、`#ImageDissolve` | `tutorial/game/tutorial_quickstart.rpy:379–425`；`indepth_transitions.rpy:4–24,93–126` | 整体转场与分段转场、所需蒙版 |
| 音乐/音效/环境音 | `audio.html#play-statement`、`#stop-statement`、`#queue-statement`、`#renpy.music.register_channel` | `tutorial/game/tutorial_quickstart.rpy:450–480` | 默认循环、if_changed、普通通道与特殊 audio 通道区别 |
| 配音与影片（按需） | `voice.html`、`movie.html` | `tutorial/game/tutorial_video.rpy` | 语句推进/跳过、显示/播放结束状态 |
| HUD 与局部交互 | `screens.html#show-screen`、`#call-screen` | `tutorial/game/tutorial_screens.rpy:253–312`；`tutorial_screen_displayables.rpy` | call screen 返回与自动隐藏，show screen 显式清理 |
| 预测与副作用 | `screens.html#screens-and-screen-language`、`#show-screen` | `tutorial/game/tutorial_screens.rpy:91–152` | 屏幕可能被多次提前求值，业务写入与展示分开 |
| 常量与可变状态 | `python.html#define-statement`、`#default-statement` | `tutorial/game/tutorial_screens.rpy:7–74` | define 可达对象按常量；可变状态用 default |
| 菜单/分支（已有授权） | `menus.html`、`conditional.html` | `tutorial/game/tutorial_quickstart.rpy` 的 menu/if 示例 | 普通剧情分支与 Ren’Pi 业务分支身份分开 |
| 存档/回退 | `save_load_rollback.html#what-is-saved`、`#what-isn-t-saved`、`#rollback` | 结合项目现有兼容模板，教程演示不作兼容证明 | 外部状态、结构变更与语句身份分别验证 |
| compile/lint | `cli.html#compile`、`#check-script-lint` | 工程级命令，非单条教程语句 | init 副作用、RPYC 写入/清理、lint --error-code |

## 版本与来源陷阱

- 本版 `doc/atl.html` 是迁移页，实际 ATL 内容在 `transforms.html`。
- 教程 `01example.rpy` 注册 `example`/`show example`/`hide example`，`script.rpy` 定义导航；这些不是可直接移植的引擎内建用法。
- 同一 SDK 自带教程也可能有旧的编辑器或操作系统建议；技术语义查当前文档/实现，机器环境以实际检查为准。
- 文档证据记录到 `coding-unit.md` 只需版本、具体章节、实际采用结论和必要教程位置，不复制整套文档作为新的维护负担。
