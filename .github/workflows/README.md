# GitHub Actions for MCPC Core

这个目录包含为 MCPC Core 项目配置的 GitHub Actions 工作流。

## 工作流文件

### 1. `simple-test.yml` - 基础测试工作流
**推荐使用** - 简洁、可靠的测试工作流

- **触发条件**: 推送到 `main`/`develop` 分支，PR 到 `main` 分支
- **测试矩阵**: 
  - Deno 版本: `2.4.x`, `2.x` (最新)
  - 操作系统: Ubuntu, macOS, Windows
- **功能**:
  - ✅ 代码格式检查 (`deno fmt`)
  - ✅ 代码质量检查 (`deno lint`)
  - ✅ 类型检查 (`deno check`)
  - ✅ 运行所有测试 (`deno task test`)
  - ✅ 生成测试覆盖率报告
  - ✅ 安全检查（依赖分析）

### 2. `deno-test.yml` - 完整测试工作流
高级功能的完整测试套件

- **触发条件**: 
  - 推送到任何分支
  - PR 到 `main`/`develop` 分支
  - 手动触发（支持选择测试类型）
- **功能**:
  - 🔄 多版本 Deno 测试矩阵
  - 📊 详细的覆盖率报告
  - ⚡ 性能测试
  - 🔒 安全审计
  - 📦 发布检查
  - 🚀 并发控制

### 3. `test.yml` - 传统测试工作流
包含基准测试和多任务的扩展版本

## 推荐配置

### 主要工作流
建议使用 **`simple-test.yml`** 作为主要的 CI/CD 工作流，因为它：
- 快速执行（通常 < 5 分钟）
- 覆盖所有必要的检查
- 在多个平台上测试
- 使用最新的 Deno 版本

### 高级需求
如果需要更详细的测试和报告，可以使用 **`deno-test.yml`**。

## Deno 设置详情

### 版本策略
- **`2.x`**: 使用 Deno 2.x 系列的最新版本
- **`2.4.x`**: 使用 Deno 2.4.x 系列的最新补丁版本

### 依赖缓存
工作流使用 GitHub Actions 缓存来加速构建：
```yaml
- name: Cache Dependencies
  uses: actions/cache@v4
  with:
    path: ~/.cache/deno
    key: deno-${{ runner.os }}-${{ matrix.deno-version }}-${{ hashFiles('packages/core/deno.lock') }}
```

### 权限设置
测试只需要最小权限：
- `--allow-env`: 用于环境变量测试
- `--allow-read`: 用于读取测试文件

## 本地验证

在推送代码前，可以本地运行相同的检查：

```bash
# 进入 core 包目录
cd packages/core

# 格式检查
deno fmt --check

# 代码质量检查
deno lint

# 类型检查
deno check mod.ts

# 运行测试
deno task test

# 生成覆盖率
deno test --allow-env --allow-read --coverage=coverage tests/
deno coverage coverage --lcov --output=coverage.lcov
```

## 状态徽章

可以在 README 中添加状态徽章：

```markdown
[![Tests](https://github.com/mcpc-tech/mcpc/workflows/MCPC%20Core%20-%20Deno%20Tests/badge.svg)](https://github.com/mcpc-tech/mcpc/actions)
[![Coverage](https://codecov.io/gh/mcpc-tech/mcpc/branch/main/graph/badge.svg)](https://codecov.io/gh/mcpc-tech/mcpc)
```

## 故障排除

### 常见问题

1. **依赖缓存失败**
   - 删除 `deno.lock` 文件并重新生成
   - 检查 `deno.json` 中的导入路径

2. **权限错误**
   - 确保测试只使用 `--allow-env` 和 `--allow-read`
   - 避免在测试中访问网络或文件系统

3. **格式检查失败**
   - 运行 `deno fmt` 自动修复格式问题

4. **类型检查失败**
   - 检查导入路径和类型定义
   - 确保所有依赖都在 `deno.json` 中正确声明

### 调试技巧

- 使用 `continue-on-error: true` 让非关键步骤失败时不中断工作流
- 添加 `timeout-minutes` 防止作业挂起
- 使用矩阵策略在多个环境中测试

## 维护

### 更新 Deno 版本
定期更新工作流中的 Deno 版本：
1. 检查 [Deno 发布页面](https://github.com/denoland/deno/releases)
2. 更新 `deno-version` 在工作流文件中
3. 测试新版本的兼容性

### Actions 版本更新
定期更新 GitHub Actions 版本：
- `actions/checkout@v4` → 检查最新版本
- `denoland/setup-deno@v2` → 检查最新版本
- `actions/cache@v4` → 检查最新版本
