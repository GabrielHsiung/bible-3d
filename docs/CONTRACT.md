# 模組合約（多個 agent 並行開發時的規則）

## 座標與單位
- 1 單位 = 1 公尺。x 向東、z 向南、y 向上。
- `C` = 一肘的公尺數（0.445 或 0.525，可切換）。元件收 `m: (n: number) => number`（肘 → 公尺）或 `C`。
- 院子 x ∈ [-50, 50] 肘、z ∈ [-25, 25] 肘，東面 x=50 是門。帳幕 x ∈ [-30, 0]、z ∈ [-5, 5]，高 10 肘；幔子在 x=-20。
- 器具位置（肘）：祭壇 (20,0)、洗濯盆 (8,0)、桌子 (-10,-3)、燈臺 (-10,3)、香壇 (-18,0)、法櫃 (-25,0)。
  這些也寫在 `src/data/tabernacle.ts` 的 `ITEMS`，不要改位置。

## 檔案所有權（只改自己的檔案；需要別人改的，寫在最後回報裡）
| Agent | 擁有 |
|---|---|
| 聖器 sacred | `src/components/sacred/**`（新建）。另可在 `Tabernacle.tsx` 中**只刪除**舊的 Altar/Laver/Table/Lampstand/IncenseAltar/Ark/Smoke/Flames/Grating 函式並改成 import |
| 建築 structure | `src/components/structure/**`（新建）、`src/materials.ts`、`src/pbr.ts`、`src/textures.ts`。另可在 `Tabernacle.tsx` 中**只**把 Courtyard、Tent 移到 structure/ 並改成 import |
| 人物 people | `src/components/Person.tsx`、`src/components/NPCs.tsx`、`src/components/people/**`（新建）。`Person` 的 props 介面 `{ style, speedRef }` 和 `STYLES.priest` 要保留（Player 在用） |
| 體驗 experience | `src/App.tsx`、`src/components/HUD.tsx`、`src/index.css`、`src/components/Player.tsx`、`src/components/World.tsx`、`src/components/Render.tsx`、`src/audio/**`（新建）、`src/store.ts` |

## 共用工具
- `input`（`src/store.ts`）：`input.player` 是玩家即時位置，`input.yaw/pitch` 是相機角度。
- `useStore`：`nearId`（靠近的器具 id）、`photo`（拍照模式）、`cubit`、`cutaway`。
- 路徑追蹤只支援 MeshStandardMaterial / MeshPhysicalMaterial。自訂 shader 的物件（火焰、煙、粒子）要加 `userData={{ noPathTrace: true }}`。
- 帳幕內部的金屬材質要加入 `INTERIOR`（`src/materials.ts`），才會用帳幕內的環境反射。

## 檢查
- `npx tsc -b` 要通過，`npx vite build` 要成功。
- 截圖：`npx vite build && (npx vite preview --port <你的埠> &)`，再用 `/home/claude/quick.py`、`/home/claude/rt.py` 的寫法改網址和輸出檔名截圖。
  這台機器只有 CPU 模擬 WebGL，很慢：用 800×480 以下的視窗、等 10 秒以上再截圖，點按鈕給長 timeout。
- 完成後在自己的分支 commit（訊息用中文），不要 push、不要 merge。
