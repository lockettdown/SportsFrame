import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const state = {
  tool: "draw",
  color: "#ff7a59",
  width: 5,
  drawing: false,
  drawingTarget: "original",
  start: null,
  currentPath: [],
  annotations: [],
  compareAnnotations: [],
  frameAnnotations: [],
  stillImage: null,
  compareStillImage: null,
  frameStillImage: null,
  frameRate: 24,
  frameStripRun: 0,
  compareFrameStripRun: 0,
  currentMediaKind: null,
  editTool: "select",
  selectedSegmentId: null,
  timelineSegments: [],
  audioMuted: false,
  analyzing: false,
  libraryMedia: [],
  aiCoachFrames: [],
  savedFrames: JSON.parse(localStorage.getItem("diamondframe.frames") || "[]"),
  user: JSON.parse(localStorage.getItem("diamondframe.user") || "null"),
  subscription: localStorage.getItem("diamondframe.subscription") || "free",
  captured: false,
  comparing: false,
  videoView: "primary"
};

const $ = (selector) => document.querySelector(selector);
const videoA = $("#videoA");
const videoB = $("#videoB");
const captureCanvas = $("#captureCanvas");
const annotationCanvas = $("#annotationCanvas");
const compareCaptureCanvas = $("#compareCaptureCanvas");
const compareAnnotationCanvas = $("#compareAnnotationCanvas");
const frameCaptureCanvas = $("#frameCaptureCanvas");
const frameAnnotationCanvas = $("#frameAnnotationCanvas");
const captureCtx = captureCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");
const compareCaptureCtx = compareCaptureCanvas.getContext("2d");
const compareAnnotationCtx = compareAnnotationCanvas.getContext("2d");
const frameCaptureCtx = frameCaptureCanvas.getContext("2d");
const frameAnnotationCtx = frameAnnotationCanvas.getContext("2d");
const fileA = $("#fileA");
const frameStrip = $("#frameStrip");
const frameStripStatus = $("#frameStripStatus");
const compareFrameStrip = $("#compareFrameStrip");
const compareFrameStripStatus = $("#compareFrameStripStatus");

const sessionInput = $("#sessionInput");
if (sessionInput) sessionInput.valueAsDate = new Date();

const layoutStorageKeys = {
  libraryWidth: "diamondframe.layout.libraryWidth",
  timelineHeight: "diamondframe.layout.timelineHeight"
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getLayoutBounds(type) {
  if (type === "library") {
    return {
      min: 180,
      max: Math.max(260, Math.min(520, window.innerWidth * 0.36))
    };
  }

  const workbenchHeight = $(".workbench")?.getBoundingClientRect().height || window.innerHeight;
  return {
    min: 88,
    max: Math.max(138, Math.min(window.innerHeight * 0.45, workbenchHeight - 320))
  };
}

function setLayoutDimension(type, value, shouldPersist = false) {
  const app = $("#app");
  if (!app || !Number.isFinite(value)) return;

  const bounds = getLayoutBounds(type);
  const clamped = clampNumber(value, bounds.min, bounds.max);
  const property = type === "library" ? "--library-width" : "--timeline-height";
  const storageKey = type === "library" ? layoutStorageKeys.libraryWidth : layoutStorageKeys.timelineHeight;

  app.style.setProperty(property, `${Math.round(clamped)}px`);
  if (shouldPersist) localStorage.setItem(storageKey, String(Math.round(clamped)));
  requestAnimationFrame(resizeCanvases);
}

function applySavedLayoutDimensions() {
  const libraryWidth = Number(localStorage.getItem(layoutStorageKeys.libraryWidth));
  const timelineHeight = Number(localStorage.getItem(layoutStorageKeys.timelineHeight));

  if (Number.isFinite(libraryWidth) && libraryWidth > 0) setLayoutDimension("library", libraryWidth);
  if (Number.isFinite(timelineHeight) && timelineHeight > 0) setLayoutDimension("timeline", timelineHeight);
}

function setupSectionResize() {
  const libraryResizer = $("#libraryResizer");
  const timelineResizer = $("#timelineResizer");
  const libraryPanel = $(".media-browser");
  const timelinePanel = $(".timeline");
  let activeResize = null;

  applySavedLayoutDimensions();

  function beginResize(event, type) {
    const panel = type === "library" ? libraryPanel : timelinePanel;
    if (!panel || event.currentTarget.offsetParent === null) return;

    activeResize = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startSize: type === "library"
        ? panel.getBoundingClientRect().width
        : panel.getBoundingClientRect().height,
      handle: event.currentTarget
    };

    activeResize.handle.classList.add("active-resizer");
    document.body.classList.add("is-resizing");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function updateResize(event) {
    if (!activeResize) return;

    const delta = activeResize.type === "library"
      ? event.clientX - activeResize.startX
      : activeResize.startY - event.clientY;
    setLayoutDimension(activeResize.type, activeResize.startSize + delta);
  }

  function finishResize() {
    if (!activeResize) return;

    const panel = activeResize.type === "library" ? libraryPanel : timelinePanel;
    const size = activeResize.type === "library"
      ? panel.getBoundingClientRect().width
      : panel.getBoundingClientRect().height;
    setLayoutDimension(activeResize.type, size, true);
    activeResize.handle.classList.remove("active-resizer");
    document.body.classList.remove("is-resizing");
    activeResize = null;
  }

  function nudgeResize(event, type) {
    const panel = type === "library" ? libraryPanel : timelinePanel;
    if (!panel) return;

    let delta = 0;
    if (type === "library") {
      if (event.key === "ArrowLeft") delta = -16;
      if (event.key === "ArrowRight") delta = 16;
    } else {
      if (event.key === "ArrowUp") delta = 16;
      if (event.key === "ArrowDown") delta = -16;
    }
    if (!delta) return;

    const currentSize = type === "library"
      ? panel.getBoundingClientRect().width
      : panel.getBoundingClientRect().height;
    setLayoutDimension(type, currentSize + delta, true);
    event.preventDefault();
  }

  libraryResizer?.addEventListener("pointerdown", (event) => beginResize(event, "library"));
  timelineResizer?.addEventListener("pointerdown", (event) => beginResize(event, "timeline"));
  libraryResizer?.addEventListener("keydown", (event) => nudgeResize(event, "library"));
  timelineResizer?.addEventListener("keydown", (event) => nudgeResize(event, "timeline"));
  window.addEventListener("pointermove", updateResize);
  window.addEventListener("pointerup", finishResize);
  window.addEventListener("pointercancel", finishResize);
}

function resizeCanvases() {
  const pane = $(".primary-pane").getBoundingClientRect();
  const comparePane = $("#comparePane").getBoundingClientRect();
  const framePane = $("#framePane").getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  for (const canvas of [captureCanvas, annotationCanvas]) {
    canvas.width = Math.max(1, Math.floor(pane.width * ratio));
    canvas.height = Math.max(1, Math.floor(pane.height * ratio));
    canvas.style.width = `${pane.width}px`;
    canvas.style.height = `${pane.height}px`;
  }
  for (const canvas of [compareCaptureCanvas, compareAnnotationCanvas]) {
    canvas.width = Math.max(1, Math.floor(comparePane.width * ratio));
    canvas.height = Math.max(1, Math.floor(comparePane.height * ratio));
    canvas.style.width = `${comparePane.width}px`;
    canvas.style.height = `${comparePane.height}px`;
  }
  for (const canvas of [frameCaptureCanvas, frameAnnotationCanvas]) {
    canvas.width = Math.max(1, Math.floor(framePane.width * ratio));
    canvas.height = Math.max(1, Math.floor(framePane.height * ratio));
    canvas.style.width = `${framePane.width}px`;
    canvas.style.height = `${framePane.height}px`;
  }
  annotationCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  captureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  compareCaptureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  compareAnnotationCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  frameCaptureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  frameAnnotationCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (state.stillImage) {
    const rect = captureCanvas.getBoundingClientRect();
    captureCtx.clearRect(0, 0, rect.width, rect.height);
    drawContainedImage(captureCtx, state.stillImage, rect.width, rect.height);
  }
  if (state.compareStillImage) {
    const rect = compareCaptureCanvas.getBoundingClientRect();
    compareCaptureCtx.clearRect(0, 0, rect.width, rect.height);
    drawContainedImage(compareCaptureCtx, state.compareStillImage, rect.width, rect.height);
  }
  if (state.frameStillImage) {
    const rect = frameCaptureCanvas.getBoundingClientRect();
    frameCaptureCtx.clearRect(0, 0, rect.width, rect.height);
    drawContainedImage(frameCaptureCtx, state.frameStillImage, rect.width, rect.height);
  }
  redraw();
  redraw("comparison");
  redraw("frame");
}

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  const hundredths = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  return `${mins}:${secs}.${hundredths}`;
}

