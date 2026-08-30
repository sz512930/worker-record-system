# 工作人员记录表：第二阶段数据设计

> 文档状态：V1 设计稿  
> 当前阶段：只做数据与接口设计，不执行数据库、MinIO、Node.js、前端或部署变更。  
> 依据：当前项目中的 `index.html`、`admin.html`、`app.js`、`admin.js`、`README.md` 实际代码。

## 1. 项目定位与设计原则

本项目用于验证下面这条最小技术链路：

```text
GitHub Pages 前端
        ↓
Node.js API
        ↓
┌──────────────┬──────────────┐
↓              ↓
PostgreSQL     MinIO
人员数据       头像 / 简历
```

V1 只需要支持工作人员的新增、列表查询、详情读取、普通字段修改、文件上传或替换、文件删除、工作人员删除。设计优先保持简单：

- PostgreSQL 只使用一张主要业务表 `staff`。
- 部门、级别直接保存为字符串，不拆字典表。
- 技能直接保存为 PostgreSQL `TEXT[]`，与当前 JavaScript 字符串数组一一对应。
- 每位工作人员最多关联一个头像和一个简历。
- PostgreSQL 保存结构化数据和 MinIO Object Key；文件二进制只进入 MinIO。
- 暂不设计认证、权限、审计、软删除、文件版本、消息队列等完整生产能力。

## 2. 当前前端实际数据结构

### 2.1 localStorage

当前工作人员数组保存在：

```text
workerRecordSystem.staff.v1
```

是否已经初始化演示数据保存在：

```text
workerRecordSystem.seeded.v1
```

单条记录的实际结构为：

```js
{
  id: "demo-001",
  name: "林晓雨",
  gender: "女",
  age: 27,
  phone: "138 0000 2716",
  city: "成都",
  department: "运营",
  position: "内容运营专员",
  level: "中级",
  joinDate: "2025-07-14",
  introduction: "负责内容策划与渠道运营……",
  skills: ["内容运营", "数据分析", "剪辑"],
  avatar: "data:image/jpeg;base64,...",
  avatarFileName: "avatar.png",
  resume: {
    name: "林晓雨-个人简历.pdf",
    type: "application/pdf",
    size: 246800
  },
  createdAt: "2026-08-08T09:30:00.000Z",
  updatedAt: "2026-08-08T09:30:00.000Z"
}
```

`resume` 在没有选择简历时为 `null`。`phone`、`introduction`、`skills`、头像和简历均可为空。

### 2.2 表单字段与约束

| 前端字段 | 实际用途 | 当前是否必填 | 当前前端限制 |
|---|---|---:|---|
| `recordId` | 编辑时保存当前记录 ID；最终写入对象的字段名是 `id` | 系统字段 | 隐藏字段 |
| `name` | 姓名 | 是 | 最长 30 字符 |
| `gender` | 性别 | 是 | `男`、`女` |
| `age` | 年龄 | 是 | 16–100 |
| `phone` | 联系电话 | 否 | 最长 30 字符 |
| `city` | 所在城市 | 是 | 最长 50 字符 |
| `department` | 部门 | 是 | 行政、运营、销售、技术、设计、其他 |
| `position` | 职位 | 是 | 最长 50 字符 |
| `level` | 级别 | 是 | 实习、初级、中级、高级、负责人 |
| `joinDate` | 入职时间 | 是 | HTML 日期值 `YYYY-MM-DD` |
| `introduction` | 个人简介 | 否 | 最长 600 字符 |
| `skills` | 技能标签输入 | 否 | 输入最长 150 字符；按中文逗号、英文逗号或顿号切分成数组 |
| `avatar` | 头像文件 | 否 | 输入框接受 JPEG、PNG、WebP；页面提示建议小于 2MB，JavaScript 硬限制为 5MB |
| `resume` | 简历文件 | 否 | 接受 PDF、DOC、DOCX、TXT、RTF；JavaScript 硬限制为 10MB |

