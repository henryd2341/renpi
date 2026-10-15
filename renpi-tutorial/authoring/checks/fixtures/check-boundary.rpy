# CHECKS ONLY: explicit boundary, no simulation of jobs, candidates or loaded ACK.
define config.label_overrides = {"renpi_choice": "rp_check_boundary"}

screen rp_check_banner():
    zorder 150
    text "隔离预览，不发送创作请求，非已发布教程" xpos 30 ypos 20 size 22 color "#FFF4ED" outlines [(2, "#151B29", 0, 0)]

init 100 python:
    config.overlay_screens.append("rp_check_banner")

label rp_check_boundary(anchor, choices):
    call screen rp_check_boundary_screen
    return

screen rp_check_boundary_screen():
    modal True
    add Solid("#151B29E8")
    frame:
        xalign 0.5
        yalign 0.5
        xsize 1100
        vbox:
            spacing 28
            text "已到达真实创作选择点的预览边界" size 38 color "#FFC0AC"
            text "隔离预览不会发送请求，也不会模拟生成、采用或加载成功。"
            text "正式教程仍需由公共运行时接入基础文件，再核对真实创作闭环。"
            textbutton "结束隔离预览" id "rp_check_exit" action Return() default_focus True
