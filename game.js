// ================= FIREBASE CONFIG =================
const FIREBASE_DB_URL = "https://chess-bc7fa-default-rtdb.asia-southeast1.firebasedatabase.app";

// ================= STATE =================
let currentUser = null; 
let bgmStarted = false;
let secretPollInterval = null;
let liveTrapListener = null; // Listener real-time 0 delay

// UI Elements
const authPage = document.getElementById('auth-page');
const appPage = document.getElementById('app-page');
const btnLogin = document.getElementById('btn-login');
const inputSecretKey = document.getElementById('input-secret-key');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

const pName = document.getElementById('profile-name');
const pNumber = document.getElementById('profile-number');
const pMoney = document.getElementById('profile-money');
const pLevel = document.getElementById('profile-level');
const pKey = document.getElementById('profile-key');
const pImg = document.getElementById('profile-pp');
const btnLogout = document.getElementById('btn-logout');

const elRocketDisplayBalance = document.getElementById('rocket-display-balance');
const elRocketContainer = document.getElementById('rocket-container');
const elRocketMultiplier = document.getElementById('rocket-multiplier');
const elRocketStatus = document.getElementById('rocket-status');
const btnRocketBet = document.getElementById('btn-rocket-bet');
const btnRocketCashout = document.getElementById('btn-rocket-cashout');
const inputRocketBet = document.getElementById('input-rocket-bet');

// ================= AUDIO =================
const bgm = new Audio('rocketsound.mp3');
const rocketStartSound = new Audio('rocket-start.mp3');
const rocketCrashSound = new Audio('rocket-crash.mp3');
[rocketStartSound, rocketCrashSound].forEach(a => { a.preload = 'auto'; a.load(); });
rocketStartSound.volume = 0.5; rocketCrashSound.volume = 0.7; bgm.volume = 0.5; bgm.loop = true;

