import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function sendPhoneOTP(phoneNumber: string): Promise<void> {
  await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to: phoneNumber, channel: "sms" });
}

export async function verifyPhoneOTP(
  phoneNumber: string,
  code: string
): Promise<boolean> {
  try {
    const check = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code });
    return check.status === "approved";
  } catch {
    return false;
  }
}
