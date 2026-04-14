# Podcast Generation — 项目说明

## 项目定位
每日商业新闻播客自动生成管道。以音频为主，视频为 Remotion 文字动效可视化。

## 参考实现
`E:\cc\talking-video-generation` — 说话视频管道，含以下可复用经验：
- Topview TTS API 调用方式（voice ID、text2voice）
- Gemini API 脚本生成（gemini-flash-latest）
- Remotion 渲染流程
- Windows 路径含空格的处理方式（spawn shell:false）
- ffmpeg 音视频处理工具函数

## 技术栈（规划）
- **内容来源**：Obsidian 看板（路径待定）
- **脚本生成**：Gemini，多段播客稿
- **TTS**：Topview text2voice，定制 voice ID，分段生成后 ffmpeg 拼接
- **视频**：Remotion，纯文字动效 + 音效，无 avatar
- **时长**：约 20 分钟，多段拼接

## 语言规则
所有交流使用中文。

## 编码规则
- 文件使用 UTF-8 编码
- 运行环境：Windows 11，Node.js，Git Bash
