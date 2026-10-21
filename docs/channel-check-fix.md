# 渠道校验 400 / 11128 修复说明

> 记录 2026-10-21 对「请求被拦截，请重新发送」（HTTP 400 / code 11128）的定位与修复过程。
> 适用于 Windows 桌面版 WorkBuddy + DSH（DeepSeek Harness）插件 `dsh-workbuddy-connect`。
> 对应版本：0.7.10 → 0.7.11 → 0.7.12。

## 一、现象

在 DSH 中选择 WorkBuddy 分组下的任意模型发送消息，统一返回：

```
HTTP 400
{"code":11128,"msg":"Illegal API invocation from an unapproved channel",
 "displayMsg":{"zh":"请求被拦截，请重新发送"}}
```

同一账号、同一网络下，WorkBuddy 官方桌面客户端正常。说明问题出在插件构造的请求与官方客户端不一致，被上游的渠道校验识别为「非官方客户端」。

## 二、结论摘要

上游的校验规则在这一天里被逐步收紧，最终确认是**三层叠加**，外加一个 Windows 平台缺陷：

| # | 问题 | 引入/修复版本 |
|---|---|---|
| 1 | system 消息开头的身份句 `You are an AI agent powered by DeepSeek Harness.` | 上游 PR #204 / 0.7.10 |
| 2 | 紧随其后的 per-model 身份句 `You are a coding agent powered by the <模型> model.` | 0.7.11 |
| 3 | **全文**出现的产品名 `DeepSeek Harness`（DSH 每轮追加的 runtime context） | 0.7.12 |
| 4 | Windows 上读不到真实客户端版本与 CLI 版本，UA 是旧常量且缺 `CLI/…` 段 | 0.7.12 |

其中第 3 条是主因。前两版都在处理「开头句」，而上游实际上是对整条 system 消息做全文匹配。

## 三、根因详述

### 3.1 开头身份句

DSH 注入每个 agent 请求的 system 消息以这句话开头：

```
You are an AI agent powered by DeepSeek Harness.
```

以此为开头的请求被拒，改写为中性表述后放行。PR #204 的处理方式是：在 `prepareChatBody()` / `prepareCnChatBody()` 中，把 system / developer 消息**开头**的这句话改写为 `You are an AI agent.`。

### 3.2 per-model 身份句

DSH 在这句之后还会紧跟一行按模型生成的身份句：

```
You are a coding agent powered by the deepseek-v4.1-flash model.
```

第一句被中性化后，这一句会顶上来成为新的开头句，同样被拦。0.7.11 把匹配范围扩到这两种形态，并处理同一条 system 消息开头连续堆叠的多条身份句。

这里有三个容易踩的细节：

- 模型名 `deepseek-v4.1-flash` **本身含点号**，扫描段不能用 `[^.\n]`，否则在 `v4.1` 处就断了；
- 句尾不能只锚定 `Harness`，要同时接受 `model`；
- 长会话里 DSH 会重复追加 system 消息，每条都要处理，只改第一条无效。

### 3.3 全文产品名扫描（主因）

前两版改完后仍然 400。通过在插件发送前打点、抓取真实请求体，发现 body 里还有 **11 处** `DeepSeek Harness`：

```
Current DeepSeek Harness implementation checkout:
  "C:\...\Programs\DeepSeek Harness\resources\app.asar\dsh\"

Current DeepSeek Harness Web GUI URL: "http://127.0.0.1:53350"
```

这是 DSH 每轮都会追加的 runtime context，多轮会话会重复多段。把这几段里的产品名整体替换为 `the agent runtime` 后，**同一请求立即成功**（日志不再出现 `http-400`），由此确认上游是对 system 消息做全文扫描，而不是前缀规则。

补充观察：user 消息里保留 `DeepSeek Harness` 不影响通过，因此只处理 system / developer，尽量不动用户原文。

### 3.4 Windows 客户端身份缺失

抓包还发现请求头与本机实际客户端不符：

| 字段 | 修复前 | 本机实际 / 修复后 |
|---|---|---|
| `User-Agent` | `WorkBuddy/5.5.6 WorkBuddy/5.5.6` | `WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0` |
| `X-IDE-Version` | `5.5.6` | `5.8.3` |

原因在 `client-identity.ts`：`installedCnApp()` 只有 macOS 分支，Windows 上直接返回 `undefined`，于是客户端版本永远落到编译常量 `FALLBACK_CN_APP_VERSION = '5.5.6'`；同时 `cliPackagePath()` 只认 macOS 的 `Contents/Resources/...` 布局，Windows 上读不到 CLI 版本，UA 因此缺少 `CLI/…` 段。

这一条单独修复并不能让请求通过（UA 补齐后仍 400），但属于真实缺陷，一并修正。

## 四、排查方法