当前头像选择后会在浏览器中缩放到最长边不超过 480 像素，并转为质量 0.82 的 JPEG Data URL，保存在 `avatar`；原始文件名保存在 `avatarFileName`。未来接入后端后不应继续把该 Data URL 写入 PostgreSQL。

当前简历不会保存文件内容，只把 `name`、`type`、`size` 保存到 `resume` 对象。未来必须把实际文件上传到 MinIO。

### 2.3 当前查询、排序、编辑、删除和详情行为

列表查询条件：

- 姓名：不区分大小写的包含搜索。
- 部门：精确匹配。
- 级别：精确匹配。
- 性别：精确匹配。

排序条件：

- `newest`：按 `createdAt` 从新到旧。
- `name`：按中文姓名升序。
- `age-asc`：年龄从小到大。
- `age-desc`：年龄从大到小。

编辑逻辑：管理页跳转到 `index.html?edit={id}`；登记页根据 `id` 查找记录并回填全部普通字段、技能、头像预览、头像原始文件名和简历文件名。未重新选择文件时保留原有文件信息。

删除逻辑：浏览器确认后按 `id` 从数组中移除记录，再覆盖 localStorage 中的完整数组。

详情弹窗实际显示：头像、姓名、部门、职位、级别、性别、年龄、联系电话、所在城市、入职时间、个人简介、技能标签、简历文件名和简历大小。当前不显示头像原始文件名、创建时间和更新时间。

## 3. PostgreSQL V1 数据模型

### 3.1 主键选择

V1 推荐使用：

```text
BIGINT GENERATED ALWAYS AS IDENTITY
```

也就是由 PostgreSQL 在创建工作人员时生成递增数字 ID。它比让前端生成 ID 更容易让初学者理解，也便于在 Object Key 中使用 `staff_id`。接入 API 后，前端不再自行生成正式 ID；`POST /api/staff` 的响应负责返回数据库 ID。

当前 localStorage 中的 `demo-001` 和浏览器 UUID 只属于前端原型，不要求直接成为未来数据库主键。若未来确实需要离线创建或跨系统合并，再评估 UUID。

### 3.2 `staff` 字段

| 字段 | PostgreSQL 类型 | 必填 / NULL | 默认值 | UNIQUE | CHECK | 索引 | 用途 |
|---|---|---|---|---|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | 必填，`NOT NULL` | 数据库生成 | 主键唯一 | 无 | 主键自动索引 | 工作人员 ID |
| `name` | `VARCHAR(30)` | 必填，`NOT NULL` | 无 | 否 | 暂不加 | 否 | 姓名；姓名不能假设唯一 |
| `gender` | `VARCHAR(10)` | 必填，`NOT NULL` | 无 | 否 | `gender IN ('男','女')` | 否 | 性别 |
| `age` | `INTEGER` | 必填，`NOT NULL` | 无 | 否 | `age BETWEEN 16 AND 100` | 否 | 年龄；与当前表单一致 |
| `phone` | `VARCHAR(30)` | 可空 | `NULL` | 否 | 暂不加 | 否 | 联系电话；不应使用数字类型 |
| `city` | `VARCHAR(50)` | 必填，`NOT NULL` | 无 | 否 | 暂不加 | 否 | 所在城市 |
| `department` | `VARCHAR(30)` | 必填，`NOT NULL` | 无 | 否 | 暂不加枚举约束 | V1 否 | 部门字符串 |
| `position` | `VARCHAR(50)` | 必填，`NOT NULL` | 无 | 否 | 暂不加 | 否 | 职位 |
| `level` | `VARCHAR(20)` | 必填，`NOT NULL` | 无 | 否 | 暂不加枚举约束 | V1 否 | 级别字符串 |
| `join_date` | `DATE` | 必填，`NOT NULL` | 无 | 否 | 暂不加 | 否 | 入职日期 |
| `introduction` | `VARCHAR(600)` | 可空 | `NULL` | 否 | 长度由类型限制 | 否 | 个人简介 |
| `skills` | `TEXT[]` | 必填，`NOT NULL` | 空数组 | 否 | 暂不加 | 否 | 技能字符串数组 |
| `avatar_object_key` | `TEXT` | 可空 | `NULL` | 否 | 暂不加 | 否 | MinIO 中头像的完整 Object Key |
| `avatar_original_name` | `TEXT` | 可空 | `NULL` | 否 | 暂不加 | 否 | 用户上传时的头像原始文件名 |
| `resume_object_key` | `TEXT` | 可空 | `NULL` | 否 | 暂不加 | 否 | MinIO 中简历的完整 Object Key |
| `resume_original_name` | `TEXT` | 可空 | `NULL` | 否 | 暂不加 | 否 | 用户上传时的简历原始文件名 |
| `resume_mime_type` | `VARCHAR(150)` | 可空 | `NULL` | 否 | 暂不加 | 否 | 简历 MIME 类型 |
| `resume_size` | `BIGINT` | 可空 | `NULL` | 否 | 可在实现时加 `>= 0` | 否 | 简历字节数 |
| `created_at` | `TIMESTAMPTZ` | 必填，`NOT NULL` | `CURRENT_TIMESTAMP` | 否 | 无 | 建议普通索引 | 创建时间；支持“最新创建”排序和本月统计 |
| `updated_at` | `TIMESTAMPTZ` | 必填，`NOT NULL` | `CURRENT_TIMESTAMP` | 否 | 无 | 否 | 最后修改时间；V1 由 API 在更新时写入 |

