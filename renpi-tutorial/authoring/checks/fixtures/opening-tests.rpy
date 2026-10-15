# CHECKS ONLY: actual engine UI interactions, never a real production choice.
define _test.timeout = 15.0

testcase opening_ui:
    assert screen "main_menu"
    pause 0.5
    screenshot "main-menu.png"
    keysym "K_TAB"
    screenshot "main-menu-focus.png"
    click id "rp_start"
    advance until "你好，我是 Salome"
    pause 0.2
    screenshot "salome-typing.png"
    pause 4.0
    screenshot "salome-intro.png"
    click id "rp_preferences"
    assert screen "rp_tutorial_preferences"
    screenshot "preferences.png"
    click id "rp_instant"
    assert eval preferences.text_cps == 0
    click id "rp_preferences_return"
    assert screen "say"
    click id "rp_history"
    assert screen "rp_tutorial_history"
    screenshot "history.png"
    click id "rp_history_return"
    advance until "同一间书房"
    screenshot "salome-explain.png"
    advance until "请用现有书房背景"
    screenshot "long-example.png"
    advance until "重载后，看到 Confirm reloaded entry"
    screenshot "client-instructions.png"
    advance until "开场先停在这里"
    screenshot "last-say.png"
    advance until screen "rp_check_boundary_screen"
    screenshot "isolated-boundary.png"
    assert eval renpi_branch_id is None
    assert eval renpi_bridge.client is None
    click id "rp_check_exit"
    assert screen "main_menu"
    click id "rp_start"
    advance until "你好，我是 Salome"
    screenshot "repeat-entry.png"
    click id "rp_preferences"
    assert eval preferences.text_cps == 0
    click id "rp_comfort"
    assert eval preferences.text_cps == 35
    click id "rp_preferences_return"
    advance until "同一间书房"
    run Rollback()
    pause 0.5
    screenshot "rollback.png"
    run MainMenu(confirm=False)
    assert screen "main_menu"
