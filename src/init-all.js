import { initializeAll } from './crawler.js';
console.log('开始初始化三分类历史索引。为减少对原站压力，将顺序、低频请求。');
const summary = await initializeAll();
console.table(summary);
console.log('初始化完成。');
