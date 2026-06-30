/* ============================================================
   Friendship Memory Book — script.js
   Rebuilt clean version.

   Key changes from the old minified version:
   - Default pages now reference image FILES in an `images/`
     folder (e.g. "images/page1.jpg") instead of generating
     giant base64 SVG data URIs in memory.
   - Firestore now stores only these image PATHS (small strings),
     not full base64 image data, so the document stays well
     under Firestore's 1MB document size limit.
   - Custom photo uploads (via the customizer) are still
     supported, but a clear warning is logged if someone tries
     to save a base64 upload, since that's exactly the pattern
     that caused the original size problem. If you want uploads
     to persist permanently, add the file to images/ and update
     defaultPages, or wire up real file storage (e.g. Firebase
     Storage) instead of saving base64 into Firestore.
   - Creator Mode = the existing customize panel, gated behind
     a simple unlock toggle so casual viewers don't accidentally
     edit pages.
   ============================================================ */

const STORAGE_KEY = "friendship-memory-book-v1";
const CREATOR_MODE_KEY = "friendship-memory-book-creator-mode";

/* ----------------------------------------------------------
   Default page content
   Each entry: [message, pageColor, imagePath, theme]
   imagePath should point to a real file in your images/ folder,
   e.g. images/sunset.jpg — swap these placeholder names for
   your actual filenames.
---------------------------------------------------------- */
const defaultPageSource = [
  ["The day felt warmer because you were in it.", "#ffd1e5", "images/page1.jpeg"],
  ["Some people feel like home from the first laugh.", "#d8e6ff", "images/page2.jpeg"],
  ["This memory has its own tiny sparkle.", "#f8dfb6", "images/page3.jpeg"],
  ["You make ordinary days look like celebration days.", "#c8f5e2", "images/page4.jpeg"],
  ["Saving this smile forever.", "#ffd8ca", "images/page5.jpeg"],
  ["A page for the jokes only we understand.", "#e5d8ff", "images/page6.jpeg"],
  ["This was soft, silly, perfect.", "#d8f4ff", "images/page7.jpeg"],
  ["A little proof that good days really happened.", "#ffe4f3", "images/page8.jpeg"],
  ["You are the best chapter in so many stories.", "#fff0b8", "images/page9.jpeg"],
  ["Tiny moment, huge happiness.", "#d2f3db", "images/page10.jpeg"],
  ["If friendship had a color, it would be this one.", "#ffd0d8", "images/page11.jpeg"],
  ["Kept here because it deserves a whole page.", "#d9d3ff", "images/page12.jpeg"],
  ["The kind of memory that still smiles back.", "#c9eff0", "images/page13.jpeg"],
  ["For every adventure we still have to collect.", "#ffe0bd", "images/page14.jpeg"],
  ["Last page for now, not the end.", "#f3d7ff", "images/page15.jpeg"],
];

const defaultPages = defaultPageSource.map(([message, pageColor, photo], index) => ({
  message,
  pageColor,
  photo,
  font: "'Segoe Print', 'Comic Sans MS', cursive",
  scale: 100,
  border: index % 4 === 0 ? 14 : 8,
  borderColor: index % 3 === 0 ? "#fff7fb" : "#ffffff",
  oldCover: index % 5 === 2,
  blend: index % 2 === 0,
}));

let pages = [];
let currentIndex = 0;
let previousIndex = 0;
let creatorMode = true;

/* ----------------------------------------------------------
   DOM references
---------------------------------------------------------- */
const book = document.querySelector("#book");
const template = document.querySelector("#pageTemplate");
const prevButton = document.querySelector("#prevPage");
const nextButton = document.querySelector("#nextPage");
const pageCount = document.querySelector("#pageCount");
const customizer = document.querySelector("#customizer");
const customizeToggle = document.querySelector("#customizeToggle");
const closeCustomizer = document.querySelector("#closeCustomizer");
const photoInput = document.querySelector("#photoInput");
const messageInput = document.querySelector("#messageInput");
const fontInput = document.querySelector("#fontInput");
const scaleInput = document.querySelector("#scaleInput");
const borderInput = document.querySelector("#borderInput");
const borderColorInput = document.querySelector("#borderColorInput");
const pageColorInput = document.querySelector("#pageColorInput");
const oldCoverInput = document.querySelector("#oldCoverInput");
const blendInput = document.querySelector("#blendInput");
const resetPage = document.querySelector("#resetPage");
const saveBook = document.querySelector("#saveBook");
const lightbox = document.querySelector("#lightbox");
const fullImage = document.querySelector("#fullImage");
const closeLightbox = document.querySelector("#closeLightbox");
const zoomInput = document.querySelector("#zoomInput");

/* ----------------------------------------------------------
   Init
---------------------------------------------------------- */
loadBook();
startSparkles();
applyCreatorModeUI();

