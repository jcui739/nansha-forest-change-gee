// ============================================================
// v3: Dynamic World 独立验证 + 导出到 Google Drive
// 追加到 v2 代码末尾运行
// ============================================================

// ---- Dynamic World 年度森林图 ----
function dwForest(year, aoi) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 12, 31);
  var dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterBounds(aoi).filterDate(start, end)
    .select('label');
  var mode = dw.reduce(ee.Reducer.mode()).rename('forest_raw');
  return mode.eq(1).rename('forest').clip(aoi);
}

var dw15 = dwForest(2015, aoi);
var dw25 = dwForest(2025, aoi);

Map.addLayer(dw15.selfMask(), {palette: ['004400']}, 'DW 2015 森林');
Map.addLayer(dw25.selfMask(), {palette: ['006600']}, 'DW 2025 森林');

function dwArea(img) {
  return img.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi, scale: 10, maxPixels: 1e10
  }).get('forest');
}

print('========== DW 独立验证结果 ==========');
print('DW 2015 森林面积（公顷）:', ee.Number(dwArea(dw15)).divide(10000));
print('DW 2025 森林面积（公顷）:', ee.Number(dwArea(dw25)).divide(10000));

// Landsat 侧的同期净变化：从 v2 的 forestMap 直接算，不要写死数字
function lsAreaHa(img) {
  return ee.Number(
    img.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: aoi, scale: 30, maxPixels: 1e10
    }).get('classification')
  ).divide(10000);
}
var ls15 = lsAreaHa(forestMap[2015]);
var ls25 = lsAreaHa(forestMap[2025]);
print('Landsat 2015→2025 净变化（公顷）:', ls25.subtract(ls15));

var dwChange = ee.Number(dwArea(dw25)).subtract(ee.Number(dwArea(dw15))).divide(10000);
print('DW 2015→2025 净变化（公顷）:', dwChange);
print('两者方向是否一致 / 差几倍 —— 在 README 里如实写，不要粉饰');

// ---- 导出到 Google Drive（跑完去 Tasks 标签页执行）----
Export.image.toDrive({
  image: f05.toByte().rename('forest_2005'),
  description: 'forest_2005',
  folder: 'nansha_gis',
  region: aoi, scale: 30, crs: 'EPSG:4326', maxPixels: 1e10
});

Export.image.toDrive({
  image: f25.toByte().rename('forest_2025'),
  description: 'forest_2025',
  folder: 'nansha_gis',
  region: aoi, scale: 30, crs: 'EPSG:4326', maxPixels: 1e10
});

Export.image.toDrive({
  image: change.toByte().rename('change_map'),
  description: 'change_2005_2025',
  folder: 'nansha_gis',
  region: aoi, scale: 30, crs: 'EPSG:4326', maxPixels: 1e10
});
