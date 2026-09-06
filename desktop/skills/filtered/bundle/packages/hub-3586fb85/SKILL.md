---
name: hub-3586fb85-photo-to-poster
description: 将任意照片转化为极简编辑插画画报风格（Minimalist Editorial Poster）。 严格按参考画报的版式进行 1:1 复刻：上方为原始照片，下方为一张由 ImageGen 直接生成的「完整海报画」（纯色背景 + 居中抽象主体 + 英文标题居中放置在 主体下方），脚本仅做上下拼接，不再额外渲染任何文字或色卡。
metadata:
  source-name: photo-to-poster
  bundle: ops-expanded-2026-09-06
  upstream-slug: photo-to-poster
  upstream-displayName: 照片秒变画报
  upstream-summary: 将任意照片转化为极简编辑插画画报风格，ImageGen 一次性生成完整海报，脚本上下拼接展示。
  upstream-version: 3.2.0
  upstream-tags: '["图像生成", "照片转插画", "画报风格", "minimalist", "editorial-poster", "ImageGen"]'
  upstream-agent_created: 'True'
  upstream-trigger: '{"keywords": ["照片转画报", "图片变插画", "照片秒变画报", "photo to poster", "生成画报风格", "照片转编辑插画", "极简画报", "editorial poster", "minimalist illustration"], "patterns": [".*照片.*(转|变|生成).*(画报|插画|海报).*", ".*(图|图片|照片).*(编辑|editorial).*(风|风格).*", ".*photo.*(to|into|transform).*poster.*", ".*generate.*editorial.*illustration.*from.*photo.*"], "priority": "high"}'
  upstream-disable: 'False'
  upstream-metadata: '{}'
license: MIT
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# photo-to-poster · 照片秒变画报

> 将任意照片转化为极简编辑插画画报风格的 Prompt 生成器。
> v3.2 核心约束：在 v3.0 「海报就是一张完整画」基础上，新增 **「主体绝对不
> 能被矩形框住」** 铁律——**无论原图是横版、竖版、方形还是任何其他比例**，
> 所有主体边缘（上下左右全部方向）都必须自然晕染/渗透进奶油色背景，杜绝任
> 何方向直线切割的"贴纸感"与矩形边界感。其他保持 v3.0 不变：所有标题、署
> 名、装饰元素都由 ImageGen 在画内一次性完成；拼接脚本只做「原图在上、海报
> 在下」的纯净排版，不再二次叠加任何文字或色块。

---

## 参考版式（1:1 复刻的锚点）

下面这张是 Skill 的视觉锚点。所有生成的海报都要在版式、留白、字体位置上
忠实还原它：

```
┌─────────────────────────────────────┐
│                                     │
│         [上半部分：原图]              │
│         （保持照片原始比例）           │
│                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                     │
│         [下半部分：海报画]            │
│                                     │
│      纯色背景（奶油色 #F5F0E8）       │
│      大量留白（留白 > 主体）           │
│                                     │
│           [主体：抽象元素]            │
│         居中或略偏上                   │
│                                     │
│                                     │
│         Water Between Trunks         │   ← 英文标题，衬线体，居中
│                                     │
│                                     │
│     （无副标题、无色卡——参考图没有）   │
│                                     │
└─────────────────────────────────────┘
```

**关键约束**：
1. 整张图分上下两部分：上 = 原图，下 = 海报。
2. 海报**不依赖**任何外部文字叠加——标题由 ImageGen 画进海报内部。
3. 标题在海报**主体下方居中**，不是整张画面的最底部。
4. 参考图 1 中**没有副标题和色卡**，所以默认不画。
5. 严格 1:1 复刻，**不加入任何额外装饰**（不画色卡、不加副标题、不画 Logo 等）。

---

## 执行流程（Agent 调用时严格按此顺序执行）

