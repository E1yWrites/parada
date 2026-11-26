"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient ground: a slow wave of fbm fog (port of the 21st.dev "Waves" recipe:
 * y = uv.y + sin(x) * 0.08 + (fbm - 0.5) * k * 0.6, mapped through a palette).
 * The palette is a low-contrast blue ramp with a brand-orange glow along the wave edge (`--fog-*` tokens), so
 * it stays a ground behind the panels. Decorative: hidden from
 * assistive tech, paused while the tab is hidden, one still frame under
 * prefers-reduced-motion, and the flat paper ground shows if WebGL is missing.
 */

const VERTEX = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAGMENT = `precision mediump float;
uniform vec2 u_res;uniform float u_time;
uniform vec3 u_lo;uniform vec3 u_hi;uniform vec3 u_accent;uniform float u_accentAmt;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=uv*vec2(u_res.x/u_res.y,1.);
  float t=u_time,k=.55;
  float y=uv.y+sin(uv.x*(3.+k*9.)+t*.8)*.08+(fbm(p*2.+t*.1)-.5)*k*.6;
  float s=smoothstep(0.,1.,clamp(y,0.,1.));
  float band=1.-smoothstep(0.,.3,abs(y-.5));
  vec3 c=mix(mix(u_lo,u_hi,s),u_accent,u_accentAmt*band);
  c+=(hash(gl_FragCoord.xy+t)-.5)/255.;
  gl_FragColor=vec4(c,1.);
}`;

/** Seconds of shader time per real second: the recipe's pace, slowed for a desk-long console. */
const SPEED = 0.35;
const FRAME_MS = 1000 / 30;
/** Render below device resolution; the fog is soft, so this costs nothing visible. */
const RESOLUTION = 0.5;

function rgb(name: string): [number, number, number] {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0] / 255, parts[1] / 255, parts[2] / 255] : [0, 0, 0];
}

/** Theme palette from the `--fog-*` tokens in globals.css (tuned separately for light and dark). */
function palette() {
  const amt = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fog-crest-amt"));
  return {
    lo: rgb("--fog-lo"),
    hi: rgb("--fog-hi"),
    accent: rgb("--fog-crest"),
    accentAmt: Number.isFinite(amt) ? amt : 0,
  };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function ShaderBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("u_res"), uTime = u("u_time"), uLo = u("u_lo"), uHi = u("u_hi"), uAccent = u("u_accent"), uAmt = u("u_accentAmt");

    const applyPalette = () => {
      const p = palette();
      gl.uniform3fv(uLo, p.lo);
      gl.uniform3fv(uHi, p.hi);
      gl.uniform3fv(uAccent, p.accent);
      gl.uniform1f(uAmt, p.accentAmt);
    };
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    let shaderTime = 0;
    const draw = () => {
      gl.uniform1f(uTime, shaderTime);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      if (last) shaderTime += ((now - last) / 1000) * SPEED;
      last = now;
      draw();
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (reduced.matches || document.hidden) draw();
      else raf = requestAnimationFrame(tick);
    };

    applyPalette();
    resize();
    sync();
    // First frame is drawn: fade in from the flat ground instead of popping at hydration.
    canvas.style.opacity = "1";

    // GPU reset / driver update / sleep: an opaque lost context would paint black,
    // so hide the canvas and stop; the flat paper ground carries on underneath.
    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
      canvas.style.opacity = "0";
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const onResize = () => {
      resize();
      draw();
    };
    const themeObserver = new MutationObserver(() => {
      applyPalette();
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      themeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-0 transition-opacity duration-700 ease-out"
    />
  );
}