function loadVideo(file, video, emptyEl) {
  if (!file) return;
  const isPrimaryVideo = video === videoA;
  if (isPrimaryVideo) {
    state.stillImage = null;
    state.captured = false;
    state.currentMediaKind = "video";
    clearFrameStrip("Preparing frames...");
    captureCtx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  } else {
    state.compareStillImage = null;
    compareCaptureCtx.clearRect(0, 0, compareCaptureCanvas.width, compareCaptureCanvas.height);
    clearCompareFrameStrip("Preparing comparison frames...");
  }
  video.style.visibility = "visible";
  video.closest(".video-pane")?.classList.add("loaded");
  video.src = URL.createObjectURL(file);
  video.load();
  emptyEl.hidden = true;
  video.addEventListener("loadedmetadata", async () => {
    updateTimeline(video, video === videoA ? $("#timelineA") : $("#timelineB"));
    if (isPrimaryVideo) updateTimelineTracks(file, "video", video.duration);
    if (isPrimaryVideo) await generateFrameStrip(video);
    else await generateCompareFrameStrip(video);
  }, { once: true });
}

function loadImage(file, emptyEl) {
  if (!file) return;
  const image = new Image();
  image.addEventListener("load", () => {
    state.stillImage = image;
    state.captured = true;
    state.currentMediaKind = "image";
    videoA.pause();
    videoA.removeAttribute("src");
    videoA.load();
    videoA.style.visibility = "hidden";
    $("#timelineA").value = 0;
    $("#timeA").textContent = formatTime(0);
    clearFrameStrip("Still image loaded");
    emptyEl.hidden = true;
    const rect = captureCanvas.getBoundingClientRect();
    captureCtx.clearRect(0, 0, rect.width, rect.height);
    drawContainedImage(captureCtx, image, rect.width, rect.height);
    redraw();
  }, { once: true });
  image.src = URL.createObjectURL(file);
}

function loadMedia(file, video, emptyEl) {
  if (!file) return;
  if (file.type.startsWith("image/") && video === videoA) {
    loadImage(file, emptyEl);
    updateTimelineTracks(file, "image", 0);
    return;
  }
  loadVideo(file, video, emptyEl);
}

function importMediaFile(file) {
  if (!file) return;
  const media = {
    id: crypto.randomUUID(),
    file,
    kind: file.type.startsWith("image/") ? "Image" : "Video"
  };
  state.libraryMedia.unshift(media);
  addImportedMediaItem(media);
}

function getLibraryMedia(id) {
  return state.libraryMedia.find((media) => media.id === id);
}

function assignMediaToPane(media, pane) {
  if (!media) return;
  if (pane === "comparison" && !media.file.type.startsWith("video/")) {
    alert("Comparison supports video files. Drag a video from the Library into this window.");
    return;
  }
  const isComparison = pane === "comparison";
  loadMedia(media.file, isComparison ? videoB : videoA, $(isComparison ? "#emptyB" : "#emptyA"));
  document.querySelectorAll(".media-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.mediaId === media.id);
  });
}

function updateTimeline(video, range) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  range.value = duration ? Math.round((video.currentTime / duration) * 1000) : 0;
  $(video === videoA ? "#timeA" : "#timeB").textContent = formatTime(video.currentTime);
  if (video === videoA) updateFrameStripSelection(video.currentTime);
  if (video === videoB) updateCompareFrameStripSelection(video.currentTime);
}

function seekVideo(video, range) {
  if (!Number.isFinite(video.duration) || video.duration === 0) return;
  seekToVideoTime(video, (Number(range.value) / 1000) * video.duration);
}

function stepFrame(direction, video = videoA) {
  if (!video.src) return;
  video.pause();
  seekToVideoTime(video, video.currentTime + direction / state.frameRate);
}

function seekToVideoTime(video, time) {
  if (!Number.isFinite(video.duration) || video.duration === 0) return;
  if (video === videoA) {
    state.captured = false;
    state.stillImage = null;
    videoA.style.visibility = "visible";
    const rect = captureCanvas.getBoundingClientRect();
    captureCtx.clearRect(0, 0, rect.width, rect.height);
  } else {
    state.compareStillImage = null;
    const rect = compareCaptureCanvas.getBoundingClientRect();
    compareCaptureCtx.clearRect(0, 0, rect.width, rect.height);
  }
  video.currentTime = Math.max(0, Math.min(video.duration, time));
}

