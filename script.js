/**
 * script.js — MinX EV Intelligence
 * All client-side logic for the MinX dashboard.
 */

/* ─────────────────────────────────────────────
   1. CAR DATABASE
───────────────────────────────────────────── */
const CAR_DB = {
    mg_windsor:    { name: 'MG Windsor EV',    maxRange: 331, battery: 38.0, img: 'mg windsor-cutout.png' },
    tata_nexon:    { name: 'Tata Nexon EV',    maxRange: 465, battery: 45.0, img: 'nexon-cutout.png' },
    mahindra_be6:  { name: 'Mahindra BE 6',    maxRange: 535, battery: 59.0, img: 'be6-cutout.png' },
    tata_punch:    { name: 'Tata Punch EV',    maxRange: 421, battery: 35.0, img: 'punch-cutout.png' },
    hyundai_creta: { name: 'Hyundai Creta EV', maxRange: 473, battery: 51.4, img: 'creta ev-cutout.png' },
    byd_atto:      { name: 'BYD Atto 3',       maxRange: 521, battery: 60.5, img: 'byd altoo3-cutout.png' },
    kia_ev6:       { name: 'Kia EV6',          maxRange: 708, battery: 77.4, img: 'kia-cutout.png' },
    mg_zs:         { name: 'MG ZS EV',         maxRange: 461, battery: 50.3, img: 'mg zv ev-cutout.png' },
    tata_curvv:    { name: 'Tata Curvv EV',    maxRange: 430, battery: 45.0, img: 'tata curv-cutout.png' },
    tata_harrier:  { name: 'Harrier.ev',       variant: 'Adventure 65', maxRange: 538, battery: 65.0, img: 'harrier-cutout.png' },
    suzuki_evitara:{ name: 'Maruti e Vitara',  maxRange: 500, battery: 61.0, img: 'evitara-cutout.png' },
    hyundai_ioniq: { name: 'Hyundai Ioniq 5',  maxRange: 631, battery: 72.6, img: 'ioniq-cutout.png' },
    kia_ev9:       { name: 'Kia EV9',          maxRange: 561, battery: 99.8, img: 'kiaev9-cutout.png' },
    tata_tiago:    { name: 'Tata Tiago EV',    maxRange: 315, battery: 24.0, img: 'tiago-cutout.png' },
    tata_tigor:    { name: 'Tata Tigor EV',    maxRange: 315, battery: 26.0, img: 'tigorev-cutout.png' },
};

/* ─────────────────────────────────────────────
   2. STATE VARIABLES
───────────────────────────────────────────── */
let selectedCar    = null;
let userBatt       = 80;
let userRange      = null;
let userLocation   = null;
let currentLang    = 'en';
let isDestMicOn    = false;
let isChatMicOn    = false;
let recognition    = null;
let chatRecog      = null;
let firebaseCtx    = null;
let currentUser    = null;
let aiStatusLabel  = 'LOCAL EV';
let gpsLocation    = null;
let destinationPlace = null;
let originSource   = 'manual';
let placesApiPromise = null;

const AI_REQUEST_TIMEOUT_MS = 12_000;
const GOOGLE_MAPS_API_KEY = 'AIzaSyDMAJJvk9Z-61tMkJf0mbHUw9cBZg59Tdk';

/* ─────────────────────────────────────────────
   3. INITIALISATION
───────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) loader.classList.add('hidden');

        initGeo();
        initFirebase_App();
        initVoice();
        initAutocomplete();
        onBattChange(80);
        loadSavedProfile();
        checkAiHealth();
        syncMapTheme();
        updateMapThemeUI();

        const mapFrame = document.getElementById('mapFrame');
        mapFrame?.addEventListener('load', () => syncMapTheme());
    }, 2200);
});

/* ─────────────────────────────────────────────
   4. THEME TOGGLE
───────────────────────────────────────────── */
function toggleTheme() {
    const html    = document.documentElement;
    const current = html.getAttribute('data-map-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
}

function setTheme(next) {
    const theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-map-theme', theme);
    syncMapTheme(theme);
    localStorage.setItem('minx_map_theme', theme);
    updateMapThemeUI(theme);
}

function syncMapTheme(theme = document.documentElement.getAttribute('data-map-theme') || 'dark') {
    const frame = document.getElementById('mapFrame');
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ theme }, '*');
    }
}

