# Ren'Pi GUI 组件图像

## 交付范围

这是一套可由 Ren'Py 直接引用的 **32 张透明 PNG**，同时保留 **32 份 SVG 源文件**。设计参考分辨率为 **1920 × 1080**；当前教程尚未定义屏幕分辨率，这只是本套素材的布局基准。

- PNG：renpi-tutorial/game/gui/renpi/
- SVG：renpi-tutorial/authoring/shared/gui-kit/svg/
- 组件总览：renpi-tutorial/authoring/shared/gui-kit/controls-preview.png
- 场景叠加预览：renpi-tutorial/authoring/shared/gui-kit/scene-preview.png
- 完整尺寸、边界和文字留白：renpi-tutorial/authoring/shared/gui-kit/manifest.json

实际组件里没有烘焙文字。预览上的标题、按钮文案和教程文本是单独叠加的示意内容。

## 素材清单

以下文件名都位于 PNG 目录。

| 组件     | 文件                                                     | 数量 | 原始尺寸   |
| -------- | -------------------------------------------------------- | ---: | ---------- |
| 对话框   | textbox.png                                              |    1 | 1728 × 288 |
| 姓名牌   | namebox.png                                              |    1 | 320 × 72   |
| 通用面板 | panel.png                                                |    1 | 800 × 640  |
| 通用按钮 | button_状态.png                                          |    6 | 360 × 80   |
| 对话选项 | choice_状态.png                                          |    6 | 960 × 88   |
| 复选框   | check_状态.png                                           |    6 | 48 × 48    |
| 滑杆轨道 | slider_left/right.png、slider_insensitive_left/right.png |    4 | 512 × 16   |
| 滑杆滑块 | slider_thumb_idle/hover/insensitive.png                  |    3 | 64 × 48    |
| 关闭按钮 | close_idle/hover/insensitive.png                         |    3 | 48 × 48    |
| 继续提示 | continue.png                                             |    1 | 24 × 16    |

六种状态：idle（普通）、hover（悬停/焦点）、selected_idle（选中）、selected_hover（选中且悬停）、insensitive（禁用）、selected_insensitive（选中且禁用）。

按钮的悬停状态增加内描边；选中状态增加加粗左侧标记和右侧菱形，除颜色外还有形状提示。同一组件各状态的 alpha 轮廓完全相同。

## 怎样使用

PNG 已经位于游戏的 gui/renpi 目录。Ren'Py 的资源字符串以 game 目录为起点，例如：

```renpy
frame:
    background Frame("gui/renpi/panel.png", 136, 32, 40, 48)
    xsize 900
    ysize 600
    padding (40, 40)
```

四个数字按 **左、上、右、下** 指定九宫格边界。用 Frame 拉伸面板或按钮，保留切角和描边；直接整体拉伸会连边框一起变粗或变细。

| 图片族               | Frame 边界（左、上、右、下） | 文字留白（左、上、右、下） |
| -------------------- | ---------------------------- | -------------------------- |
| textbox              | 160, 40, 48, 40              | 56, 52, 64, 40             |
| namebox              | 32, 24, 32, 24               | 40, 14, 32, 14             |
| panel                | 136, 32, 40, 48              | 40, 40, 40, 40             |
| button、choice       | 40, 24, 48, 24               | 40, 16, 48, 16             |
| slider 的 left/right | 8, 0, 8, 0                   | 不适用                     |

复选框、滑块、关闭图标、继续标记按原尺寸显示，或按相同比例缩放。滑块原宽 64，示例使用 thumb_offset 32、thumb_align 0.5；轨道高 16，滑块高 48，布局应给上下各 16 像素留白。

### 完整引用示例

renpi-tutorial/authoring/shared/gui-kit/renpi-gui-example.rpy.txt 包含按钮六状态、可切换复选框、滑杆和面板的独立示例。

1. 需要接入时，将该文件复制为 renpi-tutorial/game/renpi_gui_kit.rpy。
2. 从已有 label 内调用：

   ```renpy
   call screen renpi_gui_kit_demo
   ```

3. 示例只显示自己的 screen，不替换已有 say、menu 或全局样式。此次交付保留了 .txt 后缀，教程不会自动加载它。
4. 复选框可使用 imagebutton 的 auto 路径；如需“选中且禁用”的单独图像，可按选中值显式选择 insensitive 图像。普通文本按钮的六种背景绑定已包含在示例中。

文字默认色 #FFF4ED；禁用色 #A2A7B6。按钮六状态与对应文字颜色的计算对比度全部大于 4.5:1，最低约 5.32:1。文字由引擎渲染，字体、翻译和字号仍由教程自行设置。

## 验证与边界

- 自动检查：32 个精确尺寸 PNG、真实 alpha、32 个无文字 SVG、状态轮廓一致、九宫格边界有效、六种按钮文字对比度。
- 已查看组件总览以及背景、立绘、对话框和选项的静态叠加预览。
- 使用本机 Ren'Py 8.5.3.26051504，在独立测试工程及 common 副本中完成示例 compile 和 lint --error-code，两项退出码均为 0；没有跳过 lint 检查。
- 记录：validation.json、sdk-validation.json。
- 未接入教程的实际 screen；未进行鼠标、键盘、触屏、缩放和长文本的动态验收。静态叠加图不是游戏运行截图。
- 这是一套核心对话与设置控件，未扩展存档缩略图、音量图标、整套主菜单或更多主题。现有 main_menu.jpg 保留。

## 修改与重新导出

源文件由 build-gui.cjs 生成。该脚本使用本机已有的 sharp；本次没有安装新依赖。修改配色或几何参数后可重新导出

重新执行会覆盖这套工具生成的同名 PNG、SVG 和预览；先另存手工修改。脚本只写入此套组件目录，不改写教程脚本。预览生成依赖旁边已存在的 backgrounds 与 renpi-portraits 素材目录。

SDK 依据：%RENPY_HOME%/doc/displayables.html#Frame、screens.html#imagebutton、style_properties.html#style-property-thumb_offset、style_properties.html#style-property-thumb_align。