function setPlaybackButton(button, video) {
  if (!button) return;
  button.textContent = video.paused ? "Play" : "Pause";
}

function togglePlayback(video, button) {
  if (!video.src) return;
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
  setPlaybackButton(button, video);
}

function clearFrameStrip(status = "Add a video to inspect frames") {
  clearVideoFrameStrip({
    strip: frameStrip,
    statusEl: frameStripStatus,
    runKey: "frameStripRun",
    status
  });
}

function clearCompareFrameStrip(status = "Add a comparison video to inspect frames") {
  clearVideoFrameStrip({
    strip: compareFrameStrip,
    statusEl: compareFrameStripStatus,
    runKey: "compareFrameStripRun",
    status
  });
}

function clearVideoFrameStrip({ strip, statusEl, runKey, status }) {
  if (!strip || !statusEl) return;
  state[runKey] += 1;
  strip.innerHTML = "";
  statusEl.textContent = status || "";
}

async function generateFrameStrip(video) {
  return generateVideoFrameStrip({
    video,
    strip: frameStrip,
    statusEl: frameStripStatus,
    runKey: "frameStripRun",
    onSelect: (time) => seekToVideoTime(videoA, time),
    onUpdateSelection: updateFrameStripSelection,
    clearUnavailable: () => clearFrameStrip("Frames unavailable")
  });
}

async function generateCompareFrameStrip(video) {
  return generateVideoFrameStrip({
    video,
    strip: compareFrameStrip,
    statusEl: compareFrameStripStatus,
    runKey: "compareFrameStripRun",
    onSelect: (time) => seekToVideoTime(videoB, time),
    onUpdateSelection: updateCompareFrameStripSelection,
    clearUnavailable: () => clearCompareFrameStrip("Comparison frames unavailable")
  });
}

async function generateVideoFrameStrip({ video, strip, statusEl, runKey, onSelect, onUpdateSelection, clearUnavailable }) {
  if (!strip || !statusEl) return;
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    clearUnavailable();
    return;
  }

  const run = state[runKey] + 1;
  state[runKey] = run;
  strip.innerHTML = "";
  statusEl.textContent = "Building frame strip...";

  const originalTime = video.currentTime || 0;
  const wasPaused = video.paused;
  video.pause();

  const totalFrames = Math.max(1, Math.floor(video.duration * state.frameRate));
  const frameCount = Math.min(totalFrames + 1, 96);
  const step = frameCount > 1 ? totalFrames / (frameCount - 1) : 1;
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 128;
  thumbCanvas.height = 72;
  const thumbCtx = thumbCanvas.getContext("2d");

  for (let index = 0; index < frameCount; index += 1) {
    if (run !== state[runKey]) return;
    const frameNumber = Math.min(totalFrames, Math.round(index * step));
    const time = Math.min(video.duration, frameNumber / state.frameRate);
    await seekAndWait(video, time);
    thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    drawContainedVideo(thumbCtx, video, thumbCanvas.width, thumbCanvas.height);

    const button = document.createElement("button");
    button.className = "frame-thumb";
    button.type = "button";
    button.dataset.time = String(time);
    button.setAttribute("aria-label", `Seek to ${formatTime(time)}`);

    const img = document.createElement("img");
    img.src = thumbCanvas.toDataURL("image/jpeg", 0.72);
    img.alt = "";

    const label = document.createElement("span");
    label.textContent = formatTime(time);

    button.append(img, label);
    button.addEventListener("click", () => onSelect(time));
    strip.append(button);
  }

  await seekAndWait(video, originalTime);
  if (!wasPaused) await video.play();
  statusEl.textContent = `${frameCount} frames sampled · scroll to move one frame`;
  onUpdateSelection(video.currentTime);
}

function seekAndWait(video, time) {
  return new Promise((resolve) => {
    const maxTime = Math.max(0, (video.duration || 0) - 0.001);
    const targetTime = Math.max(0, Math.min(maxTime, time));
    const alreadyThere = Math.abs(video.currentTime - targetTime) < 0.001;
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    if (alreadyThere) {
      requestAnimationFrame(done);
      return;
    }
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = targetTime;
  });
}

function updateFrameStripSelection(time) {
  updateVideoFrameStripSelection(frameStrip, time);
}

function updateCompareFrameStripSelection(time) {
  updateVideoFrameStripSelection(compareFrameStrip, time);
}

function updateVideoFrameStripSelection(strip, time) {
  if (!strip) return;
  const buttons = [...strip.querySelectorAll(".frame-thumb")];
  if (!buttons.length) return;
  let nearest = buttons[0];
  let nearestDistance = Infinity;
  buttons.forEach((button) => {
    const distance = Math.abs(Number(button.dataset.time) - time);
    if (distance < nearestDistance) {
      nearest = button;
      nearestDistance = distance;
    }
    button.classList.remove("active");
  });
  nearest.classList.add("active");
  nearest.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function getFrameStripSamples(limit = 12) {
  const thumbs = [...frameStrip.querySelectorAll(".frame-thumb")];
  if (!thumbs.length) return [];
  const count = Math.min(limit, thumbs.length);
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = count === 1 ? 0 : Math.round((index * (thumbs.length - 1)) / (count - 1));
    const thumb = thumbs[sourceIndex];
    return {
      image: thumb.querySelector("img")?.src,
      time: Number(thumb.dataset.time || 0),
      timeLabel: thumb.querySelector("span")?.textContent || formatTime(Number(thumb.dataset.time || 0))
    };
  }).filter((frame) => frame.image);
}

function getStillImageSample() {
  if (!state.stillImage) return [];
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  drawContainedImage(ctx, state.stillImage, canvas.width, canvas.height);
  return [{ image: canvas.toDataURL("image/jpeg", 0.78), time: 0, timeLabel: "Still image" }];
}

function getAiCoachFrameSamples() {
  const sourceFrames = state.aiCoachFrames.length ? state.aiCoachFrames : state.savedFrames;
  return sourceFrames
    .filter((frame) => frame?.image)
    .map((frame, index) => ({
      image: frame.image,
      time: index,
      timeLabel: `${frame.source || "Saved frame"} ${index + 1}`
    }));
}

