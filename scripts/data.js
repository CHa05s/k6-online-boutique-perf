// 共享测试数据:商品池与下单参数
// 商品 ID 来自 Online Boutique 官方演示数据(productcatalogservice 内置目录)
export const PRODUCT_IDS = [
  'OLJCESPC7Z',
  '9SIQT8TOJO',
  '2ZYFJ3GM2N',
  '66VCHSJNUP',
  '1YMWWN1N4O',
  'L9ECAV7KIM',
  'LS4PSXUNUM',
  '0PUK6V6EV0',
  '6E92ZMYYFZ',
];

export function randomProductId() {
  return PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
}

// 下单表单参数:信用卡为演示系统的 mock 支付数据,不产生真实账务
export const CHECKOUT_FORM = {
  email: 'k6-perf-test@example.com',
  street_address: '1 Market Street',
  zip_code: '94105',
  city: 'San Francisco',
  state: 'CA',
  country: 'United States',
  credit_card_number: '4432-8015-6152-0454',
  credit_card_expiration_month: '11',
  credit_card_expiration_year: '2027',
  credit_card_cvv: '672',
};

// 模拟用户思考时间(秒),上下界可随场景调整
export function thinkTime(min = 0.3, max = 2) {
  return min + Math.random() * (max - min);
}
