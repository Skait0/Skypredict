"use strict";

/* Generate the one VAPID key pair this site will ever have. Run once, by hand:
 *
 *     node scripts/vapidkeys.js
 *
 * Put VAPID_PUBLIC_KEY in the Vercel project's environment (it is baked into
 * the pages at build time and is public by definition), and VAPID_PRIVATE_KEY
 * in the GitHub repository secrets, where only the sender step reads it.
 *
 * ROTATING THIS PAIR SILENTLY INVALIDATES EVERY EXISTING SUBSCRIPTION. The
 * browser bound its subscription to the public key it was given. There is no
 * migration and no error - the sends simply stop arriving. Do not run this
 * twice without a plan for the table.
 */

const crypto = require("crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

/* The raw uncompressed point is the last 65 bytes of the SPKI DER, and starts
   with 0x04. That is what applicationServerKey expects; the PEM is not. */
const spki = publicKey.export({ format: "der", type: "spki" });
const raw = spki.subarray(spki.length - 65);
if (raw[0] !== 0x04) throw new Error("not an uncompressed point - refusing to print a key that will not work");

console.log("VAPID_PUBLIC_KEY=" + raw.toString("base64url"));
console.log("VAPID_PRIVATE_KEY=" + privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"));
