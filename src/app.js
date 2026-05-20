import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dcohvsdvjcxhpiynniuw.supabase.co";
const supabaseBrowserKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || "sb_publishable_dZvedjy_POFCkE4ltiBxoA_ak7XIJnf";
const supabase = supabaseUrl && supabaseBrowserKey ? createClient(supabaseUrl, supabaseBrowserKey) : null;

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
  editingFrameId: null,
  projectNotes: [],
  editingNoteId: null,
  evaluations: [],
  editingEvaluationId: null,
  projects: [],
  selectedProjectId: null,
  savedFrames: [],
  user: null,
  subscription: localStorage.getItem("diamondframe.subscription") || "free",
  captured: false,
  comparing: false,
  pendingDeleteProjectId: null,
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
  libraryWidth: "diamondframe.layout.libraryWidth"
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
  const property = "--library-width";
  const storageKey = layoutStorageKeys.libraryWidth;

  app.style.setProperty(property, `${Math.round(clamped)}px`);
  if (shouldPersist) localStorage.setItem(storageKey, String(Math.round(clamped)));
  requestAnimationFrame(resizeCanvases);
}

function applySavedLayoutDimensions() {
  const libraryWidth = Number(localStorage.getItem(layoutStorageKeys.libraryWidth));

  if (Number.isFinite(libraryWidth) && libraryWidth > 0) setLayoutDimension("library", libraryWidth);
}

function setupSectionResize() {
  const libraryResizer = $("#libraryResizer");
  const libraryPanel = $(".media-browser");
  let activeResize = null;

  applySavedLayoutDimensions();

  function beginResize(event, type) {
    const panel = libraryPanel;
    if (!panel || event.currentTarget.offsetParent === null) return;

    activeResize = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startSize: panel.getBoundingClientRect().width,
      handle: event.currentTarget
    };

    activeResize.handle.classList.add("active-resizer");
    document.body.classList.add("is-resizing");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function updateResize(event) {
    if (!activeResize) return;

    const delta = event.clientX - activeResize.startX;
    setLayoutDimension(activeResize.type, activeResize.startSize + delta);
  }

  function finishResize() {
    if (!activeResize) return;

    const panel = libraryPanel;
    const size = panel.getBoundingClientRect().width;
    setLayoutDimension(activeResize.type, size, true);
    activeResize.handle.classList.remove("active-resizer");
    document.body.classList.remove("is-resizing");
    activeResize = null;
  }

  function nudgeResize(event, type) {
    const panel = libraryPanel;
    if (!panel) return;

    let delta = 0;
    if (event.key === "ArrowLeft") delta = -16;
    if (event.key === "ArrowRight") delta = 16;
    if (!delta) return;

    const currentSize = panel.getBoundingClientRect().width;
    setLayoutDimension(type, currentSize + delta, true);
    event.preventDefault();
  }

  libraryResizer?.addEventListener("pointerdown", (event) => beginResize(event, "library"));
  libraryResizer?.addEventListener("keydown", (event) => nudgeResize(event, "library"));
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
    projectId: state.selectedProjectId,
    file,
    kind: file.type.startsWith("image/") ? "Image" : "Video"
  };
  state.libraryMedia.unshift(media);
  renderLibraryMedia();
}

function getLibraryMedia(id) {
  return state.libraryMedia.find((media) => media.id === id && media.projectId === state.selectedProjectId);
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

function compressImageForAi(frame, maxWidth = 640) {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, width, height);
      resolve({
        ...frame,
        image: canvas.toDataURL("image/jpeg", 0.72)
      });
    }, { once: true });
    image.addEventListener("error", () => resolve(null), { once: true });
    image.src = frame.image;
  });
}

async function prepareFramesForAi(frames) {
  const cappedFrames = frames.slice(0, 8);
  const compressedFrames = await Promise.all(cappedFrames.map((frame) => compressImageForAi(frame)));
  return compressedFrames.filter(Boolean);
}

function getAiCoachFrameSamples() {
  const sourceFrames = state.savedFrames;
  return sourceFrames
    .filter((frame) => frame?.image)
    .map((frame, index) => ({
      image: frame.image,
      time: index,
      timeLabel: `${frame.source || "Saved frame"} ${index + 1}`,
      note: frame.note || ""
    }));
}

function renderAiResult(result, options = {}) {
  const target = $("#aiResult");
  if (!target) return;
  target.innerHTML = renderAiResultMarkup(result, options);
}

function createEvaluation(result, frameCount = 0, options = {}) {
  return {
    id: crypto.randomUUID(),
    project_id: state.selectedProjectId,
    athlete: $("#athleteInput")?.value || "Athlete",
    created_at: new Date().toISOString(),
    frameCount,
    result,
    demo: Boolean(options.demo)
  };
}

function persistEvaluations() {
  localStorage.setItem(getProjectStorageKey("evaluations"), JSON.stringify(state.evaluations));
}

