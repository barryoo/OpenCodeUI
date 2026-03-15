# 开发工作流

## 1. 需求澄清（必须先做）

收到需求后，**不要立即开始开发**。先向用户提问，澄清以下内容：
- 功能的具体行为和边界
- UI/交互细节（如有）
- 影响范围（哪些模块/组件）

**得到用户明确确认后**，才进入下一步。

---

## 2. 开发（使用 git worktree 隔离）

```bash
# 基于 master 创建 worktree，分支名用功能描述
git worktree add ../OpenCodeUI-feat/<feature-name> -b feat/<feature-name>
```

在 worktree 中完成开发，确保：
- `bun run build` 编译通过，无 TypeScript 错误
- `npm run lint` 无报错

---

## 3. 预览（交给用户验收）

编译通过后，在 worktree 目录启动 dev server：

```bash
# 指定端口避免与主分支冲突
npx vite --port 5174
```

将本地访问地址（如 `http://localhost:5174`）告知用户，**等待用户确认**。

---

## 4. 提交与合并（必须用户主动触发）

**以下情况才能提交代码：**
- 用户明确说"可以提交"/"提交代码"
- 用户说"本次需求完成"

**提交流程：**

```bash
# 1. 提交代码
git add .
git commit -m "<type>: <简短描述>"
git push origin feat/<feature-name>

# 2. 关闭 dev 服务（Ctrl+C 或 kill 进程）

# 3. 切换到 master 并验证构建
cd /Users/chen/workspace/OpenCodeUI
git checkout master
bun run build
```

**合并到主干**：仅在用户明确要求后执行：

```bash
git merge feat/<feature-name>
git worktree remove ../OpenCodeUI-feat/<feature-name>
```

---

## 规则总结

| 阶段 | 触发条件 | 禁止行为 |
|------|---------|---------|
| 澄清 | 收到任何需求 | 未确认就开发 |
| 开发 | 用户确认需求后 | 在主分支直接改代码 |
| 预览 | 编译通过后 | 未验收就提交 |
| 提交 | 用户主动要求 | 自动提交 |
| 合并 | 用户明确要求合并 | 自动合并主干 |
