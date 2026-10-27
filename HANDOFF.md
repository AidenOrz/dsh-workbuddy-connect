# 交接说明

> 最后更新：2026-10-28 ｜ 当前版本 **0.7.14** ｜ 分支 `main`

写给下一个接手这个仓库的人（或 AI）。目标：让你在**不重走弯路**的前提下，知道这里为什么长这样、现在什么状态、下一步该往哪看。

---

## 1. 这个仓库是什么

`dsh-workbuddy-connect` 是一个 DSH（DeepSeek Harness）插件，把 WorkBuddy 桌面 App 里已登录的模型接进 DSH，在模型选择器里多出一个「WorkBuddy」分组。

**它原本是 [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)**，那个仓库在 2026-10-20 前后 404 了，npm 上的包冻结在 `0.7.9`。本仓库是接续维护版，关键取舍是：

> **保留原包名 `dsh-workbuddy-connect`、配置行 id `llm-workbuddy`、provider id 不变。**

这样已装用户换来源是**原地升级**，设置和模型分组都不用重建。另外两个分叉（`functy23/…-functy`、`tangyixiao/…-community`）都换了包名，做不到这点——详见 `docs/fork-comparison.md`。

代价：npm 发布权限不在本账号，**没法发版**，只能走 `github:` 源或本地 tgz。

---

## 2. 当前状态

