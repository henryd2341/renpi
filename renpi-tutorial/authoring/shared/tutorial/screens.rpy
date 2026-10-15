# Project-owned presentation only. The bundled bridge remains unchanged.
screen main_menu():
    tag menu
    add "bg study"
    add "salome neutral" at rp_tutorial_salome
    frame:
        xpos 990
        ypos 200
        xsize 820
        ysize 660
        padding (70, 70)
        vbox:
            spacing 24
            text "Ren’Pi 使用教程" size 56 bold True
            text "和 Salome 一起，把想法变成故事" size 30 color "#FFC0AC"
            text "一次真实创作闭环，无需先学代码" size 26
            null height 24
            textbutton "开始体验" id "rp_start" style "rp_tutorial_main_button" action Start() default_focus True
            textbutton "退出" style "rp_tutorial_main_button" action Quit(confirm=False)
            text "约 3–5 分钟引导，不含模型生成等待。" size 23 color "#B8BECE"

screen say(who, what):
    window:
        id "window"
        # Pixel positions use a top-left anchor, not window's inherited bottom-center.
        anchor (0.0, 0.0)
        xpos 96
        ypos 764
        xsize 1728
        ysize 288
        padding (0, 0)
        background Frame("gui/renpi/textbox.png", 160, 40, 48, 40)
        if who:
            window:
                id "namebox"
                anchor (0.0, 0.0)
                xpos 48
                ypos -44
                xsize 320
                ysize 72
                padding (40, 12, 32, 12)
                background Frame("gui/renpi/namebox.png", 32, 24, 32, 24)
                text who id "who" size 30 bold True
        text what:
            id "what"
            xpos 56
            ypos 62
            xsize 1600
            ysize 172
            size 34
            line_spacing 8
        add "gui/renpi/continue.png" xpos 1660 ypos 230
    hbox:
        xpos 140
        ypos 1009
        spacing 16
        textbutton "回退" style "rp_tutorial_quick_button" action Rollback()
        textbutton "回看" id "rp_history" style "rp_tutorial_quick_button" action ShowMenu("rp_tutorial_history")
        textbutton "文字设置" id "rp_preferences" style "rp_tutorial_quick_button" action ShowMenu("rp_tutorial_preferences")
        textbutton "自动" style "rp_tutorial_quick_button" action Preference("auto-forward", "toggle")
        textbutton "快进" style "rp_tutorial_quick_button" action Skip()

screen rp_tutorial_preferences():
    tag menu
    modal True
    add Solid("#151B29F0")
    frame:
        xalign 0.5
        yalign 0.5
        xsize 1000
        ysize 760
        padding (70, 60)
        vbox:
            spacing 28
            text "阅读设置" size 44 color "#FFC0AC"
            text "文字速度（字符/秒）" size 30
            bar id "rp_speed" value Preference("text speed") style "rp_tutorial_speed_bar"
            hbox:
                spacing 20
                textbutton "即时显示" id "rp_instant" action Preference("text speed", 0)
                textbutton "舒适速度" id "rp_comfort" action Preference("text speed", 35)
            text "渐显时点击可先补全文字，再点击继续。" size 26
            hbox:
                spacing 20
                textbutton "转场开启" action Preference("transitions", "all")
                textbutton "减少转场" action Preference("transitions", "none")
            text "Esc 返回阅读；偏好由 Ren’Py 保存。" size 25 color "#B8BECE"
            hbox:
                spacing 20
                textbutton "返回" id "rp_preferences_return" action Return() default_focus True
                textbutton "返回主菜单" action MainMenu(confirm=False)
    key "game_menu" action Return()

screen rp_tutorial_history():
    tag menu
    modal True
    add Solid("#151B29F0")
    frame:
        xalign 0.5
        yalign 0.5
        xsize 1500
        ysize 940
        vbox:
            spacing 20
            text "回看" size 44 color "#FFC0AC"
            viewport:
                id "rp_history_viewport"
                ysize 720
                scrollbars "vertical"
                mousewheel True
                draggable True
                pagekeys True
                vbox:
                    spacing 24
                    if not _history_list:
                        text "还没有阅读记录。"
                    for h in _history_list:
                        if h.who:
                            text h.who size 28 color "#FFC0AC" substitute False
                        text h.what size 28 substitute False xmaximum 1340
            textbutton "返回" id "rp_history_return" action Return() default_focus True
    key "game_menu" action Return()

# Native confirmation fallback for engine-level dialogs; no bridge action logic.
screen confirm(message, yes_action, no_action):
    modal True
    zorder 200
    add Solid("#151B29D0")
    frame:
        xalign 0.5
        yalign 0.5
        xmaximum 1100
        vbox:
            spacing 24
            text message substitute False
            hbox:
                spacing 24
                textbutton "确认" action yes_action
                textbutton "返回" action no_action default_focus True
    key "game_menu" action no_action
