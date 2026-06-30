# FlowAPI production deploy

## Source of truth

生产运行时的 deploy 信息以服务器 `/var/www/flowapi` 当前 git checkout 为准。

- `commit` / `branch`：优先来自服务器上的 `git rev-parse HEAD` 与 `git branch --show-current`
- env 文件和 `process.env` 仅作为 git 不可用时的回退
- 所有发布脚本都必须先让服务器 git 状态对齐到目标 commit，再启动 PM2

这样 `/api/deploy-info` 与 `/api/health` 才能反映真实运行版本，而不是旧的 deploy env 元数据。

## Canonical paths

### 1. Normal Mac → server deploy

本地有 SSH 时，使用：

```bash
npm run deploy
```

它会：

1. 检查工作区干净，且当前 commit 已经 push 到 `origin/<branch>`
2. 预检 SSH
3. 本地 lint + build
4. rsync 代码与构建产物
5. 在服务器上执行 `git fetch / checkout / reset --hard <commit>`
6. 重启 PM2
7. 验证 local/public deploy-info 与 public health

### 2. No-SSH deploy via Alibaba Cloud Workbench

本地 SSH 不通时，不要继续围绕 SSH / PM2 / nginx 盲排查，直接切换到 Workbench。

先在本地打印可直接粘贴的命令：

```bash
npm run deploy:workbench
```

再把打印出来的整段命令粘贴到阿里云 Workbench 终端执行。

服务器侧真正执行的脚本是：

```bash
bash /var/www/flowapi/scripts/workbench-deploy-flowapi.sh
```

它会：

1. `git fetch / checkout / reset --hard <target>`
2. `npx next build --webpack`
3. `pm2 start node_modules/next/dist/bin/next --cwd ...`
4. 运行统一校验脚本输出 deploy proof

### 3. Restart / repair only

只做修复重启时，使用：

```bash
npm run fix:remote
```

如果 SSH 失败，这个脚本会直接让你转去 Workbench，而不是继续展开无效排查。

### 4. Verify only

只校验当前部署是否已经跑到目标版本时，使用：

```bash
npm run deploy:verify -- <commit> <branch>
```

默认会校验：

- `http://127.0.0.1:3000/api/deploy-info`
- `https://flowapi.fun/api/deploy-info`
- `https://flowapi.fun/api/health`

成功输出固定三段：

```text
== local deploy-info ==
== public deploy-info ==
== public health ==
```

## PM2 standard

所有 FlowAPI 启动命令统一为：

```bash
pm2 start node_modules/next/dist/bin/next --cwd "$APP" --name flowapi -- start -p 3000
```

不要再使用：

```bash
pm2 start npm --name flowapi --cwd "$APP" -- start -- -p 3000
```

后者更容易把运行时上下文与 git 真实状态割裂开，排查时也不直观。

## Failure policy

出现下面任何一种情况时，应立即停止继续“猜环境”，直接收敛：

- SSH 不通
- 服务器 `.git` 不存在
- 目标 commit 还没 push 到远端
- `.next` 缺失，且当前只能通过 Workbench 操作生产机

对应动作：

1. 先 push 目标 commit
2. 用 `npm run deploy:workbench` 打印 Workbench 命令
3. 在 Workbench 上跑标准脚本
4. 以 deploy verifier 输出为唯一验收依据
