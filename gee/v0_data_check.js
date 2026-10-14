// ============================================================
// v0: 数据可达性验证
// 粘贴到 GEE Code Editor (code.earthengine.google.com)，点 Run
// ============================================================

// ---- 1. 研究区：南沙区近似矩形框 ----
var aoi = ee.Geometry.Rectangle([113.43, 22.62, 113.77, 22.95]);
Map.centerObject(aoi, 11);
Map.addLayer(aoi, {color: 'red'}, 'AOI 南沙边界');

// ---- 2. ESA WorldCover 2021 ----
var wc = ee.Image('ESA/WorldCover/v200/2021').select('Map').clip(aoi);

Map.addLayer(wc, {
  min: 10, max: 100,
  palette: ['006400','ffbb22','ffff4c','f0964c','ff0000','b4b4b4','ffffff','0064c8','0096a0','00cf75','fae6a0']
}, 'WorldCover 2021');

var wcHist = wc.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: aoi, scale: 10, maxPixels: 1e10
});
var wcArea = ee.Dictionary(wcHist.get('Map')).map(function(k, v) {
  return ee.Number(v).multiply(0.01);
});
print('WorldCover 各类面积（公顷）', wcArea);

// ---- 3. yearComp: 年度Landsat融合合成 ----
function yearComp(year, aoi) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end   = ee.Date.fromYMD(year, 12, 31);

  function procL57(img) {
    var mask = img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
    return img.select(['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'])
      .multiply(0.0000275).add(-0.2)
      .rename(['blue','green','red','nir','swir1','swir2'])
      .updateMask(mask);
  }
  function procL8(img) {
    var mask = img.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
    return img.select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'])
      .multiply(0.0000275).add(-0.2)
      .rename(['blue','green','red','nir','swir1','swir2'])
      .updateMask(mask);
  }

  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').filterBounds(aoi).filterDate(start, end).map(procL57);
  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').filterBounds(aoi).filterDate(start, end).map(procL57);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(aoi).filterDate(start, end).map(procL8);

  var merged = l5.merge(l7).merge(l8);
  print(year + ' 年可用影像数:', merged.size());
  return merged.median().clip(aoi);
}

// ---- 4. 2021年合成 ----
var comp2021 = yearComp(2021, aoi);

Map.addLayer(comp2021, {bands: ['red','green','blue'], min: 0, max: 0.3}, '2021 真彩色');

var ndvi = comp2021.normalizedDifference(['nir','red']).rename('NDVI');
Map.addLayer(ndvi, {min: -0.2, max: 0.8, palette: ['blue','white','green']}, '2021 NDVI');

var ndviStat = ndvi.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true),
  geometry: aoi, scale: 30, maxPixels: 1e10
});
print('2021 NDVI min/max/mean', ndviStat);