function renderAiResult(result, options = {}) {
  const confidence = $("#aiConfidence");
  const target = $("#aiResult");
  if (!target) return;
  confidence.textContent = result.confidence ? result.confidence.toUpperCase() : "Done";
  target.innerHTML = `
    <article class="ai-card ${options.demo ? "demo" : ""}">
      <span>${escapeHtml(result.sport || "Movement analysis")}</span>
      <strong>${escapeHtml(result.issue || "No issue identified")}</strong>
      ${renderAiList("Evidence", result.evidence)}
      ${renderAiList("Corrections", result.corrections)}
      ${renderAiList("Drills", result.drills)}
      <p>${escapeHtml(result.disclaimer || "AI feedback is coaching guidance only and is not a medical diagnosis.")}</p>
    </article>
  `;
}

function renderAiList(title, items = []) {
  if (!items.length) return "";
  return `
    <section>
      <h3>${title}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function demoAnalysisResult() {
  return {
    sport: "Sampled movement",
    issue: "AI analysis is ready, but the backend is not connected.",
    confidence: "demo",
    evidence: ["Frames were collected from the current video or image.", "Set OPENAI_API_KEY on the server to receive sport-specific feedback."],
    corrections: ["Review setup, midpoint, contact or impact, and follow-through in the frame strip.", "Use drawing tools to mark the most important body or equipment positions."],
    drills: ["Slow-motion reps from the strongest frame position.", "Pause-and-hold checkpoints through the motion."],
    disclaimer: "AI feedback is coaching guidance only and is not a medical diagnosis."
  };
}

async function runAiAnalysis() {
  if (state.analyzing) return;
  const aiCoachFrames = getAiCoachFrameSamples();
  const frames = aiCoachFrames.length
    ? aiCoachFrames
    : state.currentMediaKind === "image"
      ? getStillImageSample()
      : getFrameStripSamples(12);
  const resultEl = $("#aiResult");
  const confidenceEl = $("#aiConfidence");

  if (!frames.length) {
    confidenceEl.textContent = "No frames";
    resultEl.innerHTML = "<p>Add saved frames to the AI Coach panel before running analysis.</p>";
    return;
  }

  state.analyzing = true;
  $("#aiAnalyzeBtn").disabled = true;
  confidenceEl.textContent = "Working";
  resultEl.innerHTML = `<p>Analyzing ${frames.length} sampled frame${frames.length === 1 ? "" : "s"}...</p>`;

  try {
    const token = await getAccessToken();
    const response = await fetch("/api/analyze-motion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        athlete: $("#athleteInput")?.value || "Athlete",
        notes: [
          $("#notesInput")?.value || "",
          aiCoachFrames.length
            ? `Analyze all ${aiCoachFrames.length} saved AI Coach frame${aiCoachFrames.length === 1 ? "" : "s"} as one sequence. Focus on whether the athlete is hitting or pitching. Give practical baseball/softball coaching feedback for becoming a better hitter or correcting pitching mechanics.`
            : "Analyze the sampled video frames for baseball or softball hitting/pitching mechanics when visible."
        ].filter(Boolean).join("\n"),
        frames
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI analysis failed");
    renderAiResult(data.result, { demo: data.demo });
  } catch (error) {
    renderAiResult({
      ...demoAnalysisResult(),
      evidence: [error.message, "The frame collection path is working; connect the API route to enable live OpenAI analysis."]
    }, { demo: true });
  } finally {
    state.analyzing = false;
    $("#aiAnalyzeBtn").disabled = false;
  }
}

function captureFrame() {
  if (state.stillImage) return;
  if (!videoA.src) return;
  const rect = captureCanvas.getBoundingClientRect();
  captureCtx.clearRect(0, 0, rect.width, rect.height);
  drawContainedVideo(captureCtx, videoA, rect.width, rect.height);
  videoA.style.visibility = "hidden";
  state.captured = true;
  redraw();
}

function drawContainedVideo(ctx, video, width, height) {
  drawContainedMedia(ctx, video, video.videoWidth, video.videoHeight, width, height);
}

function drawContainedImage(ctx, image, width, height) {
  drawContainedMedia(ctx, image, image.naturalWidth, image.naturalHeight, width, height);
}

function drawContainedMedia(ctx, source, sourceWidth, sourceHeight, width, height) {
  const videoRatio = sourceWidth / sourceHeight || 16 / 9;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (videoRatio > canvasRatio) {
    drawHeight = width / videoRatio;
  } else {
    drawWidth = height * videoRatio;
  }
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(source, x, y, drawWidth, drawHeight);
}

function addImportedMediaItem(media) {
  const library = $(".library-list");
  if (!library) return;
  $("#libraryEmpty")?.remove();
  document.querySelectorAll(".media-item").forEach((item) => item.classList.remove("active"));
  const item = document.createElement("button");
  item.className = "media-item active";
  item.type = "button";
  item.draggable = true;
  item.dataset.mediaId = media.id;
  item.setAttribute("aria-label", `Drag ${media.file.name} into a video window`);
  const thumb = document.createElement("span");
  thumb.className = "media-thumb imported";
  const copy = document.createElement("span");
  copy.className = "media-copy";
  const title = document.createElement("strong");
  title.textContent = media.file.name;
  const meta = document.createElement("small");
  meta.textContent = `${media.kind} · Drag to a window`;
  copy.append(title, meta);
  item.append(thumb, copy);
  item.addEventListener("click", () => {
    document.querySelectorAll(".media-item").forEach((el) => el.classList.toggle("active", el === item));
  });
  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", media.id);
    event.dataTransfer.effectAllowed = "copy";
  });
  library.prepend(item);
}

function updateTimelineTracks(file, kind, duration = 0) {
  const width = duration ? Math.min(86, Math.max(28, duration * 8)) : 34;
  const segmentId = crypto.randomUUID();
  state.selectedSegmentId = segmentId;
  state.audioMuted = false;
  state.timelineSegments = [{
    id: segmentId,
    name: file.name || (kind === "image" ? "Image" : "Video"),
    kind,
    start: 4,
    width,
    muted: false
  }];
  renderTimelineTracks();
}

function renderTimelineTracks() {
  const videoTrack = $("#videoTrack .track-clips");
  const audioTrack = $("#audioTrack .track-clips");
  if (!videoTrack || !audioTrack) return;

  videoTrack.innerHTML = "";
  audioTrack.innerHTML = "";

  state.timelineSegments.forEach((segment) => {
    const isSelected = segment.id === state.selectedSegmentId;
    const videoClip = document.createElement("button");
    videoClip.type = "button";
    videoClip.className = `clip video-clip user-clip timeline-segment${isSelected ? " selected" : ""}`;
    videoClip.dataset.segmentId = segment.id;
    videoClip.textContent = segment.name;
    videoClip.style.left = `${segment.start}%`;
    videoClip.style.width = `${segment.width}%`;
    videoTrack.append(videoClip);
    setupTimelineSegment(videoClip, segment);

    if (segment.kind === "video") {
      const waveform = document.createElement("button");
      waveform.type = "button";
      waveform.className = `waveform user-audio timeline-segment${isSelected ? " selected" : ""}${segment.muted || state.audioMuted ? " muted" : ""}`;
      waveform.dataset.segmentId = segment.id;
      waveform.style.left = `${segment.start}%`;
      waveform.style.width = `${segment.width}%`;
      waveform.setAttribute("aria-label", `${segment.name} audio`);
      audioTrack.append(waveform);
      setupTimelineSegment(waveform, segment);
    }
  });

  $("#muteAudioBtn")?.classList.toggle("active", isSelectedAudioMuted());
  $("#muteAudioBtn")?.setAttribute("aria-pressed", String(isSelectedAudioMuted()));
  videoA.muted = state.audioMuted || state.timelineSegments.some((segment) => segment.muted);
}

function setupTimelineSegment(element, segment) {
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (state.editTool === "slice") {
      state.selectedSegmentId = segment.id;
      sliceTimelineSegmentAtPointer(segment, event, element);
      return;
    }
    selectTimelineSegment(segment.id);
    beginTimelineDrag(segment.id, event);
  });
}

function selectTimelineSegment(segmentId) {
  state.selectedSegmentId = segmentId;
  renderTimelineTracks();
}

function sliceTimelineSegmentAtPointer(segment, event, element) {
  if (segment.width < 8) return;
  const rect = element.getBoundingClientRect();
  const ratio = clampNumber((event.clientX - rect.left) / rect.width, 0.12, 0.88);
  const firstWidth = segment.width * ratio;
  const secondWidth = segment.width - firstWidth;
  if (firstWidth < 3 || secondWidth < 3) return;

  const segmentIndex = state.timelineSegments.findIndex((item) => item.id === segment.id);
  if (segmentIndex === -1) return;

  const firstSegment = {
    ...segment,
    width: firstWidth,
    name: `${segment.name} A`
  };
  const secondSegment = {
    ...segment,
    id: crypto.randomUUID(),
    start: segment.start + firstWidth,
    width: secondWidth,
    name: `${segment.name} B`
  };
  state.timelineSegments.splice(segmentIndex, 1, firstSegment, secondSegment);
  state.selectedSegmentId = secondSegment.id;
  renderTimelineTracks();
}

function beginTimelineDrag(segmentId, event) {
  const segment = state.timelineSegments.find((item) => item.id === segmentId);
  const track = $("#videoTrack .track-clips");
  if (!segment || !track) return;

  const trackRect = track.getBoundingClientRect();
  const dragState = {
    startX: event.clientX,
    startPercent: segment.start,
    segmentId,
    trackWidth: trackRect.width
  };
  document.body.classList.add("is-moving-timeline");

  function moveSegment(moveEvent) {
    const activeSegment = state.timelineSegments.find((item) => item.id === dragState.segmentId);
    if (!activeSegment) return;
    const deltaPercent = ((moveEvent.clientX - dragState.startX) / dragState.trackWidth) * 100;
    activeSegment.start = clampNumber(dragState.startPercent + deltaPercent, 0, 100 - activeSegment.width);
    renderTimelineTracks();
  }

  function stopMove() {
    document.body.classList.remove("is-moving-timeline");
    window.removeEventListener("pointermove", moveSegment);
    window.removeEventListener("pointerup", stopMove);
    window.removeEventListener("pointercancel", stopMove);
  }

  window.addEventListener("pointermove", moveSegment);
  window.addEventListener("pointerup", stopMove);
  window.addEventListener("pointercancel", stopMove);
}

function setEditTool(tool) {
  state.editTool = tool;
  document.querySelectorAll("[data-edit-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.editTool === tool);
  });
  $(".timeline")?.classList.toggle("slice-mode", tool === "slice");
}

function isSelectedAudioMuted() {
  const selected = state.timelineSegments.find((segment) => segment.id === state.selectedSegmentId);
  return selected ? selected.muted : state.audioMuted;
}

function toggleSelectedAudioMute() {
  const selected = state.timelineSegments.find((segment) => segment.id === state.selectedSegmentId);
  if (selected && selected.kind === "video") {
    selected.muted = !selected.muted;
  } else {
    state.audioMuted = !state.audioMuted;
  }
  renderTimelineTracks();
}

function getPoint(event, canvas = annotationCanvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function getAnnotationSurface(target = "original") {
  if (target === "frame") {
    return { canvas: frameAnnotationCanvas, ctx: frameAnnotationCtx, annotations: state.frameAnnotations };
  }
  return target === "comparison"
    ? { canvas: compareAnnotationCanvas, ctx: compareAnnotationCtx, annotations: state.compareAnnotations }
    : { canvas: annotationCanvas, ctx: annotationCtx, annotations: state.annotations };
}

function redraw(target = "original", preview = null) {
  const { canvas, ctx, annotations } = getAnnotationSurface(target);
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  [...annotations, preview].filter(Boolean).forEach((item) => drawAnnotation(item, ctx));
}

function drawAnnotation(item, ctx = annotationCtx) {
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = item.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (item.type === "draw") {
    ctx.beginPath();
    item.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  if (item.type === "line" || item.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(item.start.x, item.start.y);
    ctx.lineTo(item.end.x, item.end.y);
    ctx.stroke();
    if (item.type === "arrow") drawArrowHead(item.start, item.end, item.color, item.width, ctx);
  }

  if (item.type === "circle") {
    const radius = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
    ctx.beginPath();
    ctx.arc(item.start.x, item.start.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (item.type === "text") {
    ctx.font = "400 18px Inter, system-ui, sans-serif";
    ctx.fillText(item.text, item.start.x, item.start.y);
  }

  ctx.restore();
}

function drawArrowHead(start, end, color, width, ctx = annotationCtx) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(12, width * 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function getActiveSaveTarget() {
  if (state.videoView === "frame") return "frame";
  if (state.videoView === "compare") return "comparison";
  if (state.drawingTarget === "frame") return "frame";
  return state.drawingTarget === "comparison" ? "comparison" : "original";
}

function getFrameMetadata(source) {
  return {
    id: crypto.randomUUID(),
    user_id: state.user?.id || "demo-user",
    athlete: $("#athleteInput")?.value || "Athlete",
    session_date: $("#sessionInput")?.value || "",
    note: $("#notesInput")?.value || "",
    created_at: new Date().toISOString(),
    source
  };
}

function makeSnapshotCanvas(target, includeAnnotations = true) {
  const isComparison = target === "comparison";
  const isFrame = target === "frame";
  const canvas = isFrame ? frameAnnotationCanvas : isComparison ? compareAnnotationCanvas : annotationCanvas;
  const rect = canvas.getBoundingClientRect();
  const aspect = rect.width / rect.height || 16 / 9;
  const output = document.createElement("canvas");
  output.width = 960;
  output.height = Math.round(output.width / aspect);
  const ctx = output.getContext("2d");

  if (isComparison) {
    if (state.compareStillImage) {
      drawContainedImage(ctx, state.compareStillImage, output.width, output.height);
    } else if (videoB.src && videoB.videoWidth && videoB.videoHeight) {
      drawContainedVideo(ctx, videoB, output.width, output.height);
    } else {
      return null;
    }
    if (includeAnnotations) ctx.drawImage(compareAnnotationCanvas, 0, 0, output.width, output.height);
    return output;
  }

  if (isFrame) {
    if (!state.frameStillImage) return null;
    drawContainedImage(ctx, state.frameStillImage, output.width, output.height);
    if (includeAnnotations) ctx.drawImage(frameAnnotationCanvas, 0, 0, output.width, output.height);
    return output;
  }

  if (state.stillImage || state.captured) {
    ctx.drawImage(captureCanvas, 0, 0, output.width, output.height);
  } else if (videoA.src && videoA.videoWidth && videoA.videoHeight) {
    drawContainedVideo(ctx, videoA, output.width, output.height);
  } else {
    return null;
  }
  if (includeAnnotations) ctx.drawImage(annotationCanvas, 0, 0, output.width, output.height);
  return output;
}

function persistSavedFrames() {
  const key = "diamondframe.frames";
  while (state.savedFrames.length) {
    try {
      localStorage.setItem(key, JSON.stringify(state.savedFrames));
      return true;
    } catch {
      state.savedFrames.pop();
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify([]));
  } catch {
    return false;
  }
  return false;
}

function saveAnnotatedFrame() {
  const target = getActiveSaveTarget();
  const baseCanvas = makeSnapshotCanvas(target, false);
  const annotatedCanvas = makeSnapshotCanvas(target, true);
  if (!baseCanvas || !annotatedCanvas) {
    alert("Add media to the Original or Comparison window before saving a frame.");
    return null;
  }
  const output = document.createElement("canvas");
  output.width = annotatedCanvas.width;
  output.height = annotatedCanvas.height;
  output.getContext("2d").drawImage(annotatedCanvas, 0, 0);
  const source = target === "comparison" ? "Comparison" : "Original";
  const savedSource = target === "frame" ? "Frame" : source;
  const frame = {
    ...getFrameMetadata(savedSource),
    image: output.toDataURL("image/jpeg", 0.82),
    baseImage: baseCanvas.toDataURL("image/jpeg", 0.82),
    annotations: structuredClone(getAnnotationSurface(target).annotations)
  };
  state.savedFrames.unshift(frame);
  if (!persistSavedFrames()) {
    alert("This browser could not store the saved frame. Try deleting older saved frames.");
    return null;
  }
  renderSavedFrames();
  return frame;
}

function saveComparisonFrame() {
  saveAnnotatedFrame();
}

function renderAiSavedFrame(frame) {
  const target = $("#aiResult");
  if (!target || !frame) return;
  if (!state.aiCoachFrames.some((item) => item.id === frame.id)) {
    state.aiCoachFrames.unshift(frame);
  }
  let list = target.querySelector(".ai-saved-frame-list");
  if (!list) {
    target.innerHTML = "";
    list = document.createElement("div");
    list.className = "ai-saved-frame-list";
    target.append(list);
  }

  const card = document.createElement("article");
  card.className = "ai-saved-frame";

  const image = document.createElement("img");
  image.src = frame.image;
  image.alt = "Saved frame preview";

  const copy = document.createElement("div");
  const source = document.createElement("span");
  source.textContent = frame.source || "Saved Frame";
  const meta = document.createElement("p");
  meta.textContent = `${frame.session_date || "No date"} · ${new Date(frame.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  copy.append(source, meta);
  card.append(image, copy);
  list.prepend(card);
}

function getActiveAnnotationTarget() {
  if (state.videoView === "frame") return "frame";
  return state.videoView === "compare" ? "comparison" : state.drawingTarget;
}

function renderSavedFrames() {
  $("#frameCount").textContent = state.savedFrames.length;
  const libraryFrameCount = $("#libraryFrameCount");
  if (libraryFrameCount) libraryFrameCount.textContent = state.savedFrames.length;
  $("#savedFrames").innerHTML = state.savedFrames.map((frame) => `
    <article class="saved-frame" data-frame-id="${frame.id}">
      <img src="${frame.image}" alt="Saved annotated frame for athlete ${frame.athlete || "Athlete"}" />
      <div>
        <strong>${escapeHtml(frame.athlete || "Athlete")}</strong>
        <span>${escapeHtml(frame.source || "Original")} · ${escapeHtml(frame.session_date || "No date")} · ${new Date(frame.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <button class="saved-frame-delete" type="button" data-delete-frame="${frame.id}" aria-label="Delete saved frame">Delete</button>
    </article>
  `).join("");
}

function loadSavedFrame(frame) {
  if (!frame?.image) return;
  const image = new Image();
  image.addEventListener("load", () => {
    state.frameStillImage = image;
    state.frameAnnotations = structuredClone(frame.baseImage ? frame.annotations || [] : []);
    $("#emptyFrame").hidden = true;
    $("#framePane").classList.add("loaded");
    setVideoView("frame");
    requestAnimationFrame(() => {
      const rect = frameCaptureCanvas.getBoundingClientRect();
      frameCaptureCtx.clearRect(0, 0, rect.width, rect.height);
      drawContainedImage(frameCaptureCtx, image, rect.width, rect.height);
      redraw("frame");
    });
  }, { once: true });
  image.src = frame.baseImage || frame.image;
}

function setVideoView(view) {
  state.videoView = view;
  state.comparing = view === "split";
  const isFrameView = view === "frame";
  if (view === "primary") state.drawingTarget = "original";
  if (view === "compare") state.drawingTarget = "comparison";
  if (isFrameView) state.drawingTarget = "frame";
  const isCompareOnly = view === "compare";
  const layout = $("#videoLayout");
  const app = $("#app");

  layout.classList.toggle("comparing", state.comparing);
  layout.classList.toggle("compare-only", isCompareOnly);
  layout.classList.toggle("frame-only", isFrameView);
  app.classList.toggle("comparing-shell", state.comparing);
  app.classList.toggle("compare-only-shell", isCompareOnly);
  app.classList.toggle("frame-shell", isFrameView);
  $("#compareBtn").classList.toggle("active", state.comparing);
  document.querySelector('[data-action="compare"]').classList.toggle("active", state.comparing);
  document.querySelectorAll("[data-video-view]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.videoView === view);
  });

  requestAnimationFrame(resizeCanvases);
}

function setCompareMode(force = !state.comparing) {
  setVideoView(force ? "split" : "primary");
}

function setupPaneDropTarget(pane, target) {
  pane.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    pane.classList.add("drag-over");
  });
  pane.addEventListener("dragleave", (event) => {
    if (!pane.contains(event.relatedTarget)) pane.classList.remove("drag-over");
  });
  pane.addEventListener("drop", (event) => {
    event.preventDefault();
    pane.classList.remove("drag-over");
    assignMediaToPane(getLibraryMedia(event.dataTransfer.getData("text/plain")), target);
  });
}

