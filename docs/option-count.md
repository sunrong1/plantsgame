# 选项数递进规则（难度阶梯）

> **这份文件是什么**：「一张卡给孩子几个选项」的**规则正文** —— 档位表、三条性质、
> 机器实现与守卫清单、以及**人人可复算**的逐单元表。
>
> **机器实现**：`src/content/option-count.ts`（纯函数 `targetOptionCount(unitNumber, kind)`）。
> **守卫**：`tests/content/option-count.test.ts`（G262 / G263 / G265 / G266）+
> `tests/content/unit-01.test.ts` 的 **G264**（规则与单元 1 真实内容一致）+
> `tests/scripts/validate-content.test.ts` 的 **G267 – G269 / G271 – G276**（校验脚本抓各类错）+
> `tests/components/option-grid-layout.test.ts` 的 **G270**（版式不再写死四列）+
> 📎 `tests/content/option-count-doc.test.ts` 的 **G342**（**本文件**的数字 ↔ 实算值：
> §1.1 档位表、§3 逐单元表、§4.1 的卡内编辑距离明细 —— 2026-10-28 `[CR]` 第二轮补上）。
>
> 🔥 **两者不一致时以 `src/content/option-count.ts` 为准，并必须回改本文件。**
> 理由与 `docs/card-distribution.md` 同款：守卫守的是代码，**正文没有守卫** ——
> 一份与代码不符的正文会安静地误导所有读者，而它自己不会红。
> 本文件的每个数字都必须能从代码复算出来（§3 给出了复算方法）。

---

## 1. 规则

**一句话**：一张卡给孩子几个选项，由「这个单元落在哪一档」×「这张卡是什么卡型」决定；
越靠后的单元，选项数越多 —— 但**始终是整数**，且**档内同值**。

⚠️ **本规则管的是「选项数」，不是「卡型占比」。** 两者是**两条独立规则**，
互不引用数字：卡型占比不决定选项数，选项数也不反推占比。
（卡型占比规则见 [`docs/card-distribution.md`](card-distribution.md)。）

### 1.1 档位表

| 档 | 单元 | 单词 `word` | 关键词 `keyword` | 回应 `response` |
|---|---|---|---|---|
| **1** | 1–4 | **2** | **2** | **3** |
| 2 | 5–10 | 3 | **3** | 4 |
| 3 | 11–24 | 4 | 4 | 4 |

**档 1 的三个数（2 / 2 / 3）是实测值** —— 它们等于内容改完之后
`src/content/units/unit-01.json` 的真实取值（守卫 **G264** 逐卡核对，零容差）。
理由：GDD 逐字写「早期关卡可从 **2 个选项**起步」，而单词卡是难度阶梯的起点
（FR15，也是单元 1 里 6 张中的 2 张）⇒ 那个 2 必须真的出现在档 1 的单词卡上。

⚠️ **`keyword` 是 2 而不是 3**（Story 2.10 / 换源批次）：教材版单元 1 只有
**2 个教材词**（`morning` / `afternoon`），而关键词卡是「听句取词」——
干扰项**必须取自教材词表** ⇒ keyword 卡最多只能有 2 个选项；
硬凑第三个会撞「干扰项不得凭空造词」的 AC。
⚠️ **这个 2 不是被近邻阈值逼出来的**：实测这一对选项归一化后的编辑距离是 **7**
（见 §4.1）⇒ 离阈值 2 还差得远 ⇒ **真正的原因是教材词表只有 2 个词**。

⚠️ **档 2 / 档 3 的六个数（3/3/4、4/4/4）没有试玩数据背书**，
是「符合 GDD 方向、且保守」的**占位值** —— 属**需要人审的产品数字**（R-20 的精神）。
Story 2.9 的试玩验收与 Story 3.x 的调优才是它们的真值来源。

⚠️📎 **档 2 的 `keyword` 由 4 改为 3（2026-10-28，Story 2.6 实测更正）**：
这**不是难度口味**，是**教材词表供给顶住的上界**。关键词卡是「听句取词」，
选项**必须取自本单元的教材词表**，而卡内两个选项归一化后编辑距离 ≤ 2 即违规
（`scripts/validate-content.ts` 的 `NEAR_DUPLICATE_MAX_DISTANCE = 2`）
⇒ **该单元词表里能凑出的「互不近似」词数**就是关键词卡选项数的上界。
实测（校验器的归一化 / 编辑距离口径，穷举最大互不近似子集）：
单元 5 的词表是 5 个词（`grandmother` / `grandfather` / `father` / `mother` / `me`），
其中 `grandmother` ~ `grandfather` = **2**、`father` ~ `mother` = **2**
⇒ 两对各自互斥 ⇒ **任何 4 个词的子集都含一对近邻** ⇒ 四选一在数学上无解。
同档的单元 8（`pear` ~ `peach` = 2）同样是 3 ⇒ **档 2 的上界 = 3**。
⇒ 这与档 1 的 `keyword = 2`（单元 1 只有 2 个教材词）是**同一条先例**：
**一档的选项数不能超过该档里任一单元的教材供给** ⇒ 档位值取该档供给的最小值。
⚠️ **代价（须如实登记）**：单元 6 / 7 的词表撑得住 4 个互不近似的词，
改档后它们的关键词卡少一个干扰项 ⇒ **难度略降**，方向对 4–8 岁的孩子是保守的；
Story 2.9 的试玩验收可据此回调。
⚠️ **档 3（11–24）的 `keyword = 4` 已知撑不住**：实测单元 16（`ball` ~ `doll` = 2）、
单元 22（`play` ~ `fly` = 2）、单元 24（词表只有 3 个词）的供给上限都是 **3**
⇒ 那三个单元交付时必须把档 3 的 `keyword` 同样下调，或另立规则
⇒ 已登记为延后条目 **DF-223**，归 Story 2.8（单元 14–24）裁决。

