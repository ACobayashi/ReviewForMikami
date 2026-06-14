# 嵌门永存刷题舱

入口：打开 `index.html`。

内容来自根目录的 `嵌门永存.pdf`，先通过 `pdftotext` 转成 `嵌门永存.txt`，再由 `scripts/generate-data.mjs` 生成 `data.js`。

功能：

- 客观题：原题训练，选项每次随机打乱。
- 判断变式：把选择题选项改成判断题。
- 简答默写：先写要点，再翻答案自查。
- 知识卡：基础概念和高频问答卡片。
- 错题本：自动记录选择题错题，本地浏览器保存进度。

重新生成数据：

```sh
node study-site/scripts/generate-data.mjs
```
