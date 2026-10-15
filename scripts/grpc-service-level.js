// gRPC 服务级分层压测
// 绕过前端直连后端服务,用于定位"HTTP 层慢还是服务慢"。
// 用法:k6 run -e SERVICE=currencyservice scripts/grpc-service-level.js
// SERVICE: currencyservice | productcatalogservice | recommendationservice | cartservice
import grpc from 'k6/net/grpc';
import { check } from 'k6';

const SERVICE = __ENV.SERVICE || 'currencyservice';

// 宿主机端口映射见 docker-compose.yml(分层的入口)
const TARGETS = {
  currencyservice: { addr: __ENV.CURRENCY_ADDR || 'localhost:7000', fn: testCurrency },
  productcatalogservice: { addr: __ENV.CATALOG_ADDR || 'localhost:3550', fn: testCatalog },
  recommendationservice: { addr: __ENV.RECOMMENDATION_ADDR || 'localhost:8081', fn: testRecommendation },
  cartservice: { addr: __ENV.CART_ADDR || 'localhost:7070', fn: testCart },
};

const target = TARGETS[SERVICE] || TARGETS.currencyservice;

const client = new grpc.Client();
// k6 2.x:load(importPaths, ...protoFiles),第一个参数是 import 搜索路径
client.load([], 'protos/demo.proto');

export const options = {
  scenarios: {
    service_level: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 20,
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    grpc_req_duration: ['p(95)<100'],
  },
};

// 汇率换算:内部 QPS 最高的服务,单实例上限是经典瓶颈
function testCurrency() {
  const res = client.invoke('hipstershop.CurrencyService/Convert', {
    from: { currency_code: 'USD', units: 1, nanos: 0 },
    to_code: 'EUR',
  });
  check(res, { 'convert ok': (r) => r && r.status === grpc.StatusOK });
}

// 商品目录:列表与详情
function testCatalog() {
  const list = client.invoke('hipstershop.ProductCatalogService/ListProducts', {});
  check(list, { 'list ok': (r) => r && r.status === grpc.StatusOK && r.message.products.length > 0 });

  const detail = client.invoke('hipstershop.ProductCatalogService/GetProduct', {
    id: 'OLJCESPC7Z',
  });
  check(detail, { 'get ok': (r) => r && r.status === grpc.StatusOK });
}

// 推荐:依赖购物车内容的计算型服务
function testRecommendation() {
  const res = client.invoke('hipstershop.RecommendationService/ListRecommendations', {
    user_id: 'k6-grpc-test',
    product_ids: ['OLJCESPC7Z'],
  });
  check(res, { 'recommend ok': (r) => r && r.status === grpc.StatusOK });
}

// 购物车:写入 + 读取(REDIS 后端)
function testCart() {
  const add = client.invoke('hipstershop.CartService/AddItem', {
    user_id: 'k6-grpc-test',
    item: { product_id: 'OLJCESPC7Z', quantity: 1 },
  });
  check(add, { 'add ok': (r) => r && r.status === grpc.StatusOK });

  const get = client.invoke('hipstershop.CartService/GetCart', { user_id: 'k6-grpc-test' });
  check(get, { 'get ok': (r) => r && r.status === grpc.StatusOK });
}

export default function () {
  client.connect(target.addr, { plaintext: true });
  target.fn();
  client.close();
}
