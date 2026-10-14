// ============================================================
// v2: 回溯预测 + 2005→2025 变化检测
// 追加到 v1 代码末尾运行（依赖 classifier, yearComp, aoi）
// ============================================================

// 【回溯假设】2021年L8上学到的森林光谱，假设在2005年L5/L7上同样成立
// 可能失效：传感器差异、物候变化、大气校正残留
function classifyYear(year) {
  var comp = yearComp(year, aoi);
  var ndviY = comp.normalizedDifference(['nir','red']).rename('NDVI');
  var featY = comp.addBands(ndviY);
  return featY.classify(classifier);
}

// ---- 逐年分类 + 统计森林面积 ----
var years = [2005, 2010, 2015, 2021, 2025];
var forestMap = {};
var areaTable = [];

years.forEach(function(y) {
  var fc = classifyYear(y);
  forestMap[y] = fc;
  var area = fc.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi, scale: 30, maxPixels: 1e10
  });
  var areaHa = ee.Number(area.get('classification')).divide(10000);
  areaTable.push(ee.Dictionary({year: y, area_ha: areaHa}));
  print(y + ' 年森林面积（公顷）:', areaHa);
  Map.addLayer(fc, {min:0, max:1, palette:['e8e8e8','006400']}, y+'森林');
});

print('========== 逐年森林面积表 ==========');
print(ee.FeatureCollection(areaTable.map(function(d) {
  return ee.Feature(null, d);
})));

// ---- 变化图：2005 vs 2025 ----
// 0=保持非森林, 1=失去森林, 2=新增森林, 3=保持森林
var f05 = forestMap[2005];
var f25 = forestMap[2025];
var change = f05.add(f25.multiply(2));

Map.addLayer(change, {
  min: 0, max: 3,
  palette: ['e8e8e8','ff4444','44aa44','004400']
}, '变化图（灰=不变非林 红=失林 浅绿=增林 深绿=保持林）');

// 变化面积
var changeArea = change.eq(1).multiply(ee.Image.pixelArea())
  .addBands(change.eq(2).multiply(ee.Image.pixelArea()))
  .addBands(change.eq(3).multiply(ee.Image.pixelArea()))
  .rename(['lost','gained','stable']);

var ca = changeArea.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoi, scale: 30, maxPixels: 1e10
});
print('2005→2025 失去森林（公顷）:', ee.Number(ca.get('lost')).divide(10000));
print('2005→2025 新增森林（公顷）:', ee.Number(ca.get('gained')).divide(10000));
print('2005→2025 保持森林（公顷）:', ee.Number(ca.get('stable')).divide(10000));
