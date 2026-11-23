const pool = document.querySelector(".pool");
const stage = document.querySelector(".title-stage");
const title = stage.querySelector("h1");
const canvas = stage.querySelector("canvas");
const motion = matchMedia("(prefers-reduced-motion: reduce)");

function startRipple() {
  const gl = canvas.getContext("webgl");
  const textureCanvas = document.createElement("canvas");
  const ink = textureCanvas.getContext("2d");
  if (!gl || !ink || !("letterSpacing" in ink)) return;

  const sources = [
    [gl.VERTEX_SHADER, `
      attribute vec2 position;
      varying vec2 uv;
      void main() {
        uv = position * vec2(0.5, -0.5) + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `],
    [gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D lettering;
      uniform vec2 origin;
      uniform vec2 size;
      uniform float age;
      void main() {
        vec2 delta = (uv - origin) * size;
        float distanceToOrigin = length(delta);
        float front = distanceToOrigin - age * 530.0;
        float envelope = exp(-abs(front) / 63.0) * exp(-age * 2.0);
        vec2 direction = delta / max(distanceToOrigin, 1.0);
        vec2 offset = direction * sin(front * 0.14) * envelope * 8.0 / size;
        vec2 sampleAt = uv - offset;
        gl_FragColor = texture2D(lettering, sampleAt);
      }
    `],
  ];

  const program = gl.createProgram();
  for (const [type, source] of sources) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return;
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  const size = gl.getUniformLocation(program, "size");
  const origin = gl.getUniformLocation(program, "origin");
  const age = gl.getUniformLocation(program, "age");
  let frame = 0;
  let started = -Infinity;
  let lastPoint;
  let ready = false;

  function draw(now) {
    frame = 0;
    if (!ready || motion.matches) return;
    const elapsed = (now - started) / 1000;
    gl.uniform1f(age, Math.min(elapsed, 8));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (elapsed < 1.7) frame = requestAnimationFrame(draw);
  }

  function rasterize() {
    ready = false;
    stage.classList.remove("has-ripple");
    if (motion.matches || gl.isContextLost()) return;
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 2, gl.getParameter(gl.MAX_TEXTURE_SIZE) / Math.max(bounds.width, bounds.height));
    if (!bounds.width || !bounds.height) return;

    canvas.width = textureCanvas.width = Math.round(bounds.width * scale);
    canvas.height = textureCanvas.height = Math.round(bounds.height * scale);
    ink.scale(canvas.width / bounds.width, canvas.height / bounds.height);
    const style = getComputedStyle(title);
    ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ink.letterSpacing = style.letterSpacing;
    const metrics = ink.measureText("Mg");
    const range = document.createRange();
    for (const line of title.querySelectorAll("span")) {
      range.selectNodeContents(line);
      const rectangles = range.getClientRects();
      if (rectangles.length !== 1) return;
      const rect = rectangles[0];
      const baseline = (rect.height + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
      ink.fillStyle = getComputedStyle(line).color;
      ink.fillText(line.textContent, rect.left - bounds.left, rect.top - bounds.top + baseline);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    if (gl.getError() !== gl.NO_ERROR) return;
    gl.uniform2f(size, bounds.width, bounds.height);
    ready = true;
    cancelAnimationFrame(frame);
    draw(performance.now());
    stage.classList.add("has-ripple");
  }

  function rippleAt(event) {
    if (!ready || motion.matches) return;
    const now = performance.now();
    if (lastPoint && (now - started < 95 ||
        Math.hypot(event.clientX - lastPoint.x, event.clientY - lastPoint.y) < 18)) return;
    const bounds = canvas.getBoundingClientRect();
    lastPoint = { x: event.clientX, y: event.clientY };
    started = now;
    gl.uniform2f(origin, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
    if (!frame) frame = requestAnimationFrame(draw);
  }

  canvas.addEventListener("webglcontextlost", () => {
    ready = false;
    cancelAnimationFrame(frame);
    frame = 0;
    stage.classList.remove("has-ripple");
  });
  pool.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") rippleAt(event);
  });
  pool.addEventListener("pointerdown", rippleAt);
  pool.addEventListener("pointerleave", () => { lastPoint = undefined; });
  motion.addEventListener("change", rasterize);
  new ResizeObserver(rasterize).observe(title);
  document.fonts.ready.then(rasterize);
}

if (!motion.matches) startRipple();
else motion.addEventListener("change", startRipple, { once: true });
