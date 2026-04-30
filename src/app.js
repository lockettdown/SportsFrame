import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const state = {
  tool: "draw",
  color: "#ff7a59",
  width: 5,
  drawing: false,
  start: null,
  currentPath: [],
  annotations: [],
  stillImage: null,
  frameRate: 24,
  frameStripRun: 0,
  currentMediaKind: null,
  analyzing: false,
  savedFrames: JSON.parse(localStorage.getItem("diamondframe.frames") || "[]"),
  user: JSON.parse(localStorage.getItem("diamondframe.user") || "null"),
  subscription: localStorage.getItem("diamondframe.subscription") || "free",
  captured: false,
  comparing: false
};

const $ = (selector) => document.querySelector(selector);
const videoA = $("#videoA");
const videoB = $("#videoB");
const captureCanvas = $("#captureCanvas");
const annotationCanvas = $("#annotationCanvas");
const captureCtx = captureCanvas.getContext("2d");
const annotationCtx = annotationCanvas.getContext("2d");
const fileA = $("#fileA");
const fileB = $("#fileB");
const frameStrip = $("#frameStrip");
const frameStripStatus = $("#frameStripStatus");

const sessionInput = $("#sessionInput");
if (sessionInput) sessionInput.valueAsDate = new Date();

function resizeCanvases() {
  const pane = $(".primary-pane").getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  for (const canvas of [captureCanvas, annotationCanvas]) {
    canvas.width = Math.max(1, Math.floor(pane.width * ratio));
    canvas.height = Math.max(1, Math.floor(pane.height * ratio));
    canvas.style.width = `${pane.width}px`;
    canvas.style.height = `${pane.height}px`;
  }
  annotationCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  captureCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (state.stillImage) {
    const rect = captureCanvas.getBoundingClientRect();
    captureCtx.clearRect(0, 0, rect.width, rect.height);
    drawContainedImage(captureCtx, state.stillImage, rect.width, rect.height);
  }
  redraw();
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
  }
  video.style.visibility = "visible";
  video.src = URL.createObjectURL(file);
  video.load();
  emptyEl.hidden = true;
  video.addEventListener("loadedmetadata", async () => {
    updateTimeline(video, video === videoA ? $("#timelineA") : $("#timelineB"));
    if (isPrimaryVideo) updateTimelineTracks(file, "video", video.duration);
    if (isPrimaryVideo) await generateFrameStrip(video);
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
  addImportedMediaItem(file);
  if (file.type.startsWith("image/") && video === videoA) {
    loadImage(file, emptyEl);
    updateTimelineTracks(file, "image", 0);
    return;
  }
  loadVideo(file, video, emptyEl);
}

function updateTimeline(video, range) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  range.value = duration ? Math.round((video.currentTime / duration) * 1000) : 0;
  $(video === videoA ? "#timeA" : "#timeB").textContent = formatTime(video.currentTime);
  if (video === videoA) updateFrameStripSelection(video.currentTime);
}

function seekVideo(video, range) {
  if (!Number.isFinite(video.duration) || video.duration === 0) return;
  seekToVideoTime(video, (Number(range.value) / 1000) * video.duration);
}

function stepFrame(direction) {
  if (!videoA.src) return;
  videoA.pause();
  seekToVideoTime(videoA, videoA.currentTime + direction / state.frameRate);
}

function seekToVideoTime(video, time) {
  if (!Number.isFinite(video.duration) || video.duration === 0) return;
  if (video === videoA) {
    state.captured = false;
    state.stillImage = null;
    videoA.style.visibility = "visible";
    const rect = captureCanvas.getBoundingClientRect();
    captureCtx.clearRect(0, 0, rect.width, rect.height);
  }
  video.currentTime = Math.max(0, Math.min(video.duration, time));
}

function clearFrameStrip(status = "Add a video to inspect frames") {
  if (!frameStrip || !frameStripStatus) return;
  state.frameStripRun += 1;
  frameStrip.innerHTML = "";
  frameStripStatus.textContent = status || "";
}

