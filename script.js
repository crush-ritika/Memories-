const SUPABASE_URL = "https://zfkxixbrmkxcqlibghwz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qlK3wvL797G1NbfHwyNvrg_Yhtbt4Yo";

const BUCKET = "class-photos";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

let supabaseClient = null;
let isAdmin = false;
let lastFocusedElement = null;
let allPhotos = [];

const $ = (id) => document.getElementById(id);

function setStatus(id, message, type = "") {
const el = $(id);
if (!el) return;

el.textContent = message;
el.className = "status" + (type ? " " + type : "");
}

function initializeSupabase() {
if (!window.supabase) {
setStatus("galleryStatus", "Supabase library could not load.", "bad");
return;
}

supabaseClient = window.supabase.createClient(
SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY
);
}

// LOAD PHOTOS — OLDEST FIRST
async function loadGallery() {
if (!supabaseClient) return;

setStatus("galleryStatus", "Loading memories…");

const { data, error } = await supabaseClient
.from("photos")
.select("id, uploader_name, file_path, created_at")
.order("created_at", { ascending: true })
.limit(200);

if (error) {
setStatus("galleryStatus", "Could not load photos: " + error.message, "bad");
return;
}

allPhotos = data || [];
renderGallery();
}

// DISPLAY PHOTOS — GROUPED BY PERSON
function renderGallery() {
const gallery = $("gallery");
if (!gallery) return;

const searchInput = $("search");
const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

const photos = allPhotos.filter((photo) =>
String(photo.uploader_name || "Unknown")
.trim()
.toLowerCase()
.includes(query)
);

gallery.replaceChildren();

const empty = $("empty");

if (empty) {
empty.classList.toggle("hidden", photos.length > 0);

empty.textContent = allPhotos.length > 0 && photos.length === 0
  ? "No photos match that name."
  : "Your class memories will appear here. Be the first to add one! ✨";

}

// Group names without creating duplicate sections.
// Photos inside each group stay oldest first.
const groups = new Map();

photos.forEach((photo) => {
const displayName = String(photo.uploader_name || "Unknown").trim();
const groupKey = displayName.toLowerCase();

if (!groups.has(groupKey)) {
  groups.set(groupKey, {
    name: displayName,
    photos: []
  });
}

groups.get(groupKey).photos.push(photo);

});

groups.forEach((group) => {
const section = document.createElement("section");
section.className = "person-group";

const heading = document.createElement("h2");
heading.className = "person-heading";

const personName = document.createElement("span");
personName.textContent = group.name;

const count = document.createElement("span");
count.className = "person-count";
count.textContent =
  group.photos.length + (group.photos.length === 1 ? " photo" : " photos");

heading.append(personName, count);

const photoGrid = document.createElement("div");
photoGrid.className = "person-photos";

group.photos.forEach((photo) => {
  const { data } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(photo.file_path);

  const card = document.createElement("article");
  card.className = "photo";

  // Name displayed ABOVE every photo.
  const name = document.createElement("div");
  name.className = "photo-name";
  name.textContent = group.name;

  const img = document.createElement("img");
  img.src = data.publicUrl;
  img.alt = "Photo shared by " + group.name;
  img.loading = "lazy";
  img.addEventListener("click", () =>
    openLightbox(data.publicUrl, group.name, photo.created_at)
  );

  const body = document.createElement("div");
  body.className = "photo-body";

  const date = document.createElement("div");
  date.className = "photo-date";
  date.textContent = photo.created_at
    ? new Date(photo.created_at).toLocaleDateString()
    : "";

  const actions = document.createElement("div");
  actions.className = "photo-actions";

  const download = document.createElement("button");
  download.textContent = "⬇ Download";
  download.addEventListener("click", () =>
    downloadPhoto(data.publicUrl, photo.file_path)
  );
  actions.append(download);

  if (isAdmin) {
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "🗑 Delete";
    del.addEventListener("click", () => deletePhoto(photo));
    actions.append(del);
  }

  body.append(date, actions);
  card.append(name, img, body);
  photoGrid.append(card);
});

section.append(heading, photoGrid);
gallery.append(section);

});

setStatus("galleryStatus", photos.length + " photo(s) shown.");
}

// FULLSCREEN PHOTO
function openLightbox(url, name, createdAt) {
lastFocusedElement = document.activeElement;

$("lightboxImage").src = url;
$("lightboxCaption").textContent =
name + (createdAt ? " · " + new Date(createdAt).toLocaleDateString() : "");

$("lightbox").classList.remove("hidden");
$("lightboxClose").focus();
}

function closeLightbox() {
$("lightbox").classList.add("hidden");
$("lightboxImage").src = "";

if (lastFocusedElement) lastFocusedElement.focus();
}

// DOWNLOAD
async function downloadPhoto(url, path) {
try {
const response = await fetch(url);
if (!response.ok) throw new Error("Download failed");

const blob = await response.blob();
const objectUrl = URL.createObjectURL(blob);

const link = document.createElement("a");
link.href = objectUrl;
link.download = path.split("/").pop() || "class-memory.jpg";
document.body.append(link);
link.click();
link.remove();

setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

} catch {
window.open(url, "_blank", "noopener");
}
}

