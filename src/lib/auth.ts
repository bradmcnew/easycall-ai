import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { sendPhoneOTP, verifyPhoneOTP } from "@/lib/twilio";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: ["http://localhost:3000", "https://672d-35-3-219-225.ngrok-free.app"],
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber }) => {
        sendPhoneOTP(phoneNumber);
      },
      verifyOTP: async ({ phoneNumber, code }) => {
        return await verifyPhoneOTP(phoneNumber, code);
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber) =>
          `${phoneNumber.replace("+", "")}@phone.easycallai.local`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
    nextCookies(), // MUST be last
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7-day cache
    },
  },
});
