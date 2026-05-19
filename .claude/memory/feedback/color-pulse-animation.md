---
name: color-pulse-animation
description: 所有带颜色的元素都要有柔和透明度律动动画
metadata:
  type: feedback
---

所有带颜色的 UI 元素（渐变按钮、彩色标签、数字徽章、图标背景、彩色文字等）统一使用 `gradientPulse` 动画：3 秒 ease-in-out 循环，透明度在 1 ↔ 0.82 之间律动。

**Why:** 用户偏好高级感微动效，颜色有呼吸感更显品质。

**How to apply:** 给带颜色的元素添加 `animation: gradientPulse 3s ease-in-out infinite`，或使用 `.color-pulse` 类。不要改变颜色本身，只做透明度微调。
