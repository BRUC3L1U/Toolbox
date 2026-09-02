# Toolbox

一个无需构建步骤的轻量中文工具箱，包含热量换算、计数器、商品比价和 Boss 计时四项功能。页面数据仅保存在当前浏览器的 `localStorage` 中，不会上传到服务器。

## 本地运行

```bash
python3 -m http.server 8000
```

然后打开 <http://127.0.0.1:8000/>。

## 验证

项目使用 Node.js 内置测试运行器，不需要安装依赖：

```bash
node --check app.js
node --test tests/*.test.js
```

提交和拉取请求也会通过 GitHub Actions 运行相同检查。

## 数据与维护约定

- 比价数据带有 schema 版本和 revision；无效记录会在读取时被隔离。
- 多标签页优先通过 Web Lock 串行写入并使用 `storage` 事件同步；不支持 Web Lock 的浏览器会阻止多标签同时写入并提示关闭其他标签页。
- Boss 刷新周期在 `app.js` 的 `WORLD` 与 `NORMAL` 配置中维护。游戏日程变化时，需要同步更新基准时间并运行测试。