```
接收用户照片/场景描述
        │
        ▼
Step 1 · 场景分析
    - 识别照片中的核心元素（主体、结构、氛围）
    - 判断整体色调倾向（暖/冷/中性）
    - 判断光线氛围（明亮/昏暗/蓝调时刻）
        │
        ▼
Step 2 · 元素抽象（按三层体系）
    - 对每个元素分配抽象层级（焦点/结构/氛围/人物）
    - 按对应规则选择转化手法
        │
        ▼
Step 3 · 质感选择（双轨制）
    - 判定各元素适用平涂 or 水彩晕染
    - 同一幅画可混合使用两种质感
        │
        ▼
Step 4 · 色彩提取
    - 从原图提取 3-5 个主色
    - 确定背景色（奶油色/米白色 #F5F0E8）
        │
        ▼
Step 5 · 命名
    - 生成 2-4 词的英文诗意标题（"X Between Y" / "Y, Z" 等结构）
    - 不生成副标题（参考图无副标题）
        │
        ▼
Step 6 · 生成完整 Prompt
    - 按 Prompt 模板组装
    - 关键：Prompt 必须明确要求 ImageGen 在画内**底部居中**绘制
      衬线体英文标题（参考图 1 的字体位置）
    - 不要在 Prompt 里要求色卡（参考图 1 没有）
        │
        ▼
Step 7 · 调用 ImageGen 生成海报画（图生图）
    - 使用 ToolSearch 加载 ImageGen 工具 schema
    - 将 Step 6 生成的完整 Prompt 作为 text/prompt 指令
    - 将用户原始照片路径作为 image 参数传入（图生图模式）
    - ⚠️ 提醒用户：每次图片生成消耗约 5-10 credits
    - 等待生成完成，获取海报图本地保存路径（记为 poster_path）
    - 这张 poster_path **本身就是完整的海报**，含主体+标题
        │
        ▼
Step 8 · 拼接为「上原图 + 下海报」并展示
    - 调用 scripts/combine_images.py 拼接脚本
    - 参数：原图路径 + poster_path + 输出路径 + --width
    - **不再传入 --title / --subtitle / --colors**（脚本不再渲染这些）
    - 生成上下结构对比图（奶油色背景、细分割线）
    - 通过 present_files 工具直接展示给用户
```

---

## 核心方法论

### 一、元素抽象三层体系

Agent 在分析照片时，必须将每个视觉元素分配到以下四个类别之一，并应用对应的转化规则：

#### 层级 A · 焦点元素（Focus Elements）

**判定标准**：画面中最吸引注意力的 1-3 个对象，占据视觉中心，色彩或形状最突出。

**转化规则**：
- 保留其基本轮廓，确保在插画中仍可识别
- 极度简化内部细节，只保留外形特征
- 使用纯色块填充，内部无纹理
- 若形状规则（建筑、设施）→ 平涂硬边
- 若形状有机（石头、树冠）→ 水彩晕染软边

**参考案例**：
- 图5 摩天轮 → 空心圆环（保留可识别形状，极度简化）
- 图6 红色小船 → 极简红色小船轮廓（保留可识别形状）
- 图3 石兽头部 → 灰色晕染块（保留头部轮廓，简化面部细节）
- 图2 小店门面 → 深棕/深灰大块（保留门面框架，省略所有商品细节）
- **参考图 1 · 水塘睡莲**：睡莲简化为带白边的小圆/椭圆散布在水面色块上

#### 层级 B · 结构元素（Structural Elements）

**判定标准**：支撑画面构图的线条、块面、框架性元素。

**转化规则**：
- 保留为基本几何形状：长条、矩形、细线、圆形
- 省略所有装饰性细节
- 人物统一归入此类，特殊处理（见下文）

**参考案例**：
- **参考图 1 · 树干**：3-4 根树干简化为深色（深绿/深棕）垂直长条
- 图5 建筑群 → 不同高度灰色矩形色块（保留天际线轮廓）
- 图7 铁栏杆 → 细线条（保留水平结构）

#### 层级 C · 氛围元素（Atmospheric Elements）

**判定标准**：大面积的背景/环境，不直接参与叙事但营造氛围。

**转化规则**：
- 大面积平涂色块或留白
- 用色块的明暗层次暗示光影，不描绘具体细节
- 天空 → 大面积淡色块或留白
- 水面 → 大面积平涂 + 可选晕染倒影
- 地面/草地 → 大面积色块或省略

**参考案例**：
- **参考图 1 · 水面**：单块大色块（橄榄绿/灰绿）作为水面
- 图8 云层 → 淡蓝水彩晕染条（暗示天空氛围）
- 图1 地面 → 留白（省略地面细节）

#### 层级 D · 人物（特殊处理）

**判定标准**：照片中出现的任何人形。

**转化规则（严格统一）**：
- 全部转化为极简深色剪影或小点
- 无面部特征、无服装细节、无姿态细节
- 仅用轮廓暗示"有人存在"
- 颜色统一为深棕/深灰/黑色

**参考案例**：
- 图1 行人 → 小黑点剪影
- 图6 礁石上的人 → 极简小黑点
- 图3 背景人物 → 省略（过小则直接去掉）

---

### 二、质感双轨制

Agent 必须为每个元素选择适用的质感风格。同一幅画中可以混合使用。

| 质感风格 | 适用元素 | 视觉特征 | Prompt 关键词 |
|---------|---------|---------|--------------|
| **平涂风格**（默认） | 人造建筑、几何设施、规则形状、硬边元素 | 纯色填充，边缘清晰锐利，无笔触 | flat color blocks, hard edges, clean geometric shapes |
| **水彩晕染风格** | 有机形态、自然纹理、柔软边缘、云朵水面 | 边缘自然晕染，保留笔触感，色彩交融 | watercolor wash, soft edges, organic texture, ink wash feel |

