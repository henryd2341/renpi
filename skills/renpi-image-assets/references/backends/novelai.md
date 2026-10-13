# NovelAI 后端

适用：任务选用 NovelAI 自有图像服务或明确兼容的现有工具。与 [NovelAI 模型资料](../models/novelai.md) 配合读取，服务名称不代替具体模型版本。

## 提交前核对

1. 读取当前工具模型列表、实际账号可用项和请求结构，记录实际 model ID、动作与质量/UC 设置；展示名到 API ID 的映射来自现有工具或官方依据，不猜字符串。
2. 本次查证的官方请求包含 `input`、`model`、`action`、`parameters`，参数中有 `negative_prompt` 及版本化的角色/参考字段。schema 中出现某字段不证明所有模型支持它；按当前模型映射，仅提交真实支持项。[官方 OpenAPI](https://image.novelai.net/docs/doc.json)
3. 已有认证沿宿主安全配置使用，凭据不进入提示和交付文档；不为技能制作读取账号 token。实际调用经已配置工具，文档 URL 不是新增适配器或直接调用的授权。

## 正面、角色与排除内容

普通场景信息放基础提示，角色特征进入实际角色槽。多角色位置与负面角色槽按当前接口处理，提示中的一行文字或姓名分隔不等于工具已建立角色隔离。

NovelAI 的强调语法属于本后端输入处理：`{}` 增强、`[]` 减弱；数值强调及负权重有版本门槛。不要机械翻译 ComfyUI 括号权重，遇到字面括号按此处实际解析规则处理。[强调文档](https://docs.novelai.net/en/image/strengthening-weakening/)

记录质量开关与 Undesired Content preset。自动补词已启用时避免手动重复插入同串质量词；需要图中文字时检查排除项是否与之冲突。质量与 UC 按所选模型版本读取。[质量开关](https://docs.novelai.net/en/image/qualitytags/)、[UC](https://docs.novelai.net/en/image/undesiredcontent/)

## 参考图与输出

精确参考、风格迁移、img2img 和局部重绘是不同用途；只传当前版本支持的字段，不将 Vibe Transfer 当成角色身份锁。参考兼容性也随模型变化，V5 尤其先核对实际开放状态。

结果按工具实际返回的文件/响应取回，返回压缩包时核对解码后的图像与用途；无异步任务机制就不伪造 job ID 或轮询接口。未知提交状态按通用制作规则处理。

查证日期：2026-10-10。当前官方 schema 未给出完整模型 ID 枚举；执行时从已配置模型与版本文档落实。
