# 三个同上游分叉的对比

> 对照时间：2026-10-23。数据来自各仓库当前代码（`gh api` 直读源码，不是只读 README）与 npm registry。

## 0. 共同起点

| 事实 | 依据 |
|---|---|
| 上游 npm 包 `dsh-workbuddy-connect` 仍在，`latest = 0.7.9`，共 32 个版本 | `registry.npmmirror.com/dsh-workbuddy-connect` |
| 上游 GitHub 仓库 `corrinehu/dsh-workbuddy-connect` 已 **404** | `gh api repos/corrinehu/...` → 404 |
| 三个分叉的代码基线都是 0.7.9（commit `c0ed88e`） | 本仓库 `git log` 里 `c0ed88e` 是 `upstream/main`；tangyixiao 的 README 明写基于 `c0ed88e` |
| 三个分叉都注册 `workbuddy` / `workbuddy-ai` 两个 provider | 各自 `cordis.patch.yml` 与源码 |

## 1. 一句话定位

| 仓库 | 定位 | 版本 | 分发 |
|---|---|---|---|
| `functy23/dsh-workbuddy-connect-functy` | **功能型分叉**：重写界面层，加仪表盘、多账号池、签到、扫码登录、额度卡 | 0.13.20 | npm `dsh-workbuddy-connect-functy` |
| `tangyixiao/dsh-workbuddy-connect-community` | **更名社区版**：功能等于上游，换包名、加保守的提示词兼容处理 | 0.1.0 | GitHub Release 的 `.tgz`（未上 npm） |
| `AidenOrz/dsh-workbuddy-connect`（本仓库） | **原地接管版**：包名/行 id 与上游一致，只做渠道校验与 Windows 客户端身份修复 | 0.7.12 | `github:AidenOrz/dsh-workbuddy-connect` 源码安装 |

## 2. 关键差异

| 维度 | functy | tangyixiao | 本仓库 |
|---|---|---|---|
| 包名 | `dsh-workbuddy-connect-functy` | `dsh-workbuddy-connect-community` | **`dsh-workbuddy-connect`（与上游同名）** |
| `cordis.patch.yml` 行 id | `llm-workbuddy-functy` | `llm-workbuddy` | `llm-workbuddy` |
| 与上游/其他分叉共存 | **可以**（行 id 改名，源码注释说明是为了避免同名 id 抢设置写入） | 不行（行 id 相同） | 不行——但**同包名会原地替换**，不留下孤立条目 |
| 支持的 DSH | 0.2.1-rc.x | 0.2.1-rc.2 | 0.2.1-rc.2（本机实测） |
| 功能面 | 上游能力的**重写版**：侧栏额度卡、中栏仪表盘、账号池与轮换、扫码/令牌/桌面凭证三种登录、删除后不被 30 秒扫描加回、额度/用量/token/恢复时间、倍率与促销徽章 | **等于上游**：更新提醒、WSL 修复、legacy 设置迁移、模型显隐、推理档位、图片输入 | 同 tangyixiao（同一基线） |
| 测试规模 | 66 文件 / 881 用例（CHANGELOG 自述） | 59 个 spec | 59 个 spec |
| 星标（我查时） | 8 | 1 | 0 |

## 3. 11128 渠道校验：三条不同路线

这是维护者最关心的一条，三者实现完全不同，且都不是彼此的超集。

### functy：只换开场句，换成官方客户端的原句

```ts
// src/upstream.ts:845, 856
const HARNESS_OPENER = 'You are an AI agent powered by DeepSeek Harness'
const OFFICIAL_OPENER = 'This conversation is powered by WorkBuddy'
```

- 只处理**行首那一个句子**，替换成从 `WorkBuddy.app` 的 `prompt.tpl` 里读出来的官方措辞。
- 不处理 `You are a coding agent powered by <model> model.`（DSH 紧跟其后的 per-model 身份句）。
- 不处理 system 消息正文里的产品名（`Current DeepSeek Harness implementation checkout: …` 这类 runtime context 原文保留）。
- CHANGELOG 里的对照实验是用**最小 body** 做的：只放一句开场句，换掉即 200。这解释了为什么他们得出"只认开场句"——最小 body 里本来就没有 runtime context。

### tangyixiao：不专门处理开场句，做路径豁免的全文替换