function updateAccess() {
  const isPro = state.subscription === "pro";
  const planLabel = $("#planLabel");
  const accessLabel = $("#accessLabel");
  if (planLabel) planLabel.textContent = isPro ? "Pro Coach" : "Free workspace";
  if (accessLabel) accessLabel.textContent = isPro ? "Compare, reports, exports, and unlimited uploads enabled" : "Upgrade for compare, reports, and exports";
  const authBtn = $("#authBtn");
  if (authBtn) authBtn.textContent = state.user ? state.user.email : "Log in";
}

async function startCheckout() {
  try {
    const token = await getAccessToken();
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await response.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("Checkout is not configured");
  } catch {
    state.subscription = "pro";
    localStorage.setItem("diamondframe.subscription", "pro");
    updateAccess();
    alert("Demo mode: Pro access enabled. Connect Stripe env vars to use real Checkout.");
  }
}

async function openPortal() {
  try {
    const token = await getAccessToken();
    const response = await fetch("/api/create-billing-portal-session", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await response.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("Portal is not configured");
  } catch {
    alert("Billing portal needs STRIPE_SECRET_KEY and a Stripe customer id from Supabase.");
  }
}

function exportReport() {
  if (state.subscription !== "pro") {
    setView("dashboard");
    return;
  }
  const lines = [
    `DiamondFrame Report`,
    `Athlete: ${$("#athleteInput").value}`,
    `Session: ${$("#sessionInput").value}`,
    "",
    "Coach Notes:",
    $("#notesInput").value || "No notes added.",
    "",
    `Saved frames: ${state.savedFrames.length}`
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${$("#athleteInput").value || "athlete"}-session-report.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function setView(view) {
  const isDashboard = view === "dashboard";
  $("#app").classList.toggle("dashboard-mode", isDashboard);
  $("#dashboardView").hidden = !isDashboard;
  $("#editorNavBtn").classList.toggle("active-view", !isDashboard);
  $("#dashboardNavBtn").classList.toggle("active-view", isDashboard);
  if (!isDashboard) requestAnimationFrame(resizeCanvases);
}

async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function loadSupabaseSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  state.user = {
    id: data.session.user.id,
    email: data.session.user.email
  };
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", data.session.user.id)
    .single();
  state.subscription = profile?.subscription_status === "active" ? "pro" : "free";
  updateAccess();
}

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((el) => el.classList.toggle("active", el === button));
  });
});