说明：

- 除主键外不设置 UNIQUE。姓名、电话都可能重复或为空。
- `department` 和 `level` 暂不使用 PostgreSQL ENUM 或 CHECK，以免前端选项调整时必须修改表结构；当前允许值由 API 验证。
- `skills` 推荐 `TEXT[]`，因为当前前端已经使用字符串数组，保存、读取和理解都比 JSONB 更直接。V1 不需要保存技能对象或额外属性，因此 JSONB 没有实际收益。
- V1 只建议为 `created_at` 增加一个普通索引，用于默认的最新排序。数据量很小时，部门、级别、性别、年龄和姓名都无需提前建索引。
- 当前姓名搜索是“包含搜索”，普通 B-tree 索引不能有效优化 `%关键词%`；暂不引入 `pg_trgm`，等真实数据量和性能需求出现后再决定。
- `updated_at` 暂不引入数据库触发器，避免增加理解成本；Node.js API 每次成功更新普通字段或文件字段时显式更新它。

本节是字段设计，不是可执行 DDL；本阶段不生成或执行 `CREATE TABLE`。

## 4. MinIO V1 对象设计

### 4.1 Bucket

推荐只使用一个私有 Bucket：

```text
staff-files
```

一个 Bucket 足以测试头像和简历两类文件。类型通过 Object Key 目录区分，不需要为头像和简历拆成两个 Bucket。Bucket 不应公开；浏览器通过 Node.js API 获取或下载文件。

### 4.2 Object Key 规则

推荐规则：

```text
staff/{staff_id}/avatar/{file_uuid}.{verified_extension}
staff/{staff_id}/resume/{file_uuid}.{verified_extension}
```

示例：

```text
staff/101/avatar/7cae562b-d0e8-4507-96f3-8f5ee858983f.webp
staff/101/resume/d4dbf4c0-7388-445a-b5d0-a88a17a293bc.pdf
```

推荐使用文件 UUID，而不是固定的 `avatar.webp` 或原始文件名，原因如下：

- 替换文件时生成新 Key，不会覆盖仍可能被读取的旧对象。
- 避免浏览器或代理因为相同 URL 缓存旧头像。
- 不受重名、中文名和特殊字符影响。
- 数据库更新成功后再删除旧对象，失败补偿更清晰。

