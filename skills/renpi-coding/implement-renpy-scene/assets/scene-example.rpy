# 参考单元：先按 presentation-recipes.md 映射真实资产与正文，再整合到项目。
# 由已有调用方 call rc_demo_scene from rc_demo_scene_return；这里不创建 start。

define rc_demo_guide = Character("引路人")
define rc_demo_line_01 = "暮色落到站台边缘。"
define rc_demo_line_02 = "下一班车快到了。"
define rc_demo_line_03 = "提示铃响起，她看向轨道尽头。"

image rc_demo_bg station = "images/station_evening.png"
image rc_demo_person neutral = "images/guide_neutral.png"
image rc_demo_person smile = "images/guide_smile.png"

transform rc_demo_background:
    xysize (config.screen_width, config.screen_height)
    fit "cover"

transform rc_demo_portrait:
    xysize (int(config.screen_width * 0.38), int(config.screen_height * 0.9))
    fit "contain"
    xalign 0.65
    yalign 1.0

transform rc_demo_enter:
    alpha 0.0
    linear 0.3 alpha 1.0

screen rc_demo_location():
    frame:
        xalign 0.03
        yalign 0.03
        text "傍晚 · 车站"

label rc_demo_scene:
    scene rc_demo_bg station at rc_demo_background
    with dissolve
    show rc_demo_person neutral at rc_demo_portrait, rc_demo_enter
    show screen rc_demo_location
    play music "audio/station_theme.wav" fadein 0.6 if_changed

    "[rc_demo_line_01]"
    rc_demo_guide "[rc_demo_line_02]"

    play sound "audio/chime.wav"
    show rc_demo_person smile at rc_demo_portrait
    with dissolve
    "[rc_demo_line_03]"

    hide screen rc_demo_location
    stop music fadeout 0.6
    stop sound
    scene
    with dissolve
    return
