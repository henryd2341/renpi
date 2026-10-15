# Initialization foundation; not a generated-branch output.
define config.name = "Ren’Pi 使用教程"
define config.version = "0.1.0"
define config.screen_width = 1920
define config.screen_height = 1080
define config.window_title = "Ren’Pi 使用教程 — Salome"
define config.save_directory = "renpi-tutorial"
define config.history_length = 120
define _game_menu_screen = "rp_tutorial_preferences"
define config.check_conflicting_properties = True
default preferences.text_cps = 35

define salome = Character("Salome", image="salome")

image bg study = Transform("images/bg-study-day.png", xysize=(1920, 1080), fit="cover")
image bg rain = Transform("images/bg-city-rain-night.png", xysize=(1920, 1080), fit="cover")
image salome neutral = "images/salome neutral.png"
image salome explain = "images/salome explain.png"
image salome thinking = "images/salome thinking.png"
image salome encourage = "images/salome encourage.png"
image salome puzzled = "images/salome puzzled.png"
image salome surprised = "images/salome surprised.png"

transform rp_tutorial_salome:
    zoom 0.9
    xpos 60
    ypos 0
    anchor (0.0, 0.0)

# User-supplied Noto Serif SC, preserved unchanged; metadata/license recorded.
# No proprietary Windows system font is copied into the project.
style default:
    font "fonts/NotoSerifSC-Regular.ttf"
    size 28
    color "#FFF4ED"
    language "unicode"

# These native styles skin the bundled choice screen without copying its logic.
style frame:
    background Frame("gui/renpi/panel.png", 136, 32, 40, 48)
    padding (40, 40)

style button:
    background Frame("gui/renpi/button_idle.png", 40, 24, 48, 24)
    hover_background Frame("gui/renpi/button_hover.png", 40, 24, 48, 24)
    selected_idle_background Frame("gui/renpi/button_selected_idle.png", 40, 24, 48, 24)
    selected_hover_background Frame("gui/renpi/button_selected_hover.png", 40, 24, 48, 24)
    insensitive_background Frame("gui/renpi/button_insensitive.png", 40, 24, 48, 24)
    selected_insensitive_background Frame("gui/renpi/button_selected_insensitive.png", 40, 24, 48, 24)
    padding (36, 14)
    xmaximum 900
    yminimum 64

style button_text:
    size 26
    color "#FFF4ED"
    hover_color "#FFFFFF"
    insensitive_color "#A2A7B6"

style rp_tutorial_main_button is button:
    xsize 640
    ysize 80

style rp_tutorial_main_button_text is button_text:
    size 32
    xalign 0.5
    yalign 0.5

style rp_tutorial_quick_button is button:
    background None
    hover_background None
    selected_background None
    insensitive_background None
    padding (12, 4)
    yminimum 36

style rp_tutorial_quick_button_text is button_text:
    size 22
    color "#D3CDDD"
    hover_color "#FFC0AC"

style rp_tutorial_speed_bar is bar:
    xsize 600
    ysize 48
    left_bar Frame("gui/renpi/slider_left.png", 8, 0, 8, 0)
    right_bar Frame("gui/renpi/slider_right.png", 8, 0, 8, 0)
    thumb "gui/renpi/slider_thumb_idle.png"
    hover_thumb "gui/renpi/slider_thumb_hover.png"
    thumb_offset 32
    thumb_align 0.5
    bar_vertical False
    bar_invert False

label start:
    call rp_tutorial_opening from rp_tutorial_opening_call
    return