**混合使用规则**：
- 当画面中同时存在人造建筑和自然元素时，可以混合
- 例：图6 礁石（水彩晕染）+ 红船（平涂）
- 例：图5 建筑群（平涂）+ 水面（水彩晕染）

---

### 三、色彩提取规则

1. **主色提取**：从原图中提取 3-5 个最具代表性的颜色
   - 优先提取大面积出现的颜色（天空、水面、植被、建筑）
   - 保留 1 个 accent 色（最亮眼的小面积颜色，如红船、黄灯）

2. **背景色**：统一使用奶油色/米白色
   - 推荐色值：#F5F0E8、#F7F3ED、#FAF6F0
   - 作用：营造高级感，统一视觉调性
   - **画面的所有留白都填充这个颜色**

3. **人物色**：统一深色
   - 深棕 #5C3A2A、深灰 #4A4A4A、黑色 #2D2D2D

4. **禁用**：
   - 渐变（gradients）
   - 写实阴影（realistic shadows）
   - 高光（highlights）
   - 纹理贴图（textures）

5. **色卡输出**：参考图 1 中**没有色卡**。v3.0 默认不在画中画色卡。
   - 调色板信息通过文字告诉用户即可（Step 4 输出），不要在画里画。

---

### 四、线条策略

| 线条类型 | 处理方式 | 示例 |
|---------|---------|------|
| 结构性线条（树干、栏杆、地平线、建筑边线） | 保留为细线条 | 参考图 1 树干、图7 栏杆 |
| 装饰性线条（花纹、纹理、细节轮廓） | 全部省略 | — |
| 复杂轮廓（树叶边缘、礁石纹理） | 用色块替代，不描边 | 图4 棕榈叶→白线勾勒仅为特例 |

**例外**：当线条本身具有强烈形式感时，可以保留为白线/淡线（如图4 棕榈叶的白线勾勒）。

---

### 五、排版固定模板（v3.0 严格按参考图 1）

参考图 1 的版式是唯一锚点。成品的版式必须**完全一致**：

```
┌─────────────────────────────────────┐
│                                     │
│         [上半部分：原图]              │
│         （保持照片原始比例）           │
│                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │   ← 拼接时画一条细分隔线
│                                     │
│   ┌───────────────────────────┐     │
│   │                           │     │
│   │  [海报区，奶油色背景]        │     │
│   │                           │     │
│   │      主体居中（人或物）      │     │
│   │      大面积留白环绕          │     │
│   │                           │     │
│   │      "Title Text"          │     │   ← 英文衬线体标题
│   │                           │     │      居中
│   │                           │     │      位于主体正下方
│   │                           │     │
│   └───────────────────────────┘     │
│                                     │
└─────────────────────────────────────┘
背景色（整个画布）：奶油色 #F5F0E8
```

**排版铁律**：
1. **整体结构** = 上（原图）+ 下（海报），中间一条细分隔线。
2. **海报本身** = 一张 ImageGen 一次性输出的完整画，**含主体+标题**。
3. **标题位置** = 海报**主体正下方**居中（参考图 1 的位置），不是整张画面的最底部。
4. **留白** = 海报内留白面积 > 主体面积；整个画布也是奶油色大留白。
5. **绝对禁止** = 在海报图**之外**再渲染任何文字、色块、Logo——这是 v2.0 出现重复输出的根源。
6. **参考图 1 没有的** = 副标题、色卡、Logo、装饰边框、水印、署名——一律不画。
7. **标题字体** = 优雅衬线体（elegant serif），深灰/近黑（不是纯黑）。
8. **主体边界（v3.1 新增，v3.2 泛化至所有比例）** = 主体外轮廓禁止呈现矩
   形——**无论原图是横版、竖版还是方形**，所有边缘（上下左右）必须晕染、退
   毛、断笔或飞白进奶油色背景；横图主体的下边缘不得出现贯穿左右的水平直线，
   竖图主体的顶边/底边/左右轮廓同样不得出现贯穿直线，方形主体四条边全部需有
   机溶解。禁止任何方向的矩形边界感（详见第八章「主体边界处理」）。

---

### 六、标题命名规则

**主标题**（**唯一**文字元素，必须在 Prompt 中显式要求 ImageGen 画在海报内）：