⚠️ **改这九个数字 = 改难度曲线的一个点，属产品裁决**（R-20 / R-57）：
必须同时改 `src/content/option-count.ts` 与本文件，并让 G262–G270 重跑。

### 1.2 档位边界

**1–4 / 5–10 / 11–24** ＝ FR63 的**阳光档位**划分（`src/core/balance.ts` 的
`BALANCE_TIERS` 的单元区间）—— **全书唯一的分段口径**：再造一座「选项数专用」的
阶梯，等于让同一个「第几关」在两个文件里各有一套分界，改一边忘另一边 ⇒
难度曲线会在没人看的地方偏出去。

⚠️ **内容层不得 import core**（R-10 + `tests/content/content-boundary.test.ts` 的源码兜底）
⇒ `src/content/option-count.ts` 里的边界**只能逐字写一遍**。
解法不是破例 import，而是**在测试层比对两张表**：守卫 **G265** 断言
「内容层的档位边界 === `BALANCE_TIERS` 的档位边界」⇒ 档数与区间**双向**钉，
漂移无处藏身。

### 1.3 三条性质

1. **逐档单调不减**：越靠后的档，选项数不减少（每个卡型各自成立）。
2. **档内同值**：同一档内所有单元同值 —— 这是「档位表」的定义，不是额外规则。
3. **档内卡型不降**：`word ≤ keyword ≤ response`（难度沿 FR15 的阶梯递增：
   单词卡是认词层，关键词与回应卡是句 / 对话层，更难）。

⚠️ **「无断崖」不是本规则的性质** —— 那是 `docs/card-distribution.md`（卡型占比）的 AC。
本规则在第 4→5 单元、第 10→11 单元各有一次**值跳变**（例如单词卡 2 → 3），
这不违反本 story 的 AC。若将来要平滑，只能**加档**（4 档 / 5 档），不能改成插值 ——
选项数是整数，插值出来的 2.37 落到卡上只能四舍五入，于是「整数化」会变成
**第二个事实源**。

---

## 2. 性质与守卫（每条都有守卫，每个守卫都有能打中它的变异）

| 性质 / 覆盖面 | 判据 | 守卫 | 变异实测（整轮 **2244 条**） |
|---|---|---|---|
| **规则可计算 + 覆盖** | 单元 1..24 每个单元、每个卡型都得出 ∈ [2,4] 的整数；`0` / `25` / 非整数**抛错**；**不在表里的卡型（含原型链上的名字）也抛错** | **G262** | M308（档 1 word 2→3）**7 红**、M310（档 2 区间改成 4–10，与档 1 重叠）**13 红**、M311（越界抛错改成静默回退）**3 红**、**M319**（`hasOwn` 改回 `counts[kind] === undefined` ⇒ 原型链上的 `toString` 被当成选项数）**1 红** |
| **三条性质** | ① 逐档不降 ② 档内同值（**且档位区间连续覆盖 1..24**，不跳档）③ 档内卡型不降（且**至少有一档真的上升**） | **G263** | M309（档 2 keyword 4→2，同时打破 ① 与 ③）**3 红**；⚠️📎 2026-10-28（Story 2.6）档 2 的 keyword 实测改为 **3** ⇒ **复现这条变异时按 3→2**（§1.1） |
| **规则 ↔ 真实内容** | 单元 1 每张卡的选项数 === 规则算出的档 1 目标值（逐卡核对，**零容差**） | **G264** | M308**7 红**（含 G22 的期望图片选项数 —— 它由规则算出，所以跟着红） |
| **档位边界跨层一致** | 内容层的档位边界 === `BALANCE_TIERS` 的档位边界（**档数**与**区间**都要比） | **G265** | M315（档 1 区间 1–4 → 1–3、档 2 5–10 → 4–10）**3 红** |
| **档位表结构** | 空表 / 区间倒置 / 区间重叠**一律抛错**；档位表与返回对象**逐层 `Object.freeze`** | **G266** | M310（区间重叠）**13 红**、M316（去掉 `Object.freeze`）**1 红** |
| **校验脚本抓选项数错** | 单元 1 的卡选项数与规则不符 ⇒ 报 `option-count`（带 `entryId` 与期望 / 实际值） | **G267** | M312（`optionCountProblems` 恒返回 `[]`）**2 红** |
| **校验脚本抓近邻选项** | 卡内两个**文字**选项归一化后编辑距离 ≤ 2（或互为前缀且长度差 ≤ 2）⇒ 报 `option-near-duplicate`（带两个选项的文本） | **G268** | M317（近邻判据的 `continue` 条件改成永远成立，永不报）**3 红** |
| **越界不崩** | 规则范围外的单元号 ⇒ 脚本**退出码非 0** 且**报出一条能定位的问题**，不是抛栈 | **G269** | M318（去掉 `optionCountProblems` 里的 `try/catch`）**1 红** |
| **版式不写死列数** | `.question-card__options` 不再硬编码 4 列；用 `auto-fit` / `auto-fill` + `minmax(0, …)`；**不写 `grid-auto-flow`** | **G270** | M314（改回 `repeat(4, 1fr)`）**3 红** |
| **纯标点选项必被报** | 两个「什么都没有」的按钮（`!!!` / `???`）归一化后是空串 ⇒ **不得被跳过** | **G271** | **M321**（恢复「归一化后为空串就跳过」）**1 红** |
| **完全相同的两个选项只报一次** | schema 的 `duplicate-option-text` 已报的那一对 ⇒ 近邻判据**不得**再报（R-02） | **G272** | **M320**（去掉「schema 已报过就跳过」）**1 红** |
| **单元号非法要报「没核对」** | `unitNumber` 缺失 / 不是数字 ⇒ 报一条 `option-count`，说明**这一维没跑** | **G273** | **M322**（恢复「单元号非法就静默跳过」）**1 红** |
| **归一化必须做 NFKC** | 全角 `Ｃａｔ` 与半角 `Cat` 是同一个词 ⇒ 必被报 | **G274** | **M323**（去掉 `.normalize('NFKC')`）**1 红** |
| **编辑距离按码点算** | 一个 emoji 算**一个**字符，不是两个（UTF-16 码元口径会让距离翻倍） | **G275** | **M324**（`Array.from` 改回 `split('')`）**1 红** |
| **失败原因要分开说** | 单元号 `1.5` ⇒ 报「不是整数」，不是「规则不覆盖这个单元」 | **G276** | **M325**（三种失败原因合并成一种文案）**1 红** |
| 📎 **本文件 ↔ 实算值** | **§1.1 档位表**逐格 === `OPTION_COUNT_TIERS`；**§3 逐单元表**逐格 === `targetOptionCount`；**§3 的复算方法代码块**指向真实实现；**§4.1 的卡内编辑距离明细**逐对 === 真实内容算出来的值，且**一对不漏** | 📎 **G342**（`tests/content/option-count-doc.test.ts`，2026-10-28 `[CR]` 第二轮补上） | 📎 **M419**（把 §1.1 档 1 的 word 选项数改成 3）**1 红 / 该文件 11 条** |

