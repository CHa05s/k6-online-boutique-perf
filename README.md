# k6 Online Boutique 性能测试

基于 [k6](https://grafana.com/docs/k6/latest/) 对 Google 开源微服务电商系统 [Online Boutique](https://github.com/GoogleCloudPlatform/microservices-demo)(11 个微服务、gRPC 通信)的分层性能测试项目。

## 被测系统

Online Boutique v0.10.7:浏览 → 加购 → 下单完整电商链路,Go/C#/Node/Python/Java 多语言微服务,服务间 gRPC 通信,cartservice 使用 Redis 缓存。上游已不提供 docker-compose,本仓库依据官方 Kubernetes 清单维护了一份 compose(见 `docker-compose.yml`)。

## 测试分层

| 层 | 脚本 | 目的 |
|---|---|---|
| HTTP 全链路 | `scripts/user-journey.js` | 模拟真实用户行为,找系统级拐点 |
| gRPC 服务级 | `scripts/grpc-service-level.js` | 绕过前端直连单服务,定位瓶颈所在层/服务 |

## 快速开始

```bash
# 1. 启动被测系统(首次拉镜像约 1-2 GB)
docker compose up -d

# 2. 验证可用
curl -I http://localhost:8080

# 3. 冒烟(默认场景)
k6 run scripts/user-journey.js

# 4. 负载测试(梯度加压找拐点)
k6 run -e SCENARIO=load scripts/user-journey.js

# 5. gRPC 分层压测(默认汇率服务)
k6 run scripts/grpc-service-level.js
k6 run -e SERVICE=productcatalogservice scripts/grpc-service-level.js
k6 run -e SERVICE=recommendationservice scripts/grpc-service-level.js
```

## 场景设计

| 场景 | 执行器 | 参数 | 用途 |
|---|---|---|---|
| smoke | constant-vus | 5 VU / 1 min | CI 门禁、可用性验证 |
| load | ramping-vus | 50→200→0 VU | 梯度加压找吞吐拐点 |
| spike | ramping-vus | 20→300 VU(10s 陡增) | 大促洪峰型流量 |
| soak | constant-vus | 50 VU / 30 min | 稳定性:内存/连接泄漏 |

用户行为按比例建模:浏览 75% / 加购 15% / 下单 10%,思考时间 0.3-2s 随机。

## 指标与门禁

- thresholds 硬门禁:`http_req_duration p(95) < 500ms`、错误率 `< 1%`,超阈值以非零退出码结束,供 CI 拦截
- gRPC 层门禁:`grpc_req_duration p(95) < 100ms`
- 服务端监控:配合 Prometheus + Grafana 采集各服务资源指标,与 k6 客户端指标同屏联动(容器自带 OpenTelemetry 埋点)

## CI

`.github/workflows/k6.yml`:push / PR 触发,CI 内自动拉起完整被测系统并执行 HTTP + gRPC 冒烟,任何一步失败即阻断合并。全量负载场景在本地/按需执行。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| BASE_URL | http://localhost:8080 | 前端地址 |
| SCENARIO | smoke | smoke / load / spike / soak |
| SERVICE | currencyservice | gRPC 压测目标服务 |
| VUS / DURATION | 20 / 1m | gRPC 压测并发与时长 |

## 目录结构

```
.
├── docker-compose.yml          # 被测系统部署(依据官方 k8s 清单编写)
├── scripts/
│   ├── user-journey.js         # HTTP 全链路用户旅程
│   ├── grpc-service-level.js   # gRPC 服务级分层压测
│   ├── data.js                 # 共享测试数据
│   └── protos/demo.proto       # gRPC 协议(官方 v0.10.7)
└── .github/workflows/k6.yml    # CI 冒烟门禁
```