扩展名必须根据服务端验证后的实际文件类型生成，不能直接信任用户原始文件名。V1 不要求服务端统一转 WebP；如果未来增加图片处理，再统一把头像输出为 `.webp`。

### 4.3 文件类型和大小

为了与当前前端一致，V1 API 建议允许：

- 头像：JPEG、PNG、WebP；最大 5MB。页面可以继续建议用户选择 2MB 以内图片。
- 简历：PDF、DOC、DOCX、TXT、RTF；最大 10MB。

服务端实现时应同时验证扩展名、MIME 类型和文件内容特征，不能只信任浏览器上报的 MIME 类型。

## 5. PostgreSQL 与 MinIO 的边界和关联

每条 `staff` 记录最多关联一个头像对象和一个简历对象：

```text
staff.id = 101
  ├─ avatar_object_key = staff/101/avatar/{uuid}.webp
  └─ resume_object_key = staff/101/resume/{uuid}.pdf
```

关联规则：

- `staff_id` 出现在 Object Key 中，用于让对象路径可读、可定位和便于按人员清理。
- PostgreSQL 与 MinIO 之间不存在数据库外键；数据库中的 Object Key 是应用层引用。
- PostgreSQL 保存 Object Key、原始文件名和当前前端需要的简历元数据。
- MinIO 保存 JPEG、PNG、WebP、PDF、DOC、DOCX、TXT、RTF 等实际二进制内容。
- 不把头像 Base64 / Data URL 保存到 PostgreSQL。
- 不把简历二进制保存到 `staff` 业务表。
- 前端不直接拼接公开 MinIO 地址。Node.js 根据数据库里的 Key 读取对象，并通过受控 API 返回、下载或重定向到短期有效地址。

## 6. API V1 设计

### 6.1 工作人员数据

| 方法 | 路径 | 用途 | 主要输入 / 输出 |
|---|---|---|---|
| `GET` | `/api/staff` | 列表、搜索、筛选、排序 | 查询参数；返回 `{ items, total }` |
| `GET` | `/api/staff/:id` | 获取详情 | 返回一条完整工作人员数据及文件信息 |
| `POST` | `/api/staff` | 新增普通字段 | JSON；返回新记录和数据库生成的 `id` |
| `PUT` | `/api/staff/:id` | 修改普通字段 | JSON；返回更新后的记录 |
| `DELETE` | `/api/staff/:id` | 删除人员及关联文件 | 成功返回 `204 No Content` |

`POST` 和 `PUT` 的 JSON 只包含普通字段：

```json
{
  "name": "测试人员",
  "gender": "男",
  "age": 28,
  "phone": "13800138000",
  "city": "成都",
  "department": "运营",
  "position": "运营专员",
  "level": "中级",
  "joinDate": "2026-08-01",
  "introduction": "用于测试完整技术链路。",
  "skills": ["运营", "剪辑"]
}
```

文件不放在这个 JSON 中。

### 6.2 文件 API

| 方法 | 路径 | 用途 | 主要输入 / 输出 |
|---|---|---|---|
| `GET` | `/api/staff/:id/avatar` | 读取头像 | 返回图片内容，或重定向到短期有效读取地址 |
| `POST` | `/api/staff/:id/avatar` | 首次上传或替换头像 | `multipart/form-data`，字段名 `file`；返回头像元数据 |
| `DELETE` | `/api/staff/:id/avatar` | 删除头像 | 清除 MinIO 对象和数据库头像字段 |
| `GET` | `/api/staff/:id/resume` | 下载简历 | 使用原始文件名返回附件，或重定向到短期有效下载地址 |
| `POST` | `/api/staff/:id/resume` | 首次上传或替换简历 | `multipart/form-data`，字段名 `file`；返回简历元数据 |
| `DELETE` | `/api/staff/:id/resume` | 删除简历 | 清除 MinIO 对象和数据库简历字段 |

