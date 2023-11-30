// Import the functions you need from the SDKs you need
const {
  initializeApp,
  applicationDefault,
  cert,
} = require("firebase-admin/app");
const {
  getFirestore,
  Timestamp,
  FieldValue,
} = require("firebase-admin/firestore");

const serviceAccount = require("./testing-account-json.json");
// const serviceAccount = require("./invisible.json");

const { computeHashOnElements } = require("../pedersen");

initializeApp({
  credential: cert(serviceAccount),
  //   databaseURL: "https://invisibl333.firebaseio.com",
});

const db = getFirestore();

let counter = 0;
async function fetchDbState() {
  let notesCollection = db.collection("notes");
  let docs = await notesCollection.listDocuments();

  let state = {}; // {idx: note}

  docs.forEach((doc) => {
    doc.listCollections().then((collections) => {
      collections.forEach((collection) => {
        collection.listDocuments().then((docs) => {
          let numDocs = docs.length;

          let c2 = 0;
          docs.forEach((doc) => {
            doc.get().then((doc) => {
              let data = doc.data();
              let hash = BigInt(
                computeHashOnElements([
                  BigInt(data.address[0]),
                  data.token,
                  data.commitment,
                ]),
                16
              );

              state[doc.id] = hash;

              c2++;
              if (c2 == numDocs) {
                counter++;
              }
            });
          });
        });
      });
    });
  });

  while (counter < docs.length) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const fs = require("fs");

  const jsonData = JSON.stringify(
    state,
    (key, value) => {
      if (typeof value === "bigint") {
        return value.toString(); // Convert BigInt to string
      }
      return value;
    },
    2
  );

  // Step 3: Write the JSON string to a file
  fs.writeFile("db_state.json", jsonData, "utf8", (err) => {
    if (err) {
      console.error("Error writing JSON file:", err);
    } else {
      console.log("JSON data has been written to db_state.json");
    }
  });

  console.log("state", state);
}

module.exports = { db, fetchDbState };

// async function fetchExchangeState() {}

fetchDbState();

// // Step 4: Read the JSON file back into an object
// fs.readFile('data.json', 'utf8', (err, data) => {
//   if (err) {
//     console.error('Error reading JSON file:', err);
//   } else {
//     try {
//       const parsedObject = JSON.parse(data, (key, value) => {
//         if (/^\d+$/.test(value)) {
//           return BigInt(value); // Convert strings to BigInt
//         }
//         return value;
//       });
//       console.log('Parsed object:', parsedObject);
//     } catch (parseErr) {
//       console.error('Error parsing JSON:', parseErr);
//     }
//   }
// });