async function generateFrameStrip(video) {
  if (!frameStrip || !frameStripStatus) return;
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    clearFrameStrip("Frames unavailable");
    return;
  }

  const run = state.frameStripRun + 1;
  state.frameStripRun = run;
  frameStrip.innerHTML = "";
  frameStripStatus.textContent = "Building frame strip...";

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
    if (run !== state.frameStripRun) return;
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
    button.addEventListener("click", () => seekToVideoTime(videoA, time));
    frameStrip.append(button);
  }

  await seekAndWait(video, originalTime);
  if (!wasPaused) await video.play();
  frameStripStatus.textContent = `${frameCount} frames sampled · scroll to move one frame`;
  updateFrameStripSelection(video.currentTime);
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
  if (!frameStrip) return;
  const buttons = [...frameStrip.querySelectorAll(".frame-thumb")];
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
  const frames = state.currentMediaKind === "image" ? getStillImageSample() : getFrameStripSamples(12);
  const resultEl = $("#aiResult");
  const confidenceEl = $("#aiConfidence");

  if (!frames.length) {
    confidenceEl.textContent = "No frames";
    resultEl.innerHTML = "<p>Add a video or still image before running AI analysis.</p>";
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
        notes: $("#notesInput")?.value || "",
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

function addImportedMediaItem(file) {
  const library = $(".library-list");
  if (!library) return;
  $("#libraryEmpty")?.remove();
  document.querySelectorAll(".media-item").forEach((item) => item.classList.remove("active"));
  const item = document.createElement("button");
  item.className = "media-item active";
  item.type = "button";
  const kind = file.type.startsWith("image/") ? "Image" : "Video";
  const thumb = document.createElement("span");
  thumb.className = "media-thumb imported";
  const copy = document.createElement("span");
  copy.className = "media-copy";
  const title = document.createElement("strong");
  title.textContent = file.name;
  const meta = document.createElement("small");
  meta.textContent = `${kind} · Just added`;
  copy.append(title, meta);
  item.append(thumb, copy);
  library.prepend(item);
}

function updateTimelineTracks(file, kind, duration = 0) {
  const videoTrack = $("#videoTrack .track-clips");
  const audioTrack = $("#audioTrack .track-clips");
  if (!videoTrack || !audioTrack) return;

  videoTrack.innerHTML = "";
  audioTrack.innerHTML = "";

  const clip = document.createElement("i");
  clip.className = "clip video-clip user-clip";
  clip.textContent = file.name || (kind === "image" ? "Image" : "Video");
  clip.style.width = duration ? `${Math.min(88, Math.max(26, duration * 8))}%` : "34%";
  videoTrack.append(clip);

  if (kind === "video") {
    const waveform = document.createElement("i");
    waveform.className = "waveform user-audio";
    waveform.style.width = clip.style.width;
    audioTrack.append(waveform);
  }
}

function getPoint(event) {
  const rect = annotationCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function redraw(preview = null) {
  const rect = annotationCanvas.getBoundingClientRect();
  annotationCtx.clearRect(0, 0, rect.width, rect.height);
  [...state.annotations, preview].filter(Boolean).forEach(drawAnnotation);
}

function drawAnnotation(item) {
  annotationCtx.save();
  annotationCtx.strokeStyle = item.color;
  annotationCtx.fillStyle = item.color;
  annotationCtx.lineWidth = item.width;
  annotationCtx.lineCap = "round";
  annotationCtx.lineJoin = "round";

  if (item.type === "draw") {
    annotationCtx.beginPath();
    item.points.forEach((point, index) => {
      if (index === 0) annotationCtx.moveTo(point.x, point.y);
      else annotationCtx.lineTo(point.x, point.y);
    });
    annotationCtx.stroke();
  }

  if (item.type === "line" || item.type === "arrow") {
    annotationCtx.beginPath();
    annotationCtx.moveTo(item.start.x, item.start.y);
    annotationCtx.lineTo(item.end.x, item.end.y);
    annotationCtx.stroke();
    if (item.type === "arrow") drawArrowHead(item.start, item.end, item.color, item.width);
  }

  if (item.type === "circle") {
    const radius = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
    annotationCtx.beginPath();
    annotationCtx.arc(item.start.x, item.start.y, radius, 0, Math.PI * 2);
    annotationCtx.stroke();
  }

  if (item.type === "text") {
    annotationCtx.font = "700 18px Inter, system-ui, sans-serif";
    annotationCtx.fillText(item.text, item.start.x, item.start.y);
  }

  annotationCtx.restore();
}

function drawArrowHead(start, end, color, width) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(12, width * 4);
  annotationCtx.fillStyle = color;
  annotationCtx.beginPath();
  annotationCtx.moveTo(end.x, end.y);
  annotationCtx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  annotationCtx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  annotationCtx.closePath();
  annotationCtx.fill();
}

function saveAnnotatedFrame() {
  if (!state.captured) captureFrame();
  if (!state.captured) return;
  const output = document.createElement("canvas");
  output.width = captureCanvas.width;
  output.height = captureCanvas.height;
  const ctx = output.getContext("2d");
  ctx.drawImage(captureCanvas, 0, 0);
  ctx.drawImage(annotationCanvas, 0, 0);
  const frame = {
    id: crypto.randomUUID(),
    user_id: state.user?.id || "demo-user",
    athlete: $("#athleteInput").value,
    session_date: $("#sessionInput").value,
    note: $("#notesInput").value,
    created_at: new Date().toISOString(),
    image: output.toDataURL("image/png"),
    annotations: state.annotations
  };
  state.savedFrames.unshift(frame);
  localStorage.setItem("diamondframe.frames", JSON.stringify(state.savedFrames));
  renderSavedFrames();
}

function renderSavedFrames() {
  $("#frameCount").textContent = state.savedFrames.length;
  const libraryFrameCount = $("#libraryFrameCount");
  if (libraryFrameCount) libraryFrameCount.textContent = state.savedFrames.length;
  $("#savedFrames").innerHTML = state.savedFrames.map((frame) => `
    <article class="saved-frame">
      <img src="${frame.image}" alt="Saved annotated frame for athlete ${frame.athlete || "Athlete"}" />
      <div>
        <strong>${frame.athlete || "Athlete"}</strong>
        <span>${frame.session_date || "No date"} · ${new Date(frame.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </article>
  `).join("");
}

function setCompareMode(force = !state.comparing) {
  state.comparing = force;
  $("#videoLayout").classList.toggle("comparing", state.comparing);
  $("#app").classList.toggle("comparing-shell", state.comparing);
  $("#compareBtn").classList.toggle("active", state.comparing);
  document.querySelector('[data-action="compare"]').classList.toggle("active", state.comparing);
  if (state.comparing && !videoB.src) fileB.click();
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

annotationCanvas.addEventListener("pointerdown", (event) => {
  if (!state.captured) captureFrame();
  state.drawing = true;
  state.start = getPoint(event);
  state.currentPath = [state.start];
  annotationCanvas.setPointerCapture(event.pointerId);
});

annotationCanvas.addEventListener("pointermove", (event) => {
  if (!state.drawing) return;
  const point = getPoint(event);
  if (state.tool === "draw") {
    state.currentPath.push(point);
    redraw({ type: "draw", points: state.currentPath, color: state.color, width: state.width });
  } else {
    redraw({ type: state.tool, start: state.start, end: point, color: state.color, width: state.width, text: "Coach note" });
  }
});

annotationCanvas.addEventListener("pointerup", (event) => {
  if (!state.drawing) return;
  const point = getPoint(event);
  state.drawing = false;
  if (state.tool === "text") {
    const text = prompt("Text note", "Hold posture through contact");
    if (text) state.annotations.push({ type: "text", start: point, text, color: state.color, width: state.width });
  } else if (state.tool === "draw") {
    state.annotations.push({ type: "draw", points: state.currentPath, color: state.color, width: state.width });
  } else {
    state.annotations.push({ type: state.tool, start: state.start, end: point, color: state.color, width: state.width });
  }
  redraw();
});

fileA.addEventListener("change", () => loadMedia(fileA.files[0], videoA, $("#emptyA")));
fileB.addEventListener("change", () => loadVideo(fileB.files[0], videoB, $("#emptyB")));
$("#uploadBtn").addEventListener("click", () => fileA.click());
$("#addMediaBtn").addEventListener("click", () => fileA.click());
$("#emptyB").addEventListener("click", () => fileB.click());
document.querySelector('[data-action="upload"]').addEventListener("click", () => fileA.click());
document.querySelector('[data-action="compare"]').addEventListener("click", () => setCompareMode());
$("#compareBtn").addEventListener("click", () => setCompareMode());
$("#annotateBtn").addEventListener("click", captureFrame);
$("#saveFrameBtn").addEventListener("click", saveAnnotatedFrame);
$("#exportBtn").addEventListener("click", exportReport);
$("#playBtn").addEventListener("click", () => {
  if (!videoA.src) return;
  if (videoA.paused) {
    videoA.play();
    if ($("#syncToggle").checked && videoB.src) videoB.play();
    $("#playBtn").textContent = "Pause";
  } else {
    videoA.pause();
    videoB.pause();
    $("#playBtn").textContent = "Play";
  }
});
$("#backFrameBtn").addEventListener("click", () => stepFrame(-1));
$("#nextFrameBtn").addEventListener("click", () => stepFrame(1));
$("#timelineA").addEventListener("input", () => seekVideo(videoA, $("#timelineA")));
$("#timelineB").addEventListener("input", () => seekVideo(videoB, $("#timelineB")));
if (frameStrip) {
  frameStrip.addEventListener("wheel", (event) => {
    if (!videoA.src) return;
    event.preventDefault();
    stepFrame(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
  }, { passive: false });
  frameStrip.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepFrame(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepFrame(1);
    }
  });
}
videoA.addEventListener("timeupdate", () => updateTimeline(videoA, $("#timelineA")));
videoB.addEventListener("timeupdate", () => updateTimeline(videoB, $("#timelineB")));
videoA.addEventListener("play", () => {
  if ($("#syncToggle").checked && videoB.src && videoB.paused) videoB.play();
});
videoA.addEventListener("pause", () => {
  if ($("#syncToggle").checked && videoB.src && !videoB.paused) videoB.pause();
});
$("#undoBtn").addEventListener("click", () => {
  state.annotations.pop();
  redraw();
});
$("#clearBtn").addEventListener("click", () => {
  state.annotations = [];
  redraw();
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

window.addEventListener("resize", resizeCanvases);
resizeCanvases();
renderSavedFrames();
updateAccess();
loadSupabaseSession();
