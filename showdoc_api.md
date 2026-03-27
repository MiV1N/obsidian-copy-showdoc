[TOC]

### 前言

showdoc开放文档编辑的API，供使用者更加方便地操作文档数据。利用开放API，你可以自动化地完成很多事。例如下面列举三个典型的应用场景：

- 假如你的团队有很多现成的文档资料，但这些文档资料大多以word的形式存在。如果人工复制粘粘，工作量会有点多。此时你可以写一个自动脚本，从文件中生成文档，然后通过showdoc的开放api批量地把文档更新进去。

- 你是个后端程序员，你想在写完代码后，文档能自动更新到showdoc。为了实现这个效果，你可以写一个脚本程序，根据你项目代码的结构，自动生成文档数据，然后通过showdoc的开放api自动更新。

- 你有很多笔记教程，存在笔记软件或者网站博客中，但你想把它们归类在一起供人们查阅。 这时你可以写程序批量导入showdoc


开放API提供的是一种自动更新的能力，使用场景不止上面所说的。更多场景请发挥你的想象力吧！


> **适用版本说明**：
>
> - **官网在线版（www.showdoc.com.cn）**：默认运行最新版，无需关心版本号，直接调用下列接口即可。
> - **私有部署版**：请确保 ShowDoc 版本 ≥ **V3.6.0** 后再使用本页接口。




---


## 公共说明


| 项                  | 说明                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 基础 URL            | 在线版：`https://www.showdoc.cc/server/api/open/<接口名称>`；私有部署：`<部署域名>/server/index.php?s=/api/open/<接口名称>` |
| 请求方式            | `POST`，支持 `application/x-www-form-urlencoded`、`application/json`；上传文件用 `multipart/form-data`                      |
| 鉴权方式            | 项目设置 → 「开放 API」获取 `api_key`、`api_token`                                                                          |
| 返回格式            | 成功：`{"error_code":0,"data":...}`；失败：`{"error_code":错误码,"error_message":"原因"}`                                   |
| 常见错误码          | `10306`：鉴权失败；                                    |


---


## 接口导航


| 模块     | 接口                                             | 说明                                  |
| -------- | ------------------------------------------------ | ------------------------------------- |
| 页面管理 | updatepage-更新或创建页面       | 按标题创建/更新页面                   |
|          | updateitem-兼容旧脚本       | `updatePage` 兼容别名，但不建议再使用 |
|          | getpage-获取页面详情              | 查询页面内容                          |
|          | deletepage-删除页面           | 将页面移入回收站                      |
| 目录管理 | getcatalogtree-获取目录树  | 返回完整目录结构                      |
|          | createcatalog-创建目录   | 新建目录节点                          |
|          | updatecatalog-修改目录    | 更新目录名称/排序                     |
|          | deletecatalog-删除目录   | 删除目录与子内容                      |
| 附件管理 | uploadattachment-上传附件| 上传并可关联页面                      |
|          | deleteattachment-删除附件 | 删除已上传附件                        |


---


### `updatePage` 更新或创建页面


- **接口说明**：按标题写入页面内容，自动创建目录。
- **请求 URL**：`<base>/api/open/updatePage`
- **请求方式**：`POST`
- **鉴权**：`api_key` + `api_token`


| 参数名       | 必填 | 类型   | 说明                       |
| ------------ | ---- | ------ | -------------------------- |
| api_key      | 是   | string | 项目密钥                   |
| api_token    | 是   | string | 项目 Token                 |
| page_title   | 是   | string | 页面标题（同目录下唯一）   |
| page_content | 是   | string | 页面内容，Markdown/HTML    |
| cat_name     | 否   | string | 目录名称，支持 `一级/二级` |
| s_number     | 否   | int    | 排序，默认 99              |


**成功示例**


```
{"error_code":0,"data":{"page_id":123}}
```


---


### `updateItem` 兼容旧脚本


- **接口说明**：行为与 `updatePage` 相同，仅保留向后兼容。
- **请求 URL**：`<base>/api/open/updateItem`
- **参数**：同 `updatePage`


---


### `getPage` 获取页面详情


- **接口说明**：根据 `page_id` 或 `page_title` 拉取页面信息。
- **请求 URL**：`<base>/api/open/getPage`
- **频率限制**：10 分钟 ≤ 40,000 次


| 参数名     | 必填 | 类型   | 说明               |
| ---------- | ---- | ------ | ------------------ |
| api_key    | 是   | string | 项目密钥           |
| api_token  | 是   | string | 项目 Token         |
| page_id    | 否   | int    | 页面 ID（二选一）  |
| page_title | 否   | string | 页面标题（二选一） |


**成功示例**


