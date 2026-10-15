# Lint-only geometry regression. Do not copy into the runtime game.
init python:
    def rp_check_say_layout():
        import json
        import os
        from renpy.display.displayable import place
        from renpy.display.screen import ScreenDisplayable, get_screen_variant

        cases = []
        for who, character in [(None, narrator), ("Salome", salome)]:
            props = renpy.character.compute_widget_properties(
                character.who_args, character.what_args, character.window_args,
                character.properties)
            screen = ScreenDisplayable(get_screen_variant("say"), None, None,
                widget_properties=props,
                scope={"_args": (), "_kwargs": {"who": who, "what": "你好，我是 Salome。"}})
            screen.update()
            window = screen.widgets["window"]
            what = screen.widgets["what"]
            size = (window.style.xminimum, window.style.yminimum)
            origin = place(config.screen_width, config.screen_height, *size, window.get_placement())
            text_origin = place(*size, 1600, 172, what.get_placement())
            case = {"who": who, "window_origin": origin, "window_size": size,
                "window_anchor": window.get_placement()[2:4],
                "text_origin": (origin[0] + text_origin[0], origin[1] + text_origin[1])}
            if who:
                namebox = screen.widgets["namebox"]
                local = place(*size, 320, 72, namebox.get_placement())
                case["namebox_origin"] = (origin[0] + local[0], origin[1] + local[1])
                case["namebox_anchor"] = namebox.get_placement()[2:4]
            cases.append(case)
        with open(os.path.join(config.basedir, "say-layout.json"), "w", encoding="utf-8") as report:
            json.dump({"gui_started": False, "cases": cases}, report, ensure_ascii=False, indent=2)
        for case in cases:
            assert case["window_origin"] == (96, 764), case
            assert case["window_size"] == (1728, 288), case
            assert case["text_origin"] == (152, 826), case
            if case["who"]:
                assert case["namebox_origin"] == (144, 720), case

    config.lint_hooks.append(rp_check_say_layout)
