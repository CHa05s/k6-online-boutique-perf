// HTTP 全链路用户旅程压测
// 场景选择:k6 run -e SCENARIO=load scripts/user-journey.js (smoke / load / spike / soak)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomProductId, CHECKOUT_FORM, thinkTime } from './data.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const SCENARIO = __ENV.SCENARIO || 'smoke';

const SCENARIOS = {
  // 冒烟:CI 门禁用,5 VU / 1 分钟,验证基本可用
  smoke: { executor: 'constant-vus', vus: 5, duration: '1m' },
  // 负载:梯度加压找拐点,50 -> 200 -> 0
  load: {
    executor: 'ramping-vus',
    stages: [
      { duration: '2m', target: 50 },
      { duration: '3m', target: 200 },
      { duration: '3m', target: 200 },
      { duration: '2m', target: 0 },
    ],
  },
  // 洪峰:大促秒杀型流量,20 基线 -> 瞬间 300
  spike: {
    executor: 'ramping-vus',
    stages: [
      { duration: '1m', target: 20 },
      { duration: '10s', target: 300 },
      { duration: '2m', target: 300 },
      { duration: '1m', target: 0 },
    ],
  },
  // 稳定性:中等负载长时间跑,抓内存/连接泄漏
  soak: { executor: 'constant-vus', vus: 50, duration: '30m' },
};

export const options = {
  scenarios: {
    [SCENARIO]: SCENARIOS[SCENARIO] || SCENARIOS.smoke,
  },
  thresholds: {
    // 核心指标门禁:超阈值以非零退出码结束,供 CI 拦截
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
  // 探索性调参时不硬性中断,CI 中再开启严格模式
  abortOnFail: false,
};

// 用户行为比例建模:浏览 75% / 加购 15% / 下单 10%
const BEHAVIOR_WEIGHTS = [
  { name: 'browse', w: 75, fn: browse },
  { name: 'add_to_cart', w: 15, fn: addToCart },
  { name: 'checkout', w: 10, fn: checkout },
];

function pickBehavior() {
  const total = BEHAVIOR_WEIGHTS.reduce((s, b) => s + b.w, 0);
  let r = Math.random() * total;
  for (const b of BEHAVIOR_WEIGHTS) {
    r -= b.w;
    if (r <= 0) return b;
  }
  return BEHAVIOR_WEIGHTS[0];
}

// 浏览:首页 + 商品详情
function browse() {
  const home = http.get(`${BASE_URL}/`);
  check(home, { 'home 200': (r) => r.status === 200 });

  const productId = randomProductId();
  const detail = http.get(`${BASE_URL}/product/${productId}`);
  check(detail, { 'product 200': (r) => r.status === 200 });
}

// 加购:POST 表单到购物车
function addToCart() {
  const productId = randomProductId();
  const res = http.post(`${BASE_URL}/cart`, {
    product_id: productId,
    quantity: '1',
  });
  check(res, { 'add cart 302': (r) => r.status === 302 });
}

// 下单:完整结算链路
function checkout() {
  addToCart();
  const res = http.post(`${BASE_URL}/cart/checkout`, CHECKOUT_FORM);
  check(res, { 'checkout ok': (r) => r.status === 302 || r.status === 200 });
}

export default function () {
  const behavior = pickBehavior();
  behavior.fn();
  sleep(thinkTime());
}
