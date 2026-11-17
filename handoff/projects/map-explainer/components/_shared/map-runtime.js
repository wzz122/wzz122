/*
 * map-runtime.js — 地图组件共用运行时
 *
 * 职责：
 *   - 读取 CONFIG（顶部对象 ← body[data-config] ← ?config= 深合并）
 *   - 创建适合逐帧渲染的 MapLibre 地图（无交互、无淡入、保留绘图缓冲）
 *   - 相机路径：按时间 t 纯函数计算相机，再用 map.jumpTo 应用。不使用 flyTo/easeTo
 *   - waitMapIdle：截帧前等瓦片和渲染都完成
 *   - installSeek：暴露 window.__ready / __seek(t) / __duration / __timeline
 *   - 国土地理院陰影起伏図和 DEM（gsidem:// 协议把 GSI 编码转成 terrarium）
 *
 * 依赖：maplibre-gl@5、gsap@3（全局变量）。
 * TOKENS 与 tokens.css、CLAUDE.md §3 保持同步。
 */
(function (global) {
  'use strict';

  const TOKENS = {
    paper: '#F4EFE6', ink: '#1E2A32', inkSoft: '#5B6670',
    accent: '#D8452F', accent2: '#F2A33A', highlight: '#FFE36E',
    land: '#EEE8DA', water: '#AFCBD8', green: '#A9BF94', relief: '#C9B79C',
    lines: {
      shinkansen: '#1F63B5', jr: '#2E8B57', private: '#7B4FB0', subway: '#E07B24',
      tram: '#C2407A', abandoned: '#8E8E8E', planned: '#B0B0B0', hero: '#D8452F',
    },
    dash: { abandoned: [2, 1.5], planned: [0.5, 1.5] },
    fontCJK: '"Noto Sans SC", "Noto Sans JP", "PingFang SC", "Hiragino Sans", sans-serif',
  };

  const STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright',
  };

  const GSI = {
    hillshade: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
    demPng: 'gsidem://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png',
  };

  const ATTRIBUTION = {
    ofm: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    gsi: '出典：国土地理院',
  };

  const params = new URLSearchParams(location.search);
  const IS_RENDER = params.has('render');

  // ---------- 配置 ----------

  function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function deepMerge(base, over) {
    if (!isPlainObject(over)) return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const [k, v] of Object.entries(over)) {
      out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v; // 数组整体替换
    }
    return out;
  }

  function loadConfig(defaults) {
    let cfg = defaults;
    const fromBody = document.body && document.body.dataset.config;
    if (fromBody) cfg = deepMerge(cfg, JSON.parse(fromBody));
    const fromQuery = params.get('config');
    if (fromQuery) cfg = deepMerge(cfg, JSON.parse(fromQuery));
    return cfg;
  }

  // ---------- 地图 ----------

  function createMap(container, { style = 'positron', camera = {} } = {}) {
    const map = new maplibregl.Map({
      container,
      style: STYLES[style] || style,
      center: camera.center || [139.767, 35.681],
      zoom: camera.zoom ?? 10,
      bearing: camera.bearing ?? 0,
      pitch: camera.pitch ?? 0,
      interactive: false,
      fadeDuration: 0,                 // 标注不淡入，保证逐帧一致
      attributionControl: false,       // 用 .attribution 文字代替，片尾另有完整署名
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true }, // v5
      preserveDrawingBuffer: true,     // v4 兼容写法
      localIdeographFontFamily: TOKENS.fontCJK,
      maxPitch: 85,
    });
    map.on('error', (e) => console.warn('[map]', e && e.error ? e.error.message : e));
    return map;
  }

  function mapReady(map) {
    return new Promise((resolve) => (map.loaded() ? resolve() : map.once('load', resolve)));
  }

  /** 截帧前等待：瓦片加载完、相机静止、已经画到 canvas。超时只告警不卡死。 */
  function waitMapIdle(map, timeoutMs = 20000) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        map.off('idle', onIdle);
        // 再等两帧，确保最后一次绘制已提交
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const onIdle = () => finish();
      map.on('idle', onIdle);
      map.triggerRepaint();
      (function poll() {
        if (done) return;
        if (map.loaded() && map.areTilesLoaded() && !map.isMoving()) return finish();
        if (performance.now() - t0 > timeoutMs) {
          console.warn('[waitMapIdle] 超时，帧可能缺瓦片');
          return finish();
        }
        requestAnimationFrame(poll);
      })();
    });
  }

  function firstSymbolLayerId(map) {
    const l = map.getStyle().layers.find((x) => x.type === 'symbol');
    return l ? l.id : undefined;
  }

  /** 把地名标注换成指定语言字段，例如 ['name:zh-Hans','name:zh','name']。 */
  function setLabelLanguage(map, fields) {
    if (!fields || !fields.length) return;
    const expr = ['coalesce', ...fields.map((f) => ['get', f])];
    for (const layer of map.getStyle().layers) {
      if (layer.type !== 'symbol') continue;
      const tf = map.getLayoutProperty(layer.id, 'text-field');
      if (!tf) continue;
      const s = JSON.stringify(tf);
      if (!s.includes('name') || s.includes('housenumber') || s.includes('"ref"')) continue;
      map.setLayoutProperty(layer.id, 'text-field', expr);
    }
  }

  /** 按图层 id 正则隐藏图层，用来去掉干扰元素（如 poi、门牌）。 */
  function hideLayers(map, patterns) {
    const res = (patterns || []).map((p) => new RegExp(p));
    for (const layer of map.getStyle().layers) {
      if (res.some((re) => re.test(layer.id))) map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }

  /** 隐藏全部文字/图标图层（背景地图用）。 */
  function hideSymbols(map) {
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }

  /** 粗略套用项目地图配色（背景=陆地、*water* 填充=水体）。不同样式的图层 id 不同，按需补充。 */
  function tintBasemap(map) {
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', TOKENS.land);
      else if (layer.type === 'fill' && /water|ocean|lake|river/.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', TOKENS.water);
      else if (layer.type === 'fill' && /park|wood|grass|forest/.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', TOKENS.green);
    }
  }

  // ---------- 国土地理院 ----------

  let gsiDemRegistered = false;

  /** gsidem:// → 取 GSI dem_png，逐像素转为 terrarium 编码交给 MapLibre。 */
  function registerGsiDem() {
    if (gsiDemRegistered) return;
    gsiDemRegistered = true;
    maplibregl.addProtocol('gsidem', async (req, abortController) => {
      const url = req.url.replace(/^gsidem:\/\//, 'https://');
      const size = 256;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let img;
      const res = await fetch(url, { signal: abortController.signal });
      if (res.ok) {
        ctx.drawImage(await createImageBitmap(await res.blob()), 0, 0);
        img = ctx.getImageData(0, 0, size, size);
      } else {
        img = ctx.createImageData(size, size); // 海面等无瓦片区域 → 0 m
      }
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // GSI: x = R·2^16 + G·2^8 + B；x<2^23 → x·0.01 m；x=2^23 → 无数据；x>2^23 → (x−2^24)·0.01 m
        const x = d[i] * 65536 + d[i + 1] * 256 + d[i + 2];
        const h = x < 8388608 ? x * 0.01 : x > 8388608 ? (x - 16777216) * 0.01 : 0;
        const v = h + 32768; // terrarium: h = R·256 + G + B/256 − 32768
        d[i] = Math.floor(v / 256);
        d[i + 1] = Math.floor(v) % 256;
        d[i + 2] = Math.floor((v - Math.floor(v)) * 256);
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return { data: await blob.arrayBuffer() };
    });
  }

  function addGsiHillshade(map, { opacity = 0.5 } = {}) {
    map.addSource('gsi-hillshade', {
      type: 'raster', tiles: [GSI.hillshade], tileSize: 256, minzoom: 2, maxzoom: 16,
      attribution: ATTRIBUTION.gsi,
    });
    map.addLayer({
      id: 'gsi-hillshade', type: 'raster', source: 'gsi-hillshade',
      paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
    }, firstSymbolLayerId(map));
  }

  function addGsiTerrain(map, { exaggeration = 1.5 } = {}) {
    registerGsiDem();
    map.addSource('gsi-dem', {
      type: 'raster-dem', tiles: [GSI.demPng], tileSize: 256, maxzoom: 14,
      encoding: 'terrarium', attribution: ATTRIBUTION.gsi,
    });
    map.setTerrain({ source: 'gsi-dem', exaggeration });
  }

  // ---------- 时间函数 ----------

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, k) => a + (b - a) * k;

  /** start 到 start+duration 之间的缓动进度 0..1（纯函数）。 */
  function progress(t, start, duration, ease = 'none') {
    if (duration <= 0) return t >= start ? 1 : 0;
    return gsap.parseEase(ease)(clamp01((t - start) / duration));
  }

  function camFrom(kf) {
    return { center: kf.center, zoom: kf.zoom ?? 10, bearing: kf.bearing ?? 0, pitch: kf.pitch ?? 0 };
  }

  /**
   * 相机关键帧 → 第 t 秒的相机（纯函数，可任意 seek）。
   * keyframes: [{ t, center:[lng,lat], zoom, bearing, pitch, ease?, dur?, arc? }]
   *   t   该关键帧到达的时间
   *   dur 移动时长（默认等于与前一帧的间隔；小于间隔时前面是停留）
   *   arc 中途额外拉远的缩放级数，模拟 flyTo 的弧线
   */
  function cameraAt(keyframes, t) {
    let cam = camFrom(keyframes[0]);
    for (let i = 1; i < keyframes.length; i++) {
      const kf = keyframes[i];
      const dur = kf.dur ?? (kf.t - keyframes[i - 1].t);
      const start = kf.t - dur;
      if (t <= start) break;
      const b = camFrom(kf);
      if (t >= kf.t) { cam = b; continue; }
      const k = progress(t, start, dur, kf.ease || 'power2.inOut');
      const a = cam;
      cam = {
        center: [lerp(a.center[0], b.center[0], k), lerp(a.center[1], b.center[1], k)],
        zoom: lerp(a.zoom, b.zoom, k) - (kf.arc || 0) * Math.sin(Math.PI * k),
        bearing: lerp(a.bearing, b.bearing, k),
        pitch: lerp(a.pitch, b.pitch, k),
      };
      break;
    }
    return cam;
  }

  // ---------- 线路几何 ----------

  function haversine(a, b) {
    const R = 6371008.8, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function measureLine(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
    return { coords, cum, total: cum[cum.length - 1] };
  }

  /** 取线路前 f（0..1）部分，末端插值。 */
  function sliceLine(m, f) {
    if (f <= 0) return [m.coords[0], m.coords[0]];
    if (f >= 1) return m.coords.slice();
    const target = f * m.total;
    let i = 1;
    while (i < m.cum.length - 1 && m.cum[i] < target) i++;
    const seg = m.cum[i] - m.cum[i - 1];
    const k = seg ? (target - m.cum[i - 1]) / seg : 0;
    const a = m.coords[i - 1], b = m.coords[i];
    return [...m.coords.slice(0, i), [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]];
  }

  /** 离 lngLat 最近的顶点在线路上的位置 0..1（用于车站出现时机）。 */
  function fractionAtNearest(m, lngLat) {
    let best = 0, bestD = Infinity;
    m.coords.forEach((c, i) => {
      const d = haversine(c, lngLat);
      if (d < bestD) { bestD = d; best = i; }
    });
    return m.total ? m.cum[best] / m.total : 0;
  }

  // ---------- DOM 辅助 ----------

  function makePin(map, { lngLat, text }) {
    const el = document.createElement('div');
    el.className = 'pin';
    el.innerHTML = `<div class="pin__inner"><div class="pin__dot"></div>${text ? `<div class="pin__label"></div>` : ''}</div>`;
    if (text) el.querySelector('.pin__label').textContent = text;
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
    return el.querySelector('.pin__inner'); // 动画作用于内层，外层 transform 由 Marker 管理
  }

  function addAttribution(parent, texts) {
    const el = document.createElement('div');
    el.className = 'attribution';
    el.textContent = texts.filter(Boolean).join(' · ');
    parent.appendChild(el);
    return el;
  }

  /** 把文本拆成逐字 span，供 stagger 入场。 */
  function splitChars(el) {
    const text = el.textContent;
    el.textContent = '';
    return Array.from(text).map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.display = 'inline-block';
      if (ch === ' ') s.style.width = '0.3em';
      el.appendChild(s);
      return s;
    });
  }

  // ---------- 逐帧接口 ----------

  /**
   * timeline: paused 的 gsap 时间线（只管 DOM 动画）
   * maps:     需要等 idle 的地图数组
   * apply(t): 根据时间设置地图状态（jumpTo、setData、setPaintProperty …）
   * ready:    组件自己的准备 Promise（地图 load、图层添加完）
   */
  function installSeek({ timeline, maps, apply, ready, duration }) {
    if (duration) timeline.set({}, {}, duration); // 保证时间线长度
    timeline.eventCallback('onUpdate', () => apply(timeline.time()));

    const readyP = (async () => {
      await ready;
      if (document.fonts) await document.fonts.ready;
      timeline.seek(0);
      apply(0);
      await Promise.all(maps.map((m) => waitMapIdle(m)));
    })();

    global.__timeline = timeline;
    global.__duration = timeline.duration();
    global.__ready = readyP;
    global.__seek = async (t) => {
      await readyP;
      timeline.seek(t); // suppressEvents 默认 true，地图状态由下面的 apply 显式设置
      apply(t);
      await Promise.all(maps.map((m) => waitMapIdle(m)));
      return t;
    };

    if (!IS_RENDER) {
      readyP.then(() => {
        timeline.eventCallback('onComplete', () => timeline.play(0));
        timeline.play(0);
      });
    }
    return readyP;
  }

  global.MapRuntime = {
    TOKENS, STYLES, GSI, ATTRIBUTION, IS_RENDER,
    loadConfig, deepMerge,
    createMap, mapReady, waitMapIdle, firstSymbolLayerId, setLabelLanguage, hideLayers, hideSymbols, tintBasemap,
    registerGsiDem, addGsiHillshade, addGsiTerrain,
    progress, cameraAt, lerp, clamp01,
    haversine, measureLine, sliceLine, fractionAtNearest,
    makePin, addAttribution, splitChars,
    installSeek,
  };
})(window);
