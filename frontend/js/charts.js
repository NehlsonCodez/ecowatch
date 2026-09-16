/**
 * Tiny dependency-free canvas chart helpers for EcoWatch.
 * Not a general-purpose library -- just enough for sparklines,
 * bar charts and a room-share chart, styled to match the dark theme.
 */
const Charts = (() => {
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  /** Smooth filled sparkline, e.g. for the hero live-power card. */
  function sparkline(canvas, values, { color = "#F2A93B", fill = "rgba(242,169,59,0.12)" } = {}) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!values || values.length < 2) return;

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const pad = 4;
    const stepX = (w - pad * 2) / (values.length - 1);

    const points = values.map((v, i) => [
      pad + i * stepX,
      h - pad - ((v - min) / range) * (h - pad * 2),
    ]);

    // Fill
    ctx.beginPath();
    ctx.moveTo(points[0][0], h);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // End dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** Vertical bar chart with labels, e.g. hourly / daily / room usage. */
  function barChart(canvas, labels, values, { color = "#F2A93B", unit = "Wh", maxBars = 24 } = {}) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!values || values.length === 0) return;

    const padLeft = 6, padRight = 6, padTop = 10, padBottom = 22;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;
    const max = Math.max(...values, 1);

    const n = values.length;
    const gap = 6;
    const barW = Math.max(2, (chartW - gap * (n - 1)) / n);

    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "#78908C";
    ctx.textAlign = "center";

    // gridline
    ctx.strokeStyle = "#1C2629";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + chartH);
    ctx.lineTo(padLeft + chartW, padTop + chartH);
    ctx.stroke();

    values.forEach((v, i) => {
      const x = padLeft + i * (barW + gap);
      const barH = Math.max(1, (v / max) * chartH);
      const y = padTop + chartH - barH;

      const grad = ctx.createLinearGradient(0, y, 0, padTop + chartH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(242,169,59,0.25)");
      ctx.fillStyle = grad;

      const r = Math.min(4, barW / 2);
      roundRect(ctx, x, y, barW, barH, r);
      ctx.fill();

      // Only show a subset of labels if there are many bars, to avoid clutter
      const showEvery = n > 12 ? Math.ceil(n / 8) : 1;
      if (i % showEvery === 0 || i === n - 1) {
        ctx.fillStyle = "#78908C";
        ctx.fillText(labels[i], x + barW / 2, h - 6);
      }
    });
  }

  /** Horizontal stacked share bar, e.g. per-room proportion of total usage. */
  function shareBar(canvas, segments) {
    // segments: [{label, value, color}]
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
    let x = 0;
    const r = h / 2;
    segments.forEach((seg) => {
      const segW = (seg.value / total) * w;
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, 0, segW, h);
      x += segW;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h <= 0) { ctx.beginPath(); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { sparkline, barChart, shareBar };
})();