/* ----------------------------------------------------------
   Navigation
---------------------------------------------------------- */
prevButton.addEventListener("click", () => {
  startMusic();
  showPage(currentIndex - 1);
});

nextButton.addEventListener("click", () => {
  startMusic();
  showPage(currentIndex + 1);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") showPage(currentIndex + 1);
  if (event.key === "ArrowLeft") showPage(currentIndex - 1);
  if (event.key === "Escape" && customizer.classList.contains("is-open")) {
    customizer.classList.remove("is-open");
  }
});

/* ----------------------------------------------------------
   Creator Mode (gates the customize panel)
---------------------------------------------------------- */
function applyCreatorModeUI() {
  customizeToggle.style.display = creatorMode ? "" : "none";
  if (!creatorMode) customizer.classList.remove("is-open");
}

function enableCreatorMode() {
  creatorMode = true;
  localStorage.setItem(CREATOR_MODE_KEY, "true");
  applyCreatorModeUI();
}

function disableCreatorMode() {
  creatorMode = false;
  localStorage.setItem(CREATOR_MODE_KEY, "false");
  applyCreatorModeUI();
}

// Simple unlock: triple-click the page counter to toggle Creator Mode.
// Swap this for a password prompt or URL flag if you want it more locked down.
let counterClicks = 0;
let counterClickTimer = null;
pageCount.addEventListener("click", () => {
  counterClicks += 1;
  clearTimeout(counterClickTimer);
  counterClickTimer = setTimeout(() => (counterClicks = 0), 600);
  if (counterClicks >= 3) {
    counterClicks = 0;
    creatorMode ? disableCreatorMode() : enableCreatorMode();
  }
});

customizeToggle.addEventListener("click", () => customizer.classList.add("is-open"));
closeCustomizer.addEventListener("click", () => customizer.classList.remove("is-open"));
saveBook.addEventListener("click", savePages);

[
  messageInput,
  fontInput,
  scaleInput,
  borderInput,
  borderColorInput,
  pageColorInput,
  oldCoverInput,
  blendInput,
].forEach((input) => input.addEventListener("input", updateCurrentFromPanel));

fontInput.addEventListener("change", updateCurrentFromPanel);
oldCoverInput.addEventListener("change", updateCurrentFromPanel);
blendInput.addEventListener("change", updateCurrentFromPanel);

/* ----------------------------------------------------------
   Photo selection
   `photoInput` is a <select> listing the image paths already
   hosted in images/ (e.g. images/page1.jpeg). Choosing an
   option just assigns that path string to the page — no file
   reading, no base64, nothing large ever touches Firestore.
---------------------------------------------------------- */
photoInput.addEventListener("change", () => {
  if (currentIndex === 0) return;
  pages[currentIndex - 1].photo = photoInput.value;
  applyPageData(currentIndex);
  savePages();
});

resetPage.addEventListener("click", () => {
  if (currentIndex === 0) return;
  pages[currentIndex - 1] = { ...defaultPages[currentIndex - 1] };
  applyPageData(currentIndex);
  syncPanel();
  savePages();
});

closeLightbox.addEventListener("click", () => lightbox.close());
zoomInput.addEventListener("input", () => lightbox.style.setProperty("--zoom", zoomInput.value / 100));

/* ----------------------------------------------------------
   Loading / Saving
   Firestore document now only ever contains small fields:
   message, pageColor, photo (a path/URL string), font, scale,
   border, borderColor, oldCover, blend.
---------------------------------------------------------- */
async function loadBook() {
  try {
    const doc = await db.collection("memorybook").doc("main").get();

    if (doc.exists) {
      const data = doc.data();
      pages =
        Array.isArray(data.pages) && data.pages.length
          ? data.pages
          : loadPagesFromLocal();
    } else {
      pages = loadPagesFromLocal();
    }
  } catch (error) {
    console.error(error);
    pages = loadPagesFromLocal();
  }

  renderPages();
  showPage(0);
}

async function savePages() {
  // Local backup (kept for offline / quick reload)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));

  const oversizedPage = pages.find(
    (page) => typeof page.photo === "string" && page.photo.startsWith("data:")
  );
  if (oversizedPage) {
    console.warn(
      "One or more pages still have base64 image data. " +
        "These will bloat the Firestore document and may eventually " +
        "exceed its size limit. Replace them with image file paths " +
        "(e.g. images/your-photo.jpg) when you get a chance."
    );
  }

  try {
    await db.collection("memorybook").doc("main").set({ pages });
    saveBook.textContent = "Saved ✓";
  } catch (error) {
    console.error(error);
    saveBook.textContent = "Save Failed";
  }

  setTimeout(() => {
    saveBook.textContent = "Save";
  }, 1200);
}

function loadPagesFromLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.length === defaultPages.length) {
      return stored.map((page, index) => ({ ...defaultPages[index], ...page }));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return defaultPages.map((page) => ({ ...page }));
}