- 语言：**英文**
- 长度：2-4 个词
- 风格：诗意、意象化、描述场景核心氛围
- 结构：常用 "[名词] + [介词短语]" 或 "[形容词] + [名词]"
- 位置：海报**主体正下方**居中
- 字体：elegant serif typography，深灰/近黑色
- 例：
  - "Water Between Trunks"（树干间的水）— 参考图 1
  - "Gold Between Branches"（树枝间的金色）
  - "A Shop of Small Lights"（一家灯火小店）
  - "Blue Hour Harbor"（蓝调港湾）
  - "Red Boat, Open Water"（红船，开阔水面）
  - "Ride at Rest"（静止的游乐设施）
  - "Clouds Over Quiet Water"（静水之上云卷云舒）
  - "Under Still Branches"（寂静枝桠之下）
  - "Bridges Between Hours"（小时光里的桥）
  - "Lanterns on Slow Water"（慢水上的灯笼）

**副标题**：v3.0 默认**不画**。如用户明确要求可加，但仍由 ImageGen 在画内绘制（不依赖脚本）。

**色卡**：v3.0 默认**不画**。如用户明确要求可加，但仍由 ImageGen 在画内绘制（不依赖脚本）。

---

### 七、图片生成与拼接（自动执行，v3.0）

> v3.0 重大变更：本 Skill 生成的海报**一次性就是完整的**——ImageGen 在画
> 内画好主体+标题；拼接脚本**只做上下排版**，不再二次叠加任何元素。
> 这是为了彻底根除"标题/色卡重复输出"的问题。

#### 7.1 调用 ImageGen（图生图）— 输出**完整海报**

**工具加载**：ImageGen 是延迟加载工具，必须先通过 `ToolSearch` 加载 schema，
再用 `DeferExecuteTool` 调用。

```
ToolSearch → tool_names: ["ImageGen"]
DeferExecuteTool → toolName: "ImageGen"
  params:
    prompt: <Step 6 生成的完整 Prompt，含「在画内底部居中绘制衬线体英文标题」>
    image:  <用户原始照片的绝对路径>   # 图生图模式
```

**关键规则**：
1. **必须传入 image 参数**：将用户原始照片作为参考图，确保生成结果忠实还原
   原图的构图、色调与核心元素——这是"完美还原参考图片"的核心保障。
2. **Prompt 必须显式要求 ImageGen 在画内绘制标题**：
   - 位置：海报**主体正下方**居中
   - 字体：elegant serif typography
   - 颜色：深灰/近黑
   - 例句：`elegant serif title "{title}" centered directly below the subject`
3. **Prompt 不要要求色卡、副标题、边框**——参考图 1 没有这些东西。
4. **Credit 消耗提醒**：调用前必须告知用户"每次图片生成约消耗 5-10 credits"，
   获得用户确认后再执行。
5. **获取输出路径**：ImageGen 生成后返回图片本地保存路径，记为 `poster_path`。
   **这张 poster_path 本身就是完整的海报**（含主体+标题），供 Step 8 拼接使用。

#### 7.2 运行拼接脚本 — 只做上下排版，**不再渲染文字**

**脚本路径**：`scripts/combine_images.py`（位于本 Skill 目录下）

**运行方式**：

```bash
<python_path> <skill_dir>/scripts/combine_images.py \
  <original_path> <poster_path> <output_path> \
  --width 1024
```

**v3.0 重要变更**：
- **不要**再传入 `--title` / `--subtitle` / `--colors`。
- 脚本会**忽略**这些参数（保留参数仅为向后兼容），不再渲染任何文字/色块。
- 这是为了避免与海报内部的标题重复输出。

**Python 运行时**：
- 优先使用 managed Python：`C:\Users\EDY\.workbuddy\binaries\python\envs\default\Scripts\python.exe`
- 脚本依赖 Pillow（已预装于 managed venv）

**脚本功能**（v3.0 简化版）：
1. 加载原图与海报图，统一缩放至目标宽度（默认 1024px）
2. 创建奶油色背景画布（#F5F0E8）
3. 原图贴入上半部分，海报贴入下半部分，中间留分隔间距
4. 在两部分之间画一条 1px 细分隔线
5. 输出最终对比图 PNG 文件

**输出路径约定**：保存到工作区 outputs 目录或用户指定路径，如
`<workspace>/outputs/poster_comparison_<timestamp>.png`

#### 7.3 展示结果

拼接完成后，通过 `present_files` 工具将最终对比图展示给用户，确保用户可以
直接查看「上原图 + 下海报」的效果。

---

### 八、主体边界处理（v3.1 新增，v3.2 泛化至所有比例 · 关键）

> 这一章是 v3.1 引入、v3.2 全面泛化的核心约束。解决**所有比例的图片**（横
> 版、竖版、方形等）生成为什么"看起来像被塞进矩形框"的问题。