// UPLOAD PHOTO
async function uploadPhoto() {
const name = $("uploader").value.trim();
const file = $("photoFile").files[0];
const button = $("uploadBtn");

if (!supabaseClient) {
setStatus("uploadStatus", "Supabase is not connected.", "bad");
return;
}

if (!name) {
setStatus("uploadStatus", "Please enter your name.", "bad");
return;
}

if (!file) {
setStatus("uploadStatus", "Choose a photo first.", "bad");
return;
}

const extensions = {
"image/jpeg": "jpg",
"image/png": "png",
"image/webp": "webp",
"image/gif": "gif"
};

if (!extensions[file.type]) {
setStatus("uploadStatus", "Choose a JPG, PNG, WEBP, or GIF image.", "bad");
return;
}

if (file.size > MAX_FILE_BYTES) {
setStatus("uploadStatus", "Photo must be 5 MB or smaller.", "bad");
return;
}

button.disabled = true;
setStatus("uploadStatus", "Uploading your memory…");

const path = crypto.randomUUID() + "." + extensions[file.type];

try {
const { error: uploadError } = await supabaseClient.storage
.from(BUCKET)
.upload(path, file, {
contentType: file.type,
upsert: false
});

if (uploadError) throw uploadError;

const { error: insertError } = await supabaseClient
  .from("photos")
  .insert({
    uploader_name: name.slice(0, 40),
    file_path: path
  });

if (insertError) {
  await supabaseClient.storage.from(BUCKET).remove([path]);
  throw insertError;
}

$("photoFile").value = "";
setStatus("uploadStatus", "Photo uploaded successfully! 💜", "good");
await loadGallery();

} catch (error) {
setStatus("uploadStatus", "Upload failed: " + error.message, "bad");
} finally {
button.disabled = false;
}
}

// CHECK ADMIN ACCESS
async function refreshAdminState() {
if (!supabaseClient) return;

const { data: { session } } = await supabaseClient.auth.getSession();

isAdmin = false;

if (session?.user) {
const { data, error } = await supabaseClient
.from("admin_users")
.select("user_id")
.eq("user_id", session.user.id)
.maybeSingle();

isAdmin = !error && data?.user_id === session.user.id;

}

$("adminLoginFields").classList.toggle("hidden", !!session);
$("adminLoginBtn").classList.toggle("hidden", !!session);
$("adminLogoutBtn").classList.toggle("hidden", !session);

setStatus(
"adminStatus",
!session
? "Not signed in as admin."
: isAdmin
? "Admin signed in. 🔐"
: "This account is not listed as an admin.",
isAdmin ? "good" : session ? "bad" : ""
);

await loadGallery();
}

// ADMIN LOGIN
async function adminLogin() {
const email = $("adminEmail").value.trim();
const password = $("adminPassword").value;

if (!email || !password) {
setStatus("adminStatus", "Enter your email and password.", "bad");
return;
}

const { error } = await supabaseClient.auth.signInWithPassword({
email,
password
});

if (error) {
setStatus("adminStatus", "Sign-in failed: " + error.message, "bad");
return;
}

$("adminPassword").value = "";
await refreshAdminState();
}

// ADMIN LOGOUT
async function adminLogout() {
const { error } = await supabaseClient.auth.signOut();

if (error) {
setStatus("adminStatus", "Sign-out failed: " + error.message, "bad");
return;
}

await refreshAdminState();
}

// DELETE PHOTO — ADMIN ONLY
async function deletePhoto(photo) {
if (!isAdmin) {
alert("Admin sign-in required.");
return;
}

if (!confirm("Permanently delete this photo? This cannot be undone.")) return;

const { error: storageError } = await supabaseClient.storage
.from(BUCKET)
.remove([photo.file_path]);

if (storageError) {
alert("Could not delete image: " + storageError.message);
return;
}

const { error: rowError } = await supabaseClient
.from("photos")
.delete()
.eq("id", photo.id);

if (rowError) {
alert("Image removed, but database cleanup failed: " + rowError.message);
}

await loadGallery();
}

// EVENTS
$("uploadBtn").addEventListener("click", uploadPhoto);
$("refreshBtn").addEventListener("click", loadGallery);
$("search").addEventListener("input", renderGallery);
$("adminLoginBtn").addEventListener("click", adminLogin);
$("adminLogoutBtn").addEventListener("click", adminLogout);
$("lightboxClose").addEventListener("click", closeLightbox);

$("lightbox").addEventListener("click", (event) => {
if (event.target === $("lightbox")) closeLightbox();
});

document.addEventListener("keydown", (event) => {
if (event.key === "Escape" && !$("lightbox").classList.contains("hidden")) {
closeLightbox();
}
});

initializeSupabase();
refreshAdminState();
