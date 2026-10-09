
/* =========================
   NEURAL TRAVEL MUSIC PLAYER
   APP.JS - VERSION 0.2
   IndexedDB Storage
========================= */


/* ELEMENTS */

const audio = document.getElementById("audio");
const fileInput = document.getElementById("fileInput");
const playlist = document.getElementById("playlist");

const nowTitle = document.getElementById("nowTitle");
const nowArtist = document.getElementById("nowArtist");

const currentTime = document.getElementById("currentTime");
const duration = document.getElementById("duration");
const seekBar = document.getElementById("seekBar");

const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");

const clearBtn = document.getElementById("clearBtn");

const trackCount = document.getElementById("trackCount");
const emptyState = document.getElementById("emptyState");
const status = document.getElementById("status");


/* VARIABLES */

let tracks = [];
let currentIndex = -1;

let isShuffle = false;
let isRepeat = false;

let db;


/* INDEXEDDB */

function openDatabase() {
    return new Promise(function(resolve, reject) {
        const request = indexedDB.open("NeuralTravelMusic", 1);

        request.onupgradeneeded = function(event) {
            const database = event.target.result;

            if (!database.objectStoreNames.contains("tracks")) {
                database.createObjectStore("tracks", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
        };

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}


/* DATABASE REQUEST HELPER */

function databaseRequest(mode, action, data) {
    return new Promise(function(resolve, reject) {
        const transaction = db.transaction("tracks", mode);
        const store = transaction.objectStore("tracks");

        let request;

        if (action === "add") {
            request = store.add(data);
        } else if (action === "getAll") {
            request = store.getAll();
        } else if (action === "delete") {
            request = store.delete(data);
        } else if (action === "clear") {
            request = store.clear();
        }

        if (request) {
            request.onsuccess = function() {
                resolve(request.result);
            };

            request.onerror = function() {
                reject(request.error);
            };
        } else {
            transaction.oncomplete = function() {
                resolve();
            };

            transaction.onerror = function() {
                reject(transaction.error);
            };
        }
    });
}


/* FORMAT TIME */

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return minutes + ":" +
        String(remainingSeconds).padStart(2, "0");
}


/* FORMAT FILE SIZE */

function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}


/* LOAD SAVED MUSIC */

async function loadLibrary() {
    try {
        db = await openDatabase();

        const savedTracks = await databaseRequest(
            "readonly",
            "getAll"
        );

        tracks.forEach(function(track) {
            URL.revokeObjectURL(track.url);
        });

        tracks = savedTracks.map(function(track) {
            return {
                id: track.id,
                name: track.name,
                file: track.file,
                url: URL.createObjectURL(track.file)
            };
        });

        renderPlaylist();

        if (tracks.length > 0) {
            playTrack(0, false);
            status.textContent =
                "Memuat " + tracks.length + " lagu tersimpan.";
        } else {
            resetPlayer();
            status.textContent =
                "Perpustakaan musik siap.";
        }

    } catch (error) {
        console.error(error);

        status.textContent =
            "Gagal membuka penyimpanan musik.";
    }
}


/* IMPORT MUSIC */

fileInput.addEventListener("change", async function() {
    const files = Array.from(fileInput.files);

    let added = 0;

    try {
        for (const file of files) {
            if (!file.type.startsWith("audio/")) {
                continue;
            }

            const savedTrack = {
                name: file.name.replace(/\.[^/.]+$/, ""),
                file: file
            };

            const id = await databaseRequest(
                "readwrite",
                "add",
                savedTrack
            );

            tracks.push({
                id: id,
                name: savedTrack.name,
                file: file,
                url: URL.createObjectURL(file)
            });

            added++;
        }

        renderPlaylist();

        if (added > 0) {
            status.textContent =
                added + " lagu berhasil disimpan!";
            
            if (currentIndex === -1) {
                playTrack(0, false);
            }
        } else {
            status.textContent =
                "Tidak ada audio yang diimpor.";
        }

    } catch (error) {
        console.error(error);

        status.textContent =
            "Penyimpanan gagal. Periksa ruang penyimpanan.";
    }

    fileInput.value = "";
});


/* RENDER PLAYLIST */

function renderPlaylist() {
    playlist.innerHTML = "";

    trackCount.textContent = tracks.length + " lagu";

    emptyState.style.display =
        tracks.length === 0 ? "block" : "none";

    tracks.forEach(function(track, index) {
        const item = document.createElement("li");
        item.className = "track-row";

        if (index === currentIndex) {
            item.classList.add("active");
        }

        const number = document.createElement("span");
        number.className = "track-number";
        number.textContent = String(index + 1).padStart(2, "0");

        const button = document.createElement("button");
        button.className = "track-play";

        button.textContent =
            index === currentIndex && !audio.paused
                ? "Ⅱ" : "▶";

        button.addEventListener("click", function() {
            if (index === currentIndex) {
                togglePlay();
            } else {
                playTrack(index, true);
            }
        });

        const info = document.createElement("div");
        info.className = "track-info";

        const title = document.createElement("div");
        title.className = "track-title";
        title.textContent = track.name;

        const size = document.createElement("div");
        size.className = "track-size";
        size.textContent = formatSize(track.file.size);

        info.appendChild(title);
        info.appendChild(size);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-track";
        deleteBtn.textContent = "×";
        deleteBtn.setAttribute(
            "aria-label",
            "Hapus " + track.name
        );

        deleteBtn.addEventListener("click", function() {
            deleteTrack(index);
        });

        item.appendChild(number);
        item.appendChild(button);
        item.appendChild(info);
        item.appendChild(deleteBtn);

        playlist.appendChild(item);
    });
}


/* PLAY TRACK */

function playTrack(index, autoplay) {
    if (index < 0 || index >= tracks.length) {
        return;
    }

    currentIndex = index;

    audio.src = tracks[index].url;
    audio.load();

    nowTitle.textContent = tracks[index].name;
    nowArtist.textContent = "Audio lokal";

    currentTime.textContent = "0:00";
    duration.textContent = "0:00";
    seekBar.value = 0;

    playBtn.textContent = "▶";

    renderPlaylist();

    if (autoplay) {
        audio.play().then(function() {
            status.textContent = "Sedang diputar.";
        }).catch(function() {
            status.textContent = "Gagal memutar audio.";
        });
    } else {
        status.textContent = "Lagu dipilih. Tekan Play.";
    }
}


/* PLAY / PAUSE */

function togglePlay() {
    if (tracks.length === 0) {
        status.textContent = "Impor musik terlebih dahulu.";
        return;
    }

    if (currentIndex === -1) {
        playTrack(0, true);
        return;
    }

    if (audio.paused) {
        audio.play().catch(function() {
            status.textContent = "Audio gagal diputar.";
        });
    } else {
        audio.pause();
    }
}

playBtn.addEventListener("click", togglePlay);


/* AUDIO EVENTS */

audio.addEventListener("play", function() {
    playBtn.textContent = "Ⅱ";
    renderPlaylist();
});

audio.addEventListener("pause", function() {
    playBtn.textContent = "▶";
    renderPlaylist();
});

audio.addEventListener("loadedmetadata", function() {
    duration.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", function() {
    currentTime.textContent = formatTime(audio.currentTime);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        seekBar.value =
            (audio.currentTime / audio.duration) * 100;
    }
});


/* SEEK BAR */

seekBar.addEventListener("input", function() {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime =
            (Number(seekBar.value) / 100) * audio.duration;
    }
});