**问题诊断**：参考图（"Slopes in Silence" 等）的水彩山体底边是**不规则晕染**
的——颜料顺着画纸往下渗、散开、与奶油色背景自然交融。但当前生成的主体边缘
（无论横版竖版）往往是一条**干净的直线**，让整个主体看起来像被裁切的矩形贴
纸贴在画布上，丢失了"手绘 + 高质感"的感觉。v3.1 仅针对横图底边做了约束，
v3.2 将此约束**泛化至所有图片比例的所有边缘方向**——竖版图片同样会出现顶
边/底边/左右轮廓的矩形感，方形图片四条边都可能形成硬边，均需杜绝。

**铁律三条**：

1. **主体绝对不能被矩形框住——适用于所有图片比例**
   - 无论原图是横版（landscape）、竖版（portrait）、方形（square）还是任何
     其他比例，主体外轮廓都禁止呈现矩形
   - 禁止任何隐含的「上下底边 + 左右立边 = 矩形」轮廓
   - 没有水平的下边缘直线、没有竖直的左右边界、没有水平的顶部封口
   - **没有任何一个方向的边缘可以是贯穿的硬直线**

2. **所有边缘（上下左右）必须自然融入奶油色背景**
   - 像湿水彩渗入干纸：边缘晕开、起毛、断笔
   - **横图主体**（mountain / skyline / sea horizon）的**底边**必须用
     watercolor wash / 散开的笔触 / 飞白 溶解掉
   - **竖图主体**（tall building / standing figure / vertical tree）的
     **顶边和底边**同样必须溶解，**左右轮廓**也必须渐隐/退晕进奶油色
   - **方形主体**的四条边全部需要有机溶解，不得有任何一条保持直线
   - 禁止出现任何方向的贯穿硬直线作为主体边缘

3. **整体剪影必须"手绘且自由"——不受原图比例约束**
   - 无论原图是横长、竖长还是方形构图，最终海报中的主体轮廓都应有起伏、
     缺口、退晕
   - 单个内部元素（如建筑、窗户、船）可以是矩形；但**主体外轮廓**不可以
   - 想象一个水彩画家拿笔在奶油色画纸上随手画了一组对象——他不会先画框
     再填色，他会边画边渗

**实现要点（写入 Prompt 的语言）**：

| 场景类型（含横版/竖版/方形） | 边缘处理关键词 |
|----------------------------|--------------|
| 山体 / 森林 / 海岸（横版常见） | `bottom edge dissolved with soft watercolor wash and irregular dabs, no straight horizontal line` |
| 城市天际线（横版常见） | `skyline base bleeding into cream with feathered watercolor wash, scattered brush marks` |
| 海平面 / 湖面（横版常见） | `water surface fading into cream with soft misty edge, no hard horizon line` |
| 横向静物 / 街景（横版常见） | `subject edges broken with white-space gaps and soft feathered contours` |
| 高楼 / 竖构图建筑（竖版常见） | `top and bottom edges dissolved into cream, vertical sides tapering and feathered, no straight vertical rails` |
| 站立人物 / 雕像（竖版常见） | `silhouette edges fading organically on all sides, top and bottom dissolved with soft wash` |
| 竖向树木 / 柱状物（竖版常见） | `trunk top fading into cream, base dissolving with irregular dabs, sides tapering softly` |
| 方形构图 / 中心对称主体（方形常见） | `all four edges feathered and broken into cream, no straight line on any side` |

**反例（绝对禁止）**：

```
横版 — [ ❌ 错误示范 ]                       [ ✅ 正确示范 ]
                                          ─────── irregular feathered edge
┌─────────────────────────┐               ░░░▒▒░██▒░░██▓░ ▒
│      Mountain Body       │   → 改为 →   ░▒███▓██▓█▓░ ▒░░
│     (clean rectangle     │               ░▓██▓███▓█▓░░   ← wash
│      bottom edge)        │               ░░░▒██▓▓▒░░
└─────────────────────────┘               ─ ─ ─ irregular dabs
                                         (bleeding into cream)

竖版 — [ ❌ 错误示范 ]                       [ ✅ 正确示范 ]
┌───────┐                                 ~ ~ ~ ~ feathered top
│       │                                 ░░▒▓██▓░░
│ Tower │           → 改为 →              ▒▓███▓▒░ ← sides
│       │                                 ░▓██▓▒░░   tapering
│       │                                 ░░▒▓▓░░░
└───────┘                                 ~ ~ ~ dissolved base
(rectangle:                              (all edges organic,
 straight sides +                             no straight lines)
 flat top/bottom)
```

---

## Prompt 模板（v3.0 · ImageGen 一次性输出完整海报）

### 标准模板