function updateMapThemeUI(theme = document.documentElement.getAttribute('data-map-theme') || 'dark') {
    document.getElementById('settingsDarkBtn')?.classList.toggle('active', theme === 'dark');
    document.getElementById('settingsLightBtn')?.classList.toggle('active', theme === 'light');
}

(function restoreTheme() {
    document.documentElement.setAttribute('data-theme', 'dark');
    const saved = localStorage.getItem('minx_map_theme') || localStorage.getItem('minx_theme') || 'dark';
    document.documentElement.setAttribute('data-map-theme', saved === 'light' ? 'light' : 'dark');
    localStorage.removeItem('minx_theme');
})();

/* ─────────────────────────────────────────────
   5. SIDEBAR
───────────────────────────────────────────── */
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
    document.body.style.overflow = '';
}

function navigateSidebar(section, el) {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    closeSidebar();

    switch (section) {
        case 'home':
            showToast('At home — main dashboard', 'info');
            break;
        case 'stations':
            findCharger();
            break;
        case 'route':
            document.getElementById('destination')?.focus();
            showToast('Enter a destination to plan your route', 'info');
            break;
        case 'faq':
            window.location.href = 'minx_faq.html';
            break;
        case 'voice':
            openVoiceBot();
            break;
        case 'settings':
            openSettings();
            break;
        default:
            showToast('Section coming soon!', 'info');
    }
}

/* ─────────────────────────────────────────────
   6. AUTHENTICATION (Firebase)
───────────────────────────────────────────── */
function initFirebase_App() {
    firebaseCtx = initFirebase();

    if (!firebaseCtx.demoMode && firebaseCtx.auth) {
        firebaseCtx.auth.onAuthStateChanged(user => {
            currentUser = user;
            updateUserUI(user);
        });
    }
}

function updateUserUI(user) {
    const chip     = document.getElementById('userChip');
    const loginBtn = document.getElementById('loginBtn');

    if (user) {
        if (chip) {
            chip.classList.add('show');
            const nameEl   = document.getElementById('chipName');
            const avatarEl = document.getElementById('chipAvatar');
            if (nameEl)   nameEl.textContent = (user.displayName || user.email || 'User').split(' ')[0];
            if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
        }
        if (loginBtn) loginBtn.style.display = 'none';
        showToast(`Welcome back, ${user.displayName || 'User'}!`, 'success');
    } else {
        if (chip)     chip.classList.remove('show');
        if (loginBtn) loginBtn.style.display = '';
    }
}

function openAuth(tab) {
    document.getElementById('authOverlay').classList.add('show');
    switchAuthTab(tab || 'login');
    clearAuthMsg();
}

function closeAuth() {
    document.getElementById('authOverlay').classList.remove('show');
}

function switchAuthTab(tab) {
    const loginPanel = document.getElementById('authLoginPanel');
    const regPanel   = document.getElementById('authRegPanel');
    const loginTab   = document.getElementById('tabLogin');
    const regTab     = document.getElementById('tabRegister');

    if (tab === 'login') {
        loginPanel?.style.setProperty('display', 'block');
        regPanel?.style.setProperty('display', 'none');
        loginTab?.classList.add('active');
        regTab?.classList.remove('active');
    } else {
        loginPanel?.style.setProperty('display', 'none');
        regPanel?.style.setProperty('display', 'block');
        loginTab?.classList.remove('active');
        regTab?.classList.add('active');
    }
}

function showAuthMsg(text, type) {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent = text;
    el.className = `auth-msg ${type}`;
}

function clearAuthMsg() {
    const el = document.getElementById('authMsg');
    if (el) { el.textContent = ''; el.className = 'auth-msg'; }
}

async function doEmailLogin() {
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass  = document.getElementById('loginPass')?.value;
    if (!email || !pass) { showAuthMsg('Enter email and password.', 'error'); return; }

    if (firebaseCtx?.demoMode) {
        currentUser = { displayName: email.split('@')[0], email, photoURL: null };
        updateUserUI(currentUser);
        closeAuth();
        return;
    }

    try {
        await signInWithEmail(firebaseCtx.auth, email, pass);
        closeAuth();
    } catch (e) {
        showAuthMsg(firebaseAuthError(e.code), 'error');
    }
}

