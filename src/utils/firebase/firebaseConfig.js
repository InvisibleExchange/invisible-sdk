// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

// const firebaseConfig = {
//   apiKey: "AIzaSyCL8CFDzybWfN8bvxQJgPNvpfpNvn_mkCk",
//   authDomain: "testing-1b2fb.firebaseapp.com",
//   databaseURL: "https://testing-1b2fb.firebaseio.com",
//   projectId: "testing-1b2fb",
//   storageBucket: "testing-1b2fb.appspot.com",
//   messagingSenderId: "283746589409",
//   appId: "1:283746589409:web:68088230883f0bb2e0b5a0",
//   measurementId: "G-YF5VHQ5NMX",
// };

const firebaseConfig = {
  apiKey: "AIzaSyBphzq0rsi89qwKYzyCiGNeuS-dlm8VWHo",
  authDomain: "invisible-ec0e0.firebaseapp.com",
  projectId: "invisible-ec0e0",
  storageBucket: "invisible-ec0e0.appspot.com",
  messagingSenderId: "963658677035",
  appId: "1:963658677035:web:32d6239240b6577855636e",
  measurementId: "G-WBJ1X0F964",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

module.exports = { db };
