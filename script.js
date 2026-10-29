
/* ==========================================
   OUR CLASS MEMORIES
   Gallery + Uploads + Admin + Timeline
   Search + Filters + Favourites
   Captions + Reactions + Comments + Reports
========================================== */

const SUPABASE_URL = "https://zfkxixbrmkxcqlibghwz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qlK3wvL797G1NbfHwyNvrg_Yhtbt4Yo";
const BUCKET = "class-photos";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const REACTION_EMOJIS = [
  "❤️", "😍", "🥰", "😘", "💖", "💕", "💗", "💓",
  "💞", "💘", "💝", "💜", "💙", "💚", "💛", "🧡",
  "🤍", "🖤", "✨", "🌸", "🌷", "🌹", "⭐", "🌟",
  "🔥", "😂", "🤣", "😭", "🥹", "😊", "🥳", "🤩",
  "😎", "😮", "🥺", "👏", "🙌", "💯", "🫶", "👍",
  "🎉", "🏆", "🤗", "💫"
];

let supabaseClient = null;
let isAdmin = false;
let allPhotos = [];
let lastFocusedElement = null;
let currentPhoto = null;
let loadingGallery = false;

const $ = (id) => document.getElementById(id);

/* ---------- HELPERS ---------- */

function setStatus(id, message, type = "") {
  const el = $(id);
  if (!el) return;

  el.textContent = message;
  el.className = "status" + (type ? " " + type : "");
}