**红数合计：18 条变异 / 52 红 / 整轮 2244 条。**
（编号起于 **M308**；⚠️ `M308` 这个号在 `grep` 里会命中本 story 的文档自身，不是占用。）
📎 **这条合计是 Story 2.4 那一轮的留档** —— 2026-10-28（Story 2.10 `[CR]` 第二轮）
补的 **G342 / M419** 不计入它（M419 的红数单列在上面的表里：1 红 / 该文件 11 条）。

⚠️ **G271–G276 是 `[CR]` 2026-10-23 这一轮补的** —— 那一轮的三层对抗评审
在**校验器**里挖出六个判据缺陷（原型链漏判 / 空串被放过 / 一个违规报两条 /
单元号非法被静默跳过 / 漏 Unicode 规范化 / 编辑距离按码元算），
每一个都补了守卫**并配了一条能把它打红的变异**（M319–M325，各 1 红）。
⇒ **补丁没有守卫 = 这条修复没人守着** —— 所以这六条是逐条做出来的，不是顺手加的。

⚠️ **守卫编号经过一次重号留痕**：story 原计划从 **G253** 起号，
但 2026-10-22 的 Epic 1 集成层检视**已经占用了 G253–G261** ⇒ 本 story 的守卫
整体后移到 **G262–G270**（R-36）。story 文档与实现文件里的引用已同步更正。

⚠️ **每条守卫都至少配了一条「反向自测」**（把**违规形态真写进去**，
断言那条守卫会红）—— 只写「真实现满足性质」是不够的：那种断言在实现坏掉时
可能一起绿掉。
⚠️⚠️ **反向自测必须真的调用「判据本体」**（`[CR]` 2026-10-23 修）：
G263 / G264 / G265 三条原来的反向自测**只断言假夹具自身的数值关系**，
判据本体（那些 `expect` 循环）被掏空 / 写反时它们照样绿 ——
这是本仓已知的假绿形态之一。⇒ 现在这三条的判据都**抽成了函数**
（`assertMonotonicPerKind` / `assertSameWithinTierAndCovered` /
`assertKindNonDecreasingWithinTier` / `assertTiersMatchCore` /
`assertOptionCountsMatchRule`），正向用例与反向自测**共用同一份实现**。
⚠️ **例外**：**G270** 的四条断言里**只有第一条**（不得写死列数）有反向自测；
其余三条（自适应写法 / `minmax(0, …)` / 不写 `grid-auto-flow`）靠**逐字读源码**，
它们的反向自测待补。
⚠️ **G271–G276 的反向自测是「注入违规形态」那一种**（把纯标点 / 全角词 / 非整数单元号
真的写进内容里，断言那条守卫会报出来），**并且各自另配了一条把源码改坏的变异**
（M319–M325，逐条实测各 1 红）⇒ 这六条既有「守卫会红」的证据，也有「守卫不会假绿」的证据。

---

## 3. 逐单元实算

下表由 `targetOptionCount` 对 1..24 实算得到（**不是手抄**）。

**复算方法**（任何人可重跑，数字必然一致）：

```bash
# 在仓库根目录执行。需要仓库自带的 tsx（已在 devDependencies）。
npx tsx -e "
import { targetOptionCount } from './src/content/option-count.ts'
for (let n = 1; n <= 24; n++) {
  console.log(n, targetOptionCount(n, 'word'), targetOptionCount(n, 'keyword'), targetOptionCount(n, 'response'))
}
"
```

输出逐字对应 §3 的表。**`npx tsx -e` 直接 import 仓库里的真实实现**（不是复刻一份算法），
所以「表与代码漂移」这件事在跑的时候就会露出来。

