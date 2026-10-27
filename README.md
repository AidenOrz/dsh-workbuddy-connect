# DSH WorkBuddy Connect

[English](./README.en.md) | 中文
# 天下没有不散的宴席？
## 分支合并通知

本仓库已合并上游修复分支 [`fix/channel-identity-opener`](https://github.com/corrinehu/dsh-workbuddy-connect/pull/204)（PR [#204](https://github.com/corrinehu/dsh-workbuddy-connect/pull/204)，作者 [@Elycheng](https://github.com/Elycheng)），合并提交 `0c9b269`；此后又修了三轮，并适配了 DSH `0.2.1-rc.3`，现为 **0.7.14**。

**起因**：2026 年 10 月 20 日起，国内网关会拦下带 DSH 客户端特征的请求，返回 `HTTP 400 / code 11128`（「请求被拦截，请重新发送」），WorkBuddy 分组下的模型全部不可用，而官方 App 正常。

**修复**：

- **0.7.10**：把 system 消息开头的 `You are an AI agent powered by DeepSeek Harness.` 改写为 `You are an AI agent.`；
- **0.7.11**：补上紧随其后的 `You are a coding agent powered by <模型> model.`（模型名含点号），并处理开头连续堆叠的多条身份句；
- **0.7.12**：校验实际是**全文扫描**——DSH 每轮追加的 runtime context 含十余处 `DeepSeek Harness`，现统一改写为 `the agent runtime`（user 消息不动）；同时修正 Windows 上读不到真实客户端版本的问题，UA 恢复为 `WorkBuddy/<应用版本> WorkBuddy/<应用版本> CLI/<CLI 版本>`。
- **0.7.13**：适配 DSH `0.2.1-rc.3`。DSH 用插件的 `engines.dsh`（没写则用 `peerDependencies` 里所有 `@deepseek-ai/dsh*`）与运行时版本比对，任一不满足就判 `incompatible-version` **拒绝安装/拒绝启动**；原先 peer 钉在精确的 `0.2.1-rc.2`，rc.3 一升级就整包不可用。现改为 `engines.dsh: ^0.2.1-rc.2` 且 peer 用同一条 caret 范围，rc.2 与 rc.3 都满足，又不跨到 0.3。
- **0.7.14**：2026-10-27 起又出现 11128，但原因和产品名无关。抓包后对真实 49 KB 请求体做二分，定位到 `@deepseek-ai/dsh-file-reference` 贡献的一句话 `Relative paths resolve from the workspace root`——网关按**整句**匹配它。改句中的任意一个词（`resolve`→`map`、`workspace`→`dir`）或整句删掉，同一份请求体立即返回 200；而单独出现 `workspace root`、或把它夹在填充文本里都不触发，所以这是句子级规则而非词表。现改写为 `Relative paths resolve against the workspace directory`，语义不变。

完整排查过程、验证数据与已知副作用见 [`docs/channel-check-fix.md`](./docs/channel-check-fix.md)。

**需要注意**：这是针对上游渠道校验的字节级兼容改写，属于「猫鼠游戏」，上游调整校验维度后可能需要重新适配；checkout 路径也会被一并改写，模型若需读取该路径会失败。账号与接入风险仍按文末「免责声明」由使用者自行承担。

**版本说明**：npm 上的 `latest` 目前仍是 0.7.9，上述修复只存在于仓库 `main`（0.7.14）上；要用请按「安装」章节里的 `github:` 命令从本仓库安装，GitHub 不通时可用本地 tgz（见下）。

本仓库 `main` 现已领先上游若干提交；后续同步上游时请不要直接硬重置，以免丢掉这些修复。

---

将已登录的 WorkBuddy / WorkBuddy AI 桌面应用中可用的模型接入 DeepSeek Harness；两版分别显示各自的模型分组，并沿用各自的账号登录与积分。

## 安装

**前置**：本机已安装并登录 WorkBuddy（国内版）或 WorkBuddy AI 桌面 App。插件复用 App 的登录状态，账号切换自动跟随，两版互不影响。

插件版本必须与 DSH 内核匹配，不匹配会被判定为 `incompatible-version` 而拒绝安装或拒绝启动；桌面版以 App 内置核心为准。本仓库在 **DSH `0.2.1-rc.2` / `0.2.1-rc.3`**（Node 22+、pnpm 11）上验证：

| DSH 内核 | 插件版本 |
|---|---|
| `0.2.1-rc.3` | `0.7.14`（本仓库 `main`） |
| `0.2.1-rc.2` | `0.7.14` / `0.7.12`（本仓库 `main`）／`0.7.9`（npm） |
| `0.2.1-rc.1` | `0.7.7` |
| `0.2.0-rc.2` | `0.7.6` |
| `0.2.0-rc.1` | `0.7.0` |
| `0.1.5` – `0.1.7` | `0.6.5` |

### 桌面版（Windows / macOS）

用**桌面 App 自带 runtime 里的 `dsh`** 执行，不要用独立 CLI——官方 Electron 版会拒绝独立 CLI 的 `--profile desktop`。

```sh
dsh plugin --profile desktop add github:AidenOrz/dsh-workbuddy-connect
```

- **npm 上的 `latest` 仍是 `0.7.9`，不含 2026-10-21 的渠道校验修复，也不含 rc.3 适配**。上面这条命令从本仓库 `main` 安装 `0.7.14`。
- 同一 profile 内包名唯一：这条命令会**替换**已装的同名插件，不会并存。回退到 npm 版：`dsh plugin --profile desktop add dsh-workbuddy-connect@0.7.9`。
- 装完必须**完全退出并重启** App，插件只在启动时加载。
- `github:` 源由 pnpm 调 `git ls-remote` 解析，GitHub 不可达会报 `ERR_PNPM_GIT_RESOLVE_FAILED` / `CONNECT tunnel failed`。**这时改成装本地 tgz，全程不走网络**：

  ```sh
  # 在本仓库目录里打包（会触发 tsdown 构建），产出 dsh-workbuddy-connect-0.7.14.tgz
  pnpm install && pnpm pack

  # 先摘掉旧的 git 源条目，否则 pnpm 仍会去拉 GitHub
  dsh plugin --profile desktop remove dsh-workbuddy-connect
  dsh plugin --profile desktop add <tgz 的绝对路径>
  ```

  注意安装记录会变成这个绝对路径，tgz 被删掉后再次 `pnpm install` 会失败；长期使用建议在 GitHub 可达时换回 `github:` 源。
- 本机实测环境：Windows 11 + WorkBuddy `5.8.3` + DSH `0.2.1-rc.3`。

### Web / TUI

```sh
# Web（示例：内核 0.2.1-rc.2 → 插件 0.7.9）
dsh plugin --profile web add dsh-workbuddy-connect@0.7.9
dsh web

# TUI（示例：内核 0.1.x → 插件 0.6.5；该 profile 需 pnpm 11，如 npx pnpm@11）
dsh plugin --profile dsh-tui add dsh-workbuddy-connect@0.6.5
dsh --profile dsh-tui
```

> Web / TUI 也可以用 `github:AidenOrz/dsh-workbuddy-connect` 装 `0.7.14`，但本仓库只在桌面版实测过。
> TUI 版本搭配：终端壳 `@deepseek-harness-tui/dsh-tui` 需 `0.10.0-beta.5` 及以上，更早版本装本插件会启动失败（`events is not iterable`）；推理档位的手动检测仅 Web / Desktop 提供，TUI 没有。

### 验证

重启对应界面后，模型选择器出现「WorkBuddy / WorkBuddy AI」分组（只装一版就只验对应一组），从分组里选一个模型完成一次简短对话、能正常回复，才算安装成功。

### 装不上时

- **`incompatible-version` / 提示「Plugin … is incompatible with dsh 0.2.1-rc.x」**：DSH 升级后插件版本没跟上，换用对应内核的插件版本（见上方版本表）。临时绕过可用 `dsh plugin allow-version` 给「插件@版本 + 内核版本」这一对组合开豁免，但那只是跳过校验，不代表真的兼容。
- `ERR_PNPM_GIT_RESOLVE_FAILED` / `CONNECT tunnel failed`：GitHub 不可达，给 git 配置代理后重试，或改用本地 tgz（见上）。
- `ERR_MODULE_NOT_FOUND: @deepseek-ai/...`：该 profile 的依赖树不完整（pnpm 链接失效），需要先在 profile 目录重新 `pnpm install`，或改用 App 内置的插件渠道。
- 部分 Desktop 发行版（尤其官方 Electron 版）的 `desktop` profile 由 App 管理，规则随发行版不同；不要盲改 App 管理的目录，也不要绕过其校验。

## 功能

- **开箱即用**：安装并启用插件后即可在 DSH 中直接使用，无需额外配置。

![WorkBuddy 模型出现在 DSH 模型选择器中](assets/1.png)

- **国内版与国际版并存**：国内版显示为「WorkBuddy」分组，国际版（WorkBuddy AI）显示为「WorkBuddy AI」分组，两版的模型、账号和积分互不混用。各自只跟随对应 App 的登录状态：只装国际版就只出现 WorkBuddy AI，两版都装则两组并存，退出一版则对应分组消失。设置里两张卡片分别展示各自账号与余额。

![WorkBuddy AI 模型出现在 DSH 模型选择器中](assets/5.png)

- **图片输入**：大部分模型支持在对话里直接粘贴或拖入图片（GLM-5.3-Flash、DeepSeek-V4 系列等）；少数纯文字模型（如 GLM-5.1、GLM-5.2）会明确提示不支持。

- **推理档位**：WorkBuddy 明确声明的档位会直接显示，例如 GLM-5.3 和 GLM-5.3-Flash 可选 low / high / max。未声明档位的模型可在 Web 和 Desktop 的模型选择器中手动检测（发送少量请求，可能消耗积分）；未检测或没有可用档位的模型使用 WorkBuddy 默认档位。

- **余额速览**：选中 WorkBuddy / WorkBuddy AI 模型时，输入框底部在模型选择器旁显示当前账号的剩余积分（如 `WB.3,401（积分）`、国际版 `WB AI.3,401（积分）`）。积分不自动轮询（每次读取都是真实计费查询），挂载时读取一次后可点积分文字前方的 ↻ 手动刷新。切换会话时组件可能短暂隐藏，模型选择就绪后自动恢复；即使模型没有推理档位检测入口或余额读取失败，刷新按钮仍保留。

- **信息查看与检测**：设置 → 插件 → 对应卡片可查看账号、令牌有效期、剩余积分和模型优惠，也可手动刷新模型列表并查看当前列表来自上游还是内置兜底，或对可检测模型手动检测推理档位。DSH 0.1.5 的入口在「设置 → 插件」，0.1.6+ 移到主界面左侧栏「插件」面板（workbuddy-connect → 查看）；「设置 → 模型」页两代都不显示 WorkBuddy 条目，属有意设计。

- **模型显隐**：两张卡片的「上下文窗口」标签里可勾选要在模型选择器中显示的模型。隐藏配置按登录账号分别保存：切换账号自动切换各自配置，切回后恢复；新账号和新上架模型默认显示。隐藏只影响选择器中的可选性，正在使用该模型的已有会话不受影响。


## 命令行

在已安装插件的 profile 上执行：

```sh
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-workbuddy-connect <status|doctor|logout>
```

- `status`：登录状态与剩余积分；`doctor`：不含密钥的环境诊断；`logout`：只删除该版插件自留的凭据副本，不动桌面 App 自己的登录，也不承诺模型分组一定消失（App 的凭据文件仍在时依然生效）。
- `--json` 输出机器可读格式，**仅 `status` / `doctor` 支持**；`logout` 加上会报 invalid options。
- `--provider <id>` 选择版本，取值 `workbuddy`（默认，国内版）或 `workbuddy-ai`（国际版），也接受 `--provider=<id>`：

```sh
dsh plugin --profile web exec dsh-workbuddy-connect status --provider workbuddy-ai
dsh plugin --profile web exec dsh-workbuddy-connect doctor --provider workbuddy-ai
```

> 三个子命令都要先经该 profile 的 `node_modules` 加载插件本体。若 profile 依赖树不完整，会直接报 `ERR_MODULE_NOT_FOUND`，与命令写法无关（见「装不上时」）。

## 配置

配置写在**该 profile 的 `cordis.patch.yml`**，不是 `cordis.yml`——后者的内容是空数组，注释里也写明「Edit cordis.patch.yml, not this file」。patch 是 YAML 数组，插件的 entry id 是 `llm-workbuddy`：

```yaml
- id: llm-workbuddy
  config:
    retryPolicy:
      mode: normal
      maxRetries: 15
      backoff:
        initialDelayMs: 2000
        maxDelayMs: 30000
```

- 国内版与国际版共用这一份配置；插件只在加载时读取一次，改完需重启 DSH 才生效。
- **省略整个 `retryPolicy` 即保持默认**（沿用 `dsh-llm`）：`mode: normal`、5 次重试、500 ms 起翻倍、10 s 封顶、抖动 10%，合计约 **15.5 秒**退避（区间约 14–17 秒），每次请求自身的耗时另计，不构成「固定窗口内必然恢复」的保证。
- **上面的示例**最多约 **360 秒**退避（抖动上限约 396 秒），适合覆盖数分钟级的上游中断；中断更久仍需调大 `maxRetries` 或换线路。
- `mode: always` 表示**不设次数上限**，一直重试到成功、取消或插件卸载；它不是默认值，也不会因省略配置而启用，只在能接受「请求长时间不返回」时使用。
- `mode` 为必填（`normal` / `always`）。`normal` 还接受 `retryableCodes`（默认 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`）与 `backoff.jitterRatio`（默认 `0.1`）。



## 免责声明

- 本项目**仅供个人学习和研究使用**，仅驱动使用者自己的 WorkBuddy／WorkBuddy AI 账号在本机调用，请勿用于商业用途或超出个人合理使用的场景。
- 本项目与腾讯、WorkBuddy、DeepSeek 均无关联，未获其授权或认可；文中出现的名称仅用于描述兼容关系，商标权利归各自所有。
- **第三方接入存在账号风险。** 官方服务条款对未经授权的第三方接入设有限制。使用本项目可能导致账号或功能受限、账号封禁、服务暂停或终止。能够正常调用、正常扣费，不代表获得官方授权或不存在账号风险。
- 请充分了解上述风险，并自行决定是否安装和使用。因使用本项目产生的账号限制、额度损失、服务中断等后果，由使用者自行承担；如不能接受，请使用官方客户端。
- 本项目不保证服务持续可用、账号不受限制或积分展示始终准确。开发者无法控制平台的限制、处罚或服务调整。
- 本项目作者不对任何因使用或滥用本项目产生的直接或间接损失负责。

## 相关项目 / 社区生态

- **[dsh-workbuddy-switcher](https://github.com/ddGuo/dsh-workbuddy-switcher)**：社区维护的 WorkBuddy 账号管理与切换插件。
- **[hana-workbuddy-connect](https://github.com/miaoyongxu/hana-workbuddy-connect)**：社区维护的非官方适配项目，复用 `dsh-workbuddy-connect` 的部分实现，为 HanaAgent 接入 WorkBuddy / WorkBuddy AI 模型。

适用版本与安装要求请参阅各项目说明。以上项目均由第三方独立维护；收录不代表官方背书，也不构成本插件内部接口的稳定性或兼容性承诺。

## 致谢

- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api)（MIT）— WorkBuddy 上游协议的参照实现。
- [franksong2702/dsh-codex-connect](https://github.com/franksong2702/dsh-codex-connect)（Apache-2.0）— DSH 插件结构与 provider 注册的参照。

## 许可证

[MIT](./LICENSE)
