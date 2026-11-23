# 素材指南（角色 / 房间 / 降级贴图）

## 现状：零外部素材即可运行
web 端房间与 Q 版大肥鱼全部**程序化生成**（three.js 几何体 + Canvas 纹理），
不依赖任何下载资源，开箱即用。以下为可选升级路线。

## 当前默认：混元 GLB「大肥鱼」（已接入 ✅）
用户用腾讯混元 3D 生成的 Q 版女仆鲸鱼娘雕塑已处理为 `apps/web/public/assets/character.glb`：
- 原始 51MB / 50 万面 / 4096 贴图 → **约 11MB / 14.9 万面 / 2048 贴图**（unlit 手绘风）。
- 加载优先级：**VRM > character.glb > 几何占位形象**；点击摸头、说话蹦跳、思考歪头均已接好。
- 动画为**程序化“纸片人”动画**（无骨骼）：整体呼吸浮动/摇摆 + 头身两段切分（颈部枢轴独立歪头点头）。
  源模型是静态雕塑，没有骨骼与形态键，因此**无法做眨眼/口型/精细表情**——要真表情请走路线 A（VRM）。

### 重建流水线（换模型时重跑）
1. `tools/assets/hunyuan/inspect_glb.py`：解析混元 GLB → mesh_raw.npz + 三张贴图。
2. `tools/assets/hunyuan/decimate_islands.py`：按 UV 岛连通分量分组减面（防跨缝塌缩花脸），
   输出 dec_uvaware.npz（约 9~11 万面，可调 TARGET）。
3. `tools/assets/hunyuan/build_glb.py`：姿态归一化（脸朝 +Z、脚底 y=0、身高 1.35）、
   颈线头身切分（NECK_Y）、法线重算、贴图降采样、手写 GLB。
4. 截图验证：`node tools/e2e-glb-shot.mjs` / `e2e-glb-closeup.mjs` / `e2e-glb-anim.mjs`
   （需 dev server；产物在 docs/preview-glb-*.png）。
依赖：bundled Python + numpy + Pillow + fast-simplification（pip 已装）。

## 路线 A：VRM 正式形象（想要真表情/骨骼动画时推荐）
1. 用 VRoid Studio 按参考图捏「蓝长发 + 女仆裙 + 鲸鱼尾巴」的 Q 版角色
   （尾巴可用自定义发型/饰品部件拼，或导入 Blender 加工）。
2. 导出 VRM 1.0，命名 `character.vrm`，放到 `apps/web/public/assets/character.vrm`。
3. 设备页启动时 HEAD 探测该路径，存在且非 HTML 即自动加载替换占位角色，
   表情（happy）与说话状态已接好。
4. 面数建议 < 3 万、贴图 ≤ 1024，照顾 MT8167 的 GPU。

## 路线 B：Blender 离线烘焙
- `tools/assets/blender/build_room.py`：导出与 web 布局一致的低模房间 glb。
- `build_character_proxy.py`：Q 版代理模型 glb。
- `render_2_5d.py`：正交相机烘焙 800×480 房间背景 + 两帧尾巴摆动精灵。
- 产物可替换 `scene/textures.ts` 的 Canvas 纹理 / `fallback25d.ts` 的烘焙背景。

## 路线 C：AI 生成位图
`tools/assets/prompts/imagegen.md` 提供角色概念图、雨夜房间壁纸、鲸鱼地毯的提示词，
可用于海报贴图（poster）、显示器壁纸（whaleWallpaper）与 VRM 贴图参考。

## 参考图
用户提供的三张参考图（鲸鱼娘形象 / 蓝色雨夜卧室 / LX04 本体）是美术基准：
配色以深蓝 #0b1020、雾蓝 #5b8cff、暖黄灯光为主。