| 单元 | `word` | `keyword` | `response` | | 单元 | `word` | `keyword` | `response` |
|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 2 | 3 | | 13 | 4 | 4 | 4 |
| 2 | 2 | 2 | 3 | | 14 | 4 | 4 | 4 |
| 3 | 2 | 2 | 3 | | 15 | 4 | 4 | 4 |
| 4 | 2 | 2 | 3 | | 16 | 4 | 4 | 4 |
| 5 | 3 | 3 | 4 | | 17 | 4 | 4 | 4 |
| 6 | 3 | 3 | 4 | | 18 | 4 | 4 | 4 |
| 7 | 3 | 3 | 4 | | 19 | 4 | 4 | 4 |
| 8 | 3 | 3 | 4 | | 20 | 4 | 4 | 4 |
| 9 | 3 | 3 | 4 | | 21 | 4 | 4 | 4 |
| 10 | 3 | 3 | 4 | | 22 | 4 | 4 | 4 |
| 11 | 4 | 4 | 4 | | 23 | 4 | 4 | 4 |
| 12 | 4 | 4 | 4 | | 24 | 4 | 4 | 4 |

---

## 4. 两条写死的基线（改内容 / 改阈值前必读）

### 4.1 卡内最小编辑距离（单元 1 = **7**、单元 2 = **5**、单元 3–7 均为 **3**）

**实测口径**（`scripts/validate-content.ts` 的 `normalizeOptionText` + `editDistance`，
对每个单元的每张卡做**卡内两两**比较，取全局最小值）。
⚠️ 下面列的文本是**归一化后**的（`normalizeOptionText` 的输出），不是卡面原文；
⚠️ **每一对都列出来了**（全量，不是抽样）—— 少列一对，下一个读的人就没法自验。

**单元 1（`unit-01.json`，10 对）**：

```
u1-s-good-morning | "morning" ~ "afternoon" = 7
u1-s-hello | "good morning" ~ "good afternoon" = 7
u1-s-hello | "good morning" ~ "goodbye" = 8
u1-s-hello | "good afternoon" ~ "goodbye" = 9
u1-s-good-afternoon | "hello" ~ "good morning" = 11
u1-s-good-afternoon | "hello" ~ "goodbye" = 7
u1-s-good-afternoon | "good morning" ~ "goodbye" = 8
u1-s-goodbye | "hello" ~ "good morning" = 11
u1-s-goodbye | "hello" ~ "good afternoon" = 12
u1-s-goodbye | "good morning" ~ "good afternoon" = 7
最小卡内编辑距离 = 7 <- u1-s-good-morning: morning ~ afternoon
```

**单元 2（`unit-02.json`，17 对）**：

```
u2-s-give-me-a-rubber-please | "rubber" ~ "pencil" = 6
u2-s-give-me-a-ruler-please | "ruler" ~ "book" = 5
u2-s-good-afternoon-kitty | "good afternoon alice" ~ "here you are" = 15
u2-s-good-afternoon-kitty | "good afternoon alice" ~ "thank you" = 17
u2-s-good-afternoon-kitty | "here you are" ~ "thank you" = 8
u2-s-good-afternoon-alice | "good afternoon kitty" ~ "here you are" = 17
u2-s-good-afternoon-alice | "good afternoon kitty" ~ "thank you" = 17
u2-s-good-afternoon-alice | "here you are" ~ "thank you" = 8
u2-s-here-you-are | "thank you" ~ "how nice" = 8
u2-s-here-you-are | "thank you" ~ "give me a rubber please" = 21
u2-s-here-you-are | "how nice" ~ "give me a rubber please" = 21
u2-s-thank-you | "here you are" ~ "how nice" = 9
u2-s-thank-you | "here you are" ~ "give me a ruler please" = 15
u2-s-thank-you | "how nice" ~ "give me a ruler please" = 20
u2-s-how-nice | "thank you" ~ "here you are" = 8
u2-s-how-nice | "thank you" ~ "give me a ruler please" = 20
u2-s-how-nice | "here you are" ~ "give me a ruler please" = 15
最小卡内编辑距离 = 5 <- u2-s-give-me-a-ruler-please: ruler ~ book
```

**单元 3（`unit-03.json`，24 对）**：

```
u3-s-look-this-is-your-mouth | "mouth" ~ "face" = 5
u3-s-look-this-is-your-eye | "eye" ~ "face" = 3
u3-s-look-this-is-your-ear | "ear" ~ "mouth" = 5
u3-s-hi-alice-its-you | "look this is your mouth" ~ "hello i m jack" = 19
u3-s-hi-alice-its-you | "look this is your mouth" ~ "my mouth" = 16
u3-s-hi-alice-its-you | "hello i m jack" ~ "my mouth" = 12
u3-s-my-mouth | "look this is your mouth" ~ "my eye" = 21
u3-s-my-mouth | "look this is your mouth" ~ "hello i m jack" = 19
u3-s-my-mouth | "my eye" ~ "hello i m jack" = 13
u3-s-my-eye | "look this is your eye" ~ "my mouth" = 18
u3-s-my-eye | "look this is your eye" ~ "hi jack" = 18
u3-s-my-eye | "my mouth" ~ "hi jack" = 7
u3-s-no-its-not-me | "hi alice it s you" ~ "hello i m jack" = 12
u3-s-no-its-not-me | "hi alice it s you" ~ "my eye" = 14
u3-s-no-its-not-me | "hello i m jack" ~ "my eye" = 13
u3-s-hello-im-jack | "hi jack" ~ "my mouth" = 7
u3-s-hello-im-jack | "hi jack" ~ "no it s not me" = 12
u3-s-hello-im-jack | "my mouth" ~ "no it s not me" = 12
u3-s-hi-jack | "hello i m jack" ~ "hi alice it s you" = 12
u3-s-hi-jack | "hello i m jack" ~ "my eye" = 13
u3-s-hi-jack | "hi alice it s you" ~ "my eye" = 14
u3-s-this-is-my-mouth | "my mouth" ~ "my eye" = 5
u3-s-this-is-my-mouth | "my mouth" ~ "hello i m jack" = 12
u3-s-this-is-my-mouth | "my eye" ~ "hello i m jack" = 13
最小卡内编辑距离 = 3 <- u3-s-look-this-is-your-eye: eye ~ face
```

