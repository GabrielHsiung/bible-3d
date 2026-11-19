# 聖經場景 3D 重建：會幕（MVP）

以第三人稱走進出埃及記 25–40 章描述的會幕。靠近器具會顯示和合本經文、肘數尺寸與可信度（經文明載／考古文獻／學者推測）。

- 一般肘 44.5 cm／長肘 52.5 cm 切換，整個場景依新尺寸重建
- 剖面模式：看見至聖所內的法櫃
- 拍照：GPU 路徑追蹤，累積取樣出有真實反光與光線反彈的照片
- 所有材質與地形皆為程序生成，無外部素材

## 開發

```bash
npm install --legacy-peer-deps
npm run dev
SINGLE=1 npx vite build --outDir dist-single   # 輸出單一 HTML
```

技術：React Three Fiber、Rapier、postprocessing（N8AO、Bloom、AgX）、three-gpu-pathtracer。