```markdown
Minimalist editorial poster illustration, on a solid cream background (#F5F0E8).
Single complete poster artwork, generous negative space, Japanese minimalism
meets Scandinavian design aesthetic.

Scene: {scene_description}

Subject abstracted (centered, occupying middle third of the canvas):
{focus_element_1}: {abstraction_description_1}
{focus_element_2}: {abstraction_description_2}
{structural_elements}: {structural_abstraction}
{atmospheric_elements}: {atmospheric_abstraction}
{people}: reduced to minimal dark silhouettes / small dots

Style treatment:
- {texture_style: flat color blocks with hard edges / watercolor wash with soft organic edges / mixed}
- Extremely limited color palette: {color_1}, {color_2}, {color_3}, {color_4}
- No gradients, no realistic shadows, no highlights
- No color swatches, no border, no logo, no extra UI elements
- Background is a single flat cream tone (#F5F0E8), no patterns

Edge & boundary (CRITICAL — 主体不能被矩形框住，适用于所有图片比例):
- The subject must NOT be enclosed in any implied or visible rectangular bounding box
  (no straight horizontal bottom edge, no vertical side rails, no top cap)
- This rule applies to ALL image orientations: landscape (horizontal), portrait
  (vertical), square, and any other aspect ratio — no exceptions
- Subject edges must bleed / fade / break organically into the cream background,
  like wet watercolor seeping into dry paper — not like a sticker pasted on a card
- Vertical edges (sides of buildings / rocks / trees / vertical subjects): let
  them taper, fade, or break into cream with feathery irregular contours —
  especially important for portrait / vertical compositions where the subject
  is tall and narrow
- Horizontal edges (the bottom of a mountain, the base of a skyline, the top of
  a building): must be dissolved with soft watercolor wash, scattered brush dabs,
  or negative-space gaps — NEVER a clean straight horizontal line
- For landscape / wide compositions (mountain, sea horizon, city skyline):
  dissolve the bottom edge as a watercolor bleed with irregular dabs, fog,
  splash marks, or feathered fade — not a geometric baseline
- For portrait / tall compositions (tall buildings, standing figures, vertical
  trees): dissolve BOTH the top and bottom edges, and let the side contours
  taper / feather into cream — never a clean vertical rectangle
- For square compositions: apply the same organic edge dissolution on all four
  sides — the subject should feel like it floats in cream, not like it was
  pasted into a box
- Individual elements inside the subject may still be simple rectangles
  (windows, cards, boats), but the overall silhouette of the whole subject
  must feel hand-painted and free, never carded or framed

Typography (drawn inside the poster, do NOT add anything else):
- One single elegant serif title "{title}" centered horizontally
- Title is positioned DIRECTLY BELOW the subject, in the lower third of the
  poster, with comfortable margin on all sides
- Title color: deep gray, almost black (#2D2D2D)
- Title font: elegant serif typography (similar to Times, Garamond, or Didot)
- No subtitle, no caption, no swatches, no signatures, no watermark

Overall mood: {mood_description}
Reference: the editorial poster series by xhs "photo to poster" — specifically
the "Water Between Trunks" composition (cream background, abstract subject
centered, serif title directly below the subject, lots of white space).
```

### 紧凑版 Prompt（直接可用）

```markdown
Minimalist editorial poster on a solid cream background (#F5F0E8).
{scene_summary}.
{subject_abstraction}.
CRITICAL edge rule (applies to ALL orientations — landscape, portrait, square,
any ratio): the subject must NOT be enclosed in a rectangle. ALL edges — top,
bottom, left, right — must bleed / fade / break organically into the cream
background like wet watercolor seeping into paper. Never a clean horizontal
bottom line, never straight vertical sides, never a sharp top edge. For wide
subjects, dissolve the bottom edge; for tall subjects, dissolve top and bottom
and taper the sides; for square subjects, feather all four sides.
Limited palette: {color_1}, {color_2}, {color_3}, {color_4} on cream.
{texture_desc}. No gradients, flat color blocks, generous white space,
Japanese minimalism, Scandinavian editorial aesthetic.
Inside the poster, draw exactly one elegant serif title "{title}" in deep
gray, centered horizontally and positioned directly below the subject.
No subtitle, no swatches, no border, no signature.
```

### Prompt 硬性红线

Agent 在拼装 Prompt 时**必须**保证：

| 必须有 | 禁止出现 |
|--------|---------|
| "solid cream background (#F5F0E8)" | "color swatches" |
| "centered subject" | "subtle subtitle" / "italic subtitle" |
| "subject edges bleed / fade into cream" | "rectangular subject" / "boxed subject" / "framed subject" |
| "all edges dissolved (any orientation)" | "portrait exception" / "square exception" / "only landscape" |
| "irregular / feathered / dissolved bottom edge" | "clean horizontal bottom line" / "straight baseline" |
| "elegant serif title '...'" | "bottom right color swatches" |
| "title directly below the subject" | "logo" / "watermark" / "signature" |
| "deep gray" / "almost black" title | "frame" / "border" / "decorative line" |
| "generous white space" | "multiple titles" / "title repeated" |
| "no gradients" | "realistic shadow" / "highlight" |
| "Japanese minimalism" | "complex" / "detailed" |