document.querySelectorAll(".segment-control button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment-control button").forEach((el) => el.classList.toggle("selected", el === button));
  });
});

document.querySelectorAll("[data-inspector-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.inspectorTab;
    document.querySelectorAll("[data-inspector-tab]").forEach((el) => el.classList.toggle("selected", el === button));
    $("#aiPanel").hidden = tab !== "ai";
    $("#notesPanel").hidden = tab !== "notes";
    $("#framesPanel").hidden = tab !== "frames";
  });
});

$("#aiAnalyzeBtn").addEventListener("click", runAiAnalysis);

function setupAnnotationCanvas(canvas, target) {
  canvas.addEventListener("pointerdown", (event) => {
    if (target === "original" && !state.captured) captureFrame();
    state.drawingTarget = target;
    state.drawing = true;
    state.start = getPoint(event, canvas);
    state.currentPath = [state.start];
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.drawing || state.drawingTarget !== target) return;
    const point = getPoint(event, canvas);
    if (state.tool === "draw") {
      state.currentPath.push(point);
      redraw(target, { type: "draw", points: state.currentPath, color: state.color, width: state.width });
    } else {
      redraw(target, { type: state.tool, start: state.start, end: point, color: state.color, width: state.width, text: "Coach note" });
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!state.drawing || state.drawingTarget !== target) return;
    const point = getPoint(event, canvas);
    const annotations = getAnnotationSurface(target).annotations;
    state.drawing = false;
    if (state.tool === "text") {
      const text = prompt("Text note", "Hold posture through contact");
      if (text) annotations.push({ type: "text", start: point, text, color: state.color, width: state.width });
    } else if (state.tool === "draw") {
      annotations.push({ type: "draw", points: state.currentPath, color: state.color, width: state.width });
    } else {
      annotations.push({ type: state.tool, start: state.start, end: point, color: state.color, width: state.width });
    }
    redraw(target);
  });

  canvas.addEventListener("pointercancel", () => {
    if (state.drawingTarget !== target) return;
    state.drawing = false;
    redraw(target);
  });

  canvas.addEventListener("click", () => {
    state.drawingTarget = target;
  });
}