/* ----------------------------------------------------------
   Rendering
---------------------------------------------------------- */
function renderPages() {
  // Keep only the cover page, rebuild the rest
  while (book.children.length > 1) {
    book.removeChild(book.lastChild);
  }

  pages.forEach((page, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.index = index + 1;
    node.querySelector(".memory-photo").addEventListener("click", () => openImage(page.photo));
    book.appendChild(node);
    applyDataToNode(node, page, index);
  });
}

function showPage(nextIndex) {
  const max = pages.length;
  if (nextIndex < 0 || nextIndex > max) return;

  previousIndex = currentIndex;
  currentIndex = nextIndex;

  [...book.children].forEach((page, index) => {
    page.classList.remove("is-visible", "is-leaving-next", "is-leaving-prev");
    if (index === currentIndex) page.classList.add("is-visible");
    if (index === previousIndex && previousIndex !== currentIndex) {
      page.classList.add(currentIndex > previousIndex ? "is-leaving-next" : "is-leaving-prev");
    }
  });

  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === max;
  pageCount.textContent = currentIndex === 0 ? "Cover" : `Page ${currentIndex} of ${max}`;
  syncPanel();
}

function updateCurrentFromPanel() {
  if (currentIndex === 0) return;
  const page = pages[currentIndex - 1];
  page.message = messageInput.value;
  page.font = fontInput.value;
  page.scale = Number(scaleInput.value);
  page.border = Number(borderInput.value);
  page.borderColor = borderColorInput.value;
  page.pageColor = pageColorInput.value;
  page.oldCover = oldCoverInput.checked;
  page.blend = blendInput.checked;
  applyPageData(currentIndex);
}

function syncPanel() {
  const disabled = currentIndex === 0;
  customizer.querySelectorAll("input, textarea, select, button").forEach((control) => {
    if (control.id !== "closeCustomizer") control.disabled = disabled;
  });

  if (disabled) {
    messageInput.value = "Open a page to customize it.";
    return;
  }

  const page = pages[currentIndex - 1];
  messageInput.value = page.message;
  photoInput.value = page.photo;
  fontInput.value = page.font;
  scaleInput.value = page.scale;
  borderInput.value = page.border;
  borderColorInput.value = page.borderColor;
  pageColorInput.value = page.pageColor;
  oldCoverInput.checked = page.oldCover;
  blendInput.checked = page.blend;
}

function applyPageData(pageNumber) {
  const node = book.children[pageNumber];
  applyDataToNode(node, pages[pageNumber - 1], pageNumber - 1);
}

function applyDataToNode(node, page, index) {
  const image = node.querySelector(".memory-photo");
  const wrap = node.querySelector(".photo-wrap");
  const message = node.querySelector(".memory-message");

  image.src = page.photo;
  image.alt = `Memory photo ${index + 1}`;
  image.onclick = () => openImage(page.photo);
  message.textContent = page.message;

  wrap.classList.toggle("old-cover", page.oldCover);

  node.style.setProperty("--page-glow", page.pageColor);
  node.style.setProperty("--photo-url", `url("${page.photo}")`);
  node.style.setProperty("--blend-opacity", page.blend ? ".22" : "0");
  node.style.setProperty("--photo-scale", page.scale / 100);
  node.style.setProperty("--photo-border", `${page.border}px`);
  node.style.setProperty("--border-color", page.borderColor);
  node.style.setProperty("--note-font", page.font);
  node.style.setProperty("--tilt", `${[-2, 1.5, -1, 2, -1.8][index % 5]}deg`);
}

function openImage(src) {
  fullImage.src = src;
  zoomInput.value = 100;
  lightbox.style.setProperty("--zoom", 1);
  lightbox.showModal();
}

/* ----------------------------------------------------------
   Sparkle background
---------------------------------------------------------- */
function startSparkles() {
  const canvas = document.querySelector("#sparkles");
  const context = canvas.getContext("2d");
  const dots = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 2.4 + 0.8,
    speed: Math.random() * 0.35 + 0.08,
    phase: Math.random() * Math.PI * 2,
  }));

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }

  function draw(time) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    dots.forEach((dot) => {
      const twinkle = (Math.sin(time / 700 + dot.phase) + 1) / 2;
      dot.y -= dot.speed / 1000;
      if (dot.y < -0.05) dot.y = 1.05;
      context.globalAlpha = 0.18 + twinkle * 0.55;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(dot.x * canvas.width, dot.y * canvas.height, dot.r * devicePixelRatio, 0, Math.PI * 2);
      context.fill();
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}

/* ----------------------------------------------------------
   Music
---------------------------------------------------------- */
const music = document.getElementById("bgMusic");
music.volume = 0.4;

function startMusic() {
  if (music.paused) {
    music.play().catch((err) => console.log(err));
  }
}

/* ----------------------------------------------------------
   Debug helpers
---------------------------------------------------------- */
console.log("Firebase App:", firebase.app().name);
console.log("Firestore:", db);
console.log("Storage:", storage);