function makeId() {
  try {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch {}

  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function getClientId() {
  try {
    let id = localStorage.getItem("classMemoriesClientId");

    if (!id) {
      id = makeId();
      localStorage.setItem("classMemoriesClientId", id);
    }

    return id;
  } catch {
    return "visitor-" + makeId();
  }
}

function getFavorites() {
  try {
    const value = JSON.parse(
      localStorage.getItem("classMemoriesFavorites") || "[]"
    );

    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function isFavorite(id) {
  return getFavorites().includes(String(id));
}

function toggleFavorite(id) {
  let favorites = getFavorites();

  favorites = favorites.includes(String(id))
    ? favorites.filter((item) => item !== String(id))
    : [...favorites, String(id)];

  try {
    localStorage.setItem(
      "classMemoriesFavorites",
      JSON.stringify(favorites)
    );
  } catch {}

  renderGallery();
}

function formatDate(value) {
  if (!value) return "Date unknown";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unknown"
    : date.toLocaleDateString();
}

function getPhotoUrl(path) {
  if (!supabaseClient || !path) return "";

  return supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function initializeSupabase() {
  if (!window.supabase) {
    setStatus(
      "galleryStatus",
      "Supabase library could not load. Refresh the page.",
      "bad"
    );
    return;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
}

/* ---------- GALLERY ---------- */

async function loadGallery() {
  if (!supabaseClient || loadingGallery) return;

  loadingGallery = true;

  if ($("galleryLoading")) $("galleryLoading").hidden = false;

  setStatus("galleryStatus", "Loading class memories…");

  try {
    const { data, error } = await supabaseClient
      .from("photos")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    allPhotos = data || [];

    populateFilters();
    renderGallery();
    renderTimeline();

    await updateDashboard();
  } catch (error) {
    console.error("Gallery error:", error);

    setStatus(
      "galleryStatus",
      "Could not load photos: " + (error.message || "Unknown error"),
      "bad"
    );
  } finally {
    loadingGallery = false;

    if ($("galleryLoading")) {
      $("galleryLoading").hidden = true;
    }
  }
}

function isVisibleToVisitor(photo) {
  return isAdmin || photo.is_hidden !== true;
}

function getFilteredPhotos() {
  const query = ($("search")?.value || "").trim().toLowerCase();
  const event = $("eventFilter")?.value || "";
  const year = $("yearFilter")?.value || "";
  const album = $("albumFilter")?.value || "";
  const favoritesOnly =
    $("favoritesOnlyBtn")?.dataset.active === "true";
  const sort = $("sortOrder")?.value || "oldest";

  let photos = allPhotos.filter(isVisibleToVisitor);

  if (query) {
    photos = photos.filter((photo) =>
      [
        photo.uploader_name,
        photo.caption,
        photo.event_type
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }

  if (event) {
    photos = photos.filter(
      (photo) =>
        (photo.event_type || "Other").toLowerCase() === event.toLowerCase()
    );
  }

  if (year) {
    photos = photos.filter(
      (photo) =>
        photo.created_at &&
        String(new Date(photo.created_at).getFullYear()) === year
    );
  }

  if (album) {
    photos = photos.filter(
      (photo) =>
        (photo.uploader_name || "").toLowerCase() === album.toLowerCase()
    );
  }

  if (favoritesOnly) {
    photos = photos.filter((photo) => isFavorite(photo.id));
  }

  photos.sort((a, b) => {
    const first = new Date(a.created_at || 0).getTime();
    const second = new Date(b.created_at || 0).getTime();

    return sort === "newest" ? second - first : first - second;
  });

  return photos;
}

function populateFilters() {
  const eventSelect = $("eventFilter");
  const yearSelect = $("yearFilter");
  const albumSelect = $("albumFilter");

  const previousEvent = eventSelect?.value || "";
  const previousYear = yearSelect?.value || "";
  const previousAlbum = albumSelect?.value || "";

  function fill(select, label, values) {
    if (!select) return;

    select.replaceChildren(new Option(label, ""));
    values.forEach((value) => select.add(new Option(value, value)));
  }

  const events = [...new Set(
    allPhotos.map((photo) => photo.event_type || "Other")
  )].sort();

  const years = [...new Set(
    allPhotos
      .filter((photo) => photo.created_at)
      .map((photo) =>
        String(new Date(photo.created_at).getFullYear())
      )
  )].sort((a, b) => Number(b) - Number(a));

  const albums = [...new Set(
    allPhotos
      .map((photo) => (photo.uploader_name || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  fill(eventSelect, "All events", events);
  fill(yearSelect, "All years", years);
  fill(albumSelect, "Everyone", albums);

  if (eventSelect && events.includes(previousEvent)) {
    eventSelect.value = previousEvent;
  }

  if (yearSelect && years.includes(previousYear)) {
    yearSelect.value = previousYear;
  }

  if (albumSelect && albums.includes(previousAlbum)) {
    albumSelect.value = previousAlbum;
  }
}

function clearFilters() {
  ["search", "eventFilter", "yearFilter", "albumFilter"].forEach((id) => {
    if ($(id)) $(id).value = "";
  });

  if ($("favoritesOnlyBtn")) {
    $("favoritesOnlyBtn").dataset.active = "false";
    $("favoritesOnlyBtn").setAttribute("aria-pressed", "false");
  }

  renderGallery();
}

function renderGallery() {
  const gallery = $("gallery");
  const empty = $("empty");

  if (!gallery) return;

  const photos = getFilteredPhotos();

  gallery.replaceChildren();

  if (empty) {
    empty.hidden = photos.length > 0;

    empty.textContent = allPhotos.length
      ? "No photos match these filters."
      : "Your class memories will appear here. Be the first to add one! ✨";
  }

  const groups = new Map();

  photos.forEach((photo) => {
    const name = (photo.uploader_name || "Unknown student").trim();
    const key = name.toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, { name, photos: [] });
    }

    groups.get(key).photos.push(photo);
  });

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "person-group";

    const heading = document.createElement("div");
    heading.className = "person-heading";

    const title = document.createElement("span");
    title.textContent = group.name;

    const count = document.createElement("span");
    count.className = "person-count";
    count.textContent =
      `${group.photos.length} photo${group.photos.length === 1 ? "" : "s"}`;

    heading.append(title, count);

    const grid = document.createElement("div");
    grid.className = "person-photos";

    group.photos.forEach((photo) => {
      grid.appendChild(createPhotoCard(photo));
    });

    section.append(heading, grid);
    gallery.appendChild(section);
  });

  setStatus("galleryStatus", `${photos.length} photo(s) shown.`);
}

/* ---------- PHOTO CARD ---------- */

function createPhotoCard(photo) {
  const card = document.createElement("article");
  card.className = "photo";

  const name = photo.uploader_name || "Unknown student";
  const url = getPhotoUrl(photo.file_path);

  const nameEl = document.createElement("div");
  nameEl.className = "photo-name";
  nameEl.textContent = name;

  const img = document.createElement("img");
  img.src = url;
  img.alt = photo.caption || `Photo shared by ${name}`;
  img.loading = "lazy";
  img.addEventListener("click", () => openLightbox(photo));

  const body = document.createElement("div");
  body.className = "photo-body";

  const date = document.createElement("div");
  date.className = "photo-date";
  date.textContent = formatDate(photo.created_at);
  body.appendChild(date);

  if (photo.caption) {
    const caption = document.createElement("p");
    caption.className = "photo-caption";
    caption.textContent = photo.caption;
    body.appendChild(caption);
  }

  if (photo.event_type && photo.event_type.toLowerCase() !== "other") {
    const event = document.createElement("div");
    event.className = "photo-meta";
    event.textContent = "📌 " + photo.event_type;
    body.appendChild(event);
  }

  const actions = document.createElement("div");
  actions.className = "photo-actions";

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className =
    "favorite-btn" + (isFavorite(photo.id) ? " active" : "");
  favorite.textContent = isFavorite(photo.id) ? "❤️ Saved" : "♡ Favourite";
  favorite.setAttribute("aria-pressed", String(isFavorite(photo.id)));
  favorite.addEventListener("click", () => toggleFavorite(photo.id));
  actions.appendChild(favorite);

  const react = document.createElement("button");
  react.type = "button";
  react.textContent = "💖 React";
  react.addEventListener("click", () => openLightbox(photo));
  actions.appendChild(react);

  const comments = document.createElement("button");
  comments.type = "button";
  comments.textContent = "💬 Comments";
  comments.addEventListener("click", () => openLightbox(photo, true));
  actions.appendChild(comments);

  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "⬇ Download";
  download.addEventListener("click", () =>
    downloadPhoto(url, photo.file_path)
  );
  actions.appendChild(download);

  const report = document.createElement("button");
  report.type = "button";
  report.textContent = "⚑ Report";
  report.addEventListener("click", () => reportPhoto(photo));
  actions.appendChild(report);

  if (isAdmin) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "🗑 Delete";
    remove.addEventListener("click", () => deletePhoto(photo));
    actions.appendChild(remove);
  }

  body.appendChild(actions);
  card.append(nameEl, img, body);

  return card;
}

/* ---------- TIMELINE: OLDEST TO NEWEST ---------- */

function renderTimeline() {
  const list = $("timelineList");
  if (!list) return;

  list.replaceChildren();

  const photos = allPhotos
    .filter(isVisibleToVisitor)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime()
    );

  if (!photos.length) {
    list.textContent = "Your class timeline will appear here.";
    return;
  }

  let currentYear = null;

  photos.forEach((photo) => {
    const date = photo.created_at ? new Date(photo.created_at) : null;

    const year =
      date && !Number.isNaN(date.getTime())
        ? String(date.getFullYear())
        : "Date unknown";

    if (year !== currentYear) {
      currentYear = year;

      const heading = document.createElement("h3");
      heading.className = "timeline-year";
      heading.textContent = year;

      list.appendChild(heading);
    }

    const item = document.createElement("article");
    item.className = "timeline-item";

    const title = document.createElement("strong");
    title.textContent = photo.uploader_name || "Unknown student";

    const detail = document.createElement("p");
    detail.textContent =
      (photo.caption || photo.event_type || "Class memory") +
      " · " + formatDate(photo.created_at);

    const view = document.createElement("button");
    view.type = "button";
    view.textContent = "View memory";
    view.addEventListener("click", () => openLightbox(photo));

    item.append(title, detail, view);
    list.appendChild(item);
  });
}

/* ---------- LIGHTBOX ---------- */

async function openLightbox(photo, focusComments = false) {
  currentPhoto = photo;
  lastFocusedElement = document.activeElement;

  if ($("lightboxImage")) {
    $("lightboxImage").src = getPhotoUrl(photo.file_path);
    $("lightboxImage").alt =
      photo.caption || photo.uploader_name || "Class photo";
  }

  if ($("lightboxCaption")) {
    $("lightboxCaption").textContent =
      `${photo.uploader_name || "Unknown student"} · ${formatDate(photo.created_at)}` +
      (photo.caption ? ` — ${photo.caption}` : "");
  }

  if ($("lightbox")) {
    $("lightbox").classList.remove("hidden");
    $("lightbox").hidden = false;
  }

  $("lightboxClose")?.focus();

  await renderLightboxExtras(photo.id, focusComments);
}

function closeLightbox() {
  if ($("lightbox")) {
    $("lightbox").classList.add("hidden");
    $("lightbox").hidden = true;
  }

  if ($("lightboxImage")) $("lightboxImage").src = "";

  if ($("lightboxExtras")) {
    $("lightboxExtras").replaceChildren();
  }

  currentPhoto = null;

  if (lastFocusedElement?.focus) {
    lastFocusedElement.focus();
  }
}

/* ---------- EXTRA EMOJI REACTIONS + COMMENTS ---------- */
 
async function renderLightboxExtras(photoId, focusComments = false) {
  const extras = $("lightboxExtras");
  if (!extras) return;

  extras.replaceChildren();

  // Reaction heading and toggle button
  const reactionHeader = document.createElement("div");
  reactionHeader.className = "reaction-header";

  const reactionTitle = document.createElement("h3");
  reactionTitle.textContent = "💖 Reactions";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "reaction-toggle";
  toggleButton.textContent = "➕ Show reactions";
  toggleButton.setAttribute("aria-expanded", "false");

  reactionHeader.append(reactionTitle, toggleButton);
  extras.appendChild(reactionHeader);

  // Hide emoji buttons until clicked
  const reactionButtons = document.createElement("div");
  reactionButtons.className = "photo-actions reaction-picker";
  reactionButtons.hidden = true;

  REACTION_EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emoji;
    button.title = "React with " + emoji;
    button.setAttribute("aria-label", "React with " + emoji);

    button.addEventListener("click", async () => {
      button.disabled = true;

      try {
        await addReaction(photoId, emoji);
      } finally {
        button.disabled = false;
      }
    });

    reactionButtons.appendChild(button);
  });

  extras.appendChild(reactionButtons);

  // Toggle the emoji picker
  toggleButton.addEventListener("click", () => {
    const willShow = reactionButtons.hidden;

    reactionButtons.hidden = !willShow;
    toggleButton.textContent = willShow
      ? "➖ Hide reactions"
      : "➕ Show reactions";

    toggleButton.setAttribute("aria-expanded", String(willShow));
  });

  // Comments remain visible
  const panel = document.createElement("div");
  panel.className = "comments-panel";

  const title = document.createElement("h4");
  title.textContent = "💬 Comments";

  const list = document.createElement("div");
  list.className = "comment-list";
  list.textContent = "Loading comments…";

  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 40;
  name.placeholder = "Your name";
  name.autocomplete = "name";

  const text = document.createElement("textarea");
  text.maxLength = 500;
  text.rows = 2;
  text.placeholder = "Write a kind comment…";

  const submit = document.createElement("button");
  submit.type = "button";
  submit.textContent = "Post comment";

  submit.addEventListener("click", async () => {
    submit.disabled = true;
    submit.textContent = "Posting…";

    try {
      const ok = await postComment(
        photoId,
        name.value,
        text.value
      );

      if (ok) {
        text.value = "";
        await loadComments(photoId, list);
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Post comment";
    }
  });

  panel.append(title, list, name, text, submit);
  extras.appendChild(panel);

  await loadComments(photoId, list);

  if (focusComments) {
    text.focus();
  }

/* ---------- LOAD COMMENTS ---------- */

async function loadComments(photoId, target) {
  if (!supabaseClient || !target) return;

  target.textContent = "Loading comments…";

  try {
    const { data, error } = await supabaseClient
      .from("photo_comments")
      .select("commenter_name, comment_text, created_at")
      .eq("photo_id", photoId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    target.replaceChildren();

    if (!data?.length) {
      target.textContent = "No comments yet. Be the first to comment!";
      return;
    }

    data.forEach((comment) => {
      const row = document.createElement("div");
      row.className = "comment-item";

      const author = document.createElement("strong");
      author.className = "comment-author";
      author.textContent = comment.commenter_name || "Anonymous";

      const content = document.createElement("p");
      content.textContent = comment.comment_text || "";

      const date = document.createElement("small");
      date.textContent = formatDate(comment.created_at);

      row.append(author, content, date);
      target.appendChild(row);
    });
  } catch (error) {
    console.error("Comments error:", error);

    target.textContent =
      "Comments could not load. Check photo_comments and its RLS policies.";
  }
}

/* ---------- POST COMMENT ---------- */

async function postComment(photoId, name, text) {
  name = (name || "").trim().slice(0, 40);
  text = (text || "").trim().slice(0, 500);

  if (!name || !text) {
    alert("Enter your name and comment first.");
    return false;
  }

  if (!supabaseClient) {
    alert("Database is not connected. Refresh the page.");
    return false;
  }

  try {
    const { error } = await supabaseClient
      .from("photo_comments")
      .insert({
        photo_id: photoId,
        commenter_name: name,
        comment_text: text,
        client_id: getClientId()
      });

    if (error) throw error;

    return true;
  } catch (error) {
    console.error("Post comment error:", error);
    alert("Comment failed: " + error.message);
    return false;
  }
}

/* ---------- SAVE REACTION ---------- */

async function addReaction(photoId, emoji) {
  if (!supabaseClient) return false;

  if (!REACTION_EMOJIS.includes(emoji)) {
    alert("This reaction is not supported.");
    return false;
  }

  try {
    const { error } = await supabaseClient
      .from("photo_reactions")
      .insert({
        photo_id: photoId,
        emoji,
        client_id: getClientId()
      });

    if (error) throw error;

    setStatus(
      "galleryStatus",
      "Reaction added! " + emoji,
      "good"
    );

    return true;
  } catch (error) {
    console.error("Reaction error:", error);

    alert(
      "Reaction could not be saved. Your database may restrict allowed emojis. " +
      error.message
    );

    return false;
  }
}

/* ---------- REPORT PHOTO ---------- */

async function reportPhoto(photo) {
  if (!supabaseClient) return;

  const reason = prompt("Why are you reporting this photo?");
  if (!reason?.trim()) return;

  try {
    const { error } = await supabaseClient
      .from("photo_reports")
      .insert({
        photo_id: photo.id,
        reason: reason.trim().slice(0, 300),
        reporter_client_id: getClientId()
      });

    if (error) throw error;

    alert("Report submitted. Thank you.");

    await updateDashboard();
  } catch (error) {
    console.error("Report error:", error);
    alert("Report failed: " + error.message);
  }
}

/* ---------- DOWNLOAD ---------- */

async function downloadPhoto(url, path) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download =
      (path || "class-memory.jpg").split("/").pop();

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  } catch (error) {
    console.error("Download error:", error);

    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* ---------- UPLOAD ---------- */

function setUploadProgress(percent, message) {
  const bar = $("uploadProgressBar");
  const text = $("uploadProgressText");
  const progress = $("uploadProgress");

  if (progress) {
    progress.hidden = false;
    progress.setAttribute("aria-valuenow", String(percent));
  }

  if (bar) bar.style.width = `${percent}%`;

  if (text) {
    text.textContent = message || `${percent}%`;
  }
}

async function uploadPhoto() {
  if (!supabaseClient) {
    setStatus(
      "uploadStatus",
      "Database is not connected. Refresh the page.",
      "bad"
    );
    return;
  }

  const name = ($("uploader")?.value || "").trim().slice(0, 40);
  const file = $("photoFile")?.files?.[0];
  const caption = ($("photoCaptionInput")?.value || "").trim().slice(0, 250);
  const eventType = $("eventType")?.value || "Other";

  if (!name) {
    setStatus("uploadStatus", "Please enter your name.", "bad");
    return;
  }

  if (!file) {
    setStatus("uploadStatus", "Choose a photo first.", "bad");
    return;
  }

  const types = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  if (!types[file.type]) {
    setStatus("uploadStatus", "Use JPG, PNG, WEBP or GIF.", "bad");
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    setStatus("uploadStatus", "Photo must be 5 MB or smaller.", "bad");
    return;
  }

  const button = $("uploadBtn");
  if (button) button.disabled = true;

  const path = makeId() + "." + types[file.type];
  let storageUploaded = false;

  try {
    setUploadProgress(5, "Preparing photo…");

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    storageUploaded = true;

    setUploadProgress(70, "Saving photo details…");

    const { error: insertError } = await supabaseClient
      .from("photos")
      .insert({
        uploader_name: name,
        file_path: path,
        caption,
        event_type: eventType
      });

    if (insertError) throw insertError;

    setUploadProgress(100, "Upload complete!");

    setStatus(
      "uploadStatus",
      "Photo uploaded successfully! 💜",
      "good"
    );

    if ($("photoFile")) $("photoFile").value = "";
    if ($("photoCaptionInput")) $("photoCaptionInput").value = "";

    await loadGallery();

    setTimeout(() => {
      if ($("uploadProgress")) {
        $("uploadProgress").hidden = true;
      }
    }, 1600);
  } catch (error) {
    console.error("Upload error:", error);

    if (storageUploaded) {
      try {
        await supabaseClient.storage.from(BUCKET).remove([path]);
      } catch (cleanupError) {
        console.error("Storage cleanup error:", cleanupError);
      }
    }

    setStatus(
      "uploadStatus",
      "Upload failed: " + (error.message || "Unknown error"),
      "bad"
    );

    setUploadProgress(0, "Upload failed. Please try again.");
  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- ADMIN AUTH ---------- */

async function refreshAdminState() {
  if (!supabaseClient) return;

  try {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    const session = sessionData?.session || null;
    isAdmin = false;

    if (session?.user) {
      const { data, error } = await supabaseClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      isAdmin = !error && data?.user_id === session.user.id;
    }

    if ($("adminLoginFields")) {
      $("adminLoginFields").hidden = Boolean(session);
    }

    if ($("adminLoginBtn")) {
      $("adminLoginBtn").hidden = Boolean(session);
    }

    if ($("adminLogoutBtn")) {
      $("adminLogoutBtn").hidden = !session;
      $("adminLogoutBtn").classList.toggle("hidden", !session);
      $("adminLogoutBtn").textContent = "🚪 Logout";
    }

    if (!session) {
      setStatus("adminStatus", "You are logged out.");
    } else if (isAdmin) {
      setStatus(
        "adminStatus",
        "Admin logged in successfully! ✅🔐",
        "good"
      );
    } else {
      setStatus(
        "adminStatus",
        "Signed in, but this account is not listed as an admin.",
        "bad"
      );
    }
  } catch (error) {
    console.error("Admin session error:", error);
  }

  await loadGallery();
}

async function adminLogin() {
  const email = ($("adminEmail")?.value || "").trim();
  const password = $("adminPassword")?.value || "";

  if (!email || !password) {
    setStatus("adminStatus", "Enter your email and password.", "bad");
    return;
  }

  const button = $("adminLoginBtn");
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if ($("adminPassword")) $("adminPassword").value = "";

    await refreshAdminState();
  } catch (error) {
    setStatus("adminStatus", "Login failed: " + error.message, "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

async function adminLogout() {
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    isAdmin = false;

    await refreshAdminState();

    setStatus("adminStatus", "Logged out successfully! 👋", "good");
  } catch (error) {
    setStatus("adminStatus", "Logout failed: " + error.message, "bad");
  }
}

/* ---------- ADMIN DELETE ---------- */

async function deletePhoto(photo) {
  if (!isAdmin) {
    alert("Admin access required.");
    return;
  }

  if (!confirm("Permanently delete this photo?")) return;

  try {
    const { error: storageError } = await supabaseClient.storage
      .from(BUCKET)
      .remove([photo.file_path]);

    if (storageError) throw storageError;

    const { error: rowError } = await supabaseClient
      .from("photos")
      .delete()
      .eq("id", photo.id);

    if (rowError) {
      alert(
        "Image removed, but the database record could not be deleted: " +
        rowError.message
      );
      return;
    }

    await loadGallery();
  } catch (error) {
    alert("Could not delete photo: " + error.message);
  }
}

/* ---------- ADMIN DASHBOARD ---------- */

async function updateDashboard() {
  if ($("adminDashboard")) {
    $("adminDashboard").hidden = !isAdmin;
    $("adminDashboard").classList.toggle("hidden", !isAdmin);
  }

  if (!isAdmin || !supabaseClient) return;

  if ($("dashboardPhotoCount")) {
    $("dashboardPhotoCount").textContent = String(allPhotos.length);
  }

  if ($("dashboardStudentCount")) {
    $("dashboardStudentCount").textContent = String(
      new Set(
        allPhotos
          .map((photo) =>
            (photo.uploader_name || "").trim().toLowerCase()
          )
          .filter(Boolean)
      ).size
    );
  }

  try {
    const { data, error } = await supabaseClient
      .from("photo_reports")
      .select("id, photo_id, reason, created_at, resolved")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const reports = data || [];
    const pending = reports.filter((report) => !report.resolved);

    if ($("dashboardReportCount")) {
      $("dashboardReportCount").textContent = String(reports.length);
    }

    if ($("dashboardPendingCount")) {
      $("dashboardPendingCount").textContent = String(pending.length);
    }

    const list = $("reportsList");
    if (!list) return;

    list.replaceChildren();

    if (!reports.length) {
      list.textContent = "No reports yet.";

      setStatus(
        "dashboardStatus",
        "Admin dashboard updated.",
        "good"
      );
      return;
    }

    reports.forEach((report) => {
      const row = document.createElement("div");
      row.className = "report-item";

      const reason = document.createElement("p");
      reason.textContent =
        `Photo ID: ${report.photo_id} — ${report.reason}`;

      const date = document.createElement("small");
      date.textContent = formatDate(report.created_at);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = report.resolved ? "Resolved" : "Mark resolved";
      button.disabled = Boolean(report.resolved);

      button.addEventListener("click", async () => {
        button.disabled = true;

        const { error: updateError } = await supabaseClient
          .from("photo_reports")
          .update({ resolved: true })
          .eq("id", report.id);

        if (updateError) {
          button.disabled = false;

          alert("Could not update report: " + updateError.message);
        } else {
          await updateDashboard();
        }
      });

      row.append(reason, date, button);
      list.appendChild(row);
    });

    setStatus(
      "dashboardStatus",
      "Admin dashboard updated.",
      "good"
    );
  } catch (error) {
    console.error("Dashboard error:", error);

    setStatus(
      "dashboardStatus",
      "Could not load reports: " + error.message,
      "bad"
    );
  }
}

/* ---------- THEME ---------- */

function setupTheme() {
  const themeButton = $("themeToggle");

  function setTheme(light) {
    document.body.classList.toggle("light-theme", light);

    if (themeButton) {
      themeButton.textContent =
        light ? "🌙 Dark mode" : "🌸 Sakura mode";
    }

    try {
      localStorage.setItem(
        "classMemoriesTheme",
        light ? "light" : "dark"
      );
    } catch {}
  }

  let savedTheme = "dark";

  try {
    savedTheme =
      localStorage.getItem("classMemoriesTheme") || "dark";
  } catch {}

  setTheme(savedTheme === "light");

  themeButton?.addEventListener("click", () => {
    setTheme(!document.body.classList.contains("light-theme"));
  });
}

/* ---------- TIMELINE TOGGLE ---------- */

function setupTimeline() {
  const timelineButton = $("timelineBtn");
  const panel = $("timelinePanel");

  if (!timelineButton || !panel) return;

  timelineButton.addEventListener("click", () => {
    const willShow =
      panel.hidden || panel.classList.contains("hidden");

    panel.hidden = !willShow;
    panel.classList.toggle("hidden", !willShow);

    if (willShow) {
      renderTimeline();

      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      timelineButton.textContent = "✕ Hide timeline";
    } else {
      timelineButton.textContent = "🕰️ Timeline";
    }
  });
}

/* ---------- EVENTS ---------- */

function bindEvents() {
  $("uploadBtn")?.addEventListener("click", uploadPhoto);
  $("refreshBtn")?.addEventListener("click", loadGallery);

  $("search")?.addEventListener("input", renderGallery);
  $("eventFilter")?.addEventListener("change", renderGallery);
  $("yearFilter")?.addEventListener("change", renderGallery);
  $("albumFilter")?.addEventListener("change", renderGallery);
  $("sortOrder")?.addEventListener("change", renderGallery);

  $("clearFiltersBtn")?.addEventListener("click", clearFilters);

  $("favoritesOnlyBtn")?.addEventListener("click", () => {
    const button = $("favoritesOnlyBtn");

    button.dataset.active =
      button.dataset.active === "true" ? "false" : "true";

    button.setAttribute(
      "aria-pressed",
      String(button.dataset.active === "true")
    );

    renderGallery();
  });

  $("adminLoginBtn")?.addEventListener("click", adminLogin);
  $("adminLogoutBtn")?.addEventListener("click", adminLogout);
  $("lightboxClose")?.addEventListener("click", closeLightbox);

  $("lightbox")?.addEventListener("click", (event) => {
    if (event.target === $("lightbox")) closeLightbox();
  });

  $("backToTop")?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  setupTheme();
  setupTimeline();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentPhoto) {
      closeLightbox();
    }
  });
}

/* ---------- START ---------- */

initializeSupabase();
bindEvents();
refreshAdminState();
