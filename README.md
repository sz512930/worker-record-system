# 工作人员记录表前端

这是工作人员记录表的本机前端页面。它通过真实 HTTP API 读取和保存数据：普通资料进入 PostgreSQL，头像与简历通过 API 保存到私有 RustFS Bucket。前端不保存、不读取、不迁移任何工作人员业务 `localStorage` 数据，也没有离线回退。

## 页面

- `index.html`：新增人员，或使用 `index.html?edit={id}` 编辑已有记录。
- `admin.html`：从 API 查询、筛选、排序、查看详情和删除人员。

## 本机启动

先启动后端（默认 `http://127.0.0.1:3000`），再在本目录运行：

```powershell
node .\scripts\serve-local.mjs
```

浏览器访问 `http://127.0.0.1:5500`。按 `Ctrl+C` 停止静态服务器。静态服务器固定只监听 `127.0.0.1:5500`；不使用 `file://`、公网地址、Tunnel 或远程部署。

## API 配置

唯一的前端 API 地址位于 `config.js`：

```js
window.APP_CONFIG = { API_BASE_URL: "http://127.0.0.1:3000" };
```

日后若 API 地址变化，只修改该文件。请勿在前端文件中放入数据库、S3 或 RustFS 凭据。

## 行为与错误处理

- 列表、筛选和排序使用 `GET /api/staff` 的真实数据库结果；详情与编辑使用 `GET /api/staff/:id`。
- 新增先创建普通资料，再分别上传可选头像与简历；单个文件失败不会撤销已创建的人员，并会在页面提示重新选择后重试。
- 编辑使用 `PUT /api/staff/:id`，只在选择了新文件时上传替换文件。
- 详情中的头像、简历下载都经由后端受控 API，Bucket 保持 Private。
- 后端不可用时，页面会显示清晰错误；不会显示旧浏览器记录或进行任何本地回退。

## 网络范围

前端静态服务为 `127.0.0.1:5500`，后端 API 为 `127.0.0.1:3000`。后端 CORS 仅允许本机 `127.0.0.1` / `localhost` 页面，不使用 `Access-Control-Allow-Origin: *`。本项目未配置 GitHub、Cloudflare Tunnel、公网访问或防火墙例外。