| 项 | 值 |
|---|---|
| 版本 | `0.7.14` |
| 对应 DSH 内核 | `0.2.1-rc.3`（`engines.dsh: ^0.2.1-rc.2`，rc.2/rc.3 都可用） |
| 验证过的客户端 | WorkBuddy `37.10.3-42`（Windows 11） |
| npm | 仍是 `0.7.9`，**不含任何修复** |
| 本机安装方式 | `file:` 指向本仓库 `dist/*.tgz` |
| 上游列表 PR | [awesome-dsh-plugin#8513](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8513)，CI 已全绿，等维护者人工合并 |

---

## 3. 主要工作：三轮渠道校验对抗

国内网关（`copilot.tencent.com`）会判定请求「是否来自官方客户端」，判否就返回 `400 / code 11128`「请求被拦截」。这是本仓库存在的**唯一原因**，也是后续维护的主线。

| 轮次 | 假设 | 结论 | 版本 |
|---|---|---|---|
| 一 · 产品名 | system 里有 `DeepSeek Harness` | 成立，但范围从「开头句」一路扩到「全文」 | 0.7.10 → 0.7.12 |
| 二 · 版本号 | UA / `X-IDE-Version` 不对 | **修了但仍 400** —— 真实缺陷，但不是病因 | 0.7.12 |
| 三 · 句子指纹 | 还有别的文本被判据命中 | 整句 `Relative paths resolve from the workspace root` | 0.7.14 |

第二轮是这段经历里最值钱的教训：**一个真实存在的缺陷，不等于当前的病因**。当时证据链完整、修复正确，改完照样被拦。如果就此收工，会得出「UA 不是判据」的错误结论。

由此立的规矩：**每轮修完必须用整条真实 body 复验**，不能拿「改的地方看起来对了」当结论。

完整数据（每一档截断、每一次等长替换、掩码二分表）在 `docs/channel-check-fix.md`，方法论在技能 `dsh-workbuddy-connect`。

### 现在的判据形态

```ts
// src/upstream.ts
const PRODUCT_NAME_PATTERN = /DeepSeek Harness/gu          // 全文，system/developer
const PROMPT_FINGERPRINTS = [
  [/Relative paths resolve from the workspace root/gu, 'Relative paths resolve against the workspace directory'],
]
```

三条已确认的性质，改动时别破坏：

1. **只扫 system / developer**。user 消息里出现同样的字不拦。
2. **句子级，不是词表**。单独 `workspace root` 不触发；整句夹在填充文本里也不触发；只有真实 prompt 里整句完整出现才拦。
3. **大小写不敏感**，与长度无关。

---

## 4. 代码地图

```
src/
  upstream.ts                    指纹清理 + 上游请求。改渠道校验基本只动这个文件
    neutralizeChannelIdentity()  遍历 system/developer，改写指纹（入口）
    rewriteChannelIdentityLine() 开头连续身份句归一
    scrubChannelPhrases()        产品名 + 句子指纹
  client-identity.ts             客户端身份：exe FileVersion + 内置 CLI 版本 → UA
  desktop-credential-protection.ts  auth 文件解密（5.6+ 信封、AAD、key helper）
  auth.ts                        凭据 store：桌面文件 → 插件自留副本
  adapter.ts / catalog.ts        模型目录与 listModels
  probe.ts                       模型探测（max_tokens:1，逐档 effort）
lib/                             构建产物（进版本库；本机常因 node_modules 坏而手工同步）
tests/channel-fingerprint.spec.ts  指纹相关全部用例（16 个）
cordis.patch.yml                插件 bundle 的 loader 入口
```

**改指纹的完整动作**：`src/upstream.ts` → 手工同步 `lib/version-resolve-*.js` → 补测试 → 跑测试 → 覆盖已装副本 → 升版本 → 打 tgz → 重启验证。漏一步就会出现「代码对了但没生效」。

---

## 5. 构建与测试

本仓库的 `node_modules` 链接层**经常是坏的**：`.pnpm` 和 `.bin` 都在，只有顶层链接缺。`tsdown` 因此跑不起来，`lib/` 只能手工同步。

补链接（不要删 `node_modules` 重装——删了一样坏）：

```powershell
# 把 .pnpm 里的实体挂到顶层
$nm = "E:\workspace\dsh-workbuddy-connect\node_modules"
Get-ChildItem "$nm\.pnpm" -Directory | Where-Object { $_.Name -match '^(@deepseek-ai\+|vitest@|typescript@|tsdown@)' } | ForEach-Object { ... }
```

跑测试：

```sh
node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run tests/channel-fingerprint.spec.ts
```

缺 `@deepseek-ai/dsh-atomic-write` 之类报错，就是链接没补全。

手工同步产物后**必须** `node --check lib/version-resolve-*.js`。

打包与安装：

```sh
# 打包（不跑 tsdown，直接拷 lib，避免它先清空 lib/）
mkdir -p /tmp/pack/package && cp -r package.json lib cordis.patch.yml README*.md LICENSE THIRD_PARTY_NOTICES.txt /tmp/pack/package/
cd /tmp/pack && tar -czf out.tgz package && cp out.tgz <repo>/dist/dsh-workbuddy-connect-<ver>.tgz

# 安装：profile 的 package.json 里是 file: 绝对路径，换版本要一起改
dsh plugin --profile desktop add <repo>\dist\dsh-workbuddy-connect-<ver>.tgz
```

**`dist/` 里的 tgz 不能删**——安装记录是绝对路径，删了下次 `pnpm install` 会失败。

---

## 6. 踩过的坑（按血泪程度排）

1. **`tsdown` 默认先清 `lib/` 再构建**。构建失败（例如找不到 typescript）时，已提交的 6 个产物瞬间全没。跑构建前先确认清理行为，或准备好 `git checkout -- lib`。
2. **最小请求永远 200**。`ping` + 无 tools + 短 system 从来都能过，用它验证会得到假象。必须用真实 body。
3. **会话文件是多帧 zstd**。`zlib.zstdDecompressSync` 只解第一帧，会只拿到 241 字符的 session 头，误以为会话是空的。按 magic `28 B5 2F FD` 切帧。
4. **「差一个字符就翻转」几乎不是长度问题**。313 通过、314 失败时，所有人第一反应都是长度阈值。用等长替换（`root`→`base`）一秒证伪。
5. **掩码二分会出现「两半分别都通过、只有整段失败」**。说明触发点跨在分界线上，要顺着边界拼句子，别在单侧死磕。
6. **改了 `cordis.yml` 不生效**。DSH 明确要求改 `cordis.patch.yml`。
7. **插件不热更**。任何加载期改动都要完全退出 DSH 再启动。
8. **Windows 路径坑**：Git Bash 的 `/tmp` 和 Windows 原生进程眼中的 `/tmp` 不是同一个目录，跨工具传文件用完整 Windows 路径。

---

## 7. 未完成 / 待确认

| 事项 | 状态 |
|---|---|
| **模型探测里缺 `deepseek-v4.1-flash` 和 `glm-5.3-flash`** | **未解释**。用户报告的现象。但直接对这两个模型发 probe（`max_tokens:1`，0/low/medium/high/xhigh/max 六档）**全部 200**，目录里也都在。怀疑是探测结果缓存着 400 期间的状态，或指的是某个特定面板。下一个人接手时先问清「在哪看到的」 |
| awesome-dsh-plugin PR #8513 | CI 全绿，`held: author`，等维护者。不要重推、不要空 commit |
| `README.en.md` 与 `README.md` 结构差异 | 英文版还留着 `Known limitations` / `Compatibility and release history` 等章节，中文版已删。要对齐需人工决定删哪边 |
| npm 发版 | 做不到，包名归 corrinehu。要给人用只能 `github:AidenOrz/dsh-workbuddy-connect` 或 tgz |
| 下一轮指纹 | 必然还会有。上游加规则不发公告，按技能里的流程重新二分即可 |

---

## 8. 出问题先看哪

| 症状 | 先看 |
|---|---|
| 400 / 11128 | 技能 **`dsh-workbuddy-connect`** → `references/channel-check-campaign.md` |
| 怎么抓、怎么二分 | 同技能 → `references/capture-and-bisect.md`，配 `scripts/` 三个脚本 |
| 插件被判 incompatible | 技能 **`dsh-plugin-compat-adapt`** |
| 历史排查细节 | `docs/channel-check-fix.md` |
| 和其他分叉的差异 | `docs/fork-comparison.md` |

三个脚本（在技能目录下，直接用）：

```sh
node scripts/trace.mjs --patch      # 打点（自动备份，验证完 --unpatch）
node scripts/replay.mjs --probe <model>            # 用真凭据探测
node scripts/replay.mjs --body cap.json --prepare  # 过产物函数后发真实 body
node scripts/bisect.mjs --body cap.json --cut structure
```

`replay.mjs` 自己会解密凭据（spawn `WorkBuddy.exe` 取 at-rest key），token 只在内存里，不落盘。