async function doEmailRegister() {
    const name  = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const pass  = document.getElementById('regPass')?.value;
    if (!email || !pass) { showAuthMsg('All fields required.', 'error'); return; }
    if (pass.length < 6) { showAuthMsg('Password must be at least 6 characters.', 'error'); return; }

    if (firebaseCtx?.demoMode) {
        currentUser = { displayName: name || email.split('@')[0], email, photoURL: null };
        updateUserUI(currentUser);
        closeAuth();
        return;
    }

    try {
        const user = await registerWithEmail(firebaseCtx.auth, email, pass);
        if (name) await user.updateProfile({ displayName: name });
        closeAuth();
        showToast('Account created!', 'success');
    } catch (e) {
        showAuthMsg(firebaseAuthError(e.code), 'error');
    }
}

async function doGoogleLogin() {
    if (firebaseCtx?.demoMode) {
        currentUser = { displayName: 'Demo User', email: 'demo@minx.app', photoURL: null };
        updateUserUI(currentUser);
        closeAuth();
        return;
    }
    try {
        await signInWithGoogle(firebaseCtx.auth, firebaseCtx.googleProvider);
        closeAuth();
    } catch (e) {
        showAuthMsg(firebaseAuthError(e.code), 'error');
    }
}

async function doFacebookLogin() {
    if (firebaseCtx?.demoMode) {
        currentUser = { displayName: 'Demo User', email: 'demo@minx.app', photoURL: null };
        updateUserUI(currentUser);
        closeAuth();
        return;
    }
    try {
        await signInWithFacebook(firebaseCtx.auth, firebaseCtx.facebookProvider);
        closeAuth();
    } catch (e) {
        showAuthMsg(firebaseAuthError(e.code), 'error');
    }
}

async function doForgotPassword() {
    const email = document.getElementById('loginEmail')?.value.trim();
    if (!email) { showAuthMsg('Enter your email first.', 'error'); return; }

    if (firebaseCtx?.demoMode) {
        showAuthMsg('Demo mode: reset email would be sent.', 'success');
        return;
    }

    try {
        await sendPasswordReset(firebaseCtx.auth, email);
        showAuthMsg('Password reset email sent!', 'success');
    } catch (e) {
        showAuthMsg(firebaseAuthError(e.code), 'error');
    }
}

async function doSignOut() {
    if (!firebaseCtx?.demoMode && firebaseCtx?.auth) {
        await signOutUser(firebaseCtx.auth);
    } else {
        currentUser = null;
        updateUserUI(null);
    }
    showToast('Signed out.', 'info');
}

function firebaseAuthError(code) {
    const MAP = {
        'auth/user-not-found':        'No account with that email.',
        'auth/wrong-password':        'Incorrect password.',
        'auth/email-already-in-use':  'Email already registered.',
        'auth/invalid-email':         'Invalid email address.',
        'auth/too-many-requests':     'Too many attempts. Try again later.',
        'auth/network-request-failed':'Network error. Check connection.',
        'auth/popup-closed-by-user':  'Login popup was closed.',
    };
    return MAP[code] || `Auth error (${code})`;
}

/* ─────────────────────────────────────────────
   7. GEOLOCATION
───────────────────────────────────────────── */
function initGeo() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported by this browser.', 'error');
        return;
    }

    requestCurrentPosition({ quiet: true });
}

function useCurrentLocation() {
    requestCurrentPosition({ quiet: false });
}

function requestCurrentPosition({ quiet = false } = {}) {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported by this browser.', 'error');
        return;
    }

    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) locateBtn.textContent = '...';

    navigator.geolocation.getCurrentPosition(
        pos => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            gpsLocation = loc;
            userLocation = loc;
            originSource = 'gps';
            setOriginInput('Current GPS location');
            setLocateButtonState(true);
            sendToMap({ userLocation: loc, originLabel: 'Current GPS location' });
            updateMapStatus('GPS · Live');
            reverseGeocodeOrigin(loc);
            if (!quiet) showToast('Current location selected', 'success');
        },
        err => {
            setLocateButtonState(false);
            switch (err.code) {
                case err.PERMISSION_DENIED:
                    showToast('Location access denied. Enter your starting point manually.', 'error');
                    break;
                case err.POSITION_UNAVAILABLE:
                    showToast('Location unavailable. Enter your starting point manually.', 'error');
                    break;
                case err.TIMEOUT:
                    showToast('Location request timed out. Enter your starting point manually.', 'error');
                    break;
                default:
                    showToast('Could not read location. Enter your starting point manually.', 'error');
            }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
}

