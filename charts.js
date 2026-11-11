/* Biểu đồ SVG thuần: radar 4 tiêu chí và đường tiến bộ theo thời gian. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CRITERIA_COLORS = { pronunciation: '#e8559a', fluency: '#3fa7e6', grammar: '#8b5cd6', vocabulary: '#f0a030', average: '#3a2748' };

function svgEl(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text != null) node.textContent = text;
  return node;
}

/* items: [{ label, value }], max: điểm tối đa. */
function radarChart(items, max = 10) {
  const width = 340, height = 300, cx = width / 2, cy = 152, radius = 88;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart radar', role: 'img',
    'aria-label': `Biểu đồ radar: ${items.map(item => `${item.label} ${item.value.toFixed(1)}`).join(', ')}` });
  const point = (index, fraction) => {
    const angle = (-90 + (360 / items.length) * index) * Math.PI / 180;
    return [cx + Math.cos(angle) * radius * fraction, cy + Math.sin(angle) * radius * fraction];
  };
  [0.25, 0.5, 0.75, 1].forEach(level => {
    svg.append(svgEl('polygon', { points: items.map((_, i) => point(i, level).join(',')).join(' '), class: 'radar-ring' }));
  });
  items.forEach((item, index) => {
    const [x, y] = point(index, 1);
    svg.append(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'radar-axis' }));
  });
  svg.append(svgEl('polygon', {
    points: items.map((item, i) => point(i, Math.max(0, Math.min(1, item.value / max))).join(',')).join(' '), class: 'radar-area'
  }));
  items.forEach((item, index) => {
    const [px, py] = point(index, Math.max(0, Math.min(1, item.value / max)));
    svg.append(svgEl('circle', { cx: px, cy: py, r: 4.5, class: 'radar-dot' }));
    const [lx, ly] = point(index, 1.2);
    const cos = Math.cos((-90 + (360 / items.length) * index) * Math.PI / 180);
    const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
    const label = svgEl('text', { x: lx, y: ly - 2, 'text-anchor': anchor, class: 'radar-label' });
    label.append(svgEl('tspan', { x: lx, dy: '0' }, item.label));
    label.append(svgEl('tspan', { x: lx, dy: '1.25em', class: 'radar-value' }, item.value.toFixed(1)));
    svg.append(label);
  });
  return svg;
}

/* labels: nhãn trục X; series: [{ key, label, color, width, values: [số|null] }]. */
function lineChart(labels, series, max = 10) {
  const width = 680, height = 260, left = 38, right = 18, top = 16, bottom = 36;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = index => left + (labels.length === 1 ? plotW / 2 : (plotW / (labels.length - 1)) * index);
  const y = value => top + plotH - (Math.max(0, Math.min(max, value)) / max) * plotH;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart line-chart', role: 'img',
    'aria-label': `Biểu đồ tiến bộ qua ${labels.length} lần chấm` });
  for (let value = 0; value <= max; value += 2) {
    svg.append(svgEl('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: 'grid-line' }));
    svg.append(svgEl('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'axis-label' }, value));
  }
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((label, index) => {
    if (index % step === 0 || index === labels.length - 1) {
      svg.append(svgEl('text', { x: x(index), y: height - 12, 'text-anchor': 'middle', class: 'axis-label' }, label));
    }
  });
  series.forEach(item => {
    const pts = item.values.map((value, index) => value == null ? null : [x(index), y(value)]).filter(Boolean);
    if (pts.length > 1) {
      svg.append(svgEl('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: item.color,
        'stroke-width': item.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'series-line' }));
    }
    item.values.forEach((value, index) => {
      if (value == null) return;
      const dot = svgEl('circle', { cx: x(index), cy: y(value), r: item.width > 2 ? 5 : 3.2, fill: item.color, class: 'series-dot' });
      dot.append(svgEl('title', {}, `${item.label} · ${labels[index]}: ${value.toFixed(1)}/10`));
      svg.append(dot);
    });
  });
  return svg;
}