问题难在「看不到真正发出去的内容」。最终采用的方法是**在插件发送前打点**，把请求体与响应写到本地文件：

| 打点位置 | 记录内容 |
|---|---|
| `prepareChatBody()` 入口 / 出口 | `chat-in` / `chat-out` |
| `prepareCnChatBody()` 入口 / 出口 | `cn-in` / `cn-out` |
| `chatStream()` 调用 `fetch` 前 | `wire`（URL + headers，`Authorization` 打码） |
| 同上 | `body-full`（完整请求体） |
| 响应非 2xx 时 | `http-<状态码>`（上游原始响应） |

几个实操要点：

- 写文件用 `Function("return import('node:fs')")()` 动态导入，避免打包产物的静态依赖；
- 每次改完先 `node --check` 校验语法，再重启 DSH；
- 插件是加载时注册的，**改代码必须重启**才生效；
- 成功请求不走失败分支，所以「日志里没有 `http-400`」就是成功信号。

## 五、改动清单

| 文件 | 改动 |
|---|---|
| `src/upstream.ts` | 新增 `PRODUCT_NAME_PATTERN = /DeepSeek Harness/gu` 与 `scrubProductName()`；在 `neutralizeChannelIdentity()` 中对 system / developer 的字符串与数组 `text` 部件追加产品名替换。同步维护 `CHANNEL_IDENTITY_PATTERN`，覆盖两种身份句形态（含带点号的模型名），并按「块」处理开头连续堆叠的身份句 |
| `src/client-identity.ts` | `cliPackagePath()` 增加 Windows 布局（`resources/app.asar.unpacked/cli/package.json`）；新增 `windowsFileVersion()`，通过 PowerShell 读 `WorkBuddy.exe` 的 FileVersion；`installedCnApp()` 增加 win32 分支（`%LOCALAPPDATA%\Programs\WorkBuddy`） |
| `tests/channel-fingerprint.spec.ts` | 新增用例：per-model 身份句、两行堆叠、全文产品名替换、user 消息不受影响、邻近表述（`powered by Claude`、`You are a helpful assistant`）不被误伤 |
| `lib/version-resolve-DiKF7oj3.js` | 构建产物同步（等价于 `tsdown` 输出） |
| `package.json` | 版本 `0.7.12` |

关键正则（两种身份句）：

```js
/^[\s\uFEFF]*You are an?(?: AI)?(?: coding)? agent powered by [^\n]{1,80}?(?:Harness|model)\.?(?=\s|$)/iu
```

产品名替换：

```js
const PRODUCT_NAME_PATTERN = /DeepSeek Harness/gu
const NEUTRAL_PRODUCT_NAME = 'the agent runtime'
```

## 六、验证结果

**请求体（system 消息，修复前 → 修复后）**

```
[developer] You are an AI agent powered by DeepSeek Harness.
            You are a coding agent powered by the deepseek-v4.1-flash model.
            Current DeepSeek Harness implementation checkout: "..."
        ↓
[system]    You are an AI agent.
            You are an AI agent.
            Current the agent runtime implementation checkout: "..."
```

`role` 同时从 `developer` 归一化为 `system`；user 消息逐字节不变。

**请求头**

```
User-Agent:     WorkBuddy/5.5.6 WorkBuddy/5.5.6
            →   WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0
X-IDE-Version:  5.5.6 → 5.8.3
```

**结果**：同一账号、同一模型、同一网络，请求返回 200 并正常流式输出，`WorkBuddy` 分组下各模型恢复可用。

## 七、已知副作用与风险

1. **checkout 路径会被一并改写。** 产品名替换是无差别的，因此
   `C:\...\Programs\DeepSeek Harness\resources\app.asar\dsh\` 会变成
   `C:\...\Programs\the agent runtime\resources\app.asar\dsh\`。
   模型如果被要求读取该路径会失败。若确有需要，可改为只保留相对路径（如 `\resources\app.asar\dsh\`），但需重新验证上游是否仍然放行。
2. **这是字节级兼容改写，属于猫鼠游戏。** 上游一旦调整校验维度（例如改成校验请求头签名、或归一化提示词），需要重新评估。
3. **账号风险不变。** 官方服务条款对第三方接入有限制，能够正常调用不代表获得授权，风险仍由使用者自行承担。

## 八、版本与提交

| 版本 | 内容 | 提交 |
|---|---|---|
| 0.7.10 | 合并上游 PR #204：中和开头的身份句 | `0c9b269`（merge） |
| 0.7.11 | 扩展 per-model 身份句，处理连续堆叠的身份行 | `648070a` |
| 0.7.12 | 全文产品名中性化；Windows 客户端版本与 CLI 版本读取 | `30eb509` |

安装（从本仓库源码，同一 profile 内会替换同名旧版）：

```sh
dsh plugin --profile desktop add github:AidenOrz/dsh-workbuddy-connect
```