**单元 4（`unit-04.json`，17 对）**：

```
u4-s-i-can-sing | "sing" ~ "dance" = 4
u4-s-i-can-read | "read" ~ "draw" = 3
u4-s-what-can-you-do | "i can sing" ~ "i can draw" = 4
u4-s-what-can-you-do | "i can sing" ~ "i can read" = 4
u4-s-what-can-you-do | "i can draw" ~ "i can read" = 3
u4-s-i-can | "i can draw" ~ "i can sing" = 4
u4-s-i-can | "i can draw" ~ "what can you do" = 10
u4-s-i-can | "i can sing" ~ "what can you do" = 10
u4-s-i-can-dance | "i can" ~ "i can read" = 5
u4-s-i-can-dance | "i can" ~ "what can you do" = 11
u4-s-i-can-dance | "i can read" ~ "what can you do" = 9
u4-s-i-can-draw | "i can" ~ "i can read" = 5
u4-s-i-can-draw | "i can" ~ "what can you do" = 11
u4-s-i-can-draw | "i can read" ~ "what can you do" = 9
u4-w-can-you-dance | "i can dance" ~ "i can sing" = 4
u4-w-can-you-dance | "i can dance" ~ "what can you do" = 10
u4-w-can-you-dance | "i can sing" ~ "what can you do" = 10
最小卡内编辑距离 = 3 <- u4-s-i-can-read: read ~ draw
```

**单元 5（`unit-05.json`，51 对）**：

```
u5-s-this-is-my-grandfather | "grandfather" ~ "father" = 5
u5-s-this-is-my-grandfather | "grandfather" ~ "me" = 10
u5-s-this-is-my-grandfather | "father" ~ "me" = 5
u5-s-shes-my-grandmother | "grandmother" ~ "mother" = 5
u5-s-shes-my-grandmother | "grandmother" ~ "me" = 9
u5-s-shes-my-grandmother | "mother" ~ "me" = 4
u5-s-hes-my-father | "father" ~ "grandfather" = 5
u5-s-hes-my-father | "father" ~ "me" = 5
u5-s-hes-my-father | "grandfather" ~ "me" = 10
u5-s-this-is-my | "this is my grandfather" ~ "he s my" = 16
u5-s-this-is-my | "this is my grandfather" ~ "who is she" = 15
u5-s-this-is-my | "this is my grandfather" ~ "he s my father" = 9
u5-s-this-is-my | "he s my" ~ "who is she" = 6
u5-s-this-is-my | "he s my" ~ "he s my father" = 7
u5-s-this-is-my | "who is she" ~ "he s my father" = 10
u5-s-this-is | "this is me" ~ "this is my grandfather" = 12
u5-s-this-is | "this is me" ~ "he s my" = 5
u5-s-this-is | "this is me" ~ "who is she" = 5
u5-s-this-is | "this is my grandfather" ~ "he s my" = 16
u5-s-this-is | "this is my grandfather" ~ "who is she" = 15
u5-s-this-is | "he s my" ~ "who is she" = 6
u5-s-this-is-me | "this is" ~ "she s my" = 5
u5-s-this-is-me | "this is" ~ "who is she" = 6
u5-s-this-is-me | "this is" ~ "she s my grandmother" = 17
u5-s-this-is-me | "she s my" ~ "who is she" = 6
u5-s-this-is-me | "she s my" ~ "she s my grandmother" = 12
u5-s-this-is-me | "who is she" ~ "she s my grandmother" = 15
u5-s-hes-my | "he s my father" ~ "this is my" = 11
u5-s-hes-my | "he s my father" ~ "who is she" = 10
u5-s-hes-my | "he s my father" ~ "she s my grandmother" = 7
u5-s-hes-my | "this is my" ~ "who is she" = 6
u5-s-hes-my | "this is my" ~ "she s my grandmother" = 15
u5-s-hes-my | "who is she" ~ "she s my grandmother" = 15
u5-s-shes-my | "she s my grandmother" ~ "this is my" = 15
u5-s-shes-my | "she s my grandmother" ~ "this is" = 17
u5-s-shes-my | "she s my grandmother" ~ "who is he" = 15
u5-s-shes-my | "this is my" ~ "this is" = 3
u5-s-shes-my | "this is my" ~ "who is he" = 5
u5-s-shes-my | "this is" ~ "who is he" = 5
u5-s-who-is-she | "she s my grandmother" ~ "this is my grandfather" = 6
u5-s-who-is-she | "she s my grandmother" ~ "this is me" = 14
u5-s-who-is-she | "she s my grandmother" ~ "she s my" = 12
u5-s-who-is-she | "this is my grandfather" ~ "this is me" = 12
u5-s-who-is-she | "this is my grandfather" ~ "she s my" = 16
u5-s-who-is-she | "this is me" ~ "she s my" = 5
u5-s-who-is-he | "he s my father" ~ "this is my grandfather" = 9
u5-s-who-is-he | "he s my father" ~ "this is" = 12
u5-s-who-is-he | "he s my father" ~ "she s my" = 8
u5-s-who-is-he | "this is my grandfather" ~ "this is" = 15
u5-s-who-is-he | "this is my grandfather" ~ "she s my" = 16
u5-s-who-is-he | "this is" ~ "she s my" = 5
最小卡内编辑距离 = 3 <- u5-s-shes-my: this is my ~ this is
```