```ts
// src/upstream.ts:619, 647
const productName = /(?<![\\/\w-])DeepSeek Harness(?![\\/\w-])/gu
if (/[\\/`"']/u.test(line) || /\.[\p{L}\p{N}_-]{1,10}(?=$|[\s"'`),;:!?.])/u.test(line)) continue
```

- 逐行扫描 system 消息的普通文本，把 `DeepSeek Harness` → `the local agent runtime`。
- **任何含路径分隔符、引号、反引号或可识别扩展名的整行都会被跳过**（`continue`），围栏代码块整块跳过。
- 开场句是被这套通用规则"顺带"改掉的：`You are an AI agent powered by DeepSeek Harness.` → `You are an AI agent powered by the local agent runtime.`；per-model 句不含产品名，保持原样。
- 设计取向是"不破坏模型需要读的路径与代码"，代价是**带路径的 runtime context 行会原样保留产品名**——例如 `Current DeepSeek Harness implementation checkout: "C:\…\Programs\DeepSeek Harness\…"`，这行同时含引号和反斜杠，按上述规则一定被跳过。

### 本仓库：分层处理，最后做无豁免全文替换

```ts
// src/upstream.ts:598, 605, 622, 625
const CHANNEL_IDENTITY_PATTERN = /^[\s\uFEFF]*You are an?(?: AI)?(?: coding)? agent powered by [^\n]{1,80}?(?:Harness|model)\.?(?=\s|$)/iu
const NEUTRAL_IDENTITY = 'You are an AI agent.'
const PRODUCT_NAME_PATTERN = /DeepSeek Harness/gu
const NEUTRAL_PRODUCT_NAME = 'the agent runtime'
```

演进顺序就是实测顺序，每一步都有抓包对照：

1. 0.7.10：中和开场句 `… powered by DeepSeek Harness.` → 仍 400。
2. 0.7.11：发现 per-model 句顶上来成了新开头，把两种形态都归一化，并处理堆叠 → 仍 400。
3. 0.7.12：抓完整 body 才看到 system 里有 11 处 `DeepSeek Harness`（DSH 每轮追加 runtime context，多轮重复），改成全文替换 → **200**。

代价是明确的：**不豁免路径**，所以 checkout 路径也会被改写成 `…\Programs\the agent runtime\…`，模型若被要求去读那个路径会失败。这一点写在 `docs/channel-check-fix.md` 的"已知副作用"里。

### 三者对照

| | 开场句 | per-model 句 | 正文产品名 | 带路径行 | 结果 |
|---|---|---|---|---|---|
| functy | 换成官方原句 | 不动 | 不动 | 不动 | 最小 body 可过；含 runtime context 的真实 body 未覆盖 |
| tangyixiao | 被通用规则顺带改掉 | 不动 | 改（不含路径的行） | **保留** | 路径与代码安全；路径行的产品名残留 |
| 本仓库 | 归一为 `You are an AI agent.` | 归一为同一句（连续堆叠一起处理） | 全部替换 | 也替换（副作用已知并记录） | 本机 0.2.1-rc.2 + WorkBuddy 5.8.3 实测 400 → 200 |

## 4. Windows 客户端身份：只有本仓库修了

两个分叉的 `client-identity.ts` 都仍是上游原样：

```ts
// functy23: src/client-identity.ts:171  /  tangyixiao: src/client-identity.ts:149
if (process.platform !== 'darwin') return undefined
```

- Windows 上 `installedCnApp()` 直接返回 `undefined` → 客户端版本永远落回编译常量；UA 里的 `CLI/…` 段永远缺失。
- functy 的做法是把常量往新版本顶（`FALLBACK_CN_APP_VERSION = '5.6.2'`，上游是 `5.5.6`），仍然是"猜"。
- 本仓库改读真实值：`WorkBuddy.exe` 的 PE `FileVersion`（5.8.3）+ `resources\app.asar.unpacked\cli\package.json` 的 `publishConfig.customPackage.version`（2.161.0），UA 复原成 `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0`。
- 注意：这一项**单独修并不足以让请求通过**（补齐 UA 后仍 400，见 `docs/channel-check-fix.md`），它是真实缺陷但不是主因。

## 5. 本仓库独有 / 本仓库缺的

独有：

- **同包名 + 同行 id 的原地升级路径**。上游仓库没了，npm 停在 0.7.9；把 `dsh-workbuddy-connect` 从 npm 版换成 `github:AidenOrz/...` 是**替换**原有条目（实测 0.7.8 → 0.7.10 替换成功），升级后 `llm-workbuddy` 行、provider ID、已有设置全部沿用，不产生孤立行。
- **Windows 身份修复**（上文第 4 节），另两家都没有。
- **逐层实测证据链**：每一层修复都有抓包前后的 body/UA 对照，中英双语文档 + `docs/channel-check-fix.md` 记录了插桩位置、失败样本和副作用。

缺的（要如实说）：

- 没有 functy 的仪表盘、多账号池、签到、扫码登录、额度卡——这是他们的独立方向，本仓库不打算做。
- 没有 tangyixiao 的路径豁免，会改写路径；也没有更名与 Release 分发。
- 0 星、无非 npm 之外的正式发布、只验证过 Windows + DSH 0.2.1-rc.2。

## 6. 结论

**不是子集关系，建议按"实现重叠但独立"收录（维护者的方案 1），不主张取代任何一方。**

- 与 functy：目标用户不同。他们要的是"更好用的 WorkBuddy 账号面板"，本仓库要的是"上游死了之后的原地升级"。
- 与 tangyixiao：同一基线、同一个目标，差别在**策略**——他们优先不破坏路径，本仓库优先保证整条 system 消息干净；本仓库额外修了 Windows 身份。
- 三家都不能共存（除 functy 靠改行 id），所以条目描述里的"该选哪个"确实需要写清楚，这正是维护者的诉求。

## 7. 条目描述改法（满足"fork 自 404 上游 + 差异"）

```yaml
url: https://github.com/AidenOrz/dsh-workbuddy-connect
name: AidenOrz/dsh-workbuddy-connect
category: model
description:
  en: Drop-in successor to the now-deleted corrinehu/dsh-workbuddy-connect, keeping its package name, row id and provider ids so an existing install upgrades in place. Adds the 400/11128 channel-check fix (neutralises the harness identity lines and scrubs the product name from system messages, verified against captured request bodies) and reads the real Windows client version and bundled CLI version instead of a compiled constant. No rebrand and no new UI, unlike the other two forks.
  zh: 已 404 的 corrinehu/dsh-workbuddy-connect 的原地接管版，沿用其包名、行 id 与 provider id，已装用户可直接升级。新增 400/11128 渠道校验修复（归一化 DSH 身份句并清除 system 消息里的产品名，有抓包前后的对照实测），并改为读取真实的 Windows 客户端版本与内置 CLI 版本，不再用编译常量。不做更名、不加新界面，与另两个分叉方向不同。
