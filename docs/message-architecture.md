# 消息架构文档

## 概述

本文档描述 OpenCodeUI 的消息系统架构，包括消息的数据结构、渲染流程、合并机制和 Turn 级别的数据管理。

---

## 核心概念

### 1. Message（消息）

消息是对话的基本单位，包含元信息和内容部分。

```typescript
interface Message {
  info: MessageInfo           // 元信息（角色、时间、ID 等）
  parts: Part[]              // 内容部分数组
  isStreaming?: boolean      // 是否正在流式传输
}
```

**角色类型：**
- `user`: 用户消息
- `assistant`: AI 助手消息

### 2. Part（内容部分）

Part 是消息内容的最小单元，一条消息可包含多个不同类型的 Part。

**主要 Part 类型：**

| 类型 | 说明 | 示例 |
|------|------|------|
| `text` | 文本内容 | AI 的回复文本 |
| `reasoning` | 思考过程 | AI 的推理内容 |
| `tool` | 工具调用 | 文件编辑、命令执行 |
| `file` | 文件附件 | 用户上传的文件 |
| `agent` | Agent 引用 | 子 Agent 调用 |
| `step-finish` | 步骤完成标记 | Token 统计、耗时 |
| `subtask` | 子任务 | 复杂任务分解 |

**基础设施 Part（不直接渲染）：**
- `step-start`: 步骤开始标记
- `snapshot`: 状态快照
- `patch`: 增量更新

### 3. Turn（回合）

Turn 是对话的逻辑单元，由一条用户消息和后续所有 assistant 消息组成。

**结构：**
```
Turn = User Message + Assistant Message(s)
```

**示例：**
```
Turn 1:
  - User: "帮我修改这个文件"
  - Assistant (thinking): [推理过程]
  - Assistant (tools): [文件编辑工具调用]
  - Assistant (response): "已完成修改"

Turn 2:
  - User: "再优化一下"
  - Assistant: ...
```

**Turn 级别的数据：**
- `turnDuration`: 回合总耗时（user.created → 最后一条 assistant.completed）
- `turnToolParts`: 回合内所有 tool parts（用于文件改动汇总）

这些数据仅在回合的**最后一条 assistant 消息**上标记。

---

## 消息合并机制

### mergeConsecutiveToolMessages

为优化显示，连续的工具调用 assistant 消息会被合并为一条。

**合并规则：**

1. **Anchor（锚点）**: 以 tool 结尾的 assistant 消息
2. **中间消息**: 纯工具后续消息（`isToolOnlyFollowUp`）全部吸收
3. **尾部消息**: 没有可见 thinking、正文只在 tool 之后的消息（`isMergeableTrailing`）也可吸收

**示例：**

合并前：
```
Message 1: [tool1, tool2]
Message 2: [tool3]           ← 纯工具
Message 3: [tool4, text]     ← 尾部（tool + text）
```

合并后：
```
Message 1: [tool1, tool2, tool3, tool4, text]
```

**不合并的情况：**
- 出现新的 thinking（新思考周期）
- 正文出现在 tool 之前（如 `[text, tool]`）

---

## 渲染流程

### 1. ChatArea（聊天区域）

**职责：**
- 虚拟滚动渲染（Virtuoso）
- 消息合并（`mergeConsecutiveToolMessages`）
- Turn 级别数据计算（`turnDurationMap`、`turnToolPartsMap`）
- 滚动状态管理

**关键逻辑：**

```typescript
// 1. 过滤空消息 + 合并连续工具消息
const visibleMessages = useMemo(
  () => mergeConsecutiveToolMessages(messages.filter(messageHasContent)),
  [messages]
)

// 2. 计算 Turn 级别数据
const turnDurationMap = useMemo(() => {
  // 找到每个 Turn 的最后一条 assistant，标记总耗时
}, [visibleMessages])

const turnToolPartsMap = useMemo(() => {
  // 收集每个 Turn 的所有 tool parts，挂在最后一条 assistant 上
}, [visibleMessages])

// 3. 渲染消息
<MessageRenderer
  message={msg}
  turnDuration={turnDurationMap.get(msg.info.id)}
  turnToolParts={turnToolPartsMap.get(msg.info.id)}
/>
```

### 2. MessageRenderer（消息渲染器）

**职责：**
- 根据角色分发到 `UserMessageView` 或 `AssistantMessageView`
- 透传 Turn 级别数据

### 3. AssistantMessageView

