# DeFi Strategy Agent on Ritual Chain

每天自动拉取多链 DeFi 数据（TVL、收益率），由 LLM 分析生成中文策略报告。

## 架构

```
fetch()                     analyze()
  │                            │
  └─ HTTP precompile (0x0801)  └─ LLM precompile (0x0802)
      拉取 DeFiLlama 数据         分析数据生成策略报告
      ↓                           ↓
      存储 rawData                存储 lastAnalysis
      触发 StrategyReport event
```

## 合约

| 项目 | 值 |
|------|-----|
| 地址 | `0xdfbBDf676d1d28eb6431841C4F00970774a4139D` |
| Chain | Ritual Testnet (1979) |
| Explorer | [查看](https://explorer.ritualfoundation.org/address/0xdfbBDf676d1d28eb6431841C4F00970774a4139D) |
| 数据源 | DeFiLlama `/v2/chains` |
| LLM 模型 | GLM-4.7-FP8 (TEE 内运行) |

## 使用

```bash
cd ritual-deploy
cp .env.example .env   # 填入私钥 PRIVATE_KEY=

# 部署（已完成）
node deploy-defi.js

# 配置 + 运行
node start-defi.js

# 查询状态
node check-defi.js
```

## 两步执行（Ritual 限制：每交易一个 precompile）

1. `fetch()` — HTTP precompile 拉数据，result inline
2. `analyze()` — LLM precompile 分析数据，result inline

## 文件

```
ritual-agent/src/DeFiStrategyAgent.sol   # Solidity 合约 (Foundry)
ritual-deploy/deploy-defi.js             # 部署脚本
ritual-deploy/start-defi.js              # 配置 + 运行脚本
ritual-deploy/check-defi.js              # 状态查询脚本
```