增加两个 GET 文件 API 是必要的：详情页需要显示头像，管理员也需要有受控的简历下载入口。MinIO Bucket 保持私有，避免前端长期持有内部地址或凭证。

### 6.3 列表查询参数

示例：

```text
GET /api/staff?name=林&department=运营&level=中级&gender=女&sort=newest
```

| 查询参数 | 对应当前前端 | V1 规则 |
|---|---|---|
| `name` | 姓名搜索 | 对 `name` 做不区分大小写的包含搜索 |
| `department` | 部门筛选 | 精确匹配 |
| `level` | 级别筛选 | 精确匹配 |
| `gender` | 性别筛选 | 精确匹配 |
| `sort=newest` | 最新创建 | `created_at DESC` |
| `sort=name` | 姓名 A–Z | `name ASC`，使用数据库中文排序规则或应用确认的 collation |
| `sort=age-asc` | 年龄从小到大 | `age ASC` |
| `sort=age-desc` | 年龄从大到小 | `age DESC` |

V1 服务端必须使用允许列表解析 `sort`，不能把用户输入直接拼接进 SQL。当前前端没有分页，测试数据量也很小，所以 V1 可以暂不加分页；正式扩大数据量前再增加 `page` 和 `pageSize`。

## 7. 创建工作人员流程

推荐先创建工作人员，再上传文件：

```text
用户填写普通资料并选择可选文件
        ↓
POST /api/staff（只发送 JSON 普通字段）
        ↓
PostgreSQL 创建 staff 记录
        ↓
API 返回数据库生成的 staff_id
        ↓
若选择头像：POST /api/staff/{staff_id}/avatar
        ↓
MinIO 保存头像 → PostgreSQL 更新 avatar_object_key 等字段
        ↓
若选择简历：POST /api/staff/{staff_id}/resume
        ↓
MinIO 保存简历 → PostgreSQL 更新 resume_object_key 等字段
        ↓
GET /api/staff/{staff_id} 返回最终状态
```

使用 `staff_id` 的原因：

- 文件路径天然归属于确定的工作人员。
- 不需要先生成“临时人员目录”。
- 删除工作人员时可以准确定位相关对象。
- 日志和问题排查时能从 Object Key 看出所属记录。

协调方式：

- 创建工作人员是第一步，成功后记录可以在没有文件的情况下正常存在。
- 头像和简历是两个独立可重试步骤；其中一个失败不会撤销已创建的工作人员，也不会阻止另一个上传。
- 前端应分别显示普通资料、头像、简历的成功或失败状态，并允许重试失败的文件。
- V1 不需要跨 PostgreSQL 和 MinIO 的分布式事务，使用清晰的小步骤和失败补偿即可。

## 8. 详情读取流程

```text
GET /api/staff/:id
        ↓
Node.js 查询 PostgreSQL staff 行
        ↓
把 snake_case 字段映射为前端 camelCase
        ↓
为存在的文件生成受控 API URL
        ↓
返回 JSON
```

建议响应示例：

```json
{
  "id": 101,
  "name": "测试人员",
  "gender": "男",
  "age": 28,
  "phone": "13800138000",
  "city": "成都",
  "department": "运营",
  "position": "运营专员",
  "level": "中级",
  "joinDate": "2026-08-01",
  "introduction": "用于测试完整技术链路。",
  "skills": ["运营", "剪辑"],
  "avatar": {
    "objectKey": "staff/101/avatar/7cae562b-d0e8-4507-96f3-8f5ee858983f.webp",
    "originalName": "个人头像.png",
    "url": "/api/staff/101/avatar"
  },
  "resume": {
    "objectKey": "staff/101/resume/d4dbf4c0-7388-445a-b5d0-a88a17a293bc.pdf",
    "originalName": "个人简历.pdf",
    "mimeType": "application/pdf",
    "size": 246800,
    "url": "/api/staff/101/resume"
  },
  "createdAt": "2026-08-12T08:00:00.000Z",
  "updatedAt": "2026-08-12T08:05:00.000Z"
}
```

