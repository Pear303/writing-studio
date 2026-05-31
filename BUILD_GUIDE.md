# NovelIDE 构建与打包指南

```bash
# 第一步：构建前端资源
npm run build

# 第二步：构建 Tauri 应用
npm run tauri build
```

构建完成后，可执行文件位于：
 `src-tauri/target/release/bundle/nsis/NovelIDE_0.2.0_x64-setup.exe`

---

或首先进行测试：
```bash
npm run tauri dev
```