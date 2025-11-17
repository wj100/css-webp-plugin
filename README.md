# @wj2025/css-webp-plugin

为 CSS 背景图片自动补充 WebP 版本规则（依赖 `.webp`/`.no-webp` 类进行能力检测）。可与 `html-webp-plugin` 、`webp-generate-plugin` 搭配使用，实现端到端的 WebP 优化链路。

## 安装

```bash
npm install @wj2025/css-webp-plugin --save-dev
# or
yarn add -D @wj2025/css-webp-plugin
```

## 使用

```js
const CssWebpPlugin = require('@wj2025/css-webp-plugin');

module.exports = {
  plugins: [
    new CssWebpPlugin({
      include: /\/img\//,
      exclude: null
    })
  ]
};
```

## 工作方式

1. 在 `emit` 阶段扫描输出的 CSS，收集背景图片规则；
2. 为匹配到的规则生成 `.webp .selector { background-image: url(xxx.webp) }` 片段；
3. 构建完成后，检查 WebP 文件是否真实存在，不存在则移除对应规则。

> ⚠️ 请确保在页面 `<head>` 中注入 WebP 检测脚本并给懒加载背景添加占位样式，示例：
>
> ```html
> <script>
>   /* WebP 检测 - 内联执行以避免 FOUC */
>   !function () {
>     var img = new Image;
>     img.onload = function () { (img.width > 0 && img.height > 0) && document.documentElement.classList.add("webp"); };
>     img.onerror = function () { document.documentElement.classList.add("no-webp"); };
>     img.src = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";
>   }();
> </script>
> <style>
>   .bg-lazy.bg-lazy { background-image: none !important; }
> </style>
> ```
>
> 这样 `@wj2025/css-webp-plugin` 生成的 `.webp` / `.no-webp` 规则才能即时生效。

## 配置项

| 选项 | 说明 | 默认值 |
| --- | --- | --- |
| `include` | 需要处理的图片路径正则 | `/\/img\//` |
| `exclude` | 需排除的图片路径正则 | `null` |

## License

MIT © wangjun

