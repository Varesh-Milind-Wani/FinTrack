import type { UserAccount } from "../types/finance";

export const hashBalancePin = async (pin: string, saltHex: string) => {
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g) ?? [], (byte) => parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 180_000 },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const verifyBalancePin = async (
  pin: string,
  user: Pick<UserAccount, "startingBalancePasswordHash" | "startingBalancePasswordSalt">,
) => {
  if (!user.startingBalancePasswordHash || !user.startingBalancePasswordSalt) return false;
  return await hashBalancePin(pin, user.startingBalancePasswordSalt) === user.startingBalancePasswordHash;
};

export const createBalancePinSalt = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