**职责：**
- 渲染 assistant 消息的所有 parts
- 分组渲染连续的 tool parts（`ToolGroup`）
- 在消息末尾显示 `FileChangeSummary`（仅当 `turnToolParts` 存在时）
- 显示 Footer（时间、Token、复制按钮）

**渲染顺序：**
```
1. Parts 渲染（text、reasoning、tool、subtask 等）
2. Message-level error（如果有）
3. FileChangeSummary（仅回合最后一条消息）
4. Footer（时间、统计、复制）
```

### 4. ToolPartView（工具调用视图）

**职责：**
- 渲染单个工具调用
- 支持 compact 和 timeline 两种布局
- 根据工具类型选择渲染器（通过 `registry.tsx`）

**工具渲染流程：**
```typescript
1. extractToolData(part)  // 提取标准化数据
2. getToolConfig(toolName) // 获取工具配置
3. 选择渲染器：
   - 自定义渲染器（如 BashRenderer、TaskRenderer）
   - DefaultRenderer（处理 input/output/diff）
```

### 5. FileChangeSummary（文件改动汇总）

**职责：**
- 汇总回合内所有文件改动
- 三层展示：汇总栏 → 文件列表 → Diff 详情

**数据来源：**
```typescript
// 从 turnToolParts 中提取
function extractFileChanges(toolParts: ToolPart[]): FileChange[] {
  // 1. 筛选 write/edit 类工具
  // 2. 调用 extractToolData() 获取 diff 和 diffStats
  // 3. 同一文件多次编辑会合并（additions/deletions 累加）
}
```

**UI 结构：**
```
已修改 N 个文件 ||||  ← 汇总栏（竖线图表）
  ├─ file1.ts  +10 -5  ← 文件列表
  │   └─ [Diff 内容]   ← 展开后显示
  └─ file2.ts  +3 -2
```

---

## 关键文件路径

| 文件 | 职责 |
|------|------|
| `/src/types/message.ts` | 消息类型定义 |
| `/src/features/chat/ChatArea.tsx` | 聊天区域、消息合并、Turn 数据计算 |
| `/src/features/message/MessageRenderer.tsx` | 消息渲染入口 |
| `/src/features/message/parts/ToolPartView.tsx` | 工具调用渲染 |
| `/src/features/message/parts/FileChangeSummary.tsx` | 文件改动汇总 |
| `/src/features/message/tools/registry.tsx` | 工具注册表、数据提取器 |
| `/src/features/message/tools/types.ts` | 工具相关类型 |
| `/src/components/ContentBlock.tsx` | 通用内容容器（代码/Diff） |
| `/src/components/DiffViewer.tsx` | Diff 渲染核心 |

---

## 数据流

```
API/Store
  ↓
messages: Message[]
  ↓
ChatArea.tsx
  ├─ mergeConsecutiveToolMessages()  // 合并连续工具消息
  ├─ turnDurationMap                 // 计算回合耗时
  └─ turnToolPartsMap                // 收集回合 tool parts
      ↓
MessageRenderer
  ├─ UserMessageView
  └─ AssistantMessageView
      ├─ groupPartsForRender()       // 分组渲染
      ├─ ToolPartView
      │   └─ extractToolData()       // 提取工具数据
      │       └─ DefaultRenderer / BashRenderer / ...
      ├─ TextPartView / ReasoningPartView / ...
      └─ FileChangeSummary           // 仅最后一条消息
          └─ extractFileChanges()    // 从 turnToolParts 提取
```

---

## 最佳实践

1. **添加新 Part 类型**：在 `message.ts` 定义类型，在 `MessageRenderer.tsx` 添加渲染逻辑
2. **添加新工具渲染器**：在 `tools/registry.tsx` 注册，在 `tools/renderers/` 实现
3. **Turn 级别数据**：在 `ChatArea.tsx` 计算，通过 props 传递给最后一条消息
4. **消息合并**：修改 `mergeConsecutiveToolMessages` 的合并规则需谨慎，会影响显示逻辑

---

## 常见问题

**Q: 为什么有些消息会被合并？**  
A: 连续的工具调用消息会被合并以优化显示，避免界面过于分散。

**Q: FileChangeSummary 为什么只在最后显示？**  
A: 它汇总整个 Turn 的文件改动，只在回合结束时显示一次，避免重复。

**Q: 如何判断一条消息是否是 Turn 的最后一条？**  
A: 检查 `turnDurationMap` 或 `turnToolPartsMap` 是否有该消息 ID 的数据。

**Q: 消息的 parts 数组为空怎么办？**  
A: `messageHasContent()` 会过滤掉空消息，但有错误的消息会保留以显示错误信息。

