import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

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
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithGithub = () => signInWithPopup(auth, githubProvider);
export const signInWithEmail = (email: string, password: string) => 
  signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email: string, password: string) => 
  createUserWithEmailAndPassword(auth, email, password);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const logout = () => signOut(auth);
export const onAuthChange = (callback: (user: User | null) => void) => 
  onAuthStateChanged(auth, callback);
export const getIdToken = async () => {
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
};
