// Firebase must be dynamically imported to avoid SSR issues with undici
let firebaseModule: any = null;

const getFirebase = async () => {
  if (firebaseModule) return firebaseModule;
  
  const { initializeApp } = await import('firebase/app');
  const { 
    getAuth, 
    signInWithPopup, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    GithubAuthProvider,
    signOut,
    onAuthStateChanged,
  } = await import('firebase/auth');

  const firebaseConfig = {
    apiKey: "AIzaSyB7MzB4s6q7SI11eqcT2ZGHYHL_RYijtXU",
    authDomain: "atd-auth-2cd4c.firebaseapp.com",
    projectId: "atd-auth-2cd4c",
    storageBucket: "atd-auth-2cd4c.firebasestorage.app",
    messagingSenderId: "499552098742",
    appId: "1:499552098742:web:0109d2b2f865757c33c917",
    measurementId: "G-5RSN1HMP0B"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  const githubProvider = new GithubAuthProvider();

  firebaseModule = {
    auth,
    signInWithGoogle: () => signInWithPopup(auth, googleProvider),
    signInWithGithub: () => signInWithPopup(auth, githubProvider),
    signInWithEmail: (email: string, password: string) => signInWithEmailAndPassword(auth, email, password),
    signUpWithEmail: (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password),
    resetPassword: (email: string) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
    onAuthChange: (callback: (user: any) => void) => onAuthStateChanged(auth, callback),
    getIdToken: async () => {
      const user = auth.currentUser;
      return user ? user.getIdToken() : null;
    }
  };

  return firebaseModule;
};

export const signInWithGoogle = async () => (await getFirebase()).signInWithGoogle();
export const signInWithGithub = async () => (await getFirebase()).signInWithGithub();
export const signInWithEmail = async (email: string, password: string) => (await getFirebase()).signInWithEmail(email, password);
export const signUpWithEmail = async (email: string, password: string) => (await getFirebase()).signUpWithEmail(email, password);
export const resetPassword = async (email: string) => (await getFirebase()).resetPassword(email);
export const logout = async () => (await getFirebase()).logout();
export const onAuthChange = async (callback: (user: any) => void) => (await getFirebase()).onAuthChange(callback);
export const getIdToken = async () => (await getFirebase()).getIdToken();
export { getFirebase };
