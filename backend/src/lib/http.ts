import axios, { type AxiosInstance } from "axios";
import { config } from "../config.js";

export function createHttpClient(): AxiosInstance {
  const instance = axios.create({
    timeout: 30000,
    headers: {
      "User-Agent": "freelance-daigest/0.1",
      "Accept-Language": "de,en;q=0.8",
      "From": config().CONTACT_EMAIL
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400
  });
  return instance;
}

let httpInstance: AxiosInstance | null = null;
export function http(): AxiosInstance {
  if (!httpInstance) httpInstance = createHttpClient();
  return httpInstance;
}

export function setHttpClientForTest(instance: AxiosInstance): void {
  httpInstance = instance;
}