```
{"error_code":0,"data":{"page_id":123,"page_title":"示例","page_content":"..."}}
```


获取的 page_content 是默认经过 html 转义的，你需要 html 反转义方可使用，不然会遇到部分特殊字符不兼容问题


---


### `deletePage` 删除页面


- **接口说明**：软删除页面，内容进入回收站。
- **请求 URL**：`<base>/api/open/deletePage`


| 参数名    | 必填 | 类型   | 说明       |
| --------- | ---- | ------ | ---------- |
| api_key   | 是   | string | 项目密钥   |
| api_token | 是   | string | 项目 Token |
| page_id   | 是   | int    | 页面 ID    |


**成功示例**


```
{"error_code":0,"data":{"page_id":123}}
```


---


### `getCatalogTree` 获取目录树


- **接口说明**：返回项目完整的目录及页面树结构。
- **请求 URL**：`<base>/api/open/getCatalogTree`
- **频率限制**：10 分钟 ≤ 10,000 次


| 参数名    | 必填 | 类型   | 说明       |
| --------- | ---- | ------ | ---------- |
| api_key   | 是   | string | 项目密钥   |
| api_token | 是   | string | 项目 Token |


**成功示例（部分字段）**


```
{"error_code":0,"data":{"pages":[...],"catalogs":[...]}}
```


---


### `createCatalog` 创建目录


- **接口说明**：新建目录节点，可指定父级。
- **请求 URL**：`<base>/api/open/createCatalog`


| 参数名        | 必填 | 类型   | 说明              |
| ------------- | ---- | ------ | ----------------- |
| api_key       | 是   | string | 项目密钥          |
| api_token     | 是   | string | 项目 Token        |
| cat_name      | 是   | string | 目录名称          |
| parent_cat_id | 否   | int    | 父目录 ID，默认 0 |
| s_number      | 否   | int    | 排序，默认 99     |


---


### `updateCatalog` 修改目录


- **接口说明**：更新目录名称或排序。
- **请求 URL**：`<base>/api/open/updateCatalog`


| 参数名    | 必填 | 类型   | 说明       |
| --------- | ---- | ------ | ---------- |
| api_key   | 是   | string | 项目密钥   |
| api_token | 是   | string | 项目 Token |
| cat_id    | 是   | int    | 目录 ID    |
| cat_name  | 否   | string | 新目录名   |
| s_number  | 否   | int    | 新排序     |


`cat_name`、`s_number` 至少传一项。


---


### `deleteCatalog` 删除目录


- **接口说明**：删除目录及其子目录、页面（进入回收站）。
- **请求 URL**：`<base>/api/open/deleteCatalog`


| 参数名    | 必填 | 类型   | 说明       |
| --------- | ---- | ------ | ---------- |
| api_key   | 是   | string | 项目密钥   |
| api_token | 是   | string | 项目 Token |
| cat_id    | 是   | int    | 目录 ID    |


⚠️ 操作会影响所有子内容，请谨慎执行。


---


### `uploadAttachment` 上传附件


- **接口说明**：上传图片或文件，可关联页面。
- **请求 URL**：`<base>/api/open/uploadAttachment`
- **请求方式**：`POST multipart/form-data`


| 参数名    | 必填 | 类型   | 说明        |
| --------- | ---- | ------ | ----------- |
| api_key   | 是   | string | 项目密钥    |
| api_token | 是   | string | 项目 Token  |
| file      | 是   | file   | 待上传文件  |
| page_id   | 否   | int    | 关联页面 ID |


**成功示例**


```
{"error_code":0,"data":{"url":"https://...","file_id":456}}
```


---


### `deleteAttachment` 删除附件


- **接口说明**：删除已上传的附件文件。
- **请求 URL**：`<base>/api/open/deleteAttachment`


| 参数名    | 必填 | 类型   | 说明                      |
| --------- | ---- | ------ | ------------------------- |
| api_key   | 是   | string | 项目密钥                  |
| api_token | 是   | string | 项目 Token                |
| file_id   | 否   | int    | 附件 ID                   |
| sign      | 否   | string | 附件签名                  |
| file_url  | 否   | string | 附件 URL（自动提取 sign） |


`file_id`、`sign`、`file_url` 至少提供一个。


**成功示例**


```
{"error_code":0,"data":{"file_id":456}}
```


---


## 建议与排障


- **密钥安全**：将 `api_key`、`api_token` 存储在安全位置（环境变量、密钥管控服务）。
- **限流处理**：若频繁触发 `10305`，请增加重试间隔或降低并发。
- **内容规范**：写操作会自动进行●●内容●●，请提前清理不合规信息。
- **更多资料**：实现细节参考 `docs/open-api.md`、`docs/open-api-implementation-guide.md`。