/* NEXT TRACK */

function nextTrack() {
    if (tracks.length === 0) {
        return;
    }

    if (isShuffle && tracks.length > 1) {
        let nextIndex;

        do {
            nextIndex = Math.floor(Math.random() * tracks.length);
        } while (nextIndex === currentIndex);

        playTrack(nextIndex, true);
        return;
    }

    let nextIndex = currentIndex + 1;

    if (nextIndex >= tracks.length) {
        if (isRepeat) {
            nextIndex = 0;
        } else {
            audio.pause();
            audio.currentTime = 0;
            status.textContent = "Playlist selesai.";
            return;
        }
    }

    playTrack(nextIndex, true);
}

nextBtn.addEventListener("click", nextTrack);


/* PREVIOUS TRACK */

prevBtn.addEventListener("click", function() {
    if (tracks.length === 0) {
        return;
    }

    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    let previousIndex = currentIndex - 1;

    if (previousIndex < 0) {
        previousIndex = isRepeat ? tracks.length - 1 : 0;
    }

    playTrack(previousIndex, true);
});


/* SHUFFLE */

shuffleBtn.addEventListener("click", function() {
    isShuffle = !isShuffle;

    shuffleBtn.style.color =
        isShuffle ? "var(--teal)" : "var(--muted)";

    status.textContent = isShuffle
        ? "Shuffle aktif."
        : "Shuffle nonaktif.";
});