function renderEvaluationList() {
  const list = $("#evaluationList");
  if (!list) return;
  const evaluations = state.evaluations.filter((evaluation) => !isConnectionFallbackEvaluation(evaluation));
  if (!evaluations.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = evaluations.map((evaluation, index) => {
    const result = evaluation.result || {};
    const date = new Date(evaluation.created_at);
    return `
      <article class="evaluation-item" data-evaluation-id="${evaluation.id}">
        <div>
          <strong>${escapeHtml(evaluation.athlete || "Athlete")}</strong>
          <span>Evaluation ${evaluations.length - index} · ${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <p>${escapeHtml(result.issue || "AI coaching assessment")}</p>
        </div>
        <button type="button" data-open-evaluation="${evaluation.id}">Evaluation</button>
      </article>
    `;
  }).join("");
}

function isConnectionFallbackResult(result = {}) {
  const text = [
    result.issue,
    result.confidence,
    result.sport,
    ...(Array.isArray(result.weaknesses) ? result.weaknesses : []),
    ...(Array.isArray(result.evidence) ? result.evidence : []),
    ...(Array.isArray(result.corrections) ? result.corrections : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes("openai_api_key")
    || text.includes("analysis service is not configured")
    || text.includes("analysis is not connected")
    || text.includes("backend is not connected");
}

function isConnectionFallbackEvaluation(evaluation = {}) {
  return Boolean(evaluation.demo && isConnectionFallbackResult(evaluation.result || {}));
}

function saveEvaluation(result, frameCount, options = {}) {
  if (options.demo && isConnectionFallbackResult(result)) return null;
  const evaluation = createEvaluation(result, frameCount, options);
  state.evaluations.unshift(evaluation);
  persistEvaluations();
  saveEvaluationToSupabase(evaluation);
  renderEvaluationList();
  return evaluation;
}

function openEvaluation(evaluationId) {
  const evaluation = state.evaluations.find((item) => item.id === evaluationId);
  if (!evaluation) return;
  state.editingEvaluationId = evaluation.id;
  const body = $("#evaluationDialogBody");
  if (body) {
    body.innerHTML = `
      <div class="evaluation-meta">
        <strong>${escapeHtml(evaluation.athlete || "Athlete")}</strong>
        <span>${new Date(evaluation.created_at).toLocaleString()} · ${evaluation.frameCount || 0} frame${evaluation.frameCount === 1 ? "" : "s"}</span>
      </div>
      <div class="ai-result evaluation-dialog-result">
        ${renderAiResultMarkup(evaluation.result || {}, { demo: evaluation.demo })}
      </div>
    `;
  }
  $("#evaluationDialog")?.showModal();
}

function deleteEditingEvaluation() {
  const evaluationId = state.editingEvaluationId;
  state.evaluations = state.evaluations.filter((item) => item.id !== state.editingEvaluationId);
  state.editingEvaluationId = null;
  persistEvaluations();
  deleteEvaluationFromSupabase(evaluationId);
  renderEvaluationList();
  $("#evaluationDialog")?.close();
}

function getEditingEvaluation() {
  return state.evaluations.find((item) => item.id === state.editingEvaluationId) || null;
}

function evaluationPdfSection(title, items = []) {
  if (!items.length) return "";
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function exportEvaluationPdf() {
  const evaluation = getEditingEvaluation();
  if (!evaluation) {
    alert("Open an evaluation before exporting.");
    return;
  }

  const result = evaluation.result || {};
  const athlete = evaluation.athlete || "Athlete";
  const created = new Date(evaluation.created_at).toLocaleString();
  const filename = `${athlete.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "evaluation"}-evaluation.pdf`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(athlete)} Evaluation</title>
  <style>
    @page { margin: 0.65in; }
    body { margin: 0; color: #17181d; font-family: Arial, sans-serif; line-height: 1.45; }
    header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    header p { margin: 4px 0; color: #596173; }
    .summary { padding: 16px; border: 1px solid #d9dce3; border-radius: 8px; background: #f6f8fb; margin-bottom: 20px; }
    .summary span { display: block; margin-bottom: 6px; color: #2563eb; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .summary strong { display: block; font-size: 18px; }
    section { page-break-inside: avoid; margin: 0 0 18px; }
    h2 { margin: 0 0 8px; color: #252a35; font-size: 15px; text-transform: uppercase; }
    ul { margin: 0; padding-left: 22px; }
    li { margin: 0 0 7px; }
    footer { margin-top: 26px; color: #596173; font-size: 12px; border-top: 1px solid #d9dce3; padding-top: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(athlete)} Evaluation</h1>
    <p>${escapeHtml(created)} · ${evaluation.frameCount || 0} frame${evaluation.frameCount === 1 ? "" : "s"}</p>
    <p>Exported from DiamondFrame</p>
  </header>
  <main>
    <div class="summary">
      <span>${escapeHtml(result.sport || "AI Coach")}</span>
      <strong>${escapeHtml(result.issue || "Evaluation")}</strong>
    </div>
    ${evaluationPdfSection("What Looks Correct", result.strengths)}
    ${evaluationPdfSection("What Needs Work", result.weaknesses)}
    ${evaluationPdfSection("Evidence", result.evidence)}
    ${evaluationPdfSection("Corrections", result.corrections)}
    ${evaluationPdfSection("Drills", result.drills)}
  </main>
  <footer>${escapeHtml(result.disclaimer || "AI feedback is coaching guidance only and is not a medical diagnosis.")}</footer>
  <script>
    document.title = ${JSON.stringify(filename)};
    window.addEventListener("load", () => {
      window.print();
    });
  </script>
</body>
</html>`;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    alert("Allow popups for this site to export the evaluation PDF.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function renderAiResultMarkup(result, options = {}) {
  return `
    <article class="ai-card ${options.demo ? "demo" : ""}">
      <span>${escapeHtml(result.sport || "Movement analysis")}</span>
      <strong>${escapeHtml(result.issue || "No issue identified")}</strong>
      ${renderAiList("What Looks Correct", result.strengths)}
      ${renderAiList("What Needs Work", result.weaknesses)}
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
    strengths: ["Saved frames can be reviewed as a swing sequence once the AI key is connected."],
    weaknesses: ["Live AI feedback is unavailable until OPENAI_API_KEY is set on the server."],
    evidence: ["Frames were collected from the current video or image.", "Set OPENAI_API_KEY on the server to receive sport-specific feedback."],
    corrections: ["Review setup, midpoint, contact or impact, and follow-through in the frame strip.", "Use drawing tools to mark the most important body or equipment positions."],
    drills: ["Slow-motion reps from the strongest frame position.", "Pause-and-hold checkpoints through the motion."],
    disclaimer: "AI feedback is coaching guidance only and is not a medical diagnosis."
  };
}

function analysisErrorResult(message) {
  const text = String(message || "AI analysis failed");
  const quotaProblem = /quota|billing|insufficient|credits|limit/i.test(text);
  return {
    sport: "AI Coach",
    issue: quotaProblem ? "OpenAI quota or billing needs attention." : "AI analysis could not complete.",
    confidence: "error",
    strengths: ["Saved frames were collected and sent through the analysis flow."],
    weaknesses: [quotaProblem ? "The OpenAI account or project does not currently have available API usage." : "The AI service returned an error before analysis completed."],
    evidence: [text],
    corrections: quotaProblem
      ? ["Add API credits or enable billing in the OpenAI Platform project.", "Check project usage limits, then try Analyze again."]
      : ["Check the API key, model, and server logs, then try Analyze again."],
    drills: [],
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

  if (!frames.length) {
    resultEl.innerHTML = "<p>Add saved frames to the AI Coach panel before running analysis.</p>";
    return;
  }

  state.analyzing = true;
  $("#aiAnalyzeBtn").disabled = true;
  resultEl.innerHTML = `<p>Analyzing ${frames.length} sampled frame${frames.length === 1 ? "" : "s"}...</p>`;

  try {
    const token = await getAccessToken();
    const preparedFrames = await prepareFramesForAi(frames);
    if (!preparedFrames.length) throw new Error("Saved frames could not be prepared for AI analysis.");
    const response = await fetch("/api/analyze-motion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        athlete: $("#athleteInput")?.value || "Athlete",
        notes: [
          getProjectNotesText(),
          aiCoachFrames.length
            ? `Analyze ${preparedFrames.length} saved AI Coach frame${preparedFrames.length === 1 ? "" : "s"} as one sequence. Focus on what the hitter is doing correctly, what is wrong with the swing, and how to correct it. If pitching is shown instead, give pitching mechanics feedback.`
            : "Analyze the sampled video frames for baseball or softball hitting/pitching mechanics when visible."
        ].filter(Boolean).join("\n"),
        frames: preparedFrames
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI analysis failed");
    saveEvaluation(data.result, preparedFrames.length, { demo: data.demo });
    renderAiResult(data.result, { demo: data.demo });
  } catch (error) {
    renderAiResult(analysisErrorResult(error.message), { demo: true });
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

function getProjectMedia() {
  return state.libraryMedia.filter((media) => media.projectId === state.selectedProjectId);
}

function renderLibraryMedia() {
  const library = $(".library-list");
  if (!library) return;
  library.innerHTML = "";
  const projectMedia = getProjectMedia();
  if (!projectMedia.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.id = "libraryEmpty";
    empty.innerHTML = "<strong>No media yet</strong><span>Upload a video or image to add it to this project.</span>";
    library.append(empty);
    return;
  }
  projectMedia.forEach((media, index) => addImportedMediaItem(media, index === 0));
}

function addImportedMediaItem(media, isActive = false) {
  const library = $(".library-list");
  if (!library) return;
  $("#libraryEmpty")?.remove();
  if (isActive) document.querySelectorAll(".media-item").forEach((item) => item.classList.remove("active"));
  const item = document.createElement("button");
  item.className = `media-item${isActive ? " active" : ""}`;
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
  library.append(item);
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
    project_id: state.selectedProjectId,
    athlete: $("#athleteInput")?.value || "Athlete",
    session_date: $("#sessionInput")?.value || "",
    note: getProjectNotesText(),
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
  const key = getProjectStorageKey("frames");
  if (supabase && state.user?.id) {
    localStorage.removeItem(key);
    return true;
  }

  try {
    localStorage.setItem(key, JSON.stringify(state.savedFrames));
    return true;
  } catch {
    return false;
  }
}

function getProjectStorageKey(name, projectId = state.selectedProjectId) {
  return projectId ? `diamondframe.project.${projectId}.${name}` : `diamondframe.${name}`;
}

function readProjectJson(name, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(getProjectStorageKey(name)) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function savedFrameFromRow(row) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.player_id,
    athlete: metadata.athlete || getSelectedProject()?.athlete || "Athlete",
    session_date: metadata.session_date || "",
    note: metadata.note || "",
    created_at: row.created_at,
    updated_at: metadata.updated_at,
    source: row.source || "Original",
    image: row.image_path,
    baseImage: row.base_image_path || row.image_path,
    annotations: Array.isArray(metadata.annotations) ? metadata.annotations : []
  };
}

function savedFrameToRow(frame) {
  return {
    id: frame.id,
    user_id: state.user?.id,
    player_id: frame.project_id || state.selectedProjectId,
    frame_time_seconds: Number(frame.time || 0),
    image_path: frame.image,
    base_image_path: frame.baseImage || null,
    source: frame.source || "Original",
    metadata: {
      athlete: frame.athlete || getSelectedProject()?.athlete || "Athlete",
      session_date: frame.session_date || "",
      note: frame.note || "",
      annotations: frame.annotations || [],
      updated_at: frame.updated_at || null
    },
    created_at: frame.created_at || new Date().toISOString()
  };
}

async function saveSavedFrameToSupabase(frame) {
  if (!supabase || !state.user?.id || !state.selectedProjectId || !frame?.image) return false;
  const { error } = await supabase.from("saved_frames").upsert(savedFrameToRow(frame), { onConflict: "id" });
  if (error) {
    console.warn("Could not save frame to Supabase", error.message);
    return false;
  }
  return true;
}

async function deleteSavedFrameFromSupabase(frameId) {
  if (!supabase || !state.user?.id || !frameId) return;
  const { error } = await supabase
    .from("saved_frames")
    .delete()
    .eq("id", frameId)
    .eq("user_id", state.user.id);
  if (error) console.warn("Could not delete frame from Supabase", error.message);
}

async function loadSavedFramesFromSupabase(localFrames = []) {
  if (!supabase || !state.user?.id || !state.selectedProjectId) return localFrames;

  const { data, error } = await supabase
    .from("saved_frames")
    .select("id, user_id, player_id, image_path, base_image_path, source, metadata, created_at")
    .eq("user_id", state.user.id)
    .eq("player_id", state.selectedProjectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not load frames from Supabase", error.message);
    return [];
  }

  return (data || []).map(savedFrameFromRow).filter((frame) => frame.image);
}

function evaluationFromRow(row) {
  const metadata = row.metadata || {};
  const evaluation = metadata.evaluation || {};
  const item = {
    id: row.id,
    project_id: row.player_id,
    athlete: metadata.athlete || getSelectedProject()?.athlete || "Athlete",
    created_at: row.created_at,
    frameCount: metadata.frameCount || 0,
    demo: Boolean(metadata.demo),
    result: evaluation.result || evaluation || { issue: row.body || "Evaluation" }
  };
  return isConnectionFallbackEvaluation(item) ? null : item;
}

function evaluationToRow(evaluation) {
  return {
    id: evaluation.id,
    user_id: state.user?.id,
    player_id: evaluation.project_id || state.selectedProjectId,
    kind: "evaluation",
    body: evaluation.result?.issue || "AI evaluation",
    metadata: {
      athlete: evaluation.athlete || getSelectedProject()?.athlete || "Athlete",
      frameCount: evaluation.frameCount || 0,
      demo: Boolean(evaluation.demo),
      evaluation: {
        result: evaluation.result || {}
      }
    },
    created_at: evaluation.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function saveEvaluationToSupabase(evaluation) {
  if (!supabase || !state.user?.id || !state.selectedProjectId || !evaluation?.id) return;
  const { error } = await supabase.from("notes").upsert(evaluationToRow(evaluation), { onConflict: "id" });
  if (error) console.warn("Could not save evaluation to Supabase", error.message);
}

async function deleteEvaluationFromSupabase(evaluationId) {
  if (!supabase || !state.user?.id || !evaluationId) return;
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", evaluationId)
    .eq("user_id", state.user.id)
    .eq("kind", "evaluation");
  if (error) console.warn("Could not delete evaluation from Supabase", error.message);
}

async function loadEvaluationsFromSupabase(localEvaluations = []) {
  if (!supabase || !state.user?.id || !state.selectedProjectId) return localEvaluations;

  const { data, error } = await supabase
    .from("notes")
    .select("id, user_id, player_id, body, kind, metadata, created_at, updated_at")
    .eq("user_id", state.user.id)
    .eq("player_id", state.selectedProjectId)
    .eq("kind", "evaluation")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not load evaluations from Supabase", error.message);
    return [];
  }

  const staleEvaluationIds = [];
  const remoteEvaluations = (data || []).map((row) => {
    const evaluation = evaluationFromRow(row);
    if (!evaluation) staleEvaluationIds.push(row.id);
    return evaluation;
  }).filter(Boolean);
  staleEvaluationIds.forEach((id) => deleteEvaluationFromSupabase(id));
  return remoteEvaluations;
}

function frameBelongsToSelectedProject(frame) {
  const selectedProject = getSelectedProject();
  if (!selectedProject) return false;
  if (frame.project_id) return frame.project_id === state.selectedProjectId;
  return (frame.athlete || "").trim().toLowerCase() === selectedProject.athlete.trim().toLowerCase();
}

function persistProjectNotes() {
  localStorage.setItem(getProjectStorageKey("notes"), JSON.stringify(state.projectNotes));
}

function readProjectNotes() {
  const raw = localStorage.getItem(getProjectStorageKey("notes"));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Older projects stored notes as a single text value.
  }
  return raw.trim()
    ? [{ id: crypto.randomUUID(), text: raw, created_at: new Date().toISOString() }]
    : [];
}

function getProjectNotesText() {
  const savedNotes = state.projectNotes.map((note) => note.text).filter(Boolean);
  const draftNote = $("#notesInput")?.value.trim();
  return [...savedNotes, draftNote].filter(Boolean).join("\n\n");
}

function renderProjectNotes() {
  const list = $("#mechanicsNoteList");
  if (!list) return;
  list.innerHTML = state.projectNotes.map((note) => `
    <article class="mechanics-note" data-note-id="${note.id}">
      <p>${escapeHtml(note.text)}</p>
      <button type="button" data-edit-note="${note.id}">Edit</button>
    </article>
  `).join("");
}

function saveProjectNote() {
  const input = $("#notesInput");
  const text = input?.value.trim();
  if (!text) return;
  state.projectNotes.unshift({
    id: crypto.randomUUID(),
    text,
    created_at: new Date().toISOString()
  });
  input.value = "";
  persistProjectNotes();
  renderProjectNotes();
}

function openMechanicsNoteEditor(noteId) {
  const note = state.projectNotes.find((item) => item.id === noteId);
  if (!note) return;
  state.editingNoteId = note.id;
  $("#mechanicsNoteEditInput").value = note.text;
  $("#mechanicsNoteDialog")?.showModal();
  $("#mechanicsNoteEditInput")?.focus();
}

function saveEditingMechanicsNote() {
  const note = state.projectNotes.find((item) => item.id === state.editingNoteId);
  if (!note) return;
  note.text = $("#mechanicsNoteEditInput")?.value.trim() || "";
  note.updated_at = new Date().toISOString();
  if (!note.text) state.projectNotes = state.projectNotes.filter((item) => item.id !== note.id);
  persistProjectNotes();
  renderProjectNotes();
  state.editingNoteId = null;
  $("#mechanicsNoteDialog")?.close();
}

function deleteEditingMechanicsNote() {
  state.projectNotes = state.projectNotes.filter((note) => note.id !== state.editingNoteId);
  persistProjectNotes();
  renderProjectNotes();
  state.editingNoteId = null;
  $("#mechanicsNoteDialog")?.close();
}

function persistCurrentProjectWorkspace() {
  persistCurrentFrameEdit();
  persistProjectNotes();
  persistSavedFrames();
  persistEvaluations();
}

async function saveAnnotatedFrame() {
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
  renderSavedFrames();
  if (supabase && state.user?.id) {
    const saved = await saveSavedFrameToSupabase(frame);
    if (!saved) {
      state.savedFrames = state.savedFrames.filter((item) => item.id !== frame.id);
      renderSavedFrames();
      alert("This saved frame could not sync to your account. Please try again.");
      return null;
    }
    persistSavedFrames();
    return frame;
  }

  if (!persistSavedFrames()) {
    state.savedFrames = state.savedFrames.filter((item) => item.id !== frame.id);
    renderSavedFrames();
    alert("This browser could not store the saved frame. Try deleting older saved frames.");
    return null;
  }
  return frame;
}

function getEditingFrame() {
  return state.savedFrames.find((frame) => frame.id === state.editingFrameId) || null;
}

function persistCurrentFrameEdit() {
  const frame = getEditingFrame();
  if (!frame || !state.frameStillImage) return;

  const annotatedCanvas = makeSnapshotCanvas("frame", true);
  if (!annotatedCanvas) return;

  frame.annotations = structuredClone(state.frameAnnotations);
  frame.note = $("#savedFrameNoteInput") ? $("#savedFrameNoteInput").value : frame.note || "";
  frame.image = annotatedCanvas.toDataURL("image/jpeg", 0.82);
  frame.updated_at = new Date().toISOString();
  persistSavedFrames();
  saveSavedFrameToSupabase(frame);
  renderSavedFrames();
}

function deleteEditingFrame() {
  const frame = getEditingFrame();
  if (!frame) return;
  state.savedFrames = state.savedFrames.filter((item) => item.id !== frame.id);
  state.aiCoachFrames = state.aiCoachFrames.filter((item) => item.id !== frame.id);
  deleteSavedFrameFromSupabase(frame.id);
  state.editingFrameId = null;
  persistSavedFrames();
  renderSavedFrames();
  $("#savedFrameEditDialog")?.close();
  state.frameStillImage = null;
  state.frameAnnotations = [];
  $("#emptyFrame").hidden = false;
  $("#framePane").classList.remove("loaded");
  frameCaptureCtx.clearRect(0, 0, frameCaptureCanvas.width, frameCaptureCanvas.height);
  frameAnnotationCtx.clearRect(0, 0, frameAnnotationCanvas.width, frameAnnotationCanvas.height);
}

function saveComparisonFrame() {
  saveAnnotatedFrame();
}

function renderAiCoachFrames() {
  const list = $("#aiSavedFrameList");
  if (!list) return;
  if (!state.savedFrames.length) {
    list.innerHTML = `<p class="empty-ai-frames">No saved frames yet</p>`;
    return;
  }

  list.innerHTML = state.savedFrames.map((frame, index) => `
    <article class="ai-saved-frame" data-ai-frame-id="${frame.id}">
      <img src="${frame.image}" alt="AI Coach saved frame ${index + 1}" />
      <div>
        <span>${escapeHtml(frame.source || "Saved Frame")} ${index + 1}</span>
        <p>${escapeHtml(frame.note || frame.session_date || "Ready for swing analysis")}</p>
      </div>
    </article>
  `).join("");
}

function getActiveAnnotationTarget() {
  if (state.videoView === "frame") return "frame";
  return state.videoView === "compare" ? "comparison" : state.drawingTarget;
}

function renderSavedFrames() {
  const frameCount = $("#frameCount");
  if (frameCount) frameCount.textContent = state.savedFrames.length;
  const libraryFrameCount = $("#libraryFrameCount");
  if (libraryFrameCount) libraryFrameCount.textContent = state.savedFrames.length;
  $("#savedFrames").innerHTML = state.savedFrames.map((frame) => `
    <article class="saved-frame" data-frame-id="${frame.id}">
      <img src="${frame.image}" alt="Saved annotated frame for athlete ${frame.athlete || "Athlete"}" />
      <div>
        <strong>${escapeHtml(frame.athlete || "Athlete")}</strong>
        <span>${escapeHtml(frame.source || "Original")} · ${escapeHtml(frame.session_date || "No date")} · ${new Date(frame.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        ${frame.note ? `<span>${escapeHtml(frame.note)}</span>` : ""}
      </div>
      <button class="saved-frame-edit" type="button" data-edit-frame="${frame.id}" aria-label="Open saved frame notes">Notes</button>
    </article>
  `).join("");
  renderAiCoachFrames();
}

function loadSavedFrame(frame) {
  if (!frame?.image) return;
  persistCurrentFrameEdit();
  state.editingFrameId = frame.id;
  const noteInput = $("#savedFrameNoteInput");
  if (noteInput) noteInput.value = frame.note || "";
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

function openSavedFrameEditor(frame) {
  loadSavedFrame(frame);
  $("#savedFrameEditDialog")?.showModal();
}

function setVideoView(view) {
  if (state.videoView === "frame" && view !== "frame") persistCurrentFrameEdit();
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
  $("#compareBtn")?.classList.toggle("active", state.comparing);
  document.querySelector('[data-action="compare"]')?.classList.toggle("active", state.comparing);
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
  const authPage = $("#authPage");
  const app = $("#app");
  if (authPage && app) {
    authPage.hidden = Boolean(state.user);
    app.hidden = !state.user;
    if (state.user) requestAnimationFrame(resizeCanvases);
  }
}

function setAuthPageMode(mode) {
  const title = $("#authPageTitle");
  const subtitle = $("#authPageSubtitle");
  const submitButton = $("#authSubmitBtn");
  const passwordField = $("#authPasswordField");
  const passwordInput = $("#authPasswordInput");
  const message = $("#authPageMessage");
  const forgotButton = $("#forgotPasswordBtn");
  const backButton = $("#backToLoginBtn");

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.authMode === mode);
  });

  if (message) message.textContent = "";
  if (passwordField) passwordField.hidden = mode === "reset";
  if (passwordInput) {
    passwordInput.required = mode !== "reset";
    passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  }
  if (forgotButton) forgotButton.hidden = mode === "reset";
  if (backButton) backButton.hidden = mode !== "reset";

  if (mode === "login") {
    if (title) title.textContent = "Log in to your account";
    if (subtitle) subtitle.textContent = "Return to your private workspace for saved frames, projects, and coach notes.";
    if (submitButton) submitButton.textContent = "Log In";
    return;
  }

  if (mode === "reset") {
    if (title) title.textContent = "Reset your password";
    if (subtitle) subtitle.textContent = "Enter your email and we will send password reset instructions.";
    if (submitButton) submitButton.textContent = "Send Reset Link";
    return;
  }

  if (title) title.textContent = "Create your account";
  if (subtitle) subtitle.textContent = "Start a private workspace for your videos, saved frames, and AI coach notes.";
  if (submitButton) submitButton.textContent = "Create Account";
}

function getAuthPageMode() {
  if ($("#authPasswordField")?.hidden) return "reset";
  return document.querySelector("[data-auth-mode].selected")?.dataset.authMode || "signup";
}

async function submitAuthPage(event) {
  event.preventDefault();
  const email = $("#authEmailInput")?.value.trim();
  const password = $("#authPasswordInput")?.value || "";
  const mode = getAuthPageMode();
  const message = $("#authPageMessage");

  if (!email) return;
  if (message) message.textContent = "";

  if (mode === "reset") {
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        if (message) message.textContent = error.message;
        return;
      }
    }
    if (message) message.textContent = "Password reset instructions sent if that email is registered.";
    return;
  }

  if (supabase) {
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      if (message) message.textContent = result.error.message;
      return;
    }
    if (!result.data.session) {
      if (message) message.textContent = "Check your email to confirm the account, then log in.";
      return;
    }
    const user = result.data.session.user || result.data.user;
    if (user) await completeAuth(user, email);
    return;
  }

  await completeAuth(email);
}

function getFallbackUser(email) {
  return {
    id: state.user?.id || crypto.randomUUID(),
    email
  };
}

function getSupabaseUser(authUser, email) {
  return authUser?.id
    ? { id: authUser.id, email: authUser.email || email }
    : getFallbackUser(email);
}

async function completeAuth(authUserOrEmail, fallbackEmail = "") {
  const email = typeof authUserOrEmail === "string"
    ? authUserOrEmail
    : authUserOrEmail?.email || fallbackEmail;
  state.user = typeof authUserOrEmail === "string"
    ? getFallbackUser(email)
    : getSupabaseUser(authUserOrEmail, email);
  localStorage.setItem("diamondframe.user", JSON.stringify(state.user));
  await loadProjectsFromSupabase();
  updateAccess();
  setDashboardSection("projects");
  setView("dashboard");
}

function persistProjects() {
  localStorage.setItem("diamondframe.projects", JSON.stringify(state.projects));
  if (state.selectedProjectId) localStorage.setItem("diamondframe.selectedProjectId", state.selectedProjectId);
  else localStorage.removeItem("diamondframe.selectedProjectId");
}

function parseProjectNotesMetadata(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function projectFromPlayer(player) {
  const metadata = parseProjectNotesMetadata(player.notes);
  return {
    id: player.id,
    athlete: player.name || "Athlete",
    sport: player.position || metadata.sport || "",
    age: metadata.age || "",
    team: metadata.team || "",
    createdAt: player.created_at || new Date().toISOString()
  };
}

function projectToPlayer(project) {
  return {
    id: project.id,
    user_id: state.user?.id,
    name: project.athlete || "Athlete",
    position: project.sport || null,
    notes: JSON.stringify({
      age: project.age || "",
      team: project.team || ""
    })
  };
}

async function saveProjectToSupabase(project) {
  if (!supabase || !state.user?.id || !project?.id) return;
  const payload = projectToPlayer(project);
  const { error } = await supabase.from("players").upsert(payload, { onConflict: "id" });
  if (error) console.warn("Could not save project to Supabase", error.message);
}

async function deleteProjectFromSupabase(projectId) {
  if (!supabase || !state.user?.id || !projectId) return;
  const { error } = await supabase
    .from("players")
    .delete()
    .eq("id", projectId)
    .eq("user_id", state.user.id);
  if (error) console.warn("Could not delete project from Supabase", error.message);
}

async function loadProjectsFromSupabase() {
  if (!supabase || !state.user?.id) return;

  const { data, error } = await supabase
    .from("players")
    .select("id, name, position, notes, created_at")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not load projects from Supabase", error.message);
    state.projects = [];
    state.selectedProjectId = null;
    persistProjects();
    renderDashboardProjects();
    updateProjectChrome();
    return;
  }

  const remoteProjects = (data || []).map(projectFromPlayer);
  const seen = new Set();
  state.projects = remoteProjects.filter((project) => {
    if (!project.id || seen.has(project.id)) return false;
    seen.add(project.id);
    return true;
  });
  if (!state.selectedProjectId && state.projects.length) {
    state.selectedProjectId = state.projects[0].id;
  }
  if (state.selectedProjectId && !state.projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || null;
  }
  persistProjects();
  renderDashboardProjects();
  updateProjectChrome();
}

function getSelectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId) || null;
}

function updateProjectChrome() {
  const selectedProject = getSelectedProject();
  const title = selectedProject?.athlete || "New Project";
  $(".topbar h1").textContent = title;
  const athleteInput = $("#athleteInput");
  if (athleteInput) athleteInput.value = selectedProject?.athlete || "";
}

async function selectProject(projectId, { openEditor = false } = {}) {
  if (projectId === state.selectedProjectId) {
    if (openEditor) setView("editor");
    return;
  }

  persistCurrentProjectWorkspace();
  state.selectedProjectId = projectId;
  persistProjects();
  await loadProjectWorkspace();
  renderDashboardProjects();
  if (openEditor) setView("editor");
}

function resetEditorSurface() {
  [videoA, videoB].forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.visibility = "visible";
    video.closest(".video-pane")?.classList.remove("loaded");
  });

  $("#emptyA").hidden = false;
  $("#emptyB").hidden = false;
  $("#emptyFrame").hidden = false;
  $("#framePane").classList.remove("loaded");
  state.stillImage = null;
  state.compareStillImage = null;
  state.frameStillImage = null;
  state.currentMediaKind = null;
  state.captured = false;
  state.annotations = [];
  state.compareAnnotations = [];
  state.frameAnnotations = [];
  state.aiCoachFrames = [];
  state.editingFrameId = null;
  state.timelineSegments = [];
  state.selectedSegmentId = null;
  state.audioMuted = false;
  state.drawingTarget = "original";
  clearFrameStrip();
  clearCompareFrameStrip();
  $("#timelineA").value = 0;
  $("#timelineB").value = 0;
  $("#timeA").textContent = formatTime(0);
  $("#timeB").textContent = formatTime(0);
  $("#aiResult").innerHTML = "<p>Save swing frames, then select Analyze to get AI coaching feedback on what looks correct, what needs work, and how to fix it.</p>";
  renderEvaluationList();
  renderTimelineTracks();
  setVideoView("primary");
  requestAnimationFrame(() => {
    [captureCtx, annotationCtx, compareCaptureCtx, compareAnnotationCtx, frameCaptureCtx, frameAnnotationCtx].forEach((ctx) => {
      const canvas = ctx.canvas;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    });
  });
}

async function loadProjectWorkspace({ resetSurface = true } = {}) {
  if (resetSurface) resetEditorSurface();
  const storedFrames = readProjectJson("frames", []);
  const localFrames = storedFrames.filter(frameBelongsToSelectedProject);
  state.savedFrames = await loadSavedFramesFromSupabase(localFrames);
  if (state.savedFrames.length !== storedFrames.length) persistSavedFrames();
  state.projectNotes = readProjectNotes();
  const localEvaluations = readProjectJson("evaluations", []).filter((evaluation) => !evaluation.project_id || evaluation.project_id === state.selectedProjectId);
  state.evaluations = await loadEvaluationsFromSupabase(localEvaluations);
  persistEvaluations();
  const notesInput = $("#notesInput");
  if (notesInput) notesInput.value = "";
  renderLibraryMedia();
  renderSavedFrames();
  renderProjectNotes();
  renderEvaluationList();
  updateProjectChrome();
}

function renderDashboardProjects() {
  const projectList = $("#dashboardProjects");
  const projectCount = $("#dashboardProjectCount");
  if (projectCount) projectCount.textContent = String(state.projects.length);
  if (!projectList) return;

  projectList.innerHTML = "";
  if (!state.projects.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "No projects yet. Create one to start a workspace.";
    projectList.append(empty);
    return;
  }

  state.projects.forEach((project) => {
    const row = document.createElement("article");
    row.className = `dashboard-project project-row${project.id === state.selectedProjectId ? " selected" : ""}`;
    row.dataset.projectId = project.id;

    const thumb = document.createElement("div");
    thumb.className = "project-thumb";

    const copy = document.createElement("div");
    const name = document.createElement("strong");
    const details = document.createElement("span");
    const meta = document.createElement("small");

    name.textContent = project.athlete;
    details.textContent = [project.sport, project.team].filter(Boolean).join(" · ") || "No sport added";
    meta.textContent = project.age ? `Age ${project.age}` : "Ready to edit";

    const actions = document.createElement("div");
    actions.className = "project-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Delete";

    copy.append(name, details, meta);
    actions.append(openButton, deleteButton);
    row.append(thumb, copy, actions);
    openButton.addEventListener("click", () => {
      selectProject(project.id, { openEditor: true });
    });
    deleteButton.addEventListener("click", () => openDeleteProjectDialog(project.id));

    projectList.append(row);
  });
}

function openDeleteProjectDialog(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  state.pendingDeleteProjectId = projectId;
  const copy = $("#deleteProjectCopy");
  if (copy) copy.textContent = `Delete "${project.athlete}"? This project will be permanently deleted.`;
  $("#deleteProjectDialog")?.showModal();
}

async function confirmProjectDelete(event) {
  event.preventDefault();
  const projectId = state.pendingDeleteProjectId;
  if (!projectId) return;
  state.pendingDeleteProjectId = null;
  $("#deleteProjectDialog")?.close();
  await removeProject(projectId);
}

async function removeProject(projectId) {
  if (state.selectedProjectId === projectId) persistCurrentProjectWorkspace();
  state.projects = state.projects.filter((project) => project.id !== projectId);
  await deleteProjectFromSupabase(projectId);
  if (state.selectedProjectId === projectId) {
    state.selectedProjectId = state.projects[0]?.id || null;
    persistProjects();
    await loadProjectWorkspace();
  } else {
    persistProjects();
  }
  renderDashboardProjects();
}

function openNewProjectDialog() {
  const form = $("#newProjectForm");
  if (form) form.reset();
  $("#projectDialogTitle").textContent = "New Project";
  $("#projectDialogCopy").textContent = "Add the athlete details for this project. Only the athlete name is required.";
  $("#projectDeleteBtn").hidden = true;
  $("#newProjectDialog")?.showModal();
  $("#projectAthleteInput")?.focus();
}

async function submitNewProject(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const athlete = String(formData.get("athlete") || "").trim();
  if (!athlete) return;

  const project = {
    id: crypto.randomUUID(),
    athlete,
    sport: String(formData.get("sport") || "").trim(),
    age: String(formData.get("age") || "").trim(),
    team: String(formData.get("team") || "").trim(),
    createdAt: new Date().toISOString()
  };

  state.projects.unshift(project);
  persistCurrentProjectWorkspace();
  persistProjects();
  await saveProjectToSupabase(project);
  state.selectedProjectId = project.id;
  persistProjects();
  await loadProjectWorkspace();
  renderDashboardProjects();
  $("#newProjectDialog")?.close();
  setView("editor");
}

function setDashboardSection(section) {
  const targetSection = section || "projects";
  document.querySelectorAll("[data-dashboard-target]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.dashboardTarget === targetSection);
    button.setAttribute("aria-pressed", String(button.dataset.dashboardTarget === targetSection));
  });
  document.querySelectorAll("[data-dashboard-section]").forEach((panel) => {
    panel.hidden = panel.dataset.dashboardSection !== targetSection;
  });
}

async function signOutDashboard() {
  persistCurrentProjectWorkspace();
  if (supabase) await supabase.auth.signOut();
  state.user = null;
  localStorage.removeItem("diamondframe.user");
  setAuthPageMode("login");
  updateAccess();
}

async function startCheckout(plan = "monthly") {
  try {
    const token = await getAccessToken();
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ plan })
    });
    const data = await response.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("Checkout is not configured");
  } catch (error) {
    alert(error.message || "Stripe Checkout is not configured yet.");
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
  if (!state.savedFrames.length) {
    alert("Save at least one frame before exporting.");
    return;
  }

  persistCurrentProjectWorkspace();
  const project = getSelectedProject();
  const athlete = project?.athlete || $("#athleteInput").value || "athlete";
  const dateLabel = new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const frameCards = state.savedFrames.map((frame, index) => `
    <article class="frame-card">
      <h2>Frame ${index + 1}: ${escapeHtml(frame.source || "Saved Frame")}</h2>
      <img src="${frame.image}" alt="Saved frame ${index + 1}" />
      <p><strong>Date:</strong> ${escapeHtml(frame.session_date || new Date(frame.created_at).toLocaleDateString())}</p>
      <p><strong>Notes:</strong> ${escapeHtml(frame.note || "No notes added.")}</p>
    </article>
  `).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(athlete)} Saved Frames</title>
  <style>
    body { margin: 0; padding: 32px; color: #17181d; font-family: Arial, sans-serif; background: #f5f6f8; }
    header, .frame-card { max-width: 960px; margin: 0 auto 24px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    header p { margin: 0; color: #5b6170; }
    .frame-card { padding: 20px; background: #fff; border: 1px solid #d9dce3; border-radius: 8px; page-break-inside: avoid; }
    .frame-card h2 { margin: 0 0 14px; font-size: 18px; }
    .frame-card img { display: block; width: 100%; height: auto; margin-bottom: 14px; border-radius: 6px; border: 1px solid #d9dce3; }
    .frame-card p { margin: 8px 0 0; line-height: 1.5; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(athlete)} Saved Frames</h1>
    <p>Exported ${escapeHtml(dateLabel)} from DiamondFrame</p>
  </header>
  ${frameCards}
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${athlete.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "saved-frames"}-saved-frames.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function setView(view) {
  const isDashboard = view === "dashboard";
  if (isDashboard) persistCurrentFrameEdit();
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

async function requireFreshLogin() {
  if (supabase) await supabase.auth.signOut();
  state.user = null;
  state.subscription = "free";
  state.projects = [];
  state.selectedProjectId = null;
  state.savedFrames = [];
  state.evaluations = [];
  state.projectNotes = [];
  localStorage.removeItem("diamondframe.user");
  localStorage.removeItem("diamondframe.selectedProjectId");
  localStorage.removeItem("diamondframe.projects");
  setAuthPageMode("login");
  setDashboardSection("projects");
  setView("dashboard");
  renderDashboardProjects();
  updateProjectChrome();
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
document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthPageMode(button.dataset.authMode));
});
$("#forgotPasswordBtn")?.addEventListener("click", () => setAuthPageMode("reset"));
$("#backToLoginBtn")?.addEventListener("click", () => setAuthPageMode("login"));
$("#authPageForm")?.addEventListener("submit", submitAuthPage);

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
    if (target === "frame") persistCurrentFrameEdit();
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
document.querySelector('[data-action="compare"]')?.addEventListener("click", () => setCompareMode());
$("#compareBtn")?.addEventListener("click", () => setCompareMode());
document.querySelectorAll("[data-video-view]").forEach((button) => {
  button.addEventListener("click", () => setVideoView(button.dataset.videoView));
});
setupPaneDropTarget($(".primary-pane"), "original");
setupPaneDropTarget($("#comparePane"), "comparison");
$("#annotateBtn")?.addEventListener("click", captureFrame);
$("#saveFrameBtn")?.addEventListener("click", saveAnnotatedFrame);
$("#panelSaveFrameBtn").addEventListener("click", saveAnnotatedFrame);
document.querySelectorAll("[data-edit-tool]").forEach((button) => {
  button.addEventListener("click", () => setEditTool(button.dataset.editTool));
});
$("#muteAudioBtn")?.addEventListener("click", toggleSelectedAudioMute);
$("#inspectorSaveFrameBtn").addEventListener("click", () => {
  saveAnnotatedFrame();
  renderAiCoachFrames();
});
$("#evaluationTabBtn").addEventListener("click", () => {
  if (state.evaluations[0]) openEvaluation(state.evaluations[0].id);
  else $("#aiResult").innerHTML = "<p>No evaluations yet. Save frames, then select Analyze.</p>";
});
$("#evaluationList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-evaluation]");
  if (!button) return;
  openEvaluation(button.dataset.openEvaluation);
});
$("#savedFrames").addEventListener("click", (event) => {
  const notesButton = event.target.closest("[data-edit-frame]");
  const card = event.target.closest("[data-frame-id]");
  if (!card) return;
  const frame = state.savedFrames.find((item) => item.id === (notesButton?.dataset.editFrame || card.dataset.frameId));
  if (!frame) return;
  if (notesButton) openSavedFrameEditor(frame);
  else loadSavedFrame(frame);
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
$("#newProjectBtn")?.addEventListener("click", openNewProjectDialog);
$("#newProjectForm")?.addEventListener("submit", submitNewProject);
$("#deleteProjectForm")?.addEventListener("submit", confirmProjectDelete);
$("#deleteProjectDialog")?.addEventListener("close", () => {
  state.pendingDeleteProjectId = null;
});
document.querySelectorAll("[data-dashboard-target]").forEach((button) => {
  button.setAttribute("aria-pressed", String(button.classList.contains("selected")));
  button.addEventListener("click", () => setDashboardSection(button.dataset.dashboardTarget));
});
$("#dashboardSideSignOutBtn")?.addEventListener("click", signOutDashboard);
$("#dashboardUploadBtn")?.addEventListener("click", () => {
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
$("#checkoutMonthlyBtn").addEventListener("click", () => startCheckout("monthly"));
$("#checkoutAnnualBtn").addEventListener("click", () => startCheckout("annual"));
$("#pricingMonthlyBtn").addEventListener("click", () => startCheckout("monthly"));
$("#pricingAnnualBtn").addEventListener("click", () => startCheckout("annual"));
$("#portalBtn").addEventListener("click", openPortal);
$("#dashboardPortalBtn").addEventListener("click", openPortal);
$("#colorInput").addEventListener("input", (event) => {
  state.color = event.target.value;
});
$("#widthInput").addEventListener("input", (event) => {
  state.width = Number(event.target.value);
});
$("#saveNoteBtn").addEventListener("click", saveProjectNote);
$("#mechanicsNoteList")?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-note]");
  if (!editButton) return;
  openMechanicsNoteEditor(editButton.dataset.editNote);
});
$("#mechanicsNoteSaveBtn")?.addEventListener("click", saveEditingMechanicsNote);
$("#mechanicsNoteDeleteBtn")?.addEventListener("click", deleteEditingMechanicsNote);
$("#savedFrameSaveBtn")?.addEventListener("click", () => persistCurrentFrameEdit());
$("#savedFrameDeleteBtn")?.addEventListener("click", deleteEditingFrame);
$("#evaluationDeleteBtn")?.addEventListener("click", deleteEditingEvaluation);
$("#evaluationExportBtn")?.addEventListener("click", exportEvaluationPdf);
$("#evaluationDialog")?.addEventListener("close", () => {
  state.editingEvaluationId = null;
});
$("#savedFrameNoteInput")?.addEventListener("input", () => persistCurrentFrameEdit());
$("#savedFrameEditDialog")?.addEventListener("close", () => persistCurrentFrameEdit());
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
    if (!result.data.session) {
      alert("Check your email to confirm the account, then log in.");
      return;
    }
    const user = result.data.session.user || result.data.user;
    await completeAuth(user, email);
    $("#authDialog").close();
    return;
  }

  await completeAuth(email);
  $("#authDialog").close();
});

setupSectionResize();
window.addEventListener("resize", () => {
  applySavedLayoutDimensions();
  resizeCanvases();
});

async function initializeApp() {
  await requireFreshLogin();
  resizeCanvases();
}

initializeApp();