---

## 完整示例

### 示例 1 · 参考图 1 · 水塘睡莲与树干（自然风景）— 标准范本

**原图描述**：夏日水塘，三四根树干直立，水面浮着睡莲，背景是浓密的树叶。

**元素分析**：
- 焦点：树干（结构）、睡莲（焦点）
- 结构：树干作为垂直长条
- 氛围：水塘作为大色块
- 人物：无

**Prompt**：
```
Minimalist editorial poster on a solid cream background (#F5F0E8).
A still pond scene abstracted as a single large olive-green color block in
the middle of the canvas. Three or four dark vertical tree trunks rendered
as deep green/charcoal long rectangles rising through the pond. Lily pads
abstracted as clusters of small pale circles with thin white outlines
scattered on the water surface. A single small palm-frond silhouette in
white outline on the left side.
Limited palette: olive green #8A9468, deep charcoal #2D3A2A, soft white
#F0EBE0, warm brown #6B5A3A, on cream #F5F0E8.
Flat color blocks, hard edges, no gradients, no realistic shading, no
textures. Generous white space, Japanese minimalism, Scandinavian editorial
aesthetic.
Inside the poster, draw exactly one elegant serif title "Water Between
Trunks" in deep gray, centered horizontally and positioned directly below
the subject. No subtitle, no swatches, no border, no signature.
```

**预期效果**：纯奶油色背景，几根深色树干居中，水面是橄榄绿大色块，睡莲是
白色圆点散布，标题"Water Between Trunks"在主体正下方居中。

---

### 示例 2 · 城市日落天际线（城市建筑）

**原图描述**：黄昏城市，多座建筑剪影，桥梁横跨河流，天空橙红渐暗。

**元素分析**：
- 焦点：桥梁（结构）、建筑群（焦点）
- 结构：建筑群天际线
- 氛围：天空、水面
- 人物：无

**Prompt**：
```
Minimalist editorial poster on a solid cream background (#F5F0E8).
A blue-hour cityscape abstracted into a horizontal band of dark gray and
navy building silhouettes of varying heights in the middle of the canvas.
A bridge rendered as a row of small arch shapes crossing a flat blue-gray
water band below the buildings. A soft warm peach band above the buildings
suggesting the after-sundown sky.
Limited palette: navy gray #3A4A5A, deep navy #2A3A4A, soft peach #E8B89A,
warm beige #D4B89A, on cream #F5F0E8.
Flat color blocks, hard edges, no gradients, no realistic shading, no
textures. Generous white space, Japanese minimalism, Scandinavian editorial
aesthetic.
Inside the poster, draw exactly one elegant serif title "Bridges Between
Hours" in deep gray, centered horizontally and positioned directly below
the subject. No subtitle, no swatches, no border, no signature.
```

---

### 示例 3 · 海边红船礁石（自然+人造混合）

**原图描述**：海边红色礁石，远处红色小船，几个人影，开阔海面。

**元素分析**：
- 焦点：红色小船（焦点）、红褐色礁石（焦点）
- 结构：海岸线
- 氛围：海面、天空
- 人物：礁石上的人

**Prompt**：
```
Minimalist editorial poster on a solid cream background (#F5F0E8).
A coastal scene abstracted into a single rust-brown rock mass as a soft
watercolor wash in the lower middle of the canvas. A small red boat as a
minimal red silhouette on the water to the right. Tiny dark human figures
as small black dots on the rocks. The sea and sky as flat color bands.
Limited palette: rust brown #B8723D, deep red #C44536, ocean blue #5B8DB8,
sand beige #D4C4A8, on cream #F5F0E8.
Mixed style: watercolor wash for rocks, flat color for boat.
No gradients, soft organic edges on rocks, clean edges on boat. Generous
white space, Japanese minimalism, Scandinavian editorial aesthetic.
Inside the poster, draw exactly one elegant serif title "Red Boat, Open
Water" in deep gray, centered horizontally and positioned directly below
the subject. No subtitle, no swatches, no border, no signature.
```

---

## 反模式清单（Anti-patterns）

Agent 遇到以下场景时，应主动提示用户本 Skill 不适用：