没有文件时，`avatar` 或 `resume` 返回 `null`。Object Key 可用于本测试项目观察完整链路，但真正面向公网用户的产品通常没有必要暴露内部 Key。

## 9. 编辑流程

### 9.1 普通字段

```text
前端 GET /api/staff/:id 回填表单
        ↓
用户修改普通字段
        ↓
PUT /api/staff/:id
        ↓
PostgreSQL 更新普通字段和 updated_at
        ↓
返回更新后的记录
```

`PUT` 不接收头像或简历二进制。

### 9.2 替换头像或简历

推荐流程：

```text
上传新文件到新的 UUID Object Key
        ↓
上传成功后更新 PostgreSQL 为新 Key 和新元数据
        ↓
数据库更新成功后删除旧 MinIO 对象
```

失败处理：

- 新文件上传失败：数据库保持旧 Key，不受影响。
- 新文件已上传但数据库更新失败：删除刚上传的新对象作为补偿，继续保留旧 Key 和旧文件。
- 数据库已改为新 Key 但删除旧对象失败：新文件仍可正常使用；记录日志并稍后重试清理旧对象。

普通字段修改与文件替换拆开处理，原因是它们使用不同请求格式、大小限制、验证方式和失败补偿逻辑。拆开后普通资料修改不会因为大文件上传失败而整体失败，文件也可以独立重试。

## 10. 删除流程

推荐数据库记录优先、MinIO 补偿清理：

```text
DELETE /api/staff/:id
        ↓
读取并保留当前 avatar_object_key、resume_object_key
        ↓
在 PostgreSQL 事务中删除 staff 记录并提交
        ↓
按刚才保存的准确 Object Key 删除 MinIO 头像和简历
        ↓
可选检查并清理 staff/{id}/ 下的残留对象
```

选择数据库优先的理由：如果 MinIO 删除暂时失败，最多留下无法通过业务记录访问的孤立对象，之后仍可重试清理；不会出现数据库仍指向一个已经删除的文件。

V1 失败处理：

- PostgreSQL 删除失败：不删除 MinIO 文件，API 返回失败。
- PostgreSQL 删除成功、MinIO 删除失败：工作人员在业务上已经删除；服务端记录失败的 Object Key 并进行有限次数重试。本测试阶段可先记录错误并人工重试，不必为此设计消息队列表。
- MinIO 的删除操作应具有幂等性；对象已经不存在时仍视为清理成功。
- 优先删除数据库记录中保存的精确 Key，不只依赖字符串拼接出的目录。目录前缀清理用于处理残留对象。

## 11. 前端字段到数据存储映射

