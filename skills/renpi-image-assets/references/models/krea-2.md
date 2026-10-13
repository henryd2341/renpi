# Krea 2

查证日期：2026-10-10。Krea 自有 API 分 `krea-2/medium` 与 `krea-2/large`；其他提供商或 ComfyUI 节点须核对自身封装，别复制整份 API 字段。

## 提示起点

用自然语言明确主体、视觉材料、光照与构图。探索可简短，剧情生产则明确硬性内容，减少模型自由补足故事细节。Krea 的 `creativity` 控制提示扩展程度，`raw` 对应不扩展；它不是 CFG。风格参考主要传达视觉语言，不当成人物身份锁。[Krea 2 提示说明](https://www.krea.ai/blog/krea-2-deep-dive-walkthrough)

```text
[Concrete subject and action], [setting and composition], [specific material/style and light].
```

选择与故事一致的画面说明，而非用 `masterpiece`、动漫评分串替代具体视觉要求。需要精确保留角色时先核验实际参考机制。

## 接口边界

Krea 自有接口公开 `prompt`、画幅、分辨率、seed、creativity、风格参考及 moodboard 等字段；Medium/Large 使用不同端点。本次参数表未建立独立 negative、mask 或透明输出的支持证据，按当前工具再核对。[Krea 2 API 发布说明](https://www.krea.ai/blog/krea-2-api-launch)

moodboard 中的排除说明不等于通用 `negative_prompt` 字段。Krea 产品中的其他编辑工具也不自动归为 Krea 2 基础生成能力；任务需要局部编辑时明确实际入口。