/* REPEAT */

repeatBtn.addEventListener("click", function() {
    isRepeat = !isRepeat;

    repeatBtn.style.color =
        isRepeat ? "var(--teal)" : "var(--muted)";

    status.textContent = isRepeat
        ? "Repeat playlist aktif."
        : "Repeat playlist nonaktif.";
});


/* WHEN TRACK ENDS */

audio.addEventListener("ended", function() {
    if (isRepeat && tracks.length === 1) {
        audio.currentTime = 0;

        audio.play().catch(function() {
            status.textContent = "Gagal memutar ulang audio.";
        });

        return;
    }

    if (
        currentIndex < tracks.length - 1 ||
        isRepeat ||
        isShuffle
    ) {
        nextTrack();
    } else {
        playBtn.textContent = "▶";
        status.textContent = "Playlist selesai.";
        renderPlaylist();
    }
});


/* DELETE TRACK */

async function deleteTrack(index) {
    if (index < 0 || index >= tracks.length) {
        return;
    }

    const deletedTrack = tracks[index];

    try {
        await databaseRequest(
            "readwrite",
            "delete",
            deletedTrack.id
        );

        if (index === currentIndex) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();

            URL.revokeObjectURL(deletedTrack.url);

            tracks.splice(index, 1);
            currentIndex = -1;

            if (tracks.length > 0) {
                playTrack(
                    Math.min(index, tracks.length - 1),
                    false
                );
            } else {
                resetPlayer();
            }

        } else {
            URL.revokeObjectURL(deletedTrack.url);

            tracks.splice(index, 1);

            if (index < currentIndex) {
                currentIndex--;
            }
        }

        renderPlaylist();
        status.textContent = "Lagu berhasil dihapus.";

    } catch (error) {
        console.error(error);
        status.textContent = "Gagal menghapus lagu.";
    }
}


/* CLEAR ALL */

clearBtn.addEventListener("click", async function() {
    if (tracks.length === 0) {
        status.textContent = "Playlist sudah kosong.";
        return;
    }

    try {
        await databaseRequest("readwrite", "clear");

        audio.pause();
        audio.removeAttribute("src");
        audio.load();

        tracks.forEach(function(track) {
            URL.revokeObjectURL(track.url);
        });

        tracks = [];
        currentIndex = -1;

        resetPlayer();

        status.textContent =
            "Semua lagu dan data tersimpan dihapus.";

    } catch (error) {
        console.error(error);
        status.textContent = "Gagal menghapus playlist.";
    }
});


/* RESET PLAYER */

function resetPlayer() {
    nowTitle.textContent = "Belum ada musik";
    nowArtist.textContent = "Impor audio untuk memulai.";

    currentTime.textContent = "0:00";
    duration.textContent = "0:00";
    seekBar.value = 0;

    playBtn.textContent = "▶";

    renderPlaylist();
}


/* INITIALIZE */

loadLibrary();