| 前端 / 当前对象字段 | PostgreSQL 字段 | PostgreSQL 类型 | 必填 | 是否文件 | MinIO 对象信息 / 处理方式 |
|---|---|---|---:|---:|---|
| `recordId` / `id` | `id` | `BIGINT IDENTITY` | 系统必填 | 否 | 不进入 MinIO；未来由数据库生成，不再使用前端 UUID 作为正式 ID |
| `name` | `name` | `VARCHAR(30)` | 是 | 否 | — |
| `gender` | `gender` | `VARCHAR(10)` | 是 | 否 | — |
| `age` | `age` | `INTEGER` | 是 | 否 | — |
| `phone` | `phone` | `VARCHAR(30)` | 否 | 否 | — |
| `city` | `city` | `VARCHAR(50)` | 是 | 否 | — |
| `department` | `department` | `VARCHAR(30)` | 是 | 否 | — |
| `position` | `position` | `VARCHAR(50)` | 是 | 否 | — |
| `level` | `level` | `VARCHAR(20)` | 是 | 否 | — |
| `joinDate` | `join_date` | `DATE` | 是 | 否 | — |
| `introduction` | `introduction` | `VARCHAR(600)` | 否 | 否 | — |
| `skills` 输入拆分后的数组 | `skills` | `TEXT[]` | 否；数据库使用空数组 | 否 | — |
| 当前 `avatar` Data URL | `avatar_object_key` | `TEXT` | 否 | 是 | 不迁移 Data URL；实际图片上传到 `staff/{id}/avatar/{uuid}.{ext}`，数据库只保存 Key |
| `avatarFileName` | `avatar_original_name` | `TEXT` | 否 | 文件元数据 | 保存用户选择时的原始名称；实际图片在 MinIO |
| 头像文件本体 | 无二进制字段 | — | 否 | 是 | MinIO `staff-files` Bucket；JPEG、PNG、WebP，V1 最大 5MB |
| `resume.name` | `resume_original_name` | `TEXT` | 否 | 文件元数据 | 实际简历在 MinIO |
| `resume.type` | `resume_mime_type` | `VARCHAR(150)` | 否 | 文件元数据 | 保存服务端验证后的 MIME 类型，不直接信任浏览器值 |
| `resume.size` | `resume_size` | `BIGINT` | 否 | 文件元数据 | 字节数 |
| 当前不存在的简历 Object Key | `resume_object_key` | `TEXT` | 否 | 是 | 实际文件上传到 `staff/{id}/resume/{uuid}.{ext}`，数据库保存 Key |
| 简历文件本体 | 无二进制字段 | — | 否 | 是 | MinIO `staff-files` Bucket；PDF、DOC、DOCX、TXT、RTF，V1 最大 10MB |
| `createdAt` | `created_at` | `TIMESTAMPTZ` | 系统必填 | 否 | 数据库创建时生成 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ` | 系统必填 | 否 | API 每次成功修改数据或文件引用时更新 |

查询控件不保存到 `staff` 表：

| 前端控件 | API 查询参数 | 数据库用途 |
|---|---|---|
| `search-name` | `name` | 姓名包含搜索 |
| `filter-department` | `department` | 部门精确筛选 |
| `filter-level` | `level` | 级别精确筛选 |
| `filter-gender` | `gender` | 性别精确筛选 |
| `sort-by` | `sort` | `newest`、`name`、`age-asc`、`age-desc` 允许列表 |

## 12. 当前故意没有设计的内容

为保持测试项目简单，V1 故意不设计：

- `departments`、`levels`、`skills`、`staff_skills` 等关系表。
- 文件表、文件版本表、上传会话表。
- PostgreSQL ENUM 类型。
- 用户登录、角色、权限。
- 审计日志、操作历史、软删除和回收站。
- 员工编号、身份证、生日、工资、合同等真正 HR 字段。
- 用生日自动计算年龄；当前前端只有年龄字段，所以 V1 直接保存年龄。
- 对象公开访问、长期公开 URL、CDN。
- 消息队列、分布式事务、自动孤儿文件清理任务。
- 数据库触发器和复杂索引。
- 列表分页和全文检索。
- 可执行 SQL、数据库迁移文件和种子脚本。
- Node.js / Express 项目、实际 API 代码、MinIO Bucket 和部署配置。

## 13. 下一阶段实施建议

下一阶段可以进入“最小本地后端实现”，但必须在确认后再执行。建议顺序：

1. 创建本地测试 PostgreSQL 数据库和 `staff` 表迁移。
2. 创建私有 MinIO Bucket `staff-files`。
3. 创建最小 Node.js API，并先实现无文件的工作人员 CRUD。
4. 实现列表搜索与四种排序，验证 PostgreSQL 数据路径。
5. 实现头像、简历上传、读取、替换和删除，验证 MinIO 路径。
6. 用 API 测试工具完整验证失败补偿流程。
7. 最后再把当前前端的 localStorage 访问替换为 API 调用。

进入下一阶段前应再次确认数据库名称、PostgreSQL 与 MinIO 的本地连接方式、Node.js 技术栈以及是否保留演示数据。当前文档不自动执行任何下一阶段操作。