**单元 6（`unit-06.json`，51 对）**：

```
u6-s-hes-fat | "fat" ~ "thin" = 4
u6-s-hes-fat | "fat" ~ "tall" = 3
u6-s-hes-fat | "thin" ~ "tall" = 3
u6-s-shes-thin | "thin" ~ "fat" = 4
u6-s-shes-thin | "thin" ~ "short" = 4
u6-s-shes-thin | "fat" ~ "short" = 4
u6-s-hes-tall | "tall" ~ "short" = 5
u6-s-hes-tall | "tall" ~ "fat" = 3
u6-s-hes-tall | "short" ~ "fat" = 4
u6-s-this-is-danny | "he s my classmate" ~ "he s fat" = 10
u6-s-this-is-danny | "he s my classmate" ~ "he s tall" = 11
u6-s-this-is-danny | "he s my classmate" ~ "look this is ben" = 15
u6-s-this-is-danny | "he s fat" ~ "he s tall" = 3
u6-s-this-is-danny | "he s fat" ~ "look this is ben" = 12
u6-s-this-is-danny | "he s tall" ~ "look this is ben" = 13
u6-s-hes-my-classmate | "he s fat" ~ "this is danny" = 8
u6-s-hes-my-classmate | "he s fat" ~ "he s tall" = 3
u6-s-hes-my-classmate | "he s fat" ~ "he s" = 4
u6-s-hes-my-classmate | "this is danny" ~ "he s tall" = 8
u6-s-hes-my-classmate | "this is danny" ~ "he s" = 10
u6-s-hes-my-classmate | "he s tall" ~ "he s" = 5
u6-s-this-is-kitty | "she s my friend" ~ "she s thin" = 7
u6-s-this-is-kitty | "she s my friend" ~ "she s" = 10
u6-s-this-is-kitty | "she s my friend" ~ "look this is ben" = 13
u6-s-this-is-kitty | "she s thin" ~ "she s" = 5
u6-s-this-is-kitty | "she s thin" ~ "look this is ben" = 12
u6-s-this-is-kitty | "she s" ~ "look this is ben" = 13
u6-s-shes-my-friend | "she s thin" ~ "this is kitty" = 9
u6-s-shes-my-friend | "she s thin" ~ "she s" = 5
u6-s-shes-my-friend | "she s thin" ~ "look this is ben" = 12
u6-s-shes-my-friend | "this is kitty" ~ "she s" = 10
u6-s-shes-my-friend | "this is kitty" ~ "look this is ben" = 10
u6-s-shes-my-friend | "she s" ~ "look this is ben" = 13
u6-s-hes | "he s fat" ~ "he s my classmate" = 10
u6-s-hes | "he s fat" ~ "he s tall" = 3
u6-s-hes | "he s fat" ~ "this is danny" = 8
u6-s-hes | "he s my classmate" ~ "he s tall" = 11
u6-s-hes | "he s my classmate" ~ "this is danny" = 13
u6-s-hes | "he s tall" ~ "this is danny" = 8
u6-s-shes | "she s thin" ~ "she s my friend" = 7
u6-s-shes | "she s thin" ~ "this is kitty" = 9
u6-s-shes | "she s thin" ~ "look this is ben" = 12
u6-s-shes | "she s my friend" ~ "this is kitty" = 10
u6-s-shes | "she s my friend" ~ "look this is ben" = 13
u6-s-shes | "this is kitty" ~ "look this is ben" = 10
u6-s-look-this-is-ben | "he s tall" ~ "he s fat" = 3
u6-s-look-this-is-ben | "he s tall" ~ "this is danny" = 8
u6-s-look-this-is-ben | "he s tall" ~ "he s" = 5
u6-s-look-this-is-ben | "he s fat" ~ "this is danny" = 8
u6-s-look-this-is-ben | "he s fat" ~ "he s" = 4
u6-s-look-this-is-ben | "this is danny" ~ "he s" = 10
最小卡内编辑距离 = 3 <- u6-s-hes-fat: fat ~ tall
```

**单元 7（`unit-07.json`，63 对）**：

