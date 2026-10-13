# ComfyUI 后端

适用：当前任务确实通过已配置的 ComfyUI 制作。模型提示仍读取对应模型资料，本页只负责工作流与执行边界。

1. 沿项目约定检查 `comfy`（comfy-cli）、目标实例和已跑通的 API-format 工作流。这里的 CLI 依赖是 Ren’Pi 已有项目约定，不是其他后端或纯导入任务的前提；命令用当前安装的帮助核实。
2. 从工作流读取实际 checkpoint/模型、编码器、LoRA、输入图、正/负条件、采样与输出节点。核对任务选择的是哪份用途模板，不以图形编辑器 JSON 直接冒充 API 请求。
3. 用当前实例支持的能力信息核对节点类与输入枚举，例如 `/object_info`；检查实际模型文件和自定义节点是否匹配。路径、节点 ID、输入键按模板映射，不猜 `6.text` 或统一 KSampler。
4. 仅填模板开放字段，保留已验证的 sampler、scheduler、steps、CFG、denoise 等；变化确有依据时记录本次改动并重新核对。换 checkpoint 可能连带编码器/采样结构变化，属于配置变更，不是替换模型名字即可完成。
5. 上传/引用图片、提交、查询和取回通过现有工具执行，使用返回的 `prompt_id` 等实际作业标识关联。明确输出节点与文件信息，避免取错预览或其他任务的图。
6. 超时后先核对原作业、队列/历史与已落盘结果；全局 interrupt 可能影响别的任务，只在工具支持精确归属的能力内取消。

同一套 ComfyUI 不意味着同一套提示语法：权重、分段和特殊 token 由实际节点解释；跨模型时保留语义需求并重新编译提示，原配置只在确实兼容时复用。Partner Nodes 可调用外部服务，因此工作流在 ComfyUI 执行不等于模型在本地推理；这类节点还要核对它所封装的供应商能力。[Partner Nodes](https://docs.comfy.org/tutorials/partner-nodes/overview)

官方文档与实例能力核对入口见 [ComfyUI 本地 API 路由](https://docs.comfy.org/development/comfyui-server/comms_routes)；执行时以选定版本和现有工具为准。文档支持接口语义，不证明本机模板已成功出图。