```

注意 description 规则：不能出现「冒号 + 空格」，英文以句号结尾。

## 8. 可直接贴到 PR 的回复草稿

> 按方案 1 来，也就是作为独立条目收录，我不主张取代任何一个。
>
> **来源**：`corrinehu/dsh-workbuddy-connect` 已 404（npm 上 `dsh-workbuddy-connect` 仍停在 0.7.9）。本仓库以它的 0.7.9（commit `c0ed88e`）为基线，**保留原包名 `dsh-workbuddy-connect`、`cordis.patch.yml` 里的 `llm-workbuddy` 行 id，以及 `workbuddy` / `workbuddy-ai` 两个 provider id**。所以已装用户把来源从 npm 换成 `github:AidenOrz/dsh-workbuddy-connect` 是原地替换，设置与模型分组不用重建——这是本仓库存在的理由，另两个分叉都换了包名。
>
> **相对另外两个分叉的差异**（三者的代码基线都是 0.7.9，差异集中在渠道校验的处理方式）：
>
> - `functy23/dsh-workbuddy-connect-functy`：功能方向分叉，重写了界面（仪表盘、多账号池、签到、扫码登录），版本 0.13.20，另发 npm 包，行 id 改为 `llm-workbuddy-functy` 以便与上游共存。渠道校验它只把开场句换成官方客户端的原句（`This conversation is powered by WorkBuddy`），per-model 身份句和正文里的产品名不动。
> - `tangyixiao/dsh-workbuddy-connect-community`：同基线、同目标，改名为 `dsh-workbuddy-connect-community`（0.1.0，走 GitHub Release 的 tgz，未上 npm）做保守的提示词兼容处理：逐行替换产品名，但含路径、引号、反引号或可识别扩展名的整行会跳过，围栏代码块也跳过。好处是模型要读的路径不被改坏，代价是带路径的 runtime context 行会保留产品名。
> - 本仓库（0.7.12）：先把 DSH 的两条身份句（`You are an AI agent powered by DeepSeek Harness.` 和紧跟的 `You are a coding agent powered by <model> model.`）归一化为 `You are an AI agent.`，再对 system 消息里的产品名做无豁免替换。**这条路是抓包逼出来的**：0.7.10 只改开场句、0.7.11 补上 per-model 句，都仍是 400；抓到完整 body 才看到一次请求里 system 有 11 处 `DeepSeek Harness`（DSH 每轮追加 runtime context），改成全文替换才 200。代价我也写在仓库文档里：checkout 路径会被改写，模型若被要求去读那个路径会失败。
>
> 另外本仓库修了一项两家都没修的缺陷：Windows 上 `installedCnApp()` 只有 macOS 分支，客户端版本永远落回编译常量、UA 缺 `CLI/…` 段。现在读 `WorkBuddy.exe` 的 FileVersion 与内置 `cli/package.json`，UA 复原成 `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0`。需要说明的是，**这一项单独修不足以通过校验**（补齐 UA 后仍 400），它是独立缺陷，不是主因。
>
> **不主张取代的原因**：和 functy 是目标用户不同（他们要的是账号面板，我要的是上游死后的原地升级），和 tangyixiao 是同一目标下的策略分歧（路径安全 vs 整条消息干净）。两者互有取舍，都不是对方的子集。仓库目前只在本机验证过 Windows + DSH 0.2.1-rc.2，这一点也请在描述里保留。
