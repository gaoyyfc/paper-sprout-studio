# 纸芽部署说明

## 运行结构

- 网页入口：Nginx 监听 `3000`
- Node API 与 Remotion 渲染服务：监听本机 `9000`
- Node 依赖：使用项目锁定的 `pnpm@11.19.0`
- Python 部署工具：使用 `deploy/pyproject.toml` 与 `deploy/uv.lock`，由 uv 管理

## Ubuntu 部署

1. 安装 Node.js 22、pnpm 11、Nginx、Google Chrome、FFmpeg 与 uv。
2. 解压本 ZIP 到 `/home/paper-sprout-studio`。
3. 将 `.env.example` 复制为 `.env.local`，填写真实密钥，并执行：

   ```bash
   chmod 600 /home/paper-sprout-studio/.env.local
   ```

4. 安装依赖并构建：

   ```bash
   cd /home/paper-sprout-studio
   pnpm install --frozen-lockfile
   pnpm build
   ```

5. 安装服务配置：

   ```bash
   cp deploy/paper-sprout-api.service /etc/systemd/system/
   cp deploy/paper-sprout.nginx.conf /etc/nginx/sites-available/paper-sprout
   ln -sfn /etc/nginx/sites-available/paper-sprout /etc/nginx/sites-enabled/paper-sprout
   systemctl daemon-reload
   systemctl enable --now paper-sprout-api
   nginx -t
   systemctl reload nginx
   ```

6. 验证：

   ```bash
   curl http://127.0.0.1:9000/api/health
   curl -I http://127.0.0.1:3000/
   ```

公网访问地址为 `http://服务器IP:3000/`。

