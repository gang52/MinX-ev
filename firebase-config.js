/**
 * firebase-config.js
 * Firebase Authentication setup for MinX.
 */

const FIREBASE_CONFIG = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_PROJECT.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID"
};

function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[MinX] Firebase SDK not loaded — auth running in demo mode.');
        return { auth: null, googleProvider: null, facebookProvider: null, demoMode: true };
    }
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        const auth = firebase.auth();
        const googleProvider = new firebase.auth.GoogleAuthProvider();
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        const facebookProvider = new firebase.auth.FacebookAuthProvider();
        facebookProvider.addScope('email');
        facebookProvider.addScope('public_profile');
        return { auth, googleProvider, facebookProvider, demoMode: false };
    } catch (err) {
        console.error('[MinX] Firebase init error:', err);
        return { auth: null, googleProvider: null, facebookProvider: null, demoMode: true };
    }
}

async function signInWithGoogle(auth, googleProvider) {
    const result = await auth.signInWithPopup(googleProvider);
    return result.user;
}

async function signInWithFacebook(auth, facebookProvider) {
    const result = await auth.signInWithPopup(facebookProvider);
    return result.user;
}

async function signInWithEmail(auth, email, password) {
    const result = await auth.signInWithEmailAndPassword(email, password);
    return result.user;
}

async function registerWithEmail(auth, email, password) {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    return result.user;
}

async function sendPasswordReset(auth, email) {
    await auth.sendPasswordResetEmail(email);
}

async function signOutUser(auth) {
    await auth.signOut();
}