// script.js - New version with delta-time integration

/************************************************
 * 1) Read initial values from the control panel inputs
 ************************************************/
const numBlobsInput   = document.getElementById("num-blobs");
const minSizeInput    = document.getElementById("min-size");
const maxSizeInput    = document.getElementById("max-size");
const speedInput      = document.getElementById("blob-speed");
const stickinessInput = document.getElementById("blob-stickiness");
const color1Input     = document.getElementById("color1");
const color2Input     = document.getElementById("color2");
const bgColorInput    = document.getElementById("bg-color");

let blobCount      = Number(numBlobsInput.value);
let minBlobSize    = Number(minSizeInput.value);
let maxBlobSize    = Number(maxSizeInput.value);
let blobSpeed      = Number(speedInput.value);
let blobStickiness = Number(stickinessInput.value);

/************************************************
 * 2) Utility: Convert Hex to Normalized RGB Array
 ************************************************/
function hexToRGB(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map(ch => ch + ch).join('');
  }
  const num = parseInt(h, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255
  ];
}

let color1 = hexToRGB(color1Input.value);
let color2 = hexToRGB(color2Input.value);
let bgColor  = hexToRGB(bgColorInput.value);

/************************************************
 * 3) WebGL Canvas Setup
 ************************************************/
const canvas = document.getElementById("gl-canvas");
const gl = canvas.getContext("webgl");
if (!gl) {
  console.error("WebGL not supported in this browser.");
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  rebuildProgram();
});

/************************************************
 * 4) Blob Class and Generation
 ************************************************/
class Blob {
  constructor(x, y, vx, vy, r, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    this.color = color;
  }
}

function createBlob() {
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  let vx, vy;
  do {
    vx = (Math.random() - 0.5) * blobSpeed;
    vy = (Math.random() - 0.5) * blobSpeed;
  } while (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05);
  const r = Math.random() * (maxBlobSize - minBlobSize) + minBlobSize;
  // Blend the two colors with a random weight
  const w = Math.random();
  const blended = [
    w * color1[0] + (1 - w) * color2[0],
    w * color1[1] + (1 - w) * color2[1],
    w * color1[2] + (1 - w) * color2[2]
  ];
  return new Blob(x, y, vx, vy, r, blended);
}

let blobs = [];
function initBlobs() {
  blobCount = Number(numBlobsInput.value);
  blobs = Array.from({ length: blobCount }, () => createBlob());
}
initBlobs();

/************************************************
 * 5) Blob Movement Update (with Delta Time)
 ************************************************/
function updateBlob(b, deltaTime) {
  // Multiply by 60 to scale to a 60fps baseline
  b.x += b.vx * deltaTime * 60;
  b.y += b.vy * deltaTime * 60;
  
  // Bounce off left/right edges:
  if (b.x < b.r) {
    b.x = b.r;
    b.vx = -b.vx * blobStickiness;
  }
  if (b.x > canvas.width - b.r) {
    b.x = canvas.width - b.r;
    b.vx = -b.vx * blobStickiness;
  }
  // Bounce off top/bottom edges:
  if (b.y < b.r) {
    b.y = b.r;
    b.vy = -b.vy * blobStickiness;
  }
  if (b.y > canvas.height - b.r) {
    b.y = canvas.height - b.r;
    b.vy = -b.vy * blobStickiness;
  }
}

/************************************************
 * 6) Shader Program Setup
 ************************************************/
let program = null;
let uBlobsLoc, uBlobColorsLoc, uBgColorLoc;

function vertexShaderSource() {
  return `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
}

function fragmentShaderSource() {
  return `
    precision highp float;
    const float WIDTH = ${canvas.width.toFixed(1)};
    const float HEIGHT = ${canvas.height.toFixed(1)};
    uniform vec3 u_blobs[${blobCount}];
    uniform vec3 u_blobColors[${blobCount}];
    uniform vec3 u_bgColor;
    const float threshold = 0.1;
    void main() {
      float x = gl_FragCoord.x;
      float y = gl_FragCoord.y;
      float totalInfl = 0.0;
      vec3 colorSum = vec3(0.0);
      for (int i = 0; i < ${blobCount}; i++) {
        vec3 blob = u_blobs[i];
        float dx = blob.x - x;
        float dy = blob.y - y;
        float infl = (blob.z * blob.z) / (dx * dx + dy * dy);
        totalInfl += infl;
        colorSum += infl * u_blobColors[i];
      }
      if (totalInfl > threshold) {
        gl_FragColor = vec4(colorSum / totalInfl, 1.0);
      } else {
        gl_FragColor = vec4(u_bgColor, 1.0);
      }
    }
  `;
}

function compileShader(src, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function createProgram(vSrc, fSrc) {
  const vs = compileShader(vSrc, gl.VERTEX_SHADER);
  const fs = compileShader(fSrc, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function rebuildProgram() {
  program = createProgram(vertexShaderSource(), fragmentShaderSource());
  gl.useProgram(program);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  const positions = new Float32Array([
    -1,  1,
    -1, -1,
     1,  1,
     1, -1
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  uBlobsLoc = gl.getUniformLocation(program, "u_blobs");
  uBlobColorsLoc = gl.getUniformLocation(program, "u_blobColors");
  uBgColorLoc = gl.getUniformLocation(program, "u_bgColor");
  gl.viewport(0, 0, canvas.width, canvas.height);
}
rebuildProgram();

/************************************************
 * 7) Animation Loop with Delta Time
 ************************************************/
let lastTime = performance.now();

function animate() {
  let currentTime = performance.now();
  let deltaTime = (currentTime - lastTime) / 1000; // delta in seconds
  lastTime = currentTime;
  
  // Update each blob using deltaTime
  blobs.forEach(blob => updateBlob(blob, deltaTime));
  
  // Prepare uniform arrays for blobs and colors
  let blobArray = [];
  let colorArray = [];
  for (let b of blobs) {
    blobArray.push(b.x, b.y, b.r);
    colorArray.push(b.color[0], b.color[1], b.color[2]);
  }
  
  gl.uniform3fv(uBlobsLoc, new Float32Array(blobArray));
  gl.uniform3fv(uBlobColorsLoc, new Float32Array(colorArray));
  gl.uniform3fv(uBgColorLoc, new Float32Array(bgColor));
  
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(animate);
}
animate();