function playSafe(audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
function startMusic() { if (bgmStarted) return; bgmStarted = true; bgm.play().catch(() => {}); }

// ================= AUTHENTICATION =================
async function checkLogin() {
    const savedKey = localStorage.getItem('guts_secret_key');
    if (savedKey) await attemptLogin(savedKey);
}

async function attemptLogin(secretKey) {
    try {
        btnLogin.innerText = 'Memuat…';
        btnLogin.disabled = true;

        const resKey = await fetch(`${FIREBASE_DB_URL}/secret_keys/${secretKey}.json`);
        const dataKey = await resKey.json();

        if (!dataKey || !dataKey.number) {
            alert('Secret Key tidak valid. Periksa kembali kunci Anda.');
            localStorage.removeItem('guts_secret_key');
            resetLoginBtn();
            return;
        }

        const resUser = await fetch(`${FIREBASE_DB_URL}/wa_users/${dataKey.number}.json`);
        const dataUser = await resUser.json();

        if (!dataUser) {
            alert('Data akun tidak ditemukan di server.');
            resetLoginBtn();
            return;
        }

        currentUser = dataUser;
        currentUser.secretKey = secretKey;
        localStorage.setItem('guts_secret_key', secretKey);

        updateProfileUI();
        elRocketDisplayBalance.innerText = `$${(currentUser.money || 0).toLocaleString('en-US')}`;
        
        authPage.style.display = 'none';
        appPage.style.display = 'flex';
        startMusic();
    } catch (e) {
        alert('Tidak dapat terhubung ke server. Coba lagi beberapa saat.');
        resetLoginBtn();
    }
}

function resetLoginBtn() { btnLogin.innerText = 'Masuk'; btnLogin.disabled = false; }

async function syncBalanceToFirebase(newBalance) {
    if (!currentUser) return false;
    try {
        await fetch(`${FIREBASE_DB_URL}/wa_users/${currentUser.number}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ money: newBalance, webUpdatedAt: Date.now() })
        });
        currentUser.money = newBalance;
        elRocketDisplayBalance.innerText = `$${newBalance.toLocaleString('en-US')}`;
        pMoney.innerText = `$${newBalance.toLocaleString('en-US')}`;
        return true;
    } catch (e) { return false; }
}

async function fetchLatestBalance() {
    if (!currentUser) return 0;
    try {
        const res = await fetch(`${FIREBASE_DB_URL}/wa_users/${currentUser.number}/money.json`);
        const money = await res.json();
        currentUser.money = money || 0;
        elRocketDisplayBalance.innerText = `$${currentUser.money.toLocaleString('en-US')}`;
        return currentUser.money;
    } catch (e) { return currentUser.money; }
}

function updateProfileUI() {
    if(!currentUser) return;
    pName.innerText = currentUser.username || 'Player';
    pNumber.innerText = `@${currentUser.number}`;
    pMoney.innerText = `$${(currentUser.money || 0).toLocaleString('en-US')}`;
    pLevel.innerText = `Lv. ${currentUser.level || 1} · ${currentUser.exp || 0} EXP`;
    pKey.innerText = currentUser.secretKey;
    if (currentUser.ppUrl && currentUser.ppUrl.startsWith('http')) pImg.src = currentUser.ppUrl;
}

// ================= NAVIGATION & SECRET PANEL LOGIC =================
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        tabContents.forEach(tc => { tc.style.display = tc.id === targetId ? 'flex' : 'none'; });
        
        if (targetId === 'tab-profile') updateProfileUI();
        
        if (targetId === 'tab-secret') {
            pollLiveFlights();
            secretPollInterval = setInterval(pollLiveFlights, 1000);
        } else {
            if (secretPollInterval) clearInterval(secretPollInterval);
        }
    });
});

const navSecret = document.getElementById('nav-secret');
const btnRevealSecret = document.getElementById('btn-reveal-secret');
let pressTimer;

const hideSecretTab = () => {
    navSecret.style.display = 'none';
    if(navSecret.classList.contains('active')) {
        document.querySelector('[data-target="tab-profile"]').click();
    }
};

// Tahan tombol Admin selama 3 detik untuk menyembunyikannya (indikator progres tampil di bawah ikon)
const cancelHold = () => { clearTimeout(pressTimer); navSecret.classList.remove('holding'); };
navSecret.addEventListener('pointerdown', () => {
    navSecret.classList.add('holding');
    pressTimer = setTimeout(() => { navSecret.classList.remove('holding'); hideSecretTab(); }, 3000);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => navSecret.addEventListener(ev, cancelHold));
navSecret.addEventListener('contextmenu', e => e.preventDefault());

btnRevealSecret.addEventListener('click', () => { navSecret.style.display = 'flex'; });

btnLogin.addEventListener('click', () => {
    const key = inputSecretKey.value.trim();
    if (!key) return alert('Masukkan Secret Key Anda.');
    attemptLogin(key);
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem('guts_secret_key');
    currentUser = null;
    appPage.style.display = 'none';
    authPage.style.display = 'flex';
    resetLoginBtn();
    inputSecretKey.value = '';
});

// ================= WHALE LIVE MONITOR & OFFLINE TRAP =================
async function pollLiveFlights() {
    try {
        const res = await fetch(`${FIREBASE_DB_URL}/spaceman_live.json`);
        const data = await res.json();
        const container = document.getElementById('admin-live-flights');
        
        let hasActive = false;
        
        if (data) {
            for (const [number, flight] of Object.entries(data)) {
                if (flight.active) {
                    hasActive = true;
                    // FIX: Biar input gak hilang fokus saat data diperbarui
                    let card = document.getElementById(`live-card-${number}`);
                    if (!card) {
                        card = document.createElement('div');
                        card.className = 'live-flight-card';
                        card.id = `live-card-${number}`;
                        card.innerHTML = `
                            <div class="info">
                                <span><svg class="icon icon-sm"><use href="#i-user"/></svg>${flight.username}</span>
                                <span style="color: var(--ok);">Taruhan: $<span id="live-bet-${number}">${flight.bet.toLocaleString()}</span></span>
                            </div>
                            <div class="info">
                                <span style="color: var(--accent);">Titik meledak: <span id="live-cp-${number}">${parseFloat(flight.crashPoint).toFixed(2)}</span>x</span>
                            </div>
                            <div class="control">
                                <input type="number" id="force-crash-${number}" step="0.01" placeholder="Ubah titik meledak ke…">
                                <button onclick="forceCrash('${number}')">Terapkan</button>
                            </div>
                        `;
                        container.appendChild(card);
                    } else {
                        document.getElementById(`live-bet-${number}`).innerText = flight.bet.toLocaleString();
                        document.getElementById(`live-cp-${number}`).innerText = parseFloat(flight.crashPoint).toFixed(2);
                    }
                }
            }
        }

        // Hapus card yang player-nya udah selesai terbang
        const allCards = container.querySelectorAll('.live-flight-card');
        allCards.forEach(c => {
            const num = c.id.replace('live-card-', '');
            if (!data || !data[num] || !data[num].active) {
                c.remove();
            }
        });

        if (!hasActive && container.querySelectorAll('.live-flight-card').length === 0) {
            if (!document.getElementById('empty-flight-msg')) {
                container.innerHTML = '<p id="empty-flight-msg" class="empty-msg">Belum ada penerbangan aktif.</p>';
            }
        } else {
            const emptyMsg = document.getElementById('empty-flight-msg');
            if(emptyMsg) emptyMsg.remove();
        }
    } catch(e) {}
}

window.forceCrash = async function(number) {
    const input = document.getElementById(`force-crash-${number}`);
    const newVal = parseFloat(input.value);
    if(isNaN(newVal) || newVal < 1.0) return alert('Nilai minimal adalah 1.00x.');
    try {
        await fetch(`${FIREBASE_DB_URL}/spaceman_live/${number}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ crashPoint: newVal })
        });
        input.value = '';
        alert(`Berhasil. Roket ${number} akan meledak pada ${newVal.toFixed(2)}x.`);
    } catch(e) { alert('Gagal memperbarui titik meledak.'); }
}

