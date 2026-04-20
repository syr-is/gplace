import { Redis } from "ioredis";
import { env } from "$env/dynamic/private";

if (!env.REDIS_URL) throw new Error("REDIS_URL is required");
export const redis = new Redis(env.REDIS_URL);