function setLocateButtonState(active) {
    const locateBtn = document.getElementById('locateBtn');
    if (!locateBtn) return;
    locateBtn.textContent = 'GPS';
    locateBtn.classList.toggle('active', active);
}

function setOriginInput(value) {
    const input = document.getElementById('originInput');
    if (input) input.value = value;
}

async function reverseGeocodeOrigin(loc) {
    try {
        await loadPlacesApi();
        if (!window.google?.maps?.Geocoder) return;
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: loc }, (results, status) => {
            if (status !== 'OK' || !results?.[0] || originSource !== 'gps') return;
            setOriginInput(results[0].formatted_address);
        });
    } catch (e) {
        console.info('[MinX] Reverse geocode skipped:', e);
    }
}

function sendToMap(payload) {
    const frame = document.getElementById('mapFrame');
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ ...payload, userCar: getSelectedCarMarker() }, '*');
    }
}

function getSelectedCarMarker() {
    if (!selectedCar || !CAR_DB[selectedCar]) return null;
    const car = CAR_DB[selectedCar];
    return {
        name: car.name,
        image: new URL(car.img, window.location.href).href,
    };
}

function updateMapStatus(text) {
    const el = document.getElementById('mapStatusText');
    if (el) el.textContent = text;
}

/* ─────────────────────────────────────────────
   8. AUTOCOMPLETE
───────────────────────────────────────────── */
async function initAutocomplete() {
    const originInput = document.getElementById('originInput');
    const destInput = document.getElementById('destination');
    if (!originInput && !destInput) return;

    try {
        await loadPlacesApi();
    } catch (e) {
        console.warn('[MinX] Places autocomplete unavailable:', e);
        return;
    }

    const options = {
        componentRestrictions: { country: 'in' },
        fields: ['place_id', 'geometry', 'name', 'formatted_address'],
    };

    if (originInput) {
        const originAc = new google.maps.places.Autocomplete(originInput, options);
        originAc.addListener('place_changed', () => {
            const place = originAc.getPlace();
            const loc = getPlaceLocation(place);
            const label = formatPlaceLabel(place);
            if (!loc) return;

            userLocation = loc;
            originSource = 'manual';
            setLocateButtonState(false);
            originInput.value = label;
            sendToMap({ userLocation: loc, originLabel: label });
            updateMapStatus('Manual Origin');
        });

        originInput.addEventListener('input', () => {
            originSource = 'manual';
            userLocation = null;
            setLocateButtonState(false);
        });
    }

    if (destInput) {
        const destAc = new google.maps.places.Autocomplete(destInput, options);
        destAc.addListener('place_changed', () => {
            const place = destAc.getPlace();
            const loc = getPlaceLocation(place);
            const label = formatPlaceLabel(place);
            if (!label) return;

            destinationPlace = loc ? { label, location: loc } : { label };
            destInput.value = label;
            if (loc) {
                sendToMap({ action: 'previewPlace', location: loc, label, kind: 'destination' });
                updateMapStatus('Destination Preview');
            }
        });

        destInput.addEventListener('input', () => {
            destinationPlace = null;
        });
    }
}