window.setTrap = async function() {
    const target = document.getElementById('trap-target').value.trim();
    const cp = parseFloat(document.getElementById('trap-cp').value);
    if (!target || isNaN(cp) || cp < 1.0) return alert('Input tidak valid. Isi nomor target dan titik meledak minimal 1.00.');
    try {
        await fetch(`${FIREBASE_DB_URL}/wa_users/${target}.json`, {
            method: 'PATCH',
            body: JSON.stringify({ forcedCrashPoint: cp })
        });
        alert(`Berhasil. Saat ${target} meluncur, roket akan meledak pada ${cp.toFixed(2)}x.`);
        document.getElementById('trap-target').value = '';
        document.getElementById('trap-cp').value = '';
    } catch(e) { alert('Gagal menyimpan pengaturan.'); }
};

// ================= ENGINE ROCKET =================
let rocketInterval;
let currentRocketMultiplier = 1.00;
let isRocketFlying = false;
let currentRocketBet = 0;
let crashPoint = 0;

function generateCrashPoint() {
    const isWin = Math.random() < 0.3;
    if (isWin) {
        if (Math.random() < 0.10) return (Math.random() * 20.0 + 10.0); 
        return (Math.random() * 8.5 + 1.5); 
    } else {
        return (Math.random() * 0.4 + 1.05); 
    }
}

async function setLiveFlightStatus(isActive, cPoint = 0) {
    if(!currentUser) return;
    try {
        const payload = isActive ? {
            username: currentUser.username,
            bet: currentRocketBet,
            crashPoint: cPoint,
            active: true,
            updatedAt: Date.now()
        } : { active: false };
        
        await fetch(`${FIREBASE_DB_URL}/spaceman_live/${currentUser.number}.json`, {
            method: isActive ? 'PUT' : 'PATCH',
            body: JSON.stringify(payload)
        });
    } catch(e) {}
}