```
u7-s-five-rulers | "five" ~ "one" = 3
u7-s-five-rulers | "five" ~ "three" = 4
u7-s-five-rulers | "one" ~ "three" = 4
u7-s-one-one-book | "one" ~ "three" = 4
u7-s-one-one-book | "one" ~ "five" = 3
u7-s-one-one-book | "three" ~ "five" = 4
u7-s-two-books | "two" ~ "four" = 4
u7-s-two-books | "two" ~ "six" = 3
u7-s-two-books | "four" ~ "six" = 4
u7-s-one-two-three | "three pencils" ~ "five rulers" = 10
u7-s-one-two-three | "three pencils" ~ "one one book" = 11
u7-s-one-two-three | "three pencils" ~ "one two three four five" = 16
u7-s-one-two-three | "five rulers" ~ "one one book" = 11
u7-s-one-two-three | "five rulers" ~ "one two three four five" = 20
u7-s-one-two-three | "one one book" ~ "one two three four five" = 15
u7-s-one-two-three-four-five | "five rulers" ~ "one two three" = 11
u7-s-one-two-three-four-five | "five rulers" ~ "two books" = 9
u7-s-one-two-three-four-five | "five rulers" ~ "six" = 10
u7-s-one-two-three-four-five | "one two three" ~ "two books" = 9
u7-s-one-two-three-four-five | "one two three" ~ "six" = 13
u7-s-one-two-three-four-five | "two books" ~ "six" = 9
u7-s-how-many | "how many books" ~ "three" = 14
u7-s-how-many | "how many books" ~ "two" = 12
u7-s-how-many | "how many books" ~ "six" = 14
u7-s-how-many | "three" ~ "two" = 4
u7-s-how-many | "three" ~ "six" = 5
u7-s-how-many | "two" ~ "six" = 3
u7-s-how-many-books | "three" ~ "two" = 4
u7-s-how-many-books | "three" ~ "six" = 5
u7-s-how-many-books | "three" ~ "two books" = 8
u7-s-how-many-books | "two" ~ "six" = 3
u7-s-how-many-books | "two" ~ "two books" = 6
u7-s-how-many-books | "six" ~ "two books" = 9
u7-s-three | "two" ~ "six" = 3
u7-s-three | "two" ~ "two books" = 6
u7-s-three | "two" ~ "how many books" = 12
u7-s-three | "six" ~ "two books" = 9
u7-s-three | "six" ~ "how many books" = 14
u7-s-three | "two books" ~ "how many books" = 7
u7-s-two | "six" ~ "two books" = 9
u7-s-two | "six" ~ "three" = 5
u7-s-two | "six" ~ "how many" = 8
u7-s-two | "two books" ~ "three" = 8
u7-s-two | "two books" ~ "how many" = 8
u7-s-two | "three" ~ "how many" = 8
u7-s-six | "two books" ~ "how many books" = 7
u7-s-six | "two books" ~ "three" = 8
u7-s-six | "two books" ~ "two" = 6
u7-s-six | "how many books" ~ "three" = 14
u7-s-six | "how many books" ~ "two" = 12
u7-s-six | "three" ~ "two" = 4
u7-w-how-many-pencils | "three pencils" ~ "how many books" = 12
u7-w-how-many-pencils | "three pencils" ~ "two" = 12
u7-w-how-many-pencils | "three pencils" ~ "one two three" = 13
u7-w-how-many-pencils | "how many books" ~ "two" = 12
u7-w-how-many-pencils | "how many books" ~ "one two three" = 12
u7-w-how-many-pencils | "two" ~ "one two three" = 10
u7-s-three-pencils | "one two three four five" ~ "two books" = 18
u7-s-three-pencils | "one two three four five" ~ "one one book" = 15
u7-s-three-pencils | "one two three four five" ~ "three" = 18
u7-s-three-pencils | "two books" ~ "one one book" = 7
u7-s-three-pencils | "two books" ~ "three" = 8
u7-s-three-pencils | "one one book" ~ "three" = 11
最小卡内编辑距离 = 3 <- u7-s-five-rulers: five ~ one
```

⚠️ **这个 7 是 2026-10-26 换源批次重新实测出来的**，出处换成了教材词表的那一对
（`morning` ~ `afternoon`，关键词卡 `u1-s-good-morning`）—— 旧文档写的 3 出处是
**旧内容**的 `ball` ~ `book`（那一对的距离确实是 3，复算方法可自验）。

⇒ **`option-near-duplicate` 的阈值（≤ 2）当前不会被单元 1 顶到**：
单元 1 的最小卡内距离是 **7** ⇒ 阈值一旦 ≥ 7，单元 1 的关键词卡才会被报出来。
⚠️ **换源后真正把阈值顶住的不是单元 1**：单元 2 的最小卡内距离是 **5**
（`u2-s-give-me-a-ruler-please`：`ruler` ~ `book`）⇒ 阈值 ≥ 5 就会报到单元 2。
⚠️📎 **2026-10-28（Story 2.6 交付单元 3–7）实测**：单元 3 / 4 / 5 / 6 / 7 的
最小卡内距离**都是 3**（`eye` ~ `face` / `read` ~ `draw` / `this is my` ~ `this is` /
`fat` ~ `tall` / `five` ~ `one`）⇒ **全书的最小上界从 5 降到 3** ⇒
阈值一旦 ≥ 3，五个单元都会被报出来。
⇒ **阈值仍是 2**（校验器 `NEAR_DUPLICATE_MAX_DISTANCE`），它比「不被顶到」的那个上界
更保守，也是教材词表逐单元扩开后仍站得住的那个数 —— **不是「随便挑一个」**。
⚠️ **这 3 也正是档 2 的 `keyword` 只能取 3 的那个算式的一部分**：
`grandfather` ~ `grandmother` = 2、`father` ~ `mother` = 2 这两对**就在词表里**
（不是卡内）⇒ 词表层面就已经把「互不近似的词数」顶在 3 ⇒ 见 §1.1 的档 2 说明。

⚠️ **别把它读成「只差一个字母」**（`[CR]` 2026-10-23 更正，2026-10-26 换源后复核）：
那会把论证读反 —— 「差一个字母」对应的阈值是 1，而阈值取 1 就会放过**差两个字母**
的近似词（旧内容里的 `ball` / `bail` 就是这一族）⇒ 阈值是 2，不是 1。