| 反模式 | 原因 | 建议 |
|--------|------|------|
| **纯抽象/艺术照片** | 无明确可识别元素，无法提取焦点 | 建议直接使用抽象艺术风格 Prompt |
| **极端微距特写** | 主体占满画面，缺乏构图层次 | 建议退远拍摄或选择其他风格 |
| **高动态运动照片** | 冻结瞬间的动作感无法转化为静态插画 | 建议先用运动模糊风格处理 |
| **低对比度/过曝照片** | 色彩信息缺失，无法提取有效主色 | 建议先调整照片对比度 |
| **文字密集照片** | 画报风格不适合处理文字内容 | 建议去掉文字区域后再处理 |
| **人像特写/肖像** | 人物作为焦点时，极简剪影会丢失核心信息 | 建议明确告知本风格会极度简化面部特征 |
| **要求"画外加副标题"** | v3.0 起所有文字都在画内 | 引导用户用主标题表达核心氛围 |
| **要求"画外加色卡"** | v3.0 起不画色卡 | 调色板用文字告诉用户 |

---

## v2.0 → v3.0 变更摘要

| 维度 | v2.0 | v3.0 |
|------|------|------|
| 海报完整度 | ImageGen 只画主体；脚本补标题+色卡 | ImageGen **一次性画完整海报**（含主体+标题） |
| 标题位置 | 整张画面的最底部 | 海报**主体正下方**居中 |
| 副标题 | 可选（脚本渲染） | 默认不画 |
| 色卡 | 右下角 4 个方块（脚本渲染） | 默认不画 |
| 拼接脚本职责 | 上下排版 + 渲染文字色卡 | **只做上下排版**（文字/色块已废弃） |
| 主要问题 | 标题和色卡**重复输出**（v2.0 已知 bug） | **已根治**：单一来源 = ImageGen |
| 参考锚点 | 8 张分散参考图 | 1 张主参考图（Water Between Trunks）+ 7 张辅助 |

---

## v3.1 → v3.2 变更摘要

| 维度 | v3.1 | v3.2 |
|------|------|------|
| 主体边界约束范围 | 仅针对**横版图片**的底边直线问题 | **泛化至所有比例**（横版/竖版/方形/任意比例）的所有边缘方向 |
| 竖版图片处理 | 未明确约束（假设竖版无此问题） | 明确约束：顶边、底边、左右轮廓均须有机溶解 |
| 方形图片处理 | 未提及 | 明确约束：四条边全部需 feathered/broken |
| Prompt 模板 Edge 部分 | 仅提到 landscape composition 的底边处理 | 增加 portrait/square 专项指引，覆盖所有方向 |
| 实现要点表 | 仅 4 种横版场景 | 扩展至 8 种场景（含竖版 3 种 + 方形 1 种） |
| 反例图示 | 仅横版矩形示例 | 增加竖版矩形示例对比 |
| 硬性红线表 | 未包含全比例约束行 | 新增 "all edges dissolved (any orientation)" 红线 |

---

## 适用边界

- **适用**：风景、街拍、建筑、静物、有明确场景构图的照片
- **最佳**：有清晰前景-中景-背景层次、色彩对比度适中的照片
- **不适用**：纯抽象、极端特写、文字为主、运动模糊照片

---

## 素材来源

本 Skill 基于小红书用户分享的「照片转画报」系列作品提炼：
- **主参考图**：水塘棕榈睡莲（"Water Between Trunks"）— 版式锚点
- 辅助参考：秋日公园银杏、夜晚小店门面、石兽与绿树、港湾天际线、
  海边红船礁石、游乐园设施、湖面云层

---

## 自检句

执行本 Skill 前，Agent 必须默念：

> 「本次任务 = 照片转画报，已加载 photo-to-poster skill v3.2。
> 核心约束（v3.0）：海报由 ImageGen **一次性输出完整画面**（含主体+英文衬线
> 体标题），脚本只做「上原图 + 下海报」的纯净排版，**绝对不再渲染任何文字或色
> 块**，避免出现 v2.0 的标题/色卡重复问题。
> 核心约束（v3.1 → v3.2 泛化）：**主体绝对不能被矩形框住——无论原图是横版、
> 竖版、方形还是任何比例**。所有边缘（上下左右全部方向）必须用水彩晕染 / 散
> 开笔触 / 飞白溶解掉，禁止出现任何方向的贯穿直线；边缘要自然渗透进奶油色背
> 景，禁止任何隐含的矩形轮廓。Prompt 必须显式要求标题在主体正下方居中，禁止
> 副标题、色卡、边框、签名。」

---

## 回滚提示

如果用户明确要求"恢复 v2.0 行为（脚本画标题+色卡）"：
1. 修改 `scripts/combine_images.py` 中被注释掉的渲染逻辑（备份在 git 历史中）
2. 修改 SKILL.md 把"v3.0"改回"v2.0"，恢复原排版规则
3. Prompt 模板移除"title inside poster"要求

但默认行为是 v3.0，不建议回滚。