setupAnnotationCanvas(annotationCanvas, "original");
setupAnnotationCanvas(compareAnnotationCanvas, "comparison");
setupAnnotationCanvas(frameAnnotationCanvas, "frame");

fileA.addEventListener("change", () => {
  [...fileA.files].forEach(importMediaFile);
  fileA.value = "";
});
$("#uploadBtn").addEventListener("click", () => fileA.click());
$("#emptyB").addEventListener("click", () => setVideoView("compare"));
document.querySelector('[data-action="compare"]').addEventListener("click", () => setCompareMode());
$("#compareBtn").addEventListener("click", () => setCompareMode());
document.querySelectorAll("[data-video-view]").forEach((button) => {
  button.addEventListener("click", () => setVideoView(button.dataset.videoView));
});
setupPaneDropTarget($(".primary-pane"), "original");
setupPaneDropTarget($("#comparePane"), "comparison");
$("#annotateBtn").addEventListener("click", captureFrame);
$("#saveFrameBtn").addEventListener("click", saveAnnotatedFrame);
$("#panelSaveFrameBtn").addEventListener("click", saveAnnotatedFrame);
document.querySelectorAll("[data-edit-tool]").forEach((button) => {
  button.addEventListener("click", () => setEditTool(button.dataset.editTool));
});
$("#muteAudioBtn").addEventListener("click", toggleSelectedAudioMute);
$("#inspectorSaveFrameBtn").addEventListener("click", () => {
  renderAiSavedFrame(saveAnnotatedFrame());
});
$("#savedFrames").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-frame]");
  if (deleteButton) {
    state.savedFrames = state.savedFrames.filter((frame) => frame.id !== deleteButton.dataset.deleteFrame);
    persistSavedFrames();
    renderSavedFrames();
    return;
  }

  const card = event.target.closest("[data-frame-id]");
  if (!card) return;
  loadSavedFrame(state.savedFrames.find((frame) => frame.id === card.dataset.frameId));
});
$("#exportBtn").addEventListener("click", exportReport);
$("#playBtn").addEventListener("click", () => {
  if (!videoA.src) return;
  if (videoA.paused) {
    videoA.play();
    if ($("#syncToggle").checked && videoB.src) videoB.play();
  } else {
    videoA.pause();
    videoB.pause();
  }
  setPlaybackButton($("#playBtn"), videoA);
  setPlaybackButton($("#comparePlayBtn"), videoB);
});
$("#backFrameBtn").addEventListener("click", () => stepFrame(-1, videoA));
$("#nextFrameBtn").addEventListener("click", () => stepFrame(1, videoA));
$("#comparePlayBtn").addEventListener("click", () => togglePlayback(videoB, $("#comparePlayBtn")));
$("#compareBackFrameBtn").addEventListener("click", () => stepFrame(-1, videoB));
$("#compareNextFrameBtn").addEventListener("click", () => stepFrame(1, videoB));
$("#timelineA").addEventListener("input", () => seekVideo(videoA, $("#timelineA")));
$("#timelineB").addEventListener("input", () => seekVideo(videoB, $("#timelineB")));
if (frameStrip) {
  frameStrip.addEventListener("wheel", (event) => {
    if (!videoA.src) return;
    event.preventDefault();
    stepFrame(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1, videoA);
  }, { passive: false });
  frameStrip.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepFrame(-1, videoA);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepFrame(1, videoA);
    }
  });
}
if (compareFrameStrip) {
  compareFrameStrip.addEventListener("wheel", (event) => {
    if (!videoB.src) return;
    event.preventDefault();
    stepFrame(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1, videoB);
  }, { passive: false });
  compareFrameStrip.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepFrame(-1, videoB);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepFrame(1, videoB);
    }
  });
}
videoA.addEventListener("timeupdate", () => updateTimeline(videoA, $("#timelineA")));
videoB.addEventListener("timeupdate", () => updateTimeline(videoB, $("#timelineB")));
videoA.addEventListener("play", () => {
  if ($("#syncToggle").checked && videoB.src && videoB.paused) videoB.play();
  setPlaybackButton($("#playBtn"), videoA);
  setPlaybackButton($("#comparePlayBtn"), videoB);
});
videoA.addEventListener("pause", () => {
  if ($("#syncToggle").checked && videoB.src && !videoB.paused) videoB.pause();
  setPlaybackButton($("#playBtn"), videoA);
  setPlaybackButton($("#comparePlayBtn"), videoB);
});
videoB.addEventListener("play", () => setPlaybackButton($("#comparePlayBtn"), videoB));
videoB.addEventListener("pause", () => setPlaybackButton($("#comparePlayBtn"), videoB));
$("#undoBtn").addEventListener("click", () => {
  const target = getActiveAnnotationTarget();
  getAnnotationSurface(target).annotations.pop();
  redraw(target);
});
$("#clearBtn").addEventListener("click", () => {
  const target = getActiveAnnotationTarget();
  if (target === "comparison") state.compareAnnotations = [];
  else if (target === "frame") state.frameAnnotations = [];
  else state.annotations = [];
  redraw(target);
});
const authBtn = $("#authBtn");
if (authBtn) authBtn.addEventListener("click", () => $("#authDialog").showModal());
$("#editorNavBtn").addEventListener("click", () => setView("editor"));
$("#dashboardNavBtn").addEventListener("click", () => setView("dashboard"));
$("#dashboardUploadBtn").addEventListener("click", () => {
  setView("editor");
  fileA.click();
});
document.querySelectorAll("[data-open-editor]").forEach((button) => {
  button.addEventListener("click", () => setView("editor"));
});
$("#pricingBtn").addEventListener("click", () => $("#pricingDialog").showModal());
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => $(`#${button.dataset.close}`).close());
});
$("#checkoutBtn").addEventListener("click", startCheckout);
$("#pricingCheckoutBtn").addEventListener("click", startCheckout);
$("#portalBtn").addEventListener("click", openPortal);
$("#dashboardPortalBtn").addEventListener("click", openPortal);
$("#colorInput").addEventListener("input", (event) => {
  state.color = event.target.value;
});
$("#widthInput").addEventListener("input", (event) => {
  state.width = Number(event.target.value);
});
$("#saveNoteBtn").addEventListener("click", () => localStorage.setItem("diamondframe.notes", $("#notesInput").value));
$("#notesInput").value = localStorage.getItem("diamondframe.notes") || "";
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#emailInput").value;
  const password = $("#passwordInput").value;

  if (supabase) {
    const action = event.submitter?.value;
    const result = action === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      alert(result.error.message);
      return;
    }
    const user = result.data.user || result.data.session?.user;
    state.user = { id: user.id, email: user.email };
    localStorage.setItem("diamondframe.user", JSON.stringify(state.user));
    $("#authDialog").close();
    updateAccess();
    return;
  }

  state.user = {
    id: crypto.randomUUID(),
    email
  };
  localStorage.setItem("diamondframe.user", JSON.stringify(state.user));
  $("#authDialog").close();
  updateAccess();
});

setupSectionResize();
window.addEventListener("resize", () => {
  applySavedLayoutDimensions();
  resizeCanvases();
});
resizeCanvases();
renderSavedFrames();
updateAccess();
loadSupabaseSession();