⚠️ **口径差异登记（已闭环）**：`src/content/option-count.ts` 的档 1 注释原先把这个距离
写成了 **3** ⇒ 那是**旧数值**（旧内容 `ball` ~ `book` 的量级），实测是 **7**
（R-21 实测值优先）。
📎 **2026-10-26（Story 2.10 收尾）已把该注释改成实测值 7**
（注释里现在明写「那个 3 是错的…`ball` ~ `book` 才是 3」）⇒ **两边现已一致**，
本条不再是一处待修的差异，只是留档说明它曾经不一致过。
**档位表本身两边一致**（档 1 = 2 / 2 / 3，档 3 = 11–24）。

⚠️ **这条基线会随内容变**：将来单元 1 的选项措辞改了，最小距离可能变小 ⇒
**改内容时必须重算它**（复算口径见上面的 `npx tsx` 同款写法，把
`normalizeOptionText` / `editDistance` 从 `scripts/validate-content.ts` import 进来）。
⚠️ **单元 2 的那条同理**（当前 = 5）、**单元 3–7 的那五条也同理**（当前都 = 3）——
教材词表每扩一个单元就多一条基线。

⚠️⚠️ **阈值 2 有一条「误杀」方向，全仓只登记了一半**（`[CR]` 2026-10-23 记）：
字符级编辑距离是**代理量**，它不知道意思 ⇒ **字面近但语义远**的短词会被判成
「微小差异」。实测：`red` / `blue` / `bed` 里 `red` ~ `bed` 距离 = 1
⇒ 校验器会要求内容作者删掉一个**语义上完全可分**的干扰项（颜色 vs 家具）。
⇒ **这一族（3–4 个字母的短词）随内容量增长会成片被拦**（`sun`/`sum`、`cup`/`cap`、
`top`/`toy` 同理）。
⚠️ **改阈值是产品裁决**（裁决 7 的「阈值 ≤ 2」是写死的数字）⇒ 本次**不改**，
而是把它作为**反方向**登记在 `deferred-work.md`（**DF-193**），
与 DF-190（语义近但字面远 ⇒ 抓不到）**成对** ⇒ 两个方向都有账。

⚠️ **编辑距离是字符级代理量，判不了语义**：两个语义很近但字面差很多的选项
（例如 `I am fine, thank you.` 与 `Thank you!`）**抓不出来** ⇒ 那属
「生僻词 / 语义可辨性」的**人工项**，已登记在 `deferred-work.md`（DF-190）。

### 4.2 档 1 的三个数 = 内容改完之后 `unit-01.json` 的真实值

当前档 1 的三个数 = **2 / 2 / 3**（单词卡 / 关键词卡 / 回应卡）。

R-21 的精神：**实测值优先于文档值** —— 数值被实测推翻时按实测写断言，
并在**同一 story 内同步更正源文档**。⇒ 单元 1 的选项数一旦被改动，
必须同时改 `src/content/option-count.ts`、本文件与 `unit-01.json`（守卫 G264 会红）。

---

## 5. 本规则管什么、不管什么

### 5.1 不管的事

- **不管卡型占比**（哪张卡占多少份额）—— 那是 `docs/card-distribution.md` 的规则。
  两条规则**互不引用数字**（R-37：正文不互相复制）。
- **不管横屏怎么排**：`src/styles/responsive.css` 的 `@media (min-aspect-ratio: 1/1)`
  把选项网格强制成 **2 列**，被守卫 **G169** 逐字钉死 ⇒ 本 story 不动它。
  ⚠️ 由此产生的一个已知形态：**横屏下 3 个选项是 2 + 1 两行**（DF-192）。
- **不管词的生僻度 / 语义可辨性**：机器判不了 ⇒ 人工项（DF-190）。
- **不管图片选项的视角一致性**：机器也判不了「视角一致」⇒ 目视项（DF-191，
  台账见 `docs/art-direction.md` §5.4）。

### 5.2 选项数不决定词图总数，但**改它就会改词图总数**

单词卡的选项**全是图片**（FR13）⇒ 单词卡从 4 个选项降到 2 个，
**词图的展示次数就少了一半**。单元 1 的实测数：`imageSrc` 出现 **4** 次
（= 2 张单词卡 × 2），去重后是 **2** 张图（`u1-morning.svg` / `u1-afternoon.svg`）⇒
**画的张数没变，展示的次数变了**。基数推导链见
[`docs/word-image-throughput.md`](word-image-throughput.md) §8.1.1。

### 5.3 一条被顺手补上的守卫

**选项数与版式解耦**：选项数变了，列数必须跟着变，否则孩子看到的是
两个窄按钮贴在左半边（一个看得出没做完的卡面）。
⇒ 版式用 `grid-template-columns: repeat(auto-fit, minmax(0, 1fr))`，
**列数由子项数量决定**（守卫 **G270**）。⚠️ **刻意不写 `grid-auto-flow`** ——
横屏那套 2 列依赖默认的按行流。

---

## 6. 相关文档

| 文档 | 关系 |
|---|---|
| [`docs/card-distribution.md`](card-distribution.md) | **卡型占比**规则 —— 与本规则**并列且独立**，不复制正文 |
| [`docs/art-direction.md`](art-direction.md) §5.4 | 单词卡选项的**目视台账**（视角一致性，机器判不了） |
| [`docs/word-image-throughput.md`](word-image-throughput.md) §8.1.1 | 全书**词图总数**的基数推导链（选项数变了要重算） |
| [`docs/rules/range-and-balance.md`](../rules/range-and-balance.md) | R-20 / R-21：改数值前问人；实测值优先 |
| [`docs/rules/architecture.md`](../rules/architecture.md) | R-10：内容层不得 import core |
| [`docs/rules/testing.md`](../rules/testing.md) | R-50 – R-57：变异四步、断言要真咬住、R-56 不许写死 |