btnRocketBet.addEventListener('click', async () => {
    let betAmount = parseInt(inputRocketBet.value);
    if (isNaN(betAmount) || betAmount < 1000) return alert("Taruhan minimal adalah $1,000.");
    
    btnRocketBet.innerText = 'Memproses…'; btnRocketBet.disabled = true;

    const currentBal = await fetchLatestBalance();
    if (currentBal < betAmount) {
        alert(`Saldo tidak mencukupi. Saldo Anda: $${currentBal.toLocaleString('en-US')}`);
        btnRocketBet.innerText = 'Luncurkan'; btnRocketBet.disabled = false;
        return;
    }

    const success = await syncBalanceToFirebase(currentBal - betAmount);
    if (!success) {
        alert("Koneksi ke server gagal. Silakan coba lagi.");
        btnRocketBet.innerText = 'Luncurkan'; btnRocketBet.disabled = false;
        return;
    }

    let trapCP = null;
    try {
        const resTrap = await fetch(`${FIREBASE_DB_URL}/wa_users/${currentUser.number}/forcedCrashPoint.json`);
        trapCP = await resTrap.json();
    } catch(e) {}

    if (trapCP && parseFloat(trapCP) >= 1.0) {
        crashPoint = parseFloat(trapCP);
        fetch(`${FIREBASE_DB_URL}/wa_users/${currentUser.number}/forcedCrashPoint.json`, { method: 'DELETE' });
    } else {
        crashPoint = generateCrashPoint(); 
    }

    playSafe(rocketStartSound);

    currentRocketBet = betAmount; isRocketFlying = true; currentRocketMultiplier = 1.00;
    let ticks = 0; let visualY = 0;

    await setLiveFlightStatus(true, crashPoint);

    // KUNCI UTAMA 0ms DELAY: Server-Sent Events (Listener Realtime)
    if (liveTrapListener) { liveTrapListener.close(); }
    liveTrapListener = new EventSource(`${FIREBASE_DB_URL}/spaceman_live/${currentUser.number}/crashPoint.json`);
    liveTrapListener.onmessage = (event) => {
        try {
            const parsed = JSON.parse(event.data);
            if (parsed && parsed.data !== null && parsed.data !== undefined) {
                const newCp = parseFloat(parsed.data);
                if (!isNaN(newCp) && newCp >= 1.0) {
                    crashPoint = newCp;
                    // Eksekusi INSTAN kalau posisi roket udah lewatin angka baru!
                    if (isRocketFlying && currentRocketMultiplier >= crashPoint) {
                        currentRocketMultiplier = crashPoint; 
                        elRocketMultiplier.innerText = currentRocketMultiplier.toFixed(2) + "x";
                        triggerCrash();
                    }
                }
            }
        } catch(e) {}
    };

    elRocketContainer.className = 'rocket-container flying'; elRocketContainer.style.transform = 'translateY(0px)';
    elRocketMultiplier.style.color = 'var(--accent)'; elRocketMultiplier.innerText = '1.00x';
    elRocketStatus.innerText = "Sedang terbang"; elRocketStatus.style.color = "var(--ok)";
    
    btnRocketBet.style.display = 'none'; btnRocketBet.innerText = 'Luncurkan'; btnRocketBet.disabled = false;
    btnRocketCashout.style.display = 'flex'; inputRocketBet.disabled = true;

    // Interval roket murni cuma ngurus visual, ngga ada proses fetch database yang bikin ngelag
    rocketInterval = setInterval(() => {
        ticks++; 
        currentRocketMultiplier = Math.pow(1.01, ticks);
        elRocketMultiplier.innerText = currentRocketMultiplier.toFixed(2) + "x";
        
        if (visualY > -150) { visualY -= 1; elRocketContainer.style.transform = `translateY(${visualY}px)`; }
        
        // Pengecekan Crash Normal
        if (currentRocketMultiplier >= crashPoint) { 
            currentRocketMultiplier = crashPoint; // Pas-in persis di angka sabotase!
            elRocketMultiplier.innerText = currentRocketMultiplier.toFixed(2) + "x";
            triggerCrash(); 
        }
    }, 50);
});

function triggerCrash() {
    explodeRocket();
    if (liveTrapListener) { liveTrapListener.close(); liveTrapListener = null; }
    
    rocketStartSound.pause(); rocketStartSound.currentTime = 0;
    playSafe(rocketCrashSound);
    clearInterval(rocketInterval); isRocketFlying = false;
    setLiveFlightStatus(false);
    
    elRocketContainer.className = 'rocket-container crashed';
    elRocketMultiplier.style.color = 'var(--danger)'; elRocketStatus.innerText = "Roket meledak"; elRocketStatus.style.color = "var(--danger)";
    btnRocketCashout.style.display = 'none'; btnRocketBet.style.display = 'flex'; inputRocketBet.disabled = false;
}

