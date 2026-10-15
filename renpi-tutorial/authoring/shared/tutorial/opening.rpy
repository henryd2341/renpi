define rp_tutorial_text_001 = "书房的背景亮起，Salome 出现在画面一侧。"
define rp_tutorial_text_002 = "你好，我是 Salome。欢迎来到 Ren’Pi 的小教程，我们先从一段短故事开始。"
define rp_tutorial_text_003 = "Salome 的神情稍有变化，像是准备把话说得更清楚。"
define rp_tutorial_text_004 = "同一间书房，换一句话、一个表情，感觉就不同了。文字、背景和角色可以这样配合，组成一段视觉小说。"
define rp_tutorial_text_005 = "你不需要先学写程序。先把四件事说清楚就好：场景、角色、语气，还有写到哪里停。"
define rp_tutorial_text_006 = "场景，就是故事发生在哪里。比如书房，或者雨夜的街道；一个明确的地点就够开始。"
define rp_tutorial_text_007 = "角色，就是谁在这段故事里出场。比如只让我出场，不必为了开头再添一群人物。"
define rp_tutorial_text_008 = "语气，就是这段故事给人的感觉。温暖一点，还是带一点悬疑，都可以直接说。"
define rp_tutorial_text_009 = "停止点，是把下一次决定留给你的地方。比如：写到需要我选择时停下，不要替我继续。"
define rp_tutorial_text_010 = "先做一个短片段，比一次安排整部长篇更容易核对。读过以后，再决定下一段往哪里走。"
define rp_tutorial_text_011 = "一条可复制的需求，可以这样写："
define rp_tutorial_text_012 = "“请用现有书房背景，只让 Salome 出场，写一段温暖的短故事。用自然的短对话，不替我说话或决定；在下一次需要我选择时停下。”"
define rp_tutorial_text_013 = "这只是需求示例，还没有提交，也不是已经写好的故事。地点和语气可以换，停止点最好保留。"
define rp_tutorial_text_014 = "这次只用现有的书房、雨夜背景和我的立绘，不需要现场生成图片。先把一个小片段做清楚就好。"
define rp_tutorial_text_015 = "接下来走一个小闭环：选方向，等候选，再接入、重载、确认，最后阅读。候选就是待接入的新片段。"
define rp_tutorial_text_016 = "第一次选择尚未制作的方向时，客户端会提交请求。接下来要等真实制作与校验，不能把等待当成故事已经写好。"
define rp_tutorial_text_017 = "请求结果还不明确时，客户端会保留原请求。若需重连，用 Reconnect / resend same request，重发同一请求，不必重新选方向。"
define rp_tutorial_text_018 = "等待多久取决于实际制作，这里没有预先写好的模型结果。若客户端报告错误，要先处理，不能当成成功继续。"
define rp_tutorial_text_019 = "看到 ready，表示候选已就绪，不等于已经发布，更不等于已经进入新故事。后面还有接入和加载确认。"
define rp_tutorial_text_020 = "Adopt candidate，是采用这个候选、开始接入。等客户端显示下一步，再继续，不用凭感觉猜它是否完成。"
define rp_tutorial_text_021 = "接着是 Reload published candidate：重载已发布的候选，让当前运行的脚本加载新内容。重载后还要确认。"
define rp_tutorial_text_022 = "重载后，看到 Confirm reloaded entry，就确认重载后的入口。客户端会检查这次加载，不能跳过它直接算接入成功。"
define rp_tutorial_text_023 = "确认成功后，用 Enter confirmed branch 进入已确认的分支，才开始读这次的新片段。"
define rp_tutorial_text_024 = "如果方向已有发布内容，并且出现 Read existing branch，就可以阅读已有分支；阅读不是重新生成。"
define rp_tutorial_text_025 = "这些按钮会随真实状态出现，不会一起摆出来。按钮还没出现，就先看状态，不用反复选择来催进度。"
define rp_tutorial_text_026 = "如果暂时不继续，可在 Leave this choice 可用时离开。离开这个选择点，不代表已经生成或读完故事。"
define rp_tutorial_text_027 = "这次只会制作接下来选中的方向，另一个先留着。故事也会在下一次需要你决定时停下，不替你选下去。"
define rp_tutorial_text_028 = "开场先停在这里。接下来由你决定：留在书房写一段温暖短故事，还是切到雨夜街道写一段轻悬疑短故事？"

# Integrated from Writing v1; stable text/statement mapping.
label rp_tutorial_opening:
    scene bg study
    show salome neutral at rp_tutorial_salome
    with Dissolve(0.25)
    "[rp_tutorial_text_001]"
    salome "[rp_tutorial_text_002]"
    show salome explain
    with Dissolve(0.15)
    "[rp_tutorial_text_003]"
    salome "[rp_tutorial_text_004]"
    salome "[rp_tutorial_text_005]"
    salome "[rp_tutorial_text_006]"
    salome "[rp_tutorial_text_007]"
    salome "[rp_tutorial_text_008]"
    salome "[rp_tutorial_text_009]"
    salome "[rp_tutorial_text_010]"
    show salome thinking
    with Dissolve(0.15)
    salome "[rp_tutorial_text_011]"
    salome "[rp_tutorial_text_012]"
    salome "[rp_tutorial_text_013]"
    salome "[rp_tutorial_text_014]"
    show salome explain
    with Dissolve(0.15)
    salome "[rp_tutorial_text_015]"
    salome "[rp_tutorial_text_016]"
    salome "[rp_tutorial_text_017]"
    salome "[rp_tutorial_text_018]"
    salome "[rp_tutorial_text_019]"
    salome "[rp_tutorial_text_020]"
    salome "[rp_tutorial_text_021]"
    salome "[rp_tutorial_text_022]"
    salome "[rp_tutorial_text_023]"
    salome "[rp_tutorial_text_024]"
    salome "[rp_tutorial_text_025]"
    salome "[rp_tutorial_text_026]"
    show salome encourage
    with Dissolve(0.15)
    salome "[rp_tutorial_text_027]"
    salome "[rp_tutorial_text_028]"
    call renpi_choice("tutorial.first_story", [("study_warm", "留在书房，写一段温暖的短故事"), ("rain_mystery", "切到雨夜街道，写一段轻悬疑的短故事")]) from rp_tutorial_first_story_call
    hide salome
    with Dissolve(0.2)
    scene black
    return
