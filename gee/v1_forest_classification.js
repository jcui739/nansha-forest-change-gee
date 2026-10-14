// ============================================================
// v1: 单年森林分类 + 精度评估
// 追加到 v0 代码末尾运行（依赖 aoi, comp2021, yearComp）
// ============================================================

// ---- 1. 二分类标签：10=森林→1，其余→0 ----
var wc = ee.Image('ESA/WorldCover/v200/2021').select('Map').clip(aoi);
var label = wc.eq(10).rename('forest');
Map.addLayer(label.selfMask(), {palette: ['006400']}, '标签：森林(WorldCover)');

// ---- 2. 特征矩阵：6波段 + NDVI ----
var ndvi = comp2021.normalizedDifference(['nir','red']).rename('NDVI');
var features = comp2021.addBands(ndvi);
var bandNames = features.bandNames();
print('输入特征波段:', bandNames);

// ---- 3. 分层抽样 ----
var samples = label.addBands(features).stratifiedSample({
  numPoints: 500,
  classBand: 'forest',
  region: aoi,
  scale: 30,
  seed: 42,
  geometries: true
});
print('总样本数:', samples.size());

// ---- 4. 70/30 随机划分 ----
// 【局限】随机划分，不是空间分块，精度会被高估
var samples = samples.randomColumn('rand', 42);
var train = samples.filter(ee.Filter.lt('rand', 0.7));
var test  = samples.filter(ee.Filter.gte('rand', 0.7));
print('训练集:', train.size(), ' 验证集:', test.size());

// ---- 5. 训练随机森林 ----
var classifier = ee.Classifier.smileRandomForest(100)
  .train({
    features: train,
    classProperty: 'forest',
    inputProperties: bandNames
  });

// ---- 6. 评估 ----
var validated = test.classify(classifier, 'predicted');
var cm = validated.errorMatrix('forest', 'predicted');

print('========== 混淆矩阵（行=真实，列=预测）==========');
print(cm);
print('Overall Accuracy:', cm.accuracy());

var pa = cm.producersAccuracy();
var balAcc = ee.Number(pa.get([0,0])).add(ee.Number(pa.get([1,0]))).divide(2);
print('Balanced Accuracy:', balAcc);
print('Kappa:', cm.kappa());

// ---- 7. 全图分类结果 ----
var classified = features.classify(classifier);
Map.addLayer(classified, {
  min: 0, max: 1, palette: ['e0e0e0','006400']
}, 'RF分类：森林(深绿)/非森林(浅灰)');