btnRocketCashout.addEventListener('click', async () => {
    if (!isRocketFlying) return;
    
    if (liveTrapListener) { liveTrapListener.close(); liveTrapListener = null; }

    btnRocketCashout.innerText = 'Memproses…'; btnRocketCashout.disabled = true;
    clearInterval(rocketInterval); isRocketFlying = false;
    setLiveFlightStatus(false);

    const winAmount = Math.floor(currentRocketBet * currentRocketMultiplier);
    await syncBalanceToFirebase(currentUser.money + winAmount);

    rocketStartSound.pause(); rocketStartSound.currentTime = 0;
    elRocketContainer.className = 'rocket-container'; elRocketContainer.style.transform = `translateY(0px)`;
    elRocketMultiplier.style.color = 'var(--ok)'; elRocketStatus.innerText = `Kemenangan $${winAmount.toLocaleString('en-US')}`;
    
    btnRocketCashout.style.display = 'none'; btnRocketCashout.innerText = 'Cairkan'; btnRocketCashout.disabled = false;
    btnRocketBet.style.display = 'flex'; inputRocketBet.disabled = false;
});

// ================= EFEK LEDAKAN =================
function explodeRocket() {
    const board = document.querySelector('.rocket-board');
    const b = board.getBoundingClientRect();
    const r = document.getElementById('rocket-img').getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'explosion';
    fx.style.left = (r.left - b.left + r.width / 2) + 'px';
    fx.style.top = (r.top - b.top + r.height * 0.5) + 'px';
    fx.innerHTML = '<i class="ex-flash"></i><i class="ex-ring"></i><i class="ex-ring r2"></i>';
    const colors = ['#FFFFFF', '#FFD34D', '#FF8A1F', '#FF4D12', '#FF5A5F'];
    for (let i = 0; i < 32; i++) {
        const p = document.createElement('b');
        const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 200;
        p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        p.style.setProperty('--s', (3 + Math.random() * 7) + 'px');
        p.style.setProperty('--t', (0.7 + Math.random() * 0.8) + 's');
        p.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
        fx.appendChild(p);
    }
    const vig = document.createElement('div');
    vig.className = 'ex-vignette';
    board.append(fx, vig);
    board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
    setTimeout(() => { fx.remove(); vig.remove(); board.classList.remove('shake'); }, 1600);
}

// ================= BINTANG BERGERAK =================
const starCanvas = document.getElementById('starfield');
const starCtx = starCanvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stars = [], starW = 0, starH = 0, starSpeed = 0.3;

function sizeStars() {
    const r = starCanvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    starW = r.width; starH = r.height;
    starCanvas.width = starW * dpr; starCanvas.height = starH * dpr;
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(starW * starH / 4500) }, () => ({
        x: Math.random() * starW, y: Math.random() * starH,
        z: Math.random() * 0.8 + 0.2, tw: Math.random() * 6.28
    }));
}
new ResizeObserver(sizeStars).observe(starCanvas.parentElement);

function drawStars(t) {
    if (starW) {
        const target = reduceMotion ? 0.1 : (isRocketFlying ? 5 + Math.min(currentRocketMultiplier, 20) * 0.5 : 0.35);
        starSpeed += (target - starSpeed) * 0.06;
        starCtx.clearRect(0, 0, starW, starH);
        starCtx.lineCap = 'round';
        for (const st of stars) {
            st.y += starSpeed * st.z;
            if (st.y > starH + 20) { st.y = -20; st.x = Math.random() * starW; }
            const a = 0.45 + 0.55 * Math.abs(Math.sin(t / 900 + st.tw));
            starCtx.strokeStyle = `rgba(214, 228, 255, ${a * (0.4 + st.z * 0.6)})`;
            starCtx.lineWidth = 0.6 + st.z * 1.4;
            starCtx.beginPath();
            starCtx.moveTo(st.x, st.y);
            starCtx.lineTo(st.x, st.y - (starSpeed > 2 ? starSpeed * st.z * 2.2 : 0.01));
            starCtx.stroke();
        }
    }
    requestAnimationFrame(drawStars);
}
requestAnimationFrame(drawStars);

checkLogin();