function loadPlacesApi() {
    if (window.google?.maps?.places) return Promise.resolve();
    if (placesApiPromise) return placesApiPromise;

    placesApiPromise = new Promise((resolve, reject) => {
        window.__minxPlacesReady = () => resolve();

        const existing = document.querySelector('script[data-minx-places-api]');
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=__minxPlacesReady`;
        script.async = true;
        script.defer = true;
        script.dataset.minxPlacesApi = 'true';
        script.onerror = () => reject(new Error('Google Maps Places API failed to load.'));
        document.head.appendChild(script);
    });

    return placesApiPromise;
}

function getPlaceLocation(place) {
    const loc = place?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat(), lng: loc.lng() };
}

function formatPlaceLabel(place) {
    return place?.formatted_address || place?.name || '';
}

/* ─────────────────────────────────────────────
   9. VOICE INPUT
───────────────────────────────────────────── */
function initVoice() {
    const API = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!API) return;

    recognition = new API();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = e => {
        const text = e.results[0][0].transcript;
        const destEl = document.getElementById('destination');
        if (destEl) destEl.value = text;
        destinationPlace = null;
    };
    recognition.onend = () => {
        isDestMicOn = false;
        setMicState('micBtn', 'micImg', false);
    };
    recognition.onerror = e => {
        console.warn('[MinX] Dest mic error:', e.error);
        isDestMicOn = false;
        setMicState('micBtn', 'micImg', false);
    };

    chatRecog = new API();
    chatRecog.continuous = false;
    chatRecog.interimResults = false;
    chatRecog.onresult = e => {
        const text = e.results[0][0].transcript;
        const chatEl = document.getElementById('chatInput');
        if (chatEl) chatEl.value = text;
        sendChat();
    };
    chatRecog.onend = () => {
        isChatMicOn = false;
        setMicState('chatMicBtn', 'chatMicImg', false);
    };
    chatRecog.onerror = e => {
        console.warn('[MinX] Chat mic error:', e.error);
        isChatMicOn = false;
        setMicState('chatMicBtn', 'chatMicImg', false);
    };
}

function getLangCode() {
    return { ta: 'ta-IN', hi: 'hi-IN', en: 'en-IN' }[currentLang] || 'en-IN';
}

function toggleDestMic() {
    if (!recognition) { showToast('Voice input not supported in this browser.', 'error'); return; }
    if (!isDestMicOn) {
        recognition.lang = getLangCode();
        recognition.start();
        isDestMicOn = true;
        setMicState('micBtn', 'micImg', true);
    } else {
        recognition.stop();
        isDestMicOn = false;
        setMicState('micBtn', 'micImg', false);
    }
}

function toggleChatMic() {
    if (!chatRecog) { addChatBot('Voice not supported in this browser.'); return; }
    if (!isChatMicOn) {
        chatRecog.lang = getLangCode();
        chatRecog.start();
        isChatMicOn = true;
        setMicState('chatMicBtn', 'chatMicImg', true);
    } else {
        chatRecog.stop();
        isChatMicOn = false;
        setMicState('chatMicBtn', 'chatMicImg', false);
    }
}

function setMicState(btnId, imgId, active) {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle('active', active);
    const icon = document.getElementById(imgId);
    if (icon) {
        icon.textContent = active ? '\u25A0' : '\uD83C\uDFA4';
        icon.setAttribute('aria-label', active ? 'Stop voice input' : 'Start voice input');
    }
}

/* ─────────────────────────────────────────────
   10. CAR PROFILE
───────────────────────────────────────────── */
function onCarChange() {
    const val = document.getElementById('carSelect')?.value;
    if (!val) return;
    selectedCar = val;
    const car   = CAR_DB[val];

    const img   = document.getElementById('carImg');
    const ph    = document.getElementById('carPlaceholder');
    const badge = document.getElementById('carBadge');

    if (img)  { img.src = car.img; img.style.display = 'block'; }
    if (ph)   ph.style.display = 'none';
    if (badge){
        const variant = car.variant || `${car.battery} kWh`;
        badge.innerHTML = `<strong>${escapeHtml(car.name)}</strong><span>${escapeHtml(variant)}</span><span>${car.maxRange}km</span>`;
        badge.style.display = 'grid';
    }

    if (userLocation) {
        sendToMap({ userLocation, originLabel: document.getElementById('originInput')?.value || 'Your location' });
    }

    const calcRange = Math.round((userBatt / 100) * car.maxRange);
    const rangeEl   = document.getElementById('rangeInput');
    if (rangeEl) rangeEl.value = calcRange;
}

function onBattChange(val) {
    userBatt = parseInt(val, 10);

    const pctEl = document.getElementById('battPctLabel');
    if (pctEl) {
        pctEl.textContent = val + '%';
        pctEl.className = userBatt >= 50 ? 'batt-high' : userBatt >= 20 ? 'batt-mid' : 'batt-low';
    }

    const fill = document.getElementById('battBarFill');
    if (fill) {
        fill.style.width      = val + '%';
        fill.style.background = userBatt >= 50
            ? 'linear-gradient(90deg, #00e676, #00c853)'
            : userBatt >= 20
            ? 'linear-gradient(90deg, #ffaa00, #ff8800)'
            : 'linear-gradient(90deg, #ff4d4d, #cc0000)';
    }

    if (selectedCar) {
        const car     = CAR_DB[selectedCar];
        const rangeEl = document.getElementById('rangeInput');
        if (rangeEl) rangeEl.value = Math.round((userBatt / 100) * car.maxRange);
    }
}

function saveCar() {
    const sel = document.getElementById('carSelect')?.value;
    if (!sel) { addChatBot('Please select your EV model first.'); return; }

    const batt  = parseInt(document.getElementById('battSlider')?.value, 10);
    const range = parseInt(document.getElementById('rangeInput')?.value,  10) || 0;
    const car   = CAR_DB[sel];

    userBatt    = batt;
    userRange   = range;
    selectedCar = sel;

    const statBatt  = document.getElementById('statBatt');
    const statRange = document.getElementById('statRange');
    if (statBatt) {
        statBatt.textContent = batt + '%';
        statBatt.className   = `stat-val ${batt >= 50 ? 'batt-high' : batt >= 20 ? 'batt-mid' : 'batt-low'}`;
    }
    if (statRange) statRange.textContent = range;

    localStorage.setItem('minx_profile', JSON.stringify({ sel, batt, range }));
    if (userLocation) {
        sendToMap({ userLocation, originLabel: document.getElementById('originInput')?.value || 'Your location' });
    }

    addChatBot(`✅ Profile saved!\n${car.name} · ${batt}% · ~${range} km range.\nReady to navigate.`);
    showToast('Car profile saved', 'success');
}

function loadSavedProfile() {
    const raw = localStorage.getItem('minx_profile');
    if (!raw) { onBattChange(80); return; }

    try {
        const { sel, batt, range } = JSON.parse(raw);
        if (sel) {
            const carEl = document.getElementById('carSelect');
            if (carEl) carEl.value = sel;
            onCarChange();
        }
        if (batt !== undefined) {
            const slider = document.getElementById('battSlider');
            if (slider) slider.value = batt;
            onBattChange(batt);
        }
        if (range !== undefined) {
            const rangeEl = document.getElementById('rangeInput');
            if (rangeEl) rangeEl.value = range;
        }
    } catch (e) {
        console.warn('[MinX] Could not restore profile:', e);
        onBattChange(80);
    }
}

/* ─────────────────────────────────────────────
   11. ROUTE PLANNING
───────────────────────────────────────────── */
function showRoute() {
    const destInput = document.getElementById('destination')?.value.trim();
    const origin = getRouteOrigin();
    const destination = getRouteDestination(destInput);

    if (!destination) { addChatBot('Please enter a destination first.'); return; }
    if (!origin)      { addChatBot('Turn on GPS or enter your starting location first.'); return; }

    sendToMap({
        action: 'route',
        origin: origin.value,
        originLabel: origin.label,
        destination: destination.value,
        destinationLabel: destination.label,
    });
    addChatUser(`Navigate from ${origin.label} to ${destination.label}`);
    addChatBot(`Calculating route to ${destination.label}...\nChecking battery range & charging stops along the way.`);
    updateMapStatus('Routing…');
}

function getRouteOrigin() {
    const originText = document.getElementById('originInput')?.value.trim();
    if (userLocation) {
        return {
            value: userLocation,
            label: originText || (originSource === 'gps' ? 'Current location' : 'Selected start'),
        };
    }
    if (originText) return { value: originText, label: originText };
    return null;
}

function getRouteDestination(destText) {
    if (destinationPlace?.location) {
        return { value: destinationPlace.location, label: destinationPlace.label || destText };
    }
    if (destText) return { value: destText, label: destText };
    return null;
}

/* ─────────────────────────────────────────────
   12. FIND CHARGER
───────────────────────────────────────────── */
function findCharger() {
    const origin = getRouteOrigin();
    if (!origin) {
        addChatBot('Turn on GPS or enter your starting location to find chargers near you.');
        showToast('Starting location required', 'error');
        return;
    }

    sendToMap({ action: 'findCharger', origin: origin.value, originLabel: origin.label });
    addChatUser(`Find nearest EV charger from ${origin.label}`);
    addChatBot('Scanning nearby stations — the closest one is highlighted on the map!');

    document.getElementById('modalTitle').textContent = 'Nearest EV Charger';
    document.getElementById('modalBody').innerHTML =
        'Starting location found.<br><br>' +
        'The nearest station is pinned and bouncing on the map.<br>' +
        'Click any ⚡ marker for type, power & slot details.';
    openModal('chargerModal');
}

/* ─────────────────────────────────────────────
   13. HEALTH CHECK
───────────────────────────────────────────── */
function runHealthCheck() {
    if (!selectedCar) {
        addChatBot('Please save your EV profile first.');
        return;
    }

    const car   = CAR_DB[selectedCar];
    const batt  = userBatt;
    const range = userRange || Math.round((batt / 100) * car.maxRange);

    addChatUser('Run EV health check');
    showTyping();

    setTimeout(() => {
        removeTyping();

        const battStatus = batt >= 60
            ? '🟢 Excellent'
            : batt >= 30
            ? '🟡 Good'
            : '🔴 Low — charge soon';

        const rangeStatus = range > 150
            ? '✅ Long-range trip possible'
            : range > 60
            ? '⚠️ Short trips only'
            : '🚨 Find a charger now';

        const tips = batt > 80
            ? '💡 Avoid charging above 80% regularly to preserve cells.'
            : batt < 20
            ? '💡 Charge now — deep discharge hurts longevity.'
            : '💡 Ideal range (20–80%) — your battery will thank you.';

        addChatBot(
            `❤️ ${car.name} — Health Report\n\n` +
            `Battery: ${batt}% · ${battStatus}\n` +
            `Range:   ~${range} km · ${rangeStatus}\n` +
            `Pack:    ${car.battery} kWh usable\n\n` +
            tips
        );
    }, 1200);
}

/* ─────────────────────────────────────────────
   14. AI CHAT (MinX AI backend + local fallback)
───────────────────────────────────────────── */
function getMinxAiBase() {
    const configured = window.MINX_AI_BASE;
    if (configured) return configured.replace(/\/$/, '');
    if (location.protocol.startsWith('http') && location.port === '5000') return '';
    return 'http://127.0.0.1:5000';
}

function getMinxApiUrl(path) {
    const base = getMinxAiBase();
    return base ? base + path : path;
}

function openVoiceBot() {
    window.open(getMinxApiUrl('/voice'), '_blank', 'noopener');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function checkAiHealth() {
    try {
        const res = await fetchWithTimeout(getMinxApiUrl('/health'), { method: 'GET' }, 2500);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        setAiStatus(data.provider === 'gemini' ? 'GEMINI' : 'LOCAL EV', true);
    } catch (e) {
        console.info('[MinX] AI backend not reachable; using browser local mode.', e);
        setAiStatus('LOCAL EV', false);
    }
}

function setAiStatus(label, serverOnline) {
    aiStatusLabel = label;
    const dot = document.querySelector('.chat-header-dot');
    if (dot) {
        dot.classList.toggle('is-local', !serverOnline);
        dot.classList.toggle('is-online', serverOnline);
    }
    renderChatBadge();
}

function renderChatBadge() {
    const badgeEl = document.getElementById('chatLangBadge');
    if (badgeEl) badgeEl.textContent = `${currentLang.toUpperCase()} · ${aiStatusLabel}`;
}

function getCurrentAiProfile() {
    const car = selectedCar ? CAR_DB[selectedCar] : null;
    const rangeInput = parseInt(document.getElementById('rangeInput')?.value, 10);
    const destination = document.getElementById('destination')?.value.trim() || '';
    const origin = document.getElementById('originInput')?.value.trim() || '';
    return {
        carId: selectedCar,
        carName: car?.name || '',
        battery: userBatt,
        range: Number.isFinite(rangeInput) ? rangeInput : userRange,
        origin,
        destination,
    };
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const text  = input?.value.trim();
    if (!text) return;
    input.value = '';

    const payload = {
        message: text,
        lang: currentLang,
        profile: getCurrentAiProfile(),
    };

    addChatUser(text);
    showTyping();

    try {
        const res = await fetchWithTimeout(getMinxApiUrl('/ask'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

        removeTyping();
        setAiStatus(data.provider === 'gemini' ? 'GEMINI' : 'LOCAL EV', true);
        addChatBot(data.response || localChatFallback(text, payload.profile));
    } catch (e) {
        console.info('[MinX] Using browser local AI fallback:', e);
        removeTyping();
        setAiStatus('LOCAL EV', false);
        addChatBot(localChatFallback(text, payload.profile));
    }
}

function localChatFallback(message, profile = {}) {
    const text = message.toLowerCase();
    const car = profile.carName || 'your EV';
    const batt = Number.isFinite(profile.battery) ? profile.battery : userBatt;
    const range = Number.isFinite(profile.range) ? profile.range : null;
    const context = `${car}${Number.isFinite(batt) ? ` at ${batt}% battery` : ''}`;

    if (text.includes('charger') || text.includes('station') || text.includes('nearest')) {
        return `For ${context}, tap Find Charger to highlight the closest mapped station. Use DC fast charging for trip stops and AC charging for regular overnight top-ups.`;
    }
    if (text.includes('range') || text.includes('trip') || text.includes('route') || text.includes('km')) {
        if (Number.isFinite(range)) {
            const reserve = Math.max(15, Math.round(range * 0.2));
            const usable = Math.max(0, range - reserve);
            return `For ${context}, plan around ${usable} km of usable range and keep about ${reserve} km as reserve. Add a charging stop earlier on highways because speed, AC use, and traffic can reduce range.`;
        }
        return 'Save your EV profile first so I can estimate usable range. For unfamiliar trips, keep at least a 15-20% battery buffer.';
    }
    if (text.includes('battery') || text.includes('health') || text.includes('degrad')) {
        if (Number.isFinite(batt) && batt < 20) return `For ${context}, charge soon. Frequent deep discharge below 10-15% can age the pack faster.`;
        if (Number.isFinite(batt) && batt > 85) return `For ${context}, you are ready for a trip. For daily use, avoid leaving the battery near 100% for long periods.`;
        return `For ${context}, the healthiest daily habit is staying around 20-80%, avoiding heat, and using fast charging mainly when travel needs it.`;
    }
    if (text.includes('cost') || text.includes('price') || text.includes('kwh') || text.includes('bill')) {
        return 'Charging cost is roughly units used multiplied by your electricity tariff. Example: 20 kWh at Rs 10 per kWh costs about Rs 200 before station fees.';
    }
    return 'MinX local mode is ready. Ask about range, charging, battery health, route planning, or charging cost and I will give practical EV guidance.';
}

function addChatBot(text) {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'msg msg-bot';
    el.innerHTML = `<div class="msg-name">MinX AI</div>${escapeHtml(text).replace(/\n/g, '<br>')}`;
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
}

function addChatUser(text) {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.className = 'msg msg-user';
    el.textContent = text;
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
}

function showTyping() {
    const area = document.getElementById('chatArea');
    if (!area) return;
    const el = document.createElement('div');
    el.id = 'typingEl';
    el.className = 'typing-dots';
    el.innerHTML = '<span></span><span></span><span></span>';
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
}

function removeTyping() {
    document.getElementById('typingEl')?.remove();
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────
   15. LANGUAGE SWITCHER
───────────────────────────────────────────── */
const LANG_STRINGS = {
    en: { origin: 'Current location or enter starting point...', dest: 'Enter destination...', chatPh: 'Type your question...' },
    ta: { origin: 'தற்போதைய இடம் அல்லது தொடக்க இடம்...', dest: 'இலக்கை உள்ளிடவும்...', chatPh: 'உங்கள் கேள்வியை உள்ளிடவும்...' },
    hi: { origin: 'वर्तमान स्थान या शुरुआती जगह...', dest: 'मंजिल दर्ज करें...', chatPh: 'अपना प्रश्न टाइप करें...' },
};

function setLang(l) {
    currentLang = l;
    const t = LANG_STRINGS[l];
    const originEl = document.getElementById('originInput');
    const destEl  = document.getElementById('destination');
    const chatEl  = document.getElementById('chatInput');
    if (originEl) originEl.placeholder = t.origin;
    if (destEl)  destEl.placeholder  = t.dest;
    if (chatEl)  chatEl.placeholder  = t.chatPh;
    renderChatBadge();
}

/* ─────────────────────────────────────────────
   16. MODALS, TOASTS & HELPERS
───────────────────────────────────────────── */
function openModal(id) {
    document.getElementById(id)?.classList.add('show');
}

function closeModal() {
    document.getElementById('chargerModal')?.classList.remove('show');
}

function openSettings() {
    document.getElementById('settingsOverlay')?.classList.add('show');
    document.body.style.overflow = 'hidden';
    updateMapThemeUI();
}

function closeSettings() {
    document.getElementById('settingsOverlay')?.classList.remove('show');
    document.body.style.overflow = '';
}

function scrollMobileTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('toastEl');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastEl';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.className = `toast ${type}`;
    toast.textContent = message;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/* Keyboard shortcuts */
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement?.id === 'chatInput') {
        sendChat();
    }
    if (e.key === 'Enter' && ['originInput', 'destination'].includes(document.activeElement?.id)) {
        showRoute();
    }
    if (e.key === 'Escape') {
        closeSidebar();
        closeModal();
        closeSettings();
        closeAuth();
    }
});
